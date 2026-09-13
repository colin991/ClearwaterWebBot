/**
 * Apollopanel entrypoint (self-contained git repair).
 *
 * Locked startup stays:
 *   git pull; npm install; node /home/container/index.js
 *
 * Panel git pull often fails (no upstream / dirty tree). This file force-syncs
 * to origin/main BEFORE starting the bot. Safe for a PUBLIC repo.
 *
 * If Apollo console ignores shell commands: Stop → File Manager → edit index.js
 * → paste this whole file → Save → Start.
 */
import { existsSync, rmSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';

const REPO = 'https://github.com/colin991/ClearwaterWebBot.git';
const SKIP = process.env.CLEARWATER_SKIP_HOST_SYNC === '1';

function sh(cmd, args, timeout = 60_000) {
  return spawnSync(cmd, args, {
    cwd: process.cwd(),
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    timeout,
    env: {
      ...process.env,
      GIT_TERMINAL_PROMPT: '0',
      GIT_ASKPASS: 'echo',
    },
    killSignal: 'SIGKILL',
  });
}

function ok(r) {
  return Boolean(r && r.status === 0);
}

function out(r) {
  return String(r?.stdout || '').trim();
}

function err(r) {
  if (!r) return 'unknown';
  if (r.error?.code === 'ETIMEDOUT' || r.signal) return `timed out (${r.signal || r.error.code})`;
  return String(r.stderr || r.stdout || '').trim();
}

function log(msg) {
  console.log(`[host-sync] ${msg}`);
}

function forceSyncFromMain() {
  const cwd = process.cwd();
  const gitDir = join(cwd, '.git');

  rmSync(join(cwd, 'downloads'), { recursive: true, force: true });
  rmSync(join(cwd, 'tmp'), { recursive: true, force: true });

  if (!existsSync(gitDir)) {
    log('No .git — initializing...');
    let init = sh('git', ['init', '-b', 'main']);
    if (!ok(init)) init = sh('git', ['init']);
    if (!ok(init)) {
      log(`git init failed: ${err(init)}`);
      return { updated: false };
    }
  }

  // Always use the public HTTPS remote (no PAT needed while repo is public).
  const remote = sh('git', ['remote', 'get-url', 'origin']);
  if (ok(remote) && out(remote)) {
    sh('git', ['remote', 'set-url', 'origin', REPO]);
  } else {
    sh('git', ['remote', 'add', 'origin', REPO]);
  }
  log(`origin → ${REPO}`);

  const before = sh('git', ['rev-parse', 'HEAD']);
  const beforeSha = ok(before) ? out(before).split('\n')[0] : null;
  if (beforeSha) log(`before ${beforeSha.slice(0, 7)}`);

  log('fetch origin/main...');
  let fetch = sh('git', ['fetch', '--depth', '1', '--no-tags', 'origin', 'main'], 90_000);
  if (!ok(fetch)) {
    fetch = sh('git', ['fetch', 'origin', 'main'], 90_000);
  }
  if (!ok(fetch)) {
    log(`fetch failed: ${err(fetch)}`);
    return { updated: false, commit: beforeSha };
  }

  sh('git', ['checkout', '-B', 'main', 'origin/main']);
  sh('git', ['branch', '--set-upstream-to=origin/main', 'main']);
  const reset = sh('git', ['reset', '--hard', 'origin/main']);
  if (!ok(reset)) {
    log(`reset failed: ${err(reset)}`);
    return { updated: false, commit: beforeSha };
  }

  sh('git', ['clean', '-fd', '-e', 'data', '-e', '.env', '-e', 'node_modules']);

  const after = sh('git', ['rev-parse', 'HEAD']);
  const afterSha = ok(after) ? out(after).split('\n')[0] : beforeSha;
  const updated = Boolean(beforeSha && afterSha && beforeSha !== afterSha);

  if (updated) {
    log(`updated ${beforeSha.slice(0, 7)} → ${afterSha.slice(0, 7)}`);
    log('npm install --omit=dev...');
    sh('npm', ['install', '--omit=dev'], 120_000);
  } else {
    log(`already on ${(afterSha || 'unknown').slice(0, 7)}`);
  }

  return { updated, commit: afterSha };
}

console.log('[boot] starting...');

if (!SKIP) {
  try {
    const result = forceSyncFromMain();
    if (result.updated) {
      log('re-exec onto updated files...');
      const child = spawnSync(process.execPath, process.argv.slice(1), {
        cwd: process.cwd(),
        env: { ...process.env, CLEARWATER_SKIP_HOST_SYNC: '1' },
        stdio: 'inherit',
      });
      process.exit(child.status ?? 0);
    }
  } catch (error) {
    console.log(`[host-sync] skipped (${error?.message || error}) — starting bot anyway`);
  }
} else {
  console.log('[boot] CLEARWATER_SKIP_HOST_SYNC=1 — sync skipped');
}

console.log('[boot] starting bot...');
await import('./bot.js');
