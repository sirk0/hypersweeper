from __future__ import annotations

import math

from minesweeper.boards.core import Board, Cell, _finalize_flat

# -- Penrose tiling (P3, rhombi) ---------------------------------------------
#
# Vertices are exact elements of Z[zeta], zeta = exp(i*pi/5), stored as 4
# integer coefficients over the basis (1, z, z^2, z^3) with the reduction
# z^4 = -1 + z - z^2 + z^3. Robinson-triangle deflation only ever needs
# addition, subtraction and division by phi -- and 1/phi = phi - 1 =
# z^2 - z^3, so every operation stays in integers and vertex keys are
# exact: the shared-vertex adjacency needs no floating-point tolerance.

ZPoint = tuple[int, int, int, int]


def _zeta_mul(p: ZPoint) -> ZPoint:
    a, b, c, d = p
    return (-d, a + d, b - d, c + d)


def _z_add(p: ZPoint, q: ZPoint) -> ZPoint:
    return tuple(x + y for x, y in zip(p, q))


def _z_sub(p: ZPoint, q: ZPoint) -> ZPoint:
    return tuple(x - y for x, y in zip(p, q))


def _z_div_phi(p: ZPoint) -> ZPoint:
    z2 = _zeta_mul(_zeta_mul(p))
    return _z_sub(z2, _zeta_mul(z2))


_ZETA_BASIS = [
    (math.cos(math.pi * k / 5), math.sin(math.pi * k / 5)) for k in range(4)
]


def _z_to_xy(p: ZPoint) -> tuple[float, float]:
    return (
        sum(c * bx for c, (bx, _) in zip(p, _ZETA_BASIS)),
        sum(c * by for c, (_, by) in zip(p, _ZETA_BASIS)),
    )


def penrose_board(
    subdivisions: int, mine_count: int, scale: float = 300, keep: int | None = None
) -> Board:
    """An aperiodic Penrose tiling (P3): thick and thin rhombi.

    Starts from a wheel of ten half-rhombus Robinson triangles and
    deflates ``subdivisions`` times; mirror-image triangle halves are
    then merged into rhombi (unpaired halves on the outer rim are
    dropped). ``scale`` is the wheel radius in pixels. ``keep`` trims the
    tiling to its ``keep`` centremost rhombi by Chebyshev distance (a
    roughly square block, denser on screen than the full round wheel);
    ``None`` keeps the whole decagonal patch.
    """
    zero = (0, 0, 0, 0)
    powers = [(1, 0, 0, 0)]
    for _ in range(10):
        powers.append(_zeta_mul(powers[-1]))

    # (color, apex, base1, base2): color 0 = half-thin, 1 = half-thick
    # (thick rhombi outnumber thin ones by phi in the limit)
    triangles = []
    for i in range(10):
        b, c = powers[i], powers[i + 1]
        if i % 2:
            b, c = c, b  # alternate handedness so mirror halves pair up
        triangles.append((0, zero, b, c))

    for _ in range(subdivisions):
        deflated = []
        for color, a, b, c in triangles:
            if color == 0:
                p = _z_add(a, _z_div_phi(_z_sub(b, a)))
                deflated += [(0, c, p, b), (1, p, c, a)]
            else:
                q = _z_add(b, _z_div_phi(_z_sub(a, b)))
                r = _z_add(b, _z_div_phi(_z_sub(c, b)))
                deflated += [(1, r, c, a), (1, q, r, b), (0, r, q, a)]
        triangles = deflated

    # merge mirror halves: partners share the color and the base edge
    waiting: dict = {}
    cells: dict[Cell, list[ZPoint]] = {}
    for color, a, b, c in triangles:
        key = (color, *sorted((b, c)))
        if key in waiting:
            other_apex = waiting.pop(key)
            cells[(color, len(cells))] = [a, b, other_apex, c]
        else:
            waiting[key] = a

    if keep is not None and keep < len(cells):
        centroid = {
            cell: (sum(_z_to_xy(k)[0] for k in quad) / 4,
                   sum(_z_to_xy(k)[1] for k in quad) / 4)
            for cell, quad in cells.items()
        }
        gx = sum(c[0] for c in centroid.values()) / len(centroid)
        gy = sum(c[1] for c in centroid.values()) / len(centroid)
        kept = sorted(cells, key=lambda cell: (
            max(abs(centroid[cell][0] - gx), abs(centroid[cell][1] - gy)), cell))
        cells = {cell: cells[cell] for cell in kept[:keep]}

    return _finalize_flat("penrose", cells, _z_to_xy, mine_count, scale)


