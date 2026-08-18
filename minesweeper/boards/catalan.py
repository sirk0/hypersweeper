"""The thirteen Catalan solids: the duals of the Archimedean solids.

Every Catalan solid is the **polar dual** of an Archimedean solid, and every
Archimedean solid is one orbit of a single point -- the Wythoff generating
point -- in the Schwarz (fundamental) triangle of a Platonic symmetry group.
That gives one recipe for all thirteen:

1. Take a base solid (tetrahedron, cube, icosahedron -- one per symmetry group)
   and one **flag**: a mutually incident (vertex, edge, face), whose three axis
   directions ``v``, ``e``, ``f`` are the corners of the Schwarz triangle. The
   triangle's sides are the group's three mirror planes.
2. Find ``w``, the Archimedean vertex: `_wythoff_point` for the five non-chiral
   operations (two linear constraints, so one cross product), `_snub_point` for
   the chiral one.
3. The Catalan solid's vertices are ``n / <w, n>`` for each face axis ``n`` of
   the Archimedean solid -- polar duality with respect to the unit sphere. A
   regular polygon's centre is its own foot of perpendicular, so ``<w, n>`` is
   exactly the face's distance from the centre. Every Catalan face then lies at
   distance exactly 1, so the solid has an insphere and is genuinely isohedral
   rather than isohedral-looking.
4. Its faces are groups of the base's **flags**, one grouping rule per Conway
   operation.

Six operations over three symmetry groups give thirteen solids (the tetrahedral
group yields only ``kis``; its other operations land in the cubic family):

============ ======================== =========================== ================================
operation    tetrahedral              octahedral                  icosahedral
============ ======================== =========================== ================================
``join``     --                       rhombic dodecahedron (12)   rhombic triacontahedron (30)
``kis``      triakis tetrahedron (12) tetrakis hexahedron (24)    triakis icosahedron (60)
``kisdual``  --                       triakis octahedron (24)     pentakis dodecahedron (60)
``ortho``    --                       deltoidal icositetra. (24)  deltoidal hexecontahedron (60)
``meta``     --                       disdyakis dodecahedron (48) disdyakis triacontahedron (120)
``gyro``     --                       pentagonal icositetra. (24) pentagonal hexecontahedron (60)
============ ======================== =========================== ================================

Twelve to a hundred and twenty cells is not a minesweeper board, so every face
is **subdivided** into smaller copies of itself, and that subdivision is the
boards' size knob. A triangular face goes through `solids._geodesic` -- the same
flat, non-projected subdivision the Platonic boards use -- and a quadrilateral
or pentagonal one through `_quad_grid`.

The subdivision is square (``frequency x frequency``) and not a free
``n x m`` rectangle, and that is forced rather than chosen: an ``n x m`` grid
needs each face's *opposite* edges to carry the same count, so the edges must
2-colour consistently across the whole solid. A rhombic Catalan solid is a
zonohedron whose zones pairwise share a face, so no such 2-colouring exists; a
kite and the pentagon's fan quadrilateral both have adjacent rather than
opposite edges of a kind. One knob it is.

A pentagon cannot be cut into pentagons at all, so the two chiral solids fan
each face into five quadrilaterals through its own planar centre first --
``frequency=0`` keeps the bare pentagon, which is the board ``sphere`` has
always shipped as.

Subdivision vertices on a shared edge are keyed by that edge and interpolated
in one canonical direction, so the two faces meeting along it agree exactly and
the shared-vertex adjacency rule finds them. No vertex id here is ever a
rounded float.
"""

from __future__ import annotations

import math
from collections import defaultdict
from typing import Hashable

from minesweeper.boards.core import (
    Board3D,
    Cell,
    Vec3,
    _cross,
    _dot,
    _normalize,
    _tangent_order,
)
from minesweeper.boards.solids import (
    _convex_board3d,
    _geodesic,
    _icosahedron,
    _tetrahedron,
    _wythoff_point,
)

# -- base solids --------------------------------------------------------------
#
# One base per symmetry group. Which of a dual pair is used does not matter --
# the flags are the same set either way, and ``kis`` and ``kisdual`` are what
# tell a group's two "kis" solids apart.


