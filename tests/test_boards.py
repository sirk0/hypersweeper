import cmath
import itertools
import math
import statistics
from collections import Counter, defaultdict

import pytest

from minesweeper.boards import (
    _ARCH_CONFIGS,
    _PHYLLO_HEX,
    _SPECTRE_OUTLINE,
    APERIODIC_MODES,
    ARCH_TILINGS,
    CARPET,
    CHAIR,
    DIFFICULTIES,
    FRACTAL_MODES,
    GOSPER,
    HYPERBOLIC_MODES,
    MODE_LABELS,
    MODES_3D,
    PENTAFLAKE,
    ROOT3,
    SHAPED_MODES,
    SOLID_MODES,
    SPHINX,
    SUBSTITUTIONS,
    SURFACE_LABELS,
    TILINGS,
    _arch_template,
    _brick_rings_tiles,
    _finalize_flat,
    _klaassen_tiles,
    _pentaspiral_tiles,
    _phyllotaxis_tiles,
    _shared_vertex_adjacency,
    _spectre_leaves,
    _z7_add,
    _z7_dir,
    _z7_to_xy,
    _z12_to_xy,
    _z_add,
    _z_rot,
    _z_sub,
    _z_to_xy,
    arch_cylinder_board,
    arch_klein_board,
    arch_mobius_board,
    arch_torus_board,
    archimedean_board,
    brick_cube_board,
    build_board,
    c80_board,
    c180_board,
    carpet_board,
    chair_board,
    cube_board,
    cube_frame_board,
    cylinder_board,
    cylinder_hex_board,
    cylinder_triangle_board,
    double_torus_board,
    double_torus_hex_board,
    double_torus_triangle_board,
    gosper_board,
    hex_board,
    hexhex_board,
    hextriangle_board,
    kitedart_board,
    klaassen_board,
    klein_board,
    klein_hex_board,
    klein_triangle_board,
    mobius_board,
    mobius_hex_board,
    mobius_triangle_board,
    newell_normal,
    penrose_board,
    pentaflake_board,
    pentaspiral_board,
    phyllotaxis_board,
    place_point,
    projective_hex_board,
    projective_triangle_board,
    rhombicosidodecahedron_board,
    snub_dodecahedron_board,
    solid_cube_board,
    spectre_board,
    sphere_board,
    sphere_triangle_board,
    sphinx_board,
    square_board,
    square_diamond_board,
    stepped_bipyramid_board,
    substitution_placements,
    surface_of,
    tetrahedron_board,
    tetrahedron_frame_board,
    torus_board,
    torus_hex_board,
    torus_triangle_board,
    trefoil_board,
    trefoil_hex_board,
    trefoil_triangle_board,
    triangle_board,
    triangle_grid_board,
    truncated_icosidodecahedron_board,
)
from minesweeper.boards import (
    boundary_components as _boundary_components,
)
from minesweeper.boards import (
    corner_fans as _corner_fans,
)
from minesweeper.boards import (
    euler_characteristic as _euler_characteristic,
)
from minesweeper.boards.aperiodic import (
    _AB_HALF,
    _PENTA_RINGS,
    _ab_cells,
    _ab_place,
    _ab_tiles,
    _z8_conj,
    _z8_rot,
    _z8_silver,
    _z8_sub,
    _zeta8_mul,
    ammann_beenker_board,
)
from minesweeper.boards.catalan import (
    deltoidal_hexecontahedron_board,
    deltoidal_icositetrahedron_board,
    disdyakis_dodecahedron_board,
    disdyakis_triacontahedron_board,
    pentagonal_icositetrahedron_board,
    pentakis_dodecahedron_board,
    rhombic_dodecahedron_board,
    rhombic_triacontahedron_board,
    tetrakis_hexahedron_board,
    triakis_icosahedron_board,
    triakis_octahedron_board,
    triakis_tetrahedron_board,
)
from minesweeper.boards.catalan import (
    sphere_board as catalan_sphere_board,
)
from minesweeper.boards.core import _cross
from minesweeper.boards.core import newell_normal as _newell_normal
from minesweeper.boards.hyperbolic import (
    _central_polygon,
    _isometry,
    face_centre,
    hyperbolic_board,
    hyperbolic_faces,
    hyperbolic_positions,
)
from minesweeper.boards.presets import _WINDOWS, ARCH_PRESETS, window_for
from minesweeper.boards.solids import _goldberg_board
from minesweeper.boards.surfaces import TREFOIL_REACH, _trefoil_core

# Template tilings split by symmetry type. Archimedean (uniform) tilings are
# vertex-transitive (every vertex has the same configuration) and edge to
# edge; their Laves duals are face-transitive (every tile congruent) and get
# a different set of invariants; the isogonal ones are vertex-transitive but
# not edge to edge, so their tiles carry collinear T-vertices and the
# corner-counting invariants have to drop those first; the rectangle bonds are
# face-transitive *and* (bar the stacked bond) not edge to edge, so they get
# both treatments. Reflective tilings (a plain mirror, not just a glide or
# pinwheel) additionally give left-right / top-bottom symmetric boards.
_UNIFORM = [t.key for t in ARCH_TILINGS if t.family == "uniform"]
# the tilings that wrap a surface at all: derived from the catalog, so a
# chiral tiling (no template mirror) or one without a torus preset yet drops
# out automatically
_WRAPPED_TILINGS = [t.key for t in ARCH_TILINGS if "torus" in TILINGS[t.key][1]]
_ISOGONAL = [t.key for t in ARCH_TILINGS if t.family == "isogonal"]
_RECTANGLE = [t.key for t in ARCH_TILINGS if t.family == "rectangle"]
# the two rep-tile patterns. They share the "other" family with Durer's
# tiling, which is a grab-bag rather than a symmetry class, so this list is
# named rather than derived from it -- what these two have in common (one
# congruent polyform, in half-turned pairs) is not what the family says.
_REPTILE = ["sphinxpairs", "tromino"]
# the tilings that declare a grain -- straight lines no tile of them crosses,
# which archimedean_board ends its window on. See TestFlatGrain.
_GRAINED = [t.key for t in ARCH_TILINGS if any(t.template().grain)]
_VERTEX_TRANSITIVE = [t.key for t in ARCH_TILINGS if t.vertex_transitive]
# built from one congruent tile (and so face-transitive). Durer's tiling is
# the one row that is neither vertex- nor tile-transitive -- a pentagon and a
# rhomb -- so the congruence invariant is not its; TestDurer covers it.
_MONOHEDRAL = [t.key for t in ARCH_TILINGS if t.monohedral]
_EDGE_TO_EDGE = [t.key for t in ARCH_TILINGS if t.edge_to_edge]
_NO_HALF_TURN = {t.key for t in ARCH_TILINGS if not t.half_turn}
_REFLECTIVE = {
    t.key for t in ARCH_TILINGS
    if t.template().mirror is not None and not t.template().glide
}


def _tile_signature(polygon):
    """A congruence signature: the multiset of edge lengths and interior
    angles, rounded. Two tiles with equal signatures are congruent up to
    rotation and reflection. Edges are rounded to 3 places (~1e-5 of a tile):
    a Laves tile centre is a floating-point centroid of primal-tile vertices,
    so congruent tiles in different orientations can disagree in the 4th
    place -- still far tighter than any genuine non-congruence."""
    n = len(polygon)
    edges = sorted(round(math.dist(polygon[i], polygon[(i + 1) % n]), 3)
                   for i in range(n))
    angles = []
    for i in range(n):
        a, b, c = polygon[i - 1], polygon[i], polygon[(i + 1) % n]
        v1, v2 = (a[0] - b[0], a[1] - b[1]), (c[0] - b[0], c[1] - b[1])
        angles.append(round(abs(math.atan2(v1[0] * v2[1] - v1[1] * v2[0],
                                            v1[0] * v2[0] + v1[1] * v2[1])), 4))
    return (tuple(edges), tuple(sorted(angles)))

# Every registered mode (easy preset) so the invariant suite below covers
# any tiling or surface the moment it is added to the catalog. A few
# extra-small hand-built boards exercise seam edge cases the easy presets
# are too large to reach.
def _connected(board) -> bool:
    """Whether every cell of a board is reachable from any other -- what a
    window that slid off its patch would break, leaving part of the board
    unplayable."""
    start = next(iter(board.adjacency))
    seen, queue = {start}, [start]
    while queue:
        for neighbor in board.adjacency[queue.pop()]:
            if neighbor not in seen:
                seen.add(neighbor)
                queue.append(neighbor)
    return len(seen) == len(board.adjacency)


ALL_BOARDS = [build_board(mode, "easy") for mode in sorted(MODE_LABELS)] + [
    square_board(5, 5, 3),
    torus_board(12, 6, 9),
    mobius_board(20, 4, 10),
    mobius_hex_board(14, 3, 6),
    cylinder_triangle_board(16, 6, 11),
    arch_mobius_board("snubsquare", 13, 2, 10),
    archimedean_board("snubhex", 3, 2, 12),
]


@pytest.mark.parametrize("board", ALL_BOARDS, ids=lambda b: b.mode)
class TestInvariants:
    def test_adjacency_is_symmetric(self, board):
        for cell, neighbors in board.adjacency.items():
            for neighbor in neighbors:
                assert cell in board.adjacency[neighbor]

    def test_no_self_adjacency(self, board):
        for cell, neighbors in board.adjacency.items():
            assert cell not in neighbors

    def test_no_duplicate_neighbors(self, board):
        for neighbors in board.adjacency.values():
            assert len(neighbors) == len(set(neighbors))

    def test_polygons_within_bounds(self, board):
        if board.mode in MODES_3D:
            for polygon in board.polygons.values():
                for point in polygon:
                    assert sum(c * c for c in point) <= board.radius**2 + 1e-9
        else:
            for polygon in board.polygons.values():
                for x, y in polygon:
                    assert -1e-9 <= x <= board.width + 1e-9
                    assert -1e-9 <= y <= board.height + 1e-9

    def test_mine_count_leaves_safe_cells(self, board):
        assert 0 < board.mine_count < len(board.adjacency)

    def test_every_edge_belongs_to_two_tiles_or_a_boundary(self, board):
        """No point of the drawing lies in the middle of somebody's line.

        Half the tilings here are not edge to edge -- a brick corner lands in
        the middle of a neighbouring brick's edge -- and ``_insert_t_vertices``
        answers that by recording the point on the tile whose edge it splits.
        Miss one and the split tile keeps a single long edge where its two
        neighbours have two short ones, so that edge is used *once* in the
        middle of the surface: the adjacency loses a pair of neighbours, and on
        a curved surface the long edge is a chord where the two short ones bend
        with the tile beside them, which draws as a lens-shaped crack.

        Counting how many tiles each edge belongs to catches all of it exactly
        and cheaply: two in the interior, one along a rim. The flat boards and
        the open surfaces have rims; a donut, a bottle and the solids have
        none, so every edge of theirs must be shared.
        """
        used = Counter()
        for polygon in board.polygons.values():
            points = [tuple(round(c, 7) for c in point) for point in polygon]
            for index, point in enumerate(points):
                used[frozenset((point, points[(index + 1) % len(points)]))] += 1
        assert set(used.values()) <= {1, 2}, (
            f"{board.mode}: edges shared by {sorted(set(used.values()))} tiles"
        )
        if board.mode in MODES_3D and not board.two_sided:
            loose = [edge for edge, count in used.items() if count == 1]
            assert not loose, (
                f"{board.mode}: {len(loose)} edges belong to one tile on a "
                "closed surface"
            )



class TestCellCounts:
    def test_square(self):
        assert len(square_board(5, 7, 3).adjacency) == 35

    def test_triangle_has_size_squared_cells(self):
        assert len(triangle_board(6, 4).adjacency) == 36
        assert len(triangle_board(8, 4).adjacency) == 64

    def test_triangle_grid(self):
        assert len(triangle_grid_board(5, 9, 4).adjacency) == 45

    def test_hex(self):
        assert len(hex_board(5, 6, 4).adjacency) == 30

    def test_sphere_has_sixty_pentagons(self):
        assert len(sphere_board(7).adjacency) == 60

    def test_square_diamond_is_a_centered_square_number(self):
        # 2R^2 + 2R + 1 cells: the (R+1)^2 + R^2 lattice points of the two
        # parities inside |u|, |v| <= R
        assert len(square_diamond_board(3, 5).adjacency) == 25
        assert len(square_diamond_board(6, 10).adjacency) == 85

    def test_hexhex_is_a_centered_hexagonal_number(self):
        # 3R^2 + 3R + 1 cells
        assert len(hexhex_board(3, 5).adjacency) == 37
        assert len(hexhex_board(5, 12).adjacency) == 91

    def test_hextriangle_is_a_triangular_number(self):
        # (size+1)*(size+2)/2 cells
        assert len(hextriangle_board(3, 5).adjacency) == 10
        assert len(hextriangle_board(12, 12).adjacency) == 91

    def test_hextriangle_has_the_triangle_s_3fold_symmetry(self):
        # (q, r) -> (size - q - r, q) is a 120-degree rotation of the hex
        # lattice about the triangle's centre; the region and its adjacency
        # must map onto themselves.
        size = 8
        board = hextriangle_board(size, 5)

        def rotated(cell):
            q, r = cell
            return (size - q - r, q)

        assert {rotated(c) for c in board.adjacency} == set(board.adjacency)
        for cell, neighbors in board.adjacency.items():
            assert set(map(rotated, neighbors)) == set(board.adjacency[rotated(cell)])

    def test_c80_is_a_chamfered_dodecahedron(self):
        board = c80_board(5)
        sizes = sorted(len(p) for p in board.polygons.values())
        assert len(board.adjacency) == 42
        assert sizes.count(5) == 12 and sizes.count(6) == 30

    def test_rhombicosidodecahedron_face_mix(self):
        board = rhombicosidodecahedron_board(10)
        sizes = sorted(len(p) for p in board.polygons.values())
        assert len(board.adjacency) == 62
        assert sizes.count(3) == 20 and sizes.count(4) == 30 and sizes.count(5) == 12

    def test_truncated_icosidodecahedron_face_mix(self):
        board = truncated_icosidodecahedron_board(10)
        sizes = sorted(len(p) for p in board.polygons.values())
        assert len(board.adjacency) == 62
        assert sizes.count(4) == 30 and sizes.count(6) == 20 and sizes.count(10) == 12

    def test_torus(self):
        assert len(torus_board(12, 6, 9).adjacency) == 72

    def test_mobius_and_cylinder(self):
        assert len(mobius_board(20, 4, 10).adjacency) == 80
        assert len(cylinder_board(12, 7, 10).adjacency) == 84

    def test_penrose_cell_counts(self):
        assert len(penrose_board(3, 9).adjacency) == 60
        assert len(penrose_board(4, 25).adjacency) == 160
        assert len(penrose_board(5, 70).adjacency) == 430

    def test_penrose_keep_crops_to_a_denser_square_block(self):
        full = penrose_board(5, 25)
        cropped = penrose_board(5, 25, keep=160)
        assert len(cropped.adjacency) == 160
        assert cropped.width / cropped.height < 1.3  # roughly square
        # the square crop fills its bounding box better than the round wheel
        full_density = len(full.adjacency) / (full.width * full.height)
        crop_density = len(cropped.adjacency) / (cropped.width * cropped.height)
        assert crop_density > full_density

    def test_penrose_thick_outnumber_thin_by_phi(self):
        board = penrose_board(5, 70)
        thin = sum(1 for cell in board.adjacency if cell[0] == 0)
        thick = sum(1 for cell in board.adjacency if cell[0] == 1)
        assert abs(thick / thin - 1.618) < 0.02

    def test_penrose_cells_are_rhombi(self):
        board = penrose_board(3, 9)
        for polygon in board.polygons.values():
            assert len(polygon) == 4
            # opposite sides of a rhombus have equal length
            def side(i):
                (x1, y1), (x2, y2) = polygon[i], polygon[(i + 1) % 4]
                return ((x2 - x1) ** 2 + (y2 - y1) ** 2) ** 0.5
            sides = [side(i) for i in range(4)]
            assert max(sides) - min(sides) < 1e-6 * max(sides)

    def test_penrose_vertices_are_exact(self):
        # exact Z[zeta] keys: distinct keys must be geometrically far
        # apart (no floating-point near-duplicates)
        board = penrose_board(3, 9)
        points = {p for polygon in board.polygons.values() for p in polygon}
        points = sorted(points)
        min_gap = min(
            ((ax - bx) ** 2 + (ay - by) ** 2) ** 0.5
            for i, (ax, ay) in enumerate(points)
            for bx, by in points[i + 1:i + 30]
        )
        side = penrose_board(3, 9).width / 5  # rhombus side scale
        assert min_gap > side * 0.1

    def test_c180_is_goldberg_gp30(self):
        board = c180_board(10)
        sizes = sorted(len(p) for p in board.polygons.values())
        assert len(board.adjacency) == 92
        assert sizes.count(5) == 12 and sizes.count(6) == 80

    def test_geodesic_sphere_has_80_triangles(self):
        board = sphere_triangle_board(10)
        assert len(board.adjacency) == 80
        assert all(len(p) == 3 for p in board.polygons.values())

    def test_triangle_and_hex_surface_counts(self):
        # ring triangles per row x rows: one cell per lattice triangle
        assert len(torus_triangle_board(20, 6, 14).adjacency) == 120
        assert len(torus_hex_board(6, 12, 9).adjacency) == 72
        assert len(mobius_triangle_board(28, 4, 13).adjacency) == 112
        assert len(mobius_hex_board(14, 3, 6).adjacency) == 42
        assert len(cylinder_triangle_board(16, 6, 11).adjacency) == 96
        assert len(cylinder_hex_board(12, 6, 9).adjacency) == 72


class TestPolygonShapes:
    def test_vertex_counts(self):
        assert all(len(p) == 4 for p in square_board(3, 3, 1).polygons.values())
        assert all(len(p) == 3 for p in triangle_board(4, 2).polygons.values())
        assert all(len(p) == 3 for p in triangle_grid_board(3, 5, 2).polygons.values())
        assert all(len(p) == 6 for p in hex_board(3, 3, 2).polygons.values())
        assert all(len(p) == 5 for p in sphere_board(7).polygons.values())
        assert all(len(p) == 4 for p in torus_board(8, 5, 4).polygons.values())

    # Every triangle-tiled surface carries the same regular triangular
    # lattice the flat and cylinder boards do, so its cells stay as close to
    # equilateral as the immersion's own stretch allows. Splitting a quad
    # grid along a diagonal instead (what these boards used to do) adds a
    # sqrt(2) edge on top of that stretch: medians 1.80 (donut), 2.20
    # (Möbius) and 1.89 (Klein bottle), well above these limits.
    # The Mobius strip's limit is deliberately the loosest of the four. A band
    # whose triangles stay near-equilateral has to be about 80 cells around and
    # 6 across, which reads as a hoop rather than a board; the half twist means
    # any *wider* strip is stretched by the immersion however the window is
    # chosen. Board shape was judged worth more than tile shape here, so the
    # strip is squarer and its triangles are correspondingly less regular.
    _EDGE_RATIO_LIMITS = {"cyltri": 1.15, "torustri": 1.4,
                          "mobiustri": 1.8, "kleintri": 1.7}

    @pytest.mark.parametrize("mode", sorted(_EDGE_RATIO_LIMITS))
    @pytest.mark.parametrize("difficulty", DIFFICULTIES)
    def test_wrapped_triangles_are_near_equilateral(self, mode, difficulty):
        board = build_board(mode, difficulty)
        ratios = []
        for polygon in board.polygons.values():
            edges = [math.dist(polygon[i], polygon[(i + 1) % 3]) for i in range(3)]
            ratios.append(max(edges) / min(edges))
        assert statistics.median(ratios) < self._EDGE_RATIO_LIMITS[mode]


class TestSpectre:
    """The Spectre (Tile(1,1)), the chiral aperiodic monotile.

    These are the tests that say the port of the paper's substitution is
    right: the tile is the published equilateral 14-gon, no placement is
    ever mirrored, and the patch is an exact edge-to-edge tiling of a
    simply connected region (no overlaps, no gaps).
    """

    def test_cell_counts(self):
        # a single Spectre (Delta) cluster inflated N times. A Spectre
        # cluster expands to 7 Spectres + 1 Mystic and a Mystic to 6 + 1
        # (substitution matrix [[7, 6], [1, 1]]), and a Mystic is *two*
        # tiles, so tiles = s + 2m over that recurrence.
        assert len(spectre_board(0, 1).adjacency) == 1
        assert len(spectre_board(1, 2).adjacency) == 9
        assert len(spectre_board(2, 10).adjacency) == 71
        assert len(spectre_board(3, 28).adjacency) == 559
        assert len(spectre_board(4, 65).adjacency) == 4401
        assert len(spectre_board(3, 10, keep=64).adjacency) == 64
        assert len(spectre_board(4, 65, keep=430).adjacency) == 430

    def test_the_tile_is_the_published_equilateral_14_gon(self):
        # Tile(1,1) is "a 13-gon that is also an equilateral 14-gon, two of
        # whose edges are collinear": 14 unit edges, and the interior angle
        # multiset of the paper (one 180 degrees -- the flat vertex where
        # the collinear pair meets).
        polygon = [_z12_to_xy(v) for v in _SPECTRE_OUTLINE]
        assert len(polygon) == 14
        edges = [math.dist(polygon[i], polygon[(i + 1) % 14]) for i in range(14)]
        assert all(abs(e - 1) < 1e-12 for e in edges)
        area = sum(a[0] * b[1] - b[0] * a[1]
                   for a, b in zip(polygon, polygon[1:] + polygon[:1]))
        sign = -1 if area > 0 else 1  # measure into the tile either winding
        angles = []
        for i in range(14):
            a, b, c = polygon[i - 1], polygon[i], polygon[(i + 1) % 14]
            v1, v2 = (a[0] - b[0], a[1] - b[1]), (c[0] - b[0], c[1] - b[1])
            angles.append(round(math.degrees(math.atan2(
                sign * (v1[0] * v2[1] - v1[1] * v2[0]),
                v1[0] * v2[0] + v1[1] * v2[1])) % 360))
        assert sum(angles) == (14 - 2) * 180
        # the published Tile(1,1) angle sequence, with its two reflex corners
        # and the lone 180 at the flat vertex
        assert angles == [90, 240, 90, 120, 270, 120, 90, 120, 270, 120,
                          180, 120, 90, 240]

    def test_every_cell_is_the_same_tile_up_to_rotation(self):
        # a monotile, and a *chiral* one: every cell is the same 14-gon
        # reached by a rotation alone, never a reflection. Reading each
        # cell's edge directions (all multiples of 30 degrees) as a cyclic
        # sequence, a rotation shifts every entry by the same amount --
        # a reflection would reverse the sequence instead.
        board = spectre_board(3, 28)
        base = None
        for polygon in board.polygons.values():
            assert len(polygon) == 14
            steps = []
            for i in range(14):
                a, b = polygon[i], polygon[(i + 1) % 14]
                assert abs(math.dist(a, b) - math.dist(polygon[0], polygon[1])) < 1e-9
                steps.append(round(math.degrees(
                    math.atan2(b[1] - a[1], b[0] - a[0])) / 30) % 12)
            if base is None:
                base = steps
            offsets = {(s - t) % 12 for s, t in zip(steps, base)}
            assert len(offsets) == 1, "tile is not a pure rotation of the others"

    def test_no_placement_is_ever_mirrored(self):
        # the whole point of the chiral tiling: the substitution places
        # tiles by rotation and translation only. Each inflation composes
        # one reflection, which spectre_board cancels at the seed, so the
        # mirror flag is clear at every level.
        for levels in range(5):
            assert {mirrored for _, (_, mirrored, _) in _spectre_leaves(levels)} == {0}

    def test_mystics_are_a_fixed_fraction_of_the_tiles(self):
        # the Mystic clusters (label Gamma1/Gamma2, two tiles each) are
        # 2*63 of the 559 tiles at level 3 -- the m of the [[7, 6], [1, 1]]
        # recurrence, so the labels track the clusters they came from
        board = spectre_board(3, 28)
        mystic = sum(1 for cell in board.adjacency if cell[0].startswith("Gamma"))
        assert mystic == 2 * 63

    def test_vertices_are_exact(self):
        # exact Z[zeta12] ids: distinct keys are never closer than half the
        # (unit) edge, so there are no floating-point near-duplicates. Unlike
        # the hat's Eisenstein lattice, Z[zeta12] is dense in the plane --
        # this is what the integer-only placements buy.
        board = spectre_board(3, 10, keep=64)
        points = sorted({p for polygon in board.polygons.values() for p in polygon})
        min_gap = min(
            math.dist(a, b)
            for i, a in enumerate(points) for b in points[i + 1:i + 30]
        )
        shortest_edge = min(
            math.dist(polygon[i], polygon[(i + 1) % 14])
            for polygon in board.polygons.values() for i in range(14)
        )
        assert min_gap > shortest_edge * 0.5

    def test_tiling_is_edge_to_edge(self):
        # every tile edge is shared by at most two tiles, on exact ids --
        # so no tile's corner lands in the middle of another's edge (which
        # is why the flat vertex has to stay in the polygon)
        board = spectre_board(3, 28)
        shared = Counter()
        for polygon in board.polygons.values():
            for i in range(14):
                shared[frozenset((polygon[i], polygon[(i + 1) % 14]))] += 1
        assert max(shared.values()) == 2

    def test_tiles_cover_the_patch_exactly(self):
        # the strongest check on the substitution: the tile areas sum to the
        # area enclosed by the patch's outer boundary, so there is neither an
        # overlap nor a gap anywhere. The boundary is the directed edges with
        # no opposite partner, walked as one cycle.
        board = spectre_board(2, 10)

        def shoelace(points):
            return abs(sum(a[0] * b[1] - b[0] * a[1] for a, b
                           in zip(points, points[1:] + points[:1]))) / 2

        directed = Counter()
        for polygon in board.polygons.values():
            for i in range(14):
                directed[(polygon[i], polygon[(i + 1) % 14])] += 1
        # each directed edge used once: consistent winding, no doubled tile
        assert set(directed.values()) == {1}

        step = {a: b for a, b in directed if (b, a) not in directed}
        assert len(step) == len({b for _, b in step.items()})
        start = next(iter(step))
        loop, at = [start], step[start]
        while at != start:
            loop.append(at)
            at = step[at]
        assert len(loop) == len(step)  # the boundary is a single cycle

        tile_area = shoelace([_z12_to_xy(v) for v in _SPECTRE_OUTLINE])
        scale = math.dist(*list(board.polygons.values())[0][:2])
        assert shoelace(loop) == pytest.approx(
            tile_area * scale**2 * len(board.polygons), rel=1e-9)


