import { describe, expect, it } from "vitest";
import { buildBoard } from "../../src/modes/presets";
import { boundaryComponents, eulerCharacteristic, type Board } from "../../src/boards/core";
import {
  binaryBoard,
  hyperbolicBoard,
  hyperbolicFaces,
  hyperbolicUniformBoard,
  ringsFor,
  wythoffMode,
  wythoffRingsFor,
  type WythoffOp,
} from "../../src/boards/hyperbolic";
import { classifyShapes, corners } from "../../src/render/shapePalette";
import { HYPERBOLIC_MODES } from "../../src/modes/catalog";

/** The first `shells` shells of a grown tiling, each face named by where its
 * corners are rather than by its index -- the uniform tilings number their
 * faces after the whole {p,q} tiling they grew, so a bigger one renumbers. */
function shellsByPlace(
  grown: { faces: number[][]; pos: Map<number, readonly [number, number]>; groups: number[][] },
  shells: number,
): string[][] {
  const place = (f: number): string =>
    grown.faces[f]!.map((v) => grown.pos.get(v)!.map((x) => x.toFixed(9)).join(",")).join(" ");
  return grown.groups.slice(0, shells).map((group) => group.map(place).sort());
}

// The {p,q} boards in the Poincaré disc. The conformance oracle already holds
// the port to the Python builder's boards; these pin what a picture of one has
// to get right, which the oracle cannot see.
const TILINGS: [number, number][] = [
  [9, 3],
  [8, 3],
  [7, 3],
  [7, 4],
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
    expect(counts(9, 3)).toEqual([1, 9, 45, 216, 1035]);
    expect(counts(8, 3)).toEqual([1, 8, 32, 120, 448]);
    expect(counts(7, 3)).toEqual([1, 7, 21, 56, 147]);
    expect(counts(7, 4)).toEqual([1, 14, 112, 882, 6944]);
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
      const board = hyperbolicBoard(p, q, 12);
      const degrees = [...board.adjacency.values()].map((n) => n.length);
      expect(Math.max(...degrees), `{${p},${q}}`).toBe(p * (q - 2));
      expect(board.adjacency.get("0")!.length).toBe(p * (q - 2));
    }
  });

  it("are discs at every difficulty", () => {
    // ...bar the closed surfaces in the same menu group, which are drawn in
    // the disc but are not one (tests/unit/hurwitz.test.ts)
    for (const mode of HYPERBOLIC_MODES.filter((m) => m.startsWith("hyperbolic"))) {
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
      const board = hyperbolicBoard(p, q, 15);
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
    const board = hyperbolicBoard(7, 3, 9);
    const centre = corners(board.polygons.get("0")!, board.cornerMask!.get("0")!);
    const mx = centre.reduce((s, v) => s + v[0]!, 0) / centre.length;
    const my = centre.reduce((s, v) => s + v[1]!, 0) / centre.length;
    expect(mx).toBeCloseTo(board.width / 2, 9);
    expect(my).toBeCloseTo(board.height / 2, 9);
  });

  it("centre a triangle tiling on a vertex, its q triangles round it", () => {
    for (const q of [7, 8]) {
      const board = hyperbolicBoard(3, q, 9);
      for (let cell = 0; cell < q; cell++) {
        const hit = board.polygons
          .get(String(cell))!
          .some(([x, y]) => Math.abs(x - board.width / 2) < 1e-9 && Math.abs(y - board.height / 2) < 1e-9);
        expect(hit, `{3,${q}} cell ${cell}`).toBe(true);
      }
    }
  });

  it("grow just the rings that hold every face inside the trim", () => {
    // a tiling grown a ring further must find nothing nearer that was missed
    for (const [p, q] of TILINGS) {
      for (const shells of [3, 12, 30]) {
        const grown = ringsFor(p, q, shells);
        expect(shellsByPlace(ringsFor(p, q, shells, grown.rings + 1), shells), `{${p},${q}} ${shells}`)
          .toEqual(shellsByPlace(grown, shells));
      }
    }
    // ...and stops as soon as it can: the hard {6,4} board's 475 cells are cut
    // from 4 rings (2953 faces), where a spare ring for safety grew 6 (100381)
    expect(ringsFor(6, 4, 31).rings).toBe(4);
  });

  it("refuse a tiling that is not hyperbolic", () => {
    for (const [p, q] of [
      [4, 4],
      [6, 3],
      [5, 3],
      [3, 6],
    ] as const) {
      expect(() => hyperbolicBoard(p, q, 3)).toThrow();
    }
  });
});

