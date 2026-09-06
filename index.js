import { existsSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Apollo hosts may run WITHOUT git (zip upload / git pull removed).
 * Never block boot on git sync. Optional sync only when .git exists.
 */
console.log('[boot] starting...');

const hasGit = existsSync(join(process.cwd(), '.git'));
const skipSync = process.env.CLEARWATER_SKIP_HOST_SYNC === '1' || !hasGit;

if (!skipSync) {
  try {
    const { reexecIfUpdated, syncHostCodeFromMain } = await import('./utils/hostCodeSync.js');
    console.log('[boot] .git found — running optional host sync...');
    const sync = syncHostCodeFromMain();
    if (sync.reason && sync.reason !== 'already_current' && sync.reason !== 'updated') {
      console.log(`[boot] host-sync warn: ${sync.reason}`);
    } else if (sync.commit) {
      console.log(
        sync.updated
          ? `[boot] updated to ${sync.commit.slice(0, 7)}; re-executing...`
          : `[boot] already at ${sync.commit.slice(0, 7)}`,
      );
    }
    reexecIfUpdated(sync);
  } catch (error) {
    console.log(`[boot] host-sync skipped/failed: ${error?.message || error}`);
  }
} else if (!hasGit) {
  console.log('[boot] no .git — running in offline/upload mode (git sync disabled)');
} else {
  console.log('[boot] host-sync skipped by env');
}

console.log('[boot] loading bot...');
await import('./bot.js');
