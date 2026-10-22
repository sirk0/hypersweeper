"""The hyperbolic boards: regular {p,q} tilings of the hyperbolic plane, drawn
in the Poincaré disc.

A {p,q} tiling puts q regular p-gons round every vertex, and when
(p - 2)(q - 2) > 4 the angles do not close up in the plane: the tiling lives in
the hyperbolic plane, where a circle's circumference grows exponentially with
its radius. Seven ship -- {7,3} and {8,3}, {5,4} and {6,4}, {4,5}, {5,5} and
{4,6} -- and each one gives an interior cell p + p(q - 3) = p(q - 2)
neighbours under the shared-vertex rule (7, 8, 10, 12, 12, 15 and 16).

**The tiling is built combinatorially, ring by ring, with integer vertex ids.**
Ring 0 is the central p-gon, vertices 0 .. p-1. Each new ring is every face
that touches the boundary of the rings so far, and it is laid down by walking
that boundary once, counterclockwise. A boundary vertex ``v`` already has
``faces(v)`` of its q faces, so it needs ``d = q - faces(v)`` more outside it:

* every boundary *edge* has exactly one new face outside it;
* at a vertex with ``d == 1`` the faces outside its two boundary edges are the
  same face, which therefore runs along several boundary edges in a row;
* at a vertex with ``d >= 2`` the two are different faces, separated by
  ``d - 1`` new *spoke* edges running outward from ``v`` and the ``d - 2``
  faces that touch the boundary at ``v`` alone.

So a vertex with ``d >= 2`` is an *anchor*, and the new ring is: at each
anchor, its spokes and the faces between them; between consecutive anchors,
one face along the boundary run joining them. Every vertex a new face needs
that is not already on the boundary is a fresh integer, numbered in the order
the walk meets it. No coordinate is ever read back into an id, which is the
rule the whole game rests on: two cells are neighbours exactly when they share
a vertex id, and no two nearby points are ever rounded into one.

**Positions come afterwards**, and only ever *from* the ids. The central
polygon is placed by hand; every other face has an edge whose two ends are
already placed, and since all faces are congruent there is exactly one
orientation-preserving isometry of the disc (a Möbius map) taking the central
polygon's matching edge onto it. That map places the face's other corners. A
vertex keeps the position it was first given; `TestHyperbolic` re-derives
every vertex from every face that has it and checks they agree.

**Edges are drawn as the disc's geodesics**, circular arcs meeting the rim at
right angles, which is what makes the picture read as the Poincaré disc (and as
Escher's *Circle Limit*) rather than a fan of distorted polygons. Each edge
carries ``arc - 1`` points along its arc, with ids derived from the edge's two
end ids -- so the two faces either side of an edge share them exactly -- and
the board's ``corner_mask`` says which of a cell's polygon points are real
corners, which is what shape colouring and the glyph centring measure.

**The trim is by hyperbolic distance, a finer ring count.** Whole rings grow
the board by a factor of about 2.6 ({7,3}) or 4 ({5,4}, {4,5}) a ring, which
misses most of the classic size bands; so ``shells`` keeps the faces whose
centres lie at the ``shells`` smallest distances from the centre of the disc.
Faces at the same distance are one orbit of the board's own symmetry group
(the dihedral group of the central p-gon) and are kept or dropped together, so
every trim keeps the full p-fold rotation and the p mirrors. The distance is a
float, but it only *orders* faces -- it never forms an id -- and equal
distances are grouped with a tolerance far below the gap between distinct
ones, which `TestHyperbolic` measures. The trim is never by area or by
Euclidean radius in the disc: the rim's cells are tiny there by nature, and a
Euclidean cut would take a ragged sliver of them.

**A trim then drops its twins.** Where q is large a rim vertex can be left
with a fan of two or more outer faces that touch the board at that vertex
alone, and every face of such a fan sees exactly the faces round the vertex:
the same closed neighbourhood, so no number can ever tell them apart and a
mine among them is a coin flip. On {5,5} and {4,6} nearly every trim has one.
So every cell that shares its closed neighbourhood with another is dropped --
all of them, never all but one, which is what keeps the trim's symmetry, the
twin relation being one the symmetry preserves. One pass has always left none
(the loop is there in case one ever does not), and a trim that had no twins
is untouched, so the boards that shipped before the drop are the same boards.

The board is round by nature -- a deliberate exception to the square-window
convention, as the fractals and Klaassen's spiral already are.

**The uniform tilings come from the same walk.** `hyperbolic_uniform_board`
builds 6.6.7 (the hyperbolic soccer ball), 3.7.3.7, 3.4.7.4 and 4.6.14 by
Wythoff's construction on the {7,3} tiling above -- see the section of that
name below -- and trims and draws them exactly as the {p,q} boards are.
"""

