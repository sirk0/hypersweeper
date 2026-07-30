import math
import statistics
from collections import Counter, defaultdict

import pytest

from minesweeper.boards import (
    _ARCH_CONFIGS,
    _SPECTRE_OUTLINE,
    APERIODIC_MODES,
    ARCH_TILINGS,
    DIFFICULTIES,
    MODE_LABELS,
    MODES_3D,
    POLYHEDRA_MODES,
    SHAPED_MODES,
    SPHERE_MODES,
    SURFACE_LABELS,
    TILINGS,
    _arch_template,
    _spectre_leaves,
    _z12_to_xy,
    arch_klein_board,
    arch_mobius_board,
    arch_torus_board,
    archimedean_board,
    build_board,
    c80_board,
    c180_board,
    cube_board,
    cube_frame_board,
    cylinder_board,
    cylinder_hex_board,
    cylinder_triangle_board,
    hex_board,
    hexhex_board,
    hextriangle_board,
    klein_board,
    klein_hex_board,
    klein_triangle_board,
    mobius_board,
    mobius_hex_board,
    mobius_triangle_board,
    newell_normal,
    penrose_board,
    rhombicosidodecahedron_board,
    snub_dodecahedron_board,
    spectre_board,
    sphere_board,
    sphere_triangle_board,
    square_board,
    stepped_bipyramid_board,
    surface_of,
    tetrahedron_board,
    tetrahedron_frame_board,
    torus_board,
    torus_hex_board,
    torus_triangle_board,
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
_VERTEX_TRANSITIVE = [t.key for t in ARCH_TILINGS if t.vertex_transitive]
_FACE_TRANSITIVE = [t.key for t in ARCH_TILINGS if not t.vertex_transitive]
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
    _EDGE_RATIO_LIMITS = {"cyltri": 1.15, "torustri": 1.4,
                          "mobiustri": 1.25, "kleintri": 1.7}

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

    @pytest.mark.parametrize("mode", sorted(_FACE_TRANSITIVE))
    def test_tiles_are_congruent(self, mode):
        """A face-transitive tiling (a Laves dual, a rectangle bond) is built
        from one congruent tile: every polygon has the same sorted edge
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
        the board is reflected/rotated about a centre. A symmetry centre
        sits at a largest-tile centroid (vertex-transitive tilings) or at
        a vertex (some face-transitive Laves tilings), so scan both sets of
        candidates and take the best."""
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
        # candidate centres near the middle: biggest-tile centroids and
        # vertices (a rotation centre lies on one of them)
        candidates = [c for p, c in zip(polygons, centroids)
                      if len(p) == biggest]
        candidates += sorted(vertices, key=lambda v: (v[0] - board_cx) ** 2
                             + (v[1] - board_cy) ** 2)[:12]
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
        # a rectangular window on a hexagonal tiling can leave a few edge
        # tiles unpaired, so the bar is well clear of a ragged disc (which
        # scores ~0.3) rather than a perfect 1.0
        rotation = self._symmetry(board, lambda cx, cy, x, y: (2 * cx - x, 2 * cy - y))
        assert rotation >= 0.85
        if mode in self.REFLECTIVE:
            lr = self._symmetry(board, lambda cx, cy, x, y: (2 * cx - x, y))
            tb = self._symmetry(board, lambda cx, cy, x, y: (x, 2 * cy - y))
            assert max(lr, tb) >= 0.9

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
            "toruselongated": (72, 168, 240),
            "torussnubsquare": (60, 126, 240),
            "torustrihex": (96, 120, 216),
            "torussnubhex": (72, 108, 252),
            "torustruncsquare": (72, 144, 224),
            "torustrunchex": (84, 120, 216),
            "cylelongated": (70, 156, 285),
            "cylsnubsquare": (60, 126, 270),
            "cyltrihex": (72, 162, 264),
            "cylsnubhex": (72, 180, 252),
            "cyltruncsquare": (54, 120, 224),
            "cyltrunchex": (72, 144, 240),
            "mobiuselongated": (72, 144, 216),
            "mobiussnubsquare": (78, 135, 204),
            "mobiustrihex": (72, 144, 216),
            "mobiustruncsquare": (72, 128, 220),
            "mobiustrunchex": (54, 120, 216),
            "torusrhombitrihex": (120, 168, 288),
            "torustrunctrihex": (120, 168, 288),
            "cylrhombitrihex": (96, 180, 252),
            "cyltrunctrihex": (96, 180, 252),
            "mobiusrhombitrihex": (96, 144, 288),
            "mobiustrunctrihex": (96, 144, 288),
            # Laves (dual) tilings
            "torusprismaticpent": (48, 112, 160),
            "cylprismaticpent": (40, 96, 180),
            "mobiusprismaticpent": (48, 96, 144),
            "toruscairo": (40, 84, 160),
            "cylcairo": (40, 84, 180),
            "mobiuscairo": (52, 90, 136),
            "torusrhombille": (96, 120, 216),
            "cylrhombille": (72, 162, 264),
            "mobiusrhombille": (72, 144, 216),
            "torusfloret": (48, 72, 168),
            "cylfloret": (48, 120, 168),
            "torustetrakis": (144, 288, 448),
            "cyltetrakis": (108, 240, 448),
            "mobiustetrakis": (144, 256, 440),
            "torustriakis": (168, 240, 432),
            "cyltriakis": (144, 288, 480),
            "mobiustriakis": (108, 240, 432),
            "torusdeltoidal": (120, 168, 288),
            "cyldeltoidal": (96, 180, 252),
            "mobiusdeltoidal": (96, 144, 288),
            "toruskisrhombille": (240, 336, 576),
            "cylkisrhombille": (192, 360, 504),
            "mobiuskisrhombille": (192, 288, 576),
            # Klein bottle: closed like the torus, glued with a flip. Chiral
            # snub hexagonal / floret pentagonal are excluded (no mirror).
            "kleinelongated": (72, 168, 240),
            "kleinsnubsquare": (30, 63, 108),
            "kleintrihex": (96, 120, 216),
            "kleintruncsquare": (72, 144, 224),
            "kleintrunchex": (84, 120, 216),
            "kleinrhombitrihex": (120, 168, 288),
            "kleintrunctrihex": (120, 168, 288),
            "kleinprismaticpent": (48, 112, 160),
            "kleincairo": (20, 42, 72),
            "kleinrhombille": (96, 120, 216),
            "kleintetrakis": (144, 288, 448),
            "kleintriakis": (168, 240, 432),
            "kleindeltoidal": (120, 168, 288),
            "kleinkisrhombille": (240, 336, 576),
            # Isogonal (non-edge-to-edge) tilings: torus/cylinder for all
            # six, Mobius/Klein only for the two with a template mirror
            # (offset square, staggered triangular).
            "torusoffsetsquare": (100, 200, 360),
            "cyloffsetsquare": (100, 200, 360),
            "mobiusoffsetsquare": (100, 200, 360),
            "kleinoffsetsquare": (100, 200, 360),
            "torusstaggeredtri": (96, 200, 352),
            "cylstaggeredtri": (100, 200, 352),
            "mobiusstaggeredtri": (98, 198, 338),
            "kleinstaggeredtri": (100, 198, 360),
            "toruspythagorean": (100, 200, 350),
            "cylpythagorean": (100, 200, 350),
            "torusrotatedhex": (96, 198, 360),
            "cylrotatedhex": (96, 198, 360),
            "torusrotatedtri": (96, 210, 336),
            "cylrotatedtri": (96, 198, 360),
            "torusthreescaletri": (96, 198, 360),
            "cylthreescaletri": (96, 198, 360),
            # Congruent-rectangle bonds: torus/cylinder for all five,
            # Mobius/Klein for all but herringbone (glide-only, no mirror).
            "torusstackedbond": (100, 196, 350),
            "cylstackedbond": (100, 196, 350),
            "mobiusstackedbond": (100, 196, 350),
            "kleinstackedbond": (100, 196, 350),
            "torusrunningbond": (100, 200, 360),
            "cylrunningbond": (100, 200, 360),
            "mobiusrunningbond": (100, 200, 360),
            "kleinrunningbond": (100, 200, 360),
            "torusbasketweave": (96, 200, 352),
            "cylbasketweave": (96, 200, 352),
            "mobiusbasketweave": (100, 200, 352),
            "kleinbasketweave": (100, 200, 352),
            "torusbasketweave3": (96, 192, 360),
            "cylbasketweave3": (96, 192, 360),
            "mobiusbasketweave3": (108, 198, 360),
            "kleinbasketweave3": (108, 198, 360),
            "torusherringbone": (96, 200, 352),
            "cylherringbone": (96, 200, 352),
        }
        assert sorted(counts) == sorted(self.WRAPPED)
        for mode, expected in counts.items():
            for difficulty, count in zip(DIFFICULTIES, expected):
                assert len(build_board(mode, difficulty).adjacency) == count

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
        modes = list(APERIODIC_MODES + SPHERE_MODES + POLYHEDRA_MODES)
        modes += [m for shaped in SHAPED_MODES.values() for m in shaped]
        modes += [m for _, surfaces in TILINGS.values() for m in surfaces.values()]
        assert sorted(modes) == sorted(MODE_LABELS)
        assert len(modes) == len(set(modes))

    def test_tilings_use_known_surfaces(self):
        for _, surfaces in TILINGS.values():
            assert set(surfaces) <= set(SURFACE_LABELS)
