// A way to play a board through, move by move, as a person might: what the
// store videos follow (`scripts/make-store-videos.mts`, through the dev seam's
// `plan()` in main.ts).
//
// Each move is one of the board's own tiles, laid where a drop snaps it — a
// placement at an open corner (`Puzzle.fitsAt`), so dropping the tile with its
// middle on the spot's middle lands it there — and the presses that turn (and
// flip) the tray to hold it so. Laying only the board's own tiles never leads
// anywhere it cannot be finished from: whatever is left is covered by the rest
// of them. Of the tiles that could go next, the plan takes the one that needs
// the fewest presses near the last one laid, so the board fills as a sweep
// from its bottom-left corner and the tray turns every few tiles.
//
// Pure — no DOM. Floats only rank the candidates; every placement is exact.

import { centroidOf, posed, spotKey, turnsOntoPieces, type Piece, type XY } from "./geometry/shape";
import type { Level } from "./levels";
import { Puzzle } from "./puzzle";

/** One tile laid: first `flip` (a press of flip, if true), then `turns`
 * presses of rotate — anticlockwise for a positive count, clockwise for a
 * negative one — then the tile of `kind`, held at ζ^rot (mirrored if
 * `flipped`), dropped on `spot`. `rot` and `flipped` are how the tray is held
 * after the presses, for every tray tile. */
export interface Move {
  kind: number;
  flip: boolean;
  turns: number;
  rot: number;
  flipped: boolean;
  spot: Piece[];
  /** The spot's middle, in board units: where the tile's middle is dropped. */
  at: XY;
}

/** How much a press costs against a tile's width of distance from the last
 * tile: enough that the plan keeps to one way of holding the tray while it
 * can, not so much that it jumps across the board to do so. */
const PRESS_COST = 0.9;
/** How much being further from the board's bottom-left costs, a tile's width
 * at a time: what keeps the sweep going one way. */
const SWEEP_COST = 0.35;

/** The board's own tiles in the order the plan lays them, from an empty board
 * held as the tray starts (no turn, not flipped). */
export function demoPlan(level: Level): Move[] {
  const { ring } = level;
  const puzzle = new Puzzle(level);
  const n = ring.n;
  const mod = (k: number): number => ((k % n) + n) % n;
  const own = new Set(level.cells.map((cell) => spotKey(ring, cell)));
  const middle = (spot: readonly Piece[]): XY =>
    centroidOf(spot.map((p) => p.verts.map((v) => ring.toXY(v))));
  const area = level.cells.reduce(
    (sum, cell) =>
      sum +
      Math.abs(
        cell.reduce((s, p) => {
          const xy = p.verts.map((v) => ring.toXY(v));
          let a = 0;
          for (let i = 0; i < xy.length; i++) {
            const [x0, y0] = xy[i]!;
            const [x1, y1] = xy[(i + 1) % xy.length]!;
            a += x0 * y1 - x1 * y0;
          }
          return s + a / 2;
        }, 0),
      ),
    0,
  );
  const width = Math.sqrt(area / level.cells.length);
  const origin: XY = level.cells
    .flatMap((cell) => cell.flatMap((p) => p.verts.map((v) => ring.toXY(v))))
    .reduce(([mx, my], [x, y]) => [Math.min(mx, x), Math.min(my, y)], [Infinity, Infinity]);

  let turn = 0;
  let flipped = false;
  let last: XY = origin;
  const moves: Move[] = [];
  while (!puzzle.won) {
    let best: (Move & { cost: number }) | null = null;
    const seen = new Set<string>();
    for (const corner of puzzle.openCorners.values()) {
      for (const fit of puzzle.fitsAt(ring.toXY(corner))) {
        const key = spotKey(ring, fit.spot);
        if (!own.has(key) || seen.has(`${fit.flip}|${key}`)) continue;
        seen.add(`${fit.flip}|${key}`);
        const flip = fit.flip !== flipped;
        // a flip turns the tray too (`Puzzle.flipTurn`)
        const from = flip ? puzzle.flipTurn(turn) : turn;
        const shape = {
          ring,
          pieces: posed(level.tiles[fit.kind]!, { rot: 0, flip: fit.flip, t: ring.zero }),
        };
        let hold: { turns: number; rot: number } | null = null;
        for (const k of turnsOntoPieces(shape, fit.spot)) {
          const d = mod(k - from);
          let turns = 0;
          if (d !== 0) {
            if (level.turn === 0 || d % level.turn !== 0) continue;
            const ccw = d / level.turn;
            const cw = (n - d) / level.turn;
            turns = ccw <= cw ? ccw : -cw;
          }
          if (!hold || Math.abs(turns) < Math.abs(hold.turns)) hold = { turns, rot: mod(k) };
        }
        if (!hold) continue;
        const at = middle(fit.spot);
        const presses = Math.abs(hold.turns) + (flip ? 1 : 0);
        const cost =
          PRESS_COST * presses +
          Math.hypot(at[0] - last[0], at[1] - last[1]) / width +
          (SWEEP_COST * (at[0] - origin[0] + at[1] - origin[1])) / width;
        if (!best || cost < best.cost)
          best = {
            kind: fit.kind,
            flip,
            turns: hold.turns,
            rot: hold.rot,
            flipped: fit.flip,
            spot: fit.spot,
            at,
            cost,
          };
      }
    }
    if (!best) throw new Error(`demoPlan: nothing of ${level.key}'s own fits an open corner`);
    const move: Move = {
      kind: best.kind,
      flip: best.flip,
      turns: best.turns,
      rot: best.rot,
      flipped: best.flipped,
      spot: best.spot,
      at: best.at,
    };
    puzzle.place(move.kind, move.spot, move.rot, move.flipped);
    turn = move.rot;
    flipped = move.flipped;
    last = move.at;
    moves.push(move);
  }
  return moves;
}
