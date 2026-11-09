"""The hat's family: the hat, the turtle and the hat's four metatiles.

Tile(1, sqrt3), *the hat*, is the first aperiodic monotile (Smith, Myers,
Kaplan and Goodman-Strauss, 2023): it tiles the plane, only aperiodically,
used both ways up -- about one tile in seven is mirrored. Tile(sqrt3, 1), *the
turtle*, is the same outline with its two edge lengths swapped, and tiles the
plane the same way. Every hat tiling is built from four *metatiles* -- H, T,
P and F: a hexagon, a triangle, a parallelogram and a pentagon carrying four,
one, two and two hats -- glued edge to edge into a patch and cut into four
bigger metatiles, over and over. The three boards here are one patch seen
three ways: its hats, the same hats as turtles, and its metatiles.

The substitution is Craig S. Kaplan's (github.com/isohedral/hatviz, hat.js and
geometry.js, (c) 2023 Craig S. Kaplan, BSD 3-Clause licence), ported as it is,
floats and all -- the bigger metatiles' outlines come from intersecting lines.
It is the same port Rep-tiles plays (packages/geometry/src/hat.ts is its
TypeScript twin, line for line). But every hat it lays sits on the kite grid:
drawn at twice hatviz's size, every corner of every hat and every metatile is
a point x + y*omega of the Eisenstein lattice Z[omega], omega = exp(i*pi/3) =
zeta^2 in Z[zeta12], whose points lie a whole unit apart. So each corner is
read back onto the lattice (``_snap``), and the read raises if a corner is not
within 1e-6 of a point: discrete identity, not two nearby points rounded to
one key. The vertex ids are then the Z12Point tuples (x, 0, y, 0) the Spectre
board uses, so the window code in aperiodic.py cuts these patches unchanged.

The hat's short edges (length 1) point at multiples of 60 degrees, its long
ones (sqrt3) at 30 degrees past them, and every hat in the tiling is turned by
a multiple of 60 degrees and perhaps mirrored, which keeps that split. So the
turtle tiling is the hat tiling with each edge's length changed
(``_deform_hats``): walk the hats' edges from one corner and lay each corner
again with every short edge sqrt3 long and every long one a unit -- exact, in
Z[zeta12], and the walk checks that each tile closes and that a corner two
tiles share lands in one place.

The hat (and so the turtle) is a 13-gon one of whose sides is two short edges
in a line; its 14th corner, the middle of that side, is kept, as the Spectre
keeps its flat one, because a neighbour plants a corner there -- the tiling is
edge to edge with it. The metatiles are not edge to edge: a T's side runs
along part of an H's, so each metatile's sides are cut at every corner of the
patch lying inside them (``_metatile_cells``), exactly, before the window is
taken.
"""

# The port of hatviz below -- its float geometry, ``_initial_metatiles`` to
# ``_construct_metatiles`` -- keeps its licence:
#
# BSD 3-Clause License
#
# Copyright (c) 2023, Craig S. Kaplan
#
# Redistribution and use in source and binary forms, with or without
# modification, are permitted provided that the following conditions are met:
#
# 1. Redistributions of source code must retain the above copyright notice, this
#    list of conditions and the following disclaimer.
#
# 2. Redistributions in binary form must reproduce the above copyright notice,
#    this list of conditions and the following disclaimer in the documentation
#    and/or other materials provided with the distribution.
#
# 3. Neither the name of the copyright holder nor the names of its
#    contributors may be used to endorse or promote products derived from
#    this software without specific prior written permission.
#
# THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS"
# AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE
# IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE
# DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT HOLDER OR CONTRIBUTORS BE LIABLE
# FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL
# DAMAGES (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR
# SERVICES; LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER
# CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY,
# OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE
# OF THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.

from __future__ import annotations

import math
from collections import defaultdict, deque
from dataclasses import replace
from functools import lru_cache
from typing import NamedTuple

from minesweeper.boards.aperiodic import (
    _Z12_POWERS,
    Z12Point,
    _patch,
    _window,
    _z12_add,
    _z12_rot,
    _z12_to_xy,
)
from minesweeper.boards.core import Board, Cell, _finalize_flat

# -- hatviz's float geometry -------------------------------------------------

