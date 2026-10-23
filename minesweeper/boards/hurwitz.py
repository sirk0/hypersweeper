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
has 84(g - 1) turns, seven to a face, so 12(g - 1) of them -- and a bigger board
means a bigger surface. The boards that ship are 6.6.7 -- the {7,3} tiling's
``zip``, a hexagon on every corner -- which gives 80, 240 and 520 cells: the
three classic sizes.

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
at least out to `PATCH_REACH`, so the web app's pan always has board round the
view -- plus ``margin`` more, so every cell is somewhere on the board and the
drawing keeps the central heptagon's seven turns and mirrors. Each drawn face shows the cell
it covers (``Board.faces``); the cell is named after its copy nearest the
centre. Adjacency is the *surface's*, from the cells' corners as surface ids
(``Board.quotient``) -- so a cell is a full neighbour of its neighbours even
where its copy sits at the rim of the patch, and the topology helpers count
the surface, chi = 2 - 2g, rather than the disc.
"""

from __future__ import annotations

import functools
import itertools

from minesweeper.boards.core import Board, _shared_vertex_adjacency
from minesweeper.boards.hyperbolic import (
    ARC_SEGMENTS,
    WYTHOFF_OPS,
    _distance,
    _shell_groups,
    _tiling,
    _vertex_config,
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

#: How far from the centre the patch always reaches, in hyperbolic distance,
#: whatever the surface: past every face whose centre is this close. The web
#: app's pan keeps the view's centre on the central tile and hides whatever it
#: would draw farther out than `COVER_VIEW` in hurwitz.ts, so the patch has to
#: fill that circle from anywhere on the central tile -- 3.6, plus the
#: heptagon's circumradius (0.62), plus a tile -- and that is what keeps the
#: board's edge from moving as the view steps from tile to tile. Klein's
#: quartic needs it (every one of its cells is within 2.9); the bigger
#: surfaces' patches already reach past it. Must match `PATCH_REACH`.
PATCH_REACH = 4.8

#: The tilings a surface can be drawn in: ``"none"`` is {7,3} itself, the rest
#: are its Wythoff tilings (`hyperbolic.WYTHOFF_OPS`).
HURWITZ_OPS = ("none", *WYTHOFF_OPS)

Matrix = tuple[int, int, int, int]


def hurwitz_mode(op: str) -> str:
    """The mode: ``hurwitz`` and the tiling's vertex configuration, as the
    disc boards name theirs (``hurwitz667``; ``hurwitz73`` for {7,3}). One
    mode spans the surfaces -- the surface is the board's size."""
    if op == "none":
        return "hurwitz73"
    return "hurwitz" + "".join(str(n) for n in _vertex_config(7, 3, op))


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
    keeps -- the first shells to reach every cell or out to `PATCH_REACH`,
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
        reach = sum(1 for group in groups if _distance(centres[group[0]]) <= PATCH_REACH)
        keep = max(cover, reach) + margin
        if len(groups) <= keep:
            continue
        _, ring_of, _, base_centres = _tiling(7, 3, rings)
        outer = min(_distance(z) for z, r in zip(base_centres, ring_of) if r == rings)
        cut = _distance(centres[groups[keep - 1][0]])
        if outer > cut + 1.0 and outer > PATCH_REACH + 1.0:
            return (loops, where, centres, cells, key), groups[:keep]
    raise ValueError("the patch needs too many rings")


@functools.cache
def hurwitz_cells(surface: str, op: str) -> dict[tuple, list]:
    """The surface's cells in tiling ``op``, each as its corners' surface
    vertex ids in order, keyed by what it stands on (``("F", face)``,
    ``("V", vertex)``, ``("E", u, v)``). Read off a disc big enough to hold
    a copy of every one of them."""
    if op not in HURWITZ_OPS:
        raise ValueError(f"unknown tiling {op!r}")
    faces = hurwitz_map(surface)
    want = len(faces)
    if op in ("zip", "bevel", "ambo", "expand"):
        vertices = len({v for face in faces for v in face})
        edges = 7 * want // 2
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
    ``op`` (one of `HURWITZ_OPS`; the boards that ship are ``zip``, 6.6.7),
    drawn as a patch of the Poincaré disc that covers it: the shells out to
    where every cell has a copy, and ``margin`` more. ``scale`` and ``arc``
    are `hyperbolic.hyperbolic_board`'s."""
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
        hurwitz_mode(op),
        polygons,
        _shared_vertex_adjacency(quotient),
        mine_count,
        size,
        size,
        corner_mask=mask,
        faces=face_cell,
        quotient=quotient,
    )
