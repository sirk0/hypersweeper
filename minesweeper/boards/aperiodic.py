from __future__ import annotations

import math
from collections import Counter, defaultdict, deque
from dataclasses import replace
from functools import lru_cache
from typing import NamedTuple

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
# What makes a tiling aperiodic is that it repeats nowhere, and the four
# substitution boards below grow far more of one than they keep: the Penrose
# wheel is 430 rhombi where the easy board is 81, and the Ammann-Beenker star
# 7784 tiles and the Spectre cluster 4401 where the hard board is 480. The
# centred trim is one window onto that patch. Every other window onto it is a
# board of the same size made of tiles that have never sat together before --
# which is what a Penrose, Ammann-Beenker or Spectre board's ``variant`` is:
# not a re-generated tiling, but somewhere else to look at the one the
# substitution already built.
#
# This file's other nonperiodic boards do not take a variant, and
# deliberately: the phyllotactic spiral and the brick rings are nonperiodic by
# *symmetry* rather than by substitution, so each has one distinguished centre
# (the five-fold rosette, the 2x2 core) and a window anywhere else is a crop of
# a structured picture rather than another board.
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
    ids are integer tuples in each tiling's cyclotomic ring, so an edge is
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


class _Patch(NamedTuple):
    """One grown substitution patch, ready to be windowed: per tile, its key
    (a cell id, or the Spectre's label), its vertex ids, its centroid and the
    tie-break ``_window`` sorts it by at the cut rank.

    Growing a patch is most of what building a board costs, and it depends
    on nothing but the substitution depth -- every window and every game on a
    preset is cut from the same one. So each builder grows it once per depth
    (``functools.lru_cache``) and hands out these immutable tuples, which is
    what lets ``_patch_shape`` remember the patch's rim as well.
    """

    keys: tuple
    cells: tuple
    centroids: tuple
    tiebreaks: tuple


def _patch(keys, cells, to_xy, tiebreaks=None) -> _Patch:
    """Freeze a grown patch: vertex ids as tuples, centroids from ``to_xy``,
    and the keys themselves as the tie-break unless one is given."""
    cells = tuple(tuple(ids) for ids in cells)
    centroids = []
    for ids in cells:
        xy = [to_xy(v) for v in ids]
        centroids.append((sum(x for x, _ in xy) / len(xy), sum(y for _, y in xy) / len(xy)))
    keys = tuple(keys)
    return _Patch(keys, cells, tuple(centroids),
                  keys if tiebreaks is None else tuple(tiebreaks))


#: The adjacency and rim depth of the cached patches, by identity. Only a
#: patch held as a tuple is remembered -- the ``_Patch`` the builders cache,
#: which outlives the call -- and the entry keeps a reference to it, so an id
#: is never reused while its entry stands.
_PATCH_SHAPES: dict[int, tuple] = {}


def _patch_shape(cells) -> tuple[list[list[int]], list[int]]:
    """``_patch_adjacency`` and ``_rim_depth`` of a patch, computed once per
    cached patch rather than once per window cut from it."""
    hit = _PATCH_SHAPES.get(id(cells))
    if hit is not None and hit[0] is cells:
        return hit[1], hit[2]
    adjacency = _patch_adjacency(cells)
    depth = _rim_depth(cells, adjacency)
    if isinstance(cells, tuple):
        if len(_PATCH_SHAPES) >= 16:
            _PATCH_SHAPES.clear()
        _PATCH_SHAPES[id(cells)] = (cells, adjacency, depth)
    return adjacency, depth


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
    adjacency, depth = _patch_shape(cells)
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
    patch = _penrose_patch(subdivisions)
    # The tie-break at the cut rank is the cell id, as it always was: a
    # rhombus's colour then the order the merge made it.
    kept = _window(patch.cells, patch.centroids, patch.tiebreaks, keep, variant)
    cells = {patch.keys[i]: list(patch.cells[i]) for i in kept}
    return _finalize_flat("penrose", cells, _z_to_xy, mine_count, scale)


@lru_cache(maxsize=8)
def _penrose_patch(subdivisions: int) -> _Patch:
    """The wheel deflated ``subdivisions`` times and merged into rhombi,
    keyed by cell id (colour, the order the merge made it)."""
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
    return _patch(cells.keys(), cells.values(), _z_to_xy)


# -- Penrose kites and darts (P2) --------------------------------------------
#
# The same Robinson triangles as the rhombi above, in the same ring, and the
# same two shapes of them -- the acute 36-72-72 and the obtuse 108-36-36 --
# but paired along a *leg* instead of the base. Two acute halves glued along
# a leg are a kite (72, 72, 72, 144); two obtuse halves glued along a leg are
# a dart (72, 36, 216, 36). Every triangle carries which leg that is, as
# (color, apex, side, axis): the half-tile's two legs run from ``apex`` to
# ``side`` and from ``apex`` to ``axis``, and its mirror partner shares the
# second. For a half-kite the apex is the kite's 72-degree tip and the axis
# ends at its 144-degree tail; for a half-dart the apex is the dart's reflex
# corner and the axis ends at its tip.
#
# The substitution is not the rhombi's. Deflating by phi, a half-kite becomes
# one whole kite (two half-kites tip to the old side corner) and one
# half-dart lying along its long edge; a half-dart becomes one half-kite and
# one half-dart. The two half-darts a whole kite contributes straddle its long
# edges, and pair with the neighbours' across them. Pairing the rhombi's own
# triangles along a leg instead looks almost right and is not: the darts come
# out phi times the size of the kites, and the kites the rarer tile, which no
# kite-and-dart tiling is (kites outnumber darts by phi). TestKiteDart pins
# both the shapes and the ratio.
#
# The new points sit at 1/phi and 1/phi**2 of the way along an edge, so the
# arithmetic is still only addition, subtraction and division by phi, and
# the vertex ids stay exact.


