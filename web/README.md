# Hypersweeper — TypeScript + Three.js app (`web/`)

The TypeScript rewrite (Three.js / WebGL) of the Python game, per
`docs/plans/typescript-rewrite-same-repo.md`. This is the app served at the
site root, by GitHub Pages and Cloudflare Pages both while the game moves
between them; the pygame build stays in the repo as the reference
implementation and is not deployed (see **Deploy** below).

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
which survives the clip and gives those surfaces the same bead. The seven
palettes stay in `data/ui/screens.json` (pygame's, guarded by
`tests/test_theme_sync.py`); a theme *composes* one rather than adding colours to
it. Stored settings migrate: the old palette/cell-style pair is read together, so
a player who had picked the glossy cells lands on Realistic rather than being
flattened to Light with everyone else. The menu header also moved its **?** to
the left edge, one button per side, so "Hypersweeper" — a single unbreakable word
— keeps the whole middle and stays on one line on a 320px phone. See "Settings
and themes" and "Cell styles" below.

**M17 — Play-first menu.** The home page is no longer the geometry tree: it is
**Classic**, **Flat**, **3D** and **Custom** (`src/ui/menu.ts`). Flat and 3D are
one tap each for a random board — the flat picker's pool, and every flat
manifold plus the spheres and polyhedra — which is why the per-picker Random
row is gone. Custom holds what the root used to be (Flat, Flat manifolds,
Sphere, Polyhedra), and inside every tiling picker the three regular tilings are
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

## Commands

```sh
cd web
npm install
npm run dev         # Vite dev server
npm run typecheck   # tsc --noEmit (strict), twice: the app, then functions/
npm run test        # vitest unit tests
npm run build       # typecheck + vite build (production bundle + PWA)
npm run e2e         # Playwright e2e + visual regression
npm run e2e:update  # refresh visual baselines
```

`typecheck` runs `tsc` twice because the Pages Function in `functions/` is a
Worker, not a page: no DOM, and the Cloudflare globals instead. It gets its own
`tsconfig.functions.json`, which also compiles the shared `src/analyticsEvent.ts`
under a DOM-less lib — which is what proves that file stayed pure.

From the repo root, `make metrics` prints play counts and win rates from the
deployed app (see "Analytics" below); it needs `CF_ACCOUNT_ID` and a read-only
`CF_API_TOKEN`.

Cloud sessions: `@playwright/test` is **pinned** (not caret-ranged) to the
version whose bundled Chromium build matches the one preinstalled in the Claude
cloud image (`/opt/pw-browsers/chromium-<build>`), so `npm run e2e` resolves the
preinstalled browser and runs directly — no download, no env var. Keep the pin
in step with the image when bumping Playwright: a caret range silently floats to
a newer build than the image ships, and e2e then fails with "Executable doesn't
exist". As a fallback for a mismatched image, point Playwright at whatever build
is present with
`PLAYWRIGHT_CHROMIUM_EXECUTABLE=/opt/pw-browsers/chromium-<build>/chrome-linux/chrome npm run e2e`
(the config honours it). CI installs the pinned build itself, so it is
self-consistent regardless of the image.

## Sharing the game

Three pieces, all aimed at the same thing: a board someone can hand to
someone else.

**The link preview.** `index.html` carries no social tags of its own — they are
injected at build time by the `socialMeta` plugin in `vite.config.ts`, because
`og:image` and `og:url` have to be **absolute** (a crawler runs no JavaScript
and will not resolve a relative one) and only the build knows where it is being
published. That comes from **`VITE_SITE_URL`**, origin *and* base path with a
trailing slash; both deploy workflows set it, and the default is the GitHub
Pages project site so a local build still emits valid tags. The plugin is not
applied to packaged builds: inside the macOS and iOS bundles there is no crawler
to read the tags, and an absolute `https://` URL in the HTML is exactly what
`scripts/check-offline-assets.mjs` exists to reject.

The card itself is `public/og.png`, 1200×630, written by `npm run og`
(`scripts/make-og-image.mts`) — rendered from the real app through the same
`window.__ms` seam and SwiftShader launch args the screenshot script uses, from
a fixed seed, so it is reproducible and cannot drift from what the game looks
like. It is a *solid* mid-game, because "minesweeper but on shapes" is the pitch
and a flat grid does not say it.

**The share button**, `src/share.ts`, split pure/impure like `sound.ts`:
`shareUrlFor`/`shareTextFor` hold every rule and are what the unit tests pin,
`shareBoard` wraps the browser. `navigator.share` first (on a phone that is the
share sheet), else the clipboard; a share sheet the player *cancels* falls
through to the clipboard rather than reporting failure, since dismissing one is
a normal outcome. The trap fixed there: `nav.clipboard?.writeText(…)` on a
platform with no clipboard evaluates to `undefined`, which awaits happily — so
the button would have said "Link copied" having copied nothing. It is offered in
two places, the header and the record window, and both pass the session's seed.

**The seed** is what makes any of it mean anything — see "Shareable board
links" above.

## Telling the player where they are

`src/ui/boardInfo.ts` owns the row under the header, and two things on it.

The **caption** names the board (`fullModeLabel`). Nothing on the game screen
did before, and the menu's Flat and 3D rows each open a *random* board — so a
player could be dropped on a truncated icosahedron with no way to find out what
it was. It is also what makes a screenshot of the game say what it is.

That row is also where the **Klein scroll chevrons** live, rather than in the
header. The header holds two slots a side — back and flag-mode, how-to-play and
share — around the centred counter/smiley/counter block, and seven controls is
what one row holds at 320px. The chevrons belong to the *board* rather than to
the game, they appear only on the one board that already has the most to fit,
and putting them back in the header wraps that row on exactly that board.
`tests/e2e/hud.spec.ts` pins all of this. They are declared in
`data/ui/screens.json` under `hud.boardBar`, beside the header's own clusters.

The **first-run hint** is the app's only onboarding: one dismissible line over
the first board this browser ever opens, saying how to open a cell and how to
flag one. Long-press-to-flag and right-click-to-flag were documented on the
how-to-play page and nowhere a new player would look. It is spent via
`settings.seenHint` (purely additive, so no `SCHEMA_VERSION` bump) and goes on
the first move. **Any test that screenshots a board must seed `seenHint: true`**
— every Playwright test gets a fresh context, so without it every board is a
first board, and the hint carries a seven-second timer a slow shot would race.

The how-to-play page is reachable **from inside a game** through the header's ?.
It opens over the live board — the canvas is hidden with `visibility`, not torn
down, so the mesh, the mine layout and the clock survive — and deliberately does
not go through `Menu.go`, whose stored `view` must stay the picker the game was
launched from.

## Agent notes: driving the app headless

Practical knowledge for verifying changes by actually running the app
(screenshots are the primary review artifact in this repo):

- **Ad-hoc screenshots**: `npm run build`, `npx vite preview --port 4173`
  in the background, then a small Playwright script against
  `http://localhost:4173/?mode=X&difficulty=Y&seed=N`. Launch Chromium with
  `executablePath` set to the preinstalled browser and the SwiftShader args
  from `playwright.config.ts` so output matches CI. Wait for
  `body[data-ready]` before shooting. **Put the script inside `web/`** —
  Node resolves `@playwright/test` from the script's location, not the cwd.
- **Menu icons**: `npx vite-node scripts/icon-gallery.mts out.html [group]`
  writes every menu icon (optionally only the groups whose heading matches
  `group`) onto one contact sheet, labelled with its key — the fastest way to
  review a change to `src/ui/icons.ts` without walking the menu. Most icons
  are generated from the real board geometry, so a change to a tiling,
  a solid or a surface immersion shows up here too.
