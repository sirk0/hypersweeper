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
conformance oracle — see [`shared-data.md`](shared-data.md).

## Package layout (`minesweeper/boards/`)

Import order is a strict DAG; a module only imports from the ones above it.

| Module | Responsibility |
|--------|----------------|
| `core.py` | `Board` / `Board3D`, the `_shared_vertex_adjacency` neighbour rule, `_build` (lattice→pixels) and `_finalize_flat` (float→pixels), 3D vector helpers, and the topology invariants `euler_characteristic` / `boundary_components` / `corner_fans`. |
| `tilings.py` | Regular flat builders (square/triangle/trigrid/hex/hexhex/hextri/hextriangle), the `_ArchTemplate` system, the eight Archimedean `_*_template()` factories plus their eight Laves duals (built by `_dual_template`), the six isogonal (non-edge-to-edge) ones and the five congruent-rectangle bonds, and the **`ARCH_TILINGS`** registry (the one place any of them is declared, with `_FAMILY_TRAITS` saying what each family is). |
| `fractal.py` | The self-similar (fractal) boards: the sphinx, the chair, the Sierpinski carpet, the pentaflake and the Gosper island. One `_Substitution` record per tile — unit outline, the tiles filling the inflated copy, the inflation factor, lattice ops — and the shared inflation (`substitution_placements`) all five `*_board` builders run. The first two are rep-tiles (their children fill the tile); the carpet's and the pentaflake's leave holes, which is what makes them fractals with holes rather than shapes; the Gosper island's fill it with no hole at all and put the fractal in the *outline* instead. Four lattices are integer; the pentaflake's is ℤ[ζ10], since five-fold symmetry needs rank 4. The Gosper island's inflation is the one that is not a pure scaling: multiplication by 2 + ζ, a spiral similarity of √7 at 19.106°. |
| `aperiodic.py` | Penrose (P3), the Spectre (Tile(1,1), the chiral monotile) and the phyllotactic spiral, each with exact-arithmetic vertex ids — ℤ[ζ5] for Penrose and the spiral, ℤ[ζ12] for the Spectre. The Spectre's ring is *dense* in the plane, so unlike Penrose's discrete lattice there is no lattice to snap a float vertex back to: its placements are carried as exact `(rotation, mirror, translation)` triples and no floating point enters the substitution at all. The spiral is the odd one out — no substitution, just ten 36° wedges of the tile's own translation lattice, the odd ones offset a step; nonperiodic because its five-fold centre forbids any translation. The **brick rings** are nonperiodic the same way — by symmetry rather than by a substitution — and are the plainest board here: 2x1 bricks on the integer square lattice in concentric square rings about a 2x2 core, ring k being the boundary of the 2k x 2k square with horizontal bricks along its rows and vertical ones up its sides. Every run is even, so every tile is a whole brick and only an even-sided square is tileable at all. A brick's corner lands in the middle of a neighbour's long side, so `_brick_outline` splits each edge at the lattice points that are genuinely some tile's corner — the 2D twin of `solids._split_at_lattice_points`, and *conditional*, unlike the fractal outlines, which carry a vertex at every step. |
| `solids.py` | Closed/convex and polycube 3D boards (spherical gyro pentagons, Goldberg polyhedra, geodesic icosahedron, rhombicosidodecahedron, truncated icosidodecahedron, cube, tetrahedron, frames, bipyramid), plus the shared `_wythoff_point` every uniform solid here and every Catalan solid next door is generated from. |
| `catalan.py` | The thirteen Catalan solids, the duals of the Archimedean solids. One recipe for all of them: a Platonic base and one flag, the Wythoff generating point of its Schwarz triangle (`solids._wythoff_point` for the five non-chiral Conway operations, `_snub_point` for the chiral one), a Catalan vertex at `n / <w, n>` on each face axis — polar duality — and the base's flags grouped into faces by the operation. Faces are then subdivided (`solids._geodesic` for triangles, `_quad_grid` for quadrilaterals, a five-way fan first for pentagons), which is these boards' only size knob. |
| `surfaces.py` | Wrapping tilings onto surfaces: the three immersion points (`_torus_point`, `_cylinder_point`, `_mobius_point`), the shared `_assemble` tail, the nine simple `*_board` wrappers, and the Archimedean `arch_torus_board` / `arch_cylinder_board` / `arch_mobius_board`. |
| `volume.py` | The volume boards — a solid block of cells rather than a surface of them. One so far: `solid_cube_board`, the `n**3` cube of cubes, whose 26-neighbour adjacency comes off the lattice and whose drawing is the `n` slices laid out on a grid and stepped back in depth. |
| `catalog.py` | The menu, **derived**: `SURFACE_SPECS` and `TILING_SPECS` (leaf data loaded from `data/catalog.json`) produce `MODE_LABELS`, `TILINGS`, `SURFACE_LABELS`, the geometry-first menu tables (`MENU_ROOT`/`MANIFOLD_*`/`FAMILY_*`/`SOLID_GROUP_*`/`SOLID_MODES`/`SHAPED_MODES`) and the picker helpers (`family_rows`, `picker_families`, `picker_modes`), `MODES_3D`, `mode_for`, `surface_of`, `view_hint`. |
| `presets.py` | Difficulty presets and `build_board`. Flat regular, solid, Archimedean/Laves and aperiodic (penrose/spectre/phyllotaxis) presets all load from `data/presets.json` (shared with the web port). The Archimedean rows are authored in the compact **`ARCH_PRESETS`** table (tiling → surface → difficulty → args) that `scripts/export_data.py` expands into `data/presets.json`. |

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
those two traits per family and the test lists derive from it. Like the
isogonal family, all five wrap the torus and cylinder, and the four with a
template mirror (all but herringbone) also wrap the Möbius strip and Klein
bottle. The menu's shared
tiling picker is a list of family
submenus: **Regular** (the three regular tilings, plus on the plane the
shaped boards cut from them), **Uniform** (the eight non-regular uniform
tilings, `family="uniform"` in `ARCH_TILINGS`), **Laves** (their
eight duals), **Isogonal**, **Congruent rectangles** and, on the plane
only, **Aperiodic** and **Fractals**. Every family is offered on every
surface its members' chirality allows, with no exceptions left:
`picker_families` in `catalog.py` (and its mirror in
`web/src/boards/catalog.ts`) now only drops the two flat-only families,
and everything else a surface refuses it refuses one row at a time, in
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
but 6 of the cube's 48 symmetries. `ARCH_TILINGS` is
listed in vertex-configuration order — Wikipedia's "List of Euclidean
uniform tilings" order — and that registry order is the menu order.
**To add a tiling or surface, see [`board-recipes.md`](board-recipes.md)** —
a tiling is
one `ARCH_TILINGS` + one `ARCH_PRESETS` row (its family submenu follows
from the `family` field, no menu edit needed), a
surface is one `SurfaceSpec` + an immersion + a wrap builder; the menu,
mode strings, `MODES_3D`, and chirality gating all derive from those
registries.

