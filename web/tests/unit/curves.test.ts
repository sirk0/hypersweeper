import { describe, expect, it } from "vitest";
import { curveSquares, hilbertBoard, hilbertPath, mooreBoard, moorePath } from "../../src/boards/fractal";

// The Hilbert and Moore boards (boards/fractal.ts): the curve drawn as a
// corridor three squares wide. The conformance oracle already holds the two
// ports to the same counts; this pins the paths themselves, against the
// textbook definition, and what the corridor is for.

/** The classic conversion from distance along the Hilbert curve to a point. */
function d2xy(n: number, d: number): [number, number] {
  let x = 0;
  let y = 0;
  let t = d;
  for (let s = 1; s < n; s *= 2) {
    const rx = 1 & (t >> 1);
    const ry = 1 & (t ^ rx);
    if (ry === 0) {
      if (rx === 1) [x, y] = [s - 1 - x, s - 1 - y];
      [x, y] = [y, x];
    }
    x += s * rx;
    y += s * ry;
    t >>= 2;
  }
  return [x, y];
}

const step = (a: number[], b: number[]): number => Math.abs(a[0]! - b[0]!) + Math.abs(a[1]! - b[1]!);

describe("the space-filling curves", () => {
  it("walks the textbook Hilbert curve", () => {
    for (let levels = 0; levels <= 4; levels++) {
      const n = 2 ** levels;
      expect(hilbertPath(levels)).toEqual(Array.from({ length: n * n }, (_, d) => d2xy(n, d)));
    }
  });

  it("closes the Moore curve into a loop over every point once", () => {
    for (let levels = 1; levels <= 4; levels++) {
      const loop = moorePath(levels);
      const n = 2 ** levels;
      expect(new Set(loop.map((p) => p.join(","))).size).toBe(n * n);
      expect(loop.every(([x, y]) => x >= 0 && y >= 0 && x < n && y < n)).toBe(true);
      loop.forEach((p, i) => expect(step(p, loop[(i + 1) % loop.length]!)).toBe(1));
    }
  });

  it("is a block per point and a bridge per step", () => {
    expect(curveSquares(hilbertPath(2), false)).toHaveLength(16 + 15);
    expect(curveSquares(moorePath(2), true)).toHaveLength(16 + 16);
    for (let levels = 1; levels <= 3; levels++) {
      expect(hilbertBoard(levels, 1).adjacency.size).toBe(12 * 4 ** levels - 3);
      expect(mooreBoard(levels, 1).adjacency.size).toBe(12 * 4 ** levels);
    }
  });

  it("leaves no two cells with the same closed neighbourhood", () => {
    // three across is what buys this: a two-wide strip's cells pair up across
    // every straight run
    for (const board of [hilbertBoard(2, 1), mooreBoard(2, 1)]) {
      const seen = new Set<string>();
      for (const [cell, ns] of board.adjacency) {
        const key = [cell, ...ns].sort().join("|");
        expect(seen.has(key), cell).toBe(false);
        seen.add(key);
      }
    }
  });
});
