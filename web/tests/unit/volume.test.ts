import { describe, expect, it } from "vitest";
import {
  boundaryComponents,
  eulerCharacteristic,
  isAutomorphism,
  sharedVertexAdjacency,
  vertexCount,
  type Board3D,
} from "../../src/boards/core";
import {
  fccBlockBoard,
  hexPrismBoard,
  solidCubeBoard,
} from "../../src/boards/volume";

// The port of tests/test_boards.py's TestSolidCube, TestFccBlock and
// TestHexPrism, plus the symmetry controls,
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

/** Shared-vertex adjacency of the *drawing*, read off rounded coordinates —
 * fine in a test; the board itself never keys a vertex that way. */
function drawnAdjacency(board: Board3D): Map<string, string[]> {
  const cells = new Map<string, string[]>();
  for (const [cell, poly] of board.polygons) {
    cells.set(
      cell,
      poly.map((v) => v.map((c) => c.toFixed(9)).join(",")),
    );
  }
  return sharedVertexAdjacency(cells);
}

const coords = (cell: string) =>
  cell.split(",").map(Number) as [number, number, number];

function expectSheetsDrawTheirOwnAdjacency(board: Board3D): void {
  const drawn = drawnAdjacency(board);
  for (const [cell, neighbors] of board.adjacency) {
    const sheet = coords(cell)[2];
    const sameSheet = neighbors.filter((n) => coords(n)[2] === sheet).sort();
    expect([...drawn.get(cell)!].sort(), cell).toEqual(sameSheet);
  }
}

function expectNoTwins(board: Board3D): void {
  const closed = new Set<string>();
  for (const [cell, neighbors] of board.adjacency) {
    closed.add([cell, ...neighbors].sort().join("|"));
  }
  expect(closed.size).toBe(board.adjacency.size);
}

describe("the rhombic honeycomb", () => {
  it.each([
    [3, 3],
    [5, 6],
    [8, 8],
  ])("is the even sites of the box (%i x %i)", (side, depth) => {
    const board = fccBlockBoard(side, depth, 5);
    let even = 0;
    for (let i = 0; i < side; i++) {
      for (let j = 0; j < side; j++) {
        for (let k = 0; k < depth; k++) {
          if ((i + j + k) % 2 === 0) {
            even++;
            expect(board.adjacency.has(`${i},${j},${k}`)).toBe(true);
          }
        }
      }
    }
    expect(board.adjacency.size).toBe(even);
    for (const poly of board.polygons.values()) expect(poly.length).toBe(4);
  });

  it.each([
    [3, 3],
    [5, 6],
    [6, 6],
  ])("is exactly the 18-neighbourhood (%i x %i)", (side, depth) => {
    // twelve across a face, at distance sqrt(2); six across a corner, at
    // distance 2 along an axis — nothing else is within 2
    const board = fccBlockBoard(side, depth, 5);
    for (const [cell, neighbors] of board.adjacency) {
      const [i, j, k] = coords(cell);
      const expected = [...board.adjacency.keys()].filter((other) => {
        const [a, b, c] = coords(other);
        const d2 = (a - i) ** 2 + (b - j) ** 2 + (c - k) ** 2;
        return d2 === 2 || d2 === 4;
      });
      expect(new Set(neighbors)).toEqual(new Set(expected));
    }
  });

  it("reaches two slices away only straight through", () => {
    const board = fccBlockBoard(6, 6, 5);
    for (const [cell, neighbors] of board.adjacency) {
      const [i, j, k] = coords(cell);
      for (const n of neighbors) {
        const [a, b, c] = coords(n);
        if (Math.abs(c - k) === 2) expect([a, b]).toEqual([i, j]);
      }
    }
  });

  it.each([
    [4, 4],
    [5, 6],
  ])("draws each sheet's own adjacency (%i x %i)", (side, depth) => {
    expectSheetsDrawTheirOwnAdjacency(fccBlockBoard(side, depth, 5));
  });

  it.each([
    [3, 3],
    [5, 6],
    [8, 8],
  ])("draws each slice as its own sheet (%i x %i)", (side, depth) => {
    const board = fccBlockBoard(side, depth, 5);
    expect(board.twoSided).toBe(true);
    expect(eulerCharacteristic(board)).toBe(depth);
    expect(boundaryComponents(board)).toBe(depth);
  });

  it("has no two cells with the same closed neighbourhood", () => {
    expectNoTwins(fccBlockBoard(3, 3, 5));
    expectNoTwins(fccBlockBoard(5, 6, 5));
  });

  it("refuses a thin block", () => {
    expect(() => fccBlockBoard(2, 5, 3)).toThrow();
    expect(() => fccBlockBoard(5, 2, 3)).toThrow();
  });

  it.each([
    [5, 6],
    [8, 8],
    [10, 10],
  ])(
    "offers only motions that keep the checkerboard (%i x %i)",
    (side, depth) => {
      // a mirror across an even-sided box swaps the two colours of the
      // checkerboard, so it lands on the half of the lattice the board is not
      const board = fccBlockBoard(side, depth, 5);
      expect(board.symmetries.length).toBeGreaterThan(0);
      for (const symmetry of board.symmetries) {
        expect(
          isAutomorphism(board.adjacency, symmetry.cycle),
          symmetry.id,
        ).toBe(true);
      }
    },
  );

  it("turns the contents through the stack on a cubic block", () => {
    const board = fccBlockBoard(8, 8, 5);
    const ring = board.symmetries.find((s) => s.id === "ring")!;
    const moved = [...ring.cycle].filter(
      ([from, to]) => coords(from)[2] !== coords(to)[2],
    );
    expect(moved.length).toBeGreaterThan(0);
  });
});

