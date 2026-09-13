/**
 * Apollopanel / Pterodactyl entrypoint.
 *
 * Locked startup (leave unchanged):
 *   if [[ -d .git ]]; then git pull; fi;
 *   npm install --production;
 *   node /home/container/index.js
 *
 * Host sync runs first, but MUST NOT block the bot forever. Sync failures are
 * logged and ignored so Discord commands keep working.
 *
 * Emergency: set CLEARWATER_SKIP_HOST_SYNC=1 in Apollo Variables to skip sync.
 */
console.log('[boot] starting...');

const skipSync = process.env.CLEARWATER_SKIP_HOST_SYNC === '1';

if (!skipSync) {
  try {
    const { syncHostCodeFromMain, reexecIfUpdated } = await import('./utils/hostCodeSync.js');
    const result = syncHostCodeFromMain();
    const reason = result?.reason || 'unknown';
    console.log(`[host-sync] result: ${reason}${result?.commit ? ` (${String(result.commit).slice(0, 7)})` : ''}`);

    if (reason === 'no_git' || reason === 'incomplete_git') {
      console.log('[host-sync] No usable .git. Set CLEARWATER_GIT_REMOTE or run console repair. Starting bot with local files.');
    } else if (!['already_current', 'updated', 'bootstrapped'].includes(reason)) {
      console.log(`[host-sync] WARN ${reason}`);
      console.log('[host-sync] Continuing with local files so commands still work.');
    }

    // Only re-exec when sync clearly updated code. Never hang the bot on sync.
    if (result?.updated) {
      reexecIfUpdated(result);
    }
  } catch (error) {
    console.log(`[host-sync] skipped (${error?.message || error}) — starting bot anyway`);
  }
} else {
  console.log('[boot] CLEARWATER_SKIP_HOST_SYNC=1 — skipping git sync');
}

console.log('[boot] starting bot...');
await import('./bot.js');
