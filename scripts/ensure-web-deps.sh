#!/usr/bin/env bash
# Make web/node_modules match web/package-lock.json, installing only when it
# does not.
#
# "Is node_modules there?" is not the question — it is there on any machine that
# has ever built this app, including one that last did so before a dependency
# was added, and a build on that tree fails deep inside tsc with a module it
# cannot resolve. npm records the tree it installed in
# node_modules/.package-lock.json, so the honest test is whether the real lock
# file is newer than that record. It catches every dependency change (an added
# package, a bump, a pull that moved the lock) and costs one stat when nothing
# has changed.
#
#   scripts/ensure-web-deps.sh
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
LOCK="$ROOT/web/package-lock.json"
INSTALLED="$ROOT/web/node_modules/.package-lock.json"

if [ -f "$INSTALLED" ] && [ ! "$LOCK" -nt "$INSTALLED" ]; then
  exit 0
fi

if [ -d "$ROOT/web/node_modules" ]; then
  printf '\n\033[1m==> Dependencies changed since the last install — npm ci\033[0m\n'
else
  printf '\n\033[1m==> Installing web dependencies — npm ci\033[0m\n'
fi

# `ci` rather than `install`: it installs exactly the locked tree and never
# rewrites the lock file, which is what a build script wants.
(cd "$ROOT/web" && npm ci)
