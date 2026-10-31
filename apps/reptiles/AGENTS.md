# Rep-tiles (`apps/reptiles/`)

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
- Where a board uses a tile both ways round (the kisrhombille's triangles),
  a flip control (or F) mirrors every tray tile and the one in hand; a tile
  lands only on its own side.
- Taking tiles off: drag a placed tile back over the tray (it turns red on
  the way), or turn on ✕ remove, the control beside rotate (or X), and tap
  tiles — Escape, the control again, or picking up a tray tile ends that mode.
  A lifted tile dropped anywhere else it cannot land goes back where it was.
- **Piles and stars.** Each pile shows how many of that tile the board was cut
  from still to go (past zero, how many extra). Finishing at all is one star;
  with no more tiles than that, two; and within the level's time limit
  (`seconds`, five a tile), three. The clock starts with the first tile down.
  The best per level is kept in `localStorage` and shown in the level list.

**Screens.** Home (no query): Easy, Medium and Hard each deal a random level
of that difficulty, Catalog opens the catalog (`?catalog`): each family a
row of level cards scrolling sideways — board outline, tiles, name,
difficulty as Hypersweeper's three bars, stars. A level is `?level=<key>`,
with ‹ Home in its header and the level list on its right. Each move is a
history entry, so the browser's Back works.

**Difficulty** is measured, not assigned (`src/difficulty.ts`): a simulated
player lays the board the level was cut from, always taking a tile it can
snap down now that needs the fewest rotate/flip presses from how the tray is
held, so it groups tiles by orientation as a person would. The score is its
presses per tile, each weighted √(90°/step) — a 15° press counts 2.4, a 90°
one 1 — plus flips, plus 0.15 per extra tile kind and tiles/200. Bands split
at 0.45 and 1.0 (`MEDIUM`, `HARD`), set so that every flag-transitive level,
4.8² and 3³.4² are easy and the Cairo pentagonal and V4.6.12 hard; the tests
pin those anchors. Measuring all levels takes a second, so `npm run
difficulty` writes `src/difficulty.json` and the game reads that; a test
fails while it is out of step.

The ladder it is built for is every flat board Hypersweeper has: squares,
triangles, hexagons, the uniform and 2-uniform tilings, then spirals and
aperiodic ones. A level can also hold every vertex to a configuration
(`Level.rule`, "every point is 3.3.4.3.4") — built and tested, unused so far.

**Status: 39 levels in four sections, not deployed yet** — named for their
symmetry: *Flag-transitive* (the regular 4⁴, 3⁶, 6³), *Vertex-transitive*
(the other eight uniform tilings, 3.6.3.6 to 4.6.12), *2-isogonal* (all
twenty 2-uniform tilings, named as Hypersweeper's catalog writes them,
[3⁶; 3⁴.6]₁) and *Face-transitive* (the eight Laves tilings, V4.8² to
V4.6.12). Each board is as near square as its tiling allows at two or three
dozen tiles. CI's `reptiles-checks` job typechecks, formats, tests and builds
it on every change; there is no deploy and no packaging yet — the Pages deploy
does not look at this folder.

## Build and run

```sh
npm install          # at the repo root, first time and after a dependency change
cd apps/reptiles
npm run dev          # http://localhost:5174 (Hypersweeper's dev server is 5173)
npm run typecheck    # tsc --noEmit, strict — also checks the packages/geometry files it imports
npm run test         # vitest unit tests (a few seconds)
npm run format       # Prettier (the root .prettierrc.json), in place; CI runs format:check
npm run difficulty   # re-measure every level into src/difficulty.json
```

or from the root: `make reptiles-install`, `make reptiles-run`, `make reptiles-test`.
`?level=<key>` opens a level directly. In dev builds `window.__reptiles.fill()`
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
- `src/geometry/fromTemplate.ts` — a `box`-edge square window of one of
  Hypersweeper's periodic tilings in exact coordinates: the tiles
  `archimedeanBoard` keeps, with vertex identity taken from the template's own
  references and each unit edge's direction read off its float vector (to
  1e-4: templates round positions to six decimals). The ring is the first of
  ℤ[ζ4], ζ6, ζ8, ζ12, ζ24 that holds every edge. A tiling with no edge along an
  axis (the snub hexagonal, drawn 19° off) is turned until one is, and its
  square cut in the turned frame — the tray's tiles rest flat, so the board's
  must too; `turned` records it.
