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
import {
  fanTriangles,
  insideOccluder,
  solidDepth,
  subtractSolid,
  trianglesArea,
  type Tri,
} from "../../src/boards/clipSolid";
import type { Board3D, CellId, Vec3 } from "../../src/boards/core";

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
    // so a piece of a couple of big cells is enclosed and must not be drawn;
    // everything else — the neck itself above all — is left whole.
    expect([...kleinBoard(12, 6, 9).clip!.cells].sort()).toEqual(["6,2", "7,2"]);
    expect([...kleinBoard(16, 8, 20).clip!.cells].sort()).toEqual(["8,3", "9,3"]);
    for (const board of [kleinBoard(24, 10, 48), kleinTriangleBoard(18, 6, 13)]) {
      expect(board.clip!.cells.size).toBeLessThan(board.polygons.size / 10);
      for (const cell of board.clip!.cells) expect(board.polygons.has(cell)).toBe(true);
    }
  });

  it("the klein clip leaves the bottom of the bottle alone", () => {
    // Where the neck folds back on itself the two sheets converge on one
    // circle, and the chords the tiles are drawn as cross it — so cutting
    // against that *circle* took bites out of the tiles down there, which is
    // what one could see through. Cut against the drawn tube instead and the
    // fold keeps its tiles: whatever is left of a cut down there is a hairline
    // where the two sheets share their rim, never a hole.
    for (const board of [
      kleinBoard(10, 8, 14, 1.15),
      kleinBoard(26, 10, 55),
      kleinTriangleBoard(21, 4, 18),
      kleinHexBoard(14, 6, 16, 1.15),
    ]) {
      const { cells, solid } = board.clip!;
      let lowest = Infinity;
      let highest = -Infinity;
      for (const poly of board.polygons.values()) {
        for (const p of poly) {
          lowest = Math.min(lowest, p[1]);
          highest = Math.max(highest, p[1]);
        }
      }
      const floor = lowest + (highest - lowest) * 0.05;
      expect(cells.size).toBeGreaterThan(0);
      let cutHigherUp = 0;
      for (const cell of cells) {
        const poly = board.polygons.get(cell)!;
        const whole = fanTriangles(poly, centroid(poly));
        const gone = 1 - trianglesArea(subtractSolid(whole, solid)) / trianglesArea(whole);
        if (poly.some((p) => p[1] < floor)) expect(gone).toBeLessThan(0.02);
        else cutHigherUp += gone;
      }
      expect(cutHigherUp).toBeGreaterThan(0.1); // the real cut is still made
    }
  });

  it("the klein cut is the drawn tube's own inside, not the smooth one's", () => {
    // The cut has to agree with the tube that is meant to hide it, or the seam
    // between them is a slit one can see the far side of. Measured against the
    // occluder's own cross-section — a *polygon*, inscribed in the circle the
    // immersion stands for — because that difference is the whole of this fix:
    // the two answers may disagree only in a shell a hundredth of the board
    // thick, where the sheets are edge on and nothing shows either way.
    for (const board of [
      kleinBoard(10, 8, 14, 1.15),
      kleinBoard(16, 8, 20),
      kleinTriangleBoard(21, 4, 18),
      kleinHexBoard(14, 6, 16, 1.15),
    ]) {
      const { cells, solid, occluder } = board.clip!;
      let tested = 0;
      let disagreed = 0;
      for (const cell of cells) {
        const poly = board.polygons.get(cell)!;
        for (const tri of fanTriangles(poly, centroid(poly))) {
          for (const p of barycentricGrid(tri, 16)) {
            tested++;
            if (solidDepth(solid, p) < 0 === insideOccluder(occluder, p)) continue;
            disagreed++;
            // ...and only ever within a hair of the tube's own surface.
            expect(sectionDistance(occluder, p)).toBeLessThan(board.radius * 0.01);
          }
        }
      }
      expect(tested).toBeGreaterThan(300);
      expect(disagreed / tested).toBeLessThan(0.02);
    }
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

function centroid(points: readonly Vec3[]): Vec3 {
  const c: Vec3 = [0, 0, 0];
  for (const p of points) {
    c[0] += p[0] / points.length;
    c[1] += p[1] / points.length;
    c[2] += p[2] / points.length;
  }
  return c;
}

/** How far a point lies from the drawn tube, measured in its own horizontal
 * plane — zero on the tube's surface. The tube's cross-sections are horizontal,
 * so slicing it at the point's height gives the curve to measure against. */
function sectionDistance(occluder: readonly Tri[], p: Vec3): number {
  let best = Infinity;
  for (const t of occluder) {
    for (let i = 0; i < 3; i++) {
      const a = t[i]!;
      const b = t[(i + 1) % 3]!;
      const da = a[1] - p[1];
      const db = b[1] - p[1];
      if ((da > 0 && db > 0) || (da < 0 && db < 0) || da === db) continue;
      const s = da / (da - db);
      if (s < 0 || s > 1) continue;
      best = Math.min(
        best,
        Math.hypot(a[0] + (b[0] - a[0]) * s - p[0], a[2] + (b[2] - a[2]) * s - p[2]),
      );
    }
  }
  return best;
}

/** Points spread evenly over a triangle, its own corners left off (they sit on
 * the cut, where both answers are a coin toss). */
function barycentricGrid(tri: Tri, steps: number): Vec3[] {
  const out: Vec3[] = [];
  for (let i = 1; i < steps; i++) {
    for (let j = 1; i + j < steps; j++) {
      const wa = i / steps;
      const wb = j / steps;
      const wc = 1 - wa - wb;
      out.push([
        tri[0][0] * wa + tri[1][0] * wb + tri[2][0] * wc,
        tri[0][1] * wa + tri[1][1] * wb + tri[2][1] * wc,
        tri[0][2] * wa + tri[1][2] * wb + tri[2][2] * wc,
      ]);
    }
  }
  return out;
}