- **App icon**: `node scripts/make-icons.mjs` (or `make desktop-icon` from the
  repo root) writes every icon the app ships — `public/favicon.svg`, the two
  PWA PNGs, the maskable and apple-touch ones, and `desktop/resources/icon.png`
  for the macOS build — from one vector source in that script. Two parts of it
  are quotations from the game and should stay in step with it: the pentagon is
  painted in the colour `shapePalette.ts` gives a five-sided cell, and the mine
  is `drawMine()` from `render/glyphAtlas.ts` transcribed to SVG at the same
  proportions. Rasterising is Chromium, so pass
  `PLAYWRIGHT_CHROMIUM_EXECUTABLE` where the browser is not on the default
  path. Review the result at *icon* sizes (16 px through the dock's 128), not
  at 512 — that is where a design either survives or turns to mud.
- **The `window.__ms` seam** is the way in: `cells()`, `startBoard(mode,
  difficulty, {mines|seed})`, `reveal/flag/chord(cell)`, `rotate(dx, dy)`
  (drag-pixels), `state()`. On 3D boards `cellScreenXY(cell)` returns
  `null` for cells facing away — filter for a visible cell instead of
  indexing blindly. `cellAtScreenXY(x, y)` is its inverse (the same raycast
  a tap runs), so a test can assert *which* cell a gesture landed on.
- **Screen positions need a rendered frame**: the board's world transform is
  applied when it renders, so `cellScreenXY` / `cellAtScreenXY` called in the
  same `page.evaluate` as `startBoard` read stale matrices and answer with
  cells from all over the board. Split the setup and the measurement across
  two round-trips, with an `await page.evaluate(() => new Promise((r) =>
  requestAnimationFrame(() => requestAnimationFrame(r))))` between them. A
  two-sided surface never culls, so `cellScreenXY` also reports positions for
  cells hidden behind the immersion — round-trip through `cellAtScreenXY` when
  the test needs a cell that is genuinely on top.
- **Flood-fill eats sparse fixtures**: on a closed surface a reveal floods
  around the whole solid past a thin mine wall, instantly winning the game
  (auto-flagging every mine). To stage a mixed hidden/revealed screenshot,
  reveal only cells adjacent to mines (each shows a number, so nothing
  cascades), or use a mine-dense fixture.
- **`--update-snapshots` does not touch a baseline that passes within
  `maxDiffPixelRatio` tolerance** (5% here). After an intentional small
  visual change (e.g. header tweaks), delete the affected
  `tests/e2e/gallery.spec.ts-snapshots/*.png` and regenerate, or the
  committed baselines silently keep the old pixels. Baselines are only
  authoritative under the pinned software-WebGL environment (CI, or a
  cloud session with the same launch args); regenerate them there, then
  re-run the spec to confirm determinism.
- **Playwright's `webServer` reuses a running port-4173 server** outside
  CI. `vite preview` serves `dist/` from disk, so an `npm run build` is
  enough to refresh it — but stale servers are a classic source of
  "my change has no effect".
- **Animations are off in the e2e suite** (`contextOptions.reducedMotion:
  "reduce"` in `playwright.config.ts`), so screenshots catch the settled
  frame. To eyeball an animation in an ad-hoc capture, launch Chromium
  *without* reduced-motion, call `window.__ms.animations(true)`, drive a
  move, then screenshot on a short `waitForTimeout` mid-flight — the reveal
  ripple/flag drop/flag pop/lose shake all settle back to the static baseline
  within ~0.5 s, the win wave within ~1 s on the biggest boards. Note that the
  *first* `page.screenshot` after a move costs ~1 s under SwiftShader
  (shader compilation), so take shots back to back rather than sleeping
  between them, or the whole animation is over before frame two. That cost is
  most of a short animation's life: pay it on a throwaway shot *before* the
  move, or the first real frame lands after the thing you meant to catch.
- The Python game is the behavior reference; run it headless per the
  "Screenshots" section in the repo-root CLAUDE.md when unsure how
  something is supposed to look or feel.

## Layout

- `src/game.ts`, `src/rng.ts` — pure game rules (port of `game.py`) and a
  seedable RNG.
- `src/boards/` — `core.ts` (Board/Board3D, adjacency, topology, vector
  helpers), `tilings.ts` (the flat regular builders), `aperiodic.ts` /
  `fractal.ts` (the aperiodic tilings and the self-similar boards), `solids.ts`
  (the closed 3D boards), `surfaces.ts` (the torus/cylinder/Möbius/Klein wraps,
  the Klein `cellCycle` and its self-intersection `clip`), `catalog.ts` /
  `presets.ts` (read `data/*.json`).
- `src/render/` — one Three.js pipeline: `renderer.ts` (scene, ortho +
  perspective cameras, trackball rotation, resize, picking),
  `boardMesh.ts` (shared cell-visual vocabulary — the neutral palette, glyph
  map, and `isOpened`, the raised/sunken predicate both meshes cut their
  geometry from), `shapePalette.ts` (the shape colour code, below),
  `polygonBoard.ts` / `solidBoard.ts` (merged beveled cell geometry —
  flat plane vs. solid surface — per-cell colours, hover, glyph quads; a
  closed cell is a raised button, an opened one is re-cut in place as a
  recess, which is what makes the two tell apart on a flat board lit
  head-on, where colour alone shades every face identically), `glyphAtlas.ts`
  (canvas-baked digit/flag/mine texture), `clip.ts` (cutting drawn triangles
  against a `SurfaceClip` field — how the Klein bottle drops the sheet its
  own neck encloses, so looking into the hole shows the tube instead of a
  cap; the surface outside the neck is untouched, so the self-intersection
  still reads from every other angle), `animations.ts` (the shared
  reveal-ripple / flag-drop / flag-pop / lose-shake / win-wave clock).
- `src/session.ts` — `GameSession`: Game ↔ mesh ↔ HUD.
- `src/input/controls.ts` — pointer/touch state machine (tap, long-press,
  right-click, drag-rotate on 3D boards, pinch-zoom and drag-pan on every
  board), plus `blockBrowserZoom` — the guard that keeps the *browser* from
  zooming the page (see "Zoom" below).
- `src/render/zoom.ts` — the pure view-transform arithmetic (zoom bounds, the
  anchor that holds a point under the fingers, the pan clamp), unit tested
  without a WebGL context; `renderer.ts` owns the state and applies it to
  whichever camera the board uses.
- `src/ui/` — HTML/CSS overlay chrome: `hud.ts` (header — laid out like the
  pygame one: back + flag at the left edge, the smiley on the exact screen
  centre with an equal-height LED counter either side of it, and the Klein
  scroll chevrons at the right edge, all on a single row that shrinks on one
  fluid scale to fit a phone; `tests/e2e/hud.spec.ts` pins that),
  `menu.ts` (home) and
  `icons.ts` (the menu glyphs as inline SVG, keyed the way the pygame menu
  keys them: a tiling key, a family key, a mode name or a home-page group key,
  painted in the board's shape colours. Most are **generated from the thing
  they stand for** rather than drawn — a uniform/Laves row from a patch of the
  real `_ArchTemplate` tiling (a tile with its ring of neighbours, a vertex
  rosette, or whole periods for a rectangle bond, per `PATCH_STYLE`), a sphere
  row from the real solid projected and
  back-face culled, a surface row from the real immersion meshed, depth-sorted
  and flat-shaded — so they cannot drift from the boards),
  both **rendered from the shared UI-screen config**.
- **The viewport the app lays out in** is `--app-h` (`styles.css`), never
  `100vh`: on iOS Safari `100vh` is the *large* viewport — the toolbars
  retracted — so a full-height fixed layer runs on under the bottom toolbar and
  a board centred in it sits half the hidden strip too low, all its slack above
  it. `App.syncViewport` keeps the var on `visualViewport.height` (`100dvh` is
  the CSS fallback) and re-frames on the visual viewport's own resize — a mobile
  browser grows and shrinks its chrome without ever resizing the window.
  `tests/e2e/layout.spec.ts` pins it by stubbing a shorter visual viewport
  (headless Chromium has no toolbar). One trap: the canvas is a *replaced*
  element, so state both its width and height — an auto one resolves to the
  drawing buffer's size, not to the offsets.
- **One measurement is not to be trusted: an iOS home-screen launch.** The app
  runs `apple-mobile-web-app-status-bar-style: black-translucent`, so the page
  is drawn from the very top of the screen, under the status bar — but WebKit
  sizes the viewport as if the page started *below* it. `visualViewport`,
  `innerHeight` **and `100dvh` alike** come back short by exactly the top
  safe-area inset (62px of an iPhone 16 Pro's 874), the app stops that far above
  the bottom of the screen, and WebKit fills the strip below it with the web
  view's own white — a band no theme touches, since the WebGL canvas is
  transparent. Two halves to the fix, and it needs both: `App.resolveHeight`
  lays the app out in the full screen height, and the `display-mode: standalone`
  rule in `styles.css` grows `html` by the same inset so the strip is painted.
  Correct *only* that exact signature — a standalone launch whose shortfall
  against `screen` **is** the top inset — because a shortfall otherwise means
  something really is covering the strip (a browser toolbar, an iPad PWA in
  Split View); both cases are pinned in `layout.spec.ts`. The inset reaches JS
  through the `--safe-top` custom property, read off a hidden probe element,
  which is also the seam the test stubs it through.
- **A solid is framed by its silhouette, not by its bounding sphere**
  (`BoardRenderer.frameSolid`). Boards are scaled to the unit sphere, but only
  a ball fills one: a cylinder or a Klein bottle covered about half the width
  of a phone screen and floated in a sea of background. The camera is instead
  fit to the board's hull points (`BoardView.hull`, collected by
  `solidBoard.ts`) under the *current* rotation — aimed at the centre of that
  rotated hull, since an immersed surface does not sit centred on the board's
  origin — and re-fit on every drag, so the board stays framed edge to edge as
  it turns instead of being cropped by a tighter-than-worst-case zoom. The fit
  is clamped between the old sphere fit (never smaller than before) and
  `MAX_SOLID_ZOOM` times closer (no fisheye on a board seen edge-on, and a
  bound on how much the framing can change mid-drag).

## Zoom

The board zooms **in the app**, never in the browser. Pinch on the canvas, or
`ctrl`+wheel / a trackpad pinch, or the wheel on any board with no ring to
scroll, or `+` / `-` / `0` (frame it again); a zoomed flat board is dragged
with one finger, any board with two. Zoom is bounded — `MIN_ZOOM` is the fitted
board (it can never be shrunk into the void) and `MAX_ZOOM` caps magnification
— and the pan is clamped to the board's overhang, so no gesture can lose the
board off-screen. A new board always starts framed. `window.__ms.zoom()` reads
the level and `zoomBy(factor, x, y)` drives it; `tests/e2e/zoom.spec.ts` pins
the gestures with synthetic multi-touch pointer streams (Playwright has no
multi-touch API).

The browser's own zoom is blocked on purpose (`blockBrowserZoom`,
`touch-action` in `styles.css`). iOS ignores `user-scalable=no`, so without
that guard a double tap — two quick reveals, a double tap on the smiley —
zooms the *page*: the board appears to jump, taps land on the wrong cells, and
on a standalone/PWA-ish view there is no way to zoom back out. Three layers
cover it, because no single one holds on every WebKit build: `touch-action:
manipulation` on the chrome (`none` on the canvas), Safari's `gesture*` events
cancelled, and a fast second `touchend` cancelled (buttons excepted, so a
double tap on the smiley still restarts twice). `App.syncViewport` also
divides out `visualViewport.scale`, so a page zoom that arrives some other way
(iOS accessibility, a desktop ctrl-+) cannot re-frame the board under the
player's fingers.

