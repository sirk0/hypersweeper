import { describe, expect, it } from "vitest";
import { figureSetByKey, figureSetOf, figureSets, sameFigure } from "../../src/figures";
import { cyclotomic } from "../../src/geometry/cyclotomic";
import { posed, regular, type Shape } from "../../src/geometry/shape";
import { LEVELS } from "../../src/levels";

const Z4 = cyclotomic(4);
const Z12 = cyclotomic(12);

describe("sameFigure", () => {
  // a right triangle with legs 2 and 1: chiral, so its mirror image differs
  // from it by more than a turn
  const right: Shape = { ring: Z4, verts: [Z4.zero, [2, 0], [0, 1]] };

  it("is exact under a turn, a move and a mirror", () => {
    const moved = { ring: Z4, verts: posed(right, { rot: 1, flip: false, t: [5, -3] }) };
    const mirrored = { ring: Z4, verts: posed(right, { rot: 3, flip: true, t: [1, 1] }) };
    expect(sameFigure(right, moved)).toBe(true);
    expect(sameFigure(right, mirrored)).toBe(true);
    expect(sameFigure(mirrored, right)).toBe(true);
  });

  it("tells sizes apart, but not shapes at any size", () => {
    const big = { ring: Z4, verts: right.verts.map((v) => Z4.add(v, v)) };
    expect(sameFigure(right, big)).toBe(false);
    expect(sameFigure(right, big, false)).toBe(true);
    const other: Shape = { ring: Z4, verts: [Z4.zero, [3, 0], [0, 1]] };
    expect(sameFigure(right, other, false)).toBe(false);
  });

  it("matches a square across rings and drawing units", () => {
    expect(sameFigure(regular(Z4, 4), regular(Z12, 4))).toBe(true);
    // a square of side 2 in a ring that draws two units as one
    const halves = cyclotomic(12, 2);
    const two = { ring: halves, verts: regular(halves, 4).verts.map((v) => halves.add(v, v)) };
    expect(sameFigure(regular(Z4, 4), two)).toBe(true);
    expect(sameFigure(regular(Z12, 3), regular(Z12, 4))).toBe(false);
  });
});

describe("figure sets", () => {
  const sets = figureSets();

  it("puts every level under exactly one set, its tray", () => {
    for (const level of LEVELS) {
      const under = sets.filter((s) => s.levels.includes(level));
      expect(under, level.key).toHaveLength(1);
      expect(under[0]!.figures, level.key).toHaveLength(level.tiles.length);
      expect(figureSetOf(level)).toBe(under[0]);
    }
  });

  it("lists one figure first — the regular ones, then the Laves tiles — then pairs and packs", () => {
    const sizes = sets.map((s) => s.figures.length);
    expect(sizes).toEqual([...sizes].sort((a, b) => a - b));
    expect(sets.slice(0, 4).map((s) => [s.key, s.name])).toEqual([
      ["squares", "Square"],
      ["triangles", "Triangle"],
      ["hexagons", "Hexagon"],
      ["tetrakis", "V4.8²"],
    ]);
    expect(Math.max(...sizes)).toBe(4);
  });

  it("finds a regular tiling's tile in the isogonal tilings at the same size", () => {
    expect(figureSetByKey("squares")!.levels.map((l) => l.key)).toEqual([
      "squares",
      "offsetsquare",
    ]);
    expect(figureSetByKey("triangles")!.levels.map((l) => l.key)).toEqual([
      "triangles",
      "staggeredtri",
    ]);
    expect(figureSetByKey("elongated")!.name).toBe("Triangle + Square");
    expect(figureSetByKey("elongated")!.levels.map((l) => l.key)).toContain("snubsquare");
  });

  it("keeps a shape at another size a figure of its own", () => {
    const pythagorean = figureSetByKey("pythagorean")!;
    expect(pythagorean.name).toBe("Square + Square");
    expect(pythagorean.figures[0]!.id).not.toBe(pythagorean.figures[1]!.id);
    expect(figureSetByKey("threescaletri")!.figures).toHaveLength(3);
  });

  it("names the bricks and the aperiodic quadrilaterals by their shape", () => {
    expect(figureSetByKey("stackedbond")!.name).toBe("Rectangle");
    expect(figureSetByKey("stackedbond")!.levels).toHaveLength(4);
    expect(figureSetByKey("penrose")!.name).toBe("Rhombus + Rhombus");
    expect(figureSetByKey("kitedart")!.name).toBe("Dart + Kite");
  });
});
