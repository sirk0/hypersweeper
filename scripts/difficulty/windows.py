"""Keep the windows onto an aperiodic patch that play like the calibrated board.

The two substitution boards -- Penrose and the Spectre -- are a family rather
than one board: ``variant`` picks which window onto the grown patch a game is
played on (``minesweeper/boards/aperiodic.py`` ``_window``), so a finished game
followed by another is played somewhere else in the same tiling.

The mine count, though, is measured once, by ``calibrate``, on the centred
window. It does not automatically carry: a patch of an aperiodic tiling is not
statistically interchangeable with another patch of it at 81 cells. Measured
over 800 games a window, the Penrose easy board runs from a 0.76 win rate to a
0.98 against the centred window's 0.93 -- so a player dealt the wrong window
would lose one easy game in four where the calibrated board loses one in
fourteen, which is a different difficulty, not a different board. Penrose hard
runs from 0.25 to 0.66 against a target of 0.51.

So the windows are screened the way everything else here is: play each one with
the reference solver at the preset's own mine count, and keep those whose win
rate lands within ``TOLERANCE`` of the centred window's -- the same tolerance
the mine-count search is fitted to. The kept list goes to ``data/windows.json``
and both front-ends deal from it, so every board a player sees has been
measured. The centred window is always first in the list, so the patch this
game shipped with stays one of the boards dealt.

Sizing: ``CANDIDATES`` windows are measured per board, and between a third and
four-fifths of them land (28 to 79 of 96, measured) -- dozens of boards per mode
x difficulty, far more than a player will exhaust, and cheap enough to re-run
when a preset changes: the whole sweep is about 25 minutes on four cores. Rows
are appended to a JSONL as they land, so a re-run reuses what is already
measured (``--redo`` drops it instead).

Run after ``calibrate`` and ``apply``:
``PYTHONPATH=. python -m scripts.difficulty.windows [--jobs N]``
"""

from __future__ import annotations

import argparse
import json
import multiprocessing as mp
import zlib
from pathlib import Path

from minesweeper.boards._data import load
from minesweeper.boards.presets import _JSON_BUILDERS, _VARIANT_BUILDERS
from scripts.difficulty.calibrate import DIFFICULTIES, TOLERANCE
from scripts.difficulty.solver import to_neighbor_lists, win_rate

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent.parent

#: Windows measured per board. The pool a window is picked from is 51-1407
#: tiles deep depending on the board (see ``_window``), so this samples it
#: rather than exhausting it; what it has to be is enough that the kept share is
#: still dozens of boards.
CANDIDATES = 96

#: Games per window. The standard error at a 0.9 win rate is then about 1.1
#: points, comfortably finer than the 4-point band a window is judged against;
#: `calibrate` spends 350 on a mine count it is bisecting towards, but here
#: every measurement is final.
GAMES = 800

#: Wall-clock cap per window, the same idea as `calibrate`'s: a board whose
#: games are slow reports the thinner sample rather than holding a worker.
SECONDS = 60.0


def _rows(mode: str, difficulty: str) -> tuple[str, list]:
    """The builder name and preset arguments for one board."""
    spec = load("presets")["presets"][mode]
    return spec["builder"], spec["args"][difficulty]


def measure(job: tuple[str, str, int]) -> dict:
    """Play one window, and fingerprint it so duplicates can be spotted."""
    mode, difficulty, variant = job
    builder, args = _rows(mode, difficulty)
    board = _JSON_BUILDERS[builder](*args, variant)
    # Two variants can land on the same window (the stride wraps the pool), and
    # a duplicate must not count as another board. The cell ids are the window.
    fingerprint = zlib.crc32(" ".join(sorted(map(str, board.polygons))).encode())
    seed = zlib.crc32(f"{mode}/{difficulty}".encode())  # per board, not per window
    rate, abandoned, played = win_rate(
        to_neighbor_lists(board.adjacency),
        board.mine_count,
        GAMES,
        seed,
        seconds=SECONDS,
    )
    return {
        "mode": mode,
        "difficulty": difficulty,
        "variant": variant,
        "cells": len(board.polygons),
        "mines": board.mine_count,
        "winRate": round(rate, 4),
        "played": played,
        "abandoned": abandoned,
        "fingerprint": fingerprint,
    }


