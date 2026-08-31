# Rendering: cell styles, picking, colour and 3D markers

The Three.js pipeline — how a cell is cut, lit, coloured, picked and marked.
The board geometry it draws comes from [`boards.md`](boards.md); the settings
that choose a look are in [`ui.md`](ui.md).

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

## Picking (`Renderer.pick`)

A click is a ray, and the cell it lands on is the one **drawn** where it lands.
That takes both layers of the board: the tiles *and* the grout under them
(`PICK_LAYERS` in `render/boardMesh.ts`), nearest hit wins. A tile is shrunk by
the cell style's gap, so the grout line between two tiles — about a tenth of the
board — is not part of any tile, and picking the tiles alone left it aimable at
nothing. On a flat board that only made the click do nothing. On a two-sided
surface (cylinder, Möbius strip, Klein bottle) both faces are drawn and nothing
is culled, so the ray went on through the board and picked a cell on the **far
sheet**: a click aimed between two safe tiles in front opened, or detonated, a
cell behind them. The grout is the whole cell polygon, so with it in the ray's
path every point of the surface belongs to the cell you can see there.

Two traps live here:

- **A shared edge is a crack.** Two neighbours' grout meets exactly on the edge
  between them, and a ray aimed straight down that edge can be rejected by the
  triangles on *both* sides of it — each carries the edge in its own vertex
  order and computes its own barely-negative barycentric for the point. The
  crack is a rounding error wide and so sounds unreachable, but a fold line of
  the board landing on the middle of the canvas hits it for a whole column of
  clicks, and on a two-sided surface the ray comes out on the far sheet again.
  `BASE_OVERLAP` in `render/solidBoard.ts` closes it by laying each cell's grout
  a ten-thousandth of a cell past its own edges: orders of magnitude more than
  the crack needs, a hundredth of a screen pixel on the board.
- **A MouseEvent does not know where the pointer is** — not to the pixel. A
  `PointerEvent` carries fractional client coordinates (`clientX` of 394.7);
  `mousedown`, `click` and `contextmenu` carry the same point cut down to whole
  numbers, always down and to the left, by up to a pixel. The hover highlight
  comes from `pointermove` and the right-click flag came from `contextmenu`, so
  the two aimed at points a pixel apart: everywhere but at a cell edge that is
  the same cell, and within a pixel of the seam it is the neighbour — the player
  saw one cell light up and the pin land on another. `attachControls` keeps the
  pointer's real position from the last pointer event and aims the secondary
  action there whenever the MouseEvent is that same point rounded off
  (`pointerPoint` in `input/controls.ts`); a context menu raised from the
  keyboard, which no pointer event precedes, still uses its own coordinates.
  Nothing else picks from a MouseEvent — a tap picks at `pointerdown`, which is
  a PointerEvent and so already agrees with the highlight.
- **`cellScreenXY` is not the inverse of `cellAtScreenXY`** on a two-sided
  surface. Nothing is culled there, so it reports a position for a cell hidden
  behind the immersion too; round-trip through `cellAtScreenXY` when a test
  needs a cell that is genuinely on top (`tests/e2e/picking.spec.ts` does).

What is *not* a bug: a pick on the far sheet where the near one does not cover
it — the open ends of a cylinder show the inside of the far wall, and the Klein
bottle's neck is cut away where it passes through the body (see below), which is
a real hole in the surface. Both are cells the player can see and should be able
to click.

## Cell styles (`src/render/cellStyle.ts`)

