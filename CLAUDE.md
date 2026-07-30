# Minesweeper (pygame)

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
  `_ArchTemplate` system), `aperiodic` (Penrose, Spectre), `solids` (spherical
  polyhedra, cube, tetrahedron, frames), `surfaces` (donut/cylinder/
  Möbius/Klein-bottle wrapping via shared immersion helpers), `catalog`
  (the menu, **derived** from `SURFACE_SPECS`/`TILING_SPECS`), `presets`
  (`ARCH_PRESETS` + `build_board`). The eight non-regular Archimedean
  tilings (six with two tile shapes, plus 3.4.6.4 and 4.6.12 with three)
  and their eight Laves (dual/Catalan) duals — built mechanically by
  `_dual_template` — wrap onto the donut/cylinder/Möbius/Klein-bottle via
  `_ArchTemplate` (one rectangular periodic domain + modular seam gluing;
  snub hexagonal and its dual the floret pentagonal are chiral, so no
  Möbius and no Klein bottle — both seams reverse orientation). The
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
  the shape colouring drops it before measuring. They wrap the torus and
  cylinder like every other periodic family, and the two reflective ones
  (offset square, staggered triangular) also wrap the Möbius strip and
  Klein bottle; the other four are chiral (no template mirror), which
  gates them out of those two seams exactly as it does snub hexagonal.
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
  only, **Aperiodic**. `ARCH_TILINGS` is
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
  (`penrose_board`, `spectre_board`) grow generously and trim
  to the `keep` centremost cells by Chebyshev distance (`max(|dx|, |dy|)`)
  — generously enough that `keep` is a small fraction of the patch, or the
  substitution's own star-shaped outline is what the board reads as. See
  the `AGENT NOTE` in `boards/tilings.py`.
  The two aperiodic boards each keep exact vertex ids in their own ring:
  ℤ[ζ5] (Penrose) and ℤ[ζ12] (Spectre). Only Penrose's is discrete — ℤ[ζ12]
  is dense in the plane, so `spectre_board` cannot snap a float vertex back
  to a lattice the way the game's original third aperiodic board, The Hat
  (since removed as a menu entry), did — and instead carries every
  placement of the paper's chiral
  substitution as an exact `(rotation mod 12, mirror, translation)` triple.
  Its tile is Tile(1,1) held as an equilateral **14-gon**: the 14th corner
  is the collinear one, kept so a neighbour's corner landing there is a
  shared vertex id, dropped again by `shapeMetrics`/`corners` so the tile
  measures as the 13-gon it is drawn as.
- `minesweeper/gui.py` — pygame UI. `MenuScreen` (a geometry-first home
  page — Classic / Flat / Flat manifolds / Sphere / Polyhedra. Classic
  launches flat squares; Flat (the plane) and each flat manifold (cylinder,
  Möbius, Klein, torus) open a shared tiling picker — the Regular / Uniform
  / Laves family submenus, Isogonal, Congruent rectangles and Aperiodic on the
  plane only, and a random option
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
CI runs `make test`/`make lint`, Pages deploys `make web-package`.

## Web build (pygbag)

`main.py` is the browser entry point; the game loop is async
(`App.run_async`) so pygbag can yield to the browser each frame.
`.github/workflows/deploy-pages.yml` builds and deploys to GitHub Pages
on every push to master. Browser-specific care in the code: no plain
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

The in-progress TypeScript/Three.js rewrite lives in `web/` and shares its
config and conformance oracle with the Python game through `data/*.json`
(see AGENTS.md). Commands (`npm run typecheck/test/build`, Playwright
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

The menu's gear opens a **settings** page (best times, theme, cell style,
animations toggle, build version, links, update check) — one more `Menu` page
rather than a modal, with the theme picker and the cell-style picker pages below
it. Theme, difficulty, the cell style and the
animations override persist (`src/settings.ts`): one stable
`localStorage` key holding a record that carries its own `version`, never
a versioned key name — see "Settings and themes" in `web/README.md` before
adding a field. Its themes are the six pygame `THEMES` palettes plus a web-only
`dark`, declared in `data/ui/screens.json` and applied by `src/ui/theme.ts`
as CSS custom properties on `:root`; `data/ui/screens.json` is the single
source and `tests/test_theme_sync.py` guards it against the pygame side.
Two invariants: the **board is never themed** (only chrome is, as in
pygame), and the **WebGL canvas is transparent** so the field around the
board is the page background — never give it an opaque clear colour again.
New chrome colours must come from a `var(--…)`, or they break the dark
theme. See "Settings and themes" in `web/README.md`.

**Cell styles** (`src/render/cellStyle.ts`) are the other half of the same
page: how a cell is *cut*, not what colour it is (that stays the shape
palette's). A style is one table entry — a stack of concentric loops per cell
plus a finish — that both board meshes build their geometry from, and it is
baked in when a board's mesh is built, so it applies from the next board on.
Three traps: `closed` and `open` must declare the **same loop count** (an opened
cell is re-cut into the buffer slice the closed one wrote); `unlit` is a **flat
board's** setting only — on a solid the shading is what shows the shape; and a
flat board is lit head-on, so `roughness` says nothing there (a specular finish
only reads on a solid, as it turns) while the gap, the loop count, `unlit`,
`albedo` and `shade` are what the plane actually shows.
There is deliberately **no bundle-size budget or CI gate** for the TypeScript
app. See "Cell styles" and "Bundle size" in `web/README.md`.

## Which version to change

Two front-ends live in this repo: the Python/pygame game and the
TypeScript/Three.js app in `web/`. **When a request does not say which one
it means, it means the TypeScript app** — change `web/` (and the shared
`data/*.json` when the change belongs there). Touch the Python game only
when the request names it, or when a shared-`data/` edit necessarily
carries over.

## Pull requests

Do not commit PR screenshots to `docs/screenshots/` (that folder holds only
the curated README shots).
