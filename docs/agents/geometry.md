# The board model and the board zoo

How a board is built, what already ships, and the invariants every builder
holds to. To *add* a board, follow [`board-recipes.md`](board-recipes.md); its
size and mine count are measured, per [`difficulty.md`](difficulty.md).

## The model in one paragraph

A board is a set of polygonal **cells**. Cell vertices are generated with
**exact, hashable ids** (integer lattice points in 2D, symbolic/float
keys in 3D) so that two cells are neighbours exactly when they share a
vertex id — no floating-point tolerance. `minesweeper/game.py` plays
minesweeper over that abstract adjacency graph (`Game(adjacency, mine_count)`)
and knows nothing about geometry or UI. Never introduce a vertex id that relies
on rounding two nearby-but-distinct points to the same key.

**The one board where "shares a vertex" is not read off the polygons is
`cube3d`** (`volume.py`), and it is the same rule one dimension up. Its cells
are the unit **cubes** of a solid block, and two are neighbours when their
cubes share a corner — the 3x3x3 block around a cell minus itself, so **26**
neighbours where the densest surface board reaches 21. Still exact, still
integer arithmetic, and still nothing rounded together; but a solid cube shows
only its shell, so the board is *drawn* as its slices laid out side by side,
and the polygons are those sheets rather than the cubes. The adjacency is
therefore built from the lattice directly, and it is the one place in the zoo
where the drawing does not carry the neighbour rule. Everything downstream that
reads adjacency — the game, the solver, the conformance oracle's structural
checks — is unaffected; the two things that do read the polygons are told
separately (`two_sided` for the open sheets, and the symmetry controls, which
`volume.ts` offers from the lattice because the layout has none to measure).