from __future__ import annotations

import cmath
import math

from minesweeper.boards.core import Board, Cell, _shared_vertex_adjacency

#: Points per edge (``arc - 1`` of them between its two corners) for drawing
#: the geodesic arcs. Three segments keep the central heptagon's bow within a
#: fraction of a pixel of the true circle at the sizes the game draws it.
ARC_SEGMENTS = 3

#: Two face centres are at the *same* distance from the disc's centre when
#: their distances differ by less than this. Distinct shells on the
#: shipped tilings are more than 1e-5 apart (``TestHyperbolic`` measures it);
#: float error is ~1e-12.
_SHELL_TOL = 1e-7


def _check_hyperbolic(p: int, q: int) -> None:
    if p < 3 or q < 3 or (p - 2) * (q - 2) <= 4:
        raise ValueError(f"{{{p},{q}}} is not a hyperbolic tiling")


def hyperbolic_faces(p: int, q: int, rings: int) -> tuple[list[tuple[int, ...]], list[int]]:
    """The {p,q} tiling's faces out to ``rings`` rings round the central one,
    as counterclockwise tuples of integer vertex ids, and each face's ring.

    Pure combinatorics -- see the module docstring for the walk. Raises
    ValueError for a tiling whose faces are too small to span a boundary run
    (the walk below needs ``p >= 4``, which every shipped tiling meets).
    """
    _check_hyperbolic(p, q)
    faces: list[tuple[int, ...]] = [tuple(range(p))]
    ring_of = [0]
    count = dict.fromkeys(range(p), 1)  # faces seen at each vertex
    boundary = list(range(p))
    next_id = p

    def fresh() -> int:
        nonlocal next_id
        next_id += 1
        return next_id - 1

    for ring in range(1, rings + 1):
        need = [q - count[v] for v in boundary]
        if min(need) < 1:
            raise ValueError("boundary vertex already closed")
        # Start the walk at an anchor so the runs between anchors never wrap.
        start = next((i for i, d in enumerate(need) if d >= 2), None)
        if start is None:
            raise ValueError("no anchor on the boundary")
        boundary = boundary[start:] + boundary[:start]
        need = need[start:] + need[:start]
        n = len(boundary)
        anchors = [i for i in range(n) if need[i] >= 2]
        spokes = {i: [fresh() for _ in range(need[i] - 1)] for i in anchors}
        new_boundary: list[int] = []
        first = len(faces)
        for a, i in enumerate(anchors):
            v = boundary[i]
            tips = spokes[i]
            # the faces touching the boundary at v alone, between its spokes
            for t in range(len(tips) - 1):
                inner = [fresh() for _ in range(p - 3)]
                faces.append((v, tips[t], *inner, tips[t + 1]))
                ring_of.append(ring)
                new_boundary += [tips[t], *inner]
            # the face along the run of boundary from this anchor to the next
            j = anchors[(a + 1) % len(anchors)]
            run = [boundary[k % n] for k in range(i, (j if j > i else j + n) + 1)]
            gap = p - len(run) - 2
            if gap < 0:
                raise ValueError(f"{{{p},{q}}}: a face cannot span its boundary run")
            inner = [fresh() for _ in range(gap)]
            faces.append((*reversed(run), tips[-1], *inner, spokes[j][0]))
            ring_of.append(ring)
            new_boundary += [tips[-1], *inner]
        # every old boundary vertex is now interior; count the new faces
        for face in faces[first:]:
            for v in face:
                count[v] = count.get(v, 0) + 1
        boundary = new_boundary
    return faces, ring_of


# -- the Poincaré disc ---------------------------------------------------------


