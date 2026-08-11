"""Pick each board's geometry: about as many cells as the classic board, and
cells as close to their planar shape as the surface allows.

Two things are chosen here, and neither is the mine count (that is
``calibrate.py``, and it runs *after* this, because reshaping a window nudges
the cell count and so moves the mine count that lands on target).

**Size.** Classic Minesweeper is 81, 256 and 480 cells. Every board with a size
knob is moved inside +-15% of those. Some have no knob -- a sphere is 60 cells
because that is what the solid is -- and the fractals quantise by whole
substitution steps (the Sierpinski carpet goes 64, 512, 4096), so those keep
their geometry and are listed as exceptions.

**Shape.** On a wrapped surface ``ring`` and ``rows`` trade off at nearly
constant cell count, and that free axis is worth spending: a window whose
aspect does not match the surface's stretches every tile, which is why cells on
some donuts read as squashed ovals rather than the hexagons they are in the
plane. Among the windows that hit the count, the search takes the one whose
cells are least distorted, and tunes the tube radius jointly since that is the
other half of what sets the surface's own proportions.

Run: ``PYTHONPATH=. python -m scripts.difficulty.resize``
"""

from __future__ import annotations

import json
import math
from pathlib import Path

from minesweeper.boards import presets as P
from minesweeper.boards.catalog import surface_of
from minesweeper.boards.core import boundary_components, euler_characteristic
from scripts.difficulty.metrics import (
    aspect,
    distortion_summary,
    indistinguishable_cells,
)

ROOT = Path(__file__).resolve().parent.parent.parent
TARGETS = {"easy": 81, "medium": 256, "hard": 480}
BAND = 0.15
# the wider bar `tests/test_presets.py` fails on outright; see `collect`
OUTER_BAND = 0.25
# how hard to push shape against size; a window 10% off target is worth about
# as much as one 10% more distorted
SHAPE_WEIGHT = 1.0

# Which positional args are what, per builder. ``size`` are the knobs the
# search moves, ``mine`` the mine count it leaves alone, ``shape`` the trailing
# presentation arg (pixel scale, tube radius, seam cut) and ``lead`` how many
# leading args are not numbers at all (the Archimedean builders take the tiling
# key first).
SPEC: dict[str, dict] = {
    "square_board": dict(size=(0, 1), mine=2, shape=3, kind="scale"),
    "triangle_board": dict(size=(0,), mine=1, shape=2, kind="scale"),
    "triangle_grid_board": dict(size=(0, 1), mine=2, shape=3, kind="scale"),
    "hex_board": dict(size=(0, 1), mine=2, shape=3, kind="scale"),
    "hexhex_board": dict(size=(0,), mine=1, shape=2, kind="scale"),
    "hextri_board": dict(size=(0,), mine=1, shape=2, kind="scale"),
    "hextriangle_board": dict(size=(0,), mine=1, shape=2, kind="scale"),
    "torus_board": dict(size=(0, 1), mine=2, shape=3, kind="tube"),
    "torus_triangle_board": dict(size=(0, 1), mine=2, shape=3, kind="tube"),
    "torus_hex_board": dict(size=(0, 1), mine=2, shape=3, kind="tube"),
    "mobius_board": dict(size=(0, 1), mine=2, shape=None),
    "mobius_triangle_board": dict(size=(0, 1), mine=2, shape=None),
    "mobius_hex_board": dict(size=(0, 1), mine=2, shape=None),
    "klein_board": dict(size=(0, 1), mine=2, shape=3, kind="tubescale"),
    "klein_triangle_board": dict(size=(0, 1), mine=2, shape=3, kind="tubescale"),
    "klein_hex_board": dict(size=(0, 1), mine=2, shape=3, kind="tubescale"),
    "cylinder_board": dict(size=(0, 1), mine=2, shape=None),
    "cylinder_triangle_board": dict(size=(0, 1), mine=2, shape=None),
    "cylinder_hex_board": dict(size=(0, 1), mine=2, shape=None),
    # the named solids: the cell count *is* the solid, so only mines move
    "sphere_board": dict(size=(), mine=0, shape=None),
    "c80_board": dict(size=(), mine=0, shape=None),
    "c180_board": dict(size=(), mine=0, shape=None),
    "sphere_triangle_board": dict(size=(), mine=0, shape=None),
    "snub_dodecahedron_board": dict(size=(), mine=0, shape=None),
    "rhombicosidodecahedron_board": dict(size=(), mine=0, shape=None),
    "truncated_icosidodecahedron_board": dict(size=(), mine=0, shape=None),
    "cube_board": dict(size=(0,), mine=1, shape=None),
    "cube_frame_board": dict(size=(0, 1), mine=2, shape=None, grid="cubeframe"),
    "tetrahedron_board": dict(size=(1,), mine=0, shape=None),
    "tetrahedron_frame_board": dict(size=(1,), mine=0, shape=None),
    "stepped_bipyramid_board": dict(size=(0, 1), mine=2, shape=None,
                                    grid="bipyramid"),
    # aperiodic: ``keep`` is exact, the growth arg only has to be generous
    "penrose_board": dict(size=(3,), mine=1, shape=2, kind="scale", grow=0),
    "spectre_board": dict(size=(2,), mine=1, shape=3, kind="scale", grow=0),
    "phyllotaxis_board": dict(size=(2,), mine=1, shape=3, kind="scale", grow=0),
    # fractals: one whole substitution step at a time
    "sphinx_board": dict(size=(0,), mine=1, shape=2, kind="scale", coarse=True),
    "chair_board": dict(size=(0,), mine=1, shape=2, kind="scale", coarse=True),
    "carpet_board": dict(size=(0,), mine=1, shape=2, kind="scale", coarse=True),
    "pentaflake_board": dict(size=(0,), mine=1, shape=2, kind="scale", coarse=True),
    "gosper_board": dict(size=(0,), mine=1, shape=2, kind="scale", coarse=True),
    "archimedean_board": dict(size=(1, 2), mine=3, shape=4, kind="scale", lead=1),
    "arch_torus_board": dict(size=(1, 2), mine=3, shape=4, kind="tube", lead=1),
    "arch_cylinder_board": dict(size=(1, 2), mine=3, shape=4, kind="cut", lead=1),
    "arch_mobius_board": dict(size=(1, 2), mine=3, shape=None, lead=1),
    "arch_klein_board": dict(size=(1, 2), mine=3, shape=4, kind="tubescale", lead=1),
}