Pt = tuple[float, float]
Aff = tuple[float, float, float, float, float, float]

_HR3 = math.sqrt(3) / 2
_IDENT: Aff = (1.0, 0.0, 0.0, 0.0, 1.0, 0.0)


def _hex_pt(x: float, y: float) -> Pt:
    return (x + 0.5 * y, _HR3 * y)


def _inv(t: Aff) -> Aff:
    det = t[0] * t[4] - t[1] * t[3]
    return (
        t[4] / det,
        -t[1] / det,
        (t[1] * t[5] - t[2] * t[4]) / det,
        -t[3] / det,
        t[0] / det,
        (t[2] * t[3] - t[0] * t[5]) / det,
    )


def _mul(a: Aff, b: Aff) -> Aff:
    return (
        a[0] * b[0] + a[1] * b[3],
        a[0] * b[1] + a[1] * b[4],
        a[0] * b[2] + a[1] * b[5] + a[2],
        a[3] * b[0] + a[4] * b[3],
        a[3] * b[1] + a[4] * b[4],
        a[3] * b[2] + a[4] * b[5] + a[5],
    )


def _padd(p: Pt, q: Pt) -> Pt:
    return (p[0] + q[0], p[1] + q[1])


def _psub(p: Pt, q: Pt) -> Pt:
    return (p[0] - q[0], p[1] - q[1])


def _trot(ang: float) -> Aff:
    c, s = math.cos(ang), math.sin(ang)
    return (c, -s, 0.0, s, c, 0.0)


def _ttrans(tx: float, ty: float) -> Aff:
    return (1.0, 0.0, tx, 0.0, 1.0, ty)


def _rot_about(p: Pt, ang: float) -> Aff:
    return _mul(_ttrans(p[0], p[1]), _mul(_trot(ang), _ttrans(-p[0], -p[1])))


def _trans_pt(m: Aff, p: Pt) -> Pt:
    return (m[0] * p[0] + m[1] * p[1] + m[2], m[3] * p[0] + m[4] * p[1] + m[5])


def _match_seg(p: Pt, q: Pt) -> Aff:
    """The similarity taking the unit interval onto p->q."""
    return (q[0] - p[0], p[1] - q[1], p[0], q[1] - p[1], q[0] - p[0], p[1])


def _match_two(p1: Pt, q1: Pt, p2: Pt, q2: Pt) -> Aff:
    """The similarity taking p1->q1 onto p2->q2."""
    return _mul(_match_seg(p2, q2), _inv(_match_seg(p1, q1)))


def _intersect(p1: Pt, q1: Pt, p2: Pt, q2: Pt) -> Pt:
    d = (q2[1] - p2[1]) * (q1[0] - p1[0]) - (q2[0] - p2[0]) * (q1[1] - p1[1])
    ua = ((q2[0] - p2[0]) * (p1[1] - p2[1]) - (q2[1] - p2[1]) * (p1[0] - p2[0])) / d
    return (p1[0] + ua * (q1[0] - p1[0]), p1[1] + ua * (q1[1] - p1[1]))


#: The hat, in hatviz's frame: its thirteen corners as hex coordinates. The
#: long side from (0,-2) to (2,-2) is two short edges in a line.
_HAT_HEX: tuple[tuple[int, int], ...] = (
    (0, 0), (-1, -1), (0, -2), (2, -2), (2, -1), (4, -2), (5, -1),
    (4, 0), (3, 0), (2, 2), (0, 3), (0, 2), (-1, 2),
)  # fmt: skip
_HAT_OUTLINE: list[Pt] = [_hex_pt(x, y) for x, y in _HAT_HEX]

#: The hat with its long side's midpoint: fourteen corners.
_HAT14: tuple[tuple[int, int], ...] = _HAT_HEX[:3] + ((1, -2),) + _HAT_HEX[3:]


class _HatChild(NamedTuple):
    mirrored: bool


_HAT = _HatChild(False)
_HAT_MIRRORED = _HatChild(True)


