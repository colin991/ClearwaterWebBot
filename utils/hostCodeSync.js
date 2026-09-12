import { existsSync, rmSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';

/**
 * Spark Hosting / Apollo panel locks startup to roughly:
 *   git pull; npm install; node /home/container/index.js
 *
 * `git pull` often fails because of a dirty `downloads/` folder, so the panel
 * keeps launching old code. This helper runs at the top of index.js.
 *
 * Important: this repo is private. Never replace `origin` with a public HTTPS
 * URL — Apollo's remote usually already includes deploy credentials. Stripping
 * that token makes fetch fail and the bot stays on an old commit forever.
 */

function run(command, args, cwd, { inherit = false } = {}) {
  return spawnSync(command, args, {
    cwd,
    encoding: 'utf8',
    stdio: inherit ? 'inherit' : ['ignore', 'pipe', 'pipe'],
  });
}

function runGit(args, cwd) {
  return run('git', args, cwd);
}

function gitOk(result) {
  return Boolean(result && result.status === 0);
}

function gitLine(result) {
  return String(result?.stdout || '').trim().split('\n')[0] || '';
}

function gitText(result) {
  return String(result?.stderr || result?.stdout || '').trim();
}

function log(message) {
  // Use console so Apollo panel console always shows sync status.
  console.log(`[host-sync] ${message}`);
}

/**
 * Keep Apollo's existing origin URL (with token). Only set a fallback if origin
 * is missing entirely.
 */
function ensureOrigin(cwd, fallbackUrl) {
  const current = runGit(['remote', 'get-url', 'origin'], cwd);
  if (gitOk(current)) {
    const url = gitLine(current);
    if (url) {
      // Redact tokens in logs.
      const safe = url.replace(/\/\/[^@/]+@/g, '//***@');
      log(`Using existing origin ${safe}`);
      return url;
    }
  }

  log('origin missing; adding fallback remote (may fail if repo is private)');
  runGit(['remote', 'add', 'origin', fallbackUrl], cwd);
  return fallbackUrl;
}

/**
 * @returns {{ updated: boolean, commit: string|null, reason?: string }}
 */
export function syncHostCodeFromMain({
  cwd = process.cwd(),
  fallbackRemoteUrl = 'https://github.com/colin991/ClearwaterWebBot.git',
} = {}) {
  if (!existsSync(join(cwd, '.git'))) {
    return { updated: false, commit: null, reason: 'no_git' };
  }

  // Leftover paths that block panel `git pull` on this host.
  rmSync(join(cwd, 'downloads'), { recursive: true, force: true });
  rmSync(join(cwd, 'tmp'), { recursive: true, force: true });

  // Clear interrupted merge/rebase so reset can proceed.
  runGit(['merge', '--abort'], cwd);
  runGit(['rebase', '--abort'], cwd);
  runGit(['cherry-pick', '--abort'], cwd);

  const before = runGit(['rev-parse', 'HEAD'], cwd);
  const beforeSha = gitOk(before) ? gitLine(before) : null;
  if (beforeSha) log(`Current commit ${beforeSha.slice(0, 7)}`);

  ensureOrigin(cwd, fallbackRemoteUrl);

  // Fetch all heads; some panels track main as master or have odd refspecs.
  let fetch = runGit(['fetch', 'origin', 'main'], cwd);
  if (!gitOk(fetch)) {
    fetch = runGit(['fetch', 'origin'], cwd);
  }
  if (!gitOk(fetch)) {
    const detail = gitText(fetch) || 'unknown';
    log(`Fetch failed: ${detail}`);
    return {
      updated: false,
      commit: beforeSha,
      reason: `fetch_failed: ${detail}`,
    };
  }

  // Prefer origin/main, fall back to origin/master.
  let targetRef = 'origin/main';
  const mainCheck = runGit(['rev-parse', '--verify', 'origin/main'], cwd);
  if (!gitOk(mainCheck)) {
    const masterCheck = runGit(['rev-parse', '--verify', 'origin/master'], cwd);
    if (gitOk(masterCheck)) targetRef = 'origin/master';
  }

  // Prefer staying on a real branch named main (helps later panel `git pull`).
  runGit(['checkout', '-B', 'main', targetRef], cwd);

  // Reset tracked files only. Does not delete gitignored host data/ or .env.
  const reset = runGit(['reset', '--hard', targetRef], cwd);
  if (!gitOk(reset)) {
    const detail = gitText(reset) || 'unknown';
    log(`Reset failed: ${detail}`);
    return {
      updated: false,
      commit: beforeSha,
      reason: `reset_failed: ${detail}`,
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

  if (updated) {
    log(`Updated ${beforeSha.slice(0, 7)} -> ${afterSha.slice(0, 7)}`);
    // Panel already ran npm install on the *old* package.json. Refresh deps
    // before re-exec so new dependencies exist.
    log('Running npm install --omit=dev after code update...');
    const npm = run('npm', ['install', '--omit=dev'], cwd, { inherit: true });
    if (npm.status !== 0) {
      log('npm install after update failed; continuing with existing node_modules');
    }
  } else {
    log(`Already on latest (${(afterSha || 'unknown').slice(0, 7)})`);
  }

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

  log('Re-executing onto updated files...');
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