class TestAmmannBeenker:
    """The Ammann-Beenker tiling: squares and 45-degree rhombi, eight-fold.

    The substitution in ``aperiodic.py`` is a table read off the tiling, so
    these check it against the tiling's *other* definition, which owes it
    nothing: cut and project. A vertex's Z[zeta8] coefficients are a point of
    Z^4; the Galois map zeta -> zeta^3 sends it to "internal space", and the
    Ammann-Beenker vertices are exactly the lattice points landing inside the
    regular octagon there (the 4-cube's shadow, edge 1). Every vertex the
    substitution lays has to land inside, and every lattice point that lands
    inside has to be a vertex -- which is the whole tiling, not a resemblance.
    The ring arithmetic is re-checked in plain ``cmath`` first.
    """

    _ZETA = cmath.exp(1j * math.pi / 4)
    _SILVER = 1 + math.sqrt(2)

    @classmethod
    def _complex(cls, p, power=1):
        return sum(c * cls._ZETA ** (power * k) for k, c in enumerate(p))

    @classmethod
    def _inside_window(cls, p):
        """How far inside the octagon window ``p``'s internal image lies --
        positive inside. The octagon's edges face the eight directions zeta^k
        and sit (1 + sqrt(2)) / 2 from its centre."""
        w = cls._complex(p, 3)
        return min(cls._SILVER / 2 - (w * cls._ZETA ** -k).real for k in range(8))

    def test_the_ring_arithmetic_is_complex_arithmetic(self):
        points = list(itertools.product(range(-2, 3), repeat=4))[::37]
        for p in points:
            z = self._complex(p)
            assert self._complex(_zeta8_mul(p)) == pytest.approx(z * self._ZETA)
            assert self._complex(_z8_rot(p, 5)) == pytest.approx(z * self._ZETA ** 5)
            assert self._complex(_z8_conj(p)) == pytest.approx(z.conjugate())
            assert self._complex(_z8_silver(p)) == pytest.approx(z * self._SILVER)
        # 1/delta = sqrt(2) - 1 is in the ring too, which is what makes the
        # silver ratio a unit there and the inflation invertible
        assert _z8_silver((-1, 1, 0, -1)) == (1, 0, 0, 0)

    def test_the_substitution_counts(self):
        # rhombus -> 3 rhombi + 4 half-squares, half-square -> 2 + 3: the
        # matrix [[3, 2], [4, 3]], whose growth is delta**2 = 3 + 2*sqrt(2)
        # per level and whose eigenvector puts sqrt(2) half-squares to the
        # rhombus -- one square to every sqrt(2) rhombi, the tiling's ratio
        rhombi, halves = 8, 0
        for levels in range(5):
            kinds = Counter(kind for kind, _ in _ab_tiles(levels))
            assert kinds == Counter({"R": rhombi, "H": halves} if halves else {"R": rhombi})
            rhombi, halves = 3 * rhombi + 2 * halves, 4 * rhombi + 3 * halves
        assert [len(ammann_beenker_board(n, 1).adjacency) for n in range(5)] == \
            [8, 32, 216, 1312, 7784]

    def test_every_cell_is_a_unit_square_or_rhombus(self):
        units = {_z8_rot((1, 0, 0, 0), k): k for k in range(8)}
        for (kind, _), ids in _ab_cells(3):
            assert len(ids) == len(set(ids)) == 4
            steps = [units[_z8_sub(ids[(i + 1) % 4], ids[i])] for i in range(4)]
            # counterclockwise: every turn is the same left turn, 90 degrees
            # for a square and alternately 45/135 for a rhombus's exterior
            turns = [(steps[(i + 1) % 4] - steps[i]) % 8 for i in range(4)]
            assert turns == ([2, 2, 2, 2] if kind == 1 else turns[:2] * 2)
            assert kind == 1 or sorted(turns[:2]) == [1, 3]

    def test_the_patch_is_the_cut_and_project_tiling(self):
        cells = _ab_cells(3)
        vertices = {v for _, ids in cells for v in ids}
        assert min(self._inside_window(v) for v in vertices) > 1e-9
        # ...and nothing is missing: every lattice point inside the window and
        # well inside the patch (the eight-rhombus star inflated three times,
        # whose inner corners sit delta**3 out) is a vertex of it
        reach = 0.6 * self._SILVER ** 3
        span = range(-math.ceil(reach) - 1, math.ceil(reach) + 2)
        missing = [p for p in itertools.product(span, repeat=4)
                   if abs(self._complex(p)) < reach and self._inside_window(p) > 1e-9
                   and p not in vertices]
        assert missing == []

    def test_halves_pair_into_squares_across_their_marked_diagonal(self):
        # the two halves of a square are mirror images sharing P and Q, and a
        # half left over is one the patch's rim cut: its diagonal lies on the
        # outline of the eight-rhombus star the patch inflates
        levels = 3
        halves = defaultdict(list)
        for kind, at in _ab_tiles(levels):
            if kind == "H":
                o, p, q = (_ab_place(at, v) for v in _AB_HALF)
                halves[(p, q)].append((o, at[1]))
        tip = self._SILVER ** levels
        outline = [tip * self._ZETA ** k * (1 + self._ZETA) if j else tip * self._ZETA ** k
                   for k in range(8) for j in (0, 1)]

        def on_rim(z):
            for a, b in zip(outline, outline[1:] + outline[:1]):
                t = ((z - a) / (b - a))
                if abs(t.imag) < 1e-9 and -1e-9 < t.real < 1 + 1e-9:
                    return True
            return False

        for (p, q), group in halves.items():
            if len(group) == 2:
                (o1, m1), (o2, m2) = group
                assert m1 != m2 and o1 != o2
            else:
                assert len(group) == 1
                assert on_rim(self._complex(p)) and on_rim(self._complex(q))

    def test_it_has_the_octagons_symmetry(self):
        cells = {frozenset(ids) for _, ids in _ab_cells(3)}
        assert {frozenset(_z8_rot(v, 1) for v in c) for c in cells} == cells
        assert {frozenset(_z8_conj(v) for v in c) for c in cells} == cells

    def test_every_vertex_is_one_of_the_six(self):
        # Ammann-Beenker has exactly six vertex neighbourhoods, one for each
        # count of tiles from three to eight, read off by their corner angles
        legal = {(90, 135, 135), (45, 90, 90, 135), (45, 45, 90, 90, 90),
                 (45, 45, 45, 45, 90, 90), (45,) * 6 + (90,), (45,) * 8}
        corners = defaultdict(list)
        for _, ids in _ab_cells(4):
            for i, v in enumerate(ids):
                a, b, c = (self._complex(ids[(i + j) % 4]) for j in (-1, 0, 1))
                corners[v].append(round(math.degrees(abs(cmath.phase((c - b) / (a - b))))))
        reach = 0.6 * self._SILVER ** 4
        seen = {tuple(sorted(angles)) for v, angles in corners.items()
                if abs(self._complex(v)) < reach}
        assert seen == legal

    def test_the_patch_is_a_disc(self):
        board = ammann_beenker_board(3, 100)
        assert _euler_characteristic(board) == 1
        assert _boundary_components(board) == 1
        shared = Counter()
        for polygon in board.polygons.values():
            for i in range(4):
                shared[frozenset((polygon[i], polygon[(i + 1) % 4]))] += 1
        assert max(shared.values()) == 2  # edge to edge


class TestAperiodicVariants:
    """The substitution boards are a *family* per preset.

    An aperiodic tiling repeats nowhere, and each of these grows far more
    of one than a board keeps -- so ``variant`` picks which window onto
    the patch the board is, and a game followed by another is played
    somewhere else in the same tiling. These tests say every window is a
    board (the promised size, one piece, no hole) and that different
    variants are different boards; data/conformance.json is what says a
    given variant is the same board in the TypeScript port too.

    The preset arguments are used rather than round numbers, so what is
    checked is the boards the game actually deals.
    """

    CASES = [
        ("penrose easy", penrose_board, (5, 6, 437.727, 81), 81),
        ("penrose medium", penrose_board, (6, 17, 500.0, 256), 256),
        ("penrose hard", penrose_board, (7, 48, 769.119, 480), 480),
        ("kitedart easy", kitedart_board, (4, 6, 270.53, 81), 81),
        ("kitedart medium", kitedart_board, (6, 29, 500.0, 256), 256),
        ("kitedart hard", kitedart_board, (6, 73, 769.119, 450), 450),
        ("ammannbeenker easy", ammann_beenker_board, (3, 9, 35.891, 81), 81),
        ("ammannbeenker medium", ammann_beenker_board, (3, 28, 25.905, 280), 280),
        ("ammannbeenker hard", ammann_beenker_board, (4, 82, 25.319, 480), 480),
        ("spectre easy", spectre_board, (3, 11, 81, 14.361), 81),
        ("spectre medium", spectre_board, (4, 37, 256, 9.437), 256),
        ("spectre hard", spectre_board, (4, 89, 480, 8.512), 480),
    ]

    @pytest.mark.parametrize("name,builder,args,keep", CASES)
    def test_every_variant_is_a_board(self, name, builder, args, keep):
        seen = set()
        for variant in range(8):
            board = builder(*args, variant)
            assert len(board.polygons) == keep
            # a disc: an island would be 2, a hole 0
            assert _euler_characteristic(board) == 1
            assert _boundary_components(board) == 1
            assert _connected(board)
            seen.add(frozenset(board.polygons))
        # ...and different boards, not one board eight times. Not necessarily
        # eight of them: a variant whose own window is rejected (bitten into,
        # or not a disc) walks on to the next candidate in the pool, so two
        # neighbouring variants can land on the same window. What the game
        # deals is deduplicated -- scripts/difficulty/windows.py drops a
        # repeat, and test_every_measured_window_is_a_board checks that.
        assert len(seen) >= 6

    @pytest.mark.parametrize("name,builder,args,keep", CASES)
    def test_a_variant_is_the_same_board_every_time(self, name, builder, args, keep):
        assert builder(*args, 3).polygons.keys() == builder(*args, 3).polygons.keys()

    def test_variant_zero_is_the_centred_patch(self):
        # The default argument and an explicit 0 are the same board, so a
        # caller that knows nothing about variants (the exporters, the
        # menu icons) keeps the patch this game shipped with.
        assert penrose_board(5, 6, 437.727, 81).polygons.keys() == \
            penrose_board(5, 6, 437.727, 81, 0).polygons.keys()
        assert spectre_board(3, 11, 81, 14.361).polygons.keys() == \
            spectre_board(3, 11, 81, 14.361, 0).polygons.keys()
        assert kitedart_board(4, 6, 270.53, 81).polygons.keys() == \
            kitedart_board(4, 6, 270.53, 81, 0).polygons.keys()

    @pytest.mark.parametrize("variant", [2**32 - 1, 2**31, -7])
    def test_any_integer_wraps_into_the_pool(self, variant):
        # The front-ends hand a 32-bit seed straight through rather than a
        # small index, so the argument has to wrap rather than run off the
        # end of the pool of windows.
        board = penrose_board(5, 6, 437.727, 81, variant)
        assert len(board.polygons) == 81
        assert _euler_characteristic(board) == 1

    def test_the_window_sits_inside_the_patch(self):
        # Not merely a disc: a window that ran off the rim would be a
        # crescent rather than the square block the trim promises.
        for variant in range(6):
            board = spectre_board(4, 89, 480, 8.512, variant)
            assert 0.7 < board.width / board.height < 1.4

    @pytest.mark.parametrize(
        "mode", ["phyllotaxis", "klaassen", "pentaspiral5", "pentaspiral6",
                 "pentaspiral7", "brickrings", "square", "sphinx"])
    def test_every_other_board_ignores_the_seed(self, mode):
        # Only the substitution tilings vary. The spiral and the brick
        # rings are nonperiodic by symmetry -- one distinguished centre,
        # no second window onto it -- and the rest are periodic.
        assert build_board(mode, "easy", 12345).polygons.keys() == \
            build_board(mode, "easy").polygons.keys()

    def test_build_board_deals_a_different_window_per_seed(self):
        # The seam both front-ends use: the game's seed picks the window,
        # so a re-deal is a new patch rather than new mines on the old one.
        patches = {
            frozenset(build_board("spectre", "easy", seed).polygons)
            for seed in range(1, 6)
        }
        assert len(patches) == 5

    @pytest.mark.parametrize("mode", ["penrose", "kitedart", "ammannbeenker", "spectre"])
    @pytest.mark.parametrize("difficulty", list(DIFFICULTIES))
    def test_only_measured_windows_are_dealt(self, mode, difficulty):
        # A window is a board of its own, so which ones a difficulty may
        # deal is measured (scripts/difficulty/windows.py) rather than
        # taken from the whole pool. Every seed has to land in that list,
        # and the centred window -- the one the mine count was fitted on
        # -- has to be the first of them.
        windows = _WINDOWS[mode][difficulty]["windows"]
        assert windows[0] == 0
        assert len(windows) == len(set(windows))
        assert len(windows) >= 8  # enough that a player does not exhaust them
        dealt = {window_for(mode, difficulty, seed) for seed in range(500)}
        assert dealt <= set(windows)
        assert dealt == set(windows)  # ...and every one of them is reachable

    @pytest.mark.parametrize("mode", ["penrose", "kitedart", "ammannbeenker", "spectre"])
    def test_no_dealt_window_is_bitten_into(self, mode):
        """Every window the game deals is a filled square, not one with a
        chunk missing.

        A window is the ``keep`` tiles *nearest* its centre, so where its
        square runs past the end of the grown patch there is nothing to
        fill it with. ``aperiodic._notch`` is what rejects those; this
        measures the same thing again from the outside -- how far inside a
        window's square the patch's own rim reaches, in tiles -- over every
        window in data/windows.json rather than the handful the gate saw
        last. Under one and a half tiles is the ordinary raggedness of a
        rim; a notch is what the user called a big empty area on the edge.
        """
        import minesweeper.boards.aperiodic as aperiodic

        for difficulty in DIFFICULTIES:
            captured = {}
            real = aperiodic._window

            def spy(cells, centroids, tiebreaks, keep, variant, _real=real):
                kept = _real(cells, centroids, tiebreaks, keep, variant)
                captured[variant] = (centroids, kept, keep, cells)
                return kept

            aperiodic._window = spy
            try:
                for seed in range(len(_WINDOWS[mode][difficulty]["windows"])):
                    build_board(mode, difficulty, seed)
            finally:
                aperiodic._window = real

            for variant, (centroids, kept, keep, cells) in captured.items():
                if variant == 0:
                    # The centred window is the board the game shipped and the
                    # one the mine count was fitted to, so it is not up for
                    # rejection -- and the Spectre's hard board measures 2.0
                    # tiles here, which is the standard the rest are held
                    # *below* rather than to.
                    continue
                _, depth = aperiodic._patch_shape(cells)  # once per grown patch
                xs = [centroids[i][0] for i in kept]
                ys = [centroids[i][1] for i in kept]
                cx, cy = (min(xs) + max(xs)) / 2, (min(ys) + max(ys)) / 2
                def chebyshev(i, cx=cx, cy=cy, centroids=centroids):
                    return max(abs(centroids[i][0] - cx), abs(centroids[i][1] - cy))

                half = max(chebyshev(i) for i in kept)
                deepest = max((half - chebyshev(i) for i in range(len(cells)) if depth[i] == 0),
                              default=0.0)
                tile = 2 * half / math.sqrt(keep)
                assert deepest <= tile * 1.5 + 1e-9, (
                    f"{mode}/{difficulty} window {variant} is bitten "
                    f"{deepest / tile:.2f} tiles deep"
                )

    @pytest.mark.parametrize("mode", ["penrose", "kitedart", "ammannbeenker", "spectre"])
    def test_every_measured_window_is_a_board(self, mode):
        # The list is data, and data can go stale against a preset that
        # changed shape under it -- so each window it names still has to
        # build the board the difficulty promises. Seed i deals window i,
        # so the seeds below walk the whole list.
        for difficulty in DIFFICULTIES:
            cells = len(build_board(mode, difficulty).polygons)
            seen = set()
            for seed in range(len(_WINDOWS[mode][difficulty]["windows"])):
                board = build_board(mode, difficulty, seed)
                assert len(board.polygons) == cells
                assert _euler_characteristic(board) == 1
                seen.add(frozenset(board.polygons))
            # ...and no two of them are the same board under two numbers
            assert len(seen) == len(_WINDOWS[mode][difficulty]["windows"])


class TestKiteDart:
    """Penrose's kites and darts (P2).

    The same Robinson triangles and the same ring as the rhombi, paired along
    a leg instead of the base, with a substitution of their own. What says the
    construction is the tiling it claims to be: every cell is one of the two
    tiles, kites outnumber darts by phi, the patch is a disc, and every
    interior vertex is one of the seven vertex figures a kite-and-dart tiling
    has -- the property that fails first when a substitution is wrong.
    """

    PHI = (1 + 5**0.5) / 2

    # (color, corner index) -> the corner it is: a cell is (apex, side, axis
    # end, side), the apex being a kite's tip and a dart's reflex corner
    CORNERS = {(0, 0): "kite tip", (0, 1): "kite side", (0, 2): "kite tail",
               (0, 3): "kite side", (1, 0): "dart reflex", (1, 1): "dart side",
               (1, 2): "dart tip", (1, 3): "dart side"}

    @staticmethod
    def _angle(polygon, i):
        """Interior angle at corner i, in degrees, reflex included."""
        n = len(polygon)
        (px, py), (cx, cy), (nx, ny) = polygon[i - 1], polygon[i], polygon[(i + 1) % n]
        area = sum(polygon[k][0] * polygon[(k + 1) % n][1]
                   - polygon[(k + 1) % n][0] * polygon[k][1] for k in range(n))
        turn = math.atan2((cx - px) * (ny - cy) - (cy - py) * (nx - cx),
                          (cx - px) * (nx - cx) + (cy - py) * (ny - cy))
        return 180 - math.degrees(turn) * (1 if area > 0 else -1)

    def test_cells_are_kites_and_darts(self):
        board = kitedart_board(4, 0)
        for cell, polygon in board.polygons.items():
            angles = [round(self._angle(polygon, i)) for i in range(4)]
            sides = [math.dist(polygon[i], polygon[(i + 1) % 4]) for i in range(4)]
            if cell[0] == 0:
                assert angles == [72, 72, 144, 72]
            else:
                assert angles == [216, 36, 72, 36]
            # the two edges at the apex are equal, and so are the two at the
            # axis end, and the tip's two are phi times the other two
            assert math.isclose(sides[0], sides[3]) and math.isclose(sides[1], sides[2])
            tip_edges, other = (sides[0], sides[1]) if cell[0] == 0 else (sides[1], sides[0])
            assert math.isclose(tip_edges / other, self.PHI)
        # one size of tile: a dart's long edge is a kite's long edge
        long_edges = {round(max(math.dist(p[i], p[(i + 1) % 4]) for i in range(4)), 6)
                      for p in board.polygons.values()}
        assert len(long_edges) == 1

    def test_kites_outnumber_darts_by_phi(self):
        board = kitedart_board(7, 0)
        kites = sum(1 for cell in board.adjacency if cell[0] == 0)
        darts = len(board.adjacency) - kites
        assert abs(kites / darts - self.PHI) < 0.02

    def test_cell_counts(self):
        # the sun deflated: 5 kites, then 15, 35, 95, 265, 705, 1855 tiles
        counts = [len(kitedart_board(k, 0).adjacency) for k in range(7)]
        assert counts == [5, 15, 35, 95, 265, 705, 1855]

    def test_patch_is_a_disc(self):
        board = kitedart_board(5, 0)
        assert _euler_characteristic(board) == 1
        assert _boundary_components(board) == 1
        assert _connected(board)

    def test_every_interior_vertex_is_one_of_the_seven(self):
        board = kitedart_board(7, 0)
        edges = Counter(frozenset(e) for p in board.polygons.values()
                        for e in zip(p, p[1:] + p[:1]))
        rim = {v for e, n in edges.items() if n == 1 for v in e}
        figures = defaultdict(list)
        for cell, polygon in board.polygons.items():
            for i, vertex in enumerate(polygon):
                figures[vertex].append(self.CORNERS[(cell[0], i)])
        seen = Counter(tuple(sorted(f)) for v, f in figures.items() if v not in rim)
        assert set(seen) == {
            ("kite tip",) * 5,                                          # sun
            ("dart tip",) * 5,                                          # star
            ("dart reflex", "kite side", "kite side"),                  # ace
            ("dart side", "dart side", "kite tail", "kite tail"),       # deuce
            ("dart side", "dart side", "kite tail", "kite tip", "kite tip"),  # jack
            ("dart tip", "kite side", "kite side", "kite side", "kite side"),  # queen
            ("dart tip", "dart tip", "dart tip", "kite side", "kite side"),  # king
        }

    def test_vertices_are_exact(self):
        # exact Z[zeta] keys: distinct keys must be geometrically far apart
        board = kitedart_board(4, 0)
        points = sorted({p for polygon in board.polygons.values() for p in polygon})
        short = min(math.dist(p[i], p[(i + 1) % 4])
                    for p in board.polygons.values() for i in range(4))
        min_gap = min(math.dist(a, b) for i, a in enumerate(points)
                      for b in points[i + 1:i + 30])
        assert min_gap > short * 0.3

    @pytest.mark.parametrize("difficulty", list(DIFFICULTIES))
    def test_the_centred_board_has_the_sun_in_the_middle(self, difficulty):
        # The seed's centre alternates under deflation -- five kite tips, then
        # five dart tips, then a sun again -- and every preset deflates an even
        # number of times, so each centred board is laid round the sun.
        board = build_board("kitedart", difficulty)
        middle = (board.width / 2, board.height / 2)
        tips = Counter(polygon[0] for cell, polygon in board.polygons.items()
                       if cell[0] == 0)
        suns = [v for v, n in tips.items() if n == 5]
        nearest = min(suns, key=lambda v: math.dist(v, middle))
        assert math.dist(nearest, middle) < board.width * 0.05

    @pytest.mark.parametrize("difficulty", list(DIFFICULTIES))
    def test_glyph_sits_in_the_biggest_circle(self, difficulty):
        """The numbers have room in the darts.

        A dart's vertex mean sits a hair from its reflex corner, so a glyph
        centred and sized there is a quarter of what the tile holds. The
        anchor is the centre of the biggest circle each tile holds: for the
        kite the incircle, touching all four edges; for the dart the circle
        that touches both long edges and the reflex corner.
        """
        board = build_board("kitedart", difficulty)
        assert board.glyph_anchors.keys() == board.polygons.keys()

        def to_segment(p, a, b):
            (ax, ay), (bx, by) = a, b
            t = ((p[0] - ax) * (bx - ax) + (p[1] - ay) * (by - ay)) / math.dist(a, b) ** 2
            t = min(1.0, max(0.0, t))
            return math.dist(p, (ax + t * (bx - ax), ay + t * (by - ay)))

        for cell, polygon in board.polygons.items():
            anchor = board.glyph_anchors[cell]
            reach = [to_segment(anchor, polygon[i], polygon[(i + 1) % 4]) for i in range(4)]
            mean = (sum(x for x, _ in polygon) / 4, sum(y for _, y in polygon) / 4)
            at_mean = min(to_segment(mean, polygon[i], polygon[(i + 1) % 4])
                          for i in range(4))
            if cell[0] == 0:
                assert max(reach) - min(reach) < 1e-9 * max(reach)
                assert min(reach) >= at_mean
            else:
                long_edges = (reach[1], reach[2])  # tip at index 2
                corner = math.dist(anchor, polygon[0])
                assert math.isclose(long_edges[0], long_edges[1])
                assert math.isclose(long_edges[0], corner)
                assert min(reach) == pytest.approx(corner)
                assert min(reach) > 3.5 * at_mean


class TestPhyllotaxis:
    """The phyllotactic spiral: one equilateral convex hexagon
    (72/144 degrees) in a five-fold spiral.

    These tests say the construction is the tiling it claims to be: every
    cell is that one hexagon, the patch is an exact tiling of a simply
    connected region, it has five-fold rotational symmetry (which is what
    rules out any translation), and the rosette of five tiles at the centre
    leaves only one legal way to continue.
    """

    # the ten unit steps zeta^k, so an edge's direction is an integer
    _DIRECTIONS = {_z_rot((1, 0, 0, 0), k): k for k in range(10)}

    @classmethod
    def _slots(cls, ids):
        """The 36-degree sectors a tile covers at each of its corners, from
        its exact vertex ids in counterclockwise order. Two tiles overlap
        exactly when they share a corner and a sector there."""
        out = {}
        for i, vertex in enumerate(ids):
            out_dir = cls._DIRECTIONS[_z_sub(ids[(i + 1) % 6], vertex)]
            in_dir = cls._DIRECTIONS[_z_sub(ids[i - 1], vertex)]
            out[vertex] = {(out_dir + j) % 10 for j in range((in_dir - out_dir) % 10)}
        return out

    @classmethod
    def _placements(cls, vertex, sector, occupied):
        """Every placement of the tile covering ``sector`` at ``vertex`` that
        overlaps nothing already placed: each of its six corners, at each of
        the ten rotations, deduplicated by the vertex set it lands on."""
        found = {}
        for rotation in range(10):
            turned = [_z_rot(v, rotation) for v in _PHYLLO_HEX]
            for corner in turned:
                ids = [_z_add(_z_sub(v, corner), vertex) for v in turned]
                slots = cls._slots(ids)
                if sector not in slots[vertex]:
                    continue
                if any(occupied.get(v, set()) & taken for v, taken in slots.items()):
                    continue
                found[frozenset(ids)] = ids
        return list(found.values())

    def test_cell_counts(self):
        # ten 36-degree wedges, each a rings x rings block of the tile's own
        # translation lattice
        assert len(phyllotaxis_board(1, 2).adjacency) == 10
        assert len(phyllotaxis_board(3, 9).adjacency) == 90
        assert len(phyllotaxis_board(6, 40).adjacency) == 360
        assert len(phyllotaxis_board(8, 40, keep=160).adjacency) == 160

    def test_the_tile_is_the_equilateral_72_144_hexagon(self):
        # the one prototile: all six edges equal, angles
        # 72, 144, 144, 72, 144, 144 -- the equilateral parallelohexagon
        # whose 72-degree corners are the five that meet at the centre
        board = phyllotaxis_board(3, 9)
        for polygon in board.polygons.values():
            assert len(polygon) == 6
            edges = [math.dist(polygon[i], polygon[(i + 1) % 6]) for i in range(6)]
            assert max(edges) - min(edges) < 1e-9 * max(edges)
            angles = []
            for i in range(6):
                a, b, c = polygon[i - 1], polygon[i], polygon[(i + 1) % 6]
                v1, v2 = (a[0] - b[0], a[1] - b[1]), (c[0] - b[0], c[1] - b[1])
                angles.append(round(math.degrees(abs(math.atan2(
                    v1[0] * v2[1] - v1[1] * v2[0],
                    v1[0] * v2[0] + v1[1] * v2[1])))))
            assert angles == [72, 144, 144, 72, 144, 144]

    def test_tiles_cover_the_patch_exactly(self):
        # tile areas sum to the area inside the patch's outer boundary, so
        # the ten wedges meet with neither an overlap nor a gap
        board = phyllotaxis_board(4, 20)

        def shoelace(points):
            return abs(sum(a[0] * b[1] - b[0] * a[1] for a, b
                           in zip(points, points[1:] + points[:1]))) / 2

        directed = Counter()
        for polygon in board.polygons.values():
            for i in range(6):
                directed[(polygon[i], polygon[(i + 1) % 6])] += 1
        assert set(directed.values()) == {1}

        step = {a: b for a, b in directed if (b, a) not in directed}
        start = next(iter(step))
        loop, at = [start], step[start]
        while at != start:
            loop.append(at)
            at = step[at]
        assert len(loop) == len(step)  # the boundary is a single cycle
        assert shoelace(loop) == pytest.approx(
            sum(shoelace(p) for p in board.polygons.values()), rel=1e-9)

    def test_the_patch_has_the_spiral_s_five_fold_symmetry(self):
        # a 72-degree turn is wedge j -> wedge j+2, which keeps the odd/even
        # offset -- so the tiling maps onto itself. It is *not* symmetric
        # under the 36-degree turn (that would swap the two parities), which
        # is exactly what makes the five arms curl.
        board = phyllotaxis_board(4, 20)

        def turned(cell):
            wedge, m, n = cell
            return ((wedge + 2) % 10, m, n)

        assert {turned(c) for c in board.adjacency} == set(board.adjacency)
        for cell, neighbors in board.adjacency.items():
            assert set(map(turned, neighbors)) == set(board.adjacency[turned(cell)])

    def test_no_translation_maps_the_patch_onto_itself(self):
        # nonperiodicity, on the finite patch: a five-fold centre forbids any
        # translation (the crystallographic restriction), so no vector taking
        # one tile to another can carry the whole neighbourhood of the centre
        # with it. The same check on a periodic tiling of the same hexagon
        # would pass for its lattice vectors.
        tiles = {frozenset(ids): key for key, ids in _phyllotaxis_tiles(4)}
        centre = [ids for key, ids in _phyllotaxis_tiles(4) if key[1] < 2 and key[2] < 2]
        origin = next(ids for key, ids in _phyllotaxis_tiles(4) if key == (0, 0, 0))
        for target in tiles:
            shift = _z_sub(sorted(target)[0], sorted(origin)[0])
            if shift == (0, 0, 0, 0):
                continue
            assert any(frozenset(_z_add(v, shift) for v in ids) not in tiles
                       for ids in centre)

    def test_the_seed_rosette_forces_the_tiling(self):
        # seeded with the five tiles that meet at the centre, the hexagon
        # can be laid only one way -- which is what makes the spiral the
        # tiling and not one of the tile's periodic ones.
        # Filling the innermost uncovered corner each time, there is
        # never a choice -- exactly one placement of the tile fits -- and it
        # is always the tile the closed form puts there.
        patch = {frozenset(ids) for _, ids in _phyllotaxis_tiles(4)}
        placed = [ids for key, ids in _phyllotaxis_tiles(4)
                  if key[0] % 2 == 0 and key[1:] == (0, 0)]
        occupied: dict = {}
        for ids in placed:
            for vertex, sectors in self._slots(ids).items():
                occupied.setdefault(vertex, set()).update(sectors)

        for _ in range(40):
            gaps = [(vertex, sector) for vertex, taken in occupied.items()
                    for sector in range(10) if sector not in taken]
            vertex, sector = min(gaps, key=lambda gap: (
                round(math.hypot(*_z_to_xy(gap[0])), 9),
                round(math.atan2(*reversed(_z_to_xy(gap[0]))), 9), gap[1]))
            options = self._placements(vertex, sector, occupied)
            assert len(options) == 1, "the seed leaves a choice"
            assert frozenset(options[0]) in patch
            for v, sectors in self._slots(options[0]).items():
                occupied.setdefault(v, set()).update(sectors)


