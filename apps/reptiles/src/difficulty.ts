// How hard a level is, measured by playing it.
//
// Two things make a board hard here, and neither is its size.
//
// **Turning.** Laying 16 squares is a row of identical drags, laying 24 Cairo
// pentagons is a turn of the tray between nearly every one, in 15° steps. So a
// simulated player lays the board the level was cut from, the way a sensible
// person would: at each step, of the tiles it could snap down right now, the
// one that needs the fewest presses of rotate and flip from how the tray is
// held — so it lays everything one way round before turning, wherever the
// board lets it, turning whichever way round is shorter (there is a control
// for each direction) — breaking ties by staying near the last tile. What it
// has to press along the way is the measure. A press is weighted by how fine
// its step is — √(90°/step): one 90° turn is 1, a 15° turn about 2.4 — since
// telling apart orientations 15° apart is harder than 90° apart, and finding
// the right one takes more looking.
//
// **Traps.** A person lays tiles where they fit the edge, and on a square board
// a tile that fits is right; on the Spectre's most are not, and a wrong one
// can sit there looking right until the board will not close. So as the
// player lays the board, every corner of what is still open is looked at once,
// as it first opens, with every tile that fits there, every way: the board's
// own tile, a tile the board can still be finished round (`fine` — six
// triangles where a hexagon was), or a wrong one. The share of fits that are
// wrong is the measure.
//
// The score is the weighted turning per tile, plus `TRAPS` times the share of
// wrong fits, plus a little for each extra tile kind (choosing from the tray)
// and for size.

import measured from "./difficulty.json";
import type { Frontier } from "./geometry/frontier";
import {
  centroidOf,
  posed,
  selfTurns,
  spotKey,
  turnsOntoPieces,
  type Piece,
  type XY,
} from "./geometry/shape";
import type { Level } from "./levels";
import { Puzzle, type Fit } from "./puzzle";

/** What the simulated player pressed laying the board. */
export interface Turning {
  tiles: number;
  kinds: number;
  /** Rotate presses the simulated player made, and flips. */
  presses: number;
  flips: number;
  /** The weighted turning per tile: presses × √(90°/step), plus flips. */
  turning: number;
}

/** The tiles that fit the open corners as the board is laid. */
export interface Traps {
  /** Open corners looked at, each once, as it first opens. */
  corners: number;
  /** Fits at them, every tile every way that fits, the board's own among them. */
  fits: number;
  /** Fits not the board's own that the board can still be finished round. */
  fine: number;
  /** Fits it cannot: shown wrong at once (a corner the tile opens takes
   * nothing), or hidden — the dead end that shows only later. */
  seen: number;
  hidden: number;
}

export interface Measure extends Turning, Traps {
  /** The level's difficulty score (`scoreFrom`). */
  score: number;
}

export type Band = "easy" | "medium" | "hard";

/** How much the share of wrong fits weighs against turning: a board every
 * fit of which were wrong would score as much as `TRAPS` presses of 90° a
 * tile. Set so that, by their medians, periodic tilings measure easier than
 * the spirals and the spirals than the aperiodic ones (whose turning alone
 * put them the other way round). */
export const TRAPS = 1.25;

/** Where the bands split: below `MEDIUM` is easy, from `HARD` on is hard. Set
 * from the anchors the game was designed around — every flag-transitive level,
 * 4.8² and 3³.4² easy (laying the same tile over and over, every fit right),
 * the Cairo pentagonal and V4.6.12 hard (turning or flipping all the way), and
 * the Spectre and the hat hard (most fits wrong) — and pinned by the tests. */
export const MEDIUM = 0.85;
export const HARD = 1.45;

export function band(score: number): Band {
  return score < MEDIUM ? "easy" : score < HARD ? "medium" : "hard";
}

/** The score without the traps: turning, kinds and size. Cheap enough to
 * rank thousands of colourings by (`chooseColourings`). */
export function turningScoreOf(m: Turning): number {
  return m.turning + 0.15 * (m.kinds - 1) + m.tiles / 200;
}

/** The share of fits that are wrong, 0 to 1. */
export function wrongShare(t: Pick<Traps, "fits" | "seen" | "hidden">): number {
  return t.fits ? (t.seen + t.hidden) / t.fits : 0;
}

/** A level's score from its turning and its traps. */
export function scoreFrom(m: Turning, t: Pick<Traps, "fits" | "seen" | "hidden">): number {
  return turningScoreOf(m) + TRAPS * wrongShare(t);
}

/** What `npm run difficulty` writes for each board. */
export interface Stored {
  score: number;
  presses: number;
  flips: number;
  fits: number;
  seen: number;
  hidden: number;
}

/** Every level's measure, as `npm run difficulty` last wrote it. */
const MEASURED = measured as Record<string, Stored>;

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

interface Cell {
  pieces: Piece[];
  kind: number;
  rot: number;
  flip: boolean;
  key: string;
}

