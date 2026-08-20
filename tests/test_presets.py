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
    "spheretri", "c80", "c180", "snubdodec",
    "rhombicosidodeca", "truncicosidodeca",
}
COARSE_GEOMETRY = {"sphinx", "chair", "carpet", "pentaflake", "gosper"}
EXEMPT = FIXED_GEOMETRY | COARSE_GEOMETRY

# Single rows where the size band loses to a bar that matters more. Keyed by
# (mode, difficulty) so exempting one board does not quietly exempt its other
# two difficulties.
EXEMPT_ROWS = {
    # Kisrhombille packs 24 cells into a domain two tiles wide, so the
    # smallest tube or strip of it with enough tiles around to *close* as one
    # -- rather than crumple into a twisted lozenge, which three domains
    # around does -- is six domains, and that is already 144 cells. Reading as
    # the surface outranks the size band (`resize.MIN_RING`).
    ("cylkisrhombille", "easy"),
    ("mobiuskisrhombille", "easy"),
    # The same arithmetic on a donut and a bottle, from the other bar: a tile
    # may not span more than a quarter of a direction that closes, or it is
    # drawn as a flat plate through the axis rather than a facet of a tube
    # (`resize.MAX_TILE_TURN`). Kisrhombille's tallest triangle is a third of
    # its domain, so the tube needs two domain rows, the ring needs four, and
    # 4x2 of a 24-cell domain is 192 cells with nothing smaller legal. Snub
    # hexagonal is the same story on an 18-cell domain: 4x2 is 144, and one
    # row across gave its widest tile 0.43 of the turn.
    ("toruskisrhombille", "easy"),
    ("kleinkisrhombille", "easy"),
    ("torussnubhex", "easy"),
    # And once more from `resize.MIN_WRAP_DOMAINS`, on the tiling whose ring
    # knob counts *half*-domains. A Klein bottle glues the three-brick basket
    # weave's seam through a glide, so the odd ring counts the search can offer
    # step two halves -- one whole domain -- at a time, and four whole domains
    # round the ring is the fewest that reads as a loop rather than a crumpled
    # sheet. Nine halves of a 12-cell domain, two domains deep, is 108 cells,
    # and the next window down is two and a half domains round: what shipped
    # before, and what drew as gaps and slivers.
    ("kleinbasketweave3", "easy"),
    # A brick cube's only knob is the blocks per face side, and each block
    # holds a whole bond -- two bricks for the stacked bond and the basket
    # weave, three for the three-brick weave -- so the ladder is 6 * bricks *
    # n**2 and the two-brick bonds step 48 -> 108 -> 192 straight past an
    # 81-cell target. 108 is the closer of the two by a long way (48 is barely
    # half the target), and there is nothing in between: a face is square, so n
    # is one number rather than two, and half a block is not a block. The
    # three-brick weave needs no exemption -- its 18 n**2 ladder puts 72 inside
    # the band -- which is the whole difference between the rows.
    ("cubestackedbond", "easy"),   # 48 or 108
    ("cubebasketweave", "easy"),   # 48 or 108
    # The stepped bipyramid's terraces have to run all the way to a single
    # cube at each apex, or it is a slab rather than a diamond, and that fixes
    # `levels` to (base + 1) / 2 on an odd base. The solid then steps 38 -> 64
    # -> 102 cells, and 102 is the closest thing to 81 that is actually a
    # bipyramid.
    ("steppedbipyramid", "easy"),
    # The dodecahedron's tile is a pentagon fanned into 5 triangles from its
    # own centre, and its only size knob subdivides that fan further --
    # `frequency**2` per wedge, so the board steps 60 -> 240 -> 540 cells.
    # `frequency` cannot go below 1 (that is the plain fan itself, no
    # subdivision at all), so 60 is the closest an 81-cell target can be hit;
    # 240 and 540 both land inside the ordinary band against 256 and 480.
    ("dodecahedron", "easy"),
    # The Catalan solids, whose ladder is the same shape as the dodecahedron's
    # and much coarser: a solid of F faces cut `frequency` ways along each edge
    # is F * frequency**2 cells, so the rungs are F, 4F, 9F, 16F -- the second
    # is already four times the first. Against an easy target of 81 that leaves
    # a 12-face solid choosing between 48 and 108, a 24-face one between 24 and
    # 96, a 60-face one between 60 and 240, and a 120-face one between 120 and
    # 480. The rows below are the ones where neither rung lands within 25%; the
    # ones that miss only the inner band are counted against
    # NEAR_MISS_ALLOWANCE like every other near-miss.
    ("triakistetra", "easy"),      # 48 or 108
    ("rhombicdodeca", "easy"),     # 48 or 108
    ("disdyakisdodeca", "easy"),   # 48 or 192
    ("rhombictriaconta", "easy"),  # 30 or 120
    ("pentakisdodeca", "easy"),    # 60 or 240
    ("deltoidalhexeconta", "easy"),  # 60 or 240
    ("disdyakistriaconta", "easy"),  # 120 or 480
    ("disdyakistriaconta", "medium"),  # 120 or 480
    # ...and the triakis icosahedron's small rung is not merely small, it is
    # unplayable: at frequency 1 every one of its 60 triangles has an
    # indistinguishable twin (the two halves of a pyramid face share a closed
    # neighbourhood), exactly as the flat triakis tilings do, so the win rate
    # would be a coin flip per mine at any density. 240 is the first rung that
    # is a puzzle at all, and a board three times too big beats one that cannot
    # be played -- `resize` rules the small rung out on `metrics`, not on size.
    ("triakisicosa", "easy"),
    # The two chiral ones are coarser again, because a pentagon cannot be cut
    # into pentagons: the only subdivision fans each face into five
    # quadrilaterals first, so the very first step multiplies by five and the
    # ladder is 24 -> 120 -> 480 and 60 -> 300 -> 1200. Both of the pentagonal
    # icositetrahedron's small rows and both of the hexecontahedron's outer
    # ones are that step, not a preset left untuned.
    ("pentagonalicositetra", "easy"),    # 24 or 120
    ("pentagonalicositetra", "medium"),  # 120 or 480
    ("sphere", "easy"),                  # 60 or 300
    ("sphere", "hard"),                  # 300 or 1200
}

