from __future__ import annotations

import math
from collections import Counter, defaultdict, deque

from minesweeper.boards.core import Board, Cell, _finalize_flat

# -- Penrose tiling (P3, rhombi) ---------------------------------------------
#
# Vertices are exact elements of Z[zeta], zeta = exp(i*pi/5), stored as 4
# integer coefficients over the basis (1, z, z^2, z^3) with the reduction
# z^4 = -1 + z - z^2 + z^3. Robinson-triangle deflation only ever needs
# addition, subtraction and division by phi -- and 1/phi = phi - 1 =
# z^2 - z^3, so every operation stays in integers and vertex keys are
# exact: the shared-vertex adjacency needs no floating-point tolerance.
#
# The phyllotactic spiral below is built in this same ring (its tile's edges
# are the ten unit directions zeta^k), so the helpers here are shared.

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


def _z_rot(p: ZPoint, k: int) -> ZPoint:
    """Multiply by zeta^k, i.e. rotate k*36 degrees about the origin."""
    for _ in range(k % 10):
        p = _zeta_mul(p)
    return p


def _z_scale(p: ZPoint, k: int) -> ZPoint:
    return (p[0] * k, p[1] * k, p[2] * k, p[3] * k)


_ZETA_BASIS = [
    (math.cos(math.pi * k / 5), math.sin(math.pi * k / 5)) for k in range(4)
]


def _z_to_xy(p: ZPoint) -> tuple[float, float]:
    return (
        sum(c * bx for c, (bx, _) in zip(p, _ZETA_BASIS)),
        sum(c * by for c, (_, by) in zip(p, _ZETA_BASIS)),
    )


# -- windowing an aperiodic patch --------------------------------------------
#
# What makes a tiling aperiodic is that it repeats nowhere, and both boards
# below grow far more of one than they keep: the Penrose wheel is 430 rhombi
# where the easy board is 81, and the Spectre cluster 4401 tiles where the hard
# board is 480. The centred trim is one window onto that patch. Every other
# window onto it is a board of the same size made of tiles that have never sat
# together before -- which is what a Penrose or a Spectre board's ``variant``
# is: not a re-generated tiling, but somewhere else to look at the one the
# substitution already built.
#
# The two boards below this file's other nonperiodic ones do not take a
# variant, and deliberately: the phyllotactic spiral and the brick rings are
# nonperiodic by *symmetry* rather than by substitution, so each has one
# distinguished centre (the five-fold rosette, the 2x2 core) and a window
# anywhere else is a crop of a structured picture rather than another board.
#
# A window is *picked*, not sampled: ``variant`` indexes a pool of candidate
# centre tiles built the same way here and in the TypeScript port, so the same
# integer names the same board in both builds -- pinned by data/conformance.json
# -- and no random stream has to be shared across two languages. Index 0 of
# that pool is the centred trim itself, so the classic patch (the Penrose sun,
# the middle of the Delta cluster) stays one of the boards dealt.
#
# Not every window in that pool is a board a *difficulty* may deal, though:
# the mine count is fitted to the centred window and does not carry across by
# itself (on the 81-cell Penrose board the solver's win rate runs from 0.76 to
# 0.98 across windows, and on the 480-cell one from 0.25 to 0.66 against a 0.51
# target). ``scripts/difficulty/windows.py`` measures them and
# keeps the ones that play like the calibrated board, and ``presets.window_for``
# is what turns a game seed into one of those. This function is the geometry;
# that list is the difficulty.

#: How far in from the rim a window's centre has to sit, as a multiple of the
#: window's own half-width in tiles. Under 1 because the window is a square and
#: the depth is measured to the *nearest* rim: measured over both tilings at
#: every difficulty, 0.75 leaves a pool of dozens of centres per board and not
#: one window that ``_is_disc`` had to reject.
_WINDOW_MARGIN = 0.75

#: Consecutive variants step this far through the candidate pool, so variant 1
#: and variant 2 are different boards rather than the same window moved one
#: tile. Prime and larger than any pool a board here builds, so stepping cannot
#: revisit a centre before the pool is exhausted.
_WINDOW_STRIDE = 65537

