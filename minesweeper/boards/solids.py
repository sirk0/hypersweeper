from __future__ import annotations

import math
from collections import defaultdict
from typing import Hashable

from minesweeper.boards.aperiodic import _brick_rings_tiles
from minesweeper.boards.core import (
    ROOT3,
    Board3D,
    Cell,
    Vec3,
    _cross,
    _dot,
    _normalize,
    _orient_outward,
    _shared_vertex_adjacency,
    _tangent_order,
    newell_normal,
)


def _icosahedron() -> tuple[list[Vec3], list[tuple[int, int, int]]]:
    phi = (1 + 5**0.5) / 2
    vertices: list[Vec3] = []
    for x in (-1.0, 1.0):
        for z in (-phi, phi):
            vertices.append((0.0, x, z))
            vertices.append((x, z, 0.0))
            vertices.append((z, 0.0, x))
    # edges have squared length 4; faces are the 3-cliques of the edge graph
    def touching(i: int, j: int) -> bool:
        d = sum((a - b) ** 2 for a, b in zip(vertices[i], vertices[j]))
        return abs(d - 4.0) < 1e-9

    faces = []
    for i in range(12):
        for j in range(i + 1, 12):
            if not touching(i, j):
                continue
            for k in range(j + 1, 12):
                if touching(i, k) and touching(j, k):
                    # consistent winding: orient every face counterclockwise
                    # as seen from outside
                    a, b, c = (vertices[n] for n in (i, j, k))
                    normal = newell_normal([a, b, c])
                    outward = sum(n * (pa + pb + pc) for n, pa, pb, pc in zip(normal, a, b, c))
                    faces.append((i, j, k) if outward > 0 else (i, k, j))
    assert len(faces) == 20
    return vertices, faces


def _dodecahedron() -> tuple[list[Vec3], list[tuple[int, int, int]]]:
    """A regular dodecahedron, already fanned into triangles: its 12
    pentagonal faces are the icosahedron's dual (a Platonic solid's
    face-centroid dual is exactly its regular dual, since the symmetry
    group is transitive on both faces and vertices, so every centroid
    lands the same distance out) -- one dodecahedron corner per
    icosahedron face, one dodecahedron pentagon per icosahedron vertex,
    the five icosahedron faces around it. Each pentagon is then split into
    5 triangles fanned from its own planar centre (the plain average of
    its 5 corners, *not* pushed back out to the corners' sphere, which is
    what keeps the fan flat rather than tenting outward). The vertex list
    is the 20 corners followed by the 12 fan centres; the face list is
    5*12 = 60 triangles."""
    ico_vertices, ico_faces = _icosahedron()
    corners = [
        _normalize(tuple(sum(ico_vertices[i][axis] for i in face) / 3 for axis in range(3)))
        for face in ico_faces
    ]
    vertex_faces: dict[int, list[int]] = defaultdict(list)
    for face_index, face in enumerate(ico_faces):
        for v in face:
            vertex_faces[v].append(face_index)

    vertices = list(corners)
    faces = []
    for v, face_ids in vertex_faces.items():
        ordered = _tangent_order(ico_vertices[v], [(fi, corners[fi]) for fi in face_ids])
        pentagon = [corners[fi] for fi in ordered]
        center = tuple(sum(p[axis] for p in pentagon) / 5 for axis in range(3))
        center_index = len(vertices)
        vertices.append(center)
        for i in range(5):
            faces.append((center_index, ordered[i], ordered[(i + 1) % 5]))
    return vertices, faces


def _octahedron() -> tuple[list[Vec3], list[tuple[int, int, int]]]:
    """A regular octahedron: six vertices on the coordinate axes, the eight
    faces one per octant (every choice of sign for each axis)."""
    vertices: list[Vec3] = [
        (1.0, 0.0, 0.0), (-1.0, 0.0, 0.0),
        (0.0, 1.0, 0.0), (0.0, -1.0, 0.0),
        (0.0, 0.0, 1.0), (0.0, 0.0, -1.0),
    ]
    faces = []
    for ix in (0, 1):
        for iy in (2, 3):
            for iz in (4, 5):
                a, b, c = vertices[ix], vertices[iy], vertices[iz]
                normal = newell_normal([a, b, c])
                outward = sum(n * (pa + pb + pc) for n, pa, pb, pc in zip(normal, a, b, c))
                faces.append((ix, iy, iz) if outward > 0 else (ix, iz, iy))
    return vertices, faces


def _tetrahedron() -> tuple[list[Vec3], list[tuple[int, int, int]]]:
    """A regular tetrahedron: four vertices on alternate cube corners,
    the four faces being the four vertex triples. Winding is arbitrary
    (each subdivided cell is re-oriented outward on assembly)."""
    vertices: list[Vec3] = [(1.0, 1.0, 1.0), (1.0, -1.0, -1.0),
                            (-1.0, 1.0, -1.0), (-1.0, -1.0, 1.0)]
    faces = [(1, 2, 3), (0, 2, 3), (0, 1, 3), (0, 1, 2)]
    return vertices, faces


