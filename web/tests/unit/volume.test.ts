import { describe, expect, it } from "vitest";
import {
  boundaryComponents,
  eulerCharacteristic,
  isAutomorphism,
  vertexCount,
} from "../../src/boards/core";
import { solidCubeBoard } from "../../src/boards/volume";

// The port of tests/test_boards.py's TestSolidCube, plus the symmetry controls,
// which are a TypeScript-only feature and so have no Python counterpart. The
// cell/edge/vertex counts themselves are pinned against the Python export by
// tests/unit/conformance.test.ts; what is here is the structure behind them.

function neighbourhood(
  n: number,
  i: number,
  j: number,
  k: number,
): Set<string> {
  const out = new Set<string>();
  for (const di of [-1, 0, 1]) {
    for (const dj of [-1, 0, 1]) {
      for (const dk of [-1, 0, 1]) {
        if (di === 0 && dj === 0 && dk === 0) continue;
        const [a, b, c] = [i + di, j + dj, k + dk];
        if (a >= 0 && a < n && b >= 0 && b < n && c >= 0 && c < n) {
          out.add(`${a},${b},${c}`);
        }
      }
    }
  }
  return out;
}

describe("the cube of cubes", () => {
  it.each([3, 4, 6])("is n**3 quads (n = %i)", (n) => {
    const board = solidCubeBoard(n, 5);
    expect(board.adjacency.size).toBe(n ** 3);
    for (const poly of board.polygons.values()) expect(poly.length).toBe(4);
  });

  it.each([3, 4, 5, 8])("is exactly the 26-neighbourhood (n = %i)", (n) => {
    const board = solidCubeBoard(n, 5);
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) {
        for (let k = 0; k < n; k++) {
          const got = new Set(board.adjacency.get(`${i},${j},${k}`)!);
          expect(got).toEqual(neighbourhood(n, i, j, k));
        }
      }
    }
  });

  it.each([3, 4, 6, 8])("has the four kinds of position (n = %i)", (n) => {
    // a corner touches a 2x2x2 block (7 others), an edge a 2x2x3 (11), a face
    // a 2x3x3 (17) and an interior cell the full 3x3x3 (26)
    const board = solidCubeBoard(n, 5);
    const histogram = new Map<number, number>();
    for (const neighbors of board.adjacency.values()) {
      histogram.set(
        neighbors.length,
        (histogram.get(neighbors.length) ?? 0) + 1,
      );
    }
    const inner = n - 2;
    expect(Object.fromEntries(histogram)).toEqual({
      7: 8,
      11: 12 * inner,
      17: 6 * inner ** 2,
      26: inner ** 3,
    });
  });

  it.each([3, 4, 6])("draws each slice as its own sheet (n = %i)", (n) => {
    // n disjoint square grids: chi = n and n boundary circles, which is also
    // what `twoSided` is telling the renderer
    const board = solidCubeBoard(n, 5);
    expect(board.twoSided).toBe(true);
    expect(eulerCharacteristic(board)).toBe(n);
    expect(boundaryComponents(board)).toBe(n);
    expect(vertexCount(board)).toBe(n * (n + 1) ** 2);
  });

  it.each([3, 4, 6])(
    "lays the sheets out so none covers another (n = %i)",
    (n) => {
      // the whole point of taking the cube apart: seen down the board's own z
      // axis no two cells overlap, or a slice would hide a slice
      const board = solidCubeBoard(n, 5);
      const seen = new Set<string>();
      for (const poly of board.polygons.values()) {
        const mid = [0, 1].map(
          (axis) =>
            Math.round((poly.reduce((s, v) => s + v[axis]!, 0) / 4) * 1e6) /
            1e6,
        );
        expect(seen.has(mid.join(","))).toBe(false);
        seen.add(mid.join(","));
      }
    },
  );

  it.each([3, 4, 5])(
    "has no two cells with the same closed neighbourhood (n = %i)",
    (n) => {
      // a pair that does can never be told apart by any sequence of numbers, so a
      // mine landing alone in one forces a coin flip. Depth 2 is exactly that
      // board, which is why the builder refuses it.
      const board = solidCubeBoard(n, 5);
      const closed = new Set<string>();
      for (const [cell, neighbors] of board.adjacency) {
        closed.add([cell, ...neighbors].sort().join("|"));
      }
      expect(closed.size).toBe(board.adjacency.size);
    },
  );

  it("refuses a block two deep", () => {
    expect(() => solidCubeBoard(2, 3)).toThrow();
  });

  it.each([3, 4, 6, 8])("carries the cube's own motions (n = %i)", (n) => {
    // Measured off the *cells*, not off the drawing: pulling the slices apart
    // leaves nothing of the cube's 48 motions in the geometry for
    // `solidSymmetries` to find. Two quarter turns and a mirror generate the
    // rest, which is what `keepSymmetries`'s redundancy pass leaves standing.
    const board = solidCubeBoard(n, 5);
    expect(board.symmetries.map((s) => s.id)).toEqual([
      "ring",
      "tube",
      "mirror-ring",
    ]);
    for (const symmetry of board.symmetries) {
      expect(isAutomorphism(board.adjacency, symmetry.cycle), symmetry.id).toBe(
        true,
      );
    }
    // the two turns are quarter turns, so four of either is the identity and
    // neither is its own undo; the mirror is
    const [ring, tube, mirror] = board.symmetries;
    expect(ring!.involution).toBe(false);
    expect(tube!.involution).toBe(false);
    expect(mirror!.involution).toBe(true);
  });

  it("turns the contents through the stack, not just within a slice", () => {
    // `ring` and `tube` are the one move dragging cannot give: dragging turns
    // the drawing, and the drawing is the cube taken apart rather than the cube
    const board = solidCubeBoard(4, 5);
    const ring = board.symmetries.find((s) => s.id === "ring")!;
    const slice = (cell: string) => cell.split(",")[2];
    const moved = [...ring.cycle].filter(
      ([from, to]) => slice(from) !== slice(to),
    );
    expect(moved.length).toBeGreaterThan(0);
  });
});