# Everything else is held to two bars rather than one. A single +-15% rule
# would be a lie: a tiling's window moves by whole domains (4 to 12 cells at a
# time), the polyhedra grow quadratically, and a wrapped board also has to keep
# its topology and its cell shape -- so a handful of boards genuinely cannot
# land inside 15% and 96 cells against a target of 81 is the closest the
# builder offers. What must stay true is that no board is *far* off, and that
# the near-misses stay a handful.
OUTER_BAND = 0.25
# At most this share may sit outside +-15%. Easy is the hardest target to hit:
# a tiling's window steps by a whole domain, which is 12-24 cells on several of
# them, and against a target of 81 that is a step of 15-30% -- so a board often
# has 84 and 96 to choose from and nothing between. The bar is set just above
# what those steps force, so it still catches the convention rotting.
#
# It went from 8% to 11% when `resize.MAX_TILE_TURN` arrived. That bar stops a
# single tile spanning more than a quarter of a direction that closes, and on a
# donut or a bottle the cheapest way to satisfy it is a second row of domains
# across the tube -- which doubles the step the *other* knob has to move in.
# Seven easy rows (`torusdeltoidal`, `torusfloret`, `torusrhombitrihex`,
# `torustrunctrihex` and their Klein counterparts) therefore go from 84 cells
# to 96 with nothing in between, and 96 against 81 is 18.5%. That is the step
# the geometry forces, not a preset drifting: every one of them was folded at
# 84 and is a surface at 96.
#
# It went from 11% to 12% when the Catalan solids arrived, for the same kind of
# reason: a 24-face solid's easy row has 24 and 96 to choose from and nothing
# between, so the triakis octahedron, the tetrakis hexahedron and the deltoidal
# icositetrahedron each land at 96. Their rows are inside the outer band, so
# they are counted here rather than exempted (see EXEMPT_ROWS).
NEAR_MISS_ALLOWANCE = 0.12


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


