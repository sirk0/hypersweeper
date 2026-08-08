"""The reference solver: probability-optimal play over an arbitrary cell graph.

Playing minesweeper *optimally* is intractable -- the optimal move depends on
the whole game tree, not just the current position -- so "optimal strategy"
here means the standard probability-optimal solver: deduce everything that is
forced, and when nothing is, open the cell least likely to be a mine. Every
board is calibrated against the classic square board measured with this same
solver, which is what makes the comparison meaningful; the absolute win rates
are a property of the solver, the *differences* between boards are not.

The one part that needs care is counting frontier configurations. The naive
approach -- enumerate every assignment of the hidden cells touching a number --
is exponential, and blows up on the boundary-free surfaces (torus, Klein
bottle) where a single constraint component can span a hundred cells. Instead
``_component_counts`` runs a dynamic program over a bandwidth-ordered variable
sequence, memoised on the *live* constraint sums: constraints already closed
are determined and constraints not yet started are zero, so neither needs to be
in the key, and what remains is small on any planar frontier. Per-cell
marginals come from a forward and a backward pass over that DP rather than one
pass per cell.
"""

from __future__ import annotations

import random
import time
from collections import deque
from math import comb, isclose
from typing import Iterable, Sequence

# A constraint is (positions, target): exactly ``target`` of those cells are
# mines. Positions index into the caller's variable list.
Constraint = tuple[Sequence[int], int]

# How many memoised states the frontier DP may build before giving up on a
# position.
#
# This bounds *time*, not memory: a DP allowed to grow to millions of states
# does not run out of room, it runs for minutes, and a wall-clock cap cannot
# help because it can only be checked between games. One such position holds a
# calibration worker for hours while hundreds of ordinary boards queue behind
# it. The ceiling is set low deliberately -- classic hard plays identically at
# 2,500 as at 2,000,000, never coming close -- so it costs nothing except on
# the genuinely pathological frontiers of the high-degree boards, where the
# games it abandons are counted and reported rather than guessed at.
DEFAULT_BUDGET = 4_000


class BudgetExceeded(Exception):
    """The frontier DP outgrew its node budget.

    Raised rather than silently approximated: a board whose calibration rests
    on guessed probabilities is worse than one flagged as uncalibrated.
    """


def _bfs_order(n: int, cons: Sequence[Constraint]) -> list[int]:
    """Order variables so constraints close early.

    A breadth-first walk of the graph "these two cells appear in the same
    number's constraint" keeps mutually-constrained cells adjacent in the
    ordering, which is what keeps the live-constraint state -- and so the DP --
    small. On a planar frontier this is a curve, and the state stays tiny.
    """
    by_var: list[list[int]] = [[] for _ in range(n)]
    for ci, (positions, _) in enumerate(cons):
        for v in positions:
            by_var[v].append(ci)
    order: list[int] = []
    seen = [False] * n
    for start in range(n):
        if seen[start]:
            continue
        seen[start] = True
        queue = deque([start])
        while queue:
            v = queue.popleft()
            order.append(v)
            for ci in by_var[v]:
                for w in cons[ci][0]:
                    if not seen[w]:
                        seen[w] = True
                        queue.append(w)
    return order


def _convolve(a: Sequence[int], b: Sequence[int]) -> list[int]:
    """Combine two mine-count distributions (polynomial multiplication)."""
    out = [0] * (len(a) + len(b) - 1)
    for i, x in enumerate(a):
        if not x:
            continue
        for j, y in enumerate(b):
            if y:
                out[i + j] += x * y
    return out


