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
 * URL when a credentialed remote already exists — stripping that token makes
 * fetch fail and the bot stays on an old commit forever.
 *
 * Zip uploads have no `.git`. Set CLEARWATER_GIT_REMOTE (HTTPS URL with a
 * GitHub PAT) or GITHUB_TOKEN so we can bootstrap a checkout once, keeping
 * data/ and .env.
 */

const DEFAULT_REPO_HTTPS = 'https://github.com/colin991/ClearwaterWebBot.git';

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

function redactUrl(url) {
  return String(url || '').replace(/\/\/[^@/]+@/g, '//***@');
}

/**
 * Prefer an explicit remote with embedded credentials. Otherwise build one from
 * GITHUB_TOKEN / GH_TOKEN + the public HTTPS repo URL.
 */
function resolveBootstrapRemote(fallbackRemoteUrl = DEFAULT_REPO_HTTPS) {
  const fromEnv = String(process.env.CLEARWATER_GIT_REMOTE || '').trim();
  if (fromEnv) return fromEnv;

  const token = String(process.env.GITHUB_TOKEN || process.env.GH_TOKEN || '').trim();
  if (!token) return null;

  const https = String(fallbackRemoteUrl || DEFAULT_REPO_HTTPS).trim();
  if (!https.startsWith('https://')) return null;
  return `https://${encodeURIComponent(token)}@${https.slice('https://'.length)}`;
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
      log(`Using existing origin ${redactUrl(url)}`);
      return url;
    }
  }

  log(`origin missing; adding remote ${redactUrl(fallbackUrl)}`);
  runGit(['remote', 'add', 'origin', fallbackUrl], cwd);
  return fallbackUrl;
}

function setOrigin(cwd, remoteUrl) {
  const current = runGit(['remote', 'get-url', 'origin'], cwd);
  if (gitOk(current) && gitLine(current)) {
    runGit(['remote', 'set-url', 'origin', remoteUrl], cwd);
  } else {
    runGit(['remote', 'add', 'origin', remoteUrl], cwd);
  }
  log(`Origin set to ${redactUrl(remoteUrl)}`);
}

/**
 * Turn a zip-upload host (no .git) into a real checkout without wiping data/ or .env.
 * @returns {{ ok: boolean, reason?: string }}
 */
function bootstrapGitCheckout(cwd, remoteUrl) {
  log('No .git — bootstrapping git checkout (keeps data/ + .env)...');

  rmSync(join(cwd, 'downloads'), { recursive: true, force: true });
  rmSync(join(cwd, 'tmp'), { recursive: true, force: true });

  let init = runGit(['init', '-b', 'main'], cwd);
  if (!gitOk(init)) {
    init = runGit(['init'], cwd);
  }
  if (!gitOk(init)) {
    const detail = gitText(init) || 'unknown';
    log(`git init failed: ${detail}`);
    return { ok: false, reason: `init_failed: ${detail}` };
  }

  setOrigin(cwd, remoteUrl);

  let fetch = runGit(['fetch', 'origin', 'main'], cwd);
  if (!gitOk(fetch)) {
    fetch = runGit(['fetch', 'origin'], cwd);
  }
  if (!gitOk(fetch)) {
    const detail = gitText(fetch) || 'unknown';
    log(`Bootstrap fetch failed: ${detail}`);
    // Leave a broken .git so the next attempt can retry with a fixed token,
    // but surface the error clearly.
    return { ok: false, reason: `bootstrap_fetch_failed: ${detail}` };
  }

  let targetRef = 'origin/main';
  const mainCheck = runGit(['rev-parse', '--verify', 'origin/main'], cwd);
  if (!gitOk(mainCheck)) {
    const masterCheck = runGit(['rev-parse', '--verify', 'origin/master'], cwd);
    if (gitOk(masterCheck)) targetRef = 'origin/master';
  }

  const checkout = runGit(['checkout', '-f', '-B', 'main', targetRef], cwd);
  if (!gitOk(checkout)) {
    const reset = runGit(['reset', '--hard', targetRef], cwd);
    if (!gitOk(reset)) {
      const detail = gitText(checkout) || gitText(reset) || 'unknown';
      log(`Bootstrap checkout failed: ${detail}`);
      return { ok: false, reason: `bootstrap_checkout_failed: ${detail}` };
    }
  }

  runGit([
    'clean',
    '-fd',
    '-e', 'data',
    '-e', '.env',
    '-e', 'node_modules',
  ], cwd);

  const head = runGit(['rev-parse', 'HEAD'], cwd);
  const sha = gitOk(head) ? gitLine(head) : null;
  log(`Bootstrap complete at ${(sha || 'unknown').slice(0, 7)}`);
  return { ok: true, reason: 'bootstrapped', commit: sha };
}

/**
 * @returns {{ updated: boolean, commit: string|null, reason?: string }}
 */
export function syncHostCodeFromMain({
  cwd = process.cwd(),
  fallbackRemoteUrl = DEFAULT_REPO_HTTPS,
} = {}) {
  const bootstrapRemote = resolveBootstrapRemote(fallbackRemoteUrl);

  if (!existsSync(join(cwd, '.git'))) {
    if (!bootstrapRemote) {
      log('No .git folder — this host is a zip upload, not a GitHub checkout.');
      log('Fix: set Apollo env CLEARWATER_GIT_REMOTE=https://<PAT>@github.com/colin991/ClearwaterWebBot.git');
      log('Or: Stop → console repair one-liner in README → Start. Keeps data/ + .env.');
      return { updated: false, commit: null, reason: 'no_git' };
    }

    const boot = bootstrapGitCheckout(cwd, bootstrapRemote);
    if (!boot.ok) {
      return { updated: false, commit: null, reason: boot.reason || 'bootstrap_failed' };
    }

    // Fresh checkout from main — always re-exec so the new tree actually runs.
    log('Running npm install --omit=dev after bootstrap...');
    const npm = run('npm', ['install', '--omit=dev'], cwd, { inherit: true });
    if (npm.status !== 0) {
      log('npm install after bootstrap failed; continuing with existing node_modules');
    }

    return {
      updated: true,
      commit: boot.commit || null,
      reason: 'bootstrapped',
    };
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

  // If origin is missing/broken but the user provided credentials, use them.
  if (bootstrapRemote) {
    const current = runGit(['remote', 'get-url', 'origin'], cwd);
    if (!gitOk(current) || !gitLine(current)) {
      setOrigin(cwd, bootstrapRemote);
    } else {
      ensureOrigin(cwd, bootstrapRemote);
    }
  } else {
    ensureOrigin(cwd, fallbackRemoteUrl);
  }

  // Fetch all heads; some panels track main as master or have odd refspecs.
  let fetch = runGit(['fetch', 'origin', 'main'], cwd);
  if (!gitOk(fetch)) {
    fetch = runGit(['fetch', 'origin'], cwd);
  }
  if (!gitOk(fetch)) {
    const detail = gitText(fetch) || 'unknown';
    log(`Fetch failed: ${detail}`);
    if (bootstrapRemote) {
      log('Retrying fetch with CLEARWATER_GIT_REMOTE / GITHUB_TOKEN...');
      setOrigin(cwd, bootstrapRemote);
      fetch = runGit(['fetch', 'origin', 'main'], cwd);
      if (!gitOk(fetch)) {
        fetch = runGit(['fetch', 'origin'], cwd);
      }
    }
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