def _cube() -> tuple[list[Vec3], list[tuple[int, ...]]]:
    """A cube: the eight sign triples, six square faces wound consistently."""
    vertices: list[Vec3] = [
        (float(x), float(y), float(z))
        for x in (-1, 1)
        for y in (-1, 1)
        for z in (-1, 1)
    ]
    faces: list[tuple[int, ...]] = []
    for axis in range(3):
        for sign in (-1.0, 1.0):
            ring = [i for i, v in enumerate(vertices) if v[axis] == sign]
            centre = tuple(sum(vertices[i][k] for i in ring) / len(ring) for k in range(3))
            faces.append(tuple(_tangent_order(centre, [(i, vertices[i]) for i in ring])))
    return vertices, faces


_BASES = {"tetra": _tetrahedron, "cube": _cube, "icosa": _icosahedron}


class _Base:
    """A Platonic solid plus the incidence tables the constructions read.

    Everything a Catalan face needs is an exact incidence of this solid -- a
    vertex index, an ordered edge pair, a face index -- which is what keeps the
    Catalan vertex ids exact.
    """

    def __init__(self, kind: str) -> None:
        vertices, faces = _BASES[kind]()
        self.kind = kind
        self.vertices = [_normalize(v) for v in vertices]
        self.faces = [tuple(f) for f in faces]
        self.face_dirs = [
            _normalize(tuple(sum(self.vertices[i][k] for i in face) / len(face)
                             for k in range(3)))
            for face in self.faces
        ]
        self.vertex_faces: dict[int, list[int]] = defaultdict(list)
        for fi, face in enumerate(self.faces):
            for v in face:
                self.vertex_faces[v].append(fi)
        # a vertex pair is an edge exactly when it lies on two common faces
        edges = set()
        for i in range(len(self.vertices)):
            for j in range(i + 1, len(self.vertices)):
                if len(set(self.vertex_faces[i]) & set(self.vertex_faces[j])) == 2:
                    edges.add((i, j))
        self.edges = sorted(edges)
        self.edge_dirs = {
            e: _normalize(tuple((self.vertices[e[0]][k] + self.vertices[e[1]][k]) / 2
                                for k in range(3)))
            for e in self.edges
        }
        self.edge_faces = {
            e: tuple(sorted(set(self.vertex_faces[e[0]]) & set(self.vertex_faces[e[1]])))
            for e in self.edges
        }
        self.face_edges: dict[int, list[tuple[int, int]]] = defaultdict(list)
        for e in self.edges:
            for fi in self.edge_faces[e]:
                self.face_edges[fi].append(e)

    @property
    def flag(self) -> tuple[Vec3, Vec3, Vec3]:
        """The representative flag's three axis directions. Face 0, its corner
        0, and the edge from that corner to the next -- the same flag
        `_rotation_to` measures every other one against, so the chiral
        construction and the radii agree on which triangle they are in."""
        face = self.faces[0]
        a, b = face[0], face[1]
        edge = self.edge_dirs[(min(a, b), max(a, b))]
        return self.vertices[a], edge, self.face_dirs[0]

    def vertex_degree(self) -> int:
        return len(self.vertex_faces[0])

    def face_sides(self) -> int:
        return len(self.faces[0])


# -- the chiral generating point ----------------------------------------------
#
# The five non-chiral operations read their point off `solids._wythoff_point`;
# a snub has no mirror to be pinned by and needs its own solve.


def _rotate(axis: Vec3, angle: float, p: Vec3) -> Vec3:
    """Rodrigues' rotation of ``p`` about a unit ``axis``."""
    k = _normalize(axis)
    c, s = math.cos(angle), math.sin(angle)
    kp = _dot(k, p)
    kx = _cross(k, p)
    return tuple(p[i] * c + kx[i] * s + k[i] * kp * (1 - c) for i in range(3))


