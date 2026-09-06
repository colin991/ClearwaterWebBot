#!/usr/bin/env bash
# Emergency: create missing credit-store files on a host with no/broken git.
# Paste into Apollo console, then click Start.
set -e
cd /home/container 2>/dev/null || cd "$(dirname "$0")/.." || cd .
mkdir -p lib utils

cat > utils/creditStore.js << 'EOF'
/** Roblox catalog packs that grant Clearwater Credits after inventory verification. */
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
EOF

cat > lib/credit-store.js << 'EOF'
/** Compatibility re-export — pack data lives in utils/creditStore.js. */
export {
  CREDIT_STORE_PACKS,
  CREDIT_STORE_ASSET_IDS,
  creditStorePackByAssetId,
} from '../utils/creditStore.js';
EOF

# Soften old hard-exit bootstraps so a missing file cannot brick boot again.
if [ -f index.js ] && grep -q 'missing lib/credit-store.js' index.js; then
  python3 - << 'PY' || true
from pathlib import Path
path = Path('index.js')
text = path.read_text()
old = """const creditStorePath = join(process.cwd(), 'lib', 'credit-store.js');
if (!existsSync(creditStorePath)) {
  console.error('[host-sync] ERROR missing lib/credit-store.js after sync. Run the host repair command.');
  process.exit(1);
}"""
if old in text:
    path.write_text(text.replace(old, "console.log('[host-sync] credit-store check skipped (repaired on host).');"))
    print('patched index.js hard exit')
else:
    print('index.js hard exit already absent or different')
PY
fi

# If internetStore still imports from lib/, and utils import is preferred, patch it.
if [ -f utils/internetStore.js ]; then
  sed -i "s|from '../lib/credit-store.js'|from './creditStore.js'|g" utils/internetStore.js || true
fi

echo "credit-store files present:"
ls -la lib/credit-store.js utils/creditStore.js
echo "DONE — click Start/Restart in Apollo now."