#: How far the patch's own edge may cut into a window, in tiles.
#:
#: A window is the ``keep`` tiles nearest its centre, so where its square runs
#: off the end of the patch it cannot be filled: the board comes out square
#: with a chunk bitten out of one side. How deep the bite is, is how far inside
#: the window's square the patch's rim reaches, and that is what this bounds.
#: Calibrated by eye against a contact sheet of Spectre windows ordered by it:
#: up to about 1.5 tiles is the ordinary raggedness of a monotile rim; past 2
#: there is a notch you look at rather than through. The Penrose patch is a
#: convex decagon and barely ever trips this -- the Spectre's ragged cluster is
#: what it is for. The centred window never faces it, being the board the game
#: shipped and the one the mine count was fitted to: the Spectre's hard board
#: measures 2.0 tiles by this and stays as it is, which makes the bound a
#: standard the *other* windows are held below rather than to.
_WINDOW_NOTCH = 1.5


def _patch_adjacency(cells: list[list]) -> list[list[int]]:
    """Shared-vertex adjacency over an untrimmed patch, by row index.

    The same relation ``core._shared_vertex_adjacency`` gives the finished
    board, but on rows rather than cell ids and over the whole patch, which
    is what the rim walk and the connectivity test below need before any of
    it has been trimmed into a board.
    """
    by_vertex: dict = defaultdict(list)
    for i, ids in enumerate(cells):
        for vertex in ids:
            by_vertex[vertex].append(i)
    touching: list[set[int]] = [set() for _ in cells]
    for group in by_vertex.values():
        for i in group:
            touching[i].update(group)
    return [sorted(others - {i}) for i, others in enumerate(touching)]


def _rim_depth(cells: list[list], adjacency: list[list[int]]) -> list[int]:
    """Each cell's distance in tiles from the rim of the patch.

    The rim is every cell carrying an edge no other cell shares, and the
    depth is the breadth-first distance inward from it. Exact: the vertex
    ids are integer tuples in both tilings' cyclotomic rings, so an edge is
    shared or it is not, with nothing to round.
    """
    shared: Counter = Counter()
    for ids in cells:
        for edge in zip(ids, ids[1:] + ids[:1]):
            shared[frozenset(edge)] += 1
    depth = [-1] * len(cells)
    queue: deque[int] = deque()
    for i, ids in enumerate(cells):
        if any(shared[frozenset(e)] == 1 for e in zip(ids, ids[1:] + ids[:1])):
            depth[i] = 0
            queue.append(i)
    while queue:
        i = queue.popleft()
        for neighbor in adjacency[i]:
            if depth[neighbor] < 0:
                depth[neighbor] = depth[i] + 1
                queue.append(neighbor)
    return depth


def _is_disc(cells: list[list], adjacency: list[list[int]], kept: list[int]) -> bool:
    """Whether these cells make a board: one piece, and no hole in it.

    A window that slides off the ragged rim of the Spectre's cluster comes
    back as two or three islands -- a board with a chunk of it floating
    unreachable, which is not a board. Connected with Euler characteristic 1
    is exactly a disc: an annulus (a hole) has 0, two islands 2.
    """
    chosen = set(kept)
    seen = {kept[0]}
    queue = deque([kept[0]])
    while queue:
        i = queue.popleft()
        for neighbor in adjacency[i]:
            if neighbor in chosen and neighbor not in seen:
                seen.add(neighbor)
                queue.append(neighbor)
    if len(seen) != len(chosen):
        return False
    vertices, edges = set(), set()
    for i in kept:
        ids = cells[i]
        vertices.update(ids)
        edges.update(frozenset(e) for e in zip(ids, ids[1:] + ids[:1]))
    return len(vertices) - len(edges) + len(kept) == 1


def _notch(
    centroids: list[tuple[float, float]],
    rim: list[int],
    kept: list[int],
    keep: int,
) -> bool:
    """Whether the patch's edge stays out of this window (``_WINDOW_NOTCH``).

    The window is the square its kept tiles fill; where the patch ends inside
    that square there is nothing to fill it with, and the board is drawn with a
    bite out of one side. So: measure how far in from the square's boundary the
    nearest rim tile of the patch sits, in tiles -- the tile pitch being the
    square's own side over the square root of the cell count, since a square
    block of ``keep`` tiles is sqrt(keep) of them across.

    Quantised before it is compared, like every other distance in this file, so
    that a window at the threshold is kept or dropped the same way in the
    TypeScript port.
    """
    cx = (min(centroids[i][0] for i in kept) + max(centroids[i][0] for i in kept)) / 2
    cy = (min(centroids[i][1] for i in kept) + max(centroids[i][1] for i in kept)) / 2
    half = max(max(abs(centroids[i][0] - cx), abs(centroids[i][1] - cy)) for i in kept)
    deepest = max(
        (half - max(abs(centroids[i][0] - cx), abs(centroids[i][1] - cy)) for i in rim),
        default=0.0,
    )
    allowed = 2 * half / math.sqrt(keep) * _WINDOW_NOTCH
    return math.floor(deepest * 1e6 + 0.5) <= math.floor(allowed * 1e6 + 0.5)