## Bundle size

There is **no size budget and no CI gate**. The app is a one-time download that
the service worker then caches, so first-load kilobytes are worth less here than
the board looking right; a change that costs bundle size and buys appearance is
a change worth making. What the build does keep is one piece of hygiene: `three`
is a `manualChunks` entry of its own (`vite.config.ts`), so it keeps its hash
when app code changes and a redeploy re-downloads only the app chunk. The
chunk-size warning limit sits above both chunks — deliberately, so the build log
carries no standing warning nobody intends to act on.

## Cell styles (`src/render/cellStyle.ts`)

How a cell is **cut**. Not a setting of its own: the **theme** names one (see
"Settings and themes"), so the table has one entry per theme and the keys match
the theme keys. Three, because Light and Dark share `flat` — they differ in
chrome, not in how a tile is cut: **classic** (the beveled button that sinks when
opened, and the one style that is *also* gray — see `monochrome` below),
**flat** (unlit plates in flat colour with wide gaps) and **realistic** (a
five-loop glass bead; on the plane a gradient and translucent opened cells, on a
solid a specular sheen that sweeps across the faces as the board is dragged
around). Otherwise it is only the relief and the finish — the *colour* of a cell
is the shape palette's, so the two can be retuned apart.

A cell is a stack of concentric **loops** of its own polygon: loop 0 is the
tile's outline, each further one is pulled in toward the centroid and lifted (or
sunk) along the surface normal, and the innermost one is filled as the top face.
Both meshes build from that table, so a style is one entry rather than a change
in two renderers. Four things to know before adding or retuning one:

- **A profile's loop count is its vertex count** — `n * (3 + 6 * rings)` for an
  n-gon — and an opened cell is re-cut *in place* into the slice of the buffer
  the closed one wrote. So `closed` and `open` must declare the same number of
  loops; `cellStyleLoops` throws otherwise and `tests/unit/cellStyle.test.ts`
  sweeps every style.
- **A style is baked into the mesh when a board is built**, and no board is
  re-cut in flight. That is safe because the theme is only reachable from the
  settings page, which lives in the menu, and the menu is only up when no game
  is — the theme picker says the board's tiles change on the next board, for the
  case where one is waiting behind it. The chrome half of a theme is instant.
- **A flat board is lit head-on**, so a shinier material has no angle to catch a
  highlight at: on the plane, `roughness` is nearly invisible and the visible
  levers are the gap, the loop layout, `unlit` (draw the palette colour as it is
  rather than the ~60% of it that diffuse shading returns), `albedo` (ask for
  more colour than exists, so a *lit* style gets the palette's colour back
  without giving up its shading) and `shade` (a brightness gradient from the
  cell's middle out to its rim, interpolated by the rasteriser). On the plane
  Realistic is a *gradient*, not a specular highlight, for exactly this reason —
  the highlight is what it does on a solid.
- **`shade` is per state, and that is a *material*.** `openShade` overrides it
  for opened cells. A centre hotspot is what reads as polished — it is the
  highlight a curved shiny thing throws back, and on a head-on flat board it is
  the *only* thing saying so, since the lighting has nothing to add. Flatten it
  and the cell reads as matte. Realistic uses that: glass beads closed, matte
  pans opened. It costs nothing (the gradient is already written per vertex) and
  the geometry should follow — a profile whose heights ease off toward the crown
  curves, one holding them level after the wall does not.
- **`shade` ramps over the loops, and that is what buys detail.** A vertex's
  factor is `rim` at the outermost loop and `center` at the centroid, stepped by
  ring (`vertexShade`). Shading the top face alone — which is what this did when
  the only style with a gradient had three loops — paints a bright disc on a flat
  field rather than a bead, so on a five-loop profile it looked *worse* than on a
  three-loop one. Ramped, extra loops buy a smoother dome, which is what the
  vertices of a detailed profile are for. Two loops next to Classic is still not
  a style: on the plane it differs only in the width of one bevel band.
- **A two-sided surface measures its gradient instead of ramping it.** The
  cylinder, Möbius strip and Klein bottle draw flat tiles with no loop stack, and
  the Klein clip can leave a vertex anywhere in one, so there is no ring order to
  ramp over. `radialFalloff` (solidBoard.ts) measures the distance from the
  cell's centre at build time — 1 at the centroid, 0 at the tile's edge, a cut
  vertex wherever it truly falls — and the gradient rides on *that* at write
  time, so the same tile can go from polished to matte when it opens. Same bead,
  and those surfaces need it most: a flat tile with no relief has nothing else
  to shade it.
- **`monochrome` is the one thing here that is not relief.** The classic style
  draws the board in its plain grays, shape colour code and all switched off:
  a gray minesweeper board is what "Classic" means, and a shape-coloured one is a
  different game to look at however the tiles are cut. `shapePalette.ts` still
  *measures* the shapes (the menu icons and the sound are keyed off the same
  tones); only the board stops painting them.
- **`openAlpha` is a flat board's business.** An opened cell can go translucent,
  and what comes through it is the themed page — the texture, on a theme that has
  one — because the WebGL canvas is transparent. Only on the plane: the tiles of a
  tiling never overlap each other on screen, so one merged mesh needs no
  per-triangle depth sorting, while a solid's cells *do* overlap (a two-sided
  surface draws its far side through its near one) and one mesh cannot sort that.
  The colour buffer grows to four components exactly where the channel is used,
  so every other style keeps the buffer and the shader it always had.
- **`unlit` is a flat board's business.** On a solid the shading is what shows
  the shape — an unlit sphere is a flat disc of tiles — so a 3D board keeps its
  lit material whatever the style, and only the relief, the gap, the finish and
  the albedo follow. Each style therefore carries a `flat` and a `solid` profile,
  the latter at the lower relief a curved surface needs (cells there tilt against
  each other, and a tall plateau shingles over its neighbours at the silhouette)
  and never below the grout. A two-sided surface (cylinder, Möbius, Klein) draws
  flat tiles whatever the style, so only the gap reaches it.
- **`albedo` is applied last, and comes out of the win glow.** Last, because
  everything else in `writeColor` (the hover lift, the reveal ripple) works in
  0..1 — `offsetHSL` on an already-boosted colour reads a lightness past 1 and
  clamps to white. Out of the glow, because the win crest is deliberately
  overdriven past white for the shading to bring back down: multiplied by the
  boost as well it would clip, so the boost is divided out of the overdrive and
  the wave peaks where it always did.

Cell styles are **not** in `data/ui/screens.json`: they are geometry for this
renderer, with no pygame counterpart for the shared config to keep in step. The
themes that name them are not there either, for the same reason — see below.

## 3D markers (`src/render/markers3d.ts`)

A flag and a mine are normally atlas billboards (`glyphAtlas.ts`), and on a board
you can **turn** that is a picture of a flag rather than a flag: drag a sphere
around and they never turn with it, because they are not objects. A cell style
can ask for real models instead — `solidMarkers` in `cellStyle.ts`, which
Realistic sets — and then a flagged cell carries a **pin** (a stem under a round
head) and a mined one, once a loss reveals it, a **bomb** (a casing half sunk
into the tile, studded with stubby horns — proportioned off `drawMine` so the 2D
and 3D mines are one object seen two ways).

Both models are **rotationally symmetric about the axis they stand on**, and
that is the design rule, learned the hard way. This shipped first as three
variants to compare — a pennant swivelled toward the viewer, three pennants at
120 degrees, and the pin — because a pennant is a sheet containing its own pole
and so goes edge-on seen straight *down* that pole, which on a solid is every
cell facing you. Turning the cloth toward the camera is provably the best a
single pennant can do (`up x toCam` maximises the projected area of a sheet that
must contain `up`) and it still fails there. A pin has no front, so it has no
angle it fails at; the other two are gone.

