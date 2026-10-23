import { describe, expect, it } from "vitest";
import { buildBoard } from "../../src/boards/presets";
import { boundaryComponents, eulerCharacteristic, type Board } from "../../src/boards/core";
import {
  binaryBoard,
  hyperbolicBoard,
  hyperbolicFaces,
  hyperbolicUniformBoard,
  wythoffMode,
  type WythoffOp,
} from "../../src/boards/hyperbolic";
import { classifyShapes, corners } from "../../src/render/shapePalette";
import { HYPERBOLIC_MODES } from "../../src/boards/catalog";

// The {p,q} boards in the Poincaré disc. The conformance oracle already holds
// the port to the Python builder's boards; these pin what a picture of one has
// to get right, which the oracle cannot see.
const TILINGS: [number, number][] = [
  [8, 3],
  [7, 3],
  [6, 4],
  [5, 4],
  [5, 5],
  [4, 5],
  [4, 6],
  [3, 7],
  [3, 8],
];

describe("the hyperbolic boards", () => {
  it("grow the rings the {p,q} construction gives", () => {
    const counts = (p: number, q: number): number[] => {
      const { ringOf } = hyperbolicFaces(p, q, 4);
      return [0, 1, 2, 3, 4].map((r) => ringOf.filter((x) => x === r).length);
    };
    expect(counts(8, 3)).toEqual([1, 8, 32, 120, 448]);
    expect(counts(7, 3)).toEqual([1, 7, 21, 56, 147]);
    expect(counts(6, 4)).toEqual([1, 12, 72, 420, 2448]);
    expect(counts(5, 4)).toEqual([1, 10, 40, 150, 560]);
    expect(counts(5, 5)).toEqual([1, 15, 105, 720, 4935]);
    expect(counts(4, 5)).toEqual([1, 12, 48, 180, 672]);
    expect(counts(4, 6)).toEqual([1, 16, 96, 560, 3264]);
    // the triangle tilings are centred on a vertex: ring 0 is its q triangles
    expect(counts(3, 7)).toEqual([7, 28, 77, 203, 532]);
    expect(counts(3, 8)).toEqual([8, 40, 152, 568, 2120]);
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

  it("centre a triangle tiling on a vertex, its q triangles round it", () => {
    for (const q of [7, 8]) {
      const board = hyperbolicBoard(3, q, 9, 1);
      for (let cell = 0; cell < q; cell++) {
        const hit = board.polygons
          .get(String(cell))!
          .some(([x, y]) => Math.abs(x - board.width / 2) < 1e-9 && Math.abs(y - board.height / 2) < 1e-9);
        expect(hit, `{3,${q}} cell ${cell}`).toBe(true);
      }
    }
  });

  it("refuse a tiling that is not hyperbolic", () => {
    for (const [p, q] of [
      [4, 4],
      [6, 3],
      [5, 3],
      [3, 6],
    ] as const) {
      expect(() => hyperbolicBoard(p, q, 3, 1)).toThrow();
    }
  });
});

// Wythoff's operations on {7,3}: the vertex configuration each makes, and the
// neighbours an inner tile of each side count has. Mirrors `_WYTHOFF` in
// tests/test_boards.py.
const UNIFORM: [WythoffOp, string, Record<number, number>][] = [
  ["ambo", "3.7.3.7", { 3: 6, 7: 14 }],
  ["zip", "6.6.7", { 6: 6, 7: 7 }],
  ["expand", "3.4.7.4", { 3: 6, 4: 8, 7: 14 }],
  ["bevel", "4.6.14", { 4: 4, 6: 6, 14: 14 }],
];

describe("the uniform hyperbolic boards", () => {
  it("are named by their vertex configuration", () => {
    for (const [op, config] of UNIFORM) {
      expect(wythoffMode(7, 3, op)).toBe(`hyperbolic${config.replaceAll(".", "")}`);
      expect(HYPERBOLIC_MODES).toContain(wythoffMode(7, 3, op));
    }
  });

  it("give an inner tile the neighbours its shape has", () => {
    for (const [op, config, degree] of UNIFORM) {
      const board = hyperbolicUniformBoard(7, 3, op, 30, 1);
      const most = new Map<number, number>();
      for (const [cell, poly] of board.polygons) {
        const n = corners(poly, board.cornerMask!.get(cell)).length;
        most.set(n, Math.max(most.get(n) ?? 0, board.adjacency.get(cell)!.length));
      }
      expect(Object.fromEntries(most), config).toEqual(degree);
    }
  });

  it("colour one class per side count, and keep the central heptagon in the middle", () => {
    for (const [op, config, degree] of UNIFORM) {
      const board = hyperbolicUniformBoard(7, 3, op, 20, 1);
      const tones = classifyShapes(board.polygons, board.cornerMask, board.curved);
      const sides = new Set([...tones.values()].map((t) => t.sides));
      expect([...sides].sort((a, b) => a - b), config).toEqual(Object.keys(degree).map(Number));
      expect(new Set([...tones.values()].map((t) => JSON.stringify(t))).size, config).toBe(sides.size);
      const centre = corners(board.polygons.get("0")!, board.cornerMask!.get("0")!);
      expect(centre.length).toBe(op === "bevel" ? 14 : 7);
      const mx = centre.reduce((s, v) => s + v[0]!, 0) / centre.length;
      expect(mx).toBeCloseTo(board.width / 2, 9);
    }
  });
});

// Böröczky's binary tiling, in the upper half-plane rather than the disc. The
// conformance oracle holds it to the Python board; these pin the half-plane
// the renderer pans it in, and what makes it read as one tile.
describe("the binary tiling", () => {
  it("is top * (2^levels - 1) cells in a rectangle, at every difficulty", () => {
    for (const difficulty of ["easy", "medium", "hard"]) {
      const board = buildBoard("hyperbolicbinary", difficulty) as Board;
      expect(board.disc).toBeUndefined();
      expect(eulerCharacteristic(board), difficulty).toBe(1);
      expect(boundaryComponents(board), difficulty).toBe(1);
      const area = [...board.polygons.values()].reduce((sum, poly) => {
        const xs = poly.map((p) => p[0]);
        const ys = poly.map((p) => p[1]);
        return sum + (Math.max(...xs) - Math.min(...xs)) * (Math.max(...ys) - Math.min(...ys));
      }, 0);
      expect(area / (board.width * board.height)).toBeCloseTo(1, 9);
    }
    expect(binaryBoard(2, 7, 0).adjacency.size).toBe(254);
    expect(binaryBoard(3, 5, 0).adjacency.size).toBe(93);
  });

  it("gives an interior tile 2 beside, 4 below and 2 above", () => {
    const levels = 7;
    const board = binaryBoard(2, levels, 0, 2 ** (levels - 1));
    let checked = 0;
    for (const [cell, others] of board.adjacency) {
      const [row, j] = cell.split(",").map(Number) as [number, number];
      const poly = board.polygons.get(cell)!;
      const xs = poly.map((p) => p[0]);
      if (row === 0 || row === levels - 1) continue;
      if (Math.min(...xs) === 0 || Math.max(...xs) === board.width) continue;
      const rows = others.map((o) => Number(o.split(",")[0]) - row);
      expect(others.length).toBe(8);
      expect(rows.filter((d) => d === 0).length).toBe(2);
      expect(rows.filter((d) => d === 1).length).toBe(4);
      expect(rows.filter((d) => d === -1).length).toBe(2);
      // the parent, and its neighbour on this tile's own side
      const above = others.filter((o) => Number(o.split(",")[0]) === row - 1);
      const side = j % 2 === 0 ? -1 : 1;
      expect(new Set(above)).toEqual(new Set([`${row - 1},${j >> 1}`, `${row - 1},${(j >> 1) + side}`]));
      checked++;
    }
    expect(checked).toBeGreaterThan(50);
  });

  it("colours every cell as one four-sided shape, at every size", () => {
    const board = binaryBoard(2, 6, 0);
    const tones = classifyShapes(board.polygons, board.cornerMask, board.curved);
    const kinds = new Set([...tones.values()].map((t) => JSON.stringify(t)));
    expect(kinds.size).toBe(1);
    expect([...tones.values()][0]!.sides).toBe(4);
  });

  it("puts the ideal line one bottom row below the board", () => {
    const board = binaryBoard(2, 5, 0, 320);
    // bottom-row tiles are 320 / 16 = 20px, and the board ends one of them
    // above the line y = 0
    expect(board.halfPlane).toEqual({ boundary: board.height + 20, maxZoom: 16 });
    const bottom = Math.max(...[...board.polygons.values()].flat().map((p) => p[1]));
    expect(board.halfPlane!.boundary - bottom).toBeCloseTo(20, 9);
  });
});