`web/src/boards/` is a port of the same model, checked against it by the
conformance oracle — see [`shared-data.md`](shared-data.md). The port is
**pure geometry**, kept apart so other games can be built on the same boards:
its builders take no mine count (the Python ones still do, as `mine_count`),
it imports nothing from outside its folder, and the rest of the app reaches it
only through `web/src/boards/index.ts`. What *is* minesweeper — the presets
(a board's size and its mine count), fairness, distortion, the menu catalogue,
dealing a random board — lives beside it in `web/src/modes/`.
`web/tests/unit/boardsBoundary.test.ts` holds that line.

## Package layout (`minesweeper/boards/`)

Import order is a strict DAG; a module only imports from the ones above it.

| Module | Responsibility |
|--------|----------------|
| `core.py` | `Board` / `Board3D`, the `_shared_vertex_adjacency` neighbour rule, `_build` (lattice→pixels) and `_finalize_flat` (float→pixels), 3D vector helpers, and the topology invariants `euler_characteristic` / `boundary_components` / `corner_fans`. |
| `tilings.py` | Regular flat builders (square/triangle/trigrid/hex/hexhex/hextri/hextriangle/squarediamond), the `_ArchTemplate` system, the eight Archimedean `_*_template()` factories plus their eight Laves duals (built by `_dual_template`), the six isogonal (non-edge-to-edge) ones, the five congruent-rectangle bonds, the two rep-tile patterns and Dürer's pentagon tiling, all twenty 2-uniform tilings (three cut or merged from a uniform tiling, seventeen written down from one translation cell by `_cell_template`), the twenty 2-isohedral duals of those (derived by `_with_two_isohedral`), three of the fifteen convex pentagon tilings (by `_pentagon_template`), and the **`ARCH_TILINGS`** registry (the one place any of them is declared, with `_FAMILY_TRAITS` saying what each family is). |
| `fractal.py` | The self-similar boards, in two menu families: the rep-tiles (the sphinx, the chair, the L-tetromino, the P-pentomino, the trapezoid, the right trapezoid, the half trapezoid, the stretched chair, the rhombic L, the isosceles right triangle, the 30-60-90 triangle, the T-tetromino and the five-triangle) and the fractals (the Sierpinski carpet, the pentaflake and the Gosper island). One `_Substitution` record per tile — unit outline, the tiles filling the inflated copy, the inflation factor, lattice ops — and the shared inflation (`substitution_placements`) all twelve `*_board` builders run. The first nine are rep-tiles (their children fill the tile); the carpet's and the pentaflake's leave holes, which is what makes them fractals with holes rather than shapes; the Gosper island's fill it with no hole at all and put the fractal in the *outline* instead. Four lattices are integer; the pentaflake's is ℤ[ζ10], since five-fold symmetry needs rank 4. The Gosper island's inflation is the one that is not a pure scaling: multiplication by 2 + ζ, a spiral similarity of √7 at 19.106°. |
| `aperiodic.py` | Penrose's rhombi (P3) and his kites and darts (P2), Ammann–Beenker (squares and 45° rhombi, eight-fold), the Spectre (Tile(1,1), the chiral monotile), the phyllotactic spiral, Klaassen's spiral monotile and his three pentagonal spirals (5-, 6- and 7-fold, one convex pentagon each), each with exact-arithmetic vertex ids — ℤ[ζ5] for both Penrose boards and the spiral, ℤ[ζ8] for Ammann–Beenker, ℤ[ζ12] for the Spectre. The Spectre's ring is *dense* in the plane, so unlike Penrose's discrete lattice there is no lattice to snap a float vertex back to: its placements are carried as exact `(rotation, mirror, translation)` triples and no floating point enters the substitution at all. The spiral is the odd one out — no substitution, just ten 36° wedges of the tile's own translation lattice, the odd ones offset a step; nonperiodic because its five-fold centre forbids any translation. The **brick rings** are nonperiodic the same way — by symmetry rather than by a substitution — and are the plainest board here: 2x1 bricks on the integer square lattice in concentric square rings about a 2x2 core, ring k being the boundary of the 2k x 2k square with horizontal bricks along its rows and vertical ones up its sides. Every run is even, so every tile is a whole brick and only an even-sided square is tileable at all. A brick's corner lands in the middle of a neighbour's long side, so `_brick_outline` splits each edge at the lattice points that are genuinely some tile's corner — the 2D twin of `solids._split_at_lattice_points`, and *conditional*, unlike the fractal outlines, which carry a vertex at every step. |
| `hyperbolic.py` | The regular {p,q} tilings of the hyperbolic plane, drawn in the Poincaré disc: {8,3} octagons, {7,3} heptagons, {6,4} hexagons, {5,4} and {5,5} pentagons, {4,5} and {4,6} squares, {3,7} and {3,8} triangles. Built combinatorially ring by ring with integer vertex ids (the triangles as the duals of {7,3} and {8,3}), placed afterwards by disc isometries, edges drawn as geodesic arcs, trimmed by hyperbolic-distance shells. See "The hyperbolic boards" below. Their uniform tilings come off the same walk by Wythoff's construction (`ambo`, `zip`, `expand`, `bevel`, `truncate`; see "The uniform hyperbolic boards"). Also Böröczky's binary tiling, drawn in the upper half-plane as a rectangle (`binary_board`); see "The binary tiling" below. |
| `hurwitz.py` | The closed hyperbolic surfaces: Klein's quartic, Macbeath's surface and one of the first Hurwitz triplet, the {7,3} tiling glued up with no rim. Each surface's map is read off its group, PSL(2,q), with integer ids; the {7,3} disc of `hyperbolic.py` covers it, by a covering map walked on ids alone; and the board draws a patch of that disc, every face showing the cell it covers (`Board.faces`), with the surface's own adjacency and topology (`Board.quotient`). See "The closed hyperbolic surfaces" below. |
| `solids.py` | Closed/convex and polycube 3D boards (the Goldberg polyhedra GP(f, 0) and GP(h, k), the geodesic icosahedron and its subdivision `_geodesic`, with its class III cousin `_geodesic_hk`, the spherical cube and its `_cubed_sphere` (which the projective plane's square board glues up), cube, the Platonic solids, frames, bipyramid), plus the shared `_wythoff_point` every uniform solid here and every Catalan solid next door is generated from. |
| `catalan.py` | The thirteen Catalan solids, the duals of the Archimedean solids. One recipe for all of them: a Platonic base and one flag, the Wythoff generating point of its Schwarz triangle (`solids._wythoff_point` for the five non-chiral Conway operations, `_snub_point` for the chiral one), a Catalan vertex at `n / <w, n>` on each face axis — polar duality — and the base's flags grouped into faces by the operation. Faces are then subdivided (`solids._geodesic` for triangles, `_quad_grid` for quadrilaterals, a five-way fan first for pentagons), which is these boards' only size knob. `_tri_grid` is `_quad_grid`'s triangle twin, for the solids next door whose triangles meet squares. |
| `archimedean.py` | Archimedean solids cut into boards — the cube group's cuboctahedron, truncated octahedron and snub cube, and the icosahedral rhombicosidodecahedron, truncated icosidodecahedron and snub dodecahedron — as the **polar duals of their Catalan solids**: `_archimedean_faces` turns `catalan._catalan_faces` inside out (each Catalan face's pole is a vertex, each Catalan vertex a face), so no Wythoff point is solved twice and every vertex id is a Catalan face key. Faces are cut by `catalan._tri_grid` and `_quad_grid`, which name a shared edge's points alike; the truncated octahedron's hexagons are first cut into three rhombi (`_split_hexagons`, by the pyritohedral `_th_spokes` rule), the icosahedral solids' big faces fanned into triangles (`_fan_faces`). See "The Archimedean solids" below. |
| `surfaces.py` | Wrapping tilings onto surfaces: the three immersion points (`_torus_point`, `_cylinder_point`, `_mobius_point`), the shared `_assemble` tail, the nine simple `*_board` wrappers, and the Archimedean `arch_torus_board` / `arch_cylinder_board` / `arch_mobius_board`. Also `double_torus_board`, the one board here that is *not* wrapped from a rectangle: two overlapping square-tiled donuts cut apart along the plane between them and sewn back together, a connected sum rather than a seam gluing. And `projective_board` / `projective_triangle_board` / `projective_hex_board`, the real projective plane: a cubed sphere (`solids._cubed_sphere`), a geodesic sphere or its Goldberg dual with antipodes glued, drawn as the whole sphere through `Board3D.faces` -- or `boy_board`, the same square board drawn once on Boy's surface. |
| `volume.py` | The volume boards — a solid block of cells rather than a surface of them. One so far: `solid_cube_board`, the `n**3` cube of cubes, whose 26-neighbour adjacency comes off the lattice and whose drawing is the `n` slices laid out on a grid and stepped back in depth. |
| `catalog.py` | The menu, **derived**: `SURFACE_SPECS` and `TILING_SPECS` (leaf data loaded from `data/catalog.json`) produce `MODE_LABELS`, `TILINGS`, `SURFACE_LABELS`, the geometry-first menu tables (`MENU_ROOT`/`MANIFOLD_*`/`FAMILY_*`/`SOLID_GROUP_*`/`SOLID_MODES`/`SHAPED_MODES`) and the picker helpers (`family_rows`, `picker_families`, `picker_modes`), `MODES_3D`, `mode_for`, `surface_of`, `view_hint`. |
| `presets.py` | Difficulty presets and `build_board`. Flat regular, solid, Archimedean/Laves and aperiodic (penrose/kitedart/ammannbeenker/spectre/phyllotaxis/…) presets all load from `data/presets.json` (shared with the web port). The Archimedean rows are authored in the compact **`ARCH_PRESETS`** table (tiling → surface → difficulty → args) that `scripts/export_data.py` expands into `data/presets.json`. |

`__init__.py` re-exports the whole public surface, so `from
minesweeper.boards import ...` is unchanged by the split.

## The tiling families

The eight non-regular Archimedean
tilings (six with two tile shapes, plus 3.4.6.4 and 4.6.12 with three)
and their eight Laves (dual/Catalan) duals — built mechanically by
`_dual_template` — wrap onto the donut/cylinder/Möbius/Klein-bottle via
`_ArchTemplate` (one rectangular periodic domain + modular seam gluing;
snub hexagonal and its dual the floret pentagonal are chiral, so no
Möbius and no Klein bottle — both seams reverse orientation). A
**cut** — one number per template, `_ArchTemplate.cut` — is where both
open surfaces end the tiling, and both need the strip **symmetric about
its own centre line**. A Möbius strip has one edge, so its two rims are
two arcs of the same circle; a cylinder has two, and they have to be the
same curve or the tube reads as cut off square at one end and gnawed at
the other. The seam of a Möbius band reverses y and leaves x running on,
so its flip has to be the template's *mirror*: `rows + 2*cut/height` must
come out a whole number (`rows` may be fractional, as on the cylinder). A
cylinder can also be turned upside down about a horizontal axis, which
reverses x too, so a **half turn** serves it as well as a mirror — which
is how the chiral tilings (the snubs, and four of the isogonal six) get
matching rims with no mirror at all. `_flip_levels` measures the heights
where a tiling reverses y either way into `_ArchTemplate.flips`, and
`arch_cylinder_board` asks that `cut + rows*height/2` land on one of
them. Three-scale triangular (p3) reverses y at no height in any
orientation — no mirror, no half turn — so it is the one tiling with no
cylinder at all, gated out of the menu by `SurfaceSpec.needs_flip` as
chirality gates the snubs out of the Möbius strip. On either surface the
cut never falls on a row of tile *centres* — cutting there keeps the row
at one rim and drops it at the other, which is what six of the eight
uniform tilings shipped as on the Möbius strip — and it runs along a
horizontal edge-line of the tiling wherever there is one, so the rim is a
straight circle rather than a zigzag. See the AGENT NOTE on the cut in
`boards/tilings.py`; every rule is measured on every shipped preset by
`TestWrappedArchimedean.test_mobius_band_is_symmetric`,
`test_cylinder_rims_are_the_same_curve`,
`test_{mobius,cylinder}_rim_is_straight_where_the_tiling_allows` and
`test_no_tile_centre_sits_on_the_cut`. The
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
the shape colouring drops it before measuring. Collinear **in the plane**,
that is: wrapped onto a surface the line is a chord, and a point placed on
the surface stands off it, so the split tile kinks outward and a *run* of
such points across one tile breaks it into strips each cutting its own
chord. `_straight_vertices` records which vertices the tiling runs through
and which chord each belongs on, and `_wrapped_positions` puts them back
there — the flat rule continued, at the price of a slightly coarser model
of the surface. Two limits: a run with no end has no chord (a running
bond's mortar line is unbroken, so only the two basket weaves carry a rule
today), and a vertex on a **rim** is left alone, since a cylinder's rims
and a Möbius band's edge are drawn as clean circles and pulling their
vertices in would scallop them. They wrap the torus like
every other periodic family, and all but three-scale triangular the
cylinder (p3 reverses y at no height, so no strip of it has two matching
rims); the two reflective ones (offset square, staggered triangular) also
wrap the Möbius strip and Klein bottle, and the other four are chiral (no
template mirror), which gates them out of those two seams exactly as it
does snub hexagonal.
A fourth family,
`family="rectangle"`, holds the five brick **bonds** tiled by one congruent
rectangle (stacked bond, running bond, basket weave, its three-brick
version, herringbone). These are face-transitive rather than
vertex-transitive, and — bar the stacked bond, which is a stretched square
tiling — not edge to edge either; `_FAMILY_TRAITS` in `tilings.py` declares
those traits per family and the test lists derive from it. Like the
isogonal family, all five wrap the torus and cylinder, and the four with a
template mirror (all but herringbone) also wrap the Möbius strip and Klein
bottle.

The fifth family, `family="other"`, is **flat-only** and is a grab-bag
rather than a symmetry class — the tilings that answer to none of the other
families, all of them the rep-tile and fractal boards' own tiles laid down periodically
rather than inflated. Two are **rep-tile patterns** — the sphinx
(`sphinxpairs`) and the chair (`tromino`, the L-tromino) — each one congruent
polyform in half-turned pairs: p2, face-transitive, and not edge to edge (a
rep-tile's long side spans several of its neighbours' short ones). The third
is **Dürer's pentagon tiling** (`durer`), regular pentagons in rows with the
36° rhombs that fill the gnomons between them: cmm, edge to edge, and neither
vertex- nor tile-transitive. Because the family claims nothing, its
`_FAMILY_TRAITS` row is all False and each member's own test class
(`TestRepTilePatterns`, `TestDurer`) asserts what actually holds of it.

The two rep-tiles are also the only tilings here with a **grain**: straight
lines no tile of them crosses (every sphinx lies inside a horizontal band √3
tall; the L pair fills its 3 × 2 rectangle and overhangs nothing).
`_ArchTemplate.grain` declares the spacing and `archimedean_board` snaps its
window onto it, so their boards end on a straight edge instead of a row of
tiles kept by half — the L-tromino's on all four sides, the sphinx's top and
bottom, its sides being a staircase because its courses step a unit sideways
as they stack. `TestFlatGrain` measures both halves of that: that no tile
crosses a declared line, and that the board's outline meets the line it ends
on in *one* run rather than a row of teeth. Dürer's needs no grain: its two
mirror directions put a symmetric window inside it instead, which is why its
`centre` is pinned to a rhomb (the one tile it has with a centre at all). The third `_FAMILY_TRAITS` trait, `monohedral`, is what keeps
`test_tiles_are_congruent` off a family holding a tiling with two tile
shapes. The family is
held to the plane by `_FAMILY_SURFACES` (`catalog.py`, mirrored by
`ARCH_FAMILY_SURFACES` in `catalog.ts`), which sets `TilingSpec.surfaces` on
their members: no preset window wraps them yet, and none has chosen the
`cut` a rim or a seam would need. Wrapping them is one `cut` and one preset
row each.

The sixth family, `family="2-uniform"`, is edge-to-edge tilings by regular
polygons with exactly two kinds of vertex. All twenty ship, on the plane, the
**cylinder** and the **torus**, and nineteen on the **Möbius strip** too —
`_FAMILY_SURFACES` holds them to those four, since no Klein window has been
measured for them yet. A donut needs neither a cut nor a mirror, so all twenty
reach it, but most of their domains are too big for an easy one of the
classic size (see the 2-uniform recipe). All twenty reverse y somewhere (every one of their seven groups
has a half turn, if not a mirror), so all twenty get a cylinder; every one
with a horizontal mirror or glide gets a Möbius strip, which is all but the p6
`studdedtri2`. Two wrap in a **layout of their own** (`_ArchTemplate.wrap`,
read through `_wrap_template` / `wrapTemplate`; the flat board keeps the
original): `elongated3` turned a quarter turn, so its rows step one edge
rather than a band of four courses, and the pgg `snubelongated`, which has no
mirror, moved so its horizontal glide sits on y = 0 for the seam to glue
through. The donut takes the wrap layout too, bar three tilings that glue it
in a torus layout of their own (`_ArchTemplate.torus`): `elongated3` flat, and
`elongated2` and `trirhombitrihex` turned. Each has one `cut` for both
open surfaces: five end on a straight line of
edges, and the other fifteen on the flattest zigzag the gaps between their
rows of tile centres allow — among the gaps, in either layout, that give both
surfaces an easy board of about the classic size that plays as a puzzle,
which is what moved nine of the cuts when the strip arrived (a Möbius band
steps a whole domain at a time and must be long for its width; see the
2-uniform recipe in [`board-recipes.md`](board-recipes.md)).
Three are a uniform tiling cut up or merged — 3.4.6.4 with its hexagons fanned
into triangles (3⁶; 3².4.3.4), 3.12.12 with its dodecagons cut into the
3.4.6.4 patch (3².4.3.4; 3.4.6.4), and 3.4.6.4 with one hexagon patch in four
merged into a dodecagon (3.4.6.4; 4.6.12) — and the other seventeen are
written down from one translation cell each (`_cell_template`). Between them
they cover seven wallpaper groups (p6m, p6, p4m, p4g, pmm, cmm and pgg). Five
pairs share both vertex types. The labels are words (fanned, dissected,
elongated, studded … — "label" in the recipe below); the literature's symbol,
with its ₁/₂ subscript for those pairs, is `ArchTiling.notation`, exported to
`data/catalog.json` as `tilingNotations` and shown under the label in the menu.
`_FAMILY_TRAITS` says edge to edge and nothing else, and
`ArchTiling.vertex_types` holds the two configurations `TestTwoUniform` checks
every interior vertex against. See "Recipe: add a 2-uniform tiling" in
[`board-recipes.md`](board-recipes.md).

The seventh family, `family="2-isohedral"`, is those tilings' **duals**,
built by `_dual_template` exactly as the Laves tilings are from the uniform
ones. A 2-uniform tiling has two classes of vertex, so its dual has two
classes of tile, and each tile *is* its primal's vertex type read the other
way: its corners sit at the centres of the regular polygons met at that
vertex, so as many tiles meet at a corner as that polygon has sides, each at
360/n degrees there. A 3⁶ vertex becomes a regular-angled hexagon, a 3³.4²
one the prismatic pentagon. All twenty ship, and they split. Seventeen keep
every tile at 0.87 or better as round as its regular polygon (a 2:1 brick's
figure) and 6.6 to 10 neighbours on average, a hexagon's to a rhombille's;
`TestTwoIsohedral` pins both bounds on them. The duals of the three with
dodecagons (`tritrunctrihex`, `dodecasquare`, `dodecarhombitrihex`) do not,
because a dodecagon's centre becomes a corner twelve slivers meet at — tiles
0.66 to 0.84 as round and 12 to 18 neighbours, triakis triangular's ground.
Two of them still calibrate as puzzles (sparse ones, 5–15% mines);
`dodecasquaredual` is all twins and measures a win rate of zero, so
`data/difficulty.json` blocks it at every difficulty exactly as it blocks the
triakis boards — the menu marks the row and opens an explanation instead of a
game, and the random launchers never deal it. The rows are
not written out: `_with_two_isohedral` derives each from its primal's
(`<key>dual`, `<label> dual`, the primal's `vertex_types`, the Laves V in
front of its `notation`, `dual_of` naming it) and slots the block in after
the 2-uniform one, and the TypeScript registry does the same in
`withTwoIsohedral`. `_FAMILY_TRAITS` says edge to edge and nothing else. The
family is held to the plane (`_FAMILY_SURFACES`): wrapping it is a `cut` and a
preset row per tiling, as for "Other". What "the window shows the tiling"
means is the one place the duality needs saying: `resize.shows_tiling` reads
a dual's `vertex_types` as its two *tiles* (`metrics.tile_types_shown`, the
number of tiles at each corner read round a tile) rather than as two kinds of
vertex.

The eighth family, `family="pentagonal"`, is tilings by **one convex
pentagon**. Fifteen types are known and the list is complete (Rao, 2017); three
ship — type 10 (James, 1975), type 13 (Rice, 1977) and type 15 (Mann, McLoud
and Von Derau, 2015) — because those are the three whose adjacency is not a
board already here and whose tiles stay round enough to number (0.77 or better
of a regular pentagon) with a rectangular period. Nine of the others play
exactly like Cairo, prismatic pentagonal, floret, the hexagonal grid or a
2-isohedral dual; the remaining three are too thin, or have no rectangular
period. Each factory is a table of exact placements of one tile
(`_pentagon_template`): the tile from its angles and sides, each copy mirrored
or not, turned about its corner A and moved. None of the three is edge to
edge — a corner lands in the middle of a neighbour's side, which
`_insert_t_vertices` records as for the isogonal family — so `_FAMILY_TRAITS`
claims only that the family is monohedral, and
`TestArchimedean.test_tiles_are_congruent` checks it, mirror images included.
The family is held to the plane (`_FAMILY_SURFACES`). `TestPentagonal` checks
each tile against its type's defining conditions and proves each board new
(cells told apart by neighbour count and shared neighbours, which an
isomorphism keeps). What the other twelve measured, and what adding one would
take, is "Recipe: add a pentagonal tiling" in
[`board-recipes.md`](board-recipes.md).

The menu's shared
tiling picker is a list of family
submenus: **Regular** (the three regular tilings, plus on the plane the
shaped boards cut from them), **Uniform** (the eight non-regular uniform
tilings, `family="uniform"` in `ARCH_TILINGS`), **Laves** (their
eight duals), **Isogonal**, **Congruent rectangles**, **2-uniform** (the
plane, the cylinder, the Möbius strip and the torus) and, on the plane only,
**2-isohedral**, **Pentagonal**, **Other**, **Aperiodic**,
**Spirals**, **Rep-tiles**, **Fractals** and **Hyperbolic**.
Every family is offered on every surface its members allow:
`picker_families` in `catalog.py` (and its mirror in
`web/src/modes/catalog.ts`) drops a family a surface has no enabled row of
— the one-off flat-only families, "Other", "2-isohedral" and "Pentagonal"
everywhere but the plane, and "2-uniform" everywhere but the plane, the cylinder, the Möbius
strip and the torus — and everything else a surface refuses it refuses one row at a time, in
`family_rows`, on chirality. **Congruent rectangles** was the last gap,
off the torus/Möbius/Klein bottle because the wrap squashed its bricks;
what was really wrong was the measure that picked the windows, which
scored a tile on how *round* it was and so spent the surface's free axis
on squaring the rectangles off — on the stacked bond, whose adjacency is
the square tiling's already, that left a donut with no bricks left to
see. `resize.planar_shape` measures a window against the tiling's own
tile instead, and re-measured that way the same donut keeps them (see
[`difficulty.md`](difficulty.md)). One caveat outlives the fix: the
Möbius immersion draws every board on it stretched 2 to 1 along the loop
(`mobius_half_width` is half the isometric width — every Möbius board in
the game has this, it is not the bonds'), so a 2-to-1 brick lands on the
strip as a 4-to-1 slat, and no window changes that. Three of the five also
leave the flat manifolds altogether and land on a **cube**
(`solids.brick_cube_board`, the `cubestackedbond` / `cubebasketweave` /
`cubebasketweave3` boards under Polyhedra): the stacked bond and the two
weaves are exactly the bonds whose fundamental block is a *square*, so a
square face fills with whole blocks, while the running bond's block is
offset half a brick and the herringbone's is diagonal. A brick cannot run
round a corner — at a corner of the cube the three faces cannot all agree
on which of their two directions the courses run along — so the bond breaks
at the twelve edges, and `_split_at_lattice_points` (the 3D twin of
`_insert_t_vertices`) splices the neighbouring face's cuts into each
boundary brick so the two still share a vertex id. It is not cosmetic:
without it a cube edge belongs to one cell on one side and two on the
other, which reads as a boundary and puts the Euler characteristic below 2.
One rule of the weaves outlives the plane: their quarter-turn centres are
block *corners*, so a face centre is one only when n is even, and at even n
the checkerboard has to be flipped on the three negative faces or the two
halves of the cube meet out of phase — measured, that costs the board all
but 6 of the cube's 48 symmetries. The **brick rings** ride the same builder
(`cubebrickrings`, `brick_cube_board("brickrings", n, …)`) though they are no
bond: n rings fill a 2n x 2n square exactly, so each face is the flat
`brickrings` board whole, rows along the face's cyclic first axis. That puts
one face's row against the other's side at every one of the twelve edges, so
the rings break at all of them, and each face keeping its rings' two mirrors
and half turn leaves the board the pyritohedral 24 of the 48 at every n.

**A window's rim is cut back by its near-twins.** A periodic tiling has no
near-twin in its interior -- no seamless donut of one has any -- but a window's
edge can leave a tile whose closed neighbourhood is a neighbour's less one cell:
the square between two hexagons on a rhombitrihexagonal rim, the outer brick of
a three-brick block lying along the edge, the sliver between two big triangles
on a kisrhombille one. Only that one cell's number tells the pair apart, so a
mine on it makes a mine in the pair a coin flip, and the calibration answered a
rim of them as it did the hyperbolic discs' -- with half the mines the seamless
donut of the same tiling carries. So the cylinder and the Möbius strip pass
their cells through `core._without_near_twins`
(`withoutNearTwins` in `core.ts`), which drops the smaller tile of every such
pair -- or, where that tile cannot come away whole, the bigger -- repeated until
none is left. *Whole* is `_peelable`: the tile meets the rim in one unbroken run
of its own edges and nowhere else, so the board stays a disc or a strip, never
a window with a hole in it or two tiles pinched together at a corner. Both the
relation and that test are ones a window's symmetry preserves, so the trim keeps
it. Exact twins are left alone: the triakis tiling is made of them and peeling
would eat the board, so it stays flagged instead. Where a window's edge pins a
near-twin by a corner the peel cannot reach, the size search pays for the ones
left (`resize.NEAR_TWIN_WEIGHT`) and steps to a window without; and
`tritrunctrihex` moved its cut (to `1 - ROOT3 / 36` of the domain, just below a
row of dodecagon centres) because every strip at the old one pinned two triangles
per gap. `TestRimNearTwins` holds every shipped strip to none.

The **flat** window no longer peels. It keeps every tile that fits its box whole
(see "Board-shape convention" in [`difficulty.md`](difficulty.md)), a corner
octagon that is a near-twin of the square beside it included: a board that is a
whole box of the tiling reads as one, where a peeled one has notches at every
corner, and its mine count is calibrated on it as drawn -- the size search's
density and fairness terms are what price the guesses in.

`ARCH_TILINGS` is
listed in vertex-configuration order — Wikipedia's "List of Euclidean
uniform tilings" order — and that registry order is the menu order.
**To add a tiling or surface, see [`board-recipes.md`](board-recipes.md)** —
a tiling is
one `ARCH_TILINGS` + one `ARCH_PRESETS` row (its family submenu follows
from the `family` field, no menu edit needed), a
surface is one `SurfaceSpec` + an immersion + a wrap builder; the menu,
mode strings, `MODES_3D`, and chirality gating all derive from those
registries. A fifth surface, the **double torus**, is not a wrap of a
rectangle at all -- see the next section -- a sixth, the **trefoil knot**,
is not a new surface at all but the torus drawn a second way (see "The trefoil
knot" below), and a seventh, the **projective plane**, is drawn two ways: as
the sphere that covers it twice (see "The real projective plane"), and as
itself on **Boy's surface** (see "Boy's surface").

## The double torus

One board in the zoo is not a rectangle glued along its seams, and it is the
only one whose Euler characteristic is neither 2 (a solid), 1 (a disc) nor 0
(the four flat manifolds): `doubletorus` and its two siblings are the
**connected sum** of two donuts, genus 2, chi = -2 -- two donuts merged into a
figure of eight. All three regular tilings wrap it (`doubletorus`,
`doubletorustri`, `doubletorushex`), because none of what follows is about the
tiling: a tiling hands over its own lattice and the cut does the rest.

Three decisions make the shape:

* **Where the donuts sit.** A point of one donut's *outer* equator lies on the
  other's *inner* equator, which puts their centres 2 apart whatever the tube
  radius, since (1 + r) + (1 - r) = 2 -- `separation` 1, and the whole
  difference between a merge and a kiss. At 1 the two ring circles are tangent
  at the origin, so the tubes round them share a lens of **real volume**; push
  the donuts out to 1 + `tube_radius` and that lens shrinks to the single point
  the outer rims touch at, which is where the board started and is a pinch
  rather than a merge. Tangent at the *inner* rims instead -- centres
  2(1 - `tube_radius`) apart -- and the two annuli overlap above and below the
  contact point as well, which is a different shape entirely and the sign error
  worth not making twice.
* **Donut B is donut A mirrored in x, key for key.** That is what makes the
  join exact rather than fitted: a vertex of A and the vertex of B it glues to
  already agree in y and z and differ only in the sign of x, so the shared
  vertex goes at x = 0 and nothing is rounded together.
* **What is removed is not a patch anyone chose.** Every cell of A with a
  vertex on B's side of the plane goes, so A keeps the half of itself in
  x <= 0 and B the half in x >= 0. The board is then **embedded by
  construction**, however deep the two overlap: the halves can only meet on the
  plane, and there they are the same vertices. The seam is the ring of vertices
  between the two halves, pulled the last fraction onto x = 0.

`_CUT_EPS` decides what "on the other side" means, and both halves of it earn
their place. A vertex really can land on the plane **exactly** -- at separation
1 the tube's own quarter points do -- and a vertex on the plane is counted as
past it, because left on the kept side it is not a seam vertex (no removed cell
need touch it) and the two donuts' copies of it then sit at one point in space
under two ids. That is a surface touching itself, and since the topology
invariants key on rounded coordinates it reads as chi = 0 where the mesh is
genuinely -2. The tolerance is 1e-6 rather than something smaller so that a
*kept* vertex's two copies still round to distinct keys at the six decimal
places `corner_fans` counts by -- and so that the exactly-zero case is settled
the same way in both ports, whose `cos` may differ in the last bit.

**The cut has to have taken a disc, and on a coarse tiling it need not.** A
window with few cells round the ring can lose a whole course of them and leave
a cylinder, and two cylinders glued rim to rim are a donut again rather than a
double one. So it is measured rather than argued: what is left of one donut
must be a torus minus one disc -- chi = -1 with a single boundary circle --
which is exactly the condition under which gluing the two halves gives chi = -2
and no boundary at all. A window that fails it is refused, and the size search
skips it like any other that will not build. `TestDoubleTorus` measures the
result over a sweep of windows on all three tilings rather than on the shipped
nine, because the cut moves with every argument.

Four consequences worth knowing before touching it:

* **Orientation is read off the cell, not measured.** `_assemble` winds a
  closed surface's faces outward from *the* ring circle; here there are two and
  they are tangent at the origin, so at the waist a face is equidistant from
  both and a measured answer ties. The builder passes an `orient` of its own
  that reads the donut off the cell id. That the two rules agree across the
  seam is measured rather than assumed -- every edge of the board is traversed
  once in each direction, which is orientability.
* **The join has to stay narrower than the donuts it joins.** Nothing else in
  the difficulty search can see how much of them the merge ate: the topology is
  genus 2 either way, and cell distortion scores each tile's own shape and
  finds a broad flat waist perfectly well-proportioned. Left to itself the
  search spent the tube radius on rounder cells and the square easy board
  shipped with a join the full width of a donut -- one blob with two holes.
  `resize.MAX_WAIST` is that bar, three quarters, and unlike the facet step it
  does **not** give way to the size band: below the sizes where a merge is
  possible at all the best join available is 100% wide, so a bar that yields
  hands back the blob it exists to forbid. What it costs is three exempt easy
  rows, listed with their arithmetic in `tests/test_presets.py`.
* **The seam can straighten a corner, and the shape palette has to be told.**
  Pulling a run of vertices onto the plane can leave three corners of a cell
  exactly collinear -- where two tube rows share a z, which is the rows either
  side of the tube's top on an even tube. `corners`' geometric fallback then
  measures that square as a triangle and paints it red on a board of nothing
  but squares, so the builder carries a `cornerMask` saying what is true of
  every cell: every vertex a real corner.
* **It has no translation at all**, and it pays for its genus in cells. The cut
  pins the lattice, so neither the ring step nor the tube step survives and
  there is nothing to scroll; what is left is the figure of eight's own point
  group, the half turn about z that swaps the two donuts and the two mirrors
  that fix each -- and which of those survive is measured per tiling, so the
  hexagonal board keeps fewer than the other two. And on the square lattice a
  closed board needs eight cells each way (`resize.MIN_WRAP_CELLS`, measured on
  this board: 8x6 is 80 cells, bang on the easy target, with a join only 71%
  wide, and tops out at a 92.0% win rate against a target of 96.5%).

## The trefoil knot

`trefoil`, `trefoiltri` and `trefoilhex` are the donut's three lattices, glued
exactly as the donut glues them, on a tube round a trefoil -- the (2,3) torus
knot, scaled into the unit ball. Topologically nothing is new: chi = 0, no
boundary, and the adjacency is the donut's **cell for cell** (`TestTrefoil`
asserts it against the torus builder with the same window), so every symmetry
the donut offers survives, and the ring roll is the one that matters -- it
slides the cells hidden where the knot crosses itself out into view. Only the
immersion is new, and three things about it were worth deciding:

* **The frame.** A tube round a curve needs a normal that comes back to itself
  after one loop, or the seam glues with a twist. The knot lies on a torus, and
  that torus's normal is perpendicular to the knot's tangent everywhere, so it
  is the frame: closed-form, periodic, never degenerate. A rotation-minimising
  frame would twist less but needs numerical integration and a holonomy fix
  matched in both ports; the price here is that rows shear gently where the
  inner strands turn, which reads fine.
* **The reach.** `TREFOIL_REACH` (0.2772) is the thickest tube the knot carries
  before it touches itself, measured: half the closest approach of two points
  far apart along it (a doubly critical pair). The bend is not the binding
  limit -- its radius never drops below 0.477 -- so the tube is capped where the
  strands meet at the crossings. The builders take the tube as a *fraction* of
  the reach and refuse 1 or more, and that cap is what sets the board's
  proportions: even at the reach the knot is about six tube circumferences
  long, where a donut's ring is two.
* **The chords.** A face is flat, so it lies in the hull of its corners, and
  every point of it is within `radius + sag` of the stretch of knot it spans
  (`_trefoil_sag`). Two stretches far apart along the knot are never closer
  than twice the reach, so while that sum stays under the reach no two faces of
  distant cells can meet. The builder refuses any window that breaks it -- a
  handful of triangles along the knot each span a third of it, and was the size
  search's first answer for the easy board. `TestTrefoil` checks the shipped
  boards directly: every probe of every face is nearest its own cell's stretch
  of knot.

The donut's rule for which way is out measures from the ring circle through the
origin, which on a knot points every which way, so the builders pass an
`orient` that measures each vertex against the knot at its *own* t -- a face
across the seam is never averaged through the middle of the knot.

What the knot costs is the easy board. Round the tube a square board is the
donut's graph, so the donut's measured floor of eight cells (`MIN_WRAP_CELLS`)
is the knot's own; along it the chords need sixteen slats even at the thinnest
tube the size search offers. So easy is 128 squares (or 144 triangles), not 81,
and both rows are listed with that arithmetic in `tests/test_presets.py`.

## The real projective plane

`projective`, `projectivetri` and `projectivehex` are the sphere with every point glued to
its antipode: closed, chi = 1, and non-orientable -- with the Klein bottle, the
only closed one-sided surface in the zoo. It has no embedding in 3-space and its
immersions (Boy's surface, the cross-cap) pass through themselves far worse
than the bottle's neck, so these three are not immersed at all (`boy` is: see
"Boy's surface" below). They are drawn as the **sphere that double-covers
it**, every cell twice:

* **`Board3D.faces`** maps each drawn face to the cell it shows. `polygons` is
  keyed by face (the whole sphere, wound outward and back-face culled like any
  solid) and `adjacency` by cell, so the game runs on the antipodal *pairs*.
  A cell is named after the lesser of its two faces. Both front-ends start
  their face -> cell map (`GameSession.remap`, pygame's `_remap`) from it, so
  every visual change a cell takes lands on both faces -- what is opened or
  flagged on one side shows on the other, diametrically opposite. Where an
  effect wants one place (a blast, the reveal ripple's origin) the session picks
  the twin nearest the face the player last touched.
* **Adjacency is still shared-vertex, and still exact.** The antipodal map on
  vertex keys is exact -- a geodesic vertex key is barycentric weights over
  icosahedron corners, and a corner's antipode is found by negating (0, +-1,
  +-phi), which floats do exactly -- so vertex *classes* are keys too, and two
  cells neighbour when any of their faces share a vertex. Nothing is rounded.
* **It changes nothing locally.** The antipode moves every point half the
  sphere away, so no cell meets its own twin and no two of a cell's neighbours
  are each other's twins: every cell keeps one neighbour per sphere neighbour
  (`TestProjectivePlane` checks it on a sweep of frequencies, not just the
  shipped three).
* **Half the sphere's defects.** A closed surface of hexagons needs 6 * chi
  pentagons, so the Goldberg sphere's twelve come down to six; likewise the
  geodesic sphere's twelve degree-5 vertices, and a surface of squares needs
  4 * chi corners where only three meet, so the cube's eight come down to four.
  Cell counts are 3 n^2 squares, 10 f^2 triangles and 5 f^2 + 1 hexagons --
  f = 4 gives exactly 81.
* **The squares are a cube drawn round.** Their keys are the cube's integer
  lattice points (as `cube_board`'s), so the antipode is negation, and each is
  placed by the equiangular cube map -- every coordinate through
  tan(pi/4 * c) before it is put on the sphere -- which keeps the squares
  near the cube's corners from shrinking the way a straight projection does,
  so all three tilings are drawn as the same ball.
* **The topology helpers count the board, not the drawing**
  (`covering_sheets` / `coveringSheets`): a k-sheeted drawing has k times the
  board's V, E, F and chi, so they divide by it, and the conformance oracle's
  cell count is the adjacency's. That is how the surface's `euler: 1` is
  checked rather than the sphere's 2.
* **Symmetries come from the sphere.** Every rotation and reflection about the
  centre commutes with the antipodal map, so the solid's measured point group
  carries down to the pairs (`projective` in `surfaces.ts`); the central
  inversion itself becomes the identity, and a mirror and the half turn about
  its normal become one motion, which `keepSymmetries` drops.

## Boy's surface

`boy` is `projective`'s square board **cell for cell** -- the same cubed
sphere with antipodes glued, the same vertex classes, the same ids and
adjacency (`TestBoySurface` checks it on a sweep of sizes) -- drawn once, on an
immersion of the projective plane. It is the trefoil's trick applied to the
projective plane: no new topology, a new drawing.

* **The immersion is Bryant and Kusner's** (`_boy_point` / `boyPoint`), the
  one that bends least (it minimises the Willmore energy). It is a map from
  the sphere, read through stereographic projection, that sends a point and
  its antipode to the same place -- so a vertex class is placed by either of
  its keys, and nothing about the quotient has to be redone. It passes through
  itself along one curve, three loops meeting at a triple point, and has no
  pinch or crease: the test measures it conformal everywhere, the two tangent
  stretches equal and nonzero. One-sided, so it is drawn two-sided, as the
  Klein bottle is.
* **The cube's diagonal goes on the axis** (`_diagonal_up`). The immersion has
  a three-fold axis (z), and the cube has one along (1, 1, 1); lined up, the
  cube's turn is the surface's own, which a test checks vertex for vertex. Of
  the orientations measured it also gives the most even cells.
* **The cells keep their shape, not their size.** Conformal means a square
  stays a square -- the distortion bars pass with room (worst p90 shape 0.21,
  at easy) -- but the magnification runs round the axis, lobes against gaps:
  at medium the largest cell is 30 times the smallest (p90/p10 7.7), against
  the Klein bottle's 13 (4.7). What was tried and dropped: spinning the cube
  about the axis (at most a fifth better), inverting the surface in a sphere
  on its axis (conformal too, and worse), a radial warp of the sphere (the
  spread is round the axis, not along it), and flowing the sphere's points
  towards the magnified regions (cells lose their right angles long before
  their sizes even out).
* **Centred by a measured constant.** `BOY_CENTRE` is the point of the axis
  nearest to the surface's farthest point (the raw surface runs from its pole
  at z = -2 to z = 0.44), and the tests re-measure it. The view tilt (-1.6)
  stands the axis nearly upright, where the funnel spirals in beside the
  lobes; down the axis the three lobes hide everything else.
* **Symmetries are the projective plane's.** The board is the same graph, so
  it offers the same motions: the sphere's point group carried down to the
  pairs. On this drawing only the three-fold turn is a motion you can see; the
  rest move the contents across the surface, which is how a cell tucked under
  a lobe is brought out. Both pairs stay on the board's row with the extra
  controls switched off, as the Klein bottle's ring pair does
  (`keepWhen` in `data/ui/screens.json`). A step of one cell is not among
  them, and cannot be on any board of the projective plane: every
  self-map of it has a fixed point (Lefschetz), so every symmetry is a turn
  about some point, and cells across the surface from it move far. Measured
  on the board itself, its 24 automorphisms move some cell at least 4 steps
  at n = 5, where the board is 5 across.
* **Marked, and never dealt at random.** The `SurfaceSpec` declares a
  `caution` -- it passes through itself, so some cells hide behind others --
  which the web app puts on the menu row, the caption and the info window, and
  which keeps the board out of every random pool at every difficulty.
* **Sizes and mines are measured, not copied.** The size search lands on
  projective's windows (n = 5, 9, 13). The calibration plays the same graph
  under a seed of its own name, so the mine counts came out within its noise
  rather than equal: 12 / 57 / 136 against projective's 15 / 57 / 138.

## The aperiodic boards

**Four of them are a family of boards rather than one board.** Both Penrose
boards, Ammann–Beenker and the Spectre are built by *substitution*, so the
tiling repeats nowhere and each builder grows far more of a patch than a board
keeps — the Penrose wheel is 430 rhombi where the easy board is 81, the
Ammann–Beenker star 7784 tiles and the Spectre cluster 4401 where the hard board
is 480. The `variant` argument (`aperiodic._window`, ported to
`windowRows` in `web/src/boards/aperiodic.ts`, shared by all four) picks *which* window onto that
patch the board is: 0 is the centred trim this game shipped with, and any other
integer a block of the same size somewhere else in the same tiling, so a
finished game followed by another is played on tiles that have never sat
together before. Both front-ends pass the game's own seed, which means a re-deal
is a new patch and a share link — the seed is in it — reopens the one it names.

**Which windows a difficulty may deal is measured, not taken.** The mine count
is fitted to the centred window and does not carry across by itself: measured
over 800 games a window, the 81-cell Penrose board runs from a 0.76 win rate to
0.98 across windows (its centred one is 0.93) and the 480-cell one from 0.25 to
0.66 against a 0.51 target. `scripts/difficulty/windows.py` plays every
candidate at the preset's own mine count and keeps those within the
calibration's tolerance of the centred window's rate — 13 to 79 of 96 per board
— and the kept list is `data/windows.json`. `presets.window_for` (ported to
`windowFor` in `web/src/modes/presets.ts`) is what turns a game seed into one
of them, and the centred window is always first in the list. See
[`difficulty.md`](difficulty.md).

The window is *picked*, not sampled, and that is what keeps the two
implementations identical: `variant` indexes a pool of candidate centre tiles,
built the same way in both languages, rather than driving a random stream
neither can share. A centre must sit at least `√keep / 2 · 0.75` tiles in from
the patch rim (breadth-first distance from every cell carrying an unshared
edge), and the window it produces is accepted only if it is a board to look at
as well as to play:

- a **disc** — connected, Euler characteristic 1 — because a window sliding off
  the ragged rim of the Spectre's cluster comes back as two or three islands;
- and **not bitten into**. A window is the `keep` tiles *nearest* its centre, so
  where its square runs past the end of the patch there is nothing to fill it
  with and the board is drawn square with a chunk missing out of one side. How
  deep that bite is, is how far inside the window's square the patch's own rim
  reaches, and `_WINDOW_NOTCH` bounds it at 1.5 tiles — calibrated by eye
  against a contact sheet of Spectre windows ordered by that measure, where up
  to about 1.5 tiles is the ordinary raggedness a monotile rim has anyway and
  past 2 there is a notch you look at rather than through. Penrose's patch is a
  convex decagon and barely ever trips it; the Spectre's ragged cluster is what
  it is for. The centred window is exempt, being the board the game shipped and
  the one the mine count was fitted to — the Spectre's hard board measures 2.0
  tiles by this and stays as it is, so the bound is a standard the other
  windows are held *below* rather than to. `data/conformance.json`
pins a few *seeds* per mode × difficulty on top of the usual centred rows — the
whole path a deal takes, the shared window list included — so a window landing
on a different tile in one language fails CI rather than quietly dealing a
different board.

The others take no variant, deliberately: the phyllotactic spiral,
Klaassen's two spirals and the brick rings are nonperiodic by *symmetry*, so each has
one distinguished centre (the rosette, the seed, the 2×2 core) and a
window anywhere else would be a crop of a structured picture rather than another
board.

Five of the aperiodic boards keep exact vertex ids in a cyclotomic ring:
ℤ[ζ5] (both Penrose boards and the phyllotactic spiral), ℤ[ζ7] (Klaassen's
spiral), ℤ[ζ8] (Ammann–Beenker) and ℤ[ζ12] (Spectre). Only ℤ[ζ5] is discrete — ℤ[ζ12]
is dense in the plane, so `spectre_board` cannot snap a float vertex back
to a lattice the way the game's original third aperiodic board, The Hat
(since removed as a menu entry), did — and instead carries every
placement of the paper's chiral
substitution as an exact `(rotation mod 12, mirror, translation)` triple.
Its tile is Tile(1,1) held as an equilateral **14-gon**: the 14th corner
is the collinear one, kept so a neighbour's corner landing there is a
shared vertex id, dropped again by `shapeMetrics`/`corners` so the tile
measures as the 13-gon it is drawn as.
`kitedart_board` is Penrose's **kites and darts** (P2), in the same ring and
from the same two Robinson triangles as the rhombi — the acute 36-72-72 and
the obtuse 108-36-36 — paired along a **leg** instead of the base: two acute
halves make a kite (72, 72, 72, 144), two obtuse halves a dart (72, 36, 216,
36). Each half carries which leg is its axis, as `(color, apex, side, axis)`.
The substitution is its own, not the rhombi's: a half-kite becomes a whole kite
and a half-dart lying along its long edge, a half-dart a half-kite and a
half-dart, at points 1/φ and 1/φ² along an edge — still only addition and
division by φ, so the ids stay exact. The seed is the five-kite **sun**; the
centre alternates sun, star, sun under deflation, and every preset deflates an
even number of times, so each centred board is laid round the sun. Pairing the
rhombi's own triangles along a leg is the trap: it pairs up almost perfectly
and is not this tiling (the darts come out φ times the size of the kites, and
the rarer tile, where kites outnumber darts by φ). `TestKiteDart` pins the
shapes, the ratio and the seven vertex figures — sun, star, ace, deuce, jack,
queen and king, and no others — which is what fails first when a substitution
is wrong. The dart is concave but star-shaped about its vertex mean, so it is
cut by the ordinary path; its vertex mean is a poor place for a **number**,
though, a tenth of the way down the axis from the reflex corner with a quarter
of the room the tile has, so the builder declares **glyph anchors**
(`glyph_anchors` on the Python `Board`, `glyphAnchor` on the TypeScript one):
each tile's number sits in the biggest circle it holds, 1/φ down a kite's axis
from its tip (its incircle) and 1/(1 + sin 36°) down a dart's (the circle that
touches both long edges and the reflex corner).
`ammann_beenker_board` fills the eight-fold gap: unit squares and unit 45°
rhombi, grown from the eight-rhombus star (the tiling's one eight-fold vertex,
so the patch has the octagon's full D8 symmetry about the centred window) by the
substitution that inflates by the **silver ratio** δ = 1 + √2. Every edge is one
of the eight unit directions ζᵏ, ζ = e^{iπ/4}, and δ is in ℤ[ζ8] (√2 = ζ − ζ³),
so inflation is integer arithmetic and the placements are exact
`(rotation mod 8, mirror, translation)` triples as the Spectre's are. An
inflated edge is one unit edge plus one square's diagonal, so the squares along
a supertile's rim are cut in half by it: the substitution runs on rhombi and
**marked half-squares** (rhombus → 3 rhombi + 4 halves, half → 2 + 3), and the
halves pair back into squares across their marked diagonal at the end, the rim's
unpaired ones dropped — Penrose's Robinson-triangle bargain. The marking is the
square's one mirror diagonal (its inflation is symmetric about it and nothing
else); the rhombus's rule is symmetric under all four of its own symmetries, so
it needs none. The rule table was read off the **cut-and-project** tiling, not
drawn, and `TestAmmannBeenker` checks the board against that definition
independently: every vertex's coefficient tuple is a point of ℤ⁴ whose image
under ζ ↦ ζ³ lies inside the regular octagon of edge 1, and every lattice point
whose image does is a vertex. The medium board keeps 280 tiles rather than 256:
the 256 nearest the centre leave ten rhombi at the square's corners whose
distinguishing neighbours lie just outside it — twins no number can separate —
and 280 is the nearest count in the size band with none (see `difficulty.md`).
The third, `phyllotaxis_board`, is nonperiodic by **symmetry** rather than
by substitution: one equilateral convex hexagon (angles 72°/144°) in a
five-fold spiral — the sunflower-head look of a Voronoi tessellation of a
phyllotactic spiral, but built exactly from one congruent tile rather than
sampled from spiral points. The rosette of five tiles at the centre forces
every tile after it, and a tiling with a five-fold centre can have no
translation at all. It needs no deflation — the hexagon is a
parallelohexagon, so each of ten 36° wedges is a plain block of its own
translation lattice, and the odd wedges being pushed one edge out along
`u1` is the entire spiral.
`klaassen_board` is Bernhard Klaassen's **spiral monotile** ("Forcing
nonperiodic tilings with one tile using a seed", 2022), recovered from the
published figure and checked against every tile of it. The tile is an
equilateral **heptagon** whose seven edges run along the seven 7th roots of
unity, each exactly once, in the order ζ⁰ ζ¹ ζ² ζ⁶ ζ⁵ ζ⁴ ζ³: a mirror-symmetric
bent chevron with angles π/7, 9π/7, 9π/7, π/7, 5π/7, 5π/7, 5π/7. (The white
lines in the figure are each tile's internal segment from its second reflex
corner to the middle 5π/7 corner, splitting it into a pentagon and a triangle;
they are not cell edges.) The whole tiling is **one spiral arm**. Tiles' needle
tips meet four to a *hub*, and the hubs form a single chain of unit steps
`e(d_k)` (`e(n)` = exp(i·n·π/7)); a hub where the chain turns by `t` ∈ {0, 1, 2}
fans `t + 2` tiles outward, and those tiles' outer tips *are* the chain's next
winding — so the turns obey the substitution `t → 1ᵗ0`, every winding is 14
steps longer than the last, and the spiral is Archimedean. The seed is the hub
where the chain turns back on itself (a half turn), which fans out nine tiles.
Every vertex is a sum of unit directions, so the ids are exact 6-tuples over
(1, ζ, …, ζ⁵) with no multiplication at all, and the tiling is edge to edge.
Its trim differs from the other `keep` boards: a plain Chebyshev cut leaves
chevrons hanging off the rim by one edge, so tiles are taken in Chebyshev order
but join only once they share two edges with those already kept, and the board
comes out as the spiral's own round disc rather than a square. Its tile is the
one cell in the game with **no point that sees all of it** (not star-shaped), so
the renderer cuts it differently from every other cell — see
[`web/docs/render.md`](../../web/docs/render.md).

`pentaspiral_board` is the zoo's **monohedral pentagonal** tiling, in three
boards: `pentaspiral5`, `pentaspiral6` and `pentaspiral7`, one convex pentagon
tiling the plane with n-fold rotational symmetry (Klaassen, "Rotationally
symmetric tilings with convex pentagons and hexagons", *Elem. Math.* 71, 2016).
His pentagons have |b| = |c| = |a| + |d| and D + E = 180°, and B = 360°/n gives
an n-fold tiling. The member built is the one Wikimedia's 5-fold figure draws,
matched against all 120 of its tiles, taken to every n alike: A = C = 180° −
180°/n, sides b = c = 3, a = 1, d = 2. Two copies glued along e by a half turn
make the phyllotactic spiral's hexagon at n-fold (the zonogon on three unit
directions 180°/n apart), scaled by 3. So the construction is the phyllotactic
spiral's run at n-fold: 2n wedges, the odd ones pushed out a side, and every
hexagon cut the same way, from a third of the way along its u1 side to the point
opposite. Cutting alternate wedges the other way also tiles, but it is not that
picture, and `TestPentaSpiral` pins the choice. The ids reuse three rings the
module already has: ℤ[ζ10] for n = 5, ℤ[ζ12] for n = 6 and ℤ[ζ7] (as ℤ[ζ14]) for
n = 7. Every vertex is a sum of unit directions, which is componentwise in all
three, so one pair of helpers serves them all. The tiling is **not edge to
edge**: a cut ends a third of the way along a neighbour's edge, so each run of
unit steps is split conditionally at the points that are some tile's corner, as
the brick rings' are. It takes the same quantised Chebyshev trim as the
phyllotactic spiral. A corner of that square window can leave a rim pentagon
touching the board along one edge only: the 6-fold easy board has two such
cells, which is why its test asks for a disc rather than a minimum degree.

The last, `brick_rings_board`, is nonperiodic by symmetry as well, and is
the plainest board in the game: 2×1 **bricks** on the integer square lattice
in concentric square **rings** about a 2×2 core. Ring `k` is the boundary of
the 2`k`×2`k` square about the origin — `k` horizontal bricks along its top
row and `k` along its bottom, then `k` − 1 vertical ones up each side, so
4`k` − 2 bricks a ring. Every run is even (a row is 2`k` cells, a side
2`k` − 2), which is what makes **every** tile a whole brick at every size:
there is no odd cell to special-case and no 1×1 anywhere. `rings` rings fill
the 2`rings`×2`rings` square exactly, so the size knob is the ring count
alone and the cell count is `2·rings²`. Only an *even* side can be tiled by
bricks at all — an odd-sided square has odd area — which is why the knob
counts rings rather than cells across. It carries the square's two **mirrors**
and their composition the half turn, but not the quarter turn: a ring's rows
are horizontal bricks where its sides are vertical ones, so a quarter turn
lays bricks across bricks. And no translation, which is the property that puts
it in this module. It has no `keep` trim, so it has no Chebyshev
distance to quantise and no sort whose tie-break has to be reproduced in the
TypeScript port; the family's usual porting hazard does not apply. What does
need care is the **T-vertices**: a brick's corner routinely lands in the
middle of a neighbour's long side, and `_brick_outline` splits each
axis-aligned edge at the lattice points that are genuinely some tile's corner
(the 2D twin of `solids._split_at_lattice_points`). That test is
*conditional*, unlike the chair's outline, which carries a vertex at every
lattice step: emitting them unconditionally here would split an edge whose
neighbour across it keeps its own edge whole, the two would stop matching, and
the half-edges would count as boundary and drop the Euler characteristic below
the 1 a disc must have. Its size search needs no `rigid` flag and no shape
term: the board is a square, so the flat aspect penalty is `log 1` = 0 for
every candidate and the size penalty decides alone — which at hard is an exact
tie (512/480 and 450/480 are reciprocals), broken towards the larger board.

## The hyperbolic boards

The game's namesake. `hyperbolic.py` (ported to `web/src/boards/hyperbolic.ts`)
builds the regular **{p,q}** tilings -- q regular p-gons round every corner --
for which (p - 2)(q - 2) > 4, so the angles do not close up in the plane and the
tiling lives in the hyperbolic plane instead. Eleven ship, as the flat-only
**Hyperbolic** family: `hyperbolic93` ({9,3} nonagons), `hyperbolic83` ({8,3}
octagons), `hyperbolic73` ({7,3} heptagons), `hyperbolic74` ({7,4} heptagons),
`hyperbolic64` ({6,4} hexagons), `hyperbolic54` ({5,4} pentagons),
`hyperbolic55` ({5,5} pentagons), `hyperbolic45` ({4,5} squares),
`hyperbolic46` ({4,6} squares), `hyperbolic37` ({3,7} triangles) and
`hyperbolic38` ({3,8} triangles). An interior cell has p + p(q - 3) = p(q - 2)
neighbours under the shared-vertex rule -- **7, 8, 9, 10, 12, 14, 15, 16 and
18**, counts nothing else in the game has for its tile (a {3,7} triangle's 15
against a flat triangle's 12). {4,7} and {3,9} build too, at 20 and 21, and
were tried and dropped: that many neighbours is too hard to read to play.
The boards are drawn in the
**Poincaré disc**, a deliberate round exception to the square-window convention
like the fractals and Klaassen's spiral.
Twenty-two more are **uniform** rather than regular -- every corner alike, more
than one tile -- and come off the same ring walk, on {7,3}, {8,3}, {5,4},
{6,4}, {5,5} and {9,3}; see "The uniform hyperbolic boards" below. One more is drawn in the upper half-plane rather than the disc,
as a rectangle: Böröczky's binary tiling (see "The binary tiling" below).
And six -- `bolza`, `quartic`, `dyck`, `bring`, `macbeath`, `triplet` -- are
drawn in the disc but are not discs at all: the hyperbolic plane glued up into closed surfaces,
with no rim; see "The closed hyperbolic surfaces".

**The ids are combinatorial, never geometric.** The tiling is built ring by
ring: ring 0 is the central p-gon (vertices 0 .. p-1), and each new ring is
every face touching the boundary so far, laid down in one counterclockwise walk
of that boundary. A boundary vertex still needs `d = q - faces(v)` faces; every
boundary edge gets exactly one new face outside it; where `d == 1` the faces
outside a vertex's two edges are the same face (which therefore runs along
several boundary edges); where `d >= 2` they are separated by `d - 1` outward
*spokes* and the `d - 2` faces that touch the boundary at that vertex alone.
Every vertex a face needs that is not on the boundary is the next integer. Ring
sizes are 9, 45, 216, 1035 for {9,3}, 8, 32, 120, 448 for {8,3}, 7, 21, 56,
147 for {7,3}, 14, 112, 882, 6944 for {7,4}, 12, 72, 420, 2448 for {6,4}, 10,
40, 150, 560 for {5,4}, 15, 105, 720, 4935 for {5,5}, 12, 48, 180, 672 for
{4,5} and 16, 96, 560, 3264 for {4,6}, which `TestHyperbolic`
checks against an independent float
construction (reflecting polygons across their edges) that shares no code with
the builder.

**The triangle tilings are duals.** The walk cannot lay a triangle: a run
between two anchors is at least one edge, a face along it needs `p >= run + 2`
corners, and a triangle could only close a run onto a single new vertex, which
the walk refuses rather than gets wrong. So {3,q} is built as the dual of
{q,3} (`_dual_faces` / `dualFaces`): every {q,3} vertex with all three of its
faces is a triangle whose corners *are* those three faces, the faces' integer
indices serving as its vertex ids -- the dual numbers nothing of its own --
ordered counterclockwise by the edges the faces share. Its ring is the newest
of the three faces' rings less one, so `rings + 1` rings of {q,3} finish every
triangle out to `rings`. The dual of a face-centred {q,3} is centred on a
**vertex**: ring 0 is the q triangles round vertex 0 (7, 28, 77, 203 for
{3,7}, 8, 40, 152, 568 for {3,8}), and a trim keeps that vertex's q turns and q
mirrors rather than a central triangle's 3, which is rounder. Its first
triangle is placed with vertex 0 at the centre of the disc and its next corner
up the vertical axis, which lands every dual vertex exactly on the centre of
the {q,3} face it stands for -- the test that checks the dual holds it to that.

**Positions come afterwards, from the ids.** The central polygon is placed by
hand (circumradius R with cosh R = cot(pi/p) cot(pi/q), Euclidean radius
tanh(R/2) in the disc, one edge horizontal so every trim is mirror-symmetric
about the vertical). Every other face has an edge whose two ends are already
placed, and the unique orientation-preserving disc isometry -- a Möbius map --
taking the central polygon's matching edge onto it places the rest. A vertex
keeps the first position it is given; the test re-derives every vertex from
every face holding it.

**Edges are geodesic arcs.** Each edge is drawn through `ARC_SEGMENTS - 1`
points along the circle it really is in the disc, with ids built from the edge's
two end ids (lower first) and positions computed once per edge, so both faces
share them exactly. Those points are not corners -- and, unlike a T-vertex, not
collinear either -- so the board carries a **`corner_mask`** (`cornerMask` on
the TypeScript flat `Board`, the flat twin of `Board3D.cornerMask`), which shape
colouring, the glyph placement and the info window read. A central polygon's
sides bow *inward* (a geodesic not through the centre bends toward it), which is
the Escher *Circle Limit* look, and why the glyph room is measured on the drawn
outline rather than the corners' chords.

**The trim is a finer ring count: hyperbolic-distance shells.** Whole rings grow
by about 2.6x ({7,3}) to 7x ({5,5}) a ring, which hits three of the nine
size slots. `shells` keeps the faces whose centres lie at the `shells` smallest
distances from the centre of the disc; faces at the same distance are one orbit
of the central polygon's dihedral group and are kept or dropped together, so
every trim keeps all p rotations and p mirrors (the web app finds D9, D8, D7,
D6, D5 and D4), or on {3,q} the central vertex's q (D7 and D8).
The distance is a float, but it only *orders* faces -- it never forms an id --
and equal distances are grouped within 1e-7 where distinct ones measure at least
1e-5 apart, which the tests pin. The trim is never by Euclidean area or radius:
a rim cell is tiny in the disc by nature, and a Euclidean cut would take a
ragged sliver of them. The builder refuses a trim that is not a disc (a rim
pinched at a vertex), though none of the nine tilings has produced one at a
shipped trim (a {3,q} trim to its bare central star is all twins, and so
empty: the size search never lands there).

**The walk grows just the rings the trim needs, and that is a bound, not a
margin** (`_rings_for` / `ringsFor`). A face not yet built lies outside the
outline of the faces that are, and its centre lies at least its inradius in
from its own sides; so once the outline's nearest point (`_reach`: the least
distance from the centre to any edge only one built face has, each a geodesic
segment measured exactly on the hyperboloid) plus the inradius is past the
`shells`-th distance, nothing missing can belong to the trim. Growth stops at
the first ring where that holds. It used to stop a whole unit of distance past
the cut, and since each ring multiplies the faces, that spare ring was most of
the build: the hard {6,4} board's 475 cells were cut from 100381 faces (6
rings) where 2953 (4) hold them, and opening it took a second. The boards are
the same faces either way; `TestHyperbolic` and `hyperbolic.test.ts` grow one
ring further and find nothing nearer that was missed.