def _kitedart_triangles(subdivisions: int) -> list[tuple[int, ZPoint, ZPoint, ZPoint]]:
    """The Robinson half-tiles of the kite-and-dart sun, deflated.

    The seed is the *sun*: five kites with their tips at the origin, ten
    half-kites of a unit wheel, alternate ones mirrored so that neighbours
    share the leg between them. Color 0 is a half-kite, 1 a half-dart.
    """
    zero = (0, 0, 0, 0)
    powers = [(1, 0, 0, 0)]
    for _ in range(10):
        powers.append(_zeta_mul(powers[-1]))

    triangles = []
    for i in range(10):
        side, axis = powers[i], powers[i + 1]
        if i % 2:
            side, axis = powers[i + 1], powers[i]
        triangles.append((0, zero, side, axis))

    def toward(p: ZPoint, q: ZPoint, steps: int) -> ZPoint:
        """The point 1/phi**steps of the way from p to q."""
        d = _z_sub(q, p)
        for _ in range(steps):
            d = _z_div_phi(d)
        return _z_add(p, d)

    for _ in range(subdivisions):
        deflated = []
        for color, a, b, c in triangles:
            if color == 0:  # half-kite: tip a, side corner b, tail c
                d = toward(a, b, 2)
                x = toward(a, c, 1)
                deflated += [(1, d, x, a), (0, b, d, x), (0, b, c, x)]
            else:  # half-dart: reflex corner a, side corner b, tip c
                y = toward(b, c, 2)
                deflated += [(1, y, a, b), (0, c, y, a)]
        triangles = deflated
    return triangles


@lru_cache(maxsize=8)
def _kitedart_patch(subdivisions: int) -> _Patch:
    """The sun deflated ``subdivisions`` times, each half-tile merged with its
    mirror across their shared leg; keyed by cell id."""
    waiting: dict = {}
    cells: dict[Cell, list[ZPoint]] = {}
    for color, apex, side, axis in _kitedart_triangles(subdivisions):
        key = (color, *sorted((apex, axis)))
        if key in waiting:
            # apex, side, axis-end, mirrored side: the tile's outline in order
            cells[(color, len(cells))] = [apex, side, axis, waiting.pop(key)]
        else:
            waiting[key] = side
    return _patch(cells.keys(), cells.values(), _z_to_xy)


def kitedart_board(
    subdivisions: int,
    mine_count: int,
    scale: float = 300,
    keep: int | None = None,
    variant: int = 0,
) -> Board:
    """An aperiodic Penrose tiling (P2): kites and darts.

    Starts from the five-kite sun and deflates ``subdivisions`` times; each
    half-tile is then merged with its mirror image across their shared leg
    (unpaired halves on the outer rim are dropped). ``scale`` is the sun's
    radius in pixels. ``keep`` and ``variant`` trim the patch to a board
    exactly as they do for ``penrose_board``: ``keep`` tiles nearest a
    centre, variant 0 being the centred block with the sun in the middle of
    it. See ``_window``.
    """
    patch = _kitedart_patch(subdivisions)
    kept = _window(patch.cells, patch.centroids, patch.tiebreaks, keep, variant)
    cells = {patch.keys[i]: list(patch.cells[i]) for i in kept}

    board = _finalize_flat("kitedart", cells, _z_to_xy, mine_count, scale)
    return replace(board, glyph_anchors={
        cell: _kitedart_glyph_anchor(cell[0], polygon)
        for cell, polygon in board.polygons.items()
    })


def _kitedart_glyph_anchor(
    color: int, polygon: list[tuple[float, float]]
) -> tuple[float, float]:
    """The centre of the biggest circle a kite or a dart holds.

    A dart's vertex mean sits a hair from its reflex corner -- under a tenth
    of the way down its axis from it -- so a number centred there is drawn a
    quarter of the size the tile has room for, pinched between the two short
    edges. Both tiles are symmetric about their axis, and the biggest circle
    is centred on it, a fraction ``t`` of the way down the axis from the tip:

    * a kite is tangential: its incircle touches all four edges, at
      ``t = 1/phi`` (x sin 36 = (phi - x) sin 72 with the axis phi long) --
      only a nudge tailwards of its mean;
    * a dart's circle touches its two long edges and the reflex corner itself
      (the short edges' nearest points to the axis lie past that corner, off
      the edges), so x sin 36 = 1 - x with the axis 1 long, and
      ``t = 1 / (1 + sin 36)`` -- the middle of the arrowhead.

    The polygon is (apex, side, axis end, side): the tip is the apex of a kite
    and the axis end of a dart. A float, not a vertex id: nothing is ever
    keyed by it.
    """
    if color == 0:
        tip, end, t = polygon[0], polygon[2], 2 / (1 + math.sqrt(5))
    else:
        tip, end, t = polygon[2], polygon[0], 1 / (1 + math.sin(math.pi / 5))
    return (tip[0] + (end[0] - tip[0]) * t, tip[1] + (end[1] - tip[1]) * t)


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


