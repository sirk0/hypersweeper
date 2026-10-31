# Hypersweeper — agent guide

A minesweeper clone with flat, hyperbolic and 3D boards (spherical polyhedra,
cube, tetrahedron, donut, trefoil knot, double donut, Möbius strip, cylinder,
Klein bottle, projective plane), in two implementations that share their
configuration — and, beside it, a second game built on the same geometry:
**Rep-tiles** (`reptiles/`), where you cover a region with tiles by drag
and drop.

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

A request about **Rep-tiles** (tiles, levels, drag-and-drop tiling) means
`reptiles/` — see [`reptiles/AGENTS.md`](reptiles/AGENTS.md). It reads
Hypersweeper's geometry from `web/src/boards/` in place, so a change there can
reach both games. It deploys to its own Cloudflare Pages project,
<https://rep-tiles.pages.dev> (`.github/workflows/deploy-reptiles.yml`); no CI
job covers it yet.

## Where to read next

| Working on | Read |
|---|---|
| Anything in the TypeScript app (the deployed game) | [`web/AGENTS.md`](web/AGENTS.md) — itself a router into `web/docs/` |
| Rep-tiles, the tiling game (`reptiles/`) | [`reptiles/AGENTS.md`](reptiles/AGENTS.md) |
| The board model, what ships, and why it is shaped that way | [`docs/agents/geometry.md`](docs/agents/geometry.md) |
| Adding a tiling, a surface, a solid or a fractal board | [`docs/agents/board-recipes.md`](docs/agents/board-recipes.md) |
| Picking a board's size and mine count | [`docs/agents/difficulty.md`](docs/agents/difficulty.md) |
| The `data/*.json` both front-ends read, and the conformance oracle | [`docs/agents/shared-data.md`](docs/agents/shared-data.md) |
| What the deployed game reports, the dataset schema, and the dashboards | [`docs/agents/metrics.md`](docs/agents/metrics.md), then [`grafana/`](grafana) for the dashboards themselves |
| Grafana showing *No data*, or a panel answering `400` | [`grafana/README.md`](grafana/README.md) — the read-only token expires, and that is almost always it |
| The pygame front-end, and the pygbag web build | [`docs/agents/pygame.md`](docs/agents/pygame.md) |
| The offline macOS app | [`desktop/README.md`](desktop/README.md) |
| The iPhone app, and haptics | [`ios/README.md`](ios/README.md) |
| The App Clip (one board, from the App Store) | "The App Clip" in [`ios/README.md`](ios/README.md), and in [`web/docs/ui.md`](web/docs/ui.md) |
| The iMessage sticker pack (the boards as stickers) | "The sticker pack" in [`ios/README.md`](ios/README.md); rendered by `web/scripts/make-stickers.mts` |
| Best times and achievements synced through iCloud | "iCloud" in [`ios/README.md`](ios/README.md), and "The record in iCloud" in [`web/docs/ui.md`](web/docs/ui.md) |
| The Game Center achievement list and its images (`ios/GameCenter/`) | "Game Center" in [`ios/README.md`](ios/README.md); written by `web/scripts/make-gamecenter.mts` |
| Uploading to App Store Connect / TestFlight (`app-store.yml`, run by hand) | "Releasing" in [`ios/README.md`](ios/README.md) |
| The public privacy policy (`/privacy`) | "The privacy policy" in [`web/docs/deploy.md`](web/docs/deploy.md) |

## Build and run

`make help` lists every target. CI runs `make test`, `make lint`, the
`data-sync` exporters, `web-checks` (typecheck, Prettier, unit tests, the packaged-bundle
and iOS-sync guards) and `web-e2e`, which shards the Playwright suite across
four runners. The two web jobs are independent and run at the same time. That is the full
run; locally, run only what a change touches — see "Verifying a change" below.
No CI job builds the native app: `app-store.yml`, started by hand from
`master`, archives it and uploads it to App Store Connect.

**The TypeScript app — the deployed game, and what most changes touch.**

```sh
cd web
npm install                            # first time, and after a dependency change
npm run dev                            # dev server at http://localhost:5173
npm run typecheck                      # tsc --noEmit (strict), app then functions/
npm run format                         # Prettier, in place (format:check is what CI runs)
npm run test                           # vitest unit tests
npm run build                          # typecheck + production bundle into web/dist
npm run preview                        # serve that bundle at http://localhost:4173
npm run e2e                            # Playwright e2e + visual regression
npm run e2e:docker                     # …the whole suite on Linux, in a container
```

`npm run dev` is the one to reach for while iterating; `build` + `preview` is
what the screenshot and e2e recipes drive, because it serves the real bundle
from disk. The visual baselines are Linux pixels, so `gallery.spec.ts` skips
itself elsewhere and `e2e:docker` (or `make web-e2e-docker`) is how the gallery
runs off Linux. To *look at* a change without a browser of your own, see
[`web/docs/testing.md`](web/docs/testing.md).

**The pygame game — the reference implementation.**

```sh
make venv                              # (re)create .venv — Python 3.13, per .python-version
make test                              # pytest, the whole suite (minutes)
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

## Verifying a change

**Run only what your change touches, locally, in about four minutes; CI runs
everything.** The full suite no longer fits an agent's loop — `make test` alone
is over three minutes, `vitest run` a minute and a half, and the Playwright
suite is long enough that CI shards it across four runners — and CI already
runs all of it on every push. So pick the impacted checks, stay inside the
budget, and leave the full run to CI:

| Change touches | Run locally |
|---|---|
| Docs, comments, `README`s only | nothing (check any link you added resolves) |
| `web/**` | `npm run format` — Prettier, the config is `web/.prettierrc.json`; Claude sessions format each edit through a hook |
| `web/src/**`, `web/functions/**` | `npm run typecheck` (seconds — always), then `npx vitest related --run <changed files>` (the unit tests that import them) |
| UI, rendering, input behaviour | the e2e spec(s) that cover it — `npx playwright test hud.spec.ts`, narrowed with `-g "<title>"`. The topic docs name the spec that pins each behaviour |
| A visual baseline | only that slice — `npx playwright test gallery.spec.ts -g <board>` — then run it once more to confirm determinism |
| Python (`minesweeper/`, `scripts/`) | `make lint`, and the matching test file — `.venv/bin/pytest tests/test_game.py`, or `-k <name>` |
| Anything the `data/*.json` exporters read | the exporters, then `git diff --exit-code data/` — exactly what CI's `data-sync` checks |

If the impacted set will not fit the four minutes, run the part most likely to
break and say what you left to CI. Never widen a local run to "the whole suite
to be safe" — that is what CI is for.

**When the work is ready** — not after every edit — commit, push the branch and
open a pull request. CI's jobs (pytest, ruff, `data-sync`, `web-checks`, the
four e2e shards) are the authoritative full run; a red one is yours to fix on
the same branch, and the change is done when CI is green.

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
