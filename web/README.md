# Hypersweeper — TypeScript + Three.js app (`web/`)

The TypeScript rewrite (Three.js / WebGL) of the Python game. This is the app
served at the site root by Cloudflare Pages; the pygame build stays in the repo
as the reference implementation and is not deployed.

**This file is the milestone history** — what each milestone changed and why,
newest first. For the rules and reference an agent needs while working here, see
[`AGENTS.md`](AGENTS.md) and the topic files in [`docs/`](docs/) it routes to.

**M20 — A volume board: the cube of cubes.** Every board up to here is a
*surface* — a tiling of the plane, of a polyhedron, or of an immersed manifold —
and two cells are neighbours when their polygons share a vertex. `cube3d` is the
first **volume**, and it keeps that rule by lifting it one dimension: the cells
are the unit *cubes* of an `n**3` block, and two are neighbours when their cubes
share a corner. That is the 3x3x3 block around a cell minus itself — **26**
neighbours, against 21 for the densest surface in the zoo — and it is exact
integer arithmetic, so nothing is rounded together to make a neighbour.

The design problem is that **a solid cube shows only its shell**: 98 of 512
cells at `n = 8`, and none of the inside. Three ways out, and only one of them
is a game:

- *Draw the cube and cut into it* — a slice you step with the header chevrons,
  everything in front of it hidden. Faithful, and unplayable: a number counts
  mines across slices `k-1`, `k` and `k+1`, so reading one means flipping back
  and forth and holding two hidden layers in your head.
- *Lay the slices out flat* — every 3D-minesweeper that works does this. It is
  readable, and it is a 2D board with an unusual adjacency; nothing about it is
  3D but the arithmetic.
- **Take the cube apart and leave it in space**, which is what shipped. Each
  slice is its own sheet of tiles; the sheets are laid out on a
  `ceil(sqrt(n))`-column grid and each is stepped back in depth by its slice
  index. Nothing is hidden and nothing occludes anything, so all three slices a
  number spans are readable at once — and the depth ramp is the only thing that
  says which sheet is which, so it is tuned to be plain at the board's starting
  orientation without perspective shrinking the far sheets past legibility.

