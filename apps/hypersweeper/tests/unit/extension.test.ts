import { describe, expect, it } from "vitest";
import {
  carpetBoard,
  hexhexBoard,
  hyperbolicBoard,
  squareBoard,
  type Board,
  type Vertex,
} from "@tiling/geometry";
import { boardExtension, latticeOf, placeIn } from "../../src/modes/extension";
import { buildBoard, grownBoards, grows } from "../../src/modes/presets";

// The tiling a won board is carried on with past its edge (modes/extension.ts):
// found from the board's own periods, or by finding the board in a bigger
// patch of its tiling.

const centre = (poly: readonly Vertex[]): Vertex => [
  poly.reduce((s, p) => s + p[0], 0) / poly.length,
  poly.reduce((s, p) => s + p[1], 0) / poly.length,
];

/** Whether two tiles of a tiling overlap: one's centre inside the other. */
function inside(poly: readonly Vertex[], [x, y]: Vertex): boolean {
  let hit = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i]!;
    const [xj, yj] = poly[j]!;
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) hit = !hit;
  }
  return hit;
}

/** A point well inside a tile, concave or not (the chair's vertex mean is
 * its reflex corner): the middle of one of its ears. */
function interior(poly: readonly Vertex[]): Vertex {
  const n = poly.length;
  let turn = 0;
  for (let i = 0; i < n; i++) {
    const [ax, ay] = poly[i]!;
    const [bx, by] = poly[(i + 1) % n]!;
    turn += ax * by - bx * ay;
  }
  for (let i = 0; i < n; i++) {
    const a = poly[(i + n - 1) % n]!;
    const b = poly[i]!;
    const c = poly[(i + 1) % n]!;
    const cross = (b[0] - a[0]) * (c[1] - b[1]) - (b[1] - a[1]) * (c[0] - b[0]);
    if (cross * turn <= 1e-9) continue;
    const m: Vertex = [(a[0] + b[0] + c[0]) / 3, (a[1] + b[1] + c[1]) / 3];
    if (inside(poly, m)) return m;
  }
  return centre(poly);
}

function overlapsBoard(board: Board, cells: readonly Vertex[][]): boolean {
  const own = [...board.polygons.values()];
  return cells.some((c) => own.some((p) => inside(p, interior(c))));
}

describe("a periodic board's tiling", () => {
  it("finds the square grid's two unit periods", () => {
    const [a, b] = latticeOf(squareBoard(5, 7, 32))!;
    expect(Math.hypot(...a)).toBeCloseTo(32, 6);
    expect(Math.hypot(...b)).toBeCloseTo(32, 6);
    expect(Math.abs(a[0] * b[1] - a[1] * b[0])).toBeCloseTo(32 * 32, 6);
  });

  it("lays the grid on round the board, on its lattice and never over it", () => {
    const board = squareBoard(9, 9, 32);
    const ext = boardExtension(board, null)!;
    expect(ext.reach).toBe(Infinity);
    const cells = ext.cells(1000);
    // every square within the radius but the board's own 81
    const all = Math.PI * 1000 ** 2;
    expect(cells.length).toBeGreaterThan(0.9 * (all / 32 ** 2) - 81);
    for (const c of cells) {
      for (const [x, y] of c) {
        expect(Math.abs(x / 32 - Math.round(x / 32))).toBeLessThan(1e-9);
        expect(Math.abs(y / 32 - Math.round(y / 32))).toBeLessThan(1e-9);
      }
    }
    expect(overlapsBoard(board, cells)).toBe(false);
  });

  it("carries a hexagonal board on as hexagons that meet it edge to edge", () => {
    const board = hexhexBoard(3);
    const cells = boardExtension(board, null)!.cells(400);
    expect(cells.length).toBeGreaterThan(100);
    expect(cells.every((c) => c.length === 6)).toBe(true);
    expect(overlapsBoard(board, cells)).toBe(false);
    // the ring round the board shares its corners
    const corners = new Set(
      [...board.polygons.values()].flat().map(([x, y]) => `${x.toFixed(3)},${y.toFixed(3)}`),
    );
    const touching = cells.filter((c) =>
      c.some(([x, y]) => corners.has(`${x.toFixed(3)},${y.toFixed(3)}`)),
    );
    expect(touching.length).toBe(6 * 4); // the 4th ring of a radius-3 hexhex
  });
});

describe("a board found in a bigger patch", () => {
  it("finds the Sierpinski carpet in the next level up and keeps its holes", () => {
    const board = carpetBoard(2, 10);
    expect(placeIn(board, carpetBoard(3, 10))).not.toBeNull();
    const ext = boardExtension(board, [carpetBoard(3, 10), carpetBoard(4, 10)])!;
    expect(ext.reach).toBeGreaterThan(board.width);
    const cells = ext.cells(Infinity);
    // nothing inside the board's square: what is not board there is a hole
    expect(
      cells.some((c) => {
        const [x, y] = centre(c);
        return x > 0 && x < board.width && y > 0 && y < board.height;
      }),
    ).toBe(false);
  });

  it("finds every growing mode's board, easy, in its own grown patches", () => {
    // Only the cheap ones here; the rest is the e2e suite's (extension.spec.ts).
    for (const mode of ["chair", "phyllotaxis", "penrose"]) {
      expect(grows(mode)).toBe(true);
      const board = buildBoard(mode, "easy") as Board;
      const ext = boardExtension(board, grownBoards(mode, "easy", 3000), 2 * board.width);
      expect(ext, mode).not.toBeNull();
      expect(ext!.reach, mode).toBeGreaterThan(Math.hypot(board.width, board.height) / 2);
      expect(overlapsBoard(board, ext!.cells(Infinity)), mode).toBe(false);
    }
  });
});

it("a board drawn in a curved plane has no flat tiling round it", () => {
  expect(boardExtension(hyperbolicBoard(7, 3, 2, 300), null)).toBeNull();
});