def _window(
    cells: list[list],
    centroids: list[tuple[float, float]],
    tiebreaks: list,
    keep: int | None,
    variant: int,
) -> list[int]:
    """The rows of one aperiodic patch that make up board ``variant``.

    ``keep`` rows nearest a centre by Chebyshev distance -- a square block,
    which packs more tiles onto the screen than the round patch does -- in
    rank order, so the board a caller assembles from them is ordered exactly
    as the centred trim used to order it. ``variant`` 0 is that centred trim,
    unchanged and identical to what this file built before variants existed;
    any other integer picks a window elsewhere in the patch.

    The distance is quantised, as it always was: these patches are
    ten-fold symmetric (Penrose) or grown from one cluster (the Spectre), so
    tiles come in sets at the *same* distance, and a tie at the cut rank
    compared as a raw float breaks the other way in the TypeScript port,
    whose last cosine bit need not agree with CPython's. Same cells kept,
    different edge count -- which is what conformance.test.ts catches.

    A window is kept only if it is a board to look at as well as to play: a
    disc (``_is_disc``), and not bitten into by the end of the patch by more
    than ``_WINDOW_NOTCH`` tiles (``_notch``).
    """
    n = len(cells)
    if keep is None or keep >= n:
        return list(range(n))

    def window_at(cx: float, cy: float) -> list[int]:
        def near(i: int) -> int:
            distance = max(abs(centroids[i][0] - cx), abs(centroids[i][1] - cy))
            return math.floor(distance * 1e6 + 0.5)

        return sorted(range(n), key=lambda i: (near(i), tiebreaks[i]))[:keep]

    gx = sum(x for x, _ in centroids) / n
    gy = sum(y for _, y in centroids) / n
    centred = window_at(gx, gy)
    if not variant:
        return centred

    # A window's centre has to sit far enough inside the patch that the
    # window is filled by it; the pool is every tile that does, in the order
    # the substitution laid them, which is the one order both languages
    # agree on without sorting anything.
    adjacency = _patch_adjacency(cells)
    depth = _rim_depth(cells, adjacency)
    margin = math.sqrt(keep) / 2 * _WINDOW_MARGIN
    pool = [i for i in range(n) if depth[i] >= margin]
    rim = [i for i in range(n) if depth[i] == 0]
    index = variant * _WINDOW_STRIDE % (len(pool) + 1)
    for step in range(len(pool) + 1):
        at = (index + step) % (len(pool) + 1)
        if at == 0:  # the centred trim is index 0, so it stays in the deal
            return centred
        kept = window_at(*centroids[pool[at - 1]])
        if _notch(centroids, rim, kept, keep) and _is_disc(cells, adjacency, kept):
            return kept
    return centred  # unreachable: index 0 is always a board