How a cell is **cut**. Not a setting of its own: the **theme** names one (see
"Settings and themes"), so the table has one entry per theme and the keys match
the theme keys — one each, a bijection since the colour scheme became its own
setting and Light and Dark stopped being two themes sharing `flat`. Three:
**classic** (the beveled button that sinks when
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
  cylinder, Möbius strip and Klein bottle — and `cube3d`, whose slices are open
  sheets and so would vanish under front-face culling the moment the board was
  turned past ninety degrees — draw flat tiles with no loop stack, and
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
- **Classic's two grays are a quotation.** They are the pygame board's own
  `HIDDEN_FACE` / `REVEALED_FACE` from `minesweeper/gui.py`, guarded by
  `tests/test_theme_sync.py`, so the 1990s board reads the same in both
  front-ends. A lit style's `albedo` pays back what diffuse shading takes —
  the head-on top face returns about 0.32, so `1/0.32 ≈ 3.1` pays it back
  exactly, which is what lands `classic` on those grays rather than on the
  third of them a lit board would otherwise show.
- **`albedo` is applied last, and comes out of the win glow.** Last, because
  everything else in `writeColor` (the hover lift, the reveal ripple) works in
  0..1 — `offsetHSL` on an already-boosted colour reads a lightness past 1 and
  clamps to white. Out of the glow, because the win crest is deliberately
  overdriven past white for the shading to bring back down: multiplied by the
  boost as well it would clip, so the boost is divided out of the overdrive and
  the wave peaks where it always did.

Cell styles are **not** in `data/ui/screens.json`: they are geometry for this
renderer, with no pygame counterpart for the shared config to keep in step. The
themes that name them are not there either, for the same reason — see
"Settings and themes" in [`ui.md`](ui.md).

## The Klein bottle's self-intersection (`src/boards/clipSolid.ts`)

The Klein bottle cannot be embedded in three dimensions, so its immersion passes
through itself: the neck dives through the belly, and the patch of the far sheet
that ends up *inside* the neck caps the view down the bore. `kleinClip` in
`surfaces.ts` picks that patch out and the renderer cuts it away, which is what
makes the hole read as a hole.

**Cut against the drawn tube, never the smooth one.** The board is drawn as flat
tiles, so the neck as drawn is a *polygon* inscribed in the circle the immersion
stands for — inside it everywhere but at its corners, and by a good margin on a
coarse board. Cutting against the circle is therefore wrong in two visible ways,
and both were shipped for a while:

- **At the bottom of the bottle** the two sheets converge on one circle (they
  meet at the fold, where the neck turns back on itself). The chords the tiles
  are drawn as cross over there, so the circle-shaped cut took bites out of
  tiles that nothing stands in front of — holes one could see the far side of
  the board through, worst on the coarsest boards, where the chords are deepest.
- **Along the self-intersection** the cut edge followed the circle while the
  tube meant to hide it followed the chords, leaving a slit between them.

Cutting against the drawn triangles fixes both by construction: whatever comes
off is behind the tube, because the tube is what defined it. The cut is a
different polyline on every tiling and at every size, which is the point — it is
the tessellation's own crossing, not an idealisation of it.

**How the region is built.** The neck's cross-sections are horizontal, which is
the lever:

1. Slice the drawn tube at every height one of its vertices sits at. Inside such
   a **slab** every triangle either spans the full height or is absent — there
   is no vertex in between for it to start or stop at.
2. Over one slab the tube is a band around its axis, so what it encloses splits
   into one **wedge** per triangle: the angular sector that triangle spans,
   floored and ceiled by the slab and walled by the triangle's own plane. Two
   triangles sharing an edge share the sector wall through it, so the wedges
   tile the interior with no gap and no overlap. That matters because the region
   is nowhere near convex — a cell is fanned from its centroid, which on a
   coarse board sits well inside the ring of its corners, so the tube's own
   cross-section is a **star**, dipping inward between every pair of corners. A
   single convex bound per slab leaves those dips uncut, and on the coarsest
   boards that is most of the cap.
3. A polygon minus a convex piece decomposes into convex parts
   (`P \ ∩Hᵢ = ⋃ᵢ P ∩ H₁ ∩ … ∩ Hᵢ₋₁ ∩ ¬Hᵢ`), so subtracting the union is a run
   of half-space clips — exact, with no sampling and no subdivision, and with
   the crossing points on a shared edge coming out identical for both cells, so
   the cut never cracks.

Traps, all of them paid for:

- **A wedge's walls are pinned at its slab's mid height** and the crossing
  drifts as the tube leans, so a wedge is only exactly its triangle's sector in
  the middle of its slab. `SLAB_STEP` splits a tall slab into steps to shrink
  that drift with it; it is the one approximation left, and it is what lets a
  four-domain board (a tube two rows tall) come out as sharp as a forty-domain
  one.
- **A flat cell lying in a slab's own floor** — the fold at the bottom of the
  bottle is horizontal, and the slabs are cut at exactly the heights its
  vertices sit at — must be settled before it is clipped, or it comes out both
  peeled off and kept, and is drawn twice. `subtractConvex` classifies a plane
  the polygon only touches as one that takes nothing, and the bounding-box tests
  count touching as reaching for the same reason.
- **The occluder stops at the seam.** The neck runs on past its own tube into
  the belly, and up there it is no longer one loop per height; there is nothing
  left to cut either, the other sheet ending at the same seam.
- **`CLIP_MIN_AREA` is a floor on what is worth cutting.** All round the bottom
  the tube's rim *is* the other sheet's rim — they share their vertices — so the
  two meet in slivers that are rounding rather than geometry. Re-cutting a cell
  to drop a ten-thousandth of it buys nothing but triangles, and what is left
  uncut is inside the tube where it cannot be seen: leaving a hair too much is
  the safe way to be wrong, and cutting a hair too much is the way that shows.
- **The decomposition is pruned to the cells that are cut.** The whole tube's
  interior is decomposed to *find* those cells, and only the part of it near
  them is ever subtracted from anything; the rest would be a few thousand pieces
  a phone carries around for the length of the game.

`SurfaceClip.occluder` keeps the tube's own triangles, so a test can measure the
cut against the geometry it is meant to meet rather than against the derivation
of it — `insideOccluder` is an independent parity test through the drawn
cross-section, and `tests/unit/clipSolid.test.ts` and `surfaces.test.ts` pin the
two answers together.

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
- **...and neither is it a place to measure a cell *from*.** The colour is not
  the only thing that reads a polygon: so do the cell's centre, its radius, the
  inradius the number has to fit inside, and the inset the mesh is drawn with.
  All of them took the plain **vertex average** as the centre, which a
  collinear vertex drags toward whichever edge carries it — and since the
  inradius is a `min` over the edges, the distance to that very edge is then
  what wins. A brick with one T-vertex on a long edge came out at **0.80** of
  its true size (0.667 on the three-brick weave), with the number both shrunk
  and shoved off-centre and its grout gap wider on one side than the other.
  `solidBoard`/`polygonBoard` measure `corners(poly, board.cornerMask?.get(cell))`
  and *draw* the full polygon; on a board with no T-vertex that is the identity,
  which two before/after screenshots of a sphere and a cube confirm to the
  pixel. The mask is not optional where there is one: a curved immersion bends
  a T-vertex as far from flat as a real corner, which is why `Board3D.cornerMask`
  exists at all.
- **A face normal must be Newell's, not a cross product of three vertices.**
  `solidFaces` in `ui/icons.ts` took the icon's back-face test from the first
  three points of each polygon. `splitAtLatticePoints` emits `corner,
  splits-of-edge-0, corner, …`, so a brick whose first edge carries a T-vertex
  has three *collinear* points there — and the answer is not a clean zero the
  `|| 1` guard would catch but rounding noise, so `facing` came out as an
  arbitrary number in [-1, 1]: half those faces were culled outright, leaving
  the near-black panel showing through, and the rest took a random shade. A
  quarter of a basket-weave cube's bricks went that way. `newellNormal` sums
  over every edge and cannot degenerate; it is what the real renderer has always
  used, which is exactly why the board drew correctly while its icon did not.
- **Icons share the hue, not the tone.** The board tint is deliberately faint;
  at 38 px it would read as gray, so the icon profile puts each hue near the
  lightness where it is most colourful. `shape()` reads the tone off the
  polygon it is drawing — a new icon needs an `ICON_TONES` row only when its
  art is *not* a drawing of the board's cell (a subdivided outer polygon, an
  idealised stand-in for an irregular tile, a solid in projection), and a
  `null` tone opts out into the old indigo chrome (tubes, frames, the question
  mark).
- `src/config/screens.ts` — typed accessor over `../data/ui/screens.json`.
- `src/ui/backgroundPattern.ts` — the board's own tiling as the page behind it,
  on the Realistic theme (see "The page follows the board's tiling").
- `src/ui/settings.ts` / `src/ui/theme.ts` / `src/settings.ts` — the settings
  page, the CSS-custom-property theme applier, and the stored preferences (see
  "Settings and themes").
- `src/leaderboard.ts` / `src/ui/scoreDialog.ts` / `src/ui/bestTimes.ts` — the
  stored best times, the window a placing win puts up and the page that lists
  them (see "Best times"). `src/storage.ts` holds the two `localStorage`
  helpers both stored records share.
- `src/testHook.ts` — the `window.__ms` seam Playwright drives.
