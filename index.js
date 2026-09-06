import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { reexecIfUpdated, syncHostCodeFromMain } from './utils/hostCodeSync.js';

const ROOT = dirname(fileURLToPath(import.meta.url));

/** Minimal fallback so hosts without git/lib can still boot. */
const CREDIT_STORE_FALLBACK = `/** Roblox catalog packs that grant Clearwater Credits after inventory verification. */
export const CREDIT_STORE_PACKS = Object.freeze([
  {
    id: '109005087621617',
    assetId: '109005087621617',
    robux: 500,
    credits: 1000,
    label: 'Starter pack',
    url: 'https://www.roblox.com/catalog/109005087621617',
  },
  {
    id: '123843071072106',
    assetId: '123843071072106',
    robux: 1000,
    credits: 2200,
    label: 'Boost pack',
    url: 'https://www.roblox.com/catalog/123843071072106',
  },
  {
    id: '85562318217896',
    assetId: '85562318217896',
    robux: 1500,
    credits: 2750,
    label: 'Plus pack',
    url: 'https://www.roblox.com/catalog/85562318217896',
  },
  {
    id: '116068796281105',
    assetId: '116068796281105',
    robux: 2000,
    credits: 3400,
    label: 'City pack',
    url: 'https://www.roblox.com/catalog/116068796281105',
  },
]);

export const CREDIT_STORE_ASSET_IDS = Object.freeze(
  CREDIT_STORE_PACKS.map((pack) => String(pack.assetId)),
);

export function creditStorePackByAssetId(assetId) {
  const id = String(assetId || '');
  return CREDIT_STORE_PACKS.find((pack) => String(pack.assetId) === id) || null;
}
`;

function ensureCreditStoreFiles() {
  const utilPath = join(ROOT, 'utils', 'creditStore.js');
  const libPath = join(ROOT, 'lib', 'credit-store.js');
  const libReexport = `/** Compatibility re-export — pack data lives in utils/creditStore.js. */
export {
  CREDIT_STORE_PACKS,
  CREDIT_STORE_ASSET_IDS,
  creditStorePackByAssetId,
} from '../utils/creditStore.js';
`;

  if (!existsSync(utilPath)) {
    mkdirSync(dirname(utilPath), { recursive: true });
    writeFileSync(utilPath, CREDIT_STORE_FALLBACK);
    console.log('[host-sync] wrote missing utils/creditStore.js');
  }

  if (!existsSync(libPath)) {
    mkdirSync(dirname(libPath), { recursive: true });
    // Prefer re-export when utils file exists; otherwise write full fallback.
    writeFileSync(libPath, existsSync(utilPath) ? libReexport : CREDIT_STORE_FALLBACK);
    console.log('[host-sync] wrote missing lib/credit-store.js');
  }
}

// Spark / Apollo startup is locked to `git pull; npm install; node index.js`.
// Host sync MUST run before any Discord/bot imports. Otherwise a missing tracked
// file crashes module load and the sync never runs.
console.log('[host-sync] boot check starting...');
if (process.env.CLEARWATER_SKIP_HOST_SYNC !== '1') {
  try {
    const sync = syncHostCodeFromMain();
    if (sync.reason === 'no_git') {
      console.log('[host-sync] WARN no .git on this host — code will not auto-update from GitHub.');
      console.log('[host-sync] WARN Reinstall/reconnect this server FROM GITHUB (keep data/ and .env).');
    } else if (sync.reason && sync.reason !== 'already_current' && sync.reason !== 'updated') {
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

ensureCreditStoreFiles();

console.log('[host-sync] boot check finished; starting bot...');
await import('./bot.js');