# -- Klaassen's spiral monotile ------------------------------------------------
#
# Bernhard Klaassen's spiral tiling ("Forcing nonperiodic tilings with one tile
# using a seed", Eur. J. Combin. 2022): one equilateral **heptagon** whose seven
# edges run along the seven 7th roots of unity, each exactly once, in the order
# zeta^0, zeta^1, zeta^2, zeta^6, zeta^5, zeta^4, zeta^3 (zeta = exp(2*pi*i/7)).
# Its angles are pi/7, 9pi/7, 9pi/7, pi/7, 5pi/7, 5pi/7, 5pi/7: a bent chevron
# with two needle tips, mirror-symmetric (so a reflected copy is just a rotated
# one), and it lies between two concentric regular-heptagon arcs -- three edges
# of one on its concave side, four of the other on its convex side.
#
# Nonperiodic by *symmetry-breaking seed* rather than by substitution, like the
# phyllotactic spiral: the whole tiling is one spiral arm around a single seed
# vertex, so there is no translation and one distinguished centre -- which is
# why this board takes no ``variant`` either.
#
# The construction. Tips meet at *hubs*, four to a hub, and the hubs form one
# chain h0, h1, ... of unit steps h(k+1) = h(k) + e(d_k), e(n) = exp(i*n*pi/7).
# Hub i (i >= 1) sends a fan of ``d_i - d_(i-1) + 2`` tiles outward, the tile
# at direction phi having its tip at h_i and its other tip at
# h_i + (1 + 2cos(2pi/7)) e(phi), for phi = d_(i-1) - 4 .. d_i - 3. Consecutive
# tips of a fan are exactly one unit apart, and a fan's last tip is the next
# fan's first -- so the fans' outer tips *are* the chain's next winding, and
# fan i lays the steps d_(i-1) .. d_i + 14 of it (directions unwrapped, one
# winding = 14). On the turns, t_i = d_i - d_(i-1) in {0, 1, 2}, that is the
# substitution t -> 1^t 0, and every winding is 14 steps longer than the last:
# an Archimedean spiral. The seed is hub 0, where the chain turns back on
# itself (d_(-1) = 1 to d_0 = 8, a half turn) and so fans out nine tiles; its
# first eleven steps (8, 10, 12, 14, then 15 .. 22) are the seed's own.
# Recovered from the published figure and checked against every tile of it.
#
# In exact Z[zeta7]: a point is 6 integer coefficients over (1, zeta, ...,
# zeta^5), reduced by zeta^6 = -(1 + zeta + ... + zeta^5). The fourteen
# directions are e(2m) = zeta^m and e(2m+1) = -zeta^(m+4). No multiplication
# is ever needed -- every vertex is a sum of unit directions -- so vertex ids
# are exact integer tuples and the shared-vertex adjacency needs no tolerance.
# The tiling is edge to edge (no tip lands inside a neighbour's edge).

Z7Point = tuple[int, int, int, int, int, int]

_Z7_ZERO: Z7Point = (0, 0, 0, 0, 0, 0)


def _z7_power(m: int) -> Z7Point:
    """zeta^m for zeta = exp(2*pi*i/7)."""
    m %= 7
    if m == 6:
        return (-1, -1, -1, -1, -1, -1)
    return tuple(1 if k == m else 0 for k in range(6))


def _z7_add(p: Z7Point, q: Z7Point) -> Z7Point:
    return tuple(x + y for x, y in zip(p, q))


