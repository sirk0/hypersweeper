from __future__ import annotations

import math
from collections import defaultdict
from typing import Hashable

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


def _gyro_pentagons() -> tuple[dict, dict]:
    """The pentagonal hexecontahedron as (cells, vertex positions):
    the Conway "gyro" operation on an icosahedron — each triangular
    face gains a center vertex, each edge two division points, and
    every (face, corner) pair becomes one pentagon."""
    vertices, faces = _icosahedron()
    positions: dict[Hashable, Vec3] = {}

    def vertex_key(i: int):
        key = ("v", i)
        positions[key] = _normalize(vertices[i])
        return key

    def edge_key(u: int, v: int, third: int):
        # point at u + third/3 of the way to v; same point seen from the
        # other end is (v, u, 3 - third)
        key = ("e", u, v, third) if u < v else ("e", v, u, 3 - third)
        a, b = vertices[u], vertices[v]
        positions[key] = _normalize(
            tuple(pa + (pb - pa) * third / 3 for pa, pb in zip(a, b))
        )
        return key

    cells: dict[Cell, list] = {}
    for face_index, face in enumerate(faces):
        center_key = ("c", face_index)
        positions[center_key] = _normalize(
            tuple(sum(vertices[i][axis] for i in face) / 3 for axis in range(3))
        )
        for i in range(3):
            u, v, w = face[i - 1], face[i], face[(i + 1) % 3]
            cells[(face_index, i)] = [
                center_key,
                edge_key(u, v, 2),
                vertex_key(v),
                edge_key(v, w, 1),
                edge_key(v, w, 2),
            ]
    return cells, positions


def sphere_board(mine_count: int) -> Board3D:
    """A sphere tiled with 60 pentagons (a pentagonal hexecontahedron,
    projected onto the unit sphere). Every pentagon has exactly 7
    neighbors."""
    cells, positions = _gyro_pentagons()
    return _convex_board3d("sphere", cells, positions, mine_count)


def snub_dodecahedron_board(mine_count: int) -> Board3D:
    """A snub dodecahedron: 12 pentagons and 80 triangles (vertex
    configuration 3.3.3.3.5), projected onto the unit sphere.

    Built as the dual of the pentagonal hexecontahedron: one cell per
    hexecontahedron vertex, made of the surrounding pentagon centers.
    """
    pentagons, positions = _gyro_pentagons()
    centers = {
        cid: _normalize(
            tuple(
                sum(positions[k][axis] for k in keys) / len(keys)
                for axis in range(3)
            )
        )
        for cid, keys in pentagons.items()
    }
    around: dict[Hashable, list] = defaultdict(list)
    for cid, keys in pentagons.items():
        for key in keys:
            around[key].append(cid)
    cells = {
        key: _tangent_order(positions[key], [(cid, centers[cid]) for cid in ids])
        for key, ids in around.items()
    }
    return _convex_board3d("snubdodec", cells, centers, mine_count)


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


def _goldberg_board(mode: str, frequency: int, mine_count: int) -> Board3D:
    """The dual of a geodesic icosahedron: one cell per geodesic vertex,
    made of the surrounding triangle centers. Always 12 pentagons plus
    ``10 * frequency**2 - 10`` hexagons."""
    positions, triangles = _geodesic(frequency)
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


def c80_board(mine_count: int) -> Board3D:
    """A C80 fullerene (chamfered dodecahedron): 12 pentagons and 30
    hexagons, projected onto the unit sphere."""
    return _goldberg_board("c80", 2, mine_count)


def c180_board(mine_count: int) -> Board3D:
    """A C180 fullerene (Goldberg GP(3,0)): 12 pentagons and 80
    hexagons, projected onto the unit sphere."""
    return _goldberg_board("c180", 3, mine_count)


def sphere_triangle_board(mine_count: int, frequency: int = 2) -> Board3D:
    """A sphere tiled with triangles: a geodesic icosahedron with
    ``20 * frequency**2`` triangular cells."""
    positions, triangles = _geodesic(frequency)
    cells = {("t", n): list(triangle) for n, triangle in enumerate(triangles)}
    return _convex_board3d("spheretri", cells, positions, mine_count)