def _central_polygon(p: int, q: int) -> list[complex]:
    """The central p-gon's corners: circumradius R with cosh R =
    cot(pi/p) cot(pi/q), which in the disc is Euclidean radius tanh(R/2).
    One edge is horizontal, so the polygon (and every trim of the tiling) is
    mirror-symmetric about the vertical axis. It is the edge at the top in
    these coordinates, which is the bottom of the screen: pixel y runs down,
    and like every flat builder this one hands its y over unflipped."""
    big_r = math.acosh(1 / (math.tan(math.pi / p) * math.tan(math.pi / q)))
    r = math.tanh(big_r / 2)
    return [cmath.rect(r, math.pi / 2 + math.pi / p + 2 * math.pi * k / p)
            for k in range(p)]


def _to_origin(a: complex, z: complex) -> complex:
    """The disc isometry z -> (z - a) / (1 - conj(a) z), taking a to 0."""
    return (z - a) / (1 - a.conjugate() * z)


def _from_origin(a: complex, z: complex) -> complex:
    """Its inverse, taking 0 to a."""
    return (z + a) / (1 + a.conjugate() * z)


def _isometry(a: complex, b: complex, a2: complex, b2: complex):
    """The orientation-preserving disc isometry taking a -> a2 and b -> b2
    (the two pairs the same hyperbolic distance apart)."""
    w = _to_origin(a, b)
    w2 = _to_origin(a2, b2)
    turn = (w2 / abs(w2)) / (w / abs(w))
    return lambda z: _from_origin(a2, turn * _to_origin(a, z))


def hyperbolic_positions(p: int, q: int, faces: list[tuple[int, ...]]) -> dict[int, complex]:
    """Every vertex's point in the Poincaré disc, placed face by face."""
    centre = _central_polygon(p, q)
    pos: dict[int, complex] = dict(zip(faces[0], centre))
    pending = list(range(1, len(faces)))
    while pending:
        deferred = []
        for f in pending:
            face = faces[f]
            k = next((k for k in range(p)
                      if face[k] in pos and face[(k + 1) % p] in pos), None)
            if k is None:
                deferred.append(f)
                continue
            m = _isometry(centre[k], centre[(k + 1) % p],
                          pos[face[k]], pos[face[(k + 1) % p]])
            for i, v in enumerate(face):
                if v not in pos:
                    pos[v] = m(centre[i])
        if len(deferred) == len(pending):
            raise ValueError("faces cannot be placed")
        pending = deferred
    return pos


def face_centre(p: int, q: int, face: tuple[int, ...], pos: dict[int, complex]) -> complex:
    """Where a face's own centre lies: the image of the disc's centre under the
    isometry that placed it."""
    centre = _central_polygon(p, q)
    m = _isometry(centre[0], centre[1], pos[face[0]], pos[face[1]])
    return m(0j)


def _distance(z: complex) -> float:
    """Hyperbolic distance from the centre of the disc."""
    return 2 * math.atanh(abs(z))


def _arc_points(a: complex, b: complex, segments: int) -> list[complex]:
    """The ``segments - 1`` points evenly spaced (hyperbolically) along the
    geodesic from a to b, in order from a."""
    w = _to_origin(a, b)
    length = math.atanh(abs(w))
    unit = w / abs(w)
    return [_from_origin(a, math.tanh(length * s / segments) * unit)
            for s in range(1, segments)]


def _shells(p: int, q: int, faces, pos) -> list[list[int]]:
    """Face indices grouped by distance from the disc's centre, nearest first."""
    rows = sorted((_distance(face_centre(p, q, face, pos)), f)
                  for f, face in enumerate(faces))
    groups: list[list[int]] = []
    last = -math.inf
    for d, f in rows:
        if d - last > _SHELL_TOL:
            groups.append([])
        groups[-1].append(f)
        last = d
    return groups


def _rings_for(p: int, q: int, shells: int) -> tuple:
    """Grow rings until the nearest face of the newest ring lies beyond the
    ``shells``-th distance, so every face that close has been generated (each
    ring encloses the ones before it). One spare ring settles the last shell."""
    rings = 1
    while True:
        faces, ring_of = hyperbolic_faces(p, q, rings)
        pos = hyperbolic_positions(p, q, faces)
        groups = _shells(p, q, faces, pos)
        outer = min(_distance(face_centre(p, q, face, pos))
                    for face, r in zip(faces, ring_of) if r == rings)
        if len(groups) > shells:
            cut = _distance(face_centre(p, q, faces[groups[shells - 1][0]], pos))
            if outer > cut + 1.0:
                return faces, pos, groups
        rings += 1
        if rings > 12:
            raise ValueError("too many shells")


