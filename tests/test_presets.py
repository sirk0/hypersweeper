"""The difficulty convention, pinned.

Every board's easy/medium/hard should be about the size of the classic
Minesweeper board at that difficulty, and carry a mine count calibrated so it
plays at about the same win probability. The calibration itself is a
multi-hour simulation and does not belong in a sub-second suite -- what belongs
here is the part that *stays* true afterwards: the sizes, and the fact that the
list of boards which cannot meet the convention is short, known, and does not
quietly grow.

Sizes are read from ``data/conformance.json``, which the exporter regenerates
from the real builders, so this checks the shipped numbers rather than
rebuilding 480 boards.
"""

from __future__ import annotations

import json
from pathlib import Path

import pytest

from minesweeper.boards.core import DIFFICULTIES

DATA = Path(__file__).resolve().parent.parent / "data"
CLASSIC = {"easy": 81, "medium": 256, "hard": 480}
BAND = 0.15

# Boards whose cell count is not ours to choose. Both kinds are a property of
# the geometry rather than a preset someone forgot to tune, and both were
# checked by enumerating what the builder can actually produce near the target
# rather than assumed.
#
#   * no size knob at all -- a sphere is 60 cells because that is what the
#     solid is;
#   * a knob that steps over the target. The fractals move by whole
#     substitution steps (the carpet goes 64, 512, 4096); the polyhedra grow
#     quadratically, so `cube_board` offers 54 then 96 around an 81 target and
#     `tetrahedron_board` 64 then 100; `hextri_board` is 54 then 96.
#
# Anything else outside the band is a bug in the preset, not a new exception:
# add it here only after checking the builder genuinely cannot land closer.
FIXED_GEOMETRY = {
    "sphere", "spheretri", "c80", "c180", "snubdodec",
    "rhombicosidodeca", "truncicosidodeca",
}
COARSE_GEOMETRY = {"sphinx", "chair", "carpet", "pentaflake", "gosper", "cubeframe"}
EXEMPT = FIXED_GEOMETRY | COARSE_GEOMETRY

# Single rows where the size band loses to a bar that matters more. Keyed by
# (mode, difficulty) so exempting one board does not quietly exempt its other
# two difficulties.
EXEMPT_ROWS = {
    # 3.4.6.4 has a six-cell domain, so its windows near 81 cells are 78 and
    # 107 -- and the 78 one is not a symmetric patch of the tiling, which
    # `test_flat_board_is_symmetric` rightly refuses. The board-shape
    # convention outranks the size band, so this board is 107 cells.
    ("rhombitrihex", "easy"),
}

# Everything else is held to two bars rather than one. A single +-15% rule
# would be a lie: a tiling's window moves by whole domains (4 to 12 cells at a
# time), the polyhedra grow quadratically, and a wrapped board also has to keep
# its topology and its cell shape -- so a handful of boards genuinely cannot
# land inside 15% and 96 cells against a target of 81 is the closest the
# builder offers. What must stay true is that no board is *far* off, and that
# the near-misses stay a handful.
OUTER_BAND = 0.25
NEAR_MISS_ALLOWANCE = 0.05  # at most this share may sit outside +-15%


def _conformance() -> dict:
    return json.loads((DATA / "conformance.json").read_text())["modes"]


def _modes() -> list[str]:
    return sorted(_conformance())


class TestBoardSizes:
    @pytest.mark.parametrize("difficulty", DIFFICULTIES)
    def test_no_board_is_far_from_the_classic_size(self, difficulty):
        """A board's size is a difficulty, not a per-tiling accident.

        This is the hard bar: the old presets had easy boards of 16 cells and
        hard boards of 1152, and nothing like that may come back.
        """
        conformance = _conformance()
        target = CLASSIC[difficulty]
        strays = {
            mode: stats[difficulty]["cellCount"]
            for mode, stats in conformance.items()
            if mode not in EXEMPT
            and (mode, difficulty) not in EXEMPT_ROWS
            and not (
                target * (1 - OUTER_BAND)
                <= stats[difficulty]["cellCount"]
                <= target * (1 + OUTER_BAND)
            )
        }
        assert strays == {}, (
            f"{difficulty} boards outside +-{OUTER_BAND:.0%} of {target}: {strays}"
        )

    @pytest.mark.parametrize("difficulty", DIFFICULTIES)
    def test_nearly_every_board_hits_the_classic_size(self, difficulty):
        """And this is the soft one: the near-misses stay a handful, so the
        convention cannot rot one board at a time."""
        conformance = _conformance()
        target = CLASSIC[difficulty]
        counts = [
            stats[difficulty]["cellCount"]
            for mode, stats in conformance.items()
            if mode not in EXEMPT and (mode, difficulty) not in EXEMPT_ROWS
        ]
        misses = [
            n for n in counts
            if not (target * (1 - BAND) <= n <= target * (1 + BAND))
        ]
        assert len(misses) <= NEAR_MISS_ALLOWANCE * len(counts), (
            f"{len(misses)} of {len(counts)} {difficulty} boards are outside "
            f"+-{BAND:.0%} of {target} cells"
        )

    def test_the_exemptions_are_all_real_modes(self):
        """A stale name here would silently exempt nothing."""
        modes = set(_modes())
        assert EXEMPT <= modes, f"unknown modes exempted: {EXEMPT - modes}"
        assert {m for m, _ in EXEMPT_ROWS} <= modes, "unknown row exempted"

    def test_the_classic_board_is_the_classic_board(self):
        """Everything else is calibrated against it, so it does not drift."""
        square = _conformance()["square"]
        assert (square["easy"]["cellCount"], square["easy"]["mineCount"]) == (81, 10)
        assert (square["medium"]["cellCount"], square["medium"]["mineCount"]) == (
            256, 40,
        )
        assert (square["hard"]["cellCount"], square["hard"]["mineCount"]) == (480, 99)

    @pytest.mark.parametrize("difficulty", DIFFICULTIES)
    def test_difficulty_is_not_decided_by_a_single_density(self, difficulty):
        """The whole point of the calibration: boards differ in degree, so
        they must differ in density. If every board landed on one number, the
        calibration has been bypassed and the flat convention is back."""
        conformance = _conformance()
        densities = {
            stats[difficulty]["mineCount"] / stats[difficulty]["cellCount"]
            for stats in conformance.values()
        }
        assert max(densities) - min(densities) > 0.05

    @pytest.mark.parametrize("difficulty", DIFFICULTIES)
    def test_every_board_is_playable(self, difficulty):
        conformance = _conformance()
        for mode, stats in conformance.items():
            cells = stats[difficulty]["cellCount"]
            mines = stats[difficulty]["mineCount"]
            assert 0 < mines < cells, f"{mode}/{difficulty}: {mines} of {cells}"


class TestDifficultyOrdering:
    @pytest.mark.parametrize("mode", _modes())
    def test_harder_is_never_smaller_and_never_sparser(self, mode):
        """Easy -> medium -> hard must not go backwards on both axes at once:
        a harder board is bigger, or denser, or both."""
        stats = _conformance()[mode]
        for lower, upper in (("easy", "medium"), ("medium", "hard")):
            a, b = stats[lower], stats[upper]
            bigger = b["cellCount"] > a["cellCount"]
            denser = (
                b["mineCount"] / b["cellCount"] > a["mineCount"] / a["cellCount"]
            )
            assert bigger or denser, (
                f"{mode}: {upper} is neither bigger nor denser than {lower}"
            )
