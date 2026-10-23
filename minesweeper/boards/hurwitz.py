"""The closed hyperbolic surfaces: the {7,3} tiling glued up into a surface with
no edge at all, drawn as a patch of the Poincaré disc that covers it.

A disc of the hyperbolic plane is mostly rim -- its boundary grows as fast as
its area -- and a rim cell sees far fewer than its tile's neighbours. Glue the
plane up into a closed surface and the rim is gone: every cell keeps its full
count, as on a sphere. The surfaces here are the **Hurwitz surfaces**, the ones
with the most symmetry their genus allows (84(g - 1) turns), on which the
{7,3} tiling closes up regularly -- every heptagon looks like every other:

* ``quartic``, Klein's quartic: genus 3, 24 heptagons, the group PSL(2,7);
* ``macbeath``, Macbeath's surface: genus 7, 72 heptagons, PSL(2,8);
* ``triplet``, one of the first Hurwitz triplet: genus 14, 156 heptagons,
  PSL(2,13). The three surfaces of the triplet share the group and are not
  the same surface; this is the one the generator search below meets first,
  and `TestHurwitz` pins which by its Petrie polygons.

The count of heptagons is fixed by the surface -- a genus-g Hurwitz surface
has 84(g - 1) turns, seven to a face, so 12(g - 1) of them -- and so is the
size of its 6.6.7 (the {7,3} tiling's ``zip``, a hexagon on every corner): 80,
240 and 520 cells. Each surface is a mode of its own (`SURFACE_MODES`). Klein's
quartic grows from difficulty to difficulty by subdividing its tiles
(Goldberg--Coxeter GC(n, 0), `gc_loops`: 248 and 444 cells); the two bigger
surfaces are one board at every difficulty, the mines alone telling the
difficulties apart.

**The surface is built from its group, exactly.** A Hurwitz group is generated
by an x of order 2 and a y of order 3 whose product R = xy has order 7, and
the regular map is read straight off it: the group's elements are the map's
darts, the cosets of <R> its faces, of <y> its vertices and of <x> its edges,
and a face's corners run in <R> order. The group is PSL(2,q) -- 2x2 matrices of
determinant 1 over the field of q elements, a matrix and its negative counted
once -- so every id is an integer and nothing is ever rounded. GF(7) and GF(13)
are integers mod p; GF(8) is three bits, multiplied as polynomials mod
x^3 + x + 1. The generators are the first pair met in a fixed order.

**The disc covers the surface, and the covering map is combinatorial.** The
{7,3} tiling the ring walk builds (`hyperbolic.py`) is the surface's universal
cover. The central heptagon's corners go in order onto face 0's; then every
disc face across an edge from one already mapped goes onto the one surface face
across that edge's image, which the surface has exactly one of. That is a
breadth-first walk on ids alone; a disc vertex reached two ways must land on
one surface vertex, which the walk checks. A uniform tiling of the disc
(`hyperbolic.wythoff_loops`) is carried down through its flag keys.

**The patch is the shells out to where every cell has been drawn once** -- and
at least out to `patch_reach`, so the web app's pan always has board round the
view -- plus ``margin`` more, so every cell is somewhere on the board and the
drawing keeps the central heptagon's seven turns and mirrors. Each drawn face shows the cell
it covers (``Board.faces``); the cell is named after its copy nearest the
centre. Adjacency is the *surface's*, from the cells' corners as surface ids
(``Board.quotient``) -- so a cell is a full neighbour of its neighbours even
where its copy sits at the rim of the patch, and the topology helpers count
the surface, chi = 2 - 2g, rather than the disc.
"""

from __future__ import annotations

import cmath
import functools
import itertools
import math

from minesweeper.boards.core import Board, _shared_vertex_adjacency
from minesweeper.boards.hyperbolic import (
    ARC_SEGMENTS,
    WYTHOFF_OPS,
    _distance,
    _drop,
    _dual_faces,
    _lift,
    _shell_groups,
    _tiling,
    _to_origin,
    disc_drawing,
    wythoff_loops,
)