def _snub_point(v_dir: Vec3, e_dir: Vec3, f_dir: Vec3, q: int, p: int) -> Vec3:
    """The generating point of a snub polyhedron.

    A snub is generated by the *rotation* subgroup alone -- it uses no mirror --
    so unlike the five non-chiral operations its point is not pinned by lying
    on mirrors. It is the interior point whose three edges come out equal::

        |w - R_v w| = |w - R_e w| = |w - R_f w|

    where R_v, R_e and R_f turn by 2*pi/q, pi and 2*pi/p about the vertex, edge
    and face axes. Two equations in the two free coordinates of a direction,
    solved by Newton with a numeric Jacobian; it lands on machine precision in
    a handful of steps, and for the cube that is exactly the snub cube's
    tribonacci coordinates.
    """
    v_dir, e_dir, f_dir = _normalize(v_dir), _normalize(e_dir), _normalize(f_dir)

    def point(a: float, b: float) -> Vec3:
        c = 1 - a - b
        return _normalize(tuple(a * v_dir[i] + b * e_dir[i] + c * f_dir[i]
                                for i in range(3)))

    def gap(w: Vec3, axis: Vec3, angle: float) -> float:
        r = _rotate(axis, angle, w)
        return sum((x - y) ** 2 for x, y in zip(w, r))

    def residual(a: float, b: float) -> tuple[float, float]:
        w = point(a, b)
        across = gap(w, e_dir, math.pi)
        return (gap(w, v_dir, 2 * math.pi / q) - across,
                gap(w, f_dir, 2 * math.pi / p) - across)

    a, b = 0.34, 0.33
    for _ in range(100):
        r = residual(a, b)
        h = 1e-7
        ja = [(x - y) / h for x, y in zip(residual(a + h, b), r)]
        jb = [(x - y) / h for x, y in zip(residual(a, b + h), r)]
        det = ja[0] * jb[1] - ja[1] * jb[0]
        if abs(det) < 1e-18:
            break
        da = (-r[0] * jb[1] + r[1] * jb[0]) / det
        db = (-r[1] * ja[0] + r[0] * ja[1]) / det
        a, b = a + da, b + db
        if abs(da) + abs(db) < 1e-15:
            break
    return point(a, b)


# -- the six Conway operations ------------------------------------------------
#
# ``zero``/``equal`` are the Wythoff constraints placing the Archimedean vertex;
# ``pattern`` names the rule grouping the base's flags into Catalan faces.

_OPS: dict[str, dict] = {
    # w = e, the rectification: its dual is the rhombic solid
    "join": dict(zero=("v", "f"), equal=()),
    # on mirror n_v: truncating the *dual*, so the pyramids sit on the base
    "kis": dict(zero=("v",), equal=("e", "f")),
    # on mirror n_f: truncating the base, so the pyramids sit on its dual
    "kisdual": dict(zero=("f",), equal=("v", "e")),
    # on mirror n_e, the cantellation: its dual is the kite solid
    "ortho": dict(zero=("e",), equal=("v", "f")),
    # equidistant from all three, the omnitruncation: dual to the scalene solid
    "meta": dict(zero=(), equal=("v", "e", "f")),
    # no mirror at all -- chiral, see `_snub_point`
    "gyro": dict(zero=None, equal=None),
}


def _catalan_faces(base: _Base, op: str) -> tuple[dict[Cell, list], dict[Hashable, Vec3]]:
    """One Catalan solid as (faces, vertex positions), before subdivision.

    Vertex keys are the base's own exact incidences -- ``("v", i)`` a base
    vertex, ``("e", u, v)`` a base edge (``u < v``), ``("f", i)`` a base face,
    ``("g", ...)`` a snub triangle -- so two faces share a vertex id exactly
    when they touch.
    """
    if op == "gyro":
        return _gyro_faces(base)
    v_dir, e_dir, f_dir = base.flag
    spec = _OPS[op]
    w = _wythoff_point(v_dir, e_dir, f_dir, spec["zero"], spec["equal"])
    radius = {"v": 1 / _dot(w, v_dir), "e": 1 / _dot(w, e_dir), "f": 1 / _dot(w, f_dir)}
    positions: dict[Hashable, Vec3] = {}

    def corner(kind: str, key) -> Hashable:
        if kind == "v":
            direction, vertex_key = base.vertices[key], ("v", key)
        elif kind == "e":
            direction, vertex_key = base.edge_dirs[key], ("e", key[0], key[1])
        else:
            direction, vertex_key = base.face_dirs[key], ("f", key)
        positions[vertex_key] = tuple(c * radius[kind] for c in direction)
        return vertex_key

    faces: dict[Cell, list] = {}
    if op == "join":
        # one rhombus per base edge: the two vertices it joins, and the two
        # face centres it separates
        for e in base.edges:
            f1, f2 = base.edge_faces[e]
            faces[("r", e)] = [corner("v", e[0]), corner("f", f1),
                               corner("v", e[1]), corner("f", f2)]
    elif op == "kis":
        # a pyramid raised on every base face: one triangle per (face, edge)
        for fi in range(len(base.faces)):
            for e in base.face_edges[fi]:
                faces[("t", fi, e)] = [corner("v", e[0]), corner("v", e[1]),
                                       corner("f", fi)]
    elif op == "kisdual":
        # the same pyramids raised on the *dual's* faces: the two face centres
        # take the vertices' place and the vertex takes the apex's
        for v in range(len(base.vertices)):
            for e in base.edges:
                if v in e:
                    f1, f2 = base.edge_faces[e]
                    faces[("t", v, e)] = [corner("f", f1), corner("f", f2),
                                          corner("v", v)]
    elif op == "ortho":
        # one kite per (face, corner): the corner, the face centre, and the
        # midpoints of the face's two edges meeting there
        for fi, face in enumerate(base.faces):
            for v in face:
                e1, e2 = [e for e in base.face_edges[fi] if v in e]
                faces[("k", fi, v)] = [corner("v", v), corner("e", e1),
                                       corner("f", fi), corner("e", e2)]
    elif op == "meta":
        # one scalene triangle per flag -- the barycentric subdivision
        for fi in range(len(base.faces)):
            for e in base.face_edges[fi]:
                for v in e:
                    faces[("t", fi, e, v)] = [corner("v", v), corner("e", e),
                                              corner("f", fi)]
    else:
        raise ValueError(f"unknown Catalan operation {op!r}")
    return faces, positions