def _without_twins(faces: list[tuple[int, ...]], kept: list[int]) -> list[int]:
    """``kept`` less every face whose closed neighbourhood (itself and every
    face sharing a vertex with it) is another kept face's too, repeated until
    none is left -- see "A trim then drops its twins" above."""
    while True:
        at: dict[int, set[int]] = {}
        for f in kept:
            for v in faces[f]:
                at.setdefault(v, set()).add(f)
        hood = {f: frozenset().union(*(at[v] for v in faces[f])) for f in kept}
        seen: dict[frozenset, int] = {}
        for h in hood.values():
            seen[h] = seen.get(h, 0) + 1
        twins = {f for f in kept if seen[hood[f]] > 1}
        if not twins:
            return kept
        kept = [f for f in kept if f not in twins]


def _is_disc(cells: dict[Cell, list]) -> bool:
    """Connected, Euler characteristic 1 and a single boundary circle, counted
    on the ids alone."""
    edges: dict[tuple, int] = {}
    vertices = set()
    for ids in cells.values():
        vertices.update(ids)
        for a, b in zip(ids, ids[1:] + ids[:1]):
            key = (a, b) if repr(a) < repr(b) else (b, a)
            edges[key] = edges.get(key, 0) + 1
    if len(vertices) - len(edges) + len(cells) != 1:
        return False
    rim: dict = {}
    for (a, b), n in edges.items():
        if n == 1:
            rim.setdefault(a, []).append(b)
            rim.setdefault(b, []).append(a)
    if any(len(v) != 2 for v in rim.values()):
        return False  # the rim pinches at a vertex
    start = next(iter(rim))
    seen, stack = {start}, [start]
    while stack:
        for nxt in rim[stack.pop()]:
            if nxt not in seen:
                seen.add(nxt)
                stack.append(nxt)
    return len(seen) == len(rim)


def hyperbolic_board(
    p: int,
    q: int,
    shells: int,
    mine_count: int,
    scale: float = 300.0,
    arc: int = ARC_SEGMENTS,
) -> Board:
    """The {p,q} tiling in the Poincaré disc, trimmed to the faces at the
    ``shells`` smallest distances from the central p-gon (shell 1 is that
    p-gon alone), less any rim cells that trim leaves with a twin. ``scale`` is pixels per unit of disc radius; ``arc`` is how
    many straight segments draw each geodesic edge.

    Raises ValueError when the trim is not a disc -- a shell that leaves a cell
    hanging by one corner -- which the size search treats as a window that
    does not build.
    """
    _check_hyperbolic(p, q)
    if shells < 1:
        raise ValueError("shells must be at least 1")
    faces, pos, groups = _rings_for(p, q, shells)
    kept = _without_twins(faces, sorted(f for group in groups[:shells] for f in group))
    return _disc_board(f"hyperbolic{p}{q}", f"{{{p},{q}}}", shells, faces, kept, pos,
                       mine_count, scale, arc)


def _disc_board(mode: str, name: str, shells: int, faces: list[tuple[int, ...]],
                kept: list[int], pos: dict[int, complex], mine_count: int,
                scale: float, arc: int) -> Board:
    """The kept faces as a board in the disc: each edge drawn as its geodesic
    arc, the board centred on the disc's own centre. Shared by the regular
    {p,q} boards and the uniform ones below; ``name`` is what the error says."""
    # Arc points along each edge: ids built from the edge's end ids (the lower
    # first), so both faces of an edge share them, and positions computed once
    # per edge, from its lower end, so both faces see the very same points.
    arc_pos: dict[tuple[int, int, int], complex] = {}
    cells: dict[Cell, list] = {}
    mask: dict[Cell, list[bool]] = {}
    for f in kept:
        face = faces[f]
        ids: list = []
        corner: list[bool] = []
        for a, b in zip(face, face[1:] + face[:1]):
            ids.append(a)
            corner.append(True)
            lo, hi = min(a, b), max(a, b)
            steps = range(1, arc) if a == lo else range(arc - 1, 0, -1)
            if (lo, hi, 1) not in arc_pos:
                for s, z in enumerate(_arc_points(pos[lo], pos[hi], arc), start=1):
                    arc_pos[(lo, hi, s)] = z
            for s in steps:
                ids.append((lo, hi, s))
                corner.append(False)
        cells[f] = ids
        mask[f] = corner
    if not _is_disc(cells):
        raise ValueError(f"{name} trimmed to {shells} shells is not a disc")

    def xy(key) -> tuple[float, float]:
        z = arc_pos[key] if isinstance(key, tuple) else pos[key]
        return (z.real, z.imag)

    # Centred on the disc's own centre rather than shifted to the bounding box,
    # so the central p-gon sits in the middle of the board whatever the trim.
    extent = max(abs(arc_pos[k] if isinstance(k, tuple) else pos[k])
                 for ids in cells.values() for k in ids)
    polygons = {
        cell: [((x + extent) * scale, (y + extent) * scale)
               for x, y in (xy(k) for k in ids)]
        for cell, ids in cells.items()
    }
    size = 2 * extent * scale
    return Board(
        mode,
        polygons,
        _shared_vertex_adjacency(cells),
        mine_count,
        size,
        size,
        corner_mask=mask,
    )


