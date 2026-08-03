"""Self-similar (fractal) flat boards: the sphinx, the chair, the
Sierpinski carpet and the pentaflake.

Each is one tile inflated ``levels`` times: the tile is scaled up by the
substitution's ``factor`` and refilled with copies of itself, so the patch
grows by ``len(children)`` per level and its outline stays the tile,
scaled. That self-similar outline is the board -- these are the fractal
family, and unlike every other flat board they are deliberately *not* a
rectangular window: trimming the patch to a square block would throw away
the only thing that makes them what they are (the same exception the
shaped boards make, and for the same reason).

The substitutions:

  * The **sphinx** is the pentagonal hexiamond -- six unit triangles, sides
    3, 1, 1, 1, 2 -- on the triangular lattice. It is a *rep-tile*: four
    half-size copies fill it exactly. Its rep-4 dissection is *unique*: an
    exact-cover search of the size-2 sphinx by unit sphinxes finds exactly
    the one arrangement in ``_SPHINX_CHILDREN`` (three of the four children
    reflected), which ``TestRepTiles`` re-derives.
  * The **chair** (the L-tromino) is three unit squares, also a rep-4
    rep-tile. Its dissection is the classic chair substitution: four copies
    at the four quarter-turns, none reflected.
  * The **Sierpinski carpet** is the odd one out: the unit square tripled
    and refilled with eight copies -- the 3x3 block *minus its centre*. The
    children do not fill the inflated tile, and that missing middle ninth,
    repeated at every scale, is the board: a square patch shot through with
    square holes, so it is the one flat board that is not a disc (a
    level-``n`` carpet has (8**n - 1) / 7 holes, hence Euler characteristic
    1 - holes and holes + 1 boundary circles). Being a genuine fractal
    (the limit set has dimension log8/log3, not 2) is exactly what
    *not* being a rep-tile buys.
  * The **pentaflake** (Duerer's pentagon) is the regular pentagon scaled by
    phi**2 and refilled with six: one at each corner and one in the middle,
    the middle one turned a half turn. Like the carpet it leaves gaps -- five
    golden gnomons (36-72-72 triangles), one per side -- and unlike every
    other board here its lattice is not integer: five-fold symmetry needs
    rank 4, so its vertex ids live in the cyclotomic ring Z[zeta10], as
    Penrose's do in Z[zeta5].

Every child translation is the parent's scaled by a power of the factor,
so a placement stays an exact ``(rotation, mirror, lattice translation)``
triple all the way down -- no floating point enters the substitution and
vertex ids need no tolerance, exactly as for the Spectre in
``aperiodic.py``. That is why the inflation only ever *multiplies* by the
factor (``_inflate``): the three integer lattices could divide it out
again, but phi**2 is irrational and Z[zeta10] is dense in the plane, so
there is no rounding back to a lattice to fall back on.

The sphinx's and the chair's outlines carry a vertex at *every* lattice
point along their edges, not just at their corners. Those two tilings are
not edge to edge (a neighbour plants a corner in the middle of the
sphinx's long side), and the extra collinear ids are what let
``_shared_vertex_adjacency`` see the neighbour -- the bargain
``_insert_t_vertices`` makes for the isogonal tilings and the Spectre
makes for its 14th corner. Being collinear they do not change the drawn
tile, and ``shapeMetrics``/``corners`` drop them before measuring, so the
sphinx still reads as a pentagon and the chair as a hexagon. The carpet
and the pentaflake need none of that: their tiles meet edge to edge,
corner to corner.
"""

from __future__ import annotations

import math
from dataclasses import dataclass
from typing import Callable

from minesweeper.boards.core import ROOT3, Board, Cell, _finalize_flat

# A lattice point: the integer coordinates of a vertex in the tile's own
# lattice. Two of them for the three integer lattices, four for the
# pentaflake's cyclotomic ring -- which is why this widens ``core``'s
# two-coordinate ``LatticePoint``.
Point = tuple[int, ...]

# A placement is the rigid motion x -> R^rot (M^mirror x) + translation, with
# R the lattice's smallest rotation and M its mirror: an integer rotation
# index, a mirror flag and an exact lattice translation. Composition (below)
# is integer arithmetic only.
_Placement = tuple[int, int, Point]


# -- the lattices ------------------------------------------------------------
#
# Triangular lattice: (a, b) stands for a*(1, 0) + b*(1/2, sqrt3/2), so a
# 60-degree rotation and a mirror are both integer maps.


def _tri_rotate(p: Point) -> Point:
    a, b = p
    return (-b, a + b)


def _tri_mirror(p: Point) -> Point:
    a, b = p
    return (a + b, -b)


