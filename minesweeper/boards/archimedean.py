"""Archimedean solids: the cuboctahedron, truncated octahedron and snub cube.

Every Archimedean solid is the **polar dual** of a Catalan solid, and
`catalan._catalan_faces` already builds those -- from a Platonic base, one
flag, and the Wythoff generating point of its Schwarz triangle
(`solids._wythoff_point`, or `catalan._snub_point` for the chiral one). So
nothing here solves for a point again; it turns a Catalan solid inside out:

* each Catalan **face** becomes an Archimedean **vertex**. The face's plane is
  ``<x, w> = 1`` for the generating point's image ``w`` -- every Catalan face
  sits at distance exactly 1 -- so the vertex is ``w`` itself, the plane's
  pole, on the unit sphere;
* each Catalan **vertex** becomes an Archimedean **face**: the poles of the
  Catalan faces around it, in order.

On the cube base that is ``join`` -> cuboctahedron, ``kis`` -> truncated
octahedron and ``gyro`` -> snub cube. The ids stay exact for free: an
Archimedean vertex is named by its Catalan face's key, which is itself a tuple
of the base's own incidences.

As with the Catalan solids, a 14- or 38-face solid is not a board, so every
face is **subdivided**, and ``frequency`` -- the cuts along each edge -- is
the one size knob. Triangles go through `catalan._tri_grid` and squares
through `catalan._quad_grid`, which name a shared edge's points the same way
whatever lies on either side of it. A hexagon cannot be cut into hexagons, so
the truncated octahedron's are cut into three rhombi first
(`_split_hexagons`), and that cut costs the solid half its symmetry: see
`_th_spokes`.
"""

from __future__ import annotations

import math
from collections import defaultdict
from typing import Hashable

from minesweeper.boards.catalan import (
    _Base,
    _catalan_faces,
    _quad_grid,
    _tri_grid,
)
from minesweeper.boards.core import (
    Board3D,
    Cell,
    Vec3,
    _cross,
    _dot,
    _tangent_order,
)
from minesweeper.boards.solids import _convex_board3d


def _archimedean_faces(
    base: _Base, op: str
) -> tuple[dict[Cell, list], dict[Hashable, Vec3]]:
    """One Archimedean solid as (faces, vertex positions): the polar dual of
    the Catalan solid ``op`` makes of ``base``.

    Face keys are the Catalan vertex keys (``("v", i)`` at a base vertex,
    ``("f", i)`` at a base face, ``("e", u, v)`` at a base edge, ``("g", ...)``
    a snub triangle) and vertex keys are the Catalan face keys, so the two
    solids name each other's pieces.
    """
    catalan, catalan_pos = _catalan_faces(base, op)
    positions: dict[Hashable, Vec3] = {}
    around: dict[Hashable, list[Cell]] = defaultdict(list)
    for cell, ring in catalan.items():
        a, b, c = (catalan_pos[k] for k in ring[:3])
        normal = _cross(tuple(y - x for x, y in zip(a, b)),
                        tuple(y - x for x, y in zip(a, c)))
        # the pole of the plane <x, n> = <a, n>
        scale = _dot(normal, a)
        positions[cell] = tuple(x / scale for x in normal)
        for key in ring:
            around[key].append(cell)
    faces = {
        key: _tangent_order(catalan_pos[key], [(c, positions[c]) for c in cells])
        for key, cells in around.items()
    }
    return faces, positions


# -- the truncated octahedron's hexagons --------------------------------------


def _th_spokes(base: _Base, hexagon: list[Hashable]) -> list[bool]:
    """Which corners of a truncated-octahedron hexagon its rhombi meet at.

    Three rhombi through a hexagon's centre use every other corner as a spoke,
    so they keep the three mirrors through those corners and lose the three
    through the edge midpoints between them. On this solid the lost ones are
    the cube's edge mirrors (the planes like x = y), whatever the choice, so
    no cut keeps all 48 symmetries; the most it can keep is 24. This rule
    keeps the **pyritohedral** 24 -- the coordinate mirrors, the inversion and
    the 3-fold turns, as on a volleyball -- rather than the chiral 24 that
    picking by handedness would.

    A hexagon sits at a cube vertex and its corners are the six
    ``("t", face, edge)`` flags there -- a cube face normal to axis ``a`` and
    a cube edge along axis ``b``, ``a != b``. A corner is a spoke when ``b``
    follows ``a`` cyclically: a sign flip leaves the axes alone and a 3-fold
    turn about a body diagonal shifts both, so the rule is invariant under
    exactly those, and a quarter turn, which swaps two axes, reverses it.
    """
    spokes = []
    for _, fi, (u, v) in hexagon:
        face_axis = max(range(3), key=lambda k: abs(base.face_dirs[fi][k]))
        edge_axis = next(
            k for k in range(3) if (base.vertices[u][k] > 0) != (base.vertices[v][k] > 0)
        )
        spokes.append(edge_axis == (face_axis + 1) % 3)
    return spokes


