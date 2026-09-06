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

Run the checks relevant to a change before handing it back:

```sh
make test
make lint
cd web && npm run typecheck && npm run test && npm run build
make web-e2e-docker
```

The Docker command is the authoritative full Playwright run: it includes the
Linux visual baselines that macOS skips. It requires Docker Desktop with Compose
v2 and may take longer on Apple Silicon because the image is `linux/amd64`.

## Shared-worktree hygiene

Codex and Claude Code can work in the same checkout. Treat uncommitted changes
and tool-owned directories as belonging to the other tool unless the current
task clearly owns them. Do not edit `.claude/` when making Codex-only changes,
and do not add Codex session state to commits. Add new cross-agent project
guidance to `AGENTS.md`, not this file or `CLAUDE.md`.
