#!/usr/bin/env bash
# Spark / Apollo host repair — safe code sync without wiping data/ or .env.
# Usage (from panel console):  bash scripts/repair-host.sh
# Or one-liner if this file is not on the host yet (see README).

set -u
cd /home/container 2>/dev/null || cd "$(dirname "$0")/.." || cd .

echo "========== CLEARWATER HOST REPAIR =========="
echo "Time: $(date -u +%Y-%m-%dT%H:%M:%SZ)"
echo "PWD:  $(pwd)"
echo

echo "[1] Checking folders..."
echo "  .git  exists? $([ -d .git ] && echo YES || echo NO)"
echo "  data  exists? $([ -d data ] && echo YES || echo NO)"
echo "  .env  exists? $([ -f .env ] && echo YES || echo NO)"
echo "  index.js exists? $([ -f index.js ] && echo YES || echo NO)"
echo "  hostCodeSync.js exists? $([ -f utils/hostCodeSync.js ] && echo YES || echo NO)"
echo

if [ ! -d .git ]; then
  echo "ERROR: No .git folder. This host is not a git checkout."
  echo "Apollo cannot update from GitHub until the server is reinstalled from the GitHub repo"
  echo "(not a zip upload). Do NOT delete data/ or .env if you reinstall."
  echo "========== REPAIR FAILED =========="
  exit 1
fi

echo "[2] Current commit BEFORE update:"
git log -1 --oneline || echo "  (could not read HEAD)"
echo

echo "[3] Git remote (token hidden):"
git remote -v 2>/dev/null | sed 's/\/\/[^@/]*@/\/\/***@/g' || echo "  (no remote)"
echo

echo "[4] Removing junk that blocks git pull..."
rm -rf downloads tmp
echo "  done"
echo

echo "[5] Fetching origin/main (keeps existing Apollo git login)..."
if ! git fetch origin main; then
  echo "  fetch origin main failed; trying plain git fetch origin..."
  if ! git fetch origin; then
    echo "ERROR: git fetch failed. Apollo git login may be broken."
    echo "In the panel, reconnect the GitHub repo / reinstall from GitHub (keep data/ + .env)."
    echo "========== REPAIR FAILED =========="
    exit 1
  fi
fi
echo "  fetch ok"
echo

echo "[6] Hard reset to origin/main (code only; data/ kept)..."
if git show-ref --verify --quiet refs/remotes/origin/main; then
  git reset --hard origin/main
elif git show-ref --verify --quiet refs/remotes/origin/master; then
  git reset --hard origin/master
else
  echo "ERROR: origin/main (and origin/master) not found after fetch."
  echo "========== REPAIR FAILED =========="
  exit 1
fi
echo

echo "[7] Commit AFTER update:"
git log -1 --oneline || true
echo

echo "[8] Installing npm deps..."
if [ -f package.json ]; then
  npm install --omit=dev
  echo "  npm install finished (exit $?)"
else
  echo "  no package.json?"
fi
echo

echo "[9] Quick file checks:"
echo "  hostCodeSync.js? $([ -f utils/hostCodeSync.js ] && echo YES || echo NO)"
echo "  frequencyChangeGreeting.js? $([ -f utils/frequencyChangeGreeting.js ] && echo YES || echo NO)"
echo "  clearwater-internet.json? $([ -f data/clearwater-internet.json ] && echo YES || echo NO)"
echo

echo "========== REPAIR DONE =========="
echo "Now click Start/Restart in Apollo and watch for [host-sync] lines in the console."
