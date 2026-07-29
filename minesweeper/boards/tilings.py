from __future__ import annotations

import math
from dataclasses import dataclass
from functools import lru_cache
from typing import Callable

from minesweeper.boards.core import (
    _HEX_VERTEX_OFFSETS,
    ROOT3,
    Board,
    LatticePoint,
    _build,
    _finalize_flat,
)

# -- 2D builders (cells keyed by (row, index)) ------------------------------
#
# AGENT NOTE (convention for all future flat boards): a finite flat board
# must read as a roughly *square* rectangle, never a round disc, and if
# the tiling is symmetric the board should be too (matching edges, no lone
# tiles poking out on one side). How to get there depends on the tiling:
#   * Periodic tilings -- take a rectangular window of whole periods
#     centred on a rotation centre of the tiling, so the window maps onto
#     itself under the tiling's point group (mirror for the reflective
#     tilings, pinwheel rotation for the chiral ones). archimedean_board
#     does this from the _ArchTemplate domains; square/hex/triangle boards
#     are naturally rectangular.
#   * Aperiodic tilings (Penrose, Hat) have no period to repeat, so grow a
#     generous patch and trim to the ``keep`` centremost cells by
#     Chebyshev distance ``max(|dx|, |dy|)`` from the centroid, which
#     carves out a square. See penrose_board and hat_board.
# Never bound a player-facing board by Euclidean ``dx^2 + dy^2 <= r^2``:
# that leaves a circle.


def square_board(rows: int, cols: int, mine_count: int, scale: float = 32) -> Board:
    cells = {
        (r, c): [(c, r), (c + 1, r), (c + 1, r + 1), (c, r + 1)]
        for r in range(rows)
        for c in range(cols)
    }
    return _build("square", cells, (scale, scale), mine_count)


def _triangle_vertices(x: int, row: int, up: bool) -> list[LatticePoint]:
    """A unit triangle spanning lattice x..x+2 within lattice row ``row``.

    The lattice x unit is half a triangle side; the y unit is the
    triangle height.
    """
    if up:
        return [(x, row + 1), (x + 2, row + 1), (x + 1, row)]
    return [(x, row), (x + 2, row), (x + 1, row + 1)]


def triangle_board(size: int, mine_count: int, scale: float = 52) -> Board:
    """An equilateral triangle of side ``size`` subdivided into ``size**2``
    unit triangles. Row r holds 2r+1 alternating up/down triangles."""
    cells = {}
    for r in range(size):
        x_start = size - r - 1  # center each row
        for i in range(2 * r + 1):
            cells[(r, i)] = _triangle_vertices(x_start + i, r, up=i % 2 == 0)
    return _build("triangle", cells, (scale / 2, scale * ROOT3 / 2), mine_count)


def hextri_board(side: int, mine_count: int, scale: float = 52) -> Board:
    """A regular hexagon of side ``side`` cut into ``6 * side**2`` unit
    triangles -- the triangular tiling on a hexagonal board, the way
    hexhex_board is the hexagonal tiling on one.

    The hexagon has ``2 * side`` rows. Going down, the top edge widens by
    one triangle side per row until the middle, then narrows again; a row
    whose top edge is ``t`` sides wide holds ``2t + 1`` triangles above
    the middle (starting and ending with an upward one) and ``2t - 1``
    below it. Rows are centred in the board's ``4 * side`` lattice
    columns, which lands the hexagon's centre on a lattice vertex and so
    keeps the full six-fold symmetry of the tiling.
    """
    cells = {}
    for r in range(2 * side):
        if r < side:  # upper half: top edge grows, first triangle points up
            count, first_up = 2 * (side + r) + 1, True
        else:  # lower half: top edge shrinks, first triangle points down
            count, first_up = 2 * (3 * side - r) - 1, False
        x_start = (4 * side - count - 1) // 2
        for i in range(count):
            up = (i % 2 == 0) == first_up
            cells[(r, i)] = _triangle_vertices(x_start + i, r, up=up)
    return _build("hextri", cells, (scale / 2, scale * ROOT3 / 2), mine_count)


def triangle_grid_board(
    rows: int, row_width: int, mine_count: int, scale: float = 52
) -> Board:
    """A rectangular strip surface: ``rows`` rows of ``row_width``
    alternating up/down triangles."""
    cells = {}
    for r in range(rows):
        for i in range(row_width):
            cells[(r, i)] = _triangle_vertices(i, r, up=(r + i) % 2 == 0)
    return _build("trigrid", cells, (scale / 2, scale * ROOT3 / 2), mine_count)


def hex_board(rows: int, cols: int, mine_count: int, scale: float = 20) -> Board:
    """Pointy-top hexagons in odd-r offset layout; ``scale`` is the hexagon
    circumradius. Lattice units: x = sqrt(3)/2 * scale, y = scale / 2."""
    cells = {}
    for r in range(rows):
        for c in range(cols):
            kx = 2 * c + (r % 2) + 1
            ky = 3 * r + 2
            cells[(r, c)] = [(kx + ox, ky + oy) for ox, oy in _HEX_VERTEX_OFFSETS]
    return _build("hex", cells, (scale * ROOT3 / 2, scale / 2), mine_count)


def hexhex_board(radius: int, mine_count: int, scale: float = 20) -> Board:
    """A big hexagon composed of small hexagons: all axial coordinates
    (q, r) within ``radius`` of the center, 3r^2 + 3r + 1 cells."""
    cells = {}
    for q in range(-radius, radius + 1):
        for r in range(max(-radius, -q - radius), min(radius, -q + radius) + 1):
            kx = 2 * q + r + 2 * radius + 1
            ky = 3 * r + 3 * radius + 2
            cells[(q, r)] = [(kx + ox, ky + oy) for ox, oy in _HEX_VERTEX_OFFSETS]
    return _build("hexhex", cells, (scale * ROOT3 / 2, scale / 2), mine_count)


