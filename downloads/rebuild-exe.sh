#!/usr/bin/env bash
# Rebuild ClearwaterPhone.exe (Windows) from the embedded app sources.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")" && pwd)"
SRC="$ROOT/clearwater-phone"
LAUNCHER="$ROOT/launcher"

rm -rf "$LAUNCHER/app"
mkdir -p "$LAUNCHER/app"
cp -a "$SRC/." "$LAUNCHER/app/"
cd "$LAUNCHER"
GOOS=windows GOARCH=amd64 CGO_ENABLED=0 go build -ldflags="-s -w" -o "$ROOT/ClearwaterPhone.exe" .
ls -lh "$ROOT/ClearwaterPhone.exe"
