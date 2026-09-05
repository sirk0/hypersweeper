# Recipes: adding a board

Step-by-step recipes for extending the board zoo. Each extension point is a
single, named place, and the test suite tells you the moment something is
inconsistent.

Read [`geometry.md`](geometry.md) first for the model these recipes work in —
the shared-vertex adjacency rule, the `minesweeper/boards/` package layout and
what already ships. Sizes and mine counts are **measured, never invented**: see
[`difficulty.md`](difficulty.md). The `data/*.json` contract both front-ends
read is in [`shared-data.md`](shared-data.md).

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
   Pick the tiling's `cut` here too — the height within the domain at which
   the cylinder's strip and the Möbius band both start. It must not have a
   tile *centre* on it (a row centred on the cut is kept at one rim and
   missing at the other, which leaves a Möbius band lopsided and a
   cylinder's two rims different curves), and it should run along a
   horizontal edge-line of the tiling if there is one, so the rims come out
   straight rather than zigzag. What a `cut` does *not* have to state is
   where the tiling reverses y: `_flip_levels` measures that into
   `_ArchTemplate.flips` (horizontal mirrors and glides, and half turns,
   which is why a chiral tiling still wraps a cylinder). See the AGENT NOTE
   on the cut above `_template`;
   `TestWrappedArchimedean.test_mobius_band_is_symmetric`,
   `test_cylinder_rims_are_the_same_curve`, the two
   `..._rim_is_straight_where_the_tiling_allows` tests and
   `test_no_tile_centre_sits_on_the_cut` measure every rule.
2. **Registry** — add one `ArchTiling("foo", "Foo label", config,
   edge_directions, _foo_template)` row to `ARCH_TILINGS`, in
   vertex-configuration order (the registry order is the menu order; the
   `family` field, defaulting to `"uniform"`, picks the menu page). This alone
   feeds `_ARCH_CONFIGS`, `_ARCH_TEMPLATES`, and — via `catalog` — the
   menu, mode strings, `MODES_3D`, and the symmetry gating (a tiling whose
   template has no mirror is automatically denied the Möbius strip and the
   Klein bottle, and one whose template never reverses y at all — p3 — the
   cylinder).
3. **Presets** — add a `"foo": {...}` block to `ARCH_PRESETS` in
   `presets.py` with `flat` / `torus` / `cylinder` / `mobius` / `klein`
   args per difficulty. Omit `mobius` / `klein` if the tiling is chiral, and
   `cylinder` if it never reverses y. Both open surfaces constrain the row
   count, and neither is left to the preset: a Möbius band needs
   `rows + 2*cut/height` to be a whole number, and a cylinder needs
   `cut + rows*height/2` to land on one of `template.flips` (which is what
   `resize._cylinder_rows` enumerates), or the builders refuse the board.
   Seed the windows by hand if you like, but the sizes and mine counts that
   ship come from `scripts/difficulty/` — see "Choosing a size and a mine
   count" in `difficulty.md`; do not pick a density by eye.
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
   `tilings.py`. The dual's `cut` is a second argument to
   `_dual_template` rather than inherited: its tiles sit where the primal's
   *vertices* are, so its courses are not the primal's (Cairo pentagonal and
   rhombille both need one where their primals do not, and the floret
   pentagonal needs one for its cylinder although it has no Möbius wrap).
