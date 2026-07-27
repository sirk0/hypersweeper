import { describe, expect, it } from "vitest";
import {
  cylinderBoard,
  cylinderHexBoard,
  cylinderTriangleBoard,
  kleinBoard,
  kleinHexBoard,
  kleinTriangleBoard,
  mobiusBoard,
  mobiusHexBoard,
  torusBoard,
  torusHexBoard,
} from "../../src/boards/surfaces";
import type { Board3D, CellId } from "../../src/boards/core";

// Structural invariants of the wrapped surfaces, mirrored from the Python suite
// (tests/test_boards.py TestKleinBottle / TestKleinTilings and the wrap
// invariants) — neighbour degrees, two-sidedness, and the cell-cycle graph
// automorphism the conformance oracle's aggregate counts don't pin down.

function degrees(board: Board3D): Set<number> {
  return new Set([...board.adjacency.values()].map((n) => n.length));
}

/** A cell_cycle is a bijective adjacency-preserving permutation of the cells:
 * neighbours map to neighbours, so the board reads correctly at every scroll
 * offset. */
function assertScrollCycle(board: Board3D): void {
  const cycle = board.cellCycle;
  expect(cycle).not.toBeNull();
  const cyc = cycle!;
  expect(new Set(cyc.keys())).toEqual(new Set(board.adjacency.keys()));
  expect(new Set(cyc.values()).size).toBe(cyc.size); // a bijection
  for (const [cell, neighbors] of board.adjacency) {
    const shifted = new Set(board.adjacency.get(cyc.get(cell)!)!);
    for (const n of neighbors) expect(shifted.has(cyc.get(n)!)).toBe(true);
  }
}

/** The order of the cell cycle: how many steps return a cell to itself. */
function cycleOrder(cycle: Map<CellId, CellId>): number {
  const start = cycle.keys().next().value as CellId;
  let cur = cycle.get(start)!;
  let order = 1;
  while (cur !== start) {
    cur = cycle.get(cur)!;
    order++;
  }
  return order;
}

describe("wrapped surfaces", () => {
  it("torus quads all have eight neighbours, closed and one-sided", () => {
    const board = torusBoard(12, 6, 9);
    expect(degrees(board)).toEqual(new Set([8]));
    expect(board.twoSided).toBe(false);
    expect(board.cellCycle).toBeNull();
  });

  it("torus of hexagons is borderless with six neighbours each", () => {
    const board = torusHexBoard(6, 12, 9);
    expect(degrees(board)).toEqual(new Set([6]));
    expect(board.twoSided).toBe(false);
  });

  it("cylinder and Möbius are two-sided with no scroll cycle", () => {
    for (const board of [cylinderBoard(12, 7, 10), mobiusBoard(20, 4, 10)]) {
      expect(board.twoSided).toBe(true);
      expect(board.cellCycle).toBeNull();
    }
  });

  it("klein square is a closed non-orientable surface, 8 neighbours each", () => {
    const board = kleinBoard(12, 6, 9);
    expect(degrees(board)).toEqual(new Set([8]));
    expect(board.twoSided).toBe(true);
  });

  it("klein carries a ring-translation graph automorphism", () => {
    assertScrollCycle(kleinBoard(12, 6, 9));
    assertScrollCycle(kleinBoard(16, 8, 20));
  });

  it("klein cell cycle has period twice the ring (seam flips the tube)", () => {
    // crossing the seam flips the tube, so a cell returns only after two loops
    expect(cycleOrder(kleinBoard(12, 6, 9).cellCycle!)).toBe(24);
  });

  it("klein triangle/hex cell counts match Python", () => {
    expect(kleinTriangleBoard(18, 6, 13).adjacency.size).toBe(108);
    expect(kleinHexBoard(6, 4, 9).adjacency.size).toBe(24);
  });

  it("klein hexagons carry a scroll cycle", () => {
    assertScrollCycle(kleinHexBoard(8, 6, 20));
  });

  it("klein triangles carry a scroll cycle of two lattice columns", () => {
    assertScrollCycle(kleinTriangleBoard(18, 6, 13));
    assertScrollCycle(kleinTriangleBoard(25, 8, 20));
  });

  it("klein triangles need a ring parity matching the seam flip", () => {
    // the seam mirror (ky -> tube/2 - 1 - ky) lands on the offset lattice
    // only when the ring shift matches that flip's parity
    expect(() => kleinTriangleBoard(19, 6, 13)).toThrow();
    expect(() => kleinTriangleBoard(24, 8, 20)).toThrow();
    expect(() => kleinTriangleBoard(10, 5, 12)).toThrow();
  });

  it("only the Klein bottle carries a self-intersection clip", () => {
    expect(kleinBoard(16, 8, 20).clip).not.toBeNull();
    expect(kleinTriangleBoard(18, 6, 13).clip).not.toBeNull();
    expect(kleinHexBoard(8, 6, 20).clip).not.toBeNull();
    for (const board of [torusBoard(12, 6, 9), cylinderBoard(12, 7, 10), mobiusBoard(20, 4, 10)]) {
      expect(board.clip).toBeNull();
    }
  });

  it("the klein clip reaches only the cells the neck passes through", () => {
    // The fat sheet just past the belly is pierced by the thin end of the neck,
    // so a piece of two big cells is enclosed and must not be drawn; everything
    // else on the board — the neck itself above all — is left whole.
    expect([...kleinBoard(12, 6, 9).clip!.cells].sort()).toEqual(["6,2", "7,2"]);
    expect([...kleinBoard(16, 8, 20).clip!.cells].sort()).toEqual(["8,3", "9,3"]);
    for (const board of [kleinBoard(24, 10, 48), kleinTriangleBoard(18, 6, 13)]) {
      expect(board.clip!.cells.size).toBeLessThan(board.polygons.size / 10);
      for (const cell of board.clip!.cells) expect(board.polygons.has(cell)).toBe(true);
    }
  });

  it("the klein clip field is negative only inside the enclosed patch", () => {
    const board = kleinBoard(16, 8, 20);
    const { field, cells } = board.clip!;
    // every clipped cell straddles the field, and no cell is wholly enclosed
    for (const cell of cells) {
      const poly = board.polygons.get(cell)!;
      expect(poly.some((p) => field(p) > 0)).toBe(true);
    }
    // the neck is the thin tube itself: its corners sit *on* the field's zero,
    // never inside it, so nothing of the tube the hole looks down is cut
    expect(cells.has("13,3")).toBe(false);
    for (const p of board.polygons.get("13,3")!) expect(field(p)).toBeGreaterThan(-1e-9);
  });

  it("the clip is render-only: cells, adjacency and scroll are untouched", () => {
    const board = kleinBoard(16, 8, 20);
    expect(board.polygons.size).toBe(128);
    expect(degrees(board)).toEqual(new Set([8]));
    assertScrollCycle(board);
  });

  it("wrap builders validate their seam arguments", () => {
    expect(() => kleinBoard(12, 5, 9)).toThrow(); // tube must be even
    expect(() => kleinTriangleBoard(10, 5, 12)).toThrow(); // tube must be even
    expect(() => kleinHexBoard(6, 5, 9)).toThrow(); // rows must be even
    expect(() => torusHexBoard(5, 12, 9)).toThrow(); // rows must be even
    expect(() => mobiusHexBoard(14, 4, 6)).toThrow(); // rows must be odd
    expect(() => cylinderTriangleBoard(15, 6, 11)).toThrow(); // ring must be even
    expect(() => cylinderHexBoard(12, 6, 9)).not.toThrow();
  });
});
