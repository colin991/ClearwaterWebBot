#!/usr/bin/env bash
# Vercel Ignored Build Step.
# Exit 0 = SKIP this deployment (saves quota).
# Exit 1 = BUILD / deploy.
#
# Only deploy when website-related paths change. Bot-only pushes
# (utils/, commands/, events/, etc.) should not use a Vercel deployment.

set -euo pipefail

if ! git rev-parse --verify HEAD >/dev/null 2>&1; then
  echo "[vercel-ignore] no git HEAD — building"
  exit 1
fi

# First commit on the branch / shallow clone edge case.
if ! git rev-parse --verify HEAD^ >/dev/null 2>&1; then
  echo "[vercel-ignore] no parent commit — building"
  exit 1
fi

# Paths that affect the Clearwater website / Vercel APIs.
WEBSITE_PATHS=(
  index.html
  internet.html
  owner.html
  signin.html
  coming-soon.html
  privacy.html
  terms.html
  wallet.html
  manifest.webmanifest
  styles.css
  internet.css
  legal.css
  signin.css
  coming-soon.css
  script.js
  internet.js
  owner.js
  signin.js
  coming-soon.js
  site-gate.js
  events.html
  pcso-events.js
  api
  lib
  assets
  public
  vercel.json
  scripts/build-site.js
  scripts/vercel-ignore.sh
  package.json
  package-lock.json
)

changed="$(git diff --name-only HEAD^ HEAD -- "${WEBSITE_PATHS[@]}" || true)"

if [[ -z "${changed}" ]]; then
  echo "[vercel-ignore] no website changes — skipping Vercel deploy"
  echo "[vercel-ignore] (bot-only push; quota saved)"
  exit 0
fi

echo "[vercel-ignore] website files changed — building:"
echo "${changed}"
exit 1