def _tri_to_xy(p: Point) -> tuple[float, float]:
    a, b = p
    return (a + b / 2, b * ROOT3 / 2)


def _square_rotate(p: Point) -> Point:
    x, y = p
    return (-y, x)


def _square_mirror(p: Point) -> Point:
    x, y = p
    return (x, -y)


def _square_to_xy(p: Point) -> tuple[float, float]:
    return (float(p[0]), float(p[1]))


def _times(n: int) -> Callable[[Point], Point]:
    """Scaling on an integer lattice: multiply every coordinate."""
    return lambda p: tuple(c * n for c in p)


# Z[zeta10] -- the pentaflake's lattice, zeta = exp(i*pi/5): (a, b, c, d)
# stands for a + b*zeta + c*zeta**2 + d*zeta**3. Rank 4 is forced, not a
# convenience: no lattice of two integers carries a 72-degree rotation, so
# there is no integer plane to build a five-fold tiling on (the same reason
# Penrose lives in Z[zeta5]). Every power reduces through zeta's minimal
# polynomial x**4 - x**3 + x**2 - x + 1, i.e. zeta**4 = zeta**3 - zeta**2 +
# zeta - 1 and zeta**5 = -1.


def _penta_rotate(p: Point) -> Point:
    """Multiply by zeta: a 36-degree turn, so the rotation order is 10."""
    a, b, c, d = p
    return (-d, a + d, b - d, c + d)


def _penta_mirror(p: Point) -> Point:
    """Complex conjugation, zeta**k -> zeta**(10 - k): the mirror in the
    real axis (conj(zeta) = 1 - zeta + zeta**2 - zeta**3)."""
    a, b, c, d = p
    return (a + b, -b, b - d, -b - c)


def _penta_scale(p: Point) -> Point:
    """Multiply by phi**2 = 2 + zeta**2 - zeta**3, the inflation factor.
    (phi = zeta + 1/zeta = 2*cos(36 degrees) is real and lives in the ring,
    so the scaling stays exact where a float would not.)"""
    r2 = _penta_rotate(_penta_rotate(p))
    r3 = _penta_rotate(r2)
    return tuple(2 * x + y - z for x, y, z in zip(p, r2, r3))


_ZETA10 = tuple((math.cos(math.pi * k / 5), math.sin(math.pi * k / 5))
                for k in range(4))


def _penta_to_xy(p: Point) -> tuple[float, float]:
    return (sum(c * _ZETA10[k][0] for k, c in enumerate(p)),
            sum(c * _ZETA10[k][1] for k, c in enumerate(p)))


@dataclass(frozen=True)
class _Substitution:
    """One self-similar tile: its unit outline, its inflation, its lattice."""
    mode: str
    outline: tuple[Point, ...]             # unit tile, a vertex per lattice
    #                                        step along every edge, CCW
    children: tuple[_Placement, ...]       # the unit tiles inside the tile
    #                                        scaled by `factor` -- a dissection
    #                                        for a rep-tile, a dissection with
    #                                        holes in it for the carpet and
    #                                        the pentaflake
    factor: float                          # linear scale of one inflation
    order: int                             # rotation order of the lattice
    rotate: Callable[[Point], Point]
    mirror: Callable[[Point], Point]
    scale: Callable[[Point], Point]        # `factor` again, done exactly on
    #                                        the lattice (the two agree, which
    #                                        is what pins `factor` when it is
    #                                        irrational -- see TestFractals)
    to_xy: Callable[[Point], tuple[float, float]]

    @property
    def origin(self) -> Point:
        """The lattice's zero, in the tile's own coordinate count."""
        return (0,) * len(self.outline[0])

    def corners(self) -> tuple[Point, ...]:
        """The outline's real corners -- the collinear step vertices dropped."""
        pts = self.outline
        xy = [self.to_xy(p) for p in pts]
        keep = []
        for i, p in enumerate(pts):
            (ax, ay), (bx, by), (cx, cy) = xy[i - 1], xy[i], xy[(i + 1) % len(pts)]
            turn = (bx - ax) * (cy - by) - (by - ay) * (cx - bx)
            if abs(turn) > 1e-9:
                keep.append(p)
        return tuple(keep)


# The sphinx: bottom edge 3, then 1 up-left, 1 left, 1 up-left, 2 down-left,
# walked counterclockwise with a vertex at every lattice step.
_SPHINX_OUTLINE: tuple[Point, ...] = (
    (0, 0), (1, 0), (2, 0), (3, 0), (2, 1), (1, 1), (0, 2), (0, 1),
)