# -- Archimedean (semiregular) tilings ---------------------------------------
#
# Each of the eight non-regular uniform tilings is declared once in the
# ARCH_TILINGS registry at the bottom of this file (key, menu label,
# vertex configuration, number of distinct edge directions, template
# factory), from which _ARCH_CONFIGS and _ARCH_TEMPLATES are derived. To
# add an Archimedean tiling, write a _<name>_template() below and add one
# ARCH_TILINGS row -- see AGENTS.md. Six of the eight have two tile
# shapes; the last two (3.4.6.4 and 4.6.12) have three.
#
# Every flat and 3D Archimedean board is assembled from one rectangular
# fundamental domain (an _ArchTemplate): vertices canonicalized into the
# domain, cells as references into this or neighboring domain copies.
# Wrapping onto a surface (surfaces.py) is then the same modular
# arithmetic the square/triangle/hex boards use, with the whole template
# as the repeating unit.


@dataclass(frozen=True)
class _ArchTemplate:
    config: tuple[int, ...]  # vertex configuration, e.g. (3, 6, 3, 6)
    width: float  # domain size in edge lengths
    height: float
    verts: dict  # tag -> (x, y) position within the domain
    cells: tuple  # (name, ((tag, dm, dn), ...)); dm/dn = domain copy offset
    mirror: dict | None  # tag -> (tag, dm, dn) under y -> height - y
    glide: bool = False  # the mirror needs an extra width/2 x-shift (p4g)
    centre: tuple[float, float] | None = None  # rotation centre (domain
    #   coords) for the flat window; None => centre on the biggest tile.
    #   Face-transitive (Laves) tilings whose highest rotation centre sits
    #   on a vertex, not a tile centroid (e.g. pentagon tiles), set this.


def _template(config, width, height, polygons, mirrored=True, glide=False,
              centre=None):
    """Build a template from one domain's worth of cell polygons in float
    coordinates. Each vertex is canonicalized into [0, width) x [0, height);
    the rounded canonical position doubles as its exact hashable tag.
    ``centre`` optionally pins the flat-window rotation centre in domain
    coordinates (see _ArchTemplate.centre)."""

    def reduce(value: float, size: float) -> tuple[float, int]:
        # the slack absorbs tag rounding, so values that are exactly on a
        # domain edge land on its near side; real vertices are never this
        # close to an edge without being on it
        d = math.floor(value / size + 1e-5)
        return round(value - d * size, 6) + 0.0, d  # + 0.0 turns -0.0 into 0.0

    def canonical(x: float, y: float):
        (rx, dm), (ry, dn) = reduce(x, width), reduce(y, height)
        return (rx, ry), dm, dn

    verts = {}
    cells = []
    for name, polygon in polygons:
        refs = []
        for x, y in polygon:
            tag, dm, dn = canonical(x, y)
            verts[tag] = tag
            refs.append((tag, dm, dn))
        # normalize so the cell's centroid lies in domain copy (0, 0):
        # the Möbius builder selects cell instances by centroid
        cx = sum(dm * width + tag[0] for tag, dm, _ in refs) / len(refs)
        cy = sum(dn * height + tag[1] for tag, _, dn in refs) / len(refs)
        mshift = math.floor(cx / width + 1e-9)
        nshift = math.floor(cy / height + 1e-9)
        refs = [(tag, dm - mshift, dn - nshift) for tag, dm, dn in refs]
        cells.append((name, tuple(refs)))

    def wrap_gap(delta: float, size: float) -> float:
        delta = abs(delta) % size
        return min(delta, size - delta)

    def distance(tag, x: float, y: float) -> float:
        return math.hypot(wrap_gap(tag[0] - x, width), wrap_gap(tag[1] - y, height))

    mirror = None
    if mirrored:
        shift = width / 2 if glide else 0.0
        mirror = {}
        for tag in verts:
            x, y = tag[0] + shift, height - tag[1]
            image, dm, dn = canonical(x, y)
            if image not in verts:
                # tags are rounded; match the closest vertex (wrap-aware)
                image = min(verts, key=lambda v: distance(v, x, y))
                if distance(image, x, y) > 1e-4:
                    raise ValueError(f"mirror of {tag} is not a vertex")
            mirror[tag] = (image, dm, dn)
    cells = _insert_t_vertices(verts, cells, width, height)
    return _ArchTemplate(config, width, height, verts, tuple(cells), mirror,
                         glide, centre)


# Tag coordinates are rounded to 1e-6, so a vertex genuinely on an edge can
# miss it by about 1e-6; the nearest vertex that is *not* on an edge is two
# orders of magnitude further off in every template here.
_T_VERTEX_TOL = 1e-5


def _insert_t_vertices(verts, cells, width, height):
    """Split every cell edge at the vertices lying inside it.

    A tiling that is not edge-to-edge has vertices landing in the *interior*
    of a neighbouring tile's edge -- a T-vertex. Recording one as a vertex of
    the tile whose edge it splits leaves the drawn polygon unchanged (the
    point is collinear) but makes the two tiles share a vertex id, which is
    what ``_shared_vertex_adjacency`` runs on. It also turns the tiling into
    an edge-to-edge *mesh* of polygons with 180-degree corners, so the Euler
    characteristic and boundary counts stay meaningful. Edge-to-edge tilings
    have no such vertex, so this is a no-op for all sixteen Archimedean and
    Laves templates.
    """
    def at(tag, dm, dn):
        return (dm * width + tag[0], dn * height + tag[1])

    out = []
    for name, refs in cells:
        points = [at(*ref) for ref in refs]
        split = []
        for i, ref in enumerate(refs):
            ax, ay = points[i]
            bx, by = points[(i + 1) % len(refs)]
            ex, ey = bx - ax, by - ay
            span = math.hypot(ex, ey)
            found = []
            for dm in range(math.floor(min(ax, bx) / width),
                            math.floor(max(ax, bx) / width) + 1):
                for dn in range(math.floor(min(ay, by) / height),
                                math.floor(max(ay, by) / height) + 1):
                    for tag in verts:
                        vx, vy = at(tag, dm, dn)
                        if abs((vx - ax) * ey - (vy - ay) * ex) > _T_VERTEX_TOL * span:
                            continue  # not on the edge's line
                        s = ((vx - ax) * ex + (vy - ay) * ey) / (span * span)
                        if 1e-9 < s < 1 - 1e-9:
                            found.append((s, (tag, dm, dn)))
            split.append(ref)
            split.extend(hit for _, hit in sorted(found))
        out.append((name, tuple(split)))
    return out


