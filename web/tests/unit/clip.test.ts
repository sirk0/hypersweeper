import { describe, expect, it } from "vitest";
import { clipTriangles, fanTriangles, triangleCentroid, type Tri } from "../../src/render/clip";
import { kleinBoard, torusBoard } from "../../src/boards/surfaces";
import type { Vec3 } from "../../src/boards/core";

// The cut the 3D renderer makes where an immersion passes through itself: the
// enclosed sheet is dropped so the hole can be looked down (Klein bottle).

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

  it("passes geometry through untouched when there is no field", () => {
    expect(clipTriangles(square, null)).toBe(square);
  });

  it("keeps a polygon the field never reaches, drops one it swallows", () => {
    expect(area(clipTriangles(square, () => 1))).toBeCloseTo(4);
    expect(clipTriangles(square, () => -1)).toEqual([]);
  });

  it("cuts a straight field exactly at its zero line", () => {
    // x >= 0 keeps the right half of the 2x2 square
    expect(area(clipTriangles(square, (p) => p[0]))).toBeCloseTo(2);
    // a quarter: x >= 0 and y >= 0 applied one after the other
    const half = clipTriangles(square, (p) => p[0]);
    expect(area(clipTriangles(half, (p) => p[1]))).toBeCloseTo(1);
  });

  it("follows a curved field, which flat corner tests would miss", () => {
    // a disc of radius 0.5 punched out of the middle of the square: every
    // corner of every fan triangle is outside it, so the cut only shows up
    // because the clipper subdivides first. The boundary is straight per leaf,
    // so the hole comes out a hair small — within a few percent of the disc.
    const punched = clipTriangles(square, (p) => Math.hypot(p[0], p[1]) - 0.5);
    const hole = 4 - area(punched);
    expect(hole).toBeGreaterThan(Math.PI * 0.25 * 0.9);
    expect(hole).toBeLessThan(Math.PI * 0.25 * 1.1);
    for (const tri of punched) {
      for (const p of tri) expect(Math.hypot(p[0], p[1])).toBeGreaterThan(0.49);
    }
  });

  it("weights a cut cell's centre onto the material that is left", () => {
    const right = clipTriangles(square, (p) => p[0]);
    expect(triangleCentroid(right)![0]).toBeCloseTo(0.5);
    expect(triangleCentroid([])).toBeNull();
  });

  it("takes a real Klein cell's enclosed patch off it, and only that", () => {
    const board = kleinBoard(16, 8, 20);
    const { field, cells } = board.clip!;
    for (const cell of cells) {
      const poly = board.polygons.get(cell)!;
      const whole = fanTriangles(poly, centroid(poly));
      const cut = clipTriangles(whole, field);
      expect(area(cut)).toBeGreaterThan(0); // a piece, never the whole cell
      expect(area(cut)).toBeLessThan(area(whole));
      // Nothing of substance is left standing inside the neck: the cut edge is
      // straight per leaf triangle, so what survives can only reach a sliver
      // (here under a fiftieth of a cell) past the curved boundary.
      const size = Math.sqrt(area(whole));
      for (const tri of cut) {
        expect(field(triangleCentroid([tri])!)).toBeGreaterThan(-size / 50);
      }
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