2. Add an `ArchTiling("bar", "Bar label", config, edge_directions,
   _bar_template, family="dual")` row to `ARCH_TILINGS` (`config`
   is the Laves symbol, i.e. the primal's vertex configuration).
3. Add a `"bar"` block to `ARCH_PRESETS` (skip `mobius`/`klein` if chiral).
   The windows can copy the primal's — the dual shares its fundamental
   domain — but the mine counts must be re-measured, not scaled: a dual has
   a different tile count *and* a different degree, and both move the win
   rate. See [`difficulty.md`](difficulty.md).
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
  template (a test pins that). Miss one and the split tile keeps a single
  long edge where its two neighbours have two short ones: the adjacency
  loses a pair, and on a curved surface that long edge is a chord where the
  short ones bend with the tile beside them, so the board draws a
  lens-shaped crack. `TestInvariants.test_every_edge_belongs_to_two_tiles_or
  _a_boundary` catches exactly that, on every board in the catalogue, by
  counting how many tiles each edge belongs to — two inside, one on a rim,
  and none unshared on a closed surface.
- **…and on a curved surface the T-vertices are put back on their chord**
  (`_straight_vertices` in `tilings.py`, `_wrapped_positions` in
  `surfaces.py`; the TypeScript port is `straightVertices` /
  `straightenPositions`). A T-vertex is collinear in the plane, so nothing
  distinguishes placing it on the line from computing it from its own
  coordinates — until the line becomes a chord, at which point a point placed
  on the *surface* stands off it. The tile whose edge it splits kinks
  outward, and where a **run** of them crosses one tile the tile breaks into
  strips each cutting its own chord. The three-brick basket weave is that
  case: three bricks across one square block, so a block that should read as
  one flat patch read as three, and `kleinbasketweave3` easy drew as gaps and
  slivers. Straightened, the rule is the flat one continued — a point
  collinear in the plane stays collinear on the surface — and a block is one
  flat patch. The board is a slightly coarser model of the surface for it and
  a much truer picture of the tiling, which is the trade to keep making.
  Two limits, both deliberate: a **run with no end** has no chord to lie on
  (a running bond's mortar line is unbroken, so every vertex along it is a
  through vertex and the walk never reaches a corner) and is left alone — the
  walk gives up rather than guessing, so only the two basket weaves carry a
  rule today; and a vertex on a **rim** is left alone too, because a
  cylinder's rims and a Möbius band's edge are drawn as clean circles and
  pulling their vertices in scallops them. The conformance oracle is
  combinatorial and cannot see any of this, so
  `scripts/export_straighten_fixture.py` dumps the rules and the geometry
  and `web/tests/unit/straighten.test.ts` pins the port against them.
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
   chiral one stays off those two, exactly like snub hexagonal). Drop the
   `cylinder` column too if `template.flips` came out empty — three-scale
   triangular, p3, is the one tiling here that reverses y at no height, so
   no strip of it ends in two rims that are the same curve. Re-run
   `scripts/export_data.py` and `export_conformance.py`.
4. **Port it to `web/src/boards/tilings.ts`** — the same template, verbatim.
   The conformance oracle compares the two boards cell for cell, so a
   divergence fails `tests/unit/conformance.test.ts` immediately.

`TestIsogonal` in `tests/test_boards.py` then covers the new tiling
automatically: regular tiles, one vertex species, and a domain whose tiles'
areas sum to its own (no gaps, no overlaps). `TestWrappedArchimedean` covers
the wrapped surfaces the same way it does for the uniform/dual families.

A brand new *family* with no wrap builders yet can stay flat-only two ways,
and which one it takes depends on what its members are. A family of **one-off
boards** — the aperiodic and fractal ones, which have no periodic domain to
glue a seam with — goes in `catalog.FLAT_ONLY_FAMILIES`, whose members are
modes rather than tiling keys and which is only offered on the plane. A family
of **tilings** that has not been wrapped yet goes in `_FLAT_ONLY_FAMILIES`
instead: that sets `TilingSpec.flat_only` on every member, so `allows()`
refuses every surface but the plane and `picker_families` drops the family from
the manifold pickers because it has no enabled row left. See "Recipe: add a
flat-only tiling family" below. Both flags are per family, not per tiling.

## Recipe: add a flat-only tiling family

