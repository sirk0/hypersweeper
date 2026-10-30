import { squareBoard } from "@boards/tilings";
import { describe, expect, it } from "vitest";
import { centroid } from "../../src/geometry/shape";
import { LEVELS, levelByKey } from "../../src/levels";
import { Puzzle } from "../../src/puzzle";

/** Fill a level greedily, always snapping at the first open corner. */
function fill(p: Puzzle): number {
  let moves = 0;
  while (!p.won && moves < 1000) {
    const corner = p.corners.values().next().value!;
    const spot = p.snap(0, p.level.ring.toXY(corner), 2);
    if (!spot) throw new Error("stuck");
    p.place(0, spot);
    moves++;
  }
  return moves;
}

describe("puzzle", () => {
  it("every level can be filled, and needs exactly `needed` tiles", () => {
    for (const level of LEVELS) {
      const p = new Puzzle(level);
      expect(fill(p)).toBe(p.needed);
      expect(p.won).toBe(true);
    }
  });

  it("squares is Hypersweeper's 4×4 square board, tile for tile", () => {
    const p = new Puzzle(levelByKey("squares")!);
    fill(p);
    const board = squareBoard(4, 4, 1);
    const key = ([x, y]: [number, number]): string => `${x.toFixed(6)},${y.toFixed(6)}`;
    const ours = new Set(p.tiles.map((t) => key(centroid(t.verts.map((v) => p.level.ring.toXY(v))))));
    const theirs = new Set([...board.polygons.values()].map((poly) => key(centroid(poly))));
    expect(ours).toEqual(theirs);
  });

  it("lifting a tile reopens exactly its spot", () => {
    const p = new Puzzle(levelByKey("squares")!);
    fill(p);
    const tile = p.tiles[5]!;
    p.lift(tile.id);
    expect(p.won).toBe(false);
    const c = centroid(tile.verts.map((v) => p.level.ring.toXY(v)));
    const spot = p.snap(0, c, 0.5)!;
    expect(spot.map((v) => p.level.ring.key(v)).sort()).toEqual(
      tile.verts.map((v) => p.level.ring.key(v)).sort(),
    );
    p.place(0, spot);
    expect(p.won).toBe(true);
  });
});
