"""Choose each board's mine count by measuring, not by assuming a density.

The old convention was a flat ~14/16/19 per cent everywhere. It cannot be
right: adjacency here is shared-vertex, so a cell has anywhere from 4 to 21
neighbours, and a number spread over 21 cells says far less than the same
number over 6. Boundary matters the same way -- a corner constrains less than
an interior cell, so a seamless donut is easier than the flat board it wraps.

So instead: play each board with the reference solver, and pick the mine count
whose win rate matches the classic board's at the same difficulty, measured
with that same solver under the same rules. The classic numbers are not
assumed either -- they are measured first, in ``targets()``.

The search exploits the fact that win rate falls monotonically and smoothly as
mines are added: bracket the crossing, bisect to a couple of candidates, then
spend the games on telling those apart. Every row is seeded from its own name,
so a re-run reproduces it, and finished rows are appended to a JSONL as they
land so a multi-hour sweep survives being interrupted.

Run: ``PYTHONPATH=. python -m scripts.difficulty.calibrate [--jobs N]``
"""

from __future__ import annotations

import argparse
import json
import multiprocessing as mp
import time
import zlib
from pathlib import Path

from minesweeper.boards import presets as P
from scripts.difficulty.metrics import indistinguishable_cells, mean_degree
from scripts.difficulty.solver import to_neighbor_lists, win_rate

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent.parent
DIFFICULTIES = ("easy", "medium", "hard")

SEARCH_GAMES = 80  # while bracketing and bisecting
FINAL_GAMES = 350  # to tell the last two or three candidates apart
TARGET_GAMES = 2000  # for the classic reference itself

# Wall-clock caps per evaluation. A handful of high-degree boards play a game a
# thousand times slower than the rest, and without these a few rows hold every
# worker for hours while 400 quick ones queue behind them. Hitting a cap costs
# precision on the board that hit it and nothing anywhere else; the games
# actually played are recorded per row so the report can show which are thin.
SEARCH_SECONDS = 4.0
FINAL_SECONDS = 10.0

# And a ceiling on the whole row, so termination never depends on the search
# converging. A row that runs out stops with the best mine count it has found
# and says so, which is a far better outcome than one board holding the sweep.
ROW_SECONDS = 45.0

# How close to the target a win rate must land to count as calibrated.
#
# This is set by what the sampling can actually resolve, not by ambition: a
# win rate measured over FINAL_GAMES games carries a standard error of about
# two and a half points near 50%, and on a 480-cell board one more mine moves
# the true rate by only one or two. Chasing a tighter figure would be fitting
# noise -- and four points of win probability is still far below what a player
# could tell apart, which is the thing the number is for.
TOLERANCE = 0.04

# A board where most cells have an identical twin cannot be calibrated at all:
# each mine landing alone in a pair forces a coin flip, so the win rate is
# 0.5**mines whatever the density. Those boards are given a plain density and
# recorded as uncalibrated rather than being chased to a target they cannot
# reach. See the triakis note in AGENTS.md.
# The density band the search stays inside. Every board calibrated so far has
# landed between about 4 and 38 per cent, and below that band the solver is
# slower by orders of magnitude for no useful answer.
MIN_DENSITY = 0.03
MAX_DENSITY = 0.45

UNCALIBRATABLE_SHARE = 0.5
FALLBACK_DENSITY = {"easy": 0.13, "medium": 0.16, "hard": 0.20}

# The classic board is the yardstick, so it keeps the classic mine counts.
PINNED_MINES = {"square": {"easy": 10, "medium": 40, "hard": 99}}


def _seed(mode: str, difficulty: str) -> int:
    return zlib.crc32(f"{mode}/{difficulty}".encode()) & 0x7FFFFFFF


def _build(builder: str, args: list):
    return P._JSON_BUILDERS[builder](*args)


def targets(jobs: int = 1) -> dict[str, float]:
    """Measure the classic board -- the yardstick everything else matches."""
    out = {}
    for difficulty in DIFFICULTIES:
        board = P.build_board("square", difficulty)
        rate, abandoned, _played = win_rate(
            to_neighbor_lists(board.adjacency),
            board.mine_count,
            TARGET_GAMES,
            _seed("square", difficulty),
        )
        out[difficulty] = rate
        print(
            f"target {difficulty:6s} {len(board.adjacency):3d} cells "
            f"{board.mine_count:3d} mines -> {rate:.3f} ({abandoned} abandoned)",
            flush=True,
        )
    return out