It is still a `Board3D`, so the perspective camera, the trackball, silhouette
framing and the 3D pins arrive as they are. Two details of the layout are
load-bearing. **A grid of sheets, not a row**: eight sheets in a row is a 9-to-1
board, and `frameSolid` fits one of those into a sliver of a phone screen; on a
grid it comes out 8x8, 18x12 and 26x26 cells at the three sizes. And the board
is **two-sided**, because open sheets have rims and front-face culling would
make the whole thing vanish the moment it was turned past ninety degrees — which
costs it the raised-button relief (a two-sided board draws flat tiles, see "Cell
styles" in [`docs/render.md`](docs/render.md)) and leaves the closed/opened read
to the palette step, which carries it.

Three things had to be built rather than inherited:

- **Symmetries measured off the cells, not off the drawing.**
  `solidSymmetries` works because a solid is drawn as the thing it is, so every
  symmetry of the polyhedron is a symmetry of the picture. Pulling the slices
  apart leaves none of the cube's forty-eight in the picture. They all survive
  in the *cells* — any signed permutation of `(i, j, k)` carries
  Chebyshev-distance-1 pairs to Chebyshev-distance-1 pairs — so `boards/volume.ts`
  offers them as candidates and `keepSymmetries` checks them against the
  adjacency, the route `surfaces.ts` already takes and with the same guarantee
  that nothing is asserted from the algebra. `ring`, `tube` and `mirror-ring`
  stand after the redundancy pass, and they are the only way to move this
  board's contents at all: dragging turns the drawing, and the drawing is the
  cube taken apart rather than the cube.
- **Digits past 12.** `glyphFor` clamped at `Math.min(mines, 12)`, so a 13 would
  have drawn as a **12** — the wrong number, not a missing one. The atlas bakes
  1..`MAX_DIGIT_GLYPH` now, and `tests/unit/conformance.test.ts` measures every
  board in the catalogue against it, so no future board can out-count it
  unnoticed.
- **A calibration that could see the board.** The reference solver abandons a
  game whose frontier DP exceeds its node budget, and the games it cannot finish
  are the *tangled* ones — so where abandonment is common the surviving sample
  is biased toward the untangled layouts and the search settles on too few
  mines. At 26 neighbours that is not a rounding error: medium reported 0.875
  over *two* finished games at the default 4,000 nodes. `calibrate.py --budget`
  is the fix, a flag rather than a new default because raising the default would
  silently re-grade every row already in the checkpoint. See "Measuring the size
  and the mine count" in
  [`../docs/agents/difficulty.md`](../docs/agents/difficulty.md).

Sizes are measured as everywhere else, and `resize` picks 4/6/8 (64/216/512) on
its own. Easy and medium land 21% and 16% under the 81/256 targets because the
only knob is the side of the cube; the mode joins `COARSE_GEOMETRY` beside the
fractals, which quantise the same way by whole substitution steps.

**M19 — Theme and colour scheme, apart.** M18 folded appearance into one theme,
and folded one setting too many in with it: Light and Dark were the *same* look
(both cut with the `flat` style, neither textured) on two palettes, while Classic
and Realistic were two looks with no dark form at all. So the glass tiles on a
dark page were unreachable, and nothing in the app knew what the device
preferred. Appearance is two settings again — but on the two axes that are
actually independent, so every combination exists rather than most of them being
undesigned:

- a **theme** — how the cells are cut and what the page is made of. **Realistic**
  (now the default), **Flat**, **Classic**, one per entry in `cellStyle.ts`.
- a **colour scheme** — which palette the chrome paints with. **Auto** (the
  default: the device's own `prefers-color-scheme`, resolved live, so a phone
  that switches itself at dusk takes the page with it), **Light**, **Dark**.

A theme therefore names a *pair* of palettes, and the two the pygame presets
could never supply are the new web-only ones: `classic`/**`classicDark`**, a
black page under the same gray beveled board. The board itself does not go dark —
it is lit head-on by a fixed rig and reads the same either way, which is what the
old Dark theme already shipped. The one thing that did have to follow the scheme
is the **custom-backgrounds hairline**: its ink is baked into a data URI, and
`#4a5568` at 7% over `#101014` moves a pixel by four values in 255, so the dark
page gets a *lighter* ink at its own alpha — and the scheme joins the memo key,
or the first scheme to open a tiling hands its tile to the second. See "Settings
and themes" below, including the v3→v4 migration.

**M18 — One look setting.** Appearance was two pickers that had to be paired by
hand — a chrome palette and a cell style, sixteen combinations, most of which
nobody designed. They are now one **theme** (`src/ui/theme.ts`), and there are
four:

- **Light** — the `ios` palette, flat colour tiles. The default.
- **Dark** — the same board on the web-only dark palette.
- **Classic** — the `classic` palette and the beveled button, drawn in **gray**:
  the one place a cell style reaches past relief into colour
  (`CellStyle.monochrome`), because the 1990s board never had a colour on it but
  the numbers. Its two grays are a quotation of the pygame board's own
  `HIDDEN_FACE`/`REVEALED_FACE`, and the style carries the albedo that pays back
  what the diffuse shading takes, so a top face lands on them exactly rather
  than on the third of them a lit board would otherwise show.
- **Realistic** — the `ios` palette over a **textured page**, with glass-bead
  cells: a five-loop dome on the plane, a specular sheen that sweeps across a
  solid as it is dragged around, and **translucent opened cells** on a flat
  board, so the page's grain shows through the tiles you have opened. Its two
  states are two *materials*: a closed cell is polished (a bright centre
  hotspot), an opened one matte (`CellStyle.openShade` — a nearly flat gradient
  over a flat-floored pan), which tells them apart on a third channel besides
  the relief and the tone.

Two more things the four needed. **Classic is the pygame board's own gray** —
`SHAPE_PALETTE.board.mono` quotes `HIDDEN_FACE`/`REVEALED_FACE` from
`minesweeper/gui.py` (guarded by `tests/test_theme_sync.py`) rather than reusing
the shape palette's anchors, whose hidden→opened step was widened for *colour*
and reads far too wide in gray; and the style carries `albedo: 3.08`, which is
`1 / 0.32`, the measured diffuse return of a head-on top face, so a closed tile
lands on `#bdbdbd` and an opened one on `#cdcdcd` instead of on a third of them.
**Realistic's two states are two materials** — polished closed, matte opened
(`CellStyle.openShade` plus a flat-floored open profile), because a centre
hotspot is what reads as shiny and flattening it is what reads as matte.

Two pieces of the renderer moved to make the glass work. The across-the-tile
gradient (`CellStyle.shade`) used to paint the top face alone, which on a
five-loop profile is a bright disc on a flat field; it now **ramps over the
loops**, so a style can buy a smoother dome by adding relief. And the flat tiles
of a two-sided surface (cylinder, Möbius, Klein) had no gradient at all, because
they have no loops to ramp over and the Klein clip can leave a vertex anywhere in
them — they now measure it **off the geometry**, distance from the cell's centre,
which survives the clip and gives those surfaces the same bead. The eight
palettes stay in `data/ui/screens.json` (pygame's six plus the two web-only dark
halves, guarded by `tests/test_theme_sync.py`); a theme *composes* a light/dark
pair of them rather than adding colours to one. Stored settings migrate: the old
palette/cell-style pair is read together, so a player who had picked the glossy
cells lands on Realistic rather than being flattened with everyone else, and the
v4 split takes the colour scheme back out of the theme. The menu header also moved its **?** to
the left edge, one button per side, so "Hypersweeper" — a single unbreakable word
— keeps the whole middle and stays on one line on a 320px phone. See "Settings
and themes" and "Cell styles" below.

**M17 — Play-first menu.** The home page is no longer the geometry tree: it is
**Classic**, **Flat**, **3D** and **Custom** (`src/ui/menu.ts`). Flat and 3D are
one tap each for a random board — the flat picker's pool, and every flat
manifold plus every solid — which is why the per-picker Random
row is gone. Custom holds what the root used to be (Flat, Flat manifolds,
Sphere, Platonic solids, Catalan solids, Polyhedra — four flat board lists
declared by one `menu.solidGroups` table in `data/catalog.json`), and inside
every tiling picker the three regular tilings are
**promoted** to rows of their own, so a surface page reads Triangles · Squares ·
Hexagons · Uniform · Laves · … . On the plane that leaves the Regular family
holding the shaped boards alone, relabelled **Non-square boards**. The header
gains a **?** beside the gear, opening a How-to-play page (`src/ui/help.ts`)
built like the settings pages. All of this is web-only: it is derived in the
"web menu" section of `src/boards/catalog.ts` (`menuTilingRows`,
`menuFamilies`, `menuFamilyRows`, `flatMenuModes`, `threeDMenuModes`,
`MENU_FAMILY_LABELS`) from the shared port above it, so `data/catalog.json` and
the pygame menu are untouched and keep their own shape.

**M16 — Sound.** The game has a voice (`src/audio/`), synthesised rather than
sampled — there is no audio file in this repo, and there is not meant to be. A
sound here is *parametric*, and that is what a folder of clips could not be:

- **A tile is heard as the shape it is.** A cell's side count picks its pitch
  (a step down the preset's scale per side, so a triangle pings at the top of
  the range and a hexagon sits below it) *and* the number of harmonic partials
  its tone is built from — three for a triangle, six for a hexagon. Measured by
  the same `shapeMetrics` the shape *colours* come from, so a tile that looks
  like a pentagon sounds like one on every board, T-vertices dropped and all.
- **A click and a chain reaction are different sounds.** One opened cell is one
  note; a flood fill is a **cascade**, one grain per ring of the spread, walked
  over the game's own adjacency so the wave arrives in the order the flood
  actually reached the cells, rising in pitch and falling in level as it goes.
  It is staggered at the reveal ripple's own pace, so the wave is seen and
  heard together, and thinned to a budget so half a board opening stays a wave
  and not a wall.
- **Stereo is where the cell is on screen.** Each grain is panned by the cell's
  projected x (`BoardRenderer.panFor`), not by its place in the mesh — so it
  follows the zoom, the pan, the portrait quarter-turn and a solid's rotation,
  and a cascade sweeps across the field as it spreads.
- **The Klein arrows are opposites.** Forward glides up while it sweeps left to
  right; back is that exact figure reflected in both axes (a unit test pins the
  reflection, not merely that the two differ).
- **Three presets and Off**, under Settings › Sound: Chime, Arcade, Blocks.
  Picking one plays it — a preset is a sound, and the click that chooses it is
  also the user gesture a browser needs before audio may start at all.

The pygame build stays silent: this is a web-only feature, so the presets live
in TypeScript rather than in the shared `data/ui/screens.json`. See "Sound"
below.

**M6 — Polish.** Board animations (`src/render/animations.ts`), driven by a
single `CellAnimations` clock the renderer ticks each frame only while
something is in flight (the loop stays idle otherwise): a **reveal ripple**
(each freshly opened cell flashes brighter than its settled tone, staggered by
its distance from the click so a wave sweeps outward across a flood fill), a
**flag drop** (a flag placed by *holding* a cell arrives several cells tall,
standing on that cell, and shrinks into it — the finger doing the holding is
covering the cell, so only a flag reaching well above it can be seen at all;
a right-click and a tap in flag mode leave the cell in plain sight and get
nothing), a **flag pop** (a flag the *game* places — the win wave's
auto-flag cascade — springs in with a small ease-out-back
overshoot), a **lose shake** (the whole board jitters and settles when a
mine detonates), and a **win wave** (clearing the board sends a gold glow
sweeping out from the winning cell over every tile, with the mines the win
auto-flagged popping their flags in as it reaches them). Both meshes own their
buffers, so the clock only reports what to redraw (recolour these cells /
rebuild glyphs / offset the board). Animations
honour `prefers-reduced-motion` out of the gate and can be toggled at runtime
through the `window.__ms.animations(false)` test seam; the Playwright suite runs
under emulated reduced-motion, so every visual baseline captures the settled
frame and gameplay assertions stay timing independent. iOS install polish:
`viewport-fit=cover` with safe-area insets on the header and menu,
`touch-action: none` + `-webkit-touch-callout: none` on the canvas, apple- and
standard `mobile-web-app-capable` metas, and the maskable/apple-touch icons the
PWA manifest already ships. The board carries its own bounded pinch/wheel zoom
and pan, and the browser's page zoom is blocked outright — see **Zoom** below.
There is **no bundle-size budget**: the app is a one-time download that a
service worker then caches, and looking right is worth more here than shaving
kilobytes off first load, so nothing in CI fails on size (see "Bundle size"
below). **All 112 modes, polished.**

**M15 — The Gosper island.** A fifth board in the **Fractals** family, and the
first whose *boundary* is the fractal rather than its interior: plain regular
hexagons, no holes at all, in a patch whose outline converges on the **Gosper
island** — the closed curve the flowsnake draws. The hexagon is no rep-tile
(seven of them make a flower, not a bigger hexagon), so unlike the first four
there is nothing to inflate but the *patch*: seven level-(n−1) islands, one in
the middle and six around it, are the level-n island. Three things it brings:

- **An inflation that turns.** The triangular lattice is the ring of Eisenstein
  integers Z[ζ] (ζ = e^(iπ/3)), and the inflation is multiplication by 2 + ζ, of
  norm 7 — a **spiral similarity**, √7 at 19.106°. It could not be anything else:
  scaling by √7 alone would send the lattice point 1 to (√7, 0), which is no
  lattice point. `scale` is therefore no longer a pure scaling, and
  `test_a_substitutions_scale_is_its_factor` pins the length and the *sameness*
  of the turn rather than assuming there is none.
- **Seven children that are seven residues.** The flower's translations are
  {0} and the six units, times θ = 1 + ζ — a complete set of residues modulo
  2 + ζ (the quotient ring is F7). That is exactly what makes the level-n patch
  the 7ⁿ digit strings θ·Σ d_k (2 + ζ)^k with nothing repeated and nothing left
  out, and the flower tile the plane by the inflated lattice.
- **A fractal edge on a plain disc.** 7ⁿ hexagons behind only 6·3ⁿ boundary
  edges: area ×7 a level, perimeter ×3, so the outline's dimension is
  log3/log√7 = 1.129 while what it encloses is a disc (χ = 1, one boundary
  circle) — no holes, unlike the carpet and the pentaflake. The digits are
  closed under multiplication by a unit, so the patch keeps the hexagon's
  six-fold rotation at every level, but never a mirror past level 1: the
  flowsnake is chiral, and the board shows it.

Its hexagons meet edge to edge, so like the carpet and the pentaflake it needs no
collinear step vertices. Difficulty is a level of inflation: level 2 (49 cells)
easy, level 3 (343) medium, and at ×7 a level there is no fourth size worth
playing, so hard reuses the level-3 patch at the classic hard board's ~20% mine
density, as the carpet and the pentaflake do. **All 160 modes.**

**M14 — The pentaflake.** A fourth board in the **Fractals** family: Dürer's
pentagon, the regular pentagon scaled by φ² and refilled with six — one seated
in each corner, sharing that corner with the parent, plus one in the middle
turned a half turn. The six cover 6/φ⁴ of the inflated pentagon and what is left
over is five **golden gnomons** (36-72-72 triangles), one per side, so like the
carpet it is a fractal with holes rather than a dissection. Three things it
brings that the first three did not:

- **Its lattice is not integer.** Five-fold symmetry needs rank 4 — no lattice
  of two integers carries a 72° rotation — so its vertex ids live in the
  cyclotomic ring **Z[ζ10]** (ζ = e^(iπ/5)), as Penrose's do in Z[ζ5]. A
  `LatticePoint` is now a tuple of *however many* integers the lattice needs, and
  nothing in the shared machinery may index a coordinate by name. φ² = 2 + ζ² − ζ³
  is exact in that ring, and the inflation only ever *multiplies* by the factor
  (`inflate`), because an irrational scale cannot be divided back out of a lattice
  point.
- **Holes that are born, not built in.** At level 1 the five gaps still open onto
  the patch's own boundary, so the patch is a disc. A hole appears where two
  supertiles are glued along a whole edge — the five middle-to-corner edges of
  every substitution — and each such edge carries 2ⁿ⁻¹ − 1 gaps down its length,
  one from every scale below. That gives (6ⁿ − 5·2ⁿ + 4) / 4 holes, hence Euler
  characteristic 1 − holes and holes + 1 boundary circles.
- **Five neighbours, never more.** Three pentagons and 3·108 = 324° meet at a
  corner, so a fourth cannot reach one: a cell touches a neighbour either across
  a whole edge or at a single corner, and five sides is the ceiling.

Difficulty is a level of inflation: level 2 (36 cells) easy, level 3 (216)
medium, and at ×6 a level there is no fourth size worth playing, so hard reuses
the level-3 patch at the classic hard board's ~20% mine density, exactly as the
carpet does. **All 159 modes.**

**M13 — The Sierpinski carpet.** A third board in the **Fractals** family, and
the first one that is not a rep-tile: the unit square tripled and refilled with
eight copies of itself — the 3×3 block *minus its centre*. The children do not
fill the inflated tile, and that missing middle ninth, repeated at every scale,
is the board. It reuses the family's inflation machinery unchanged; the
`Substitution` record (ex-`RepTile`) just gained a `factor`, the linear scale of
one inflation, so a level is ×3 in size and ×8 in cells (1, 8, 64, 512, 4096)
instead of ×2 and ×4. Two consequences worth knowing:

- **It is the one flat board that is not a disc.** A level-*n* carpet has
  (8ⁿ − 1) / 7 square holes, so its Euler characteristic is 1 − holes and its
  boundary has holes + 1 components. No hole ever touches another (their
  closures are disjoint), so the patch stays a mesh with every edge walked once
  per side, and the board is still one connected component to play on.
- **No cell ever has eight neighbours.** Any 3×3 window of the grid holds
  exactly one cell whose two coordinates are both ≡ 1 (mod 3), and that cell is
  always a hole — so the carpet plays looser than the square board it is cut
  from, with 7 neighbours at most.

Its cells are unit squares meeting edge to edge, so unlike the sphinx and the
chair it needs no collinear step vertices. Difficulty is a level of inflation
where the growth allows: level 2 (64 cells) easy, level 3 (512) medium; ×8 per
level leaves no fourth size worth playing — 4096 cells is far past legible — so
hard keeps the level-3 patch and raises the mine density to the classic hard
board's ~20%. **All 158 modes.**

**M12 — Fractal (rep-tile) boards.** A new **Fractals** family in the flat
tiling picker (`src/boards/fractal.ts`), holding two rep-4 boards: the
**sphinx** (the pentagonal hexiamond — six unit triangles, sides 3·1·1·1·2) and
the **chair** (the L-tromino). A rep-tile tiles a scaled copy of itself, so a
board is one tile inflated `levels` times — 4**levels tiles whose outline is the
tile again, scaled. That self-similar outline *is* the board: unlike every other
flat board these are deliberately not a rectangular window (trimming the patch
would throw away the only thing that makes them what they are), which puts them
with the shaped boards as the exception to the square-window convention. The
sphinx's dissection is unique — an exact-cover search of the size-2 sphinx finds
exactly one arrangement, with three of the four children reflected — and the
chair's is the classic reflection-free one, four quarter-turns. Both lattices
are integer and each child translation is the parent's scaled by a power of two,
so a placement stays an exact `(rotation, mirror, integer translation)` triple
all the way down. Neither tiling is edge to edge, so tile outlines carry a
vertex at every lattice step along their edges: the collinear ids are what let
shared-vertex adjacency see a neighbour that plants its corner mid-edge, and
`shapeMetrics` drops them again so the sphinx measures as a pentagon and the
chair as a hexagon. Difficulty is a level of inflation: 3/4/5 for the chair
(64/256/1024 cells), one step lower for the sphinx, whose tile is a long sliver
that needs more room per cell (16/64/256).
**All 157 modes.**

**M11 — The phyllotactic spiral.** A fourth entry in the **Aperiodic** family
(`src/boards/aperiodic.ts`): one equilateral convex hexagon (angles 72°/144°)
in a five-fold spiral — the sunflower head a Voronoi tessellation of a
phyllotactic spiral draws, built exactly and from one congruent tile rather
than sampled from spiral points. It is the one aperiodic board here with **no
substitution**: the hexagon is a parallelohexagon, so it tiles periodically on
the lattice `a = u0+u1`, `b = u1+u2`, those two sit 36° apart, and ten rotated
copies of that lattice *quadrant* fill the plane. Pushing the odd wedges one
edge out along `u1` is the entire spiral — five tiles meet at the centre, the
seam between wedges winds instead of running straight, and the patch has C5 but
neither C10 nor a mirror. Nonperiodic follows from the symmetry alone: by the
crystallographic restriction a tiling with a five-fold centre has no
translation, and laying it is forced — from the five-tile rosette exactly one
placement fits each innermost gap. Runs in ℤ[ζ5], the ring the Penrose board
already uses, so vertex ids are exact integer tuples; the trim is measured from
the true centre (rather than a sampled centroid) and quantised, so Python and
TypeScript pick the same cells. **All 155 modes.**

**M10 — Cell styles.** How a cell is *cut* is part of the **theme**
(`src/render/cellStyle.ts`): a stack of concentric loops per cell plus a finish,
which both meshes build their geometry from, so the two renderers stayed as they
were. It shipped as a picker of its own beside the theme and was merged into it
in M18 (below). Colour is untouched by all of it: it is still the shape
palette's, which in the same pass got a **wider size axis** — the isogonal
tilings' two or three sizes of one polygon now differ in lightness, hue and
chroma at once rather than by a lightness whisper. See "Cell styles" and "Shape
colour coding" below.

**M9 — The Spectre.** A third entry in the **Aperiodic** family
(`src/boards/aperiodic.ts`): Tile(1,1), the *chiral* aperiodic monotile, tiled by
the paper's own reflection-free substitution over nine collared cluster types
(Γ the Mystic + eight collared Spectres), transforms ported from Craig S.
Kaplan's `spectre` reference. Unlike the Hat (this game's original aperiodic
monotile board, since removed as a menu entry) there is **no
floating point anywhere**: every edge direction is a multiple of 30° and every
placement is `z ↦ ζᵏz + t` (ζ = e^{iπ/6}), so the whole substitution runs in
ℤ[ζ12] on integers. That is forced rather than tidy — ℤ[ζ12] is *dense* in the
plane, so there is no lattice to snap a float vertex back to, and a placement is
carried as an exact `(rotation mod 12, mirror, translation)` triple instead. The
tile is held as an equilateral **14-gon**: the 14th corner is the collinear one,
kept so a neighbour's corner landing there is a shared vertex id and dropped
again by `corners`/`shapeMetrics`, so it measures as the 13-gon it is drawn as.
Every inflation composes one reflection, which `spectreBoard` cancels at the
seed — so no tile is ever mirrored at any level, which is the whole point.
**All 118 modes.**

**M8 — Congruent-rectangle bonds.** The five brick bonds tiled by one congruent
**rectangle** rather than by regular polygons (`src/boards/tilings.ts`, ported
verbatim from the Python side): stacked bond, running bond, basket weave, the
same weave three bricks at a time, and herringbone. Bricks are length 1 by
height `r`, so a preset's `scale` is px per brick length; each bond is one
rectangular domain — one brick, two, or a 2 x 2 block of them — and the
staggered four reuse `insertTVertices`, since a brick corner landing inside a
neighbour's edge is the same T-vertex the isogonal family has. The flat tiling
picker gains a **Congruent rectangles** family submenu (plane only, no wraps
yet), and the icon generator gains a `"domain"` patch style: a bond is drawn as
whole periods of itself, the only figure that shows a stagger (its vertex
rosette is two or three bricks — an L or a plus sign). Two of the five are
affine copies of boards the game already had — a stacked bond is the classic
8-neighbour square grid stretched and a running bond is the offset square
tiling stretched — so they play as those do and are here for the look. **All
117 modes.**

**M7 — Isogonal tilings.** The six isogonal tilings by convex regular polygons
that are **not edge to edge** (`src/boards/tilings.ts`): offset square,
staggered triangular, Pythagorean, rotated hexagonal, rotated triangular and
three-scale triangular, each the most symmetric member of a one-parameter
family. A tile's corner landing inside its neighbour's edge is recorded as a
vertex of the split tile (`insertTVertices`), which is what keeps shared-vertex
adjacency — and the Euler/boundary counts — working; it is collinear, so the
tile is drawn and measured as the regular polygon it is. The flat tiling picker
gains an **Isogonal** family submenu (plane only — these have no surface wraps
yet), and the shape palette gains a size axis, since two of them use one
polygon at several sizes. **All 112 modes.**

**M5 — Aperiodic tilings.** Ports `src/boards/aperiodic.ts`: the Penrose P3
rhombi (exact ℤ[ζ5] vertex arithmetic, Robinson-triangle deflation) and the Hat
monotile (H/T/P/F metatile substitution in floating point, each vertex snapped
back to an exact Eisenstein integer id). Both grow generously and trim to the
centremost cells by Chebyshev distance for a roughly square patch (M9 adds the
Spectre on the same pattern). Their
difficulty presets move into the shared `data/presets.json` (so the conformance
oracle covers them), and the flat tiling picker gains an **Aperiodic** family
submenu (plane only). **105 modes.**

**M3 — Surface wraps (regular tilings).** Wraps the square / triangle /
hexagon tilings onto the four surfaces (`src/boards/surfaces.ts`): the closed
torus, the open two-sided cylinder, and the non-orientable Möbius strip and
Klein bottle — twelve new modes. Two-sided surfaces draw each cell as a flat
`DoubleSide` tile on the surface (no raised bevel, which would read as a recess
from the inside), so a cell looks and plays the same from either face; grout
under the tile gaps and depth-tested glyphs (occluded numbers hidden by nearer
geometry — also fixing bleed-through on the closed frames) complete the look.
The Klein bottle carries a `cellCycle` (a ring-translation graph
automorphism); the session scrolls it as a **view-layer permutation** — a
`remap` between geometric faces and the game cells painted on them — so cells
hidden behind the neck rotate into view (mouse wheel / two-finger scroll /
`[` `]` keys / the two header chevrons, back and forward) while the geometry
and game state stay put. The Flat-manifolds menu drills surface → tiling →
difficulty (under **Custom** since M17). 27 modes.

**M2 — 3D renderer + solids.** Ports the ten closed 3D boards (pentagonal
hexecontahedron, snub dodecahedron, the two Goldberg polyhedra, geodesic
icosahedron, cube, tetrahedron, cube frame, tetrahedron frame, stepped
bipyramid) and adds the
3D half of the render pipeline: perspective camera, a custom trackball
(drag to rotate, arrow keys too), per-mode starting orientations, back-face
culling with an opaque base layer under the tile gaps, and a
`gl_FrontFacing` dimming shader ready for M3's two-sided surfaces. The
input state machine disambiguates tap / long-press / drag-rotate. 15 modes.

M0 (scaffold + pipeline proof: Vite, strict TS, PWA shell, CI/Pages) and M1
(core game rules, the five flat regular boards, HUD/menu from shared
config, deep links `?mode=&difficulty=&seed=`, the `window.__ms` test seam)
are the foundation this builds on. Boards are built from the **same**
`data/*.json` the Python game reads, and a conformance oracle
(`data/conformance.json`) asserts the two implementations produce identical
boards.

---

The conformance oracle and what it cannot see is documented in
[`../docs/agents/shared-data.md`](../docs/agents/shared-data.md).

## Reference

This README stops at the history. Everything else moved to files an agent can
read one at a time:

- [`AGENTS.md`](AGENTS.md) — what this app is, the rules every change here
  holds to, and the `src/` layout.
- [`docs/testing.md`](docs/testing.md) — commands, and driving the app headless.
- [`docs/ui.md`](docs/ui.md) — menu, settings and themes, dialogs, share links,
  best times, achievements.
- [`docs/render.md`](docs/render.md) — cell styles, zoom, picking, shape
  colours, 3D markers, the Klein clip.
- [`docs/boards.md`](docs/boards.md) — board symmetries and their controls.
- [`docs/audio.md`](docs/audio.md) — sound.
- [`docs/deploy.md`](docs/deploy.md) — sharing, analytics, Cloudflare, PR
  previews, the packaged builds.
