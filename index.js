/**
 * Apollopanel entrypoint (self-contained git repair).
 *
 * Locked startup stays:
 *   git pull; npm install; node /home/container/index.js
 *
 * Panel git pull often fails (no upstream / dirty tree). This file force-syncs
 * to origin/main BEFORE starting the bot. The repo is private, so it pulls with
 * the panel's Git Access Token (or GITHUB_TOKEN in .env).
 *
 * If Apollo console ignores shell commands: Stop → File Manager → edit index.js
 * → paste this whole file → Save → Start.
 */
import { existsSync, readFileSync, rmSync } from 'node:fs';
import { spawn, spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = 'https://github.com/colin991/ClearwaterWebBot.git';
const SKIP = process.env.CLEARWATER_SKIP_HOST_SYNC === '1';
// bot.js exits with this code when main has new commits (utils/codeUpdateWatch.js).
const UPDATE_RESTART_CODE = 75;

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

function hasCredentials(url) {
  return /^https:\/\/[^/@\s]+@/.test(String(url || ''));
}

/** GITHUB_TOKEN / CLEARWATER_GIT_REMOTE from .env, read by hand (dotenv loads later in bot.js). */
function dotEnvValue(name) {
  try {
    const text = readFileSync(join(process.cwd(), '.env'), 'utf8');
    const match = text.match(new RegExp(`^\\s*${name}\\s*=\\s*["']?([^"'\\r\\n]+)`, 'm'));
    return match ? match[1].trim() : '';
  } catch {
    return '';
  }
}

/** Remote URL for the private repo: explicit remote, then a token, then whatever origin already has. */
function originUrl(current) {
  const env = process.env;
  const explicit = (env.CLEARWATER_GIT_REMOTE || dotEnvValue('CLEARWATER_GIT_REMOTE')).trim();
  if (explicit) return explicit;
  // ACCESS_TOKEN / USERNAME are the Pterodactyl Node.js egg's Git Access Token / Git Username.
  const token = (env.ACCESS_TOKEN || env.GIT_ACCESS_TOKEN || env.GITHUB_TOKEN || dotEnvValue('GITHUB_TOKEN')).trim();
  if (token) {
    const user = (env.USERNAME || env.GIT_USERNAME || 'x-access-token').trim();
    return `https://${encodeURIComponent(user)}:${encodeURIComponent(token)}@github.com/colin991/ClearwaterWebBot.git`;
  }
  if (hasCredentials(current)) return current;
  return REPO;
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

  // The repo is private: use the panel's Git Access Token when it's set, and
  // never replace an origin that already carries credentials.
  const remote = sh('git', ['remote', 'get-url', 'origin']);
  const current = ok(remote) ? out(remote) : '';
  const url = originUrl(current);
  if (current) {
    if (url !== current) sh('git', ['remote', 'set-url', 'origin', url]);
  } else {
    sh('git', ['remote', 'add', 'origin', url]);
  }
  log(`origin → ${REPO}${hasCredentials(url) ? ' (with token)' : ' (no token: set the panel Git Access Token)'}`);

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

// Supervisor: the bot runs as a child so it can restart itself onto new code from main
// without anyone pressing restart on the panel.
const botEntry = join(dirname(fileURLToPath(import.meta.url)), 'bot.js');
let bot = null;
for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    if (bot) bot.kill(signal);
    else process.exit(0);
  });
}

function runBot() {
  return new Promise((resolve) => {
    console.log('[boot] starting bot...');
    bot = spawn(process.execPath, [botEntry], {
      cwd: process.cwd(),
      env: { ...process.env, CLEARWATER_SUPERVISED: '1' },
      stdio: 'inherit',
    });
    bot.once('exit', (code, signal) => {
      bot = null;
      resolve(code ?? (signal ? 0 : 1));
    });
  });
}

for (;;) {
  const code = await runBot();
  if (code !== UPDATE_RESTART_CODE) process.exit(code);
  log('bot restarting for new code on main...');
  try {
    forceSyncFromMain();
  } catch (error) {
    log(`sync failed (${error?.message || error}) — restarting on current files`);
  }
}
