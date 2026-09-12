/**
 * Apollopanel / Pterodactyl entrypoint.
 *
 * Locked startup is usually:
 *   if [[ -d .git ]]; then git pull; fi; npm install; node /home/container/index.js
 *
 * Plain `git pull` often fails on a dirty tree (downloads/, tmp/, etc.), so the
 * host keeps running old code. Sync here first, then start the bot.
 *
 * Preserve host-only data/ and .env. Never rewrite origin (private repo token).
 */
console.log('[boot] starting...');

if (process.env.CLEARWATER_SKIP_HOST_SYNC !== '1') {
  try {
    const { syncHostCodeFromMain, reexecIfUpdated } = await import('./utils/hostCodeSync.js');
    const result = syncHostCodeFromMain();
    if (result?.reason === 'no_git') {
      console.log('[host-sync] No .git folder — using uploaded files. Reinstall from GitHub to enable updates.');
    } else if (result?.reason && result.reason !== 'already_current' && result.reason !== 'updated') {
      console.log(`[host-sync] WARN ${result.reason}`);
    }
    // If code changed, replace this process so the new files actually run.
    reexecIfUpdated(result);
  } catch (error) {
    console.log(`[host-sync] skipped (${error?.message || error})`);
  }
}

console.log('[boot] starting bot...');
await import('./bot.js');
