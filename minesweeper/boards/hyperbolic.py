"""The hyperbolic boards: regular {p,q} tilings of the hyperbolic plane, drawn
in the Poincaré disc.

A {p,q} tiling puts q regular p-gons round every vertex, and when
(p - 2)(q - 2) > 4 the angles do not close up in the plane: the tiling lives in
the hyperbolic plane, where a circle's circumference grows exponentially with
its radius. Three ship -- {7,3} heptagons, {5,4} pentagons and {4,5} squares --
and each one gives an interior cell p + p(q - 3) = p(q - 2) neighbours under
the shared-vertex rule (7, 10 and 12), counts nothing else in the game has.

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

The board is round by nature -- a deliberate exception to the square-window
convention, as the fractals and Klaassen's spiral already are.
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
#: their distances differ by less than this. Distinct shells on the three
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
    (the walk below needs ``p >= 4``, which all three shipped tilings meet).
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
    p-gon alone). ``scale`` is pixels per unit of disc radius; ``arc`` is how
    many straight segments draw each geodesic edge.

    Raises ValueError when the trim is not a disc -- a shell that leaves a cell
    hanging by one corner -- which the size search treats as a window that
    does not build.
    """
    _check_hyperbolic(p, q)
    if shells < 1:
        raise ValueError("shells must be at least 1")
    faces, pos, groups = _rings_for(p, q, shells)
    kept = sorted(f for group in groups[:shells] for f in group)

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
        raise ValueError(f"{{{p},{q}}} trimmed to {shells} shells is not a disc")

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
        f"hyperbolic{p}{q}",
        polygons,
        _shared_vertex_adjacency(cells),
        mine_count,
        size,
        size,
        corner_mask=mask,
    )