describe("the hexagonal prism block", () => {
  it.each([
    [1, 3],
    [2, 4],
    [3, 7],
  ])("is depth layers of a hexagon (radius %i, depth %i)", (radius, depth) => {
    const board = hexPrismBoard(radius, depth, 5);
    expect(board.adjacency.size).toBe((3 * radius * (radius + 1) + 1) * depth);
    for (const poly of board.polygons.values()) expect(poly.length).toBe(6);
  });

  it.each([
    [2, 4],
    [3, 5],
  ])("is the 20-neighbourhood (radius %i, depth %i)", (radius, depth) => {
    // the six round a cell in its layer, and the cell straight through and its
    // six in each layer above and below
    const board = hexPrismBoard(radius, depth, 5);
    const inHexagon = (q: number, s: number) =>
      Math.max(Math.abs(q), Math.abs(s), Math.abs(q + s)) <= radius;
    const ring = [
      [1, 0],
      [0, 1],
      [-1, 1],
      [-1, 0],
      [0, -1],
      [1, -1],
    ];
    for (const [cell, neighbors] of board.adjacency) {
      const [q, s, k] = coords(cell);
      const expected = new Set<string>();
      for (const dk of [-1, 0, 1]) {
        if (k + dk < 0 || k + dk >= depth) continue;
        for (const [dq, ds] of dk === 0 ? ring : [[0, 0], ...ring]) {
          if (inHexagon(q + dq!, s + ds!)) {
            expected.add(`${q + dq!},${s + ds!},${k + dk}`);
          }
        }
      }
      expect(new Set(neighbors)).toEqual(expected);
    }
    expect(
      Math.max(...[...board.adjacency.values()].map((n) => n.length)),
    ).toBe(20);
  });

  it.each([
    [2, 4],
    [3, 4],
  ])(
    "draws each sheet's own adjacency (radius %i, depth %i)",
    (radius, depth) => {
      expectSheetsDrawTheirOwnAdjacency(hexPrismBoard(radius, depth, 5));
    },
  );

  it.each([
    [1, 3],
    [2, 4],
    [4, 8],
  ])(
    "draws each layer as its own sheet (radius %i, depth %i)",
    (radius, depth) => {
      const board = hexPrismBoard(radius, depth, 5);
      expect(board.twoSided).toBe(true);
      expect(eulerCharacteristic(board)).toBe(depth);
      expect(boundaryComponents(board)).toBe(depth);
    },
  );

  it("has no two cells with the same closed neighbourhood", () => {
    expectNoTwins(hexPrismBoard(1, 3, 5));
    expectNoTwins(hexPrismBoard(2, 4, 5));
  });

  it("refuses a block two deep, or with no ring", () => {
    expect(() => hexPrismBoard(2, 2, 3)).toThrow();
    expect(() => hexPrismBoard(0, 4, 3)).toThrow();
  });

  it("turns about its axis and comes over end to end", () => {
    // a sixth of a turn keeps every cell in its layer; the end-over-end half
    // turn carries layer k onto layer depth-1-k
    const board = hexPrismBoard(2, 4, 5);
    expect(board.symmetries.map((s) => s.id).sort()).toEqual([
      "mirror-ring",
      "ring",
      "turn",
    ]);
    for (const symmetry of board.symmetries) {
      expect(isAutomorphism(board.adjacency, symmetry.cycle), symmetry.id).toBe(
        true,
      );
    }
    const turn = board.symmetries.find((s) => s.id === "turn")!;
    for (const [from, to] of turn.cycle)
      expect(coords(to)[2]).toBe(coords(from)[2]);
    const ring = board.symmetries.find((s) => s.id === "ring")!;
    for (const [from, to] of ring.cycle)
      expect(coords(to)[2]).toBe(3 - coords(from)[2]);
  });
});
