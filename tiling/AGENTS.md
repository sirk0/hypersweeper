# Tiling Simulator (`tiling/`)

The second game in this repo. The player gets a bounded flat region and a tray
of tiles and must cover the region exactly, dragging tiles in. **Any exact
cover wins** — the board a level was cut from is one way to finish it, not the
only one (six triangles where a hexagon was are fine) — so a player can also
lay tiles into a corner the board cannot be finished from, and has to take
some back off.

- A dropped tile sticks to a corner of what is still uncovered — never
  part-way along a straight edge. While it would stick, a ✓ shows where it
  will land and a dot marks each of its corners that meets the edge (the rim
  or a placed tile), wherever along it.
- Every tray tile starts resting on a flat side. A tile lands only as it is
  held, and there is **one** rotate control, at
  the end of the tray (or R): it turns *every* tray tile, and the one in hand,
  clockwise by the level's step — the largest that reaches, from flat, every
  way any kind sits: 60° for triangles, 30° for the pointy-top hexagons, 30° on
  3.4.6.4, where the squares need it too, so its
  triangles and hexagons pass through turns they fit nowhere at. Turning one
  kind into place can turn another out of it. The control draws its step as an
  axis, a fixed ray, the ray turned one step and the arrow between, and is left
  out where nothing ever needs turning.
- Taking tiles off: drag a placed tile back over the tray (it turns red on
  the way), or turn on ✕ remove, the control beside rotate (or X), and tap
  tiles — Escape, the control again, or picking up a tray tile ends that mode.
  A lifted tile dropped anywhere else it cannot land goes back where it was.
- **Piles and stars.** Each pile shows how many of that tile the board was cut
  from still to go (past zero, how many extra). Finishing at all is one star;
  with no more tiles than that, two; and within the level's time limit
  (`seconds`, five a tile), three. The clock starts with the first tile down.
  The best per level is kept in `localStorage` and shown in the level list.

The ladder it is built for is every flat board Hypersweeper has: squares,
triangles, hexagons, the uniform and 2-uniform tilings, then spirals and
aperiodic ones. A level can also hold every vertex to a configuration
(`Level.rule`, "every point is 3.3.4.3.4") — built and tested, unused so far.

**Status: five levels, local only** — Squares (4×4), Triangles (4 rows of
6), Hexagons (5 rows of 4), and two uniform tilings, Trihexagonal 3.6.3.6 (two
tile kinds) and Rhombitrihexagonal 3.4.6.4 (three), each as near square as
its tiling allows. No CI job, no deploy, no
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
finishes the board — the quick way to see the win state.

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
- `src/geometry/outline.ts` — a patch of cells' boundary loops (shared edges
  cancel exactly): how a level's region is made from its cells.
- `src/geometry/fromTemplate.ts` — a window of one of Hypersweeper's periodic
  tilings in exact coordinates: the tiles `archimedeanBoard` keeps, with vertex
  identity taken from the template's own references and each unit edge's
  direction read off its float vector. How the uniform levels get their cells.
- `src/geometry/vertexRule.ts` — the vertex rule: whether the corners round a
  point can still be completed to a vertex configuration. Applied only where a
  level sets `rule`.
- `src/levels.ts` — the levels. `makeLevel` reads everything off a level's
  cells: the tray (one regular polygon per side count, resting flat), each
  kind's rotate step from flat (`turns`) and pile (`need`), the time limit
  (`seconds`), the region, and keeps the cells
  themselves as one known solution; `turn` is the one rotate step for them all
  (the gcd of the kinds' steps); `uniformLevel` adds the template window and
  the template's window (`window`). Every level carries its vertex
  configuration (`config`) — its name in the game, not enforced. Each
  level's cells are built on the same lattice as the Hypersweeper builder it
  mirrors (`squareBoard`, `triangleGridBoard`, `hexBoard` — Hypersweeper's
  default flat board for each tiling), and its region is their outline.
- `src/progress.ts` — the best stars per level, in `localStorage` (guarded;
  the game works without it; the old finished-levels list reads as one star
  each).
- `src/puzzle.ts` — pure game state: `place`, `lift`, `snap` (in the held
  orientation only — `selfTurns` in `shape.ts` says which turns leave a tile
  unchanged — and, on a level with a rule, only edge to edge and where every
  vertex touched can still become the configuration: `allows`), `canTurn`,
  `won`, `coverage` (a share of the area, not a tile count — the count
  depends on how the board is finished), `used`, `stars`, and `solve`, a budgeted backtracking
  fill, biggest tiles first, for the tests and the dev seam.
- `src/view/svgBoard.ts` — the SVG drawing (board units, y up, one flip).
- `src/view/levelList.ts` — the level list on the right. It shows only what
  a player starts with: the board's outline, the tray's tiles, the vertex
  configuration as the name (`notation`: 4⁴, 3.4.6.4), and the best stars —
  never a picture of the tiling, which would give the puzzle away. The
  descriptive label is only a tooltip.
- `src/input/drag.ts` — pointer drag and drop, and the ✕ remove mode.

`@boards/*` is `../web/src/boards/*` and `@data/*` is `../data/*`, set in
`vite.config.ts` (and through it `vitest.config.ts`) and `tsconfig.json`.

## Rules

- **Identity is exact.** Never key, compare or merge points by rounded floats
  (the repo rule in the root `AGENTS.md`). Floats are for drawing, for bounding
  boxes, for ordering points already known to be on one segment, and for the
  sign of a value already known to be non-zero.
- **A level follows a Hypersweeper board.** Build its cells exactly — for a
  periodic tiling, `uniformLevel` with the template key — and the tests check
  it tile for tile against the Hypersweeper board (`archimedeanBoard` for a
  window, else the builder in `BUILDERS` in `tests/unit/puzzle.test.ts`). Planned: builders
  publish their exact coordinates, so a level can be read off a `Board`.
- **Colours come from `var(--…)`** in `src/styles.css`, with the
  `prefers-color-scheme: dark` block kept in step. A tile is coloured by its
  side count (`.sides-3`, `.sides-4`, …), on Hypersweeper's shape hues.
- Importing from `web/src/boards/` is fine; importing from the rest of `web/`
  (renderer, UI, game rules) is not — that is Hypersweeper's own.
- Verify visual changes with a real screenshot (the `tiling` entry in
  `.claude/launch.json` starts the dev server).
