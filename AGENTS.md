# Hypersweeper — agent guide

A minesweeper clone with flat and 3D boards (spherical polyhedra, cube,
tetrahedron, donut, Möbius strip, cylinder, Klein bottle), in two
implementations that share their configuration.

This file is the map. It is written for AI agents first: every extension point
is a single, named place, and the test suite tells you the moment something is
inconsistent. Read the one topic file your change touches — a UI change does not
need the board geometry, and a new tiling does not need the renderer.

## Which version to change

Two front-ends live in this repo: the Python/pygame game and the
TypeScript/Three.js app in `web/`. **When a request does not say which one
it means, it means the TypeScript app** — change `web/` (and the shared
`data/*.json` when the change belongs there). Touch the Python game only
when the request names it, or when a shared-`data/` edit necessarily
carries over.

## Where to read next

| Working on | Read |
|---|---|
| Anything in the TypeScript app (the deployed game) | [`web/AGENTS.md`](web/AGENTS.md) — itself a router into `web/docs/` |
| The board model, what ships, and why it is shaped that way | [`docs/agents/geometry.md`](docs/agents/geometry.md) |
| Adding a tiling, a surface, a solid or a fractal board | [`docs/agents/board-recipes.md`](docs/agents/board-recipes.md) |
| Picking a board's size and mine count | [`docs/agents/difficulty.md`](docs/agents/difficulty.md) |
| The `data/*.json` both front-ends read, and the conformance oracle | [`docs/agents/shared-data.md`](docs/agents/shared-data.md) |
| The pygame front-end, and the pygbag web build | [`docs/agents/pygame.md`](docs/agents/pygame.md) |
| The offline macOS app | [`desktop/README.md`](desktop/README.md) |
| The iPhone app, and haptics | [`ios/README.md`](ios/README.md) |

## Commands

The Makefile wraps the common ones (`make help`); CI runs `make test` and
`make lint`.

```sh
make venv                              # (re)create .venv — Python 3.13, per .python-version
make test                              # pytest, sub-second
make lint                              # ruff (E/F/W/I; long geometry/table lines allowed)
.venv/bin/python -m minesweeper        # the pygame game (menu)

cd web
npm install
npm run dev                            # Vite dev server
npm run typecheck                      # tsc --noEmit (strict), app then functions/
npm run test                           # vitest unit tests
npm run build                          # typecheck + production bundle
npm run e2e                            # Playwright e2e + visual regression
```

The venv already has everything. Dependency groups in `pyproject.toml`: `web`
(pygbag), `test` (pytest, ruff), `all` (both); locked to
`requirements[-web|-test|-all].txt` by `make lock` (uv).

## Rules that apply to every change

- **`data/*.json` is generated, not authored.** `scripts/export_data.py` and
  `scripts/export_conformance.py` regenerate it from the Python side, and CI's
  `data-sync` job re-runs them and fails on any diff. Re-run the exporters
  rather than hand-editing. See
  [`docs/agents/shared-data.md`](docs/agents/shared-data.md).
- **Never invent a board's size or mine count.** Both are measured by
  `scripts/difficulty/`. A flat density is the one thing this game cannot get
  right by eye. See [`docs/agents/difficulty.md`](docs/agents/difficulty.md).
- **Never introduce a vertex id that relies on rounding** two
  nearby-but-distinct points to the same key — shared-vertex adjacency is exact.
- **Verify anything visual by looking at a real screenshot**, not just by the
  test suite passing. Headless recipes: `web/docs/testing.md` for the
  TypeScript app, `docs/agents/pygame.md` for the pygame one.
- Do not commit PR screenshots to `docs/screenshots/` (that folder holds only
  the curated README shots: the gallery, rendered from the TypeScript app by
  `cd web && npm run screenshots`, and the one pygame shot under
  `docs/screenshots/pygame/` from `make screenshots`).