**Then the trim drops its twins.** Where q is large, a shell can leave a rim
vertex with a fan of two or more outer faces that touch the board at that
vertex alone; each of them sees exactly the faces round that vertex, so they
share one closed neighbourhood and no number can ever tell them apart. On
{5,5} and {4,6} nearly every trim has such fans, and {6,4} has no twin-free
trim at hard. So the builder drops every cell that shares its closed
neighbourhood with another (`_without_twins` / `withoutTwins`) -- the whole
class, never all but one, which keeps the dihedral symmetry, since a symmetry
maps twins to twins.

**And its near-twins.** The same fans leave rim pairs one cell short of
twins: a cell whose closed neighbourhood is a neighbour's less a single cell.
Only that cell's number tells the two apart, so whenever it is a mine a mine in
the pair is a coin flip -- and `indistinguishable_cells` cannot see it, since
the neighbourhoods do differ. {5,5} hard had 150 such pairs and {4,5} 88; the
reference solver lost those boards almost only on a last 50/50 at the rim, so
calibration gave them half the mines of {7,3} and nothing to do before the
flip. The builder drops the smaller of every such pair as well, in the same
loop (a drop can uncover new ones), which the symmetry also preserves. {7,3}
never has one and the shipped {8,3} trims have none, so those boards are as
they were; the other five were re-sized and re-calibrated, and roughly doubled
their mines. A trim with neither is untouched, and several neighbouring shell
counts can come out as the same board.