The rest of what to know before changing one:

- **Flat boards never get a model**, whatever the style says: a plane is seen
  from one angle, so a model there is a picture of one at several hundred more
  vertices. Every board you can turn does, including the two-sided flat manifolds.
- **A two-sided cell gets one *pin* on each face, and one bomb.** The cylinder,
  Möbius strip and Klein bottle have no consistent outward normal — `assemble` in
  `boards/surfaces.ts` deliberately skips `orientFromRing` for them, and the last
  two cannot have one at all — and they are drawn from both faces. A pin stands
  *off* a face, so a single one is missing from one side and buried under the
  surface from the other; a second copy the other way costs nothing, since the
  far one is occluded. A bomb needs no such thing: its casing is centred **on**
  the tile rather than resting on it, so the one model straddles the surface and
  pokes out equally both ways — which is also why a mine reads as half buried
  where it was laid rather than as something someone put there.
- **No visible edges** comes from *normals*, not from triangle count. Every
  sphere writes **radial** per-vertex normals and the marker material has
  `flatShading` off; turning it on throws them away and the pins come back
  faceted at any resolution. The same goes for colour — a tone per *triangle*
  bands the ball, and because the two triangles of a quad take different rings
  the bands come out as a sawtooth. Both ramps are per vertex.
- **A marker is sized by its cell's *inradius*, not its mean vertex distance.**
  `CellGeom.fit` — centroid to nearest *edge*, measured once in the cell's own
  plane — is the width a thing standing on the tile has to fit inside, and it is
  what the billboards have always used. The mean vertex distance is not a width
  at all on a stretched surface: the immersions bend cells into slivers whose
  mean is set by the long axis, which put a bomb several times wider than its own
  tile on a torus wrap. The two differ by no fixed factor either — 0.48 on the
  sphere's kites, 0.60 on the plain torus, under 0.09 on the isogonal Klein
  wraps. Where a cell is a genuine sliver its marker is genuinely tiny, exactly
  as its number is.
- **Markers rebuild on cell state, not on rotation.** Nothing about them depends
  on the camera, so `rebuildMarkers` is deliberately *not* called from `orient()`
  — which fires on every frame of a drag — only from the constructor,
  `dropFlag`, `setAnimationsEnabled` and an animation tick. Several
  hundred triangles per marked cell is not a thing to rewrite at 60fps to produce
  the identical buffer.
- **...and once per batch, not once per cell.** `setVisual` only *marks*
  (`glyphsDirty` / `markersDirty`); `tickAnimations` flushes, ahead of its own
  early-out, on the frame that is about to be drawn anyway. This matters because
  every caller that matters changes many cells at once — a loss turns over every
  mine, a Klein scroll rewrites *all* of them, a flood fill opens a wide patch —
  and rebuilding inside `setVisual` made each of those quadratic. On
  `klein`/`hard` one press of a scroll arrow cost **36 seconds**, a loss 6, and
  each flag placed rebuilt every pin already standing. Two rules keep it that
  way: a per-cell path must never call `rebuildGlyphs`/`rebuildMarkers` directly,
  and `setVisual` raises `markersDirty` only when `markerFor` actually changes —
  which is what makes a flood fill free, since a revealed cell carries no model.
  `tests/e2e/markers.spec.ts` pins all of it with timing thresholds three orders
  of magnitude clear of the fixed cost.
- **A model is generated once and then placed.** Every pin is the same object;
  only where it stands, which way is up and how big it is differ. So each kind is
  built once in its own unit frame (`MODELS` in `markers3d.ts`) and `writeMarker`
  transforms that template into the board's buffer — three multiply-adds per
  coordinate and a bulk copy of the colours, instead of the trigonometry, the
  per-vertex normals and the thousands of short-lived arrays that generating a
  648-triangle bomb from scratch costs. The frame's axes are orthonormal, so a
  placed normal needs no renormalising; the axes are pre-multiplied by the cell
  size, so a placed position is bit-for-bit what generating it in place gave.
- **The marker and glyph buffers are grow-only.** `DynGeometry` in
  `solidBoard.ts` keeps one `Float32Array` per attribute and replaces the
  `BufferAttribute` only when a rebuild needs more room; `setDrawRange` keeps the
  tail of a bigger earlier rebuild out of the draw. Its bounding sphere is
  computed over the live range by hand — `computeBoundingSphere` would measure
  that stale tail. This is a live cost even without markers, since
  `rebuildGlyphs` runs from `orient()` on every frame of a drag.
- **A marker style is framed with room for one.** `SolidBoard` pushes a hull
  point per cell at `MARKER_REACH` above it, so the camera fit sees a board where
  every cell is flagged and nothing is cropped at the rim when one is. It costs a
  permanent zoom-out on those styles; the alternative was markers sliced in half
  at the silhouette, since the fit is measured once at build time.
- **A wrong flag is a gray pin under the bare `cross` glyph** — a slot added to
  the atlas for it, since the ordinary `wrongFlag` glyph is a flag *with* a cross
  and the pin is already the flag. That one billboard is lifted past
  `MARKER_REACH` rather than by its own half-size, or the X draws behind the
  pin's head and its four arms read as spikes.
- **A held cell plants its pin with a drop of its own.** The 2D flag drop — the
  oversized quad that falls in when a flag is placed by *holding* a cell on
  touch — is not drawn on a marker style, because a flagged cell there has no
  billboard at all; without a replacement, the one gesture that most needs
  feedback animated nothing. So the pin does it: `markerDrop` in `markers3d.ts`
  brings it down oversized and fades it in, in a buffer of its own drawn without
  depth testing so it hangs in front of the solid rather than inside it.

  Two things are deliberate. It falls down the **screen**, not down the cell's
  normal — on a cell facing the camera the normal points at the viewer, so a pin
  arriving along it would come from behind the fingertip and never be seen, and
  the hand covers the cell and everything below. And it stands **upright on
  screen** while it is up there, tipping into the cell's own normal as it lands,
  which at progress 1 is exactly the normal, so the hand-off to the standing pin
  is invisible. It is also far smaller than the 2D drop (about 2x settled, not up
  to 10x): a picture has to be enormous to read as the same flag, but a pin is an
  object with a size, and one several times too big reads as a mistake rather
  than an arrival. What it has instead is height.
- **Nothing waves.** An animated cloth would keep `tickAnimations` returning
  `true` forever, against the renderer's on-demand loop.

Review shots: `node scripts/marker-shots.mjs <outdir>` against a running
`vite preview` plants flags on a sphere, a cube, a torus, a cylinder, a Möbius
strip, a Klein bottle and two stretched torus wraps (the sliver cells that the
inradius sizing is for), photographs each front, overhead and three-quarter,
then loses a game on the sphere *and* on the Möbius strip (bombs, the hot one
that ended it, a gray pin under its cross — and, on the strip, the check that one
casing shows from both faces), long-presses a cell to catch the pin drop
mid-flight, and shoots a flat board as the untouched control.

### The pins glow (`src/render/markerGlow.ts`)

A move already reaches the player twice: the tiles it opened **flash**, rippling
outward from the click at `RIPPLE_PER_CELL` ms per cell width, and each opened
tile **sounds**, pitched and timbred by its own side count. The markers are the
third reading of the same event. A front of light spreads from the click at that
same pace and every standing pin brightens as it crosses, then falls back to the
faint ember it carries at rest.

What the light *says* is what the sound says, from the same two facts:

- **How much, from how many.** A one-cell open is a tick and a two-hundred cell
  flood is a swell, logarithmically — the step from 1 to 20 cells is most of the
  range and the step from 100 to 200 is barely visible.
- **What colour, from what shape.** The mean side count of the opened cells,
  ramped over the span `noteFor` ramps the pitch over (index `sides - 3`,
  clamped), so a shape that sounds low glows warm. On a board of one tiling that
  is a constant — a hexagonal board glows unlike a triangular one — and on the
  uniform, Laves and isogonal boards it moves move to move.
- **It stops.** The swell holds only while the front is still inside the flood,
  then falls away. A board that has finished opening is a board at rest.

A mine going off runs the same machinery hot: a white flash on the bomb that
went off, which also **swells**, a shockwave that outruns a reveal three to one,
and an ember that stays warm for the rest of the loss screen.

The traps, and the reason the design looks the way it does:

- **A glow must not cost a rebuild.** `rebuildMarkers` is a whole-board pass of
  several hundred triangles per marked cell, kept off the camera path on purpose
  (above) and guarded by timing thresholds in `tests/e2e/markers.spec.ts`,
  including *a flood fill touches no marker at all*. So the light is **one static
  per-vertex attribute** (`glow` — how much each part of a model lights up, the
  head of a pin and not its stem, zero on a dead pin) and **eleven uniforms**
  rewritten per frame in `SolidBoard.updateGlow`. No geometry moves, and the
  vertex colours never vary with time — `tests/unit/markers3d.test.ts` pins both.