# -- the chiral pair ----------------------------------------------------------


def _frame(f_dir: Vec3, v_dir: Vec3) -> tuple[Vec3, Vec3, Vec3]:
    """An orthonormal frame built from a flag's face and vertex axes."""
    a = _normalize(f_dir)
    u = tuple(c - _dot(v_dir, a) * ac for c, ac in zip(v_dir, a))
    b = _normalize(u)
    return a, b, _cross(a, b)


def _rotation_to(base: _Base, fi: int, ci: int) -> tuple[Vec3, Vec3, Vec3]:
    """The rotation taking the representative flag to flag ``(fi, ci)``, as a
    3x3 matrix in rows. Both flags carry an orthonormal frame built the same
    way from their face and vertex axes, so the rotation is their product --
    and since a rotation is determined by where it sends a flag, the |G| flags
    enumerate the rotation subgroup exactly once each."""
    ref = _frame(base.face_dirs[0], base.vertices[base.faces[0][0]])
    tgt = _frame(base.face_dirs[fi], base.vertices[base.faces[fi][ci]])
    # rows of tgt^T . ref, i.e. sum over the frame axes of tgt_k (x) ref_k
    return tuple(
        tuple(sum(tgt[k][row] * ref[k][col] for k in range(3)) for col in range(3))
        for row in range(3)
    )


def _apply(matrix: tuple[Vec3, Vec3, Vec3], p: Vec3) -> Vec3:
    return tuple(_dot(row, p) for row in matrix)


