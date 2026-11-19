import { describe, expect, it } from "vitest";
import type { Board, Vertex } from "../src/core";
import { grownExtension, latticeOf, periodicExtension, placeIn } from "../src/extension";
import { carpetBoard } from "../src/fractal";
import { hexhexBoard, squareBoard } from "../src/tilings";

// A finished board's tiling carried on past its edge (src/extension.ts): found
// from the board's own periods, or by finding the board in a bigger patch of
// its tiling.

const cellsOf = (board: Board): Vertex[][] => [...board.polygons.values()];
const midOf = (board: Board): Vertex => [board.width / 2, board.height / 2];

const centre = (poly: readonly Vertex[]): Vertex => [
  poly.reduce((s, p) => s + p[0], 0) / poly.length,
  poly.reduce((s, p) => s + p[1], 0) / poly.length,
];

function inside(poly: readonly Vertex[], [x, y]: Vertex): boolean {
  let hit = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i]!;
    const [xj, yj] = poly[j]!;
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) hit = !hit;
  }
  return hit;
}

/** Whether any of `cells` overlaps one of `own`: its centre inside it. */
function overlaps(own: readonly Vertex[][], cells: readonly Vertex[][]): boolean {
  return cells.some((c) => own.some((p) => inside(p, centre(c))));
}

describe("a periodic board's tiling", () => {
  it("finds the square grid's two unit periods", () => {
    const board = squareBoard(5, 7, 32);
    const [a, b] = latticeOf(cellsOf(board), midOf(board))!;
    expect(Math.hypot(...a)).toBeCloseTo(32, 6);
    expect(Math.hypot(...b)).toBeCloseTo(32, 6);
    expect(Math.abs(a[0] * b[1] - a[1] * b[0])).toBeCloseTo(32 * 32, 6);
  });

  it("lays the grid on round the board, on its lattice and never over it", () => {
    const board = squareBoard(9, 9, 32);
    const ext = periodicExtension(cellsOf(board), midOf(board))!;
    expect(ext.reach).toBe(Infinity);
    const cells = ext.cells(1000);
    // every square within the radius but the board's own 81
    expect(cells.length).toBeGreaterThan(0.9 * ((Math.PI * 1000 ** 2) / 32 ** 2) - 81);
    for (const c of cells) {
      for (const [x, y] of c) {
        expect(Math.abs(x / 32 - Math.round(x / 32))).toBeLessThan(1e-9);
        expect(Math.abs(y / 32 - Math.round(y / 32))).toBeLessThan(1e-9);
      }
    }
    expect(overlaps(cellsOf(board), cells)).toBe(false);
  });

  it("carries a hexagonal board on as hexagons that meet it edge to edge", () => {
    const board = hexhexBoard(3);
    const cells = periodicExtension(cellsOf(board), midOf(board))!.cells(400);
    expect(cells.length).toBeGreaterThan(100);
    expect(cells.every((c) => c.length === 6)).toBe(true);
    expect(overlaps(cellsOf(board), cells)).toBe(false);
    const corners = new Set(
      cellsOf(board)
        .flat()
        .map(([x, y]) => `${x.toFixed(3)},${y.toFixed(3)}`),
    );
    const touching = cells.filter((c) =>
      c.some(([x, y]) => corners.has(`${x.toFixed(3)},${y.toFixed(3)}`)),
    );
    expect(touching.length).toBe(6 * 4); // the 4th ring of a radius-3 hexhex
  });

  it("measures a board too small to show its period off a wider patch round it", () => {
    // one square: no two periods to see, until a wider patch is handed over
    const one = [squareBoard(1, 1, 32).polygons.values().next().value!];
    const mid: Vertex = [16, 16];
    expect(periodicExtension(one, mid)).toBeNull();
    const wide = cellsOf(squareBoard(3, 3, 32));
    const ext = periodicExtension(one, mid, wide)!;
    const cells = ext.cells(100);
    expect(overlaps(one, cells)).toBe(false);
    // and the wider patch's other eight are carried on with the rest
    expect(
      cells.filter((c) => c.every(([x, y]) => x >= 0 && y >= 0 && x <= 96 && y <= 96)),
    ).toHaveLength(8);
  });
});

describe("a board found in a bigger patch", () => {
  it("finds the Sierpinski carpet in the next level up and keeps its holes", () => {
    const board = carpetBoard(2, 10);
    const cells = cellsOf(board);
    expect(placeIn(cells, midOf(board), cellsOf(carpetBoard(3, 10)))).not.toBeNull();
    const ext = grownExtension(cells, midOf(board), [
      cellsOf(carpetBoard(3, 10)),
      cellsOf(carpetBoard(4, 10)),
    ])!;
    expect(ext.reach).toBeGreaterThan(board.width);
    // nothing inside the board's square: what is not board there is a hole
    expect(
      ext.cells(Infinity).some((c) => {
        const [x, y] = centre(c);
        return x > 0 && x < board.width && y > 0 && y < board.height;
      }),
    ).toBe(false);
  });

  it("finds a board turned, mirrored and scaled in its patch", () => {
    const board = squareBoard(2, 3, 10);
    // the patch: a bigger grid, mirrored, turned a quarter and twice the size
    const patch = cellsOf(squareBoard(8, 8, 10)).map((c) =>
      c.map(([x, y]): Vertex => [-2 * y, -2 * x]),
    );
    const place = placeIn(cellsOf(board), midOf(board), patch)!;
    expect(place).not.toBeNull();
    for (const c of cellsOf(board)) {
      const [x, y] = place.from(place.to(centre(c)));
      expect(x).toBeCloseTo(centre(c)[0], 9);
      expect(y).toBeCloseTo(centre(c)[1], 9);
    }
  });
});
