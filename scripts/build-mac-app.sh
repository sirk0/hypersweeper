#!/usr/bin/env bash
# Build a game's macOS app — the TypeScript game packaged so it runs with no
# internet connection. Hypersweeper.app by default; any game in apps/ with a
# packaging.json (Rep-tiles.app with --game reptiles).
#
# The pieces: scripts/stage-desktop.sh builds apps/<game>/ to static files and
# stages them, with the game's packaging.json and icon, into shells/desktop/;
# electron-builder wraps that shell (which serves them over the app:// scheme)
# into a bundle named and identified from the packaging.json. Every asset the
# game needs is compiled into that bundle, and scripts/check-offline-assets.mjs
# refuses to let the build past if anything in it still points at a URL.
#
#   scripts/build-mac-app.sh [--game <name>] [--dmg] [--zip]
#                            [--arm64|--x64|--universal]
#                            [--open] [--skip-web] [--no-verify]
#
# Output: build/desktop/<game>/mac*/<productName>.app (plus the installers
# asked for).
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

GAME="${GAME:-hypersweeper}"
TARGETS=()
ARCH=()
OPEN=0
SKIP_WEB=0
VERIFY=1

while [ $# -gt 0 ]; do
  case "$1" in
    --game) shift; GAME="${1:?--game needs a name}" ;;
    --dmg) TARGETS+=(dmg) ;;
    --zip) TARGETS+=(zip) ;;
    --app|--dir) TARGETS+=(dir) ;;
    --arm64) ARCH+=(--arm64) ;;
    --x64) ARCH+=(--x64) ;;
    --universal) ARCH+=(--universal) ;;
    --open) OPEN=1 ;;
    --skip-web) SKIP_WEB=1 ;;   # reuse the game's existing dist/
    --no-verify) VERIFY=0 ;;    # skip launching the built app to check it
    # The header comment above, up to the first line that is not one.
    -h|--help) awk 'NR>1 { if (!/^#/) exit; sub(/^# ?/, ""); print }' "${BASH_SOURCE[0]}"; exit 0 ;;
    *) echo "unknown option: $1" >&2; exit 2 ;;
  esac
  shift
done

step() { printf '\n\033[1m==> %s\033[0m\n' "$1"; }
die() { printf '\033[31merror:\033[0m %s\n' "$1" >&2; exit 1; }

# --- preflight ---------------------------------------------------------------
command -v node >/dev/null || die "node is required (22 or newer); see https://nodejs.org"
command -v npm >/dev/null || die "npm is required (it ships with node)"

if [ "$(uname -s)" != "Darwin" ] && [ "${HYPERSWEEPER_ALLOW_CROSS_BUILD:-0}" != "1" ]; then
  die "a macOS .app can only be built on macOS — electron-builder needs the
       platform's own signing and disk-image tools. Run this on a Mac.
       To package the shell on this machine anyway (a Linux bundle, for
       testing the packaging itself), use: make desktop-smoke"
fi

# --- 1. the game, staged into the shell -------------------------------------
STAGE=(scripts/stage-desktop.sh "$GAME")
if [ "$SKIP_WEB" = 1 ]; then STAGE+=(--skip-web); fi
"${STAGE[@]}"

# What the bundle is called and how it identifies itself: the game's own.
PACKAGING="apps/$GAME/packaging.json"
field() { node -p "require('./$PACKAGING').$1"; }
NAME="$(field productName)"
APP_ID="$(field desktop.appId)"
EXECUTABLE="$(field desktop.executableName)"
SMOKE_ROUTE="$(field "desktop.smokeRoute ?? ''")"
OUT="build/desktop/$GAME"

# --- 2. package --------------------------------------------------------------
step "Installing the desktop shell's build tools"
if [ -f shells/desktop/package-lock.json ]; then
  (cd shells/desktop && npm ci)
else
  (cd shells/desktop && npm install)
fi

step "Running the shell's unit tests"
(cd shells/desktop && npm test)

step "Packaging $NAME.app"
# The ${arr[@]+"${arr[@]}"} dance is for macOS's own bash 3.2, where `set -u`
# treats an empty array expansion as an unbound variable. The -c.* overrides
# are the per-game half of electron-builder.yml.
(cd shells/desktop && npx --no-install electron-builder --mac \
  "-c.appId=$APP_ID" "-c.productName=$NAME" "-c.dmg.title=$NAME" \
  "-c.linux.executableName=$EXECUTABLE" "-c.directories.output=../../$OUT" \
  ${TARGETS[@]+"${TARGETS[@]}"} ${ARCH[@]+"${ARCH[@]}"})

# --- 3. make it launchable ---------------------------------------------------
# An app with no signature at all will not start on Apple Silicon; an ad-hoc
# signature (the "-" identity) is enough for one you built yourself, and costs
# nothing. Locally built apps carry no quarantine attribute, so Gatekeeper does
# not prompt — copying the .app to *another* Mac is what needs a real
# Developer ID certificate and notarisation.
APP="$(find "$OUT" -maxdepth 2 -name "$NAME.app" -print -quit || true)"
if [ -n "$APP" ] && command -v codesign >/dev/null; then
  if ! codesign --verify --deep --strict "$APP" >/dev/null 2>&1; then
    step "Ad-hoc signing the bundle"
    codesign --force --deep --sign - "$APP"
  fi
  codesign --verify --deep --strict "$APP" || die "the bundle is not validly signed"
fi

# --- 4. check the thing that was built --------------------------------------
# Launch the bundle itself with every off-bundle request cancelled: it has to
# start, report ready and draw a board without asking the network for anything.
# This is what catches a file left out of the bundle, a broken signature, or an
# asset that only resolved because the dev server was serving it.
if [ -n "$APP" ] && [ "$VERIFY" = 1 ]; then
  step "Verifying the bundle runs offline"
  SHOT="$ROOT/$OUT/verify.png"
  "$APP/Contents/MacOS/$NAME" "--smoke=$SHOT" "--route=$SMOKE_ROUTE"
  echo "  screenshot: $SHOT"
fi

step "Done"
if [ -n "$APP" ]; then
  echo "  $APP  ($(du -sh "$APP" | cut -f1))"
  echo
  echo "  Try it:      open '$APP'"
  echo "  Install it:  cp -R '$APP' /Applications/"
  if [ "$OPEN" = 1 ]; then open "$APP"; fi
fi
find "$OUT" -maxdepth 1 \( -name '*.dmg' -o -name '*.zip' \) -print 2>/dev/null || true
