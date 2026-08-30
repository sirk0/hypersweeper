# The pygame front-end

The Python/pygame game is the **reference implementation**: it is not deployed,
but it is the behaviour the TypeScript app in `web/` is checked against. Change
it only when the request names it, or when a shared-`data/` edit necessarily
carries over — see "Which version to change" in the root
[`AGENTS.md`](../../AGENTS.md).

## The UI

`minesweeper/gui.py` is the pygame UI. `MenuScreen` (a geometry-first home
page — Classic / Flat / Flat manifolds / Sphere / Platonic solids /
Catalan solids / Polyhedra; **the pygame
menu only** — the web menu was restructured in `web/` alone and is
described in [`../../web/docs/ui.md`](../../web/docs/ui.md). Classic
launches flat squares; Flat (the plane) and each flat manifold (cylinder,
Möbius, Klein, torus) open a shared tiling picker — the Regular / Uniform
/ Laves family submenus, Isogonal and Congruent rectangles on every
surface, Aperiodic and
Fractals on the plane only, and a random option
— parameterised by the surface it was reached through. The last four are
**solid groups**: a flat list of finished boards, one click from the home
page, all four declared by one `menu.solidGroups` table in
`data/catalog.json` so a new group is a data row rather than menu code.
Navigation is a `path` breadcrumb
driven by the `MENU_ROOT`/`MANIFOLD_*`/`FAMILY_*`/`SOLID_GROUP_*` tables
and the `family_rows`/`picker_families` helpers
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
CI runs `make test`/`make lint`. The deploy publishes the **TypeScript** app
in `web/`, not this one — `make web-package` is a local build only.

## Tests

```sh
.venv/bin/pytest            # full suite, sub-second
```

GUI tests run headless (SDL dummy driver, set in tests/test_gui.py).

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

## Web build (pygbag)

`main.py` is the browser entry point; the game loop is async
(`App.run_async`) so pygbag can yield to the browser each frame. This
build is **no longer deployed** — `deploy-cloudflare.yml` publishes the
TypeScript app at the site root (and `/next/`, where that app lived during
the rewrite, redirects there via `web/public/next/index.html`) — so
`make web-package` / `make web-run` are for running the pygame version in a
browser locally. Browser-specific
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

## Verifying a change

- `make test` — the suite is sub-second. New boards are covered
  automatically: `TestInvariants` runs over every registered mode
  (adjacency symmetry, no self/duplicate neighbours, polygons in bounds,
  solvable mine counts), and for wrapped surfaces `TestWrappedArchimedean`
  checks the Euler characteristic (0) and that
  `boundary_components(board)` equals the surface's declared count.
- `make lint` — ruff (E/F/W/I; long geometry/table lines are allowed).
- Manual: `.venv/bin/python -m minesweeper` and walk the menu, or
  `.venv/bin/python -m minesweeper --mode <mode>` to jump straight in.
- Screenshot check for anything visual — see "Screenshots (headless)"
  above.