# The unique dissection of the size-2 sphinx into four unit sphinxes (an
# exact-cover search over all 12 orientations x translations returns this and
# nothing else -- TestSphinx runs it). Three children are reflected.
_SPHINX_CHILDREN: tuple[_Placement, ...] = (
    (3, 1, (3, 0)),
    (4, 0, (0, 4)),
    (0, 1, (1, 2)),
    (3, 1, (6, 0)),
)

SPHINX = _Substitution("sphinx", _SPHINX_OUTLINE, _SPHINX_CHILDREN, 2, 6,
                       _tri_rotate, _tri_mirror, _times(2), _tri_to_xy)

# The chair (L-tromino): three unit squares, again with a vertex at every
# lattice step along the two long edges.
_CHAIR_OUTLINE: tuple[Point, ...] = (
    (0, 0), (1, 0), (2, 0), (2, 1), (1, 1), (1, 2), (0, 2), (0, 1),
)

# The classic chair substitution: four quarter-turns of the tile, none
# reflected. (The L-tromino is mirror-symmetric about its diagonal, so the
# search finds this dissection in several equivalent guises; this is the
# reflection-free one.)
_CHAIR_CHILDREN: tuple[_Placement, ...] = (
    (0, 0, (0, 0)),
    (3, 0, (0, 4)),
    (0, 0, (1, 1)),
    (1, 0, (4, 0)),
)

CHAIR = _Substitution("chair", _CHAIR_OUTLINE, _CHAIR_CHILDREN, 2, 4,
                      _square_rotate, _square_mirror, _times(2), _square_to_xy)

# The Sierpinski carpet: the unit square, tripled and refilled with the
# eight subsquares of the 3x3 block that are not its centre. The children
# leave the middle ninth empty -- the square is no rep-tile and this is no
# dissection -- and that hole, repeated at every scale, is the whole point.
_SQUARE_OUTLINE: tuple[Point, ...] = ((0, 0), (1, 0), (1, 1), (0, 1))

_CARPET_CHILDREN: tuple[_Placement, ...] = tuple(
    (0, 0, (x, y)) for y in range(3) for x in range(3) if (x, y) != (1, 1)
)

CARPET = _Substitution("carpet", _SQUARE_OUTLINE, _CARPET_CHILDREN, 3, 4,
                       _square_rotate, _square_mirror, _times(3), _square_to_xy)

# The pentaflake (Duerer's pentagon): the unit pentagon is the one of
# circumradius 1 with a vertex on the real axis, so its corners are the five
# even powers of zeta, walked counterclockwise.
_PENTAGON_OUTLINE: tuple[Point, ...] = (
    (1, 0, 0, 0),     # zeta**0
    (0, 0, 1, 0),     # zeta**2
    (-1, 1, -1, 1),   # zeta**4
    (0, -1, 0, 0),    # zeta**6
    (0, 0, 0, -1),    # zeta**8
)

# Scaled by phi**2 the pentagon holds six: one seated in each corner, sharing
# that corner with the parent, plus one in the middle turned a half turn (a
# pentagon has no half turn of its own, so the middle child is the only thing
# that breaks the parent's five-fold symmetry down to the substitution's).
# A corner child's centre is phi*zeta**2k -- the parent's circumradius phi**2
# less the child's 1, along the corner -- and phi = 1 + zeta**2 - zeta**3 is
# itself in the ring, so the translations are exact.
#
# The middle child shares a whole edge with each corner child, and adjacent
# corner children meet at a single point (that same edge's end, where three
# pentagons and 3*108 = 324 degrees meet). The 36 degrees left over at each
# of the five sides is the gap: a golden gnomon, and the reason this is a
# fractal with holes and not a dissection.
_PENTAFLAKE_CHILDREN: tuple[_Placement, ...] = (
    (0, 0, (1, 0, 1, -1)),    # phi*zeta**0
    (0, 0, (0, 1, 0, 1)),     # phi*zeta**2
    (0, 0, (-1, 0, 0, 1)),    # phi*zeta**4
    (0, 0, (-1, 0, -1, 0)),   # phi*zeta**6
    (0, 0, (1, -1, 0, -1)),   # phi*zeta**8
    (5, 0, (0, 0, 0, 0)),     # the middle one, turned a half turn
)

PENTAFLAKE = _Substitution("pentaflake", _PENTAGON_OUTLINE, _PENTAFLAKE_CHILDREN,
                           (3 + 5 ** 0.5) / 2, 10,
                           _penta_rotate, _penta_mirror, _penta_scale,
                           _penta_to_xy)