# -- The Spectre: a chiral aperiodic monotile --------------------------------
#
# Tile(1,1) (Smith-Myers-Kaplan-Goodman-Strauss, 2023) is the equilateral
# member of the hat continuum: a 13-gon that is also an equilateral 14-gon,
# two of whose edges are collinear. Forbid reflections and it tiles the
# plane only aperiodically -- a *weakly chiral* aperiodic monotile -- and
# this board is that reflection-free tiling, grown by the paper's own
# substitution over nine collared cluster types (Gamma, the Mystic, plus
# the eight collared Spectres Delta Theta Lambda Xi Pi Sigma Phi Psi). A
# Spectre cluster expands to seven Spectres and a Mystic, a Mystic cluster
# to six and a Mystic; the Mystic is a *cluster*, so it contributes two
# cells to the board, not one.
#
# It is a genuinely different tiling from The Hat (this game's original
# aperiodic monotile board, since removed as a menu entry -- there was no
# gameplay difference and Spectre's construction is the stricter of the
# two), not a re-skin: the deformation that carries a hat patch to
# Tile(1,1) keeps the hat's ~1-in-7 mirrored tiles and its cell graph,
# whereas here no tile is ever mirrored.
#
# The substitution transforms are ported from Craig S. Kaplan's "spectre"
# reference (cs.uwaterloo.ca/~csk/spectre/spectre.js, (c) 2023 Craig S.
# Kaplan). No floating point is involved at any stage: every edge direction
# is a multiple of 30 degrees and every placement is z -> zeta^k*z + t with
# zeta = exp(i*pi/6), so all of it runs in the ring Z[zeta12] (below) with
# integer arithmetic -- unlike the Hat's Eisenstein-lattice vertices, which
# did need floats. That matters here in a way it did not there: Z[zeta12]
# is *dense* in the plane rather than discrete, so there is no lattice to
# snap a float vertex back to. Carrying the placements exactly is the only
# way to get exact vertex ids.

# A point of Z[zeta12] as 4 integer coefficients over the basis
# (1, zeta, zeta^2, zeta^3), reduced by zeta^4 = zeta^2 - 1 (zeta's minimal
# polynomial is x^4 - x^2 + 1). Vertex ids are these tuples, so
# shared-vertex adjacency is exact -- as with Z[zeta5] for Penrose above.
Z12Point = tuple[int, int, int, int]

_Z12_ZERO: Z12Point = (0, 0, 0, 0)


def _zeta12_mul(p: Z12Point) -> Z12Point:
    """Multiply by zeta, i.e. rotate 30 degrees."""
    a, b, c, d = p
    return (-d, a, b + d, c)


def _z12_add(p: Z12Point, q: Z12Point) -> Z12Point:
    return (p[0] + q[0], p[1] + q[1], p[2] + q[2], p[3] + q[3])


def _z12_sub(p: Z12Point, q: Z12Point) -> Z12Point:
    return (p[0] - q[0], p[1] - q[1], p[2] - q[2], p[3] - q[3])


def _z12_rot(p: Z12Point, k: int) -> Z12Point:
    """Multiply by zeta^k, i.e. rotate k*30 degrees about the origin."""
    for _ in range(k % 12):
        p = _zeta12_mul(p)
    return p


def _z12_conj(p: Z12Point) -> Z12Point:
    """Complex conjugation, which stays in the ring: substituting
    zeta^-1 for zeta and reducing gives this closed form (zeta^11 =
    zeta - zeta^3, zeta^10 = 1 - zeta^2, zeta^9 = -zeta^3)."""
    a, b, c, d = p
    return (a + c, b, -c, -b - d)


_ZETA12_BASIS = [
    (math.cos(math.pi * k / 6), math.sin(math.pi * k / 6)) for k in range(4)
]


def _z12_to_xy(p: Z12Point) -> tuple[float, float]:
    return (
        sum(c * bx for c, (bx, _) in zip(p, _ZETA12_BASIS)),
        sum(c * by for c, (_, by) in zip(p, _ZETA12_BASIS)),
    )


_Z12_POWERS = [(1, 0, 0, 0)]
for _k in range(11):
    _Z12_POWERS.append(_zeta12_mul(_Z12_POWERS[-1]))

# The 14 edge directions of Tile(1,1) in units of 30 degrees, read off
# Kaplan's `spectre` polygon (its frame, since the substitution transforms
# below are stated in it). Every edge is a unit step, so the tile is the
# equilateral 14-gon; the repeated 6 is the pair of collinear edges, whose
# shared endpoint is the flat 180-degree vertex.
_SPECTRE_DIRS = (0, 10, 1, 3, 0, 2, 5, 7, 4, 6, 6, 8, 11, 9)