# Two solids whose two knobs are not independent: taken as a free grid they
# offer degenerate shapes at the right cell count -- a cube frame bored out to
# a one-cube hollow, which reads as a solid cube with a pinhole, and a stepped
# bipyramid two levels tall, which is a slab rather than a diamond. So their
# candidates are enumerated rather than swept.
#
#   * ``cube_frame_board(n, thickness)``: the hollow is ``n - 2*thickness``, and
#     it has to stay a real hollow -- a third of the cube, so the twelve edge
#     bars still read as bars.
#   * ``stepped_bipyramid_board(base, levels)``: the terraces must run all the
#     way to a single cube top and bottom, which is ``levels = (base + 1) / 2``
#     on an odd base.
def _grid_cubeframe() -> list[list[int]]:
    return [
        [n, thickness]
        for n in range(3, 17)
        for thickness in range(1, n // 2 + 1)
        if 2 * thickness < n and n - 2 * thickness >= math.ceil(n / 3)
    ]


def _grid_bipyramid() -> list[list[int]]:
    return [[base, (base + 1) // 2] for base in range(3, 24, 2)]


GRIDS = {"cubeframe": _grid_cubeframe, "bipyramid": _grid_bipyramid}

# Fractal levels a difficulty may not use, and why. ``resize`` scores a coarse
# board on cell count alone, but the level below the one named here cannot be
# *played* at the difficulty: measured, the level-2 pentaflake is 36 cells, and
# the fewest mines that stop its opening click clearing the board outright
# already drag its win rate to 83% against an easy target of 96.5%. The
# level-3 patch calibrates cleanly at 10 mines. See `calibrate.opening_floor`.
COARSE_MIN_LEVEL = {("pentaflake", "easy"): 3}

# The donut builders take a tube *radius* (a fraction of the ring radius); the
# Klein builders take a tube *scale* around 1.0. Same role -- the surface's own
# proportions, the other half of what sets cell distortion -- different units,
# and sweeping one over the other's range squashes the bottle.
SHAPE_SWEEP = {
    "tube": (0.28, 0.33, 0.38, 0.45, 0.52),
    "tubescale": (0.7, 0.85, 1.0, 1.15, 1.3),
}

# How hard squareness pushes. A flat board is judged on the board's own aspect
# and a rolled one on its unrolled window, since the immersion hides it.
FLAT_ASPECT_WEIGHT = 2.0
# cells this close to regular are not stretched; the no-regression bar on cell
# shape never bites below it
SHAPE_BAR_FLOOR = 1.15
# ...and what the Mobius strip is allowed instead, buying board shape with tile
# shape (see the note where it is applied)
MOBIUS_SHAPE_BAR = 1.8
# A tube or strip needs enough segments around to read as one: pushing for a
# square window alone will happily return a Mobius band 5 cells around and 15
# across, which is a twisted lozenge rather than a loop. Counted in *cells*
# around the seam, not in domain copies -- a triakis domain is two tiles wide
# and twelve cells big, so a ring of twelve domains is a 288-cell board and the
# bar in domain units rejects every easy window there is (see `_wrap_cells`).
MIN_RING = 12
# ...and, on a donut or a bottle, a floor in *domain copies* under the ring.
# Three copies round a loop is not a loop: the immersion has three flat facets
# to bend through a full turn, so it folds like paper instead of curving --
# which is what the Klein kisrhombille and triakis easy boards (3x1 and 3x2
# windows) actually looked like. Only the ring: the tube may legitimately be
# one domain deep where the domain is tall, and 24 shipped rows are, so a
# floor on both directions rejects boards nothing is wrong with.
#
# Deliberately in domain copies rather than in tiles, and deliberately not
# MIN_RING. Which knob is the long way round is not fixed: a donut's two
# circumferences differ by its tube radius, so the *right* window is lopsided,
# and which knob carries the lopsidedness varies by builder -- measured,
# `torushex` at 6 tiles around and 14 across distorts its cells by 1.08 where
# the 12-around window a seam bar would force distorts them by 2.01. A tile
# count is no better: kisrhombille packs 24 very unequal triangles into a
# domain, so the median tile span says its domain is 2.4 tiles wide when the
# thing that actually has to bend is the domain. On a closed surface the
# immersion really does stretch what does not fit, so cell distortion can be
# trusted to pick the ratio; this only has to rule out the folds it cannot
# see, and every window it rejects is one of five.
MIN_WRAP_DOMAINS = 4

# And a *playability* bar, on the square-lattice donut and bottle only.
#
# A wrap direction six cells long is a ring the mines can slide around: with
# two of them in one six-cell slice and the rest of the board solved, the two
# arrangements are indistinguishable and the endgame is a guess. Measured, the
# 14x6 square donut tops out at 82% against an easy target of 96.5% however
# its mines are counted, and 9x9 hits 96.5% exactly; the 13x6 Klein bottle
# goes from 76% to 96.0% at 10x8. Both were flagged unfair, and neither needed
# to be.
#
# Restricted to these two builders because it is not a general truth and the
# measurement says so: `torushex` at 6 cells around and 14 across wins 96.2%
# and has the best-shaped cells of any window at its size (1.08 against 1.61
# for the squarer one). Six hexagons around a ring are not six squares around
# a ring -- a hexagon has six neighbours and its rings interlock -- so the bar
# is written where it was measured rather than assumed everywhere.
MIN_WRAP_CELLS = 8
SQUARE_LATTICE_CLOSED = {"torus_board", "klein_board"}
ROLLED_ASPECT_WEIGHT = 1.2


def _rolled_flat(builder: str) -> bool:
    """The surfaces a flat sheet rolls onto with little or no stretching."""
    return "cylinder" in builder or "mobius" in builder


def _mobius_band_clamped(builder: str, spec: dict, trial: list) -> bool:
    """Does the immersion have to narrow this Mobius band to draw it?

    ``arch_mobius_board`` draws a band as wide as the window is tall, which is
    what keeps its tiles their planar shape -- but only up to
    ``MOBIUS_HALF_WIDTH``, past which the loop's hole closes to a point and the
    band folds through its own axis. Beyond that the extra rows buy no width at
    all: they are squeezed into the same band, so every tile is stretched
    further round the loop and nothing is gained. Measured, the staggered
    triangular strip asked for a half-width of 1.09 and got 0.70, which drew it
    as a nearly closed disc of slivers three times longer than they are wide,
    where every uncapped strip in the catalogue draws its tiles at two.

    So a clamped window is rejected outright rather than scored: the board it
    draws is not the board the window describes, and the search's own aspect
    term -- which reads the window, not the drawing -- would go on rewarding
    rows that only make the tiles worse.
    """
    if builder != "arch_mobius_board":
        return False
    from minesweeper.boards.surfaces import MOBIUS_HALF_WIDTH, mobius_half_width
    from minesweeper.boards.tilings import _arch_template

    try:
        template = _arch_template(trial[0])
        ring, rows = trial[spec["size"][0]], trial[spec["size"][1]]
    except Exception:
        return False
    halves = ring if template.glide else 2 * ring
    length = halves * template.width / 2
    if length <= 0:
        return False
    strip = rows * template.height
    return mobius_half_width(strip, length) >= MOBIUS_HALF_WIDTH - 1e-9


def _closed_tube(builder: str) -> bool:
    """The surfaces whose *second* knob wraps as well as the first.

    A cylinder and a Mobius strip have an open second direction -- a rim and
    an edge -- so only the seam needs enough tiles around it. A donut and a
    Klein bottle close both ways, and a window one or two domains tall gives
    the tube a cross-section of three or four facets.
    """
    return "torus" in builder or "klein" in builder


# how many windows to actually build per row; the rest are further from the
# target count than these and would lose on size anyway
CANDIDATE_LIMIT = 70

# how lopsided an unrolled window may be before it reads as a hoop, not a board
MAX_WINDOW_ASPECT = 15.0

# The classic board is the yardstick every other board is calibrated against,
# so it is never reshaped. It is also the one flat board that is deliberately
# not square -- 30x16 is what Minesweeper's expert board has always been.
PINNED = {"square"}


def _defaults(builder: str) -> list:
    """The builder's own default for each positional arg."""
    import inspect

    params = list(inspect.signature(P._JSON_BUILDERS[builder]).parameters.values())
    return [
        p.default if p.default is not inspect.Parameter.empty else None
        for p in params
    ]


def _pad(builder: str, args: list, upto: int) -> list:
    """Make ``args`` long enough to address index ``upto``.

    A preset may stop before a trailing arg it is happy to default (plenty of
    torus rows omit the tube radius), but the search needs to *set* it.
    """
    out = list(args)
    defaults = _defaults(builder)
    while len(out) <= upto:
        out.append(defaults[len(out)])
    return out


def _build(builder: str, args: list):
    return P._JSON_BUILDERS[builder](*args)


def _topology_ok(mode: str, board) -> bool:
    """A wrapped board must still be the surface it claims to be."""
    try:
        surface = surface_of(mode)
    except Exception:
        return True
    if surface is None or not getattr(surface, "is_3d", False):
        return True
    want = surface.boundary_components
    try:
        if boundary_components(board) != want:
            return False
        if want == 0 and euler_characteristic(board) != 0:
            return False
    except Exception:
        return False
    return True


def _candidate_values(current, coarse: bool, domains: bool = True) -> list:
    """Values to try for one size knob.

    The Archimedean builders count *domain copies*, each worth several cells,
    so several dozen is plenty. The plain surface builders count **cells**, and
    the shipped presets already go well past that -- ``mobiustri`` hard was 49
    around -- so they need a much wider range. Capping them at 40 leaves the
    search no long-and-thin window at 480 cells and it settles for a squarish
    one whose triangles are badly stretched.

    Sixty domains rather than forty, because a domain can be one tile wide: a
    staggered-triangular Mobius strip has to be about 47 domains around before
    it is long enough that the immersion can draw its 480 cells without
    narrowing the band (see ``_mobius_band_clamped``), and at forty there was
    no such window in the grid at all. Windows are filtered on their product
    before any board is built, so the wider range costs a list, not a search.
    """
    if coarse:  # a fractal level is a whole substitution step
        return [1, 2, 3, 4, 5]
    if isinstance(current, float) and not float(current).is_integer():
        frac = current - math.floor(current)
        return [n + frac for n in range(1, 31)]
    return list(range(1, 61 if domains else 161))


def _cylinder_rows(tiling: str, limit: int = 40) -> list[float]:
    """The row counts ``arch_cylinder_board`` will accept for a tiling: those
    that land the strip's centre line on one of the template's flip levels."""
    from minesweeper.boards.tilings import _arch_template

    template = _arch_template(tiling)
    half = template.height / 2
    fractions = {round(((flip - template.cut) / half) % 1.0, 6)
                 for flip in template.flips}
    rows = {round(whole + fraction, 6)
            for fraction in fractions for whole in range(limit)}
    # half a domain is a real window, not a degenerate one: a Laves domain
    # can be a dozen cells tall, and the tilings whose only flip level is
    # halfway up (deltoidal, triakis) have nothing shorter to offer an easy
    # board. What rules out a bracelet is MIN_RING, further down.
    return sorted(value for value in rows if value > 0.25)


def _rescale(builder: str, spec: dict, trial: list, before) -> list:
    """Keep a flat board the size on screen it already was.

    A flat board's trailing arg is a pixel scale, and each family has its own
    convention for it -- the classic board keeps a constant *cell* size, the
    Archimedean rows a constant board *width*. Rather than impose one, hold the
    board's width steady and let the extra cells be smaller, which is what the
    hand-tuned rows were already doing as difficulty rose.
    """
    if spec.get("kind") != "scale" or spec.get("shape") is None:
        return trial
    trial = _pad(builder, trial, spec["shape"])
    probe_args = list(trial)
    probe_args[spec["shape"]] = 1.0
    try:
        unit = _build(builder, probe_args)
        if unit.width and getattr(before, "width", 0):
            trial[spec["shape"]] = round(before.width / unit.width, 3)
    except Exception:
        pass
    return trial


def _symmetric_enough(mode: str, board, is_flat: bool) -> bool:
    """Does a flat board still read as a symmetric window of its tiling?

    The board-shape convention (the ``AGENT NOTE`` in ``boards/tilings.py``)
    says a symmetric tiling must give a symmetric board, and
    ``test_flat_board_is_symmetric`` is what enforces it. That test's measure is
    imported here rather than reimplemented -- a second copy of a subtle
    geometric check is a second thing to drift -- and imported lazily, since it
    drags in the whole test module.
    """
    if not is_flat:
        return True
    try:
        from tests.test_boards import _ARCH_CONFIGS, _NO_HALF_TURN, TestArchimedean
    except Exception:
        return True  # tooling should not fail because the suite moved
    # Only the Archimedean windows are held to this. The named shaped boards --
    # triangle, hexhex, hextri, hextriangle -- are deliberately *not*
    # rectangles but polygons of their tiling's own symmetry, and a triangle
    # has three-fold symmetry, not the two-fold the measure looks for. Applied
    # to them it rejects every real board and leaves the degenerate one-cell
    # patch, which is trivially symmetric and not a game.
    if mode not in _ARCH_CONFIGS or mode in _NO_HALF_TURN:
        return True
    try:
        rotation = TestArchimedean._symmetry(
            board, lambda cx, cy, x, y: (2 * cx - x, 2 * cy - y)
        )
        if rotation < 0.85:
            return False
        if mode in TestArchimedean.REFLECTIVE:
            lr = TestArchimedean._symmetry(
                board, lambda cx, cy, x, y: (2 * cx - x, y)
            )
            tb = TestArchimedean._symmetry(
                board, lambda cx, cy, x, y: (x, 2 * cy - y)
            )
            if max(lr, tb) < 0.9:
                return False
    except Exception:
        return True
    return True


def _window_aspect(builder: str, spec: dict, trial: list) -> float:
    """How far the *unrolled* window is from square, as a ratio >= 1.

    A cylinder and a Mobius strip are developable -- rolling a flat sheet into
    a tube distorts nothing -- so cell distortion is blind to their
    proportions, and without this a search that only minimises distortion is
    free to return a 40-around, 1-row bracelet. Measured in the tiling's own
    domain units where there are any, and in raw knob counts otherwise.

    The cap this feeds is deliberately loose. These boards are *meant* to be
    long and thin: the wrapped surfaces have always been many cells around and
    few across (``mobius_triangle_board(28, 4, ...)``), and their triangles are
    only near-equilateral when they are. A tight cap here rejects the good
    windows and keeps a squarer one whose cells are badly stretched.
    """
    knobs = spec["size"]
    if len(knobs) != 2:
        return 1.0
    a, b = trial[knobs[0]], trial[knobs[1]]
    if not a or not b:
        return float("inf")
    if spec.get("lead"):
        try:
            from minesweeper.boards.tilings import _arch_template

            template = _arch_template(trial[0])
            a, b = a * template.width, b * template.height
        except Exception:
            pass
    ratio = a / b
    return max(ratio, 1 / ratio)


_TILE_SPAN: dict[str, tuple[float, float]] = {}


def _tile_span(tiling: str) -> tuple[float, float]:
    """Median tile width and height in one domain of an Archimedean template.

    A wrap knob counts *domain copies*, and a domain is anything from one tile
    wide (the stacked bond) to nearly four (truncated hexagonal). Dividing the
    domain's size by this turns a knob into the number of tiles that direction
    actually closes over, which is what ``MIN_RING`` and ``MIN_TUBE`` mean.
    """
    if tiling not in _TILE_SPAN:
        import statistics

        from minesweeper.boards.tilings import _arch_template

        template = _arch_template(tiling)
        widths, heights = [], []
        for _name, refs in template.cells:
            xs = [template.verts[tag][0] + dm * template.width
                  for tag, dm, _dn in refs]
            ys = [template.verts[tag][1] + dn * template.height
                  for tag, _dm, dn in refs]
            widths.append(max(xs) - min(xs))
            heights.append(max(ys) - min(ys))
        _TILE_SPAN[tiling] = (statistics.median(widths) or 1.0,
                              statistics.median(heights) or 1.0)
    return _TILE_SPAN[tiling]


def _wrap_cells(builder: str, spec: dict, trial: list, axis: int) -> float:
    """How many tiles the window closes over along ``axis`` (0 = seam, 1 = tube).

    The plain surface builders take the count in cells already; the
    Archimedean ones take it in domain copies, so it is converted.
    """
    knobs = spec["size"]
    if axis >= len(knobs):
        return float("inf")
    count = trial[knobs[axis]]
    if not spec.get("lead"):
        return float(count)
    try:
        from minesweeper.boards.tilings import _arch_template

        template = _arch_template(trial[0])
    except Exception:
        return float(count)
    domain = template.width if axis == 0 else template.height
    # the slack absorbs the float division: a ring of exactly MIN_RING tiles
    # must not fail the bar because the width divides to 11.9999996
    return count * domain / _tile_span(trial[0])[axis] + 1e-6


def _rolled_screen_aspect(builder: str, spec: dict, trial: list) -> float:
    """How far a rolled board is from square *as drawn*, as a ratio >= 1.

    A cylinder's unrolled window and its silhouette are not the same shape:
    rolling a window of circumference ``c`` into a tube of height ``h`` draws a
    rectangle ``c / pi`` wide by ``h`` tall, so the square *window* the plain
    aspect term asks for is a tube three times taller than it is wide -- which
    is what every cylinder in the catalogue had become. Squaring the silhouette
    instead means an unrolled window about pi times wider than it is tall.

    Neither extreme is the answer on its own, which is why this is a term in
    the score rather than a bar: it pulls toward a square silhouette while cell
    distortion pulls back toward a square window, and the boards land between.
    """
    ratio = _window_aspect(builder, spec, trial)
    if not math.isfinite(ratio):
        return ratio
    knobs = spec["size"]
    a, b = trial[knobs[0]], trial[knobs[1]]
    if not a or not b:
        return float("inf")
    if spec.get("lead"):
        try:
            from minesweeper.boards.tilings import _arch_template

            template = _arch_template(trial[0])
            a, b = a * template.width, b * template.height
        except Exception:
            pass
    drawn = (a / math.pi) / b
    return max(drawn, 1 / drawn)


_CORNERS: dict[str, dict[str, tuple[int, ...]]] = {}


def corner_indices(tiling: str) -> dict[str, tuple[int, ...]]:
    """Which vertices of each template cell are real corners, by cell name.

    A tiling that is not edge to edge -- the isogonal families and four of the
    five bonds -- carries **T-vertices**: the corner of a neighbour landing in
    the middle of this tile's edge, recorded by ``_insert_t_vertices`` so the
    shared-vertex adjacency still finds that neighbour. It sits at 180 degrees
    and is no corner of the shape, so an edge it splits must be measured whole
    or a square reads as a tile with two long sides and two short ones. This is
    the same thing ``tests/test_boards._corners`` drops and the renderer's
    shape colouring drops, decided here on the **flat** template, where a
    T-vertex is exactly collinear -- on a wrapped board the surface bends it,
    and on the stretched windows this measure exists to reject it can bend it
    further than a real corner.
    """
    if tiling not in _CORNERS:
        from minesweeper.boards.tilings import _arch_template

        template = _arch_template(tiling)
        out = {}
        for name, refs in template.cells:
            points = [(dm * template.width + template.verts[tag][0],
                       dn * template.height + template.verts[tag][1])
                      for tag, dm, dn in refs]
            n = len(points)
            keep = []
            for i in range(n):
                (bx, by), (px, py), (ax, ay) = points[i - 1], points[i], points[(i + 1) % n]
                v1, v2 = (bx - px, by - py), (ax - px, ay - py)
                angle = abs(math.atan2(v1[0] * v2[1] - v1[1] * v2[0],
                                       v1[0] * v2[0] + v1[1] * v2[1]))
                if abs(angle - math.pi) > 1e-3:
                    keep.append(i)
            out[name] = tuple(keep)
        _CORNERS[tiling] = out
    return _CORNERS[tiling]


def edge_ratio(board, corners: dict[str, tuple[int, ...]] | None = None) -> float:
    """Median longest-to-shortest edge over the board's tiles.

    The suite already holds some modes to a bar on this
    (``TestPolygonShapes._EDGE_RATIO_LIMITS`` wants wrapped triangles
    near-equilateral), and it measures something the isoperimetric quotient
    does not: a tile can be the right roundness overall and still be built from
    one long edge and two short ones. Rather than copy those per-mode limits
    here, the search simply refuses to make any board's cells worse-shaped than
    it already found them.

    ``corners`` names the vertices that really are corners, per template cell
    name (see ``corner_indices``); without it a T-vertex's two half-edges are
    counted as two short sides, which stands the measure on its head. Measured
    that way an *undistorted* staggered-triangular donut scores 2.05 -- a whole
    edge against its neighbour's half -- and the 3.3-to-1 stretched one scores
    1.13, because the stretch happens to even the two out. The bar is a
    no-regression bar, so it then locks the search inside the stretched window
    it should be replacing.
    """
    ratios = []
    for cell, points in board.polygons.items():
        keep = None
        if corners is not None and isinstance(cell, tuple):
            keep = corners.get(cell[-1])
        if keep is not None:
            points = [points[i] for i in keep]
        n = len(points)
        if n < 3:
            continue
        edges = [math.dist(points[i], points[(i + 1) % n]) for i in range(n)]
        shortest = min(edges)
        if shortest > 0:
            ratios.append(max(edges) / shortest)
    if not ratios:
        return 1.0
    ratios.sort()
    return ratios[len(ratios) // 2]


def _score(mode: str, board, target: int, is_flat: bool,
           builder: str = "", spec: dict | None = None,
           trial: list | None = None) -> float:
    n = len(board.adjacency)
    size_penalty = abs(math.log(n / target))
    if is_flat:
        shape_penalty = FLAT_ASPECT_WEIGHT * math.log(aspect(board))
    else:
        mean, p90 = distortion_summary(board.polygons)
        shape_penalty = math.log(mean) + 0.5 * math.log(p90)
        # A cylinder is developable and a Mobius strip nearly so: rolling a
        # sheet into a tube stretches almost nothing, so cell distortion is
        # blind to their proportions and the search is free to return a tube 6
        # cells around and 80 tall. On those two the window aspect is the only
        # signal there is, and it has to carry real weight -- the tiles may end
        # up a little more stretched, which on a strip is the right trade for a
        # board you can actually read.
        if spec is not None and trial is not None and _rolled_flat(builder):
            shape_penalty += ROLLED_ASPECT_WEIGHT * math.log(
                _rolled_screen_aspect(builder, spec, trial)
            )
    return size_penalty + SHAPE_WEIGHT * shape_penalty


def search(mode: str, builder: str, args: list, difficulty: str) -> dict:
    """Best geometry for one (mode, difficulty), or the current one if the
    board has no size knob."""
    spec = SPEC[builder]
    target = TARGETS[difficulty]
    probe = _build(builder, args)
    is_flat = probe.__class__.__name__ == "Board"

    if mode in PINNED:
        return dict(args=list(args), cells=len(probe.adjacency), fixed=True,
                    reason="the reference board")

    if not spec["size"]:
        return dict(args=list(args), cells=len(probe.adjacency), fixed=True,
                    reason="the cell count is the solid")

    knobs = spec["size"]
    coarse = spec.get("coarse", False)
    grow = spec.get("grow")

    best = None
    if grow is not None:
        # aperiodic: keep exactly the target, growing the patch until the kept
        # block is a small fraction of it -- or the substitution's own outline
        # is what the board reads as, which on the phyllotactic spiral is a
        # ten-pointed star. The range has to run well past the growth a small
        # board needs: the spiral's patch is 10*rings**2, so a 480-cell board
        # only stops being a star at twelve rings.
        for growth in range(2, 26):
            trial = list(args)
            trial[grow] = growth
            trial[knobs[0]] = target
            try:
                board = _build(builder, trial)
            except Exception:
                continue
            if len(board.adjacency) < target:
                continue
            full = list(trial)
            full[knobs[0]] = None
            try:
                patch = len(_build(builder, full).adjacency)
            except Exception:
                patch = len(board.adjacency)
            if patch < 3 * target and growth < 25:
                continue
            trial = _rescale(builder, spec, trial, probe)
            board = _build(builder, trial)
            mean, p90 = distortion_summary(board.polygons)
            best = dict(args=trial, cells=len(board.adjacency), score=0.0,
                        distortionMean=round(mean, 4), distortionP90=round(p90, 4),
                        indistinguishable=indistinguishable_cells(board.adjacency),
                        patch=patch)
            break
        if best is None:
            best = dict(args=list(args), cells=len(probe.adjacency), fixed=True,
                        reason="no patch large enough")
        return best

    grids: list[list] = []
    wider: list[list] = []
    domains = bool(spec.get("lead"))
    if spec.get("grid"):
        grids = GRIDS[spec["grid"]]()
    elif len(knobs) == 1:
        # One knob, and cell count rises with it -- often quadratically
        # (``cube_board`` is 6n**2, ``hexhex_board`` 3r**2-3r+1). Walk upwards
        # and stop as soon as the board overshoots, or a range wide enough for
        # the two-knob builders would ask for a 150,000-cell cube.
        floor = COARSE_MIN_LEVEL.get((mode, difficulty), 0) if coarse else 0
        grids = []
        for value in _candidate_values(args[knobs[0]], coarse, domains):
            if value < floor:
                continue
            trial = list(args)
            trial[knobs[0]] = value
            try:
                n = len(_build(builder, trial).adjacency)
            except Exception:
                continue
            grids.append([value])
            if n > 3 * target:
                break
    else:
        va = _candidate_values(args[knobs[0]], coarse, domains)
        if builder == "arch_cylinder_board":
            # a cylinder's row count is not a free knob: it is what puts the
            # strip's centre line on a height where the tiling reverses y, or
            # the board's two rims are different curves and the builder
            # refuses it (see arch_cylinder_board)
            vb = _cylinder_rows(args[0])
        else:
            vb = _candidate_values(args[knobs[1]], coarse, domains)
        grids = [[a, b] for a in va for b in vb]
        # Building every combination is thousands of boards per row, and each
        # build is followed by a topology check and two shape measurements that
        # all walk every polygon. Cell count is very nearly proportional to the
        # product of the two knobs (they count copies of a fixed domain), so
        # measure the constant off the current preset, keep only products that
        # could land in the band, and take the closest few dozen of those. The
        # proportionality is not exact -- a seam can round a row up or down --
        # so the kept range is wider than the band itself.
        per = len(probe.adjacency) / max(1e-9, args[knobs[0]] * args[knobs[1]])
        want = target / per
        near = sorted(grids, key=lambda g: abs(math.log(g[0] * g[1]
                                                        / max(1e-9, want))))
        grids = [g for g in near
                 if 0.7 * want <= g[0] * g[1] <= 1.35 * want][:CANDIDATE_LIMIT]
        # ...and a wider net for the fallback passes. A tiling with a big
        # domain can have no window at all near the target that also reads as
        # the surface: kisrhombille packs 24 cells into a domain two tiles
        # wide, so the smallest Mobius strip of it with enough segments to
        # close as a band is 144 cells against an easy target of 81. A board
        # half again too big beats a twisted lozenge, but only the wide net
        # can see it.
        wider = [g for g in near
                 if 0.25 * want <= g[0] * g[1] <= 4.0 * want][:CANDIDATE_LIMIT]

    lo, hi = target * (1 - BAND), target * (1 + BAND)
    # the tilings that are not edge to edge need their T-vertices dropped
    # before any tile of theirs is measured (see `corner_indices`)
    corners = corner_indices(args[0]) if spec.get("lead") else None
    # Prefer not to hand back cells worse-shaped than the ones already
    # shipping -- but never let that veto a board whose cells are fine in
    # absolute terms. Measured against a degenerate 6-around, 80-tall tube
    # whose cells happen to be square to the third decimal, a purely relative
    # bar rejects the 21x23 cylinder for having cells at 1.107 instead of
    # 1.061, and so defends the very shape it should be replacing. Under the
    # floor, a tile is not stretched by any standard worth enforcing.
    shape_bar = max(edge_ratio(probe, corners) * 1.02, SHAPE_BAR_FLOOR)
    if _rolled_flat(builder) and "mobius" in builder:
        # A Mobius strip closes with a half twist, so a *wide* one is stretched
        # by the immersion however its window is chosen: keeping its tiles
        # near-regular forces a band 80 cells around and 6 across, which reads
        # as a hoop rather than a board. Here the board's shape is worth more
        # than the tiles', so the cell-shape bar is loosened to let the aspect
        # term pick a squarer strip.
        shape_bar = max(shape_bar, MOBIUS_SHAPE_BAR)

    def collect(in_band: bool, keep_shape: bool, fair: bool = True,
                net: list | None = None) -> list:
        found = []
        for values in (grids if net is None else net):
            trial = list(args)
            for knob, value in zip(knobs, values):
                trial[knob] = value
            try:
                board = _build(builder, trial)
            except Exception:
                continue
            n = len(board.adjacency)
            if in_band and not (lo <= n <= hi):
                continue
            if not _topology_ok(mode, board):
                continue
            # A window shaped like a bracelet -- 40 domains around, one row
            # across -- can have perfectly square cells and still be a bad
            # board. On a cylinder, which is developable, cell distortion
            # cannot see that at all, so degenerate proportions are ruled out
            # here rather than traded off in the score, where they would fight
            # the distortion term on the curved surfaces that do not need it.
            if _window_aspect(builder, spec, trial) > MAX_WINDOW_ASPECT:
                continue
            # Enough tiles around whatever actually closes, or the immersion
            # folds the window instead of wrapping it. A cylinder and a strip
            # close one way and are developable, so the seam carries the whole
            # bar; a donut and a bottle close both ways and only need a floor
            # under the smaller of the two, distortion having the casting vote
            # on the ratio.
            if len(knobs) == 2:
                if _rolled_flat(builder):
                    if _wrap_cells(builder, spec, trial, 0) < MIN_RING:
                        continue
                elif _closed_tube(builder) and spec.get("lead"):
                    if trial[knobs[0]] < MIN_WRAP_DOMAINS:
                        continue
                elif builder in SQUARE_LATTICE_CLOSED:
                    if min(trial[knobs[0]], trial[knobs[1]]) < MIN_WRAP_CELLS:
                        continue
            # ...and a band no wider than the immersion will actually draw
            if _mobius_band_clamped(builder, spec, trial):
                continue
            if keep_shape and not is_flat and edge_ratio(board, corners) > shape_bar:
                continue
            # A window can hit the cell count, keep its topology and still not
            # be a puzzle: three cells around a cylinder gives every cell the
            # same closed neighbourhood, so no number can ever separate them
            # and the endgame is coin flips. The bar is absolute rather than
            # "no worse than before" -- measured against a board that is
            # already all twins, a relative bar permits itself.
            if fair and indistinguishable_cells(board.adjacency) > 0:
                continue
            # Two tiers, because the size bands are two bars rather than one:
            # missing +-15% is what the search is trying not to do, and missing
            # +-25% as well is what `test_no_board_is_far_from_the_classic_size`
            # refuses outright. Without the second tier a size score of pure
            # |log| picks 326 cells over 198 against a 256 target -- a hair
            # closer in log terms, and the only one of the two the suite fails.
            # Out of the band, size stops being one term among several and
            # becomes the thing to minimise: the shape terms are tuned to
            # choose between windows that are all about the right size, and
            # left to compete on their own they will take a 288-cell cylinder
            # over a 144-cell one against a target of 81 for a better aspect.
            penalty = 0.0 if in_band else 10.0 + 2.0 * abs(math.log(n / target))
            if not (target * (1 - OUTER_BAND) <= n <= target * (1 + OUTER_BAND)):
                penalty += 1.0
            found.append((
                _score(mode, board, target, is_flat, builder, spec, trial) + penalty,
                trial, n,
            ))
        return found

    # Right size and no worse cells is the goal; but a board at half the target
    # size is a worse outcome than one whose tiles are slightly more stretched,
    # so the shape guard gives way before the size does, and size gives way
    # only when nothing in the band builds at all.
    scored = (
        collect(in_band=True, keep_shape=True)
        or collect(in_band=True, keep_shape=False)
        or collect(in_band=False, keep_shape=True)
        or collect(in_band=False, keep_shape=False)
        or collect(in_band=False, keep_shape=True, net=wider)
        or collect(in_band=False, keep_shape=False, net=wider)
        # last resort only: a board of indistinguishable twins is barely a
        # puzzle, so it is preferred to nothing at all and to nothing else
        or collect(in_band=True, keep_shape=False, fair=False)
        or collect(in_band=False, keep_shape=False, fair=False)
        or collect(in_band=False, keep_shape=False, fair=False, net=wider)
    )
    if not scored:
        return dict(args=list(args), cells=len(probe.adjacency), fixed=True,
                    reason="no window builds at this size")
    scored.sort(key=lambda row: row[0])
    # Symmetry is checked on the winners rather than on every candidate: for a
    # face-transitive tiling every tile is a possible rotation centre, so the
    # measure scans all of them against all cells, and running that on seventy
    # windows a row costs more than the rest of the search put together.
    def first_symmetric(rows: list) -> int:
        for index, (_, trial, _) in enumerate(rows):
            try:
                if _symmetric_enough(mode, _build(builder, trial), is_flat):
                    return index
            except Exception:
                continue
        return -1

    index = first_symmetric(scored)
    if index < 0:
        # No window of the right size reads as a symmetric patch of this
        # tiling. Symmetry is the harder bar -- the suite fails on it, and a
        # lopsided window is the thing the board-shape convention exists to
        # forbid -- so widen the size search rather than ship the asymmetry.
        wider = sorted(collect(in_band=False, keep_shape=False), key=lambda r: r[0])
        index = first_symmetric(wider)
        if index >= 0:
            scored = wider
    scored = scored[max(index, 0):]

    # tune the surface's own proportions against the best few windows: the
    # window and the tube radius together are what set cell distortion
    if spec.get("kind") in SHAPE_SWEEP and spec["shape"] is not None:
        refined = []
        for score, trial, n in scored[:3]:
            for radius in SHAPE_SWEEP[spec["kind"]]:
                cand = _pad(builder, trial, spec["shape"])
                cand[spec["shape"]] = radius
                try:
                    board = _build(builder, cand)
                except Exception:
                    continue
                # the radius reshapes the cells too, so it faces the same bar
                # the window did -- otherwise a fatter tube buys a better
                # isoperimetric score by stretching every tile
                if edge_ratio(board, corners) > shape_bar:
                    continue
                refined.append((_score(mode, board, TARGETS[difficulty], False,
                                       builder, spec, cand), cand, n))
        if refined:
            refined.sort(key=lambda row: row[0])
            scored = refined

    score, trial, n = scored[0]
    # A flat board's trailing arg is a pixel scale, and each family has its own
    # convention for it (the classic board keeps a constant *cell* size, the
    # Archimedean rows a constant board *width*). Rather than impose one, keep
    # the board the size on screen it already was and let the extra cells be
    # smaller -- which is what the hand-tuned rows were already doing as
    # difficulty rose.
    if is_flat:
        trial = _rescale(builder, spec, trial, probe)
    board = _build(builder, trial)
    mean, p90 = distortion_summary(board.polygons)
    return dict(
        args=trial,
        cells=len(board.adjacency),
        score=round(score, 4),
        distortionMean=round(mean, 4),
        distortionP90=round(p90, 4),
        indistinguishable=indistinguishable_cells(board.adjacency),
    )


def _one(job: tuple) -> tuple:
    mode, builder, args, difficulty = job
    before = len(_build(builder, args).adjacency)
    return mode, difficulty, before, search(mode, builder, args, difficulty)


def _share_reused_scales(out: dict[str, dict]) -> None:
    """Draw two difficulties of the same patch at the same size.

    A row is searched on its own, and ``_rescale`` keeps each board the width
    it already had -- right while every difficulty is a different board, wrong
    for the fractals, where two difficulties can be the *same* patch differing
    only in mine count. Left alone, the pentaflake's easy board inherits the
    width of the level-2 patch it replaced and is drawn at 60% of its own
    medium, which are the same 216 cells. Hardest wins: it is the row whose
    width the level was tuned at.
    """
    for spec in out.values():
        builder = spec["builder"]
        knobs = SPEC[builder]
        if not knobs.get("coarse") or knobs.get("shape") is None:
            continue
        shape, level = knobs["shape"], knobs["size"][0]
        rows = [spec["args"].get(d) for d in ("hard", "medium", "easy")]
        scale: dict[int, float] = {}
        for row in rows:
            if row is None or len(row["args"]) <= shape:
                continue
            scale.setdefault(row["args"][level], row["args"][shape])
            row["args"][shape] = scale[row["args"][level]]


def main() -> int:
    import argparse
    import multiprocessing as mp

    parser = argparse.ArgumentParser()
    parser.add_argument("--jobs", type=int, default=max(1, mp.cpu_count() - 1))
    parser.add_argument("--only", default="", help="comma-separated modes")
    options = parser.parse_args()

    presets = json.loads((ROOT / "data" / "presets.json").read_text())["presets"]
    only = {mode for mode in options.only.split(",") if mode}
    path = Path(__file__).parent / "geometry.json"
    # searching one family only: every row not asked for keeps what it already
    # measured, so the file stays whole for `apply`
    out: dict[str, dict] = (
        {mode: spec for mode, spec in json.loads(path.read_text()).items()
         if mode in presets}
        if only and path.exists() else {}
    )
    jobs = []
    for mode, spec in sorted(presets.items()):
        builder = spec["builder"]
        if builder not in SPEC:
            print(f"  !! no knob spec for {builder} ({mode})")
            continue
        if only and mode not in only:
            continue
        out[mode] = {"builder": builder, "args": {}}
        for difficulty in ("easy", "medium", "hard"):
            jobs.append((mode, builder, list(spec["args"][difficulty]), difficulty))

    print(f"{len(jobs)} rows on {options.jobs} workers")
    if options.jobs == 1:
        results = map(_one, jobs)
    else:
        results = mp.Pool(options.jobs).imap_unordered(_one, jobs, chunksize=1)
    for i, (mode, difficulty, before, result) in enumerate(results, 1):
        out[mode]["args"][difficulty] = result
        flag = f"  [fixed: {result.get('reason')}]" if result.get("fixed") else ""
        print(
            f"[{i}/{len(jobs)}] {mode:26s} {difficulty:6s} "
            f"{before:5d} -> {result['cells']:5d}"
            f"  (target {TARGETS[difficulty]}){flag}",
            flush=True,
        )
    _share_reused_scales(out)
    path.write_text(json.dumps(out, indent=2) + "\n")
    print(f"\nwrote {path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
