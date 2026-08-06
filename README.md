# Hypersweeper

Classic minesweeper, but the board can be almost any surface and tiling —
from a flat aperiodic Penrose mosaic to a Goldberg sphere or a Möbius strip.

**Play in the browser:** <https://sirk0.github.io/hypersweeper/>
(the TypeScript/WebGL app in [`web/`](web), deployed from master by GitHub
Actions; installable, and it works offline once loaded)

**Install on a Mac:**

```sh
brew tap sirk0/hypersweeper https://github.com/sirk0/hypersweeper
brew install hypersweeper
```

The same game as a native app that needs no internet connection at all —
every asset it draws is inside the bundle. Nothing binary is published:
[the formula](Formula/hypersweeper.rb) builds the app on your own Mac from
the source, which takes a few minutes and pulls in `node` to do it. Because
you built it, there is no Gatekeeper prompt and nothing to un-quarantine.
Homebrew asks you to trust a third-party tap the first time, and formulae
may not install into `/Applications`, so `brew` prints the one-line symlink
if you want it there. The tap is this repo, which is why `brew tap` takes a
URL.

<table>
  <tr>
    <td align="center"><img src="docs/screenshots/c180.png" width="380"><br>Goldberg GP(3,0) on a sphere <sub>· Minimal iOS</sub></td>
    <td align="center"><img src="docs/screenshots/mobiushex.png" width="380"><br>Hexagons on a Möbius strip <sub>· Dark</sub></td>
  </tr>
  <tr>
    <td align="center"><img src="docs/screenshots/penrose.png" width="380"><br>Penrose rhombi <sub>· Warm Paper</sub></td>
    <td align="center"><img src="docs/screenshots/torussnubsquare-lost.png" width="380"><br>Snub square on a donut, boom <sub>· Classic</sub></td>
  </tr>
  <tr>
    <td align="center"><img src="docs/screenshots/gosper.png" width="380"><br>Hexagons in a Gosper island <sub>· Soft Neumorphism</sub></td>
    <td align="center"><img src="docs/screenshots/hexhex.png" width="380"><br>A hexagon of hexagons <sub>· Flat Material</sub></td>
  </tr>
  <tr>
    <td align="center"><img src="docs/screenshots/menu.png" width="380"><br>The menu <sub>· Glassmorphism</sub></td>
    <td align="center"><img src="docs/screenshots/themes.png" width="380"><br>Seven themes, chrome only — a board is never themed</td>
  </tr>
</table>

Pick a surface, then a tiling:

