#!/usr/bin/env bash
# Prove a game's packaged desktop build runs with no network — on any OS,
# including the Linux/CI machines that cannot build a .app.
#
# It stages the game into the desktop shell (scripts/stage-desktop.sh: build,
# offline check, copy) and launches the real Electron app with every
# off-bundle request cancelled (see installOfflineGuard in
# shells/desktop/main.mjs). The run passes only if the app reports itself
# ready, has painted something (the game's desktop.smokePainted), logs no
# errors, and asked for nothing it does not carry. The screenshot it leaves
# behind is what to look at when something renders wrong.
#
#   scripts/desktop-smoke.sh [output.png] [route]
#
# GAME=<game> picks the game (default hypersweeper); the route defaults to the
# game's desktop.smokeRoute. e.g.
#   scripts/desktop-smoke.sh shot.png '?mode=hexhex&difficulty=easy&seed=7'
#   GAME=reptiles scripts/desktop-smoke.sh build/reptiles-smoke.png
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

GAME="${GAME:-hypersweeper}"
OUT="${1:-build/desktop-smoke-$GAME.png}"
ROUTE="${2:-}"
mkdir -p "$(dirname "$OUT")"

step() { printf '\n\033[1m==> %s\033[0m\n' "$1"; }

scripts/stage-desktop.sh "$GAME"

step "Installing the desktop shell"
if [ ! -d shells/desktop/node_modules ]; then
  if [ -f shells/desktop/package-lock.json ]; then (cd shells/desktop && npm ci); else (cd shells/desktop && npm install); fi
fi
(cd shells/desktop && npm test)

step "Launching $GAME offline"
# A headless box has no X server and no GPU: Xvfb supplies the display, and
# main.mjs switches on SwiftShader for a WebGL board when --smoke is passed.
RUN=(npx --no-install electron . "--smoke=$ROOT/$OUT")
if [ -n "$ROUTE" ]; then RUN+=("--route=$ROUTE"); fi
# Chromium's sandbox cannot run as root, which is how CI containers run. This
# is the smoke harness only — the shipped app keeps the sandbox on (and the
# renderer is sandboxed either way, see webPreferences in main.mjs).
if [ "$(id -u)" = 0 ]; then RUN+=(--no-sandbox); fi
if [ -z "${DISPLAY:-}" ] && command -v xvfb-run >/dev/null; then
  (cd shells/desktop && xvfb-run -a --server-args="-screen 0 1280x960x24" "${RUN[@]}")
else
  (cd shells/desktop && "${RUN[@]}")
fi

step "Done"
echo "  screenshot: $OUT"