/** Which kind, turn and side each of the level's own cells is. */
function reference(level: Level): Cell[] {
  const { ring, tiles } = level;
  return level.cells.map((pieces) => {
    const key = spotKey(ring, pieces);
    for (let kind = 0; kind < tiles.length; kind++) {
      const direct = turnsOntoPieces(tiles[kind]!, pieces);
      if (direct.length) return { pieces, kind, rot: direct[0]!, flip: false, key };
      const mirrored = { ring, pieces: posed(tiles[kind]!, { rot: 0, flip: true, t: ring.zero }) };
      const flipped = turnsOntoPieces(mirrored, pieces);
      if (flipped.length) return { pieces, kind, rot: flipped[0]!, flip: true, key };
    }
    throw new Error(`${level.key}: a cell matches no tile kind`);
  });
}

/** The simulated player's game: what it pressed, and the order it laid the
 * board's own cells in. */
function play(level: Level): Turning & { order: Cell[] } {
  const { ring, turn } = level;
  const puzzle = new Puzzle(level);
  const period = level.tiles.map((t) => selfTurns(t).find((k) => k > 0) ?? ring.n);
  const left = reference(level).map((c) => ({
    ...c,
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
  const order: Cell[] = [];
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
      if (spot && spotKey(ring, spot) === c.key) best = { i, cost, dist, k };
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
    order.push(c);
    left.splice(i, 1);
  }

  const tiles = level.cells.length;
  const kinds = level.tiles.length;
  const degrees = turn === 0 ? 90 : (360 * turn) / ring.n;
  const turning = (presses * Math.sqrt(90 / degrees) + flips) / tiles;
  return { tiles, kinds, presses, flips, turning, order };
}

/** The turning part of a level's measure, without the traps. */
export function measureTurning(level: Level): Turning {
  const { order: _, ...m } = play(level);
  return m;
}

/** The score without the traps (`turningScoreOf`). */
export function turningScore(level: Level): number {
  return turningScoreOf(measureTurning(level));
}

/** How far the search that tells a fine fit from a wrong one goes: this many
 * tiles laid, the board's own round it already down. A fit that needs more
 * of the board taken up and laid again than that counts as wrong — to a
 * person it is. */
const FILL_BUDGET = 40;

/**
 * The traps on the way: the simulated player lays the board's own tiles in
 * `order`, and each corner of what is still open is looked at as it first
 * opens — every tile, every way, that fits there (`Puzzle.fitsAt`). A fit not
 * the board's own is
 * - **seen** wrong when a corner it opens takes nothing at all;
 * - **fine** when the board can still be finished round it: with the rest of
 *   the board's own tiles laid round it, the hole they leave fills within
 *   `FILL_BUDGET` tiles (six triangles where a hexagon was, a flipped
 *   hexagon of Ammann–Beenker's rhombi);
 * - else **hidden**: it looks as right as any, and is not.
 */
export function measureTraps(level: Level, order: readonly Cell[] = play(level).order): Traps {
  const { ring } = level;
  const puzzle = new Puzzle(level);
  const own = new Set(order.map((c) => c.key));
  const down = new Set<string>();
  const looked = new Set<string>();
  const out: Traps = { corners: 0, fits: 0, fine: 0, seen: 0, hidden: 0 };

  /** Whether `f` fills, within `left.n` tiles: the corner with the fewest
   * fits first, so one nothing fits ends it at once. */
  const fill = (f: Frontier, left: { n: number }): boolean => {
    if (f.empty) return true;
    if (left.n-- <= 0) return false;
    let best: Fit[] | null = null;
    for (const c of f.corners.values()) {
      const here = puzzle.fitsAt(ring.toXY(c), f);
      if (!best || here.length < best.length) best = here;
      if (best.length === 0) return false;
    }
    return best!.some((fit) => fill(f.cover(fit.spot), left));
  };

  const look = (): void => {
    const f = puzzle.uncovered;
    for (const [k, corner] of f.corners) {
      if (looked.has(k)) continue;
      looked.add(k);
      const fits = puzzle.fitsAt(ring.toXY(corner));
      // a corner part-way along a side of the board's own tile there
      if (fits.length === 0) continue;
      out.corners++;
      out.fits += fits.length;
      for (const fit of fits) {
        if (own.has(spotKey(ring, fit.spot))) continue;
        const after = f.cover(fit.spot);
        const opened = fit.spot
          .flatMap((p) => p.verts)
          .filter((v) => after.corners.has(ring.key(v)));
        if (opened.some((v) => puzzle.fitsAt(ring.toXY(v), after).length === 0)) {
          out.seen++;
          continue;
        }
        let rest = after;
        for (const c of order)
          if (!down.has(c.key) && rest.fits(c.pieces)) rest = rest.cover(c.pieces);
        if (fill(rest, { n: FILL_BUDGET })) out.fine++;
        else out.hidden++;
      }
    }
  };

  look();
  for (const c of order) {
    puzzle.place(c.kind, c.pieces, c.rot, c.flip);
    down.add(c.key);
    look();
  }
  return out;
}

/** A level's whole measure: its turning, its traps, and the score. Seconds on
 * the hat's boards, so the game reads `difficulty.json` instead. */
export function measure(level: Level): Measure {
  const { order, ...turning } = play(level);
  const traps = measureTraps(level, order);
  return { ...turning, ...traps, score: scoreFrom(turning, traps) };
}
