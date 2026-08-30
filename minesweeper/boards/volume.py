"""Volume boards: a solid block of cells rather than a surface of them.

Every other board in the zoo is a *surface* — a tiling of the plane, of a
closed polyhedron, or of an immersed manifold — and two cells are neighbours
when their polygons share a vertex. A volume board keeps exactly that rule and
lifts it one dimension: the cells are the unit cubes of an ``n x n x n`` block,
and two are neighbours when their **cubes** share a corner. That is the 3x3x3
block around a cell minus the cell itself, so an interior cell has **26**
neighbours where the densest surface board in the catalogue has 21. The
arithmetic is on the integer lattice, so the rule is exact — nothing here
rounds two nearby points together to make a neighbour.

The catch is that a solid cube shows only its shell: 98 of the 512 cells at
``n = 8``, and none of the inside. So the cube is drawn **taken apart**. Each
``k``-slice becomes its own sheet of ``n x n`` squares, the sheets are laid out
side by side on a grid, and each is stepped back in depth by its slice index.
Nothing is hidden and nothing occludes anything, which is what the 26-cell
neighbourhood needs to be readable: a number in slice ``k`` counts mines across
slices ``k-1``, ``k`` and ``k+1``, so all three have to be on screen at once.

Two consequences of that layout are worth knowing before touching it:

* **The sheets are laid on a grid, not in a row.** Eight sheets in a row is a
  9-to-1 board, and ``frameSolid`` fits one of those into a sliver of a phone
  screen. At ``ceil(sqrt(n))`` columns the board comes out 8x8, 18x12 and 26x26
  cells at the three sizes — square enough to fill the screen at any of them.
* **The board is two-sided.** The sheets are open — they have rims — so with
  front-face culling the whole board would vanish the moment it was turned past
  ninety degrees. ``two_sided`` also tells the topology suite not to demand a
  closed surface of it: ``n`` sheets means ``n`` boundary circles and an Euler
  characteristic of ``n``, not 0 or 2.

The layout constants below are part of the *drawing*, and the conformance
oracle counts vertices and edges off the drawing, so ``web/src/boards/volume.ts``
carries the same numbers. Change one and change both.
"""

from __future__ import annotations

import math
from typing import Hashable

from minesweeper.boards.core import Board3D, Cell, Vec3

# Blank space between two neighbouring sheets, in cells. One cell width reads
# as a seam without wasting the screen.
GAP = 1.0
# How far back each successive slice steps, in cells. This is the only cue that
# says which sheet is which, so it has to be plainly visible at the board's
# default orientation while staying small enough that perspective does not
# shrink the far sheets noticeably.
SPREAD = 1.5


def solid_cube_board(n: int, mine_count: int) -> Board3D:
    """An ``n x n x n`` solid of cells, drawn as ``n`` slices laid out on a
    grid and stepped back in depth. Cells are the unit cubes; neighbours are
    the (up to) 26 cubes sharing a corner with them.

    ``n`` is at least 3, and that is not a taste: at a depth of 2 every cell
    shares a closed neighbourhood with the cell behind it, so no sequence of
    numbers can ever tell the two apart and a mine landing in one of the pair
    forces a coin flip. ``scripts/difficulty/metrics.indistinguishable_cells``
    counts exactly that, and at depth 2 it counts the whole board.
    """
    if n < 3:
        raise ValueError("a volume board needs at least 3 cells on a side")

    cols = math.ceil(math.sqrt(n))
    pitch = n + GAP

    def sheet_origin(k: int) -> tuple[float, float, float]:
        gx, gy = k % cols, k // cols
        return (gx * pitch, -gy * pitch, -k * SPREAD)

    # Vertex ids are ``(k, i, j)`` integer corners *within* a slice: the quads
    # of one sheet share their corners exactly, which is what makes each sheet
    # a mesh (every edge used by two tiles, or once along its rim), while two
    # sheets share nothing. The adjacency below does not read these at all --
    # it is the cubes that touch, not the drawn squares.
    raw: dict[Hashable, Vec3] = {}
    cells: dict[Cell, list[Hashable]] = {}
    for k in range(n):
        ox, oy, oz = sheet_origin(k)
        for i in range(n):
            for j in range(n):
                corners = []
                # wound counterclockwise seen from +z
                for du, dv in ((0, 0), (1, 0), (1, 1), (0, 1)):
                    key = (k, i + du, j + dv)
                    if key not in raw:
                        raw[key] = (ox + i + du, oy + j + dv, oz)
                    corners.append(key)
                cells[(i, j, k)] = corners

    xs = [p[0] for p in raw.values()]
    ys = [p[1] for p in raw.values()]
    zs = [p[2] for p in raw.values()]
    center = ((min(xs) + max(xs)) / 2, (min(ys) + max(ys)) / 2,
              (min(zs) + max(zs)) / 2)
    extent = max(max(xs) - min(xs), max(ys) - min(ys), max(zs) - min(zs))
    scale = 2.0 / extent
    positions = {
        key: tuple((c - o) * scale for c, o in zip(p, center))
        for key, p in raw.items()
    }

    adjacency = _moore_adjacency(n)
    polygons = {
        cell: [positions[key] for key in keys] for cell, keys in cells.items()
    }
    radius = max(math.hypot(*p) for p in positions.values())
    return Board3D(mode="cube3d", polygons=polygons, adjacency=adjacency,
                   mine_count=mine_count, radius=radius, two_sided=True)


def _moore_adjacency(n: int) -> dict[Cell, tuple[Cell, ...]]:
    """The 26-neighbourhood of every cell of an ``n**3`` block: the cells whose
    unit cubes share a corner with this one. Exact integer arithmetic, so the
    shared-vertex rule needs no tolerance here any more than it does in 2D."""
    steps = [
        (di, dj, dk)
        for di in (-1, 0, 1)
        for dj in (-1, 0, 1)
        for dk in (-1, 0, 1)
        if (di, dj, dk) != (0, 0, 0)
    ]
    adjacency: dict[Cell, tuple[Cell, ...]] = {}
    for i in range(n):
        for j in range(n):
            for k in range(n):
                neighbors = []
                for di, dj, dk in steps:
                    a, b, c = i + di, j + dj, k + dk
                    if 0 <= a < n and 0 <= b < n and 0 <= c < n:
                        neighbors.append((a, b, c))
                adjacency[(i, j, k)] = tuple(sorted(neighbors))
    return adjacency
