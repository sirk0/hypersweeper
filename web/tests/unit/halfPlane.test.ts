import { describe, expect, it } from "vitest";
import { halfPlaneApply, halfPlaneDrag } from "../../src/render/halfPlane";

// The board-space map a drag on a half-plane board asks for (the binary
// tiling, render/halfPlane.ts). The renderer turns it into a zoom and a pan of
// the ordinary flat camera, which tests/e2e/halfPlanePan.spec.ts drives.

const LINE = -100;

/** The half-plane's own distance between two points of it, with the ideal
 * line at y = LINE. */
function dist(p: readonly [number, number], q: readonly [number, number]): number {
  const [x1, y1] = [p[0], p[1] - LINE];
  const [x2, y2] = [q[0], q[1] - LINE];
  return Math.acosh(1 + ((x2 - x1) ** 2 + (y2 - y1) ** 2) / (2 * y1 * y2));
}

describe("halfPlaneDrag", () => {
  it("moves the point under the finger exactly to the finger", () => {
    const move = halfPlaneDrag([10, -90], [40, -40], LINE, 1, 64)!;
    const [x, y] = halfPlaneApply(move, [10, -90]);
    expect(x).toBeCloseTo(40, 9);
    expect(y).toBeCloseTo(-40, 9);
    // up from 10 above the line to 60 above it: six times the size
    expect(move.a).toBeCloseTo(6, 9);
  });

  it("is an isometry of the half-plane, and keeps the ideal line where it is", () => {
    const move = halfPlaneDrag([-30, -95], [25, -20], LINE, 2, 64)!;
    const points: [number, number][] = [[0, -50], [80, -99], [-60, 30], [5, 200]];
    for (const p of points) {
      for (const q of points) {
        if (p === q) continue;
        expect(dist(halfPlaneApply(move, p), halfPlaneApply(move, q))).toBeCloseTo(dist(p, q), 9);
      }
    }
    expect(halfPlaneApply(move, [123, LINE])[1]).toBeCloseTo(LINE, 9);
  });

  it("holds the zoom to [1, maxZoom], still following the finger along the line", () => {
    // a drag down at zoom 1 would shrink the board: the zoom stays, the x follows
    const down = halfPlaneDrag([0, 0], [15, -50], LINE, 1, 64)!;
    expect(down.a).toBe(1);
    expect(halfPlaneApply(down, [0, 0])[0]).toBeCloseTo(15, 9);
    // ...and a drag up at the ceiling magnifies no further
    const up = halfPlaneDrag([0, -95], [0, 0], LINE, 64, 64);
    expect(up).toBeNull();
    const capped = halfPlaneDrag([0, -95], [0, 0], LINE, 32, 64)!;
    expect(capped.a).toBeCloseTo(2, 9);
  });

  it("does nothing for a finger on or past the ideal line", () => {
    expect(halfPlaneDrag([0, LINE], [0, 0], LINE, 1, 64)).toBeNull();
    expect(halfPlaneDrag([0, 0], [0, LINE - 5], LINE, 1, 64)).toBeNull();
    expect(halfPlaneDrag([5, 5], [5, 5], LINE, 1, 64)).toBeNull();
  });
});
