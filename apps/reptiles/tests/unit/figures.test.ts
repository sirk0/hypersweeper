import { describe, expect, it } from "vitest";
import {
  allFigures,
  BUCKETS,
  figureSetByKey,
  figureSetOf,
  figureSets,
  sameFigure,
} from "../../src/figures";
import { cyclotomic } from "../../src/geometry/cyclotomic";
import { polygon, posed, regular, sides } from "../../src/geometry/shape";
import { LEVELS, levelByKey } from "../../src/levels";

const Z4 = cyclotomic(4);
const Z12 = cyclotomic(12);

describe("sameFigure", () => {
  // a right triangle with legs 2 and 1: chiral, so its mirror image differs
  // from it by more than a turn
  const right = polygon(Z4, [Z4.zero, [2, 0], [0, 1]]);

  it("is exact under a turn, a move and a mirror", () => {
    const moved = { ring: Z4, pieces: posed(right, { rot: 1, flip: false, t: [5, -3] }) };
    const mirrored = { ring: Z4, pieces: posed(right, { rot: 3, flip: true, t: [1, 1] }) };
    expect(sameFigure(right, moved)).toBe(true);
    expect(sameFigure(right, mirrored)).toBe(true);
    expect(sameFigure(mirrored, right)).toBe(true);
  });

  it("tells sizes apart, but not shapes at any size", () => {
    const big = polygon(
      Z4,
      right.pieces[0]!.verts.map((v) => Z4.add(v, v)),
    );
    expect(sameFigure(right, big)).toBe(false);
    expect(sameFigure(right, big, false)).toBe(true);
    const other = polygon(Z4, [Z4.zero, [3, 0], [0, 1]]);
    expect(sameFigure(right, other, false)).toBe(false);
  });

  it("matches a square across rings and drawing units", () => {
    expect(sameFigure(regular(Z4, 4), regular(Z12, 4))).toBe(true);
    // a square of side 2 in a ring that draws two units as one
    const halves = cyclotomic(12, 2);
    const two = polygon(
      halves,
      regular(halves, 4).pieces[0]!.verts.map((v) => halves.add(v, v)),
    );
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

  it("lists one figure by its sides, then one of several pieces, then regular pairs, irregular pairs and packs", () => {
    const rows = sets.map((s) => BUCKETS.indexOf(s.bucket));
    expect(rows).toEqual([...rows].sort((a, b) => a - b));
    const ONE = ["triangles", "quadrilaterals", "pentagons", "hexagons"];
    for (const set of sets) {
      const n = set.figures.length;
      const count = sides(set.figures[0]!.shape);
      const row = set.levels[0]!.decor
        ? "colourings"
        : n >= 3
          ? "packs"
          : n === 2
            ? set.figures.every((f) => f.regular)
              ? "regular-pairs"
              : "irregular-pairs"
            : set.figures[0]!.shape.pieces.length > 1
              ? "pieces"
              : (ONE[count - 3] ?? "polygons");
      expect(set.bucket, set.key).toBe(row);
    }
    expect(Math.max(...sets.map((s) => s.figures.length))).toBe(4);
  });

  it("puts a row's regular figure first, then the rest closest to regular first", () => {
    const row = (bucket: string) => sets.filter((s) => s.bucket === bucket);
    expect(row("triangles")[0]!.name).toBe("Triangle");
    expect(row("quadrilaterals")[0]!.name).toBe("Square");
    expect(row("hexagons")[0]!.name).toBe("Hexagon");
    for (const bucket of BUCKETS.slice(0, 5)) {
      const d = row(bucket).map((s) => s.figures[0]!.distortion);
      expect(d, bucket).toEqual([...d].sort((a, b) => a - b));
    }
    for (const f of allFigures()) expect(f.distortion === 0, f.name).toBe(f.regular);
    const pairs = sets.filter((s) => s.bucket === "regular-pairs").map((s) => s.key);
    expect(pairs[0]).toBe("elongated");
    expect(pairs.indexOf("elongated")).toBeLessThan(pairs.indexOf("trihex"));
    expect(pairs.indexOf("trihex")).toBeLessThan(pairs.indexOf("pythagorean"));
    expect(figureSetByKey("penrose")!.bucket).toBe("irregular-pairs");
    const packs = sets.filter((s) => s.bucket === "packs");
    expect(packs[0]!.key).toBe("threescaletri");
    expect(packs.at(-1)!.figures).toHaveLength(4);
  });

  it("joins a lone figure with its shape at another size, named for the shape", () => {
    const right = figureSetByKey("tetrakis")!;
    expect(right.name).toBe("Isosceles right triangle");
    expect(right.levels.map((l) => l.key)).toEqual(["tetrakis", "rightisosceles"]);
    const drafter = figureSetByKey("kisrhombille")!;
    expect(drafter.name).toBe("30-60-90 triangle");
    expect(drafter.levels.map((l) => l.key)).toEqual(["kisrhombille", "drafter"]);
    for (const [a, b] of [
      ["tetrakis", "rightisosceles"],
      ["kisrhombille", "drafter"],
    ] as const) {
      const [x, y] = [levelByKey(a)!, levelByKey(b)!];
      const [p, q] = [x.tiles[0]!, y.tiles[0]!];
      expect(sameFigure(p, q, false), `${a} ~ ${b}`).toBe(true);
      expect(sameFigure(p, q), `${a} = ${b}`).toBe(false);
    }
    expect(figureSetByKey("rightisosceles")).toBeUndefined();
    // pairs and packs still compare true sizes
    expect(figureSetByKey("pythagorean")!.figures).toHaveLength(2);
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
