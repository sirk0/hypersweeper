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
- runs `npm ci` at the repo root (non-fatal if it fails) — one npm workspace
  for every app in `apps/` — so the TypeScript apps'
  toolchain is ready too, and warns (non-fatally) if the image's preinstalled
  Chromium is not the build the Playwright pin resolves to.

`@playwright/test` is **pinned** (not caret-ranged) to the version whose bundled
Chromium build matches the one preinstalled in the cloud image
(`/opt/pw-browsers/chromium-<build>`), so `npm run e2e` resolves the
preinstalled browser and runs directly — no download, no env var. Keep the pin
in step with the image when bumping Playwright. See "Commands" in
[`apps/hypersweeper/docs/testing.md`](apps/hypersweeper/docs/testing.md) for the fallback when an image
ships a different build.

Visual baselines are only authoritative under the pinned Chromium build and its
software-WebGL launch args — CI, a cloud session, or the Linux container in
`apps/hypersweeper/docker-compose.e2e.yml` (`make web-e2e-docker`), which is what a developer
on a Mac uses: those baselines are `-chromium-linux` pixels, so
`tests/e2e/gallery.spec.ts` skips itself on every other platform. Regenerate
them in one of those three, then re-run the spec to confirm determinism.

## Formatting

`.claude/hooks/format.sh`, a `PostToolUse` hook on `Edit`/`Write`, runs
Prettier on every `apps/*/` file Claude changes, so an edit is formatted the
moment it lands and CI's `format:check` step stays green. Code Prettier would
explode — a hand-aligned table of polygon vertices — keeps its layout with a
`// prettier-ignore` line above the statement, as in `apps/hypersweeper/src/boards/tilings.ts`.

## Verifying through CI

Follow "Verifying a change" in [`AGENTS.md`](AGENTS.md): run only the impacted
checks locally, within about four minutes, and never the whole suite. When the
work is ready — not after every edit — push the branch, open the pull request
(this counts as being asked to), and call `subscribe_pr_activity` on it. Then
end the turn: the CI results and review comments arrive as events, and each red
job is yours to fix and re-push until the PR is green. Do not poll and do not
`sleep` waiting for CI.

## Debug launch

`.claude/launch.json` runs the pygame game (`.venv/bin/python -m minesweeper`).
