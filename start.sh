#!/usr/bin/env bash
# Apollopanel / Pterodactyl startup helper.
# Updates bot *code* from origin/main, then starts the Discord bot.
# Host-local state in data/ and .env is intentionally preserved.
set -euo pipefail

cd "$(dirname "$0")"

echo "[start] Working directory: $(pwd)"

# Host-only runtime files — never wipe these during an update.
preserve_paths=(
  data
  .env
  node_modules
)

if [[ -d .git ]]; then
  echo "[start] Syncing repository to origin/main (preserving data/ and .env)..."
  # Remove the file that keeps blocking panel git pull on this host.
  rm -rf downloads tmp
  # Keep Apollo/Spark origin URL (it usually includes deploy credentials).
  # Do NOT replace origin with a public GitHub URL — this repo is private.
  if ! git remote get-url origin >/dev/null 2>&1; then
    echo "[start] WARNING: git origin is missing; fetch may fail on this private repo."
  else
    echo "[start] Using existing git origin (credentials preserved)."
  fi
  git fetch origin main || git fetch origin
  git checkout -B main origin/main 2>/dev/null || git checkout -B main origin/master
  # Reset tracked files only. Does NOT delete gitignored host data.
  git reset --hard origin/main 2>/dev/null || git reset --hard origin/master
  # Clean leftover untracked junk, but never touch data/, .env, or node_modules.
  # Important: do NOT use `git clean -fdx` — that would wipe gitignored data files.
  clean_excludes=()
  for path in "${preserve_paths[@]}"; do
    clean_excludes+=(-e "$path")
  done
  git clean -fd "${clean_excludes[@]}"
  echo "[start] Now at: $(git log -1 --oneline)"
else
  echo "[start] No .git directory found; starting with current files."
fi

mkdir -p data

if [[ -f data/clearwater-internet.json ]]; then
  echo "[start] Host data present: clearwater-internet.json"
elif [[ -f data/clearwater-internet.json.bak ]]; then
  echo "[start] WARNING: clearwater-internet.json missing; backup .bak still exists on host."
else
  echo "[start] No Clearwater Internet store on host yet (fresh data/)."
fi

if [[ -f .env ]]; then
  echo "[start] Host .env present."
else
  echo "[start] WARNING: .env is missing — bot may fail to log in."
fi

if [[ -f package.json ]]; then
  echo "[start] Installing npm dependencies..."
  npm install --omit=dev
fi

echo "[start] Launching Discord bot..."
exec node index.js
