"""Self-similar flat boards, in two menu families. The **rep-tiles** -- the
sphinx, the chair, the L-tetromino, the P-pentomino, the trapezoid, the right
trapezoid, the half trapezoid, the stretched chair, the rhombic L, the
isosceles right triangle, the 30-60-90 triangle, the T-tetromino and the
five-triangle -- and the **fractals** -- the Sierpinski carpet, the pentaflake
and the Gosper island.

Each is one tile inflated ``levels`` times: the tile is scaled up by the
substitution's ``factor`` and refilled with copies of itself, so the patch
grows by ``len(children)`` per level and its outline converges on a
self-similar shape -- the tile again for all but the last, the Gosper island
for that one. That outline is the board, and unlike every other flat board
these are deliberately *not* a rectangular window: trimming the patch to a
square block would throw away the only thing that makes them what they are
(the same exception the shaped boards make, and for the same reason).

A rep-tile's n children fill the tile grown by sqrt(n) exactly -- four for
most, two, three, sixteen and five for the last four -- so its patch is the
tile again, scaled, with no hole and a straight edge; that is the whole
Rep-tiles family. The other three leave holes (the carpet, the pentaflake) or
grow a rough edge (the Gosper island), and those are the Fractals.

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
  * The **L-tetromino** (four squares) and the **P-pentomino** (five) are
    the next two polyomino rep-4 tiles; the L has a reflection-free
    dissection, the P none. (The other tetrominoes -- T, S/Z -- have no
    dissection into four or nine copies of themselves, so are no rep-tiles.)
  * The **trapezoid** is the triamond, half a regular hexagon, on the
    triangular lattice: three children round its edge and one upside down
    in the middle.
  * The **right trapezoid** (a square and half a square, on the square
    lattice) and the **half trapezoid** (a doubled triamond cut down its
    mirror line, on the triangular one) are the two quadrilaterals: chiral,
    each with one dissection, and each with a side that crosses the lattice's
    unit faces (a square's diagonal, a triangle's median) rather than
    running along them. The **stretched chair** (the chair drawn out into
    dominoes) and the **rhombic L** (the L-tetromino sheared into rhombi)
    are the two remaining rep-4 polyforms an exhaustive search turns up --
    up to eleven squares and ten triangles -- once the triangles,
    parallelograms and the four tiles above are set aside. All four
    dissections are unique and all four reflect a child.
  * The **isosceles right triangle** (rep-2) and the **30-60-90 triangle**
    (rep-3) inflate by the Gaussian integer 1 + i and the Eisenstein integer
    1 + zeta: sqrt2 and sqrt3, turning 45 and 30 degrees a level. The
    30-60-90 triangle reflects two children, which a turning inflation does
    not commute with, hence ``twist``; both stand each level the same way up
    on the board, hence ``upright``. Both are edge to edge.
  * The **T-tetromino** is rep-16: four Ts fill a 4x4 square, as a pinwheel of
    quarter turns, so the T grown fourfold is four such blocks.
  * The **five-triangle** -- the 1:2 right triangle, rep-5 -- is the one no
    placement can describe, and has a builder of its own at the end of the
    module.
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
  * The **Gosper island** is the one whose *boundary* is the fractal. Its
    tile is a plain regular hexagon and its patch has no holes at all; what
    is self-similar is the outline, which converges on the Gosper island --
    the closed curve the flowsnake draws, of dimension log3/log(sqrt7) =
    1.129, and a level-n patch has 7**n hexagons behind only 6*3**n
    boundary edges, which is that dimension counted out.
    The hexagon is no rep-tile -- seven of them make a flower, not a bigger
    hexagon -- so unlike the first four this substitution has nothing to
    inflate but the *patch*: seven level-(n-1) islands, one in the middle
    and six around it, are the level-n island. The inflation is
    multiplication by the Eisenstein integer 2 + zeta, of norm 7, so it is
    a *spiral* similarity: sqrt7 at 19.106 degrees. It could not be
    anything else -- scaling by sqrt7 alone would send the lattice point 1
    to (sqrt7, 0), which is no lattice point -- and that forced turn per
    level is exactly why the island's edge is fractal while the hexagons'
    own edges stay hexagon edges.

Every child translation is the parent's scaled by a power of the factor,
so a placement stays an exact ``(rotation, mirror, lattice translation)``
triple all the way down -- no floating point enters the substitution and
vertex ids need no tolerance, exactly as for the Spectre in
``aperiodic.py``. That is why the inflation only ever *multiplies* by the
factor (``_inflate``): the three integer lattices could divide it out
again, but phi**2 is irrational and Z[zeta10] is dense in the plane, so
there is no rounding back to a lattice to fall back on.

The rep-tiles' outlines, bar the trapezoid's, carry a vertex at *every*
lattice point along their edges, not just at their corners. Those tilings
are not edge to edge (a
neighbour plants a corner in the middle of the sphinx's long side), and the
extra collinear ids are what let ``_shared_vertex_adjacency`` see the
neighbour -- the bargain ``_insert_t_vertices`` makes for the isogonal
tilings and the Spectre makes for its 14th corner. Being collinear they do
not change the drawn tile, and ``shapeMetrics``/``corners`` drop them before
measuring, so the sphinx still reads as a pentagon and the chair as a
hexagon. The trapezoid, the carpet, the pentaflake and the Gosper island need
none of that: their tiles meet edge to edge, corner to corner.
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


def _gosper_scale(p: Point) -> Point:
    """Multiply by 2 + zeta, the Gosper island's inflation.

    The triangular lattice is the ring of Eisenstein integers Z[zeta],
    zeta = exp(i*pi/3), and 2 + zeta is one of its elements of norm 7 --
    length sqrt7, argument atan(sqrt3/5) = 19.106 degrees. Scaling by
    sqrt7 alone would leave the lattice (it would send 1 to (sqrt7, 0),
    and the ring's real elements are the integers), so an inflation of
    seven *must* turn as it stretches. (zeta**2 = zeta - 1, whence
    (a + b*zeta)(2 + zeta) = (2a - b) + (a + 3b)*zeta.)
    """
    a, b = p
    return (2 * a - b, a + 3 * b)


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


def _square_turn(p: Point) -> Point:
    """Multiply by 1 + i, the isosceles right triangle's inflation: sqrt2 at
    45 degrees, the square lattice's own Gaussian integer of norm 2. Scaling
    by sqrt2 alone would leave the lattice, so -- as for the Gosper island --
    the inflation turns as it stretches."""
    x, y = p
    return (x - y, x + y)


def _drafter_scale(p: Point) -> Point:
    """Multiply by 1 + zeta, the 30-60-90 triangle's inflation: sqrt3 at 30
    degrees, the Eisenstein integer of norm 3. (zeta**2 = zeta - 1, whence
    (a + b*zeta)(1 + zeta) = (a - b) + (a + 2b)*zeta.)"""
    a, b = p
    return (a - b, a + 2 * b)


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
    #                                        irrational -- see TestFractals).
    #                                        A similarity, not necessarily a
    #                                        pure scaling: the Gosper island's
    #                                        turns as it stretches
    to_xy: Callable[[Point], tuple[float, float]]
    twist: int = 0                         # how far `scale` turns a mirror, in
    #                                        rotation steps: s**p M s**-p =
    #                                        R**(p*twist) M. Zero for a pure
    #                                        scaling; 1 for the two right
    #                                        triangles, whose inflation turns
    #                                        by half a lattice step (2*arg(s)
    #                                        is one step) -- see
    #                                        substitution_placements
    upright: float | None = None           # for a turning inflation: the
    #                                        turn, in degrees, that stands the
    #                                        unit tile the way the board is
    #                                        drawn. Every level's patch is then
    #                                        turned back by the inflation's
    #                                        accumulated turn and by this, so
    #                                        all levels are drawn the same way
    #                                        up (vertex ids stay on the
    #                                        lattice; only the drawing turns)

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

# The L-tetromino: four unit squares, three in a row and one on the left end,
# with a vertex at every lattice step along each edge.
_LTETROMINO_OUTLINE: tuple[Point, ...] = (
    (0, 0), (1, 0), (2, 0), (3, 0), (3, 1), (2, 1), (1, 1), (1, 2), (0, 2),
    (0, 1),
)

# The L has no symmetry of its own, so the search's four dissections are four
# different ones; this is the only one with no child reflected -- four
# quarter-turns, as for the chair.
_LTETROMINO_CHILDREN: tuple[_Placement, ...] = (
    (0, 0, (2, 0)),
    (1, 0, (2, 0)),
    (2, 0, (6, 2)),
    (3, 0, (0, 4)),
)

LTETROMINO = _Substitution("ltetromino", _LTETROMINO_OUTLINE,
                           _LTETROMINO_CHILDREN, 2, 4, _square_rotate,
                           _square_mirror, _times(2), _square_to_xy)

# The P-pentomino: a 2x2 block of unit squares with a fifth on top of its
# left column.
_PPENTOMINO_OUTLINE: tuple[Point, ...] = (
    (0, 0), (1, 0), (2, 0), (2, 1), (2, 2), (1, 2), (1, 3), (0, 3), (0, 2),
    (0, 1),
)

# The P has two dissections and neither is reflection-free; this one
# reflects two children of the four, the other three.
_PPENTOMINO_CHILDREN: tuple[_Placement, ...] = (
    (0, 0, (0, 0)),
    (0, 1, (0, 6)),
    (2, 1, (4, 0)),
    (3, 0, (1, 4)),
)

PPENTOMINO = _Substitution("ppentomino", _PPENTOMINO_OUTLINE,
                           _PPENTOMINO_CHILDREN, 2, 4, _square_rotate,
                           _square_mirror, _times(2), _square_to_xy)

# The trapezoid (the triamond, half a hexagon): three unit triangles, a long
# base of 2 under a top of 1. Corners only: unlike the other four rep-tiles
# its substitution is edge to edge -- a long side only ever meets a long
# side -- so there is no T-vertex for a step vertex to record.
_TRAPEZOID_OUTLINE: tuple[Point, ...] = ((0, 0), (2, 0), (1, 1), (0, 1))

# Its dissection is unique: three children round the edge and one upside down
# in the middle. The tile is mirror-symmetric, so every child can be written
# reflected or not -- sixteen ways in all -- and this is the reflection-free one.
_TRAPEZOID_CHILDREN: tuple[_Placement, ...] = (
    (0, 0, (1, 0)),
    (2, 0, (4, 0)),
    (3, 0, (2, 2)),
    (4, 0, (0, 2)),
)

TRAPEZOID = _Substitution("trapezoid", _TRAPEZOID_OUTLINE, _TRAPEZOID_CHILDREN,
                          2, 6, _tri_rotate, _tri_mirror, _times(2), _tri_to_xy)

# The right trapezoid: a unit square with half a square (cut along its
# diagonal) under it -- parallel sides 1 and 2, one slanted side at 45
# degrees. It is the one rep-4 polyabolo (a shape of half-squares) that is
# not a triangle or a parallelogram, and it is chiral. Its slanted side runs
# corner to corner of a unit square, so it has no lattice point in between
# to step through; the two square sides and the long side carry theirs.
_RIGHT_TRAPEZOID_OUTLINE: tuple[Point, ...] = (
    (0, 0), (1, 1), (1, 2), (0, 2), (0, 1),
)

# Its dissection is unique, and one child of the four is reflected.
_RIGHT_TRAPEZOID_CHILDREN: tuple[_Placement, ...] = (
    (0, 0, (0, 0)),
    (0, 0, (1, 1)),
    (0, 1, (0, 4)),
    (3, 0, (0, 4)),
)

RIGHT_TRAPEZOID = _Substitution("righttrapezoid", _RIGHT_TRAPEZOID_OUTLINE,
                                _RIGHT_TRAPEZOID_CHILDREN, 2, 4, _square_rotate,
                                _square_mirror, _times(2), _square_to_xy)

# The half trapezoid: a triamond twice the size, cut in two down its mirror
# line -- parallel sides 2 and 1, two right angles, a 60-degree corner and a
# 120-degree one. The cut halves unit triangles, so it is no polyiamond, but
# every corner is still a lattice point (the cut runs from the middle of the
# long base, a lattice point at that size, to the middle of the top). Like
# the right trapezoid it is chiral. The upright side has no lattice point in
# between; the base and the slanted side carry theirs.
_HALF_TRAPEZOID_OUTLINE: tuple[Point, ...] = (
    (0, 0), (1, 0), (2, 0), (1, 2), (0, 2), (0, 1),
)

# Its dissection is unique, and two children of the four are reflected.
_HALF_TRAPEZOID_CHILDREN: tuple[_Placement, ...] = (
    (0, 0, (2, 0)),
    (0, 1, (0, 4)),
    (1, 1, (0, 0)),
    (4, 0, (0, 4)),
)

HALF_TRAPEZOID = _Substitution("halftrapezoid", _HALF_TRAPEZOID_OUTLINE,
                               _HALF_TRAPEZOID_CHILDREN, 2, 6, _tri_rotate,
                               _tri_mirror, _times(2), _tri_to_xy)

# The stretched chair: the chair with each square drawn out into an upright
# domino -- a 2x2 block with a column of two on its left. (Of the polyominoes
# up to eleven squares, it and the chair stretched threefold are the only
# rep-4 ones besides the chair, the L-tetromino and the P-pentomino.) Being
# stretched it cannot use the chair's quarter turns: its unique dissection
# turns one child a half turn and reflects two.
_STRETCHED_CHAIR_OUTLINE: tuple[Point, ...] = (
    (0, 0), (1, 0), (2, 0), (2, 1), (2, 2), (1, 2), (1, 3), (1, 4), (0, 4),
    (0, 3), (0, 2), (0, 1),
)

_STRETCHED_CHAIR_CHILDREN: tuple[_Placement, ...] = (
    (0, 0, (0, 0)),
    (0, 0, (1, 2)),
    (0, 1, (0, 8)),
    (2, 1, (4, 0)),
)

STRETCHED_CHAIR = _Substitution("stretchedchair", _STRETCHED_CHAIR_OUTLINE,
                                _STRETCHED_CHAIR_CHILDREN, 2, 4, _square_rotate,
                                _square_mirror, _times(2), _square_to_xy)

# The rhombic L: four 60-degree rhombi in the shape of the L-tetromino, three
# up a column and one beside the top -- the L sheared onto the triangular
# lattice, eight unit triangles. It is the one rep-4 polyiamond up to ten
# triangles that is not a triangle, a parallelogram, the trapezoid or the
# sphinx. Shearing kept no quarter turn, so it cannot reuse the L's
# reflection-free dissection: its own is unique and reflects two children.
_RHOMBIC_L_OUTLINE: tuple[Point, ...] = (
    (0, 0), (1, 0), (1, 1), (1, 2), (2, 2), (2, 3), (1, 3), (0, 3), (0, 2),
    (0, 1),
)

_RHOMBIC_L_CHILDREN: tuple[_Placement, ...] = (
    (0, 0, (0, 1)),
    (1, 1, (1, 4)),
    (3, 0, (2, 3)),
    (4, 1, (3, 6)),
)

RHOMBIC_L = _Substitution("rhombicl", _RHOMBIC_L_OUTLINE, _RHOMBIC_L_CHILDREN,
                          2, 6, _tri_rotate, _tri_mirror, _times(2), _tri_to_xy)

# The isosceles right triangle -- half a square, cut corner to corner -- is
# rep-2: its altitude cuts it into two copies of itself, each sqrt2 smaller
# and turned 45 degrees. Its hypotenuse lies along the x axis, two lattice
# edges long, and its legs run diagonally across unit squares to the right
# angle at (1, 1). Corners only: like the trapezoid's, its substitution is
# edge to edge -- a hypotenuse only ever meets a hypotenuse, a leg a leg --
# so there is no T-vertex for a step vertex to record.
_RIGHT_ISOSCELES_OUTLINE: tuple[Point, ...] = ((0, 0), (2, 0), (1, 1))

# The two halves of the inflated tile, right angle to right angle at the
# middle of its hypotenuse. The tile is mirror-symmetric, so each could be
# written reflected as well; these are the reflection-free ones.
_RIGHT_ISOSCELES_CHILDREN: tuple[_Placement, ...] = (
    (3, 0, (0, 2)),
    (2, 0, (2, 2)),
)

RIGHT_ISOSCELES = _Substitution("rightisosceles", _RIGHT_ISOSCELES_OUTLINE,
                                _RIGHT_ISOSCELES_CHILDREN, 2 ** 0.5, 4,
                                _square_rotate, _square_mirror, _square_turn,
                                _square_to_xy, twist=1, upright=135)

# The 30-60-90 triangle (the "drafter", half an equilateral triangle) is
# rep-3: three copies, sqrt3 smaller and turned 30 degrees, meet at the
# centre of the equilateral triangle it is half of. Its hypotenuse lies along
# the lattice axis, two edges long, and the right angle is at (1, 1), so its
# long leg crosses unit triangles down their medians. Edge to edge, so corners
# only. It is chiral, so the dissection cannot avoid reflecting a child: two
# of the three are.
_DRAFTER_OUTLINE: tuple[Point, ...] = ((0, 0), (2, 0), (1, 1))

_DRAFTER_CHILDREN: tuple[_Placement, ...] = (
    (1, 1, (0, 0)),
    (3, 0, (2, 2)),
    (3, 1, (2, 2)),
)

DRAFTER = _Substitution("drafter", _DRAFTER_OUTLINE, _DRAFTER_CHILDREN,
                        3 ** 0.5, 6, _tri_rotate, _tri_mirror, _drafter_scale,
                        _tri_to_xy, twist=1, upright=150)

# The T-tetromino: three unit squares in a row and one on top of the middle,
# a vertex at every lattice step. It is no rep-4 tile, but four Ts fill a 4x4
# square -- a pinwheel of quarter turns -- so the T scaled by four is its four
# squares, each a block of four Ts: rep-16.
_TTETROMINO_OUTLINE: tuple[Point, ...] = (
    (0, 0), (1, 0), (2, 0), (3, 0), (3, 1), (2, 1), (2, 2), (1, 2), (1, 1),
    (0, 1),
)

# Four blocks, the same pinwheel in each, none reflected.
_TTETROMINO_CHILDREN: tuple[_Placement, ...] = tuple(
    (rot, 0, (x + bx, y + by))
    for bx, by in ((0, 0), (4, 0), (8, 0), (4, 4))
    for rot, (x, y) in ((2, (3, 4)), (1, (4, 1)), (0, (1, 0)), (3, (0, 3)))
)

TTETROMINO = _Substitution("ttetromino", _TTETROMINO_OUTLINE,
                           _TTETROMINO_CHILDREN, 4, 4, _square_rotate,
                           _square_mirror, _times(4), _square_to_xy)

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

# The Gosper island: the unit regular hexagon of circumradius 1, its corners
# the six units of the lattice (zeta**k, walked counterclockwise). Hexagon
# centres are the sublattice of index 3 generated by theta = 1 + zeta
# (length sqrt3, 30 degrees) -- one step from a hexagon to a neighbour.
_HEXAGON_OUTLINE: tuple[Point, ...] = (
    (1, 0), (0, 1), (-1, 1), (-1, 0), (0, -1), (1, -1),
)

# The flower: the hexagon itself plus its six neighbours, at theta*zeta**k.
# Those seven translations are a complete set of residues modulo 2 + zeta --
# {0} and the six units, one per nonzero class of Z[zeta]/(2 + zeta) = F7 --
# which is what makes the flower tile the plane by the inflated lattice and
# the inflation a bijection on digit strings: the level-n patch is exactly
# the 7**n sums of theta * sum(d_k * (2 + zeta)**k), all distinct.
#
# Every child is a plain translation. The turn is in the inflation instead:
# each level is laid down 19.106 degrees round from the one below, and it is
# that accumulated twist, not any gap, that roughens the island's edge.
_GOSPER_CHILDREN: tuple[_Placement, ...] = (
    (0, 0, (0, 0)),      # the middle of the flower
    (0, 0, (1, 1)),      # theta
    (0, 0, (-1, 2)),     # theta*zeta
    (0, 0, (-2, 1)),     # theta*zeta**2
    (0, 0, (-1, -1)),    # theta*zeta**3
    (0, 0, (1, -2)),     # theta*zeta**4
    (0, 0, (2, -1)),     # theta*zeta**5
)

GOSPER = _Substitution("gosper", _HEXAGON_OUTLINE, _GOSPER_CHILDREN,
                       7 ** 0.5, 6,
                       _tri_rotate, _tri_mirror, _gosper_scale, _tri_to_xy)

SUBSTITUTIONS = {tile.mode: tile
                 for tile in (SPHINX, CHAIR, LTETROMINO, PPENTOMINO, TRAPEZOID,
                              RIGHT_TRAPEZOID, HALF_TRAPEZOID, STRETCHED_CHAIR,
                              RHOMBIC_L, RIGHT_ISOSCELES, DRAFTER, TTETROMINO,
                              CARPET, PENTAFLAKE, GOSPER)}


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

    An inflation that turns (the two right triangles', the Gosper island's)
    does not commute with a mirror: s**p M = R**(p*twist) M s**p, so a
    reflected child picks up ``power * twist`` extra rotation steps at each
    round. (The Gosper island turns by an angle no lattice rotation matches,
    and gets away with it only because none of its children is reflected.)
    """
    if levels < 0:
        raise ValueError("levels must be >= 0")
    placements = [(0, 0, tile.origin)]
    for power in reversed(range(levels)):
        children = [(rot + power * tile.twist if mirrored else rot, mirrored,
                     _inflate(tile, translation, power))
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
    return _finalize_flat(tile.mode, cells, board_xy(tile, levels), mine_count,
                          scale)


def board_xy(tile: _Substitution, levels: int) -> Callable[[Point], tuple[float, float]]:
    """Where a level-``levels`` patch draws a lattice point. A tile with an
    ``upright`` is turned so every level stands the same way up: the right
    triangles' inflations turn 45 and 30 degrees a level, and left alone a
    patch would come out a corner at one level and a long thin triangle
    lying on its hypotenuse at the next."""
    if tile.upright is None:
        return tile.to_xy
    angle = math.radians(tile.upright - levels * tile.twist * 180 / tile.order)
    cos, sin = math.cos(angle), math.sin(angle)

    def to_xy(p: Point) -> tuple[float, float]:
        x, y = tile.to_xy(p)
        return (x * cos - y * sin, x * sin + y * cos)

    return to_xy


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


def ltetromino_board(levels: int, mine_count: int, scale: float = 26) -> Board:
    """The L-tetromino rep-tile, inflated ``levels`` times: 4**levels Ls
    filling one L-shaped patch. ``scale`` is pixels per unit square edge."""
    return _substitution_board(LTETROMINO, levels, mine_count, scale)


def ppentomino_board(levels: int, mine_count: int, scale: float = 26) -> Board:
    """The P-pentomino rep-tile, inflated ``levels`` times: 4**levels Ps
    filling one P-shaped patch. ``scale`` is pixels per unit square edge."""
    return _substitution_board(PPENTOMINO, levels, mine_count, scale)


def trapezoid_board(levels: int, mine_count: int, scale: float = 26) -> Board:
    """The trapezoid (triamond) rep-tile, inflated ``levels`` times:
    4**levels trapezoids filling one trapezoid-shaped patch. ``scale`` is
    pixels per unit triangle edge."""
    return _substitution_board(TRAPEZOID, levels, mine_count, scale)


def right_trapezoid_board(levels: int, mine_count: int, scale: float = 26) -> Board:
    """The right trapezoid (a square and a half) rep-tile, inflated ``levels``
    times: 4**levels trapezoids filling one trapezoid-shaped patch. ``scale``
    is pixels per unit square edge."""
    return _substitution_board(RIGHT_TRAPEZOID, levels, mine_count, scale)


def half_trapezoid_board(levels: int, mine_count: int, scale: float = 26) -> Board:
    """The half trapezoid (half a doubled triamond) rep-tile, inflated
    ``levels`` times: 4**levels half trapezoids filling one patch of the same
    shape. ``scale`` is pixels per unit triangle edge."""
    return _substitution_board(HALF_TRAPEZOID, levels, mine_count, scale)


def stretched_chair_board(levels: int, mine_count: int, scale: float = 26) -> Board:
    """The stretched chair (an L of three upright dominoes) rep-tile, inflated
    ``levels`` times: 4**levels of them filling one patch of the same shape.
    ``scale`` is pixels per unit square edge."""
    return _substitution_board(STRETCHED_CHAIR, levels, mine_count, scale)


def rhombic_l_board(levels: int, mine_count: int, scale: float = 26) -> Board:
    """The rhombic L (the L-tetromino sheared into four rhombi) rep-tile,
    inflated ``levels`` times: 4**levels of them filling one L-shaped patch.
    ``scale`` is pixels per unit triangle edge."""
    return _substitution_board(RHOMBIC_L, levels, mine_count, scale)


def right_isosceles_board(levels: int, mine_count: int, scale: float = 26) -> Board:
    """The isosceles right triangle rep-tile, inflated ``levels`` times:
    2**levels half-squares filling one triangle-shaped patch, turned a further
    45 degrees with every level. ``scale`` is pixels per unit square edge."""
    return _substitution_board(RIGHT_ISOSCELES, levels, mine_count, scale)


def drafter_board(levels: int, mine_count: int, scale: float = 26) -> Board:
    """The 30-60-90 triangle rep-tile, inflated ``levels`` times: 3**levels
    of them filling one triangle-shaped patch, turned a further 30 degrees
    with every level. ``scale`` is pixels per unit triangle edge (the tile's
    hypotenuse is two)."""
    return _substitution_board(DRAFTER, levels, mine_count, scale)


def ttetromino_board(levels: int, mine_count: int, scale: float = 26) -> Board:
    """The T-tetromino rep-tile, inflated ``levels`` times: 16**levels Ts
    filling one T-shaped patch. ``scale`` is pixels per unit square edge."""
    return _substitution_board(TTETROMINO, levels, mine_count, scale)


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


def gosper_board(levels: int, mine_count: int, scale: float = 26) -> Board:
    """The Gosper island, inflated ``levels`` times: 7**levels regular
    hexagons (1, 7, 49, 343, 2401 tiles) in a patch with no holes whose
    outline converges on the Gosper island -- and which is turned 19.106
    degrees further round with every level. ``scale`` is pixels per unit
    hexagon circumradius."""
    return _substitution_board(GOSPER, levels, mine_count, scale)


# -- the five-triangle ---------------------------------------------------------
#
# The 1:2 right triangle (legs 1 and 2, hypotenuse sqrt5) is rep-5: the
# altitude from the right angle cuts off one copy sqrt5 smaller, and what is
# left is a copy twice that size, cut rep-4 through the midpoints of its
# sides. Its inflation turns by atan(1/2) -- multiplication by 2 + i -- and
# every one of the five children is reflected, so the turn comes straight back
# off at the next level: each level's tiles take just the four quarter turns
# of one hand, the hand and a 26.57-degree tilt alternating level by level.
# The placement machinery above cannot say that, though. A reflected child's
# twist would be (2 + i) / (2 - i) = (3 + 4i) / 5, a rotation of no finite
# order, and the alternation only cancels it because *all* the children are
# reflected.
#
# Its famous relative is Conway and Radin's *pinwheel*, which halves the
# twice copy's middle rectangle (the corner at D and the middle child) along
# its other diagonal, from the right angle to the hypotenuse's middle. That
# reflects two of the five rather than all of them, and then the turn never
# cancels: the pinwheel's tiles point in ever more directions, dense in the
# limit. It also costs the board its game. Measured, the pinwheel's 125-cell
# patch leaves 22 cells with an indistinguishable twin and plays at a coin
# flip per mine, where this split leaves two and calibrates like any other
# board. So this one ships, under the GIF's own name for the tile.
#
# What does carry over exactly is the dissection's *affine* description. A
# triangle is held as its corners in role order (A, B, C): A the 26.57-degree
# corner, B the right angle, C the 63.43-degree corner. The split points are
# fixed rational combinations of those -- D = (A + 4C) / 5 is the foot of the
# altitude from B, the rest are midpoints -- and an affine rule applied to any
# similar triangle, reflected or not, is that triangle's own dissection. So
# the patch is cut from the top down with no rotations at all. Every level
# divides by at most 10 (a fifth, then a half), so a root ten**levels times
# the unit is cut into exact integer corners all the way down, and vertex ids
# need no tolerance, as on the lattices.
#
# The patch is not edge to edge -- the altitude foot lands two fifths of the
# way along a neighbour's leg, a midpoint in the middle of another's
# hypotenuse -- and the tilted levels have no lattice step to put a vertex on
# in advance. So ``_five_triangle_cells`` records the T-vertices afterwards
# instead: every corner that lies inside another tile's
# edge is inserted into that edge, exactly (integer collinearity), which is
# what ``_insert_t_vertices`` does for the isogonal tilings.

_Triangle = tuple[Point, Point, Point]


def _five_triangle_split(tri: _Triangle) -> list[_Triangle]:
    """The five children of one triangle, each in (A, B, C) role order."""
    a, b, c = tri

    def mix(*terms):
        """sum(weight * point) / denominator, exactly (it always divides)."""
        *weighted, denominator = terms
        x = sum(w * p[0] for w, p in weighted)
        y = sum(w * p[1] for w, p in weighted)
        assert x % denominator == 0 and y % denominator == 0
        return (x // denominator, y // denominator)

    d = mix((1, a), (4, c), 5)          # the foot of the altitude from B
    # (B, D, C): the one copy sqrt5 smaller, its small corner at B. (A, D, B)
    # is twice a copy, its right angle at D, cut through its midpoints.
    ad = mix((1, a), (1, d), 2)
    db = mix((1, d), (1, b), 2)
    ba = mix((1, b), (1, a), 2)
    return [
        (b, d, c),
        (a, ad, ba),         # the corner at A
        (ad, d, db),         # the corner at D
        (ba, db, b),         # the corner at B
        (db, ba, ad),        # the middle one, a half turn
    ]


def five_triangles(levels: int) -> list[_Triangle]:
    """The 5**levels triangles of a level-``levels`` five-triangle patch, in
    (A, B, C) role order, on the integer grid in which the root's short leg
    is 10**levels long: A = (0, 0), B = (2k, 0), C = (2k, k)."""
    if levels < 0:
        raise ValueError("levels must be >= 0")
    k = 10 ** levels
    triangles: list[_Triangle] = [((0, 0), (2 * k, 0), (2 * k, k))]
    for _ in range(levels):
        triangles = [child for tri in triangles for child in _five_triangle_split(tri)]
    return triangles


def _five_triangle_cells(levels: int) -> dict[Cell, list[Point]]:
    """Each triangle as a counterclockwise polygon carrying every T-vertex
    that lies on its edges."""
    triangles = five_triangles(levels)
    corners = {p for tri in triangles for p in tri}
    # bucket the corners on a grid about one tile across, so an edge only
    # looks at the corners near it
    size = max(1, 10 ** levels // 5 ** (levels // 2 + levels % 2))
    buckets: dict[tuple[int, int], list[Point]] = {}
    for p in corners:
        buckets.setdefault((p[0] // size, p[1] // size), []).append(p)

    def between(p: Point, q: Point) -> list[Point]:
        """The corners strictly inside segment pq, from p towards q."""
        found = []
        for bx in range(min(p[0], q[0]) // size, max(p[0], q[0]) // size + 1):
            for by in range(min(p[1], q[1]) // size, max(p[1], q[1]) // size + 1):
                for v in buckets.get((bx, by), ()):
                    if v in (p, q):
                        continue
                    cross = (q[0] - p[0]) * (v[1] - p[1]) - (q[1] - p[1]) * (v[0] - p[0])
                    dot = (v[0] - p[0]) * (q[0] - p[0]) + (v[1] - p[1]) * (q[1] - p[1])
                    length = (q[0] - p[0]) ** 2 + (q[1] - p[1]) ** 2
                    if cross == 0 and 0 < dot < length:
                        found.append((dot, v))
        return [v for _, v in sorted(found)]

    cells: dict[Cell, list[Point]] = {}
    for a, b, c in triangles:
        turn = (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0])
        ring = (a, b, c) if turn > 0 else (a, c, b)
        polygon: list[Point] = []
        for p, q in zip(ring, ring[1:] + ring[:1]):
            polygon.append(p)
            polygon.extend(between(p, q))
        cells[(*a, *b, *c)] = polygon
    return cells


def five_triangle_board(levels: int, mine_count: int, scale: float = 26) -> Board:
    """The five-triangle rep-tile -- the 1:2 right triangle -- cut ``levels``
    times: 5**levels triangles (1, 5, 25, 125, 625 tiles) filling one
    triangle-shaped patch. ``scale`` is
    pixels per the tile's short leg."""
    unit = 10 ** levels / 5 ** (levels / 2)

    def to_xy(p: Point) -> tuple[float, float]:
        return (p[0] / unit, p[1] / unit)

    return _finalize_flat("fivetriangle", _five_triangle_cells(levels), to_xy,
                          mine_count, scale)
