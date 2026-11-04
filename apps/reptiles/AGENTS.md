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
  held, and there is **one** rotate step, with a control for each direction at
  the end of the tray (R clockwise; Shift+R or E anticlockwise): it turns
  *every* tray tile, and the one in hand, by the level's step — the largest
  that reaches, from flat, every way any kind sits: 60° for triangles, 30° for
  the pointy-top hexagons, 30° on 3.4.6.4, where the squares need it too, so
  its triangles and hexagons pass through turns they fit nowhere at. Turning
  one kind into place can turn another out of it. Each control draws its step
  as an axis, a fixed ray, the ray turned one step and the arrow between, and
  both are left out where nothing ever needs turning.
- Where a board uses a tile both ways round (the kisrhombille's triangles,
  five of the 2-isohedral levels' tiles),
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
  The best per level is kept in `localStorage` and shown in Tilings and
  Figures.
- **Zoom.** Two fingers pinch the board in, up to four times fitted, about
  their midpoint (a second finger landing mid-drag puts that tile back first;
  one on a control still turns or flips it); one finger on bare board pans it
  once zoomed; a wheel or a trackpad pinch zooms about the pointer. Safari's
  own page pinch is cancelled.
- **The tray** is a strip along the bottom (portrait) or the right
  (landscape), in two rows — columns in landscape: a shelf of tiles at the
  board's own scale (a tray tile is the size it lands at, zoomed in or not, up
  to the strip taking 45% of the screen), then the controls in a row of their
  own at a fixed size. A shelf longer than the strip scrolls, with a scroll bar
  between the two rows: drag its thumb or press its track, drag the strip's
  bare background, or wheel over it. The one four-kind level,
  [3.4.6.4; 4.6.12], is the one to check a tray change on.

