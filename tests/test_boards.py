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
    _brick_pinwheel_tiles,
    _finalize_flat,
    _phyllotaxis_tiles,
    _shared_vertex_adjacency,
    _spectre_leaves,
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
    gosper_board,
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
    pentaflake_board,
    phyllotaxis_board,
    place_point,
    rhombicosidodecahedron_board,
    snub_dodecahedron_board,
    spectre_board,
    sphere_board,
    sphere_triangle_board,
    sphinx_board,
    square_board,
    stepped_bipyramid_board,
    substitution_placements,
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
from minesweeper.boards.core import newell_normal as _newell_normal
from minesweeper.boards.presets import ARCH_PRESETS

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


class TestBrickPinwheel:
    """The brick pinwheel: 2x1 bricks turning about a 2x2 block.

    These say the board is the winding it claims to be -- an exact tiling of a
    ``width`` x (``width`` - 1) rectangle in whole bricks, with one mirror and
    no translation -- and that the T-vertices, where a brick's corner meets the
    middle of a neighbour's long side, are recorded, which is what keeps the
    patch a mesh and the neighbours neighbours.
    """

    WIDTHS = (2, 3, 4, 5, 8, 9, 12, 13, 23)

    @staticmethod
    def _cells(bricks):
        """Every unit cell a brick list covers, counted."""
        return Counter((x + dx, y + dy)
                       for x, y, w, h in bricks
                       for dx in range(w) for dy in range(h))

    @staticmethod
    def _normalised(bricks):
        """The brick set shifted so the rectangle's corner sits at the origin,
        which is what makes two transformed copies comparable."""
        min_x = min(x for x, _, _, _ in bricks)
        min_y = min(y for _, y, _, _ in bricks)
        return frozenset((x - min_x, y - min_y, w, h) for x, y, w, h in bricks)

    @staticmethod
    def _turned(bricks):
        """A quarter turn: the cell (x, y) goes to (-y, x), so a brick's
        lower-left corner is its old top-left one, turned, and its sides swap."""
        return [(-(y + h - 1), x, h, w) for x, y, w, h in bricks]

    @staticmethod
    def _flipped(bricks):
        """The mirror across a horizontal line: (x, y) goes to (x, -y)."""
        return [(x, -(y + h - 1), w, h) for x, y, w, h in bricks]

    @pytest.mark.parametrize("width", WIDTHS)
    def test_the_bricks_cover_the_rectangle_exactly(self, width):
        cells = self._cells(_brick_pinwheel_tiles(width))
        assert set(cells.values()) == {1}  # nothing covered twice
        assert len(cells) == width * (width - 1)  # and nothing left uncovered
        xs = {x for x, _ in cells}
        ys = {y for _, y in cells}
        assert (max(xs) - min(xs), max(ys) - min(ys)) == (width - 1, width - 2)

    @pytest.mark.parametrize("width", WIDTHS)
    def test_every_tile_is_a_whole_brick(self, width):
        # The point of the shells: each is w + h + 1 cells with w = h + 1, so
        # every one is even and splits into two even-length straight arms.
        # Nothing is ever left over, at any width -- no 1x1 anywhere.
        assert {(w, h) for _, _, w, h in _brick_pinwheel_tiles(width)} <= {(2, 1), (1, 2)}

    @pytest.mark.parametrize("width", WIDTHS)
    def test_cell_counts(self, width):
        assert len(_brick_pinwheel_tiles(width)) == width * (width - 1) // 2

    @pytest.mark.parametrize("width", (5, 9, 13, 23))
    def test_the_hub_is_a_2x2_block_of_two_bricks(self, width):
        # what the board is named for: the centre brick and the one the first
        # shell lays directly above it, filling the 2x2 the rest turns about
        hub = [b for b in _brick_pinwheel_tiles(width)
               if 0 <= b[0] and b[0] + b[2] <= 2 and 0 <= b[1] and b[1] + b[3] <= 2]
        assert sorted(hub) == [(0, 0, 2, 1), (0, 1, 2, 1)]

    @pytest.mark.parametrize("width", (9, 13, 23))
    def test_it_reflects_but_never_turns(self, width):
        # The winding carries one mirror, horizontal through the hub, and
        # nothing else. A quarter turn cannot even map the rectangle onto
        # itself (the sides differ by one), and the half turn does not either.
        bricks = _brick_pinwheel_tiles(width)
        here = self._normalised(bricks)
        assert self._normalised(self._flipped(bricks)) == here
        assert self._normalised(self._turned(bricks)) != here
        assert self._normalised(self._turned(self._turned(bricks))) != here

    def test_no_translation_maps_the_patch_onto_itself(self):
        # nonperiodicity on the finite patch, the check TestPhyllotaxis makes.
        # The tiles taken are well inside the board, so it is the winding that
        # rules a shift out rather than the boundary; a periodic bond of the
        # same brick would pass every one of its lattice vectors here.
        patch = set(_brick_pinwheel_tiles(23))
        cells = self._cells(patch)
        cx = (min(x for x, _ in cells) + max(x for x, _ in cells)) / 2
        cy = (min(y for _, y in cells) + max(y for _, y in cells)) / 2
        core = [b for b in patch if abs(b[0] - cx) < 5 and abs(b[1] - cy) < 5]
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
        board = build_board("brickpinwheel", "easy")
        assert (_euler_characteristic(board), _boundary_components(board)) == (1, 1)
        corners_only = _finalize_flat(
            "brickpinwheel",
            {(x, y, w, h): [(x, y), (x + w, y), (x + w, y + h), (x, y + h)]
             for x, y, w, h in _brick_pinwheel_tiles(13)},
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
        full = build_board("brickpinwheel", "easy").adjacency
        corners_only = _shared_vertex_adjacency(
            {(x, y, w, h): [(x, y), (x + w, y), (x + w, y + h), (x, y + h)]
             for x, y, w, h in _brick_pinwheel_tiles(13)})
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

    @pytest.mark.parametrize("tiling", sorted(_ARCH_CONFIGS))
    def test_no_tile_centre_sits_on_the_cut(self, tiling):
        """The cut may not fall on a row of tile *centres*, on either
        surface. A centroid exactly there is kept at the bottom of the strip
        and its image at the top is not, so the strip carries one row more
        than its own reflection -- lopsided on the Mobius strip, mismatched
        rims on the cylinder."""
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
        modes = list(APERIODIC_MODES + FRACTAL_MODES + SOLID_MODES)
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