- **Flat surface** — classic squares (8 neighbors), a triangle grid (12)
  and the same triangles cut to a triangular or a hexagonal board,
  hexagons (6) and a big hexagon composed of small hexagons (6); the eight
  non-regular uniform tilings: snub hexagonal 3.3.3.3.6, elongated
  triangular 3.3.3.4.4, snub square 3.3.4.3.4, rhombitrihexagonal
  3.4.6.4, trihexagonal 3.6.3.6, truncated hexagonal 3.12.12, truncated
  trihexagonal 4.6.12 and truncated square 4.8.8 — and their eight Laves
  (dual) tilings, from Cairo pentagonal and rhombille to the kisrhombille.
  Then, tiled by one congruent rectangle rather than by regular polygons,
  the five brick bonds — stacked bond, running bond, basket weave, the same
  weave three bricks at a time, and herringbone — where all the interest is
  in how the courses are staggered. Three tilings have no translation at
  all: a Penrose mosaic (P3 rhombi), "the spectre" (Tile(1,1)), the *chiral*
  monotile whose tiling uses rotations only and never mirrors a tile, and a
  phyllotactic spiral of one equilateral hexagon in five arms. Five more are
  self-similar — one tile inflated into a patch shaped like itself: the
  sphinx, the chair, the Sierpiński carpet, the pentaflake, and hexagons
  filling a Gosper island.
  The menu groups these as **Regular**, **Uniform**, **Laves**, **Isogonal**
  (six tilings by regular polygons that are *not* edge to edge — a tile's
  corner in the middle of its neighbour's edge), **Congruent rectangles**,
  **Aperiodic** and **Fractals**; every periodic family also wraps the
  cylinder and the torus below, and — unless the tiling is chiral — the
  Möbius strip and the Klein bottle too
- **Sphere (3D)** — a pentagonal hexecontahedron (60 pentagons, 7
  neighbors), a chamfered dodecahedron (12 pentagons + 30 hexagons), the
  Goldberg polyhedron GP(3,0) (12 pentagons + 80 hexagons), a geodesic
  icosahedron (80 triangles), a snub dodecahedron
  (12 pentagons + 80 triangles), a rhombicosidodecahedron or a truncated
  icosidodecahedron.
  (A sphere cannot be tiled with hexagons alone — Euler's formula
  forces 12 pentagons in.)
- **Polyhedra (3D)** — a cube tiled with squares (6 faces), a
  tetrahedron tiled with triangles (4 faces), a tetrahedron frame (a
  level-1 Sierpiński tetrahedron: the middle triangle removed from each
  face, leaving four corner tetrahedra that meet at the edge midpoints),
  a cube frame (a cube with a square tunnel bored through each pair of
  opposite faces — a level-1 Menger sponge, genus 5), or a stepped
  bipyramid (two stepped pyramids stitched base-to-base into a terraced
  diamond); tiled by triangles or squares, cells stitching across the
  edges where faces meet, inner walls and step shoulders included
- **Torus (3D)** — the grid wraps in both directions, so there are no
  border cells; pure hexagons are possible here, because the torus has
  Euler characteristic 0
- **Möbius strip (3D)** — a one-sided surface: the strip glues to itself
  with a flip, so a chiral tiling cannot wrap it at all
- **Klein bottle (3D)** — the donut glued with that same flip, one-sided
  and closed; the immersion hides cells behind its own neck, so the board
  scrolls to bring them round
- **Cylinder (3D)** — an open tube, wrapping in one direction only

## Playing

- **Left-click / tap** — reveal a cell (the first reveal is always safe);
  click a revealed number to chord
- **Right-click**, **long-press**, or the flag button in the header —
  toggle a flag
- **Face button** — new game; the **`<` button** goes back to the menu
- **Drag** a 3D board to turn it (arrow keys too); **pinch** or
  <kbd>ctrl</kbd>+wheel to zoom any board, <kbd>0</kbd> to frame it again
- On a Klein bottle, the **chevrons** (or <kbd>[</kbd> / <kbd>]</kbd>)
  scroll the board round its neck

Every board is a **link** — `?mode=…&difficulty=…`, plus a `seed` to share
the exact layout. Winning files the time: the fastest three per board and
difficulty live under Settings › Best times. Settings also holds the seven
themes, four cell styles, three sound presets (synthesised from the move
that caused them — a tile's side count is its voice), a haptics switch and
an animations toggle.

## Development

The game is a TypeScript/Three.js app in [`web/`](web):

```sh
cd web
npm install
npm run dev          # http://localhost:5173
npm run typecheck    # tsc
npm run test         # vitest unit tests
npm run e2e          # Playwright e2e + visual regression
npm run build        # production bundle into web/dist
npm run screenshots  # regenerate the gallery above
```

### A Mac app that plays offline

```sh
make mac-app       # build/desktop/mac*/Hypersweeper.app  (run this on a Mac)
make mac-app-dmg   # …and a drag-to-Applications .dmg
```

The same game, packaged with everything it draws — bundle, fonts, icons,
board data — inside the app, so it needs no internet connection at all.
The build proves that rather than promising it: it refuses to package a
bundle that references a remote URL, and then launches the app it built
with the network cut. See [`desktop/README.md`](desktop/README.md).

### An iPhone app that buzzes

```sh
make ios-app       # build the game and open the project in Xcode  (on a Mac)
make ios-run       # …or build straight onto a connected iPhone
```

The same game again, wrapped in a Capacitor WKWebView so it installs on a
phone and plays offline — and, being native, can reach the **Taptic
Engine**: a light tick when a flag lands, the system's sharp error buzz
when you step on a mine, its success buzz when the board falls. No web API
on iOS can ask for that. Building it needs a Mac with Xcode; a free Apple
ID signs it for 7 days at a time. See [`ios/README.md`](ios/README.md).

`web/README.md` is the guide to the code — the renderer, the board
builders, themes, sound, and how to drive the app headless.
[`data/*.json`](data) is shared configuration (the board catalog, presets,
UI screens) that both implementations read, plus a conformance oracle
exported from the Python game and replayed by the TypeScript tests, so the
two can never disagree about the rules.

## The pygame implementation

<img src="docs/screenshots/pygame/c180.png" width="300" align="right">

The original game is a Python/pygame app and stays in the repo as the
**reference implementation** — the behaviour the TypeScript port is checked
against, and the place `data/*.json` is exported from. It is no longer
deployed to the web; the site root serves the TypeScript app (`/next/`,
where that app lived during the rewrite, redirects there).

```sh
pip install -r requirements.txt
python3 -m minesweeper                 # menu
python3 -m minesweeper --mode hex      # skip the menu
python3 -m minesweeper --theme paper   # one of the six pygame themes
```

Controls match the web app; `n` starts a new game, `1` / `2` / `3` switch
difficulty and `Escape` goes back to the menu.

```sh
make venv     # create .venv with every dependency group
make test     # pytest
make lint     # ruff
make run      # desktop game
make web-run  # the pygbag browser build at http://localhost:8000
make help     # everything else
```

Code layout: `minesweeper/game.py` holds the rules over an arbitrary
cell graph; `minesweeper/boards/` generates the tilings (cell
vertices get exact hashable ids — lattice points in 2D, symbolic keys
in 3D — and two cells are neighbors when they share a vertex); the
sphere is built with the Conway gyro operation on an icosahedron;
`minesweeper/gui.py` is the pygame interface, including the rotatable
orthographic 3D view. Tests run headless via SDL's dummy video driver.