## The aperiodic boards

Three of the five aperiodic boards keep exact vertex ids in a cyclotomic ring:
ℤ[ζ5] (Penrose and the spiral) and ℤ[ζ12] (Spectre). Only Penrose's is discrete — ℤ[ζ12]
is dense in the plane, so `spectre_board` cannot snap a float vertex back
to a lattice the way the game's original third aperiodic board, The Hat
(since removed as a menu entry), did — and instead carries every
placement of the paper's chiral
substitution as an exact `(rotation mod 12, mirror, translation)` triple.
Its tile is Tile(1,1) held as an equilateral **14-gon**: the 14th corner
is the collinear one, kept so a neighbour's corner landing there is a
shared vertex id, dropped again by `shapeMetrics`/`corners` so the tile
measures as the 13-gon it is drawn as.
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

## The fractal boards

The five **fractal** boards are each one tile inflated `levels` times --
scaled up by the substitution's `factor` and refilled with copies of itself --
into a patch whose outline converges on a self-similar shape (the tile again
for the first four, the Gosper island for the fifth); that outline is the
board, the second deliberate exception to the square-window
convention. Two are rep-tiles, polygons that tile a scaled copy of
themselves (rep-4, so 4**levels cells: 64/256/1024 by difficulty for the
chair, one level lower for the sphinx, whose sliver of a tile needs more
room): the **sphinx** is the pentagonal hexiamond on the triangular lattice
(its dissection is unique -- three of its four children are reflected), the
**chair** the L-tromino on the square lattice (the classic reflection-free
substitution, four quarter-turns). The **Sierpinski carpet** is not a
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
an irrational scale back to. The two rep-tilings are not edge to edge, so
their tile outlines carry a vertex at every lattice step and
`corners`/`shapeMetrics` drop those again before measuring (the carpet's
squares, the pentaflake's pentagons and the Gosper island's hexagons meet
edge to edge and need none).
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