#: The surfaces, by name: the order of the field the group is PSL(2,q) over,
#: and the genus.
HURWITZ_SURFACES: dict[str, tuple[int, int]] = {
    "quartic": (7, 3),
    "macbeath": (8, 7),
    "triplet": (13, 14),
}

#: How far round the centre of its view the web app shows a 6.6.7 patch, in
#: hyperbolic distance: 3.0, 0.905 of the disc. Farther out a tile is a few
#: pixels across on a phone -- too small to tap, and with the patch growing as
#: e^d, most of what there would be to draw. The pan keeps the view's centre on
#: the central tile and hides whatever it would draw farther out, which keeps
#: the board's edge one fixed circle as the view steps from tile to tile. Must
#: match `COVER_VIEW` in hurwitz.ts.
COVER_VIEW = 3.0

#: How far the view's centre can ever be from the patch's: the pan carries it
#: back onto the central {7,3} heptagon, so its circumradius,
#: acosh(cot(pi/7) cot(pi/3)). Must match `VIEW_SHIFT`.
VIEW_SHIFT = math.acosh(1 / (math.tan(math.pi / 7) * math.tan(math.pi / 3)))


def cover_view(op: str) -> float:
    """`COVER_VIEW` for tiling ``op``. A subdivision's tiles are smaller --
    GC(n, 0)'s edges are 1/n of {7,3}'s where 6.6.7's are 1/sqrt(3) -- and a
    tile drawn d out from the centre of the view shrinks as e^-d, so its view
    is shorter by ln(n / sqrt(3)): the cells at its edge come out the same size
    on screen. Must match `coverView`."""
    n = _gc_order(op)
    return COVER_VIEW - math.log(n / math.sqrt(3)) if n else COVER_VIEW


@functools.cache
def _tile_radius(op: str) -> float:
    """The farthest any tile's corner is from its own centre, in hyperbolic
    distance, measured on the disc's first rings (the tiles are congruent by
    type, so a few rings hold every kind). Must match `tileRadius`."""
    n = _gc_order(op)
    if n is not None:
        loops, where, centres, _ = gc_loops(n, 3)
    elif op == "none":
        faces, _, pos, centres = _tiling(7, 3, 3)
        loops, where = faces, pos
    else:
        loops, where, centres, _ = wythoff_loops(7, 3, op, 3)
    return max(_distance(_to_origin(z, where[k])) for loop, z in zip(loops, centres)
               for k in loop)


def patch_reach(op: str) -> float:
    """How far from the centre the patch always reaches: past every face whose
    centre is this close, whatever the surface. The patch has to fill the
    view's circle from anywhere the pan leaves the view's centre, so this is
    `cover_view`, plus `VIEW_SHIFT`, plus the tiling's own tile radius -- a
    tile whose centre is farther out cannot reach into the view. Klein's
    quartic needs it (every one of its cells is within 2.9 of the centre); the
    bigger surfaces' patches already reach past it. Must match `patchReach`."""
    return cover_view(op) + VIEW_SHIFT + _tile_radius(op)

#: The tilings a surface can be drawn in: ``"none"`` is {7,3} itself, then its
#: Wythoff tilings (`hyperbolic.WYTHOFF_OPS`), then its Goldberg--Coxeter
#: subdivisions GC(n, 0), ``"gc2"`` .. ``"gc4"`` (`gc_loops`).
HURWITZ_OPS = ("none", *WYTHOFF_OPS, "gc2", "gc3", "gc4")

#: Each surface's mode: one surface a mode, whatever the difficulty. Klein's
#: quartic grows from difficulty to difficulty by subdividing its tiles; the
#: two bigger surfaces are one board at every difficulty, the mines alone
#: telling them apart.
SURFACE_MODES: dict[str, str] = {
    "quartic": "quartic",
    "macbeath": "macbeath667",
    "triplet": "triplet667",
}

Matrix = tuple[int, int, int, int]


def _gc_order(op: str) -> int | None:
    """The n of a Goldberg--Coxeter tiling ``"gc<n>"``, or None for any other."""
    return int(op[2:]) if op.startswith("gc") else None


