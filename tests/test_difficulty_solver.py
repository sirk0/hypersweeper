"""The reference solver's frontier counting, checked against brute force.

The solver is offline tooling -- it produces the mine counts in
``data/presets.json`` and ships nothing -- but the numbers it produces are only
as good as its counting, and the counting is the part with a clever trick in
it. So the DP is pinned against the definition it optimises: enumerate every
assignment and count. Small instances only, so the suite stays sub-second; the
simulation itself never runs in CI.
"""

from __future__ import annotations

import random
from itertools import product

import pytest

from minesweeper.boards import square_board
from minesweeper.game import CellState, Game
from scripts.difficulty.solver import (
    BudgetExceeded,
    _component_counts,
    frontier_probabilities,
    opening_win_rate,
    play,
    to_neighbor_lists,
)


def brute_force(n, cons):
    """The definition: every assignment, counted."""
    totals: dict[int, int] = {}
    per_var: list[dict[int, int]] = [{} for _ in range(n)]
    for bits in product((0, 1), repeat=n):
        if any(sum(bits[v] for v in vs) != k for vs, k in cons):
            continue
        m = sum(bits)
        totals[m] = totals.get(m, 0) + 1
        for i, b in enumerate(bits):
            if b:
                per_var[i][m] = per_var[i].get(m, 0) + 1
    return totals, per_var


def as_dict(counts):
    return {m: c for m, c in enumerate(counts) if c}