def _gyro_faces(base: _Base) -> tuple[dict[Cell, list], dict[Hashable, Vec3]]:
    """The two chiral Catalan solids, dual to the snubs.

    A snub's faces are the p-gons at the base's face axes, the q-gons at its
    vertex axes and, between them, a **snub triangle** for each of the two ways
    round every base edge -- and those triangles sit on no symmetry axis at
    all, which is why this operation needs a third vertex orbit that the other
    five do not.

    The snub's vertices are the orbit of the generating point under the
    rotation subgroup, and a rotation is fixed by where it sends a flag, so
    they are indexed by the base's (face, corner) pairs. Its triangles are then
    read off the edge graph -- every triple of mutually adjacent snub vertices
    that is not already one of the axis polygons -- and the whole thing is
    polar-dualised: one Catalan pentagon per snub vertex, its five corners the
    duals of the five faces meeting there.
    """
    v_dir, e_dir, f_dir = base.flag
    w = _snub_point(v_dir, e_dir, f_dir, base.vertex_degree(), base.face_sides())
    snub: dict[tuple[int, int], Vec3] = {
        (fi, ci): _apply(_rotation_to(base, fi, ci), w)
        for fi, face in enumerate(base.faces)
        for ci in range(len(face))
    }
    flags = sorted(snub)
    edge_length = min(
        math.dist(snub[a], snub[b]) for i, a in enumerate(flags) for b in flags[i + 1:]
    )

    # the polygons that sit on an axis: one per base face, one per base vertex
    axis_faces: list[tuple[Hashable, list[tuple[int, int]]]] = []
    for fi, face in enumerate(base.faces):
        axis_faces.append((("f", fi), [(fi, ci) for ci in range(len(face))]))
    for v in range(len(base.vertices)):
        axis_faces.append(
            (("v", v), [(fi, base.faces[fi].index(v)) for fi in base.vertex_faces[v]])
        )
    on_axis = {frozenset(ring) for _, ring in axis_faces}

    # ...and the snub triangles between them: mutually adjacent triples that no
    # axis polygon already claims (for the cube the vertex figure is a triangle
    # too, for the icosahedron the face is, so the filter earns its keep)
    def adjacent(a, b) -> bool:
        return abs(math.dist(snub[a], snub[b]) - edge_length) < 1e-9

    snub_faces = list(axis_faces)
    for i, a in enumerate(flags):
        for j in range(i + 1, len(flags)):
            b = flags[j]
            if not adjacent(a, b):
                continue
            for c in flags[j + 1:]:
                if adjacent(a, c) and adjacent(b, c):
                    ring = [a, b, c]
                    if frozenset(ring) not in on_axis:
                        snub_faces.append((("g",) + tuple(ring), ring))
    expected = len(base.faces) + len(base.vertices) + len(flags)
    if len(snub_faces) != expected:
        raise AssertionError(f"snub has {len(snub_faces)} faces, expected {expected}")

    # polar dual: one Catalan vertex per snub face, one Catalan face per snub
    # vertex
    positions: dict[Hashable, Vec3] = {}
    around: dict[tuple[int, int], list[Hashable]] = defaultdict(list)
    for key, ring in snub_faces:
        points = [snub[flag] for flag in ring]
        centre = tuple(sum(p[a] for p in points) / len(points) for a in range(3))
        normal = _normalize(centre)
        positions[key] = tuple(c / _dot(points[0], normal) for c in normal)
        for flag in ring:
            around[flag].append(key)

    faces: dict[Cell, list] = {}
    for flag, ring in around.items():
        faces[("p",) + flag] = _tangent_order(
            snub[flag], [(key, positions[key]) for key in ring]
        )
    return faces, positions


# -- subdivision --------------------------------------------------------------


