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
   `test_no_tile_centre_sits_on_the_cut` measure every rule. A tiling whose
   flat layout cannot serve the strips — its rows too coarse along this
   direction, or its only horizontal reflection a glide off y = 0 — can wrap
   in a layout of its own, turned a quarter turn or moved onto that line
   (`_ArchTemplate.wrap`; see "The wrap layout" in the 2-uniform recipe).
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
of **tilings** that has not been wrapped yet gets a `_FAMILY_SURFACES` entry
instead, naming the surfaces it does reach (`{"flat"}` to start with): that sets
`TilingSpec.surfaces` on every member, so `allows()` refuses every other surface
and `picker_families` drops the family from those pickers because it has no
enabled row left. See "Recipe: add a flat-only tiling family" below. Both are
per family, not per tiling.

## Recipe: add a flat-only tiling family

The last family in `ARCH_TILINGS`, `family="other"`, is the tilings that
answer to none of the five above — today the fractal boards' own tiles laid
down **periodically** instead of inflated, and they ship on the plane alone:
the sphinx as `sphinxpairs`, the chair as `tromino`, and Dürer's pentagon
tiling as `durer`. Everything about them is an ordinary `_ArchTemplate` — they
simply have no wrap builder or preset window yet, and the flat-only flag is
what says so rather than a missing row somewhere. Being a grab-bag, the family
claims nothing in `_FAMILY_TRAITS`; each member's own test class asserts what
holds of it.
The mode strings are `sphinxpairs`, `tromino`, `durer`; the fractal boards keep
`sphinx`, `chair` and `pentaflake`, which is why the tilings could not reuse
those keys.

Adding one, or adding a tiling to one:

1. **Template** — as for any periodic tiling, but say what the pattern really
   is. Both rep-tiles are **p2**: no mirror at all (`mirrored=False`), and a
   tile centroid is not a symmetry centre, so `centre` is pinned to a corner
   where the tiles meet — `(0, 0)` for both. Dürer's tiling is **cmm**: mirrors
   both ways and half turns where they cross, so its `centre` is pinned to the
   crossing that is a *tile* centre — the rhomb's, a pentagon having none —
   and its window comes out symmetric on both axes. (Which arrangement you
   pick matters: the same pentagons and rhombs also tile as **pm**, one mirror
   direction and one symmetric axis. Same tiles, same density, a lopsided
   board.) `_periodic_domain` builds the domain from the pattern's own lattice
   where it is not rectangular (the sphinx's parallelogram, Dürer's rows).
   Declare a **`grain`** if the tiling has one — the spacing of straight lines
   no tile crosses, along x and y, measured from the window centre and dividing
   the domain. A tiling with mirrors both ways (Dürer's) wants none: a window
   centred where they cross is already symmetric, which is the better answer.
   Declare **glyph anchors** too if a tile's corner mean is a poor place for
   its number — see the note below. `archimedean_board` ends its window on them, which is the
   difference between a straight board edge and a row of tiles kept by half:
   the sphinx has one horizontally (√3, one course per tile) and none
   vertically, the L-tromino has both (3 and 2, its own domain). Most tilings
   have none — a hexagon straddles every horizontal line there is — and leaving
   it at `(0, 0)` keeps the old behaviour exactly. `TestFlatGrain` checks the
   claim against the domain and the shipped boards.
2. **Traits** — one `_FAMILY_TRAITS` row: `(vertex-transitive, edge to edge,
   monohedral)`. "Other" is `(False, False, False)`: its rep-tiles are
   monohedral and Dürer's is edge to edge, but neither holds of the family, so
   it claims nothing and `monohedral` keeps `test_tiles_are_congruent` off a
   family with two tile shapes in it.
3. **Flat-only** — map the family key to `{"flat"}` in `_FAMILY_SURFACES` in
   `catalog.py` and to `["flat"]` in `ARCH_FAMILY_SURFACES` in
   `web/src/boards/catalog.ts`, and put it
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

`TestRepTilePatterns` and `TestDurer` in `tests/test_boards.py` cover the
family's members (each tile's own shape and congruence, a domain covered
exactly, edge-to-edge or not), and `TestArchimedean.test_flat_board_is_symmetric`
covers the window.

**Glyph anchors.** A cell's number is centred on the cell's corner mean and
sized by the distance from there to the nearest edge, which on a lopsided or
concave tile can leave no room: the L-tromino's mean lands *on* its reflex
corner (a glyph of size zero — invisible), and the sphinx's is squeezed under
its notch (a third of the circle the tile can hold). Both declare an
`anchors` map on the template instead — per domain cell, in domain
coordinates, `translatedAnchors` moving the base tile's point with each copy
`periodicDomain` lays down — and `archimedeanBoard` turns it into the board's
`glyphAnchor`. This is a TypeScript-side refinement, as
`Substitution.glyphAnchor` in `web/src/boards/fractal.ts` already was: the two
rep-tile templates anchor the same points their fractal counterparts do, so
the sphinx's two boards, and the chair's, number their tiles alike.