def penrose_board(
    subdivisions: int,
    mine_count: int,
    scale: float = 300,
    keep: int | None = None,
    variant: int = 0,
) -> Board:
    """An aperiodic Penrose tiling (P3): thick and thin rhombi.

    Starts from a wheel of ten half-rhombus Robinson triangles and
    deflates ``subdivisions`` times; mirror-image triangle halves are
    then merged into rhombi (unpaired halves on the outer rim are
    dropped). ``scale`` is the wheel radius in pixels. ``keep`` trims the
    tiling to ``keep`` rhombi by Chebyshev distance (a roughly square
    block, denser on screen than the full round wheel); ``None`` keeps
    the whole decagonal patch.

    ``variant`` picks *which* ``keep`` rhombi: 0 is the centremost block,
    the patch's ten-fold sun in the middle of it, and any other integer is
    a window somewhere else in the same tiling -- a different board of the
    same size, which is the point of an aperiodic one. See ``_window``.
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

    rows = list(cells.items())
    centroids = [(sum(_z_to_xy(k)[0] for k in quad) / 4,
                  sum(_z_to_xy(k)[1] for k in quad) / 4)
                 for _, quad in rows]
    # The tie-break at the cut rank is the cell id, as it always was: a
    # rhombus's colour then the order the merge made it.
    kept = _window(cells=[quad for _, quad in rows],
                   centroids=centroids,
                   tiebreaks=[cell for cell, _ in rows],
                   keep=keep,
                   variant=variant)
    cells = {rows[i][0]: rows[i][1] for i in kept}

    return _finalize_flat("penrose", cells, _z_to_xy, mine_count, scale)


# -- Phyllotactic spiral -----------------------------------------------------
#
# A spiral tiling by a single equilateral convex hexagon, angles 72, 144,
# 144, 72, 144, 144: five tiles meet at the centre and the rest wind out from
# it in five arms. It reads as the sunflower head a Voronoi tessellation of a
# phyllotactic spiral draws, but it is built exactly and from one congruent
# tile rather than sampled from spiral points.
#
# It is nonperiodic, and not by substitution the way the Penrose and Spectre
# boards are: the tiling has five-fold rotational symmetry about its centre,
# and by the crystallographic restriction no tiling with a five-fold centre
# has a translation at all. Laying it is forced -- from the rosette of five
# tiles at the centre, exactly one placement of the tile fits the innermost
# gap at every step, which TestPhyllotaxis walks -- so the seed alone decides
# the whole plane.
#
# The construction, in exact Z[zeta5] (zeta = exp(i*pi/5), the ring shared
# with the Penrose board above):
#
#   * The tile is the zonogon on the three consecutive unit directions
#     u0, u1, u2 -- the hexagon 0, u0, u0+u1, u0+u1+u2, u1+u2, u2. Opposite
#     edges are parallel and equal (a parallelohexagon), so it tiles
#     periodically by the lattice generated by a = u0+u1 and b = u1+u2.
#   * a and b sit 36 degrees apart, so the lattice *quadrant* {m*a + n*b :
#     m, n >= 0} fills a 36-degree wedge, and ten rotated copies fill the
#     plane. Wedge j is zeta^j times the quadrant.
#   * Odd wedges are pushed one tile out along u1. That single offset is the
#     whole spiral: five tiles (the even wedges' tips) meet at the centre
#     with their 72-degree corners, the odd wedges start a tile further out,
#     and the seam between neighbouring wedges winds instead of running
#     straight. Rotating by zeta^2 (72 degrees) maps wedge j to wedge j+2 and
#     preserves that parity, so the tiling has C5 symmetry -- but not C10,
#     and no mirror, which is what makes the five arms curl.
#
# Every vertex is a sum of unit directions, so vertex ids stay exact integer
# tuples and shared-vertex adjacency needs no tolerance, exactly as for the
# Penrose board.

_Z_ZERO: ZPoint = (0, 0, 0, 0)

_Z_POWERS = [(1, 0, 0, 0)]
for _k in range(9):
    _Z_POWERS.append(_zeta_mul(_Z_POWERS[-1]))

# The tile: the zonogon on u0, u1, u2, walked counterclockwise from its
# 72-degree corner (the one that meets the centre of the spiral).
_PHYLLO_HEX: list[ZPoint] = [
    _Z_ZERO,
    _Z_POWERS[0],
    _z_add(_Z_POWERS[0], _Z_POWERS[1]),
    _z_add(_z_add(_Z_POWERS[0], _Z_POWERS[1]), _Z_POWERS[2]),
    _z_add(_Z_POWERS[1], _Z_POWERS[2]),
    _Z_POWERS[2],
]

# The tile lattice (a, b) and the half-step that offsets the odd wedges.
_PHYLLO_A = _z_add(_Z_POWERS[0], _Z_POWERS[1])
_PHYLLO_B = _z_add(_Z_POWERS[1], _Z_POWERS[2])
_PHYLLO_OFFSET = _Z_POWERS[1]


def _phyllotaxis_tiles(rings: int) -> list[tuple[tuple[int, int, int], list[ZPoint]]]:
    """The ten wedges grown ``rings`` lattice steps each -- the whole tiling,
    as ((wedge, m, n), exact vertex ids) in wedge order."""
    tiles = []
    for wedge in range(10):
        base = _PHYLLO_OFFSET if wedge % 2 else _Z_ZERO
        for m in range(rings):
            for n in range(rings):
                shift = _z_add(base, _z_add(_z_scale(_PHYLLO_A, m),
                                            _z_scale(_PHYLLO_B, n)))
                tiles.append(((wedge, m, n),
                              [_z_rot(_z_add(v, shift), wedge) for v in _PHYLLO_HEX]))
    return tiles


def phyllotaxis_board(
    rings: int, mine_count: int, keep: int | None = None, scale: float = 44
) -> Board:
    """The phyllotactic spiral: one equilateral convex hexagon
    (72/144 degrees) tiling the plane in five spiral arms.

    Grows the ten 36-degree wedges out to ``rings`` lattice steps each, for
    10*rings^2 tiles, then -- like ``penrose_board`` and ``spectre_board`` --
    ``keep`` trims the patch to its ``keep`` centremost tiles by Chebyshev
    distance from the spiral's centre, so the board reads as a square block
    around the five-fold rosette instead of a ten-pointed star. ``None``
    keeps the whole patch. ``scale`` is pixels per tile edge.
    """
    rows = []  # (chebyshev key, cell key, vertex ids)
    for key, ids in _phyllotaxis_tiles(rings):
        xy = [_z_to_xy(v) for v in ids]
        cx = sum(x for x, _ in xy) / len(xy)
        cy = sum(y for _, y in xy) / len(xy)
        # The patch is centred on the tiling's own five-fold centre, so the
        # trim measures from the origin rather than from a sampled centroid.
        # Quantising the distance keeps the sort order identical in the
        # TypeScript port, where the last bit of a cosine need not agree.
        near = math.floor(max(abs(cx), abs(cy)) * 1e6 + 0.5)
        rows.append((near, key, ids))

    if keep is not None and keep < len(rows):
        rows.sort(key=lambda row: row[:2])
        rows = rows[:keep]

    cells: dict[Cell, list[ZPoint]] = {key: ids for _, key, ids in rows}
    return _finalize_flat("phyllotaxis", cells, _z_to_xy, mine_count, scale)


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
    levels: int,
    mine_count: int,
    keep: int | None = None,
    scale: float = 21,
    variant: int = 0,
) -> Board:
    """The Spectre (Tile(1,1)), the chiral aperiodic monotile, grown by
    ``levels`` of the paper's reflection-free substitution from a single
    Spectre (Delta) cluster: 1, 9, 71, 559, 4401 tiles. ``keep`` trims the
    patch to ``keep`` tiles by Chebyshev distance (a roughly square board
    with an exact cell count); ``None`` keeps the whole (ragged) cluster.
    No tile is ever mirrored.

    ``variant`` picks which ``keep`` tiles: 0 is the centremost block and
    any other integer a window elsewhere in the same cluster, which is a
    different board of the same size. See ``_window``.
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

    # Chebyshev distance from the window's centre, as penrose_board does: it
    # trims to a square block rather than a disc, so the board reads square
    # and packs more tiles onto the screen. The tie-break at the cut rank is
    # the tile's own sorted vertex ids -- cell ids do not exist yet here, the
    # trim being what puts the tiles in the order they are numbered in.
    kept = _window(cells=[r[1] for r in rows],
                   centroids=[(r[2], r[3]) for r in rows],
                   tiebreaks=[tuple(sorted(r[1])) for r in rows],
                   keep=keep,
                   variant=variant)
    rows = [rows[i] for i in kept]

    cells: dict[Cell, list] = {
        (label, i): ids for i, (label, ids, _, _) in enumerate(rows)
    }
    return _finalize_flat("spectre", cells, _z12_to_xy, mine_count, scale)




