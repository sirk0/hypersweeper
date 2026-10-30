import { archimedeanBoard, hexBoard, squareBoard, triangleGridBoard } from "@boards/tilings";
import type { Board } from "@boards/core";
import { describe, expect, it } from "vitest";
import { centroid, type XY } from "../../src/geometry/shape";
import { LEVELS, levelByKey } from "../../src/levels";
import { Puzzle } from "../../src/puzzle";

/** Finish a level; the number of tiles it took. */
function fill(p: Puzzle): number {
  if (!p.solve()) throw new Error("stuck");
  return p.tiles.length;
}

describe("puzzle", () => {
  it("every level can be filled, and needs exactly `needed` tiles", () => {
    for (const level of LEVELS) {
      const p = new Puzzle(level);
      expect(fill(p)).toBe(p.needed);
      expect(p.won).toBe(true);
    }
  });

  // Each level against the Hypersweeper builder it mirrors, at unit edge.
  // Both sides are moved to start at the origin (the builder draws y down,
  // these levels y up) and compared by tile centroids.
  const BUILDERS: Record<string, () => Board> = {
    squares: () => squareBoard(4, 4, 1),
    triangles: () => triangleGridBoard(4, 6, 1),
    hexagons: () => hexBoard(5, 4, 1),
  };
  const builderFor = (key: string): Board => {
    const { window } = levelByKey(key)!;
    return window ? archimedeanBoard(window.tiling, window.nx, window.ny, 1) : BUILDERS[key]!();
  };
  const centroids = (polys: XY[][]): string[] => {
    const all = polys.flat();
    const x0 = Math.min(...all.map((p) => p[0]));
    const y0 = Math.min(...all.map((p) => p[1]));
    return polys
      .map((poly) => centroid(poly.map(([x, y]): XY => [x - x0, y - y0])))
      // 4 decimals: Hypersweeper's tiling templates store positions rounded
      // to 6, so a centroid there can be 5e-7 off the exact one
      .map(([x, y]) => `${x.toFixed(4)},${y.toFixed(4)}`)
      .sort();
  };

  it.each(LEVELS.map((l) => l.key))("%s is Hypersweeper's board, tile for tile", (key) => {
    const p = new Puzzle(levelByKey(key)!);
    expect(p.level.region).toHaveLength(1); // one outline, no holes
    fill(p);
    const ours = p.tiles.map((t) => t.verts.map((v) => p.level.ring.toXY(v)));
    const board = builderFor(key);
    const theirs = [...board.polygons.values()].map((poly) => poly.map(([x, y]): XY => [x, -y]));
    expect(centroids(ours)).toEqual(centroids(theirs));
  });

  it.each(LEVELS.map((l) => l.key))("%s is about as wide as it is tall", (key) => {
    const { ring, region } = levelByKey(key)!;
    const xy = region.flat().map((v) => ring.toXY(v));
    const span = (i: 0 | 1): number => Math.max(...xy.map((p) => p[i])) - Math.min(...xy.map((p) => p[i]));
    expect(span(0) / span(1)).toBeGreaterThan(0.9);
    expect(span(0) / span(1)).toBeLessThan(1.1);
  });

  it("lifting a tile reopens exactly its spot", () => {
    const p = new Puzzle(levelByKey("squares")!);
    fill(p);
    const tile = p.tiles[5]!;
    p.lift(tile.id);
    expect(p.won).toBe(false);
    const c = centroid(tile.verts.map((v) => p.level.ring.toXY(v)));
    const spot = p.snap(0, c, 0.5, tile.rot)!;
    expect(spot.map((v) => p.level.ring.key(v)).sort()).toEqual(
      tile.verts.map((v) => p.level.ring.key(v)).sort(),
    );
    p.place(0, spot, tile.rot);
    expect(p.won).toBe(true);
  });

  it("a tile lands only as it is held", () => {
    const p = new Puzzle(levelByKey("triangles")!);
    const { ring } = p.level;
    const turn = p.level.turns[0]!;
    // The second triangle of the top row points down: its top side runs
    // from the outline's start (0) to 1, its centroid is (0.5, −√3/6). Held
    // as the tray has it, pointing up, a triangle cannot land there; turned
    // 60° it can.
    const spotFor = (rot: number) => p.snap(0, [0.5, -0.29], 0.3, rot);
    expect(spotFor(0)).toBeNull();
    expect(spotFor(turn)).not.toBeNull();
    // a triangle is the same after 120°, so two steps is the tray's way again
    expect(spotFor(2 * turn)).toBeNull();
    expect(spotFor(3 * turn)!.map((v) => ring.key(v)).sort()).toEqual(
      spotFor(turn)!.map((v) => ring.key(v)).sort(),
    );
  });

  it("offers a rotate control only where a turn changes the tile", () => {
    const can = (key: string): boolean => new Puzzle(levelByKey(key)!).canTurn(0);
    expect(can("squares")).toBe(false);
    expect(can("triangles")).toBe(true);
    expect(can("hexagons")).toBe(false);
  });

  it("reads the tray and the turns off the board", () => {
    const tri = levelByKey("trihex")!;
    expect(tri.tiles.map((t) => t.verts.length)).toEqual([3, 6]);
    expect(tri.turns.map((k) => (k * 360) / tri.ring.n)).toEqual([60, 0]);
    const rhombi = levelByKey("rhombitrihex")!;
    expect(rhombi.tiles.map((t) => t.verts.length)).toEqual([3, 4, 6]);
    // its squares sit three ways, 30° apart; triangles two ways
    expect(rhombi.turns.map((k) => (k * 360) / rhombi.ring.n)).toEqual([60, 30, 0]);
  });

  it("keeps the vertex rule: no six triangles in a hexagon's place", () => {
    const p = new Puzzle(levelByKey("trihex")!);
    p.solve();
    const hex = p.tiles.find((t) => t.verts.length === 6 && p.touching(t.verts).length === 0) ??
      p.tiles.find((t) => t.verts.length === 6)!;
    p.lift(hex.id);
    // the hole is a unit hexagon; a triangle in it would leave a vertex with
    // three triangles running, which 3.6.3.6 never has
    const { ring } = p.level;
    const centre = centroid(hex.verts.map((v) => ring.toXY(v)));
    for (const rot of p.orientations(0)) expect(p.snap(0, centre, 1, rot)).toBeNull();
    expect(p.snap(1, centre, 0.5, p.orientations(1)[0]!)).not.toBeNull();
  });
});