def _spectre_outline() -> list[Z12Point]:
    """The tile's 14 corners, as the closed walk along _SPECTRE_DIRS."""
    points, at = [], _Z12_ZERO
    for direction in _SPECTRE_DIRS:
        points.append(at)
        at = _z12_add(at, _Z12_POWERS[direction])
    return points


# Keep the flat vertex (index 10) in the polygon: the tiling is edge to
# edge with every edge a unit step, so a neighbouring tile really does
# plant a corner there and it must be a vertex id for
# _shared_vertex_adjacency to find that neighbour. Being collinear it does
# not change the drawn tile, and shapeMetrics/corners drop it before
# measuring, so the tile still reads as the 13-gon it is -- the same
# bargain _insert_t_vertices makes for the isogonal tilings.
_SPECTRE_OUTLINE = _spectre_outline()

# The four "key" corners Kaplan's rules place clusters by (his
# spectre_keys). A cluster carries the same quadrilateral, inflated.
_SPECTRE_QUAD = tuple(_SPECTRE_OUTLINE[i] for i in (3, 5, 7, 11))

# A placement is the rigid motion z -> zeta^rot * (conj z if mirrored else
# z) + trans: an integer rotation index mod 12, a mirror flag and an exact
# Z12Point translation. Composition (below) is integer arithmetic only.
_Placement = tuple[int, int, Z12Point]

_PLACE_IDENT: _Placement = (0, 0, _Z12_ZERO)

# Kaplan's R = [-1,0,0,0,1,0], the reflection (x, y) -> (-x, y): as a
# complex map z -> -conj(z) = zeta^6 * conj(z). Every inflation composes
# one of these (see _spectre_supertiles).
_SPECTRE_REFLECT: _Placement = (6, 1, _Z12_ZERO)


def _place_point(at: _Placement, p: Z12Point) -> Z12Point:
    rot, mirrored, trans = at
    return _z12_add(_z12_rot(_z12_conj(p) if mirrored else p, rot), trans)


def _place_compose(a: _Placement, b: _Placement) -> _Placement:
    """``a`` after ``b``. Conjugation negates the inner rotation and
    conjugates the inner translation, which is all the mirror flag costs."""
    a_rot, a_mirror, a_trans = a
    b_rot, b_mirror, b_trans = b
    inner = _z12_conj(b_trans) if a_mirror else b_trans
    return (
        (a_rot - b_rot if a_mirror else a_rot + b_rot) % 12,
        a_mirror ^ b_mirror,
        _z12_add(a_trans, _z12_rot(inner, a_rot)),
    )


# Kaplan's t_rules: (turn in degrees, key corner of the tile just placed,
# key corner of the tile being placed). Walking them lays the eight
# children of a cluster out corner to corner around its rim.
_SPECTRE_T_RULES = (
    (60, 3, 1), (0, 2, 0), (60, 3, 1), (60, 3, 1),
    (0, 2, 0), (60, 3, 1), (-120, 3, 3),
)

# Kaplan's super_rules: which cluster type each of the eight child slots
# takes, per parent cluster type. Slot 2 is empty for the Mystic (Gamma),
# which is why it expands to six Spectres where the others expand to seven.
_SPECTRE_RULES: dict[str, tuple[str | None, ...]] = {
    "Gamma":  ("Pi",  "Delta", None,  "Theta", "Sigma", "Xi",  "Phi",    "Gamma"),
    "Delta":  ("Xi",  "Delta", "Xi",  "Phi",   "Sigma", "Pi",  "Phi",    "Gamma"),
    "Theta":  ("Psi", "Delta", "Pi",  "Phi",   "Sigma", "Pi",  "Phi",    "Gamma"),
    "Lambda": ("Psi", "Delta", "Xi",  "Phi",   "Sigma", "Pi",  "Phi",    "Gamma"),
    "Xi":     ("Psi", "Delta", "Pi",  "Phi",   "Sigma", "Psi", "Phi",    "Gamma"),
    "Pi":     ("Psi", "Delta", "Xi",  "Phi",   "Sigma", "Psi", "Phi",    "Gamma"),
    "Sigma":  ("Xi",  "Delta", "Xi",  "Phi",   "Sigma", "Pi",  "Lambda", "Gamma"),
    "Phi":    ("Psi", "Delta", "Psi", "Phi",   "Sigma", "Pi",  "Phi",    "Gamma"),
    "Psi":    ("Psi", "Delta", "Psi", "Phi",   "Sigma", "Psi", "Phi",    "Gamma"),
}

