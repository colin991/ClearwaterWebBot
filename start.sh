#!/usr/bin/env bash
# Apollopanel / Pterodactyl startup helper.
# Force-syncs to origin/main so a leftover local file cannot block updates,
# then starts the Discord bot.
set -euo pipefail

cd "$(dirname "$0")"

echo "[start] Working directory: $(pwd)"

if [[ -d .git ]]; then
  echo "[start] Syncing repository to origin/main..."
  # Remove the file that keeps blocking panel git pull on this host.
  rm -rf downloads
  git remote set-url origin https://github.com/colin991/ClearwaterWebBot.git 2>/dev/null || true
  git fetch origin main
  git checkout -B main origin/main
  git reset --hard origin/main
  git clean -fd
  echo "[start] Now at: $(git log -1 --oneline)"
else
  echo "[start] No .git directory found; starting with current files."
fi

if [[ -f package.json ]]; then
  echo "[start] Installing npm dependencies..."
  npm install --omit=dev
fi

if [[ ! -f utils/secondaryServerGate.js ]]; then
  echo "[start] ERROR: utils/secondaryServerGate.js is missing. Update failed."
  exit 1
fi

if [[ -f utils/statusServer.js ]] || [[ -f vercel.json ]]; then
  echo "[start] ERROR: old website files are still present. Update failed."
  exit 1
fi

echo "[start] Launching Discord bot..."
exec node index.js