# -- the brick rings ---------------------------------------------------------
#
# One nonperiodic board on the plain integer square lattice, tiled by 2x1
# bricks in concentric square rings about a 2x2 core. It is no substitution:
# like the phyllotactic spiral above it is nonperiodic by *symmetry*, and a
# pattern with a distinguished centre admits no translation at all.
#
# Ring k is the boundary of the 2k x 2k square about the origin: its top and
# bottom rows are laid in horizontal bricks and its two sides in vertical
# ones. Both runs are even -- a row is 2k cells and a side 2k - 2 -- so every
# tile is a whole brick at every size, with no odd cell to special-case and no
# 1x1 anywhere. Ring 1 is the core, two bricks stacked into a 2x2.
#
# ``rings`` rings fill the 2``rings`` x 2``rings`` square exactly, so the size
# knob is the ring count alone and the cell count is ``2 * rings**2``. Only an
# even side can be tiled by bricks alone -- an odd-sided square has odd area --
# which is why the knob counts rings rather than cells across.
#
# It carries the square's two mirrors and its half turn, but not its quarter
# turn: a ring's top and bottom are horizontal bricks where its sides are
# vertical ones, so turning it a quarter takes bricks across bricks. And no
# translation, which is the property that puts it in this module.
#
# Vertex ids are the integer lattice points themselves and cell ids are
# ``(x, y, w, h)``, a tile's lower-left corner and size, so unlike the three
# tilings above there is no trim, no distance to quantise and no sort whose
# tie-break has to be reproduced in the TypeScript port.