class TestWrappedWindowsDoNotFold:
    """No shipped wrapped board may hand one tile a big slice of a turn.

    A tile is drawn flat, so a tile spanning half of a direction that closes is
    a plate through that tube's axis rather than a facet of it -- which is what
    `torusbasketweave3` and `kleinbasketweave3` easy once shipped as, a broken
    ring of slabs, and what twenty more donut and bottle rows shipped as more
    mildly. Nothing else in the suite can see it: the topology is right (a fold
    is still a torus combinatorially) and every tile's own shape measures fine.

    The bar itself lives with the search that has to apply it
    (`resize.MAX_TILE_TURN`); this is the same rule read back off the shipped
    presets, so a hand-edited window cannot reintroduce the fold.
    """

    @pytest.mark.parametrize("difficulty", DIFFICULTIES)
    def test_no_tile_spans_more_than_a_quarter_of_a_closing_direction(self, difficulty):
        from scripts.difficulty.resize import (
            MAX_TILE_TURN,
            SPEC,
            TILE_TURN_SLACK,
            _closed_tube,
            _tile_turn,
        )

        presets = json.loads((DATA / "presets.json").read_text())["presets"]
        folded = {}
        for mode, spec in presets.items():
            builder = spec["builder"]
            # only the wrapped Archimedean builders: a plane has no seam, and
            # the plain surface builders count cells rather than domains, so
            # one tile is one step of the knob by construction
            if builder not in SPEC or not SPEC[builder].get("lead"):
                continue
            if builder == "archimedean_board":
                continue
            axes = (0, 1) if _closed_tube(builder) else (0,)
            turn = max(_tile_turn(SPEC[builder], spec["args"][difficulty], a)
                       for a in axes)
            if turn > MAX_TILE_TURN + TILE_TURN_SLACK:
                folded[mode] = round(turn, 3)
        assert folded == {}, (
            f"{difficulty} windows whose widest tile spans more than "
            f"{MAX_TILE_TURN:.0%} of a turn: {folded}"
        )

    # The rows whose tiling is too coarse to keep its facet step under the bar
    # at the classic size, and what they measure. A domain of a dozen cells has
    # only seven copies to spend on an 81-cell donut, and no arrangement of
    # seven is smooth; the alternative the search offered was a 216-cell "easy"
    # board, which is not an easier outcome than a chunky one. So these are
    # listed rather than fixed -- and listed exactly, so that a window drifting
    # further into the fold is still a failure.
    #
    # The two basket weaves are not among them any more, and not because their
    # windows moved: their bricks are thirds of a square block, and once the
    # block is drawn flat (`_straight_vertices`) the tube is a ring of whole
    # blocks rather than a ring of bricks a third the depth of the ones beside
    # them, so the step it measures is zero.
    CHUNKY = {
        ("torustriakis", "easy"): 0.259,
        ("torustriakis", "medium"): 0.259,
        ("kleintriakis", "easy"): 0.259,
        ("kleintriakis", "medium"): 0.259,
        ("kleintriakis", "hard"): 0.259,
        ("torustrunctrihex", "easy"): 0.227,
        ("kleintrunctrihex", "easy"): 0.227,
        ("torusherringbone", "easy"): 0.217,
        ("torustetrakis", "easy"): 0.217,
        ("kleintetrakis", "easy"): 0.217,
        ("torusrotatedhex", "easy"): 0.206,
    }

    @pytest.mark.parametrize("difficulty", DIFFICULTIES)
    def test_no_tile_cuts_a_chord_its_neighbours_stand_proud_of(self, difficulty):
        """...and the same fold seen from the side.

        The bar above asks how deep one tile cuts; this asks whether the tiles
        beside it cut as deep. Where they do the board is a prism and reads as
        one -- `torusstackedbond` easy is four equal facets round its tube,
        chunky and whole. Where they do not the shallow tiles stand proud of
        the deep ones and the surface reads as loose slabs, which is what
        `kleinbasketweave3` medium shipped as: bricks a third of a domain tall
        against bricks a whole domain tall, two domains round the tube, one
        course sagging 0.29 of the radius beside a course sagging 0.03.

        See `resize.MAX_FACET_STEP`; `CHUNKY` above is the measured list of
        rows whose tiling cannot do better at the classic size.
        """
        from scripts.difficulty.resize import (
            MAX_FACET_STEP,
            SPEC,
            TILE_TURN_SLACK,
            _closed_tube,
            _facet_step,
        )

        presets = json.loads((DATA / "presets.json").read_text())["presets"]
        stepped = {}
        for mode, spec in presets.items():
            builder = spec["builder"]
            if builder not in SPEC or not SPEC[builder].get("lead"):
                continue
            if builder == "archimedean_board":
                continue
            axes = (0, 1) if _closed_tube(builder) else (0,)
            step = max(_facet_step(SPEC[builder], spec["args"][difficulty], a)
                       for a in axes)
            if step > MAX_FACET_STEP + TILE_TURN_SLACK:
                stepped[mode] = round(step, 3)
        expected = {mode: value for (mode, level), value in self.CHUNKY.items()
                    if level == difficulty}
        assert stepped == expected, (
            f"{difficulty} windows whose deepest tile chord sits more than "
            f"{MAX_FACET_STEP:.0%} of the radius inside the shallowest: "
            f"{stepped}"
        )


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