def varying_modes() -> list[str]:
    """The modes whose preset is a family of boards rather than one board."""
    presets = load("presets")["presets"]
    return [m for m, spec in presets.items() if spec["builder"] in _VARIANT_BUILDERS]


def accept(rows: list[dict]) -> dict:
    """The kept windows for one board, from every window measured for it.

    Variant 0 -- the centred window, the one `calibrate` measured the mine
    count on -- is the baseline and is always kept, so a board's list is never
    empty and the classic patch stays in the deal. A duplicate of a window
    already kept is dropped rather than counted twice.
    """
    by_variant = {row["variant"]: row for row in sorted(rows, key=lambda r: r["variant"])}
    baseline = by_variant[0]["winRate"]
    kept, seen = [], set()
    for variant, row in by_variant.items():
        if row["fingerprint"] in seen:
            continue
        if variant == 0 or abs(row["winRate"] - baseline) <= TOLERANCE:
            seen.add(row["fingerprint"])
            kept.append(variant)
    return {
        "baseline": baseline,
        "measured": len(by_variant),
        "windows": kept,
    }


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--jobs", type=int, default=max(1, mp.cpu_count() - 1))
    parser.add_argument("--candidates", type=int, default=CANDIDATES)
    parser.add_argument("--only", default="", help="comma-separated modes")
    parser.add_argument(
        "--redo", action="store_true", help="re-measure rather than reuse the checkpoint"
    )
    options = parser.parse_args()

    checkpoint = HERE / "windows.jsonl"
    done: dict[tuple[str, str, int], dict] = {}
    if checkpoint.exists() and not options.redo:
        for line in checkpoint.read_text().splitlines():
            if line.strip():
                row = json.loads(line)
                done[(row["mode"], row["difficulty"], row["variant"])] = row

    wanted = set(options.only.split(",")) if options.only else None
    modes = [m for m in varying_modes() if wanted is None or m in wanted]
    jobs = [
        (mode, difficulty, variant)
        for mode in modes
        for difficulty in DIFFICULTIES
        for variant in range(options.candidates)
        if (mode, difficulty, variant) not in done
    ]
    print(f"{len(done)} windows measured already, {len(jobs)} to go")

    if jobs:
        with checkpoint.open("a", encoding="utf-8") as out:
            with mp.Pool(options.jobs) as pool:
                for i, row in enumerate(pool.imap_unordered(measure, jobs), 1):
                    done[(row["mode"], row["difficulty"], row["variant"])] = row
                    out.write(json.dumps(row) + "\n")
                    out.flush()
                    if i % 25 == 0:
                        print(f"  {i}/{len(jobs)}", flush=True)

    out_modes: dict[str, dict] = {}
    for mode in varying_modes():
        for difficulty in DIFFICULTIES:
            rows = [
                row
                for (m, d, _), row in done.items()
                if m == mode and d == difficulty and row["variant"] < options.candidates
            ]
            if rows:
                out_modes.setdefault(mode, {})[difficulty] = accept(rows)

    payload = {
        "_comment": "Generated by scripts/difficulty/windows.py. Which windows "
        "onto each aperiodic patch a board may be dealt from: measured with the "
        "reference solver and kept only where the win rate lands within the "
        "calibration's tolerance of the centred window's, so every board dealt "
        "plays like the one the mine count was measured on. Variant 0 (the "
        "centred window) is always first.",
        "tolerance": TOLERANCE,
        "games": GAMES,
        "modes": out_modes,
    }
    path = ROOT / "data" / "windows.json"
    path.write_text(json.dumps(payload, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    for mode, rows in out_modes.items():
        for difficulty, row in rows.items():
            print(
                f"{mode}/{difficulty}: kept {len(row['windows'])} of "
                f"{row['measured']} windows (baseline {row['baseline']:.3f})"
            )
    print(f"wrote {path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