# -- the uniform tilings: Wythoff's construction on {p,q} ----------------------
#
# Every uniform tiling with the {p,q} tiling's symmetry is one point's orbit
# under that symmetry: put a *generating point* in one flag triangle -- the
# triangle cut out of a face by its centre F, one of its corners V and the
# midpoint E of an edge at that corner -- and reflect it everywhere. Where the
# point sits decides the tiling (Conway's names, after Hart):
#
#   ``ambo``   at E                                   r{p,q}   3.7.3.7 on {7,3}
#   ``zip``    on FE, as far from FV as from VE       t{q,p}   6.6.7
#   ``expand`` on FV, as far from FE as from VE       rr{p,q}  3.4.7.4
#   ``bevel``  inside, as far from all three sides    tr{p,q}  4.6.14
#
# ``zip`` is the truncation of the dual {q,p}: on {7,3} the hyperbolic soccer
# ball, HyperRogue's default -- hexagons, with each heptagon ringed by them.
#
# **The ids stay combinatorial.** A flag is (face, corner, edge) of the {p,q}
# the ring walk already builds with integer ids, and each new vertex is named
# by the part of its flag that the generating point's position does not
# collapse: (face, edge) for ``zip``, the edge alone for ``ambo``, (face,
# corner) for ``expand`` and the whole flag for ``bevel`` -- tuples of the
# walk's integers, renumbered in the order the faces meet them. The new tiling
# has a face for every old face (F), every old vertex with all q faces round it
# (V), and every old edge with both faces (E) wherever those orbits are not
# collapsed to fewer than three points, which is exactly the table above.
#
# **So do the positions.** The generating point is found once, in the central
# p-gon's flag triangle, on the hyperboloid (where "as far from" is a linear
# condition), and every face carries it -- turned to the right corner, mirrored
# for the flag on the other side of the corner -- through the same isometry
# that placed that face.

#: The four operations, in the order of the table above.
WYTHOFF_OPS = ("ambo", "zip", "expand", "bevel")


def _vertex_config(p: int, q: int, op: str) -> tuple[int, ...]:
    """The faces round a vertex, smallest first as the notation writes them
    (3.7.3.7, 6.6.7, 3.4.7.4, 4.6.14)."""
    ring = {"ambo": [p, q, p, q], "zip": [2 * q, 2 * q, p],
            "expand": [p, 4, q, 4], "bevel": [4, 2 * q, 2 * p]}[op]
    turns = [ring[i:] + ring[:i] for i in range(len(ring))]
    return tuple(min(turns + [t[::-1] for t in turns]))


def wythoff_mode(p: int, q: int, op: str) -> str:
    """The mode name: ``hyperbolic`` and the vertex configuration's digits."""
    return "hyperbolic" + "".join(str(n) for n in _vertex_config(p, q, op))


def _lift(z: complex) -> tuple[float, float, float]:
    """A disc point on the hyperboloid t**2 - x**2 - y**2 = 1."""
    s = 1 - abs(z) ** 2
    return ((1 + abs(z) ** 2) / s, 2 * z.real / s, 2 * z.imag / s)


def _drop(v: tuple[float, float, float]) -> complex:
    """A timelike vector back to the disc, normalised and on the upper sheet."""
    t, x, y = v
    norm = math.sqrt(t * t - x * x - y * y)
    if t < 0:
        norm = -norm
    return complex(x / norm, y / norm) / (1 + t / norm)


