import { describe, expect, it } from "vitest";
import { klaassenTiles, z7ToXy } from "../../src/boards/aperiodic";
import {
  insetMitres,
  labelPoint,
  polygonInradius,
  starShapedAbout,
} from "../../src/render/boardMesh";

// Klaassen's heptagon is the one cell in the game with no point that sees all
// of it, so the renderer centres it on its pole of inaccessibility and cuts its
// loops as mitred insets instead of pulls toward the vertex mean.
const chevron = klaassenTiles(1)[0]!.ids.map(z7ToXy);
const mean: [number, number] = [
  chevron.reduce((s, p) => s + p[0], 0) / chevron.length,
  chevron.reduce((s, p) => s + p[1], 0) / chevron.length,
];

describe("a cell with no centre", () => {
  it("is not star-shaped about its vertex mean, where convex cells are", () => {
    expect(starShapedAbout(chevron, mean)).toBe(false);
    const square: [number, number][] = [
      [0, 0],
      [1, 0],
      [1, 1],
      [0, 1],
    ];
    expect(starShapedAbout(square, [0.5, 0.5])).toBe(true);
  });

  it("centres on a point well inside it", () => {
    const p = labelPoint(chevron);
    // the biggest circle the chevron holds, against the mean's distance to an
    // edge it lies outside of
    expect(polygonInradius(chevron, p)).toBeGreaterThan(0.25);
    expect(polygonInradius(chevron, mean)).toBeLessThan(0.1);
  });

  it("insets every edge by the same distance", () => {
    const mitres = insetMitres(chevron);
    const d = 0.05;
    const inset = chevron.map((p, i): [number, number] => [
      p[0] + mitres[i]![0] * d,
      p[1] + mitres[i]![1] * d,
    ]);
    for (let i = 0; i < chevron.length; i++) {
      const [a, b] = [chevron[i]!, chevron[(i + 1) % chevron.length]!];
      const [p, q] = [inset[i]!, inset[(i + 1) % inset.length]!];
      const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
      const off = (r: readonly number[]) =>
        Math.abs((b[0] - a[0]) * (r[1]! - a[1]) - (b[1] - a[1]) * (r[0]! - a[0])) / len;
      expect(off(p)).toBeCloseTo(d, 9);
      expect(off(q)).toBeCloseTo(d, 9);
    }
  });
});