**Wrapping one later** is the rest of the Archimedean recipe and nothing new:
choose the `cut` (neither family has one yet — Dürer's pentagon rows sit at
y = 0 and y = height/2, so its cut cannot be either), add the surfaces to the
family's two `_FAMILY_SURFACES` entries (or drop the entries once it reaches
them all), and add the `torus`/`cylinder`/`mobius`/`klein` preset rows the
surfaces its mirror and `flips` allow — the 2-uniform family below did exactly
this for the cylinder and the Möbius strip. The tests that only ask questions of the tilings
that wrap — `test_no_tile_centre_sits_on_the_cut` and the rest of
`TestWrappedArchimedean` — pick it up the moment it has any wrapped preset.

## Recipe: add a 2-uniform tiling

`family="2-uniform"`: edge-to-edge tilings by regular polygons whose vertices
fall into exactly **two** classes under the tiling's symmetries — the next step
past the uniform tilings, which have one. There are twenty and **all twenty
ship**, on the plane, the cylinder and the torus, and all but `studdedtri2`
on the Möbius strip too (`_FAMILY_SURFACES` holds them to those four — see the
recipe above). So there is no new one to add; what follows is how the twenty
are built, what to keep in step when changing one, how they wrap the cylinder,
the Möbius strip and the torus, and what wrapping the Klein bottle would take.

**Three are a uniform tiling cut up or merged**, so their factories reuse its
polygons — `_rhombitrihex_polygons` (with a `merged` predicate for the
dodecagons, and a `reach` for a domain more than one lattice cell across) and
`_trunchex_polygons`, plus the helpers `_fan` and `_dodecagon_patch`:

| key | label | notation | built as |
|---|---|---|---|
| `trirhombitrihex` | Fanned rhombitrihexagonal | [3⁶; 3².4.3.4] | 3.4.6.4 with every hexagon fanned into six triangles |
| `dissectedtrunchex` | Dissected truncated hexagonal | [3².4.3.4; 3.4.6.4] | 3.12.12 with every dodecagon cut into the 3.4.6.4 patch (hexagon, six squares, six triangles), squares on the edges facing triangles |
| `dodecarhombitrihex` | Studded rhombitrihexagonal | [3.4.6.4; 4.6.12] | 3.4.6.4 with one hexagon in four (even lattice indices both ways) merged with its ring of squares and triangles into a dodecagon |

The choices that are easy to get wrong there:

- **Which way round a dissection goes.** Cutting 3.12.12's dodecagons with the
  squares on the edges a dodecagon shares with *another dodecagon* gives
  [3³.4²; 3.4.6.4] instead — same five tiles at the corner, different order
  (that one ships too, as `dissectedtrunchex2`).
- **How many to merge.** Merging one 3.4.6.4 hexagon in *three* gives plain
  4.6.12; one in four is the 2-uniform one, and it needs a domain twice the
  size both ways.
- **The window centre.** A tiling with no big tile on its six-fold centre has
  to pin `centre` to it: `trirhombitrihex`'s biggest tile is a square, a
  two-fold centre, so it pins the 3⁶ vertex `(0, 0)`.

**The other seventeen are written down from one translation cell**
(`_cell_template` in `tilings.py`, `cellTemplate` in `web/src/boards/tilings.ts`;
the comment above `_steps` documents the format). Every vertex is a walk of unit
steps at multiples of 30 degrees from one lattice point, so a factory is data:
the translation lattice `v1`/`v2` (two walks), the rectangle the domain is (two
lattice vectors at right angles, as integer combinations of them), one
`(sides, corner walk, heading)` per translation class of tile, and the window
`centre`. The cells came out of an exhaustive search over tori for edge-to-edge
tilings by triangles, squares, hexagons and dodecagons with exactly two vertex
orbits. It found the twenty and no others, which is how the three above were
checked too.

| key | label | notation | group | what it looks like |
|---|---|---|---|---|
| `studdedtri` | Studded triangular | [3⁶; 3⁴.6]₁ | p6m | triangles with a hexagon at every point of a lattice three edges apart |
| `studdedtri2` | Twisted studded triangular | [3⁶; 3⁴.6]₂ | p6 | the same, √13 apart and chiral (snub hexagonal is √7) |
| `elongated2` | Half-elongated triangular | [3⁶; 3³.4²]₁ | pmm | two triangle courses between square courses |
| `elongated3` | Third-elongated triangular | [3⁶; 3³.4²]₂ | cmm | three triangle courses between square courses |
| `tritrunctrihex` | Fanned truncated trihexagonal | [3⁶; 3².4.12] | p6m | 4.6.12 with its hexagons fanned |
| `fannedhex` | Fanned hexagonal | [3⁶; 3².6²] | p6m | hexagonal with one hexagon in three fanned |
| `hexbands` | Banded hexagonal | [3⁴.6; 3².6²] | cmm | rows of hexagons, triangles in the zigzag between |
| `snubelongated2` | Pinwheel snub square | [3³.4²; 3².4.3.4]₁ | p4g | snub square's arrangement, some squares paired |
| `snubelongated` | Zigzag snub square | [3³.4²; 3².4.3.4]₂ | pgg | squares all in pairs, the pairs two ways |
| `dissectedtrunchex2` | Turned dissected truncated hexagonal | [3³.4²; 3.4.6.4] | p6m | `dissectedtrunchex` with the squares the other way round |
| `squarerows2` | Doubly elongated triangular | [3³.4²; 4⁴]₁ | cmm | two square courses between triangle courses |
| `squarerows3` | Triply elongated triangular | [3³.4²; 4⁴]₂ | cmm | three square courses between triangle courses |
| `hexrows` | Bow-tie hexagonal | [3².6²; 3.6.3.6] | pmm | rows of hexagons, corners touching, bow ties between |
| `dodecasquare` | Square dodecagonal | [3.4.3.12; 3.12²] | p4m | dodecagons on a square lattice, a square and four triangles in each gap |
| `hexrings` | Dissected truncated trihexagonal | [3.4².6; 3.4.6.4] | p6m | 3.4.6.4's tiles with the squares in rows of three |
| `squaretrihex` | Elongated trihexagonal | [3.4².6; 3.6.3.6]₁ | pmm | square courses between trihexagonal bands, in line |
| `squaretrihex2` | Staggered elongated trihexagonal | [3.4².6; 3.6.3.6]₂ | cmm | the same, each band half a hexagon along |

