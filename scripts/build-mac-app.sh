#!/usr/bin/env bash
# Build Hypersweeper.app — the TypeScript game packaged as a macOS app that
# runs with no internet connection.
#
# The pieces: web/ builds to static files, those files are staged into
# desktop/app/, and electron-builder wraps the desktop/ shell (which serves
# them over the app:// scheme) into a bundle. Every asset the game needs —
# fonts, icons, the shared data/*.json, Three.js — is compiled into that
# bundle, and scripts/check-offline-assets.mjs refuses to let the build past
# if anything in it still points at a URL.
#
#   scripts/build-mac-app.sh [--dmg] [--zip] [--arm64|--x64|--universal]
#                            [--open] [--skip-web] [--no-verify]
#
# Output: build/desktop/mac*/Hypersweeper.app (plus the installers asked for).
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

TARGETS=()
ARCH=()
OPEN=0
SKIP_WEB=0
VERIFY=1

while [ $# -gt 0 ]; do
  case "$1" in
    --dmg) TARGETS+=(dmg) ;;
    --zip) TARGETS+=(zip) ;;
    --app|--dir) TARGETS+=(dir) ;;
    --arm64) ARCH+=(--arm64) ;;
    --x64) ARCH+=(--x64) ;;
    --universal) ARCH+=(--universal) ;;
    --open) OPEN=1 ;;
    --skip-web) SKIP_WEB=1 ;;   # reuse the existing web/dist
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

# --- 1. the game ------------------------------------------------------------
if [ "$SKIP_WEB" = 0 ]; then
  step "Building the web app (VITE_PACKAGED=1)"
  if [ ! -d web/node_modules ]; then
    (cd web && npm ci)
  fi
  # VITE_PACKAGED drops the service worker and the update check: inside a
  # bundle there is no deployed build to update from. See web/vite.config.ts.
  (cd web && VITE_PACKAGED=1 npm run build)
fi
[ -f web/dist/index.html ] || die "web/dist is empty — build the web app first"

step "Checking the bundle needs no network"
node scripts/check-offline-assets.mjs web/dist

# --- 2. stage it into the shell ---------------------------------------------
step "Staging the build into desktop/app"
rm -rf desktop/app
cp -R web/dist desktop/app

# --- 3. package --------------------------------------------------------------
step "Installing the desktop shell's build tools"
if [ -f desktop/package-lock.json ]; then
  (cd desktop && npm ci)
else
  (cd desktop && npm install)
fi

step "Running the shell's unit tests"
(cd desktop && npm test)

[ -f desktop/resources/icon.png ] || die "desktop/resources/icon.png is missing — run: make desktop-icon"

step "Packaging Hypersweeper.app"
# The ${arr[@]+"${arr[@]}"} dance is for macOS's own bash 3.2, where `set -u`
# treats an empty array expansion as an unbound variable.
(cd desktop && npx --no-install electron-builder --mac \
  ${TARGETS[@]+"${TARGETS[@]}"} ${ARCH[@]+"${ARCH[@]}"})

# --- 4. make it launchable ---------------------------------------------------
# An app with no signature at all will not start on Apple Silicon; an ad-hoc
# signature (the "-" identity) is enough for one you built yourself, and costs
# nothing. Locally built apps carry no quarantine attribute, so Gatekeeper does
# not prompt — copying the .app to *another* Mac is what needs a real
# Developer ID certificate and notarisation.
APP="$(find build/desktop -maxdepth 2 -name 'Hypersweeper.app' -print -quit || true)"
if [ -n "$APP" ] && command -v codesign >/dev/null; then
  if ! codesign --verify --deep --strict "$APP" >/dev/null 2>&1; then
    step "Ad-hoc signing the bundle"
    codesign --force --deep --sign - "$APP"
  fi
  codesign --verify --deep --strict "$APP" || die "the bundle is not validly signed"
fi

# --- 5. check the thing that was built --------------------------------------
# Launch the bundle itself with every off-bundle request cancelled: it has to
# start, report ready and draw a board without asking the network for anything.
# This is what catches a file left out of the bundle, a broken signature, or an
# asset that only resolved because the dev server was serving it.
if [ -n "$APP" ] && [ "$VERIFY" = 1 ]; then
  step "Verifying the bundle runs offline"
  SHOT="$ROOT/build/desktop/verify.png"
  "$APP/Contents/MacOS/Hypersweeper" \
    "--smoke=$SHOT" "--route=?mode=hexhex&difficulty=easy&seed=7"
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
find build/desktop -maxdepth 1 \( -name '*.dmg' -o -name '*.zip' \) -print 2>/dev/null || true
