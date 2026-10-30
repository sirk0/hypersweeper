"""Which wrapped boards draw their cells too far out of shape to play well.

A tiling laid on a curved surface has to bend and stretch. On the cylinder it
barely does (the surface is developable), but on the Klein bottle's neck, the
trefoil knot's crossings or the coarse easy window of a donut a tenth of the
cells can come out twice the shape they have in the plane, and on a few boards
a cell even folds back over itself. Those boards are still worth looking at,
so they stay in the menu -- but marked, and never dealt by the random buttons.

Two yardsticks, because a cell can look wrong two ways. Against the tiling's
**own** planar shape (``resize.planar_shape``) -- what the wrap did to it, so a
tiling whose tile is meant to be long is not marked for being long:

* **shape** -- the 90th-percentile ``metrics.cell_distortion``, as a fraction
  over the flat tiling's. One cell in ten is at least this much worse.
* **stretch** -- the median longest-to-shortest edge (``resize.edge_ratio``),
  over the flat tiling's.
* **folded** -- cells whose centre fan (how both renderers draw a cell) turns
  more than a right angle away from the cell's own plane: the tile is drawn
  folded over itself rather than merely bent.

And against the **regular polygon** with as many corners -- what the player
sees, whatever the cause:

* **regular** -- the 90th-percentile ``metrics.cell_distortion`` of the cell's
  real corners (the T-vertices ``resize.corner_indices`` names are dropped, or
  an offset square scores as a squashed pentagon), 1.0 for a regular polygon.
  This is what the first yardstick cannot see: a tile already far from regular
  in the plane needs much less of a wrap to stop reading as a tile. The
  kisrhombille's 30-60-90 triangle starts at 1.24, so a torus that adds a
  quarter to it -- harmless to a square -- leaves one cell in ten as far from
  round as a sliver.

``bend`` -- how far a cell's corners stand off its best plane, over its mean
edge -- is recorded for the review but marks nothing: on the torus and the
cylinder the big dodecagons bend a third of an edge and still read as the
tiles they are.

A level is marked when shape >= ``SHAPE_P90``, regular >= ``REGULAR_P90``,
stretch >= ``STRETCH``, or any cell folds. A board marked at ``BOARD_SHARE`` of its three levels is marked at
all three: the one level that scraped under the bar is the same surface doing
the same thing, and a board that is fine only at medium reads as a mistake.

Only the wrapped surfaces are measured. A solid's faces are flat by
construction, and its tiles are not cut from a planar tiling to compare with.

Run: ``PYTHONPATH=. python -m scripts.difficulty.distortion`` -- it writes
``data/distortion.json``, which the TypeScript app reads
(``web/src/modes/distortion.ts``). Like ``data/difficulty.json`` it is
measured rather than exported, so ``data-sync`` does not regenerate it; re-run
it after changing a preset window or adding a wrapped tiling.
"""

from __future__ import annotations

import json
import math
from pathlib import Path

from minesweeper.boards import build_board
from minesweeper.boards.catalog import SURFACE_SPECS, TILING_SPECS
from minesweeper.boards.tilings import ARCH_TILINGS
from scripts.difficulty.metrics import cell_distortion
from scripts.difficulty.resize import (
    _Polygons,
    corner_indices,
    edge_ratio,
    planar_shape,
)

ROOT = Path(__file__).resolve().parent.parent.parent
DIFFICULTIES = ("easy", "medium", "hard")

# One cell in ten 60% further from round than it is in the plane. Measured over
# every wrapped level, this is where the Klein bottle's Laves duals, the
# trefoil's easy boards and the Möbius strip's bonds sit, and nothing on the
# torus but its coarsest easy windows.
SHAPE_P90 = 0.60
# One cell in ten half again as far from round as a regular polygon of its
# corners. Lower than SHAPE_P90 on purpose: on a regular tiling the two measure
# the same thing, and 50% is where the Klein bottle's hexagons and its Cairo
# pentagons -- both read as squashed in play -- sit; on an irregular one it is
# reached by far less wrapping (the torus kisrhombille's medium window, 27% over
# its flat tile, is 58% over a regular triangle).
REGULAR_P90 = 1.50
# Edges three times as unequal as the flat tiling's: the trefoil's easy squares
# (6.2x) and the double torus's (3.3x), whose shape score alone undersells them.
STRETCH = 3.0
# A fan triangle this far from the cell's plane faces away from the rest of it.
FOLD_DEGREES = 90.0
# Marked at this many of the three levels -> marked at all three.
BOARD_SHARE = 2


def _sub(a, b):
    return (a[0] - b[0], a[1] - b[1], a[2] - b[2])


def _dot(a, b):
    return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]


def _unit(a):
    n = math.sqrt(_dot(a, a))
    return None if n < 1e-15 else (a[0] / n, a[1] / n, a[2] / n)


