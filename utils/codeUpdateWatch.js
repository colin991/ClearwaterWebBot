import { execFile } from 'node:child_process';
import { logger } from './logger.js';

/** Exit code that tells the index.js supervisor to pull main and start the bot again. */
export const UPDATE_RESTART_CODE = 75;
const DEFAULT_INTERVAL_MS = 5 * 60 * 1000;

function git(args, cwd) {
  return new Promise((resolve) => {
    execFile('git', args, {
      cwd,
      timeout: 90_000,
      env: { ...process.env, GIT_TERMINAL_PROMPT: '0', GIT_ASKPASS: 'echo' },
    }, (error, stdout) => resolve(error ? null : String(stdout).trim()));
  });
}

/** @returns {Promise<string|null>} the new origin/main commit when it differs from the running one. */
export async function findNewerMain(cwd = process.cwd()) {
  const head = await git(['rev-parse', 'HEAD'], cwd);
  if (!head) return null;
  if ((await git(['fetch', '--depth', '1', '--no-tags', 'origin', 'main'], cwd)) === null) return null;
  const remote = await git(['rev-parse', 'FETCH_HEAD'], cwd);
  return remote && remote !== head ? remote : null;
}

/**
 * Restarts the bot onto new code whenever main moves, so merged changes go live without
 * a manual restart. Only runs under the index.js supervisor, which pulls main and starts
 * the bot again when it exits with UPDATE_RESTART_CODE.
 * @param {(code: number) => void} restart graceful shutdown that exits with the given code
 * @returns {() => void} stop function
 */
export function startCodeUpdateWatch(restart, env = process.env) {
  if (env.CLEARWATER_SUPERVISED !== '1' || env.CLEARWATER_AUTO_UPDATE === '0') return () => {};
  const intervalMs = Number(env.CLEARWATER_AUTO_UPDATE_MS) || DEFAULT_INTERVAL_MS;
  let busy = false;
  const timer = setInterval(async () => {
    if (busy) return;
    busy = true;
    try {
      const commit = await findNewerMain();
      if (commit) {
        logger.info(`New code on main (${commit.slice(0, 7)}); restarting to apply it.`);
        clearInterval(timer);
        restart(UPDATE_RESTART_CODE);
      }
    } catch (error) {
      logger.warn(`Update check failed: ${error?.message || error}`);
    } finally {
      busy = false;
    }
  }, intervalMs);
  timer.unref?.();
  return () => clearInterval(timer);
}
