import { existsSync, rmSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';

/**
 * Spark / Apollo locks startup to roughly:
 *   git pull; npm install; node /home/container/index.js
 *
 * Panel `git pull` often fails on a dirty downloads/ tree, so old code keeps
 * running. This helper runs at the top of index.js and force-syncs to main.
 *
 * Private repo: never strip a credentialed origin URL.
 *
 * Zip hosts have no .git. Set CLEARWATER_GIT_REMOTE (HTTPS + GitHub PAT) or
 * GITHUB_TOKEN to bootstrap once while keeping data/ and .env.
 */

const DEFAULT_REPO_HTTPS = 'https://github.com/colin991/ClearwaterWebBot.git';
const FETCH_TIMEOUT_MS = 45_000;
const SHORT_TIMEOUT_MS = 30_000;

function gitEnv(extra = {}) {
  return {
    ...process.env,
    // Fail fast instead of hanging on a password prompt in Apollo.
    GIT_TERMINAL_PROMPT: '0',
    GIT_ASKPASS: 'echo',
    GCM_INTERACTIVE: 'never',
    ...extra,
  };
}

function run(command, args, cwd, { inherit = false, timeoutMs = SHORT_TIMEOUT_MS } = {}) {
  return spawnSync(command, args, {
    cwd,
    encoding: 'utf8',
    stdio: inherit ? 'inherit' : ['ignore', 'pipe', 'pipe'],
    timeout: timeoutMs,
    env: gitEnv(),
    killSignal: 'SIGKILL',
  });
}

function runGit(args, cwd, timeoutMs = SHORT_TIMEOUT_MS) {
  return run('git', args, cwd, { timeoutMs });
}

function gitOk(result) {
  return Boolean(result && result.status === 0);
}

function gitLine(result) {
  return String(result?.stdout || '').trim().split('\n')[0] || '';
}

function gitText(result) {
  if (!result) return 'unknown';
  if (result.error?.code === 'ETIMEDOUT' || result.signal) {
    return `timed out / killed (${result.error?.code || result.signal})`;
  }
  return String(result.stderr || result.stdout || '').trim();
}

function log(message) {
  console.log(`[host-sync] ${message}`);
}

function redactUrl(url) {
  return String(url || '').replace(/\/\/[^@/]+@/g, '//***@');
}

function resolveBootstrapRemote(fallbackRemoteUrl = DEFAULT_REPO_HTTPS) {
  // Accept CLEARWATER_GIT__REMOTE typo (double underscore).
  const fromEnv = String(
    process.env.CLEARWATER_GIT_REMOTE
    || process.env.CLEARWATER_GIT__REMOTE
    || '',
  ).trim();
  if (fromEnv) return fromEnv;

  const token = String(process.env.GITHUB_TOKEN || process.env.GH_TOKEN || '').trim();
  if (!token) return null;

  const https = String(fallbackRemoteUrl || DEFAULT_REPO_HTTPS).trim();
  if (!https.startsWith('https://')) return null;
  return `https://${encodeURIComponent(token)}@${https.slice('https://'.length)}`;
}

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

function hasUsableHead(cwd) {
  const head = runGit(['rev-parse', 'HEAD'], cwd);
  return gitOk(head) && Boolean(gitLine(head));
}

function fetchMain(cwd) {
  log(`Fetching origin/main (shallow, timeout ${FETCH_TIMEOUT_MS / 1000}s)...`);
  let fetch = runGit(
    ['fetch', '--depth', '1', '--no-tags', 'origin', 'main'],
    cwd,
    FETCH_TIMEOUT_MS,
  );
  if (gitOk(fetch)) {
    log('Fetch ok (origin/main).');
    return fetch;
  }

  log(`Shallow main fetch failed: ${gitText(fetch) || 'unknown'}; trying origin...`);
  fetch = runGit(['fetch', '--depth', '1', '--no-tags', 'origin'], cwd, FETCH_TIMEOUT_MS);
  if (gitOk(fetch)) {
    log('Fetch ok (origin).');
    return fetch;
  }

  log(`Shallow fetch failed: ${gitText(fetch) || 'unknown'}; trying full main fetch...`);
  fetch = runGit(['fetch', 'origin', 'main'], cwd, FETCH_TIMEOUT_MS);
  if (gitOk(fetch)) log('Fetch ok (full main).');
  return fetch;
}

function bootstrapGitCheckout(cwd, remoteUrl) {
  log('No .git — bootstrapping git checkout (keeps data/ + .env)...');

  rmSync(join(cwd, 'downloads'), { recursive: true, force: true });
  rmSync(join(cwd, 'tmp'), { recursive: true, force: true });

  let init = runGit(['init', '-b', 'main'], cwd);
  if (!gitOk(init)) init = runGit(['init'], cwd);
  if (!gitOk(init)) {
    const detail = gitText(init) || 'unknown';
    log(`git init failed: ${detail}`);
    return { ok: false, reason: `init_failed: ${detail}` };
  }

  setOrigin(cwd, remoteUrl);

  const fetch = fetchMain(cwd);
  if (!gitOk(fetch)) {
    const detail = gitText(fetch) || 'unknown';
    log(`Bootstrap fetch failed: ${detail}`);
    log('Check PAT has repo read access, and that this host can reach github.com.');
    return { ok: false, reason: `bootstrap_fetch_failed: ${detail}` };
  }

  let targetRef = 'origin/main';
  if (!gitOk(runGit(['rev-parse', '--verify', 'origin/main'], cwd))) {
    if (gitOk(runGit(['rev-parse', '--verify', 'origin/master'], cwd))) {
      targetRef = 'origin/master';
    }
  }

  log(`Checking out ${targetRef}...`);
  const checkout = runGit(['checkout', '-f', '-B', 'main', targetRef], cwd);
  if (!gitOk(checkout)) {
    const reset = runGit(['reset', '--hard', targetRef], cwd);
    if (!gitOk(reset)) {
      const detail = gitText(checkout) || gitText(reset) || 'unknown';
      log(`Bootstrap checkout failed: ${detail}`);
      return { ok: false, reason: `bootstrap_checkout_failed: ${detail}` };
    }
  }

  runGit(['clean', '-fd', '-e', 'data', '-e', '.env', '-e', 'node_modules'], cwd);

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
  const gitDir = join(cwd, '.git');

  // Hung bootstrap leaves .git with no HEAD — wipe and retry.
  if (existsSync(gitDir) && !hasUsableHead(cwd)) {
    log('Incomplete .git (no HEAD) — removing and re-bootstrapping...');
    if (!bootstrapRemote) {
      log('Set CLEARWATER_GIT_REMOTE=https://<PAT>@github.com/colin991/ClearwaterWebBot.git');
      return { updated: false, commit: null, reason: 'incomplete_git' };
    }
    rmSync(gitDir, { recursive: true, force: true });
  }

  if (!existsSync(gitDir)) {
    if (!bootstrapRemote) {
      log('No .git folder — zip upload host, not a GitHub checkout.');
      log('Fix: set CLEARWATER_GIT_REMOTE=https://<PAT>@github.com/colin991/ClearwaterWebBot.git');
      return { updated: false, commit: null, reason: 'no_git' };
    }

    const boot = bootstrapGitCheckout(cwd, bootstrapRemote);
    if (!boot.ok) {
      // Leave the host runnable: wipe a half-made .git so the next boot can
      // start the bot from local files instead of hanging forever on fetch.
      if (existsSync(gitDir) && !hasUsableHead(cwd)) {
        log('Bootstrap failed — removing incomplete .git so the bot can start.');
        rmSync(gitDir, { recursive: true, force: true });
      }
      log('Starting with local files (commands should still work). Fix CLEARWATER_GIT_REMOTE / network later.');
      return { updated: false, commit: null, reason: boot.reason || 'bootstrap_failed' };
    }

    log('Running npm install --omit=dev after bootstrap...');
    const npm = run('npm', ['install', '--omit=dev'], cwd, {
      inherit: true,
      timeoutMs: FETCH_TIMEOUT_MS,
    });
    if (npm.status !== 0) {
      log('npm install after bootstrap failed; continuing with existing node_modules');
    }

    return {
      updated: true,
      commit: boot.commit || null,
      reason: 'bootstrapped',
    };
  }

  rmSync(join(cwd, 'downloads'), { recursive: true, force: true });
  rmSync(join(cwd, 'tmp'), { recursive: true, force: true });

  runGit(['merge', '--abort'], cwd);
  runGit(['rebase', '--abort'], cwd);
  runGit(['cherry-pick', '--abort'], cwd);

  const before = runGit(['rev-parse', 'HEAD'], cwd);
  const beforeSha = gitOk(before) ? gitLine(before) : null;
  if (beforeSha) log(`Current commit ${beforeSha.slice(0, 7)}`);

  if (bootstrapRemote) {
    setOrigin(cwd, bootstrapRemote);
  } else {
    ensureOrigin(cwd, fallbackRemoteUrl);
  }

  let fetch = fetchMain(cwd);
  if (!gitOk(fetch) && bootstrapRemote) {
    log('Retrying fetch with CLEARWATER_GIT_REMOTE...');
    setOrigin(cwd, bootstrapRemote);
    fetch = fetchMain(cwd);
  }
  if (!gitOk(fetch)) {
    const detail = gitText(fetch) || 'unknown';
    log(`Fetch failed: ${detail}`);
    return { updated: false, commit: beforeSha, reason: `fetch_failed: ${detail}` };
  }

  let targetRef = 'origin/main';
  if (!gitOk(runGit(['rev-parse', '--verify', 'origin/main'], cwd))) {
    if (gitOk(runGit(['rev-parse', '--verify', 'origin/master'], cwd))) {
      targetRef = 'origin/master';
    }
  }

  // Panel `git pull` fails with "no tracking information" unless upstream is set.
  runGit(['checkout', '-B', 'main', targetRef], cwd);
  runGit(['branch', '--set-upstream-to=' + targetRef, 'main'], cwd);
  const reset = runGit(['reset', '--hard', targetRef], cwd);
  if (!gitOk(reset)) {
    const detail = gitText(reset) || 'unknown';
    log(`Reset failed: ${detail}`);
    return { updated: false, commit: beforeSha, reason: `reset_failed: ${detail}` };
  }

  runGit(['clean', '-fd', '-e', 'data', '-e', '.env', '-e', 'node_modules'], cwd);

  const after = runGit(['rev-parse', 'HEAD'], cwd);
  const afterSha = gitOk(after) ? gitLine(after) : beforeSha;
  const updated = Boolean(beforeSha && afterSha && beforeSha !== afterSha);

  if (updated) {
    log(`Updated ${beforeSha.slice(0, 7)} -> ${afterSha.slice(0, 7)}`);
    log('Running npm install --omit=dev after code update...');
    const npm = run('npm', ['install', '--omit=dev'], cwd, {
      inherit: true,
      timeoutMs: FETCH_TIMEOUT_MS,
    });
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

export function reexecIfUpdated(syncResult) {
  if (!syncResult?.updated) return false;

  log('Re-executing onto updated files...');
  const child = spawnSync(process.execPath, process.argv.slice(1), {
    cwd: process.cwd(),
    env: gitEnv({ CLEARWATER_SKIP_HOST_SYNC: '1' }),
    stdio: 'inherit',
  });
  process.exit(child.status ?? 0);
  return true;
}