Four things worth knowing before touching them:

* **The rim is most of the board.** A hyperbolic disc's boundary grows as fast as
  its area, so the outer shells hold well over half the cells, and those see
  far fewer than p(q - 2) neighbours: the mean degree is 4.4 ({8,3}) to 6.9
  ({4,6}), about 10 on the triangle tilings, and the calibrated densities
  5-15%.
* **Rim cells are small, and as built on a phone at medium and hard too small
  to tap.** A 370px-wide disc puts the outermost easy cells at about a 6px
  inradius, medium at 2px and hard at 1px; the Euclidean zoom (`MAX_ZOOM` 6)
  helps on a desktop and not much on a phone. What reaches them is
  **hyperbolic panning**: in the TypeScript app a drag moves the disc by a
  Möbius map (a disc isometry), so a cell can be brought towards the centre,
  growing as it comes, and tapped there. The board says which disc it is
  drawn in (`Board.disc`: centre, unit radius, and `rim`, how far out it is
  whole, which bounds the pan); the view and its drag are `web/src/render/disc.ts`,
  and how the renderer applies it is "Hyperbolic panning" in
  [`web/docs/render.md`](../../web/docs/render.md). Nothing about the board
  changes -- ids, adjacency and the data are the board as built -- so the
  pygame game, which does not pan, plays the same boards.
