# Minesweeper Tiles — TypeScript + Three.js app (`web/`)

The in-progress TypeScript rewrite (Three.js / WebGL), living alongside the
Python game per `docs/plans/typescript-rewrite-same-repo.md`.

**M6 — Polish.** Board animations (`src/render/animations.ts`), driven by a
single `CellAnimations` clock the renderer ticks each frame only while
something is in flight (the loop stays idle otherwise): a **reveal ripple**
(each freshly opened cell flashes brighter than its settled tone, staggered by
its distance from the click so a wave sweeps outward across a flood fill), a
**flag pop** (a placed flag's glyph springs in with a small ease-out-back
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
PWA manifest already ships. A zero-dependency bundle gate (`npm run size`,
enforced in CI) keeps the shipped JS + CSS under the **250 KB gzip** budget
(currently ~145 KB). **All 105 modes, polished.**

**M5 — Aperiodic tilings.** Ports `src/boards/aperiodic.ts`: the Penrose P3
rhombi (exact ℤ[ζ5] vertex arithmetic, Robinson-triangle deflation) and the Hat
monotile (H/T/P/F metatile substitution in floating point, each vertex snapped
back to an exact Eisenstein integer id). Both grow generously and trim to the
centremost cells by Chebyshev distance for a roughly square patch. Their
difficulty presets move into the shared `data/presets.json` (so the conformance
oracle covers them), and the flat tiling picker gains an **Aperiodic** family
submenu (plane only). **All 105 modes.**

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

**M2 — 3D renderer + solids.** Ports the ten closed 3D boards (sphere,
snub dodecahedron, C80/C180 fullerenes, geodesic triangles, cube,
tetrahedron, cube frame, tetrahedron frame, stepped bipyramid) and adds the
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
npm run size        # gzip bundle audit — fails over the 250 KB budget
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
  indexing blindly.
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
  ripple/flag pop/lose shake all settle back to the static baseline within
  ~0.5 s, the win wave within ~1 s on the biggest boards. Note that the
  *first* `page.screenshot` after a move costs ~1 s under SwiftShader
  (shader compilation), so take shots back to back rather than sleeping
  between them, or the whole animation is over before frame two.
- The Python game is the behavior reference; run it headless per the
  "Screenshots" section in the repo-root CLAUDE.md when unsure how
  something is supposed to look or feel.

## Layout

- `src/game.ts`, `src/rng.ts` — pure game rules (port of `game.py`) and a
  seedable RNG.
- `src/boards/` — `core.ts` (Board/Board3D, adjacency, topology, vector
  helpers), `tilings.ts` (the flat regular builders), `solids.ts` (the
  closed 3D boards), `surfaces.ts` (the torus/cylinder/Möbius/Klein wraps and
  the Klein `cellCycle`), `catalog.ts` / `presets.ts` (read `data/*.json`).
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
  (canvas-baked digit/flag/mine texture), `animations.ts` (the shared
  reveal-ripple / flag-pop / lose-shake / win-wave clock).
- `src/session.ts` — `GameSession`: Game ↔ mesh ↔ HUD.
- `src/input/controls.ts` — pointer/touch state machine (tap, long-press,
  right-click, drag-rotate on 3D boards).
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
  real `_ArchTemplate` tiling, a sphere row from the real solid projected and
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

## Shape colour coding (`src/render/shapePalette.ts`)

A cell's colour is derived from its polygon — nothing tags a cell with a
shape, and nothing needs to. **Hue** comes from the side count (an even
spectrum: 3 red, 4 orange, 5 yellow, 6 green, 8 teal, 12 blue, the 13-gon
hat violet), **chroma** from how regular the polygon is
(`(minAngle/maxAngle + minSide/maxSide) / 2`, 1 for a regular polygon), and
**lightness** from the cell's state — the step between the closed and opened
tone is exactly the one the gray board had. The maths runs in OkLCh, not HSL,
because HSL lightness is not perceptual and that constant hidden/opened
contrast across hues depends on it. Every knob lives in the one
`SHAPE_PALETTE` block.

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
  test sweeps the whole catalog to keep it the only one.
- **Icons share the hue, not the tone.** The board tint is deliberately faint;
  at 38 px it would read as gray, so the icon profile puts each hue near the
  lightness where it is most colourful. `shape()` reads the tone off the
  polygon it is drawing — a new icon needs an `ICON_TONES` row only when its
  art is *not* a drawing of the board's cell (a subdivided outer polygon, an
  idealised stand-in for an irregular tile, a solid in projection), and a
  `null` tone opts out into the old indigo chrome (tubes, frames, the question
  mark).
- `src/config/screens.ts` — typed accessor over `../data/ui/screens.json`.
- `src/testHook.ts` — the `window.__ms` seam Playwright drives.

## Shared configuration

UI-screen chrome (header slots, menu structure, difficulty rows, theme, smiley
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