**Screens**, in Hypersweeper's Sand look (its `sand`/`sandDark` palettes,
grain, Space Grotesk, and Caprasimo for the title — the two fonts bundled in
`public/fonts`). Home (no query): Easy, Medium and Hard each deal a random
level of that difficulty; Tilings opens the catalog (`?tilings`; old
`?catalog` links still work): each family a row of level cards scrolling
sideways — board outline, tiles, name, difficulty as Hypersweeper's three bars,
stars; Figures (`?figures`) lists the levels by the tiles in their tray — a row
of single figures (the square, the triangle, the hexagon, the Laves tiles, …),
then pairs, then packs of three and four, each card the set's tiles side by
side at their true sizes — and a set (`?figure=<key>`, keyed by its first
level) lists the tilings whose tray is exactly that set, easiest first, under
Easy, Medium and Hard. The gear in home's top-left
corner (Hypersweeper's icon) opens Settings (`?settings`), which shows the
version and checks for updates (the shared check in `@tiling/platform`; left
out of a packaged build). Levels are picked in
Tilings or Figures. A level is `?level=<key>`: one header row, Hypersweeper's —
home, the clock against the three-star limit, restart, and a die that deals
another level of the same difficulty as this one — then the level's name and
coverage as a faint label on the page behind the board, which fills the rest
of the screen, the tray on a strip along the bottom (portrait) or the right
(landscape). The win card has Play again and Next level, and an ✕ in its
corner that closes it to look at the finished board (as do Escape and a tap
outside it). Each move
is a history entry, so the browser's Back works.

**Difficulty** is measured, not assigned (`src/difficulty.ts`): a simulated
player lays the board the level was cut from, always taking a tile it can
snap down now that needs the fewest rotate/flip presses from how the tray is
held (turning whichever way round is shorter), so it groups tiles by
orientation as a person would. The score is its
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

**Status: 94 levels in eleven sections, deployed at <https://rep-tiles.pages.dev/>** — named as
Hypersweeper names its families (`menu.familyLabels` in `data/catalog.json`):
*Regular* (4⁴, 3⁶, 6³), *Uniform* (the other eight uniform tilings, 3.6.3.6 to
4.6.12), *2-uniform* (all twenty, named as Hypersweeper's catalog writes them,
[3⁶; 3⁴.6]₁), *Laves* (the eight Laves tilings, V4.8² to V4.6.12),
*2-isohedral* (the twenty 2-uniform tilings' duals, two kinds of tile each,
named V and the primal's pair, V[3⁶; 3⁴.6]₁), *Pentagonal* (types 10, 13 and
15 — James, Rice, and Mann et al. — one convex pentagon each, named as
Hypersweeper labels them: none is vertex-transitive, so there is no one
configuration to name it by), *Isogonal* (all six of Hypersweeper's — offset
square, staggered triangular, Pythagorean, rotated hexagonal, rotated
triangular, three-scale triangular — regular polygons, every vertex alike but
not edge to edge, one tile's side running through each; named as Hypersweeper
labels them, since two pairs of them share their count of tiles round a
vertex (4.4.4, 3⁴); the rotated hexagonal's windows each leave a lone tile at a
corner, dropped), *Congruent rectangles* (the five
brick bonds — stacked, running, basket weave, 3×3 basket weave, herringbone —
one brick each, named as Hypersweeper labels them: a bond has no vertex
configuration, and but for the stacked bond is not edge to edge),
*Rep-tiles* (twelve of Hypersweeper's thirteen — the sphinx to the
T-tetromino — each a big copy of its one tile to fill with small ones, 16 to
32 of them; the five-triangle is left out, being the pinwheel, whose tiles
turn by no power of ζ), *Spirals* (five of Hypersweeper's six — the
phyllotactic hexagons, Klaassen's heptagon, Klaassen's pentagons at five-,
six- and seven-fold — one tile each, wound round a centre, 24 to 30 of them
kept as Hypersweeper trims its board, a whole number of arms where that is
squarest; the brick rings are left out, a square of bricks laid as easily in
stacked rows) and *Aperiodic* (all four of Hypersweeper's — Penrose's rhombi,
his kites and darts, Ammann–Beenker's squares and rhombi, the Spectre — each
the centred window of its builder's patch, 24 to 33 tiles, the sun or star in
the middle; any cover wins, so the matching rules that keep the other three
aperiodic are not enforced — the Spectre, never flipped, needs none). Each
window board is as near square as its tiling allows at two or three
dozen tiles — but V[3.4.3.12; 3.12²], whose dodecagon centres make it coarse:
20 tiles, its next square window 60; and the 3×3 basket weave, 48, a whole
square of blocks (its smaller windows are a lopsided pinwheel). CI's `game-checks (reptiles)` job typechecks, formats, tests and
builds it on every change, and `game-e2e (reptiles)` runs the Playwright smoke
test against the production bundle (`tests/e2e/smoke.spec.ts`: the screens,
Figures and a figure set's tilings, settings, the header, rotating both ways, wheel and pinch zoom, the tray at
board scale, its two rows and scroll bar, the family names, a won board and
its ✕). It packages as an offline desktop app through the
shared shell — `make desktop-run GAME=reptiles`, `make mac-app GAME=reptiles`
— from `packaging.json` (see `shells/desktop/README.md`); its data lives in
its own `Rep-tiles` folder there. No iPhone app yet (a recipe is in
`apps/hypersweeper/ios/README.md`, "A second game's iPhone app").

## Deploy

Like Hypersweeper, and by the same workflows, one matrix entry each:

- **Production:** `deploy-cloudflare.yml` builds this folder on every push to
  `master` and publishes it to the `rep-tiles` Cloudflare Pages project
  (`wrangler.toml` names it) at <https://rep-tiles.pages.dev/>.
- **Previews:** `pr-preview.yml` publishes each pull request to
  `https://pr-<number>.rep-tiles.pages.dev`, with its own sticky comment, and
  deletes it when the PR closes.
- **What the build adds** — all from the shared preset (`vite.config.ts`, see
  `packages/vite-preset`):
  - the link-preview tags (a text card: there is no `public/og.png`);
  - the PWA: service worker, `manifest.webmanifest`, the icons in `public/`;
  - the version stamp;
  - `public/_headers` — Hypersweeper's security policy, applied at the edge
    and, through the preset, by `vite dev` / `vite preview`.
- **Versions:** `bump-version.yml` bumps this game's patch version (in
  `package.json`) on every push to `master` that changes this folder,
  `packages/` or `data/` (`scripts/bump_version.py`). A version set by hand
  lands as written.
- **Icons:** `npm run icons` redraws them (`scripts/make-icons.mts`): a
  triangle as four half-size copies of itself, in the tile colours — the web
  icons in `public/` and the desktop app's `packaging/icon.png`. Commit what
  it writes.

## Build and run

```sh
npm install          # at the repo root, first time and after a dependency change
cd apps/reptiles
npm run dev          # http://localhost:5174 (Hypersweeper's dev server is 5173)
npm run typecheck    # tsc --noEmit, strict — also checks the packages/geometry files it imports
npm run test         # vitest unit tests (a few seconds)
npm run format       # Prettier (the root .prettierrc.json), in place; CI runs format:check
npm run build        # typecheck + the production bundle (PWA included) into dist/
npm run e2e          # Playwright smoke test: builds, serves with `vite preview`, plays a move
npm run difficulty   # re-measure every level into src/difficulty.json
npm run icons        # redraw public/favicon.svg, the PNG icons and packaging/icon.png
```