def bend_and_fold(points) -> tuple[float, float]:
    """``(bend, fold)`` of one cell: how far its corners stand off the cell's
    plane (Newell normal through the centroid) over its mean edge, and the
    largest angle in degrees between a centroid-fan triangle and that plane."""
    pts = [tuple(float(c) for c in p) for p in points]
    n = len(pts)
    centre = tuple(sum(p[k] for p in pts) / n for k in range(3))
    nx = ny = nz = 0.0
    for i in range(n):
        a, b = pts[i], pts[(i + 1) % n]
        nx += (a[1] - b[1]) * (a[2] + b[2])
        ny += (a[2] - b[2]) * (a[0] + b[0])
        nz += (a[0] - b[0]) * (a[1] + b[1])
    normal = _unit((nx, ny, nz))
    if normal is None:
        return 0.0, 0.0
    edge = sum(math.dist(pts[i], pts[(i + 1) % n]) for i in range(n)) / n
    bend = max(abs(_dot(_sub(p, centre), normal)) for p in pts) / edge
    fold = 0.0
    for i in range(n):
        u, v = _sub(pts[i], centre), _sub(pts[(i + 1) % n], centre)
        tri = _unit((u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2],
                     u[0] * v[1] - u[1] * v[0]))
        if tri is not None:
            fold = max(fold, math.degrees(math.acos(max(-1.0, min(1.0, _dot(tri, normal))))))
    return bend, fold


def _p90(values: list[float]) -> float:
    values = sorted(values)
    return values[min(len(values) - 1, int(0.9 * len(values)))]


def _real_corners(polygons: dict, corners: dict | None) -> dict:
    """Each cell with its T-vertices dropped, by template cell name."""
    if corners is None:
        return polygons
    out = {}
    for cell, points in polygons.items():
        keep = corners.get(cell[-1]) if isinstance(cell, tuple) else None
        out[cell] = [points[i] for i in keep] if keep is not None else points
    return out


def measure(mode: str, tiling: str, difficulty: str) -> dict:
    """The four measures (and the bend) of one board at one difficulty."""
    arch = {t.key for t in ARCH_TILINGS}
    if tiling in arch:
        _, planar_p90, planar_edge = planar_shape(tiling)
        corners = corner_indices(tiling)
    else:
        planar_p90 = planar_edge = 1.0
        corners = None
    polygons = build_board(mode, difficulty).polygons
    p90 = _p90(cell_distortion(polygons))
    regular = _p90(cell_distortion(_real_corners(polygons, corners)))
    cells = [bend_and_fold(p) for p in polygons.values()]
    return {
        "shapeP90": round(p90 / planar_p90 - 1, 3),
        "regularP90": round(regular, 3),
        "stretch": round(edge_ratio(_Polygons(polygons), corners) / planar_edge, 2),
        "bend": round(max(b for b, _ in cells), 3),
        "folded": sum(f > FOLD_DEGREES for _, f in cells),
    }


def crosses(row: dict) -> bool:
    return (row["shapeP90"] >= SHAPE_P90 or row["regularP90"] >= REGULAR_P90
            or row["stretch"] >= STRETCH or row["folded"] > 0)


def wrapped_modes() -> list[tuple[str, str]]:
    """Every ``(mode, tiling)`` on a curved surface, in catalogue order."""
    return [(t.mode(s), t.key) for s in SURFACE_SPECS if s.is_3d
            for t in TILING_SPECS if t.allows(s)]


def main() -> int:
    marked: dict[str, dict[str, dict]] = {}
    for mode, tiling in wrapped_modes():
        rows = {d: measure(mode, tiling, d) for d in DIFFICULTIES}
        hits = [d for d in DIFFICULTIES if crosses(rows[d])]
        if len(hits) >= BOARD_SHARE:
            hits = list(DIFFICULTIES)
        if hits:
            marked[mode] = {d: rows[d] | {"crosses": crosses(rows[d])} for d in hits}
    payload = {
        "_comment": "Generated by scripts/difficulty/distortion.py. Wrapped "
        "boards whose cells the surface draws too far out of shape, per "
        "difficulty: shapeP90 is the 90th-percentile cell distortion over the "
        "flat tiling's (as a fraction), regularP90 the same distortion of the "
        "real corners against a regular polygon (1.0 is regular), stretch the "
        "median edge ratio over the "
        "flat tiling's, bend the worst cell's corners off its plane over its "
        "edge, folded the cells drawn folded over themselves. A level is listed "
        f"when shapeP90 >= {SHAPE_P90}, regularP90 >= {REGULAR_P90}, stretch >= "
        f"{STRETCH} or any cell folds "
        "(crosses: true); a board listed at two of its three levels is listed "
        "at all three (crosses: false on the one that did not). The web menu "
        "marks these rows and the random buttons never deal them.",
        "distorted": marked,
    }
    out = ROOT / "data" / "distortion.json"
    out.write_text(json.dumps(payload, indent=2, ensure_ascii=False) + "\n")
    levels = sum(len(v) for v in marked.values())
    whole = sum(len(v) == len(DIFFICULTIES) for v in marked.values())
    print(f"wrote {out} ({len(marked)} boards, {levels} levels; "
          f"{whole} boards at every difficulty)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
