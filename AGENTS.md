# Extending the board zoo

This file is the map for adding tilings and surfaces. It is written for
AI agents first: every extension point is a single, named place, and the
test suite tells you the moment something is inconsistent. Read
`CLAUDE.md` for how to run the game, the tests, and the web build.

## The model in one paragraph

A board is a set of polygonal **cells**. Cell vertices are generated with
**exact, hashable ids** (integer lattice points in 2D, symbolic/float
keys in 3D) so that two cells are neighbours exactly when they share a
vertex id — no floating-point tolerance. `game.py` plays minesweeper over
that abstract adjacency graph and knows nothing about geometry. Never
introduce a vertex id that relies on rounding two nearby-but-distinct
points to the same key.

## Package layout (`minesweeper/boards/`)

Import order is a strict DAG; a module only imports from the ones above it.

| Module | Responsibility |
|--------|----------------|
| `core.py` | `Board` / `Board3D`, the `_shared_vertex_adjacency` neighbour rule, `_build` (lattice→pixels) and `_finalize_flat` (float→pixels), 3D vector helpers, and the topology invariants `euler_characteristic` / `boundary_components` / `corner_fans`. |
| `tilings.py` | Regular flat builders (square/triangle/trigrid/hex/hexhex/hextri/hextriangle), the `_ArchTemplate` system, the eight Archimedean `_*_template()` factories plus their eight Laves duals (built by `_dual_template`), the six isogonal (non-edge-to-edge) ones and the five congruent-rectangle bonds, and the **`ARCH_TILINGS`** registry (the one place any of them is declared, with `_FAMILY_TRAITS` saying what each family is). |
| `fractal.py` | The rep-tile (fractal) boards: the sphinx and the chair. One `_RepTile` record per tile — unit outline, rep-4 dissection, lattice ops — and the shared inflation (`rep_placements`) both `sphinx_board` and `chair_board` build from. |
| `aperiodic.py` | Penrose (P3), the Spectre (Tile(1,1), the chiral monotile) and the phyllotactic spiral, each with exact-arithmetic vertex ids — ℤ[ζ5] for Penrose and the spiral, ℤ[ζ12] for the Spectre. The Spectre's ring is *dense* in the plane, so unlike Penrose's discrete lattice there is no lattice to snap a float vertex back to: its placements are carried as exact `(rotation, mirror, translation)` triples and no floating point enters the substitution at all. The spiral is the odd one out — no substitution, just ten 36° wedges of the tile's own translation lattice, the odd ones offset a step; nonperiodic because its five-fold centre forbids any translation. |
| `solids.py` | Closed/convex and polycube 3D boards (pentagonal hexecontahedron, Goldberg polyhedra, geodesic icosahedron, rhombicosidodecahedron, truncated icosidodecahedron, cube, tetrahedron, frames, bipyramid). |
| `surfaces.py` | Wrapping tilings onto surfaces: the three immersion points (`_torus_point`, `_cylinder_point`, `_mobius_point`), the shared `_assemble` tail, the nine simple `*_board` wrappers, and the Archimedean `arch_torus_board` / `arch_cylinder_board` / `arch_mobius_board`. |
| `catalog.py` | The menu, **derived**: `SURFACE_SPECS` and `TILING_SPECS` (leaf data loaded from `data/catalog.json`) produce `MODE_LABELS`, `TILINGS`, `SURFACE_LABELS`, the geometry-first menu tables (`MENU_ROOT`/`MANIFOLD_*`/`FAMILY_*`/`SPHERE_MODES`/`POLYHEDRA_MODES`/`SHAPED_MODES`) and the picker helpers (`family_rows`, `picker_families`, `picker_modes`), `MODES_3D`, `mode_for`, `surface_of`, `view_hint`. |
| `presets.py` | Difficulty presets and `build_board`. Flat regular, solid, Archimedean/Laves and aperiodic (penrose/spectre/phyllotaxis) presets all load from `data/presets.json` (shared with the web port). The Archimedean rows are authored in the compact **`ARCH_PRESETS`** table (tiling → surface → difficulty → args) that `scripts/export_data.py` expands into `data/presets.json`. |