class TestKlaassen:
    """Klaassen's spiral monotile: one equilateral heptagon, one spiral arm."""

    @staticmethod
    def _interior_angles(points):
        n = len(points)
        area = sum(a[0] * b[1] - b[0] * a[1]
                   for a, b in zip(points, points[1:] + points[:1]))
        angles = []
        for i in range(n):
            a, b, c = points[i - 1], points[i], points[(i + 1) % n]
            turn = math.atan2(
                (b[0] - a[0]) * (c[1] - b[1]) - (b[1] - a[1]) * (c[0] - b[0]),
                (b[0] - a[0]) * (c[0] - b[0]) + (b[1] - a[1]) * (c[1] - b[1]))
            angles.append(math.pi - turn * math.copysign(1, area))
        return angles

    def test_the_tile_is_the_equilateral_seventh_turn_heptagon(self):
        # every tile: seven equal edges along the seven 7th roots of unity,
        # angles pi/7, 9pi/7, 9pi/7, pi/7, 5pi/7, 5pi/7, 5pi/7 from a tip
        for _, ids in _klaassen_tiles(3):
            points = [_z7_to_xy(v) for v in ids]
            edges = [math.dist(points[i], points[(i + 1) % 7]) for i in range(7)]
            assert edges == pytest.approx([1.0] * 7, abs=1e-9)
            sevenths = [round(a / (math.pi / 7), 6)
                        for a in self._interior_angles(points)]
            assert sevenths == [1, 9, 9, 1, 5, 5, 5]

    def test_tiles_cover_the_patch_exactly(self):
        # edge to edge, with neither an overlap nor a gap: every edge is used
        # once each way or lies on the rim, the rim is one cycle, and the
        # tiles' areas add up to the area it encloses
        board = klaassen_board(5, 20)

        def shoelace(points):
            return abs(sum(a[0] * b[1] - b[0] * a[1] for a, b
                           in zip(points, points[1:] + points[:1]))) / 2

        directed = Counter()
        for polygon in board.polygons.values():
            for i in range(7):
                directed[(polygon[i], polygon[(i + 1) % 7])] += 1
        assert set(directed.values()) == {1}
        step = {a: b for a, b in directed if (b, a) not in directed}
        start = next(iter(step))
        loop, at = [start], step[start]
        while at != start:
            loop.append(at)
            at = step[at]
        assert len(loop) == len(step)
        assert shoelace(loop) == pytest.approx(
            sum(shoelace(p) for p in board.polygons.values()), rel=1e-9)

    def test_four_tips_meet_at_every_hub_but_the_seed(self):
        # a tile's two needle tips (its pi/7 corners) land on the chain of
        # hubs, four to a hub -- except the seed, where the chain turns back
        # on itself and nine tiles fan out of one vertex
        tips = Counter()
        tiles = _klaassen_tiles(6)
        for _, ids in tiles:
            tips[ids[0]] += 1
            tips[ids[3]] += 1
        seed = _klaassen_tiles(6)[0][1][0]
        assert tips[seed] == 9
        inner = {ids[0] for (hub, _), ids in tiles if hub < len(tiles) // 4}
        assert {tips[h] for h in inner - {seed}} == {4}

    def test_the_seed_chain(self):
        # the first hubs, one unit step apart in the directions the figure
        # shows: back on itself at the seed, then round the first winding a
        # fourteenth of a turn per step
        steps = (8, 10, 12, 14, 15, 16, 17, 18, 19, 20, 21, 22, 22, 23, 24, 24)
        at, chain = (0,) * 6, []
        for d in steps:
            chain.append(at)
            at = _z7_add(at, _z7_dir(d))
        hubs = {ids[0] for _, ids in _klaassen_tiles(3)}
        assert set(chain) <= hubs
        assert sum(1 for (hub, _), _ids in _klaassen_tiles(3) if hub == 0) == 9

    def test_no_translation_maps_the_patch_onto_itself(self):
        # nonperiodic: no vector taking the seed's tile to another tile
        # carries the whole seed fan with it
        tiles = {frozenset(ids) for _, ids in _klaassen_tiles(4)}
        seed = [ids for (hub, _), ids in _klaassen_tiles(4) if hub == 0]
        origin = seed[0]
        for target in tiles:
            shift = tuple(a - b for a, b in zip(min(target), min(origin)))
            if not any(shift):
                continue
            assert any(frozenset(tuple(a + b for a, b in zip(v, shift)) for v in ids)
                       not in tiles for ids in seed)

    @pytest.mark.parametrize("difficulty", list(DIFFICULTIES))
    def test_every_board_is_a_disc(self, difficulty):
        board = build_board("klaassen", difficulty)
        assert _euler_characteristic(board) == 1


class TestPentaSpiral:
    """Klaassen's pentagonal spirals: one convex pentagon, n-fold symmetric."""

    FOLDS = (5, 6, 7)

    @staticmethod
    def _corners(fold, corners):
        _, to_xy = _PENTA_RINGS[fold]
        return [to_xy(p) for p, _, _ in corners]

    @pytest.mark.parametrize("fold", FOLDS)
    def test_cell_counts(self, fold):
        # 2n wedges, each a rings x rings block of hexagons, two pentagons each
        assert len(pentaspiral_board(fold, 1, 2).adjacency) == 4 * fold
        assert len(pentaspiral_board(fold, 3, 9).adjacency) == 36 * fold
        assert len(pentaspiral_board(fold, 6, 40, keep=160).adjacency) == 160

    @pytest.mark.parametrize("fold", FOLDS)
    def test_the_tile_is_klaassen_s_pentagon(self, fold):
        # angles A B C D E = 180 - 180/n, 360/n, 180 - 180/n, D, 180 - D, and
        # sides b = c = 3, a = 1, d = 2 (a ends at A, b at B...), on every tile
        # alike -- congruent, and never mirrored.
        shapes = set()
        for _, corners in _pentaspiral_tiles(fold, 3):
            points = self._corners(fold, corners)
            angles = TestKlaassen._interior_angles(points)
            sides = [math.dist(points[i], points[(i + 1) % 5]) for i in range(5)]
            # rotate the walk so it starts at B, the 360/n corner
            b = min(range(5), key=lambda i: angles[i])
            angles = angles[b:] + angles[:b]
            sides = sides[b:] + sides[:b]
            assert math.degrees(angles[0]) == pytest.approx(360 / fold)
            assert math.degrees(angles[1]) == pytest.approx(180 - 180 / fold)
            assert math.degrees(angles[4]) == pytest.approx(180 - 180 / fold)
            assert math.degrees(angles[2] + angles[3]) == pytest.approx(180)
            assert sides[0] == pytest.approx(3) and sides[4] == pytest.approx(3)
            assert sides[1] == pytest.approx(1) and sides[3] == pytest.approx(2)
            shapes.add(tuple(round(x, 6) for x in angles + sides))
        assert len(shapes) == 1

    @pytest.mark.parametrize("fold", FOLDS)
    def test_two_halves_make_the_spiral_s_hexagon(self, fold):
        # glued along the cut, the pair is the equilateral hexagon with angles
        # 360/n, 180 - 180/n, 180 - 180/n: the phyllotactic spiral's tile at
        # n-fold, which is what the wedge construction lays down.
        tiles = dict(_pentaspiral_tiles(fold, 2))
        for (wedge, m, n, half), corners in tiles.items():
            if half:
                continue
            first = [p for p, _, _ in corners]
            second = [p for p, _, _ in tiles[(wedge, m, n, 1)]]
            assert set(first) & set(second) == {first[2], first[3]}

    @pytest.mark.parametrize("fold", FOLDS)
    def test_tiles_cover_the_patch_exactly(self, fold):
        # every edge (with its T-vertices) is used once each way or is on the
        # rim, the rim is one loop, and the tile areas sum to the area inside it
        board = pentaspiral_board(fold, 4, 20)

        def shoelace(points):
            return abs(sum(a[0] * b[1] - b[0] * a[1] for a, b
                           in zip(points, points[1:] + points[:1]))) / 2

        directed = Counter()
        for polygon in board.polygons.values():
            for i in range(len(polygon)):
                directed[(polygon[i], polygon[(i + 1) % len(polygon)])] += 1
        assert set(directed.values()) == {1}
        step = {a: b for a, b in directed if (b, a) not in directed}
        start = next(iter(step))
        loop, at = [start], step[start]
        while at != start:
            loop.append(at)
            at = step[at]
        assert len(loop) == len(step)
        assert shoelace(loop) == pytest.approx(
            sum(shoelace(p) for p in board.polygons.values()), rel=1e-9)
        assert _euler_characteristic(board) == 1
        assert _boundary_components(board) == 1

    @pytest.mark.parametrize("fold", FOLDS)
    def test_the_cuts_are_t_vertices(self, fold):
        # not edge to edge: a cut ends a third of the way along a hexagon side,
        # so some tile carries a collinear vertex there -- and without it the
        # neighbour across would not be one.
        board = pentaspiral_board(fold, 3, 9)
        assert any(len(p) > 5 for p in board.polygons.values())
        tiles = _pentaspiral_tiles(fold, 3)
        corners = {p for _, cs in tiles for p, _, _ in cs}
        assert len(corners) < sum(len(cs) for _, cs in tiles)

    @pytest.mark.parametrize("fold", FOLDS)
    def test_the_patch_has_n_fold_symmetry_and_no_more(self, fold):
        # turning by 360/n is wedge w -> w + 2, which keeps the odd wedges'
        # offset; turning by 180/n (w -> w + 1) swaps the parities and fails,
        # which is what curls the arms. And no mirror: the tile is chiral here.
        board = pentaspiral_board(fold, 4, 20)

        def turned(cell, by):
            wedge, m, n, half = cell
            return ((wedge + by) % (2 * fold), m, n, half)

        for cell, neighbors in board.adjacency.items():
            assert set(board.adjacency[turned(cell, 2)]) == {
                turned(c, 2) for c in neighbors}
        assert any(set(board.adjacency[turned(cell, 1)]) != {
            turned(c, 1) for c in neighbors}
            for cell, neighbors in board.adjacency.items())

    def test_the_five_fold_board_is_wikimedia_s(self):
        # The figure on Wikipedia's "Pentagonal tiling" (File:Pentagonal tiling
        # with 5-fold rotational symmetry.svg) was matched tile for tile when
        # this board was built; pin the one fact that match turned on, the cut
        # a third of the way along the u1 side on *every* hexagon -- a mirrored
        # cut on alternate wedges tiles too, but is not that picture.
        cuts = {corners[1][2] for key, corners in _pentaspiral_tiles(5, 2)
                if key[3] == 0}
        assert cuts == {1}

    @pytest.mark.parametrize("fold", FOLDS)
    @pytest.mark.parametrize("difficulty", list(DIFFICULTIES))
    def test_every_board_is_a_disc(self, fold, difficulty):
        # one piece with no hole: a corner of the square window can leave a
        # rim tile touching the board along one edge only, as the
        # phyllotactic spiral's corners touch it along two
        board = build_board(f"pentaspiral{fold}", difficulty)
        assert _euler_characteristic(board) == 1
        assert _boundary_components(board) == 1


class TestBrickRings:
    """The brick rings: 2x1 bricks in concentric square rings about a 2x2 core.

    These say the board is the pattern it claims to be -- an exact tiling of
    the 2r x 2r square in whole bricks, ring by ring, with the square's two
    mirrors and half turn but not its quarter turn, and no translation -- and
    that the T-vertices, where a brick's corner meets the middle of a
    neighbour's long side, are recorded, which is what keeps the patch a mesh
    and the neighbours neighbours.
    """

    RINGS = (1, 2, 3, 4, 6, 8, 11, 15)

    @staticmethod
    def _cells(bricks):
        """Every unit cell a brick list covers, counted."""
        return Counter((x + dx, y + dy)
                       for x, y, w, h in bricks
                       for dx in range(w) for dy in range(h))

    # The 2k x 2k square spans -k .. k-1, so its centre is the lattice
    # *midpoint* (-0.5, -0.5) and a reflection takes the cell x to -1-x. A
    # brick's image therefore starts at -x-w rather than at -x.
    @staticmethod
    def _turned(bricks):
        """A quarter turn about the centre: the cell (x, y) goes to (-1-y, x),
        so the brick's sides swap."""
        return {(-y - h, x, h, w) for x, y, w, h in bricks}

    @staticmethod
    def _flipped(bricks):
        """The mirror across the horizontal centre line."""
        return {(x, -y - h, w, h) for x, y, w, h in bricks}

    @staticmethod
    def _mirrored(bricks):
        """The mirror across the vertical centre line."""
        return {(-x - w, y, w, h) for x, y, w, h in bricks}

    @staticmethod
    def _depth(cell):
        """Which ring a cell belongs to: ring k spans -k .. k-1 on both axes."""
        x, y = cell
        return max(-x, x + 1, -y, y + 1)

    @pytest.mark.parametrize("rings", RINGS)
    def test_the_bricks_cover_the_square_exactly(self, rings):
        cells = self._cells(_brick_rings_tiles(rings))
        assert set(cells.values()) == {1}  # nothing covered twice
        assert len(cells) == (2 * rings) ** 2  # and nothing left uncovered
        xs = {x for x, _ in cells}
        ys = {y for _, y in cells}
        assert (max(xs) - min(xs), max(ys) - min(ys)) == (2 * rings - 1,) * 2

    @pytest.mark.parametrize("rings", RINGS)
    def test_every_tile_is_a_whole_brick(self, rings):
        # Ring k is 2k cells along each of its rows and 2k - 2 up each side,
        # both even, so nothing is ever left over -- no 1x1 at any size.
        assert {(w, h) for _, _, w, h in _brick_rings_tiles(rings)} <= {(2, 1), (1, 2)}

    @pytest.mark.parametrize("rings", RINGS)
    def test_cell_counts(self, rings):
        # 4k - 2 bricks in ring k, so 2r**2 in all
        assert len(_brick_rings_tiles(rings)) == 2 * rings ** 2

    @pytest.mark.parametrize("rings", RINGS)
    def test_each_ring_is_a_square_frame_laid_the_same_way(self, rings):
        # the construction, stated as a property: the tiles at depth k are
        # exactly the boundary of the 2k x 2k square, its top and bottom rows
        # in horizontal bricks and its two sides in vertical ones
        bricks = _brick_rings_tiles(rings)
        by_ring: dict = {}
        for brick in bricks:
            depths = {self._depth(c) for c in self._cells([brick])}
            assert len(depths) == 1, "a brick straddles two rings"
            by_ring.setdefault(depths.pop(), []).append(brick)
        assert sorted(by_ring) == list(range(1, rings + 1))
        for k, ring in by_ring.items():
            lo, hi = -k, k - 1
            square = {(x, y) for x in range(lo, hi + 1) for y in range(lo, hi + 1)}
            inner = {(x, y) for x in range(lo + 1, hi) for y in range(lo + 1, hi)}
            assert set(self._cells(ring)) == square - inner
            for x, y, w, h in ring:
                # a row brick lies flat, a side brick stands up
                assert (w, h) == ((2, 1) if y in (lo, hi) else (1, 2))

    @pytest.mark.parametrize("rings", (2, 3, 6, 11, 15))
    def test_it_has_the_square_s_mirrors_but_not_its_quarter_turn(self, rings):
        # Both mirrors and, as their composition, the half turn. Not the
        # quarter turn: a ring's rows are horizontal bricks where its sides are
        # vertical ones, so turning it a quarter lays bricks across bricks.
        bricks = set(_brick_rings_tiles(rings))
        assert self._flipped(bricks) == bricks
        assert self._mirrored(bricks) == bricks
        assert self._flipped(self._mirrored(bricks)) == bricks  # the half turn
        assert self._turned(bricks) != bricks

    def test_no_translation_maps_the_patch_onto_itself(self):
        # nonperiodicity on the finite patch, the check TestPhyllotaxis makes.
        # The tiles taken are well inside the board, so it is the ring
        # structure that rules a shift out rather than the boundary; a periodic
        # bond of the same brick would pass every one of its lattice vectors.
        patch = set(_brick_rings_tiles(11))
        core = [b for b in patch if abs(b[0]) < 5 and abs(b[1]) < 5]
        assert len(core) > 10
        for dx in range(-6, 7):
            for dy in range(-6, 7):
                if (dx, dy) == (0, 0):
                    continue
                assert any((x + dx, y + dy, w, h) not in patch
                           for x, y, w, h in core)

    def test_the_step_vertices_make_the_patch_a_mesh(self):
        # A brick's corner routinely lands in the middle of a neighbour's long
        # side. Recording it there -- and only where it is genuinely some
        # tile's corner -- is what leaves every edge shared by two tiles, so
        # the topology still reads a disc. Drop them and it does not.
        board = build_board("brickrings", "easy")
        assert (_euler_characteristic(board), _boundary_components(board)) == (1, 1)
        corners_only = _finalize_flat(
            "brickrings",
            {(x, y, w, h): [(x, y), (x + w, y), (x + w, y + h), (x, y + h)]
             for x, y, w, h in _brick_rings_tiles(6)},
            lambda p: (float(p[0]), float(p[1])), 1, 10)
        assert _euler_characteristic(corners_only) != 1
        # none of them changes the drawn tile: they are collinear, which is
        # why _corners drops them again before the shape is measured
        for polygon in board.polygons.values():
            assert len(_corners(polygon, tol=1e-6)) == 4

    def test_the_split_edges_are_what_make_the_neighbours(self):
        # the T-vertices are load-bearing for the game too: a brick lying
        # alongside the middle of another's long side is a neighbour there,
        # and would not be one without them
        full = build_board("brickrings", "easy").adjacency
        corners_only = _shared_vertex_adjacency(
            {(x, y, w, h): [(x, y), (x + w, y), (x + w, y + h), (x, y + h)]
             for x, y, w, h in _brick_rings_tiles(6)})
        assert all(set(corners_only[cell]) <= set(full[cell]) for cell in full)
        assert sum(map(len, corners_only.values())) < sum(map(len, full.values()))


class TestRepTiles:
    """The two rep-4 fractal boards: the sphinx and the chair. (The third
    fractal board, the Sierpinski carpet, inflates the same way but is no
    rep-tile -- its substitution leaves a hole -- so it has its own class.)

    A rep-tile board is one tile inflated ``levels`` times, so what has to
    hold is that the dissection is real -- four half-size tiles filling the
    tile exactly -- and that inflating it keeps every tile congruent to the
    prototile while the patch stays a copy of it. The searches below
    re-derive the hardcoded substitution tables from scratch (an exact cover
    of the size-2 tile by unit tiles), which is what pins them.

    Everything runs on the lattice's unit faces -- the sphinx's six unit
    triangles, the chair's three unit squares -- each held as the sorted
    tuple of its corner ids, so a placement moves a face by integer
    arithmetic and coverage is exact set algebra.
    """

    @staticmethod
    def _inside(x, y, polygon):
        inside = False
        for (x1, y1), (x2, y2) in zip(polygon, polygon[1:] + polygon[:1]):
            if (y1 > y) != (y2 > y) and x < x1 + (y - y1) * (x2 - x1) / (y2 - y1):
                inside = not inside
        return inside

    @classmethod
    def _region(cls, tile, size=1):
        """The unit faces inside the tile scaled by ``size``, by scanning its
        bounding box: the ground truth the placed tiles are compared against."""
        polygon = [tile.to_xy((x * size, y * size)) for x, y in tile.outline]
        faces = set()
        for a in range(-1, 4 * size + 1):
            for b in range(-1, 3 * size + 1):
                for corners in cls._unit_faces(tile, a, b):
                    points = [tile.to_xy(c) for c in corners]
                    cx = sum(x for x, _ in points) / len(points)
                    cy = sum(y for _, y in points) / len(points)
                    if cls._inside(cx, cy, polygon):
                        faces.add(tuple(sorted(corners)))
        return faces

    @staticmethod
    def _unit_faces(tile, a, b):
        """The lattice's unit faces at cell (a, b): two triangles on the
        triangular lattice, one square on the square lattice."""
        if tile is SPHINX:
            return ([(a, b), (a + 1, b), (a, b + 1)],
                    [(a + 1, b), (a, b + 1), (a + 1, b + 1)])
        return ([(a, b), (a + 1, b), (a + 1, b + 1), (a, b + 1)],)

    @classmethod
    def _placed(cls, tile, at):
        """The unit faces a placed unit tile covers."""
        return {tuple(sorted(place_point(tile, at, c) for c in face))
                for face in cls._prototile(tile)}

    _PROTOTILES: dict = {}

    @classmethod
    def _prototile(cls, tile):
        if tile.mode not in cls._PROTOTILES:
            cls._PROTOTILES[tile.mode] = cls._region(tile)
        return cls._PROTOTILES[tile.mode]

    @staticmethod
    def _shoelace(points):
        return abs(sum(a[0] * b[1] - b[0] * a[1] for a, b
                       in zip(points, points[1:] + points[:1]))) / 2

    @pytest.mark.parametrize("tile,faces", [(SPHINX, 6), (CHAIR, 3)])
    def test_the_prototile_is_the_hexiamond_or_the_tromino(self, tile, faces):
        assert len(self._prototile(tile)) == faces

    @pytest.mark.parametrize("tile", [SPHINX, CHAIR])
    def test_the_substitution_table_is_an_exact_dissection(self, tile):
        # every child sits inside the size-2 parent, no two overlap, and
        # together they cover it: the rep-4 property itself
        parent = self._region(tile, size=2)
        assert len(parent) == 4 * len(self._prototile(tile))
        covered = set()
        for child in tile.children:
            placed = self._placed(tile, child)
            assert placed <= parent
            assert not placed & covered
            covered |= placed
        assert covered == parent

    @pytest.mark.parametrize("tile", [SPHINX, CHAIR])
    def test_the_dissection_is_the_one_the_table_holds(self, tile):
        # an exact-cover search over every placement of the unit tile inside
        # the size-2 tile. The sphinx's dissection is unique; the chair's
        # tile is mirror-symmetric about its diagonal, so its comes back in
        # several equivalent guises and the table holds the reflection-free
        # one -- the classic chair substitution.
        parent = self._region(tile, size=2)
        options = [(at, placed)
                   for rotation in range(tile.order)
                   for mirrored in (0, 1)
                   for tx in range(-8, 9)
                   for ty in range(-8, 9)
                   for at in [(rotation, mirrored, (tx, ty))]
                   for placed in [self._placed(tile, at)]
                   if placed <= parent]
        solutions: list = []

        def search(remaining, chosen):
            if not remaining:
                solutions.append(list(chosen))
                return
            pivot = min(remaining)
            for at, placed in options:
                if pivot in placed and placed <= remaining:
                    chosen.append(at)
                    search(remaining - placed, chosen)
                    chosen.pop()

        search(parent, [])
        assert all(len(found) == 4 for found in solutions)
        assert sorted(tile.children) in [sorted(found) for found in solutions]
        if tile is SPHINX:
            assert len(solutions) == 1  # the sphinx's dissection is unique
        else:
            assert all(mirrored == 0 for _, mirrored, _ in tile.children)

    @pytest.mark.parametrize("tile", [SPHINX, CHAIR])
    def test_inflation_tiles_the_supertile_exactly(self, tile):
        # the level-3 patch covers the tile scaled by 8, with no gap and no
        # overlap: the self-similar outline that makes these the fractal
        # boards rather than a window cut out of a tiling
        placements = substitution_placements(tile, 3)
        assert len(placements) == 64
        covered = set()
        for at in placements:
            placed = self._placed(tile, at)
            assert not placed & covered
            covered |= placed
        assert covered == self._region(tile, size=8)

    def test_cell_counts_are_powers_of_four(self):
        for levels in range(5):
            assert len(sphinx_board(levels, 1).adjacency) == 4 ** levels
            assert len(chair_board(levels, 1).adjacency) == 4 ** levels

    def test_every_tile_is_the_prototile(self):
        # each cell is a congruent copy of the tile -- the sphinx a pentagon
        # of sides 3, 1, 1, 1, 2 (six unit triangles), the chair an L of
        # three unit squares -- once the collinear step vertices along its
        # edges are dropped
        for board, sides, area in ((sphinx_board(3, 10, scale=1), 5, 6 * ROOT3 / 4),
                                   (chair_board(3, 10, scale=1), 6, 3)):
            shapes = set()
            for polygon in board.polygons.values():
                corners = [p for p, _ in _corners(polygon, tol=1e-6)]
                assert len(corners) == sides
                assert self._shoelace(polygon) == pytest.approx(area)
                # congruent, not merely equal in area: the multiset of
                # pairwise corner distances is the same for every tile
                shapes.add(tuple(sorted(round(math.dist(a, b), 6)
                                        for a in corners for b in corners)))
            assert len(shapes) == 1

    @pytest.mark.parametrize("mode", ["sphinx", "chair"])
    def test_the_patch_is_simply_connected(self, mode):
        # one boundary cycle and no interior hole: every edge is walked once
        # in each direction inside the patch, so nothing overlaps either
        board = build_board(mode, "easy")
        directed = Counter()
        for polygon in board.polygons.values():
            points = [tuple(round(c, 6) for c in p) for p in polygon]
            for a, b in zip(points, points[1:] + points[:1]):
                directed[(a, b)] += 1
        assert set(directed.values()) == {1}
        assert _boundary_components(board) == 1
        assert _euler_characteristic(board) == 1

    @pytest.mark.parametrize("tile", [SPHINX, CHAIR])
    def test_the_step_vertices_make_the_patch_a_mesh(self, tile):
        # Neither tiling is edge to edge: a neighbour plants its corner in
        # the middle of another tile's side. Carrying a vertex at every
        # lattice step along each edge records those T-vertices, which is
        # what keeps the patch a mesh -- drop them and the polygons no longer
        # share whole edges, so the topology invariants stop reading a disc.
        placements = substitution_placements(tile, 3)
        stepped = _finalize_flat(
            tile.mode,
            {at: [place_point(tile, at, v) for v in tile.outline]
             for at in placements},
            tile.to_xy, 1, 10)
        corners_only = _finalize_flat(
            tile.mode,
            {at: [place_point(tile, at, v) for v in tile.corners()]
             for at in placements},
            tile.to_xy, 1, 10)
        assert (_euler_characteristic(stepped), _boundary_components(stepped)) == (1, 1)
        assert _euler_characteristic(corners_only) != 1
        # none of them changes the drawn tile: they are collinear, which is
        # why _corners drops them again before the shape is measured
        for cell, polygon in stepped.polygons.items():
            assert [p for p, _ in _corners(polygon, tol=1e-6)] == \
                corners_only.polygons[cell]

    def test_the_sphinx_gains_neighbours_from_its_split_edges(self):
        # on the sphinx the T-vertices are load-bearing for the game too: a
        # tile meeting another only across a split edge is a neighbour there
        # and would not be one without the step vertices
        placements = substitution_placements(SPHINX, 3)
        full = _shared_vertex_adjacency({
            at: [place_point(SPHINX, at, v) for v in SPHINX.outline]
            for at in placements})
        corners_only = _shared_vertex_adjacency({
            at: [place_point(SPHINX, at, v) for v in SPHINX.corners()]
            for at in placements})
        assert all(set(corners_only[cell]) < set(full[cell]) or
                   corners_only[cell] == full[cell] for cell in full)
        assert sum(map(len, corners_only.values())) < sum(map(len, full.values()))
        assert min(len(n) for n in full.values()) >= 3


class TestSierpinskiCarpet:
    """The third fractal board, and the only one that is not a rep-tile:
    the unit square tripled and refilled with eight copies, the centre of
    the 3x3 block left out at every scale.

    The oracle throughout is the carpet's arithmetic definition -- a unit
    square of the 3**n grid survives exactly when no digit pair of its
    base-3 coordinates is (1, 1) -- which the substitution machinery knows
    nothing about, so the two derivations pin each other.
    """

    @staticmethod
    def _kept(levels):
        """The cells of the level-``levels`` carpet, by the digit rule."""
        size = 3 ** levels
        return {(x, y)
                for x in range(size) for y in range(size)
                if all((x // 3 ** k) % 3 != 1 or (y // 3 ** k) % 3 != 1
                       for k in range(levels))}

    @staticmethod
    def _holes(levels):
        """(8**levels - 1) / 7: one hole per block at every scale."""
        return (8 ** levels - 1) // 7

    def test_the_substitution_is_the_block_minus_its_middle(self):
        # eight unit squares, no two the same, filling the tripled square
        # except for its centre ninth -- the hole that makes the fractal
        assert len(CARPET.children) == 8
        assert all(rot == 0 and not mirrored for rot, mirrored, _ in CARPET.children)
        placed = {translation for _, _, translation in CARPET.children}
        assert len(placed) == 8
        block = {(x, y) for x in range(3) for y in range(3)}
        assert placed == block - {(1, 1)}

    @pytest.mark.parametrize("levels", [0, 1, 2, 3])
    def test_inflation_is_the_digit_rule(self, levels):
        # every placement is a plain translation, and the set of them is
        # exactly the set of surviving squares of the 3**levels grid
        placements = substitution_placements(CARPET, levels)
        assert len(placements) == 8 ** levels
        assert all(rot == 0 and not mirrored for rot, mirrored, _ in placements)
        assert {translation for _, _, translation in placements} == self._kept(levels)

    def test_cell_counts_are_powers_of_eight(self):
        for levels in range(4):
            assert len(carpet_board(levels, 1).adjacency) == 8 ** levels

    def test_every_tile_is_the_unit_square(self):
        # one congruent tile, edge to edge: unlike the sphinx and the chair
        # the carpet needs no collinear step vertices to stay a mesh
        board = carpet_board(2, 10, scale=1)
        assert board.width == board.height == 9
        for polygon in board.polygons.values():
            assert len(polygon) == 4
            xs = {x for x, _ in polygon}
            ys = {y for _, y in polygon}
            assert len(xs) == len(ys) == 2
            assert max(xs) - min(xs) == max(ys) - min(ys) == 1

    @pytest.mark.parametrize("levels", [1, 2, 3])
    def test_the_patch_is_a_square_with_square_holes(self, levels):
        # not a disc -- the one flat board that is not. Each hole is a
        # boundary circle of its own, so chi = 1 - holes and the boundary
        # has holes + 1 components (the outer square and one per hole);
        # every edge is still walked at most once in each direction, so
        # nothing overlaps and no two holes touch.
        board = carpet_board(levels, 1, scale=1)
        directed = Counter()
        for polygon in board.polygons.values():
            points = [tuple(round(c, 6) for c in p) for p in polygon]
            for a, b in zip(points, points[1:] + points[:1]):
                directed[(a, b)] += 1
        assert set(directed.values()) == {1}
        assert _euler_characteristic(board) == 1 - self._holes(levels)
        assert _boundary_components(board) == self._holes(levels) + 1

    def test_the_holes_cost_every_cell_a_neighbour(self):
        # any 3x3 window of the grid holds exactly one cell whose two
        # coordinates are both 1 mod 3, and that cell is always a hole --
        # so no carpet cell ever has the square board's eight neighbours
        board = carpet_board(3, 1)
        assert max(len(n) for n in board.adjacency.values()) == 7
        # and the board is still one connected component to play on
        seen, stack = set(), [next(iter(board.adjacency))]
        while stack:
            cell = stack.pop()
            if cell not in seen:
                seen.add(cell)
                stack.extend(board.adjacency[cell])
        assert len(seen) == len(board.adjacency)


class TestPentaflake:
    """The fourth fractal board: the regular pentagon scaled by phi**2 and
    refilled with six, one per corner plus a half-turned middle.

    It is the only board here whose lattice is not integer -- five-fold
    symmetry needs rank 4 -- so the oracle throughout is plain complex
    arithmetic: every claim about the ring Z[zeta10] is checked against
    ``cmath`` doing the same thing in floats, and the inflation against a
    naive float recursion that knows nothing about lattices.
    """

    ZETA = cmath.exp(1j * math.pi / 5)
    PHI = (1 + 5 ** 0.5) / 2

    @classmethod
    def _complex(cls, p):
        return sum(c * cls.ZETA ** k for k, c in enumerate(p))

    @staticmethod
    def _shoelace(points):
        return abs(sum(a[0] * b[1] - b[0] * a[1] for a, b
                       in zip(points, points[1:] + points[:1]))) / 2

    @staticmethod
    def _holes(levels):
        """(6**n - 5*2**n + 4) / 4 gnomon-shaped holes.

        A hole is born where two supertiles are glued along a whole edge --
        the five middle-to-corner edges of every substitution -- and each
        such edge carries 2**(n-1) - 1 gaps down its length, one from every
        scale below it. So holes(n) = 6*holes(n-1) + 5*(2**(n-1) - 1) from
        holes(1) = 0, whose closed form this is: at level 1 the five gaps
        all open onto the patch's own boundary and none is a hole yet.
        """
        return (6 ** levels - 5 * 2 ** levels + 4) // 4

    @pytest.mark.parametrize("p", [(1, 0, 0, 0), (0, 1, 0, 0), (0, 0, 1, 0),
                                   (0, 0, 0, 1), (3, -1, 2, 5), (-2, 4, 0, -7)])
    def test_the_ring_is_z_zeta10(self, p):
        # the three lattice maps are multiplication by zeta (a 36-degree
        # turn), complex conjugation, and multiplication by phi**2 -- all
        # exact on integer quadruples because zeta**4 = zeta**3 - zeta**2 +
        # zeta - 1 keeps every product back in the ring
        z = self._complex(p)
        assert self._complex(PENTAFLAKE.rotate(p)) == pytest.approx(z * self.ZETA)
        assert self._complex(PENTAFLAKE.mirror(p)) == pytest.approx(z.conjugate())
        assert self._complex(PENTAFLAKE.scale(p)) == pytest.approx(z * self.PHI ** 2)
        assert PENTAFLAKE.to_xy(p) == pytest.approx((z.real, z.imag))
        # 36 degrees ten times over is a full turn, and a mirror is an
        # involution: the rotation order the placements count modulo
        turned = p
        for _ in range(PENTAFLAKE.order):
            turned = PENTAFLAKE.rotate(turned)
        assert turned == p
        assert PENTAFLAKE.mirror(PENTAFLAKE.mirror(p)) == p

    def test_the_substitution_is_five_corners_and_a_turned_middle(self):
        # five children seated in the parent's corners, unturned, their
        # centres phi (= the parent's phi**2 less their own 1) out along
        # each corner, plus one in the middle turned a half turn. None is
        # reflected: the pentaflake is achiral only because the pentagon is
        assert len(PENTAFLAKE.children) == 6
        assert all(not mirrored for _, mirrored, _ in PENTAFLAKE.children)
        corners = [c for c in PENTAFLAKE.children if c[2] != PENTAFLAKE.origin]
        assert [rot for rot, _, _ in corners] == [0] * 5
        assert [self._complex(t) for _, _, t in corners] == pytest.approx(
            [self.PHI * self.ZETA ** (2 * k) for k in range(5)])
        middle, = [c for c in PENTAFLAKE.children if c[2] == PENTAFLAKE.origin]
        assert middle[0] == PENTAFLAKE.order // 2

    @pytest.mark.parametrize("levels", [0, 1, 2, 3])
    def test_inflation_matches_the_float_construction(self, levels):
        # the exact placements' centres against the same construction done
        # naively in complex floats -- pentagon centres, no ring, no lattice.
        # `turn` is what makes it a real check: the middle child is half
        # turned, so its own corner children sit along the *odd* powers of
        # zeta, and a recursion that ignored the turn would not match
        def tiles(n, centre, turn):
            if n == 0:
                return [centre]
            out = tiles(n - 1, centre, -turn)  # the half-turned middle
            for k in range(5):                 # and one seated in each corner
                offset = turn * self.PHI ** (2 * n - 1) * self.ZETA ** (2 * k)
                out += tiles(n - 1, centre + offset, turn)
            return out

        placements = substitution_placements(PENTAFLAKE, levels)
        assert len(placements) == 6 ** levels
        # rounded before sorting: two centres are never closer than a
        # pentagon's width, so 1e-6 keeps them apart while pinning the sort
        # order against the two constructions' float noise
        def rounded(points):
            return sorted((round(x, 6), round(y, 6)) for x, y in points)

        exact = rounded(PENTAFLAKE.to_xy(t) for _, _, t in placements)
        naive = rounded((z.real, z.imag) for z in tiles(levels, 0j, 1 + 0j))
        assert [c for point in exact for c in point] == \
            pytest.approx([c for point in naive for c in point], abs=1e-6)

    def test_every_tile_is_the_unit_regular_pentagon(self):
        board = pentaflake_board(3, 10, scale=1)
        side = 2 * math.sin(math.pi / 5)  # circumradius 1
        for polygon in board.polygons.values():
            assert len(polygon) == 5  # no collinear step vertices to drop
            assert len(_corners(polygon, tol=1e-6)) == 5
            sides = [math.dist(a, b)
                     for a, b in zip(polygon, polygon[1:] + polygon[:1])]
            assert sides == pytest.approx([side] * 5)

    def test_the_gaps_are_golden_gnomons(self):
        # the six children cover 6/phi**4 of the inflated pentagon, and what
        # is left over is five golden gnomons: 36-72-72 triangles with two
        # legs a unit pentagon side long, one per side of the parent
        area = self._shoelace([PENTAFLAKE.to_xy(v) for v in PENTAFLAKE.outline])
        side = 2 * math.sin(math.pi / 5)
        gnomon = side ** 2 * math.sin(math.radians(36)) / 2
        assert (self.PHI ** 4 - 6) * area == pytest.approx(5 * gnomon)

    @pytest.mark.parametrize("levels", [1, 2, 3])
    def test_the_patch_is_a_pentagon_with_gnomon_holes(self, levels):
        # like the carpet and unlike the two rep-tiles this is not a disc,
        # so chi = 1 - holes and the boundary has holes + 1 components. The
        # tiles still meet edge to edge (every directed edge walked once),
        # which is why the invariants read at all
        board = pentaflake_board(levels, 1, scale=1)
        directed = Counter()
        for polygon in board.polygons.values():
            points = [tuple(round(c, 6) for c in p) for p in polygon]
            for a, b in zip(points, points[1:] + points[:1]):
                directed[(a, b)] += 1
        assert set(directed.values()) == {1}
        assert _euler_characteristic(board) == 1 - self._holes(levels)
        assert _boundary_components(board) == self._holes(levels) + 1

    def test_a_pentagon_touches_at_most_five_others(self):
        # a pentagon meets a neighbour either across a whole edge or at a
        # single corner where three tiles and 3 * 108 = 324 degrees meet, so
        # a fourth tile cannot reach any corner: five sides, five neighbours
        board = pentaflake_board(3, 1)
        assert max(len(n) for n in board.adjacency.values()) == 5
        assert min(len(n) for n in board.adjacency.values()) == 3
        # and the holes never cut the board in two
        seen, stack = set(), [next(iter(board.adjacency))]
        while stack:
            cell = stack.pop()
            if cell not in seen:
                seen.add(cell)
                stack.extend(board.adjacency[cell])
        assert len(seen) == len(board.adjacency)

    def test_cell_counts_are_powers_of_six(self):
        for levels in range(4):
            assert len(pentaflake_board(levels, 1).adjacency) == 6 ** levels


class TestGosperIsland:
    """The fifth fractal board, and the only one whose *boundary* is the
    fractal: 7**n plain regular hexagons in a patch with no holes at all,
    whose outline converges on the Gosper island.

    The hexagon is no rep-tile -- seven of them make a flower, not a bigger
    hexagon -- so there is no dissection to re-derive here. What has to hold
    instead is the arithmetic that makes the flower inflate at all: the
    lattice is the Eisenstein integers Z[zeta], zeta = exp(i*pi/3), the
    inflation is multiplication by 2 + zeta (norm 7), and the seven children
    are a complete set of residues modulo it. That is what makes the patch
    exactly the 7**n digit strings, with nothing repeated and nothing left
    out; the oracle for the rest is plain complex arithmetic, as for the
    pentaflake.
    """

    ZETA = cmath.exp(1j * math.pi / 3)
    LAMBDA = 2 + cmath.exp(1j * math.pi / 3)   # the inflation, |.| = sqrt7

    @classmethod
    def _complex(cls, p):
        a, b = p
        return a + b * cls.ZETA

    @staticmethod
    def _divisible(p):
        """Is the lattice point ``p`` a multiple of 2 + zeta?

        Multiply by the conjugate 3 - zeta and the divisor becomes the norm:
        p is a multiple of 2 + zeta exactly when p * (3 - zeta) is a multiple
        of 7, which is plain integer arithmetic. ((a + b*zeta)(3 - zeta) =
        (3a + b) + (2b - a)*zeta, since zeta**2 = zeta - 1.)
        """
        a, b = p
        return (3 * a + b) % 7 == 0 and (2 * b - a) % 7 == 0

    @pytest.mark.parametrize("p", [(1, 0), (0, 1), (3, -1), (-2, 4), (5, 5)])
    def test_the_ring_is_the_eisenstein_integers(self, p):
        # rotation is multiplication by zeta (60 degrees), the mirror is
        # complex conjugation, and the inflation is multiplication by
        # 2 + zeta -- all exact on integer pairs because zeta**2 = zeta - 1
        # keeps every product in the ring
        z = self._complex(p)
        assert self._complex(GOSPER.rotate(p)) == pytest.approx(z * self.ZETA)
        assert self._complex(GOSPER.mirror(p)) == pytest.approx(z.conjugate())
        assert self._complex(GOSPER.scale(p)) == pytest.approx(z * self.LAMBDA)
        assert GOSPER.to_xy(p) == pytest.approx((z.real, z.imag))
        turned = p
        for _ in range(GOSPER.order):
            turned = GOSPER.rotate(turned)
        assert turned == p
        assert GOSPER.mirror(GOSPER.mirror(p)) == p

    def test_the_inflation_is_sqrt7_at_19_degrees(self):
        # the flower is seven hexagons, so the inflation scales areas by 7
        # and lengths by sqrt7 -- and it cannot do that without turning,
        # because scaling by sqrt7 alone takes the lattice point 1 to
        # (sqrt7, 0), which is no lattice point at all (the ring's real
        # elements are the plain integers). That forced turn is the whole
        # reason the island's edge is fractal: every level is laid down
        # askew of the one below, so the outline never settles down.
        assert abs(self.LAMBDA) == pytest.approx(GOSPER.factor)
        assert GOSPER.factor == pytest.approx(7 ** 0.5)
        assert math.degrees(cmath.phase(self.LAMBDA)) == pytest.approx(19.106605, abs=1e-6)
        # anything sqrt7 = 2.65 from the origin has coordinates well inside
        # this box, so scanning it settles the point
        assert all(GOSPER.to_xy((a, b)) != pytest.approx((7 ** 0.5, 0.0), abs=1e-9)
                   for a in range(-9, 10) for b in range(-9, 10))

    def test_the_seven_children_are_the_residues_mod_the_inflation(self):
        # every child is a plain translation -- one hexagon step out along
        # each of the six directions, plus the middle one -- and no two of
        # them differ by a multiple of 2 + zeta. Seven classes, seven
        # children: a complete residue system, which is exactly what makes
        # the flower tile the plane by the inflated lattice and the digit
        # strings below distinct
        assert len(GOSPER.children) == 7
        assert all(rot == 0 and not mirrored for rot, mirrored, _ in GOSPER.children)
        digits = [t for _, _, t in GOSPER.children]
        assert digits[0] == (0, 0)
        theta = 1 + self.ZETA        # one step from a hexagon to a neighbour
        assert [self._complex(d) for d in digits[1:]] == pytest.approx(
            [theta * self.ZETA ** k for k in range(6)])
        for i, first in enumerate(digits):
            for second in digits[i + 1:]:
                assert not self._divisible((first[0] - second[0], first[1] - second[1]))

    @pytest.mark.parametrize("levels", [0, 1, 2, 3])
    def test_inflation_matches_the_float_construction(self, levels):
        # the exact placements against the same nesting done naively in
        # complex floats: seven level-(n-1) islands, one in the middle and
        # six a step out along the once-inflated lattice
        def islands(n):
            if n == 0:
                return [0j]
            below = islands(n - 1)
            step = (1 + self.ZETA) * self.LAMBDA ** (n - 1)
            offsets = [0j] + [step * self.ZETA ** k for k in range(6)]
            return [centre + offset for offset in offsets for centre in below]

        placements = substitution_placements(GOSPER, levels)
        assert len(placements) == 7 ** levels

        def rounded(points):
            return sorted((round(x, 6), round(y, 6)) for x, y in points)

        exact = rounded(GOSPER.to_xy(t) for _, _, t in placements)
        naive = rounded((z.real, z.imag) for z in islands(levels))
        assert [c for point in exact for c in point] == \
            pytest.approx([c for point in naive for c in point], abs=1e-6)

    def test_cell_counts_are_powers_of_seven(self):
        for levels in range(4):
            assert len(gosper_board(levels, 1).adjacency) == 7 ** levels

    def test_every_tile_is_the_unit_regular_hexagon(self):
        # one congruent tile, edge to edge: like the carpet and the
        # pentaflake and unlike the two rep-tiles, it needs no collinear
        # step vertices to stay a mesh
        board = gosper_board(3, 10, scale=1)
        for polygon in board.polygons.values():
            assert len(polygon) == 6
            assert len(_corners(polygon, tol=1e-6)) == 6
            sides = [math.dist(a, b)
                     for a, b in zip(polygon, polygon[1:] + polygon[:1])]
            assert sides == pytest.approx([1] * 6)  # side = circumradius

    @pytest.mark.parametrize("levels", [1, 2, 3, 4])
    def test_the_edge_is_the_fractal_and_the_patch_is_a_disc(self, levels):
        # 7**n hexagons but only 6*3**n edges on the boundary: the area
        # grows by 7 a level and the perimeter by 3, so the outline's
        # dimension is log3 / log sqrt7 = 1.129 while the patch it encloses
        # is a plain disc -- no holes, unlike the carpet and the pentaflake,
        # and the one fractal board here whose fractal is its edge
        board = gosper_board(levels, 1, scale=1)
        directed = Counter()
        for polygon in board.polygons.values():
            points = [tuple(round(c, 6) for c in p) for p in polygon]
            for a, b in zip(points, points[1:] + points[:1]):
                directed[(a, b)] += 1
        assert set(directed.values()) == {1}
        boundary = sum(1 for a, b in directed if (b, a) not in directed)
        assert boundary == 6 * 3 ** levels
        assert _euler_characteristic(board) == 1
        assert _boundary_components(board) == 1

    @pytest.mark.parametrize("levels", [1, 2, 3])
    def test_the_island_turns_six_ways_but_never_reflects(self, levels):
        # the seven digits are closed under multiplication by a unit, so the
        # whole patch is: it has the hexagon's own six-fold rotation at every
        # level. Conjugation instead sends 2 + zeta to its conjugate, i.e.
        # the island turned the other way, so from level 2 on the patch is
        # chiral -- the flowsnake's handedness, visible on the board
        centres = {t for _, _, t in substitution_placements(GOSPER, levels)}
        assert {GOSPER.rotate(t) for t in centres} == centres
        assert ({GOSPER.mirror(t) for t in centres} == centres) == (levels == 1)

    def test_a_hexagon_touches_at_most_six_others(self):
        # a hexagon tiling is edge to edge and three hexagons meet at each
        # corner, so sharing a vertex is sharing an edge: six neighbours at
        # most, and on the island's ragged edge as few as three
        board = gosper_board(3, 1)
        assert max(len(n) for n in board.adjacency.values()) == 6
        assert min(len(n) for n in board.adjacency.values()) == 3
        seen, stack = set(), [next(iter(board.adjacency))]
        while stack:
            cell = stack.pop()
            if cell not in seen:
                seen.add(cell)
                stack.extend(board.adjacency[cell])
        assert len(seen) == len(board.adjacency)



_HYPERBOLIC = [(7, 3), (5, 4), (4, 5)]


def _hyp_dist(a: complex, b: complex) -> float:
    """Hyperbolic distance between two points of the Poincaré disc."""
    return 2 * math.atanh(abs((a - b) / (1 - a.conjugate() * b)))


def _float_rings(p: int, q: int, rings: int) -> list[int]:
    """Face counts per ring, derived with nothing the builder uses: reflect the
    central p-gon across its edges in the disc, over and over, merge faces by
    rounded centre (fine here -- this is the *check*, not a board), and count
    vertex-adjacency layers outward from the centre."""
    big_r = math.acosh(1 / (math.tan(math.pi / p) * math.tan(math.pi / q)))
    first = [cmath.rect(math.tanh(big_r / 2), 2 * math.pi * k / p) for k in range(p)]

    def reflect(z, a, b):
        # inversion in the circle through a and b orthogonal to the rim
        a2 = 1 / a.conjugate()
        w = (a2 - a) / (b - a)
        if abs(w.imag) < 1e-12:  # a diameter: a straight mirror
            d = (b - a) / abs(b - a)
            return a + d * ((z - a) / d).conjugate()
        c = (b - a) * (w - abs(w) ** 2) / (2j * w.imag) + a
        return c + abs(a - c) ** 2 / (z - c).conjugate()

    def key(z):
        return (round(z.real, 7), round(z.imag, 7))

    faces, seen, frontier = [first], {key(0j)}, [first]
    limit = rings * 2 * big_r + 1e-6
    while frontier:
        grown = []
        for face in frontier:
            for i in range(p):
                image = [reflect(z, face[i], face[(i + 1) % p]) for z in face]
                centre = sum(image) / p
                if 2 * math.atanh(min(abs(centre), 0.999999)) > limit or key(centre) in seen:
                    continue
                seen.add(key(centre))
                grown.append(image)
        faces += grown
        frontier = grown
    at = defaultdict(list)
    for index, face in enumerate(faces):
        for z in face:
            at[key(z)].append(index)
    layer, current, counts = {0: 0}, [0], [1]
    for ring in range(1, rings + 1):
        nxt = [j for i in current for z in faces[i] for j in at[key(z)] if j not in layer]
        for j in nxt:
            layer[j] = ring
        current = sorted(set(nxt))
        counts.append(len(current))
    return counts


class TestHyperbolic:
    """The {p,q} boards in the Poincaré disc (boards/hyperbolic.py)."""

    @pytest.mark.parametrize("p,q", _HYPERBOLIC)
    def test_ring_counts_match_an_independent_construction(self, p, q):
        _, ring_of = hyperbolic_faces(p, q, 3)
        assert [ring_of.count(r) for r in range(4)] == _float_rings(p, q, 3)

    @pytest.mark.parametrize("p,q", _HYPERBOLIC)
    def test_every_inner_vertex_has_q_faces(self, p, q):
        faces, ring_of = hyperbolic_faces(p, q, 4)
        at = Counter(v for face in faces for v in face)
        outer = {v for face, r in zip(faces, ring_of) if r == 4 for v in face}
        inner = {v for face, r in zip(faces, ring_of) if r < 4 for v in face} - outer
        assert inner and all(at[v] == q for v in inner)
        assert max(at.values()) == q
        assert all(len(set(face)) == p for face in faces)
        edges = Counter(frozenset(e) for face in faces for e in zip(face, face[1:] + face[:1]))
        assert set(edges.values()) <= {1, 2}

    @pytest.mark.parametrize("p,q", _HYPERBOLIC)
    def test_an_inner_cell_has_p_times_q_minus_2_neighbours(self, p, q):
        board = hyperbolic_board(p, q, 12, 1)
        degrees = [len(n) for n in board.adjacency.values()]
        assert max(degrees) == p * (q - 2)
        # the central p-gon and its first ring are all interior
        _, ring_of = hyperbolic_faces(p, q, 1)
        assert all(len(board.adjacency[f]) == p * (q - 2) for f in range(len(ring_of)))

    @pytest.mark.parametrize("p,q", _HYPERBOLIC)
    def test_faces_are_congruent_regular_polygons(self, p, q):
        faces, _ = hyperbolic_faces(p, q, 3)
        pos = hyperbolic_positions(p, q, faces)
        side = _hyp_dist(pos[faces[0][0]], pos[faces[0][1]])
        for face in faces:
            centre = face_centre(p, q, face, pos)
            corners = [pos[v] for v in face]
            assert all(abs(z) < 1 for z in corners)
            for a, b in zip(corners, corners[1:] + corners[:1]):
                assert _hyp_dist(a, b) == pytest.approx(side, rel=1e-9)
            radii = [_hyp_dist(centre, z) for z in corners]
            assert radii == pytest.approx([radii[0]] * p, rel=1e-9)

    @pytest.mark.parametrize("p,q", _HYPERBOLIC)
    def test_q_faces_close_up_round_a_vertex(self, p, q):
        # the angle sum at an inner vertex is exactly 2 pi, which is what puts
        # the tiling in the hyperbolic plane; the disc is conformal, so the
        # angle between two chords at a vertex tends to the true angle and
        # the corner angles of q faces, measured on their tangent arcs, sum
        # to 2 pi -- here checked through the arc points, which hug the arcs
        board = hyperbolic_board(p, q, 6, 1, scale=1, arc=64)
        polygon = board.polygons[0]
        n = len(polygon)
        angles = []
        for i in range(0, n, 64):
            a, b, c = polygon[i - 1], polygon[i], polygon[(i + 1) % n]
            u = complex(a[0] - b[0], a[1] - b[1])
            w = complex(c[0] - b[0], c[1] - b[1])
            angles.append(abs(cmath.phase(w / u)))
        assert angles == pytest.approx([2 * math.pi / q] * p, abs=0.02)

    @pytest.mark.parametrize("p,q", _HYPERBOLIC)
    def test_every_face_places_its_vertices_where_they_are(self, p, q):
        # positions are first come, first served; re-derive every vertex from
        # every face that has it and they must all agree
        faces, _ = hyperbolic_faces(p, q, 4)
        pos = hyperbolic_positions(p, q, faces)
        centre = _central_polygon(p, q)
        for face in faces:
            m = _isometry(centre[0], centre[1], pos[face[0]], pos[face[1]])
            for i, v in enumerate(face):
                # relative to the size of the face, which shrinks toward the rim
                size = 1 - abs(pos[v]) ** 2
                assert abs(m(centre[i]) - pos[v]) < 1e-9 * size

    @pytest.mark.parametrize("p,q", _HYPERBOLIC)
    def test_distance_shells_are_far_apart(self, p, q):
        # faces at one distance are grouped with a tolerance; distinct
        # distances must sit far outside it or the grouping is a coin toss
        faces, _ = hyperbolic_faces(p, q, 4)
        pos = hyperbolic_positions(p, q, faces)
        dists = sorted(2 * math.atanh(abs(face_centre(p, q, f, pos))) for f in faces)
        gaps = [b - a for a, b in zip(dists, dists[1:])]
        assert all(g < 1e-10 or g > 1e-5 for g in gaps)

    @pytest.mark.parametrize("p,q", _HYPERBOLIC)
    @pytest.mark.parametrize("shells", [3, 8, 15, 27])
    def test_a_trim_keeps_the_dihedral_symmetry(self, p, q, shells):
        board = hyperbolic_board(p, q, shells, 1, scale=1)
        c = complex(board.width / 2, board.height / 2)

        def points(transform):
            return sorted((round(z.real, 6), round(z.imag, 6))
                          for poly in board.polygons.values()
                          for z in (transform(complex(*xy) - c) for xy in poly))

        same = points(lambda z: z)
        turn = cmath.exp(2j * math.pi / p)
        assert points(lambda z: z * turn) == same
        assert points(lambda z: -z.conjugate()) == same  # the vertical mirror

    @pytest.mark.parametrize("p,q", _HYPERBOLIC)
    def test_a_trim_is_a_disc_whose_cells_have_p_corners(self, p, q):
        board = hyperbolic_board(p, q, 10, 1)
        assert _euler_characteristic(board) == 1
        assert _boundary_components(board) == 1
        assert _connected(board)
        assert all(sum(mask) == p for mask in board.corner_mask.values())
        assert all(len(board.polygons[c]) == len(m) for c, m in board.corner_mask.items())

    def test_the_central_polygon_sits_at_the_centre_of_the_board(self):
        board = hyperbolic_board(7, 3, 9, 1)
        xs = [x for x, _ in board.polygons[0]]
        ys = [y for _, y in board.polygons[0]]
        assert sum(xs) / len(xs) == pytest.approx(board.width / 2)
        assert sum(ys) / len(ys) == pytest.approx(board.height / 2)

    def test_no_fair_trim_of_45_lands_in_the_medium_band(self):
        # why `hyperbolic45` medium ships at 205 cells, outside +-15% of 256
        # (see NEAR_MISS_ALLOWANCE in tests/test_presets.py): every trim in
        # the band leaves rim cells with a twin, and 20 shells is the nearest
        # one that does not
        from scripts.difficulty.metrics import indistinguishable_cells
        in_band = {}
        for shells in range(18, 30):
            board = hyperbolic_board(4, 5, shells, 1)
            if 0.85 * 256 <= len(board.adjacency) <= 1.15 * 256:
                in_band[shells] = indistinguishable_cells(board.adjacency)
        assert in_band and all(twins > 0 for twins in in_band.values())
        board = hyperbolic_board(4, 5, 20, 1)
        assert len(board.adjacency) == 205
        assert indistinguishable_cells(board.adjacency) == 0

    def test_a_euclidean_or_spherical_tiling_is_refused(self):
        for p, q in [(4, 4), (6, 3), (3, 6), (5, 3)]:
            with pytest.raises(ValueError):
                hyperbolic_board(p, q, 3, 1)


@pytest.mark.parametrize("mode", sorted(SUBSTITUTIONS))
def test_a_substitutions_scale_is_its_factor(mode):
    # `factor` is the linear scale as a plain number and `scale` is that same
    # multiplication done exactly on the lattice; nothing else ties the two
    # together, and for the pentaflake the number is irrational. `scale` is a
    # similarity rather than a pure scaling: the Gosper island's turns the
    # lattice 19.106 degrees as it stretches it, because no hexagon-lattice
    # vector is sqrt7 long and multiplying by 2 + zeta is the only way to get
    # there. So what is pinned is the length, and that whatever turn comes
    # with it is the same for every point.
    tile = SUBSTITUTIONS[mode]
    turns = []
    for p in tile.outline:
        before = tile.to_xy(p)
        after = tile.to_xy(tile.scale(p))
        assert math.hypot(*after) == pytest.approx(tile.factor * math.hypot(*before))
        if math.hypot(*before) < 1e-9:
            continue          # the origin, which every scaling fixes
        turns.append(complex(*after) / complex(*before) / tile.factor)
    assert turns == pytest.approx([turns[0]] * len(turns))
    expected = cmath.exp(1j * math.atan2(ROOT3, 5)) if mode == "gosper" else 1
    assert turns[0] == pytest.approx(expected)


class TestNeighborCounts:
    def test_square_neighborhood(self):
        board = square_board(5, 5, 3)
        assert len(board.adjacency[(0, 0)]) == 3  # corner
        assert len(board.adjacency[(0, 2)]) == 5  # edge
        assert len(board.adjacency[(2, 2)]) == 8  # interior

    def test_triangle_apex_has_three_neighbors(self):
        board = triangle_board(6, 4)
        assert len(board.adjacency[(0, 0)]) == 3

    def test_triangle_interior_has_twelve_neighbors(self):
        board = triangle_board(8, 4)
        assert max(len(n) for n in board.adjacency.values()) == 12
        # a triangle well inside the figure touches 12 others
        assert len(board.adjacency[(5, 5)]) == 12

    def test_triangle_grid_interior_has_twelve_neighbors(self):
        board = triangle_grid_board(5, 9, 4)
        assert len(board.adjacency[(2, 4)]) == 12

    def test_hex_neighborhood(self):
        board = hex_board(5, 6, 4)
        assert len(board.adjacency[(2, 2)]) == 6  # interior
        assert len(board.adjacency[(0, 0)]) == 2  # corner

    def test_sphere_cells_all_have_seven_neighbors(self):
        board = sphere_board(7)
        assert {len(n) for n in board.adjacency.values()} == {7}

    def test_torus_cells_all_have_eight_neighbors(self):
        # the grid wraps in both directions, so there are no border cells
        board = torus_board(12, 6, 9)
        assert {len(n) for n in board.adjacency.values()} == {8}

    def test_torus_wraps_around(self):
        board = torus_board(12, 6, 9)
        assert (0, 0) in board.adjacency[(11, 5)]

    def test_square_diamond_neighbor_counts(self):
        # the sawtooth edge, which is the whole point of the board: the plain
        # square grid's boundary has only 5s and four 3s, this one has five
        # distinct degrees
        board = square_diamond_board(4, 5)
        assert len(board.adjacency[(0, 0)]) == 8  # interior, as any square
        assert len(board.adjacency[(4, 4)]) == 3  # a corner of the window
        assert len(board.adjacency[(2, 4)]) == 5  # a tip of the sawtooth
        assert len(board.adjacency[(1, 3)]) == 7  # a notch behind one
        assert len(board.adjacency[(3, 3)]) == 6  # beside a corner
        assert Counter(len(n) for n in board.adjacency.values()) == Counter(
            {8: 13, 7: 8, 5: 12, 6: 4, 3: 4}  # 41 cells
        )

    def test_hexhex_neighbor_counts(self):
        board = hexhex_board(3, 5)
        assert len(board.adjacency[(0, 0)]) == 6  # center
        assert len(board.adjacency[(3, 0)]) == 3  # corner of the big hexagon
        assert len(board.adjacency[(1, -3)]) == 4  # edge of the big hexagon

    def test_mobius_seam_glues_flipped(self):
        # column ring-1 meets column 0 upside down
        board = mobius_board(20, 4, 10)
        assert (0, 3) in board.adjacency[(19, 0)]
        assert (0, 0) in board.adjacency[(19, 3)]

    def test_cylinder_wraps_ring_but_not_ends(self):
        board = cylinder_board(12, 7, 10)
        assert (11, 0) in board.adjacency[(0, 0)]  # wraps around the ring
        assert len(board.adjacency[(3, 3)]) == 8  # interior
        assert len(board.adjacency[(3, 0)]) == 5  # open bottom edge

    def test_hex_torus_is_borderless(self):
        # pure hexagonal tiling: only possible because the torus has
        # Euler characteristic 0
        board = torus_hex_board(6, 12, 9)
        assert {len(n) for n in board.adjacency.values()} == {6}

    def test_triangle_torus_is_borderless(self):
        board = torus_triangle_board(20, 6, 14)
        assert {len(n) for n in board.adjacency.values()} == {12}

    def test_hex_mobius_seam_glues_flipped(self):
        board = mobius_hex_board(14, 3, 6)
        # column ring-1 meets column 0 with rows flipped (row 0 -> row 2)
        assert (0, 0) in board.adjacency[(2, 13)]
        assert (2, 0) in board.adjacency[(0, 13)]

    def test_hex_mobius_requires_odd_rows(self):
        with pytest.raises(ValueError):
            mobius_hex_board(14, 4, 6)

    def test_triangle_cylinder_requires_even_ring(self):
        with pytest.raises(ValueError):
            cylinder_triangle_board(15, 6, 11)

    def test_triangle_torus_requires_even_ring_and_tube(self):
        with pytest.raises(ValueError):
            torus_triangle_board(15, 6, 12)
        with pytest.raises(ValueError):
            torus_triangle_board(20, 5, 12)

    def test_triangle_mobius_requires_matching_parities(self):
        # the seam mirror (row r -> row rows - 1 - r) only lands on the
        # offset lattice when the ring shift matches the flip's parity
        with pytest.raises(ValueError):
            mobius_triangle_board(28, 5, 13)
        mobius_triangle_board(35, 5, 13)      # both odd is fine

    @pytest.mark.parametrize("mode", ["hex", "trigrid"])
    @pytest.mark.parametrize("difficulty", DIFFICULTIES)
    def test_flat_grids_are_roughly_square(self, mode, difficulty):
        board = build_board(mode, difficulty)
        assert 0.85 < board.width / board.height < 1.18

    def test_polygons_face_outward(self):
        for board in (
            sphere_board(7),
            c180_board(10),
            sphere_triangle_board(10),
            cube_board(4, 12),
            tetrahedron_board(8, 4),
            torus_board(12, 6, 9),
            torus_triangle_board(20, 6, 14),
            torus_hex_board(6, 12, 9),
        ):
            for cell, polygon in board.polygons.items():
                normal = newell_normal(polygon)
                centroid = tuple(sum(c) / len(polygon) for c in zip(*polygon))
                if board.mode in ("sphere", "c180", "spheretri", "cube", "tetrahedron"):
                    outward = centroid
                else:
                    import math

                    ring_scale = math.hypot(centroid[0], centroid[1])
                    outward = (
                        centroid[0] - centroid[0] / ring_scale,
                        centroid[1] - centroid[1] / ring_scale,
                        centroid[2],
                    )
                dot = sum(n * o for n, o in zip(normal, outward))
                assert dot > 0, (board.mode, cell)

    def test_hex_neighbors_match_offset_layout(self):
        board = hex_board(5, 6, 4)
        # odd row (1, 2) is shifted right: neighbors above/below are cols 2-3
        assert set(board.adjacency[(1, 2)]) == {
            (0, 2), (0, 3), (1, 1), (1, 3), (2, 2), (2, 3),
        }


class TestArchimedean:
    """The eight non-regular Archimedean tilings (six with two tile
    shapes, plus 3.4.6.4 and 4.6.12 with three)."""

    @pytest.mark.parametrize("mode", sorted(_UNIFORM))
    def test_has_exactly_the_two_configured_shapes(self, mode):
        config, _ = _ARCH_CONFIGS[mode]
        board = archimedean_board(mode, 5, 5, 5)
        assert {len(p) for p in board.polygons.values()} == set(config)

    @pytest.mark.parametrize("mode", sorted(_UNIFORM))
    def test_interior_vertex_configuration(self, mode):
        """Around every interior vertex the tile sizes must match the
        tiling's vertex configuration (e.g. 3.3.4.3.4). Edge-to-edge
        vertex-transitive (Archimedean) tilings only; Laves duals vary vertex
        by vertex, and the isogonal tilings meet a vertex with a straight
        edge (TestIsogonal covers those)."""
        config, _ = _ARCH_CONFIGS[mode]
        board = archimedean_board(mode, 5, 5, 5)
        at_vertex = defaultdict(list)
        for polygon in board.polygons.values():
            n = len(polygon)
            for i, point in enumerate(polygon):
                key = (round(point[0], 6), round(point[1], 6))
                before, after = polygon[i - 1], polygon[(i + 1) % n]
                v1 = (before[0] - point[0], before[1] - point[1])
                v2 = (after[0] - point[0], after[1] - point[1])
                angle = abs(
                    math.atan2(
                        v1[0] * v2[1] - v1[1] * v2[0],
                        v1[0] * v2[0] + v1[1] * v2[1],
                    )
                )
                at_vertex[key].append((n, angle))
        interior = 0
        for entries in at_vertex.values():
            if abs(sum(a for _, a in entries) - 2 * math.pi) < 1e-6:
                interior += 1
                assert sorted(s for s, _ in entries) == sorted(config)
        assert interior > 10  # the check actually saw interior vertices

    @pytest.mark.parametrize("mode", sorted(_MONOHEDRAL))
    def test_tiles_are_congruent(self, mode):
        """A monohedral tiling (a Laves dual, a rectangle bond, a rep-tile) is
        built from one congruent tile: every polygon has the same sorted edge
        lengths and interior angles (up to rotation/reflection). Measured over
        the tiles' real corners, so a bond's brick is congruent to its
        neighbours however many of their corners split its edges (a no-op for
        the edge-to-edge Laves tilings -- see _corners)."""
        board = archimedean_board(mode, 5, 5, 5)
        signatures = {_tile_signature([c for c, _ in _corners(p)])
                      for p in board.polygons.values()}
        assert len(signatures) == 1, f"{mode} has non-congruent tiles"

    @pytest.mark.parametrize("mode", sorted(_ARCH_CONFIGS))
    def test_no_overlapping_tiles(self, mode):
        # any edge shared by more than two tiles means overlap
        board = archimedean_board(mode, 5, 5, 5)
        edge_count = defaultdict(int)
        for polygon in board.polygons.values():
            n = len(polygon)
            for i in range(n):
                a = (round(polygon[i][0], 6), round(polygon[i][1], 6))
                b = (round(polygon[(i + 1) % n][0], 6), round(polygon[(i + 1) % n][1], 6))
                edge_count[frozenset((a, b))] += 1
        assert all(count <= 2 for count in edge_count.values())

    # the reflective tilings (cmm / p4m / p6m) get a plain mirror; the
    # chiral/glide tilings (p4g glide, p6) can only manage the pinwheel
    # rotation. Derived so a new tiling classifies itself.
    REFLECTIVE = _REFLECTIVE

    @staticmethod
    def _symmetry(board, reflect):
        """The largest fraction of tiles that map onto another tile when
        the board is reflected/rotated about a centre.

        A symmetry centre sits at a largest-tile centroid (vertex-transitive
        tilings), at a vertex (some face-transitive Laves tilings), at the
        centre of a smaller tile that is centrally symmetric (Durer's rhomb,
        where its two mirrors cross -- a pentagon has no centre to offer) or
        at an edge midpoint (the rep-tile pairs). Scan all four sets of
        candidates and take the best: a centre the scan does not offer scores
        as an asymmetry that is not there."""
        polygons = list(board.polygons.values())
        centroids = [(sum(x for x, _ in p) / len(p),
                      sum(y for _, y in p) / len(p)) for p in polygons]
        biggest = max(len(p) for p in polygons)
        tol = 0.2 * min(math.dist(p[i], p[(i + 1) % len(p)])
                        for p in polygons for i in range(len(p)))
        grid = defaultdict(list)
        for x, y in centroids:
            grid[(round(x / tol), round(y / tol))].append((x, y))

        def present(rx, ry):
            gx, gy = round(rx / tol), round(ry / tol)
            return any(abs(px - rx) < tol and abs(py - ry) < tol
                       for i in (-1, 0, 1) for j in (-1, 0, 1)
                       for px, py in grid.get((gx + i, gy + j), ()))

        board_cx = sum(x for x, _ in centroids) / len(centroids)
        board_cy = sum(y for _, y in centroids) / len(centroids)
        vertices = {(round(x, 6), round(y, 6))
                    for p in polygons for x, y in p}
        # candidate centres near the middle: biggest-tile centroids, and the
        # nearest dozen of every vertex, every other tile's centroid and every
        # edge midpoint (a symmetry centre lies on one of them)
        def nearest(points):
            return sorted(points, key=lambda v: (v[0] - board_cx) ** 2
                          + (v[1] - board_cy) ** 2)[:12]

        midpoints = {(round((p[i][0] + p[(i + 1) % len(p)][0]) / 2, 6),
                      round((p[i][1] + p[(i + 1) % len(p)][1]) / 2, 6))
                     for p in polygons for i in range(len(p))}
        candidates = [c for p, c in zip(polygons, centroids)
                      if len(p) == biggest]
        candidates += nearest(vertices)
        candidates += nearest(c for p, c in zip(polygons, centroids)
                              if len(p) != biggest)
        candidates += nearest(midpoints)
        best = 0.0
        for cx, cy in candidates:
            hits = sum(1 for x, y in centroids if present(*reflect(cx, cy, x, y)))
            best = max(best, hits / len(centroids))
        return best

    @pytest.mark.parametrize("mode", sorted(_ARCH_CONFIGS))
    @pytest.mark.parametrize("difficulty", DIFFICULTIES)
    def test_flat_board_is_symmetric(self, mode, difficulty):
        """A symmetric tiling must give a symmetric board: no stray tiles
        poking out one side."""
        board = build_board(mode, difficulty)
        if mode in _NO_HALF_TURN:
            # p3 (three-scale triangular) has no 180-degree rotation at all,
            # so no window of it can be rotationally symmetric; it is centred
            # on a 3-fold centre instead, which a rectangle cannot preserve
            # either. Nothing to assert beyond the shared invariants.
            return
        # Exactly, not approximately. `archimedean_board` cuts its window on a
        # closed interval about a rotation centre, so a row of centroids
        # landing on the edge is kept on *both* sides and every tile has a
        # partner. The bar used to be 0.85, and what hid under it was a
        # tolerance bug: `_ArchTemplate.centre` is stored rounded to six
        # decimals, the window edge missed a centroid by 5e-7, and the row was
        # dropped at one edge and kept at the other -- a half-column offset
        # that left a line of stray tiles down one side of nine tilings and
        # still scored 0.94. Nothing here may be approximately symmetric.
        rotation = self._symmetry(board, lambda cx, cy, x, y: (2 * cx - x, 2 * cy - y))
        assert rotation == 1.0
        if mode in self.REFLECTIVE:
            lr = self._symmetry(board, lambda cx, cy, x, y: (2 * cx - x, y))
            tb = self._symmetry(board, lambda cx, cy, x, y: (x, 2 * cy - y))
            assert max(lr, tb) == 1.0

    def test_snub_dodecahedron_is_12_pentagons_80_triangles(self):
        board = snub_dodecahedron_board(10)
        sizes = sorted(len(p) for p in board.polygons.values())
        assert len(board.adjacency) == 92
        assert sizes.count(3) == 80 and sizes.count(5) == 12


def _corners(polygon, tol=1e-3):
    """The polygon's real corners: the vertices where it actually turns.

    A tile of an isogonal tiling carries T-vertices -- the corners of the
    neighbours whose edge it splits -- which sit at 180 degrees and are not
    corners of the shape at all. The tolerance is generous (0.06 degrees)
    because vertex tags are rounded to 1e-6 before the board is scaled up,
    and miles below the 60 degrees of the sharpest real corner here.
    """
    n = len(polygon)
    out = []
    for i in range(n):
        before, point, after = polygon[i - 1], polygon[i], polygon[(i + 1) % n]
        v1 = (before[0] - point[0], before[1] - point[1])
        v2 = (after[0] - point[0], after[1] - point[1])
        angle = abs(math.atan2(v1[0] * v2[1] - v1[1] * v2[0],
                               v1[0] * v2[0] + v1[1] * v2[1]))
        if abs(angle - math.pi) > tol:
            out.append((point, angle))
    return out


def _corners3d(polygon, tol=1e-9):
    """The 3D twin of `_corners`: a planar tile's real corners, the collinear
    ones dropped. A brick on a cube carries T-vertices for the same reason a
    tile of an isogonal tiling does, and here they are exactly collinear -- a
    cube face is planar and a cube edge is a straight line -- so the test is
    a zero cross product rather than an angle within a tolerance."""
    n = len(polygon)
    out = []
    for i in range(n):
        before, point, after = polygon[i - 1], polygon[i], polygon[(i + 1) % n]
        u = [before[k] - point[k] for k in range(3)]
        v = [after[k] - point[k] for k in range(3)]
        cross = (u[1] * v[2] - u[2] * v[1],
                 u[2] * v[0] - u[0] * v[2],
                 u[0] * v[1] - u[1] * v[0])
        if math.hypot(*cross) > tol:
            out.append(point)
    return out


class TestIsogonal:
    """The six isogonal tilings that are not edge to edge.

    Vertex-transitive like the Archimedean tilings, but a tile's corner may
    land in the middle of its neighbour's edge, so the invariants are stated
    over the tiles' real corners (see _corners) with the split edges counted
    as the 180-degree angles they are.
    """

    @pytest.mark.parametrize("mode", sorted(_ISOGONAL))
    def test_every_tile_is_a_regular_polygon(self, mode):
        """Convex *regular* polygons: once the T-vertices are dropped, every
        tile has equal sides and equal angles."""
        board = archimedean_board(mode, 4, 4, 5)
        for polygon in board.polygons.values():
            corners = _corners(polygon)
            n = len(corners)
            assert n >= 3
            sides = [math.dist(corners[i][0], corners[(i + 1) % n][0])
                     for i in range(n)]
            angles = [angle for _, angle in corners]
            # 1e-5 relative: tags are rounded to 1e-6 and then scaled up
            assert (max(sides) - min(sides)) / max(sides) < 1e-5
            assert max(angles) - min(angles) < 1e-4
            assert abs(min(angles) - math.pi * (n - 2) / n) < 1e-4

    @pytest.mark.parametrize("mode", sorted(_ISOGONAL))
    def test_is_not_edge_to_edge(self, mode):
        """The defining property of the family: some tile's corner lands
        inside a neighbour's edge. (If this ever passes trivially, the
        tiling belongs in the uniform family instead.)"""
        board = archimedean_board(mode, 4, 4, 5)
        assert any(len(_corners(p)) < len(p) for p in board.polygons.values())

    @pytest.mark.parametrize("mode", sorted(_ISOGONAL))
    def test_every_interior_vertex_is_alike(self, mode):
        """Isogonal: every interior vertex carries the same tiles at the
        same angles -- corners plus, where a neighbour's edge runs straight
        through, a 180. The tile sizes must match the declared config."""
        config, _ = _ARCH_CONFIGS[mode]
        board = archimedean_board(mode, 5, 5, 5)
        at_vertex = defaultdict(list)
        for polygon in board.polygons.values():
            sides = len(_corners(polygon))
            n = len(polygon)
            for i, point in enumerate(polygon):
                before, after = polygon[i - 1], polygon[(i + 1) % n]
                v1 = (before[0] - point[0], before[1] - point[1])
                v2 = (after[0] - point[0], after[1] - point[1])
                angle = abs(math.atan2(v1[0] * v2[1] - v1[1] * v2[0],
                                       v1[0] * v2[0] + v1[1] * v2[1]))
                key = (round(point[0], 4), round(point[1], 4))
                at_vertex[key].append((sides, round(math.degrees(angle))))
        species = defaultdict(int)
        for entries in at_vertex.values():
            if abs(sum(a for _, a in entries) - 360) < 2:  # interior only
                species[tuple(sorted(entries))] += 1
        assert len(species) == 1, dict(species)
        (entries, count), = species.items()
        assert count > 10  # the check actually saw interior vertices
        assert sorted(s for s, _ in entries) == sorted(config)
        assert sum(1 for _, a in entries if a == 180) >= 1

    @pytest.mark.parametrize("mode", sorted(_ISOGONAL))
    def test_tiles_the_plane_without_gaps(self, mode):
        """One domain's tiles cover the domain exactly: their areas sum to
        its area, so the template neither leaves a gap nor overlaps."""
        template = _arch_template(mode)

        def shoelace(points):
            n = len(points)
            return abs(sum(points[i][0] * points[(i + 1) % n][1]
                           - points[(i + 1) % n][0] * points[i][1]
                           for i in range(n))) / 2

        total = 0.0
        for _, refs in template.cells:
            total += shoelace([(dm * template.width + tag[0],
                                dn * template.height + tag[1])
                               for tag, dm, dn in refs])
        assert abs(total - template.width * template.height) < 1e-9

    @pytest.mark.parametrize("mode", sorted(_EDGE_TO_EDGE))
    def test_edge_to_edge_tilings_gain_no_t_vertices(self, mode):
        """The T-vertex pass must be a no-op for every template declared edge
        to edge (the Archimedean and Laves ones): each tile is still exactly
        its own corners."""
        board = archimedean_board(mode, 4, 4, 5)
        assert all(len(_corners(p)) == len(p) for p in board.polygons.values())


class TestRectangles:
    """The five bonds tiled by one congruent rectangle: stacked bond, running
    bond, the two basket weaves and the herringbone.

    Face-transitive rather than vertex-transitive (test_tiles_are_congruent
    above covers the congruence), and all but the stacked bond stagger their
    rows, so a brick corner lands inside a neighbour's edge.
    """

    # brick height / brick length, per bond -- the weaves need a brick per row
    # of their block, so the three-brick weave lays a 3:1 brick
    RATIOS = {"stackedbond": 0.5, "runningbond": 0.5, "basketweave": 0.5,
              "basketweave3": 1 / 3, "herringbone": 0.5}

    @pytest.mark.parametrize("mode", sorted(_RECTANGLE))
    def test_every_tile_is_a_rectangle_of_the_bond_ratio(self, mode):
        """Once the T-vertices are dropped, every tile is a rectangle -- four
        right angles, two pairs of equal sides -- of the bond's aspect."""
        board = archimedean_board(mode, 4, 4, 5)
        for polygon in board.polygons.values():
            corners = [c for c, _ in _corners(polygon)]
            angles = [angle for _, angle in _corners(polygon)]
            assert len(corners) == 4
            assert all(abs(a - math.pi / 2) < 1e-4 for a in angles)
            sides = sorted(math.dist(corners[i], corners[(i + 1) % 4])
                           for i in range(4))
            assert abs(sides[0] - sides[1]) < 1e-4 * sides[3]
            assert abs(sides[2] - sides[3]) < 1e-4 * sides[3]
            assert abs(sides[0] / sides[3] - self.RATIOS[mode]) < 1e-4

    @pytest.mark.parametrize("mode", sorted(_RECTANGLE))
    def test_tiles_the_plane_without_gaps(self, mode):
        """One domain's bricks cover the domain exactly, so the bond neither
        leaves a gap nor overlaps."""
        template = _arch_template(mode)

        def shoelace(points):
            n = len(points)
            return abs(sum(points[i][0] * points[(i + 1) % n][1]
                           - points[(i + 1) % n][0] * points[i][1]
                           for i in range(n))) / 2

        total = 0.0
        for _, refs in template.cells:
            total += shoelace([(dm * template.width + tag[0],
                                dn * template.height + tag[1])
                               for tag, dm, dn in refs])
        assert abs(total - template.width * template.height) < 1e-9

    @pytest.mark.parametrize("mode", sorted(set(_RECTANGLE) - {"stackedbond"}))
    def test_staggered_bonds_are_not_edge_to_edge(self, mode):
        """A staggered bond puts a brick corner inside its neighbour's edge;
        only the stacked bond (a stretched square tiling) meets edge to edge,
        and _EDGE_TO_EDGE covers that side."""
        board = archimedean_board(mode, 4, 4, 5)
        assert any(len(_corners(p)) < len(p) for p in board.polygons.values())

    def test_stacked_bond_plays_like_the_classic_board(self):
        """The stacked bond is the square tiling stretched, so its cells have
        the classic board's eight neighbours -- worth pinning, since that is
        the one thing about it that is *not* new."""
        board = archimedean_board("stackedbond", 6, 6, 5)
        interior = [n for n in board.adjacency.values() if len(n) == 8]
        assert len(interior) > len(board.adjacency) / 2
        assert max(len(n) for n in board.adjacency.values()) == 8


class TestRepTilePatterns:
    """The two rep-tile patterns: the sphinx and the chair (the L-tromino),
    laid down periodically rather than inflated.

    Each is one congruent polyform in half-turned pairs -- face-transitive
    like the bonds, and like the staggered bonds not edge to edge. Their
    family ("Other") claims neither, so the congruence the bonds get from
    test_tiles_are_congruent is asserted here instead. The fractal boards
    built from the same two tiles are TestRepTiles, further up: same tile, a
    substitution instead of a lattice.
    """

    # tile -> its real corners' edge lengths, sorted. The sphinx is the
    # pentagonal hexiamond (sides 1, 1, 1, 2, 3) and the chair is three unit
    # squares in an L (1, 1, 1, 1, 2, 2).
    TILES = {"sphinxpairs": [1.0, 1.0, 1.0, 2.0, 3.0],
             "tromino": [1.0, 1.0, 1.0, 1.0, 2.0, 2.0]}

    @pytest.mark.parametrize("mode", sorted(_REPTILE))
    def test_tiles_are_congruent(self, mode):
        """One congruent tile, in however many orientations -- the invariant
        the monohedral families get from TestArchimedean, which "Other" is
        too mixed a family to claim."""
        board = archimedean_board(mode, 3, 3, 5)
        signatures = {_tile_signature([c for c, _ in _corners(p)])
                      for p in board.polygons.values()}
        assert len(signatures) == 1, f"{mode} has non-congruent tiles"

    @pytest.mark.parametrize("mode", sorted(_REPTILE))
    def test_every_tile_is_the_polyform(self, mode):
        """Once the T-vertices are dropped, every tile is the rep-tile itself
        -- the same edge lengths in the same proportion, at whatever scale the
        preset draws it."""
        board = archimedean_board(mode, 3, 3, 5)
        for polygon in board.polygons.values():
            corners = [c for c, _ in _corners(polygon)]
            assert len(corners) == len(self.TILES[mode])
            sides = sorted(math.dist(corners[i], corners[(i + 1) % len(corners)])
                           for i in range(len(corners)))
            unit = sides[0]
            assert [round(s / unit, 3) for s in sides] == self.TILES[mode]

    @pytest.mark.parametrize("mode", sorted(_REPTILE))
    def test_tiles_the_plane_without_gaps(self, mode):
        """One domain's tiles cover the domain exactly: six sphinxes in
        3 x 3*sqrt3, two chairs in 3 x 2. Neither a gap nor an overlap."""
        template = _arch_template(mode)
        total = 0.0
        for _, refs in template.cells:
            points = [(dm * template.width + tag[0], dn * template.height + tag[1])
                      for tag, dm, dn in refs]
            n = len(points)
            total += abs(sum(points[i][0] * points[(i + 1) % n][1]
                             - points[(i + 1) % n][0] * points[i][1]
                             for i in range(n))) / 2
        assert abs(total - template.width * template.height) < 1e-9

    @pytest.mark.parametrize("mode", sorted(_REPTILE))
    def test_is_not_edge_to_edge(self, mode):
        """A rep-tile's long side spans several of its neighbours' short ones,
        so their corners land inside it -- the T-vertices _insert_t_vertices
        records, and what keeps these out of the edge-to-edge families."""
        board = archimedean_board(mode, 3, 3, 5)
        assert any(len(_corners(p)) < len(p) for p in board.polygons.values())

    @pytest.mark.parametrize("mode", sorted(_REPTILE))
    def test_the_pair_is_a_half_turn_of_one_tile(self, mode):
        """p2 and nothing else: the second tile of each pair is the first
        upside down, so the domain's tiles come in centroid pairs symmetric
        about the template's window centre."""
        template = _arch_template(mode)
        assert template.mirror is None       # no reflection anywhere in p2
        assert template.centre == (0.0, 0.0)  # a half-turn centre, not a tile


class TestFlatGrain:
    """The grain: the straight lines a tiling never crosses, and the flat
    window ending on one.

    Most tilings have none -- pick any horizontal line through a hexagonal
    tiling and hexagons straddle it -- so a flat board's edge is a row of
    tiles kept by centroid, half in and half out, and that is simply what the
    board looks like. Two do have one: every sphinx lies inside a horizontal
    band sqrt3 tall, and the L-tromino pair fills its 3 x 2 rectangle with
    nothing overhanging. ``_snap_to_grain`` rounds the window onto those
    lines, and the edge comes out straight.
    """

    @staticmethod
    def _extent(polygon, axis):
        values = [point[axis] for point in polygon]
        return min(values), max(values)

    @pytest.mark.parametrize("tiling", sorted(_GRAINED))
    def test_no_tile_crosses_the_grain(self, tiling):
        """What makes a line grain: every tile of the domain lies wholly
        between two of them. (Were one to straddle a line, snapping the window
        there would cut it in half rather than end the board on it.)"""
        template = _arch_template(tiling)
        for axis, period in enumerate(template.grain):
            if not period:
                continue
            size = (template.width, template.height)[axis]
            for name, refs in template.cells:
                values = [(dm * template.width + tag[0]) if axis == 0
                          else (dn * template.height + tag[1])
                          for tag, dm, dn in refs]
                low, high = min(values), max(values)
                # vertex tags are rounded to 1e-6, so a tile sitting exactly on
                # a line misses it by about that much
                band = math.floor(low / period + 1e-5)
                assert high <= (band + 1) * period + 1e-5, (
                    f"{tiling}: {name} crosses a grain line on axis {axis}")
            assert abs(size / period - round(size / period)) < 1e-9, (
                f"{tiling}: the grain must divide the domain, or the window's "
                f"centre copy would not sit on a line")

    @pytest.mark.parametrize("mode", sorted(_GRAINED))
    @pytest.mark.parametrize("difficulty", DIFFICULTIES)
    def test_the_board_is_whole_courses(self, mode, difficulty):
        """A board that ends on the grain is a whole number of courses tall
        (or wide): what the snapping buys, measured on the shipped preset."""
        board = build_board(mode, difficulty)
        template = _arch_template(mode)
        for axis, period in enumerate(template.grain):
            if not period:
                continue
            values = [point[axis] for p in board.polygons.values() for point in p]
            # the board is drawn at some pixel scale; recover it from the tile
            # edge the template and the board share
            span = period * _unit_scale(board, template)
            courses = (max(values) - min(values)) / span
            assert abs(courses - round(courses)) < 1e-6, (
                f"{mode}/{difficulty} is {courses:.3f} courses on axis {axis}")

    @pytest.mark.parametrize("mode", sorted(_GRAINED))
    @pytest.mark.parametrize("difficulty", DIFFICULTIES)
    def test_the_edge_is_one_straight_run(self, mode, difficulty):
        """The edge itself, and the difference a grain makes: the board's
        outline touches the line it ends on along **one** stretch, not several.

        A window ending mid-course keeps every other tile of it, so the outline
        meets the extreme in a row of teeth -- many short runs with notches
        between them. Ending on the grain leaves a single straight edge, and
        what falls short of it is only the two corners, where the courses
        themselves step sideways (the sphinx's do, a unit per course, so its
        left and right edges are a staircase and its top and bottom are not).
        """
        board = build_board(mode, difficulty)
        template = _arch_template(mode)
        polygons = list(board.polygons.values())
        for axis, period in enumerate(template.grain):
            if not period:
                continue
            other = 1 - axis
            values = [point[other] for p in polygons for point in p]
            low, high = min(values), max(values)
            for side in (max, min):
                edge = side(point[axis] for p in polygons for point in p)
                on = [abs(_outline_at(polygons, axis, other, low + (high - low)
                                      * (i + 0.5) / 400, side) - edge) < 1e-6
                      for i in range(400)]
                # linear, not circular: an edge that is *all* line is one run
                runs = sum(1 for i, here in enumerate(on)
                           if here and (i == 0 or not on[i - 1]))
                assert runs == 1, (
                    f"{mode}/{difficulty}: the {'far' if side is max else 'near'} "
                    f"edge on axis {axis} meets the line in {runs} runs, not one")
                assert sum(on) > len(on) / 2, (
                    f"{mode}/{difficulty}: that run covers only "
                    f"{sum(on) / len(on):.0%} of the edge")

    def test_the_tromino_board_is_a_plain_rectangle(self):
        """Grained both ways, so its board is the one in the zoo with four
        straight sides: the union of its tiles is exactly its bounding box."""
        board = build_board("tromino", "medium")
        polygons = list(board.polygons.values())
        area = sum(abs(sum(p[i][0] * p[(i + 1) % len(p)][1]
                           - p[(i + 1) % len(p)][0] * p[i][1]
                           for i in range(len(p)))) / 2 for p in polygons)
        xs = [x for p in polygons for x, _ in p]
        ys = [y for p in polygons for _, y in p]
        box = (max(xs) - min(xs)) * (max(ys) - min(ys))
        assert abs(area - box) < 1e-6 * box


def _unit_scale(board, template):
    """Pixels per template unit: the shortest tile edge on the board against
    the shortest in the template's domain."""
    def shortest(polygons):
        return min(math.dist(p[i], p[(i + 1) % len(p)])
                   for p in polygons for i in range(len(p))
                   if math.dist(p[i], p[(i + 1) % len(p)]) > 1e-9)

    domain = [[(dm * template.width + tag[0], dn * template.height + tag[1])
               for tag, dm, dn in refs] for _, refs in template.cells]
    return shortest(board.polygons.values()) / shortest(domain)


def _outline_at(polygons, axis, other, s, side):
    """The board's outline along ``axis`` at position ``s`` on the other axis:
    the extreme edge crossing of the union there."""
    best = None
    for polygon in polygons:
        n = len(polygon)
        for i in range(n):
            a, b = polygon[i], polygon[(i + 1) % n]
            if (a[other] - s) * (b[other] - s) > 0 or a[other] == b[other]:
                continue
            t = (s - a[other]) / (b[other] - a[other])
            value = a[axis] + t * (b[axis] - a[axis])
            best = value if best is None else side(best, value)
    return best


class TestDurer:
    """Durer's pentagon tiling: regular pentagons and 36-degree rhombs.

    The one tiling here that is neither vertex- nor tile-transitive, so
    neither the uniform families' vertex-configuration invariants nor
    test_tiles_are_congruent apply to it; its two shapes are checked instead.
    """

    def test_two_tile_shapes_a_regular_pentagon_and_a_thin_rhomb(self):
        board = archimedean_board("durer", 2, 6, 5)
        shapes = {}
        for polygon in board.polygons.values():
            corners = [c for c, _ in _corners(polygon)]
            angles = [round(math.degrees(a)) for _, a in _corners(polygon)]
            sides = [math.dist(corners[i], corners[(i + 1) % len(corners)])
                     for i in range(len(corners))]
            shapes.setdefault((len(corners), tuple(sorted(angles))), []).append(sides)
        assert sorted(shapes) == [(4, (36, 36, 144, 144)), (5, (108,) * 5)]
        # every edge in the tiling is the same length -- both tiles are
        # equilateral, which is what lets the rhomb fill the pentagons' gap
        unit = min(min(s) for s in sum(shapes.values(), []))
        assert all(abs(side / unit - 1) < 1e-6
                   for sides in sum(shapes.values(), []) for side in sides)

    def test_two_pentagons_to_a_rhomb(self):
        """The domain's proportions, and so the whole tiling's: the rhombs
        fill exactly the gaps three pentagons round a vertex leave open."""
        template = _arch_template("durer")
        counts = Counter(len(refs) for _, refs in template.cells)
        assert counts == {5: 4, 4: 2}

    def test_is_edge_to_edge(self):
        """Unlike the rep-tiles, every edge here runs corner to corner: the
        tiles all have unit edges, so no corner can land inside one."""
        board = archimedean_board("durer", 2, 6, 5)
        assert all(len(_corners(p)) == len(p) for p in board.polygons.values())
        assert _arch_template("durer").straight == {}

    @pytest.mark.parametrize("difficulty", DIFFICULTIES)
    def test_flat_board_is_mirror_symmetric(self, difficulty):
        """pm has mirrors but no half turn at all, so this is the one flat
        board TestArchimedean.test_flat_board_is_symmetric cannot check (it
        returns early for _NO_HALF_TURN). The mirrors run along the rows of
        pentagons, and the window is centred on one of those rows, so the
        board reads symmetric top to bottom."""
        board = build_board("durer", difficulty)
        top_bottom = TestArchimedean._symmetry(
            board, lambda cx, cy, x, y: (x, 2 * cy - y))
        assert top_bottom == 1.0


class TestCubeFrame:
    """The cube-frame (level-1 Menger sponge) surface: a genus-5 polycube
    boundary tiled by unit squares."""

    def test_all_cells_are_quads(self):
        board = cube_frame_board(6, 2, 40)
        assert all(len(p) == 4 for p in board.polygons.values())

    def test_hole_removes_the_face_centers(self):
        # a plain 6x6x6 cube surface would have 6*36 = 216 squares; boring a
        # 2x2 hole through each face and hollowing the middle leaves the
        # twelve edge bars, whose surface is 288 squares
        assert len(cube_frame_board(6, 2, 40).adjacency) == 288

    @pytest.mark.parametrize(
        "n, thickness, genus", [(6, 2, 5), (9, 3, 5), (12, 4, 5)]
    )
    def test_surface_is_genus_five(self, n, thickness, genus):
        # a cube frame is topologically a cube with a tunnel through each
        # pair of opposite faces: chi = 2 - 2*genus = -8
        board = cube_frame_board(n, thickness, 10)
        vertices = len(_corner_fans(board))
        edges = set()
        for polygon in board.polygons.values():
            points = [tuple(round(c, 6) for c in v) for v in polygon]
            for a, b in zip(points, points[1:] + points[:1]):
                edges.add(frozenset((a, b)))
        chi = vertices - len(edges) + len(board.polygons)
        assert chi == 2 - 2 * genus

    def test_surface_is_closed(self):
        # every edge borders exactly two faces: no boundary, so back-face
        # culling (not two_sided rendering) is correct
        board = cube_frame_board(6, 2, 40)
        assert _boundary_components(board) == 0
        assert board.two_sided is False

    def test_orientation_is_consistent_and_outward(self):
        # a consistently wound closed mesh traverses every shared edge once
        # in each direction; check that, then pin the global sign outward
        # via an outer +x face (all its corners sit at x = +1)
        board = cube_frame_board(6, 2, 40)
        directed = [
            (tuple(round(c, 6) for c in a), tuple(round(c, 6) for c in b))
            for polygon in board.polygons.values()
            for a, b in zip(polygon, polygon[1:] + polygon[:1])
        ]
        assert len(directed) == len(set(directed))  # no edge repeated a way
        outer = next(
            p for p in board.polygons.values() if all(v[0] > 0.99 for v in p)
        )
        assert newell_normal(outer)[0] > 0  # normal points along +x, outward

    def test_thickness_must_leave_a_hole(self):
        with pytest.raises(ValueError):
            cube_frame_board(4, 2, 5)  # 2*2 == 4: no hole left


class TestTetrahedronFrame:
    """The tetrahedron frame (level-1 Sierpiński tetrahedron): four
    half-scale corner tetrahedra meeting only at the six edge-midpoints of
    the original, tiled with flat triangles."""

    @pytest.mark.parametrize("frequency", [2, 3, 4])
    def test_cell_count_is_sixteen_faces_of_triangles(self, frequency):
        board = tetrahedron_frame_board(5, frequency)
        # 4 corner tetrahedra * 4 faces * frequency**2 triangles
        assert len(board.polygons) == 16 * frequency * frequency
        assert all(len(p) == 3 for p in board.polygons.values())

    def test_surface_is_closed(self):
        # each corner tetrahedron is a closed manifold; every edge borders two
        # faces, so back-face culling (not two_sided rendering) is correct
        board = tetrahedron_frame_board(5, 3)
        assert _boundary_components(board) == 0
        assert board.two_sided is False

    def test_graph_is_connected_through_the_pinch_points(self):
        # the four corner tetrahedra touch only at shared edge-midpoints, but
        # vertex-adjacency there still links them into one component
        board = tetrahedron_frame_board(5, 3)
        seen, stack = set(), [next(iter(board.adjacency))]
        while stack:
            cell = stack.pop()
            if cell not in seen:
                seen.add(cell)
                stack.extend(board.adjacency[cell])
        assert len(seen) == len(board.adjacency)

    def test_orientation_is_outward_at_an_original_corner(self):
        # the three faces meeting at an original corner (e.g. (1, 1, 1)) sit on
        # the outer hull, so their normals point away from the origin there
        board = tetrahedron_frame_board(5, 2)
        corner = (1.0, 1.0, 1.0)
        outer = [
            p for p in board.polygons.values()
            if any(tuple(round(c, 6) for c in v) == corner for v in p)
        ]
        assert outer
        for polygon in outer:
            centroid = tuple(sum(c) / len(polygon) for c in zip(*polygon))
            assert sum(n * c for n, c in zip(newell_normal(polygon), centroid)) > 0


class TestSteppedCube:
    """The stepped-cube board: a stepped pyramid stitched base-to-base
    with its z-mirror, forming a terraced bipyramid (a sphere)."""

    def test_all_cells_are_quads(self):
        board = stepped_bipyramid_board(6, 3, 20)
        assert all(len(p) == 4 for p in board.polygons.values())

    def test_easy_cell_count(self):
        assert len(stepped_bipyramid_board(6, 3, 20).adjacency) == 144

    @pytest.mark.parametrize("base, levels", [(6, 3), (8, 4), (10, 5)])
    def test_surface_is_a_sphere(self, base, levels):
        # a solid terraced diamond is a topological sphere: chi = 2
        board = stepped_bipyramid_board(base, levels, 10)
        vertices = len(_corner_fans(board))
        edges = set()
        for polygon in board.polygons.values():
            points = [tuple(round(c, 6) for c in v) for v in polygon]
            for a, b in zip(points, points[1:] + points[:1]):
                edges.add(frozenset((a, b)))
        assert vertices - len(edges) + len(board.polygons) == 2

    def test_surface_is_closed_and_outward(self):
        board = stepped_bipyramid_board(8, 4, 40)
        assert _boundary_components(board) == 0
        assert board.two_sided is False
        directed = [
            (tuple(round(c, 6) for c in a), tuple(round(c, 6) for c in b))
            for polygon in board.polygons.values()
            for a, b in zip(polygon, polygon[1:] + polygon[:1])
        ]
        assert len(directed) == len(set(directed))  # consistently wound
        # the very top cap is a square facing straight up (+z)
        top = max(v[2] for p in board.polygons.values() for v in p)
        cap = next(
            p for p in board.polygons.values()
            if all(abs(v[2] - top) < 1e-6 for v in p)
        )
        assert newell_normal(cap)[2] > 0

    def test_widest_terrace_is_the_equator(self):
        # the middle layer spans the full base; the two poles are smaller,
        # so the widest cross-section sits at z = 0 (mirror symmetry)
        board = stepped_bipyramid_board(8, 4, 40)
        zs = [v[2] for p in board.polygons.values() for v in p]
        assert abs(min(zs) + max(zs)) < 1e-6  # symmetric about z = 0

    def test_needs_two_levels_and_a_positive_apex(self):
        with pytest.raises(ValueError):
            stepped_bipyramid_board(6, 1, 5)  # a single level is just a slab
        with pytest.raises(ValueError):
            stepped_bipyramid_board(4, 3, 5)  # apex 4 - 2*2 = 0: nothing left




class TestKleinBottle:
    """The Klein bottle: the square grid on the classic self-intersecting
    bottle immersion -- closed (no boundary) but non-orientable, and
    carrying a ring-translation ``cell_cycle`` for scroll-to-shift."""

    @pytest.mark.parametrize("difficulty", DIFFICULTIES)
    def test_is_a_closed_non_orientable_surface(self, difficulty):
        board = build_board("klein", difficulty)
        assert _euler_characteristic(board) == 0
        assert _boundary_components(board) == 0
        assert board.two_sided is True  # non-orientable: drawn both sides
        assert {len(n) for n in board.adjacency.values()} == {8}

    @pytest.mark.parametrize("difficulty", DIFFICULTIES)
    def test_immersion_keeps_every_vertex_distinct(self, difficulty):
        # a closed quad mesh with chi = 0 has V = F; if the immersion merged
        # two grid vertices the distinct-point count would drop below F
        board = build_board("klein", difficulty)
        points = {tuple(round(c, 6) for c in p)
                  for poly in board.polygons.values() for p in poly}
        assert len(points) == len(board.polygons)

    @pytest.mark.parametrize("difficulty", DIFFICULTIES)
    def test_cell_cycle_is_a_graph_automorphism(self, difficulty):
        board = build_board("klein", difficulty)
        cycle = board.cell_cycle
        assert cycle is not None
        # a bijection over exactly the cells
        assert set(cycle) == set(board.adjacency)
        assert len(set(cycle.values())) == len(cycle)
        # adjacency-preserving: neighbours map to neighbours (so the board
        # reads correctly at every scroll offset)
        for cell, neighbors in board.adjacency.items():
            shifted = board.adjacency[cycle[cell]]
            assert all(cycle[n] in shifted for n in neighbors)

    def test_cell_cycle_period_is_twice_the_ring(self):
        # crossing the seam flips the tube, so a cell returns to itself only
        # after two full loops: order 2 * ring (here ring = 12)
        board = klein_board(12, 6, 9)
        cycle = board.cell_cycle
        start = next(iter(cycle))
        cur, order = cycle[start], 1
        while cur != start:
            cur, order = cycle[cur], order + 1
        assert order == 24

    def test_tube_must_be_even(self):
        # the seam reflection j -> tube/2 - j - 1 only lands on cells when
        # tube is even
        with pytest.raises(ValueError):
            klein_board(12, 5, 9)


class TestDoubleTorus:
    """Two donuts overlapping and cut apart along the plane between them: the
    connected sum of two tori, and the one board in the zoo that is not a
    sphere, a disc or a chi = 0 surface. All three regular tilings wrap it --
    the cut is a statement about the immersion, not about the tiling."""

    MODES = ("doubletorus", "doubletorustri", "doubletorushex")
    BUILDERS = {
        "square": (double_torus_board, (16, 8)),
        "tri": (double_torus_triangle_board, (24, 8)),
        "hex": (double_torus_hex_board, (6, 14)),
    }

    @pytest.mark.parametrize("mode", MODES)
    @pytest.mark.parametrize("difficulty", DIFFICULTIES)
    def test_is_a_closed_orientable_genus_two_surface(self, mode, difficulty):
        board = build_board(mode, difficulty)
        assert _euler_characteristic(board) == -2      # genus 2
        assert _boundary_components(board) == 0        # closed
        assert board.two_sided is False                # orientable

    @pytest.mark.parametrize("mode", MODES)
    def test_the_euler_characteristic_is_the_one_the_surface_declares(self, mode):
        """...and it is declared once, on the SurfaceSpec, which is what the
        size search reads to tell a genus-2 window from a mis-glued one."""
        surface = surface_of(mode)
        assert (surface.euler, surface.boundary_components) == (-2, 0)

    def test_the_outer_equator_of_one_lies_on_the_inner_equator_of_the_other(self):
        """What puts the two donuts far enough into each other to merge.

        The outer equator of a donut of tube radius r stands 1 + r from its
        centre and the inner one 1 - r, so the two meet when the centres are
        (1 + r) + (1 - r) = 2 apart -- separation 1, whatever r is. Both points
        are then at x = r, and the ring circles are tangent at the origin, so
        the tubes round them share a lens of real volume rather than a point.
        """
        for tube_radius in (0.28, 0.38, 0.52):
            outer = (1.0 + tube_radius) - 1.0        # donut A's outer equator
            inner = 1.0 - (1.0 - tube_radius)        # donut B's inner equator
            assert outer == pytest.approx(inner) == pytest.approx(tube_radius)

    @pytest.mark.parametrize("tiling", sorted(BUILDERS))
    @pytest.mark.parametrize("tube_radius", [0.28, 0.38, 0.52])
    def test_pushed_apart_to_touching_there_is_nothing_left_to_merge(
        self, tiling, tube_radius
    ):
        """Past separation 1 + tube_radius the donuts do not reach each other
        at all, and the builder says so rather than handing back two donuts
        joined by nothing. (*At* 1 + tube_radius the outer rims touch at a
        point, and the cut -- which counts a vertex on the plane as past it --
        takes the cells round that point, so the square tiling still merges
        there, through a pinhole. That is the kiss the board started as.)"""
        builder, window = self.BUILDERS[tiling]
        with pytest.raises(ValueError, match="do not reach each other"):
            builder(*window, 20, tube_radius, 1.05 + tube_radius)

    @pytest.mark.parametrize("tiling", sorted(BUILDERS))
    @pytest.mark.parametrize("scale", [1, 2, 3])
    @pytest.mark.parametrize("tube_radius,separation", [(0.28, 1.0), (0.38, 1.0),
                                                        (0.52, 1.0), (0.38, 1.2)])
    def test_chi_is_minus_two_over_the_whole_window_range(
        self, tiling, scale, tube_radius, separation
    ):
        """The cut is geometric, not a block someone chose, so the shape of the
        removed region moves with every argument and with the tiling. It stays
        a disc, and the builder refuses the windows where it would not -- so
        every board that builds at all is a torus-minus-disc glued to a
        torus-minus-disc, chi = -1 - 1."""
        builder, (a, b) = self.BUILDERS[tiling]
        board = builder(a * scale, b * scale, 20, tube_radius, separation)
        assert _euler_characteristic(board) == -2
        assert _boundary_components(board) == 0

    @pytest.mark.parametrize("mode", MODES)
    @pytest.mark.parametrize("difficulty", DIFFICULTIES)
    def test_each_donut_keeps_its_own_side_of_the_plane(self, mode, difficulty):
        """What makes the board embedded however deep the donuts overlap: the
        cut takes every cell that puts a vertex on the other side, so one donut
        lies wholly in x <= 0 and the other wholly in x >= 0 and the two meet
        only on the plane itself."""
        board = build_board(mode, difficulty)
        seen = {-1: False, 1: False}
        for cell, polygon in board.polygons.items():
            side = -1 if cell[0] == 0 else 1
            for x, _, _ in polygon:
                assert side * round(x, 9) >= 0, (cell, x)
                if round(x, 9) != 0:
                    seen[side] = True
        assert all(seen.values())          # both donuts are really there
        # ...and no two vertices were rounded into one, which would drop chi
        # silently (the topology invariants key on coordinates). The builder
        # refuses a window where that happens; this is the shipped rows.
        points = {tuple(round(c, 6) for c in p)
                  for poly in board.polygons.values() for p in poly}
        assert len(points) == len(_corner_fans(board))

    def test_a_vertex_on_the_plane_is_cut_away_rather_than_duplicated(self):
        """At separation 1 the tube's quarter points sit on the plane exactly.

        Left on the kept side such a vertex is not on the seam -- no removed
        cell need touch it -- so the two donuts' copies of it are two ids at one
        point: a surface touching itself, and a chi that reads as a donut. The
        cut counts "on the plane" as past it, so the cell goes and the vertex is
        either unused or shared. `10 x 12` triangles is the window that found
        it.
        """
        board = double_torus_triangle_board(10, 12, 20, 0.28)
        assert _euler_characteristic(board) == -2
        points = {tuple(round(c, 6) for c in p)
                  for poly in board.polygons.values() for p in poly}
        assert len(points) == len(_corner_fans(board))

    @pytest.mark.parametrize("mode", MODES)
    @pytest.mark.parametrize("difficulty", DIFFICULTIES)
    def test_faces_wind_outward_consistently(self, mode, difficulty):
        """Each face is wound outward from *its own* donut's ring circle, and
        the test that the two rules agree across the seam is that every edge is
        traversed once each way -- which is orientability, measured."""
        board = build_board(mode, difficulty)
        directed = Counter()
        for polygon in board.polygons.values():
            points = [tuple(round(c, 7) for c in p) for p in polygon]
            for a, b in zip(points, points[1:] + points[:1]):
                directed[(a, b)] += 1
        assert set(directed.values()) == {1}
        # ...and outward rather than inward: by the divergence theorem an
        # outward-wound closed surface encloses a positive volume
        volume = 0.0
        for polygon in board.polygons.values():
            o = polygon[0]
            for a, b in zip(polygon[1:], polygon[2:]):
                u = [a[k] - o[k] for k in range(3)]
                v = [b[k] - o[k] for k in range(3)]
                volume += sum(o[k] * _cross(u, v)[k] for k in range(3)) / 6
        assert volume > 0

    @pytest.mark.parametrize("mode,sides", [("doubletorus", 4),
                                            ("doubletorustri", 3),
                                            ("doubletorushex", 6)])
    def test_every_cell_is_the_tilings_own_polygon(self, mode, sides):
        board = build_board(mode, "medium")
        assert {len(p) for p in board.polygons.values()} == {sides}

    def test_the_ring_circles_may_not_be_pulled_through_each_other(self):
        with pytest.raises(ValueError, match="separation below 1"):
            double_torus_board(16, 8, 20, 0.38, 0.9)

    def test_a_tube_too_thin_for_the_cut_is_refused(self):
        """A cut that leaves the far side of the tube one cell thick gives that
        cell four seam vertices and no vertex of its own -- so the other donut's
        copy of it is the same four ids, and the two are glued to each other
        along every edge. That is a pinch, not a surface."""
        with pytest.raises(ValueError, match="every vertex on the seam"):
            double_torus_board(8, 5, 20, 0.28, 1.0)

    def test_a_cut_that_takes_a_whole_course_is_refused(self):
        """...and where it takes a course right round the tube instead, what is
        left of a donut is a cylinder -- and two cylinders glued rim to rim are
        a donut again, not a double one. Measured on what is left of one donut:
        it has to be a torus minus one disc."""
        with pytest.raises(ValueError, match="not the torus-minus-a-disc"):
            double_torus_triangle_board(10, 4, 20, 0.52, 1.0)


class TestTrefoil:
    """The donut's lattices on a tube round a trefoil knot. Nothing about the
    surface changes -- it is a torus, glued as the donut is glued -- so the
    tests that matter are that the graph really is the donut's, that the
    immersion winds outward although the knot is no ring through the origin,
    and that the tube never meets itself where the strands cross."""

    MODES = ("trefoil", "trefoiltri", "trefoilhex")
    TORUS = {"trefoil_board": torus_board,
             "trefoil_triangle_board": torus_triangle_board,
             "trefoil_hex_board": torus_hex_board}

    @staticmethod
    def _presets(mode):
        from minesweeper.boards._data import load
        spec = load("presets")["presets"][mode]
        return spec["builder"], spec["args"]

    @staticmethod
    def _nearest_t(point, samples=240):
        """The knot parameter nearest ``point``: the best of an even sample,
        then refined by golden section either side of it."""
        step = 2 * math.pi / samples
        best = min(range(samples),
                   key=lambda k: math.dist(point, _trefoil_core(k * step)[0]))
        lo, hi = (best - 1) * step, (best + 1) * step
        g = (5 ** 0.5 - 1) / 2
        for _ in range(40):
            a, b = hi - g * (hi - lo), lo + g * (hi - lo)
            if (math.dist(point, _trefoil_core(a)[0])
                    < math.dist(point, _trefoil_core(b)[0])):
                hi = b
            else:
                lo = a
        return (lo + hi) / 2 % (2 * math.pi)

    @pytest.mark.parametrize("mode", MODES)
    @pytest.mark.parametrize("difficulty", DIFFICULTIES)
    def test_is_a_closed_orientable_torus(self, mode, difficulty):
        board = build_board(mode, difficulty)
        assert _euler_characteristic(board) == 0
        assert _boundary_components(board) == 0
        assert board.two_sided is False

    @pytest.mark.parametrize("mode", MODES)
    def test_the_surface_declares_the_torus_topology(self, mode):
        surface = surface_of(mode)
        assert surface.key == "trefoil"
        assert (surface.euler, surface.boundary_components) == (0, 0)

    @pytest.mark.parametrize("mode", MODES)
    @pytest.mark.parametrize("difficulty", DIFFICULTIES)
    def test_the_graph_is_the_donuts_cell_for_cell(self, mode, difficulty):
        """The knot only moves where the cells are drawn: the same window on
        the donut is the same board, neighbour for neighbour. (So the donut's
        playability measurements -- `resize.MIN_WRAP_CELLS` -- are the knot's
        own.)"""
        builder, args = self._presets(mode)
        ring, tube, mines, _fraction = args[difficulty]
        knot = build_board(mode, difficulty)
        donut = self.TORUS[builder](ring, tube, mines)
        assert knot.adjacency == donut.adjacency

    @pytest.mark.parametrize("mode", MODES)
    @pytest.mark.parametrize("difficulty", DIFFICULTIES)
    def test_every_face_winds_outward_from_the_knot(self, mode, difficulty):
        """The donut's rule measures "outward" from the ring circle through
        the origin, which on a knot points every which way; the builder
        measures it from the knot's own centre line instead."""
        board = build_board(mode, difficulty)
        for polygon in board.polygons.values():
            # summed over the corners, each against the knot point nearest
            # *it*: a long slat on a tight bend is twisted enough that its
            # centre's nearest knot point says almost nothing about which way
            # the slat faces
            outward = [0.0, 0.0, 0.0]
            for corner in polygon:
                core, _ = _trefoil_core(self._nearest_t(corner))
                for i in range(3):
                    outward[i] += corner[i] - core[i]
            assert sum(a * b for a, b in zip(_newell_normal(polygon), outward)) > 0

    @pytest.mark.parametrize("mode", MODES)
    @pytest.mark.parametrize("difficulty", DIFFICULTIES)
    def test_the_winding_is_consistent(self, mode, difficulty):
        """On a closed orientable surface wound one way throughout, every edge
        is traversed once in each direction -- the combinatorial check that
        the outward rule never flips a face against its neighbours."""
        board = build_board(mode, difficulty)
        def key(p):
            return tuple(round(c, 6) for c in p)
        edges = Counter()
        for polygon in board.polygons.values():
            ring = [key(p) for p in polygon]
            edges.update(zip(ring, ring[1:] + ring[:1]))
        assert all(n == 1 for n in edges.values())
        assert all((b, a) in edges for a, b in edges)

    def test_the_reach_is_what_the_knot_measures(self):
        """TREFOIL_REACH is measured, so measure it again: half the closest
        approach of two points far apart along the knot (a doubly critical
        pair), which here is tighter than the tightest bend."""
        n = 600
        ts = [2 * math.pi * k / n for k in range(n)]
        pts = [_trefoil_core(t)[0] for t in ts]
        best, pair = math.inf, None
        for i in range(n):
            for j in range(i + 1, n):
                if min(j - i, n - j + i) * 2 * math.pi / n < 0.8:
                    continue
                d = math.dist(pts[i], pts[j])
                if d < best:
                    best, pair = d, (ts[i], ts[j])
        s, t = pair
        h = 1e-3
        while h > 1e-10:
            moved = False
            for ds, dt in ((h, 0), (-h, 0), (0, h), (0, -h)):
                d = math.dist(_trefoil_core(s + ds)[0], _trefoil_core(t + dt)[0])
                if d < best:
                    best, s, t, moved = d, s + ds, t + dt, True
            if not moved:
                h /= 2
        assert best / 2 == pytest.approx(TREFOIL_REACH, abs=1e-5)
        # ...and the bend is not the tighter limit: the radius of curvature
        # never drops to the reach
        def curvature(t, e=1e-4):
            a, b, c = (_trefoil_core(t + k * e)[0] for k in (-1, 0, 1))
            d1 = [(z - x) / (2 * e) for x, z in zip(a, c)]
            d2 = [(x - 2 * y + z) / e / e for x, y, z in zip(a, b, c)]
            return math.hypot(*_cross(d1, d2)) / math.hypot(*d1) ** 3
        assert max(curvature(t) for t in ts) < 1 / TREFOIL_REACH

    @pytest.mark.parametrize("mode", MODES)
    @pytest.mark.parametrize("difficulty", DIFFICULTIES)
    def test_no_face_reaches_another_strand(self, mode, difficulty):
        """The board is embedded: every point of every face is nearest the
        stretch of knot its own cell spans, so it is inside its own slab of
        the tube and no other strand's face can reach it. Probed at each
        face's corners, edge midpoints and centre."""
        builder, args = self._presets(mode)
        board = build_board(mode, difficulty)
        steps = args[difficulty][0] if builder != "trefoil_hex_board" else 2 * args[difficulty][1]
        margin = 2 * math.pi / steps
        for polygon in board.polygons.values():
            corner_ts = [self._nearest_t(p) for p in polygon]
            # the cell's span along the knot, unwrapped about its first corner
            first = corner_ts[0]
            offsets = [(t - first + math.pi) % (2 * math.pi) - math.pi for t in corner_ts]
            lo, hi = min(offsets) - margin, max(offsets) + margin
            probes = [tuple((a + b) / 2 for a, b in zip(p, q))
                      for p, q in zip(polygon, polygon[1:] + polygon[:1])]
            probes.append(tuple(sum(c) / len(polygon) for c in zip(*polygon)))
            for probe in probes:
                t = (self._nearest_t(probe) - first + math.pi) % (2 * math.pi) - math.pi
                assert lo <= t <= hi

    def test_refuses_a_tube_that_meets_itself(self):
        for tube in (0.0, 1.0, 1.2):
            with pytest.raises(ValueError, match="fraction of TREFOIL_REACH"):
                trefoil_board(60, 8, 10, tube)

    @pytest.mark.parametrize("builder,window", [
        (trefoil_board, (10, 8)),           # ten slats round a whole knot
        (trefoil_triangle_board, (6, 14)),  # each triangle a third of it
        (trefoil_hex_board, (4, 6)),
    ])
    def test_refuses_a_window_whose_chords_cut_through_the_knot(self, builder, window):
        """A face is flat, so a window a handful of cells along the knot draws
        chords straight through the strands it should wind round. Cell shape
        cannot see it -- each triangle of the 6x14 window is well shaped --
        and it was the size search's first answer for the easy board."""
        with pytest.raises(ValueError, match="too coarse"):
            builder(*window, 10, 0.5)


class TestKleinTilings:
    """The Klein bottle wrapped with tilings other than the square grid:
    the triangle/hexagon regular boards and (via the WRAPPED suite below)
    every non-chiral Archimedean/Laves tiling."""

    # every klein mode the catalog exposes: square + triangle + hexagon +
    # the 14 non-chiral template tilings
    KLEIN_MODES = sorted(m for m in MODE_LABELS if surface_of(m)
                         and surface_of(m).key == "klein")

    def test_menu_offers_klein_for_every_non_chiral_tiling(self):
        # 3 regular + 8 Archimedean + 8 Laves + 6 isogonal + 5 rectangle = 30
        # tilings, minus the chiral ones (snub hexagonal and its floret dual,
        # 4 of the 6 isogonal, herringbone) = 23
        assert len(self.KLEIN_MODES) == 23
        assert "kleinsnubhex" not in MODE_LABELS
        assert "kleinfloret" not in MODE_LABELS

    @pytest.mark.parametrize("mode", KLEIN_MODES)
    @pytest.mark.parametrize("difficulty", DIFFICULTIES)
    def test_each_is_a_closed_non_orientable_surface(self, mode, difficulty):
        board = build_board(mode, difficulty)
        assert _euler_characteristic(board) == 0
        assert _boundary_components(board) == 0
        assert board.two_sided is True

    def test_triangle_and_hex_cell_counts(self):
        assert len(klein_triangle_board(18, 6, 13).adjacency) == 108
        assert len(klein_hex_board(6, 4, 9).adjacency) == 24

    def test_triangle_tube_must_be_even(self):
        with pytest.raises(ValueError):
            klein_triangle_board(10, 5, 12)

    def test_triangle_ring_parity_follows_the_seam_flip(self):
        # the seam mirror (ky -> tube//2 - 1 - ky) lands on the offset
        # lattice only when ring matches that flip's parity
        with pytest.raises(ValueError):
            klein_triangle_board(19, 6, 13)   # tube//2 - 1 even, ring odd
        with pytest.raises(ValueError):
            klein_triangle_board(24, 8, 20)   # tube//2 - 1 odd, ring even

    def test_hex_rows_must_be_even(self):
        with pytest.raises(ValueError):
            klein_hex_board(6, 5, 9)

    def _assert_is_scroll_cycle(self, board):
        cycle = board.cell_cycle
        assert cycle is not None and set(cycle) == set(board.adjacency)
        assert len(set(cycle.values())) == len(cycle)  # a bijection
        for cell, neighbors in board.adjacency.items():
            shifted = board.adjacency[cycle[cell]]
            assert all(cycle[n] in shifted for n in neighbors)  # automorphism

    def test_hex_carries_a_scroll_cycle(self):
        # whole-hexagon cells let the ring translation act as an automorphism
        self._assert_is_scroll_cycle(klein_hex_board(8, 6, 20))

    def test_triangle_carries_a_scroll_cycle(self):
        # the triangular lattice's ring translation is two lattice columns
        self._assert_is_scroll_cycle(klein_triangle_board(18, 6, 13))
        self._assert_is_scroll_cycle(klein_triangle_board(25, 8, 20))

    def test_chiral_tilings_have_no_klein(self):
        for tiling in ("snubhex", "floret"):
            with pytest.raises(ValueError):
                arch_klein_board(tiling, 4, 3, 5)

    def test_glide_tilings_need_odd_half_domains(self):
        # p4g (snub square, Cairo) glues with a glide, so nx counts
        # half-domains and must be odd, exactly as on the Möbius strip
        for tiling in ("snubsquare", "cairo"):
            with pytest.raises(ValueError):
                arch_klein_board(tiling, 10, 4, 5)

    def test_arch_klein_scroll_cycle_is_an_automorphism(self):
        board = arch_klein_board("trihex", 6, 3, 12)
        cycle = board.cell_cycle
        assert cycle is not None and set(cycle) == set(board.adjacency)
        assert len(set(cycle.values())) == len(cycle)
        for cell, neighbors in board.adjacency.items():
            shifted = board.adjacency[cycle[cell]]
            assert all(cycle[n] in shifted for n in neighbors)


class TestWrappedArchimedean:
    """The Archimedean tilings wrapped onto the donut, cylinder and
    Möbius strip."""

    WRAPPED = [
        mode
        for mode in MODE_LABELS
        if mode.startswith(("torus", "mobius", "cyl", "klein"))
        and any(mode.endswith(tiling) for tiling in _ARCH_CONFIGS)
    ]

    # only the vertex-transitive *and* edge-to-edge tilings (the uniform
    # family) have a single vertex configuration a raw corner-fan size can
    # check directly; Laves duals vary vertex by vertex, and the isogonal
    # tilings' T-vertices inflate every cell's stored corner count (see
    # _insert_t_vertices) -- TestIsogonal covers their vertex configuration
    # on the plane, corners measured with the T-vertices dropped.
    WRAPPED_VERTEX_TRANSITIVE = [
        m for m in WRAPPED
        if any(m.endswith(t) for t in set(_VERTEX_TRANSITIVE) & set(_EDGE_TO_EDGE))
    ]

    @pytest.mark.parametrize(
        "tiling", sorted(set(_UNIFORM) & set(_WRAPPED_TILINGS)))
    def test_torus_vertex_configuration_everywhere(self, tiling):
        """A torus has no boundary, so every single vertex must show the
        tiling's full vertex configuration."""
        board = build_board("torus" + tiling, "easy")
        config = sorted(_ARCH_CONFIGS[tiling][0])
        for fan in _corner_fans(board).values():
            assert sorted(fan) == config

    @pytest.mark.parametrize("mode", sorted(WRAPPED_VERTEX_TRANSITIVE))
    def test_vertices_are_full_or_boundary(self, mode):
        """On the open surfaces every vertex fan is the configuration or
        a part of it (boundary vertices)."""
        board = build_board(mode, "easy")
        # longest suffix wins: "trihex" is also the tail of "trunctrihex"
        tiling = max((t for t in _ARCH_CONFIGS if mode.endswith(t)), key=len)
        want = Counter(_ARCH_CONFIGS[tiling][0])
        for fan in _corner_fans(board).values():
            assert not Counter(fan) - want, (mode, fan)

    @pytest.mark.parametrize("mode", sorted(WRAPPED))
    @pytest.mark.parametrize("difficulty", DIFFICULTIES)
    def test_euler_characteristic_is_zero(self, mode, difficulty):
        # the torus, cylinder and Möbius strip all have chi = 0
        board = build_board(mode, difficulty)
        vertices = len(_corner_fans(board))
        edges = set()
        for polygon in board.polygons.values():
            points = [tuple(round(c, 6) for c in p) for p in polygon]
            for a, b in zip(points, points[1:] + points[:1]):
                edges.add(frozenset((a, b)))
        assert vertices - len(edges) + len(board.polygons) == 0

    @pytest.mark.parametrize("mode", sorted(WRAPPED))
    def test_boundary_circles_match_the_surface(self, mode):
        """The seam gluing is what distinguishes the surfaces: a torus is
        closed, a cylinder has two rims, a Möbius strip has one. Each
        surface's expected count is declared once on its SurfaceSpec."""
        board = build_board(mode, "easy")
        assert _boundary_components(board) == surface_of(mode).boundary_components

    def test_cell_counts(self):
        counts = {
            "toruselongated": (84, 270, 486),
            "torussnubsquare": (90, 264, 480),
            "torustrihex": (90, 270, 480),
            "torussnubhex": (144, 252, 432),
            "torustruncsquare": (80, 252, 480),
            "torustrunchex": (90, 252, 480),
            "cylelongated": (91, 230, 512),
            "cylsnubsquare": (84, 231, 480),
            "cyltrihex": (81, 270, 504),
            "cylsnubhex": (75, 264, 504),
            "cyltruncsquare": (77, 260, 459),
            "cyltrunchex": (81, 270, 504),
            "mobiuselongated": (91, 286, 416),
            "mobiussnubsquare": (78, 276, 465),
            "mobiustrihex": (81, 225, 420),
            "mobiustruncsquare": (77, 260, 459),
            "mobiustrunchex": (81, 225, 420),
            "torusrhombitrihex": (96, 264, 468),
            "torustrunctrihex": (96, 288, 468),
            "cylrhombitrihex": (84, 286, 480),
            "cyltrunctrihex": (80, 242, 510),
            "mobiusrhombitrihex": (84, 286, 532),
            "mobiustrunctrihex": (80, 280, 420),
            "torusprismaticpent": (88, 252, 480),
            "cylprismaticpent": (90, 270, 456),
            "mobiusprismaticpent": (72, 224, 444),
            "toruscairo": (84, 256, 480),
            "cylcairo": (80, 252, 456),
            "mobiuscairo": (85, 261, 507),
            "torusrhombille": (84, 252, 480),
            "cylrhombille": (90, 240, 462),
            "mobiusrhombille": (77, 285, 550),
            "torusfloret": (96, 264, 468),
            "cylfloret": (84, 264, 450),
            "torustetrakis": (80, 260, 476),
            "cyltetrakis": (72, 280, 456),
            "mobiustetrakis": (80, 280, 456),
            "torustriakis": (96, 264, 504),
            "cyltriakis": (84, 264, 450),
            "mobiustriakis": (84, 264, 540),
            "torusdeltoidal": (96, 264, 468),
            "cyldeltoidal": (72, 264, 450),
            "mobiusdeltoidal": (72, 264, 468),
            "toruskisrhombille": (192, 288, 480),
            "cylkisrhombille": (72, 288, 480),
            "mobiuskisrhombille": (144, 240, 528),
            "kleinelongated": (84, 264, 486),
            "kleinsnubsquare": (81, 252, 486),
            "kleintrihex": (90, 252, 480),
            "kleintruncsquare": (80, 256, 480),
            "kleintrunchex": (90, 252, 480),
            "kleinrhombitrihex": (96, 264, 468),
            "kleintrunctrihex": (96, 252, 468),
            "kleinprismaticpent": (80, 252, 480),
            "kleincairo": (78, 250, 490),
            "kleinrhombille": (84, 264, 480),
            "kleintetrakis": (80, 260, 480),
            "kleintriakis": (96, 264, 480),
            "kleindeltoidal": (96, 240, 468),
            "kleinkisrhombille": (192, 288, 480),
            "torusoffsetsquare": (84, 252, 476),
            "cyloffsetsquare": (80, 252, 468),
            "mobiusoffsetsquare": (80, 252, 507),
            "kleinoffsetsquare": (78, 260, 476),
            "torusstaggeredtri": (84, 256, 480),
            "cylstaggeredtri": (72, 266, 468),
            "mobiusstaggeredtri": (70, 246, 490),
            "kleinstaggeredtri": (84, 264, 492),
            "toruspythagorean": (80, 270, 480),
            "cylpythagorean": (85, 261, 468),
            "torusrotatedhex": (90, 252, 480),
            "cylrotatedhex": (81, 270, 504),
            "torusrotatedtri": (84, 252, 480),
            "cylrotatedtri": (81, 270, 504),
            "torusthreescaletri": (90, 252, 480),
            "torusstackedbond": (80, 252, 480),
            "cylstackedbond": (84, 260, 459),
            "mobiusstackedbond": (84, 260, 476),
            "kleinstackedbond": (80, 253, 480),
            "torusrunningbond": (80, 252, 480),
            "cylrunningbond": (84, 260, 476),
            "mobiusrunningbond": (84, 260, 459),
            "kleinrunningbond": (84, 260, 476),
            "torusbasketweave": (80, 256, 480),
            "cylbasketweave": (80, 240, 504),
            "mobiusbasketweave": (88, 228, 464),
            "kleinbasketweave": (72, 272, 460),
            "torusbasketweave3": (96, 252, 480),
            "cylbasketweave3": (90, 240, 462),
            "mobiusbasketweave3": (78, 270, 504),
            "kleinbasketweave3": (108, 270, 504),
            "torusherringbone": (80, 256, 480),
            "cylherringbone": (90, 250, 490),
        }
        assert sorted(counts) == sorted(self.WRAPPED)
        for mode, expected in counts.items():
            for difficulty, count in zip(DIFFICULTIES, expected):
                assert len(build_board(mode, difficulty).adjacency) == count

    # The tilings that have a horizontal line of edges to cut along, so their
    # band or tube comes out with a straight rim (see the AGENT NOTE on the cut
    # in boards/tilings.py). The rest are cut halfway between two courses and
    # get a symmetric zigzag instead. One list for both surfaces, because they
    # share the cut: every tiling here is straight on the Mobius strip and on
    # the cylinder alike.
    STRAIGHT_RIM = {
        "elongated", "trihex", "prismaticpent", "deltoidal", "triakis",
        "kisrhombille", "tetrakis", "offsetsquare", "staggeredtri",
        "stackedbond", "runningbond", "basketweave", "basketweave3",
    }

    MOBIUS_MODES = sorted(m for m in WRAPPED if m.startswith("mobius"))
    CYLINDER_MODES = sorted(m for m in WRAPPED if m.startswith("cyl"))

    @staticmethod
    def _band_rows(mode, difficulty):
        """Where across the band each row of tiles sits, and how tall the band
        is: one domain column's worth of tile centres, measured from the cut
        that ``arch_mobius_board`` starts the band at."""
        tiling = max((t for t in _ARCH_CONFIGS if mode.endswith(t)), key=len)
        template = _arch_template(tiling)
        height, cut = template.height, template.cut
        strip = ARCH_PRESETS[tiling]["mobius"][difficulty][1] * height
        rows = []
        for name, refs in template.cells:
            y = sum(dn * height + template.verts[tag][1] for tag, _, dn in refs)
            y /= len(refs)
            for n in range(math.floor(cut / height) - 1,
                           math.ceil((cut + strip) / height) + 1):
                if cut - 1e-9 <= y + n * height < cut + strip - 1e-9:
                    rows.append(y + n * height - cut)
        return rows, strip

    @pytest.mark.parametrize("difficulty", DIFFICULTIES)
    @pytest.mark.parametrize("mode", MOBIUS_MODES)
    def test_mobius_band_is_symmetric(self, mode, difficulty):
        """A Mobius strip has *one* edge, so the band's two rims are two arcs
        of the same circle: whatever the tiling does at one rim it must do at
        the other, or half the edge reads one way and half the other. Which
        makes the band's centre line a mirror of its rows.

        This is the check a tiling's ``cut`` has to pass. Cut a band
        where a row of tile *centres* falls and that row is kept at one rim
        and not at the other -- which is what six of the eight uniform
        tilings, and rhombille, shipped as.
        """
        rows, strip = self._band_rows(mode, difficulty)
        assert rows
        for here, there in zip(sorted(rows), sorted(strip - row for row in rows)):
            assert abs(here - there) < 1e-6, f"{mode} {difficulty} band is lopsided"

    @pytest.mark.parametrize("mode", MOBIUS_MODES)
    def test_mobius_rim_is_straight_where_the_tiling_allows(self, mode):
        """...and where the tiling has a horizontal edge-line, the cut runs
        along it, so the strip's single edge is a clean circle rather than a
        zigzag: every boundary vertex the same distance across the band.

        Measured on the immersion, where that distance is just how far the
        point lies from the strip's core circle.
        """
        tiling = max((t for t in _ARCH_CONFIGS if mode.endswith(t)), key=len)
        board = build_board(mode, "medium")
        edges = Counter()
        for polygon in board.polygons.values():
            points = [tuple(round(c, 6) for c in p) for p in polygon]
            for edge in zip(points, points[1:] + points[:1]):
                edges[frozenset(edge)] += 1
        rim = [math.hypot(math.hypot(x, y) - 1.0, z)
               for edge, count in edges.items() if count == 1 for x, y, z in edge]
        spread = max(rim) - min(rim)
        if tiling in self.STRAIGHT_RIM:
            assert spread < 1e-4, f"{mode} rim is not a straight line"
        else:
            assert spread > 1e-3  # a zigzag; nothing better is available

    @staticmethod
    def _rim_points(board):
        """The two rims of a cylinder, as lists of (angle round the axis,
        height up it). The axis is y and the strip is centred on 0, so the
        sign of a rim vertex's height says which rim it is on."""
        edges = Counter()
        for polygon in board.polygons.values():
            points = [tuple(round(c, 6) for c in p) for p in polygon]
            for edge in zip(points, points[1:] + points[:1]):
                edges[frozenset(edge)] += 1
        low, high = [], []
        for edge, count in edges.items():
            if count != 1:
                continue
            for x, y, z in edge:
                (low if y < 0 else high).append((math.atan2(z, x), y))
        return sorted(set(low)), sorted(set(high))

    @staticmethod
    def _rim_cycle(points):
        """A rim reduced to what a turn about the axis leaves alone: the
        cyclic sequence of (gap to the next vertex round, height)."""
        points = sorted(points)
        return [((b[0] - a[0]) % (2 * math.pi), a[1])
                for a, b in zip(points, points[1:] + points[:1])]

    @classmethod
    def _same_rim(cls, one, other) -> bool:
        """Are two rims the same curve up to a turn about the axis -- i.e. do
        their cycles agree at some rotation? The slack is 1e-4: template
        vertices are stored rounded to 1e-6 (see _template), so a tiling is
        only symmetric to that, and the immersion carries the rounding
        through."""
        a, b = cls._rim_cycle(one), cls._rim_cycle(other)
        if len(a) != len(b):
            return False
        return any(all(abs(p - q) < 1e-4 and abs(u - v) < 1e-4
                       for (p, u), (q, v) in zip(a, b[i:] + b[:i]))
                   for i in range(len(b)))

    @pytest.mark.parametrize("difficulty", DIFFICULTIES)
    @pytest.mark.parametrize("mode", CYLINDER_MODES)
    def test_cylinder_rims_are_the_same_curve(self, mode, difficulty):
        """A cylinder ends in two rims, and they have to be the same curve --
        or the tube reads as cut off cleanly at one end and gnawed at the
        other. Which is what nine of the tilings shipped as: a strip a whole
        number of periods long has its top rim a *translate* of its bottom
        one, and a translate of a zigzag is the zigzag upside down.

        The same curve means: carried onto each other by an isometry of the
        cylinder that swaps its ends, which is a mirror in the mid plane or a
        half turn about a horizontal axis, either composed with a free turn
        about the cylinder's own axis. So flip the top rim both ways and ask
        whether either lands on the bottom one, up to that turn.
        """
        board = build_board(mode, difficulty)
        low, high = self._rim_points(board)
        assert low and len(low) == len(high), f"{mode} {difficulty} rims differ"
        mirror = [(angle, -y) for angle, y in high]
        half_turn = [(-angle, -y) for angle, y in high]
        assert (self._same_rim(low, mirror) or self._same_rim(low, half_turn)), (
            f"{mode} {difficulty} rims are different curves")

    @pytest.mark.parametrize("mode", CYLINDER_MODES)
    def test_cylinder_rim_is_straight_where_the_tiling_allows(self, mode):
        """...and where the tiling has a horizontal edge-line the cut runs
        along it, so both rims are clean circles rather than zigzags. Same
        rule and same list as the Mobius strip's single edge, since the two
        surfaces cut at the same ``template.cut``."""
        tiling = max((t for t in _ARCH_CONFIGS if mode.endswith(t)), key=len)
        board = build_board(mode, "medium")
        low, high = self._rim_points(board)
        spread = max(max(y for _, y in high) - min(y for _, y in high),
                     max(y for _, y in low) - min(y for _, y in low))
        if tiling in self.STRAIGHT_RIM:
            assert spread < 1e-4, f"{mode} rims are not straight lines"
        else:
            assert spread > 1e-3  # a zigzag; nothing better is available

    @pytest.mark.parametrize("tiling", sorted(_WRAPPED_TILINGS))
    def test_no_tile_centre_sits_on_the_cut(self, tiling):
        """The cut may not fall on a row of tile *centres*, on either
        surface. A centroid exactly there is kept at the bottom of the strip
        and its image at the top is not, so the strip carries one row more
        than its own reflection -- lopsided on the Mobius strip, mismatched
        rims on the cylinder.

        Asked of the tilings that wrap: a flat-only one (the rep-tiles,
        Durer's tiling) has no rim or seam to fall anywhere, and so leaves
        its cut at the default rather than choosing one. Wrapping one is what
        would make it choose, and this test then covers it automatically."""
        template = _arch_template(tiling)
        height = template.height
        for _, refs in template.cells:
            centre = sum(dn * height + template.verts[tag][1]
                         for tag, _, dn in refs) / len(refs)
            gap = (centre - template.cut) % height
            assert min(gap, height - gap) > 1e-3, f"{tiling} cut is on a row"

    def test_threescaletri_never_reverses_y_so_no_cylinder(self):
        # p3 has no mirror in any direction and no half turn either, so no
        # strip of it ends in two rims that are the same curve
        assert _arch_template("threescaletri").flips == ()
        assert "cylthreescaletri" not in MODE_LABELS
        with pytest.raises(ValueError):
            arch_cylinder_board("threescaletri", 9, 2, 12)

    def test_cylinder_rows_have_to_centre_the_strip_on_a_flip(self):
        # trihex reverses y every half domain, so whole and half rows both
        # work and a quarter row does not
        arch_cylinder_board("trihex", 9, 1.5, 9)
        with pytest.raises(ValueError):
            arch_cylinder_board("trihex", 9, 1.25, 9)

    def test_snubhex_is_chiral_so_no_mobius(self):
        # 3.3.3.3.6 has no mirror or glide symmetry: its mirror image is
        # a different (opposite-handed) tiling, so no Möbius gluing
        assert "mobiussnubhex" not in MODE_LABELS
        with pytest.raises(ValueError):
            arch_mobius_board("snubhex", 8, 1, 5)

    def test_snubsquare_mobius_needs_odd_half_domains(self):
        # p4g glues via a glide (mirror + half a period): a whole number
        # of periods would need a plain mirror, which p4g lacks
        with pytest.raises(ValueError):
            arch_mobius_board("snubsquare", 12, 2, 10)

    def test_too_small_wraps_rejected(self):
        with pytest.raises(ValueError):
            arch_torus_board("trihex", 1, 3, 2)

    def test_torus_polygons_face_outward(self):
        for tiling in sorted(_WRAPPED_TILINGS):
            board = build_board("torus" + tiling, "easy")
            for cell, polygon in board.polygons.items():
                normal = newell_normal(polygon)
                centroid = tuple(sum(c) / len(polygon) for c in zip(*polygon))
                ring_scale = math.hypot(centroid[0], centroid[1])
                outward = (
                    centroid[0] - centroid[0] / ring_scale,
                    centroid[1] - centroid[1] / ring_scale,
                    centroid[2],
                )
                assert sum(n * o for n, o in zip(normal, outward)) > 0, (
                    board.mode,
                    cell,
                )


class TestPolyhedra:
    """The cube and the tetrahedron: closed, convex, flat-faced solids
    (sphere topology, so Euler characteristic 2)."""

    @pytest.mark.parametrize("n", [2, 4, 6])
    def test_cube_is_six_square_faces(self, n):
        board = cube_board(n, 5)
        assert len(board.polygons) == 6 * n * n
        assert all(len(p) == 4 for p in board.polygons.values())

    @pytest.mark.parametrize("frequency", [1, 4, 6])
    def test_tetrahedron_is_four_triangular_faces(self, frequency):
        board = tetrahedron_board(3, frequency)
        assert len(board.polygons) == 4 * frequency * frequency
        assert all(len(p) == 3 for p in board.polygons.values())

    @pytest.mark.parametrize(
        "board", [cube_board(5, 5), tetrahedron_board(3, 5)], ids=lambda b: b.mode
    )
    def test_closed_surface_no_boundary(self, board):
        assert _boundary_components(board) == 0

    @pytest.mark.parametrize(
        "board", [cube_board(5, 5), tetrahedron_board(3, 5)], ids=lambda b: b.mode
    )
    def test_euler_characteristic_is_two(self, board):
        assert _euler_characteristic(board) == 2

    @pytest.mark.parametrize(
        "board", [cube_board(4, 5), tetrahedron_board(3, 4)], ids=lambda b: b.mode
    )
    def test_faces_stitch_into_one_connected_surface(self, board):
        # shared edge/corner vertices must join every face; a flood must
        # reach all cells (a face left unstitched splits the graph)
        adjacency = board.adjacency
        start = next(iter(adjacency))
        seen, stack = {start}, [start]
        while stack:
            for neighbor in adjacency[stack.pop()]:
                if neighbor not in seen:
                    seen.add(neighbor)
                    stack.append(neighbor)
        assert len(seen) == len(adjacency)


class TestBrickCubes:
    """The three brick bonds that lay on a cube.

    Three of the five congruent-rectangle bonds have a *square* fundamental
    block -- the stacked bond, the basket weave and its three-brick version --
    so a square face can be filled with whole blocks. The running bond's block
    is offset half a brick and the herringbone's is diagonal, and neither
    fills a square, which is why there is no cube of either.
    """

    # bricks per block, and the brick's short-to-long side ratio: the same
    # numbers TestRectangles.RATIOS holds for the flat bonds
    BONDS = {"stackedbond": (2, 0.5),
             "basketweave": (2, 0.5),
             "basketweave3": (3, 1 / 3)}

    @pytest.mark.parametrize("bond", sorted(BONDS))
    @pytest.mark.parametrize("n", [2, 3, 4])
    def test_six_faces_of_blocks_of_bricks(self, bond, n):
        bricks = self.BONDS[bond][0]
        board = brick_cube_board(bond, n, 5)
        assert len(board.polygons) == 6 * bricks * n * n

    @pytest.mark.parametrize("bond", sorted(BONDS))
    @pytest.mark.parametrize("n", [2, 3, 4])
    def test_every_tile_is_a_rectangle_of_the_bond_ratio(self, bond, n):
        """Once the T-vertices are dropped, every tile is a rectangle of the
        bond's aspect -- the 3D twin of the same test on the flat bonds. A
        cube face is planar and a cube edge is straight, so a spliced vertex
        is exactly collinear and the brick is drawn unchanged."""
        ratio = self.BONDS[bond][1]
        for polygon in brick_cube_board(bond, n, 5).polygons.values():
            corners = _corners3d(polygon)
            assert len(corners) == 4
            sides = sorted(math.dist(corners[i], corners[(i + 1) % 4])
                           for i in range(4))
            assert abs(sides[0] - sides[1]) < 1e-9 * sides[3]
            assert abs(sides[2] - sides[3]) < 1e-9 * sides[3]
            assert abs(sides[0] / sides[3] - ratio) < 1e-9

    @pytest.mark.parametrize("bond", sorted(BONDS))
    @pytest.mark.parametrize("n", [2, 3])
    def test_closed_sphere_surface(self, bond, n):
        """The T-vertex splice is what makes this true: without it a cube edge
        the two faces cut differently belongs to one cell on one side and two
        on the other, which reads as a boundary and drops the characteristic
        well below 2."""
        board = brick_cube_board(bond, n, 5)
        assert _boundary_components(board) == 0
        assert _euler_characteristic(board) == 2

    @pytest.mark.parametrize("bond", sorted(BONDS))
    @pytest.mark.parametrize("n", [2, 3])
    def test_faces_stitch_into_one_connected_surface(self, bond, n):
        adjacency = brick_cube_board(bond, n, 5).adjacency
        start = next(iter(adjacency))
        seen, stack = {start}, [start]
        while stack:
            for neighbor in adjacency[stack.pop()]:
                if neighbor not in seen:
                    seen.add(neighbor)
                    stack.append(neighbor)
        assert len(seen) == len(adjacency)

    @pytest.mark.parametrize("bond", ["basketweave", "basketweave3"])
    @pytest.mark.parametrize("n", [2, 3, 4, 5])
    def test_a_weave_cube_keeps_the_cubes_symmetry(self, bond, n):
        """A weave's quarter-turn centres are its block corners, so a face
        centre is one only when n is even -- and the checkerboard therefore has
        to be flipped on the three negative faces at even n. Unflipped, the two
        halves of the cube meet out of phase and the board keeps only 6 of the
        cube's 48 symmetries. The neighbour counts are the visible half of
        that: they fan out into four classes, six cells of them alone on a
        face.

        Measured as: every symmetry of the cube that maps the board's tiles
        onto tiles, over all 48 signed axis permutations. A weave cube keeps 24
        of them at every size, but not the same 24 -- an odd n keeps 12
        rotations and their inversions, an even n the full rotation group and
        no reflection at all, the weave on a cube being chiral. Either way it
        is half of what the cube has and all that a face whose centre is only a
        half-turn centre can offer.
        """
        board = brick_cube_board(bond, n, 5)
        tiles = {frozenset(tuple(round(c, 9) for c in point)
                           for point in polygon)
                 for polygon in board.polygons.values()}
        kept = 0
        for permutation in itertools.permutations(range(3)):
            for signs in itertools.product((1, -1), repeat=3):
                matrix = [[0] * 3 for _ in range(3)]
                for row, column in enumerate(permutation):
                    matrix[row][column] = signs[row]
                turned = {
                    frozenset(tuple(round(sum(matrix[r][k] * point[k]
                                              for k in range(3)), 9)
                                    for r in range(3))
                              for point in tile)
                    for tile in tiles
                }
                kept += turned == tiles
        assert kept == 24


class TestSolidCube:
    """The one volume board: an ``n**3`` block of cells whose neighbours are
    the cubes sharing a corner with them, drawn as ``n`` separate sheets."""

    @pytest.mark.parametrize("n", [3, 4, 6])
    def test_cell_count_is_the_cube(self, n):
        board = solid_cube_board(n, 5)
        assert len(board.adjacency) == n ** 3
        assert all(len(p) == 4 for p in board.polygons.values())

    @pytest.mark.parametrize("n", [3, 4, 5, 8])
    def test_adjacency_is_exactly_the_26_neighbourhood(self, n):
        board = solid_cube_board(n, 5)
        for (i, j, k), neighbors in board.adjacency.items():
            expected = {
                (i + di, j + dj, k + dk)
                for di in (-1, 0, 1) for dj in (-1, 0, 1) for dk in (-1, 0, 1)
                if (di, dj, dk) != (0, 0, 0)
                and 0 <= i + di < n and 0 <= j + dj < n and 0 <= k + dk < n
            }
            assert set(neighbors) == expected

    @pytest.mark.parametrize("n", [3, 4, 6, 8])
    def test_degrees_are_the_four_kinds_of_position(self, n):
        # a corner touches a 2x2x2 block (7 others), an edge a 2x2x3 (11), a
        # face a 2x3x3 (17) and an interior cell the full 3x3x3 (26)
        board = solid_cube_board(n, 5)
        histogram = Counter(len(v) for v in board.adjacency.values())
        inner = n - 2
        assert histogram == Counter({
            7: 8,
            11: 12 * inner,
            17: 6 * inner ** 2,
            26: inner ** 3,
        })

    @pytest.mark.parametrize("n", [3, 4, 6])
    def test_each_slice_is_its_own_sheet(self, n):
        # n disjoint square grids: chi = n and n boundary circles, which is
        # also what `two_sided` is telling the renderer and the suite
        board = solid_cube_board(n, 5)
        assert board.two_sided is True
        assert _euler_characteristic(board) == n
        assert _boundary_components(board) == n
        assert len(_corner_fans(board)) == n * (n + 1) ** 2

    @pytest.mark.parametrize("n", [3, 4, 6])
    def test_sheets_do_not_overlap_on_screen(self, n):
        # the whole point of taking the cube apart: seen down the board's own
        # z axis no two cells cover each other, or a slice would hide a slice
        board = solid_cube_board(n, 5)
        seen = set()
        for polygon in board.polygons.values():
            middle = tuple(round(sum(v[axis] for v in polygon) / 4, 6)
                           for axis in (0, 1))
            assert middle not in seen
            seen.add(middle)

    @pytest.mark.parametrize("n", [3, 4, 5])
    def test_no_two_cells_share_a_closed_neighbourhood(self, n):
        # a pair that does can never be told apart by any sequence of numbers,
        # so a mine landing alone in one forces a coin flip. Depth 2 is exactly
        # that board, which is why the builder refuses it.
        board = solid_cube_board(n, 5)
        closed = [frozenset(neighbors) | {cell}
                  for cell, neighbors in board.adjacency.items()]
        assert len(set(closed)) == len(closed)

    def test_a_two_deep_block_is_refused(self):
        with pytest.raises(ValueError):
            solid_cube_board(2, 3)


class TestPresets:
    @pytest.mark.parametrize("mode", sorted(MODE_LABELS))
    @pytest.mark.parametrize("difficulty", DIFFICULTIES)
    def test_all_presets_build(self, mode, difficulty):
        board = build_board(mode, difficulty)
        assert board.mode == mode
        if mode in MODES_3D:
            assert board.radius > 0
        else:
            assert board.width > 0 and board.height > 0
        assert 0 < board.mine_count < len(board.adjacency)

    def test_unknown_mode_and_difficulty_rejected(self):
        with pytest.raises(ValueError):
            build_board("nope", "easy")
        with pytest.raises(ValueError):
            build_board("square", "nope")

    def test_every_mode_appears_exactly_once_in_the_menu(self):
        # the one-off (non-periodic) modes, plus every periodic tiling x surface
        modes = list(APERIODIC_MODES + FRACTAL_MODES + HYPERBOLIC_MODES + SOLID_MODES)
        modes += [m for shaped in SHAPED_MODES.values() for m in shaped]
        modes += [m for _, surfaces in TILINGS.values() for m in surfaces.values()]
        assert sorted(modes) == sorted(MODE_LABELS)
        assert len(modes) == len(set(modes))

    def test_tilings_use_known_surfaces(self):
        for _, surfaces in TILINGS.values():
            assert set(surfaces) <= set(SURFACE_LABELS)


# The thirteen Catalan solids, in menu order, with the face count each is
# named for. Every one is `faces * frequency**2` cells (the two chiral ones
# fan each pentagon into five quadrilaterals first, so `frequency=0` is the
# bare pentagons and anything above multiplies by five as well).
_CATALAN_SOLIDS = [
    ("triakistetra", triakis_tetrahedron_board, 12, 3),
    ("rhombicdodeca", rhombic_dodecahedron_board, 12, 4),
    ("triakisocta", triakis_octahedron_board, 24, 3),
    ("tetrakishexa", tetrakis_hexahedron_board, 24, 3),
    ("deltoidalicositetra", deltoidal_icositetrahedron_board, 24, 4),
    ("pentagonalicositetra", pentagonal_icositetrahedron_board, 24, 5),
    ("disdyakisdodeca", disdyakis_dodecahedron_board, 48, 3),
    ("rhombictriaconta", rhombic_triacontahedron_board, 30, 4),
    ("triakisicosa", triakis_icosahedron_board, 60, 3),
    ("pentakisdodeca", pentakis_dodecahedron_board, 60, 3),
    ("deltoidalhexeconta", deltoidal_hexecontahedron_board, 60, 4),
    ("sphere", catalan_sphere_board, 60, 5),
    ("disdyakistriaconta", disdyakis_triacontahedron_board, 120, 3),
]


def _face_normal(polygon):
    normal = _newell_normal(polygon)
    length = math.hypot(*normal)
    return tuple(c / length for c in normal)


class TestCatalanSolids:
    """The duals of the Archimedean solids.

    Four properties tell a Catalan solid from something merely Catalan-shaped,
    and none of them survives a construction that is only topologically right:
    every face is **planar**, every face is **congruent** to every other, every
    face plane is the same distance from the centre (so the solid has an
    **insphere**), and the whole thing closes as a sphere. The builders derive
    all of that from one Wythoff point per solid rather than from a table of
    coordinates, so these are the checks that the derivation is sound.
    """

    @pytest.mark.parametrize(
        "mode,builder,faces,sides", _CATALAN_SOLIDS, ids=[c[0] for c in _CATALAN_SOLIDS]
    )
    def test_face_count_and_shape(self, mode, builder, faces, sides):
        board = builder(0, 0 if sides == 5 else 1)
        assert len(board.polygons) == faces
        assert {len(p) for p in board.polygons.values()} == {sides}

    @pytest.mark.parametrize(
        "mode,builder,faces,sides", _CATALAN_SOLIDS, ids=[c[0] for c in _CATALAN_SOLIDS]
    )
    def test_faces_are_planar(self, mode, builder, faces, sides):
        board = builder(0, 0 if sides == 5 else 1)
        for polygon in board.polygons.values():
            centre = tuple(sum(p[a] for p in polygon) / len(polygon) for a in range(3))
            normal = _face_normal(polygon)
            off = max(
                abs(sum(n * (p - c) for n, p, c in zip(normal, point, centre)))
                for point in polygon
            )
            assert off < 1e-9, f"{mode}: face out of plane by {off}"

    @pytest.mark.parametrize(
        "mode,builder,faces,sides", _CATALAN_SOLIDS, ids=[c[0] for c in _CATALAN_SOLIDS]
    )
    def test_faces_are_congruent(self, mode, builder, faces, sides):
        board = builder(0, 0 if sides == 5 else 1)
        shapes = {
            tuple(sorted(
                round(math.dist(p[i], p[(i + 1) % len(p)]), 9) for i in range(len(p))
            ))
            for p in board.polygons.values()
        }
        assert len(shapes) == 1, f"{mode}: {len(shapes)} face shapes, expected 1"

    @pytest.mark.parametrize(
        "mode,builder,faces,sides", _CATALAN_SOLIDS, ids=[c[0] for c in _CATALAN_SOLIDS]
    )
    def test_every_face_touches_one_insphere(self, mode, builder, faces, sides):
        board = builder(0, 0 if sides == 5 else 1)
        radii = {
            round(abs(sum(n * p for n, p in zip(_face_normal(polygon), polygon[0]))), 9)
            for polygon in board.polygons.values()
        }
        assert len(radii) == 1, f"{mode}: face planes at {sorted(radii)}"

    @pytest.mark.parametrize(
        "mode,builder,faces,sides", _CATALAN_SOLIDS, ids=[c[0] for c in _CATALAN_SOLIDS]
    )
    def test_subdivision_keeps_the_surface_closed(self, mode, builder, faces, sides):
        """The size knob's real risk is a subdivision vertex on a shared edge
        keyed differently by the two faces that meet there: the board would
        still draw, and the two rows of cells either side of the seam would
        simply stop being neighbours. Euler characteristic 2 at every
        frequency is what rules that out."""
        for frequency in (1, 2, 3):
            board = builder(0, frequency)
            per_face = 5 * frequency**2 if sides == 5 else frequency**2
            assert len(board.polygons) == faces * per_face
            assert _euler_characteristic(board) == 2
            assert _boundary_components(board) == 0

    def test_the_chiral_pair_has_no_mirror(self):
        """The two pentagonal ones are duals of the snubs, so they are chiral:
        no reflection of the solid is a rotation of it. Measured as a vertex
        set: mirroring in x maps the solid onto itself only if some rotation
        undoes it, and for these two none does -- while for a non-chiral
        Catalan solid (here the rhombic triacontahedron, built on the same
        icosahedral base) the mirrored vertex set is the original."""

        def vertex_set(board):
            return {
                tuple(round(c, 6) for c in point)
                for polygon in board.polygons.values()
                for point in polygon
            }

        def mirrored(points):
            return {(-x, y, z) for x, y, z in points}

        # the reflective one: its own mirror image, vertex for vertex
        plain = vertex_set(rhombic_triacontahedron_board(0, 1))
        assert mirrored(plain) == plain
        # the chiral ones: no shared vertex set under the same reflection,
        # which is only possible because the mirror is not a symmetry
        for builder in (pentagonal_icositetrahedron_board, catalan_sphere_board):
            points = vertex_set(builder(0, 0))
            assert mirrored(points) != points

    def test_sphere_keeps_its_sixty_seven_neighbour_pentagons(self):
        """The pentagonal hexecontahedron is the one Catalan solid that was
        already in the game -- as `sphere`, drawn projected onto the unit
        sphere. Rebuilt flat-faced it is the same board to the game: 60
        pentagons, every one with exactly 7 neighbours, so a share link or a
        best time recorded against the old one still addresses this."""
        board = catalan_sphere_board(10, 0)
        assert len(board.polygons) == 60
        assert {len(p) for p in board.polygons.values()} == {5}
        assert {len(n) for n in board.adjacency.values()} == {7}


class TestProjectivePlane:
    """The real projective plane: a centrally symmetric sphere board with
    every cell glued to its antipode, drawn as the whole sphere. Each test
    runs on both tilings and on a sweep of frequencies, not just the shipped
    three, since the gluing is the same arithmetic at every one."""

    FREQUENCIES = range(2, 8)

    @staticmethod
    def _sphere(builder, frequency):
        """The sphere the board is a quotient of, as its own board."""
        if builder is projective_triangle_board:
            return sphere_triangle_board(5, frequency)
        return _goldberg_board("goldberg", frequency, 5)

    @pytest.mark.parametrize("builder", [projective_triangle_board,
                                         projective_hex_board])
    @pytest.mark.parametrize("frequency", FREQUENCIES)
    def test_every_cell_is_drawn_twice_antipodally(self, builder, frequency):
        board = builder(frequency, 5)
        faces = defaultdict(list)
        for face, cell in board.faces.items():
            faces[cell].append(face)
        assert set(faces) == set(board.adjacency)
        for cell, pair in faces.items():
            assert len(pair) == 2 and cell in pair
            a, b = (board.polygons[f] for f in pair)
            ca = [sum(c) / len(a) for c in zip(*a)]
            cb = [sum(c) / len(b) for c in zip(*b)]
            assert max(abs(x + y) for x, y in zip(ca, cb)) < 1e-9

    @pytest.mark.parametrize("builder", [projective_triangle_board,
                                         projective_hex_board])
    @pytest.mark.parametrize("frequency", FREQUENCIES)
    def test_it_is_a_closed_surface_of_euler_characteristic_one(
        self, builder, frequency
    ):
        # Measured twice: off the drawing (the sphere, halved), and off the
        # exact vertex classes the adjacency was built from, with no float
        # rounded anywhere.
        board = builder(frequency, 5)
        assert _euler_characteristic(board) == 1
        assert _boundary_components(board) == 0
        sphere = self._sphere(builder, frequency)
        assert _euler_characteristic(sphere) == 2
        assert len(sphere.adjacency) == 2 * len(board.adjacency)

    @pytest.mark.parametrize("builder", [projective_triangle_board,
                                         projective_hex_board])
    @pytest.mark.parametrize("frequency", FREQUENCIES)
    def test_the_gluing_changes_nothing_locally(self, builder, frequency):
        # The antipodal map moves every point half the sphere away, so no
        # cell meets its own twin and no two neighbours of a cell are each
        # other's twins: every cell keeps exactly the neighbourhood it had on
        # the sphere, one neighbour per sphere neighbour.
        board = builder(frequency, 5)
        sphere = self._sphere(builder, frequency)
        by_corners = {
            tuple(sorted(tuple(round(c, 9) for c in p) for p in poly)): cell
            for cell, poly in sphere.polygons.items()
        }
        for face, cell in board.faces.items():
            key = tuple(sorted(tuple(round(c, 9) for c in p)
                               for p in board.polygons[face]))
            on_sphere = sphere.adjacency[by_corners[key]]
            assert len(board.adjacency[cell]) == len(on_sphere)

    @pytest.mark.parametrize("frequency", FREQUENCIES)
    def test_six_defects_not_twelve(self, frequency):
        # A closed surface of hexagons needs 6 * chi pentagons; the sphere has
        # 12 and its quotient keeps half.
        board = projective_hex_board(frequency, 5)
        sides = Counter(len(board.polygons[c]) for c in board.adjacency)
        assert sides[5] == 6
        assert sides[6] == 5 * frequency**2 + 1 - 6
        assert len(projective_triangle_board(frequency, 5).adjacency) == (
            10 * frequency**2
        )

    @pytest.mark.parametrize("builder", [projective_triangle_board,
                                         projective_hex_board])
    def test_the_gluing_reverses_orientation(self, builder):
        # Non-orientable: the antipode sends a face wound counterclockwise
        # from outside to one wound clockwise from outside. Negating every
        # point leaves each cross product -- the winding's normal -- as it
        # was, while the outward direction flips.
        board = builder(3, 5)
        for polygon in board.polygons.values():
            twin = [tuple(-c for c in p) for p in polygon]
            outward = [sum(c) for c in zip(*twin)]
            assert sum(n * o for n, o in zip(newell_normal(twin), outward)) < 0
