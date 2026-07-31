"""Rep-tile (self-similar) flat boards: the sphinx and the chair.

A *rep-tile* is a polygon that tiles a scaled copy of itself. Both boards
here are rep-4: four half-size copies of the tile fill it exactly, so
inflating a single tile ``levels`` times gives a patch of 4**levels tiles
whose outline is the tile again, scaled. That self-similar outline is the
board -- these are the fractal family, and unlike every other flat board
they are deliberately *not* a rectangular window: trimming the patch to a
square block would throw away the only thing that makes them what they
are (the same exception the shaped boards make, and for the same reason).

The substitutions:

  * The **sphinx** is the pentagonal hexiamond -- six unit triangles, sides
    3, 1, 1, 1, 2 -- on the triangular lattice. Its rep-4 dissection is
    *unique*: an exact-cover search of the size-2 sphinx by unit sphinxes
    finds exactly the one arrangement in ``_SPHINX_CHILDREN`` (three of the
    four children reflected), which ``TestSphinx`` re-derives.
  * The **chair** (the L-tromino) is three unit squares. Its rep-4
    dissection is the classic chair substitution: four copies at the four
    quarter-turns, none reflected.

Both lattices are integer, and every child translation is the parent's
scaled by a power of two, so a placement stays an exact ``(rotation,
mirror, integer translation)`` triple all the way down -- no floating
point enters the substitution and vertex ids need no tolerance, exactly as
for the Spectre in ``aperiodic.py``.

Tile outlines carry a vertex at *every* lattice point along their edges,
not just at their corners. The tiles are not edge to edge (a neighbour
plants a corner in the middle of the sphinx's long side), and those extra
collinear ids are what let ``_shared_vertex_adjacency`` see the neighbour
-- the bargain ``_insert_t_vertices`` makes for the isogonal tilings and
the Spectre makes for its 14th corner. Being collinear they do not change
the drawn tile, and ``shapeMetrics``/``corners`` drop them before
measuring, so the sphinx still reads as a pentagon and the chair as a
hexagon.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Callable

from minesweeper.boards.core import ROOT3, Board, Cell, LatticePoint, _finalize_flat

# A placement is the rigid motion x -> R^rot (M^mirror x) + translation, with
# R the lattice's smallest rotation and M its mirror: an integer rotation
# index, a mirror flag and an exact lattice translation. Composition (below)
# is integer arithmetic only.
_Placement = tuple[int, int, LatticePoint]

_IDENTITY: _Placement = (0, 0, (0, 0))


# -- the two lattices --------------------------------------------------------
#
# Triangular lattice: (a, b) stands for a*(1, 0) + b*(1/2, sqrt3/2), so a
# 60-degree rotation and a mirror are both integer maps.


def _tri_rotate(p: LatticePoint) -> LatticePoint:
    a, b = p
    return (-b, a + b)


def _tri_mirror(p: LatticePoint) -> LatticePoint:
    a, b = p
    return (a + b, -b)


def _tri_to_xy(p: LatticePoint) -> tuple[float, float]:
    a, b = p
    return (a + b / 2, b * ROOT3 / 2)


def _square_rotate(p: LatticePoint) -> LatticePoint:
    x, y = p
    return (-y, x)


def _square_mirror(p: LatticePoint) -> LatticePoint:
    x, y = p
    return (x, -y)


def _square_to_xy(p: LatticePoint) -> tuple[float, float]:
    return (float(p[0]), float(p[1]))


@dataclass(frozen=True)
class _RepTile:
    """One rep-4 tile: its unit outline, its dissection, and its lattice."""
    mode: str
    outline: tuple[LatticePoint, ...]      # unit tile, a vertex per lattice
    #                                        step along every edge, CCW
    children: tuple[_Placement, ...]       # the unit tiles of a size-2 tile
    order: int                             # rotation order of the lattice
    rotate: Callable[[LatticePoint], LatticePoint]
    mirror: Callable[[LatticePoint], LatticePoint]
    to_xy: Callable[[LatticePoint], tuple[float, float]]

    def corners(self) -> tuple[LatticePoint, ...]:
        """The outline's real corners -- the collinear step vertices dropped."""
        pts = self.outline
        keep = []
        for i, p in enumerate(pts):
            before, after = pts[i - 1], pts[(i + 1) % len(pts)]
            turn = ((p[0] - before[0]) * (after[1] - p[1])
                    - (p[1] - before[1]) * (after[0] - p[0]))
            if turn:
                keep.append(p)
        return tuple(keep)