class _MetaTile:
    def __init__(self, shape: list[Pt], kind: str | None = None):
        self.shape = shape
        self.kind = kind  # set on the four first-generation metatiles
        self.children: list[list] = []  # [transform, MetaTile | _HatChild]

    def add(self, t: Aff, geom) -> None:
        self.children.append([t, geom])

    def eval_child(self, n: int, i: int) -> Pt:
        t, geom = self.children[n]
        return _trans_pt(t, geom.shape[i])

    def recentre(self) -> None:
        cx = sum(p[0] for p in self.shape) / len(self.shape)
        cy = sum(p[1] for p in self.shape) / len(self.shape)
        self.shape = [(p[0] - cx, p[1] - cy) for p in self.shape]
        m = _ttrans(-cx, -cy)
        for child in self.children:
            child[0] = _mul(m, child[0])


def _initial_metatiles() -> tuple[_MetaTile, _MetaTile, _MetaTile, _MetaTile]:
    hr3 = _HR3
    h_outline = [
        (0.0, 0.0), (4.0, 0.0), (4.5, hr3), (2.5, 5 * hr3), (1.5, 5 * hr3), (-0.5, hr3),
    ]  # fmt: skip
    h = _MetaTile(h_outline, "H")
    hat = _HAT_OUTLINE
    h.add(_match_two(hat[5], hat[7], h_outline[5], h_outline[0]), _HAT)
    h.add(_match_two(hat[9], hat[11], h_outline[1], h_outline[2]), _HAT)
    h.add(_match_two(hat[5], hat[7], h_outline[3], h_outline[4]), _HAT)
    h.add(
        _mul(_ttrans(2.5, hr3), _mul((-0.5, -hr3, 0.0, hr3, -0.5, 0.0), (0.5, 0.0, 0.0, 0.0, -0.5, 0.0))),
        _HAT_MIRRORED,
    )

    t = _MetaTile([(0.0, 0.0), (3.0, 0.0), (1.5, 3 * hr3)], "T")
    t.add((0.5, 0.0, 0.5, 0.0, 0.5, hr3), _HAT)

    second = _mul(_ttrans(0.0, 2 * hr3), _mul((0.5, hr3, 0.0, -hr3, 0.5, 0.0), (0.5, 0.0, 0.0, 0.0, 0.5, 0.0)))
    p = _MetaTile([(0.0, 0.0), (4.0, 0.0), (3.0, 2 * hr3), (-1.0, 2 * hr3)], "P")
    p.add((0.5, 0.0, 1.5, 0.0, 0.5, hr3), _HAT)
    p.add(second, _HAT)

    f = _MetaTile([(0.0, 0.0), (3.0, 0.0), (3.5, hr3), (3.0, 2 * hr3), (-1.0, 2 * hr3)], "F")
    f.add((0.5, 0.0, 1.5, 0.0, 0.5, hr3), _HAT)
    f.add(second, _HAT)
    return h, t, p, f


#: hatviz's gluing rules: each new metatile is laid against an edge of one
#: already placed (or, for six-entry rules, between two).
_RULES: tuple[tuple, ...] = (
    ("H",),
    (0, 0, "P", 2), (1, 0, "H", 2), (2, 0, "P", 2), (3, 0, "H", 2),
    (4, 4, "P", 2), (0, 4, "F", 3), (2, 4, "F", 3), (4, 1, 3, 2, "F", 0),
    (8, 3, "H", 0), (9, 2, "P", 0), (10, 2, "H", 0), (11, 4, "P", 2),
    (12, 0, "H", 2), (13, 0, "F", 3), (14, 2, "F", 1), (15, 3, "H", 4),
    (8, 2, "F", 1), (17, 3, "H", 0), (18, 2, "P", 0), (19, 2, "H", 2),
    (20, 4, "F", 3), (20, 0, "P", 2), (22, 0, "H", 2), (23, 4, "F", 3),
    (23, 0, "F", 3), (16, 0, "P", 2), (9, 4, 0, 2, "T", 2), (4, 0, "F", 3),
)  # fmt: skip


def _construct_patch(tiles: dict[str, _MetaTile]) -> _MetaTile:
    ret = _MetaTile([])
    for r in _RULES:
        if len(r) == 1:
            ret.add(_IDENT, tiles[r[0]])
            continue
        if len(r) == 4:
            t, geom = ret.children[r[0]]
            poly = geom.shape
            i = r[1]
            p = _trans_pt(t, poly[(i + 1) % len(poly)])
            q = _trans_pt(t, poly[i])
            kind, edge = r[2], r[3]
        else:
            t_p, geom_p = ret.children[r[0]]
            t_q, geom_q = ret.children[r[2]]
            p = _trans_pt(t_q, geom_q.shape[r[3]])
            q = _trans_pt(t_p, geom_p.shape[r[1]])
            kind, edge = r[4], r[5]
        npoly = tiles[kind].shape
        ret.add(_match_two(npoly[edge], npoly[(edge + 1) % len(npoly)], p, q), tiles[kind])
    return ret