- **The wave is spatial, and it is computed in the shader.** Each vertex knows
  its own distance from `uGlowOrigin`, so a front sweeping the board costs a
  scalar per frame rather than a buffer upload. Because it measures `position`
  rather than a per-marker anchor, the light climbs a pin slightly as the front
  passes, which is free and reads well.
- **`onBeforeCompile`, on both marker materials, with the same function.** Three
  keys its program cache on `onBeforeCompile.toString()`, so one shared patch
  compiles one program for the standing pins and the dropping one — and a
  dropping pin lights like a planted one, which is what it is.
- **There is no bloom.** The app has no post-processing and the canvas is
  deliberately transparent, so the glow is an **emissive** term added to
  `totalEmissiveRadiance` — added, so the lighting cannot multiply it away.
  `PEAK_MAX` is well under 1 for that reason: an emissive of 1 roughly doubles a
  pin head's brightness and washes it from red out to pale peach, which reads as
  the model changing colour rather than as light passing over it.
- **The resting ember is not gated by reduced motion.** It does not move, so it
  is part of what a Realistic marker *is*; what `animations(false)` turns off is
  the wave, the shockwave and the swell. `wantsMarkerGlow` goes false with them,
  which is what stops `GameSession` walking a flood's rings for a light nothing
  will show.
- **Rings and sides are measured once per move.** Both used to live inside the
  sound path, behind `soundEnabled()`; the glow needs them too and plays in
  silence, so `GameSession.reactToReveal` computes them for whichever of the two
  wants them. `panFor` stays behind the sound gate — it projects a cell through
  the camera, and only the stereo field needs that.

**Testing it.** The rules are pure and pinned in `tests/unit/markerGlow.test.ts`,
driven with explicit `now` values and no browser. End to end, the light lives in
a uniform and so leaves nothing in the DOM, and the whole wave is over in about
half a second — quicker than a screenshot round trip under SwiftShader, which
*will* stall for hundreds of milliseconds mid-flood and drop the crest between
frames. So `state().glow` reports it (`amount`, `blast`, `base`, or null on a
board with no markers) and `tests/e2e/animations.spec.ts` samples across the wave
rather than at an instant. The one thing a screenshot can hold is the resting
ember, which is what `sphere-realistic-pins.png` is for.

Review shots: `node scripts/glow-shots.mjs <outdir>` against a running
`vite preview`. To photograph the crest, temporarily hold the envelope open
(`+ 6000` on `travel` in `swell`) and slow the front (`RIPPLE_PER_CELL * 24`);
that is how the numbers above were tuned by eye, and it is the only way to see
one frame of a wave that real timings sweep past.

## Shape colour coding (`src/render/shapePalette.ts`)

A cell's colour is derived from its polygon — nothing tags a cell with a
shape, and nothing needs to. **Hue** comes from the side count (an even
spectrum: 3 red, 4 orange, 5 yellow, 6 green, 8 teal, 12 blue, the 13-gon
hat violet), **chroma** from how regular the polygon is
(`(minAngle/maxAngle + minSide/maxSide) / 2`, 1 for a regular polygon), and
**lightness** from the cell's state — the step between the closed and opened
tone is exactly the one the gray board had — plus, *within* a state, from the
tile's **size**. The maths runs in OkLCh, not HSL,
because HSL lightness is not perceptual and that constant hidden/opened
contrast across hues depends on it. Every knob lives in the one
`SHAPE_PALETTE` block.

**Size is the fourth thing a tile can say**, and it gets the widest treatment of
the three shape axes. The isogonal tilings put one regular polygon on the board
at two or three sizes — the Pythagorean tiling's 2:1 squares, the three-scale
triangular's 1:2:3 triangles — which side count and regularity cannot separate
at all: they are the same shape, only bigger, and on those boards a tile's
neighbours are mostly the *other* size, so one quiet axis was not enough.
`classifyShapes` clusters tile spans (mean corner distance from the centroid)
per side count on a *relative* gap, and the classes are then pushed apart on
three axes at once (`sizeLightness`, `sizeHueSplit`, `sizeChroma`): mostly
lightness, with a small hue fan about the shape's own hue and more chroma on the
smaller tile. Three rules keep that from disturbing what was there before:

- the lightness spread shifts the closed and opened tone **equally**, so the
  hidden/opened contrast the board is read by is untouched;
- it only ever goes **down** from the shape's own tone — the biggest tile is
  drawn exactly as a single-size shape is. The opened tone already sits near
  white, so lifting a size above it would clip to white and lose the
  distinction precisely where the numbers are;
- `cluster.sizeGap` is deliberately coarse (15%), so the Penrose rhombi — same
  edge length, spans 10% apart, and already told apart by hue — stay one size.

The chroma boost is the one axis that does not always land: on the closed tone
the hue is already at the gamut edge, so the extra is clamped away and only the
pale opened tone actually takes it.

Three things that are easy to get wrong when touching this:

- **Colour lives on the closed tiles.** They carry a properly saturated tone;
  an opened cell is a pale wash of the same hue, because it sits near white
  (where sRGB has barely any chroma left) and has a number to stay readable
  under. Pushing chroma into the opened tone is what makes digits hard to
  read, not the closed one.
- **`cuspBlend` is what makes a tile saturated rather than tinted.** sRGB
  holds no vivid red or blue at the gray's lightness, so a hue whose most
  colourful lightness is below the gray's is drawn part of the way down
  toward it. Both the closed and opened tone shift together, which is what
  keeps their step constant hue by hue. Note the renderer reflects about a
  third of a tile's albedo, so the *screen* colour is always a good deal
  darker than the swatch — a saturated orange albedo lands as a warm brown.

- **Class shapes per board, not per cell.** The surface immersions stretch
  their tiles (a torus square measures ~0.7, and no two cells alike), so
  `classifyShapes` groups a board's cells by side count and clusters their
  regularities; every member of a cluster gets the cluster's colour. Colouring
  each cell by its own measurement paints a saturation gradient instead.
  Clusters the palette would paint alike are then merged, so a projection that
  leaves some tiles exact and stretches the rest — the geodesic sphere's
  triangles split 0.85/1.00 — stays one shape in one colour.
- **One side count is one shape on a curved board.** Splitting a side count
  into several shapes only happens on a flat board, where congruent tiles
  measure identically. A surface of revolution makes each ring of cells
  congruent to itself and different from the next, so the measurement cannot
  carry that decision there — a torus of triangles reads as several triangle
  shapes when it has one. No 3D board in the catalog has two tiles with the
  same number of sides; the one board that does is flat Penrose, and a unit
  test sweeps the whole catalog to keep it the only one. The size axis is
  gated the same way, and for the same reason.
- **A collinear vertex is not a corner.** A tile of a non-edge-to-edge tiling
  carries the corners of the neighbours whose edge it splits, so a running-bond
  square arrives as a six-point polygon. `shapeMetrics` measures a polygon's
  real corners (`corners()`), or every isogonal board would be painted as a
  board of irregular hexagons. Nothing else on the board has a 180° vertex —
  the flattest genuine corner in the catalog is a Klein-bottle quad at ~172°.
- **Icons share the hue, not the tone.** The board tint is deliberately faint;
  at 38 px it would read as gray, so the icon profile puts each hue near the
  lightness where it is most colourful. `shape()` reads the tone off the
  polygon it is drawing — a new icon needs an `ICON_TONES` row only when its
  art is *not* a drawing of the board's cell (a subdivided outer polygon, an
  idealised stand-in for an irregular tile, a solid in projection), and a
  `null` tone opts out into the old indigo chrome (tubes, frames, the question
  mark).
- `src/config/screens.ts` — typed accessor over `../data/ui/screens.json`.
- `src/ui/settings.ts` / `src/ui/theme.ts` / `src/settings.ts` — the settings
  page, the CSS-custom-property theme applier, and the stored preferences (see
  "Settings and themes").
- `src/leaderboard.ts` / `src/ui/scoreDialog.ts` / `src/ui/bestTimes.ts` — the
  stored best times, the window a placing win puts up and the page that lists
  them (see "Best times"). `src/storage.ts` holds the two `localStorage`
  helpers both stored records share.
- `src/testHook.ts` — the `window.__ms` seam Playwright drives.

## Shareable board links

A board's address *is* its share link: `?mode=<mode>&difficulty=<key>`, which
`App.syncLocation` writes with `history.replaceState` whenever a board opens and
clears on the way back to the menu (so reloading from the menu shows the menu).
`replaceState`, not `pushState` — this mirrors the current view rather than
building history the back button would have to unwind.

