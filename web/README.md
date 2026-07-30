# Minesweeper Tiles — TypeScript + Three.js app (`web/`)

The in-progress TypeScript rewrite (Three.js / WebGL), living alongside the
Python game per `docs/plans/typescript-rewrite-same-repo.md`.

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

**M10 — Cell styles.** How a cell is *cut* is now the player's
(`src/render/cellStyle.ts`, Settings › Cell style): **Classic** (the beveled
button), **Flat** (unlit plates in flat colour, wide gaps), **Soft** (rounded
matte pillows lit from the top left) and **Glossy** (unlit beads on the plane, a
specular sheen that sweeps across a solid as it is dragged around). A style is
one table entry — a stack of concentric loops per cell, plus a finish — and both
meshes build their geometry from it, so the two renderers stayed as they were.
Colour is untouched by all of it: it is still the shape palette's, which in the
same pass got a **wider size axis** — the isogonal tilings' two or three sizes of
one polygon now differ in lightness, hue and chroma at once rather than by a
lightness whisper. See "Cell styles" and "Shape colour coding" below.

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
difficulty. 27 modes.

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
npm run typecheck   # tsc --noEmit (strict)
npm run test        # vitest unit tests
npm run build       # tsc + vite build (production bundle + PWA)
npm run e2e         # Playwright e2e + visual regression
npm run e2e:update  # refresh visual baselines
```

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
  helpers), `tilings.ts` (the flat regular builders), `solids.ts` (the
  closed 3D boards), `surfaces.ts` (the torus/cylinder/Möbius/Klein wraps,
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

How a cell is **cut**, chosen in Settings › Cell style and stored with the other
preferences. Four: **Classic** (the beveled button that sinks when opened),
**Flat** (unlit plates in flat colour with wide gaps), **Soft** (rounded matte
pillows, the one style whose *lighting* does the work) and **Glossy** (unlit
beads on the plane; on a solid, a specular sheen that sweeps across the faces as
the board is dragged around). It is only the relief and the finish — the *colour*
of a cell is the shape palette's, in every style, so the two can be retuned
apart.

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
  re-cut in flight. That is safe because the setting is only reachable from the
  settings page, which lives in the menu, and the menu is only up when no game
  is — the picker says "applies to the next board" for the case where a board is
  waiting behind it.
- **A flat board is lit head-on**, so a shinier material has no angle to catch a
  highlight at: on the plane, `roughness` is nearly invisible and the visible
  levers are the gap, the loop layout, `unlit` (draw the palette colour as it is
  rather than the ~60% of it that diffuse shading returns), `albedo` (ask for
  more colour than exists, so a *lit* style gets the palette's colour back
  without giving up its shading) and `shade` (a brightness gradient from the
  middle of the top face to its rim, interpolated by the rasteriser). On the
  plane Glossy is a *gradient*, not a specular highlight, for exactly this
  reason — the highlight is what it does on a solid.
- **Two loops next to Classic is not a style.** Soft shipped at two loops once
  and read as "the setting did nothing": on the plane it differs from Classic
  only in the width of one bevel band. What separates a lit style from Classic is
  loop *count* (four, with the heights easing off toward the top, so the shading
  falls away instead of stepping), the gap, and the albedo. If a new style looks
  like one that is already there, it is not worth a row in the picker.
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
renderer, with no pygame counterpart for the shared config to keep in step.

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
building history the back button would have to unwind. A board opened with an
explicit `seed` keeps it in the link, so that exact board can be handed on;
ordinary games carry no seed and stay re-rollable on reload.

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

## Settings and themes

The gear on the menu title row opens a settings page — not a modal: it is one
more `Menu` page (`Menu.showSettings`, rendered by `src/ui/settings.ts`), so it
reuses the back row, the `.menu-entry` cards and the scrolling body. The theme
is a page below it in the same way (`Menu.showThemePicker`): settings shows a
Theme row naming the current palette, and the seven-row picker lives one level
down, which keeps the settings page short enough to read at a glance. The cell
style (below) is a third page on the same pattern, under the same Appearance
heading — theme is the chrome, cell style is the board.

**Themes.** The seven chrome palettes live in `data/ui/screens.json` under
`themes`; six are ported from the pygame `THEMES` registry (`minesweeper/gui.py`)
and `dark` is web-only. `src/ui/theme.ts` applies one by writing the whole set of
CSS custom properties onto `document.documentElement` — the `:root` block in
`styles.css` is only the *boot* default (the `ios` palette) and must stay in step
with that entry. Two consequences worth knowing:

- **The board is never themed.** Only the chrome is, exactly as in pygame, which
  is why the `gallery.spec.ts` baselines are theme-independent. Do not reach for
  a theme colour in `shapePalette.ts` or `glyphAtlas.ts`.
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

**Cell style.** How the board's tiles are cut — see "Cell styles" above. It is
read when a board's mesh is built, so it applies from the next board on; the
picker page says so, since the settings page can be reached with a game paused
behind it. An unknown key (a record from a newer build, a hand-edited one) falls
back to `classic` through `resolveCellStyle`, which uses `Object.hasOwn` for the
same reason `link.ts` does.

**Persistence.** `src/settings.ts` is the app's only stored state: theme,
difficulty, the animations override and the cell style. Flag mode, zoom, the menu
page you are on and the board in progress stay in memory as before.

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

## Shared configuration

UI-screen chrome (header slots, menu structure, difficulty rows, themes, smiley
faces) is declared once in **`data/ui/screens.json`** at the repo root and read
by both front-ends, so the pygame and TypeScript UIs can be kept in sync from a
single source rather than hand-matched. `src/config/screens.ts` gives the TS app
compile-time types over it. Later milestones extend the same shared-`data/`
approach to the board catalog and presets (see the plan).

## Deploy

CI (`.github/workflows/ci.yml`, `web` job) typechecks, unit-tests, builds and
runs the e2e/visual suite. During the transition GitHub Pages hosts both apps:
the pygbag build at the site root, this app under `/next/` (Vite `base` set from
`VITE_BASE` in `deploy-pages.yml`). Visual baselines are only authoritative in
the pinned CI environment (software WebGL / SwiftShader).