def _construct_metatiles(patch: _MetaTile) -> dict[str, _MetaTile]:
    bps1 = patch.eval_child(8, 2)
    bps2 = patch.eval_child(21, 2)
    rbps = _trans_pt(_rot_about(bps1, -2 * math.pi / 3), bps2)
    p72 = patch.eval_child(7, 2)
    p252 = patch.eval_child(25, 2)
    llc = _intersect(bps1, rbps, patch.eval_child(6, 2), p72)
    w = _psub(patch.eval_child(6, 2), llc)

    h_outline = [llc, bps1]
    w = _trans_pt(_trot(-math.pi / 3), w)
    h_outline.append(_padd(h_outline[1], w))
    h_outline.append(patch.eval_child(14, 2))
    w = _trans_pt(_trot(-math.pi / 3), w)
    h_outline.append(_psub(h_outline[3], w))
    h_outline.append(patch.eval_child(6, 2))

    def take(shape: list[Pt], indices: list[int]) -> _MetaTile:
        meta = _MetaTile(shape)
        for i in indices:
            meta.add(*patch.children[i])
        return meta

    h = take(h_outline, [0, 9, 16, 27, 26, 6, 1, 8, 10, 15])
    p = take([p72, _padd(p72, _psub(bps1, llc)), bps1, llc], [7, 2, 3, 4, 28])
    f = take(
        [bps2, patch.eval_child(24, 2), patch.eval_child(25, 0), p252,
         _padd(p252, _psub(llc, bps1))],
        [21, 20, 22, 23, 24, 25],
    )
    aaa = h_outline[2]
    bbb = _padd(h_outline[1], _psub(h_outline[4], h_outline[5]))
    ccc = _trans_pt(_rot_about(bbb, -math.pi / 3), aaa)
    t = take([bbb, ccc, aaa], [11])
    for m in (h, p, f, t):
        m.recentre()
    return {"H": h, "T": t, "P": p, "F": f}


def _super_h(depth: int) -> _MetaTile:
    """The H metatile after ``depth`` substitutions -- the first generation's
    four, glued and cut ``depth`` times."""
    h, t, p, f = _initial_metatiles()
    tiles = {"H": h, "T": t, "P": p, "F": f}
    for _ in range(depth):
        tiles = _construct_metatiles(_construct_patch(tiles))
    return tiles["H"]


def _first_generation(meta: _MetaTile, at: Aff, out: list) -> None:
    """Every first-generation metatile in ``meta``, placed, in order."""
    if meta.kind:
        out.append((meta.kind, meta, at))
        return
    for t, geom in meta.children:
        _first_generation(geom, _mul(at, t), out)


# -- exact -------------------------------------------------------------------

Hex = tuple[int, int]


class HatMeta(NamedTuple):
    """One first-generation metatile of a hat patch: its kind, its corners,
    and its hats' -- each hat's fourteen in ``_HAT14`` order, the middle of
    its long side kept, counterclockwise or clockwise as the hat is mirrored
    or not -- as hex coordinates (x + y*omega)."""

    kind: str
    corners: tuple[Hex, ...]
    hats: tuple[tuple[tuple[Hex, ...], bool], ...]