or from the root: `make reptiles-install`, `make reptiles-run`, `make reptiles-test`,
`make reptiles-e2e`.
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
  cancel exactly, after each side is cut at every corner lying inside it, for
  the bonds' T-junctions): how a level's region is made from its cells.
- `src/geometry/fromTemplate.ts` — a `box`-edge square window of one of
  Hypersweeper's periodic tilings in exact coordinates: the tiles
  `archimedeanBoard` keeps, with vertex identity taken from the template's own
  references and each unit edge's direction read off its float vector (to
  1e-4: templates round positions to six decimals). The ring is the first of
  ℤ[ζ4], ζ6, ζ8, ζ12, ζ24 that holds every edge. A tiling with no edge along an
  axis (the snub hexagonal, drawn 19° off) is turned until one is, and its
  square cut in the turned frame — the tray's tiles rest flat, so the board's
  must too; `turned` records it (the rotated triangular and the three-scale
  triangular are turned too). The congruent-rectangle bonds' edges are a
  half or a third of a brick, split at T-vertices — and the isogonal tilings'
  a half of the unit, read the same way: each edge is read as a
  whole number of the smallest fraction of the unit that makes them all whole,
  the board built at that scale in a ring whose `unit` draws it at true size,
  and each cell keeps only its real corners (the template's `real` flags), so
  a brick is a plain rectangle. The pentagonal tilings' edges are no whole
  fraction of the unit (√2/2, (3√3 − 1)/2, 2cos 15°): every edge length is
  read as a short real of the ring — a whole number plus a multiple of one
  ζʲ + ζ⁻ʲ, whole numbers first — times its direction; the walk's closure check
  holds every reading.
- `src/geometry/laves.ts` — a Laves tiling as the exact dual of a uniform
  patch, or a 2-isohedral one of a 2-uniform patch: a tile on every whole
  vertex, its corners the face centres round it. Centres are exact once
  scaled by the face sizes' lcm, so the board is built at that scale in a ring
  whose `unit` draws it back at true size. Tiles the square cuts off from the
  rest are dropped: the board is the largest piece joined edge to edge.
- `src/geometry/repTile.ts` — a rep-tile patch: Hypersweeper's substitution
  tile (`SUBSTITUTIONS`, `substitutionPlacements`) inflated `levels` times,
  its lattice points read exactly into ℤ[ζ4] or ℤ[ζ12] and turned by the
  same upright turn Hypersweeper draws the right triangles at, each cell cut
  to its real corners (the tiles meet at T-junctions, as the bonds do).
- `src/geometry/exact.ts` — tiles a Hypersweeper builder publishes exactly
  (`ExactTiles`: the coefficient vectors its vertex ids are) read into a
  ring: ℤ[ζ(order)], or ℤ[ζ(2·order)] for an odd order, whose tiles sit at
  every (2·order)th of a turn; mirrored in the x axis, the way round
  Hypersweeper shows a chiral board; each tile cut to its real corners.
- `src/geometry/spiral.ts` — a spiral patch: the tiles Hypersweeper's
  spiral builder keeps (`phyllotaxisExact`, `klaassenExact`,
  `pentaSpiralExact`), read by `exactPatch` into ℤ[ζ10], ℤ[ζ12], or ℤ[ζ14]
  for the ζ7 spirals.
- `src/geometry/aperiodic.ts` — an aperiodic patch: the centred window
  Hypersweeper's builder keeps (`penroseExact`, `kiteDartExact`,
  `ammannBeenkerExact`, `spectreExact`), read by `exactPatch` into ℤ[ζ10],
  ℤ[ζ8] or ℤ[ζ12]. The Penrose patches deflate a unit wheel, so their edges
  are 1/φ^depth; they are grown back by φ^depth (exactly: φ = ζ + ζ⁻¹) to
  unit edges, and the tests draw the builder at that scale
  (`aperiodicShrink`). The Spectre's flat corner is dropped: a 13-gon.
- `src/geometry/vertexRule.ts` — the vertex rule: whether the corners round a
  point can still be completed to a vertex configuration. Applied only where a
  level sets `rule`.