def _mink_cross(a, b) -> tuple[float, float, float]:
    """A vector Minkowski-orthogonal to both a and b."""
    cx = a[1] * b[2] - a[2] * b[1]
    cy = a[2] * b[0] - a[0] * b[2]
    cz = a[0] * b[1] - a[1] * b[0]
    return (-cx, cy, cz)


def _line(a: complex, b: complex, inside: complex) -> tuple[float, float, float]:
    """The geodesic through a and b as its unit normal on the hyperboloid,
    signed so that ``inside`` is on its positive side; the normal's Minkowski
    product with a lifted point is the sinh of the point's distance to it."""
    n = _mink_cross(_lift(a), _lift(b))
    length = math.sqrt(n[1] ** 2 + n[2] ** 2 - n[0] ** 2)
    x = _lift(inside)
    if -n[0] * x[0] + n[1] * x[1] + n[2] * x[2] < 0:
        length = -length
    return (n[0] / length, n[1] / length, n[2] / length)


def _edge_midpoint(p: int, q: int) -> complex:
    """The midpoint of the central p-gon's edge from corner 0 to corner 1: its
    inradius r has cosh r = cos(pi/q) / sin(pi/p)."""
    in_r = math.acosh(math.cos(math.pi / q) / math.sin(math.pi / p))
    return cmath.rect(math.tanh(in_r / 2), math.pi / 2 + 2 * math.pi / p)


def _generating_point(p: int, q: int, op: str) -> complex:
    """The generating point in the central p-gon's flag triangle at corner 0
    and the edge from corner 0 to corner 1."""
    centre = _central_polygon(p, q)
    mid = _edge_midpoint(p, q)
    if op == "ambo":
        return mid
    corner = centre[0]
    inside = (corner + mid) / 3
    fv, fe, ve = (_line(0j, corner, inside), _line(0j, mid, inside),
                  _line(corner, mid, inside))

    def minus(a, b):
        return (a[0] - b[0], a[1] - b[1], a[2] - b[2])

    if op == "zip":
        point = _mink_cross(fe, minus(fv, ve))
    elif op == "expand":
        point = _mink_cross(fv, minus(fe, ve))
    elif op == "bevel":
        point = _mink_cross(minus(fv, fe), minus(fe, ve))
    else:
        raise ValueError(f"unknown Wythoff operation {op!r}")
    return _drop(point)


def wythoff_faces(p: int, q: int, op: str, rings: int):
    """The uniform tiling ``op`` of {p,q}, from the {p,q} tiling out to
    ``rings`` rings: its faces as counterclockwise tuples of integer vertex
    ids, each vertex's position, and each face's centre."""
    if op not in WYTHOFF_OPS:
        raise ValueError(f"unknown Wythoff operation {op!r}")
    base, _ = hyperbolic_faces(p, q, rings)
    bpos = hyperbolic_positions(p, q, base)
    centre = _central_polygon(p, q)
    w0 = _generating_point(p, q, op)
    axis = cmath.exp(2j * (math.pi / 2 + 2 * math.pi / p))
    w1 = axis * w0.conjugate()  # its mirror image across the line F-E
    mid = _edge_midpoint(p, q)
    turn = [cmath.exp(2j * math.pi * k / p) for k in range(p)]

    def key(f: int, i: int, side: int) -> tuple:
        # the flag at face f's corner i, on its edge to the next corner (side
        # 0) or from the previous one (side 1), named by what the op keeps
        face = base[f]
        v = face[i]
        u = face[(i + 1) % p] if side == 0 else face[i - 1]
        edge = (min(u, v), max(u, v))
        if op == "ambo":
            return edge
        if op == "zip":
            return (f, *edge)
        if op == "expand":
            return (f, v)
        return (f, v, u)

    maps = [_isometry(centre[0], centre[1], bpos[face[0]], bpos[face[1]]) for face in base]
    where: dict[tuple, complex] = {}

    def flag(f: int, i: int, side: int) -> tuple:
        k = key(f, i, side)
        if k not in where:
            local = turn[i] * w0 if side == 0 else turn[i - 1] * w1
            where[k] = maps[f](local)
        return k

    def ring_of(keys: list[tuple]) -> list[tuple]:
        out = [k for j, k in enumerate(keys) if k != keys[j - 1]]
        return out if len(set(out)) == len(out) else []

    new_faces: list[list[tuple]] = []
    centres: list[complex] = []
    # F: one per face of {p,q}, its flags in order round it
    for f in range(len(base)):
        loop = ring_of([flag(f, i, s) for i in range(p) for s in (1, 0)])
        if len(loop) >= 3:
            new_faces.append(loop)
            centres.append(maps[f](0j))
    # V: one per vertex with its whole star, the faces round it counterclockwise
    left: dict[tuple[int, int], tuple[int, int]] = {}  # directed edge -> (face, index)
    for f, face in enumerate(base):
        for i in range(p):
            left[(face[i], face[(i + 1) % p])] = (f, i)
    star: dict[int, list[tuple[int, int]]] = {}
    for f, face in enumerate(base):
        for i, v in enumerate(face):
            star.setdefault(v, []).append((f, i))
    for v in sorted(star):
        if len(star[v]) != q:
            continue
        f, i = min(star[v])
        keys: list[tuple] = []
        for _ in range(q):
            keys += [flag(f, i, 0), flag(f, i, 1)]
            f, i = left[(v, base[f][i - 1])]
        loop = ring_of(keys)
        if len(loop) >= 3:
            new_faces.append(loop)
            centres.append(bpos[v])
    # E: one per edge with both its faces, round the edge's midpoint
    for f, face in enumerate(base):
        for i in range(p):
            u, v = face[i], face[(i + 1) % p]
            if u > v or (v, u) not in left:
                continue
            g, j = left[(v, u)]
            loop = ring_of([flag(g, (j + 1) % p, 1), flag(g, j, 0),
                            flag(f, (i + 1) % p, 1), flag(f, i, 0)])
            if len(loop) >= 3:
                new_faces.append(loop)
                centres.append(maps[f](turn[i] * mid))
    ids: dict[tuple, int] = {}
    for loop in new_faces:
        for k in loop:
            ids.setdefault(k, len(ids))
    faces = [tuple(ids[k] for k in loop) for loop in new_faces]
    pos = {ids[k]: where[k] for k in ids}
    return faces, pos, centres