# The Mystic's two tiles: one at rest and one rotated 30 degrees about the
# tile's corner 8 (Kaplan's Gamma1/Gamma2).
_SPECTRE_MYSTIC: tuple[tuple[str, _Placement], ...] = (
    ("Gamma1", _PLACE_IDENT),
    ("Gamma2", (1, 0, _SPECTRE_OUTLINE[8])),
)


def _spectre_supertiles(
    quad: tuple[Z12Point, ...],
) -> tuple[list[_Placement], tuple[Z12Point, ...]]:
    """One inflation step, from a cluster's key quad to the next.

    Returns the eight child placements (in _SPECTRE_RULES slot order) and
    the inflated quad, exactly as Kaplan's buildSupertiles does -- the
    placements depend on the quad, so they are recomputed at every level.
    """
    placements = [_PLACE_IDENT]
    turned: _Placement = _PLACE_IDENT
    corners = list(quad)
    total = 0
    for turn, from_corner, to_corner in _SPECTRE_T_RULES:
        total += turn
        if turn:
            turned = (total // 30 % 12, 0, _Z12_ZERO)
            corners = [_place_point(turned, p) for p in quad]
        target = _place_point(placements[-1], quad[from_corner])
        shift: _Placement = (0, 0, _z12_sub(target, corners[to_corner]))
        placements.append(_place_compose(shift, turned))
    placements = [_place_compose(_SPECTRE_REFLECT, at) for at in placements]
    inflated = (
        _place_point(placements[6], quad[2]),
        _place_point(placements[5], quad[1]),
        _place_point(placements[3], quad[2]),
        _place_point(placements[0], quad[1]),
    )
    return placements, inflated


def _spectre_leaves(levels: int) -> list[tuple[str, _Placement]]:
    """Every tile of a level-``levels`` Spectre cluster, as (label, placement)."""
    quad = _SPECTRE_QUAD
    tables = []
    for _ in range(levels):
        placements, quad = _spectre_supertiles(quad)
        tables.append(placements)

    # Every inflation composes one reflection, so a patch grown an odd
    # number of levels comes out mirrored as a whole. Seeding the descent
    # with that same reflection cancels it, and every tile is then
    # unmirrored at any level -- the reflection-free tiling this board is.
    clusters = [("Delta", _SPECTRE_REFLECT if levels % 2 else _PLACE_IDENT)]
    for placements in reversed(tables):
        clusters = [
            (child, _place_compose(at, placements[slot]))
            for label, at in clusters
            for slot, child in enumerate(_SPECTRE_RULES[label])
            if child is not None
        ]

    tiles: list[tuple[str, _Placement]] = []
    for label, at in clusters:
        if label == "Gamma":  # a Mystic is a cluster of two tiles, not one
            tiles += [(sub, _place_compose(at, sub_at))
                      for sub, sub_at in _SPECTRE_MYSTIC]
        else:
            tiles.append((label, at))
    return tiles


def spectre_board(
    levels: int, mine_count: int, keep: int | None = None, scale: float = 21
) -> Board:
    """The Spectre (Tile(1,1)), the chiral aperiodic monotile, grown by
    ``levels`` of the paper's reflection-free substitution from a single
    Spectre (Delta) cluster: 1, 9, 71, 559, 4401 tiles. ``keep`` trims the
    patch to its ``keep`` centremost tiles by Chebyshev distance (a roughly
    square board with an exact cell count); ``None`` keeps the whole
    (ragged) cluster. No tile is ever mirrored.
    """
    rows = []  # (label, ids, cx, cy)
    seen = set()
    for label, at in _spectre_leaves(levels):
        ids = [_place_point(at, p) for p in _SPECTRE_OUTLINE]
        fs = frozenset(ids)
        if fs in seen:  # defensive: a single cluster produces no duplicates
            continue
        seen.add(fs)
        xy = [_z12_to_xy(v) for v in ids]
        rows.append((label, ids,
                     sum(x for x, _ in xy) / len(xy),
                     sum(y for _, y in xy) / len(xy)))

    if keep is not None and keep < len(rows):
        # Chebyshev distance from the patch centre, as penrose_board does:
        # it trims to a square block rather than a disc, so the board reads
        # square and packs more tiles onto the screen.
        gx = sum(r[2] for r in rows) / len(rows)
        gy = sum(r[3] for r in rows) / len(rows)
        rows.sort(key=lambda r: (max(abs(r[2] - gx), abs(r[3] - gy)),
                                 tuple(sorted(r[1]))))
        rows = rows[:keep]

    cells: dict[Cell, list] = {
        (label, i): ids for i, (label, ids, _, _) in enumerate(rows)
    }
    return _finalize_flat("spectre", cells, _z12_to_xy, mine_count, scale)