def _component_counts(
    n: int, cons: Sequence[Constraint], budget: int
) -> tuple[list[int], list[list[int]]]:
    """Count the satisfying assignments of one constraint component.

    Returns ``(totals, per_var)`` where ``totals[m]`` is the number of
    assignments using exactly ``m`` mines, and ``per_var[i][m]`` the number of
    those in which variable ``i`` is a mine.
    """
    order = _bfs_order(n, cons)
    pos = [0] * n
    for p, v in enumerate(order):
        pos[v] = p

    positions = [sorted(pos[v] for v in vs) for vs, _ in cons]
    targets = [k for _, k in cons]
    first = [ps[0] for ps in positions]
    last = [ps[-1] for ps in positions]
    nc = len(cons)

    # constraints containing each position, and how many of a constraint's
    # positions still lie ahead of it (what the feasibility bound needs)
    at: list[list[int]] = [[] for _ in range(n)]
    ahead: list[dict[int, int]] = [{} for _ in range(nc)]
    for ci, ps in enumerate(positions):
        for rank, p in enumerate(ps):
            at[p].append(ci)
            ahead[ci][p] = len(ps) - rank - 1
    # constraints started but not finished at each boundary -- the DP state
    live: list[tuple[int, ...]] = [
        tuple(ci for ci in range(nc) if first[ci] < p <= last[ci]) for p in range(n + 1)
    ]

    def step(p: int, state: tuple[int, ...], val: int) -> tuple[int, ...] | None:
        """Assign ``val`` at position ``p``; return the next state or None."""
        sums = dict(zip(live[p], state))
        for ci in at[p]:
            total = sums.get(ci, 0) + val
            # too many already, or too few even if every remaining one is a
            # mine; at a constraint's last position ahead is 0, so this is
            # also the exact-equality check that closes it
            if total > targets[ci] or total + ahead[ci][p] < targets[ci]:
                return None
            sums[ci] = total
        return tuple(sums[ci] for ci in live[p + 1])

    # forward: ways to reach each state, by mines used so far
    forward: list[dict[tuple[int, ...], list[int]]] = [{} for _ in range(n + 1)]
    forward[0][()] = [1]
    nodes = 0
    for p in range(n):
        nodes += len(forward[p])
        if nodes > budget:
            raise BudgetExceeded(f"frontier DP exceeded {budget} nodes")
        for state, counts in forward[p].items():
            for val in (0, 1):
                nxt = step(p, state, val)
                if nxt is None:
                    continue
                bucket = forward[p + 1].setdefault(nxt, [])
                if len(bucket) < len(counts) + val:
                    bucket.extend([0] * (len(counts) + val - len(bucket)))
                for m, c in enumerate(counts):
                    if c:
                        bucket[m + val] += c

    totals = forward[n].get((), [])
    if not totals:
        return [], [[] for _ in range(n)]

    # backward: ways to finish from each *reachable* state, by mines still to
    # come. Only states the forward pass reached can matter, so we reuse them.
    backward: list[dict[tuple[int, ...], list[int]]] = [{} for _ in range(n + 1)]
    backward[n][()] = [1]
    for p in range(n - 1, -1, -1):
        for state in forward[p]:
            acc: list[int] = []
            for val in (0, 1):
                nxt = step(p, state, val)
                if nxt is None:
                    continue
                tail = backward[p + 1].get(nxt)
                if not tail:
                    continue
                if len(acc) < len(tail) + val:
                    acc.extend([0] * (len(tail) + val - len(acc)))
                for m, c in enumerate(tail):
                    if c:
                        acc[m + val] += c
            if acc:
                backward[p][state] = acc

    # a variable's marginal is prefix x {it is a mine} x suffix
    per_var: list[list[int]] = [[] for _ in range(n)]
    for p in range(n):
        acc: list[int] = []
        for state, prefix in forward[p].items():
            nxt = step(p, state, 1)
            if nxt is None:
                continue
            tail = backward[p + 1].get(nxt)
            if not tail:
                continue
            part = _convolve(prefix, tail)
            if len(acc) < len(part) + 1:
                acc.extend([0] * (len(part) + 1 - len(acc)))
            for m, c in enumerate(part):
                if c:
                    acc[m + 1] += c
        per_var[order[p]] = acc
    return totals, per_var