def _shell_groups(centres: list[complex]) -> list[list[int]]:
    """Face indices grouped by their centre's distance from the disc's centre,
    nearest first, within ``_SHELL_TOL``."""
    rows = sorted((_distance(z), f) for f, z in enumerate(centres))
    groups: list[list[int]] = []
    last = -math.inf
    for d, f in rows:
        if d - last > _SHELL_TOL:
            groups.append([])
        groups[-1].append(f)
        last = d
    return groups


def _wythoff_rings_for(p: int, q: int, op: str, shells: int) -> tuple:
    """Grow the {p,q} rings until every new face out to the ``shells``-th
    distance is built: a face is missing only where its {p,q} face, vertex or
    edge is on the outer ring, which lies within a circumradius of that ring's
    face centres -- so those centres a whole unit beyond the cut is enough."""
    rings = 1
    while True:
        faces, pos, centres = wythoff_faces(p, q, op, rings)
        groups = _shell_groups(centres)
        base, ring_of = hyperbolic_faces(p, q, rings)
        bpos = hyperbolic_positions(p, q, base)
        outer = min(_distance(face_centre(p, q, face, bpos))
                    for face, r in zip(base, ring_of) if r == rings)
        if len(groups) > shells:
            cut = _distance(centres[groups[shells - 1][0]])
            if outer > cut + 1.0:
                return faces, pos, groups
        rings += 1
        if rings > 12:
            raise ValueError("too many shells")


def hyperbolic_uniform_board(
    p: int,
    q: int,
    op: str,
    shells: int,
    mine_count: int,
    scale: float = 300.0,
    arc: int = ARC_SEGMENTS,
) -> Board:
    """The uniform tiling ``op`` of {p,q} (one of `WYTHOFF_OPS`) in the
    Poincaré disc, trimmed as `hyperbolic_board` trims: the faces at the
    ``shells`` smallest distances from the central face, less their twins.
    The central face is the one standing on the {p,q} tiling's central p-gon,
    so every trim keeps its dihedral symmetry."""
    _check_hyperbolic(p, q)
    if shells < 1:
        raise ValueError("shells must be at least 1")
    faces, pos, groups = _wythoff_rings_for(p, q, op, shells)
    kept = _without_twins(faces, sorted(f for group in groups[:shells] for f in group))
    config = ".".join(str(n) for n in _vertex_config(p, q, op))
    return _disc_board(wythoff_mode(p, q, op), config, shells, faces, kept, pos,
                       mine_count, scale, arc)
