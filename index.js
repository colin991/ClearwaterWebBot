/**
 * Apollopanel / Pterodactyl entrypoint.
 *
 * Locked startup (do not change — this is expected):
 *   if [[ -d .git ]]; then git pull; fi;
 *   npm install --production;
 *   node /home/container/index.js
 *
 * Panel `git pull` often fails on a dirty tree (downloads/, tmp/, etc.) and is
 * ignored by the shell `if`. This file force-syncs from origin/main next, then
 * starts the bot. Host-only data/ and .env are preserved. Origin URL/token is
 * never rewritten (private repo).
 */
console.log('[boot] starting...');
console.log('[boot] locked panel startup is fine — sync runs here after git pull/npm');

if (process.env.CLEARWATER_SKIP_HOST_SYNC !== '1') {
  try {
    const { syncHostCodeFromMain, reexecIfUpdated } = await import('./utils/hostCodeSync.js');
    const result = syncHostCodeFromMain();
    if (result?.reason === 'no_git') {
      console.log('[host-sync] No .git — zip upload host. Set CLEARWATER_GIT_REMOTE (PAT URL) or run the README console repair.');
    } else if (result?.reason && !['already_current', 'updated', 'bootstrapped'].includes(result.reason)) {
      console.log(`[host-sync] WARN ${result.reason}`);
      console.log('[host-sync] Stop → README console repair (not startup command) → Start.');
    }
    // If code changed, replace this process so the new files actually run.
    reexecIfUpdated(result);
  } catch (error) {
    console.log(`[host-sync] skipped (${error?.message || error})`);
    console.log('[host-sync] Stop the server and paste the README repair one-liner in the Apollo console, then Start.');
  }
}

console.log('[boot] starting bot...');
await import('./bot.js');
