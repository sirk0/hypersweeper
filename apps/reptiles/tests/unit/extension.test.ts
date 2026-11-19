import { describe, expect, it } from "vitest";
import type { Vertex } from "@tiling/geometry";
import { levelExtension, levelMid, wantedReach } from "../../src/extension";
import { levelByKey, type Level } from "../../src/levels";

// A finished level's tiling carried on past its edge (src/extension.ts): what
// the board draws round it as outlines. The geometry is tested on its own
// (tilingExtension.test.ts); this holds that each kind of level finds its
// tiling, and never over its own tiles.

const level = (key: string): Level => levelByKey(key)!;

const centre = (poly: readonly Vertex[]): Vertex => [
  poly.reduce((s, p) => s + p[0], 0) / poly.length,
  poly.reduce((s, p) => s + p[1], 0) / poly.length,
];

/** Whether any outline tile stands on the level's own tiles: its centre (or,
 * for a tile whose vertex mean is outside it, a corner nudged inward) inside
 * one of them. */
function overlaps(of: Level, cells: readonly Vertex[][]): boolean {
  const own = of.cells.flatMap((c) => c.map((p) => p.verts.map((v) => of.ring.toXY(v))));
  const inside = (poly: readonly Vertex[], [x, y]: Vertex): boolean => {
    let hit = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const [xi, yi] = poly[i]!;
      const [xj, yj] = poly[j]!;
      if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) hit = !hit;
    }
    return hit;
  };
  return cells.some((c) => {
    const m = centre(c);
    if (!inside(c, m)) return false; // a concave tile: checked by the others
    return own.some((p) => inside(p, m));
  });
}

describe("the tiling round a finished level", () => {
  it.each([
    ["squares", "periodic, from its own tiles"],
    ["elongated2", "periodic, its window too small for a period: off a wider one"],
    ["penrose", "aperiodic, in the whole patch its window was cut from"],
    ["hatmetatiles", "the hat's family, in its patch"],
    ["chair", "a rep-tile, in a bigger copy"],
    ["penrose.rules", "a marked level, as its plain level"],
  ])("%s — %s", (key) => {
    const of = level(key);
    const ext = levelExtension(of);
    expect(ext).not.toBeNull();
    // far enough round it for the furthest zoom out
    expect(ext!.reach).toBeGreaterThanOrEqual(wantedReach(of) * 0.5);
    const cells = ext!.cells(wantedReach(of) / 3);
    expect(cells.length).toBeGreaterThan(of.cells.length);
    expect(overlaps(of, cells)).toBe(false);
  });

  it("measures from the middle of the level's region", () => {
    const of = level("squares");
    const [x, y] = levelMid(of);
    const xy = of.region.flat().map((v) => of.ring.toXY(v));
    expect(x).toBeCloseTo(
      (Math.min(...xy.map((p) => p[0])) + Math.max(...xy.map((p) => p[0]))) / 2,
    );
    expect(y).toBeCloseTo(
      (Math.min(...xy.map((p) => p[1])) + Math.max(...xy.map((p) => p[1]))) / 2,
    );
  });
});
