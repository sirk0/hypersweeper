import { describe, expect, it } from "vitest";
import { buildBoard } from "../../src/boards/presets";
import { boundaryComponents, eulerCharacteristic, type Board } from "../../src/boards/core";
import { hyperbolicBoard, hyperbolicFaces } from "../../src/boards/hyperbolic";
import { classifyShapes, corners } from "../../src/render/shapePalette";
import { HYPERBOLIC_MODES } from "../../src/boards/catalog";

// The {p,q} boards in the Poincaré disc. The conformance oracle already holds
// the port to the Python builder's boards; these pin what a picture of one has
// to get right, which the oracle cannot see.
const TILINGS: [number, number][] = [
  [7, 3],
  [5, 4],
  [4, 5],
];

describe("the hyperbolic boards", () => {
  it("grow the rings the {p,q} construction gives", () => {
    const counts = (p: number, q: number): number[] => {
      const { ringOf } = hyperbolicFaces(p, q, 4);
      return [0, 1, 2, 3, 4].map((r) => ringOf.filter((x) => x === r).length);
    };
    expect(counts(7, 3)).toEqual([1, 7, 21, 56, 147]);
    expect(counts(5, 4)).toEqual([1, 10, 40, 150, 560]);
    expect(counts(4, 5)).toEqual([1, 12, 48, 180, 672]);
  });

  it("give an inner cell p(q - 2) neighbours", () => {
    for (const [p, q] of TILINGS) {
      const board = hyperbolicBoard(p, q, 12, 1);
      const degrees = [...board.adjacency.values()].map((n) => n.length);
      expect(Math.max(...degrees), `{${p},${q}}`).toBe(p * (q - 2));
      expect(board.adjacency.get("0")!.length).toBe(p * (q - 2));
    }
  });

  it("are discs at every difficulty", () => {
    for (const mode of HYPERBOLIC_MODES) {
      for (const difficulty of ["easy", "medium", "hard"]) {
        const board = buildBoard(mode, difficulty) as Board;
        expect(eulerCharacteristic(board), `${mode}/${difficulty}`).toBe(1);
        expect(boundaryComponents(board), `${mode}/${difficulty}`).toBe(1);
      }
    }
  });

  it("colour every cell as one shape: the corner mask hides the arc points", () => {
    // Every tile is the same regular p-gon in the hyperbolic plane; the disc
    // draws them at every size and bent by their arcs, but one tiling is one
    // colour. Without the mask a heptagon's 21 points read as a 21-gon.
    for (const [p, q] of TILINGS) {
      const board = hyperbolicBoard(p, q, 15, 1);
      const tones = classifyShapes(board.polygons, board.cornerMask, board.curved);
      const kinds = new Set([...tones.values()].map((t) => JSON.stringify(t)));
      expect(kinds.size, `{${p},${q}}`).toBe(1);
      expect([...tones.values()][0]!.sides).toBe(p);
      for (const [cell, poly] of board.polygons) {
        expect(corners(poly, board.cornerMask!.get(cell)).length).toBe(p);
      }
    }
  });

  it("sit the central polygon in the middle of the board", () => {
    const board = hyperbolicBoard(7, 3, 9, 1);
    const centre = corners(board.polygons.get("0")!, board.cornerMask!.get("0")!);
    const mx = centre.reduce((s, v) => s + v[0]!, 0) / centre.length;
    const my = centre.reduce((s, v) => s + v[1]!, 0) / centre.length;
    expect(mx).toBeCloseTo(board.width / 2, 9);
    expect(my).toBeCloseTo(board.height / 2, 9);
  });

  it("refuse a tiling that is not hyperbolic", () => {
    for (const [p, q] of [
      [4, 4],
      [6, 3],
      [5, 3],
    ] as const) {
      expect(() => hyperbolicBoard(p, q, 3, 1)).toThrow();
    }
  });
});
