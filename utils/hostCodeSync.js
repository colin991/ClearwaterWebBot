import { existsSync, rmSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';

/**
 * Apollopanel locks startup to roughly:
 *   git pull; npm install; node /home/container/index.js
 *
 * `git pull` often fails here because of a dirty `downloads/` folder, so the
 * panel keeps launching old code. This helper runs at the top of index.js,
 * force-syncs tracked files to origin/main, preserves host-only data/ + .env,
 * then re-execs if code changed so the new bot actually starts.
 */

function runGit(args, cwd) {
  return spawnSync('git', args, {
    cwd,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
}

function gitOk(result) {
  return Boolean(result && result.status === 0);
}

function gitLine(result) {
  return String(result?.stdout || '').trim().split('\n')[0] || '';
}

/**
 * @returns {{ updated: boolean, commit: string|null, reason?: string }}
 */
export function syncHostCodeFromMain({
  cwd = process.cwd(),
  remoteUrl = 'https://github.com/colin991/ClearwaterWebBot.git',
} = {}) {
  if (!existsSync(join(cwd, '.git'))) {
    return { updated: false, commit: null, reason: 'no_git' };
  }

  // Leftover path that blocks panel `git pull` on this host.
  rmSync(join(cwd, 'downloads'), { recursive: true, force: true });

  const before = runGit(['rev-parse', 'HEAD'], cwd);
  const beforeSha = gitOk(before) ? gitLine(before) : null;

  runGit(['remote', 'set-url', 'origin', remoteUrl], cwd);
  const fetch = runGit(['fetch', 'origin', 'main'], cwd);
  if (!gitOk(fetch)) {
    return {
      updated: false,
      commit: beforeSha,
      reason: `fetch_failed: ${(fetch.stderr || fetch.stdout || '').trim() || 'unknown'}`,
    };
  }

  // Reset tracked files only. Does not delete gitignored host data/ or .env.
  const reset = runGit(['reset', '--hard', 'origin/main'], cwd);
  if (!gitOk(reset)) {
    return {
      updated: false,
      commit: beforeSha,
      reason: `reset_failed: ${(reset.stderr || reset.stdout || '').trim() || 'unknown'}`,
    };
  }

  // Remove untracked junk, but never wipe data/, .env, or node_modules.
  // Do NOT use `git clean -fdx` — that deletes gitignored data files.
  runGit([
    'clean',
    '-fd',
    '-e', 'data',
    '-e', '.env',
    '-e', 'node_modules',
  ], cwd);

  const after = runGit(['rev-parse', 'HEAD'], cwd);
  const afterSha = gitOk(after) ? gitLine(after) : beforeSha;
  const updated = Boolean(beforeSha && afterSha && beforeSha !== afterSha);

  return {
    updated,
    commit: afterSha,
    reason: updated ? 'updated' : 'already_current',
  };
}

/**
 * If sync pulled newer code, replace this process with a fresh node index.js
 * so the newly downloaded files are what actually run.
 */
export function reexecIfUpdated(syncResult) {
  if (!syncResult?.updated) return false;

  const child = spawnSync(process.execPath, process.argv.slice(1), {
    cwd: process.cwd(),
    env: {
      ...process.env,
      // Prevent infinite re-exec loops if reset somehow flaps.
      CLEARWATER_SKIP_HOST_SYNC: '1',
    },
    stdio: 'inherit',
  });
  process.exit(child.status ?? 0);
  return true;
}