def _field(q: int):
    """Addition, multiplication and negation in GF(q): integers mod q for a
    prime, three-bit polynomials mod x^3 + x + 1 for 8."""
    if q == 8:
        def mul(a: int, b: int) -> int:
            r = 0
            for i in range(3):
                if b >> i & 1:
                    r ^= a << i
            for i in (4, 3):
                if r >> i & 1:
                    r ^= 0b1011 << (i - 3)
            return r
        return (lambda a, b: a ^ b), mul, (lambda a: a)
    return (lambda a, b: (a + b) % q), (lambda a, b: a * b % q), (lambda a: -a % q)


@functools.cache
def hurwitz_group(q: int) -> tuple[list[Matrix], object, Matrix, Matrix]:
    """PSL(2,q): its elements in order (a matrix (a, b, c, d) named by the
    lesser of it and its negative), its multiplication, and the Hurwitz
    generators x (order 2) and y (order 3), xy of order 7 -- the first such
    pair, x then y in element order, that generates the whole group."""
    add, mul, neg = _field(q)

    def canon(m: Matrix) -> Matrix:
        return min(m, tuple(neg(c) for c in m))

    elements = sorted({
        canon(m) for m in itertools.product(range(q), repeat=4)
        if add(mul(m[0], m[3]), neg(mul(m[1], m[2]))) == 1
    })

    @functools.cache
    def times(m: Matrix, n: Matrix) -> Matrix:
        a, b, c, d = m
        e, f, g, h = n
        return canon((add(mul(a, e), mul(b, g)), add(mul(a, f), mul(b, h)),
                      add(mul(c, e), mul(d, g)), add(mul(c, f), mul(d, h))))

    identity = canon((1, 0, 0, 1))

    def order(m: Matrix) -> int:
        k, power = 1, m
        while power != identity:
            power, k = times(power, m), k + 1
        return k

    def generates(x: Matrix, y: Matrix) -> bool:
        seen, frontier = {identity}, [identity]
        while frontier:
            frontier = [h for g in frontier for h in (times(g, x), times(g, y))
                        if h not in seen and not seen.add(h)]
        return len(seen) == len(elements)

    involutions = [m for m in elements if order(m) == 2]
    triples = [m for m in elements if order(m) == 3]
    for x in involutions:
        for y in triples:
            if order(times(x, y)) == 7 and generates(x, y):
                return elements, times, x, y
    raise ValueError(f"PSL(2,{q}) has no Hurwitz generators")


@functools.cache
def hurwitz_map(surface: str) -> list[tuple[int, ...]]:
    """The surface's {7,3} map: each face as its seven vertex ids in order.
    Faces and vertices are numbered in the order of the first element of
    their coset, so the numbering is the group's own."""
    if surface not in HURWITZ_SURFACES:
        raise ValueError(f"unknown Hurwitz surface {surface!r}")
    q, _ = HURWITZ_SURFACES[surface]
    elements, times, x, y = hurwitz_group(q)
    turn = times(x, y)

    def cosets(generator: Matrix, n: int) -> dict[Matrix, int]:
        out: dict[Matrix, int] = {}
        for g in elements:
            if g in out:
                continue
            k, h = len(set(out.values())), g
            for _ in range(n):
                out[h] = k
                h = times(h, generator)
        return out

    face_of, vertex_of = cosets(turn, 7), cosets(y, 3)
    faces: dict[int, tuple[int, ...]] = {}
    for g in elements:
        if face_of[g] in faces:
            continue
        corners, h = [], g
        for _ in range(7):
            corners.append(vertex_of[h])
            h = times(h, turn)
        faces[face_of[g]] = tuple(corners)
    return [faces[f] for f in range(len(faces))]


def petrie_length(surface: str) -> int:
    """The length of the map's Petrie polygons -- the walk along its edges
    that turns left and right at alternate corners -- which tells the three
    surfaces of the first Hurwitz triplet apart (the quartic's is 8, as its
    classical name {7,3}_8 says)."""
    left: dict[tuple[int, int], int] = {}  # directed edge -> the next corner on its left
    right: dict[tuple[int, int], int] = {}  # ...and on its right
    for face in hurwitz_map(surface):
        for i in range(7):
            u, v, w = face[i - 1], face[i], face[(i + 1) % 7]
            left[(u, v)] = w  # the face runs u -> v -> w counterclockwise
            right[(w, v)] = u  # so arriving at v from w, u is on the right
    start = edge = (hurwitz_map(surface)[0][0], hurwitz_map(surface)[0][1])
    steps = 0
    while True:
        turn = left if steps % 2 == 0 else right
        edge = (edge[1], turn[edge])
        steps += 1
        if edge == start and steps % 2 == 0:
            return steps


