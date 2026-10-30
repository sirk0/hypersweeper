# Tiling Simulator (`tiling/`)

The second game in this repo. The player gets a bounded flat region and a tray
of tiles and must cover the region exactly, dragging tiles in; a dropped tile
sticks to a corner of what is still uncovered — never part-way along a
straight edge — and a dot marks each corner it would stick to. Tap a placed
tile to select it; Delete (the button, or the key) removes it, and a lifted
tile dropped where it cannot land goes back where it was. The ladder it is built for
is every flat board Hypersweeper has: squares, triangles, hexagons, the uniform
and 2-uniform tilings, then spirals and aperiodic ones, with vertex rules
("every point is 3.3.4.3.4") on the later levels.

**Status: one level (Squares, 4×4), local only.** No CI job, no deploy, no
packaging — `ci.yml` and the Pages deploy do not look at this folder.

## Build and run

```sh
cd tiling
npm install          # first time, and after a dependency change
npm run dev          # http://localhost:5174 (Hypersweeper's dev server is 5173)
npm run typecheck    # tsc --noEmit, strict — also checks the web/src/boards files it imports
npm run test         # vitest unit tests (well under a second)
```

or from the root: `make tiling-install`, `make tiling-run`, `make tiling-test`.
`?level=<key>` opens a level directly. In dev builds `window.__tiling.fill()`
completes the board greedily — the quick way to see the win state.

## Layout

- `src/geometry/cyclotomic.ts` — **exact coordinates.** A point is an element
  of ℤ[ζn] (any n; Φn computed at runtime), stored as φ(n) integers. That
  covers every edge-to-edge board Hypersweeper builds — ℤ[ζ4] squares, ℤ[ζ12]
  triangles/hexagons/most uniform tilings/spectre, ℤ[ζ8] 4.8.8 and
  Ammann–Beenker, ℤ[ζ5]/ℤ[ζ10] Penrose, ℤ[ζ7] Klaassen, ℤ[ζ24] mixes — and
  the exact predicates (`orient`, `sameDirection`, `strictlyBetween`,
  `properlyCross`) decide zero exactly and only read a float's sign.
- `src/geometry/shape.ts` — `Shape` (any simple polygon, CCW, y up — concave
  allowed), `Pose` (rotate by ζᵏ, optional mirror, translate), `regular`,
  `walk` (a region outline as unit steps), and the float measures used for
  drawing and nearest-snap.
- `src/geometry/frontier.ts` — **the frontier**: the uncovered area's boundary
  as directed edges, uncovered side on the left. Covering a tile adds its
  edges reversed and cancels a→b against b→a, after splitting both at each
  other's vertices (so T-junctions work). `fits` is the overlap test,
  `corners` the frontier vertices where it turns, `placements` the snap
  candidates (a tile vertex on a corner, an edge laid along a frontier edge),
  `nearest` the one the drag shows. Won ⇔ empty.
- `src/levels.ts` — the levels: ring, region loops, tray tile kinds, mirror.
- `src/puzzle.ts` — pure game state: `place`, `lift`, `snap`, `won`, `needed`.
- `src/view/svgBoard.ts` — the SVG drawing (board units, y up, one flip).
- `src/input/drag.ts` — pointer drag and drop, and tap to select.

`@boards/*` is `../web/src/boards/*` and `@data/*` is `../data/*`, set in
`vite.config.ts` (and through it `vitest.config.ts`) and `tsconfig.json`.

## Rules

- **Identity is exact.** Never key, compare or merge points by rounded floats
  (the repo rule in the root `AGENTS.md`). Floats are for drawing, for bounding
  boxes, for ordering points already known to be on one segment, and for the
  sign of a value already known to be non-zero.
- **A level follows a Hypersweeper board.** Write its outline exactly and add
  a test that ties it to the Hypersweeper builder it mirrors (as
  `tests/unit/puzzle.test.ts` does for `squareBoard`). Planned: builders
  publish their exact coordinates, so a level can be read off a `Board`.
- **Colours come from `var(--…)`** in `src/styles.css`, with the
  `prefers-color-scheme: dark` block kept in step.
- Importing from `web/src/boards/` is fine; importing from the rest of `web/`
  (renderer, UI, game rules) is not — that is Hypersweeper's own.
- Verify visual changes with a real screenshot (the `tiling` entry in
  `.claude/launch.json` starts the dev server).