# The sphinx: bottom edge 3, then 1 up-left, 1 left, 1 up-left, 2 down-left,
# walked counterclockwise with a vertex at every lattice step.
_SPHINX_OUTLINE: tuple[LatticePoint, ...] = (
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

SPHINX = _RepTile("sphinx", _SPHINX_OUTLINE, _SPHINX_CHILDREN, 6,
                  _tri_rotate, _tri_mirror, _tri_to_xy)

# The chair (L-tromino): three unit squares, again with a vertex at every
# lattice step along the two long edges.
_CHAIR_OUTLINE: tuple[LatticePoint, ...] = (
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

CHAIR = _RepTile("chair", _CHAIR_OUTLINE, _CHAIR_CHILDREN, 4,
                 _square_rotate, _square_mirror, _square_to_xy)

REP_TILES = {tile.mode: tile for tile in (SPHINX, CHAIR)}


def _linear(tile: _RepTile, rot: int, mirrored: int,
            p: LatticePoint) -> LatticePoint:
    """The rotation/mirror part of a placement, applied to a lattice point."""
    if mirrored:
        p = tile.mirror(p)
    for _ in range(rot % tile.order):
        p = tile.rotate(p)
    return p


def place_point(tile: _RepTile, at: _Placement, p: LatticePoint) -> LatticePoint:
    rot, mirrored, (tx, ty) = at
    x, y = _linear(tile, rot, mirrored, p)
    return (x + tx, y + ty)


def _compose(tile: _RepTile, parent: _Placement, child: _Placement,
             size: int) -> _Placement:
    """``parent`` after ``child``, with the child's translation scaled to
    ``size`` (its tile's edge unit). Mirroring negates the inner rotation
    and is the only thing the mirror flag costs, as for the Spectre."""
    p_rot, p_mirror, (px, py) = parent
    c_rot, c_mirror, (cx, cy) = child
    dx, dy = _linear(tile, p_rot, p_mirror, (cx * size, cy * size))
    return (
        (p_rot - c_rot if p_mirror else p_rot + c_rot) % tile.order,
        p_mirror ^ c_mirror,
        (px + dx, py + dy),
    )


def rep_placements(tile: _RepTile, levels: int) -> list[_Placement]:
    """The 4**``levels`` unit tiles of a level-``levels`` supertile.

    Starts from one tile of edge 2**levels and substitutes downwards, halving
    the edge each round; the children's translations are given in units of
    their own (half-size) tile, so scaling them by that size keeps every
    placement an exact lattice point.
    """
    if levels < 0:
        raise ValueError("levels must be >= 0")
    placements = [_IDENTITY]
    size = 1 << levels
    for _ in range(levels):
        size //= 2
        placements = [_compose(tile, parent, child, size)
                      for parent in placements
                      for child in tile.children]
    return placements


def _rep_board(tile: _RepTile, levels: int, mine_count: int,
               scale: float) -> Board:
    cells: dict[Cell, list[LatticePoint]] = {}
    for at in rep_placements(tile, levels):
        rot, mirrored, (tx, ty) = at
        # a mirrored placement reverses the outline's winding; walk it
        # backwards so every cell's polygon stays counterclockwise
        outline = reversed(tile.outline) if mirrored else tile.outline
        cells[(rot, mirrored, tx, ty)] = [
            place_point(tile, at, v) for v in outline
        ]
    if len(cells) != 4 ** levels:
        raise ValueError("substitution produced overlapping placements")
    return _finalize_flat(tile.mode, cells, tile.to_xy, mine_count, scale)


def sphinx_board(levels: int, mine_count: int, scale: float = 26) -> Board:
    """The sphinx rep-tile, inflated ``levels`` times: 4**levels sphinxes
    filling one sphinx-shaped patch (1, 4, 16, 64, 256, 1024 tiles).
    ``scale`` is pixels per unit triangle edge."""
    return _rep_board(SPHINX, levels, mine_count, scale)


def chair_board(levels: int, mine_count: int, scale: float = 26) -> Board:
    """The chair (L-tromino) rep-tile, inflated ``levels`` times:
    4**levels chairs filling one L-shaped patch. ``scale`` is pixels per
    unit square edge."""
    return _rep_board(CHAIR, levels, mine_count, scale)
