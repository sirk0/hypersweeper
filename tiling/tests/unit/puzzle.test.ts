import { archimedeanBoard, hexBoard, squareBoard, triangleGridBoard } from "@boards/tilings";
import type { Board } from "@boards/core";
import { describe, expect, it } from "vitest";
import type { Cyc } from "../../src/geometry/cyclotomic";
import { ccw } from "../../src/geometry/outline";
import { centroid, type XY } from "../../src/geometry/shape";
import { LEVELS, levelByKey } from "../../src/levels";
import { Puzzle } from "../../src/puzzle";

/** Finish a level; the number of tiles it took. */
function fill(p: Puzzle): number {
  if (!p.solve()) throw new Error("stuck");
  return p.tiles.length;
}

describe("puzzle", () => {
  it.each(LEVELS.map((l) => l.key))("%s: the board it was cut from fills it exactly", (key) => {
    const p = new Puzzle(levelByKey(key)!);
    const kindOf = (sides: number): number => p.level.tiles.findIndex((t) => t.verts.length === sides);
    for (const cell of p.level.cells) {
      expect(p.coverage).toBeLessThan(1);
      p.place(kindOf(cell.length), ccw(p.level.ring, cell), 0);
    }
    expect(p.won).toBe(true);
    expect(p.coverage).toBe(1);
  });

  it.each(LEVELS.map((l) => l.key))("%s can be finished by search from empty", (key) => {
    const p = new Puzzle(levelByKey(key)!);
    expect(p.solve()).toBe(true);
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
    const ours = p.level.cells.map((c) => c.map((v) => p.level.ring.toXY(v)));
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

  it("offers the rotate control only where a turn changes some tile", () => {
    const can = (key: string): boolean => new Puzzle(levelByKey(key)!).canTurn();
    expect(can("squares")).toBe(false);
    expect(can("triangles")).toBe(true);
    expect(can("hexagons")).toBe(false);
    expect(can("trihex")).toBe(true);
    expect(can("rhombitrihex")).toBe(true);
  });

  it("turns every tile by one step: the largest that reaches every kind's turns", () => {
    const degrees = (key: string): number => {
      const level = levelByKey(key)!;
      return (level.turn * 360) / level.ring.n;
    };
    expect(degrees("squares")).toBe(0);
    expect(degrees("triangles")).toBe(60);
    expect(degrees("hexagons")).toBe(0);
    expect(degrees("trihex")).toBe(60);
    // the squares need 30°, so the triangles and hexagons go round in 30°
    // steps too, through turns where they fit nowhere
    expect(degrees("rhombitrihex")).toBe(30);
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

  /** A finished trihexagonal board with its innermost hexagon lifted out. */
  function trihexWithHole(rule?: number[]): { p: Puzzle; hex: Cyc[] } {
    const level = levelByKey("trihex")!;
    const p = new Puzzle(rule ? { ...level, rule } : level);
    const kindOf = (sides: number): number => p.level.tiles.findIndex((t) => t.verts.length === sides);
    for (const cell of level.cells) p.place(kindOf(cell.length), ccw(level.ring, cell), 0);
    // the hexagon furthest in: fewest corners on the rim
    const rim = new Set(level.region.flat().map((v) => level.ring.key(v)));
    const onRim = (t: { verts: Cyc[] }): number => t.verts.filter((v) => rim.has(level.ring.key(v))).length;
    const hex = p.tiles.filter((t) => t.verts.length === 6).sort((a, b) => onRim(a) - onRim(b))[0]!;
    p.lift(hex.id);
    return { p, hex: hex.verts };
  }

  it("wins however it is covered: six triangles in a hexagon's place", () => {
    const { p, hex } = trihexWithHole();
    const { ring } = p.level;
    const centre = ring.toXY(hex[0]!).map((x, i) => x + (ring.toXY(hex[3]!)[i]! - x) / 2) as XY;
    // fan the hole from its corners: each triangle has its apex at the centre
    for (let i = 0; i < 6 && !p.won; i++) {
      const spot = p.orientations(0)
        .map((rot) => p.snap(0, centroid([centre, ring.toXY(hex[i]!), ring.toXY(hex[(i + 1) % 6]!)]), 0.3, rot))
        .find((s) => s);
      expect(spot).toBeTruthy();
      p.place(0, spot!, 0);
    }
    expect(p.won).toBe(true);
    expect(p.tiles.length).toBe(p.level.cells.length + 5);
  });

  it("can hold a level to a vertex rule: then no six triangles in a hexagon's place", () => {
    const { p, hex } = trihexWithHole([3, 6, 3, 6]);
    // the hole is a unit hexagon; a triangle in it would leave a vertex with
    // three triangles running, which 3.6.3.6 never has
    const { ring } = p.level;
    const centre = centroid(hex.map((v) => ring.toXY(v)));
    for (const rot of p.orientations(0)) expect(p.snap(0, centre, 1, rot)).toBeNull();
    expect(p.snap(1, centre, 0.5, p.orientations(1)[0]!)).not.toBeNull();
  });
});