# Every icosahedron vertex is pulled toward its incident faces' centroid by
# this fraction, and every point lands on the unit sphere. Because a vertex
# and a face are both single orbits under the icosahedron's symmetry, the
# triangles and pentagons come out equilateral for *any* fraction here — only
# the squares (one per edge, straddling two faces) are sensitive to it, and
# this is the fraction (found by a numeric search maximizing their
# regularity) where they too come out square to within float precision,
# making the whole solid a true rhombicosidodecahedron rather than merely
# looking like one.
_EXPAND_CENTROID_WEIGHT = 0.6496270939773015


def _expand_icosahedron() -> tuple[dict, dict]:
    """The rhombicosidodecahedron as (cells, positions): the Conway
    "expand" (cantellation) operation on the icosahedron — 20 shrunk
    triangles (one per face), 30 squares (one per edge, opening a gap
    between the two faces it used to join) and 12 pentagons (one per
    vertex, since every icosahedron vertex has degree 5). Cells are keyed
    by the (face, vertex) incidence flags a corner is pulled toward."""
    vertices, faces = _icosahedron()
    w = _EXPAND_CENTROID_WEIGHT
    positions: dict[Hashable, Vec3] = {}
    for face_index, face in enumerate(faces):
        centroid = tuple(sum(vertices[i][axis] for i in face) / 3 for axis in range(3))
        for v in face:
            positions[(face_index, v)] = _normalize(
                tuple((1 - w) * vertices[v][axis] + w * centroid[axis] for axis in range(3))
            )

    cells: dict[Cell, list] = {
        ("f", fi): [(fi, v) for v in face] for fi, face in enumerate(faces)
    }

    edge_faces: dict[tuple[int, int], list[int]] = defaultdict(list)
    for face_index, face in enumerate(faces):
        for i in range(3):
            u, v = face[i], face[(i + 1) % 3]
            edge_faces[(min(u, v), max(u, v))].append(face_index)
    for (u, v), face_ids in edge_faces.items():
        f1, f2 = face_ids
        cells[("e", u, v)] = [(f1, u), (f1, v), (f2, v), (f2, u)]

    vertex_faces: dict[int, list[int]] = defaultdict(list)
    for face_index, face in enumerate(faces):
        for v in face:
            vertex_faces[v].append(face_index)
    for v, face_ids in vertex_faces.items():
        ordered = _tangent_order(
            vertices[v], [(fi, positions[(fi, v)]) for fi in face_ids]
        )
        cells[("v", v)] = [(fi, v) for fi in ordered]

    return cells, positions


def rhombicosidodecahedron_board(mine_count: int) -> Board3D:
    """A rhombicosidodecahedron: 20 triangles, 30 squares and 12 pentagons
    (vertex configuration 3.4.5.4), projected onto the unit sphere."""
    cells, positions = _expand_icosahedron()
    return _convex_board3d("rhombicosidodeca", cells, positions, mine_count)


def _flag_position(v_dir: Vec3, e_dir: Vec3, f_dir: Vec3) -> Vec3:
    """The Wythoff generating point for the icosahedral (2, 3, 5) reflection
    group: given one "flag" (a mutually incident icosahedron vertex, edge and
    face)'s three axis directions -- ``v_dir`` the vertex (5-fold axis),
    ``e_dir`` its edge's midpoint (2-fold axis), ``f_dir`` its face's centroid
    (3-fold axis), the three corners of a fundamental (Schwarz) triangle whose
    sides are the group's mirror planes -- the point inside that triangle
    equidistant from all three mirrors. Reflecting it through the group's 120
    symmetries generates the omnitruncated icosahedron (the truncated
    icosidodecahedron, a.k.a. great rhombicosidodecahedron) with every edge
    the same length by construction: unlike rectifying the icosahedron and
    then truncating the result (a sequential approximation that, no matter
    how the two steps are tuned, cannot make all three of its face shapes
    regular at once -- see the git history for why), this always lands on
    the exact Archimedean solid, because a flag's three mirrors are just
    three planes through the origin and this point is the same distance from
    each of them."""
    v_dir, e_dir, f_dir = _normalize(v_dir), _normalize(e_dir), _normalize(f_dir)

    def mirror_normal(a: Vec3, b: Vec3, toward: Vec3) -> Vec3:
        n = _normalize(_cross(a, b))
        return n if _dot(n, toward) >= 0 else (-n[0], -n[1], -n[2])

    # the mirror opposite each corner is the plane through the other two
    n_v = mirror_normal(e_dir, f_dir, v_dir)
    n_e = mirror_normal(f_dir, v_dir, e_dir)
    n_f = mirror_normal(v_dir, e_dir, f_dir)
    # equidistant from all three mirrors <=> orthogonal to n_v - n_e and to
    # n_e - n_f, i.e. their cross product (a linear, not barycentric, solve)
    p = _normalize(_cross(
        (n_v[0] - n_e[0], n_v[1] - n_e[1], n_v[2] - n_e[2]),
        (n_e[0] - n_f[0], n_e[1] - n_f[1], n_e[2] - n_f[2]),
    ))
    if _dot(p, v_dir) + _dot(p, e_dir) + _dot(p, f_dir) < 0:
        p = (-p[0], -p[1], -p[2])
    return p


