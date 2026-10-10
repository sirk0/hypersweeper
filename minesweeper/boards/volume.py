"""Volume boards: a solid block of cells rather than a surface of them.

Every other board in the zoo is a *surface* — a tiling of the plane, of a
closed polyhedron, or of an immersed manifold — and two cells are neighbours
when their polygons share a vertex. A volume board keeps exactly that rule and
lifts it one dimension: the cells are solids filling a block, and two are
neighbours when the **solids** share a corner. Three ship:

* ``solid_cube_board`` (``cube3d``) -- the unit cubes of an ``n x n x n``
  block. The 3x3x3 block around a cell minus the cell itself, so an interior
  cell has **26** neighbours where the densest surface board has 21.
* ``fcc_block_board`` (``fcc3d``) -- the rhombic dodecahedra round the points
  of the face-centred cubic lattice: 12 across a face and 6 across a 4-valent
  corner, **18**.
* ``hex_prism_board`` (``hexprism3d``) -- hexagonal prisms stacked in layers:
  6 round a cell in its layer and 7 in each layer it touches, **20**.

The arithmetic is on the integer lattice, so the rule is exact -- nothing here
rounds two nearby points together to make a neighbour.

The catch is that a solid shows only its shell: 98 of the cube's 512 cells at
``n = 8``, and none of the inside. So a volume is drawn **taken apart**. Each
``k``-slice becomes its own sheet of polygons, the sheets are laid out side by
side on a grid, and each is stepped back in depth by its slice index. Nothing
is hidden and nothing occludes anything, which is what a neighbourhood that
deep needs to be readable: a number in slice ``k`` of the cube counts mines
across slices ``k-1``, ``k`` and ``k+1``, so all three have to be on screen at
once -- and on the rhombic honeycomb across ``k-2`` to ``k+2``. Within a sheet
each drawing is exact: two squares, two diamonds or two hexagons of one sheet
touch exactly when their solids do.

Two consequences of that layout are worth knowing before touching it:

* **The sheets are laid on a grid, not in a row.** Eight sheets in a row is a
  9-to-1 board, and ``frameSolid`` fits one of those into a sliver of a phone
  screen. At ``ceil(sqrt(n))`` columns the cube comes out 8x8, 18x12 and 26x26
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

    # Each slice is a sheet of unit squares, cornered on the integers.
    sheets = []
    for k in range(n):
        sheet: dict[Cell, list[tuple[Hashable, tuple[float, float]]]] = {}
        for i in range(n):
            for j in range(n):
                # wound counterclockwise seen from +z
                sheet[(i, j, k)] = [
                    ((i + du, j + dv), (i + du, j + dv))
                    for du, dv in ((0, 0), (1, 0), (1, 1), (0, 1))
                ]
        sheets.append(sheet)
    polygons, radius = _lay_out(sheets, n, n)
    return Board3D(mode="cube3d", polygons=polygons,
                   adjacency=_moore_adjacency(n), mine_count=mine_count,
                   radius=radius, two_sided=True)


# The 18 lattice steps between neighbouring rhombic dodecahedra: the 12 to the
# cells across a face, then the 6 to the cells across one of the 4-valent
# corners -- two layers away when the step is along an axis.
FCC_STEPS = tuple(
    step
    for step in ((di, dj, dk) for di in range(-2, 3) for dj in range(-2, 3)
                 for dk in range(-2, 3))
    if sorted(map(abs, step)) in ([0, 1, 1], [0, 0, 2])
)


def fcc_block_board(side: int, depth: int, mine_count: int) -> Board3D:
    """A ``side x side x depth`` block of the face-centred cubic lattice, its
    cells the rhombic dodecahedra that tile space around those points.

    The cells sit on the integer points ``(i, j, k)`` of the box whose
    coordinates sum to an even number. Two of them share a rhombic **face** at
    a step like ``(1, 1, 0)`` -- twelve of those -- and share only a **corner**,
    the 4-valent one six cells meet at, at a step like ``(2, 0, 0)`` -- six of
    those. That is 18 neighbours, all of them exact lattice steps.

    It is sliced along ``k``, and the cut is an honest picture: the middle of a
    rhombic dodecahedron is a square standing on its corner, and a layer of
    them is a checkerboard of those diamonds, tiling the sheet exactly. So
    within a sheet the drawing *is* the adjacency -- diamonds sharing an edge
    share a face, diamonds touching at a point share that 4-valent corner --
    and the shared-vertex rule a player already knows reads off it unchanged.
    Across sheets it does not, and that is the board's twist: slice ``k +- 1``
    holds the four diamonds centred on this one's corners, and slice
    ``k +- 2`` the one diamond straight through. A number counts mines over
    *five* sheets, where on the cube of cubes it counts over three.

    ``side`` and ``depth`` are at least 3 so the block is a block: a slab one
    or two diamonds wide is a strip, not a volume.
    """
    if side < 3 or depth < 3:
        raise ValueError("a volume board needs at least 3 cells on a side")

    # Every sheet shares one frame, so a corner of slice k and the centre of a
    # diamond in slice k + 1 land on the same spot of their two sheets -- which
    # is what lets a player read the cross-slice neighbours off by position.
    # The frame runs from -1 to ``side``: the diamonds' corners overhang the
    # cell centres by one.
    sheets = []
    for k in range(depth):
        sheet: dict[Cell, list[tuple[Hashable, tuple[float, float]]]] = {}
        for i in range(side):
            for j in range(side):
                if (i + j + k) % 2:
                    continue
                # wound counterclockwise seen from +z: bottom, right, top, left
                sheet[(i, j, k)] = [
                    ((x, y), (x + 1, y + 1))
                    for x, y in ((i, j - 1), (i + 1, j), (i, j + 1), (i - 1, j))
                ]
        sheets.append(sheet)
    polygons, radius = _lay_out(sheets, side + 1, side + 1)
    adjacency = _lattice_adjacency(polygons, FCC_STEPS)
    return Board3D(mode="fcc3d", polygons=polygons, adjacency=adjacency,
                   mine_count=mine_count, radius=radius, two_sided=True)


# A hexagon's six corners, in thirds of the axial lattice: the centroid of the
# cell and two neighbouring cell centres. Integer keys, so the corners two
# hexagons share are the same key exactly. Counterclockwise from 30 degrees.
_HEX_CORNERS = ((1, 1), (-1, 2), (-2, 1), (-1, -1), (1, -2), (2, -1))
# The 20 steps between neighbouring prisms, as ``(q, s, k)``: the six cells
# round a hexagon in its own layer, then the cell straight through and its six
# in each layer above and below.
HEX_PRISM_STEPS = tuple(
    (dq, ds, dk)
    for dk in (0, -1, 1)
    for dq, ds in ((0, 0), (1, 0), (0, 1), (-1, 1), (-1, 0), (0, -1), (1, -1))
    if (dq, ds, dk) != (0, 0, 0)
)


def hex_prism_board(radius: int, depth: int, mine_count: int) -> Board3D:
    """A block of hexagonal prisms: ``depth`` layers, each a hexagon of
    hexagons ``radius`` rings out from a centre cell.

    Cells are ``(q, s, k)``, axial coordinates within the layer and the layer
    itself. Prisms that share a corner are the six round a cell in its own
    layer and, in each layer above and below, the cell straight through and
    its six -- **20** neighbours, all of them within one layer, so a number
    counts mines over three sheets as it does on the cube of cubes.

    Each layer is drawn as its own sheet of hexagons, which is exact in the
    plane: a hexagon's neighbours in the hexagonal tiling are precisely the
    cells it shares a corner with.

    ``depth`` is at least 3 for the same reason as the cube's: two layers deep,
    every prism shares its closed neighbourhood with the one behind it.
    """
    if radius < 1:
        raise ValueError("a hexagonal prism block needs at least one ring")
    if depth < 3:
        raise ValueError("a volume board needs at least 3 layers")

    root3 = math.sqrt(3)
    hexagon = [
        (q, s)
        for q in range(-radius, radius + 1)
        for s in range(-radius, radius + 1)
        if abs(q + s) <= radius
    ]
    sheets = []
    for k in range(depth):
        sheet: dict[Cell, list[tuple[Hashable, tuple[float, float]]]] = {}
        for q, s in hexagon:
            corners = []
            for du, dv in _HEX_CORNERS:
                u, v = 3 * q + du, 3 * s + dv
                corners.append(((u, v), ((u + v / 2) / 3, v * root3 / 6)))
            sheet[(q, s, k)] = corners
        sheets.append(sheet)
    width = 2 * radius + 1
    height = radius * root3 + 2 / root3
    polygons, scale_radius = _lay_out(sheets, width, height)

    adjacency = _lattice_adjacency(polygons, HEX_PRISM_STEPS)
    return Board3D(mode="hexprism3d", polygons=polygons, adjacency=adjacency,
                   mine_count=mine_count, radius=scale_radius, two_sided=True)


def _lay_out(sheets: list[dict[Cell, list[tuple[Hashable, tuple[float, float]]]]],
             width: float, height: float) -> tuple[dict[Cell, list[Vec3]], float]:
    """Draw a volume's slices as sheets on a grid, stepped back in depth.

    ``sheets[k]`` maps each cell of slice ``k`` to its corners, each a vertex
    key within the slice and its ``(x, y)`` on a sheet ``width x height``.
    Vertex ids become ``(k, *key)``: the polygons of one sheet share their
    corners exactly, which is what makes each sheet a mesh (every edge used by
    two tiles, or once along its rim), while two sheets share nothing. No
    volume reads these to find its neighbours -- it is the solids that touch,
    not the drawn polygons.

    The sheets are laid on a ``ceil(sqrt(n))``-column grid rather than in a
    row: eight sheets in a row is a 9-to-1 board, which ``frameSolid`` fits into
    a sliver of a phone screen. Returns the polygons scaled into the unit
    sphere, and the radius they reach.
    """
    cols = math.ceil(math.sqrt(len(sheets)))
    raw: dict[Hashable, Vec3] = {}
    cells: dict[Cell, list[Hashable]] = {}
    for k, sheet in enumerate(sheets):
        ox = (k % cols) * (width + GAP)
        oy = -(k // cols) * (height + GAP)
        oz = -k * SPREAD
        for cell, corners in sheet.items():
            keys = []
            for key, (x, y) in corners:
                key = (k, *key)
                if key not in raw:
                    raw[key] = (ox + x, oy + y, oz)
                keys.append(key)
            cells[cell] = keys

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
    polygons = {
        cell: [positions[key] for key in keys] for cell, keys in cells.items()
    }
    radius = max(math.hypot(*p) for p in positions.values())
    return polygons, radius


def _lattice_adjacency(cells, steps) -> dict[Cell, tuple[Cell, ...]]:
    """Each cell's neighbours: the cells of the block one of ``steps`` away.
    Exact integer arithmetic, so the shared-vertex rule needs no tolerance
    here any more than it does in 2D."""
    present = set(cells)
    adjacency: dict[Cell, tuple[Cell, ...]] = {}
    for cell in cells:
        i, j, k = cell
        neighbors = [
            other
            for di, dj, dk in steps
            if (other := (i + di, j + dj, k + dk)) in present
        ]
        adjacency[cell] = tuple(sorted(neighbors))
    return adjacency


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
