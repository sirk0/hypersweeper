# Hypersweeper (pygame)

A minesweeper clone with flat and 3D boards (spherical polyhedra, cube,
tetrahedron, donut, Möbius strip, cylinder, Klein bottle). Python 3.13
(see `.python-version`), only dependency: `pygame-ce`.

## Architecture

- `minesweeper/game.py` — game rules over an arbitrary cell graph
  (`Game(adjacency, mine_count)`); knows nothing about geometry or UI.
- `minesweeper/boards/` — board builders, a package. Cells are polygons
  whose vertices have exact hashable ids (integer lattice points in 2D,
  symbolic/barycentric keys in 3D); two cells are neighbors when they
  share a vertex. Modules: `core` (`Board`/`Board3D`, adjacency, topology
  invariants), `tilings` (flat tilings + the `ARCH_TILINGS` registry and
  `_ArchTemplate` system), `aperiodic` (Penrose, Spectre, phyllotactic
  spiral), `fractal` (the self-similar boards: sphinx, chair, Sierpinski
  carpet, pentaflake and Gosper island), `solids` (spherical
  polyhedra, cube, tetrahedron, frames), `surfaces` (donut/cylinder/
  Möbius/Klein-bottle wrapping via shared immersion helpers), `catalog`
  (the menu, **derived** from `SURFACE_SPECS`/`TILING_SPECS`), `presets`
  (`ARCH_PRESETS` + `build_board`). The eight non-regular Archimedean
  tilings (six with two tile shapes, plus 3.4.6.4 and 4.6.12 with three)
  and their eight Laves (dual/Catalan) duals — built mechanically by
  `_dual_template` — wrap onto the donut/cylinder/Möbius/Klein-bottle via
  `_ArchTemplate` (one rectangular periodic domain + modular seam gluing;
  snub hexagonal and its dual the floret pentagonal are chiral, so no
  Möbius and no Klein bottle — both seams reverse orientation). A
  **cut** — one number per template, `_ArchTemplate.cut` — is where both
  open surfaces end the tiling, and both need the strip **symmetric about
  its own centre line**. A Möbius strip has one edge, so its two rims are
  two arcs of the same circle; a cylinder has two, and they have to be the
  same curve or the tube reads as cut off square at one end and gnawed at
  the other. The seam of a Möbius band reverses y and leaves x running on,
  so its flip has to be the template's *mirror*: `rows + 2*cut/height` must
  come out a whole number (`rows` may be fractional, as on the cylinder). A
  cylinder can also be turned upside down about a horizontal axis, which
  reverses x too, so a **half turn** serves it as well as a mirror — which
  is how the chiral tilings (the snubs, and four of the isogonal six) get
  matching rims with no mirror at all. `_flip_levels` measures the heights
  where a tiling reverses y either way into `_ArchTemplate.flips`, and
  `arch_cylinder_board` asks that `cut + rows*height/2` land on one of
  them. Three-scale triangular (p3) reverses y at no height in any
  orientation — no mirror, no half turn — so it is the one tiling with no
  cylinder at all, gated out of the menu by `SurfaceSpec.needs_flip` as
  chirality gates the snubs out of the Möbius strip. On either surface the
  cut never falls on a row of tile *centres* — cutting there keeps the row
  at one rim and drops it at the other, which is what six of the eight
  uniform tilings shipped as on the Möbius strip — and it runs along a
  horizontal edge-line of the tiling wherever there is one, so the rim is a
  straight circle rather than a zigzag. See the AGENT NOTE on the cut in
  `boards/tilings.py`; every rule is measured on every shipped preset by
  `TestWrappedArchimedean.test_mobius_band_is_symmetric`,
  `test_cylinder_rims_are_the_same_curve`,
  `test_{mobius,cylinder}_rim_is_straight_where_the_tiling_allows` and
  `test_no_tile_centre_sits_on_the_cut`. The
  Klein bottle glues like the donut but flips the tube across the ring
  seam (the same `template.mirror` the Möbius uses); the
  self-intersecting bottle immersion hides some cells behind the neck, so
  every Klein board carries a `cell_cycle` the UI scrolls along to bring
  them into view. A third `ARCH_TILINGS` family, `family="isogonal"`, holds
  the six **non-edge-to-edge** tilings by convex regular polygons (offset
  square, staggered triangular, Pythagorean, rotated hexagonal, rotated
  triangular, three-scale triangular): vertex-transitive, but a tile's
  corner lands in the middle of its neighbour's edge. `_insert_t_vertices`
  records that point on the split tile so shared-vertex adjacency still
  finds the neighbour; it is collinear, so the drawn tile is unchanged and
  the shape colouring drops it before measuring. They wrap the torus like
  every other periodic family, and all but three-scale triangular the
  cylinder (p3 reverses y at no height, so no strip of it has two matching
  rims); the two reflective ones (offset square, staggered triangular) also
  wrap the Möbius strip and Klein bottle, and the other four are chiral (no
  template mirror), which gates them out of those two seams exactly as it
  does snub hexagonal.
  A fourth family,
  `family="rectangle"`, holds the five brick **bonds** tiled by one congruent
  rectangle (stacked bond, running bond, basket weave, its three-brick
  version, herringbone). These are face-transitive rather than
  vertex-transitive, and — bar the stacked bond, which is a stretched square
  tiling — not edge to edge either; `_FAMILY_TRAITS` in `tilings.py` declares
  those two traits per family and the test lists derive from it. Like the
  isogonal family, all five wrap the torus and cylinder, and the four with a
  template mirror (all but herringbone) also wrap the Möbius strip and Klein
  bottle. The menu's shared
  tiling picker is a list of family
  submenus: **Regular** (the three regular tilings, plus on the plane the
  shaped boards cut from them), **Uniform** (the eight non-regular uniform
  tilings, `family="uniform"` in `ARCH_TILINGS`), **Laves** (their
  eight duals), **Isogonal**, **Congruent rectangles** and, on the plane
  only, **Aperiodic** and **Fractals**. Every family is offered on every
  surface its members' chirality allows, with no exceptions left:
  `picker_families` in `catalog.py` (and its mirror in
  `web/src/boards/catalog.ts`) now only drops the two flat-only families,
  and everything else a surface refuses it refuses one row at a time, in
  `family_rows`, on chirality. **Congruent rectangles** was the last gap,
  off the torus/Möbius/Klein bottle because the wrap squashed its bricks;
  what was really wrong was the measure that picked the windows, which
  scored a tile on how *round* it was and so spent the surface's free axis
  on squaring the rectangles off — on the stacked bond, whose adjacency is
  the square tiling's already, that left a donut with no bricks left to
  see. `resize.planar_shape` measures a window against the tiling's own
  tile instead, and re-measured that way the same donut keeps them (see
  "Size and mine-count convention" below). One caveat outlives the fix: the
  Möbius immersion draws every board on it stretched 2 to 1 along the loop
  (`mobius_half_width` is half the isometric width — every Möbius board in
  the game has this, it is not the bonds'), so a 2-to-1 brick lands on the
  strip as a 4-to-1 slat, and no window changes that. `ARCH_TILINGS` is
  listed in vertex-configuration order — Wikipedia's "List of Euclidean
  uniform tilings" order — and that registry order is the menu order.
  **To add a tiling or surface, see `AGENTS.md`** — a tiling is
  one `ARCH_TILINGS` + one `ARCH_PRESETS` row (its family submenu follows
  from the `family` field, no menu edit needed), a
  surface is one `SurfaceSpec` + an immersion + a wrap builder; the menu,
  mode strings, `MODES_3D`, and chirality gating all derive from those
  registries.
  Board-shape convention (applies to all future flat boards): a finite
  flat board should read as a roughly *square* rectangle, not a round
  disc, and a symmetric tiling should give a symmetric board. (The named
  shaped boards — `triangle`, `hexhex`, `hextri`, `hextriangle` — are the
  deliberate exception: each is a polygon of the tiling's own symmetry,
  exactly filled, never a trimmed disc.) For periodic
  tilings take a rectangular window of whole periods centred on a rotation
  centre (`archimedean_board` keeps an `nx`×`ny` domain block of the
  `_ArchTemplate` centred on the tiling's biggest tile, so the window maps
  onto itself under the tiling's point group); for aperiodic ones
  (`penrose_board`, `spectre_board`, `phyllotaxis_board`) grow generously and trim
  to the `keep` centremost cells by Chebyshev distance (`max(|dx|, |dy|)`)
  — generously enough that `keep` is a small fraction of the patch, or the
  substitution's own star-shaped outline is what the board reads as. See
  the `AGENT NOTE` in `boards/tilings.py`.
  **Size and mine-count convention — difficulty is measured, not assumed.**
  A board's easy/medium/hard sizes track the classic Windows boards (81 /
  256 / 480 cells, within ±15%), and its mine count is *calibrated* so the
  probability of winning under optimal play matches the classic board's at
  that difficulty. **Never pick a mine count from a density.** A flat
  percentage is exactly what this game cannot use: adjacency here is
  shared-vertex, so a cell has 4 neighbours on the pentaflake and 21 on the
  triakis boards, and a number spread over 21 cells says far less than the
  same number over 6 — at one density a hexagonal board plays much easier
  than a triangular one. Boundary moves it the same way (a corner
  constrains less than an interior cell, so a seamless torus is easier than
  the flat board it wraps), which is why the calibrated densities range from
  2% to 36% rather than clustering near classic's 12/16/21%. Measured on
  84-cell tori, a hexagonal one (degree 6) still wins every game at 8 mines
  where a square one (degree 8) is already down to 90% at 6. The
  numbers come from `scripts/difficulty/` — a reference solver
  (single-point deduction plus exact frontier probabilities by a memoised
  DP) plays each board a few thousand times while a search moves the mine
  count onto the target; `scripts/difficulty/report.md` is the audit trail
  and `targets.json` the measured classic yardstick. The size half of that
  search (`resize.py`) picks the window whose cells come closest to their
  **planar** shape, and "their own" is load-bearing: every measure of cell
  shape here is a measure of *roundness*, which is the same thing only for
  a tiling of regular polygons. `resize.planar_shape` measures the tiling's
  own tile off its template and both the score and the no-regression bar
  read the deviation from *that*, or a wrap that rounds a 2-to-1 brick off
  into a square scores as an improvement. Rerun it for a new
  board rather than guessing (see `AGENTS.md`). Three consequences worth
  knowing. The first click is guaranteed to open a *zero*, not merely to
  miss a mine (`Game._place_mines`, with a fallback when a board is too
  dense to allow one) — so a board can hit its target win rate and still not
  be a game, because a flood that reaches every safe cell *is* the win. That
  is the one floor under the search, and it is **measured, never a
  density**: `calibrate.opening_floor` bisects for the fewest mines at which
  the opening click alone finishes fewer than 1% of games, which is a
  property of the board's size and degree together (a 36-cell pentaflake at
  8% is cleared outright 8 times in a hundred; a 216-cell one at 5% never
  is). An earlier flat 10% floor both left the small boards broken and
  overmined the large ones, recording 65 rows as unreachable when they were
  only over-floored. Second, a board whose cells have **indistinguishable
  twins** — the same closed neighbourhood, so no number can ever separate
  them — cannot be calibrated at all, because each mine landing alone in a
  pair forces a coin flip. The five triakis boards are entirely made of such
  pairs (win rate is 0.5^mines at any density) and are shipped uncalibrated
  and flagged; `metrics.indistinguishable_cells` is the check. Third, those
  boards and the handful of others that cannot reach their target (rhombille
  and its wrapped forms end with a pocket at exactly even odds) are listed
  in the generated `data/difficulty.json`; the TypeScript app reads it in
  `web/src/boards/fairness.ts` to mark the menu row with a ⚠ and to deal
  those boards a quarter as often from the Flat/3D random launchers.
  The three aperiodic boards each keep exact vertex ids in a cyclotomic ring:
  ℤ[ζ5] (Penrose and the spiral) and ℤ[ζ12] (Spectre). Only Penrose's is discrete — ℤ[ζ12]
  is dense in the plane, so `spectre_board` cannot snap a float vertex back
  to a lattice the way the game's original third aperiodic board, The Hat
  (since removed as a menu entry), did — and instead carries every
  placement of the paper's chiral
  substitution as an exact `(rotation mod 12, mirror, translation)` triple.
  Its tile is Tile(1,1) held as an equilateral **14-gon**: the 14th corner
  is the collinear one, kept so a neighbour's corner landing there is a
  shared vertex id, dropped again by `shapeMetrics`/`corners` so the tile
  measures as the 13-gon it is drawn as.
  The third, `phyllotaxis_board`, is nonperiodic by **symmetry** rather than
  by substitution: one equilateral convex hexagon (angles 72°/144°) in a
  five-fold spiral — the sunflower-head look of a Voronoi tessellation of a
  phyllotactic spiral, but built exactly from one congruent tile rather than
  sampled from spiral points. The rosette of five tiles at the centre forces
  every tile after it, and a tiling with a five-fold centre can have no
  translation at all. It needs no deflation — the hexagon is a
  parallelohexagon, so each of ten 36° wedges is a plain block of its own
  translation lattice, and the odd wedges being pushed one edge out along
  `u1` is the entire spiral.
  The five **fractal** boards are each one tile inflated `levels` times --
  scaled up by the substitution's `factor` and refilled with copies of itself --
  into a patch whose outline converges on a self-similar shape (the tile again
  for the first four, the Gosper island for the fifth); that outline is the
  board, the second deliberate exception to the square-window
  convention. Two are rep-tiles, polygons that tile a scaled copy of
  themselves (rep-4, so 4**levels cells: 64/256/1024 by difficulty for the
  chair, one level lower for the sphinx, whose sliver of a tile needs more
  room): the **sphinx** is the pentagonal hexiamond on the triangular lattice
  (its dissection is unique -- three of its four children are reflected), the
  **chair** the L-tromino on the square lattice (the classic reflection-free
  substitution, four quarter-turns). The **Sierpinski carpet** is not a
  rep-tile: the unit square tripled and refilled with the eight subsquares of
  the 3x3 block that are not its centre, so it grows 8**levels (64 easy, 512
  medium; ×8 a level leaves no fourth playable size, so hard reuses the
  level-3 patch at the classic hard board's ~20% mine density). The hole it
  leaves at every scale makes it the one flat board that is not a disc --
  (8**n - 1) / 7 holes, hence Euler characteristic 1 - holes and holes + 1
  boundary circles -- and the reason no cell of it ever has eight neighbours
  (every 3x3 window of the grid holds exactly one cell that is ≡ (1, 1) mod 3,
  and that one is always a hole). The **pentaflake** (Dürer's pentagon) is the
  regular pentagon scaled by φ² and refilled with six -- one seated in each
  corner plus one in the middle turned a half turn -- so it grows 6**levels
  (36 easy, 216 medium, and hard reuses the level-3 patch at ~20% mine
  density, as the carpet does). Its five children leave a golden gnomon
  (a 36-72-72 triangle) over per side, so it too has holes: a level-`n`
  pentaflake has (6**n - 5·2**n + 4) / 4 of them, none at level 1 (there the
  gaps still open onto the patch's own boundary) and one per whole edge two
  supertiles are glued along after that. Three pentagons and 3·108 = 324°
  meet at a corner, so no cell of it ever has more than five neighbours.
  Its lattice is the one here that is not integer: five-fold symmetry needs
  rank 4, so its vertex ids live in the cyclotomic ring ℤ[ζ10] (as Penrose's
  do in ℤ[ζ5]) and φ² = 2 + ζ² - ζ³ is exact there. Each child translation is
  the parent's scaled by a power of the factor, so a placement stays an exact
  `(rotation, mirror, translation)` triple -- and the inflation only ever
  multiplies by the factor, never divides, because there is nothing to round
  an irrational scale back to. The two rep-tilings are not edge to edge, so
  their tile outlines carry a vertex at every lattice step and
  `corners`/`shapeMetrics` drop those again before measuring (the carpet's
  squares, the pentaflake's pentagons and the Gosper island's hexagons meet
  edge to edge and need none).
  The **Gosper island** is the one whose *boundary* is the fractal rather than
  its interior: plain regular hexagons, no holes at all, in a patch whose
  outline converges on the Gosper island -- the curve the flowsnake draws,
  dimension log 3 / log √7 = 1.129, which is 7**n hexagons behind only 6·3**n
  boundary edges. The hexagon is no rep-tile (seven make a flower, not a
  bigger hexagon), so what inflates is the patch: seven level-(n-1) islands,
  one in the middle and six around it. Its inflation is multiplication by the
  Eisenstein integer 2 + ζ, of norm 7 -- a *spiral* similarity of √7 at
  19.106°, because scaling by √7 alone would send the lattice point 1 to
  (√7, 0), which is no lattice point -- and that forced turn per level is what
  roughens the edge. Its seven child translations are a complete set of
  residues mod 2 + ζ, which is why the level-`n` patch is exactly 7**n
  distinct cells (49 easy, 343 medium, and hard reuses the level-3 patch at
  ~20% mine density, as the carpet and the pentaflake do). The digits are
  closed under multiplication by a unit, so the patch keeps the hexagon's
  six-fold rotation at every level, but never a mirror past level 1: the
  flowsnake is chiral.
- `minesweeper/gui.py` — pygame UI. `MenuScreen` (a geometry-first home
  page — Classic / Flat / Flat manifolds / Sphere / Polyhedra; **the pygame
  menu only** — the web menu was restructured in `web/` alone and is
  described in the TypeScript section below. Classic
  launches flat squares; Flat (the plane) and each flat manifold (cylinder,
  Möbius, Klein, torus) open a shared tiling picker — the Regular / Uniform
  / Laves family submenus, Isogonal and Congruent rectangles on every
  surface, Aperiodic and
  Fractals on the plane only, and a random option
  — parameterised by the surface it was reached through; Sphere and
  Polyhedra list their finished boards. Navigation is a `path` breadcrumb
  driven by the `MENU_ROOT`/`MANIFOLD_*`/`FAMILY_*`/`SPHERE_MODES`/
  `POLYHEDRA_MODES` tables and the `family_rows`/`picker_families` helpers
  in `catalog`),
  `GameScreen` (flat), `GameScreen3D` (orthographic
  projection, back-face culling or two-sided, depth sort, drag to
  rotate). Everything is drawn on a canvas at `UI_SCALE`(=2)× and
  smooth-downscaled to the window each frame (supersampling); `App`
  scales mouse events up to canvas coordinates. Screens and tests work
  in canvas coordinates only.

## Run

```sh
.venv/bin/python -m minesweeper                 # menu
.venv/bin/python -m minesweeper --mode hexhex   # skip menu; see MODE_LABELS
.venv/bin/python -m minesweeper --theme neumorph # UI theme; see THEMES in gui.py
```

The chrome (menu screen + buttons + header controls, not the board tiles)
is themeable: `THEMES`/`set_theme` in `gui.py` hold the light presets
(`ios` is the default; also `flat`, `neumorph`, `glass`, `paper`, and the
retro `classic`). Pick one with `--theme` or `MINESWEEPER_THEME`.

The venv already has everything; recreate with `make venv`.
Dependency groups in pyproject.toml: `web` (pygbag), `test` (pytest,
ruff), `all` (both); locked to requirements[-web|-test|-all].txt by
`make lock` (uv). The Makefile wraps all common commands (`make help`);
CI runs `make test`/`make lint`. Pages deploys the **TypeScript** app in
`web/`, not this one — `make web-package` is a local build only.

## Web build (pygbag)

`main.py` is the browser entry point; the game loop is async
(`App.run_async`) so pygbag can yield to the browser each frame. This
build is **no longer deployed** — `deploy-pages.yml` and
`deploy-cloudflare.yml` publish the TypeScript app at the site root (and
`/next/`, where that app lived during the rewrite, redirects there via
`web/public/next/index.html`) — so `make web-package` / `make web-run`
are for running the pygame version in a browser locally. Browser-specific
care in the code: no plain
`import pygame.gfxdraw` (pygbag's scanner would search PyPI for it;
gfxdraw doesn't exist in wasm at all — `_GFX` fallbacks in gui.py),
pygame key constants read via `getattr` at module level, and `main.py`
must import pygame itself so pygbag provisions the wasm wheel.

On the web the framebuffer and canvas CSS box fill the visible viewport
(`_WebPresenter`, using `visualViewport` so the mobile address bar is
excluded; set on every frame since pygbag's template only sizes the
canvas once at boot). The current screen is drawn on its own canvas, then
scaled by the ratio of the window width to the screen's `web_ref_width`.
Every screen reports its own width there (a game board its natural
width), so boards and the menu all fill the window edge to edge; a
screen taller than the window is clamped down to stay fully visible, so
there are never letterbox gaps on a tall phone. On a portrait viewport
(a phone held upright — `is_portrait`, plumbed through
`set_portrait`) a clearly landscape flat board (width > 1.2× height,
i.e. the classic 30×16 hard board) is drawn turned a quarter-turn
(`GameScreen._rotated`) so it fills the width; the desktop presenter
never reports portrait, so desktop and landscape windows keep boards as
designed. Cell size still varies per board, but the header controls do
not: the header row (back and flag-mode at the left edge, mine counter /
smiley / timer centred, Klein scroll arrows at the right edge) is laid
out at `_header_scale = board width / HEADER_REF_W`, which shrinks it to
fit boards narrower than `HEADER_REF_W` and, on the web only, grows it
(band height included, `_header_height`) on wider boards — because the
web scale is width-proportional, that keeps the controls one constant
touchable physical size across **all** boards. The desktop clamps the
scale at 1 so wide boards keep the normal-size header. The presenter also hands each screen extra height
(`set_viewport_height`) to fill the window, and the screen distributes
it: a game keeps the header at the top and centres the board in the space
below; the menu keeps the title at the top, drops the difficulty row to
the bottom and centres the mode list between them. The desktop leaves the
height at each screen's natural size, so its layout is unchanged. pygbag
also regenerates its default favicon and `index.html` on every build, so
`make web-package` runs scripts/make_web_icons.py afterwards: it
overwrites the favicon with the in-game mine-in-hexagon icon, writes an
`apple-touch-icon.png` (the same icon rendered full-bleed so iOS's own
rounded-square mask makes the iPhone home-screen icon match the macOS
dock), and injects the `apple-touch-icon` <link> that pygbag's template
omits (without it iOS shows a screenshot of the page instead of the app
icon).

Local test — must use pygbag's own server; on any other port the
template rewrites the CDN to localhost:8000 and pygame fails to load:

```sh
make web-run   # builds, then serves at http://localhost:8000
```

## Tests

```sh
.venv/bin/pytest            # full suite, sub-second
```

GUI tests run headless (SDL dummy driver, set in tests/test_gui.py).

### Claude Code on the web (cloud sessions)

`.claude/hooks/session-start.sh` (registered in `.claude/settings.json`)
provisions `.venv` (Python 3.13, per `.python-version`) and installs
`requirements-test.txt` at session start, so `make test`/`make lint` work
without manual setup. It runs only when `CLAUDE_CODE_REMOTE=true`. Test
deps come from PyPI, which is reachable from cloud sessions.

## Screenshots (headless)

```python
import os
os.environ["SDL_VIDEODRIVER"] = "dummy"
import pygame
from minesweeper.gui import FontCache, make_screen

pygame.init()
pygame.display.set_mode((1, 1))
screen = make_screen("hexhex", "easy")   # or MenuScreen()
surface = pygame.Surface(screen.size)
screen.draw(surface, FontCache())
pygame.image.save(surface, "shot.png")
```

Note: the saved image is the 2x supersampled canvas; the real window
shows it downscaled by `UI_SCALE`. To preview what the user sees,
`pygame.transform.smoothscale` it to half size first.

## TypeScript app (`web/`)

The TypeScript/Three.js app lives in `web/` and shares its
config and conformance oracle with the Python game through `data/*.json`
(see AGENTS.md). It is **the deployed game** — GitHub Pages and Cloudflare
Pages both serve it at the site root while the game moves from the first to
the second (two workflows, one build each, differing only in `VITE_BASE`;
see "Deploy" in `web/README.md`); the pygame build is the reference
implementation and is not published. Commands (`npm run typecheck/test/build/screenshots`, Playwright
`e2e`) and — important when changing anything visual or interactive —
**how to drive and screenshot the app headless, plus the gotchas that
actually bite** (the `window.__ms` seam, flood-fill devouring sparse mine
fixtures, `--update-snapshots` silently keeping baselines that pass within
tolerance, ESM script placement) are documented in `web/README.md` under
"Agent notes". Verify UI changes by looking at real screenshots, not just
by the test suite passing.

A board's address is its **share link** (`?mode=…&difficulty=…`, optional
`seed`), written on launch and cleared on return to the menu. `src/link.ts`
parses it as untrusted input: each parameter is read only if this build
knows its value, and dropping one never costs the others. Any lookup
fed from a link must use `Object.hasOwn`, never `in` — see "Shareable
board links" in `web/README.md`.

Winning files the time with `src/leaderboard.ts`, which keeps the **fastest
three per board per difficulty** under its own `ms:scores` key (game history,
not a preference — see "Best times" in `web/README.md`); a time that places
raises the app's one real modal, `src/ui/scoreDialog.ts`, and the full list
lives under Settings › Best times.

Its **menu** is play-first, and deliberately not the pygame one: the home page
is Classic, Flat, 3D and Custom (`src/ui/menu.ts`). Flat and 3D each launch a
*random* board — the flat picker's pool, and every flat manifold plus the
spheres and polyhedra — so no picker carries a Random row; Custom holds the old
root (Flat, Flat manifolds, Sphere, Polyhedra). In every tiling picker the three
regular tilings are promoted to rows of their own, leaving the Regular family
holding the shaped boards alone under the label **Non-square boards** (plane
only). That shape is *derived* from the shared port in the "web menu" section of
`src/boards/catalog.ts`, so `data/catalog.json` and the pygame menu are
untouched; `tests/unit/menu.test.ts` pins it.

The menu's gear opens a **settings** page (best times, theme, sound and
its volume, haptics where anything can buzz, animations toggle, build
version, update check) — one more
`Menu` page rather than a modal, with the theme, best-times and sound pages
below it. Nothing on it links off the site. The header carries the gear at its right edge and a **?** at its
left — one button per side, so the two balance and the title
"Hypersweeper", a single unbreakable word, stays on one line on a narrow
phone. The **?** opens a how-to-play page (`src/ui/help.ts`) built the
same way, its text in TS rather than in the pygame-shared `screens.json`.
Theme, difficulty, the sound preset and its volume, haptics and the
animations override persist (`src/settings.ts`): one stable
`localStorage` key holding a record that carries its own `version`, never
a versioned key name — see "Settings and themes" in `web/README.md` before
adding a field.

A **theme** is the app's one look setting: the chrome palette, the page
behind the board, *and* how the board's cells are cut. There are four —
**Light** (the `ios` palette + flat cells; the default), **Dark** (the
web-only dark palette + flat cells), **Classic** (the classic palette +
the beveled button, drawn in **gray** — a quotation of the pygame board's
own `HIDDEN_FACE`/`REVEALED_FACE`, guarded by `test_theme_sync.py`) and
**Realistic** (the `ios` palette over a textured page: glossy beads while
closed, **matte** flat-floored pans once opened, translucent on a flat
board so the page's grain shows through them). Realistic is also the one that
stops drawing a flag and a mine as *pictures* on a board you can turn: on every
3D board — the flat manifolds included — a flagged cell carries a **pin** (a stem
under a round head) and a mined one, once a loss reveals it, a spiked **bomb**
(`src/render/markers3d.ts`, switched on by `CellStyle.solidMarkers`). Both are
rotationally symmetric about the axis they stand on, which is the point: a flag
with a *front* — the pennant this shipped as first — goes edge-on seen straight
down its own pole, and on a solid that is every cell facing you. The two-sided
surfaces (cylinder, Möbius, Klein) have no consistent outward normal and are
drawn from both faces, so they get one **pin** per face — but only one bomb,
whose casing is centred on the tile and straddles it; flat boards keep the
billboards, since a plane is only seen from one angle. Those markers **glow**
(`src/render/markerGlow.ts`), and they glow at what the sound says: a front of
light spreads from the click at the reveal ripple's own pace
(`RIPPLE_PER_CELL`), so each pin brightens as the cells near it open, as bright
as the move was big (logarithmically in the count) and as warm as the tiles were
many-sided — the same `sides - 3` ramp `noteFor` pitches a voice by, so a
hexagonal board glows unlike a triangular one. The swell holds only while the
front is still inside the flood and then falls back to a faint resting ember; a
mine going off runs the same machinery hot, flashing and **swelling** the bomb
that went off, racing a shockwave out three times faster than a reveal, and
leaving the markers warm for the rest of the loss screen. The whole effect is
**one static per-vertex weight** (which parts of a model light up: a pin's head
and not its stem, nothing at all on a dead pin) and **eleven uniforms** rewritten
per frame in a shader patched onto the marker material — no geometry is rebuilt
and no vertex colour varies with time, because `rebuildMarkers` is a whole-board
pass that `tests/e2e/markers.spec.ts` pins as never running for a flood fill. The
resting ember is a *look* rather than a motion and so survives reduced motion;
the wave, the shockwave and the swell go with the Animations toggle, and
`wantsMarkerGlow` going false with them is what keeps a flood from measuring
rings nothing will show. The four are declared in `src/ui/theme.ts`, which is
web-only because pygame has neither cell styles nor page textures; the
seven **palettes** they compose are still the shared, pygame-ported ones
in `data/ui/screens.json`, guarded by `tests/test_theme_sync.py`. A theme
never adds a colour to a palette. Its chrome is applied as CSS custom
properties on `:root`; the `styles.css` `:root` block is the boot default
(Light's) and must stay in step. Invariants: the **board is themed only
as far as its cell style says** — the shape colour code still owns the
hues, and exactly one style (`classic`, via `monochrome`) switches it off
for the gray 1990s board — and the **WebGL canvas is transparent** so the
field around the board, and what shows through a translucent opened cell,
is the page background; never give it an opaque clear colour again. New
chrome colours must come from a `var(--…)`, or they break the dark theme.
A theme's board half lands on the **next** board (a cell style fixes the
mesh's vertex layout); its chrome is instant. See "Settings and themes"
in `web/README.md`, including the v2→v3 migration that reads the old
palette/cell-style *pair* together.

**Picking** (`Renderer.pick`) is a ray, and it must land on the cell
*drawn* where it lands — which takes both layers of the board, the tiles
and the grout under them (`PICK_LAYERS` in `render/boardMesh.ts`),
nearest hit wins. A tile is shrunk by the cell style's gap, so the grout
line between two tiles is no part of any tile; picking the tiles alone
left about a tenth of the board aimable at nothing, and on a two-sided
surface (cylinder, Möbius, Klein), where both faces are drawn and nothing
is culled, the ray carried on through the board and picked a cell on the
**far sheet** — a click aimed between two safe tiles in front opened, or
detonated, a cell behind them. The grout is the whole cell polygon, and
it is laid a hair past its own edges (`BASE_OVERLAP`) so that two
neighbours overlap rather than meeting exactly on a shared edge: a ray
aimed down that edge can be rejected by the triangles on *both* sides of
it, a crack a rounding error wide that a fold line landing on the middle
of the canvas hits for a whole column of clicks. See "Picking" in
`web/README.md`; `tests/e2e/picking.spec.ts` pins all of it.

**The Klein bottle's self-intersection** (`src/boards/clipSolid.ts`) is the
one place the app cuts geometry away. The immersion passes through itself,
and the sheet that ends up *inside* the neck caps the view down the bore, so
`kleinClip` picks that patch out and the renderer drops it. The rule that
matters: cut against the **drawn** tube, never the smooth one. A board is
drawn as flat tiles, so the neck as drawn is a polygon inscribed in the
immersion's circle — inside it everywhere but at its corners — and cutting
against the circle both ate tiles at the bottom of the bottle, where the two
sheets converge on one circle and the chords cross it, and left a slit along
the self-intersection, where the cut followed the circle and the tube that
should hide it followed the chords. The region is built from the tube's own
triangles: horizontal **slabs** at every vertex height (inside one, a
triangle either spans the whole height or is absent), one convex **wedge**
per triangle within a slab (its angular sector, walled by its own plane —
and two triangles sharing an edge share the wall through it, so the wedges
tile a region that is nowhere near convex; a cell is fanned from its
centroid, so the tube's cross-section is a *star* that dips inward between
its corners, and a single convex bound leaves those dips uncut), and a
convex difference to subtract them. So the cut is a different exact polyline
on every tiling and at every size — the tessellation's own crossing rather
than an idealisation of it. See "The Klein bottle's self-intersection" in
`web/README.md` for the traps (the wedge-wall drift `SLAB_STEP` pays for,
the flat fold cell that lies in a slab's own floor, and why `CLIP_MIN_AREA`
would rather leave a hair too much than take a hair too much).

**Cell styles** (`src/render/cellStyle.ts`) are what a theme names: how a
cell is *cut*, and — for `classic` alone — whether it is shape-coloured at
all. A style is one table entry (a stack of concentric loops per cell plus
a finish) that both board meshes build their geometry from, one entry per
theme, keyed by the theme's key. Traps: `closed` and `open` must declare
the **same loop count** (an opened cell is re-cut into the buffer slice
the closed one wrote); `unlit` and `openAlpha` are **flat board**
settings only — on a solid the shading is what shows the shape, and a
solid's cells overlap on screen so one mesh cannot sort their
transparency; a flat board is lit head-on, so `roughness` says nothing
there (a specular finish only reads on a solid, as it turns) while the
gap, the loop count, `unlit`, `albedo` and `shade` are what the plane
actually shows; `shade` **ramps over the loops** (`vertexShade`), so
extra loops buy a smoother dome — shading the top face alone paints a
bright disc on a flat field; and `openShade` is the same gradient for an
**opened** cell, which is how a style makes its two states two
*materials* (a centre hotspot reads as polished, a flat one as matte).
The flat tiles of a two-sided surface (cylinder, Möbius, Klein) have no
loops to ramp over and are cut by the Klein clip besides, so they measure
the falloff off the geometry instead (`radialFalloff` in
`solidBoard.ts`). A lit style's `albedo` pays back what diffuse shading
takes — the head-on top face returns about 0.32, so `1/0.32 ≈ 3.1` pays
it back exactly, which is what `classic` needs to land on its grays.
There is deliberately **no bundle-size budget or CI gate** for the TypeScript
app. See "Cell styles" and "Bundle size" in `web/README.md`.

**Sound** (`src/audio/`) is **web-only** — the pygame build is silent — and
synthesised, never sampled: there is no audio file in the repo and there is not
meant to be, because every sound here is derived from the move that caused it.
A tile's voice is its own **side count** (a degree of the preset's pitch grid,
and that many harmonic partials, measured by the same `shapeMetrics` the
shape colours use); one opened cell is one note while a **flood fill is a
cascade**, one grain per ring of the spread walked over the game's adjacency and
staggered at the reveal ripple's pace; each grain is panned by where its cell is
**on screen** (`BoardRenderer.panFor` projects it, so zoom, pan, the portrait
quarter-turn and a solid's rotation all carry); and the two **Klein scroll**
directions are one glide and its exact reflection in pitch and pan. `presets.ts`
holds the three characters (Chime, Arcade, Blocks) as a `cellStyle.ts`-shaped
table — in TS, not `data/ui/screens.json`, which is the pygame-shared config —
and `off` is the absence of an entry, so a silenced game builds no audio graph.
`sound.ts` splits a **pure** `voicesFor(event, preset)` (where every rule lives,
and what the unit tests pin) from the Web Audio player. A move opens several
cells at once, so the thing holding those voices together is that **every pitch
is a member of one collection**: a preset's `grid` is one octave of an
anhemitonic pentatonic (no semitone, no tritone) and its `degrees` say which
degree each side count takes — *not* one degree per side, but a spelling chosen
so the shape sets that genuinely share a board come out as chords. Those sets
are measured, not assumed: `tests/unit/soundHarmony.test.ts` builds every mode,
collects its side counts and fails on any pair that is not a third, fourth,
fifth, sixth or octave, so a new tiling cannot introduce a clash. The cascade's
rise is in **whole degrees** for the same reason — as a fraction of a semitone
per ring it put the ten overlapping rings of a flood a fifth of a tone apart,
and no fixed semitone interval can be safe (a consonance plus two semitones is
a tritone). Being in tune is not the same as sounding **soft**, and what keeps
this from reading as a machine is three rules in the player rather than in the
pitch: every grain runs through a low-pass **tracking its own fundamental**
(open at the strike so the tile's partial count is still heard, closed to
`timbre.close` by the end — brightness falls faster than loudness, which is
what a struck thing does and an oscillator does not); `strike` gives the
grain's noise its own fast decay so it is the **mallet hitting** rather than a
hiss laid under the note (the mine's blast and the scroll's rush keep theirs
sustained); and `cascade.swing` wanders each ring off the beat and off the
level curve, deterministically (a golden-ratio sequence on the ring number, so
`voicesFor` stays pure), because a flood landing on an exact grid of `step` ms
is a metronome. Arcade's swing is near zero on purpose — a chiptune should
sound sequenced. Two traps: a browser
will not start audio outside a user gesture (`unlockAudio` builds the context on
the first pointer/key event — do not build it earlier), and a cascade is bounded
twice (`cascade.maxVoices`, `MAX_ACTIVE_VOICES`) because the worst case is half
a `hard` board opening at once. See "Sound" in `web/README.md`.

**Analytics** (`src/analytics.ts`, `functions/api/tally.ts`) is the app's **only
outbound request**, and it counts two things: which boards get opened and how
often they get won. Two events per game — a `start` when a board opens and an
`end` carrying `won`/`lost` and the seconds — posted to a Cloudflare Pages
Function on the app's own origin, which writes one Workers Analytics Engine row
each. There is deliberately **no abandon event**: a board opened and never
finished is `plays − finished`, which `scripts/metrics.mjs` (`make metrics`)
derives. Nothing identifies anyone — no cookie, no id, no seed, no user agent —
and the collector stores nothing from the request either (no IP, no country: a
rare board plus a country is an identifier). Settings › Privacy turns it off,
read on every event like the sound preset. As with `sound.ts`, a **pure** half
holds the rules: `analyticsEvent.ts` is `payloadFor`/`parseEvent`, imported by
*both* the browser and the Function so the two cannot drift, validating modes
against the real `data/presets.json` with `Set` lookups (`in` is how `link.ts`
got bitten). Three traps: the `functions/` directory is only picked up because
the deploy runs wrangler from `web/` beside `wrangler.toml`; the dataset's blob
positions are a contract with the report script, append-only; and every count
in that script is `SUM(_sample_interval)`, never `COUNT(*)`, because Analytics
Engine samples. The counter is **opt-in per build** (`VITE_ANALYTICS=1` →
`__APP_ANALYTICS__`, vetoed outright by `VITE_PACKAGED`): only the Cloudflare
deploy and the e2e run carry it, because a post to a host with no Function 404s
and the *browser* logs that to the console — so the GitHub Pages build, the dev
server and the packaged apps carry no client at all, and
`scripts/check-offline-assets.mjs` asserts the packaged case with a second pass
for same-origin paths (its URL scan only sees absolute ones). Locally the
`tallyStub` middleware in `vite.config.ts` answers `204` like the Function, so a
dev server matches the deployed host. See "Analytics" in `web/README.md`.

## Desktop app (`desktop/`) — the offline macOS build

`make mac-app` (macOS only) packages the **TypeScript app** as
`build/desktop/mac*/Hypersweeper.app`, a native app that plays with no
internet connection; `make mac-app-dmg` adds a `.dmg`. The shell is
Electron and deliberately tiny: `main.mjs` (window, menu, navigation
lock, the `--smoke` self-check), `serve.mjs` (the `app://` → file
mapping, unit-tested in `desktop/test/`) and `electron-builder.yml`.
`scripts/build-mac-app.sh` drives it — build `web/` with
`VITE_PACKAGED=1`, assert the bundle is self-contained
(`scripts/check-offline-assets.mjs`), stage it into `desktop/app/`,
package, ad-hoc sign, then launch the built `.app` to check it.

The bundle is served over a **standard, secure `app://` scheme**, never
`file://`: the game needs an origin, or `localStorage` (settings, best
times), `history.replaceState` (share links) and the root-absolute
`url("/fonts/…")` in `styles.css` all break. Assets are read through
`fs`, not `net.fetch("file://…")`, because a packaged app keeps them
inside `app.asar`. `VITE_PACKAGED=1` — shared with the iOS build below —
is the only thing the web app knows about being packaged, and it only
*removes*: no service worker (there is no deployed build to cache) and no
"Check for updates" row (`__APP_PACKAGED__`). **Keep the offline property
enforced, not assumed** — `make desktop-smoke` runs the real app with
every off-bundle request cancelled and fails if it asks for one URL it
does not carry; it works on Linux/CI under Xvfb with SwiftShader. See
`desktop/README.md`.

## iOS app (`ios/`) — the iPhone build, and the only one that can buzz

`make ios-app` (macOS only) packages the **TypeScript app** as an iPhone
app: the built bundle is synced into a Capacitor WKWebView project and
Xcode signs and installs it. `make ios-run` builds straight onto a
connected phone; `make ios-prepare` does everything but the Xcode half and
so runs anywhere (Linux, CI). `scripts/build-ios-app.sh` drives it — build
`web/` with `VITE_PACKAGED=1`, assert the bundle is self-contained
(`scripts/check-offline-assets.mjs`), then `npx cap sync ios`.

The Capacitor project root is **`web/`** (`web/capacitor.config.json`,
with `ios.path` pointing at `ios/`), not `ios/`: the CLI and the pods
resolve from the same `node_modules` the app's own
`import { Haptics } from "@capacitor/haptics"` does, so the JS and the pod
that answers it cannot drift. `ios/App` is committed (it is Capacitor's
template plus the generated icons and an `Info.plist` line);
`ios/App/App/public` is the synced bundle and is not, like `desktop/app`.

**The haptics are the reason this exists.** `web/src/haptics.ts` is the
single seam and picks its mechanism at call time: natively it is
`impact(Light)` for a flag, `notification(Error)` for a mine and
`notification(Success)` for a win; in a **mobile** browser with the
Vibration API — Android, in practice — `navigator.vibrate` with a pattern.
Nowhere else, and `hapticsSupported()` is that rule: a desktop browser
defines `navigator.vibrate` with nothing to shake, and iOS Safari offers no
web haptic at all (the hidden `<input type="checkbox" switch>` tick that
once stood in for it is gone — it does not buzz). Both get no Settings ›
Haptics row, and `haptic()` itself is gated on the same check, so a stored
`haptics: true` carried over from a phone is inert. Where the row is shown
it turns everything off (stored like the sound preset, read on every
event). The trap: a plugin missing from Capacitor's `PluginHeaders` — what
the native side injects to say which plugins the binary carries — is
silently served by its **web** implementation, so the app builds, runs and
does nothing on the phone. `web/tests/e2e/haptics.spec.ts` pins the whole
chain without a device, booting the page with Capacitor's real
`native-bridge.js` over a fake `webkit.messageHandlers.bridge` and
asserting what a played board posts to the native side. See
`ios/README.md`.

## Which version to change

Two front-ends live in this repo: the Python/pygame game and the
TypeScript/Three.js app in `web/`. **When a request does not say which one
it means, it means the TypeScript app** — change `web/` (and the shared
`data/*.json` when the change belongs there). Touch the Python game only
when the request names it, or when a shared-`data/` edit necessarily
carries over.

## Pull requests

Do not commit PR screenshots to `docs/screenshots/` (that folder holds only
the curated README shots: the gallery, rendered from the TypeScript app by
`cd web && npm run screenshots`, and the one pygame shot under
`docs/screenshots/pygame/` from `make screenshots`).