* **One shape, at every size.** Every tile is congruent in the plane it lives in
  and none is drawn congruent, so a flat classifier splits the shrinking shells
  into seven sizes. The board says it is drawn in a curved model (`Board.curved`
  on the TypeScript side), and shape colouring then classes it as it does a
  curved surface: one class per side count.
* **{4,5} medium used to be a near-miss.** Before the trim dropped its twins,
  every {4,5} trim in the medium band left rim cells with an indistinguishable
  twin, and it shipped the nearest fair one at 205 cells (-20%). With the drop
  it is in band like every other row.

## The uniform hyperbolic boards

`hyperbolic_uniform_board(p, q, op, shells, mines, scale)` (and
`hyperbolicUniformBoard`) builds the tilings with a {p,q} tiling's symmetry
that are not {p,q} itself, by **Wythoff's construction**: put a generating
point in one flag triangle -- a face's centre F, one of its corners V and the
midpoint E of an edge at that corner -- and reflect it everywhere. Where it
sits decides the tiling (Conway's names):

| `op` | the point | {7,3} gives | Mode | Inner tile's neighbours |
|---|---|---|---|---|
| `zip` | on FE, as far from FV as from VE | **6.6.7**, the truncated {3,7} | `hyperbolic667` | hexagon 6, heptagon 7 |
| `ambo` | at E | **3.7.3.7**, triheptagonal | `hyperbolic3737` | triangle 6, heptagon 14 |
| `expand` | on FV, as far from FE as from VE | **3.4.7.4**, rhombitriheptagonal | `hyperbolic3474` | triangle 6, square 8, heptagon 14 |
| `bevel` | inside, as far from all three sides | **4.6.14**, truncated triheptagonal | `hyperbolic4614` | square 4, hexagon 6, 14-gon 14 |
| `truncate` | on VE, as far from FV as from FE | **3.14.14**, the truncated {7,3} | `hyperbolic31414` | triangle 3, 14-gon 14 |

(The last place, V, gives {7,3} back.) The mode is `hyperbolic` and the vertex
configuration's digits, smallest first as the notation writes it. An inner
tile's neighbours follow from the configuration: its sides where three tiles
meet (`zip`, `bevel`, `truncate`), twice them where four do (`ambo`,
`expand`).

**The same five places on every shipped family, less what repeats.** Each
regular board's family -- {8,3} with {3,8}, {5,4} with {4,5}, {6,4} with
{4,6}, {5,5}, and {9,3} -- has its own uniform tilings, and twenty-two
ship in all,
filed family by family on the Uniform page:

| Family | `zip` | `truncate` | `ambo` | `expand` | `bevel` |
|---|---|---|---|---|---|
| {7,3} | 6.6.7 | 3.14.14 | 3.7.3.7 | 3.4.7.4 | 4.6.14 |
| {8,3} | 6.6.8 | 3.16.16 | 3.8.3.8 | 3.4.8.4 | 4.6.16 |
| {5,4} | 5.8.8 | 4.10.10 | 4.5.4.5 | 4.4.4.5 | 4.8.10 |
| {6,4} | 6.8.8 | 4.12.12 | 4.6.4.6 | 4.4.4.6 | 4.8.12 |
| {5,5} | 5.10.10 | -- | -- | -- | -- |
| {9,3} | 6.6.9 | -- | -- | -- | -- |

Every one is built on the face-centred {p,q} of the row (p >= q), so its
central face stands on the central p-gon: the p-gon itself, or the 2p-gon of
`bevel` and `truncate`, and every trim keeps D_p. What the table leaves out
repeats. `truncate` on {p,q} is `zip` on its dual {q,p} -- the same tiling,
centred on the other face -- so on {5,4} and {6,4} it centres 4.10.10 and
4.12.12 on a decagon and a dodecagon where the zipped dual would put a small
square. {9,3} so far ships only its `zip`, 6.6.9 -- the soccer ball's
third member, nonagons ringed by hexagons -- since the rest of its row would
add an 18-gon and play as thin as the 3.16.16 row does. {7,4} has no
uniform row yet. On the triangle families it gives 3.14.14 and 3.16.16, whose
triangles are slivers between the big faces and which play as thin boards
(below).
{5,5} is self-dual, so its `ambo` is {5,4} itself (5.5.5.5), its `expand` is
4.5.4.5 and its `bevel` 4.10.10, all already in the {5,4} row; the mode name
is what collapses them, since it is the vertex configuration. The snubs
(3.3.3.3.7 and the rest) are not a Wythoff point at all but an alternation,
and chiral, so none ships yet.

**6.6.7 is the one built for play: HyperRogue's tiling, the hyperbolic soccer
ball.** A hexagon covers far less of the hyperbolic plane than a {7,3}
heptagon, so at the same cell count the disc is smaller and its rim is drawn
bigger -- the smallest tile of the 484-cell hard board covers about 2.4 times
the screen area of the 477-cell {7,3} board's (a test pins "more than twice").
It is trivalent, so a tile's neighbours are just its sides: six for a hexagon,
seven for a heptagon, and a 7 next to a 6 is the thing to read with care.

**The ids stay combinatorial.** A flag is (face, corner, edge) of the {p,q} the
ring walk builds with integer ids, and a new vertex is named by the part of
its flag the point's position does not collapse: (face, edge) for `zip`, the
edge for `ambo`, (face, corner) for `expand`, (corner, the edge's other end)
for `truncate` -- the point is on the edge, so the flags either side of it
meet there -- and the whole flag for `bevel` --
tuples of the walk's integers, then renumbered in the order the faces meet
them. A new face stands on every old face (F), every old vertex with all q
faces round it (V) and every old edge with both of its faces (E), wherever
that orbit does not collapse to fewer than three points. Nothing is rounded.

**So do the positions.** The generating point is solved once, in the central
p-gon's flag triangle, on the hyperboloid, where "as far from line A as from
line B" is a linear condition on the lines' unit normals (one Minkowski cross
product), and every face carries it -- turned to the right corner, mirrored
for the flag on the other side of it -- through the isometry that placed the
face. `TestHyperbolicUniform` checks one edge length throughout, every face
regular and counterclockwise, the configuration at every inner vertex, and
the corner angles round a vertex summing to 2 pi.

**The trim, the twins and the disc are the {p,q} boards' own** (`_disc_board`
is shared): faces kept by the distance of their centre (an old face's centre,
an old vertex, an old edge's midpoint) from the central face, which is the
p-gon (the 2p-gon on `bevel` and `truncate`), so every trim keeps D_p. The
ring walk grows until no face that is missing could reach the cut, as for {p,q}, the inradius
there the smallest of the tiling's shapes. A face's index counts every face of
the {p,q} tiling the walk grew, so a trim built from fewer rings numbers its
cells differently; their order, which is what a seed deals the mines by, is
the same. `ambo` and `zip`
have the same faces at the same centres, and `expand` and `bevel` likewise,
so each pair's shell trims are the same faces before the drop. **The drop is
where they part.** `zip` is trivalent, like {7,3}, and no trim of it has a
twin or a near-twin, so on {7,3} it is the one uniform board the drop never
touches (on {8,3} too; the trivalent `zip`s of {5,4}, {6,4}, {5,5} and {9,3}
do lose rim cells at some trims). The other three meet four at a corner (`ambo`, `expand`) or carry 14-gons
whose rims fan out (`bevel`), and lose rim cells to it at most trims --
`expand` at 39 shells goes from 477 to 421 -- which is what moved their
medium and hard rows out a few shells and roughly doubled the mines on
`expand` and `bevel` medium (13 and 12 before the near-twins went, 21 and 22
after). That also took away the 78-cell easy trim of `expand` and `bevel`,
which played too hard to calibrate (0.91 and 0.88 at the opening floor), so
their easy rows are 85 cells.

**The other tilings size and calibrate like the first four, with exceptions.**
4.6.16's easy row is 65 cells, a near-miss under the band: its trims step
57 -> 65 -> 113, a whole D8 orbit of 16-gons at a time. And two medium trims
the size search preferred had rims of forced guesses, which showed as a
mine count out of line with the board's other two rows; `resize.PINNED_ROWS`
holds them at the trim that plays like its neighbours: 4.8.12 at 247 cells
(14 mines, where 259 took 6) and 4.12.12 at 289 (5 mines, where 253 took 3,
fewer than its easy board's 4). 4.12.12 is a thin board whatever the trim: a
square's four neighbours are all dodecagons and a dodecagon's number covers
twelve cells, so it calibrates to 1.7-5% mines (square-centred, as `zip` on
{4,6} would build it, it is no better -- its easy trims miss the target even
at the opening floor), and one click opens most of the board.

**3.14.14 and 3.16.16 are the same, only more so.** A triangle sees its three
big neighbours and nothing else, so a mine on one is often a coin flip.
3.16.16 is the one uniform board the calibration cannot bring on target at
easy -- no trim in the band reaches it even with a single mine, so the 81-cell
row ships at 1 mine and is flagged `warn` in `data/difficulty.json` -- and at
medium only the 209-cell trim calibrates (3 mines; every other trim from 193
to 305 cells plays at 0.43-0.76 against 0.87), so it is pinned there, 18%
under the band. 3.14.14 calibrates at 1.7-5%, its hard row pinned at 442
cells, where 484 took fewer mines (8) than its medium board (9).

**Two new things for the rest of the app.** A 14-gon is a side count nothing
else has: it has a badge (`SHAPE_SIDES`, `hs.shape.14` in Game Center), shape
colouring and the sound clamp it to the 13-gon's hue and pitch. The 16-gon of
4.6.16 is the same again, with `hs.shape.16`, and so is the 9-gon of {9,3}
and 6.6.9, with `hs.shape.9`. And 6.6.7
puts a hexagon and a heptagon on one board, which one pentatonic degree apart
is a whole tone, so the sound spelling moved the 7-gon and everything above it
down (see "One collection, and a spelling measured against the catalog" in
[`web/docs/audio.md`](../../web/docs/audio.md)).

## The closed hyperbolic surfaces

A hyperbolic disc is mostly rim, and a rim cell sees far fewer than its tile's
neighbours -- which is why the disc boards calibrate to 5-15% mines and why
their twins and near-twins have to be dropped. **Glue the plane up into a
closed surface and the rim is gone**: every cell keeps its full count, as on a
sphere. `hurwitz_board(surface, op, margin, mines, scale)` (`hurwitz.py`,
`hurwitz.ts`) builds closed surfaces on which a regular {p,q} tiling closes up
regularly -- the {7,3} tiling's surfaces of most symmetry, the **Hurwitz
surfaces** (the module is named after them), and three more that are the most
symmetric of their genus for {8,3} or {5,4} -- **one surface a mode**
(`SURFACE_MODES`, from `CLOSED_SURFACES`), in the Hyperbolic page's own
submenu, *Closed surfaces*, in order of genus:

| mode | surface | {p,q} | genus | group | easy | medium | hard |
|---|---|---|---|---|---|---|---|
| `bolza` | the Bolza surface | {8,3} | 2 | GL(2,3), 48 | GC(3,0), 70 cells, 16 mines | GC(6,0), 286, 68 | GC(8,0), 510, 134 |
| `quartic` | Klein's quartic | {7,3} | 3 | PSL(2,7), 168 | 6.6.7, 80 cells, 18 mines | GC(3,0), 248, 61 | GC(4,0), 444, 118 |
| `dyck` | Dyck's surface | {8,3} | 3 | {8,3}_6, 96 | GC(2,0), 60 cells, 10 mines | GC(4,0), 252, 60 | GC(5,0), 396, 107 |
| `bring` | Bring's surface | {5,4} | 4 | S5, 120 | 4.4.4.5, 114 cells, 20 mines | GC(3,0) of squares, 264, 59 | GC(4,0) of squares, 474, 131 |
| `macbeath` | Macbeath's surface | {7,3} | 7 | PSL(2,8), 504 | {7,3}, 72 cells, 15 mines | 6.6.7, 240, 55 | GC(2,0), 324, 93 |
| `triplet` | the first Hurwitz triplet, one of the three | {7,3} | 14 | PSL(2,13), 1092 | {7,3}, 156 cells, 33 mines | 6.6.7, 520, 122 | GC(2,0), 702, 191 |

A genus-g Hurwitz surface carries exactly 12(g - 1) heptagons (its 84(g - 1)
turns, seven to a face), so every tiling of it is one size and no other:
{7,3} 12(g - 1) cells, 6.6.7 40(g - 1), GC(2,0) 54(g - 1), GC(3,0) 124(g - 1),
GC(4,0) 222(g - 1). **A surface grows by its tiling, never by changing the
surface** -- the mode is the surface, the difficulty picks a rung. The quartic
lands in the size band at all three; Macbeath's surface at easy and medium, its
hard 32% short (the next rung, GC(3,0), is 744 -- `EXEMPT_ROWS` in
`tests/test_presets.py`); the triplet at none, since 156 cells is the fewest
genus 14 can carry (`GENUS_BOUND`). The others count the same way from their
own faces (`cell_count` / `cellCount`): the Bolza surface's six octagons make
GC(n,0) 8n^2 - 2 cells, so GC(3,0), GC(6,0) and GC(8,0) land in the band at all
three; Dyck's surface's twelve make it 16n^2 - 4, and with nothing in the hard
band (GC(5,0) is 396, GC(6,0) 572) its hard row is 17.5% short, in
`EXEMPT_ROWS`, and so is its easy GC(2,0) at 60, 26% short. Its 3.4.8.4 is 92
cells, in the band, and played as a different game from the octagons among
hexagons of medium and hard -- a Wythoff tiling of a surface comes in one size,
so it cannot grow with the difficulty -- so all three rows are subdivisions;
Bring's surface's square
subdivision is 30n^2 - 6, 264 and 474 for its medium and hard, and its easy
4.4.4.5, 114 cells, is 41% over (`EXEMPT_ROWS`) -- {5,4} has nothing nearer 81
than that and the 54 of 4.5.4.5. `resize.py` holds every row as declared
(`size=()`): no knob is the search's to turn. With no rim the densities came
out 17-29% -- the projective plane's, a closed surface of about the same
degree, and nothing like the discs'. The builder also takes every Wythoff
operation, and the tests sweep them.

**Why not one mode whose difficulty changes the surface?** That was the first
cut (easy the quartic, medium Macbeath's, hard the triplet), and it played as
three different games: on the quartic every cell was on screen two or three
times over, on the triplet most of the surface was off it. What decides that
is how many copies of the surface the view holds -- the view's area over the
surface's, (cosh v - 1) / (2(g - 1)) for a view of radius v -- and at one
fixed view it is set by the genus alone: 2.3, 0.76, 0.35. Macbeath's 0.76 is
the one that plays: a flag at the view's edge has its twin in sight near the
opposite edge, so the whole surface reads at a glance without a cell shown
twice over. So the view is sized from the genus instead (`cover_view`, below),
every surface at `COVER_COPIES` = 0.75, and the difficulty is the tiling.

**The subdivision, GC(n, 0) (Goldberg--Coxeter).** `gc_loops(p, q, n, rings)`
cuts the dual of any {p,q} with q of 3 or 4. {7,3} is trivalent, so its
dual is a triangle tiling, {3,7}: a triangle for every corner of the heptagons,
its own corners the centres of the three heptagons that meet there (56 of them
on the quartic). Cut every triangle into n x n small ones and take the dual
again: the heptagons come back, one round every heptagon's centre, and every
other point of the cut becomes a hexagon. It is trivalent, so a heptagon has 7
neighbours and a hexagon 6 everywhere, and it keeps the mirrors (GC(a, b) with
b != 0 would not). On a surface of F heptagons, E edges and V corners it is
F + E(n - 1) + V(n - 1)(n - 2)/2 cells -- 108, 248, 444 for n = 2, 3, 4 on the
quartic. The 6.6.7 the easy board plays is GC(1, 1) of the same family, turned.
{8,3} cuts the same way, octagons among hexagons. {5,4} is 4-valent, so its
dual {4,5} is squares: each is cut into an n x n grid, and the dual taken
again is a pentagon round every pentagon and squares everywhere else,
F + E(n - 1) + V(n - 1)^2 cells, every cell still a full count of neighbours.
The ids are exact (`gc_loops` / `gcLoops`): a point of the cut is named by
what it lies inside -- nothing for a face's centre, the edge it crosses (its
two ends) for a point on a side of the dual, the corner of {p,q} for a point
inside a dual triangle or square -- and by its weights over its dual polygon's
corners, the sorted (face, weight) pairs with a weight that is not zero, as
`solids._geodesic` names an icosahedron's points (a square's point (i, j)
weighs its corners bilinearly, (n - i)(n - j), i(n - j), ij, (n - i)j), so a
point on a shared edge gets one name from both dual polygons; a small triangle
or square is named by its points. What it lies inside is the part a Hurwitz
surface never needed: the Bolza surface's six octagons border each other
twice over, and three of them meet at two corners, so the weights alone named
two points one. Positions are only drawn -- a point at the
weighted average of its corners' centres on the hyperboloid, a small triangle
at the average of its points -- and order a cell's corners round it. The
covering map carries a point down by its faces and what it lies inside by its
vertices, and the check that two copies of a cell agree catches a name that
stood for two points.

**Levels that could be added** (not built): on the quartic, the plain {7,3}
(24 cells, heptagons only), GC(2,0) (108), and the chiral GC(2,1) (192),
GC(3,1) (360) and GC(3,2) (528), which lose the mirrors and need a skewed
subdivision; and GC(2,2) (332), which keeps them but is skewed too (class II,
as 6.6.7 is). The same rungs are 16(g - 1) for GC(2,1) and so on, so on
Macbeath's surface GC(2,1) would give 576 cells, in the hard band -- the one
way to bring its hard row in, at the price of the mirrors.

**The surface is read off its group, exactly.** The group of a regular {p,q}
map is generated by an x of order 2 and a y of order q whose product xy has
order p, and the map is the group itself: elements are darts, the cosets of
<xy> faces, of <y> vertices, of <x> edges, a face's corners in <xy> order. Only
how x and y act on the darts is needed (`_darts` / `darts`), and it comes two
ways. A Hurwitz group is PSL(2,q): 2x2 matrices of determinant 1 over GF(q)
with a matrix and its negative counted once; GF(7) and GF(13) are integers mod
p, GF(8) three-bit polynomials mod x^3 + x + 1. The generators are the first
pair met in element order, so both ports find the same map, with the same
numbering. Every other surface is a **presentation**,
<x, y | x^2, y^q, (xy)^p, w>, with w its own relator in `CLOSED_SURFACES`:
(xyxY)^3 for Dyck's {8,3}_6 and Bring's {5,4}_6 (Y = y^-1, and xyxY is a
Petrie polygon's two steps), and (xyxyxY)^2 for the Bolza surface, whose
Petrie polygons are 12 long and whose group, GL(2,3), {8,3}_12 alone does not
pin. `todd_coxeter` / `toddCoxeter` enumerates the cosets of the trivial
subgroup (Haselgrove--Leech--Trotter; under 320 rows for all three) and
renumbers them breadth-first from the identity, x before y -- a numbering of
the group's, not the run's, so the two ports agree by construction.
`TestHurwitz` checks the group orders, the generators' orders, chi = 2 - 2g, q
faces at every vertex, every edge once each way and no face bordering itself. **Which surface of the triplet** is the one
thing a generator search can change silently -- the three share PSL(2,13) and
are not the same surface -- so the Petrie polygons pin it: 8 on the quartic (its
classical {7,3}_8), 18 on Macbeath's surface, and 14 on the triplet's, whose
other two members have 12 and 26. The others are pinned the same way: 12 on
the Bolza surface, 6 on Dyck's and on Bring's.

**The disc covers it, and the covering map is ids alone.** The ring walk's
{7,3} disc is the surface's universal cover. Its central heptagon's corners go
in order onto face 0's, and every disc face across an edge from one already
mapped goes onto the one surface face across that edge's image -- a
breadth-first walk on integer ids, which refuses a disc vertex reached two ways
that land on different surface vertices. A Wythoff tiling of the disc is carried
down through its flag keys (`wythoff_loops` keeps them, and what each face
stands on, before `wythoff_faces` renumbers them), so a 6.6.7 vertex is
(surface face, surface edge) -- the same key `zip` gives on the disc.

**The board draws a patch of the cover, every cell at least once.** It keeps
the disc's shells out to the first one by which every surface cell has appeared,
or out to `patch_reach(surface, op)` if that is farther, plus `margin` more (0
ships): on the quartic 183, 519 and 911 faces for easy to hard, on Macbeath's
surface 316, 1023 and 1408, on the genus-14 surface 561, 1863 and 2521; on the
Bolza surface 225, 865 and 1449, on Dyck's 345, 681 and 1025, on Bring's 366,
741 and 1346. Every board builds in under a second. The
reach is the web pan's (below): Klein's quartic has every cell within 2.9 of
the centre, and a patch that small showed its edge moving as the view stepped
from tile to tile. Shells are orbits of the
central p-gon's dihedral group, so the patch keeps D_p, and the surface keeps
it too -- the turn is the surface's own, and every surface here is reflexible,
so the mirror is as well (measured, `symmetries.test.ts`: D7 on the Hurwitz
surfaces, D8 on Bolza's and Dyck's, D5 on Bring's). Each drawn face
shows the cell it covers (`Board.faces`, the projective plane's field, now on
the flat `Board` too); a cell is named after its copy nearest the centre, which
is the face with the least id. **Adjacency is the surface's**: each cell's
corners as surface ids (`Board.quotient`) go through the shared-vertex rule, so
a cell copied at the rim of the patch still has all its neighbours, and the
test checks that round every copy whole inside the patch the drawn neighbours
are exactly the adjacency's. The patch is no whole number of sheets, so
`covering_sheets` cannot count the surface off the drawing; the topology
helpers count `quotient` instead (`mesh_loops`), which is how the oracle sees
chi = -2 to -26 with no boundary.

Four things worth knowing before touching it:

* **No twins, no near-twins, no trim.** The surface is regular, so no cell's
  neighbourhood is another's or one short of it (asserted); there is nothing to
  drop and no disc to keep whole, so the builder draws through `disc_drawing`,
  the half of `_disc_board` without `_is_disc`.
* **The web app pans without end** (`Board.disc.cover`, `render/disc.ts`
  `discRecentre`, and "A board with no rim" under "Hyperbolic panning" in
  [`web/docs/render.md`](../../web/docs/render.md)): a step per tile round the
  central one, the isometry and the matching surface symmetry, so a view that
  wanders off the central tile is carried back and the labels follow, the
  picture unchanged. The view shows the patch out to `cover_view(surface)`
  round its centre and hides the rest, which keeps the board's edge one fixed
  circle, and the web board is framed to that circle widened by a tile radius
  (the clip keeps a tile by its centre, so one just inside it reaches that far
  out -- half a heptagon on the quartic). The radius is the one
  whose disc holds `COVER_COPIES` (0.75) of the surface, cosh v = 1 + 1.5(g - 1):
  1.57 on the Bolza surface, 2.06 on genus 3 (the quartic, 0.77 of the disc,
  and Dyck's), 2.39 on Bring's, 2.99 on Macbeath's (0.905), 3.71 on the
  triplet (0.95). The tiling does not enter, so a surface shows the same
  view at every difficulty and a harder board's cells are smaller, as a flat
  board's are.
  `patch_reach` is the view, plus `view_shift(p, q)` (the central p-gon's
  circumradius, as far as the view's centre ever strays: 0.62 on {7,3}, 0.86
  on {8,3}, 0.85 on {5,4}), plus the tiling's own
  tile radius (measured, `_tile_radius`), so the circle is full from anywhere
  on the central tile (a test probes it from the central p-gon's corners). Nothing about the board changes, so the pygame game,
  which does not pan, plays the same board as a static disc -- and the patch
  reaching every cell is what lets it.
* **What the renderer draws is bounded by the same pan.** Since the view's
  centre never strays past `view_shift`, how big any face can ever be drawn is
  known, and the web board spends nothing it cannot show: a face beyond
  `patch_reach` is never in view (`Board.unseen` -- most of the genus-14
  surface's patch, which reaches farther only so every cell has a copy) and
  gets no geometry, and an edge whose curve could never miss its chord by half
  a pixel is drawn straight (`edgeSegments` -- nearly every edge out at the
  rim). Each outline point carries a cell's whole bevel, so that was most of
  the cost: a frame of the hard quartic drew 3.3 million vertices and now
  draws about 0.9 million, the hard disc board's budget.
* **The info window names the surface** by the board's mode
  (`hurwitzSurfaceLabel`): "Klein quartic, genus 3", "Dyck's surface, genus 3"
  and so on. It once read the genus off the board's Euler characteristic, which
  stopped naming one surface when Dyck's joined the quartic at genus 3.

## The binary tiling

`binary_board(top, levels, mines, scale)` (`binaryBoard`, mode
`hyperbolicbinary`) is Böröczky's binary tiling, the one hyperbolic board
that is **not a disc**. In the upper half-plane model the horizontal lines are
horocycles and the vertical ones geodesics, and z -> 2z is an isometry. Cut
along y = 2^i and along x = j·2^i between y = 2^i and 2^(i+1), and every piece
is the unit piece [0, 1] x [1, 2] moved by z -> 2^i z + j·2^i. So all the tiles
are congruent, and each row's tiles are twice the width of the row below.
Drawn in the model they are Euclidean squares with straight edges, and a window
of whole tiles is a **rectangle**: `top` tiles across the top row, `levels`
rows, top·(2^levels - 1) cells, mirror-symmetric about its middle (D1). It is
the one hyperbolic board inside the square-window convention.

**The ids are the corners themselves.** In bottom-row tiles every corner is
(j·2^i, 2^i), an integer pair, so nothing is computed or rounded. A tile's
bottom edge carries its midpoint, where its two children meet. That point is a
T-vertex, which `corner_mask` marks as not a corner. With it, shared-vertex
adjacency gives an interior tile **8** neighbours:
- 2 beside it;
- 4 below: its two children, plus one child of each side neighbour, at its bottom corners;
- 2 above: its parent, plus the parent's neighbour on the tile's own side.

That last pair is the left/right asymmetry that makes it play unlike the square
grid. `TestBinaryTiling` pins all of it, and checks congruence exactly, mapping
every tile onto the unit tile in rationals.

**The rim is half the board.** The bottom row has no children, so its tiles
have 4 neighbours, and it holds just over half the cells. Mean degree is 5.6
to 5.9. No window has a twin, and each has exactly **two near-twins**: the
bottom row's second tile and its parent, at each end. Peeling either would cut
a notch in the rectangle, so they stay. The calibrated densities are 6–11%.

**The size knob is coarse and not a product.** The cell count is
top·(2^levels - 1), so `resize.py` enumerates the candidates (`grid="binary"`)
rather than filtering on the product of the knobs. A square window is about 2
tiles across the top whatever the depth: 3×5 (93 cells) easy, 2×7 (254)
medium, 2×8 (510) hard.

**Its bottom rows are tiny, and the pan is what reaches them.** At hard on a
phone the bottom row is 256 tiles across, about 1.5px each. In the TypeScript
app a drag moves the board by z -> a z + b, the half-plane isometry that takes
the point under the finger to the finger. That is a magnification about the
ideal line under the board plus a slide along it, so a bottom-row cell dragged
up comes in at tappable size. It is a Euclidean similarity, so it runs on the
ordinary flat camera (zoom up to `2^(levels-1)` for this board) with no
shader stage. The board says where its ideal line is (`Board.halfPlane`).
See "Half-plane panning" in [`web/docs/render.md`](../../web/docs/render.md).
The pygame game does not pan; it plays the same board.

## The rep-tile and fractal boards

The sixteen self-similar boards are each one tile inflated `levels` times --
scaled up by the substitution's `factor` and refilled with copies of itself --
into a patch whose outline converges on a self-similar shape (the tile again
for all but the Gosper island); that outline is the
board, the second deliberate exception to the square-window
convention. The menu splits them in two. The **Rep-tiles** family is the
thirteen polygons that tile a scaled copy of themselves exactly -- nine of them
rep-4, so 4**levels cells: 64 easy, and 256 medium and hard at two mine
counts; the other four are below. The
**sphinx** is the pentagonal hexiamond on the triangular lattice (its
dissection is unique -- three of its four children are reflected), the
**chair** the L-tromino on the square lattice (the classic reflection-free
substitution, four quarter-turns), the **L-tetromino** and the
**P-pentomino** the next two polyominoes that do it (the L has four
dissections, one reflection-free, the P two, neither -- and the T, S and Z
tetrominoes none, in four copies or nine), and the **trapezoid** the
triamond, half a hexagon, on the triangular lattice (one dissection: three
children round the edge, one upside down in the middle). The last four came
out of an exhaustive search for rep-4 polyforms (polyominoes to eleven squares,
polyiamonds to ten triangles, half-square polyabolos and 30-60-90 polydrafters
to eight pieces), once the triangles, the parallelograms and the five above
are set aside: the **right trapezoid** (a square and half a square, sides 1,
1, 2 and √2, on the square lattice) and the **half trapezoid** (a doubled
triamond cut down its mirror line: two right angles, a 60° and a 120° corner,
on the triangular lattice) are chiral quadrilaterals each of which has one side
crossing the lattice's unit faces -- a square's diagonal, a triangle's median
-- so `TestRepTiles` measures them on a finer grid of faces; the **stretched
chair** is the chair drawn out into upright dominoes and the **rhombic L** the
L-tetromino sheared into four 60° rhombi, and neither keeps the quarter turn
its original dissects with. All four dissections are unique, all four reflect
a child, and none is edge to edge, so all four outlines carry their step
vertices. Four more come from Wikipedia's *A selection of rep-tiles*, and
each needed something the rep-4 ones did not. The **isosceles right
triangle** (rep-2) and the **30-60-90 triangle** (rep-3) inflate by 1 + i and
1 + ζ: √2 and √3, turned 45° and 30° a level. The 30-60-90 triangle reflects
two of its three children, and a turning inflation does not commute with a
mirror, so each `_Substitution` carries a `twist` (s^p M s^-p = R^(p·twist) M)
that `substitution_placements` adds to a reflected child's rotation. Each also
carries an `upright`, the turn that stands every level the same way up
(`board_xy`). Both are edge to edge. Their patches are the tetrakis square and
kisrhombille tilings cut to a triangle -- the Laves family's tiles, in a
rep-tile's outline. The **T-tetromino** is rep-16, not rep-4: four Ts make a
4x4 square only as a pinwheel of quarter turns, so the T scaled by four is
four such blocks, and its one usable patch (256 cells) serves all three
difficulties. The **five-triangle** is the 1:2 right triangle, rep-5: the
altitude cuts off one copy √5 smaller, and the double copy left over is
quartered through its midpoints. Its inflation by 2 + i turns 26.57° and
reflects every child, so a level's tiles take the four quarter turns of one
hand, the hand and the tilt alternating. No placement can say that, so
`five_triangle_board` cuts the patch top down as an affine rule on each
triangle's corners, on an integer grid of 10**levels per unit, and then
records its T-vertices exactly. Conway and Radin's *pinwheel* is the same
triangle with the double copy's middle rectangle halved along the other
diagonal, which sends the tiles through ever more angles. It was measured
and left out: its 125-cell patch leaves 22 cells with an indistinguishable
twin, a coin flip per mine, where the midpoint split leaves two and
calibrates. Both right triangles' corner pairs are twins on every patch,
which is why `drafter` easy (four twin cells in 81) ships flagged in
`data/difficulty.json`. The **Fractals**
family is the other three, whose patch is not just the tile scaled: the
**Sierpinski carpet** is not a
rep-tile: the unit square tripled and refilled with the eight subsquares of
the 3x3 block that are not its centre, so it grows 8**levels (64 easy, 512
medium; ×8 a level leaves no fourth playable size, so hard reuses the
level-3 patch at the classic hard board's ~20% mine density). The hole it
leaves at every scale makes it the one flat board that is not a disc --
(8**n - 1) / 7 holes, hence Euler characteristic 1 - holes and holes + 1
boundary circles -- and the reason no cell of it ever has eight neighbours
(every 3x3 window of the grid holds exactly one cell that is ≡ (1, 1) mod 3,
and that one is always a hole). The **pentaflake** (Dürer's pentagon) is the
regular pentagon scaled by φ² and refilled with six -- one seated in each
corner plus one in the middle turned a half turn -- so it grows 6**levels
(36 easy, 216 medium, and hard reuses the level-3 patch at ~20% mine
density, as the carpet does). Its five children leave a golden gnomon
(a 36-72-72 triangle) over per side, so it too has holes: a level-`n`
pentaflake has (6**n - 5·2**n + 4) / 4 of them, none at level 1 (there the
gaps still open onto the patch's own boundary) and one per whole edge two
supertiles are glued along after that. Three pentagons and 3·108 = 324°
meet at a corner, so no cell of it ever has more than five neighbours.
Its lattice is the one here that is not integer: five-fold symmetry needs
rank 4, so its vertex ids live in the cyclotomic ring ℤ[ζ10] (as Penrose's
do in ℤ[ζ5]) and φ² = 2 + ζ² - ζ³ is exact there. Each child translation is
the parent's scaled by a power of the factor, so a placement stays an exact
`(rotation, mirror, translation)` triple -- and the inflation only ever
multiplies by the factor, never divides, because there is nothing to round
an irrational scale back to. Four of the rep-tilings are not edge to edge,
so their tile outlines carry a vertex at every lattice step and
`corners`/`shapeMetrics` drop those again before measuring (the trapezoid's
substitution, the carpet's squares, the pentaflake's pentagons and the
Gosper island's hexagons meet edge to edge and need none).
The **Gosper island** is the one whose *boundary* is the fractal rather than
its interior: plain regular hexagons, no holes at all, in a patch whose
outline converges on the Gosper island -- the curve the flowsnake draws,
dimension log 3 / log √7 = 1.129, which is 7**n hexagons behind only 6·3**n
boundary edges. The hexagon is no rep-tile (seven make a flower, not a
bigger hexagon), so what inflates is the patch: seven level-(n-1) islands,
one in the middle and six around it. Its inflation is multiplication by the
Eisenstein integer 2 + ζ, of norm 7 -- a *spiral* similarity of √7 at
19.106°, because scaling by √7 alone would send the lattice point 1 to
(√7, 0), which is no lattice point -- and that forced turn per level is what
roughens the edge. Its seven child translations are a complete set of
residues mod 2 + ζ, which is why the level-`n` patch is exactly 7**n
distinct cells (49 easy, 343 medium, and hard reuses the level-3 patch at
~20% mine density, as the carpet and the pentaflake do). The digits are
closed under multiplication by a unit, so the patch keeps the hexagon's
six-fold rotation at every level, but never a mirror past level 1: the
flowsnake is chiral.

## The Goldberg spheres

The Sphere page's hexagon boards are **Goldberg polyhedra**, each the dual of
a geodesic icosahedron: one cell per geodesic vertex, its corners the centres
of the triangles round it (`solids._goldberg_dual`). GP(h, k) lays the
triangular lattice over each icosahedron face so that its corners sit `h`
steps along the lattice, a 60-degree left turn (seen from outside), then `k`
more -- `T = h*h + h*k + k*k` triangles a face, `10T + 2` cells, always 12 of
them pentagons. Unlike the rest of the sphere family these grow, and the
Goldberg parameters are the size knob, measured like any other
(`c180_board`/`gp21_board` in `resize.SPEC`):

| Mode | Easy | Medium | Hard |
|---|---|---|---|
| `c180`, class I GP(f, 0) | GP(3,0), 92 | GP(5,0), 252 | GP(7,0), 492 |
| `gp21`, class III GP(h, k) | GP(2,1), 72 | GP(4,2), 282 | GP(5,3), 492 |

Each mode keeps the name of its easy board, which is the one it always was --
a mode is a board's address in a share link and the best-times table. `c180`
is `k = 0`, where the lattice runs along the icosahedron's edges and
`_geodesic(frequency)` builds it. `gp21` is **class III**: with `0 < k < h`
the lattice runs *across* the edges, so

- it is **chiral** -- GP(k, h) is its mirror image, and only one hand ships.
  The board keeps the icosahedron's 60 rotations and none of its mirrors. On
  GP(2,1) the 60 hexagons are a single orbit under them, and each touches
  exactly one pentagon (in GP(3,0) sixty touch one and twenty none);
- **some lattice triangles straddle a face edge.** `_geodesic_hk` walks, per
  face, the lattice triangles whose *centre* lies strictly inside it, so each
  is taken once. A centre lands *on* an edge exactly when `h ≡ k (mod 3)` --
  class II, but also the chiral GP(4,1) -- so those are refused, and the size
  search's candidates (`resize._grid_goldberg3`) leave them out. A vertex is
  keyed, as in `_geodesic`, by gcd-normalised integer barycentric weights over
  the face's corners, here summing to T; a straddling triangle's far corner
  has one negative weight and is renamed over the neighbouring face, whose far
  corner is `A + B - C` in the unfolded net -- integers in, integers out, so
  the key is exact. With `gcd(h, k) == 1` no lattice point but a corner lies
  on an edge; with `g = gcd(h, k) > 1` (GP(4,2)) the edge is cut `g` ways, and
  each of those points has a zero weight on the far corner and the same two
  weights over the edge's ends from either face, so both faces name it alike.

The hard rows are the same size, 492, and that is the size search's choice
rather than a coincidence: GP(5,3) was measured against GP(6,1) (432) and
GP(6,2) (522) at 1,500 games a mine count, and all three calibrate to within
about a point of the classic hard win rate, a mine moving each by two to four
points, so nothing but the cell count tells them apart.

**The geodesic icosahedron** (`spheretri`, `sphere_triangle_board`) is the
page's triangle board: `icosahedron_board`'s subdivision projected onto the
sphere, so the same graph as the Platonic icosahedron at every frequency, and
the same ladder -- 80 / 320 / 500 cells, `frequency` 2 / 4 / 5. It is kept for
the drawing, not the game: one is the solid with its creases, the other the
round sphere, and the menu is meant to offer every geometry. (Calibrated on
its own, its mine counts land within a mine or three of the icosahedron's,
which is the measurement's noise on one graph.)

**The spherical cube** (`spheresquare`, `sphere_square_board`) is the page's
square board, and the same story one tiling over: `cube_board`'s grid, on the
same integer lattice keys, drawn round by the equiangular cube map -- every
coordinate through tan(pi/4 * c) before it is put on the sphere, which keeps
the squares near the cube's corners from shrinking the way a straight
projection does. So the same graph as the Platonic cube at every `n`, and the
same ladder: 96 / 294 / 486 cells, `n` 4 / 7 / 9. Its eight 3-valent corners
are the 4 * chi a closed surface of squares needs. `_cubed_sphere` /
`cubedSphere` builds it, and is the sphere the projective plane's square board
and Boy's surface are quotients of (see "The real projective plane"), so the
two surfaces' square boards are this one with antipodes glued. Its mine counts
were calibrated on their own -- 20 / 67 / 128 against the cube's 18 / 66 / 130,
the same noise on one graph.

**What the Sphere page used to carry and why it does not.** It shipped seven
boards of one fixed size each. `c80` (GP(2,0), 42 cells) was half an easy
board with no rung below it, and is `c180` at `frequency=2`. The three uncut
Archimedean solids (`snubdodec`, `rhombicosidodeca`, `truncicosidodeca`) were
the graphs of the Archimedean page's own boards at `frequency=0`, which is now
those boards' easy rung (see "The Archimedean solids"). Those four were
retired rather than kept alongside: a share link to one opens the menu
(`link.ts`), and its best times stay in the record unshown (`bestTimes.ts`).

## The Catalan solids

The **thirteen Catalan solids** (`boards/catalan.py`) are the duals of the
Archimedean solids, and they come off one recipe rather than thirteen tables
of coordinates. Every Archimedean solid is a single point's orbit -- the
**Wythoff generating point** -- in the Schwarz triangle of a Platonic
symmetry group, so: take a base (tetrahedron, cube, icosahedron -- one per
group) and one **flag** (a mutually incident vertex, edge and face, whose
three axes are the triangle's corners); find that point; put a Catalan vertex
at `n / <w, n>` on each face axis `n`, which is **polar duality** about the
unit sphere; and group the base's flags into faces by the Conway operation.
Six operations over three groups is exactly thirteen. Five of the six pin
their point with two *linear* mirror constraints, so the answer is one cross
product (`solids._wythoff_point`, which the truncated icosidodecahedron's own
`_flag_position` is now the omnitruncation case of); the sixth, `gyro`, is
**chiral** -- a snub uses no mirror at all -- and its point is solved for by
Newton on "all three edges equal", landing on the snub cube's tribonacci
coordinates exactly. Because the radii come from that one point, every face
is planar, congruent and the same distance from the centre by construction,
which is what `TestCatalanSolids` measures rather than assumes.
Twelve to a hundred and twenty faces is not a board, so each face is **cut
into smaller copies of itself** and that is these boards' only size knob:
triangles through the same `solids._geodesic` the Platonic solids use, quads
through `_quad_grid`, and pentagons -- which cannot be cut into pentagons at
all -- fanned into five quads first (so `frequency=0` is the bare pentagons,
which is the 60-cell board `sphere` has always been). The grid is square
rather than a free `n x m`, and that is forced: an `n x m` grid needs each
face's *opposite* edges to carry the same count, and a rhombic Catalan solid
is a zonohedron whose zones pairwise share a face, so no such 2-colouring
exists. `sphere` keeps its mode name -- it is a board's address in a share
link and in the best-times table -- but is now drawn faceted rather than
projected onto the sphere, and lives under **Catalan solids** rather than
Sphere.

## The Archimedean solids

Every Catalan solid is the polar dual of an Archimedean one, and the duality
runs both ways, so the Archimedean solids need no construction of their own
(`boards/archimedean.py`): `_archimedean_faces` takes the faces
`catalan._catalan_faces` builds and **dualises them back**. Every Catalan face
lies in a plane `<x, w> = 1` for one image `w` of the generating point, so the
plane's pole *is* that Archimedean vertex, on the unit sphere; every Catalan
vertex becomes the face made of the poles around it. On the cube base that is
`join` -> cuboctahedron (`cubocta`), `kis` -> truncated octahedron
(`truncocta`) and `gyro` -> snub cube (`snubcube`); on the icosahedron
`ortho`, `meta` and `gyro` give the rhombicosidodecahedron, truncated
icosidodecahedron and snub dodecahedron (`rhombicosidodecasplit`,
`truncicosidodecasplit`, `snubdodecsplit`); `TestArchimedeanSolids`
measures every face regular, one edge length throughout and every vertex at
radius 1. An Archimedean vertex is *named* by its Catalan face's key -- a tuple
of the base's own incidences -- so nothing is rounded into an id.

Fourteen or thirty-eight faces is not a board, so they are cut the Catalan way,
`frequency` cuts along every edge. These solids mix side counts, which the
Catalan path never had to: `solids._geodesic` names a point by barycentric
weights over one triangle, which the square across the edge cannot agree with,
so triangles go through `catalan._tri_grid` instead, which names an edge point
exactly as `_quad_grid` does (`_edge_point`). A hexagon cannot be cut into
hexagons, so each of the truncated octahedron's is cut into **three rhombi**
through its centre first, and that costs symmetry: the rhombi keep the
hexagon's mirrors through their spokes and lose the three through its edge
midpoints -- which on this solid are the cube's edge mirrors, whichever three
corners are spokes. So no cut keeps all 48 symmetries. `_th_spokes` keeps the
**pyritohedral** 24 (coordinate mirrors, inversion, three-fold turns): a
hexagon corner on a cube face normal to axis `a` and a cube edge along axis
`b` is a spoke when `b = a + 1 (mod 3)`, a rule sign flips and axis cycles keep
and a quarter turn reverses. The cuboctahedron keeps all 48, and the snub cube
its 24 rotations, being chiral.

The icosahedral solids' pentagons, hexagons and decagons are **fanned into
triangles** from their own planar centres instead (`_fan_faces`, the
dodecahedron board's rule): a fan keeps the face's whole dihedral group, so
these boards keep all 120 symmetries (the snub dodecahedron its 60 rotations).
A decagon's ten golden triangles all meet at its centre, so on the truncated
icosidodecahedron those cells see up to 16 neighbours.

The ladders are `F * frequency**2`, `F` counting the cut faces -- 14, 30 and
38 on the cube, 110, 270 and 140 on the icosahedron -- so several rows sit
between rungs and are `EXEMPT_ROWS` in `tests/test_presets.py`. The three
icosahedral solids also take **`frequency=0`**: the solid uncut, one cell per
face, no fan -- 62, 62 and 92 cells, the small end the cuts cannot reach (the
smallest is already 110 to 270). That is their easy board, so their ladders
run 62 / 440 / 440 (rhombicosidodecahedron), 62 / 270 / 270 (truncated
icosidodecahedron) and 92 / 140 / 560 (snub dodecahedron), each row the
nearest rung in log terms. These uncut boards used to ship as modes of their
own under Sphere, projected onto the sphere; the graph was the same, so the
mine counts measured on one were the other's to within a mine.