`__init__.py` re-exports the whole public surface, so `from
minesweeper.boards import ...` is unchanged by the split.

### Shared JSON config (`data/*.json`) — single source of truth

A TypeScript/Three.js port of the game lives in `web/` (see
`docs/plans/typescript-rewrite-same-repo.md`). To keep the two
implementations from drifting, the *pure-data leaves* of the config live
in repo-root JSON that **both** front-ends read — so a value is never
written twice:

- `data/catalog.json` — `SURFACE_SPECS`, the regular `TilingSpec` rows,
  `DIFFICULTIES`, `SOLO_LABELS`, and the menu taxonomy/labels. `catalog.py`
  loads these via `boards/_data.py`; the *derivations* stay in code.
- `data/presets.json` — the difficulty presets for the **ported** modes
  (the flat regular ones — square/triangle/trigrid/hex/hexhex/hextriangle —
  the twelve solids, the regular-tiling surface wraps, every Archimedean/Laves
  tiling × surface, and the three aperiodic tilings — penrose/spectre/phyllotaxis), as
  `{mode: {builder, args}}`. The Archimedean/Laves rows carry the tiling
  key as their first arg. `presets.py` loads every row into `_PRESETS`
  via `_JSON_BUILDERS`; `_PRESETS` starts empty and holds only any
  still-unported one-offs. The Archimedean rows are generated from the
  compact `ARCH_PRESETS` table by `scripts/export_data.py`, so that table
  is their authoring source.
- `data/conformance.json` — board statistics (cell/mine/euler/boundary/…)
  per ported mode × difficulty, the TypeScript conformance oracle.

`scripts/export_data.py` and `scripts/export_conformance.py` regenerate
these from the Python side; the CI `data-sync` job re-runs them and fails
on any diff. `make web-prepare` copies `data/` into the pygbag stage so
the Python web build finds it at runtime.

A **mode** is the string `build_board` takes. For a periodic tiling it is
`surface.prefix + tiling.key` (e.g. `torustrihex`); `catalog.mode_for`
is the only place that convention lives. Solids/aperiodic/shaped modes
are one-offs listed directly in the `SPHERE_MODES` / `POLYHEDRA_MODES` /
`APERIODIC_MODES` tuples (and `SHAPED_MODES`, which maps a regular tiling
key to the shaped flat boards cut from it) with labels in `SOLO_LABELS`.

## Recipe: add an Archimedean (periodic) tiling

Example goal: a new uniform tiling `foo` (say 3.4.6.4-like).

1. **Template** — write `_foo_template()` in `tilings.py` returning
   `_template(config, width, height, polygons, mirrored=?, glide=?)`.
   Supply one rectangular fundamental domain's cells as float-coordinate
   polygons. Copy the closest existing factory: `_trihex_template` is the
   simplest, `_snubsquare_template` shows the p4g `glide=True` case,
   `_snubhex_template` shows a chiral tiling (`mirrored=False`). Helpers
   `_hex_lattice_polygons`, `_regular_polygon`, `_square_on_edge` build
   hexagon-lattice tilings.
2. **Registry** — add one `ArchTiling("foo", "Foo label", config,
   edge_directions, _foo_template)` row to `ARCH_TILINGS`, in
   vertex-configuration order (the registry order is the menu order; the
   `family` field, defaulting to `"uniform"`, picks the menu page). This alone
   feeds `_ARCH_CONFIGS`, `_ARCH_TEMPLATES`, and — via `catalog` — the
   menu, mode strings, `MODES_3D`, and chirality gating (a tiling whose
   template has no mirror is automatically denied the Möbius strip).
3. **Presets** — add a `"foo": {...}` block to `ARCH_PRESETS` in
   `presets.py` with `flat` / `torus` / `cylinder` / `mobius` / `klein`
   args per difficulty. Omit `mobius` / `klein` if the tiling is chiral.
   Run `scripts/export_data.py` (and `export_conformance.py`) to expand it
   into `data/presets.json` (and refresh the oracle); both front-ends load
   from there.