@functools.cache
def _cover(surface: str, rings: int) -> tuple[list[int], dict[int, int]]:
    """The covering map from the {7,3} disc out to ``rings`` rings onto the
    surface: each disc face's surface face, and each disc vertex's surface
    vertex. Pure ids -- see the module docstring."""
    faces = hurwitz_map(surface)
    across: dict[tuple[int, int], tuple[int, int]] = {}  # directed edge -> (face, corner)
    for f, face in enumerate(faces):
        for i in range(7):
            across[(face[i], face[(i + 1) % 7])] = (f, i)
    base = _tiling(7, 3, rings)[0]
    disc_face: dict[tuple[int, int], int] = {}
    for f, face in enumerate(base):
        for i in range(7):
            disc_face[(face[i], face[(i + 1) % 7])] = f
    vertex: dict[int, int] = dict(zip(base[0], faces[0]))
    face_map = {0: 0}
    stack = [0]
    while stack:
        f = stack.pop()
        face = base[f]
        for i in range(7):
            a, b = face[i], face[(i + 1) % 7]
            g = disc_face.get((b, a))
            if g is None or g in face_map:
                continue
            h, k = across[(vertex[b], vertex[a])]
            start = base[g].index(b)
            for s in range(7):
                v, w = base[g][(start + s) % 7], faces[h][(k + s) % 7]
                if vertex.setdefault(v, w) != w:
                    raise ValueError("the disc does not cover the surface")
            face_map[g] = h
            stack.append(g)
    return [face_map[f] for f in range(len(base))], vertex


# -- the subdivided tilings: Goldberg--Coxeter GC(n, 0) ------------------------
#
# {7,3} is trivalent, so its dual is a triangle tiling, {3,7}: a triangle for
# every corner of the heptagons, its own corners the centres of the three
# heptagons that meet there. Cut every triangle into n * n small ones and take
# the dual again, and the heptagons come back -- one for every heptagon, round
# its centre -- with hexagons everywhere else: GC(n, 0) of {7,3}, trivalent,
# every heptagon 7 neighbours and every hexagon 6. On a surface with F
# heptagons, V corners and E edges it is F + E (n - 1) + V (n - 1)(n - 2) / 2
# cells: 108, 248 and 444 on Klein's quartic for n = 2, 3, 4.
#
# **The ids are exact.** A point of the cut is named by its weights over its
# triangle's corners, the corners being heptagons of the ring walk: the sorted
# pairs (heptagon, weight) with a weight that is not zero, as
# `solids._geodesic` names the points of an icosahedron's. A point on a shared
# edge gets the same name from both triangles, and a point at a corner from all
# seven. A small triangle is named by its three points. Nothing is rounded.
#
# **The positions are only drawn.** A point is the weighted average of its
# corners' centres on the hyperboloid, a small triangle the average of its
# points, and the edges between are drawn as geodesic arcs like every other
# disc board's; the floats order a cell's corners round it and nothing else.


