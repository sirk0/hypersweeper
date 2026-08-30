#!/bin/bash
# SessionStart hook: provision a virtualenv with the test/lint dependencies
# so `make test` and `make lint` work in Claude Code on the web sessions.
set -euo pipefail

# Only run in remote (Claude Code on the web) sessions; local dev keeps
# using `make venv`.
if [ "${CLAUDE_CODE_REMOTE:-}" != "true" ]; then
  exit 0
fi

cd "${CLAUDE_PROJECT_DIR:-$(dirname "$0")/../..}"

VENV=.venv

# Create the virtualenv if it isn't there yet. The project targets Python
# 3.13 (.python-version), which cloud images already ship, so no interpreter
# download is needed.
if [ ! -x "$VENV/bin/python" ]; then
  uv venv --python 3.13 "$VENV"
fi

# Install the test + lint dependencies (pytest, ruff, pygame-ce) from the
# locked file. These resolve from PyPI, which is reachable.
VIRTUAL_ENV="$VENV" uv pip install -r requirements-test.txt

# Install the TypeScript app's dependencies so `npm run test`/`typecheck`/
# `build`/`e2e` work in cloud sessions (npm registry is reachable). Playwright
# is pinned to the version whose bundled Chromium build matches the one
# preinstalled in the image (/opt/pw-browsers/chromium-<build>), so `npm run
# e2e` resolves it automatically; PLAYWRIGHT_CHROMIUM_EXECUTABLE is only a
# fallback if the image ships a different build.
if [ -f web/package-lock.json ] && command -v npm >/dev/null 2>&1; then
  (cd web && npm ci) || echo "session-start: web npm ci failed (non-fatal)" >&2
fi

# That pin is only useful here if the image's preinstalled Chromium really is the
# build it resolves to. Ask Playwright for the executable it would launch and
# check it is there, so a mismatched image is a line at session start rather than
# a red e2e run an hour later reading "Executable doesn't exist" — which names
# neither revision. Non-fatal: everything but the browser still works.
if [ -d web/node_modules/playwright-core ]; then
  (cd web && node -e '
    const fs = require("fs");
    const exe = require("playwright-core").chromium.executablePath();
    if (fs.existsSync(exe)) process.exit(0);
    const root = process.env.PLAYWRIGHT_BROWSERS_PATH || "the default browser path";
    console.error(
      `session-start: @playwright/test wants ${exe}, which is not installed. ` +
        `${root} has: ${(fs.existsSync(root) ? fs.readdirSync(root) : []).join(" ") || "nothing"}` +
        ` — see "Cloud sessions" in web/docs/testing.md`,
    );
  ') || true
fi

echo "session-start: environment ready ($($VENV/bin/python --version))" >&2
