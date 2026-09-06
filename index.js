import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { reexecIfUpdated, syncHostCodeFromMain } from './utils/hostCodeSync.js';

// Spark / Apollo startup is locked to `git pull; npm install; node index.js`.
// Host sync MUST run before any Discord/bot imports. Otherwise a missing tracked
// file (like lib/credit-store.js) crashes module load and the sync never runs.
console.log('[host-sync] boot check starting...');
if (process.env.CLEARWATER_SKIP_HOST_SYNC !== '1') {
  try {
    const sync = syncHostCodeFromMain();
    if (sync.reason && sync.reason !== 'already_current' && sync.reason !== 'no_git' && sync.reason !== 'updated') {
      console.log(`[host-sync] WARN ${sync.reason}`);
    } else if (sync.commit) {
      const msg = sync.updated
        ? `Host code updated to ${sync.commit.slice(0, 7)}; re-executing onto new files.`
        : `Host code already at ${sync.commit.slice(0, 7)}.`;
      console.log(`[host-sync] ${msg}`);
    } else {
      console.log(`[host-sync] no commit result (reason=${sync.reason || 'unknown'})`);
    }
    reexecIfUpdated(sync);
  } catch (error) {
    console.log(`[host-sync] ERROR ${error?.message || error}`);
  }
} else {
  console.log('[host-sync] skipped (CLEARWATER_SKIP_HOST_SYNC=1)');
}

const creditStorePath = join(process.cwd(), 'lib', 'credit-store.js');
if (!existsSync(creditStorePath)) {
  console.error('[host-sync] ERROR missing lib/credit-store.js after sync. Run the host repair command.');
  process.exit(1);
}

console.log('[host-sync] boot check finished; starting bot...');
await import('./bot.js');