@functools.cache
def gc_loops(n: int, rings: int):
    """GC(n, 0) of the {7,3} disc out to ``rings`` rings, in the shape
    `hyperbolic.wythoff_loops` returns: each cell as the loop of its corners'
    keys (the small triangles round a point of the cut, counterclockwise), the
    keys' positions, each cell's centre (its point), and what it stands on
    (the point's key). A point is kept only where every triangle round it was
    built."""
    if n < 2:
        raise ValueError("a subdivision needs n of at least 2")
    _, _, _, centres = _tiling(7, 3, rings)
    triangles, _ = _dual_faces(7, rings - 1)  # corners: faces of _tiling(7, 3, rings)
    lifted = [_lift(z) for z in centres]

    def blend(points: list[tuple[float, float, float]], weights: list[float]) -> complex:
        return _drop(tuple(sum(w * p[axis] for p, w in zip(points, weights)) for axis in range(3)))

    point_at: dict[tuple, complex] = {}
    around: dict[tuple, list[tuple]] = {}
    where: dict[tuple, complex] = {}
    order: list[tuple] = []
    for corners in triangles:
        def point(a: int, b: int) -> tuple:
            weights = (n - a - b, a, b)
            key = tuple(sorted((f, w) for f, w in zip(corners, weights) if w))
            if key not in point_at:
                point_at[key] = blend([lifted[f] for f in corners], list(weights))
                order.append(key)
            return key

        smalls = []
        for a in range(n):
            for b in range(n - a):
                smalls.append((point(a, b), point(a + 1, b), point(a, b + 1)))
                if a + b <= n - 2:
                    smalls.append((point(a + 1, b), point(a + 1, b + 1), point(a, b + 1)))
        for tri in smalls:
            key = tuple(sorted(tri))
            if key in where:
                continue
            where[key] = blend([_lift(point_at[k]) for k in tri], [1.0, 1.0, 1.0])
            for k in tri:
                around.setdefault(k, []).append(key)
    loops, cell_centres, origins = [], [], []
    for key in order:
        tris = around[key]
        if len(tris) != (7 if len(key) == 1 else 6):
            continue  # a triangle round it was not built
        z = point_at[key]
        tris = sorted(tris, key=lambda t: cmath.phase(_to_origin(z, where[t])))
        loops.append(tuple(tris))
        cell_centres.append(z)
        origins.append(key)
    return loops, where, cell_centres, origins


def _patch(surface: str, op: str, rings: int):
    """The disc out to ``rings`` rings in tiling ``op``, and how it covers the
    surface: each face's loop of keys, the keys' positions, the face centres,
    each face's surface cell, and a function sending a key to its surface
    vertex."""
    phi_face, phi = _cover(surface, rings)
    if op == "none":
        base, _, pos, centres = _tiling(7, 3, rings)
        cells = [("F", phi_face[f]) for f in range(len(base))]
        return [tuple(face) for face in base], pos, centres, cells, phi.__getitem__
    n = _gc_order(op)
    if n is not None:
        loops, where, centres, origins = gc_loops(n, rings)

        def down(point: tuple) -> tuple:
            return tuple(sorted((phi_face[f], w) for f, w in point))

        return (loops, where, centres, [("G", down(o)) for o in origins],
                lambda k: tuple(sorted(down(p) for p in k)))
    loops, where, centres, origins = wythoff_loops(7, 3, op, rings)

    def cell(origin: tuple) -> tuple:
        if origin[0] == "F":
            return ("F", phi_face[origin[1]])
        if origin[0] == "V":
            return ("V", phi[origin[1]])
        return ("E", *sorted((phi[origin[1]], phi[origin[2]])))

    def key(k: tuple) -> tuple:
        if op == "ambo":
            return tuple(sorted((phi[k[0]], phi[k[1]])))
        if op == "zip":
            return (phi_face[k[0]], *sorted((phi[k[1]], phi[k[2]])))
        if op == "expand":
            return (phi_face[k[0]], phi[k[1]])
        return (phi_face[k[0]], phi[k[1]], phi[k[2]])

    return loops, where, centres, [cell(o) for o in origins], key


def _patch_for(surface: str, op: str, margin: int):
    """Grow the disc until it holds every face out to the shells the patch
    keeps -- the first shells to reach every cell or out to `patch_reach`,
    whichever is farther, and ``margin`` more -- with a unit to spare past the
    last, as `hyperbolic._rings_for` grows it. Returns the patch and its
    shells."""
    target = len(hurwitz_cells(surface, op))
    for rings in range(2, 13):
        loops, where, centres, cells, key = _patch(surface, op, rings)
        groups = _shell_groups(centres)
        seen: set = set()
        cover = None
        for s, group in enumerate(groups):
            seen.update(cells[f] for f in group)
            if len(seen) == target:
                cover = s + 1
                break
        if cover is None:
            continue
        far = patch_reach(op)
        reach = sum(1 for group in groups if _distance(centres[group[0]]) <= far)
        keep = max(cover, reach) + margin
        if len(groups) <= keep:
            continue
        _, ring_of, _, base_centres = _tiling(7, 3, rings)
        outer = min(_distance(z) for z, r in zip(base_centres, ring_of) if r == rings)
        cut = _distance(centres[groups[keep - 1][0]])
        if outer > cut + 1.0 and outer > far + 1.0:
            return (loops, where, centres, cells, key), groups[:keep]
    raise ValueError("the patch needs too many rings")


