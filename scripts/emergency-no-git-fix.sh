#!/usr/bin/env bash
# Fix Apollo host with NO git. Paste into console, then Start.
set -e
cd /home/container 2>/dev/null || cd .

echo "[fix] cwd=$(pwd)"
mkdir -p lib utils

# 1) Credit store files
cat > utils/creditStore.js << 'JS'
export const CREDIT_STORE_PACKS = Object.freeze([
  { id: '109005087621617', assetId: '109005087621617', robux: 500, credits: 1000, label: 'Starter pack', url: 'https://www.roblox.com/catalog/109005087621617' },
  { id: '123843071072106', assetId: '123843071072106', robux: 1000, credits: 2200, label: 'Boost pack', url: 'https://www.roblox.com/catalog/123843071072106' },
  { id: '85562318217896', assetId: '85562318217896', robux: 1500, credits: 2750, label: 'Plus pack', url: 'https://www.roblox.com/catalog/85562318217896' },
  { id: '116068796281105', assetId: '116068796281105', robux: 2000, credits: 3400, label: 'City pack', url: 'https://www.roblox.com/catalog/116068796281105' },
]);
export const CREDIT_STORE_ASSET_IDS = Object.freeze(CREDIT_STORE_PACKS.map((p) => String(p.assetId)));
export function creditStorePackByAssetId(assetId) {
  const id = String(assetId || '');
  return CREDIT_STORE_PACKS.find((p) => String(p.assetId) === id) || null;
}
JS

cat > lib/credit-store.js << 'JS'
export {
  CREDIT_STORE_PACKS,
  CREDIT_STORE_ASSET_IDS,
  creditStorePackByAssetId,
} from '../utils/creditStore.js';
JS

# 2) Patch internetStore import if it still points at lib/
if [ -f utils/internetStore.js ]; then
  sed -i "s|from '../lib/credit-store.js'|from './creditStore.js'|g" utils/internetStore.js || true
  sed -i "s|from \"./creditStore.js\"|from './creditStore.js'|g" utils/internetStore.js || true
fi

# 3) Replace index.js with offline-safe bootstrap (keeps bot.js if present)
if [ -f bot.js ]; then
  cat > index.js << 'JS'
import { existsSync } from 'node:fs';
import { join } from 'node:path';
console.log('[boot] starting (offline/no-git safe)...');
if (!existsSync(join(process.cwd(), '.git'))) {
  console.log('[boot] no .git — git sync disabled');
}
console.log('[boot] loading bot...');
await import('./bot.js');
JS
  echo "[fix] wrote offline index.js -> bot.js"
else
  # Old monolithic index: just strip hard exits
  python3 - << 'PY' || true
from pathlib import Path
p = Path('index.js')
if not p.exists():
    raise SystemExit('no index.js')
t = p.read_text()
t2 = t
# Remove hard exit blocks about credit-store
import re
t2 = re.sub(
    r"if\s*\(\s*!existsSync\([^)]*credit-store[^)]*\)\s*\)\s*\{[^}]*process\.exit\(1\);\s*\}",
    "console.log('[boot] credit-store check disabled');",
    t2,
    flags=re.S,
)
t2 = t2.replace("process.exit(1);", "console.log('[boot] ignored exit'); //")
# Don't actually replace ALL exit(1) - too dangerous. revert broad replace
t = p.read_text()
t2 = re.sub(
    r"if\s*\(\s*!existsSync\((?:creditStorePath|[^)]*credit-store[^)]*)\)\s*\)\s*\{[\s\S]*?process\.exit\(1\);\s*\}",
    "console.log('[boot] credit-store check disabled');",
    t,
)
p.write_text(t2)
print('patched monolithic index.js')
PY
fi

# 4) Ensure discord.js installed
if [ -f package.json ]; then
  npm install --omit=dev || true
fi

echo "[fix] files:"
ls -la lib/credit-store.js utils/creditStore.js index.js
echo "[fix] DONE — click Start now (startup can be: node index.js)"