def random_instance(rng, n):
    """A random constraint system with at least one solution."""
    truth = [rng.randint(0, 1) for _ in range(n)]
    cons = []
    for _ in range(rng.randint(1, max(1, n // 2))):
        size = rng.randint(1, min(4, n))
        vs = rng.sample(range(n), size)
        cons.append((vs, sum(truth[v] for v in vs)))
    return cons


class TestComponentCounts:
    @pytest.mark.parametrize("seed", range(40))
    def test_matches_brute_force(self, seed):
        rng = random.Random(seed)
        n = rng.randint(1, 9)
        cons = random_instance(rng, n)
        totals, per_var = _component_counts(n, cons, budget=1_000_000)
        want_totals, want_per_var = brute_force(n, cons)
        assert as_dict(totals) == want_totals
        for i in range(n):
            assert as_dict(per_var[i]) == want_per_var[i]

    def test_unsatisfiable_component_counts_nothing(self):
        # one cell cannot be both a mine and not
        totals, _ = _component_counts(1, [([0], 0), ([0], 1)], budget=1000)
        assert totals == []

    def test_budget_is_enforced(self):
        # a wide, weakly-constrained system has many live states
        n = 24
        cons = [([i, i + 1], 1) for i in range(n - 1)]
        with pytest.raises(BudgetExceeded):
            _component_counts(n, cons, budget=4)


class TestFrontierProbabilities:
    def test_a_certain_mine_and_a_certain_safe_cell(self):
        # "exactly 1 of {0}" pins cell 0; "exactly 0 of {1}" clears cell 1
        probs, outside = frontier_probabilities(2, [([0], 1), ([1], 0)], 1, 0)
        assert probs == [1.0, 0.0]
        assert outside is None

    def test_a_fifty_fifty(self):
        probs, _ = frontier_probabilities(2, [([0, 1], 1)], 1, 0)
        assert probs == [0.5, 0.5]

    def test_outside_cells_carry_their_share(self):
        # one mine, one frontier cell that may or may not hold it, 3 outside
        probs, outside = frontier_probabilities(1, [([0], 1)], 1, 3)
        assert probs == [1.0]
        assert outside == 0.0

    def test_outside_is_uniform_when_no_number_is_touched(self):
        probs, outside = frontier_probabilities(0, [], 3, 12)
        assert probs == []
        assert outside == pytest.approx(0.25)

    @pytest.mark.parametrize("seed", range(20))
    def test_probabilities_match_brute_force(self, seed):
        rng = random.Random(seed)
        n = rng.randint(1, 8)
        cons = random_instance(rng, n)
        n_outside = rng.randint(0, 4)
        remaining = rng.randint(0, n + n_outside)
        try:
            probs, _ = frontier_probabilities(n, cons, remaining, n_outside)
        except ValueError:
            return  # no configuration places that many mines; nothing to check
        totals, per_var = brute_force(n, cons)
        from math import comb

        weight = sum(
            c * comb(n_outside, remaining - m)
            for m, c in totals.items()
            if 0 <= remaining - m <= n_outside
        )
        if weight == 0:
            return
        for i in range(n):
            want = sum(
                c * comb(n_outside, remaining - m)
                for m, c in per_var[i].items()
                if 0 <= remaining - m <= n_outside
            )
            assert probs[i] == pytest.approx(want / weight)


class TestPlay:
    def test_the_solver_plays_by_the_games_own_rules(self):
        """Same board, same mines: the solver's fast game and ``Game`` agree
        on what a cell's number is and which cells a first click opens."""
        board = square_board(9, 9, 10)
        neighbors = to_neighbor_lists(board.adjacency)
        cells = list(board.adjacency)
        rng = random.Random(0)
        for _ in range(20):
            mines = set(rng.sample(range(81), 10))
            game = Game(board.adjacency, mine_positions={cells[i] for i in mines})
            start = next(
                i for i in range(81) if i not in mines
                and not any(j in mines for j in neighbors[i])
            )
            game.reveal(cells[start])
            opened = {
                i for i in range(81)
                if game.cell_state(cells[i]) is CellState.REVEALED
            }
            # replicate the flood over the index board
            seen: set[int] = set()
            stack = [start]
            numbers = [sum(1 for j in neighbors[i] if j in mines) for i in range(81)]
            while stack:
                c = stack.pop()
                if c in seen:
                    continue
                seen.add(c)
                if numbers[c] == 0:
                    stack.extend(neighbors[c])
            assert seen == opened

    def test_the_opening_click_always_floods(self):
        board = square_board(9, 9, 10)
        neighbors = to_neighbor_lists(board.adjacency)
        for seed in range(30):
            outcome = play(neighbors, 10, random.Random(seed))
            assert outcome.moves >= 1

    def test_a_board_with_one_mine_is_always_won(self):
        board = square_board(6, 6, 1)
        neighbors = to_neighbor_lists(board.adjacency)
        for seed in range(20):
            assert play(neighbors, 1, random.Random(seed)).won


class TestOpeningWinRate:
    """The floor under every calibrated mine count (``calibrate.opening_floor``).

    It answers one question -- how often the opening click alone finishes the
    board -- and the whole point of measuring it rather than assuming a density
    is that it depends on the board, so these pin the two ends of that.
    """

    def test_a_board_with_one_mine_is_often_a_walkover(self):
        # 36 cells and a single mine: the flood reveals the mine's neighbours
        # without expanding through them, so the whole board opens at a stroke
        # unless the mine sits where one of those neighbours has no other way
        # in -- against an edge, which is about half of the places it can land.
        board = square_board(6, 6, 1)
        neighbors = to_neighbor_lists(board.adjacency)
        assert opening_win_rate(neighbors, 1, 400, 1) > 0.3

    def test_the_classic_board_is_never_won_by_its_opening(self):
        board = square_board(9, 9, 10)
        neighbors = to_neighbor_lists(board.adjacency)
        assert opening_win_rate(neighbors, 10, 400, 1) == 0.0

    def test_it_falls_as_mines_are_added(self):
        board = square_board(8, 8, 1)
        neighbors = to_neighbor_lists(board.adjacency)
        rates = [opening_win_rate(neighbors, m, 300, 7) for m in (1, 2, 3, 4)]
        assert rates == sorted(rates, reverse=True)
        assert rates[0] > rates[-1]

    def test_it_agrees_with_the_games_own_flood(self):
        """A win here must be a win in ``Game``: same rule, same fallback."""
        board = square_board(5, 5, 1)
        cells = list(board.adjacency)
        neighbors = to_neighbor_lists(board.adjacency)
        rate = opening_win_rate(neighbors, 3, 300, 5)
        rng = random.Random(5)
        wins = 0
        for _ in range(300):
            game = Game(board.adjacency, 3, rng=random.Random(rng.randrange(1 << 30)))
            game.reveal(rng.choice(cells))
            wins += game.state is not CellState and game.state.name == "WON"
        # two independent samples of the same quantity, so they agree to within
        # sampling noise rather than exactly
        assert abs(wins / 300 - rate) < 0.1
