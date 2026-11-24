import { describe, expect, it } from "vitest";
import { ARC_DEPTHS, arc, arcMark, jigsaw, mirrored, partner } from "../../src/geometry/marks";
import { selfTurns, type XY } from "../../src/geometry/shape";
import { CURVED, LEVELS, arcDepthOf, boardKeys, levelByKey } from "../../src/levels";
import { Puzzle } from "../../src/puzzle";
import { jigsawPoints } from "../../src/view/curve";

describe("arc marks", () => {
  const depths = ARC_DEPTHS.map((_, d) => d);
  it("an arc's partner bulges the other way, at its depth, and a mirror keeps it", () => {
    for (const depth of depths) {
      const out = arcMark(true, depth);
      const inward = arcMark(false, depth);
      expect(partner(out)).toBe(inward);
      expect(partner(inward)).toBe(out);
      expect(mirrored(out)).toBe(out);
      expect(arc(out)).toEqual({ out: true, depth });
      expect(arc(inward)).toEqual({ out: false, depth });
      expect(jigsaw(out)).toBeNull();
    }
  });

  const a: XY = [0.3, -0.2];
  const b: XY = [2.1, 0.9];

  it("draws an arc out a → b as the very line of one in b → a, corner to corner", () => {
    for (const depth of depths) {
      const out = jigsawPoints(a, b, arcMark(true, depth))!;
      const back = [...jigsawPoints(b, a, arcMark(false, depth))!].reverse();
      out.slice(0, -1).forEach((p, i) => {
        expect(p[0]).toBeCloseTo(back[i + 1]![0], 9);
        expect(p[1]).toBeCloseTo(back[i + 1]![1], 9);
      });
      expect(out.at(-1)![0]).toBeCloseTo(b[0], 12);
      expect(out.at(-1)![1]).toBeCloseTo(b[1], 12);
      // out of the tile: to the right of a → b
      const right = out.some(
        ([x, y]) => (b[0] - a[0]) * (y - a[1]) - (b[1] - a[1]) * (x - a[0]) < -1e-6,
      );
      expect(right).toBe(true);
    }
  });
});

describe("curved levels", () => {
  it("are listed with the matching rules, one per tiling CURVED names", () => {
    for (const of of CURVED) {
      const level = LEVELS.find((l) => l.key === `${of}.curved`);
      expect(level?.group, of).toBe("rules");
      expect(level!.decor).toMatchObject({ of, rules: true, label: "curves" });
    }
  });

  const boards = CURVED.flatMap((of) => boardKeys(`${of}.curved`));

  it.each(boards)("%s: every shared edge an arc against its partner, or straight", (key) => {
    const level = levelByKey(key)!;
    const { ring } = level;
    const marks = new Map<string, number>();
    let arcs = 0;
    for (const cell of level.cells)
      for (const { verts, marks: own } of cell)
        verts.forEach((v, e) => {
          const w = verts[(e + 1) % verts.length]!;
          marks.set(`${ring.key(v)}>${ring.key(w)}`, own![e]!);
          if (arc(own![e]!)) arcs++;
        });
    let shared = 0;
    for (const [edge, mark] of marks) {
      const [v, w] = edge.split(">");
      const across = marks.get(`${w}>${v}`);
      if (across === undefined) continue;
      shared++;
      expect(across, key).toBe(partner(mark));
    }
    expect(shared).toBeGreaterThan(0);
    expect(arcs).toBeGreaterThan(0);
    // the rim is cut as the tiles along it are
    expect(level.regionMarks!.length).toBe(level.region.length);
  });

  it.each(boards)("%s: the board's own tiles finish it", (key) => {
    const puzzle = new Puzzle(levelByKey(key)!);
    puzzle.layOwn();
    expect(puzzle.won).toBe(true);
  });

  it.each(CURVED)("%s.curved: arcs as deep as keep every tray tile clear of itself", (of) => {
    const level = levelByKey(`${of}.curved`)!;
    const depth = level.tiles
      .flatMap((t) => t.pieces.flatMap((p) => p.marks ?? []))
      .map((m) => arc(m)?.depth)
      .find((d) => d !== undefined);
    expect(depth).toBeDefined();
    expect(arcDepthOf(level.tiles)).toBe(depth);
  });

  it.each(CURVED)("%s.curved: the curves break a tile's turns, so they ask for turning", (of) => {
    const plain = levelByKey(of)!;
    const curved = levelByKey(`${of}.curved`)!;
    const turns = (l: typeof plain): number[] => l.tiles.map((t) => selfTurns(t).length);
    expect(turns(curved).some((n, i) => n < turns(plain)[i]!)).toBe(true);
  });
});
