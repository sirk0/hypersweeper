import { describe, expect, it } from "vitest";
import { hyperbolicBoard, type Board, type Vertex } from "@tiling/geometry";
import { boardExtension } from "../../src/modes/extension";
import { buildBoard, grownBoards, grows } from "../../src/modes/presets";

// Hypersweeper's side of a won board's tiling carried on past its edge
// (modes/extension.ts): which boards have one, and that each growing mode's
// board is found in the patches its builder grows. The geometry itself is
// tested with the package (packages/geometry/tests/extension.test.ts).

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

describe("a board found in its grown patches", () => {
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