def calibrate_row(args: tuple) -> dict:
    """Find the mine count whose win rate matches the target."""
    mode, difficulty, builder, board_args, target = args
    started = time.time()
    board = _build(builder, board_args)
    neighbors = to_neighbor_lists(board.adjacency)
    n = len(neighbors)
    seed = _seed(mode, difficulty)
    twins = indistinguishable_cells(board.adjacency)

    row = {
        "mode": mode,
        "difficulty": difficulty,
        "builder": builder,
        "cells": n,
        "meanDegree": round(mean_degree(board.adjacency), 3),
        "indistinguishable": twins,
        "target": round(target, 4),
    }

    if mode in PINNED_MINES:
        # The classic board defines the target; calibrating it against itself
        # would only let sampling noise walk it off 10/40/99.
        mines = PINNED_MINES[mode][difficulty]
        rate, _, _ = win_rate(neighbors, mines, FINAL_GAMES, seed, seconds=FINAL_SECONDS)
        row.update(
            mines=mines,
            density=round(mines / n, 4),
            winRate=round(rate, 4),
            calibrated=True,
            reason="the reference board, pinned to the classic mine counts",
            seconds=round(time.time() - started, 1),
        )
        return row

    if twins > UNCALIBRATABLE_SHARE * n:
        mines = max(1, round(FALLBACK_DENSITY[difficulty] * n))
        rate, _, _ = win_rate(neighbors, mines, SEARCH_GAMES, seed, seconds=SEARCH_SECONDS)
        row.update(
            mines=mines,
            density=round(mines / n, 4),
            winRate=round(rate, 4),
            calibrated=False,
            reason="most cells have an indistinguishable twin, so the win rate "
            "is 0.5**mines at any density",
            seconds=round(time.time() - started, 1),
        )
        return row

    row_deadline = started + ROW_SECONDS

    def out_of_time() -> bool:
        return time.time() > row_deadline

    def rate_at(mines: int, games: int) -> float:
        # one seed for every evaluation, so the noise is common across mine
        # counts and the measured curve stays monotone enough to bracket
        cap = SEARCH_SECONDS if games <= SEARCH_GAMES else FINAL_SECONDS
        value, abandoned, played = win_rate(neighbors, mines, games, seed, seconds=cap)
        if abandoned:
            row["abandoned"] = row.get("abandoned", 0) + abandoned
        row["leastGames"] = min(row.get("leastGames", games), played)
        return value

    # 1. bracket the crossing, within a sane density band.
    #
    # The band is not a guard rail on the answer, it is one on the search: at a
    # few per cent the opening click floods most of the board and leaves a
    # frontier of hundreds of components, which is the most expensive thing
    # this solver can be asked to evaluate. No board calibrates anywhere near
    # there, so walking down into it pays the worst cost for an answer that is
    # never used.
    lo, hi = max(1, int(MIN_DENSITY * n)), min(n - 1, int(MAX_DENSITY * n))
    guess = max(lo, min(hi, round(0.15 * n)))
    rate = rate_at(guess, SEARCH_GAMES)
    if rate > target:
        lo = guess
        step = max(1, guess // 2)
        while lo < hi and not out_of_time():
            probe = min(hi, lo + step)
            if rate_at(probe, SEARCH_GAMES) <= target:
                hi = probe
                break
            lo = probe
            step *= 2
    else:
        hi = guess
        step = max(1, guess // 2)
        while hi > lo and not out_of_time():
            probe = max(lo, hi - step)
            if rate_at(probe, SEARCH_GAMES) > target:
                lo = probe
                break
            hi = probe
            step *= 2

    # 2. bisect down to a handful of candidates
    while hi - lo > 2 and not out_of_time():
        mid = (lo + hi) // 2
        if rate_at(mid, SEARCH_GAMES) > target:
            lo = mid
        else:
            hi = mid

    # 3. walk to the crossing with the bigger sample.
    #
    # The bracket above is measured on few games, and near the crossing one
    # mine moves the win rate by only a point or two -- less than that sample's
    # own noise -- so bisecting alone lands a few mines out. Re-measure
    # properly and step by however many mines the local slope says the gap is
    # worth, which converges in two or three tries instead of scanning.
    best = None
    seen: dict[int, float] = {}
    mines = max(1, min(n - 2, (lo + hi) // 2))
    for _ in range(6):
        if out_of_time() and best is not None:
            break
        if mines not in seen:
            seen[mines] = rate_at(mines, FINAL_GAMES)
        value = seen[mines]
        if best is None or abs(value - target) < abs(best[1] - target):
            best = (mines, value)
        if abs(value - target) <= TOLERANCE:
            break
        if len(seen) >= 2:
            lowest, highest = min(seen), max(seen)
            span = max(1, highest - lowest)
            slope = (seen[lowest] - seen[highest]) / span
        else:
            slope = 0.015  # a fair guess: about a point and a half per mine
        step = round((value - target) / max(slope, 0.003))
        step = max(-8, min(8, int(step)))
        if step == 0:
            step = 1 if value > target else -1
        nxt = max(1, min(n - 2, mines + step))
        if nxt in seen and abs(nxt - mines) <= 1:
            break
        mines = nxt

    # 4. if the walk stopped short, look at the immediate neighbours.
    #
    # A slope-guided step can stride straight over the right answer where the
    # curve is steep -- on a 42-cell board one mine is two and a half points of
    # density, so the rate falls off a cliff and the walk lands either side of
    # the count that fits. Only runs when the walk missed, so it costs nothing
    # on the boards that converged.
    if abs(best[1] - target) > TOLERANCE and not out_of_time():
        for mines in range(max(1, best[0] - 2), min(n - 1, best[0] + 2) + 1):
            if mines in seen or out_of_time():
                continue
            seen[mines] = value = rate_at(mines, FINAL_GAMES)
            if abs(value - target) < abs(best[1] - target):
                best = (mines, value)
    mines, rate = best
    row.update(
        mines=mines,
        density=round(mines / n, 4),
        winRate=round(rate, 4),
        calibrated=abs(rate - target) <= TOLERANCE,
        seconds=round(time.time() - started, 1),
    )
    if not row["calibrated"]:
        row["reason"] = (
            "no integer mine count lands within tolerance; this is the closest"
        )
    return row


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--jobs", type=int, default=max(1, mp.cpu_count() - 1))
    parser.add_argument("--geometry", default=str(HERE / "geometry.json"))
    parser.add_argument("--out", default=str(HERE / "calibration.jsonl"))
    parser.add_argument("--only", default="", help="comma-separated modes")
    options = parser.parse_args()

    geometry = json.loads(Path(options.geometry).read_text())
    reference = targets()
    (HERE / "targets.json").write_text(json.dumps(reference, indent=2) + "\n")

    done: set[tuple[str, str]] = set()
    out_path = Path(options.out)
    if out_path.exists():
        for line in out_path.read_text().splitlines():
            if line.strip():
                row = json.loads(line)
                done.add((row["mode"], row["difficulty"]))
        print(f"resuming: {len(done)} rows already done")

    wanted = set(options.only.split(",")) if options.only else None
    jobs = []
    for mode, spec in sorted(geometry.items()):
        if wanted and mode not in wanted:
            continue
        for difficulty in DIFFICULTIES:
            if (mode, difficulty) in done:
                continue
            jobs.append((
                mode,
                difficulty,
                spec["builder"],
                spec["args"][difficulty]["args"],
                reference[difficulty],
            ))
    # the slowest rows first, so the pool does not finish with one long tail
    jobs.sort(key=lambda j: -DIFFICULTIES.index(j[1]))
    print(f"{len(jobs)} rows to calibrate on {options.jobs} workers")

    started = time.time()
    with out_path.open("a") as handle:
        if options.jobs == 1:
            results = map(calibrate_row, jobs)
        else:
            pool = mp.Pool(options.jobs)
            results = pool.imap_unordered(calibrate_row, jobs)
        for i, row in enumerate(results, 1):
            handle.write(json.dumps(row) + "\n")
            handle.flush()
            flag = "" if row.get("calibrated") else "  UNCALIBRATED"
            print(
                f"[{i}/{len(jobs)}] {row['mode']:24s} {row['difficulty']:6s} "
                f"{row['cells']:4d} cells deg {row['meanDegree']:5.2f} "
                f"-> {row['mines']:3d} mines ({row['density']:.1%}) "
                f"win {row['winRate']:.3f} vs {row['target']:.3f} "
                f"[{row['seconds']}s]{flag}",
                flush=True,
            )
    print(f"\ndone in {(time.time() - started) / 60:.1f} min -> {out_path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
