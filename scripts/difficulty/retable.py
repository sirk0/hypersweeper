"""Regenerate the one test table the suite cannot derive.

``TestWrappedArchimedean.test_cell_counts`` in ``tests/test_boards.py`` is a
hand-written mode -> (easy, medium, hard) cell-count table -- deliberately, so
that a window change has to be looked at rather than silently absorbed
(AGENTS.md calls it out). Rewriting 101 rows by hand after a resize is not
looking at it, though, so this regenerates the literal and the diff is what
gets reviewed.

Run after ``apply`` and the exporters:
``PYTHONPATH=. python -m scripts.difficulty.retable``
"""

from __future__ import annotations

import re
from pathlib import Path

from minesweeper.boards.core import DIFFICULTIES
from minesweeper.boards.presets import build_board

ROOT = Path(__file__).resolve().parent.parent.parent
TEST = ROOT / "tests" / "test_boards.py"


def main() -> int:
    text = TEST.read_text()
    match = re.search(
        r"(    def test_cell_counts\(self\):\n        counts = \{\n)(.*?)(        \}\n)",
        text,
        re.S,
    )
    if not match:
        print("!! could not find the counts table")
        return 1
    head, body, tail = match.groups()
    modes = re.findall(r'^\s*"(\w+)": \(', body, re.M)
    lines = []
    for mode in modes:
        counts = tuple(
            len(build_board(mode, difficulty).adjacency)
            for difficulty in DIFFICULTIES
        )
        lines.append(f'            "{mode}": {counts},\n')
    TEST.write_text(text[: match.start()] + head + "".join(lines) + tail
                    + text[match.end():])
    print(f"rewrote {len(lines)} rows in {TEST}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