SUBSTITUTIONS = {tile.mode: tile
                 for tile in (SPHINX, CHAIR, CARPET, PENTAFLAKE)}


def _linear(tile: _Substitution, rot: int, mirrored: int, p: Point) -> Point:
    """The rotation/mirror part of a placement, applied to a lattice point."""
    if mirrored:
        p = tile.mirror(p)
    for _ in range(rot % tile.order):
        p = tile.rotate(p)
    return p


def place_point(tile: _Substitution, at: _Placement, p: Point) -> Point:
    rot, mirrored, translation = at
    return tuple(c + t for c, t in zip(_linear(tile, rot, mirrored, p), translation))


def _compose(tile: _Substitution, parent: _Placement, child: _Placement) -> _Placement:
    """``parent`` after ``child``. Mirroring negates the inner rotation and is
    the only thing the mirror flag costs, as for the Spectre."""
    p_rot, p_mirror, p_translation = parent
    c_rot, c_mirror, c_translation = child
    moved = _linear(tile, p_rot, p_mirror, c_translation)
    return (
        (p_rot - c_rot if p_mirror else p_rot + c_rot) % tile.order,
        p_mirror ^ c_mirror,
        tuple(c + t for c, t in zip(moved, p_translation)),
    )


def _inflate(tile: _Substitution, p: Point, power: int) -> Point:
    """``p`` scaled by ``factor**power``, exactly. Only ever multiplies: the
    pentaflake's factor is irrational, so there is no dividing back down."""
    for _ in range(power):
        p = tile.scale(p)
    return p


def substitution_placements(tile: _Substitution, levels: int) -> list[_Placement]:
    """The ``len(children)**levels`` unit tiles of a level-``levels`` supertile.

    Substitutes from the top down: the first round's children are supertiles of
    edge ``factor**(levels - 1)`` and the last round's are unit tiles. Their
    translations are given in units of their own tile, so inflating them to the
    round's size keeps every placement an exact lattice point.
    """
    if levels < 0:
        raise ValueError("levels must be >= 0")
    placements = [(0, 0, tile.origin)]
    for power in reversed(range(levels)):
        children = [(rot, mirrored, _inflate(tile, translation, power))
                    for rot, mirrored, translation in tile.children]
        placements = [_compose(tile, parent, child)
                      for parent in placements
                      for child in children]
    return placements


def _substitution_board(tile: _Substitution, levels: int, mine_count: int,
                        scale: float) -> Board:
    cells: dict[Cell, list[Point]] = {}
    for at in substitution_placements(tile, levels):
        rot, mirrored, translation = at
        # a mirrored placement reverses the outline's winding; walk it
        # backwards so every cell's polygon stays counterclockwise
        outline = reversed(tile.outline) if mirrored else tile.outline
        cells[(rot, mirrored, *translation)] = [
            place_point(tile, at, v) for v in outline
        ]
    if len(cells) != len(tile.children) ** levels:
        raise ValueError("substitution produced overlapping placements")
    return _finalize_flat(tile.mode, cells, tile.to_xy, mine_count, scale)


def sphinx_board(levels: int, mine_count: int, scale: float = 26) -> Board:
    """The sphinx rep-tile, inflated ``levels`` times: 4**levels sphinxes
    filling one sphinx-shaped patch (1, 4, 16, 64, 256, 1024 tiles).
    ``scale`` is pixels per unit triangle edge."""
    return _substitution_board(SPHINX, levels, mine_count, scale)


def chair_board(levels: int, mine_count: int, scale: float = 26) -> Board:
    """The chair (L-tromino) rep-tile, inflated ``levels`` times:
    4**levels chairs filling one L-shaped patch. ``scale`` is pixels per
    unit square edge."""
    return _substitution_board(CHAIR, levels, mine_count, scale)


def carpet_board(levels: int, mine_count: int, scale: float = 26) -> Board:
    """The Sierpinski carpet, inflated ``levels`` times: 8**levels unit
    squares in a 3**levels square patch (1, 8, 64, 512, 4096 tiles), the
    middle ninth of every block left out at every scale. ``scale`` is
    pixels per unit square edge."""
    return _substitution_board(CARPET, levels, mine_count, scale)


def pentaflake_board(levels: int, mine_count: int, scale: float = 26) -> Board:
    """The pentaflake, inflated ``levels`` times: 6**levels regular pentagons
    in a pentagon-shaped patch (1, 6, 36, 216, 1296 tiles), with a gnomon-shaped
    gap left over per side at every scale. ``scale`` is pixels per unit
    pentagon circumradius."""
    return _substitution_board(PENTAFLAKE, levels, mine_count, scale)
