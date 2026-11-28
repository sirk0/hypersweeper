import { describe, expect, it } from "vitest";
import { demoPlan } from "../../src/demoPlan";
import { signedArea, spotKey } from "../../src/geometry/shape";
import { levelByKey } from "../../src/levels";
import { Puzzle } from "../../src/puzzle";

// The plan the store videos play (scripts/make-store-videos.mts): every move
// must be one a player could make — the presses reach the turn it is laid at,
// and a drop with the tile's middle on the spot's middle snaps it there, as
// drag.ts snaps (`Puzzle.snap` within its reach) — and the last finishes the
// board.
describe("demoPlan", () => {
  // Tile(1,1), the videos' level; the hat, which flips; the squares, which
  // never turn.
  it.each(["tile11", "hat", "squares"])("plays %s through, move by move", (key) => {
    const level = levelByKey(key)!;
    const { ring } = level;
    const moves = demoPlan(level);
    expect(moves).toHaveLength(level.cells.length);
    const own = new Set(level.cells.map((cell) => spotKey(ring, cell)));
    const puzzle = new Puzzle(level);
    const n = ring.n;
    const mod = (k: number): number => ((k % n) + n) % n;
    let turn = 0;
    let flipped = false;
    for (const move of moves) {
      expect(own.has(spotKey(ring, move.spot))).toBe(true);
      if (move.flip) {
        turn = puzzle.flipTurn(turn);
        flipped = !flipped;
      }
      turn = mod(turn + move.turns * level.turn);
      expect(turn).toBe(move.rot);
      expect(flipped).toBe(move.flipped);
      const area = level.tiles[move.kind]!.pieces.reduce(
        (sum, p) => sum + signedArea(p.verts.map((v) => ring.toXY(v))),
        0,
      );
      const reach = 0.7 * Math.sqrt(Math.abs(area));
      const snapped = puzzle.snap(move.kind, move.at, reach, turn, flipped);
      expect(snapped && spotKey(ring, snapped)).toBe(spotKey(ring, move.spot));
      puzzle.place(move.kind, snapped!, turn, flipped);
    }
    expect(puzzle.won).toBe(true);
  });

  it("turns the tray on Tile(1,1), a few presses at a time", () => {
    const moves = demoPlan(levelByKey("tile11")!);
    const turning = moves.filter((m) => m.turns !== 0);
    expect(turning.length).toBeGreaterThan(3);
    expect(Math.max(...moves.map((m) => Math.abs(m.turns)))).toBeLessThanOrEqual(6);
  });
});