def _split_hexagons(
    faces: dict[Cell, list],
    positions: dict[Hashable, Vec3],
    spokes,
) -> tuple[dict[Cell, list], dict[Hashable, Vec3]]:
    """Cut every hexagon into three rhombi through its own planar centre and
    the corners ``spokes(ring)`` marks (every other one); leave the other faces
    alone. The centre is the plain average of the corners, so the rhombi lie
    flat in the hexagon's plane."""
    out_cells: dict[Cell, list] = {}
    out_pos = dict(positions)
    for cell, ring in faces.items():
        if len(ring) != 6:
            out_cells[cell] = ring
            continue
        marks = spokes(ring)
        start = marks.index(True)
        if marks != [(i - start) % 2 == 0 for i in range(6)]:
            raise AssertionError(f"hexagon {cell!r} spokes do not alternate")
        centre = ("c", cell)
        out_pos[centre] = tuple(
            sum(positions[k][a] for k in ring) / 6 for a in range(3)
        )
        for r in range(3):
            i = start + 2 * r
            out_cells[(cell, r)] = [centre, ring[i % 6], ring[(i + 1) % 6],
                                    ring[(i + 2) % 6]]
    return out_cells, out_pos


# -- subdivision --------------------------------------------------------------


def _subdivide_mixed(
    faces: dict[Cell, list], positions: dict[Hashable, Vec3], frequency: int
) -> tuple[dict[Cell, list], dict[Hashable, Vec3]]:
    """Cut every triangle and quadrilateral ``frequency`` ways along each edge.

    The two grids are run on their own faces and merged: a point on an edge a
    triangle shares with a square comes out of both with the same id and the
    same coordinates (`catalan._edge_point`), so the merge is exact."""
    by_sides: dict[int, dict[Cell, list]] = defaultdict(dict)
    for cell, ring in faces.items():
        by_sides[len(ring)][cell] = ring
    if set(by_sides) - {3, 4}:
        raise ValueError(f"cannot subdivide faces with {sorted(by_sides)} sides")
    cells: dict[Cell, list] = {}
    out_pos: dict[Hashable, Vec3] = {}
    for sides, grid in ((3, _tri_grid), (4, _quad_grid)):
        if sides in by_sides:
            sub_cells, sub_pos = grid(by_sides[sides], positions, frequency)
            cells.update(sub_cells)
            out_pos.update({k: sub_pos[k] for ring in sub_cells.values() for k in ring})
    return cells, out_pos


def _archimedean_board(
    mode: str, op: str, mine_count: int, frequency: int
) -> Board3D:
    if frequency < 1:
        raise ValueError("frequency must be at least 1")
    base = _Base("cube")
    faces, positions = _archimedean_faces(base, op)
    if op == "kis":
        faces, positions = _split_hexagons(
            faces, positions, lambda ring: _th_spokes(base, ring)
        )
    cells, positions = _subdivide_mixed(faces, positions, frequency)
    # the grids' keys nest a face key of whatever shape that face had, which
    # do not sort against one another; the cell ids only have to be distinct
    cells = {("c", n): ring for n, ring in enumerate(cells.values())}
    radius = max(math.hypot(*p) for p in positions.values())
    return _convex_board3d(mode, cells, positions, mine_count, radius=radius)


# -- the boards ----------------------------------------------------------------


def cuboctahedron_board(mine_count: int, frequency: int = 4) -> Board3D:
    """A cuboctahedron: 8 triangles and 6 squares (vertex configuration
    3.4.3.4), the rectified cube and the dual of the rhombic dodecahedron.
    Every face is cut ``frequency**2`` ways, so ``14 * frequency**2`` cells."""
    return _archimedean_board("cubocta", "join", mine_count, frequency)


def truncated_octahedron_board(mine_count: int, frequency: int = 3) -> Board3D:
    """A truncated octahedron: 6 squares and 8 hexagons (4.6.6), the dual of
    the tetrakis hexahedron and the one Archimedean solid that fills space.
    Each hexagon is cut into three rhombi (`_split_hexagons`), and every
    quadrilateral then ``frequency**2`` ways: ``30 * frequency**2`` cells."""
    return _archimedean_board("truncocta", "kis", mine_count, frequency)


def snub_cube_board(mine_count: int, frequency: int = 2) -> Board3D:
    """A snub cube: 32 triangles and 6 squares (3.3.3.3.4), the dual of the
    pentagonal icositetrahedron. Chiral -- the octahedral rotations alone, no
    mirror. Every face is cut ``frequency**2`` ways: ``38 * frequency**2``
    cells."""
    return _archimedean_board("snubcube", "gyro", mine_count, frequency)

