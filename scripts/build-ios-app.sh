#!/usr/bin/env bash
# Build the iPhone app — the TypeScript game inside a Capacitor WKWebView, so
# it installs on a phone, plays with no internet connection, and buzzes through
# the Taptic Engine (which no web API on iOS can reach).
#
# The pieces: web/ builds to static files, `npx cap sync ios` copies them into
# ios/App/App/public and refreshes the CocoaPods the native project links
# against, and Xcode signs and installs the result on the phone. Every asset the
# game needs — fonts, icons, the shared data/*.json, Three.js — is compiled into
# that bundle, and scripts/check-offline-assets.mjs refuses to let the build
# past if anything in it still points at a URL.
#
#   scripts/build-ios-app.sh [--open] [--run] [--skip-web] [--prepare-only]
#
# Default: build, sync, and open the project in Xcode (--open), where ⌘R
# installs it on a connected iPhone. The first run needs a signing team picked
# once under Signing & Capabilities; see ios/README.md.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

OPEN=1
RUN=0
SKIP_WEB=0

while [ $# -gt 0 ]; do
  case "$1" in
    --open) OPEN=1 ;;
    --run) RUN=1; OPEN=0 ;;      # build straight onto a connected device
    --skip-web) SKIP_WEB=1 ;;    # reuse the existing web/dist
    --prepare-only) OPEN=0 ;;    # stop after the sync (what CI can check)
    # The header comment above, up to the first line that is not one.
    -h|--help) awk 'NR>1 { if (!/^#/) exit; sub(/^# ?/, ""); print }' "${BASH_SOURCE[0]}"; exit 0 ;;
    *) echo "unknown option: $1" >&2; exit 2 ;;
  esac
  shift
done

step() { printf '\n\033[1m==> %s\033[0m\n' "$1"; }
die() { printf '\033[31merror:\033[0m %s\n' "$1" >&2; exit 1; }
note() { printf '\033[33mnote:\033[0m %s\n' "$1" >&2; }

# --- preflight ---------------------------------------------------------------
command -v node >/dev/null || die "node is required (22 or newer); see https://nodejs.org"
command -v npm >/dev/null || die "npm is required (it ships with node)"

# Everything up to the pod install works anywhere — that is what lets CI check
# the bundle. Only Xcode and CocoaPods are macOS-only, so the check is here
# rather than at the top: a Linux run still produces a synced project.
MAC=1
[ "$(uname -s)" = "Darwin" ] || MAC=0

if [ "$MAC" = 0 ] && { [ "$OPEN" = 1 ] || [ "$RUN" = 1 ]; }; then
  die "an iOS app can only be built and signed on macOS — Xcode runs nowhere
       else. Run this on a Mac with Xcode installed (App Store, free).
       To check the web bundle and the project layout on this machine anyway:
       make ios-prepare"
fi

# --- 1. the game -------------------------------------------------------------
if [ "$SKIP_WEB" = 0 ]; then
  scripts/ensure-web-deps.sh
  step "Building the web app (VITE_PACKAGED=1)"
  # VITE_PACKAGED drops the service worker and the update check: inside a
  # bundle there is no deployed build to update from. See web/vite.config.ts.
  (cd web && VITE_PACKAGED=1 npm run build)
fi
[ -f web/dist/index.html ] || die "web/dist is empty — build the web app first"

step "Checking the bundle needs no network"
node scripts/check-offline-assets.mjs web/dist

# --- 2. into the native project ----------------------------------------------
# `cap sync` = copy (web assets -> ios/App/App/public, config -> the project)
# plus update (the plugin list and, on a Mac, `pod install`). It is the one
# command that has to run after *either* half changes.
step "Syncing the bundle into ios/App"
if [ "$MAC" = 1 ] && ! command -v pod >/dev/null; then
  die "CocoaPods is required to link the native plugins (Capacitor's own pod
       and @capacitor/haptics). Install it with:  brew install cocoapods
       (or: sudo gem install cocoapods)"
fi
(cd web && npx cap sync ios)

[ -f ios/App/App/public/index.html ] || die "the sync copied no web assets"

if [ "$MAC" = 0 ]; then
  note "not macOS — the project is synced but no pods were installed and
      nothing was built. Finish on a Mac with: make ios-app"
fi

# --- 3. Xcode ----------------------------------------------------------------
if [ "$RUN" = 1 ]; then
  step "Building onto a connected device"
  # `cap run ios` lists the attached devices and simulators and builds onto the
  # one picked. It needs the signing team to have been set once in Xcode.
  (cd web && npx cap run ios)
  exit 0
fi

if [ "$OPEN" = 1 ]; then
  step "Opening the project in Xcode"
  (cd web && npx cap open ios)
  cat <<'EOF'

Xcode is opening ios/App/App.xcworkspace. To put the game on your iPhone:

  1. Plug the phone in and pick it in the device menu (next to the ▶ button).
  2. Once, under the App target -> Signing & Capabilities: tick "Automatically
     manage signing" and pick your Team. A free Apple ID works — add it under
     Xcode -> Settings -> Accounts. If the bundle identifier is taken, change
     it to something of your own there.
  3. Press ⌘R.
  4. On the phone, first launch only: Settings -> General -> VPN & Device
     Management -> trust your developer certificate.

A free account's app stops launching after 7 days — re-run ⌘R to renew it.
A paid Apple Developer account lasts a year. See ios/README.md.
EOF
fi