That is it — no edits to `catalog.py`, `gui.py`, or the tests. The
board-shape convention (a flat board must read as a roughly *square*
rectangle, symmetric if the tiling is) is load-bearing: see the
`AGENT NOTE` comment in `tilings.py` and `archimedean_board`'s docstring.

## Recipe: add a Laves (dual / Catalan) tiling

Laves tilings are the **duals** of the Archimedean tilings: a vertex at
each Archimedean tile centre, joined across every shared edge. All eight
already ship (`_prismaticpent_template` … `_kisrhombille_template`), and
they use the *same* `ARCH_TILINGS` registry, `_ArchTemplate` system,
wrapping and presets as the Archimedean tilings. The `_dual_template`
helper builds one mechanically from its primal factory, deriving the tile
polygons (primal tile centres → dual vertices), the shared mirror/glide,
the `config` (the primal's vertex configuration — the Laves symbol), and
the flat-window `centre` (the primal's largest-tile centre, a rotation and
mirror centre of both tilings). So each factory is a one-liner. Two things
differ from an Archimedean tiling, both handled for you:

- A Laves tiling is **face-transitive** (one congruent tile shape, several
  vertex kinds) rather than vertex-transitive. Declare it with
  `family="dual"` on its `ArchTiling` row (which makes
  `vertex_transitive` False); the vertex-config tests then skip it,
  `TestArchimedean.test_tiles_are_congruent` covers it instead, and the
  catalog routes it into the **Laves** menu submenu automatically
  (`DUAL_ARCH` is exactly the `family="dual"` rows, so no menu edit is
  needed).
- Its handedness (reflective vs chiral, hence Möbius or not) is read from
  the primal's mirror/glide automatically — the floret pentagonal (dual of
  snub hexagonal) is chiral, so like snub hexagonal it has no Möbius wrap.

Steps (say a new primal `_foo_template` gained a dual `_bar_template`):

1. `def _bar_template(): return _dual_template(_foo_template)` in
   `tilings.py`.