def frontier_probabilities(
    n_vars: int,
    cons: Sequence[Constraint],
    remaining_mines: int,
    n_outside: int,
    budget: int = DEFAULT_BUDGET,
    deadline: float | None = None,
) -> tuple[list[float], float | None]:
    """Exact mine probability for each frontier cell, and for an outside cell.

    ``cons`` constrains ``n_vars`` frontier cells; ``n_outside`` cells are
    touched by no number at all and ``remaining_mines`` mines are unaccounted
    for. Every configuration is weighted by ``C(n_outside, leftover)`` -- the
    number of ways the mines it does not place can fill the outside -- which is
    what stops a frontier reading as more or less likely than it is.
    """
    if n_vars == 0:
        if n_outside == 0:
            return [], None
        return [], remaining_mines / n_outside

    # split into connected components: independent, so counted separately and
    # recombined, which is what keeps the DP's state space manageable
    parent = list(range(n_vars))

    def find(a: int) -> int:
        while parent[a] != a:
            parent[a] = parent[parent[a]]
            a = parent[a]
        return a

    for vs, _ in cons:
        for v in vs[1:]:
            ra, rb = find(vs[0]), find(v)
            if ra != rb:
                parent[ra] = rb
    groups: dict[int, list[int]] = {}
    for v in range(n_vars):
        groups.setdefault(find(v), []).append(v)

    comps: list[tuple[list[int], list[int], list[list[int]]]] = []
    for root, members in groups.items():
        # A frontier can split into a hundred components whose mine-count
        # polynomials run to hundreds of terms, and counting and recombining
        # those is the part of a move that stays expensive however tightly the
        # DP itself is bounded. Checked here so a caller's clock still means
        # something *within* a single move, not merely between them.
        if deadline is not None and time.monotonic() > deadline:
            raise BudgetExceeded("out of time")
        local = {v: i for i, v in enumerate(members)}
        sub = [([local[v] for v in vs], k) for vs, k in cons if find(vs[0]) == root]
        totals, per_var = _component_counts(len(members), sub, budget)
        if not totals:
            raise ValueError("frontier has no satisfying assignment")
        comps.append((members, totals, per_var))

    combined = [1]
    for _, totals, _ in comps:
        combined = _convolve(combined, totals)

    def weigh(dist: Sequence[int]) -> float:
        return float(
            sum(
                c * comb(n_outside, remaining_mines - u)
                for u, c in enumerate(dist)
                if c and 0 <= remaining_mines - u <= n_outside
            )
        )

    total_weight = weigh(combined)
    if total_weight == 0.0:
        raise ValueError("no configuration places the remaining mines")

    # Each component's cells are weighted by every *other* component's mine
    # distribution. Recomputing that product per component is quadratic in the
    # number of components, and a large high-degree board can leave fifty of
    # them -- which is how a single position came to take minutes. Prefix and
    # suffix products give the same thing in linear time.
    prefix = [[1]]
    for _, totals_j, _ in comps:
        prefix.append(_convolve(prefix[-1], totals_j))
    suffix = [[1]]
    for _, totals_j, _ in reversed(comps):
        suffix.append(_convolve(suffix[-1], totals_j))
    suffix.reverse()

    # Weighing a variable's distribution against the other components could be
    # done by convolving the two and summing, but that is quadratic per
    # variable and a big frontier has hundreds of them -- enough to make a
    # single move take tens of seconds. Since
    #     weigh(a * others) = sum_m a[m] * sum_u others[u] * W[m + u]
    # the inner sum depends only on the component, so fold it once into a gain
    # table and each variable becomes a linear dot product.
    weights = [
        comb(n_outside, remaining_mines - k) if 0 <= remaining_mines - k <= n_outside
        else 0
        for k in range(n_vars + 1)
    ]

    probs = [0.0] * n_vars
    for ti, (members, _, per_var) in enumerate(comps):
        if deadline is not None and time.monotonic() > deadline:
            raise BudgetExceeded("out of time")
        others = _convolve(prefix[ti], suffix[ti + 1])
        gain = [0.0] * (n_vars + 1)
        for m in range(len(gain)):
            acc = 0
            for u, c in enumerate(others):
                if c and m + u < len(weights):
                    acc += c * weights[m + u]
            gain[m] = acc
        for i, v in enumerate(members):
            dist = per_var[i]
            if not dist:
                continue
            probs[v] = (
                sum(c * gain[m] for m, c in enumerate(dist) if c and m < len(gain))
                / total_weight
            )

    outside_prob = None
    if n_outside:
        acc = sum(
            c * comb(n_outside, remaining_mines - u) * (remaining_mines - u)
            for u, c in enumerate(combined)
            if c and 0 <= remaining_mines - u <= n_outside
        )
        outside_prob = acc / n_outside / total_weight
    return probs, outside_prob


class Outcome:
    """What one played game came to."""

    __slots__ = ("won", "guesses", "moves")

    def __init__(self, won: bool, guesses: int, moves: int) -> None:
        self.won = won
        self.guesses = guesses
        self.moves = moves