def _truncated_icosidodecahedron() -> tuple[dict, dict]:
    """The truncated icosidodecahedron as (cells, positions): the
    omnitruncation of the icosahedron. Each vertex is a flag (icosahedron
    vertex, edge, face mutually incident) placed by `_flag_position`; there
    are 4 * 30 edges = 120 of them, keyed by ``(face_index, local_vertex,
    side)`` (``side`` picks which of the vertex's two edges within that
    face). 20 hexagons (one per face), 12 decagons (one per vertex) and 30
    squares (one per edge)."""
    vertices, faces = _icosahedron()
    positions: dict[Hashable, Vec3] = {}
    centroids: dict[int, Vec3] = {
        fi: tuple(sum(vertices[i][axis] for i in face) / 3 for axis in range(3))
        for fi, face in enumerate(faces)
    }
    for fi, face in enumerate(faces):
        for lv in range(3):
            v = face[lv]
            for side in (0, 1):
                nb = face[(lv + (1 if side == 0 else -1)) % 3]
                emid = tuple((vertices[v][axis] + vertices[nb][axis]) / 2 for axis in range(3))
                positions[(fi, lv, side)] = _flag_position(vertices[v], emid, centroids[fi])

    cells: dict[Cell, list] = {}
    for fi, face in enumerate(faces):
        flags = [(fi, lv, side) for lv in range(3) for side in (0, 1)]
        cells[("h", fi)] = _tangent_order(
            centroids[fi], [(key, positions[key]) for key in flags]
        )

    vertex_faces: dict[int, list[tuple[int, int]]] = defaultdict(list)
    for fi, face in enumerate(faces):
        for lv, v in enumerate(face):
            vertex_faces[v].append((fi, lv))
    for v, incident in vertex_faces.items():
        flags = [(fi, lv, side) for fi, lv in incident for side in (0, 1)]
        cells[("d", v)] = _tangent_order(
            vertices[v], [(key, positions[key]) for key in flags]
        )

    edge_flags: dict[tuple[int, int], list[tuple[int, int, int]]] = defaultdict(list)
    for fi, face in enumerate(faces):
        for i in range(3):
            u, w = face[i], face[(i + 1) % 3]
            lu, lw = i, (i + 1) % 3
            side_u = 0 if face[(lu + 1) % 3] == w else 1
            side_w = 0 if face[(lw + 1) % 3] == u else 1
            edge_flags[(min(u, w), max(u, w))].append((fi, lu, side_u))
            edge_flags[(min(u, w), max(u, w))].append((fi, lw, side_w))
    for (u, w), flags in edge_flags.items():
        centre = tuple((vertices[u][axis] + vertices[w][axis]) / 2 for axis in range(3))
        cells[("s", u, w)] = _tangent_order(
            centre, [(key, positions[key]) for key in flags]
        )

    return cells, positions


def truncated_icosidodecahedron_board(mine_count: int) -> Board3D:
    """A truncated icosidodecahedron: 30 squares, 20 hexagons and 12
    decagons (vertex configuration 4.6.10), projected onto the unit sphere —
    the exact omnitruncation of the icosahedron (see `_flag_position`), so
    every face is genuinely regular rather than merely close."""
    cells, positions = _truncated_icosidodecahedron()
    return _convex_board3d("truncicosidodeca", cells, positions, mine_count)


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
