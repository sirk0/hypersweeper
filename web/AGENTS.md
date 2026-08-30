# The TypeScript app (`web/`)

This is **the deployed game** — `deploy-cloudflare.yml` publishes it to
Cloudflare Pages at the site root on every push to `master`. The pygame build in
`minesweeper/` is the reference implementation and is not published.

**When a request does not say which front-end it means, it means this one.**
See "Which version to change" in the root [`AGENTS.md`](../AGENTS.md).

## Build and run

```sh
cd web
npm install         # first time, and after a dependency change
npm run dev         # dev server at http://localhost:5173 — iterate here
npm run test        # vitest unit tests
npm run typecheck   # tsc --noEmit (strict), app then functions/
npm run build       # typecheck + production bundle into dist/
npm run preview     # serve that bundle at http://localhost:4173
npm run e2e         # Playwright e2e + visual regression
```

`npm run dev` serves the sources with HMR; `build` + `preview` serves the real
bundle from disk, which is what the screenshot recipe and Playwright drive and
the only way to exercise the PWA, the service worker or `VITE_PACKAGED`.
`vite preview` does not rebuild — re-run `npm run build` after every edit.

To *look at* a change without a browser of your own — ad-hoc screenshots, the
`window.__ms` seam, the menu-icon contact sheet — see
[`docs/testing.md`](docs/testing.md). The same bundle also runs inside the
macOS and iPhone apps (`make desktop-run`, `make mac-app`, `make ios-app` from
the repo root); see [`docs/deploy.md`](docs/deploy.md).

## Where to read next

| Working on | Read |
|---|---|
| Building, testing, screenshots, driving the app headless | [`docs/testing.md`](docs/testing.md) |
| Menu, settings, themes, dialogs, best times, achievements, share links | [`docs/ui.md`](docs/ui.md) |
| Cell styles, picking, zoom, shape colours, 3D markers, the Klein clip | [`docs/render.md`](docs/render.md) |
| Board symmetries and the controls that drive them | [`docs/boards.md`](docs/boards.md) |
| Sound | [`docs/audio.md`](docs/audio.md) |
| Sharing, analytics, deploy, PR previews, the macOS/iOS bundles | [`docs/deploy.md`](docs/deploy.md) |
| Board geometry — tilings, surfaces, solids, adjacency | [`../docs/agents/geometry.md`](../docs/agents/geometry.md) |
| Adding a board | [`../docs/agents/board-recipes.md`](../docs/agents/board-recipes.md) |
| The `data/*.json` both front-ends read | [`../docs/agents/shared-data.md`](../docs/agents/shared-data.md) |

[`README.md`](README.md) carries the milestone history — what each milestone
changed and why — which is worth reading when you need the reasoning behind a
design rather than the rule itself.

## Rules that apply to every change here

- **Verify visual changes by looking at real screenshots**, not just by the test
  suite passing. [`docs/testing.md`](docs/testing.md) says how.
- **The WebGL canvas is transparent** so the field around the board, and what
  shows through a translucent opened cell, is the page background. Never give it
  an opaque clear colour.
- **New chrome colours must come from a `var(--…)`**, or they break the dark
  scheme. The `:root` block in `styles.css` is the boot default and must stay in
  step with it, as must the `prefers-color-scheme: dark` block beside it.
- **A colour scheme never reaches the board.** The tiles are lit head-on by a
  fixed rig and read the same either way.
- **`VITE_PACKAGED=1` is the only thing this app knows about being packaged**,
  and it only *removes* (no service worker, no update check). Resist adding a
  second branch; if a shell needs different behaviour, the shell should provide
  it.
- **The app must reference nothing remote** — no CDN, no web font, no remote
  image. `scripts/check-offline-assets.mjs` fails the build over any URL it does
  not recognise.
- **Board data is shared.** Anything under `data/*.json` is generated from the
  Python side; re-run the exporters rather than hand-editing, or CI's
  `data-sync` job fails.
- There is deliberately **no bundle-size budget or CI gate** — see "Bundle size"
  in [`docs/deploy.md`](docs/deploy.md).

## Layout

- `src/game.ts`, `src/rng.ts` — pure game rules (port of `game.py`) and a
  seedable RNG.
- `src/boards/` — `core.ts` (Board/Board3D, adjacency, topology, vector
  helpers), `tilings.ts` (the flat regular builders), `aperiodic.ts` /
  `fractal.ts` (the aperiodic tilings and the self-similar boards), `solids.ts`
  (the closed 3D boards), `surfaces.ts` (the torus/cylinder/Möbius/Klein wraps,
  the Klein `cellCycle` and its self-intersection `clip`), `clipSolid.ts` (what
  that clip cuts against — the region the *drawn* neck encloses, exactly; see
  "The Klein bottle's self-intersection" in [`docs/render.md`](docs/render.md)), `catalog.ts` /
  `presets.ts` (read `data/*.json`).
- `src/render/` — one Three.js pipeline: `renderer.ts` (scene, ortho +
  perspective cameras, trackball rotation, resize, picking),
  `boardMesh.ts` (shared cell-visual vocabulary — the neutral palette, glyph
  map, and `isOpened`, the raised/sunken predicate both meshes cut their
  geometry from), `shapePalette.ts` (the shape colour code — see [`docs/render.md`](docs/render.md)),
  `polygonBoard.ts` / `solidBoard.ts` (merged beveled cell geometry —
  flat plane vs. solid surface — per-cell colours, hover, glyph quads; a
  closed cell is a raised button, an opened one is re-cut in place as a
  recess, which is what makes the two tell apart on a flat board lit
  head-on, where colour alone shades every face identically), `glyphAtlas.ts`
  (canvas-baked digit/flag/mine texture), `clip.ts` (the renderer's face of
  the `SurfaceClip` — how the Klein bottle drops the sheet its own neck
  encloses, so looking into the hole shows the tube instead of a cap; the
  surface outside the neck is untouched, so the self-intersection still reads
  from every other angle), `animations.ts` (the shared
  reveal-ripple / flag-drop / flag-pop / lose-shake / win-wave clock).
- `src/session.ts` — `GameSession`: Game ↔ mesh ↔ HUD.
- `src/input/controls.ts` — pointer/touch state machine (tap, long-press,
  right-click, drag-rotate on 3D boards, pinch-zoom and drag-pan on every
  board), plus `blockBrowserZoom` — the guard that keeps the *browser* from
  zooming the page (see "Zoom" in [`docs/render.md`](docs/render.md)).
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
