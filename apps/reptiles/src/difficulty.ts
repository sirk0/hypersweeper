// How hard a level is, measured by playing it.
//
// What makes a board hard here is not its size so much as how much turning it
// asks for: laying 16 squares is a row of identical drags, laying 24 Cairo
// pentagons is a turn of the tray between nearly every one, in 15° steps. So a
// simulated player lays the board the level was cut from, the way a sensible
// person would: at each step, of the tiles it could snap down right now, the
// one that needs the fewest presses of rotate and flip from how the tray is
// held — so it lays everything one way round before turning, wherever the
// board lets it, turning whichever way round is shorter (there is a control
// for each direction) — breaking ties by staying near the last tile. What it has to
// press along the way is the measure.
//
// A press is weighted by how fine its step is — √(90°/step): one 90° turn is
// 1, a 15° turn about 2.4 — since telling apart orientations 15° apart is
// harder than 90° apart, and finding the right one takes more looking. The
// score is that weighted turning per tile, plus a little for each extra tile
// kind (choosing from the tray) and for size.

import measured from "./difficulty.json";
import {
  centroidOf,
  posed,
  selfTurns,
  spotKey,
  turnsOnto,
  type Piece,
  type XY,
} from "./geometry/shape";
import type { Level } from "./levels";
import { Puzzle } from "./puzzle";

export interface Measure {
  tiles: number;
  kinds: number;
  /** Rotate presses the simulated player made, and flips. */
  presses: number;
  flips: number;
  /** The weighted turning per tile: presses × √(90°/step), plus flips. */
  turning: number;
  /** The level's difficulty score: `turning` plus a little for kinds and size. */
  score: number;
}

export type Band = "easy" | "medium" | "hard";

/** Where the bands split: below `MEDIUM` is easy, from `HARD` on is hard. Set
 * from the anchors the game was designed around — every flag-transitive level,
 * 4.8² and 3³.4² easy (laying the same tile over and over), the Cairo
 * pentagonal and V4.6.12 hard (turning or flipping all the way) — and pinned
 * by the tests. */
export const MEDIUM = 0.45;
export const HARD = 1.0;

export function band(score: number): Band {
  return score < MEDIUM ? "easy" : score < HARD ? "medium" : "hard";
}

/** Every level's measure, as `npm run difficulty` last wrote it. */
const MEASURED = measured as Record<string, { score: number; presses: number; flips: number }>;

/** A level's difficulty score, as measured. */
export function scoreOf(key: string): number {
  const m = MEASURED[key];
  if (!m) throw new Error(`${key} has not been measured: run npm run difficulty`);
  return m.score;
}

/** A level's band. */
export function bandOf(key: string): Band {
  return band(scoreOf(key));
}

/** How many bars a band shows: one, two, three. */
export const BARS: Record<Band, number> = { easy: 1, medium: 2, hard: 3 };

/** Which kind, turn and side each of the level's own cells is. */
function reference(level: Level): { pieces: Piece[]; kind: number; rot: number; flip: boolean }[] {
  const { ring, tiles } = level;
  return level.cells.map((pieces) => {
    const verts = pieces.map((p) => p.verts);
    for (let kind = 0; kind < tiles.length; kind++) {
      const direct = turnsOnto(tiles[kind]!, verts);
      if (direct.length) return { pieces, kind, rot: direct[0]!, flip: false };
      const mirrored = { ring, pieces: posed(tiles[kind]!, { rot: 0, flip: true, t: ring.zero }) };
      const flipped = turnsOnto(mirrored, verts);
      if (flipped.length) return { pieces, kind, rot: flipped[0]!, flip: true };
    }
    throw new Error(`${level.key}: a cell matches no tile kind`);
  });
}

export function measure(level: Level): Measure {
  const { ring, turn } = level;
  const puzzle = new Puzzle(level);
  const period = level.tiles.map((t) => selfTurns(t).find((k) => k > 0) ?? ring.n);
  const key = (pieces: Piece[]): string => spotKey(ring, pieces);
  const left = reference(level).map((c) => ({
    ...c,
    key: key(c.pieces),
    at: centroidOf(c.pieces.map((p) => p.verts.map((v) => ring.toXY(v)))),
  }));
  const reach = 1e-3;

  /** Presses from tray turn `t` until kind `kind` sits at `rot`, the shorter
   * way round — there is a control for each direction — as a signed count
   * (negative: the other way); null never. */
  const pressesTo = (t: number, kind: number, rot: number): number | null => {
    const p = period[kind]!;
    const at = (k: number): boolean => (((t + k * turn - rot) % p) + p) % p === 0;
    if (turn === 0) return at(0) ? 0 : null;
    for (let k = 0; k * turn < ring.n; k++) {
      if (at(k)) return k;
      if (at(-k)) return -k;
    }
    return null;
  };

  let t = 0;
  let flip = false;
  let presses = 0;
  let flips = 0;
  let last: XY | null = null;
  while (left.length > 0) {
    let best: { i: number; cost: number; dist: number; k: number } | null = null;
    left.forEach((c, i) => {
      const k = pressesTo(t, c.kind, c.rot);
      if (k === null) return;
      const cost = Math.abs(k) + (c.flip !== flip ? 1 : 0);
      const dist = last ? Math.hypot(c.at[0] - last[0], c.at[1] - last[1]) : c.at[0] + c.at[1];
      if (best && (cost > best.cost || (cost === best.cost && dist >= best.dist))) return;
      // can it be snapped down there now, held that way?
      const spot = puzzle.snap(c.kind, c.at, reach, t + k * turn, c.flip);
      if (spot && key(spot) === c.key) best = { i, cost, dist, k };
    });
    if (!best) throw new Error(`${level.key}: the simulated player got stuck`);
    const { i, k } = best as { i: number; k: number };
    const c = left[i]!;
    presses += Math.abs(k);
    if (c.flip !== flip) flips++;
    t = (((t + k * turn) % ring.n) + ring.n) % ring.n;
    flip = c.flip;
    puzzle.place(c.kind, c.pieces, c.rot, c.flip);
    last = c.at;
    left.splice(i, 1);
  }

  const tiles = level.cells.length;
  const kinds = level.tiles.length;
  const degrees = turn === 0 ? 90 : (360 * turn) / ring.n;
  const turning = (presses * Math.sqrt(90 / degrees) + flips) / tiles;
  const score = turning + 0.15 * (kinds - 1) + tiles / 200;
  return { tiles, kinds, presses, flips, turning, score };
}