@lru_cache(maxsize=8)
def _hat_metatiles(depth: int) -> tuple[HatMeta, ...]:
    """The first-generation metatiles of the H metatile ``depth``
    substitutions on, read onto the lattice at twice hatviz's size, the first
    hat's first corner at the origin."""
    placed: list = []
    _first_generation(_super_h(depth), _IDENT, placed)
    _, first_meta, first_t = placed[0]
    origin = _trans_pt(_mul(first_t, first_meta.children[0][0]), _HAT_OUTLINE[0])

    def snap(p: Pt) -> Hex:
        big_x = 2 * (p[0] - origin[0])
        big_y = 2 * (p[1] - origin[1])
        y = big_y / _HR3  # Y = y*sqrt3/2
        x = big_x - 0.5 * y
        rx, ry = round(x), round(y)
        if abs(x - rx) > 1e-6 or abs(y - ry) > 1e-6:
            raise ValueError(f"hat corner ({big_x}, {big_y}) is off the kite grid")
        return (rx, ry)

    metas = []
    for kind, meta, t in placed:
        hats = []
        for ct, geom in meta.children:
            m = _mul(t, ct)
            hats.append((tuple(snap(_trans_pt(m, _hex_pt(x, y))) for x, y in _HAT14), geom.mirrored))
        metas.append(HatMeta(kind, tuple(snap(_trans_pt(t, p)) for p in meta.shape), tuple(hats)))
    return tuple(metas)


def _hex_z12(p: Hex) -> Z12Point:
    """x + y*omega in Z[zeta12], omega = zeta^2."""
    return (p[0], 0, p[1], 0)


def _hex_cross(a: Hex, b: Hex) -> int:
    """The cross product of two hex vectors, over sqrt3/2: its sign is the
    Euclidean one, the frame (1, omega) being right-handed."""
    return a[0] * b[1] - a[1] * b[0]


def _hex_area2(corners) -> int:
    """Twice a polygon's signed area, over sqrt3/2: positive counterclockwise."""
    return sum(_hex_cross(a, b) for a, b in zip(corners, corners[1:] + corners[:1]))


def _hex_norm(d: Hex) -> int:
    """|x + y*omega|^2."""
    return d[0] * d[0] + d[0] * d[1] + d[1] * d[1]


def _ccw(ids: list) -> list:
    """A clockwise outline walked the other way, from the same first corner."""
    return [ids[0]] + ids[:0:-1]


def _z12_mul(p: Z12Point, q: Z12Point) -> Z12Point:
    """The product of two points of Z[zeta12]."""
    out = (0, 0, 0, 0)
    for k, c in enumerate(q):
        if c:
            r = _z12_rot(p, k)
            out = _z12_add(out, (c * r[0], c * r[1], c * r[2], c * r[3]))
    return out


#: sqrt3 = zeta + zeta^-1 = 2*zeta - zeta^3.
_SQRT3: Z12Point = _z12_add(_Z12_POWERS[1], _Z12_POWERS[11])
_ONE: Z12Point = _Z12_POWERS[0]