def _trihex_template() -> _ArchTemplate:
    """Trihexagonal (3.6.3.6): hexagon centers on a side-2 triangular lattice,
    cell vertices at the lattice edge midpoints. The 2 x 2*sqrt(3)
    rectangle holds two hexagons and four triangles."""
    h = ROOT3 / 2

    def hexagon(cx, cy):
        return [(cx + 1, cy), (cx + 0.5, cy + h), (cx - 0.5, cy + h),
                (cx - 1, cy), (cx - 0.5, cy - h), (cx + 0.5, cy - h)]

    polygons = [
        ("hex0", hexagon(0.0, 0.0)),
        ("hex1", hexagon(1.0, ROOT3)),
        # midpoint triangles of the four lattice faces per domain
        ("tri0", [(1, 0), (1.5, h), (0.5, h)]),
        ("tri1", [(1.5, h), (2, ROOT3), (2.5, h)]),
        ("tri2", [(2, ROOT3), (2.5, ROOT3 + h), (1.5, ROOT3 + h)]),
        ("tri3", [(1.5, ROOT3 + h), (1, 2 * ROOT3), (0.5, ROOT3 + h)]),
    ]
    return _template((3, 6, 3, 6), 2.0, 2 * ROOT3, polygons)


def _truncsquare_template() -> _ArchTemplate:
    """Truncated square (4.8.8): octagons on a square lattice of pitch
    1 + sqrt(2), tilted unit squares filling the corners between them."""
    a = 1 + 2**0.5  # lattice pitch
    p, q = a / 2, 2**0.5 / 2
    octagon = [(0.5, p), (p, 0.5), (p, -0.5), (0.5, -p),
               (-0.5, -p), (-p, -0.5), (-p, 0.5), (-0.5, p)]
    square = [(p - q, p), (p, p - q), (p + q, p), (p, p + q)]
    return _template((4, 8, 8), a, a, [("oct", octagon), ("sq", square)])


def _elongated_template() -> _ArchTemplate:
    """Elongated triangular (3.3.3.4.4): rows of squares separated by rows
    of triangles, consecutive square rows offset by half a square. The
    domain is one square wide and two rows tall, starting at a square
    row's centerline so that the template midline (through the other
    square row) is a mirror line, which the Möbius seam needs."""
    h = ROOT3 / 2
    polygons = [
        ("sq0", [(0, -0.5), (1, -0.5), (1, 0.5), (0, 0.5)]),
        ("tri0", [(0, 0.5), (1, 0.5), (0.5, 0.5 + h)]),
        ("tri1", [(0.5, 0.5 + h), (1, 0.5), (1.5, 0.5 + h)]),
        ("sq1", [(0.5, 0.5 + h), (1.5, 0.5 + h), (1.5, 1.5 + h), (0.5, 1.5 + h)]),
        ("tri2", [(0.5, 1.5 + h), (1.5, 1.5 + h), (1, 1.5 + 2 * h)]),
        ("tri3", [(1, 1.5 + 2 * h), (1.5, 1.5 + h), (2, 1.5 + 2 * h)]),
    ]
    return _template((3, 3, 3, 4, 4), 1.0, 2 + ROOT3, polygons)


def _snubsquare_template() -> _ArchTemplate:
    """Snub square (3.3.4.3.4): squares alternately rotated +-15 degrees
    on a square lattice of pitch sqrt(2+sqrt(3)), pairs of triangles
    between them. p4g has no plain horizontal mirror, only a glide
    (mirror plus half a period), so the template is aligned with the
    glide axis on its midline and marked glide=True."""
    a = (2 + ROOT3) ** 0.5
    r = 2**-0.5

    def square(cx, cy, first_corner):
        return [(cx + r * math.cos(math.radians(first_corner + 90 * k)),
                 cy + r * math.sin(math.radians(first_corner + 90 * k)))
                for k in range(4)]

    def tri_on(points, center, k):
        # the equilateral triangle on edge k of a square, apex away from it
        (x1, y1), (x2, y2) = points[k], points[(k + 1) % 4]
        mx, my = (x1 + x2) / 2, (y1 + y2) / 2
        apex = (mx + ROOT3 * (mx - center[0]), my + ROOT3 * (my - center[1]))
        return [(x1, y1), (x2, y2), apex]

    plus = square(0, a / 4, 60)  # rotated +15
    minus = square(a / 2, 3 * a / 4, 30)  # rotated -15
    polygons = [
        ("sq0", plus),
        ("sq1", minus),
        ("tri0", tri_on(plus, (0, a / 4), 0)),
        ("tri1", tri_on(plus, (0, a / 4), 2)),
        ("tri2", tri_on(minus, (a / 2, 3 * a / 4), 0)),
        ("tri3", tri_on(minus, (a / 2, 3 * a / 4), 2)),
    ]
    return _template((3, 3, 4, 3, 4), a, a, polygons, glide=True)


