@AGENTS.md

# Codex-specific notes

`AGENTS.md` and the topic guides it links to are the shared source of truth for
both Codex and Claude. Keep general project guidance there; put only
Codex-specific workflow notes in this file.

## First-use setup

Run this once per fresh Codex checkout (and again after dependency-lock changes):

```sh
scripts/setup-codex.sh
```

It uses `uv` to create the required Python 3.13 virtual environment and install
the locked Python dependencies, then runs `npm ci` in `web/` from the committed
lockfile. The script keeps uv's cache and managed Python under `/tmp` by
default, which works in Codex's sandboxed worktrees. Set `UV_CACHE_DIR` and
`UV_PYTHON_INSTALL_DIR` to reuse different writable locations.

## Verification

Follow "Verifying a change" in [`AGENTS.md`](AGENTS.md): run only the checks
your change touches, within about four minutes, and leave the full suite to CI,
which runs all of it — the visual baselines included — on every push.

`make web-e2e-docker` is still how a Mac runs the gallery slice a change
touches, and the only way to regenerate its Linux baselines there. Give it a
spec and a `-g` filter (`make web-e2e-docker ARGS="gallery.spec.ts -g sphere"`)
rather than the whole suite. It requires Docker Desktop with Compose v2 and is
slower on Apple Silicon because the image is `linux/amd64`.

## Shared-worktree hygiene

Codex and Claude Code can work in the same checkout. Treat uncommitted changes
and tool-owned directories as belonging to the other tool unless the current
task clearly owns them. Do not edit `.claude/` when making Codex-only changes,
and do not add Codex session state to commits. Add new cross-agent project
guidance to `AGENTS.md`, not this file or `CLAUDE.md`.
