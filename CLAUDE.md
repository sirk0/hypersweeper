@AGENTS.md

# Claude-specific notes

Everything about this repo — what to change, how to run it, and the topic
guides — is in [`AGENTS.md`](AGENTS.md), imported above, and the files it
routes to. Those are agent-independent. This file holds only what is specific
to running Claude Code here.

## Cloud sessions (Claude Code on the web)

`.claude/hooks/session-start.sh` (registered in `.claude/settings.json`)
provisions the environment at session start, so `make test`, `make lint` and
the TypeScript app's `npm run test`/`typecheck`/`build`/`e2e` all work without
manual setup. It runs only when `CLAUDE_CODE_REMOTE=true`; local development
keeps using `make venv`.

It does three things:

- creates `.venv` with `uv venv --python 3.13` (per `.python-version`) if it is
  not there yet — cloud images already ship 3.13, so no interpreter download;
- installs `requirements-test.txt` (pytest, ruff, pygame-ce) from PyPI, which
  is reachable;
- runs `npm ci` in `web/` (non-fatal if it fails), so the TypeScript app's
  toolchain is ready too, and warns (non-fatally) if the image's preinstalled
  Chromium is not the build the Playwright pin resolves to.

`@playwright/test` is **pinned** (not caret-ranged) to the version whose bundled
Chromium build matches the one preinstalled in the cloud image
(`/opt/pw-browsers/chromium-<build>`), so `npm run e2e` resolves the
preinstalled browser and runs directly — no download, no env var. Keep the pin
in step with the image when bumping Playwright. See "Commands" in
[`web/docs/testing.md`](web/docs/testing.md) for the fallback when an image
ships a different build.

Visual baselines are only authoritative under the pinned Chromium build and its
software-WebGL launch args — CI, a cloud session, or the Linux container in
`web/docker-compose.e2e.yml` (`make web-e2e-docker`), which is what a developer
on a Mac uses: those baselines are `-chromium-linux` pixels, so
`tests/e2e/gallery.spec.ts` skips itself on every other platform. Regenerate
them in one of those three, then re-run the spec to confirm determinism.

## Debug launch

`.claude/launch.json` runs the pygame game (`.venv/bin/python -m minesweeper`).