**Every ordinary game carries a `seed`**, generated in `App.startGame` when the
caller has none, so the link names *this* mine layout rather than "another board
of this kind" — which is what makes the share button (`src/share.ts`) worth
having, and what lets a player hand a board to someone else. The consequence to
know: a reload replays the board you were on instead of dealing a fresh one.
Re-rolling is the smiley (or the record window's **Play again**), both of which
come back through `startGame` with no seed. Only a board built from an explicit
mine layout — the `window.__ms` test seam — has no seed to carry, and it claims
no link at all.

Parsing lives in `src/link.ts`, apart from `main.ts` so it is unit-testable, and
treats the query string as **untrusted**: links get typed, truncated by chat
clients and forwarded between builds that do not offer the same boards. Every
parameter is read on its own and only if this build knows its value — an
unrecognised value is dropped rather than repaired, and dropping one never costs
the others:

- an unknown `mode` opens the menu, but a valid `difficulty` alongside it is
  still applied (for the session only — someone else's link never rewrites your
  stored preference);
- an unknown `difficulty` still launches the board, at the stored one;
- a `seed` is used only when it is a safe integer, since `mulberry32` does
  `seed >>> 0` and a fraction or infinity would not reproduce the sharer's board;
- unknown parameters are ignored, so tracking/campaign query strings are
  harmless.

`hasMode` uses `Object.hasOwn`, not `in`. With `in`, `?mode=toString` (or
`constructor`, `valueOf`, …) resolves up the prototype chain and hands the board
builder a function — the reason a link-facing lookup must never use `in`.

`tests/unit/link.test.ts` round-trips **every** mode in the catalog at every
difficulty, so every board the menu can launch is shareable.

## Sound (`src/audio/`)

Two files, and the split between them is the point:

- **`presets.ts`** — the table. One `SoundPreset` per character (Chime, Arcade,
  Blocks), in the shape of `cellStyle.ts`: plain numbers the engine reads, so a
  fourth character is a row here and nothing else. `off` is deliberately *not*
  an entry — `soundPreset()` returns `null` for it, and a silenced game never
  builds an audio graph at all. It also holds the guards a stored record has to
  pass before it reaches the engine: `resolveSound` for the key, `clampVolume`
  for the level.
- **`sound.ts`** — `voicesFor(event, preset)` is **pure** (an event in, a list
  of grains out: when, what pitch, how wide, how loud), and `playSound(event)`
  renders those grains onto the shared `AudioContext`. Every rule the feature
  has lives in the pure half, which is why `tests/unit/sound.test.ts` can pin
  what the game sounds like under node with no audio stack at all. The call
  sites (`session.ts`, and the settings preview) name events, never
  oscillators — the same seam `haptics.ts` is for touch.

Things that will bite:

- **Audio cannot start without a user gesture.** A context built at load time
  stays suspended on iOS *forever*, and everything scheduled into it is lost
  silently. `unlockAudio()` (called once from `App`) builds and resumes it on
  the first `pointerdown`/`keydown`/`touchend`. Nothing is audible before the
  player's first touch, by construction — do not "fix" that by building the
  context earlier.
- **Pan comes from the renderer, not the mesh.** `BoardRenderer.panFor(cell)`
  projects the cell anchor through the board's world matrix and the camera, so
  it carries the zoom, the pan, the portrait quarter-turn and a solid's
  rotation. `GameSession` takes it as the `panOf` option and falls back to the
  cell's mesh-local x (the same answer for an unframed flat board) when there
  is none — which is what keeps the session constructible in a test.
- **Volume is the master gain, not a preset number.** A preset's own gains are
  the *balance* between the game's sounds (a flag against a cascade);
  Settings › Sound › **Volume** is how loud that whole balance plays, so
  `setSoundVolume` scales the one master `GainNode` and `voicesFor` stays pure
  and preset-only. `off` is still a different thing from a volume of zero: it
  mutes the same gain, but it is also what stops the engine building voices at
  all. Both moves are 30 ms ramps — stepping a gain discontinuously clicks —
  and the slider is deliberately the one settings control that does **not**
  re-render its page, because the player is still holding it: dragging feeds
  the engine live (audible in the cascade already ringing), and only letting go
  persists the value and plays the preview.
- **A cascade is bounded, twice.** `cascade.maxVoices` thins the cells at an
  even stride across the whole ring range (so the first ring and the last are
  always heard), and `MAX_CASCADE_S` clamps the delay. Beyond that
  `MAX_ACTIVE_VOICES` drops grains rather than letting a loss over a flood turn
  into a wall. Raising any of them is a decision about the worst board (a 500+
  cell flood on `hard`), not the average one.
- **The shape map is lazy.** `GameSession.sidesOf` measures every cell's
  polygon on the first sound a board plays, and never when sound is off — the
  `soundEnabled()` guard at each call site is what keeps a silenced game from
  paying for the feature.
- **Testing it.** A synthesised sound leaves nothing in the DOM, so the e2e
  suite counts the oscillators the page creates
  (`tests/e2e/sound.spec.ts`, an init script wrapping
  `AudioContext.prototype.createOscillator`) and reads the engine's active
  choice back through `window.__ms.state().sound` (and the level through
  `state().volume`). Counting *scheduled* nodes
  needs no output device and no autoplay policy, which is what makes it stable
  in CI.

## Settings and themes

The gear on the menu title row opens a settings page — not a modal: it is one
more `Menu` page (`Menu.showSettings`, rendered by `src/ui/settings.ts`), so it
reuses the back row, the `.menu-entry` cards and the scrolling body. The **?**
beside it is the same pattern with no state at all (`Menu.showHelp`, rendered by
`src/ui/help.ts`): its text lives in TS rather than in `data/ui/screens.json`,
which is the config the pygame build shares and which has no help page. Both
buttons are `.menu-header-btn[data-action=…]` inside `.menu-header-actions`, one
per side — the **?** at the left edge, the gear at the right — so the two balance
each other and the title keeps the whole middle. Both on the right cost the title
twice that width, and "Hypersweeper" is a single unbreakable word that then does
not fit on one line on a narrow phone. A third button means picking a side and
adjusting the shared `--menu-header-actions` width, which is what the empty side
is sized from. The theme is a page below settings in the same way
(`Menu.showThemePicker`): settings shows a Theme row naming the current one, and
the four-row picker lives one level down, which keeps the settings page short
enough to read at a glance.

**Themes.** A theme is the app's **one** look setting: the chrome palette, the
page behind the board, *and* how the board's cells are cut — and, on Realistic,
whether a flag and a mine are billboards or real models (see "3D markers"
above). There are four — Light, Dark, Classic, Realistic — and they are declared
in `src/ui/theme.ts`, not in `data/ui/screens.json`. The distinction matters:

- The seven **palettes** are still shared config (`data/ui/screens.json` under
  `themes`; six ported from the pygame `THEMES` registry in `minesweeper/gui.py`,
  `dark` web-only), and `tests/test_theme_sync.py` still fails if one is retuned
  without the JSON following. A theme *composes* a palette; it never adds colours
  to one. Light and Realistic share `ios` and differ in the board and the page
  texture.
- The **list** is web-only because pygame has neither cell styles nor page
  textures, so its six presets could never be this list. That is the same split
  the menu already has (`catalog.ts`'s web-menu section).

`applyTheme` writes the whole set of CSS custom properties onto
`document.documentElement` — the `:root` block in `styles.css` is only the *boot*
default (Light's, i.e. the `ios` palette) and must stay in step with it. Things
worth knowing:

- **The board is themed only as far as a cell style says.** The shape colour code
  (`shapePalette.ts`) still owns the hues, and exactly one style switches it off:
  `classic`, whose `monochrome` flag draws the board in its plain grays. No theme
  reaches into `shapePalette.ts` or `glyphAtlas.ts` for a colour, and the
  `gallery.spec.ts` baselines that are not per-theme are shot in the default one.
- **A theme's board half lands on the next board.** A cell style fixes the mesh's
  vertex layout, so nothing is re-cut in flight; the chrome half is instant. The
  picker page says so.
- **An unknown theme key falls back to Light** through `resolveTheme`, which uses
  `Object.hasOwn` for the same reason `link.ts` does. That is also the safety net
  under the v2→v3 migration below.
- **The WebGL canvas is transparent** (`alpha: true`, clear alpha 0), so the
  field around the board is the *page* background. That is what makes the glass
  theme's gradient show and means a theme needs no renderer call at all. Do not
  reintroduce an opaque clear colour — it would cover the CSS background.
- Any new chrome colour must be a `var(--…)` from `themeVars`. A hard-coded dark
  stroke is the classic dark-theme bug (the header icons in `hud.ts` stroke in
  `currentColor` for this reason; the flag keeps fixed colours because it is the
  game's own glyph, not a control).

`tests/test_theme_sync.py` (Python) fails if a pygame palette is retuned without
the JSON following.

**The v2 → v3 migration.** Until v3, `theme` named a chrome palette and
`cellStyle` sat beside it as a second setting. `migrate` in `settings.ts` reads
the **pair** — not each field on its own — because only the pair says what look a
player had chosen: a palette a v3 theme is named after (`classic`, `dark`) wins
outright, and otherwise the old cell style is the better evidence, so someone on
`ios` + `gloss` lands on Realistic rather than being flattened to Light with
everyone else. The stale `cellStyle` key is deliberately left in the record —
`saveSettings` carries unknown keys over anyway, and a downgrade to a v2 build
should find its setting intact.

**Sound.** What the game sounds like — a preset key or `"off"` — under the
Behaviour heading, with its own picker page (see "Sound" above). Unlike a theme's
cells it needs no new board: every event reads the preset when it plays, so a
change is audible on the very next click. The picker page also carries
**Volume**, a 0..1 level stored beside the preset and starting at half: it is a
level rather than a character, so turning it down keeps the preset, and it is
left off the page entirely under `off`, where there is nothing to set. It sits
in the *same* list as the presets — `.menu-body` is a gapless flex column, so a
second `<ul>` would butt straight against the first. The settings row above
reports both ("Chime · 60%").

**Haptics.** A plain boolean, and the one row that is **conditional**:
`hapticsSupported()` (`src/haptics.ts`) offers it only where something can
actually buzz — the native iOS shell, or a *mobile* browser with
`navigator.vibrate`, which in practice means Android. A desktop browser defines
`navigator.vibrate` with no hardware behind it, and iOS Safari implements no web
haptic at all, so neither gets a switch; `haptic()` is gated on the same check,
so a `haptics: true` carried in from a phone is inert rather than driving a
mechanism that does nothing.

**No outward links.** The About block reports what the build *is* (its version,
and whether a newer one is waiting) and nothing more — a settings page that
sends the player to another site is not part of playing the game.
`tests/e2e/settings.spec.ts` asserts the page holds no anchors at all.

**Analytics.** Whether anonymous play counts are reported — see "Analytics"
above. Its own **Privacy** heading rather than a fourth Behaviour row: sound,
haptics and animations are what the game *does*, and this is what leaves the
machine, which someone who came looking for it should be able to find by
heading. Present only in a build that carries the counter at all — the same
principle as the Haptics row needing a device that can buzz, and the "Check for
updates" row needing a deployed build to check against.

**Persistence.** `src/settings.ts` is the app's only stored state: theme,
difficulty, the animations override, haptics, the analytics flag, and the sound
preset with its volume. Flag mode, zoom, the menu page you are on and the board
in progress stay in memory as before.

The layout is **one stable `localStorage` key holding a record that carries its
own `version`** — deliberately not a versioned key name (`…:v1`, `…:v2`), which
silently resets every user on a schema change because the new build reads a key
nobody has written. `migrate()` upgrades an old record; `LEGACY_KEYS` still picks
up records written under the old key-per-version scheme, and the old key is
removed only *after* the new one is written, so an interrupted migration cannot
lose it. Four rules the tests pin:

- Reading is **total and field-by-field** — one bad field costs the user that
  field, not the record. Corrupt JSON, an array, a removed theme, a removed
  difficulty and a storage that throws all degrade to defaults.
- A record from a **newer** build is read for what it understands, and writing
  **preserves the keys it does not recognise**, so an older tab or a rolled-back
  deploy does not throw away newer preferences.
- Storage may be absent entirely (node under vitest) or throw on write (Safari
  private mode, quota); a refused write is dropped and the choice still applies
  for the session.
- `subscribeSettings` mirrors changes made in another tab (a `storage` event,
  including `localStorage.clear()`), which `App.adoptSettings` applies.

Bump `SCHEMA_VERSION` only when a field changes *meaning*; purely additive
fields need no bump, since an old record simply lacks them.

**Version.** `__APP_VERSION__` / `__APP_COMMIT__` are Vite `define` constants
(see `vite.config.ts`, declared in `src/vite-env.d.ts`). The version tracks
`package.json`, which `bump-version.yml` keeps in lockstep with
`pyproject.toml` on every push to master.

## Best times

Winning a board files the time with `src/leaderboard.ts`, which keeps the
**fastest three per board per difficulty** on the device; when the time places,
a window says so.

- **Its own key.** `ms:scores`, not the settings record. Best times are game
  history rather than a preference: they grow with every board played, while
  `ms:settings` is small on purpose so it can be rewritten on every change and
  mirrored across tabs on a `storage` event. Both records follow the same rules
  (one stable key holding a versioned record, total field-by-field reads,
  guarded writes) and share `src/storage.ts`.
- **Milliseconds rank, seconds show.** The HUD counter shows whole seconds, and
  so does every list — but entries store `ms`, so two wins the counter both read
  as `41` still order by which was actually faster. A time *equal* to a stored
  one ranks below it: you have to beat a record to take its place. That case is
  not exotic — on a small board a first click that floods the field wins in ~0 ms.
- **Nothing readable is ever deleted.** A board key this build does not know (a
  renamed mode, a board dropped from this deploy) is carried through every
  write, and a board whose entry list is corrupt costs that board's records
  rather than the whole leaderboard. Times are sorted on read, so a hand-edited
  file still lists sensibly.
- **A refused write still reports the rank.** Private mode and a full quota both
  throw on `setItem`; the player did just set that time, so the window says so
  and the record simply is not there next launch — the bargain `saveSettings`
  makes.
- **One win is one record.** `App.checkRecord` runs from `afterMove`, the funnel
  every move goes through, and `App.scored` gates it, so further clicks on a
  finished board (or the timer tick) cannot file it twice. A loss records
  nothing.

The window (`src/ui/scoreDialog.ts`) is the app's **one modal** — everything
else that looks like a page is a page, the settings screen included. A record
is a moment, it belongs over the board just cleared, and it has to be
dismissible back to it, so it is a real overlay and carries the obligations:
Escape and a backdrop click close it, focus moves in on open and back out on
close, Tab is trapped, and its colours are all theme custom properties. It waits
`RECORD_DIALOG_DELAY_MS` for the win wave to play, and opens straight away when
animations are off — which is also why e2e (run under emulated reduced motion)
sees it immediately. Leaving or restarting inside that gap cancels it.

The list lives under **Settings › Best times** (`src/ui/bestTimes.ts`), one more
`Menu` page like the theme picker, ordered by the catalog rather than by the
storage record. Boards are named with `fullModeLabel` — the menu can call a
wrapped tiling by its tiling alone because the surface is the page it was
reached through, but in one flat list "Triakis triangular" names two boards.
Clearing arms on the first tap and fires on the second, rather than calling
`window.confirm`, which an installed iOS web app renders as a URL-badged alert
that reads like a browser warning.

## Analytics

The deployed game counts **which boards get opened and how often they get won**
— the two things board difficulty was otherwise being tuned blind on. It is the
only outbound request the app makes; everything else it knows lives in
`localStorage`.

**Two events per game**, and no third:

| when | event |
| --- | --- |
| a board opens (`App.startGame`, after the session is built) | `start` |
| the move that finishes it (`App.afterMove` → `trackFinish`) | `end` + `won`/`lost` + seconds |

There is deliberately **no abandon event**. A board opened and never finished is
`plays − finished`, which the report derives — so a `pagehide` hook that would
also fire on every menu return and every restart is not needed, and there is one
less thing to keep exactly-once.

**What is sent** is the whole of it: `{ v: 1, e, m: mode, d: difficulty, o?:
outcome, s?: seconds }`. No cookie, no identifier, no session id, no seed, no
board layout, no theme, no user agent, no referrer. The collector stores nothing
about the *request* either — no IP, no country, no colo, nothing from
`request.cf`. A rare board plus a country is an identifier, and not being one is
the entire promise here. Settings › Privacy › Analytics turns it off; it is read
on every event, like the sound preset and the haptics flag, so switching it off
mid-board also suppresses that board's ending.

**The pure half and the transport half.** `src/analyticsEvent.ts` decides what
an event *is* — `payloadFor` (client) and `parseEvent` (collector), validating
modes and difficulties against the real `data/presets.json` and
`data/catalog.json`, so a board added to the catalog is understood by the
collector the moment it deploys. `src/analytics.ts` is only the wire:
`sendBeacon`, falling through to a `keepalive` fetch, never awaited, never read,
never thrown from. The split is `audio/sound.ts`'s — `voicesFor` beside its
player — and it is what lets the node unit tests pin the whole contract in one
round-trip assertion. Lookups are `Set`-based, never `in` and never a plain
object: mode names arrive over the network here, and `link.ts` already carries
that scar (`?mode=constructor`).

**Why both hooks live in `App`, not `GameSession`.** `checkStop` in `session.ts`
is the other candidate and it is the wrong one: `App.afterMove` already runs on
every terminal move and already owns the once-per-game bookkeeping, so putting
the second guard next to the first is what keeps them from drifting; the `start`
event has to come from `App` regardless; and threading `__APP_PACKAGED__` into
the hottest file in the app to keep the packaged builds silent is worse than one
call up here. `trackFinish` has **its own** `tracked` flag rather than reusing
the leaderboard's `scored` — a loss is reported and files no record, and must
not consume the other's guard.

A **restart counts as a new play**: the HUD smiley routes back through
`startGame`. "Boards opened" is the measure, not "distinct players".

**The collector** is a Cloudflare Pages Function, and the only server-side code
in the repo. It gates on method and `Sec-Fetch-Site`, caps the body at 512 bytes
(by the claimed `content-length` and again by measurement), validates with
`parseEvent`, and writes one Analytics Engine data point. Junk and success both
answer `204` with an empty body, so it is no oracle for what the validator
accepts. The path is `tally` rather than `event`/`track`/`collect` because those
are the words content blockers match on.

It is two files. `functions/api/_tally.ts` holds everything, in standard web
types plus one hand-written interface for the binding — a leading underscore
keeps a file out of Pages routing, and with no Worker types in it
`tests/unit/tally.test.ts` can drive the whole request path under vitest.
`functions/api/tally.ts` is the `PagesFunction` wrapper, and one `onRequest`
switching on the method rather than `onRequestPost` beside a catch-all, whose
precedence rules are not worth depending on.

Dataset schema. **The blob positions are the contract with
`scripts/metrics.mjs`, which reads them by number: append only, never
renumber.**

```
index1  board mode ("hexhex")     double1  seconds on the clock (0 on a start)
blob1   "start" | "end"
blob2   difficulty ("easy")
blob3   "won" | "lost" | ""       (empty on a start)
```

`index1` is the mode because Analytics Engine samples per index, so a board
nobody plays keeps its fidelity while a popular one is being sampled.

**Reading the numbers**: `make metrics` (or `node scripts/metrics.mjs`), with
`CF_ACCOUNT_ID` and a `CF_API_TOKEN` carrying *Account → Account Analytics:
Read* — a second, read-only token, not the deploy one. Flags: `--days=N`,
`--mode=TEXT`, `--min=N` (marks rows too thin to read a win rate off), `--json`.

Two traps in that script, both commented there. Every count is
`SUM(_sample_interval)` and never `COUNT(*)` — Analytics Engine stores a
*sample* under load and that column is how many real events a stored row stands
for; getting it wrong yields plausible numbers that are wrong by the sampling
rate, worst for exactly the popular boards worth reading. And the SQL uses a
plain `GROUP BY` with the pivot done in JS, because the dialect is a narrow
ClickHouse subset and conditional aggregates are not worth betting a report on.

**Read every count as a floor.** It is sampled; content blockers eat some posts;
players can switch it off; and the GitHub Pages host has no Functions at all, so
everything it serves posts into a 404. All four err the same way.

**The counter is opt-in per build**, via `VITE_ANALYTICS=1` → the
`__APP_ANALYTICS__` define. Only one place this app runs has the Pages Function
to post to:

| build | counter | why |
| --- | --- | --- |
| Cloudflare deploy | **yes** | the host that serves the Function |
| e2e (`playwright.config.ts` sets it) | **yes** | `analytics.spec.ts` drives it |
| GitHub Pages deploy | no | no Functions there |
| `npm run dev` | no | your own clicks are not data |
| packaged (macOS, iOS) | no | vetoed by `packaged`, whatever the flag says |

This is not tidiness. A post to a host without the Function 404s, and **the
browser logs that failure to the console itself** — no care taken in
`analytics.ts` can swallow it, so a build with nowhere to report to must not
carry a reporter. (`sound.spec.ts` asserts a played board logs no console errors
and is what caught this.) A build that does carry it is served locally by the
`tallyStub` middleware in `vite.config.ts`, which answers `204` exactly as the
Function does, so `vite preview` and `npm run dev` behave like the deployed
host; to exercise the real Function, `wrangler pages dev`.

Where the flag is off, `COLLECTING` is a false constant and the compiler removes
the transport, the endpoint string and the Privacy row along with it. For the
packaged builds that is asserted rather than assumed:
`scripts/check-offline-assets.mjs` gained a second pass over a `FORBIDDEN` list
of same-origin paths, because its URL scan only ever saw absolute `https?://`
ones and would have let a relative endpoint straight through.

## Shared configuration

UI-screen chrome (header slots, menu structure, difficulty rows, themes, smiley
faces) is declared once in **`data/ui/screens.json`** at the repo root and read
by both front-ends, so the pygame and TypeScript UIs can be kept in sync from a
single source rather than hand-matched. `src/config/screens.ts` gives the TS app
compile-time types over it. Later milestones extend the same shared-`data/`
approach to the board catalog and presets (see the plan).

Shared does not mean identical. `src/boards/catalog.ts` is a faithful port of
`minesweeper/boards/catalog.py` over `data/catalog.json` — and where the two
menus deliberately differ (M17's promoted regular tilings, the shaped-board
family's own label, the home page's random pools), the difference is *derived*
in that file's "web menu" section rather than pushed into the shared JSON. So
`data/catalog.json` keeps describing the pygame menu, its exporter still
round-trips (`tests/test_data_sync.py`), and `tests/unit/catalog.test.ts` pins
the port while `tests/unit/menu.test.ts` pins the web shape.

## Deploy

CI (`.github/workflows/ci.yml`, `web` job) typechecks, unit-tests, builds and
runs the e2e/visual suite. Two deploy workflows then publish this app — **it
is the deployed game**; the pygbag build of the pygame version is no longer
published (it is still buildable locally with `make web-package`).

The two run side by side while the game moves off GitHub Pages, from the same
commit, differing only in `VITE_BASE` — the serving path is baked into the
bundle at build time (asset URLs, the PWA manifest, the service worker
scope), so one artifact cannot serve both:

| Workflow | Host | `VITE_BASE` |
| --- | --- | --- |
| `deploy-pages.yml` | GitHub Pages project site | `/hypersweeper/` |
| `deploy-cloudflare.yml` | Cloudflare Pages, domain root | `/` (the default) |

The Cloudflare job needs two repository secrets, `CLOUDFLARE_API_TOKEN` (a
token with the *Cloudflare Pages: Edit* permission) and
`CLOUDFLARE_ACCOUNT_ID`, and a Pages project that already exists — a direct-
upload project named `hypersweeper` whose production branch is `master`
(`wrangler pages project create hypersweeper --production-branch=master`).
`wrangler pages deploy` does not create one in CI.

That job runs wrangler **from `web/`** (`workingDirectory: web`), which is the
whole reason `web/wrangler.toml` exists: wrangler's project root is the config
file's directory, and `functions/` — the analytics collector — has to sit beside
it to be picked up at all. The config also carries the deploy directory
(`pages_build_output_dir = "dist"`), the project name and the `GAME_EVENTS`
Analytics Engine binding, which is why the deploy command passes neither a
directory nor `--project-name` (passing the directory positionally alongside
that setting is an error). Run from the repo root instead and the deploy quietly
uploads `dist/` alone: the site works and the collector does not exist.

After the first deploy, check that **Pages project → Settings → Functions →
Bindings** lists `GAME_EVENTS`. That is the most likely thing to be wrong, and
its failure is silent — the Function still answers `204` by design, and the
report simply stays empty. If config-file bindings are not honoured for the
project, add it in the dashboard for Production *and* Preview.

Locally, `npm run dev` does not serve `/api/tally`; the post 404s and the game
is unaffected, which is the same failure mode the GitHub Pages host has. To run
the Function, `npm run build && npx wrangler pages dev` from `web/` — but note
Analytics Engine writes are a no-op in local dev, so verifying a write end to
end takes a real deploy. When Pages is retired,
deleting `deploy-pages.yml` is the whole change; nothing in the source
hardcodes a base path. During the
rewrite this app mounted under `/next/` instead, so `public/next/index.html`
redirects that path to the root, carrying the board link's query and hash over
and unregistering the service worker that was scoped there; `app.spec.ts` pins
it. Visual baselines are only authoritative in the pinned CI environment
(software WebGL / SwiftShader).

### The packaged builds (macOS, iOS)

This same bundle ships inside the macOS app (`make mac-app`, see
`desktop/README.md`), where it is served from an `app://` scheme, and inside the
iPhone app (`make ios-app`, see `ios/README.md`), where a Capacitor WKWebView
serves it from `capacitor://localhost`. Two things about that are worth knowing
while working here:

- **`VITE_PACKAGED=1`** is the variant of the build that ships *inside* an app.
  It drops the service worker (nothing to update from inside a bundle) and, via
  `__APP_PACKAGED__`, the "Check for updates" row on the settings page. It is
  the *only* build-time thing this app knows about either shell — resist adding
  a second branch; if a shell needs different behaviour, the shell should
  provide it. (Runtime is a different matter: `haptics.ts` asks Capacitor at
  call time whether it is running natively, because the *same* bundle has to
  work in a browser tab and on a phone.)
- **The app must reference nothing remote.** No CDN, no web font, no remote
  image: `scripts/check-offline-assets.mjs` scans the built output and fails
  the build (and the `web` CI job) over any URL that is not an XML namespace
  or the settings page's source-code link. Anything the app draws goes in
  `public/` or gets imported. A request need not name a host, though — the
  analytics collector is a *relative* path on whatever origin serves the app —
  so the script has a second pass over a `FORBIDDEN` list of same-origin paths.
  That pass is the only automated proof that `__APP_PACKAGED__` really folded
  the collector out; add to the list, not just to `ALLOWED`, when a same-origin
  endpoint appears.

The README gallery at the repo root is rendered from this app by
`npm run screenshots` (`scripts/make-screenshots.mts`): it builds, serves
`dist/`, and drives each shot through the `window.__ms` seam with an explicit
mine layout, one theme per shot. Add a row to its `SHOTS` table to add a
picture; `SHOTS=menu.png npm run screenshots` re-renders just one.