The literature knows these tilings only by their vertex types, so that is the
`notation`, written as Grünbaum and Shephard (*Tilings and Patterns*, 1987,
pp. 65–67) and Wikipedia's tables write it. Where two tilings share both
types, its subscript is theirs: ₁ and ₂ are not this game's to choose, and
`test_subscripts_follow_the_literature` pins the two pairs a mirror tells apart.
The menu shows the notation under the label.

The **label** is this game's own, in words, after the uniform tiling each is
made from and what was done to it — the same few words throughout:

- **fanned**: a hexagon cut into six triangles from its centre;
- **dissected**: a dodecagon cut into a hexagon ringed by six squares and six
  triangles (Wikipedia's word for it); **turned** when the ring sits the other
  way round;
- **elongated**: rows of squares between rows of triangles, as in *elongated
  triangular*. **Half-** and **third-** put one row in every second or third
  gap; **doubly** and **triply** put two or three in every gap;
- **studded**: a bigger tile at every point of a sparse lattice (**twisted**
  when that lattice is turned off the grid, so the tiling is chiral);
- **banded**, **bow-tie**, **pinwheel**, **zigzag**, **staggered**: what the
  pattern looks like, where no operation names it.

A new label wants a word from that list, or one that reads as plainly; a
label that only a geometer could decode belongs in the notation instead.

Three things about a cell that are easy to get wrong:

- **The rectangle runs along a mirror**, and the centre sits on one, so the
  template's y = 0 is a mirror line and `mirrored` holds. That is what
  `test_flat_board_is_symmetric` then asks of the board. A tiling with no mirror
  (`studdedtri2`, p6; `snubelongated`, pgg) passes `mirrored=False`.
- **The centre has to leave the window fair.** It is a half-turn centre, which
  the window's symmetry needs, and usually the highest-order one. But round
  `fannedhex`'s six-fold centre and `dodecasquare`'s four-fold one, every window
  near the easy size leaves rim cells with an identical twin
  (`metrics.indistinguishable_cells`), and the size search, which holds that
  bar, could only answer with a board one domain wide. Both take an edge
  midpoint instead.
- **A turned domain measures its edges a little off.** Tags are rounded to
  1e-6. `snubelongated`'s rectangle runs at 45 degrees to its edges, so
  `test_tiles_are_regular_with_unit_edges` holds edges to 1e-5, not 1e-6.

To change a tiling, keep three things in step: its factory in both ports (the
conformance oracle compares the boards cell for cell), its `ArchTiling` row
(`config` is the tile side counts and `vertex_types` the two configurations,
each read round its vertex), and its `flat` row in `ARCH_PRESETS`, re-measured
by the pipeline (`resize.py --only`, `calibrate.py --only`, `apply.py`, then the
exporters). The seed's pixel scale matters there: `resize` holds a flat board's
*width* at whatever the seed gave, so seed a scale that makes the board about as
wide as its neighbours (~480 px).

`TestTwoUniform` then checks every one:
- every tile is a regular polygon of unit edge;
- every interior vertex is one of the two declared types, read as a cyclic
  sequence, which is what tells 3².4.3.4 from 3³.4²;
- the domain's tiles cover it exactly;
- the notation names the same two vertex types, and carries a subscript
  exactly where two tilings share them;
- no two of the twenty are the same tiling, by the vertex types met ring by
  ring walking out from each kind of vertex. The subscripted pairs need this,
  because the vertex check cannot tell them apart.

The menu icon is a `disc` patch (`discPatch` in `web/src/ui/icons.ts`) reaching
past the first ring of tiles, since a ring round one tile or one vertex shows one
vertex type and reads as the uniform tiling it was cut from. Its `DISC_RADIUS` is
per tiling, and for a subscripted pair wide enough that the two icons differ.

**The cylinder and the Möbius strip.** Every one of the twenty reverses y
somewhere — p6 and pgg by a half turn, the rest by a mirror too — so every one
has `flips` and every one wraps a cylinder, `studdedtri2` and `snubelongated`
included, as the snubs do. Nineteen wrap the Möbius strip as well, gluing its
seam through a horizontal mirror — or, for `snubelongated` (pgg, no mirror at
all), through its horizontal **glide**, as snub square's seam does. Only
`studdedtri2` (p6: no mirror and no glide, in any direction) stays off it, as
snub hexagonal does.

**The wrap layout.** A tiling can lie on a strip along either lattice
direction of its rectangle, and the flat layout is only one of them. A
template may declare a second layout for the wrapped surfaces
(`_ArchTemplate.wrap`, built by `_reframed`, read through `_wrap_template`; in
TypeScript `wrapTemplate`): the same cells **turned a quarter turn**, and/or
**moved so a mirror or glide line sits on y = 0**, where the Möbius and Klein
seams glue. The flat board never sees it. Two use it: `elongated3` wraps
turned (`wrap=dict(cut=1/3, quarter=True)`) and `snubelongated` wraps on its
glide a quarter of the domain up (`wrap=dict(cut=0, axis=1/4, glide=True)`).
`TestWrapLayout` in `tests/test_boards.py` checks that each layout's mirror
carries every tile onto a tile and that it holds the flat layout's tiles. In
`scripts/difficulty/resize.py` every wrap measure reads the layout the builder
lays out (`_layout`); `corner_indices` and `planar_shape` stay on the flat
template, being measured flat. One trap when experimenting: `_TILE_SPAN` and
`_TILE_FRACTIONS` there cache per tiling key (and per donut or strip layout,
below), so a script that swaps layouts under one key has to clear them.

**The cut.** Each tiling states one `cut`, which both surfaces share:
`_cell_template`'s takes it as a **fraction of the domain height** (of the wrap
layout's, where there is one), the three cut-or-merged factories pass a
height directly. Which height is a measurement, not a choice, and one rule
chose all twenty:

1. The cylinder's cut **stands** wherever the strip can share it — the
   flattest gap between two rows of tile centres (any height inside one keeps
   the same tiles), at the simplest fraction inside it — provided both
   surfaces then have an easy window inside the hard size bar (±25%) **that
   plays as a puzzle**: 90% or better at the opening floor, the most an easy
   board of that window can manage (a few points under the 96.5% target is
   what a 300-game scan cannot tell from it).
2. Otherwise it is **searched** over every gap, in the flat layout and turned
   a quarter turn, for the flattest rim that clears the same bars; the flat
   layout, then the simplest fraction, break ties.

A rim that is not a puzzle rules a gap out by itself: the flattest gap of
`dodecasquare` cuts off the triangle on each rim square's outer side, and the
square and the triangle across from it then have one closed neighbourhood
between them (`metrics.indistinguishable_cells`) on every window there is, so
it takes the other gap as flat (two thirds up, not one third). And the window
has to show the **tiling**, not just its tiles: a 2-uniform board is two kinds
of corner, and `resize.shows_tiling` (read back by
`TestEveryWindowShowsItsTiling` in `tests/test_presets.py`) refuses a window
with no interior vertex of one of them. The course tilings that end on a
straight line (`elongated2`, `squarerows2`, `squarerows3`, one edge wide) end
on the edge of a band — the 3³.4² line between a square course and a triangle
course — rather than inside one: a vertex on a rim is not shown, and twelve
tiles round an easy tube leave room for barely one band along it. Cut on the
4⁴ line, `cylsquarerows3` easy shipped three courses of squares and not one
triangle.

On the Möbius strip it is the **row count** that bites. `rows + 2*cut/height`
has to be whole, so the band steps a whole domain at a time, and a band must
run 2.24 times as far round as it is wide or the immersion narrows it. A
2-uniform domain is four to nine edges tall, so a cut whose shortest band
showing both vertex types is a domain and a bit hands the easy strip 200-odd
cells — `mobiuselongated3` measured 285 at the cylinder's cut. Nine cuts
moved when the strip arrived, and eleven stood. `studdedtri`, `squarerows3`
and `squaretrihex` went to another straight line. `fannedhex`,
`squaretrihex2`, `tritrunctrihex` and `hexrings` took a zigzag, because each
straight line either leaves the strip no small board or plays coin flips at
easy (`squaretrihex2`'s at 84–88%, `fannedhex`'s at 88–90%). `elongated3` is
the quarter turn: flat, its rows step a whole band of four courses and no cut
gives either surface an easy board under 108 cells; turned, they step one edge
and both get one of the classic size. `snubelongated` wraps on its glide.
`tritrunctrihex` has since moved its cut once more, to just below a row of
dodecagons: every strip at the zigzag pinned two triangles per gap to the rim by
a corner, near-twins no peel can reach (see "A window's rim is cut back by its
near-twins" in [`geometry.md`](geometry.md)). Its easy cylinder still plays
harder than its target at the opening floor (92%) and is flagged; its easy band
closes its seam only at whole domains plus a sliver and ships at 170 cells, an
`EXEMPT_ROWS` entry, and plays on target. A band under one domain tall
is a real window here, as it is on the cylinder: `resize._mobius_rows`
enumerates the row counts the seam accepts the way `_cylinder_rows` does,
rather than stepping on from the seed's fraction, which never offered
`mobiustrirhombitrihex` its five-sevenths easy band. Five end on straight rims
on both surfaces (`studdedtri`, `elongated2`, `squarerows2`, `squarerows3`,
`squaretrihex`, in `STRAIGHT_RIM`), and the other fifteen on the least ragged
zigzag that plays.
Every flip level here is 0 or a quarter of the height, so with a cut that is a
fraction of the height the row counts that centre a cylinder's strip on a flip,
and that close a Möbius seam, are fractions too, and the `ARCH_PRESETS` rows
write them that way (`1 + 5 / 6`), which is what lets `apply.py` keep them
exact. Changing a cut moves those fractions, so re-run `resize.py --only` on
the `cyl…` and `mobius…` rows after one.

**The torus.** A donut has no rim and needs no mirror, so it takes no cut and
all twenty reach it, `studdedtri2` included. What binds is size. The ring needs
four whole domains (`resize.MIN_WRAP_DOMAINS`) and no tile may span more than a
quarter of the tube (`MAX_TILE_TURN`), and a 2-uniform rectangle holds 5 to 42
cells with, in most of them, a tile over a quarter of the domain tall — so the
smallest legal donut is 4x2 domains, and for ten tilings that is well past the
easy size: 128 cells for `fannedhex` up to 336 for `studdedtri2` (`hexrings`
closes in one row at 4x1, 144). Those easy rows ship at that smallest window,
seeded there so the shape bar (1.02x the seed's edge ratio) did not defend a
bigger, rounder one — the search otherwise doubled `torustrirhombitrihex` easy
to its medium window. They are `EXEMPT_ROWS` in `tests/test_presets.py` with the
count beside each; where the 4x2 window is also the closest to 256
(`studdedtri2`, `tritrunctrihex`, `snubelongated2`, both dissected truncated
hexagonals) medium ships the same window, with more mines.

**The torus layout.** Which side of the domain goes round the ring is the one
thing a layout decides on a donut, so a tiling may glue its donut in a layout of
its own (`_ArchTemplate.torus`, declared by `_with_torus` and read through
`_torus_template`; in TypeScript `withTorus` / `torusTemplate`):
`torus="flat"` keeps the flat layout where the strips take a wrap layout, and
`torus="quarter"` turns the flat layout for the donut alone. Every 2-uniform
tiling was measured both ways, and three take one. `elongated3` glues its donut
flat: its wrap layout is turned for the strips, which puts the domain's long
side round the ring, four times over, and its easy donut at 224 cells; flat,
it is 84 (six domains one edge wide round the ring, one round the tube, the
classic size, though chunky enough that `data/distortion.json` marks it). And
`elongated2` and `trirhombitrihex` turn, for the same sizes with rounder cells
(a p90 cell distortion of 1.05 and 1.07 at easy, against 1.35). For the other
seventeen the turn puts the long side round the ring and makes the donut
bigger or no better. `TestTorusLayout` checks the three and that every other tiling's
donut is its wrap layout; `resize` reads the torus layout through
`SPEC["arch_torus_board"]["torus"]` (`_spec_layout`), and its tile measures
are cached per layout.

The other ten make easy donuts of about the classic size: eight at 80 to 90
cells (`elongated2`, `elongated3`, `hexbands`, `squarerows2`, `squarerows3`,
`hexrows`, `squaretrihex`, `squaretrihex2`), `dodecasquare` and
`snubelongated` at 96. At that size `hexbands`, `squaretrihex2` and
`dodecasquare` are chunky (`TestWrappedWindowsDoNotFold.CHUNKY`), `hexbands`,
`squaretrihex2` and `snubelongated` are marked distorted
(`data/distortion.json`, which lists `torustritrunctrihex` hard as well), and
`fannedhex` and `dodecasquare` easy play at 90–91% even at the opening floor,
short of the 96.5% target, as `tritrunctrihex` easy does on the cylinder.
`TestWrappedArchimedean.test_two_uniform_torus_vertices_are_the_two_types`
checks every vertex of every donut closes and is one of the two types, in
cyclic order, both present.

**The Klein bottle** is the same as for "Other": add it to the family's
`_FAMILY_SURFACES` entries (both ports) and add the surface presets, measured.
The cut and the wrap layouts are already chosen. The mirror or glide the
Möbius strip glues through is what a Klein bottle would glue through too, so
the same nineteen would reach it, and the torus's size arithmetic applies to
it unchanged.

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
* **A pattern with no block can still fill the face whole.** The brick rings
  (`aperiodic._brick_rings_tiles`) have no fundamental block at all, but n
  rings tile a 2n x 2n square, so `BRICK_RINGS` is the one key
  `brick_cube_board` takes that is not a `BRICK_BONDS` row: `_face_bricks`
  hands back the flat board's bricks for the face instead of a grid of blocks,
  on a lattice of `[-n, n]**3`, and everything after (the cyclic face axes,
  the splice, the symmetry) is shared. `TestBrickRingsCube` checks every face
  against the flat board brick for brick.

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
`catalog.FLAT_ONLY_FAMILIES` (with `aperiodic` and `spiral`), which `family_rows`,
`picker_families` and the TypeScript mirror all read.

## Recipe: add a hyperbolic {p,q} board

The **Hyperbolic** family (`hyperbolic.py`, `web/src/boards/hyperbolic.ts`) is
one builder, `hyperbolic_board(p, q, shells, mine_count, scale)`, so a new
{p,q} is data, not code -- provided the tiling is hyperbolic ((p - 2)(q - 2) >
4). A face-centred {p,q} with `p >= 4` comes from the ring walk; a triangle
tiling {3,q} cannot (the walk would have to close a face on one new vertex) and
is built as the dual of {q,3} instead, centred on a vertex, so it keeps D_q
rather than D_3 -- that too is automatic. Read
[`geometry.md`](geometry.md#the-hyperbolic-boards) first.

1. **Menu + presets** -- add `hyperbolic{p}{q}` to `menu.hyperbolic` and
   `soloLabels` in `data/catalog.json`, and a `{builder: "hyperbolic_board",
   args: {difficulty: [p, q, shells, mines, scale]}}` row to
   `data/presets.json`, seeded with shell counts near the targets (list the
   sizes with a loop over `shells`; they step 5-14 cells at a time). Then
   `resize --only` and `calibrate --only` the new mode and `apply` (see
   [`difficulty.md`](difficulty.md)): `SPEC["hyperbolic_board"]` already says
   which arg is which. Re-run `scripts/export_data.py` and
   `export_conformance.py`.
2. **Twins are already handled.** A shell can leave rim cells with the same
   closed neighbourhood -- on a large q, nearly every shell does -- and the
   builder drops them (see "Then the trim drops its twins" in
   [`geometry.md`](geometry.md#the-hyperbolic-boards)), so every trim the size
   search sees is fair. Neighbouring shell counts can therefore build the same
   board; that is expected.
3. **Icons** -- add the mode to `HYPERBOLIC_ICON_SHELLS` in
   `web/src/ui/icons.ts` and `_HYPERBOLIC_ICON_SHELLS` in `gui.py` (about a
   ring and a half: what still reads at row size), and to `PATCH_BOARDS` for
   the menu card.
4. **Tests** -- add the tiling to `_HYPERBOLIC` in `tests/test_boards.py` and
   `TILINGS` in `web/tests/unit/hyperbolic.test.ts`, its ring counts to the
   latter, and its point group (D_p, or D_q for a {3,q}) to
   `symmetries.test.ts`.

The web menu files a hyperbolic board on its own: Custom › Hyperbolic is split
into Regular, Uniform and Closed surfaces by the preset's builder (`MENU_SUBFAMILIES` in
`web/src/boards/catalog.ts`). A board from a builder no submenu names fails
`web/tests/unit/menu.test.ts` rather than vanishing from the menu — add its
submenu there, with a label, a hint and an icon alias.

**A uniform tiling of a {p,q}** (6.6.7 on {7,3}, 4.8.10 on {5,4}, twenty-two in
all) is also data: a `{builder: "hyperbolic_uniform_board", args: {difficulty:
[p, q, op, shells, mines, scale]}}` row with `op` one of `WYTHOFF_OPS`, and the
mode must be `wythoff_mode(p, q, op)`. Build it on the face-centred {p,q} with
p >= q, so the board centres on its big face; `truncate` is there for a
truncation that `zip` on the dual would centre on a small square. Add the mode
to `menu.hyperbolic` in its family's run (the Uniform page lists them in that
order), to `_HYPERBOLIC_UNIFORM` in `gui.py` and `HYPERBOLIC_UNIFORM` in
`icons.ts` as `(p, q, op)` (with its icon shells and menu card, as in step 3),
and to `_WYTHOFF` / `UNIFORM` in the two test files. Then the checks above,
plus two the regular boards never needed: **a new side count** (the 14-gon and
16-gon were) needs a badge in `SHAPE_SIDES` and a regenerated Game Center list
(`npm run gamecenter`, with `PLAYWRIGHT_CHROMIUM_EXECUTABLE` where the pinned
browser is not installed), and **a new pair of shapes on one board** must
sound a chord -- `soundHarmony.test.ts` fails if it does not, and the fix is
the spelling in `audio/presets.ts`. Read the calibrated rows before believing
them: a mine count out of line with the board's other two rows means a trim
whose rim is mostly forced guesses, and the fix is the neighbouring trim,
pinned in `resize.PINNED_ROWS` (4.8.12, 4.12.12 and 3.16.16 medium and
3.14.14 hard are). See
[`geometry.md`](geometry.md#the-uniform-hyperbolic-boards).

**A closed hyperbolic surface** (`hurwitz.py`, `web/src/boards/hurwitz.ts`)
is a surface rather than a trim, and a new one is a group, not a builder. Read
[`geometry.md`](geometry.md#the-closed-hyperbolic-surfaces) first.

1. **The surface** -- a row in `HURWITZ_SURFACES` in both ports: the q of the
   PSL(2,q) whose Hurwitz generators make it, and its genus. The group code
   takes a prime q, and 8; another prime power needs its field written into
   `_field` / `field` (as GF(8) is). A group with more than one Hurwitz
   surface (PSL(2,13) has three) gives the one the generator search meets
   first; say which by a computed invariant -- the Petrie length
   (`petrie_length` / `petrieLength`) -- and pin it in both test files, or a
   change to the search swaps the board without a word. Add its label to
   `HURWITZ_LABELS`.
2. **Its mode.** One surface a mode (`SURFACE_MODES`), in the Closed surfaces
   submenu (the `hurwitz_board` builder files it). The genus fixes every
   tiling's size -- {7,3} 12(g - 1), 6.6.7 40(g - 1), GC(n,0) beyond -- so
   pick the three rungs nearest the size band, smallest to largest; a row the
   band cannot reach goes in `EXEMPT_ROWS` (or the mode in `GENUS_BOUND`) in
   `tests/test_presets.py`, with the rungs that miss it. The view is sized
   from the genus (`cover_view`), so nothing else needs choosing. The
   mode needs the menu, label, icon and test rows of a hyperbolic one (steps 1,
   3 and 4 above, with `quartic`'s entries to copy); `resize.py` holds every
   row as declared.
3. **The patch must reach every cell** -- the builder grows it until it does,
   and never short of `patch_reach(surface, op)`, which the web pan needs --
   and its face count grows quickly with the genus: 2521 faces for the
   genus-14 hard board.
   A much bigger surface wants a measurement of the build and the pan before it
   ships.
4. **Tests** -- `_HURWITZ` in `tests/test_boards.py` and `SURFACES` in
   `web/tests/unit/hurwitz.test.ts` (group order, faces, vertices, edges), and
   the D7 the patch keeps to `symmetries.test.ts` -- which measures whether the
   mirror survives, so a chiral surface would show there as 7 rather than 14.

**A board in the upper half-plane** -- today only Böröczky's binary tiling,
`binary_board` -- is not a {p,q} and shares none of the disc machinery. It
is a lattice builder whose ids are its integer corners, drawn as a rectangle.
What it needs that the disc boards do not:
- its own `SPEC` grid in `resize.py` (`_grid_binary`), because its cell count is not the product of its knobs;
- `Board.halfPlane` in place of `Board.disc`, which switches on the half-plane pan;
- a row icon of its own in `icons.ts` and `gui.py`, instead of an entry in the icon-shell tables.

The web menu lists it under Flat › Fractals rather than on the Hyperbolic page
(`MENU_REFILED` in `web/src/boards/catalog.ts`), so the home page's Flat row
deals it, not the Hyperbolic one.

See [`geometry.md`](geometry.md#the-binary-tiling).

## Recipe: add an aperiodic / shaped / solid board

These are one-offs, not tiling×surface products.

1. Write a `*_board(...)` builder returning a `Board` (2D) or `Board3D`
   (3D). Flat float-coordinate builders should finish through
   `core._finalize_flat`; lattice builders through `core._build`; 3D
   builders assemble `cells` + `positions` and pick an orientation
   helper (`solids._convex_board3d` for convex solids, the polycube
   assemblers, or `surfaces._assemble`). A flat tile whose vertex mean
   crowds a reflex corner (the Penrose dart's sits a tenth of the way down
   its axis from it) should say where its number goes instead: return the
   board with `glyph_anchors` (Python) / `glyphAnchor` (TypeScript), in the
   board's own pixel space, as `kitedart_board` does — both front-ends
   centre and size the glyph there.
2. Add the mode to the right menu table in `data/catalog.json` — one
   `menu.solidGroups[*].modes` (Sphere, Platonic solids, Archimedean solids,
   Catalan solids or Polyhedra), `menu.aperiodic` (the substitution tilings), `menu.spiral`
   (the boards wound round a centre), or `menu.shapedModes` (keyed by the regular
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


## Recipe: draw a surface that already ships a new way (worked example — the trefoil knot)

The cheapest surface of all is one whose topology already ships: a new
**immersion** of it, with the gluing, and so the adjacency, untouched. The
trefoil knot (`trefoil`, `surfaces.trefoil_board` and its two siblings) is the
torus drawn as a tube round a knot -- read [`geometry.md`](geometry.md#the-trefoil-knot)
for the shape. Everything the board *is* comes for free; what has to be done is
everything about where it is *drawn*.

1. **Reuse the lattices, not just the idea.** The donut's three lattices are
   `_square_cells` / `_triangle_cells` / `_hex_cells` (`squareLattice` /
   `triangleLattice` / `hexLattice` in TypeScript, which also carry the
   lattice's motions), shared with the donut and the double donut. A new
   immersion of the torus is one point function and a three-line builder per
   tiling; the TypeScript `wrapLattice` immerses any of them and offers the
   lattice's symmetries, which hold whatever the immersion. Write the test that
   says so -- the board's adjacency equals the donut's with the same window --
   in both ports.
2. **Say which way is out.** `_assemble`'s default measures from the ring
   circle through the origin. Pass an `orient` that measures each vertex from
   the immersion's own core at that vertex's parameter (both ports take one),
   and test the winding combinatorially: every edge traversed once each way.
3. **Frame the board by what it is.** Pass `radius=_max_radius` (`maxRadius`):
   a knot is not a ring of radius 1, and a hard-coded `1 + tube` frames it
   wrong.
4. **Find out how fat it can be, by measuring.** A tube round a curve touches
   itself at the curve's *reach* -- the smaller of its tightest bend and half
   its closest approach between distant points. Measure it, write it down as a
   constant (`TREFOIL_REACH`) with a test that re-measures it, take the tube as
   a fraction of it, and refuse 1 or more.
5. **Then remember the faces are flat.** A thin enough *tube* is not enough: a
   coarse window draws chords straight through the strands the tube winds round,
   and cell shape cannot see it (each of those triangles is well shaped). Bound
   it -- `_trefoil_sag` measures how far a face's hull strays from the curve,
   and the builder refuses `radius + sag >= reach` -- and test the shipped
   boards directly: every point of a face nearest its own stretch of curve.
6. **Restrict the surface to the tilings it has builders for** with the
   `SurfaceSpec`'s `tilings` allow-list, exactly as the double torus did. The
   trefoil started at the three regular tilings; an `arch_trefoil_board` on
   `_arch_cells` / `_wrapped_positions` with the torus's anchor is what opens
   the rest.
7. **Teach the size search the shape's proportions**, which on a new
   immersion are the whole difficulty (`resize.py`, all scoped to the knot):
   * a `kind` of its own in `SHAPE_SWEEP`, since its tube knob is a fraction of
     the reach rather than a radius;
   * its name in `_closed_tube`, and the square builder in
     `SQUARE_LATTICE_CLOSED` -- same graph, so the donut's playability
     measurement is its own;
   * a `unit` per knob step, so the window's aspect is read in lengths: a knot
     about seven tubes long has triangle windows whose *counts* break the
     aspect cap (64 by 4) while their real proportions (32 sides by 3.5) sit
     well inside it;
   * a quarter-turn floor round the tube (`_knot_tube_turn`): on a donut the
     curvature penalises a two-row tube, and on a knot the distortion score
     rates its coincident plates as near-perfect rectangles;
   * windows judged at the **thinnest** tube the sweep offers, and the seed's
     cell-shape bar measured there too -- the chords' refusal depends on the
     tube, so judged at the seed's tube the result depended on the seed and
     every re-run grew the easy board a ring. (The same reason the double
     torus judges its join at the thinnest tube.)
   Re-run the search at least twice and check the rows do not move.
8. **Expect the easy row to lose the size band**, and write the arithmetic
   into `EXEMPT_ROWS` rather than tuning it away.

The rest is the Klein recipe's: one `MANIFOLD_ORDER` / `MANIFOLD_LABELS` entry,
the square tiling's `modeOverrides`, both icons (here the TypeScript one meshes
the board's own `trefoilPoint`), the surface in the three Grafana dashboards'
`surface` variable, and a gallery baseline.


## Recipe: draw a surface as a cover of itself (worked example — the projective plane)

Some surfaces have no drawing worth making in 3-space: the real projective
plane's immersions all pass through themselves. Draw a space that **covers** it
instead -- the projective plane is the sphere with antipodes glued, so it is
drawn as the sphere, every cell twice -- and let the game run on the quotient.
Read [`geometry.md`](geometry.md#the-real-projective-plane) first. What it took:

1. **A centrally symmetric board with exact keys for the covering map.** The
   geodesic icosahedron and its Goldberg dual qualify: a vertex key is
   barycentric weights over icosahedron corners, and `_antipodes` finds each
   corner's antipode exactly. So does the cube's square grid, whose keys are
   integer lattice points and whose antipode is negation. `surfaces._projective` (`projective` in
   TypeScript) then does the rest for any such board: twins by flipped
   corner sets, cells as the lesser twin, vertex classes as the lesser of a key
   and its flip, shared-vertex adjacency over those, polygons for every face.
   It refuses a face that is its own twin.
2. **`Board3D.faces`** (face -> cell). That one field is the whole contract
   with the front-ends: the session's face -> cell map starts from it (so state
   paints on both faces), `facesFor` lists a cell's faces for every visual,
   picking goes face -> cell, and the info panel and conformance count
   `adjacency`, not `polygons`. A board without it is untouched.
3. **Count the board, not the drawing.** `covering_sheets` divides V, E, F and
   chi; the `SurfaceSpec` declares `euler: 1`.
4. **Symmetries:** measure the cover's (`solidSymmetries` on the faces and
   the sphere's own adjacency), push each down through `faces`, and let
   `keepSymmetries` drop what becomes the identity or a duplicate.
5. **The rest is the trefoil's checklist:** a `SurfaceSpec` with a `tilings`
   allow-list (`["hex", "square", "tri"]`, with the square tiling's
   `modeOverrides` naming its board plain `projective`, as it does `torus`
   and `klein`), `MANIFOLD_ORDER` / `MANIFOLD_LABELS`, the
   builders in `_JSON_BUILDERS` / `BUILDERS`, a `SPEC` row (`rigid`, one knob:
   the frequency) and the measured pipeline, both icons (a hemisphere bowl --
   the textbook model -- in `icons.ts` and `gui.py`), the surface in the three
   Grafana dashboards' `surface` variable, and a gallery baseline.

The same board drawn **once**, on an immersion, is the trefoil's recipe again:
`boy_board` takes `_antipodal_quotient`'s cells and places each vertex class
with `_boy_point`, which is already constant on antipodal pairs -- so the
immersion has to be a map *from the sphere* that identifies antipodes. It
needs no `faces`, takes the projective plane's symmetries unchanged
(`antipodalSymmetries` in TypeScript), and is restricted to the tilings it has
builders for (`["square"]`). See
[`geometry.md`](geometry.md#boys-surface) for what its geometry costs.

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