def _edge_key(a: Hashable, b: Hashable, step: int, total: int) -> Hashable:
    """The id of the point ``step / total`` of the way from ``a`` to ``b``,
    canonicalised so the two faces sharing that edge name it identically."""
    if step == 0:
        return a
    if step == total:
        return b
    lo, hi = (a, b) if repr(a) < repr(b) else (b, a)
    if (lo, hi) != (a, b):
        step = total - step
    g = math.gcd(step, total)
    return ("s", lo, hi, step // g, total // g)


def _lerp(a: Vec3, b: Vec3, step: int, total: int) -> Vec3:
    t = step / total
    return tuple(x + (y - x) * t for x, y in zip(a, b))


def _quad_grid(
    faces: dict[Cell, list], positions: dict[Hashable, Vec3], frequency: int
) -> tuple[dict[Cell, list], dict[Hashable, Vec3]]:
    """Cut every quadrilateral face into ``frequency**2`` smaller ones.

    Interior points are bilinear in the face's four corners; boundary points
    are computed as a plain interpolation along the shared edge, in the
    direction `_edge_key` canonicalises, so the two faces meeting there produce
    the same id *and* the same coordinates.
    """
    if frequency == 1:
        return faces, positions
    out_cells: dict[Cell, list] = {}
    out_pos: dict[Hashable, Vec3] = {}
    n = frequency
    for cell, ring in faces.items():
        if len(ring) != 4:
            raise ValueError("the quad grid needs quadrilateral faces")
        k0, k1, k2, k3 = ring
        p0, p1, p2, p3 = (positions[k] for k in ring)

        def at(i: int, j: int):
            if j == 0:
                key = _edge_key(k0, k1, i, n)
                point = _lerp(*((p0, p1, i, n) if repr(k0) < repr(k1) else (p1, p0, n - i, n)))
            elif j == n:
                key = _edge_key(k3, k2, i, n)
                point = _lerp(*((p3, p2, i, n) if repr(k3) < repr(k2) else (p2, p3, n - i, n)))
            elif i == 0:
                key = _edge_key(k0, k3, j, n)
                point = _lerp(*((p0, p3, j, n) if repr(k0) < repr(k3) else (p3, p0, n - j, n)))
            elif i == n:
                key = _edge_key(k1, k2, j, n)
                point = _lerp(*((p1, p2, j, n) if repr(k1) < repr(k2) else (p2, p1, n - j, n)))
            else:
                key = ("q", cell, i, j)
                s, t = i / n, j / n
                point = tuple(
                    (1 - s) * (1 - t) * p0[a] + s * (1 - t) * p1[a]
                    + s * t * p2[a] + (1 - s) * t * p3[a]
                    for a in range(3)
                )
            out_pos[key] = point
            return key

        for i in range(n):
            for j in range(n):
                out_cells[(cell, i, j)] = [
                    at(i, j), at(i + 1, j), at(i + 1, j + 1), at(i, j + 1)
                ]
    return out_cells, out_pos


def _fan_pentagons(
    faces: dict[Cell, list], positions: dict[Hashable, Vec3]
) -> tuple[dict[Cell, list], dict[Hashable, Vec3]]:
    """Cut every pentagon into five quadrilaterals through its own planar
    centre and its edge midpoints. The centre is the plain average of the
    corners, *not* pushed back out to their sphere, which is what keeps the fan
    flat rather than tenting outward -- the same rule `solids._dodecahedron`
    fans a dodecahedron's pentagons by."""
    out_cells: dict[Cell, list] = {}
    out_pos = dict(positions)
    for cell, ring in faces.items():
        points = [positions[k] for k in ring]
        centre_key = ("c", cell)
        out_pos[centre_key] = tuple(
            sum(p[a] for p in points) / len(points) for a in range(3)
        )
        mids = []
        for i, key in enumerate(ring):
            nxt = ring[(i + 1) % len(ring)]
            mids.append(_edge_key(key, nxt, 1, 2))
            out_pos[mids[-1]] = _lerp(positions[key], positions[nxt], 1, 2)
        for i, key in enumerate(ring):
            out_cells[(cell, i)] = [key, mids[i], centre_key, mids[i - 1]]
    return out_cells, out_pos


def _subdivide(
    faces: dict[Cell, list], positions: dict[Hashable, Vec3], frequency: int
) -> tuple[dict[Cell, list], dict[Hashable, Vec3]]:
    """Subdivide a Catalan solid's faces, by whatever their side count allows."""
    sides = {len(ring) for ring in faces.values()}
    if sides == {3}:
        # reuse the Platonic boards' own flat subdivision: gcd-normalised
        # barycentric ids over one global vertex list, so a point on a shared
        # edge comes out with the same id from either face
        order = sorted(positions, key=repr)
        index = {key: i for i, key in enumerate(order)}
        verts = [positions[key] for key in order]
        tris = [tuple(index[k] for k in ring) for ring in faces.values()]
        grid, triangles = _geodesic(frequency, verts, tris, project=False)
        return {("t", n): list(t) for n, t in enumerate(triangles)}, grid
    if sides == {4}:
        return _quad_grid(faces, positions, frequency)
    if sides == {5}:
        if frequency == 0:
            return faces, positions
        return _quad_grid(*_fan_pentagons(faces, positions), frequency)
    raise ValueError(f"cannot subdivide faces with {sides} sides")


def _catalan_board(mode: str, base: str, op: str, mine_count: int, frequency: int) -> Board3D:
    cells, positions = _subdivide(*_catalan_faces(_Base(base), op), frequency)
    radius = max(math.hypot(*p) for p in positions.values())
    return _convex_board3d(mode, cells, positions, mine_count, radius=radius)


# -- the thirteen boards ------------------------------------------------------
#
# Listed in face-count order, which is the order the menu shows them in.


def triakis_tetrahedron_board(mine_count: int, frequency: int = 3) -> Board3D:
    """A triakis tetrahedron, dual of the truncated tetrahedron: a regular
    tetrahedron with a pyramid raised on each of its four faces, so 12 isoceles
    triangles, each cut into ``frequency**2`` cells."""
    return _catalan_board("triakistetra", "tetra", "kis", mine_count, frequency)


def rhombic_dodecahedron_board(mine_count: int, frequency: int = 3) -> Board3D:
    """A rhombic dodecahedron, dual of the cuboctahedron: 12 rhombi, one per
    cube edge, each cut into ``frequency**2`` smaller rhombi."""
    return _catalan_board("rhombicdodeca", "cube", "join", mine_count, frequency)


def triakis_octahedron_board(mine_count: int, frequency: int = 2) -> Board3D:
    """A triakis octahedron, dual of the truncated cube: an octahedron with a
    pyramid on each face, so 24 isoceles triangles."""
    return _catalan_board("triakisocta", "cube", "kisdual", mine_count, frequency)


def tetrakis_hexahedron_board(mine_count: int, frequency: int = 2) -> Board3D:
    """A tetrakis hexahedron, dual of the truncated octahedron: a cube with a
    pyramid on each face, so 24 isoceles triangles."""
    return _catalan_board("tetrakishexa", "cube", "kis", mine_count, frequency)


def deltoidal_icositetrahedron_board(mine_count: int, frequency: int = 2) -> Board3D:
    """A deltoidal icositetrahedron, dual of the rhombicuboctahedron: 24
    kites, one per (cube face, corner) pair."""
    return _catalan_board("deltoidalicositetra", "cube", "ortho", mine_count, frequency)


def pentagonal_icositetrahedron_board(mine_count: int, frequency: int = 1) -> Board3D:
    """A pentagonal icositetrahedron, dual of the snub cube: 24 irregular
    pentagons. Chiral -- it has no mirror symmetry, and neither does its dual.
    ``frequency=0`` keeps the bare pentagons; above that each is fanned into
    five quadrilaterals and those are cut ``frequency**2`` ways."""
    return _catalan_board("pentagonalicositetra", "cube", "gyro", mine_count, frequency)


def disdyakis_dodecahedron_board(mine_count: int, frequency: int = 2) -> Board3D:
    """A disdyakis dodecahedron, dual of the truncated cuboctahedron: the
    cube's barycentric subdivision, 48 scalene triangles -- one per flag, which
    is the full order of the octahedral symmetry group."""
    return _catalan_board("disdyakisdodeca", "cube", "meta", mine_count, frequency)


def rhombic_triacontahedron_board(mine_count: int, frequency: int = 2) -> Board3D:
    """A rhombic triacontahedron, dual of the icosidodecahedron: 30 golden
    rhombi, one per icosahedron edge."""
    return _catalan_board("rhombictriaconta", "icosa", "join", mine_count, frequency)


def triakis_icosahedron_board(mine_count: int, frequency: int = 2) -> Board3D:
    """A triakis icosahedron, dual of the truncated dodecahedron: an
    icosahedron with a pyramid on each face, so 60 isoceles triangles."""
    return _catalan_board("triakisicosa", "icosa", "kis", mine_count, frequency)


def pentakis_dodecahedron_board(mine_count: int, frequency: int = 2) -> Board3D:
    """A pentakis dodecahedron, dual of the truncated icosahedron (the
    football): a dodecahedron with a pyramid on each pentagon, so 60 isoceles
    triangles."""
    return _catalan_board("pentakisdodeca", "icosa", "kisdual", mine_count, frequency)


def deltoidal_hexecontahedron_board(mine_count: int, frequency: int = 2) -> Board3D:
    """A deltoidal hexecontahedron, dual of the rhombicosidodecahedron: 60
    kites, one per (icosahedron face, corner) pair."""
    return _catalan_board("deltoidalhexeconta", "icosa", "ortho", mine_count, frequency)


def sphere_board(mine_count: int, frequency: int = 0) -> Board3D:
    """A pentagonal hexecontahedron, dual of the snub dodecahedron: 60
    irregular pentagons, every one with exactly 7 neighbours. Chiral, like the
    pentagonal icositetrahedron. ``frequency=0`` keeps the bare pentagons,
    which is the 60-cell board this mode has always shipped as.

    Keeps the mode name ``sphere`` from when it was drawn projected onto the
    unit sphere: it is the board's address in a share link and in the best-times
    table, so renaming it would lose both."""
    return _catalan_board("sphere", "icosa", "gyro", mine_count, frequency)


def disdyakis_triacontahedron_board(mine_count: int, frequency: int = 2) -> Board3D:
    """A disdyakis triacontahedron, dual of the truncated icosidodecahedron:
    the icosahedron's barycentric subdivision, 120 scalene triangles -- one per
    flag, the full order of the icosahedral symmetry group, and the most faces
    any Catalan solid has."""
    return _catalan_board("disdyakistriaconta", "icosa", "meta", mine_count, frequency)
