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
    "cube_frame_board": dict(size=(0,), mine=2, shape=None, hold=(1,)),
    "tetrahedron_board": dict(size=(1,), mine=0, shape=None),
    "tetrahedron_frame_board": dict(size=(1,), mine=0, shape=None),
    "stepped_bipyramid_board": dict(size=(0, 1), mine=2, shape=None),
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

# The donut builders take a tube *radius* (a fraction of the ring radius); the
# Klein builders take a tube *scale* around 1.0. Same role -- the surface's own
# proportions, the other half of what sets cell distortion -- different units,
# and sweeping one over the other's range squashes the bottle.
SHAPE_SWEEP = {
    "tube": (0.28, 0.33, 0.38, 0.45, 0.52),
    "tubescale": (0.7, 0.85, 1.0, 1.15, 1.3),
}

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
    so a few dozen is plenty. The plain surface builders count **cells**, and
    the shipped presets already go well past that -- ``mobiustri`` hard was 49
    around -- so they need a much wider range. Capping them at 40 leaves the
    search no long-and-thin window at 480 cells and it settles for a squarish
    one whose triangles are badly stretched.
    """
    if coarse:  # a fractal level is a whole substitution step
        return [1, 2, 3, 4, 5]
    if isinstance(current, float) and not float(current).is_integer():
        frac = current - math.floor(current)
        return [n + frac for n in range(1, 31)]
    return list(range(1, 41 if domains else 161))


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


def edge_ratio(board) -> float:
    """Median longest-to-shortest edge over the board's tiles.

    The suite already holds some modes to a bar on this
    (``TestPolygonShapes._EDGE_RATIO_LIMITS`` wants wrapped triangles
    near-equilateral), and it measures something the isoperimetric quotient
    does not: a tile can be the right roundness overall and still be built from
    one long edge and two short ones. Rather than copy those per-mode limits
    here, the search simply refuses to make any board's cells worse-shaped than
    it already found them.
    """
    ratios = []
    for points in board.polygons.values():
        n = len(points)
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
        shape_penalty = math.log(aspect(board))
    else:
        mean, p90 = distortion_summary(board.polygons)
        shape_penalty = math.log(mean) + 0.5 * math.log(p90)
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
        # block is a small fraction of it (or the substitution's own star
        # outline is what the board reads as)
        for growth in range(2, 8):
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
            if patch < 3 * target and growth < 7:
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
    domains = bool(spec.get("lead"))
    if len(knobs) == 1:
        # One knob, and cell count rises with it -- often quadratically
        # (``cube_board`` is 6n**2, ``hexhex_board`` 3r**2-3r+1). Walk upwards
        # and stop as soon as the board overshoots, or a range wide enough for
        # the two-knob builders would ask for a 150,000-cell cube.
        grids = []
        for value in _candidate_values(args[knobs[0]], coarse, domains):
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
        grids = [g for g in grids if 0.7 * want <= g[0] * g[1] <= 1.35 * want]
        grids.sort(key=lambda g: abs(math.log(g[0] * g[1] / max(1e-9, want))))
        grids = grids[:CANDIDATE_LIMIT]

    lo, hi = target * (1 - BAND), target * (1 + BAND)
    # prefer not to hand back cells worse-shaped than the ones already shipping
    shape_bar = edge_ratio(probe) * 1.02

    def collect(in_band: bool, keep_shape: bool, fair: bool = True) -> list:
        found = []
        for values in grids:
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
            if keep_shape and not is_flat and edge_ratio(board) > shape_bar:
                continue
            # A window can hit the cell count, keep its topology and still not
            # be a puzzle: three cells around a cylinder gives every cell the
            # same closed neighbourhood, so no number can ever separate them
            # and the endgame is coin flips. The bar is absolute rather than
            # "no worse than before" -- measured against a board that is
            # already all twins, a relative bar permits itself.
            if fair and indistinguishable_cells(board.adjacency) > 0:
                continue
            penalty = 0.0 if in_band else 10.0
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
        # last resort only: a board of indistinguishable twins is barely a
        # puzzle, so it is preferred to nothing at all and to nothing else
        or collect(in_band=True, keep_shape=False, fair=False)
        or collect(in_band=False, keep_shape=False, fair=False)
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
                if edge_ratio(board) > shape_bar:
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


def main() -> int:
    import argparse
    import multiprocessing as mp

    parser = argparse.ArgumentParser()
    parser.add_argument("--jobs", type=int, default=max(1, mp.cpu_count() - 1))
    options = parser.parse_args()

    presets = json.loads((ROOT / "data" / "presets.json").read_text())["presets"]
    jobs = []
    out: dict[str, dict] = {}
    for mode, spec in sorted(presets.items()):
        builder = spec["builder"]
        if builder not in SPEC:
            print(f"  !! no knob spec for {builder} ({mode})")
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
    path = Path(__file__).parent / "geometry.json"
    path.write_text(json.dumps(out, indent=2) + "\n")
    print(f"\nwrote {path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