The last two families in `ARCH_TILINGS` are the fractal boards' own tiles laid
down **periodically** instead of inflated, and they ship on the plane alone:
`family="reptile"` (the sphinx as `sphinxpairs`, the chair as `tromino`) and
`family="durer"` (Dürer's pentagon tiling). Everything about them is an
ordinary `_ArchTemplate` — they simply have no wrap builder or preset window
yet, and the flat-only flag is what says so rather than a missing row somewhere.
The mode strings are `sphinxpairs`, `tromino`, `durer`; the fractal boards keep
`sphinx`, `chair` and `pentaflake`, which is why the tilings could not reuse
those keys.

Adding one, or adding a tiling to one:

1. **Template** — as for any periodic tiling, but say what the pattern really
   is. Both rep-tiles are **p2**: no mirror at all (`mirrored=False`), and a
   tile centroid is not a symmetry centre, so `centre` is pinned to a corner
   where the tiles meet — `(0, 0)` for both. Dürer's tiling is **pm**: a
   horizontal mirror (`mirrored=True`, which is why the template turns the
   pattern 54° — the mirror a template records is the one reversing y) and no
   half turn anywhere, hence `half_turn=False` on its registry row.
   `_periodic_domain` builds the domain from the pattern's own lattice where it
   is not rectangular (the sphinx's parallelogram, Dürer's ζ10 lattice).
   Declare a **`grain`** if the tiling has one — the spacing of straight lines
   no tile crosses, along x and y, measured from the window centre and dividing
   the domain. `archimedean_board` ends its window on them, which is the
   difference between a straight board edge and a row of tiles kept by half:
   the sphinx has one horizontally (√3, one course per tile) and none
   vertically, the L-tromino has both (3 and 2, its own domain). Most tilings
   have none — a hexagon straddles every horizontal line there is — and leaving
   it at `(0, 0)` keeps the old behaviour exactly. `TestFlatGrain` checks the
   claim against the domain and the shipped boards.
2. **Traits** — one `_FAMILY_TRAITS` row: `(vertex-transitive, edge to edge,
   monohedral)`. The rep-tiles are `(False, False, True)`, like the bonds.
   Dürer's is `(False, True, False)`: two tile shapes, so it is the one family
   the congruence invariant does not apply to, and `monohedral` is what keeps
   `test_tiles_are_congruent` off it.
3. **Flat-only** — add the family key to `_FLAT_ONLY_FAMILIES` in `catalog.py`
   and to `FLAT_ONLY_ARCH_FAMILIES` in `web/src/boards/catalog.ts`, and put it
   in `PICKER_FAMILIES` (both sides) where it should sit in the menu. Nothing
   else gates it: `picker_families` drops a family with no enabled row.
4. **Labels and hints** — `menu.familyLabels` in `data/catalog.json` (the
   authored leaf; re-run `scripts/export_data.py`) and `MENU_FAMILY_HINTS` in
   `web/src/boards/catalog.ts`. A family whose key is also a tiling key (as
   `durer` is) already has an icon; otherwise add a case to `menuIcon` in
   `web/src/ui/icons.ts` picking the member that reads at icon size.
5. **Presets** — a `"foo"` block in `ARCH_PRESETS` with a `flat` row only, then
   the measured pipeline: `resize.py --only`, `calibrate.py --only`, `apply.py`
   ([`difficulty.md`](difficulty.md)), then `scripts/export_data.py` and
   `export_conformance.py`.
6. **Port it to `web/src/boards/tilings.ts`** — the same template verbatim; the
   conformance oracle compares the two boards cell for cell.

`TestRepTilePatterns` and `TestDurer` in `tests/test_boards.py` cover the two
families (the tile's own shape, a domain covered exactly, edge-to-edge or not),
and `TestArchimedean.test_flat_board_is_symmetric` covers the window — except
for a `half_turn=False` tiling, which it returns early on, so Dürer's board
symmetry is asserted in `TestDurer` instead.

**Wrapping one later** is the rest of the Archimedean recipe and nothing new:
choose the `cut` (neither family has one yet — Dürer's pentagon rows sit at
y = 0 and y = height/2, so its cut cannot be either), drop the family from the
two flat-only lists, and add the `torus`/`cylinder`/`mobius`/`klein` preset
rows the surfaces its mirror and `flips` allow. The tests that only ask
questions of the tilings that wrap — `test_no_tile_centre_sits_on_the_cut` and
the rest of `TestWrappedArchimedean` — pick it up the moment it has a torus
preset.

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

Three of the five also leave the flat surfaces entirely and land on a **cube**
(`solids.brick_cube_board`, the `cubestackedbond` / `cubebasketweave` /
`cubebasketweave3` boards in the Polyhedra group). What decides whether a bond
can is whether its fundamental block is a *square*: the stacked bond is two
bricks stacked, the two weaves two or three laid one way or the other, so a
square face fills with whole blocks — while the running bond's block is offset
half a brick and the herringbone's is diagonal, and neither fills a square. For
a new bond with a square block, one `BRICK_BONDS` row (bricks per block,
whether the block turns on a checkerboard) is the whole builder change. Two
things there are worth knowing before touching it:

* **The bond breaks at the cube's edges, and that is not a bug to fix.** A
  face's bricks run along one of its two directions, and at a corner the three
  faces cannot all agree, so some of the twelve edges are cut differently on
  their two sides. `_split_at_lattice_points` — the 3D twin of
  `_insert_t_vertices`, in exact integer arithmetic since the lattice is
  `[-3n, 3n]**3` — splices each face's cuts into the other's boundary bricks so
  the two still share a vertex id. It is load-bearing: without it a cube edge
  belongs to one cell on one side and two on the other, which reads as a
  boundary and puts the Euler characteristic below 2.
* **A weave's phase depends on the parity of `n`.** Its quarter-turn centres
  are block *corners*, so a face centre is one only when `n` is even; at even
  `n` the checkerboard is flipped on the three negative faces, or the two
  halves of the cube meet out of phase and the board keeps 6 of the cube's 48
  symmetries instead of 24. `TestBrickCubes` measures that directly.

`resize.SPEC` wants `rigid=True` there and, deliberately, **no `lead`**, though
the first argument is a bond key like the Archimedean rows'. `lead` does not
mean "arg 0 is a string": it means the knobs count copies of that tiling's
periodic domain around a seam, and every wrap bar downstream reads it that way.
A cube has no seam, and read as if it had, the bars threw out the 108-cell
stacked-bond cube and left 192 against a target of 81.

## Recipe: add a fractal (self-similar) board

The **Fractals** family (`fractal.py`, `web/src/boards/fractal.ts`) holds the
boards built by inflating one tile: the tile is scaled up by the substitution's
`factor` and refilled with copies of itself, `levels` times, so the patch is
`len(children)**levels` tiles and its outline converges on a self-similar shape.
Five ship — the sphinx (pentagonal hexiamond, triangular lattice) and the chair
(L-tromino, square lattice), both rep-4 *rep-tiles* whose children fill the tile
exactly, the Sierpinski carpet, whose eight children leave the middle ninth of
the tripled square empty, the pentaflake, whose six leave a golden gnomon over
per side, and the Gosper island, whose seven hexagons fill their flower with no
gap but do not make a hexagon — so its patch outline is the Gosper island rather
than the tile, and its inflation turns (√7 at 19.106°, multiplication by the
Eisenstein integer 2 + ζ) because no pure scaling by √7 stays on the lattice.
Adding a sixth is one ``_Substitution`` record plus its wiring:

1. **The tile** — a `_Substitution(mode, outline, children, factor, order,
   rotate, mirror, scale, to_xy)` in `fractal.py`. `outline` walks the unit tile
   counterclockwise with a vertex at **every lattice step**, not just at its
   corners, whenever the tiling is not edge to edge: the collinear ids are what
   let shared-vertex adjacency see a neighbour that plants a corner mid-edge
   (`corners()` drops them again, as `shapeMetrics` does for the isogonal
   tilings). `children` places the unit tiles inside the tile scaled by
   `factor`, as `(rotation, mirror, translation)` placements with the
   translation in units of the *child*. For a rep-tile that is a dissection:
   derive it with the exact-cover search
   `TestRepTiles.test_the_dissection_is_the_one_the_table_holds` runs rather
   than by hand, and keep the reflection-free solution where the tile's own
   symmetry offers one. Then a `*_board(levels, mine_count, scale)` one-liner
   through `_substitution_board`.

   `rotate`/`mirror`/`scale` are the lattice's own exact maps and `factor` is
   just the linear scale as a number (`test_a_substitutions_scale_is_its_factor`
   pins the two together: `scale` must be a similarity of exactly `factor`,
   turned or not — the Gosper island's turns, the other four do not).
   A lattice point is a tuple of **however many**
   integers the lattice needs — two for the three integer ones, four for the
   pentaflake's ℤ[ζ10] — so nothing in the machinery may index a coordinate by
   name. And the inflation only ever *multiplies* by the factor: an irrational
   one (φ², here) cannot be divided back out of a lattice point.
2. **Menu + presets** — add the mode to `menu.fractal` and `soloLabels` in
   `data/catalog.json`, the builder to `_JSON_BUILDERS` in `presets.py`, and a
   `{mode: {builder, args}}` row to `data/presets.json` (difficulty is a level of inflation --
   3/4/5 for the chair, 64/256/1024 cells; one step lower for the sphinx,
   whose tile is a long sliver that needs more room per cell. Check the top
   difficulty really reads: past ~500 cells the glyphs stop being legible —
   which is why the carpet, growing ×8 a level, the pentaflake, growing ×6, and
   the Gosper island, growing ×7,
   each spend two of their three difficulties on the level-3 patch and separate
   them by mine density instead). Re-run `scripts/export_data.py` and
   `export_conformance.py`.
3. **Port it to `web/src/boards/fractal.ts`** — the same record, verbatim, plus
   one `BUILDERS` row in `presets.ts`. The conformance oracle compares the two
   boards immediately. Its menu icon is generated: `SUBSTITUTIONS` in
   `web/src/ui/icons.ts` (and `gui.py`'s `_render_icon`) draws the level-1
   supertile — the substitution itself — from the board's own geometry.

`TestRepTiles` then covers a new rep-tile automatically: the dissection is exact
and unique-up-to-symmetry, inflation tiles the supertile with no gap or overlap,
every cell is congruent to the prototile, the patch is simply connected, and the
step vertices are what keep it a mesh. A substitution with holes is not simply
connected and gets its own class instead, each checking the inflation against an
independent derivation and pinning what the holes cost (Euler characteristic
1 - holes, holes + 1 boundary circles, and a neighbour count the parent grid
would not have): `TestSierpinskiCarpet` against the carpet's arithmetic
definition, `TestPentaflake` against plain `cmath` — every claim about ℤ[ζ10] is
re-checked in floats, and the inflation against a naive complex recursion that
knows nothing about lattices. A substitution that is neither — the Gosper
island fills its supertile exactly but the supertile is not the tile — gets one
too: `TestGosperIsland` pins the arithmetic that makes the flower inflate (the
seven children are a complete residue system mod 2 + ζ, which is what makes the
7**n digit strings distinct) and then the shape of the result — a disc with
6·3**n boundary edges to 7**n cells, six-fold symmetric and, past level 1,
chiral.

The family is flat only — an inflated patch is a shape, not a periodic window,
so there is nothing to glue a seam with. That is one line: it is in
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
2. Add the mode to the right menu table in `data/catalog.json` — one
   `menu.solidGroups[*].modes` (Sphere, Platonic solids, Catalan solids or
   Polyhedra), `menu.aperiodic`, or `menu.shapedModes` (keyed by the regular
   tiling the shaped board is cut from) — and its label to `soloLabels`.
   `catalog.py` loads them (`SOLID_MODES` is derived by flattening
   `solidGroups`, so nothing else needs to know how many solid pages there
   are); the exporter round-trip test keeps the two sides honest. Both menus
   follow from that table: on the web a `shapedModes` entry lands under
   **Custom › Flat › Shaped boards** (the regular tilings themselves are
   rows of the picker there), each solid group is a home-page row leading
   straight to a flat list of its boards, and everything else joins the home
   page's Flat or 3D random pool along with its group.

   A **new solid group** is one more `menu.solidGroups` row: its key joins
   `menu.root`, both menus grow a page, and the only code either side needs is
   an icon for the row (`_ICON_ALIASES` in `gui.py`, `ALIASES` in
   `web/src/ui/icons.ts` — there is no board named "catalan" to draw) and a
   one-line hint (`SOLID_GROUP_HINTS` in `web/src/ui/menu.ts`).
3. Add the builder to `_JSON_BUILDERS` in `presets.py`, add a
   `{mode: {builder, args: {difficulty: [...]}}}` row to
   `data/presets.json` (positional args), and re-run
   `scripts/export_data.py` + `export_conformance.py`. This is what both
   front-ends read, so the mode is shared and the conformance oracle
   covers it. (A Python-only one-off can still go in `_PRESETS` as an
   explicit lambda, but the JSON path is preferred.)

## Recipe: add a volume board

A **volume** is a solid block of cells rather than a surface of them, and it
lives in `volume.py` / `web/src/boards/volume.ts`. One ships — `cube3d`, the
`n**3` cube of cubes — and the three things that make it different from a solid
are all forced by the same fact: **you cannot see inside a solid.**

1. **Adjacency comes off the lattice, not off the polygons.** Two cells are
   neighbours when their unit *cubes* share a corner, which is the shared-vertex
   rule one dimension up and is exact integer arithmetic — but the drawn
   polygons are not the cubes, so `_shared_vertex_adjacency` cannot find it.
   Build it directly. This is the one exemption in the zoo, and it should stay
   that way: on a surface, "share a vertex" is what makes the numbers mean what
   the player sees.
2. **The board is drawn taken apart.** Each slice is its own sheet of squares,
   laid out on a `ceil(sqrt(n))`-column grid and stepped back in depth by slice
   index. Every cell is visible at once, which is what a 26-cell neighbourhood
   needs — a number spans three slices, so all three have to be readable
   together — and the depth ramp is what says which sheet is which. A row of
   sheets rather than a grid is a 9-to-1 board that `frameSolid` fits into a
   sliver of a phone; the layout constants live in both ports and the
   conformance oracle counts vertices off them, so change one and change both.
3. **It is `two_sided`.** Open sheets have rims, so front-face culling would
   make the board vanish as soon as it was turned past ninety degrees.
   `two_sided` also tells `TestInvariants` not to demand a closed surface: `n`
   sheets is `n` boundary circles and an Euler characteristic of `n`. The cost
   is the cell style — a two-sided board draws flat tiles rather than the
   raised button (see "Cell styles" in `web/docs/render.md`) — which the
   closed/opened palette step carries on its own.

Two more things a volume needs that a solid does not:

* **Symmetry controls from the lattice.** `core.solidBoard` measures a solid's
  point group off its polygons, and pulling the slices apart leaves none of the
  cube's 48 motions in the drawing. So `volume.ts` offers signed coordinate
  permutations as `SymmetryCandidate`s and lets `keepSymmetries` check them
  against the adjacency, exactly as `surfaces.ts` offers lattice motions —
  which leaves `ring`, `tube` and `mirror-ring` standing. That is the one move
  dragging cannot give: dragging turns the drawing, and the drawing is the cube
  taken apart rather than the cube.
* **Digits past 12.** A cell can be asked to draw its whole neighbourhood, so
  `render/glyphAtlas.ts` bakes 1..`MAX_DIGIT_GLYPH` and
  `tests/unit/conformance.test.ts` measures the catalogue against it. A board
  that out-counted the atlas would draw the *wrong* number, not none.

Sizes and mine counts are measured as everywhere else, with one wrinkle worth
knowing before believing a number: the reference solver **abandons** games
whose frontier DP exceeds its node budget, and a 26-neighbour board abandons
nearly all of them at the default. The surviving sample is then biased toward
the untangled layouts and the search settles on too few mines. `calibrate.py
--budget` is the knob (see "Measuring the size and the mine count" in
[`difficulty.md`](difficulty.md)); a default-budget run on `cube3d` medium
reported 0.875 over two finished games where a big-budget one measures 0.76.

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
explicitly (on the web that page is under **Custom**, and the new surface
also joins the home page's 3D random pool, both derived). Everything else is
still derived: `MODE_LABELS`, `TILINGS`,
`MODES_3D`, `mode_for`, `surface_of`, `view_hint`, the picker's per-surface
gating and the random pool all follow from the `SurfaceSpec`. The `klein`
modes join the wrapped-surface
invariant suite (`TestWrappedArchimedean` / `TestKleinTilings`) so
χ = 0 / 0 boundary circles are checked automatically; if you add the spec
but forget a preset, `TestPresets.test_all_presets_build` fails loudly.


## Recipe: add a surface that is not a wrapped rectangle

The Klein bottle above is the pattern for a surface the plane *wraps onto*: an
immersion, a seam gluing, and the same rectangular window every tiling already
has. The **double torus** (`doubletorus`, `surfaces.double_torus_board`) is the
second worked example, and it is the pattern for a surface that is built by
**joining boards** instead — a connected sum. Read
[`geometry.md`](geometry.md#the-double-torus) for what it is; this is what
adding another one of its kind costs.

Most of the Klein recipe still applies — one `SurfaceSpec`, one builder, one
`MANIFOLD_ORDER` / `MANIFOLD_LABELS` entry, presets measured rather than
picked — and four things do not:

1. **Declare the topology, do not assume it.** `SurfaceSpec` carries `euler`
   beside `boundary_components`, and it is not decoration: `resize._topology_ok`
   rejects a candidate window whose surface came out the wrong genus, and read
   as "closed means χ = 0" it rejects *every* window of a genus-2 board and the
   size search reports "no window builds at this size". Set it, in
   `data/catalog.json`, alongside the other five surfaces.
2. **Restrict the surface to the tilings it has builders for**, with the
   `tilings` allow-list on the `SurfaceSpec` (the double torus started at
   `["square"]` and grew to all three regular tilings by adding two builders
   and one entry). Everything derived follows: the picker page offers those
   tilings alone, and
   `picker_families` drops the families the allow-list empties rather than
   showing pages of greyed-out rows. On the web the surface's row survives on
   the Flat manifolds page because `menu.ts` counts its promoted tiling rows as
   well as its family submenus — a families-only test hid the first surface to
   have only the former.
3. **Say how a face knows which way is out.** `_assemble` winds a closed
   surface outward from *the* ring circle through the origin, which a joined
   board has more than one of; pass an `orient` of your own that reads the
   piece off the cell id rather than measuring, because at the join the pieces
   are equidistant and a measured answer ties. Both ports take the same
   argument. The check that your rule is consistent is combinatorial and worth
   writing: on an orientable closed surface every edge is traversed once in
   each direction.
4. **Cut geometrically and the topology stops being obvious.** The double
   torus does not remove a block someone chose but everything each donut puts
   on the other's side of the plane between them, which makes it embedded
   whatever the arguments -- and makes the shape of the removed region move
   with all of them, and with the tiling. So **measure** the result rather than
   arguing it: what is left of one piece has to be a torus minus one disc
   (chi = -1, one boundary circle), which is exactly when gluing two of them
   gives chi = -2, and that check is cheap, exact, and catches every way a
   coarse window can go wrong. Two of them do: a cut that takes a whole course
   round the tube leaves a cylinder, and two cylinders glued rim to rim are a
   donut rather than a double one; and a cell with every vertex on the seam has
   no vertex of its own, so the other piece's copy is the same ids and the two
   are glued along every edge. Refuse both -- the size search skips a window
   that will not build, so a `ValueError` is the whole handling -- and pin the
   result with a *sweep* of windows rather than the shipped rows.
5. **A vertex exactly on the join plane is the trap.** It is not shared (no
   removed cell need touch it), so the two pieces' copies of it land at one
   point under two ids: a surface touching itself, and -- because the topology
   invariants key on rounded coordinates -- a chi that reads as a lower genus
   than the mesh has. Count "on the plane" as past it, with a tolerance wide
   enough that a *kept* vertex's two copies still round apart at the six
   decimal places `corner_fans` counts by (1e-6, not 1e-9). The double torus
   hits this at separation 1, where the tube's own quarter points sit on the
   plane to the bit.
6. **A geometric cut can straighten a corner.** Pulling a run of vertices onto
   the join plane can leave three corners of a cell collinear, and the shape
   palette's geometric fallback then measures that square as a triangle and
   paints it a different hue. Carry a `cornerMask` — the authoritative "which
   polygon vertices are real corners", which for a board of squares is all of
   them.
7. **Expect the size band to lose.** A joined board buys twice the cells per
   step of its window, so the floors that keep one piece reading as a surface
   (`resize.MIN_WRAP_CELLS` for a closed square lattice) can put the smallest
   legal board well past the classic easy size. That is an `EXEMPT_ROWS` entry
   in `tests/test_presets.py` with the arithmetic written down, not a preset to
   tune. Two things in the search need care first: seed the preset with a window
   you actually believe in, since the cell-shape bar is measured at 1.02× the
   *current* preset's and a bad seed sets a bad bar; and note that the fallback
   candidate net is sorted by closeness to the target, so a floor that rejects
   everything near it starves the net (hence `WIDE_CANDIDATE_LIMIT`, much
   looser than `CANDIDATE_LIMIT`).
8. **Give the search a measure of the join, or it will spend everything else on
   cell shape.** How *much* of the pieces the merge ate is invisible to every
   other bar -- the topology is the same either way, and a broad flat waist
   scores as perfectly well-proportioned -- so the double torus shipped with a
   join the full width of a donut until `resize.MAX_WAIST` existed. Three
   things about that bar are worth copying. It must not give way to the size
   band, because below the sizes where a merge is possible at all the only
   joins available are the wide ones. It has to be judged against the best
   value of the shape knob rather than the seed's, since the window search
   holds that knob fixed and a window whose join is too wide at a fat tube is
   often the best one at a thin tube. And the same bar belongs *inside* the
   radius sweep, or the sweep hands the width straight back.

Its two icons are hand-written like every other surface's: `DOUBLE_TORUS` in
`web/src/ui/icons.ts` (a pair of `SurfacePoint`s — `surfaceMesh` takes several
and meshes them into **one** frame, since two calls each scale their own grid
to fill the icon and come out overlapping) and a `doubletorus` branch in
`gui.py`'s `_render_icon`. `tests/test_gui.py` requires one for every
`MANIFOLD_ORDER` key, so a missing icon fails rather than draws blank.
