#!/usr/bin/env bash
# Rebuild the real portable ClearwaterPhone.exe and copy it into /downloads.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PHONE="$ROOT/anchor-phone"
OUT="$ROOT/downloads/ClearwaterPhone.exe"

cd "$PHONE"
npm install
npm run dist
cp -f "$PHONE/dist/ClearwaterPhone.exe" "$OUT"
ls -lh "$OUT"
