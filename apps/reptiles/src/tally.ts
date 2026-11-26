// The stars a tiling asks for, counted the way its page lays it out: a board
// is one card, a tile set (plain, a matching rule, a colouring, a jigsaw, a
// vertex rule) another, and each earns the best of the levels it is in — a
// board the most stars of any tiles on it, a tile set the most on any board.
// A tiling's stars are the sum of its cards', not of every board by every
// tile set: each board and each tile set is a puzzle of its own, but no one
// pair of them is anything more, so none is asked for.
//
// Pure — the stars come in as a function (progress.ts's `starsFor`) — so the
// tests can hand in their own.

import { boardKeys, markedOf, type Level } from "./levels";

/** The level a board and a marking make: `<marking>` on the first board,
 * `<marking>-<n>` on the n-th. */
export const keyOf = (marking: string, board: number): string =>
  board === 1 ? marking : `${marking}-${board}`;

/** The boards `marking` (a plain or marked first board's key) is laid on. */
export function boardsOf(marking: string): Set<number> {
  return new Set(
    boardKeys(marking).map((k) => (k === marking ? 1 : Number(k.slice(marking.length + 1)))),
  );
}

type StarsFor = (key: string) => number;

/** The tile sets of the tiling `plain` is the first board of: plain first,
 * then its markings. */
const setsOf = (plain: Level): Level[] => [plain, ...markedOf(plain.key)];

/** A board's stars: the most earned on board `n` of `plain`'s tiling, with
 * any of its tile sets laid on it. */
export function boardStars(plain: Level, n: number, stars: StarsFor): number {
  let best = 0;
  for (const m of setsOf(plain))
    if (boardsOf(m.key).has(n)) best = Math.max(best, stars(keyOf(m.key, n)));
  return best;
}

/** A tile set's stars: the most earned with `marking` (a plain or marked
 * first board) on any board it is laid on. */
export function markingStars(marking: Level, stars: StarsFor): number {
  return Math.max(0, ...boardKeys(marking.key).map(stars));
}

/** What a tiling's card counts: its levels (every board by every tile set
 * laid on it), its boards and tile sets, and the stars — its boards' and its
 * tile sets' summed — of `max` to earn. A tiling of one level opens it
 * straight away, with no page of cards: it counts that level's stars, of 3. */
export function tilingTally(
  plain: Level,
  stars: StarsFor,
): { levels: number; stars: number; max: number; boards: number; sets: number } {
  const sets = setsOf(plain);
  const boards = [...boardsOf(plain.key)];
  const levels = sets.reduce((sum, m) => sum + boardKeys(m.key).length, 0);
  if (levels === 1) return { levels, stars: stars(plain.key), max: 3, boards: 1, sets: 1 };
  const earned =
    boards.reduce((sum, n) => sum + boardStars(plain, n, stars), 0) +
    sets.reduce((sum, m) => sum + markingStars(m, stars), 0);
  return {
    levels,
    stars: earned,
    max: 3 * (boards.length + sets.length),
    boards: boards.length,
    sets: sets.length,
  };
}

/** Whether a level has a board kept half-covered (saved.ts), by key. */
type KeptFor = (key: string) => boolean;

/** Whether board `n` of `plain`'s tiling is in progress with any of its tile
 * sets laid on it: its card is washed green. */
export function boardInPlay(plain: Level, n: number, kept: KeptFor): boolean {
  return setsOf(plain).some((m) => boardsOf(m.key).has(n) && kept(keyOf(m.key, n)));
}

/** Whether `marking` (a plain or marked first board) is in progress on any
 * board it is laid on. */
export function markingInPlay(marking: Level, kept: KeptFor): boolean {
  return boardKeys(marking.key).some(kept);
}

/** Whether any level of the tiling `plain` is the first board of is in
 * progress: its card in Tilings is washed green. */
export function tilingInPlay(plain: Level, kept: KeptFor): boolean {
  return setsOf(plain).some((m) => markingInPlay(m, kept));
}

/** How strongly a card is tinted for `stars` of `max`, as a card of one level
 * is for its 0 to 3 stars: none for nothing, 3 for everything, 2 from two
 * thirds of the way, else 1. */
export function tierOf(stars: number, max: number): 0 | 1 | 2 | 3 {
  if (stars <= 0 || max <= 0) return 0;
  if (stars >= max) return 3;
  return 3 * stars >= 2 * max ? 2 : 1;
}
