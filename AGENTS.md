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

## Build and run

`make help` lists every target. CI runs `make test`, `make lint`, the
`data-sync` exporters and the `web` job (typecheck, unit tests, build, e2e).

**The TypeScript app — the deployed game, and what most changes touch.**

```sh
cd web
npm install                            # first time, and after a dependency change
npm run dev                            # dev server at http://localhost:5173
npm run typecheck                      # tsc --noEmit (strict), app then functions/
npm run test                           # vitest unit tests
npm run build                          # typecheck + production bundle into web/dist
npm run preview                        # serve that bundle at http://localhost:4173
npm run e2e                            # Playwright e2e + visual regression
```

`npm run dev` is the one to reach for while iterating; `build` + `preview` is
what the screenshot and e2e recipes drive, because it serves the real bundle
from disk. To *look at* a change without a browser of your own, see
[`web/docs/testing.md`](web/docs/testing.md).

**The pygame game — the reference implementation.**

```sh
make venv                              # (re)create .venv — Python 3.13, per .python-version
make test                              # pytest, sub-second
make lint                              # ruff (E/F/W/I; long geometry/table lines allowed)
make run                               # the game (menu)
.venv/bin/python -m minesweeper --mode hexhex   # …or skip the menu
make web-run                           # the pygbag browser build, http://localhost:8000
```

The venv already has everything; `make install` refreshes it in place without
recreating it. Dependency groups in `pyproject.toml`: `web` (pygbag), `test`
(pytest, ruff), `all` (both); locked to `requirements[-web|-test|-all].txt` by
`make lock` (uv).

**The packaged builds**, both wrapping the same `web/` bundle:

```sh
make desktop-run                       # the Electron shell, on any OS
make mac-app                           # a signed Hypersweeper.app  (macOS only)
make ios-app                           # build and open the iPhone project in Xcode (macOS)
```

See [`desktop/README.md`](desktop/README.md) and
[`ios/README.md`](ios/README.md). `make clean` removes every build artifact.

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
  `make web-screenshots`, and the one pygame shot under
  `docs/screenshots/pygame/` from `make screenshots`).