2. Add an `ArchTiling("bar", "Bar label", config, edge_directions,
   _bar_template, family="dual")` row to `ARCH_TILINGS` (`config`
   is the Laves symbol, i.e. the primal's vertex configuration).
3. Add a `"bar"` block to `ARCH_PRESETS` (skip `mobius`/`klein` if chiral).
   The windows can copy the primal's — the dual shares its fundamental
   domain; only retune the mine counts to the dual's tile count.
4. Add the tiling's wrapped cell counts to
   `TestWrappedArchimedean.test_cell_counts` (that test asserts the count
   table matches the set of wrapped modes, so it fails until you do).

No `catalog.py` menu edit is needed — the Laves submenu derives from
`family`.

Everything else — mode strings, `MODES_3D`, chirality gating, symmetry and
congruence invariants — derives automatically.

## Recipe: add an isogonal (non-edge-to-edge) tiling

The third family in `ARCH_TILINGS`. These are vertex-transitive like the
Archimedean tilings but **not edge to edge**: a tile's corner lands in the
interior of its neighbour's edge (a T-vertex), so a vertex reads e.g.
90 + 90 + 180 rather than as a corner sequence. Six ship
(`_offsetsquare_template` … `_threescaletri_template`), each the most
symmetric member of a one-parameter family — the parameter is a row offset
or the ratio between two tile sizes, and it is the factory's default
argument, so a second member is a one-line call.

They use the same `_ArchTemplate`, window and preset machinery. Three things
differ, all handled for you:

- **`_insert_t_vertices`** (in `_template`) records each T-vertex as a vertex
  of the tile whose edge it splits. The point is collinear, so the drawn
  polygon is unchanged, but the two tiles now share a vertex id — which is
  what `_shared_vertex_adjacency` runs on — and the tiling becomes an
  edge-to-edge *mesh*, keeping `euler_characteristic` and
  `boundary_components` meaningful. It is a no-op for every edge-to-edge
  template (a test pins that).
- **Shape measurement drops the T-vertices.** `shapeMetrics` in
  `web/src/render/shapePalette.ts` measures a tile's real corners, so a
  square with a split edge is a square and not an irregular hexagon. The
  test helper `_corners` in `tests/test_boards.py` does the same.
- **Size is a colour axis.** Two of these tilings use one regular polygon at
  two or three sizes, which hue (side count) and chroma (regularity) cannot
  tell apart; `classifyShapes` clusters tile spans and lightness carries the
  result. See "Shape colour coding" in `web/README.md`.

Steps, for a new isogonal tiling `foo`:

1. **Template** — `_foo_template()` in `tilings.py`, returning `_template(...)`
   over one rectangular domain, as for an Archimedean tiling. `_periodic_domain`
   fills a domain from a translation lattice, and `_triangular_domain` wraps it
   for the p3/p6 tilings (the |c1| x |c1|·√3 orthogonal superlattice rectangle).
   Only build a `mirror` if the tiling really has one (of the six, only the
   offset square and the staggered triangular do).
2. **Registry** — one `ArchTiling("foo", "Foo label", config, edge_directions,
   _foo_template, family="isogonal")` row. `config` is the tiles meeting at a
   vertex, *counting* the one whose edge runs straight through. Set
   `half_turn=False` if the tiling has no 180-degree rotation (p3), which
   exempts it from `test_flat_board_is_symmetric`.
3. **Presets** — a `"foo"` block in `ARCH_PRESETS` with `flat`, `torus` and
   `cylinder` columns (the same `arch_torus_board`/`arch_cylinder_board`
   machinery every Archimedean/Laves tiling wraps with — nothing isogonal-
   specific is needed there), plus `mobius`/`klein` columns if the template
   built a `mirror` (only offset square and staggered triangular do; a
   chiral one stays off those two, exactly like snub hexagonal). Re-run
   `scripts/export_data.py` and `export_conformance.py`.
4. **Port it to `web/src/boards/tilings.ts`** — the same template, verbatim.
   The conformance oracle compares the two boards cell for cell, so a
   divergence fails `tests/unit/conformance.test.ts` immediately.

`TestIsogonal` in `tests/test_boards.py` then covers the new tiling
automatically: regular tiles, one vertex species, and a domain whose tiles'
areas sum to its own (no gaps, no overlaps). `TestWrappedArchimedean` covers
the wrapped surfaces the same way it does for the uniform/dual families.

A brand new *family* with no wrap builders yet can still stay flat-only by
adding its name to `catalog._FLAT_ONLY_FAMILIES` (empty today, since isogonal
and rectangle both wrap); that flag is per family, not per tiling.

## Recipe: add a congruent-rectangle bond

The fourth family in `ARCH_TILINGS` (`family="rectangle"`): the brick bonds,
tiled by one congruent **rectangle** rather than by regular polygons. Five
ship — stacked bond, running bond, basket weave, its three-brick version and
the herringbone — and what tells them apart is only the stagger of their rows.
So, unlike the other three families, they are **face-transitive** (every tile
congruent, several vertex kinds) and, bar the stacked bond, **not edge to
edge**; `_FAMILY_TRAITS` in `tilings.py` declares both, and the derived test
lists follow. `ArchTiling.config` is not a vertex or tile symbol here (the
three-brick weave has two tile orbits, so neither is even well defined across
the family) but just the tile's side count, `(4,)`.

They need no new machinery: `_brick(x, y, length, height)` builds a tile, and
one rectangular domain describes each bond (one brick for the stacked bond, two
for the running bond, a 2 x 2 block for the weaves and the herringbone), so
`_template` and `_insert_t_vertices` do the rest. Steps, for a new bond `foo`:

1. **Template** — `_foo_template()` in `tilings.py`, bricks of length 1 and
   height `r` so the preset `scale` stays px per brick length. Build the domain
   directly when it is a small block (`_basketweave_template`) or from the
   pattern's translation lattice via `_periodic_domain` when it is diagonal
   (`_herringbone_template`). Only claim a `mirror` the bond really has — pass
   `mirrored=False` for the pgg/p4-style ones, `glide=True` where the mirror
   needs the half-period shift.
2. **Window centre** — a bond's tiles are all congruent, so the default
   biggest-tile rule picks an arbitrary brick; check that a brick centre really
   is a half-turn centre (it is for the herringbone) and otherwise pin `centre`
   to one that is: the weaves use a block corner, their quarter-turn centre.
   `test_flat_board_is_symmetric` is the oracle — a window centred off a
   rotation centre scores below its 0.85 bar.
3. **Registry** — one `ArchTiling("foo", "Foo label", (4,), 2, _foo_template,
   family="rectangle")` row.
4. **Presets** — a `"foo"` block in `ARCH_PRESETS` with `flat`, `torus` and
   `cylinder` columns, plus `mobius`/`klein` if the template built a `mirror`
   (of the five, stacked bond, running bond and both basket weaves do;
   herringbone is glide-only and stays off them), then re-run
   `scripts/export_data.py` and `export_conformance.py`.
5. **Port it to `web/src/boards/tilings.ts`** — the same template verbatim, one
   more `ARCH_TILINGS` row. Its menu icon is generated: the `"domain"` patch
   style in `web/src/ui/icons.ts` draws whole periods of the bond, which is the
   only figure that shows a stagger (a vertex rosette is two or three bricks).

`TestRectangles` in `tests/test_boards.py` then covers the new bond: a domain
covered exactly, T-vertices wherever the bond is staggered, and tiles that are
rectangles of its aspect ratio — add that ratio to the class's `RATIOS` table,
the one line the suite cannot derive.

## Recipe: add a fractal (rep-tile) board

The **Fractals** family (`fractal.py`, `web/src/boards/fractal.ts`) holds the
rep-tile boards: a polygon that tiles a scaled copy of itself, inflated
``levels`` times into a patch of 4**levels tiles whose outline is the tile
again. Two ship, both rep-4 — the sphinx (pentagonal hexiamond, triangular
lattice) and the chair (L-tromino, square lattice). Adding a third is one
``_RepTile`` record plus its wiring:

1. **The tile** — a `_RepTile(mode, outline, children, order, rotate, mirror,
   to_xy)` in `fractal.py`. `outline` walks the unit tile counterclockwise with
   a vertex at **every lattice step**, not just at its corners: these tilings
   are not edge to edge, and the collinear ids are what let shared-vertex
   adjacency see a neighbour that plants a corner mid-edge (`corners()` drops
   them again, as `shapeMetrics` does for the isogonal tilings). `children` is
   the dissection of the *size-2* tile into unit tiles, as `(rotation, mirror,
   translation)` placements; derive it with the exact-cover search
   `TestRepTiles.test_the_dissection_is_the_one_the_table_holds` runs rather
   than by hand, and keep the reflection-free solution where the tile's own
   symmetry offers one. Then a `*_board(levels, mine_count, scale)` one-liner
   through `_rep_board`.
2. **Menu + presets** — add the mode to `menu.fractal` and `soloLabels` in
   `data/catalog.json`, the builder to `_JSON_BUILDERS` in `presets.py`, and a
   `{mode: {builder, args}}` row to `data/presets.json` (difficulty is a level of inflation --
   3/4/5 for the chair, 64/256/1024 cells; one step lower for the sphinx,
   whose tile is a long sliver that needs more room per cell. Check the top
   difficulty really reads: past ~500 cells the glyphs stop being legible). Re-run
   `scripts/export_data.py` and `export_conformance.py`.
3. **Port it to `web/src/boards/fractal.ts`** — the same record, verbatim, plus
   one `BUILDERS` row in `presets.ts`. The conformance oracle compares the two
   boards immediately. Its menu icon is generated: `REP_TILES` in
   `web/src/ui/icons.ts` (and `gui.py`'s `_render_icon`) draws the level-1
   supertile — the substitution itself — from the board's own geometry.

`TestRepTiles` then covers the new tile automatically: the dissection is exact
and unique-up-to-symmetry, inflation tiles the supertile with no gap or overlap,
every cell is congruent to the prototile, the patch is simply connected, and the
step vertices are what keep it a mesh.

The family is flat only — a rep-tile patch is a shape, not a periodic window, so
there is nothing to glue a seam with. That is one line: it is in
`catalog.FLAT_ONLY_FAMILIES` (with `aperiodic`), which `family_rows`,
`picker_families` and the TypeScript mirror all read.

## Recipe: add an aperiodic / shaped / solid board

These are one-offs, not tiling×surface products.

1. Write a `*_board(...)` builder returning a `Board` (2D) or `Board3D`
   (3D). Flat float-coordinate builders should finish through
   `core._finalize_flat`; lattice builders through `core._build`; 3D
   builders assemble `cells` + `positions` and pick an orientation
   helper (`solids._convex_board3d` for convex solids, the polycube
   assemblers, or `surfaces._assemble`).
2. Add the mode to the right menu table in `data/catalog.json` —
   `menu.sphereModes`, `menu.polyhedraModes`, `menu.aperiodic`, or
   `menu.shapedModes` (keyed by the regular tiling the shaped board is cut
   from) — and its label to `soloLabels`. `catalog.py` loads them; the
   exporter round-trip test keeps the two sides honest.
3. Add the builder to `_JSON_BUILDERS` in `presets.py`, add a
   `{mode: {builder, args: {difficulty: [...]}}}` row to
   `data/presets.json` (positional args), and re-run
   `scripts/export_data.py` + `export_conformance.py`. This is what both
   front-ends read, so the mode is shared and the conformance oracle
   covers it. (A Python-only one-off can still go in `_PRESETS` as an
   explicit lambda, but the JSON path is preferred.)

## Recipe: add a surface (worked example — the Klein bottle)

A surface is a new column in the uniform/dual tiling×surface grid. The
catalog derives everything from one `SurfaceSpec`, so the work is: an
immersion, a wrap builder, one spec row, and preset tuning.

The Klein bottle is implemented **for every non-chiral tiling** — the
square (`klein_board`), the regular triangle/hexagon
(`klein_triangle_board`/`klein_hex_board`) and all 14 non-chiral template
tilings (`arch_klein_board`), plus the `"klein"` `SurfaceSpec`. The notes
below are its as-built documentation and the pattern for adding a fresh
surface.

1. **Immersion** in `surfaces.py`. A Klein bottle is a torus whose tube
   seam is glued with a flip. `_klein_point` uses the classic
   self-intersecting *bottle* immersion (`u` runs the profile round the
   ring — up the body, over the top, down and through the neck; `v` runs
   the circular cross-section, seam-reflected `v -> π - v`). It reads as
   the familiar bottle rather than a donut. It is piecewise (a `u < π`
   body branch, a `u ≥ π` neck branch) and its natural coordinates are
   large and off-origin, so every wrap builder **recentres** the sampled
   points (shared helper `_klein_recentre`) before `_assemble`
   (`GameScreen3D` measures `radius` from, and pivots rotation about, the
   origin, so off-origin geometry renders shrunk and off-centre). The
   neck-through-body self-intersection is unavoidable (no immersion of the
   Klein bottle embeds in 3-space) and lives on the `v ∈ {0, π}` circle;
   the builders offset `v` so no *vertex* lands there and all vertices
   stay distinct (`euler_characteristic`/`boundary_components` key on
   rounded coordinates — a merge silently drops χ below 0). A stray merge
   is a measure-zero coincidence that a small `tube`/`tube_scale` change
   clears, so presets are verified for χ = 0. An earlier figure-8
   (lemniscate) immersion is in the git history for the donut-shaped
   variant.

2. **Wrap builders** in `surfaces.py`. All are modelled on the torus
   builders: the cross-section (the tube) wraps straight, but the ring
   seam glues *flipped* — the tube re-enters reflected, so the surface is
   closed (0 boundary circles) yet non-orientable, hence drawn two-sided,
   not back-face culled. `_klein_recentre` + `radius=_max_radius` frame
   it. The flip needs an orientation-reversing tube mirror, so **chiral
   tilings are refused** (snub hexagonal, floret pentagonal), exactly as
   on the Möbius strip.

   - `klein_board` (square): vertex flip `j -> tube/2 - j - 1` (matching
     the immersion's `v -> π - v`, `tube` **even**); the *cell* flip is
     one lower because a cell is indexed by its low-`j` corner.
   - `klein_triangle_board`: the regular triangular lattice (the same
     `_triangle_vertices` rows the flat and cylinder boards use), vertex
     flip `ky -> tube/2 - 1 - ky`. Consecutive rows are offset by half a
     step, so that mirror lands on the lattice only when `ring` matches
     the flip's parity, and the ring translation that scrolls the board
     is **two** lattice columns (one column swaps the row offsets).
   - `klein_hex_board`: offset hex lattice, tube reflected `ky -> 4 - ky`
     across the ring seam (`rows` **even**).
   - `arch_klein_board`: the template version, next to `arch_torus_board`
     but gluing the seam flipped through `template.mirror` exactly as
     `arch_mobius_board` does. p4g (snub square, Cairo) has only a glide,
     so `nx` counts half-domains and must be **odd** there. The `+π/2`
     `v`-phase aligns the immersion's seam reflection with the tiling's
     tube mirror.

   `cell_cycle` is the one-step **ring translation** — a graph
   automorphism carried on `Board3D`. `GameScreen3D` reads it to let the
   player **scroll** the cell contents along the ring (mouse wheel /
   two-finger scroll), so cells hidden behind the self-intersection rotate
   into view without the geometry moving. The template/hex/triangle
   builders build it by matching each cell's shifted vertex set back to a
   generated cell (keeping it only when it is a bijection). Any board that
   exposes a `cell_cycle` gets the scrolling for free; everything else
   leaves it `None`.

3. **SurfaceSpec** in `catalog.py`:

   ```python
   SurfaceSpec("klein", "Klein bottle", "klein", is_3d=True,
               needs_mirror=True, boundary_components=0, tilt=-0.4),
   ```

   `needs_mirror=True` makes the derivation drop the chiral tilings
   automatically, exactly like the Möbius strip (`TilingSpec.allows`
   gates on it). A `SurfaceSpec` may also carry an optional
   `tilings=frozenset({...})` allow-list to restrict a *new* surface to
   specific tiling keys while its other wrap builders are still missing;
   the Klein bottle no longer needs one. The square tiling maps `(square,
   klein)` to the bare mode `"klein"` via its `mode_overrides`, like its
   other legacy surface names. Every klein mode also takes the `klein`
   3/4-view branch in `GameScreen3D._initial_rotation` (keyed on
   `surface_of(mode).key`), showing the self-intersection; `tilt` alone is
   only an x-rotation.

4. **Presets** in `presets.py`: explicit `"klein"`/`"kleintri"`/
   `"kleinhex"` blocks in `_PRESETS` for the regular tilings, `"klein":
   arch_klein_board` in `_ARCH_BUILDERS`, and a `"klein"` column in each
   non-chiral tiling's `ARCH_PRESETS` block (the non-glide ones reuse
   their `torus` `nx`/`ny`/mines; snub square and Cairo need odd `nx`).

One menu edit is needed: add the surface key to `MANIFOLD_ORDER` and a
label to `MANIFOLD_LABELS` in `catalog.py` so it appears (in your chosen
position) on the Flat manifolds page — that page lists its surfaces
explicitly. Everything else is still derived: `MODE_LABELS`, `TILINGS`,
`MODES_3D`, `mode_for`, `surface_of`, `view_hint`, the picker's per-surface
gating and the random pool all follow from the `SurfaceSpec`. The `klein`
modes join the wrapped-surface
invariant suite (`TestWrappedArchimedean` / `TestKleinTilings`) so
χ = 0 / 0 boundary circles are checked automatically; if you add the spec
but forget a preset, `TestPresets.test_all_presets_build` fails loudly.

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
- Screenshot check for anything visual — see the headless recipe in
  `CLAUDE.md`.