@functools.cache
def hurwitz_cells(surface: str, op: str) -> dict[tuple, list]:
    """The surface's cells in tiling ``op``, each as its corners' surface
    vertex ids in order, keyed by what it stands on (``("F", face)``,
    ``("V", vertex)``, ``("E", u, v)``, or a subdivision's point
    ``("G", ((face, weight), ...))``). Read off a disc big enough to hold a
    copy of every one of them."""
    if op not in HURWITZ_OPS:
        raise ValueError(f"unknown tiling {op!r}")
    faces = hurwitz_map(surface)
    want = len(faces)
    vertices = len({v for face in faces for v in face})
    edges = 7 * want // 2
    n = _gc_order(op)
    if n is not None:
        want += edges * (n - 1) + vertices * (n - 1) * (n - 2) // 2
    elif op != "none":
        want += {"zip": vertices, "ambo": vertices, "expand": vertices + edges,
                 "bevel": vertices + edges}[op]
    for rings in range(2, 13):
        loops, _, _, cells, key = _patch(surface, op, rings)
        out: dict[tuple, list] = {}
        for loop, cell in zip(loops, cells):
            corners = [key(k) for k in loop]
            if cell in out:
                if not _same_loop(out[cell], corners):
                    raise ValueError("two copies of a cell disagree")
            else:
                out[cell] = corners
        if len(out) == want:
            return out
    raise ValueError("the disc never reaches every cell")


def _same_loop(a: list, b: list) -> bool:
    """Whether two loops are the same cycle, read from any start."""
    if len(a) != len(b) or a[0] not in b:
        return False
    i = b.index(a[0])
    return a == b[i:] + b[:i]


def hurwitz_board(
    surface: str,
    op: str,
    margin: int,
    mine_count: int,
    scale: float = 300.0,
    arc: int = ARC_SEGMENTS,
) -> Board:
    """The closed surface ``surface`` (one of `HURWITZ_SURFACES`) in tiling
    ``op`` (one of `HURWITZ_OPS`; the boards that ship are ``zip``, 6.6.7, and
    on Klein's quartic its subdivisions ``gc3`` and ``gc4``), drawn as a patch
    of the Poincaré disc that covers it: the shells out to where every cell has
    a copy, and ``margin`` more. The board is the surface's mode
    (`SURFACE_MODES`). ``scale`` and ``arc`` are
    `hyperbolic.hyperbolic_board`'s."""
    if margin < 0:
        raise ValueError("margin must not be negative")
    surface_cells = hurwitz_cells(surface, op)
    (loops, where, _, cells, key), groups = _patch_for(surface, op, margin)
    drawn = [f for group in groups for f in sorted(group)]
    ids: dict = {}
    faces: list[tuple[int, ...]] = []
    for f in drawn:
        faces.append(tuple(ids.setdefault(k, len(ids)) for k in loops[f]))
    pos = {i: where[k] for k, i in ids.items()}
    _, mask, polygons, size = disc_drawing(faces, list(range(len(faces))), pos, scale, arc)
    # each cell is named after its copy nearest the centre: the first drawn
    name: dict[tuple, int] = {}
    for face, f in enumerate(drawn):
        name.setdefault(cells[f], face)
    face_cell = {face: name[cells[f]] for face, f in enumerate(drawn)}
    quotient = {name[cell]: corners for cell, corners in surface_cells.items()}
    return Board(
        SURFACE_MODES[surface],
        polygons,
        _shared_vertex_adjacency(quotient),
        mine_count,
        size,
        size,
        corner_mask=mask,
        faces=face_cell,
        quotient=quotient,
    )
