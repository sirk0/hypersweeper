"""What we measure about a board before deciding how many mines it carries.

Three properties, each one a thing the old flat 14/16/19-per-cent convention
could not see:

* **mean degree** -- adjacency here is shared-vertex, so a square cell has 8
  neighbours, a hexagon 6 and a triangle 12, and across the zoo the mean runs
  from 4.4 to 21. A number over 21 cells says far less than a number over 6, so
  two boards at one density are not two boards at one difficulty.
* **indistinguishable cells** -- two cells with the same *closed* neighbourhood
  can never be told apart by any number, so a mine landing in exactly one of
  them forces a coin flip no amount of skill avoids. A board made of such pairs
  cannot be calibrated to any target at all.
* **cell distortion** -- how far the immersion squashes a tile out of shape.
  Wrapping a flat window onto a donut stretches it unless the window's aspect
  matches the surface's, and ``ring``/``rows`` trade off at nearly constant
  cell count, so this is a free axis to spend on making cells read as the
  hexagons and squares they are in the plane.
"""

from __future__ import annotations

import math
from collections import Counter
from typing import Iterable, Sequence


def mean_degree(adjacency: dict) -> float:
    """Average number of neighbours per cell."""
    return sum(len(tuple(v)) for v in adjacency.values()) / len(adjacency)


def indistinguishable_cells(adjacency: dict) -> int:
    """How many cells share a closed neighbourhood with another cell.

    Zero for a board that plays fairly. Anything above it is cells that no
    sequence of revealed numbers can separate: whenever a mine sits in one of
    a matched set and not the others, the player can only guess.
    """
    groups = Counter(frozenset([cell, *ns]) for cell, ns in adjacency.items())
    return sum(count for count in groups.values() if count > 1)


def _polygon_area_3d(points: Sequence[Sequence[float]]) -> float:
    """Area of a planar polygon in 3-space, via the vector cross products."""
    cx = cy = cz = 0.0
    n = len(points)
    for i in range(n):
        ax, ay, az = points[i]
        bx, by, bz = points[(i + 1) % n]
        cx += ay * bz - az * by
        cy += az * bx - ax * bz
        cz += ax * by - ay * bx
    return math.sqrt(cx * cx + cy * cy + cz * cz) / 2


def _perimeter(points: Sequence[Sequence[float]]) -> float:
    n = len(points)
    return sum(
        math.dist(points[i], points[(i + 1) % n]) for i in range(n)
    )


def _regular_quotient(sides: int) -> float:
    """Isoperimetric quotient of a regular polygon -- the best a shape with
    that many sides can do (and 1.0 in the limit, a circle)."""
    if sides < 3:
        return 1.0
    return math.pi / (sides * math.tan(math.pi / sides))


def cell_distortion(polygons: dict) -> list[float]:
    """Per-cell shape distortion, 1.0 for a tile as round as its side count
    allows and rising as the tile is squashed.

    The measure is the isoperimetric quotient ``4*pi*area / perimeter**2``
    against the regular polygon of the same side count. A tile that is already
    a sliver in the plane scores badly even undistorted -- but that penalty is
    the same for every candidate window of a given tiling, so it cancels when
    the search compares them, which is the only comparison made.
    """
    out = []
    for points in polygons.values():
        pts = [tuple(p) for p in points]
        if len(pts[0]) == 2:
            pts = [(x, y, 0.0) for x, y in pts]
        perimeter = _perimeter(pts)
        if perimeter <= 0:
            continue
        quotient = 4 * math.pi * _polygon_area_3d(pts) / (perimeter * perimeter)
        ideal = _regular_quotient(len(pts))
        out.append(ideal / quotient if quotient > 0 else float("inf"))
    return out


def distortion_summary(polygons: dict) -> tuple[float, float]:
    """``(mean, 90th percentile)`` cell distortion.

    Both, deliberately. A mean alone lets a handful of terrible cells hide --
    the Klein bottle's neck and a fat donut's inner equator are intrinsically
    bad -- and a maximum alone lets those unavoidable cells veto every
    candidate window.
    """
    values = sorted(cell_distortion(polygons))
    if not values:
        return (float("inf"), float("inf"))
    mean = sum(values) / len(values)
    p90 = values[min(len(values) - 1, int(0.9 * len(values)))]
    return (mean, p90)


def aspect(board) -> float:
    """How far a flat board is from square, as a ratio >= 1."""
    width = getattr(board, "width", None)
    height = getattr(board, "height", None)
    if not width or not height:
        return 1.0
    return max(width / height, height / width)


def degree_histogram(adjacency: dict) -> dict[int, int]:
    """Neighbour counts, for the report."""
    return dict(sorted(Counter(len(tuple(v)) for v in adjacency.values()).items()))


def summarise(board) -> dict:
    """Everything the calibration wants to know about a board's shape."""
    mean, p90 = distortion_summary(board.polygons)
    return {
        "cells": len(board.adjacency),
        "meanDegree": round(mean_degree(board.adjacency), 3),
        "indistinguishable": indistinguishable_cells(board.adjacency),
        "distortionMean": round(mean, 4),
        "distortionP90": round(p90, 4),
    }


def flatten(values: Iterable[float]) -> list[float]:
    return [float(v) for v in values]
