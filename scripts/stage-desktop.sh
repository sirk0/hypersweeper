#!/usr/bin/env bash
# Stage one game into the desktop shell (shells/desktop): build it as a packaged
# bundle, prove it needs no network, and copy it — with its packaging config and
# icon — to where the shell and electron-builder read it. The one step
# `make desktop-build`, scripts/build-mac-app.sh and scripts/desktop-smoke.sh
# share, so every way of running the shell runs the same bundle.
#
#   scripts/stage-desktop.sh [game] [--skip-web]
#
# game is a folder in apps/ with a packaging.json (default: hypersweeper; or
# GAME=<game> in the environment). --skip-web reuses the game's existing dist/.
#
# Writes (all gitignored):
#   shells/desktop/app/                the game's packaged dist/
#   shells/desktop/app.json            the game's packaging.json (main.mjs reads it)
#   shells/desktop/resources/icon.png  the game's desktop icon (electron-builder)
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

GAME="${GAME:-hypersweeper}"
SKIP_WEB=0
for arg in "$@"; do
  case "$arg" in
    --skip-web) SKIP_WEB=1 ;;
    -h|--help) awk 'NR>1 { if (!/^#/) exit; sub(/^# ?/, ""); print }' "${BASH_SOURCE[0]}"; exit 0 ;;
    -*) echo "unknown option: $arg" >&2; exit 2 ;;
    *) GAME="$arg" ;;
  esac
done

step() { printf '\n\033[1m==> %s\033[0m\n' "$1"; }
die() { printf '\033[31merror:\033[0m %s\n' "$1" >&2; exit 1; }

DIR="apps/$GAME"
[ -f "$DIR/packaging.json" ] || die "$DIR/packaging.json is missing — is '$GAME' a game in apps/?"
ICON="$DIR/$(node -p "require('./$DIR/packaging.json').desktop.icon")"
[ -f "$ICON" ] || die "$ICON is missing — redraw it with the game's \`npm run icons\`"

if [ "$SKIP_WEB" = 0 ]; then
  scripts/ensure-web-deps.sh
  step "Building $GAME (VITE_PACKAGED=1)"
  # VITE_PACKAGED drops the service worker, the version stamp and the update
  # check: inside a bundle there is no deployed build to update from. See
  # packages/vite-preset.
  (cd "$DIR" && VITE_PACKAGED=1 npm run build)
fi
[ -f "$DIR/dist/index.html" ] || die "$DIR/dist is empty — build the game first"

step "Checking the bundle needs no network"
node scripts/check-offline-assets.mjs "$DIR/dist"

step "Staging $GAME into shells/desktop"
rm -rf shells/desktop/app
cp -R "$DIR/dist" shells/desktop/app
cp "$DIR/packaging.json" shells/desktop/app.json
mkdir -p shells/desktop/resources
cp "$ICON" shells/desktop/resources/icon.png
echo "  staged $DIR/dist, its packaging.json and its icon"