def _convex_board3d(
    mode: str, cells, positions, mine_count: int, radius: float = 1.0
) -> Board3D:
    """Assemble a closed convex board, orienting each polygon outward by
    its centroid direction. Correct for any convex solid that contains the
    origin (sphere, cube, tetrahedron): every surface point has a positive
    dot with its face's outward normal."""
    adjacency = _shared_vertex_adjacency(cells)
    polygons = {}
    for cell, keys in cells.items():
        polygon = [positions[key] for key in keys]
        centroid = tuple(sum(c) / len(polygon) for c in zip(*polygon))
        polygons[cell] = _orient_outward(polygon, centroid)
    return Board3D(mode, polygons, adjacency, mine_count, radius=radius)


# -- 3D builders --------------------------------------------------------------


def _geodesic(
    frequency: int, vertices=None, faces=None, project: bool = True
) -> tuple[dict, list[tuple]]:
    """Subdivide each triangular face into ``frequency**2`` triangles.
    Defaults to the icosahedron; ``project`` normalizes vertices onto the
    unit sphere (a geodesic icosahedron), otherwise they stay on the flat
    faces (e.g. a triangulated tetrahedron).

    Returns (positions, triangles). Vertex keys are gcd-normalized
    barycentric weights over the corners, so vertices on shared edges
    match exactly across faces.
    """
    if vertices is None or faces is None:
        vertices, faces = _icosahedron()
    positions: dict[Hashable, Vec3] = {}
    triangles: list[tuple] = []
    for face in faces:
        corners = [vertices[v] for v in face]

        def key(i: int, j: int):
            weights = (frequency - i - j, i, j)
            items = [(v, w) for v, w in zip(face, weights) if w > 0]
            g = math.gcd(*(w for _, w in items))
            vertex_key = tuple(sorted((v, w // g) for v, w in items))
            if vertex_key not in positions:
                point = tuple(
                    sum(w * c[axis] for w, c in zip(weights, corners)) / frequency
                    for axis in range(3)
                )
                positions[vertex_key] = _normalize(point) if project else point
            return vertex_key

        for i in range(frequency):
            for j in range(frequency - i):
                triangles.append((key(i, j), key(i + 1, j), key(i, j + 1)))
                if i + j < frequency - 1:
                    triangles.append((key(i + 1, j), key(i + 1, j + 1), key(i, j + 1)))
    return positions, triangles


def _geodesic_hk(h: int, k: int) -> tuple[dict, list[tuple]]:
    """A class III geodesic icosahedron {3,5+}_{h,k}: the triangular lattice
    laid over each face so the face's corners sit ``h`` steps along it, a
    60-degree left turn (seen from outside), then ``k`` more -- ``T = h*h +
    h*k + k*k`` small triangles a face. ``_geodesic`` is the ``k = 0`` case,
    where the lattice runs along the edges; with ``k > 0`` it runs across
    them and the subdivision is chiral (``(k, h)`` is its mirror image).

    Each face walks the lattice triangles whose centre lies strictly inside
    it, so each triangle is taken exactly once. A centre can only land on an
    edge when ``h % 3 == k % 3`` -- class II, ``(1, 1)``, ``(2, 2)``, and the
    chiral ``(4, 1)`` as well -- so those are refused. A point is named by integer
    barycentric weights over the face's corners, summing to ``T``, gcd-
    normalised as in ``_geodesic``. A triangle straddling an edge has one
    corner beyond it, with one negative weight; that corner is renamed over
    the neighbouring face across the edge, whose far corner D is A + B - C
    in the unfolded net, so the weights stay integers and the key exact.
    With ``gcd(h, k) == 1`` no lattice point but a corner lies on an edge;
    with ``g = gcd(h, k) > 1`` the edge is cut ``g`` ways, and each of those
    points has a zero weight on the far corner and the same two weights over
    the edge's ends from either face, so the two faces name it alike."""
    assert k > 0 and (h - k) % 3 != 0, (h, k)
    vertices, faces = _icosahedron()
    total = h * h + h * k + k * k
    beyond: dict[tuple[int, int], int] = {}  # directed edge -> the face's third corner
    for face in faces:
        for i in range(3):
            beyond[(face[i], face[(i + 1) % 3])] = face[(i + 2) % 3]
    positions: dict[Hashable, Vec3] = {}

    def key(face: tuple[int, int, int], weights: tuple[int, int, int]):
        corners, weights = list(face), list(weights)
        if min(weights) < 0:
            assert sum(w < 0 for w in weights) == 1, weights
            n = weights.index(min(weights))
            # rotate the negative weight onto the third corner C
            corners = corners[n + 1:] + corners[:n + 1]
            weights = weights[n + 1:] + weights[:n + 1]
            a, b, _ = corners
            wa, wb, wc = weights
            corners = [a, b, beyond[(b, a)]]
            weights = [wa + wc, wb + wc, -wc]
        items = [(v, w) for v, w in zip(corners, weights) if w > 0]
        g = math.gcd(*(w for _, w in items))
        vertex_key = tuple(sorted((v, w // g) for v, w in items))
        if vertex_key not in positions:
            point = tuple(
                sum(w * vertices[v][axis] for v, w in zip(corners, weights)) / total
                for axis in range(3)
            )
            positions[vertex_key] = _normalize(point)
        return vertex_key

    def weights(i: int, j: int) -> tuple[int, int, int]:
        # lattice point i*e1 + j*e2 (e2 = e1 turned 60 degrees left) over the
        # corners A = 0, B = (h, k), C = B turned 60 degrees = (-k, h + k)
        b = i * (h + k) + j * k
        c = j * h - i * k
        return (total - b - c, b, c)

    triangles: list[tuple] = []
    reach = h + k
    for face in faces:
        for i in range(-reach, 2 * reach + 1):
            for j in range(-reach, 2 * reach + 1):
                for tri in (((i, j), (i + 1, j), (i, j + 1)),
                            ((i + 1, j), (i + 1, j + 1), (i, j + 1))):
                    corner_weights = [weights(*p) for p in tri]
                    centre = [sum(w[n] for w in corner_weights) for n in range(3)]
                    if min(centre) > 0:
                        triangles.append(tuple(key(face, w) for w in corner_weights))
    assert len(triangles) == 20 * total, len(triangles)
    return positions, triangles


def _goldberg_dual(mode: str, positions: dict, triangles: list[tuple], mine_count: int) -> Board3D:
    """One cell per geodesic vertex, made of the surrounding triangle
    centers."""
    centers: dict[tuple, Vec3] = {}
    around: dict[Hashable, list[tuple]] = defaultdict(list)
    for triangle in triangles:
        triangle_id = tuple(sorted(triangle))
        centers[triangle_id] = _normalize(
            tuple(
                sum(positions[k][axis] for k in triangle) / 3 for axis in range(3)
            )
        )
        for key in triangle:
            around[key].append(triangle_id)

    cells: dict[Cell, list] = {}
    for key, triangle_ids in around.items():
        ring = [(tid, centers[tid]) for tid in triangle_ids]
        cells[key] = _tangent_order(positions[key], ring)
    return _convex_board3d(mode, cells, centers, mine_count)


def _goldberg_board(mode: str, frequency: int, mine_count: int) -> Board3D:
    """The dual of a geodesic icosahedron, Goldberg GP(frequency, 0):
    always 12 pentagons plus ``10 * frequency**2 - 10`` hexagons."""
    return _goldberg_dual(mode, *_geodesic(frequency), mine_count)


def c180_board(mine_count: int, frequency: int = 3) -> Board3D:
    """The class I Goldberg polyhedron GP(frequency, 0), projected onto the
    unit sphere: 12 pentagons and ``10 * frequency**2 - 10`` hexagons. The
    default is GP(3,0), the C180 fullerene (92 cells) the mode is named
    after; ``frequency`` is the board's size knob."""
    return _goldberg_board("c180", frequency, mine_count)


def gp21_board(mine_count: int, h: int = 2, k: int = 1) -> Board3D:
    """The class III Goldberg polyhedron GP(h, k), projected onto the unit
    sphere: ``10 * T + 2`` cells for ``T = h*h + h*k + k*k``, always 12 of
    them pentagons. The dual of the class III geodesic icosahedron
    (`_geodesic_hk`). Chiral -- GP(k, h) is its mirror image -- so of the
    icosahedron's symmetries it keeps the 60 rotations only. The default is
    GP(2,1), the C140 fullerene (72 cells) the mode is named after, whose 60
    hexagons are a single orbit, each touching one pentagon; ``(h, k)`` is
    the board's size knob."""
    return _goldberg_dual("gp21", *_geodesic_hk(h, k), mine_count)


def sphere_triangle_board(mine_count: int, frequency: int = 2) -> Board3D:
    """A sphere tiled with triangles: a geodesic icosahedron with
    ``20 * frequency**2`` triangular cells -- `icosahedron_board`'s
    subdivision projected onto the unit sphere, so the same graph drawn
    round. ``frequency`` is the board's size knob."""
    positions, triangles = _geodesic(frequency)
    cells = {("t", n): list(triangle) for n, triangle in enumerate(triangles)}
    return _convex_board3d("spheretri", cells, positions, mine_count)


def _mirror_normals(v_dir: Vec3, e_dir: Vec3, f_dir: Vec3) -> dict[str, Vec3]:
    """The three mirror planes of a flag's Schwarz triangle, as inward unit
    normals. The mirror *opposite* a corner is the plane through the other two.
    """

    def normal(a: Vec3, b: Vec3, toward: Vec3) -> Vec3:
        n = _normalize(_cross(a, b))
        return n if _dot(n, toward) >= 0 else (-n[0], -n[1], -n[2])

    return {
        "v": normal(e_dir, f_dir, v_dir),
        "e": normal(f_dir, v_dir, e_dir),
        "f": normal(v_dir, e_dir, f_dir),
    }


def _wythoff_point(
    v_dir: Vec3,
    e_dir: Vec3,
    f_dir: Vec3,
    zero: tuple[str, ...] = (),
    equal: tuple[str, ...] = (),
) -> Vec3:
    """The Wythoff generating point of a Schwarz triangle: given one "flag" (a
    mutually incident vertex, edge and face)'s three axis directions --
    ``v_dir`` the vertex axis, ``e_dir`` its edge's midpoint, ``f_dir`` its
    face's centroid, the three corners of a fundamental (Schwarz) triangle
    whose sides are the group's mirror planes -- the point lying *on* the
    mirrors named by ``zero`` and at *equal* distances from those named by
    ``equal``.

    Reflecting it through the group's symmetries generates a uniform polyhedron
    with every edge the same length by construction: unlike rectifying a solid
    and then truncating the result (a sequential approximation that, no matter
    how the two steps are tuned, cannot make all of its face shapes regular at
    once -- see the git history for why), this always lands on the exact
    Archimedean solid, because a flag's three mirrors are just three planes
    through the origin and both constraint kinds are linear in the point. Two
    constraints, so the answer is one cross product.

    ``boards/catalan.py`` reads every non-chiral Conway operation off this;
    ``equal=("v", "e", "f")`` -- equidistant from all three -- is the
    omnitruncation (the truncated icosidodecahedron, on the icosahedron).
    """
    v_dir, e_dir, f_dir = _normalize(v_dir), _normalize(e_dir), _normalize(f_dir)
    n = _mirror_normals(v_dir, e_dir, f_dir)
    rows = [n[c] for c in zero]
    rows += [tuple(a - b for a, b in zip(n[x], n[y])) for x, y in zip(equal, equal[1:])]
    if len(rows) != 2:
        raise ValueError("a Wythoff point needs exactly two linear constraints")
    p = _normalize(_cross(rows[0], rows[1]))
    if _dot(p, v_dir) + _dot(p, e_dir) + _dot(p, f_dir) < 0:
        p = (-p[0], -p[1], -p[2])
    return p


def cube_board(n: int, mine_count: int) -> Board3D:
    """A cube surface tiled with ``6 * n**2`` squares: each face an n x n
    grid. Vertices are integer points on ``[-n, n]**3`` (a surface vertex
    has one axis at +-n; the grid lines step by 2), so cells on adjacent
    faces sharing a cube edge or corner become neighbors automatically."""
    cells: dict[Cell, list] = {}
    positions: dict[Hashable, Vec3] = {}
    for axis in range(3):
        u_axis, v_axis = (a for a in range(3) if a != axis)
        for sign in (-1, 1):
            for i in range(n):
                for j in range(n):
                    keys = []
                    for du, dv in ((0, 0), (1, 0), (1, 1), (0, 1)):
                        coord = [0, 0, 0]
                        coord[axis] = sign * n
                        coord[u_axis] = -n + 2 * (i + du)
                        coord[v_axis] = -n + 2 * (j + dv)
                        key = tuple(coord)
                        keys.append(key)
                        if key not in positions:
                            positions[key] = (key[0] / n, key[1] / n, key[2] / n)
                    cells[(axis, sign, i, j)] = keys
    return _convex_board3d("cube", cells, positions, mine_count, radius=ROOT3)


# -- brick-bond cubes ---------------------------------------------------------
#
# Three of the five congruent-rectangle bonds (`tilings.py`, family
# "rectangle") lay on a cube, and they are exactly the three whose fundamental
# block is a *square*: the stacked bond is two 1x1/2 bricks stacked, the basket
# weave two laid one way or the other in a checkerboard, and the three-brick
# weave three 1x1/3 bricks the same way. The running bond's block is offset half
# a brick and the herringbone's is a diagonal, so neither fills a square face.
#
# The brick rings (`aperiodic.py`) lay on one too, by a different route: they
# have no block at all, but n rings fill a 2n x 2n square exactly, and a cube
# face is a square. So that cube's faces are each the flat board, whole.

_BRICK_BLOCK = 6  # lattice units per block: divisible by 2 and by 3


def _brick_courses(count: int, turned: bool) -> list[tuple[int, int, int, int]]:
    """One block's bricks as ``(u0, v0, u1, v1)`` in block-local units:
    ``count`` courses laid across the block, or turned a quarter-turn."""
    step = _BRICK_BLOCK // count
    if turned:
        return [(k * step, 0, (k + 1) * step, _BRICK_BLOCK) for k in range(count)]
    return [(0, k * step, _BRICK_BLOCK, (k + 1) * step) for k in range(count)]


# bond -> (bricks per block, whether the block turns on a checkerboard). The
# stacked bond lays every block the same way (it is a stretched square tiling);
# both weaves alternate, which is the whole of the weave.
BRICK_BONDS = {
    "stackedbond": (2, False),
    "basketweave": (2, True),
    "basketweave3": (3, True),
}

#: The one brick pattern a cube also takes that is not a bond: no block, the
#: whole face is the flat board's concentric rings (`brick_cube_board`).
BRICK_RINGS = "brickrings"


def _face_bricks(bond: str, n: int, phase: int):
    """One face's bricks as ``(suffix, (u0, v0, u1, v1))``, in lattice units
    from the face's ``(-half, -half)`` corner; ``suffix`` ends the cell id.

    A bond's face is an n x n grid of blocks, each cut into the bond's bricks
    (and, for the weaves, turned on a checkerboard ``phase`` shifts). The brick
    rings' face is the flat board's ``n`` rings, its rows along u.
    """
    if bond == BRICK_RINGS:
        for b, (x, y, w, h) in enumerate(_brick_rings_tiles(n)):
            yield (b,), (x + n, y + n, x + n + w, y + n + h)
        return
    count, checkered = BRICK_BONDS[bond]
    block = _BRICK_BLOCK
    for i in range(n):
        for j in range(n):
            turned = checkered and (i + j + phase) % 2 == 1
            for b, (u0, v0, u1, v1) in enumerate(_brick_courses(count, turned)):
                yield (i, j, b), (i * block + u0, j * block + v0,
                                  i * block + u1, j * block + v1)


def _split_at_lattice_points(cells: dict[Cell, list]) -> dict[Cell, list]:
    """Insert every vertex that lies *inside* another cell's edge into that
    edge -- the 3D twin of ``tilings._insert_t_vertices``.

    A brick cube needs it twice over. Within a face the weaves are not edge to
    edge: a course's end abuts the middle of the turned brick beside it. And at
    the twelve cube edges the two faces subdivide the shared line differently,
    because a face's bricks run along one of its two directions and no choice
    of directions makes all twelve agree (each face halves exactly one of its
    edge directions, and around a corner the three faces cannot be coloured to
    match). Recorded as a vertex of the brick whose edge it splits, the point
    is collinear -- the drawn rectangle is unchanged -- but the two bricks now
    share a vertex id, which is what `_shared_vertex_adjacency` runs on and
    what makes the mesh close: without it the Euler characteristic is not 2 and
    a cube edge counts as a boundary.

    Vertices are integer triples and every brick edge is axis-aligned, so this
    is exact integer arithmetic with no tolerance to get wrong.
    """
    vertices = {key for keys in cells.values() for key in keys}
    out: dict[Cell, list] = {}
    for cell, keys in cells.items():
        split = []
        for a, b in zip(keys, keys[1:] + keys[:1]):
            split.append(a)
            delta = tuple(y - x for x, y in zip(a, b))
            steps = max(abs(d) for d in delta)
            unit = tuple(d // steps for d in delta)
            for s in range(1, steps):
                point = tuple(a[k] + unit[k] * s for k in range(3))
                if point in vertices:
                    split.append(point)
        out[cell] = split
    return out


def brick_cube_board(bond: str, n: int, mine_count: int) -> Board3D:
    """A cube surface tiled with one congruent rectangle: each face an n x n
    grid of square blocks, each block cut into the bond's bricks, so the board
    is ``6 * bricks * n**2`` cells (12 n**2 for the two-brick bonds, 18 n**2
    for the three-brick weave).

    ``bond`` may also be ``BRICK_RINGS``, and then ``n`` counts rings: each
    face is the flat brick-rings board of ``n`` rings, 2n bricks long a side,
    so the board is ``12 n**2`` 2x1 bricks with every face's rings about its
    own centre.

    Vertices are integer points on ``[-N, N]**3`` where ``N = 3n`` (a surface
    vertex has one axis at +-N; a block is 6 units, so a half- and a
    third-split both land on the lattice) -- ``N = n`` for the rings, whose
    bricks are whole lattice units already -- which is what lets bricks
    meeting at a cube edge or corner share a vertex id and become neighbors.

    A face's bricks run along the first of its two axes taken cyclically
    (x-face -> y, y-face -> z, z-face -> x), so the six faces are related by
    the cube's own rotations rather than one face being laid out differently
    from the rest. That leaves the bond broken at some of the twelve edges --
    a brick cannot run round a corner -- and `_split_at_lattice_points` is
    what stitches the mesh back together across the break. The rings break
    at every one of the twelve: a face's outer ring cuts its row edges (along
    u) at even steps from the corner and its side edges (along v) at odd
    ones, and the cyclic rule makes each cube edge one face's u and the other
    face's v, so the two cuts never line up. Each face keeps its rings' two
    mirrors and half turn, and the board the cube's 12 rotations of a
    tetrahedron plus the inversion -- 24 of 48 at every n, like the bonds.
    """
    if bond != BRICK_RINGS and bond not in BRICK_BONDS:
        raise ValueError(f"unknown brick bond: {bond}")
    if n < 1:
        raise ValueError("need at least one block per face side")
    half = n if bond == BRICK_RINGS else n * _BRICK_BLOCK // 2

    cells: dict[Cell, list] = {}
    for axis in range(3):
        u_axis, v_axis = (axis + 1) % 3, (axis + 2) % 3
        for sign in (-1, 1):
            # A weave's quarter-turn centres are its block *corners*, and a
            # face centre is one only when n is even. So for even n the
            # checkerboard has to be flipped on the three negative faces, or
            # the two halves of the cube carry the pattern in opposite phase
            # where they meet: measured, that costs an even-n weave cube all
            # but 6 of its 24 rotations and fans its neighbour counts out from
            # two classes into four (a 6-cell class of degree 5 appears, one
            # per face). Flipped, every size of every bond keeps a symmetry
            # group of order 24 -- the full rotation group for even n, and the
            # 12 rotations plus inversion the odd sizes already had.
            phase = 1 if n % 2 == 0 and sign < 0 else 0
            for suffix, (u0, v0, u1, v1) in _face_bricks(bond, n, phase):
                keys = []
                for u, v in ((u0, v0), (u1, v0), (u1, v1), (u0, v1)):
                    coord = [0, 0, 0]
                    coord[axis] = sign * half
                    coord[u_axis] = -half + u
                    coord[v_axis] = -half + v
                    keys.append(tuple(coord))
                cells[(axis, sign, *suffix)] = keys

    cells = _split_at_lattice_points(cells)
    positions = {
        key: (key[0] / half, key[1] / half, key[2] / half)
        for keys in cells.values()
        for key in keys
    }
    mode = "cube" + bond
    return _convex_board3d(mode, cells, positions, mine_count, radius=ROOT3)


def _polycube_board3d(mode, cells, positions, mine_count, radius) -> Board3D:
    """Assemble a closed but non-convex polycube surface. Each cell is a
    unit square already wound outward by the builder (its outward normal
    is known from which cube face it is), so — unlike ``_convex_board3d``
    — orientation is not inferred from the centroid direction, which is
    wrong for the inward-facing tunnel walls."""
    adjacency = _shared_vertex_adjacency(cells)
    polygons = {
        cell: [positions[key] for key in keys] for cell, keys in cells.items()
    }
    return Board3D(mode, polygons, adjacency, mine_count, radius=radius)


def _polycube_surface(mode, solid, extent, mine_count) -> Board3D:
    """The boundary of a polycube (a union of axis-aligned unit cubes),
    tiled by unit squares. ``solid(i, j, k)`` says whether the unit cube
    at integer indices is filled; ``extent`` is the ``(nx, ny, nz)``
    bounding box. Cubes are scaled uniformly and centered in ``[-1, 1]``.

    A unit square is a cell exactly when it separates a filled cube from
    empty space, and it is wound so its normal points outward (out of the
    filled cube) — which, unlike the centroid rule ``_convex_board3d``
    uses, is also correct for the concave step shoulders and inner walls
    these solids have. Vertices are the integer lattice points, so faces
    meeting at an edge or corner share vertex ids and become neighbors."""
    nx, ny, nz = extent
    center = (nx / 2, ny / 2, nz / 2)
    scale = 2.0 / max(extent)

    def position(p) -> Vec3:
        return tuple((c - o) * scale for c, o in zip(p, center))

    def filled(i: int, j: int, k: int) -> bool:
        return 0 <= i < nx and 0 <= j < ny and 0 <= k < nz and solid(i, j, k)

    cells: dict[Cell, list] = {}
    positions: dict[Hashable, Vec3] = {}
    for i in range(nx):
        for j in range(ny):
            for k in range(nz):
                if not solid(i, j, k):
                    continue
                for axis in range(3):
                    for sign in (-1, 1):
                        step = [0, 0, 0]
                        step[axis] = sign
                        if filled(i + step[0], j + step[1], k + step[2]):
                            continue  # interior face, not on the boundary
                        base = [i, j, k]
                        if sign > 0:
                            base[axis] += 1  # the far face of the cube
                        u_axis, v_axis = (a for a in range(3) if a != axis)
                        corners = []
                        for du, dv in ((0, 0), (1, 0), (1, 1), (0, 1)):
                            p = list(base)
                            p[u_axis] += du
                            p[v_axis] += dv
                            corners.append(tuple(p))
                        outward = [0.0, 0.0, 0.0]
                        outward[axis] = float(sign)
                        pts = [position(p) for p in corners]
                        if _dot(newell_normal(pts), tuple(outward)) <= 0:
                            corners.reverse()
                        for p in corners:
                            positions.setdefault(p, position(p))
                        cells[(i, j, k, axis, sign)] = corners
    radius = max(math.hypot(*p) for p in positions.values())
    return _polycube_board3d(mode, cells, positions, mine_count, radius=radius)


def cube_frame_board(n: int, thickness: int, mine_count: int) -> Board3D:
    """The surface of a cube frame (a level-1 Menger sponge): an
    ``n x n x n`` stack of unit cubes with an ``(n - 2*thickness)`` cube
    bored out of the middle of each face, meeting in a hollow centre. What
    is left are the twelve edge bars plus eight corners — a genus-5 solid
    whose whole boundary is tiled by unit squares.

    A unit cube is kept when at least two of its three coordinates lie in
    the outer band (within ``thickness`` of a face)."""
    if not (thickness >= 1 and 2 * thickness < n):
        raise ValueError("thickness must be >= 1 and leave a non-empty hole")

    def outer(c: int) -> bool:
        return c < thickness or c >= n - thickness

    def solid(i: int, j: int, k: int) -> bool:
        return (outer(i) + outer(j) + outer(k)) >= 2

    return _polycube_surface("cubeframe", solid, (n, n, n), mine_count)


def stepped_bipyramid_board(base: int, levels: int, mine_count: int) -> Board3D:
    """A stepped bipyramid: a stepped pyramid of square terraces stitched
    base-to-base with its z-mirror image (the shared biggest terrace kept
    only once). Square layer ``d`` steps from the middle has side
    ``base - 2*d``, so the solid is widest at the equator and tapers to a
    small square top and bottom — a terraced diamond whose staircase
    surface (concave at every shoulder) is tiled by unit squares.

    ``levels`` counts the terraces of one pyramid; the apex square has
    side ``base - 2*(levels - 1)`` and the whole stack is ``2*levels - 1``
    layers tall."""
    if not (levels >= 2 and base - 2 * (levels - 1) >= 1):
        raise ValueError("need levels >= 2 and a positive apex square")
    height = 2 * levels - 1
    middle = levels - 1  # the z-index of the biggest (equator) terrace

    def solid(i: int, j: int, k: int) -> bool:
        margin = abs(k - middle)  # each step in from the equator shrinks by 1
        return margin <= i < base - margin and margin <= j < base - margin

    return _polycube_surface("steppedbipyramid", solid, (base, base, height), mine_count)


def stepped_pyramid_board(base: int, levels: int, mine_count: int) -> Board3D:
    """A single stepped pyramid (a Mesoamerican-style ziggurat): square
    terraces stepping in from a full ``base`` x ``base`` foundation to a
    ``base - 2*(levels - 1)`` apex. Unlike `stepped_bipyramid_board` -- one
    of these mirrored base-to-base, so the shared foundation square sits
    inside the solid -- there is nothing below layer 0 here, so the
    foundation is itself on the boundary and, like every terrace step and
    side wall, a playable cell."""
    if not (levels >= 2 and base - 2 * (levels - 1) >= 1):
        raise ValueError("need levels >= 2 and a positive apex square")

    def solid(i: int, j: int, k: int) -> bool:
        margin = k  # each step up from the foundation shrinks by 1
        return margin <= i < base - margin and margin <= j < base - margin

    return _polycube_surface("steppedpyramid", solid, (base, base, levels), mine_count)


def tetrahedron_board(mine_count: int, frequency: int = 4) -> Board3D:
    """A regular tetrahedron tiled with triangles: each of the 4 faces
    subdivided into ``frequency**2`` cells, kept flat on the faces."""
    vertices, faces = _tetrahedron()
    positions, triangles = _geodesic(frequency, vertices, faces, project=False)
    cells = {("t", n): list(triangle) for n, triangle in enumerate(triangles)}
    radius = max(math.hypot(*p) for p in positions.values())
    return _convex_board3d("tetrahedron", cells, positions, mine_count, radius=radius)


def octahedron_board(mine_count: int, frequency: int = 3) -> Board3D:
    """A regular octahedron tiled with triangles: each of the 8 faces
    subdivided into ``frequency**2`` cells, kept flat on the faces (the
    same flat, non-projected subdivision `tetrahedron_board` uses)."""
    vertices, faces = _octahedron()
    positions, triangles = _geodesic(frequency, vertices, faces, project=False)
    cells = {("t", n): list(triangle) for n, triangle in enumerate(triangles)}
    radius = max(math.hypot(*p) for p in positions.values())
    return _convex_board3d("octahedron", cells, positions, mine_count, radius=radius)


def icosahedron_board(mine_count: int, frequency: int = 2) -> Board3D:
    """A regular icosahedron tiled with triangles: each of the 20 faces
    subdivided into ``frequency**2`` cells, kept flat on the faces --
    unlike `sphere_triangle_board`, which projects the same subdivision
    onto the unit sphere, this keeps the solid's flat facets (and their
    creased edges) intact."""
    vertices, faces = _icosahedron()
    positions, triangles = _geodesic(frequency, vertices, faces, project=False)
    cells = {("t", n): list(triangle) for n, triangle in enumerate(triangles)}
    radius = max(math.hypot(*p) for p in positions.values())
    return _convex_board3d("icosahedron", cells, positions, mine_count, radius=radius)


def dodecahedron_board(mine_count: int, frequency: int = 1) -> Board3D:
    """A regular dodecahedron tiled with triangles: each of its 12
    pentagonal faces fanned from its own centre into 5 triangles --
    ``frequency=1`` is exactly that fan, 60 cells -- and each of those 60
    wedges further subdivided into ``frequency**2`` flat triangles for the
    larger difficulties, the same flat, non-projected subdivision the other
    Platonic solids use. A regular pentagon is not equilateral like the
    other Platonic faces, so its wedges are the one facet here that stay a
    little off-square (72-54-54 triangles) at any frequency."""
    vertices, faces = _dodecahedron()
    positions, triangles = _geodesic(frequency, vertices, faces, project=False)
    cells = {("t", n): list(triangle) for n, triangle in enumerate(triangles)}
    radius = max(math.hypot(*p) for p in positions.values())
    return _convex_board3d("dodecahedron", cells, positions, mine_count, radius=radius)


def tetrahedron_frame_board(mine_count: int, frequency: int = 4) -> Board3D:
    """A level-1 Sierpiński tetrahedron: midpoint-subdividing a regular
    tetrahedron splits it into four corner sub-tetrahedra plus a central
    octahedron, and the octahedron is carved out. What is left are the four
    half-scale corner tetrahedra, meeting only at the six edge-midpoints of
    the original — so on each original face the middle triangle is gone. Each
    sub-tetrahedron face is subdivided into ``frequency**2`` flat triangles.

    Non-convex (the inward faces point toward the hollow centre), so unlike
    ``tetrahedron_board`` each triangle is oriented outward from its own
    sub-tetrahedron's centroid rather than the origin."""
    base, _ = _tetrahedron()
    # Ten shared points: the 4 original corners, then the 6 edge midpoints.
    # A single global vertex list keeps the midpoints' subdivision keys
    # identical across the two sub-tetrahedra that meet at them.
    verts = list(base)
    mid_index: dict[tuple[int, int], int] = {}
    for a in range(4):
        for b in range(a + 1, 4):
            mid_index[(a, b)] = len(verts)
            verts.append(tuple((base[a][axis] + base[b][axis]) / 2 for axis in range(3)))

    cells: dict[Cell, list] = {}
    positions: dict[Hashable, Vec3] = {}
    centroids: dict[Cell, Vec3] = {}
    for corner in range(4):
        others = [j for j in range(4) if j != corner]
        tet = [corner] + [mid_index[tuple(sorted((corner, j)))] for j in others]
        centroid = tuple(sum(verts[v][axis] for v in tet) / 4 for axis in range(3))
        faces = [
            (tet[1], tet[2], tet[3]),
            (tet[0], tet[2], tet[3]),
            (tet[0], tet[1], tet[3]),
            (tet[0], tet[1], tet[2]),
        ]
        pos, triangles = _geodesic(frequency, verts, faces, project=False)
        positions.update(pos)
        for n, triangle in enumerate(triangles):
            cell = (corner, n)
            cells[cell] = list(triangle)
            centroids[cell] = centroid

    adjacency = _shared_vertex_adjacency(cells)
    polygons = {}
    for cell, keys in cells.items():
        polygon = [positions[key] for key in keys]
        face_centroid = tuple(sum(c) / len(polygon) for c in zip(*polygon))
        outward = tuple(f - c for f, c in zip(face_centroid, centroids[cell]))
        polygons[cell] = _orient_outward(polygon, outward)
    radius = max(math.hypot(*p) for p in positions.values())
    return Board3D("tetraframe", polygons, adjacency, mine_count, radius=radius)