def _snubhex_template() -> _ArchTemplate:
    """Snub hexagonal (3.3.3.3.6) on the rotated rectangle spanned by the
    orthogonal superlattice vectors (5,1) and (3,-5) (in half-side /
    row-height units of the underlying triangular lattice): sqrt(7) x
    sqrt(21) edge lengths holding two hexagons and sixteen triangles, with
    hexagon centres on the sqrt(7) superlattice. The tiling is chiral
    (p6: no mirror, no glide), so it cannot wrap a Möbius strip; there
    is deliberately no mirror map."""
    width, height = 7**0.5, 21**0.5

    def uv(x, row):
        # coordinates along the two orthogonal superlattice directions
        return ((5 * x + 3 * row) / (4 * width), 3 * (x - 5 * row) / (4 * height))

    def hex_center(x, row):
        m, n = 3 * (x - 1) - row, 5 * row - (x - 1)
        if m % 14 or n % 14:
            return None
        return (m // 14, n // 14)

    def in_domain(points):
        cu = sum(u for u, _ in points) / len(points)
        cv = sum(v for _, v in points) / len(points)
        return -1e-9 <= cu < width - 1e-9 and -1e-9 <= cv < height - 1e-9

    polygons = []
    for row in range(-7, 4):
        for i in range(-3, 11):
            corners = _triangle_vertices(i, row, up=(row + i) % 2 == 0)
            if any(hex_center(*p) is not None for p in corners):
                continue  # part of a hexagon
            points = [uv(*p) for p in corners]
            if in_domain(points):
                polygons.append((f"t{row},{i}", points))
    ring = [(2, 0), (1, 1), (-1, 1), (-2, 0), (-1, -1), (1, -1)]
    for m in range(-3, 4):
        for n in range(-3, 4):
            cx, crow = 1 + 5 * m + n, m + 3 * n
            points = [uv(cx + ox, crow + oy) for ox, oy in ring]
            if in_domain(points):
                polygons.append((f"h{m},{n}", points))
    return _template((3, 3, 3, 3, 6), width, height, polygons, mirrored=False)


def _trunchex_template() -> _ArchTemplate:
    """Truncated hexagonal (3.12.12): dodecagons on a hexagonal lattice of
    pitch 2+sqrt(3), up/down triangles between them. The conventional
    rectangle holds two dodecagons and four triangles."""
    a = 2 + ROOT3
    r = (6**0.5 + 2**0.5) / 2  # dodecagon circumradius, side 1
    e = 0.5 + ROOT3 / 2

    def around(cx, cy, suffix):
        dodecagon = [(cx + r * math.cos(math.radians(15 + 30 * k)),
                      cy + r * math.sin(math.radians(15 + 30 * k)))
                     for k in range(12)]
        return [
            ("dod" + suffix, dodecagon),
            # the up and the down triangle right of this dodecagon
            ("up" + suffix, [(cx + a / 2, cy + 0.5), (cx + a - e, cy + e),
                             (cx + e, cy + e)]),
            ("down" + suffix, [(cx + a / 2, cy - 0.5), (cx + e, cy - e),
                               (cx + a - e, cy - e)]),
        ]

    polygons = around(0, 0, "0") + around(a / 2, a * ROOT3 / 2, "1")
    return _template((3, 12, 12), a, a * ROOT3, polygons)


def _hex_lattice_polygons(centre_at, hexagon_at, decorate, width, height):
    """Assemble one rectangular domain of a tiling built on a triangular
    lattice of hexagon (or dodecagon) centres. ``hexagon_at(cx, cy)`` is
    the central polygon around a lattice point and ``decorate(cx, cy)``
    yields the polygons hung off it (shared with neighbours); everything
    is deduplicated by rounded centroid and kept when its centroid lands
    in [0, width) x [0, height)."""
    def centroid(polygon):
        return (sum(x for x, _ in polygon) / len(polygon),
                sum(y for _, y in polygon) / len(polygon))

    polygons = {}
    for m in range(-2, 4):
        for n in range(-2, 4):
            cx, cy = centre_at(m, n)
            for name, polygon in [("c", hexagon_at(cx, cy)), *decorate(cx, cy)]:
                gx, gy = centroid(polygon)
                if -1e-9 <= gx < width - 1e-9 and -1e-9 <= gy < height - 1e-9:
                    polygons[(name, round(gx, 3), round(gy, 3))] = polygon
    return [(f"{name}{i}", polygon)
            for i, ((name, _, _), polygon) in enumerate(polygons.items())]


def _regular_polygon(cx, cy, sides, circumradius, offset_deg):
    return [(cx + circumradius * math.cos(math.radians(offset_deg + 360 * k / sides)),
             cy + circumradius * math.sin(math.radians(offset_deg + 360 * k / sides)))
            for k in range(sides)]


def _square_on_edge(cx, cy, apothem, normal_deg):
    """The unit square sitting outside the edge whose outward normal is
    ``normal_deg`` at distance ``apothem`` from (cx, cy)."""
    phi = math.radians(normal_deg)
    ux, uy = math.cos(phi), math.sin(phi)
    tx, ty = -uy, ux  # along the edge
    mx, my = cx + apothem * ux, cy + apothem * uy
    a = (mx + 0.5 * tx, my + 0.5 * ty)
    b = (mx - 0.5 * tx, my - 0.5 * ty)
    return [a, b, (b[0] + ux, b[1] + uy), (a[0] + ux, a[1] + uy)]


def _rhombitrihex_template() -> _ArchTemplate:
    """Rhombitrihexagonal (3.4.6.4): hexagons on a triangular lattice of
    pitch 1+sqrt(3), a square shared across every hexagon edge and a
    triangle in every gap between two squares. The rectangle holds two
    hexagons, six squares and four triangles."""
    a = 1 + ROOT3

    def centre_at(m, n):
        return (m * a + n * a / 2, n * a * ROOT3 / 2)

    def hexagon_at(cx, cy):
        return _regular_polygon(cx, cy, 6, 1.0, 30)  # vertices at 30, 90, ...

    def decorate(cx, cy):
        out = []
        for k in range(6):
            out.append(("sq", _square_on_edge(cx, cy, ROOT3 / 2, 60 * k)))
            vx = cx + math.cos(math.radians(30 + 60 * k))
            vy = cy + math.sin(math.radians(30 + 60 * k))
            u1 = (math.cos(math.radians(60 * k)), math.sin(math.radians(60 * k)))
            u2 = (math.cos(math.radians(60 * k + 60)), math.sin(math.radians(60 * k + 60)))
            out.append(("tri", [(vx, vy), (vx + u1[0], vy + u1[1]),
                                (vx + u2[0], vy + u2[1])]))
        return out

    width, height = a, a * ROOT3
    polygons = _hex_lattice_polygons(centre_at, hexagon_at, decorate, width, height)
    return _template((3, 4, 6, 4), width, height, polygons)


def _trunctrihex_template() -> _ArchTemplate:
    """Truncated trihexagonal (4.6.12): dodecagons on a triangular lattice
    of pitch 3+sqrt(3), a square shared across every second dodecagon edge
    (facing a neighbour) and a hexagon in each triangular gap between three
    dodecagons. The rectangle holds two dodecagons, six squares and four
    hexagons."""
    a = 3 + ROOT3
    r12 = (6**0.5 + 2**0.5) / 2  # dodecagon circumradius, side 1
    apothem = (2 + ROOT3) / 2

    def centre_at(m, n):
        return (m * a + n * a / 2, n * a * ROOT3 / 2)

    def dodecagon_at(cx, cy):
        return _regular_polygon(cx, cy, 12, r12, 15)

    def decorate(cx, cy):
        # this dodecagon's lattice indices, to locate its triangular holes
        n0 = round(cy / (a * ROOT3 / 2))
        m0 = round((cx - n0 * a / 2) / a)
        out = [("sq", _square_on_edge(cx, cy, apothem, 60 * k)) for k in range(6)]
        for corners in [((0, 0), (1, 0), (0, 1)), ((1, 0), (0, 1), (1, 1))]:
            centres = [centre_at(m0 + dm, n0 + dn) for dm, dn in corners]
            hx = sum(p[0] for p in centres) / 3
            hy = sum(p[1] for p in centres) / 3
            out.append(("hex", _regular_polygon(hx, hy, 6, 1.0, 0)))
        return out

    width, height = a, a * ROOT3
    polygons = _hex_lattice_polygons(centre_at, dodecagon_at, decorate, width, height)
    return _template((4, 6, 12), width, height, polygons)


# -- Laves (dual / Catalan) tilings ------------------------------------------
#
# Each Laves tiling is the dual of one Archimedean tiling: a vertex at every
# tile centre, joined across every shared edge. _dual_template builds it
# mechanically from the primal _ArchTemplate (AGENTS.md), so each factory
# below is a one-liner. The dual shares the primal's translation lattice
# (same width/height) and wallpaper group, so its mirror/glide come straight
# from the primal; its single tile shape sits around each primal vertex, and
# its window is centred on the primal's largest-tile centre (a rotation and,
# where reflective, mirror centre of both tilings).


def _dual_template(primal: Callable[[], _ArchTemplate]) -> _ArchTemplate:
    p = primal()
    width, height = p.width, p.height

    def centroid(refs):
        cx = sum(dm * width + tag[0] for tag, dm, dn in refs) / len(refs)
        cy = sum(dn * height + tag[1] for tag, dm, dn in refs) / len(refs)
        return cx, cy

    centres = {name: centroid(refs) for name, refs in p.cells}
    sides = {name: len(refs) for name, refs in p.cells}

    # dual vertex = primal tile centre; dual face = the ring of tile centres
    # around a primal vertex, ordered by angle
    polygons = []
    for i, vertex in enumerate(p.verts):
        vx, vy = vertex
        ring = []
        for name, refs in p.cells:
            cx, cy = centres[name]
            for tag, dm, dn in refs:
                if tag == vertex:
                    ring.append((cx - dm * width, cy - dn * height))
        ring.sort(key=lambda pt: math.atan2(pt[1] - vy, pt[0] - vx))
        polygons.append((f"d{i}", ring))

    # centre the flat window on the primal's largest tile (its centre is the
    # highest-order rotation/mirror centre shared by both tilings); pick the
    # copy nearest the origin so the domain coordinate is canonical
    widest = max(sides.values())
    centre = min(
        ((round(cx % width, 6), round(cy % height, 6))
         for name, (cx, cy) in centres.items() if sides[name] == widest),
        key=lambda c: c[0] ** 2 + c[1] ** 2,
    )
    return _template(p.config, width, height, polygons,
                     mirrored=p.mirror is not None, glide=p.glide, centre=centre)


def _prismaticpent_template() -> _ArchTemplate:
    """Prismatic pentagonal (dual of the elongated triangular tiling)."""
    return _dual_template(_elongated_template)


def _cairo_template() -> _ArchTemplate:
    """Cairo pentagonal (dual of the snub square tiling)."""
    return _dual_template(_snubsquare_template)


def _rhombille_template() -> _ArchTemplate:
    """Rhombille (dual of the trihexagonal tiling)."""
    return _dual_template(_trihex_template)


def _floret_template() -> _ArchTemplate:
    """Floret pentagonal (dual of the snub hexagonal tiling); chiral."""
    return _dual_template(_snubhex_template)


def _tetrakis_template() -> _ArchTemplate:
    """Tetrakis square (dual of the truncated square tiling)."""
    return _dual_template(_truncsquare_template)


def _triakis_template() -> _ArchTemplate:
    """Triakis triangular (dual of the truncated hexagonal tiling)."""
    return _dual_template(_trunchex_template)


def _deltoidal_template() -> _ArchTemplate:
    """Deltoidal trihexagonal (dual of the rhombitrihexagonal tiling)."""
    return _dual_template(_rhombitrihex_template)


def _kisrhombille_template() -> _ArchTemplate:
    """Kisrhombille (dual of the truncated trihexagonal tiling)."""
    return _dual_template(_trunctrihex_template)


# -- isogonal (non-edge-to-edge) tilings -------------------------------------
#
# Convex regular polygons also tile the plane *without* meeting edge to edge:
# a tile's corner can land in the interior of its neighbour's edge, a
# T-vertex. Wikipedia's "Euclidean tilings by convex regular polygons"
# pictures six isogonal (vertex-transitive) families of these -- every vertex
# alike, and each family carrying one free real parameter: a row offset, or
# the ratio between two tile sizes. The six built below are their most
# symmetric members (offset 1/2, size ratio 1/2). A seventh family exists --
# square rows offset in a zig-zag rather than progressively -- but at the
# half-square offset it is the same tiling as the running bond below, so it
# is not built separately.
#
# They need no new machinery: each is periodic, so one rectangular domain
# describes it, and _insert_t_vertices records the T-vertices so the shared-
# vertex adjacency rule still sees the neighbours across a split edge. The
# extra vertex is collinear, so it is invisible when the tile is drawn; the
# renderer's shape colouring drops it before measuring, and a square with a
# split edge is still a square.
#
# All six are flat-only for now (TilingSpec.flat_only): wrapping one onto a
# manifold needs its own preset windows per surface, and for the reflective
# two a seam mirror that survives the T-vertices.


def _periodic_domain(v1, v2, width, height, polygons, turn=0.0, span=8):
    """The tiles of a doubly periodic pattern whose centroids land in the
    ``width`` x ``height`` domain.

    ``v1``/``v2`` generate the pattern's translation lattice and ``polygons``
    are the tiles hung off one lattice point, both in the pattern's own
    frame; everything is rotated by ``turn`` degrees into the domain's frame.
    Tiles are deduplicated by rounded centroid, so one shared between lattice
    points is kept once (and named once)."""
    kept = {}
    for m in range(-span, span + 1):
        for n in range(-span, span + 1):
            ox = m * v1[0] + n * v2[0]
            oy = m * v1[1] + n * v2[1]
            for name, polygon in polygons:
                points = [_rotate2((x + ox, y + oy), turn) for x, y in polygon]
                gx = sum(x for x, _ in points) / len(points)
                gy = sum(y for _, y in points) / len(points)
                if -1e-9 <= gx < width - 1e-9 and -1e-9 <= gy < height - 1e-9:
                    kept[(name, round(gx, 6), round(gy, 6))] = points
    return [(f"{key[0]}{i}", points)
            for i, (key, points) in enumerate(sorted(kept.items()))]


def _rotate2(point, degrees):
    if not degrees:
        return point
    angle = math.radians(degrees)
    cos, sin = math.cos(angle), math.sin(angle)
    return (point[0] * cos - point[1] * sin, point[0] * sin + point[1] * cos)


def _triangular_domain(c1, polygons):
    """One rectangular domain of a pattern on the triangular lattice
    generated by ``c1`` and its 60-degree rotation: the |c1| x |c1|*sqrt(3)
    rectangle (two lattice points), in the frame where ``c1`` lies along the
    x axis. The same orthogonal-superlattice trick _snubhex_template uses."""
    pitch = math.hypot(*c1)
    turn = -math.degrees(math.atan2(c1[1], c1[0]))
    width, height = pitch, pitch * ROOT3
    v1, v2 = c1, _rotate2(c1, 60)
    return width, height, _periodic_domain(v1, v2, width, height, polygons, turn)


def _polar(degrees, radius=1.0):
    angle = math.radians(degrees)
    return (radius * math.cos(angle), radius * math.sin(angle))


def _offsetsquare_template() -> _ArchTemplate:
    """Offset square, the running bond of a brick wall (cmm): rows of unit
    squares, each row shifted half a square against the one below, so every
    vertex is two square corners meeting the middle of a third square's edge
    (90 + 90 + 180). The domain runs from a square row's centreline, so the
    template midline is a mirror line."""
    return _template((4, 4, 4), 1.0, 2.0, [
        ("sq0", [(0, -0.5), (1, -0.5), (1, 0.5), (0, 0.5)]),
        ("sq1", [(-0.5, 0.5), (0.5, 0.5), (0.5, 1.5), (-0.5, 1.5)]),
    ])


def _staggeredtri_template() -> _ArchTemplate:
    """Staggered triangular (cmm): strips of unit triangles, each strip
    shifted half an edge against the one below -- half a step off the
    triangular tiling's own alignment, so every strip vertex lands in the
    middle of the neighbouring strip's edge (60 + 60 + 60 + 180). The
    strip mirror is a glide (reflect plus half a period)."""
    h = ROOT3 / 2
    return _template((3, 3, 3, 3), 1.0, 2 * h, [
        ("up0", [(0, 0), (1, 0), (0.5, h)]),
        ("down0", [(-0.5, h), (0.5, h), (0, 0)]),
        ("up1", [(0, h), (1, h), (0.5, 2 * h)]),
        ("down1", [(-0.5, 2 * h), (0.5, 2 * h), (0, h)]),
    ], glide=True)


def _pythagorean_template(ratio: float = 0.5) -> _ArchTemplate:
    """Pythagorean, the two-squares tiling (p4): squares of side 1 and
    ``ratio`` laid so that four small squares surround each large one and
    every vertex is a large corner, a small corner and a large edge passing
    through (90 + 90 + 180). Its translation lattice (1, r) / (-r, 1) is
    tilted against the squares, so the domain is the axis-aligned
    superlattice square of side (1 + r*r) / r -- 2.5 at r = 1/2, holding
    five squares of each size. p4 has no reflection at all."""
    r = ratio
    side = (1 + r * r) / r
    big = [(0, 0), (1, 0), (1, 1), (0, 1)]
    small = [(1 - r, 1), (1, 1), (1, 1 + r), (1 - r, 1 + r)]
    polygons = _periodic_domain((1, r), (-r, 1), side, side,
                                [("big", big), ("small", small)])
    return _template((4, 4, 4), side, side, polygons, mirrored=False)


def _rotatedhex_template(gap: float = 0.5) -> _ArchTemplate:
    """Rotated hexagonal (p6), the tiling whose triangles are each ringed by
    three hexagons: unit hexagons slid along their shared edges until
    triangles of side ``gap`` open between them, so every vertex is a
    triangle corner, a hexagon corner and a hexagon edge passing through
    (60 + 120 + 180). One of the two one-parameter families running between
    the hexagonal tiling (gap 0) and the trihexagonal one (gap 1); the
    hexagon centres stay on a triangular lattice, of pitch sqrt(3 + gap^2),
    turned against the hexagons -- which is what makes it chiral."""
    corners = [_polar(60 * k) for k in range(6)]
    c1 = (ROOT3 * _polar(30)[0] + gap * _polar(120)[0],
          ROOT3 * _polar(30)[1] + gap * _polar(120)[1])
    lattice = [(0.0, 0.0), c1, _rotate2(c1, 60)]
    polygons = [("hex", corners)]
    # the two triangular gaps per lattice cell: the corner each of the three
    # surrounding hexagons reaches into the gap
    for name, triple in (("up", (lattice[0], lattice[1], lattice[2])),
                         ("down", (lattice[1], lattice[2],
                                   (lattice[1][0] + lattice[2][0],
                                    lattice[1][1] + lattice[2][1])))):
        gx = sum(p[0] for p in triple) / 3
        gy = sum(p[1] for p in triple) / 3
        polygons.append((name, [
            min(((o[0] + cx, o[1] + cy) for cx, cy in corners),
                key=lambda p: (p[0] - gx) ** 2 + (p[1] - gy) ** 2)
            for o in triple
        ]))
    width, height, cells = _triangular_domain(c1, polygons)
    return _template((3, 6, 6), width, height, cells, mirrored=False)


def _rotatedtri_template(hexagon: float = 0.5) -> _ArchTemplate:
    """Rotated triangular (p6), the tiling whose hexagons are each ringed by
    six triangles: unit triangles slid past each other until hexagons of
    side ``hexagon`` open at the triangular tiling's vertices, so every
    vertex is a hexagon corner, a triangle corner and a triangle edge
    passing through (60 + 120 + 180). The other family between the
    triangular tiling (hexagon 0) and the trihexagonal one (hexagon 1),
    with the roles of the two tiles swapped against _rotatedhex_template;
    lattice pitch sqrt(3*hexagon^2 + 1)."""
    h = hexagon
    corners = [_polar(60 * k, h) for k in range(6)]
    polygons = [("hex", corners)]
    for k, (vx, vy) in enumerate(corners):
        # the triangle with a corner on this hexagon corner, its edge
        # running along the hexagon's edge and out past the next corner
        polygons.append(("tri", [
            (vx, vy),
            (vx + _polar(120 + 60 * k)[0], vy + _polar(120 + 60 * k)[1]),
            (vx + _polar(60 + 60 * k)[0], vy + _polar(60 + 60 * k)[1]),
        ]))
    c1 = (1.5 * h - 0.5, ROOT3 / 2 * (1 + h))
    width, height, cells = _triangular_domain(c1, polygons)
    # the 6-fold centre; the biggest-tile rule would pick either tile here,
    # both having six vertices once the T-vertices are in, and a triangle
    # centre is only 3-fold
    centre = min((c for name, c in
                  ((name, (sum(x for x, _ in p) / len(p),
                           sum(y for _, y in p) / len(p)))
                   for name, p in cells) if name.startswith("hex")),
                 key=lambda c: c[0] ** 2 + c[1] ** 2)
    return _template((3, 3, 6), width, height, cells, mirrored=False,
                     centre=(round(centre[0], 6), round(centre[1], 6)))


def _threescaletri_template(ratio: float = 0.5) -> _ArchTemplate:
    """Three-scale triangular (p3): triangles of side ``ratio``, 1 and
    1 + ``ratio``, one of each per lattice cell. Every edge of a big
    triangle is covered by a medium and a small one end to end, so every
    vertex is a small, a medium and a big corner against the big edge
    running through (60 + 60 + 60 + 180). p3 is the one wallpaper group
    here with no half-turn (see ArchTiling.half_turn)."""
    t = ratio
    big_side = 1 + t
    corners = [(0.0, 0.0), (1.0, 0.0), (0.5, ROOT3 / 2)]
    polygons = [("med", corners)]
    for i in range(3):
        (px, py), (qx, qy) = corners[i], corners[(i + 1) % 3]
        (rx, ry) = corners[(i + 2) % 3]
        out = math.degrees(math.atan2(qy - py, qx - px))
        on = math.degrees(math.atan2(ry - qy, rx - qx))
        # the big triangle outside this edge, running from p past q
        polygons.append(("big", [
            (px, py),
            (px + _polar(out, big_side)[0], py + _polar(out, big_side)[1]),
            (px + _polar(out - 60, big_side)[0], py + _polar(out - 60, big_side)[1]),
        ]))
        # the small triangle in the wedge at q, between those two big ones
        polygons.append(("small", [
            (qx, qy),
            (qx + _polar(out, t)[0], qy + _polar(out, t)[1]),
            (qx + _polar(on - 60, t)[0], qy + _polar(on - 60, t)[1]),
        ]))
    # The translation to the medium triangle on the big triangle's next edge
    # round: that edge leaves the origin at -60 degrees, carrying the small
    # triangle first and the medium one behind it.
    near = _polar(-60, t)
    far = _polar(-60, big_side)
    third = (near[0] + _polar(-120)[0], near[1] + _polar(-120)[1])
    c1 = ((near[0] + far[0] + third[0]) / 3 - sum(x for x, _ in corners) / 3,
          (near[1] + far[1] + third[1]) / 3 - sum(y for _, y in corners) / 3)
    width, height, cells = _triangular_domain(c1, polygons)
    return _template((3, 3, 3, 3), width, height, cells, mirrored=False)


@dataclass(frozen=True)
class ArchTiling:
    """One template-based periodic tiling, in one of three families: the
    ``uniform`` (Archimedean) tilings, their ``dual`` (Laves/Catalan)
    partners, and the ``isogonal`` tilings that are not edge to edge -- see
    AGENTS.md. The menu catalog, mode strings, presets and tests all derive
    from this list."""
    key: str                       # "trihex"
    label: str                     # menu label, "Trihexagonal"
    config: tuple[int, ...]        # for a vertex-transitive tiling, the
    #   vertex configuration (3, 6, 3, 6) -- for an isogonal one, counting
    #   the tile whose edge passes straight through the vertex; for a
    #   face-transitive (Laves) tiling, the configuration of its single
    #   tile shape.
    edge_directions: int           # distinct edge directions
    template: Callable[[], "_ArchTemplate"]
    family: str = "uniform"        # "uniform" | "dual" | "isogonal"
    half_turn: bool = True         # the tiling maps onto itself under some
    #   180-degree rotation, so a window centred on one reads symmetric.
    #   True of every wallpaper group here except p3.

    @property
    def vertex_transitive(self) -> bool:
        """Every vertex alike -- the uniform and isogonal families. The
        Laves duals are face-transitive instead (every tile congruent), so
        the vertex-configuration invariants do not apply to them."""
        return self.family != "dual"

    @property
    def edge_to_edge(self) -> bool:
        """Tiles meet whole edge against whole edge. False for the isogonal
        family, whose tiles carry T-vertices (see _insert_t_vertices)."""
        return self.family != "isogonal"


# Listed in vertex-configuration order, the order Wikipedia's "List of
# Euclidean uniform tilings" uses, so the menu's Uniform page reads the
# same way; the Laves block below repeats it, each dual next to the
# position its uniform tiling holds above.
ARCH_TILINGS = (
    ArchTiling("snubhex", "Snub hexagonal", (3, 3, 3, 3, 6), 12,
               _snubhex_template),
    ArchTiling("elongated", "Elongated triangular", (3, 3, 3, 4, 4), 12,
               _elongated_template),
    ArchTiling("snubsquare", "Snub square", (3, 3, 4, 3, 4), 12,
               _snubsquare_template),
    ArchTiling("rhombitrihex", "Rhombitrihexagonal", (3, 4, 6, 4), 12,
               _rhombitrihex_template),
    ArchTiling("trihex", "Trihexagonal", (3, 6, 3, 6), 12, _trihex_template),
    ArchTiling("trunchex", "Truncated hexagonal", (3, 12, 12), 12,
               _trunchex_template),
    ArchTiling("trunctrihex", "Truncated trihexagonal", (4, 6, 12), 12,
               _trunctrihex_template),
    ArchTiling("truncsquare", "Truncated square", (4, 8, 8), 8,
               _truncsquare_template),
    # the Laves (dual / Catalan) tilings -- face-transitive, so config below
    # is the tile's Laves symbol (the dual's vertex figure) and the
    # vertex-configuration invariants do not apply.
    ArchTiling("floret", "Floret pentagonal", (3, 3, 3, 3, 6), 12,
               _floret_template, family="dual"),
    ArchTiling("prismaticpent", "Prismatic pentagonal", (3, 3, 3, 4, 4), 12,
               _prismaticpent_template, family="dual"),
    ArchTiling("cairo", "Cairo pentagonal", (3, 3, 4, 3, 4), 12,
               _cairo_template, family="dual"),
    ArchTiling("deltoidal", "Deltoidal trihexagonal", (3, 4, 6, 4), 12,
               _deltoidal_template, family="dual"),
    ArchTiling("rhombille", "Rhombille", (3, 6, 3, 6), 12,
               _rhombille_template, family="dual"),
    ArchTiling("triakis", "Triakis triangular", (3, 12, 12), 12,
               _triakis_template, family="dual"),
    ArchTiling("kisrhombille", "Kisrhombille", (4, 6, 12), 12,
               _kisrhombille_template, family="dual"),
    ArchTiling("tetrakis", "Tetrakis square", (4, 8, 8), 8,
               _tetrakis_template, family="dual"),
    # the isogonal tilings that are not edge to edge: vertex-transitive like
    # the uniform ones, but a tile's corner may land in the middle of its
    # neighbour's edge. config counts that neighbour, so it is the tiles
    # meeting at a vertex rather than a corner sequence.
    ArchTiling("offsetsquare", "Offset square", (4, 4, 4), 2,
               _offsetsquare_template, family="isogonal"),
    ArchTiling("staggeredtri", "Staggered triangular", (3, 3, 3, 3), 3,
               _staggeredtri_template, family="isogonal"),
    ArchTiling("pythagorean", "Pythagorean", (4, 4, 4), 2,
               _pythagorean_template, family="isogonal"),
    ArchTiling("rotatedhex", "Rotated hexagonal", (3, 6, 6), 6,
               _rotatedhex_template, family="isogonal"),
    ArchTiling("rotatedtri", "Rotated triangular", (3, 3, 6), 6,
               _rotatedtri_template, family="isogonal"),
    ArchTiling("threescaletri", "Three-scale triangular", (3, 3, 3, 3), 3,
               _threescaletri_template, family="isogonal", half_turn=False),
)

# Backward-compatible views derived from the single registry above.
_ARCH_TEMPLATES = {t.key: t.template for t in ARCH_TILINGS}
_ARCH_CONFIGS = {t.key: (t.config, t.edge_directions) for t in ARCH_TILINGS}


@lru_cache(maxsize=None)
def _arch_template(tiling: str) -> _ArchTemplate:
    return _ARCH_TEMPLATES[tiling]()


def archimedean_board(
    tiling: str, nx: int, ny: int, mine_count: int, scale: float = 40
) -> Board:
    """A flat, roughly ``nx`` by ``ny`` domain rectangle of an
    Archimedean tiling, built from the tiling's periodic domain (the same
    ``_ArchTemplate`` that wraps the donut/cylinder/Mobius).

    The tiles are kept by centroid inside an ``nx*width`` by ``ny*height``
    window centred on the larger tile nearest the middle -- a square,
    hexagon, octagon or dodecagon, whose centre is always a rotation
    centre of the tiling. Rotating that window 180 degrees maps it (and
    the tiling) onto itself, so the patch is symmetric under the tiling's
    point group: a plain left-right / top-bottom mirror for the reflective
    tilings (that same centre lies on their mirror axes), and the natural
    pinwheel rotation for the chiral snub tilings. That is what keeps the
    edges clean and balanced instead of leaving stray tiles on one side."""
    template = _arch_template(tiling)
    width_units, height_units = template.width, template.height

    def position(key):
        m, n, tag = key
        vx, vy = template.verts[tag]
        return (m * width_units + vx, n * height_units + vy)

    # grow two extra domains all round so the centred window is fully
    # populated, including the outer tiles' shared neighbours
    grown = {
        (m, n, name): [(m + dm, n + dn, tag) for tag, dm, dn in refs]
        for m in range(nx + 2)
        for n in range(ny + 2)
        for name, refs in template.cells
    }
    centroid = {
        cell: (lambda pts: (sum(x for x, _ in pts) / len(pts),
                            sum(y for _, y in pts) / len(pts)))(
            [position(k) for k in keys])
        for cell, keys in grown.items()
    }
    mid_x, mid_y = (nx + 2) * width_units / 2, (ny + 2) * height_units / 2
    if template.centre is not None:
        # centre on the copy of the template's declared rotation centre
        # nearest the middle (Laves tilings whose centre is a vertex)
        ccx, ccy = template.centre
        cx, cy = min(
            ((ccx + m * width_units, ccy + n * height_units)
             for m in range(nx + 2) for n in range(ny + 2)),
            key=lambda c: (c[0] - mid_x) ** 2 + (c[1] - mid_y) ** 2,
        )
    else:
        # centre on the biggest tile nearest the middle (its centroid is a
        # rotation centre for the vertex-transitive Archimedean tilings)
        biggest = max(len(keys) for keys in grown.values())
        cx, cy = min(
            (c for cell, c in centroid.items() if len(grown[cell]) == biggest),
            key=lambda c: (c[0] - mid_x) ** 2 + (c[1] - mid_y) ** 2,
        )
    half_w, half_h = nx * width_units / 2, ny * height_units / 2
    cells = {
        cell: keys
        for cell, keys in grown.items()
        if abs(centroid[cell][0] - cx) <= half_w + 1e-9
        and abs(centroid[cell][1] - cy) <= half_h + 1e-9
    }

    return _finalize_flat(tiling, cells, position, mine_count, scale)
