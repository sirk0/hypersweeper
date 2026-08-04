#!/usr/bin/env bash
# Prove the packaged game runs with no network — on any OS, including the
# Linux/CI machines that cannot build a .app.
#
# It builds the desktop bundle, stages it into the shell, and launches the real
# Electron app with every off-bundle request cancelled (see installOfflineGuard
# in desktop/main.mjs). The run passes only if the app reports itself ready,
# logs no errors, and asked for nothing it does not carry. The screenshot it
# leaves behind is what to look at when something renders wrong.
#
#   scripts/desktop-smoke.sh [output.png] [route]
#
# e.g. scripts/desktop-smoke.sh shot.png '?mode=hexhex&difficulty=easy&seed=7'
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

OUT="${1:-build/desktop-smoke.png}"
ROUTE="${2:-}"
mkdir -p "$(dirname "$OUT")"

step() { printf '\n\033[1m==> %s\033[0m\n' "$1"; }

step "Building the web app (VITE_PACKAGED=1)"
[ -d web/node_modules ] || (cd web && npm ci)
(cd web && VITE_PACKAGED=1 npm run build)

step "Checking the bundle needs no network"
node scripts/check-offline-assets.mjs web/dist

step "Staging the build into desktop/app"
rm -rf desktop/app
cp -R web/dist desktop/app

step "Installing the desktop shell"
if [ ! -d desktop/node_modules ]; then
  if [ -f desktop/package-lock.json ]; then (cd desktop && npm ci); else (cd desktop && npm install); fi
fi
(cd desktop && npm test)

step "Launching the app offline"
# A headless box has no X server and no GPU: Xvfb supplies the display, and
# main.mjs switches on SwiftShader for the WebGL board when --smoke is passed.
RUN=(npx --no-install electron . "--smoke=$ROOT/$OUT")
if [ -n "$ROUTE" ]; then RUN+=("--route=$ROUTE"); fi
# Chromium's sandbox cannot run as root, which is how CI containers run. This
# is the smoke harness only — the shipped app keeps the sandbox on (and the
# renderer is sandboxed either way, see webPreferences in main.mjs).
if [ "$(id -u)" = 0 ]; then RUN+=(--no-sandbox); fi
if [ -z "${DISPLAY:-}" ] && command -v xvfb-run >/dev/null; then
  (cd desktop && xvfb-run -a --server-args="-screen 0 1280x960x24" "${RUN[@]}")
else
  (cd desktop && "${RUN[@]}")
fi

step "Done"
echo "  screenshot: $OUT"