Brick = tuple[int, int, int, int]  # lower-left corner, then width and height


def _lattice_to_xy(p: tuple[int, int]) -> tuple[float, float]:
    return (float(p[0]), float(p[1]))


def _brick_outline(brick: Brick, corners: set[tuple[int, int]]) -> list[tuple[int, int]]:
    """The rectangle walked counterclockwise, split at every lattice point
    inside one of its edges that is some tile's corner -- a T-vertex.

    The 2D twin of ``solids._split_at_lattice_points``: a brick's corner
    routinely lands in the middle of a neighbour's long edge, and recording it
    there leaves the drawn rectangle unchanged (the point is collinear) while
    making the two share a vertex id, which is what
    ``_shared_vertex_adjacency`` runs on. Every edge is axis-aligned on the
    integer lattice, so this is exact integer arithmetic with no tolerance.

    The test is *conditional* on purpose. Emitting every lattice step
    unconditionally, the way the chair's outline in ``fractal.py`` does, would
    split an edge whose neighbour across it keeps its own edge whole: the two
    stop matching, the half-edges count as boundary and the Euler
    characteristic drops below the 1 a disc must have. One pass is enough --
    a point that is anyone's corner is in ``corners`` from the start, so every
    tile whose edge crosses it picks it up together.
    """
    x, y, w, h = brick
    walk = ((x, y), (x + w, y), (x + w, y + h), (x, y + h))
    ring: list[tuple[int, int]] = []
    for a, b in zip(walk, walk[1:] + walk[:1]):
        steps = max(abs(b[0] - a[0]), abs(b[1] - a[1]))
        ux, uy = (b[0] - a[0]) // steps, (b[1] - a[1]) // steps
        ring.append(a)
        for s in range(1, steps):
            point = (a[0] + ux * s, a[1] + uy * s)
            if point in corners:
                ring.append(point)
    return ring


def _brick_board(mode: str, bricks: list[Brick], mine_count: int, scale: float) -> Board:
    """Finish a list of axis-aligned bricks into a flat board."""
    corners: set[tuple[int, int]] = set()
    for x, y, w, h in bricks:
        corners.update(((x, y), (x + w, y), (x + w, y + h), (x, y + h)))
    cells: dict[Cell, list[tuple[int, int]]] = {
        brick: _brick_outline(brick, corners) for brick in bricks
    }
    if len(cells) != len(bricks):
        raise ValueError("two bricks share a place")
    return _finalize_flat(mode, cells, _lattice_to_xy, mine_count, scale)


def _brick_rings_tiles(rings: int) -> list[Brick]:
    """The board's bricks, ring by ring outwards from the 2x2 core.

    Ring k is the boundary of the 2k x 2k square about the origin: ``k``
    horizontal bricks along its top row and ``k`` along its bottom, then
    ``k - 1`` vertical ones up each side. That is ``4k - 2`` bricks a ring and
    ``2 * rings**2`` in all -- and every run is even, so nothing is ever left
    over.
    """
    if rings < 1:
        raise ValueError("rings must be >= 1")
    bricks: list[Brick] = []
    for k in range(1, rings + 1):
        lo, hi = -k, k - 1  # the 2k x 2k square, centred on the origin
        for x in range(lo, hi, 2):  # its top and bottom rows...
            bricks.append((x, lo, 2, 1))
            bricks.append((x, hi, 2, 1))
        for y in range(lo + 1, hi - 1, 2):  # ...and its two sides
            bricks.append((lo, y, 1, 2))
            bricks.append((hi, y, 1, 2))
    return bricks


def brick_rings_board(rings: int, mine_count: int, scale: float = 30) -> Board:
    """2x1 bricks in ``rings`` concentric square rings about a 2x2 core,
    filling the 2``rings`` x 2``rings`` square. Every tile is a whole brick.
    """
    return _brick_board("brickrings", _brick_rings_tiles(rings), mine_count, scale)