def play(
    neighbors: Sequence[Sequence[int]],
    mine_count: int,
    rng: random.Random,
    budget: int = DEFAULT_BUDGET,
    deadline: float | None = None,
) -> Outcome:
    """Play one game to a win or a loss, mirroring ``minesweeper.game``.

    ``neighbors[i]`` lists the indices adjacent to cell ``i``. Mines are placed
    after the opening click, which is held clear of mines *and* of any cell
    next to one, so the first reveal always floods -- the same rule, including
    the too-dense fallback, as ``Game._place_mines``.
    """
    n = len(neighbors)
    start = rng.randrange(n)
    forbidden = {start, *neighbors[start]}
    pool = [i for i in range(n) if i not in forbidden]
    if len(pool) < mine_count:
        pool = [i for i in range(n) if i != start]
    mines = set(rng.sample(pool, mine_count))
    numbers = [sum(1 for j in neighbors[i] if j in mines) for i in range(n)]

    revealed = bytearray(n)
    flagged = bytearray(n)
    revealed_count = 0
    remaining = mine_count
    goal = n - mine_count

    def flood(i: int) -> None:
        nonlocal revealed_count
        stack = [i]
        while stack:
            c = stack.pop()
            if revealed[c] or flagged[c]:
                continue
            revealed[c] = 1
            revealed_count += 1
            if numbers[c] == 0:
                stack.extend(neighbors[c])

    flood(start)
    guesses = 0
    moves = 1
    while revealed_count < goal:
        # Checked here, not only between games: a single position on a big
        # high-degree board can take minutes by itself, so a caller's time cap
        # means nothing unless a game already in progress can be cut short.
        if deadline is not None and time.monotonic() > deadline:
            raise BudgetExceeded("out of time")
        # 1. everything forced by a single number
        progress = True
        while progress and revealed_count < goal:
            progress = False
            for i in range(n):
                if not revealed[i]:
                    continue
                hidden = [j for j in neighbors[i] if not revealed[j] and not flagged[j]]
                if not hidden:
                    continue
                need = numbers[i] - sum(1 for j in neighbors[i] if flagged[j])
                if need == 0:
                    for j in hidden:
                        flood(j)
                    progress = True
                elif need == len(hidden):
                    for j in hidden:
                        flagged[j] = 1
                        remaining -= 1
                    progress = True
        if revealed_count >= goal:
            break

        # 2. the frontier, exactly
        cons: list[Constraint] = []
        index: dict[int, int] = {}
        for i in range(n):
            if not revealed[i]:
                continue
            hidden = [j for j in neighbors[i] if not revealed[j] and not flagged[j]]
            if not hidden:
                continue
            for j in hidden:
                index.setdefault(j, len(index))
            need = numbers[i] - sum(1 for j in neighbors[i] if flagged[j])
            cons.append(([index[j] for j in hidden], need))
        cells = [0] * len(index)
        for cell, k in index.items():
            cells[k] = cell
        n_outside = sum(
            1 for i in range(n) if not revealed[i] and not flagged[i] and i not in index
        )
        probs, outside_prob = frontier_probabilities(
            len(index), cons, remaining, n_outside, budget, deadline
        )

        # 3. act on certainties before guessing
        certain = False
        for k, p in enumerate(probs):
            if isclose(p, 0.0, abs_tol=1e-12):
                flood(cells[k])
                certain = True
            elif isclose(p, 1.0, abs_tol=1e-12):
                flagged[cells[k]] = 1
                remaining -= 1
                certain = True
        if certain:
            moves += 1
            continue

        # 4. guess the least likely mine
        best, best_p = None, 2.0
        for k, p in enumerate(probs):
            if p < best_p:
                best, best_p = cells[k], p
        if outside_prob is not None and (best is None or outside_prob < best_p - 1e-12):
            # a cell no number touches -- prefer one with fewer neighbours, as
            # a corner constrains least and so is likeliest to open cleanly
            best = min(
                (
                    i
                    for i in range(n)
                    if not revealed[i] and not flagged[i] and i not in index
                ),
                key=lambda i: len(neighbors[i]),
            )
            best_p = outside_prob
        if best is None:
            break
        guesses += 1
        moves += 1
        if best in mines:
            return Outcome(False, guesses, moves)
        flood(best)
    return Outcome(True, guesses, moves)


def to_neighbor_lists(adjacency: dict) -> list[list[int]]:
    """Turn a board's ``{cell: neighbours}`` map into index lists."""
    cells = list(adjacency)
    index = {c: i for i, c in enumerate(cells)}
    return [[index[x] for x in adjacency[c]] for c in cells]


def win_rate(
    neighbors: Sequence[Sequence[int]],
    mine_count: int,
    games: int,
    seed: int,
    budget: int = DEFAULT_BUDGET,
    seconds: float | None = None,
) -> tuple[float, int, int]:
    """Play up to ``games`` games; report ``(win rate, abandoned, played)``.

    A game the DP could not finish within its node budget is abandoned rather
    than guessed at; the count is the caller's cue to distrust the rate.

    ``seconds`` caps the wall clock. Most boards play hundreds of games a
    second, but a few high-degree ones are a thousand times slower, and without
    a cap those rows hold a calibration worker for hours while the rest of the
    sweep waits on them. Stopping early spends the precision where it can
    actually be bought, and ``played`` comes back so the caller can report the
    thinner sample rather than pretend it was a full one.
    """
    rng = random.Random(seed)
    wins = 0
    played = 0
    abandoned = 0
    deadline = None if seconds is None else time.monotonic() + seconds
    for _ in range(games):
        try:
            if play(neighbors, mine_count, rng, budget, deadline).won:
                wins += 1
            played += 1
        except (BudgetExceeded, ValueError):
            abandoned += 1
        if deadline is not None and time.monotonic() > deadline:
            break
    return (wins / played if played else 0.0), abandoned, played


def mean_degree(adjacency: dict[object, Iterable[object]]) -> float:
    """Average neighbour count -- the axis the old flat densities ignored."""
    return sum(len(tuple(v)) for v in adjacency.values()) / len(adjacency)