- `src/levels.ts` — the levels, and `GROUPS`, the sections they are listed
  in. `windowLevel` makes a level from a tiling key and a box size (uniform,
  2-uniform, pentagonal, isogonal or a congruent-rectangle bond, by the
  tiling's family); the 2-uniform boxes are in `TWO_UNIFORM`, the windows that
  also have both kinds of vertex inside, the pentagonal ones' in `PENTAGONAL`,
  the isogonal ones' in `ISOGONAL`, the bonds' in `RECTANGLES`.
  `lavesLevel` and `twoIsohedralLevel` make the duals, from `LAVES` and
  `TWO_ISOHEDRAL` (the latter keyed by the 2-uniform primal; the level is
  `<primal>dual`, Hypersweeper's key). `repTileLevel` makes a rep-tile from
  `REPTILES` (Hypersweeper's mode key and how many inflations); the tests check
  it tile for tile against Hypersweeper's builder at that many `levels`.
  `spiralLevel` makes a spiral from `SPIRALS` (the mode key, how far the
  builder grows it, how many tiles it keeps), checked the same way, and
  `aperiodicLevel` an aperiodic window from `APERIODIC` (the mode key, how
  many substitutions, how many tiles the centred window keeps).
  `makeLevel` reads everything off a level's
  cells: the tray (one tile per kind — cells alike up to a turn, or a turn and
  a mirror — resting flat on its longest side the whole tile lies above and
  that runs along a ring direction, `restFlat`: not the pentagonal spirals'
  cut, nor across the Klaassen heptagon's dent), whether a kind is
  used both ways round (`mirror`, which brings a flip control), each
  kind's rotate step from flat (`turns`) and pile (`need`), the time limit
  (`seconds`), each kind's colour classes (`colours`: by side count, plus
  `twin` on a second kind with as many sides as another — the two
  quadrilaterals of V[3².6²; 3.6.3.6]), the region, and keeps the cells
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
  the open corner with the fewest placements, trying the board's own tile
  there first (blind, it gets lost on V[3.4².6; 3.6.3.6]).
- `src/view/svgBoard.ts` — the SVG drawing. The SVG is in screen pixels:
  the world (region, tiles, the tile in hand; board units, y up) under one
  camera transform — fitted at zoom 1, `zoomAt`/`panBy` — and on the tray's
  pinned strip the shelf (at the world's scale, clipped to its room,
  `scrollTray`), its scroll bar (`scrollBarBy`, `scrollBarTo`) and the
  controls' row (a fixed size).
- `src/figures.ts` — **the figures**: every level's tray tiles matched across
  levels — the same figure when one is a turned, moved or mirrored copy of the
  other at its true size (`sameFigure`, exact: both lifted into ℤ[ζ lcm], each
  scaled by the other's drawing `unit`, compared by products of edge vectors;
  a float area check only ever rejects) — and the levels grouped by the set of
  figures their tray is (`figureSets`, one figure first, then by first use in
  `LEVELS`). A figure is named as a regular polygon or a rectangle by its
  shape, else by the level it alone tiles (V4.8², Sphinx), else as a rhombus,
  kite or dart, else by its sides.
- `src/view/home.ts`, `src/view/catalog.ts`, `src/view/figures.ts`,
  `src/view/settings.ts` — the first screen, Tilings (the catalog), Figures
  and one figure set's tilings, and the settings; `src/view/icons.ts` the pictures
  they share (board outline, tray tile, the three bars, a star row) and the
  header's glyphs. The catalog shows only what a player starts with: the
  board's outline, the tray's tiles, the vertex configuration as the name
  (`notation`: 4⁴, 3.4.6.4), and the best stars — never a picture of the
  tiling, which would give the puzzle away. The descriptive label is only a
  tooltip.
- `src/input/drag.ts` — pointer drag and drop, rotate and flip, the ✕
  remove mode, and pinch, pan and wheel zoom.

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
  check every inner point carries the level's vertex configuration. The
  spiral and aperiodic builders publish their exact coordinates
  (`ExactTiles`); planned: the rest do too, so any level can be read off its
  builder.
- **Colours come from `var(--…)`** in `src/styles.css`, with the
  `prefers-color-scheme: dark` block kept in step. A tile is coloured by its
  side count (`.sides-3`, `.sides-4`, …), on Hypersweeper's shape hues (7,
  Klaassen's heptagon, between 6 and 8 as its hue ramp puts it; 13, the
  Spectre, violet at its end), and a
  second kind with as many sides as another in rose (`.twin`) — read a kind's
  classes from `level.colours`, never from its side count.
- Import the geometry as `@tiling/geometry` (its index) and nothing from
  `apps/hypersweeper/` (renderer, UI, game rules) — that is Hypersweeper's own.
  A name the geometry has but does not export gets a line in
  `packages/geometry/src/index.ts`. `packages/geometry/tests/boundaries.test.ts`
  fails on a deep import or one game importing another.
- Verify visual changes with a real screenshot (the `reptiles` entry in
  `.claude/launch.json` starts the dev server).