- `src/geometry/laves.ts` — a Laves tiling as the exact dual of a uniform
  patch: a tile on every whole vertex, its corners the face centres round it.
  Centres are exact once scaled by the face sizes' lcm, so the board is built
  at that scale in a ring whose `unit` draws it back at true size.
- `src/geometry/vertexRule.ts` — the vertex rule: whether the corners round a
  point can still be completed to a vertex configuration. Applied only where a
  level sets `rule`.
- `src/levels.ts` — the levels, and `GROUPS`, the sections they are listed
  in. `windowLevel` makes a level from a tiling key and a box size (uniform or
  2-uniform, by the tiling's family); the 2-uniform boxes are in
  `TWO_UNIFORM`, the windows that also have both kinds of vertex inside.
  `makeLevel` reads everything off a level's
  cells: the tray (one tile per kind — cells alike up to a turn, or a turn and
  a mirror — resting flat on its longest side, `restFlat`), whether a kind is
  used both ways round (`mirror`, which brings a flip control), each
  kind's rotate step from flat (`turns`) and pile (`need`), the time limit
  (`seconds`), the region, and keeps the cells
  themselves as one known solution; `turn` is the one rotate step for them all
  (the gcd of the kinds' steps). Every level carries its vertex
  configurations (`configs`, one or two — not enforced) and its `name`: the
  `notation` of the one, or the catalog's `[A; B]ᵢ` for two, read back by
  `parseNotation`. Each
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
  depends on how the board is finished), `used`, `stars`, and `solve`, a
  budgeted backtracking fill for the tests and the dev seam that always works
  the open corner with the fewest placements.
- `src/view/svgBoard.ts` — the SVG drawing (board units, y up, one flip).
- `src/view/home.ts`, `src/view/catalog.ts` — the first screen and the
  catalog; `src/view/icons.ts` the pictures they and the level list share
  (board outline, tray tile, the three bars, a star row).
- `src/view/levelList.ts` — the level list on the right. It shows only what
  a player starts with: the board's outline, the tray's tiles, the vertex
  configuration as the name (`notation`: 4⁴, 3.4.6.4), and the best stars —
  never a picture of the tiling, which would give the puzzle away. The
  descriptive label is only a tooltip.
- `src/input/drag.ts` — pointer drag and drop, rotate and flip, and the ✕
  remove mode.

The geometry is the `@tiling/geometry` workspace package (`packages/geometry`)
and the shared data the `@tiling/data` one (`data/`) — both listed in
`package.json`, so no alias sets them up.

## Rules

- **Identity is exact.** Never key, compare or merge points by rounded floats
  (the repo rule in the root `AGENTS.md`). Floats are for drawing, for bounding
  boxes, for ordering points already known to be on one segment, and for the
  sign of a value already known to be non-zero.
- **A level follows a Hypersweeper board.** Build its cells exactly — for a
  periodic tiling, `uniformLevel` with the template key and a box size found by
  scanning (square, one outline, a couple of dozen tiles) — and the tests check
  it tile for tile against the Hypersweeper board (`archimedeanBoard` for a
  window, else the builder in `BUILDERS` in `tests/unit/puzzle.test.ts`), and
  check every inner point carries the level's vertex configuration. Planned: builders
  publish their exact coordinates, so a level can be read off a `Board`.
- **Colours come from `var(--…)`** in `src/styles.css`, with the
  `prefers-color-scheme: dark` block kept in step. A tile is coloured by its
  side count (`.sides-3`, `.sides-4`, …), on Hypersweeper's shape hues.
- Import the geometry as `@tiling/geometry` (its index) and nothing from
  `apps/hypersweeper/` (renderer, UI, game rules) — that is Hypersweeper's own.
  A name the geometry has but does not export gets a line in
  `packages/geometry/src/index.ts`. `packages/geometry/tests/boundaries.test.ts`
  fails on a deep import or one game importing another.
- Verify visual changes with a real screenshot (the `reptiles` entry in
  `.claude/launch.json` starts the dev server).