// Wythoff's operations on {p,q}: the vertex configuration each shipped board
// makes. An inner tile's neighbour count follows from it -- its sides on a
// trivalent tiling, twice them where four tiles meet. Mirrors `_WYTHOFF` in
// tests/test_boards.py.
const UNIFORM: [number, number, WythoffOp, string][] = [
  [7, 3, "ambo", "3.7.3.7"],
  [7, 3, "zip", "6.6.7"],
  [7, 3, "truncate", "3.14.14"],
  [7, 3, "expand", "3.4.7.4"],
  [7, 3, "bevel", "4.6.14"],
  [8, 3, "ambo", "3.8.3.8"],
  [8, 3, "zip", "6.6.8"],
  [8, 3, "truncate", "3.16.16"],
  [8, 3, "expand", "3.4.8.4"],
  [8, 3, "bevel", "4.6.16"],
  [5, 4, "ambo", "4.5.4.5"],
  [5, 4, "zip", "5.8.8"],
  [5, 4, "expand", "4.4.4.5"],
  [5, 4, "bevel", "4.8.10"],
  [5, 4, "truncate", "4.10.10"],
  [6, 4, "ambo", "4.6.4.6"],
  [6, 4, "zip", "6.8.8"],
  [6, 4, "expand", "4.4.4.6"],
  [6, 4, "bevel", "4.8.12"],
  [6, 4, "truncate", "4.12.12"],
  [5, 5, "zip", "5.10.10"],
  [9, 3, "zip", "6.6.9"],
];

/** An inner tile's neighbours, by its side count. */
function degrees(config: string): Record<number, number> {
  const ring = config.split(".").map(Number);
  return Object.fromEntries(ring.map((n) => [n, n * (ring.length - 2)]));
}

describe("the uniform hyperbolic boards", () => {
  it("are named by their vertex configuration", () => {
    for (const [p, q, op, config] of UNIFORM) {
      expect(wythoffMode(p, q, op)).toBe(`hyperbolic${config.replaceAll(".", "")}`);
      expect(HYPERBOLIC_MODES).toContain(wythoffMode(p, q, op));
    }
  });

  it("give an inner tile the neighbours its shape has", () => {
    for (const [p, q, op, config] of UNIFORM) {
      const board = hyperbolicUniformBoard(p, q, op, 30);
      const most = new Map<number, number>();
      for (const [cell, poly] of board.polygons) {
        const n = corners(poly, board.cornerMask!.get(cell)).length;
        most.set(n, Math.max(most.get(n) ?? 0, board.adjacency.get(cell)!.length));
      }
      expect(Object.fromEntries(most), config).toEqual(degrees(config));
    }
  });

  it("grow just the rings that hold every face inside the trim", () => {
    for (const [p, q, op, config] of UNIFORM) {
      for (const shells of [3, 20, 40]) {
        const grown = wythoffRingsFor(p, q, op, shells);
        const further = wythoffRingsFor(p, q, op, shells, grown.rings + 1);
        expect(shellsByPlace(further, shells), `${config} ${shells}`)
          .toEqual(shellsByPlace(grown, shells));
      }
    }
  });

  it("colour one class per side count, and keep the central face in the middle", () => {
    for (const [p, q, op, config] of UNIFORM) {
      const board = hyperbolicUniformBoard(p, q, op, 20);
      const tones = classifyShapes(board.polygons, board.cornerMask, board.curved);
      const sides = new Set([...tones.values()].map((t) => t.sides));
      expect([...sides].sort((a, b) => a - b), config).toEqual(Object.keys(degrees(config)).map(Number));
      expect(new Set([...tones.values()].map((t) => JSON.stringify(t))).size, config).toBe(sides.size);
      // the face on the central p-gon: the p-gon itself, or bevel's and
      // truncate's 2p-gon
      const centre = corners(board.polygons.get("0")!, board.cornerMask!.get("0")!);
      expect(centre.length, config).toBe(op === "bevel" || op === "truncate" ? 2 * p : p);
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
    expect(binaryBoard(2, 7).adjacency.size).toBe(254);
    expect(binaryBoard(3, 5).adjacency.size).toBe(93);
  });

  it("gives an interior tile 2 beside, 4 below and 2 above", () => {
    const levels = 7;
    const board = binaryBoard(2, levels, 2 ** (levels - 1));
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
    const board = binaryBoard(2, 6);
    const tones = classifyShapes(board.polygons, board.cornerMask, board.curved);
    const kinds = new Set([...tones.values()].map((t) => JSON.stringify(t)));
    expect(kinds.size).toBe(1);
    expect([...tones.values()][0]!.sides).toBe(4);
  });

  it("puts the ideal line one bottom row below the board", () => {
    const board = binaryBoard(2, 5, 320);
    // bottom-row tiles are 320 / 16 = 20px, and the board ends one of them
    // above the line y = 0
    expect(board.halfPlane).toEqual({ boundary: board.height + 20, maxZoom: 16 });
    const bottom = Math.max(...[...board.polygons.values()].flat().map((p) => p[1]));
    expect(board.halfPlane!.boundary - bottom).toBeCloseTo(20, 9);
  });
});