def _z7_dir(n: int) -> Z7Point:
    """The unit vector e(n) = exp(i*n*pi/7), n in fourteenths of a turn."""
    n %= 14
    if n % 2 == 0:
        return _z7_power(n // 2)
    return tuple(-c for c in _z7_power(n // 2 + 4))


_ZETA7_BASIS = [
    (math.cos(2 * math.pi * k / 7), math.sin(2 * math.pi * k / 7)) for k in range(6)
]


def _z7_to_xy(p: Z7Point) -> tuple[float, float]:
    return (
        sum(c * bx for c, (bx, _) in zip(p, _ZETA7_BASIS)),
        sum(c * by for c, (_, by) in zip(p, _ZETA7_BASIS)),
    )


#: The tile's edges, in fourteenths of a turn from its first tip: the roots
#: of unity zeta^0, zeta^1, zeta^2, zeta^6, zeta^5, zeta^4 (and zeta^3 closes).
_KLAASSEN_EDGES = (0, 2, 4, 12, 10, 8)

#: The seed: the chain's first twelve steps.
_KLAASSEN_SEED = (8, 10, 12, 14, 15, 16, 17, 18, 19, 20, 21, 22)


def _klaassen_tiles(turns: int) -> list[tuple[tuple[int, int], list[Z7Point]]]:
    """The spiral grown ``turns`` windings out, as ((hub, k), exact vertex ids)
    in hub order: hub ``hub``'s ``k``-th tile counting from its fan's first."""
    steps = list(_KLAASSEN_SEED)
    fans = [(0, 11, 19)]  # (hub, first phi, last phi); hub 0 is the seed's
    source = 1  # the next hub whose fan lays more of the chain
    hub = 1
    while True:
        while len(steps) <= hub:
            steps.extend(d + 14 for d in range(steps[source - 1], steps[source] + 1))
            source += 1
        if steps[hub] >= 8 + 14 * turns:
            break
        fans.append((hub, steps[hub - 1] - 4, steps[hub] - 3))
        hub += 1

    at = [_Z7_ZERO]
    for d in steps[:hub]:
        at.append(_z7_add(at[-1], _z7_dir(d)))

    tiles = []
    for h, first, last in fans:
        for k, phi in enumerate(range(first, last + 1)):
            vertex = at[h]
            ids = [vertex]
            for edge in _KLAASSEN_EDGES:
                vertex = _z7_add(vertex, _z7_dir(phi - 2 + edge))
                ids.append(vertex)
            tiles.append(((h, k), ids))
    return tiles


def klaassen_board(
    turns: int, mine_count: int, keep: int | None = None, scale: float = 30
) -> Board:
    """Klaassen's spiral monotile: one equilateral heptagon tiling the plane
    in a single spiral arm around a seed.

    Grows the spiral ``turns`` windings out, then keeps ``keep`` tiles grown
    out from the seed: tiles are taken in order of Chebyshev distance from
    it, as ``phyllotaxis_board`` trims, but a tile joins only once it shares
    two edges with the tiles already kept (one, when no tile shares two).
    A plain distance trim of this tile leaves chevrons hanging off the rim by
    a single edge, as hooks; grown this way the rim follows the spiral's own
    windings. ``None`` keeps the whole patch. ``scale`` is pixels per edge.
    """
    rows = []  # (chebyshev key, cell key, vertex ids)
    for key, ids in _klaassen_tiles(turns):
        xy = [_z7_to_xy(v) for v in ids]
        cx = sum(x for x, _ in xy) / len(xy)
        cy = sum(y for _, y in xy) / len(xy)
        # Quantised, as for the phyllotactic spiral, so the TypeScript port
        # sorts identically although the last bit of a cosine may differ.
        near = math.floor(max(abs(cx), abs(cy)) * 1e6 + 0.5)
        rows.append((near, key, ids))
    rows.sort(key=lambda row: row[:2])

    if keep is not None and keep < len(rows):
        rows = _klaassen_grow(rows, keep)

    cells: dict[Cell, list[Z7Point]] = {key: ids for _, key, ids in rows}
    return _finalize_flat("klaassen", cells, _z7_to_xy, mine_count, scale)


def _klaassen_grow(rows: list, keep: int) -> list:
    """The first ``keep`` of ``rows`` (in order) that can join edge to edge:
    each step takes the earliest row sharing at least two edges with those
    already taken, else the earliest sharing one, else (the first step) the
    earliest of all."""
    by_edge: dict = defaultdict(list)
    for i, (_, _, ids) in enumerate(rows):
        for k in range(len(ids)):
            by_edge[frozenset((ids[k], ids[(k + 1) % len(ids)]))].append(i)
    shared = [0] * len(rows)
    taken = [False] * len(rows)
    kept = []
    while len(kept) < keep:
        pick = None
        for need in (2, 1, 0):
            pick = next((i for i in range(len(rows))
                         if not taken[i] and shared[i] >= need), None)
            if pick is not None:
                break
        taken[pick] = True
        kept.append(rows[pick])
        ids = rows[pick][2]
        for k in range(len(ids)):
            for j in by_edge[frozenset((ids[k], ids[(k + 1) % len(ids)]))]:
                shared[j] += 1
    return kept


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


@lru_cache(maxsize=8)
def _spectre_patch(levels: int) -> _Patch:
    """Every tile of a level-``levels`` cluster, keyed by its label. The
    tie-break at the cut rank is the tile's own sorted vertex ids -- cell ids
    do not exist yet here, the trim being what puts the tiles in the order
    they are numbered in."""
    labels, cells, seen = [], [], set()
    for label, at in _spectre_leaves(levels):
        ids = [_place_point(at, p) for p in _SPECTRE_OUTLINE]
        fs = frozenset(ids)
        if fs in seen:  # defensive: a single cluster produces no duplicates
            continue
        seen.add(fs)
        labels.append(label)
        cells.append(ids)
    return _patch(labels, cells, _z12_to_xy, [tuple(sorted(ids)) for ids in cells])


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
    # Chebyshev distance from the window's centre, as penrose_board does: it
    # trims to a square block rather than a disc, so the board reads square
    # and packs more tiles onto the screen.
    patch = _spectre_patch(levels)
    kept = _window(patch.cells, patch.centroids, patch.tiebreaks, keep, variant)
    cells: dict[Cell, list] = {
        (patch.keys[row], i): list(patch.cells[row]) for i, row in enumerate(kept)
    }
    return _finalize_flat("spectre", cells, _z12_to_xy, mine_count, scale)


# -- Ammann-Beenker: squares and 45-degree rhombi -----------------------------
#
# The eight-fold aperiodic tiling, by unit squares and unit rhombi with a
# 45-degree corner, and the substitution that inflates it by the silver ratio
# delta = 1 + sqrt(2). Every edge runs along one of the eight unit directions
# zeta^k (zeta = exp(i*pi/4)), so every vertex is a point of Z[zeta8] -- and
# delta is in that ring too: sqrt(2) = zeta - zeta^3, so delta = 1 + zeta -
# zeta^3. Inflating is then multiplying by a ring element, integer arithmetic
# with no rounding anywhere, exactly as the Penrose and Spectre boards above
# keep theirs.
#
# The substitution is not a tile-to-tiles one, which is what the half-squares
# are for. Inflated by delta, a rhombus refills with three rhombi and a square
# with one square and four rhombi -- but in both, each edge of length delta is
# one unit edge and one square's diagonal (delta = 1 + sqrt(2)), so the squares
# along the rim of a supertile are cut in half by it and the other half lies in
# the neighbour. So the substitution runs on rhombi and *half-squares* (isosceles
# right triangles), as Penrose's runs on Robinson triangles, and the halves are
# paired back into squares at the end, the unpaired ones on the patch's rim
# dropped:
#
#   rhombus     -> 3 rhombi + 4 half-squares      (area: delta^2 = 3 + 2*sqrt(2))
#   half-square -> 2 rhombi + 3 half-squares
#
# A square is cut along the one diagonal its own inflation is mirror-symmetric
# about, which makes its halves *marked*: a half-square is (O, P, Q) with the
# right angle at O and P the end of the diagonal whose corner the inflation puts
# two rhombi in. That marking is the whole of the tiling's decoration -- the
# rhombus's rule is symmetric under all four of its own symmetries, so a rhombus
# needs none -- and the two halves of a square are mirror images sharing P and Q.
#
# The rules were read off the cut-and-project tiling (lattice points of Z^4 = the
# Z[zeta8] coefficient tuples whose image under zeta -> zeta^3 lies in a regular
# octagon) rather than drawn: every rhombus and every half-square of a large
# patch of it, inflated, refills the same way, and TestAmmannBeenker checks the
# board this builds against that definition independently, vertex by vertex.
#
# The seed is the eight-rhombus star, the tiling's one vertex of eight-fold
# symmetry, so the patch has the full D8 symmetry of the octagon about it -- the
# centre the variant-0 window keeps, as Penrose's keeps its sun.

# A point of Z[zeta8] as 4 integer coefficients over the basis (1, zeta,
# zeta^2, zeta^3), reduced by zeta^4 = -1 (zeta's minimal polynomial is
# x^4 + 1). As with Z12Point above, these tuples are the vertex ids.
Z8Point = tuple[int, int, int, int]

_Z8_ZERO: Z8Point = (0, 0, 0, 0)


def _zeta8_mul(p: Z8Point) -> Z8Point:
    """Multiply by zeta, i.e. rotate 45 degrees."""
    a, b, c, d = p
    return (-d, a, b, c)


def _z8_add(p: Z8Point, q: Z8Point) -> Z8Point:
    return (p[0] + q[0], p[1] + q[1], p[2] + q[2], p[3] + q[3])


def _z8_sub(p: Z8Point, q: Z8Point) -> Z8Point:
    return (p[0] - q[0], p[1] - q[1], p[2] - q[2], p[3] - q[3])


def _z8_rot(p: Z8Point, k: int) -> Z8Point:
    """Multiply by zeta^k, i.e. rotate k*45 degrees about the origin."""
    for _ in range(k % 8):
        p = _zeta8_mul(p)
    return p


def _z8_conj(p: Z8Point) -> Z8Point:
    """Complex conjugation: zeta^-1 = -zeta^3, zeta^-2 = -zeta^2 and
    zeta^-3 = -zeta, so it swaps and negates the odd coefficients."""
    a, b, c, d = p
    return (a, -d, -c, -b)


def _z8_silver(p: Z8Point) -> Z8Point:
    """Multiply by the silver ratio delta = 1 + sqrt(2), sqrt(2) being
    zeta - zeta^3 -- the inflation, exact in the ring."""
    return _z8_add(p, _z8_sub(_zeta8_mul(p), _z8_rot(p, 3)))


_ZETA8_BASIS = [
    (math.cos(math.pi * k / 4), math.sin(math.pi * k / 4)) for k in range(4)
]


def _z8_to_xy(p: Z8Point) -> tuple[float, float]:
    return (
        sum(c * bx for c, (bx, _) in zip(p, _ZETA8_BASIS)),
        sum(c * by for c, (_, by) in zip(p, _ZETA8_BASIS)),
    )


#: The unit prototiles, counterclockwise: the rhombus on 1 and zeta, and the
#: half-square (O, P, Q) with its right angle at O and its marked diagonal P->Q.
_AB_RHOMB: tuple[Z8Point, ...] = ((0, 0, 0, 0), (1, 0, 0, 0), (1, 1, 0, 0), (0, 1, 0, 0))
_AB_HALF: tuple[Z8Point, ...] = ((0, 0, 0, 0), (1, 0, 0, 0), (0, 0, 1, 0))

# A placement is z -> zeta^rot * (conj z if mirrored else z) + trans, as the
# Spectre's are, over Z[zeta8] (rotation index mod 8).
_AB_Placement = tuple[int, int, Z8Point]


def _ab_place(at: _AB_Placement, p: Z8Point) -> Z8Point:
    rot, mirrored, trans = at
    return _z8_add(_z8_rot(_z8_conj(p) if mirrored else p, rot), trans)


def _ab_compose(a: _AB_Placement, b: _AB_Placement) -> _AB_Placement:
    """``a`` after ``b``."""
    a_rot, a_mirror, _ = a
    b_rot, b_mirror, b_trans = b
    return ((a_rot - b_rot if a_mirror else a_rot + b_rot) % 8,
            a_mirror ^ b_mirror, _ab_place(a, b_trans))


#: The substitution: each prototile inflated by delta, as the unit tiles that
#: refill it -- ("R" rhombus | "H" half-square, placement) in the inflated
#: tile's frame. Deeper in the recursion the translations are inflated again
#: (``_ab_tiles``); the rotations and mirrors never change.
_AB_RULES: dict[str, tuple[tuple[str, _AB_Placement], ...]] = {
    "R": (
        ("R", (0, 0, (0, 0, 0, 0))),    # at the acute corner A...
        ("R", (0, 0, (1, 1, 1, -1))),   # ...and at C
        ("R", (2, 0, (1, 1, 0, -1))),   # across the middle, B to D
        ("H", (2, 0, (1, 1, 0, 0))),    # and a half-square on every edge
        ("H", (3, 1, (1, 1, 1, -1))),
        ("H", (6, 0, (1, 1, 1, -1))),
        ("H", (7, 1, (1, 1, 0, 0))),
    ),
    "H": (
        ("R", (0, 1, (0, 1, 0, 0))),    # a rhombus in the P corner
        ("R", (1, 0, (0, 0, 0, 0))),    # and one in the right angle
        ("H", (2, 1, (0, 1, 0, 0))),    # half the middle square, on P->Q
        ("H", (3, 0, (0, 1, 1, 0))),    # and one on each leg
        ("H", (5, 0, (0, 1, 0, 0))),
    ),
}


def _ab_tiles(levels: int) -> list[tuple[str, _AB_Placement]]:
    """The eight-rhombus star inflated ``levels`` times and refilled with
    unit tiles, as (kind, placement) in the order the substitution lays them.

    Inflating the seed and subdividing it are the same thing seen from the
    two ends: a supertile ``n`` levels up has edge delta**n, so its children's
    translations are the rule's, inflated ``n - 1`` times.
    """
    tiles: list[tuple[str, _AB_Placement]] = [("R", (k, 0, _Z8_ZERO)) for k in range(8)]
    for depth in range(levels - 1, -1, -1):
        rules = {}
        for kind, children in _AB_RULES.items():
            scaled = []
            for child, (rot, mirrored, trans) in children:
                for _ in range(depth):
                    trans = _z8_silver(trans)
                scaled.append((child, (rot, mirrored, trans)))
            rules[kind] = scaled
        tiles = [(child, _ab_compose(at, sub))
                 for kind, at in tiles for child, sub in rules[kind]]
    return tiles


def _ab_cells(levels: int) -> list[tuple[Cell, list[Z8Point]]]:
    """The patch's rhombi and squares, as (cell id, vertex ids counterclockwise).

    Half-squares pair into squares across their marked diagonal: the two halves
    of a square are mirror images sharing P and Q, so they meet on the directed
    key (P, Q). One left waiting at the end is half of a square cut by the rim
    of the patch, and is dropped -- as ``penrose_board`` drops an unpaired
    Robinson triangle. A cell id is (0 for a rhombus or 1 for a square, the
    order it was made in), Penrose's (colour, index).
    """
    cells: list[tuple[Cell, list[Z8Point]]] = []
    waiting: dict = {}
    for kind, at in _ab_tiles(levels):
        mirrored = at[1]
        if kind == "R":
            ids = [_ab_place(at, p) for p in _AB_RHOMB]
            if mirrored:  # a reflection walks the outline clockwise
                ids = [ids[0], *reversed(ids[1:])]
            cells.append(((0, len(cells)), ids))
            continue
        o, p, q = (_ab_place(at, v) for v in _AB_HALF)
        partner = waiting.pop((p, q), None)
        if partner is None:
            waiting[(p, q)] = (o, mirrored)
            continue
        first, first_mirrored = partner
        ids = [first, p, o, q]
        if first_mirrored:
            ids = [ids[0], *reversed(ids[1:])]
        cells.append(((1, len(cells)), ids))
    return cells


@lru_cache(maxsize=8)
def _ab_patch(levels: int) -> _Patch:
    """``_ab_cells`` frozen for windowing, keyed (and tie-broken) by cell id."""
    rows = _ab_cells(levels)
    return _patch((cell for cell, _ in rows), (ids for _, ids in rows), _z8_to_xy)


def ammann_beenker_board(
    levels: int,
    mine_count: int,
    scale: float = 30,
    keep: int | None = None,
    variant: int = 0,
) -> Board:
    """The Ammann-Beenker tiling: unit squares and 45-degree rhombi, eight-fold
    and aperiodic, grown by ``levels`` silver-ratio substitutions of the
    eight-rhombus star (216, 1312, 7784 tiles at levels 2, 3, 4).

    ``keep`` trims to that many tiles by Chebyshev distance and ``variant``
    picks which window, exactly as for ``penrose_board``: 0 is the centred
    block around the eight-fold star, any other integer a window elsewhere in
    the same patch. See ``_window``. ``scale`` is pixels per edge.
    """
    patch = _ab_patch(levels)
    kept = _window(patch.cells, patch.centroids, patch.tiebreaks, keep, variant)
    cells = {patch.keys[i]: list(patch.cells[i]) for i in kept}
    return _finalize_flat("ammannbeenker", cells, _z8_to_xy, mine_count, scale)


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


# -- Klaassen's pentagonal spirals --------------------------------------------
#
# Nonperiodic monohedral tilings by one *convex pentagon*, with n-fold
# rotational symmetry for n = 5, 6 and 7: Bernhard Klaassen, "Rotationally
# symmetric tilings with convex pentagons and hexagons", Elemente der
# Mathematik 71 (2016). His pentagons have angles A B C D E and sides a b c d e
# (side a ending at corner A) with |b| = |c| = |a| + |d| and D + E = 180
# degrees, and B = 360/n gives an n-fold tiling. The member built here is the
# one Wikimedia's 5-fold figure draws -- checked against all 120 tiles of it --
# taken to every n alike: A = C = 180 - 180/n, b = c = 3, a = 1, d = 2.
#
# Two copies glued along e by a half turn make an equilateral hexagon, and
# that hexagon is the phyllotactic spiral's tile again (the zonogon on three
# unit directions u0, u1, u2, now 180/n degrees apart), scaled by 3. So the
# tiling is the phyllotactic spiral's construction run at n-fold -- 2n wedges
# of 180/n degrees, each a quadrant of the hexagon's own lattice, the odd ones
# pushed out one side along u1 -- with every hexagon cut the same way, by the
# chord through its centre from one unit along its u1 side to the point
# opposite. Nonperiodic by symmetry, as the phyllotactic spiral is: a five-
# or seven-fold centre forbids any translation outright, and at n = 6 (which a
# periodic tiling may have) the 2n seams between the wedges all run out from
# the one centre, so a translation would carry them off it.
#
# Every direction is a multiple of 180/n degrees, so the vertex ids live in a
# ring this module already has: Z[zeta10] for n = 5 (as Penrose's and the
# phyllotactic spiral's do), Z[zeta12] for n = 6 (as the Spectre's), and
# Z[zeta14] = Z[zeta7] for n = 7 (as Klaassen's spiral monotile's). Every
# vertex is a sum of unit directions, and a sum is componentwise in all three,
# so one set of helpers serves them all and nothing is ever rounded.
#
# The tiling is *not* edge to edge: a cut's endpoint sits a third of the way
# along a hexagon side, in the middle of the neighbouring pentagon's edge.
# Each run of unit steps is therefore split at the points on it that really
# are some tile's corner -- the conditional split ``_brick_outline`` does,
# for the reason its docstring gives.

PentaPoint = tuple[int, ...]

#: Per fold, the unit vector at k * 180/n degrees and the map to the plane.
_PENTA_RINGS = {
    5: (lambda k: _Z_POWERS[k % 10], _z_to_xy),
    6: (lambda k: _Z12_POWERS[k % 12], _z12_to_xy),
    7: (_z7_dir, _z7_to_xy),
}

def _vec_add(p: PentaPoint, q: PentaPoint) -> PentaPoint:
    return tuple(x + y for x, y in zip(p, q))


def _vec_scale(p: PentaPoint, k: int) -> PentaPoint:
    return tuple(x * k for x in p)


#: One corner of a pentagon and the edge that leaves it: a run of ``count``
#: unit steps along direction ``k`` (u_k, backwards when count < 0), or
#: count 0 for the cut e, the one edge that is not a run.
PentaCorner = tuple[PentaPoint, int, int]


def _pentaspiral_tiles(
    fold: int, rings: int
) -> list[tuple[tuple[int, int, int, int], list[PentaCorner]]]:
    """The 2*``fold`` wedges grown ``rings`` hexagons each way, as
    ((wedge, m, n, half), outline) in wedge order, each outline the
    pentagon's five corners walked counterclockwise.

    Wedge w is wedge 0 turned by w * 180/n degrees, which in these rings is
    just adding w to every direction. Half 0 is the pentagon with the
    hexagon's 360/n corner -- the one that meets the centre -- and half 1 its
    partner across the cut.
    """
    if fold not in _PENTA_RINGS:
        raise ValueError(f"no pentagonal spiral with {fold}-fold symmetry")
    unit, _ = _PENTA_RINGS[fold]
    tiles = []
    for wedge in range(2 * fold):
        w0, w1, w2 = wedge, wedge + 1, wedge + 2
        u0, u1, u2 = (_vec_scale(unit(k), 3) for k in (w0, w1, w2))
        a, b = _vec_add(u0, u1), _vec_add(u1, u2)
        base = u1 if wedge % 2 else _vec_scale(u0, 0)
        for m in range(rings):
            for n in range(rings):
                v0 = _vec_add(base, _vec_add(_vec_scale(a, m), _vec_scale(b, n)))
                v1 = _vec_add(v0, u0)
                v2 = _vec_add(v1, u1)
                v3 = _vec_add(v2, u2)
                v4 = _vec_add(v0, b)
                v5 = _vec_add(v0, u2)
                near = _vec_add(v1, unit(w1))            # the cut, 1 along v1-v2
                far = _vec_add(v4, _vec_scale(unit(w1), -1))  # ...to 1 short of v4
                tiles.append(((wedge, m, n, 0), [
                    (v0, w0, 3), (v1, w1, 1), (near, 0, 0), (far, w1, -2), (v5, w2, -3)]))
                tiles.append(((wedge, m, n, 1), [
                    (near, w1, 2), (v2, w2, 3), (v3, w0, -3), (v4, w1, -1), (far, 0, 0)]))
    return tiles


def _penta_outline(
    fold: int, corners: list[PentaCorner], taken: set[PentaPoint]
) -> list[PentaPoint]:
    """The pentagon's vertex ids, split at every point inside one of its runs
    that is a corner in ``taken`` -- a T-vertex, as ``_brick_outline`` splits
    a brick's edges."""
    unit, _ = _PENTA_RINGS[fold]
    ring: list[PentaPoint] = []
    for corner, k, count in corners:
        ring.append(corner)
        step = _vec_scale(unit(k), 1 if count > 0 else -1)
        point = corner
        for _ in range(abs(count) - 1):
            point = _vec_add(point, step)
            if point in taken:
                ring.append(point)
    return ring


def pentaspiral_board(
    fold: int, rings: int, mine_count: int, keep: int | None = None, scale: float = 18
) -> Board:
    """Klaassen's pentagonal spiral with ``fold``-fold symmetry (5, 6 or 7):
    one convex pentagon, angles 180 - 180/n, 360/n, 180 - 180/n and a D and E
    making 180, tiling the plane in n spiral arms.

    Grows the 2n wedges out to ``rings`` hexagons each way, for 4n*rings^2
    pentagons, then trims to the ``keep`` centremost by Chebyshev distance
    from the centre exactly as ``phyllotaxis_board`` does. ``None`` keeps the
    whole patch. ``scale`` is pixels per unit step (a third of the long side).
    """
    _, to_xy = _PENTA_RINGS.get(fold, (None, None))
    rows = []  # (chebyshev key, cell key, corners)
    for key, corners in _pentaspiral_tiles(fold, rings):
        xy = [to_xy(p) for p, _, _ in corners]
        cx = sum(x for x, _ in xy) / len(xy)
        cy = sum(y for _, y in xy) / len(xy)
        # Quantised, as for the phyllotactic spiral, so the TypeScript port
        # sorts identically although the last bit of a cosine may differ.
        near = math.floor(max(abs(cx), abs(cy)) * 1e6 + 0.5)
        rows.append((near, key, corners))

    if keep is not None and keep < len(rows):
        rows.sort(key=lambda row: row[:2])
        rows = rows[:keep]

    taken = {p for _, _, corners in rows for p, _, _ in corners}
    cells: dict[Cell, list[PentaPoint]] = {
        key: _penta_outline(fold, corners, taken) for _, key, corners in rows
    }
    return _finalize_flat(f"pentaspiral{fold}", cells, to_xy, mine_count, scale)


def pentaspiral5_board(
    rings: int, mine_count: int, keep: int | None = None, scale: float = 18
) -> Board:
    """The five-fold pentagonal spiral; see ``pentaspiral_board``."""
    return pentaspiral_board(5, rings, mine_count, keep, scale)


def pentaspiral6_board(
    rings: int, mine_count: int, keep: int | None = None, scale: float = 18
) -> Board:
    """The six-fold pentagonal spiral; see ``pentaspiral_board``."""
    return pentaspiral_board(6, rings, mine_count, keep, scale)


def pentaspiral7_board(
    rings: int, mine_count: int, keep: int | None = None, scale: float = 18
) -> Board:
    """The seven-fold pentagonal spiral; see ``pentaspiral_board``."""
    return pentaspiral_board(7, rings, mine_count, keep, scale)
