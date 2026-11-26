// A tiling's stars (src/tally.ts): each board's best and each tile set's
// best, summed — not every board by every tile set — and how deep a card is
// tinted for them.

import { describe, expect, it } from "vitest";
import { LEVELS, boardKeys, markedOf, type Level } from "../../src/levels";
import {
  boardInPlay,
  boardStars,
  boardsOf,
  keyOf,
  markingInPlay,
  markingStars,
  tierOf,
  tilingInPlay,
  tilingTally,
} from "../../src/tally";

const plains = LEVELS.filter((l) => !l.decor);
const setsOf = (plain: Level): Level[] => [plain, ...markedOf(plain.key)];
const levelsOf = (plain: Level): number =>
  setsOf(plain).reduce((sum, m) => sum + boardKeys(m.key).length, 0);

/** A tiling of several boards and several tile sets. */
const wide = plains.find((p) => boardKeys(p.key).length > 2 && markedOf(p.key).length > 1)!;

/** Stars from a table, 0 for anything not in it. */
const from =
  (table: Record<string, number>) =>
  (key: string): number =>
    table[key] ?? 0;

describe("a tiling's stars", () => {
  it("are found on a tiling of several boards and tile sets", () => {
    expect(wide).toBeTruthy();
  });

  it("are a board's best with any tiles on it, and a tile set's best on any board", () => {
    const marked = markedOf(wide.key)[0]!;
    const stars = from({ [wide.key]: 1, [marked.key]: 3, [keyOf(wide.key, 2)]: 2 });
    // board 1: plain (1) and marked (3); board 2: plain (2)
    expect(boardStars(wide, 1, stars)).toBe(3);
    expect(boardStars(wide, 2, stars)).toBe(2);
    expect(boardStars(wide, 3, stars)).toBe(0);
    // plain: boards 1 (1) and 2 (2); the marked tiles: board 1 (3)
    expect(markingStars(wide, stars)).toBe(2);
    expect(markingStars(marked, stars)).toBe(3);
  });

  it("are summed over the boards and the tile sets, of three each", () => {
    const marked = markedOf(wide.key)[0]!;
    const stars = from({ [wide.key]: 1, [marked.key]: 3, [keyOf(wide.key, 2)]: 2 });
    const t = tilingTally(wide, stars);
    const boards = boardKeys(wide.key).length;
    const sets = markedOf(wide.key).length + 1;
    expect(t).toEqual({
      levels: levelsOf(wide),
      stars: 3 + 2 + 2 + 3,
      max: 3 * (boards + sets),
      boards,
      sets,
    });
    // far fewer to earn than three for every board by every tile set
    expect(t.max).toBeLessThan(3 * t.levels);
  });

  it("are all earned once every board and every tile set has three, whatever the pairs", () => {
    // three stars on each board's plain level, and on each marking's first
    // board it is laid on: every card full, most pairs never played
    const table: Record<string, number> = {};
    for (const k of boardKeys(wide.key)) table[k] = 3;
    for (const m of markedOf(wide.key)) table[boardKeys(m.key)[0]!] = 3;
    const t = tilingTally(wide, from(table));
    expect(t.stars).toBe(t.max);
    expect(Object.keys(table).length).toBeLessThan(t.levels);
  });

  it("count a board only for the tile sets laid on it", () => {
    // a marking not laid on every board of its tiling, and a board it is not on
    const pairs = plains.flatMap((p) =>
      markedOf(p.key).flatMap((m) =>
        [...boardsOf(p.key)].filter((n) => !boardsOf(m.key).has(n)).map((n) => ({ p, m, n })),
      ),
    );
    expect(pairs.length).toBeGreaterThan(0);
    const { p, m, n } = pairs[0]!;
    // three stars with the marking everywhere it is laid do not reach board n
    const stars = from(Object.fromEntries(boardKeys(m.key).map((k) => [k, 3])));
    expect(markingStars(m, stars)).toBe(3);
    expect(boardStars(p, n, stars)).toBe(0);
  });

  it("are a single level's own, of three, on a tiling of one level", () => {
    const one = plains.find((p) => levelsOf(p) === 1)!;
    expect(one).toBeTruthy();
    expect(tilingTally(one, from({ [one.key]: 2 }))).toEqual({
      levels: 1,
      stars: 2,
      max: 3,
      boards: 1,
      sets: 1,
    });
  });
});

describe("a card's tint", () => {
  it("is 0 to 3: none, any, two thirds, all", () => {
    expect(tierOf(0, 30)).toBe(0);
    expect(tierOf(1, 30)).toBe(1);
    expect(tierOf(19, 30)).toBe(1);
    expect(tierOf(20, 30)).toBe(2);
    expect(tierOf(29, 30)).toBe(2);
    expect(tierOf(30, 30)).toBe(3);
    // a level's own stars, of three, are their own tint
    expect([0, 1, 2, 3].map((n) => tierOf(n, 3))).toEqual([0, 1, 2, 3]);
  });
});

describe("a level in progress", () => {
  /** Kept boards from a list of level keys. */
  const keptOf =
    (...keys: string[]) =>
    (key: string): boolean =>
      keys.includes(key);

  it("marks its board's card, its tile set's card and its tiling's card", () => {
    const marked = markedOf(wide.key).find((m) => boardsOf(m.key).has(2))!;
    expect(marked).toBeTruthy();
    // the marked tiles on board 2, half-covered
    const kept = keptOf(keyOf(marked.key, 2));
    expect(boardInPlay(wide, 2, kept)).toBe(true);
    expect(boardInPlay(wide, 1, kept)).toBe(false);
    expect(markingInPlay(marked, kept)).toBe(true);
    expect(markingInPlay(wide, kept)).toBe(false);
    expect(tilingInPlay(wide, kept)).toBe(true);
  });

  it("marks nothing where no board is kept, nor for another tiling's level", () => {
    const other = plains.find((p) => p !== wide)!;
    const kept = keptOf(other.key);
    expect([...boardsOf(wide.key)].some((n) => boardInPlay(wide, n, kept))).toBe(false);
    expect(setsOf(wide).some((m) => markingInPlay(m, kept))).toBe(false);
    expect(tilingInPlay(wide, kept)).toBe(false);
    expect(tilingInPlay(other, kept)).toBe(true);
  });
});
