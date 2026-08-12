import { describe, expect, it } from "vitest";
import { clipTriangles, fanTriangles, triangleCentroid, type Tri } from "../../src/render/clip";
import { insideOccluder } from "../../src/boards/clipSolid";
import { kleinBoard, torusBoard } from "../../src/boards/surfaces";
import type { Vec3 } from "../../src/boards/core";

// The cut the 3D renderer makes where an immersion passes through itself: the
// enclosed sheet is dropped so the hole can be looked down (Klein bottle).
// What the region *is* is `clipSolid.test.ts`; this is the renderer's face of
// it — the fan, the cut, and where a cut cell's number ends up.

const SQUARE: Vec3[] = [
  [-1, -1, 0],
  [1, -1, 0],
  [1, 1, 0],
  [-1, 1, 0],
];

function area(tris: readonly Tri[]): number {
  let total = 0;
  for (const [a, b, c] of tris) {
    const u = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
    const v = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
    total +=
      Math.hypot(
        u[1]! * v[2]! - u[2]! * v[1]!,
        u[2]! * v[0]! - u[0]! * v[2]!,
        u[0]! * v[1]! - u[1]! * v[0]!,
      ) / 2;
  }
  return total;
}

describe("surface clip", () => {
  const square = fanTriangles(SQUARE, [0, 0, 0]);

  it("fans a polygon from its centre, in polygon winding", () => {
    expect(square).toHaveLength(4);
    expect(square[0]).toEqual([[0, 0, 0], SQUARE[0], SQUARE[1]]);
    expect(area(square)).toBeCloseTo(4);
  });

  it("passes geometry through untouched when there is nothing to cut", () => {
    expect(clipTriangles(square, null)).toBe(square);
    expect(clipTriangles(square, [])).toBe(square);
  });

  it("weights a cut cell's centre onto the material that is left", () => {
    const right: Tri[] = [
      [
        [0, -1, 0],
        [1, -1, 0],
        [1, 1, 0],
      ],
      [
        [0, -1, 0],
        [1, 1, 0],
        [0, 1, 0],
      ],
    ];
    expect(triangleCentroid(right)![0]).toBeCloseTo(0.5);
    expect(triangleCentroid([])).toBeNull();
  });

  it("takes a real Klein cell's enclosed patch off it, and only that", () => {
    const board = kleinBoard(16, 8, 20);
    const { solid, cells, occluder } = board.clip!;
    expect(cells.size).toBeGreaterThan(0);
    for (const cell of cells) {
      const poly = board.polygons.get(cell)!;
      const whole = fanTriangles(poly, centroid(poly));
      const cut = clipTriangles(whole, solid);
      expect(area(cut)).toBeGreaterThan(0); // a piece, never the whole cell
      expect(area(cut)).toBeLessThan(area(whole));
      // Nothing of substance is left standing inside the neck, and the cell's
      // number moves onto what survives.
      for (const tri of cut) {
        if (area([tri]) < area(whole) * 1e-4) continue; // a rounding sliver
        expect(insideOccluder(occluder, triangleCentroid([tri])!)).toBe(false);
      }
      expect(triangleCentroid(cut)).not.toBeNull();
    }
    expect(torusBoard(12, 6, 9).clip).toBeNull();
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