def _deform_hats(
    hats: list[tuple[Hex, ...]], a: Z12Point, b: Z12Point
) -> list[list[Z12Point]]:
    """The hats as Tile(a, b): each corner laid again with every short edge (a
    unit, at a multiple of 60 degrees) ``a`` long and every long one (sqrt3,
    at 30 degrees past) ``b`` long, ``a`` and ``b`` reals of Z[zeta12].

    Walked breadth first from the first hat's first corner, laid at the
    origin; a tile whose corner the walk has laid already must land on it, and
    must close, or the hats were no tiling. Which order the walk takes does
    not change where any corner lands, so this and the TypeScript port agree
    however their queues run.
    """

    def edge(d: Hex) -> Z12Point:
        norm = _hex_norm(d)
        if norm == 1:
            return _z12_mul(a, _hex_z12(d))
        if norm == 3:
            # d = sqrt3*u, u a unit at an odd multiple of 30 degrees: u = d*sqrt3/3
            u3 = _z12_mul(_SQRT3, _hex_z12(d))
            if any(c % 3 for c in u3):
                raise ValueError(f"long edge {d} is not sqrt3 long")
            return _z12_mul(b, tuple(c // 3 for c in u3))
        raise ValueError(f"edge {d} is no edge of the hat")

    on: dict[Hex, list[int]] = defaultdict(list)
    for i, hat in enumerate(hats):
        for v in hat:
            on[v].append(i)
    at: dict[Hex, Z12Point] = {hats[0][0]: (0, 0, 0, 0)}
    out: list[list[Z12Point] | None] = [None] * len(hats)
    queue = deque([0])
    queued = {0}
    while queue:
        i = queue.popleft()
        hat = hats[i]
        start = next(j for j, v in enumerate(hat) if v in at)
        laid: list = [None] * len(hat)
        p = at[hat[start]]
        for k in range(len(hat)):
            j = (start + k) % len(hat)
            v = hat[j]
            known = at.get(v)
            if known is not None and known != p:
                raise ValueError("the hats do not deform: a corner moved")
            at[v] = p
            laid[j] = p
            nxt = hat[(j + 1) % len(hat)]
            p = _z12_add(p, edge((nxt[0] - v[0], nxt[1] - v[1])))
        if p != laid[start]:
            raise ValueError("a deformed hat does not close")
        out[i] = laid
        for v in hat:
            for other in on[v]:
                if other not in queued:
                    queued.add(other)
                    queue.append(other)
    if any(cell is None for cell in out):
        raise ValueError("the hats are not joined corner to corner")
    return out  # type: ignore[return-value]


def _split_edges(corners: tuple[Hex, ...], points: set[Hex]) -> list[Hex]:
    """A polygon's outline with every one of ``points`` that lies strictly
    inside a side inserted on it, in order. Exact: the lattice points on a
    side are its ends' difference over the gcd of its coordinates, stepped."""
    out: list[Hex] = []
    for a, b in zip(corners, corners[1:] + corners[:1]):
        out.append(a)
        dx, dy = b[0] - a[0], b[1] - a[1]
        g = math.gcd(dx, dy)
        sx, sy = dx // g, dy // g
        for k in range(1, g):
            p = (a[0] + k * sx, a[1] + k * sy)
            if p in points:
                out.append(p)
    return out


def _metatile_cells(metas: tuple[HatMeta, ...]) -> list[list[Hex]]:
    """Each metatile's outline, its sides cut at every corner of the patch
    lying inside them: the metatiles meet corner to side (a T's side runs along
    part of an H's), and the window code and the shared-vertex adjacency both
    need the patch edge to edge."""
    points = {c for m in metas for c in m.corners}
    return [_split_edges(m.corners, points) for m in metas]


# -- the glyph anchors -------------------------------------------------------
#
# The hat and the turtle are not convex, and a number centred on a tile's
# vertex mean sits close to an edge: on the hat right above its notch, with
# room for a circle 0.63 the size of the biggest the tile holds. So each
# tile's number goes at the centre of its biggest inscribed circle instead,
# as the kite and dart's do. That centre is a fixed point of the tile, so it
# is written as an affine combination of three of its corners, which holds
# for every copy -- turned, moved or mirrored -- and is found once for each
# tile, on the reference outline, by the circle's three tangent edges.


#: (a, b, c, s, t): a tile's number goes at P[a] + s*(P[b] - P[a]) +
#: t*(P[c] - P[a]), P its corners in ``_HAT14`` order.
#:
#: * The hat's biggest circle (radius 1.3765, a short edge being 1) passes
#:   through its two reflex corners, 5 and 12, and touches its long edge from
#:   9 to 10. Its centre is on the perpendicular bisector of the two corners,
#:   where the distance to that edge's line equals the distance to either --
#:   a quadratic; s and t are its root, to double precision.
#: * The turtle's (radius 3/(1 + sqrt3/2) = 1.6077) touches both sides at
#:   its 120-degree corner 4 and passes through its reflex corner 12, which
#:   lies on that corner's bisector: the centre is 2*sqrt3 - 3 of the way from
#:   12 to 4.
_GLYPH_WEIGHTS: dict[str, tuple[int, int, int, float, float]] = {
    "hat": (12, 5, 9, 0.3173884626316028, 0.2324146839234146),
    "turtle": (12, 4, 9, 2 * math.sqrt(3) - 3, 0.0),
}


def _glyph_anchor(tile: str, label: str, polygon: list[Pt]) -> Pt:
    """Where a hat's or a turtle's number goes (``_GLYPH_WEIGHTS``). A
    mirrored tile's outline was reversed to run counterclockwise, which puts
    its corner j of ``_HAT14`` at index -j."""
    a, b, c, s, t = _GLYPH_WEIGHTS[tile]
    n = len(polygon)
    if label == "flip":
        a, b, c = (-a) % n, (-b) % n, (-c) % n
    pa, pb, pc = polygon[a], polygon[b], polygon[c]
    return (
        pa[0] + s * (pb[0] - pa[0]) + t * (pc[0] - pa[0]),
        pa[1] + s * (pb[1] - pa[1]) + t * (pc[1] - pa[1]),
    )


# -- the boards --------------------------------------------------------------

#: The three boards' modes, by the tile each is made of.
_HAT_MODES = {"hat": "hat", "turtle": "turtle", "metatiles": "hatmetatiles"}


@lru_cache(maxsize=16)
def _hat_family_patch(tile: str, depth: int):
    """The whole patch of ``tile``s -- "hat", "turtle" or "metatiles" -- the H
    metatile ``depth`` substitutions on grows, ready to window: each tile
    labelled ("hat" or "flip", mirrored; or its metatile's kind), its corners
    counterclockwise as Z12Point ids. The tie-break at the cut rank is the
    tile's own sorted ids, as for the Spectre."""
    metas = _hat_metatiles(depth)
    if tile == "metatiles":
        labels = [m.kind for m in metas]
        cells = []
        for corners in _metatile_cells(metas):
            if _hex_area2(corners) < 0:
                corners = _ccw(corners)
            cells.append([_hex_z12(v) for v in corners])
    else:
        hats = [h for m in metas for h in m.hats]
        labels = ["flip" if mirrored else "hat" for _, mirrored in hats]
        if tile == "hat":
            cells = [[_hex_z12(v) for v in corners] for corners, _ in hats]
        else:
            cells = _deform_hats([corners for corners, _ in hats], _SQRT3, _ONE)
        # a mirrored hat runs clockwise, and so does its turtle
        cells = [
            cell if _hex_area2(list(corners)) > 0 else _ccw(cell)
            for cell, (corners, _) in zip(cells, hats)
        ]
    return _patch(labels, cells, _z12_to_xy, [tuple(sorted(ids)) for ids in cells])


def _hat_family_board(
    tile: str,
    depth: int,
    mine_count: int,
    keep: int | None,
    scale: float,
    variant: int,
) -> Board:
    patch = _hat_family_patch(tile, depth)
    kept = _window(patch.cells, patch.centroids, patch.tiebreaks, keep, variant)
    cells: dict[Cell, list] = {
        (patch.keys[row], i): list(patch.cells[row]) for i, row in enumerate(kept)
    }
    board = _finalize_flat(_HAT_MODES[tile], cells, _z12_to_xy, mine_count, scale)
    if tile == "metatiles":
        return board
    return replace(board, glyph_anchors={
        cell: _glyph_anchor(tile, cell[0], polygon)
        for cell, polygon in board.polygons.items()
    })


def hat_board(
    depth: int,
    mine_count: int,
    keep: int | None = None,
    scale: float = 21,
    variant: int = 0,
) -> Board:
    """The hat, Tile(1, sqrt3), the first aperiodic monotile: the hats of the
    H metatile ``depth`` substitutions on (169, 1156, 7921 at depths 2 to 4),
    about one in seven mirrored and labelled "flip". ``keep``, ``scale`` and
    ``variant`` are the Spectre's: ``keep`` tiles nearest a centre by
    Chebyshev distance, ``variant`` 0 the centred window and any other integer
    one elsewhere in the same patch. See ``_window``."""
    return _hat_family_board("hat", depth, mine_count, keep, scale, variant)


def turtle_board(
    depth: int,
    mine_count: int,
    keep: int | None = None,
    scale: float = 21,
    variant: int = 0,
) -> Board:
    """The turtle, Tile(sqrt3, 1): the hat's outline with its two edge
    lengths swapped, laid as the hats of ``hat_board`` are (``_deform_hats``),
    tile for tile."""
    return _hat_family_board("turtle", depth, mine_count, keep, scale, variant)


def hat_metatiles_board(
    depth: int,
    mine_count: int,
    keep: int | None = None,
    scale: float = 21,
    variant: int = 0,
) -> Board:
    """The hat's metatiles -- H, T, P and F, a hexagon, a triangle, a
    parallelogram and a pentagon, labelled by kind -- that the hats of
    ``hat_board`` are grouped into: 64, 442, 3025 at depths 2 to 4. They meet
    corner to side, so each carries the corners of its neighbours that land
    on its sides."""
    return _hat_family_board("metatiles", depth, mine_count, keep, scale, variant)
