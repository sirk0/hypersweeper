import { describe, expect, it } from "vitest";
import { orient } from "../../src/geometry/cyclotomic";
import { Frontier } from "../../src/geometry/frontier";
import {
  SOCOLAR_TAYLOR,
  SOCOLAR_TAYLOR_PATCH,
  socolarTaylorSearch,
  stCentre,
  stFaults,
  stHexagons,
  stLattice,
  stPoint,
  stWays,
  type StTile,
} from "../../src/geometry/socolarTaylor";
import { posed, signedArea, turnsOnto } from "../../src/geometry/shape";
import { figureSetOf } from "../../src/figures";
import { levelByKey, LEVELS } from "../../src/levels";

const { ring } = SOCOLAR_TAYLOR;
const area = (verts: readonly (readonly number[])[]): number =>
  signedArea(verts.map((v) => ring.toXY(v)));
/** The hexagon (i, j) of the lattice, counter-clockwise: corners (0, ±20)
 * and (±10, ±10) about its centre, in (a, b). */
const hexagon = (ij: [number, number]): ReturnType<typeof stPoint>[] => {
  const [a, b] = stCentre(ij);
  return (
    [
      [0, -20],
      [10, -10],
      [10, 10],
      [0, 20],
      [-10, 10],
      [-10, -10],
    ] as const
  ).map(([da, db]) => stPoint([a + da, b + db]));
};

describe("the Socolar–Taylor tile", () => {
  it("is nineteen pieces, together exactly its hexagon", () => {
    const { pieces } = SOCOLAR_TAYLOR;
    expect(pieces).toHaveLength(19);
    // a 30-cornered body, then eighteen rectangles
    expect(pieces.map((p) => p.verts.length)).toEqual([30, ...Array(18).fill(4)]);
    for (const p of pieces) expect(area(p.verts)).toBeGreaterThan(0); // counter-clockwise
    const total = pieces.reduce((s, p) => s + area(p.verts), 0);
    expect(total).toBeCloseTo(area(hexagon([0, 0])), 9);
    // the six small rectangles are 1 × √3, the twelve larger 2 × √3
    const sizes = pieces.slice(1).map((p) => area(p.verts) / Math.sqrt(3));
    expect(sizes.slice(0, 6).map((s) => Math.round(s * 1e9) / 1e9)).toEqual(Array(6).fill(1));
    expect(sizes.slice(6).map((s) => Math.round(s * 1e9) / 1e9)).toEqual(Array(12).fill(2));
  });

  it("reads its lattice's points both ways", () => {
    for (const [a, b] of [
      [0, 0],
      [1, 1],
      [-3, 17],
      [12, -6],
    ] as [number, number][]) {
      expect(stLattice(stPoint([a, b]))).toEqual([a, b]);
      const [x, y] = ring.toXY(stPoint([a, b]));
      expect(x).toBeCloseTo((a * Math.sqrt(3)) / 2, 12);
      expect(y).toBeCloseTo(b / 2, 12);
    }
    expect(() => stPoint([1, 2])).toThrow();
  });

  it("covers the hexagon's area in every one of its twelve ways, no two alike", () => {
    const ways = stWays();
    expect(ways).toHaveLength(12);
    // 3600 small triangles of the kisrhombille: 600√3 over √3/6
    for (const w of ways) expect(w.cover).toHaveLength(3600);
    expect(new Set(ways.map((w) => [...w.cover].sort((a, b) => a - b).join())).size).toBe(12);
    // and no turn but a whole one carries it onto itself, either way up
    const verts = SOCOLAR_TAYLOR.pieces.map((p) => p.verts);
    expect(turnsOnto(SOCOLAR_TAYLOR, verts)).toEqual([0]);
    const mirrored = { ring, pieces: posed(SOCOLAR_TAYLOR, { rot: 0, flip: true, t: ring.zero }) };
    expect(turnsOnto(mirrored, verts)).toEqual([]);
  });

  it("lays the written patch four rings out with no overlap and no gap", () => {
    expect(SOCOLAR_TAYLOR_PATCH.map(([i, j]) => [i, j])).toEqual(stHexagons(4));
    expect(SOCOLAR_TAYLOR_PATCH).toHaveLength(61);
    expect(stFaults(SOCOLAR_TAYLOR_PATCH, 4)).toEqual({ overlaps: 0, gaps: 0 });
    // both ways up
    expect(new Set(SOCOLAR_TAYLOR_PATCH.map(([, , , flip]) => flip)).size).toBe(2);
    // a tile turned out of place leaves a gap and overlaps a neighbour
    const turned = SOCOLAR_TAYLOR_PATCH.map(([i, j, turn, flip], n): StTile => [
      i,
      j,
      n === 5 ? (turn + 1) % 6 : turn,
      flip,
    ]);
    const faults = stFaults(turned, 4);
    expect(faults.overlaps).toBeGreaterThan(0);
    expect(faults.gaps).toBeGreaterThan(0);
  });

  it("finds a patch by search alone", () => {
    const patch = socolarTaylorSearch(2)!;
    expect(patch).toHaveLength(19);
    expect(stFaults(patch, 2)).toEqual({ overlaps: 0, gaps: 0 });
  });
});

describe("the Socolar–Taylor level", () => {
  const level = levelByKey("socolartaylor")!;

  it("is the last of the aperiodic tilings, the one Hypersweeper has no board for", () => {
    const aperiodic = LEVELS.filter((l) => l.group === "aperiodic");
    expect(aperiodic.at(-1)).toBe(level);
    expect(level.name).toBe("Socolar–Taylor tile");
    expect(level.socolarTaylor).toEqual({ rings: 2 });
    expect(level.aperiodic).toBeUndefined();
    expect(level.configs).toEqual([]);
  });

  it("is one tile of nineteen pieces, turned by sixths and flipped", () => {
    expect(level.tiles).toHaveLength(1);
    expect(level.tiles[0]!.pieces).toHaveLength(19);
    expect(level.colours).toEqual(["pieces"]);
    expect((level.turn * 360) / ring.n).toBe(60);
    expect(level.mirror).toBe(true);
    expect(level.need).toEqual([19]);
    // its own figure, in the row of figures of several pieces
    const set = figureSetOf(level);
    expect(set.bucket).toBe("pieces");
    expect(set.levels).toEqual([level]);
  });

  it("is the patch's middle two rings, covering their region exactly", () => {
    const keep = SOCOLAR_TAYLOR_PATCH.slice(0, 19);
    expect(keep.map(([i, j]) => [i, j])).toEqual(stHexagons(2));
    let f = Frontier.ofRegion(ring, level.region);
    for (const cell of level.cells) {
      expect(f.fits(cell)).toBe(true);
      f = f.cover(cell);
    }
    expect(f.empty).toBe(true);
    const total = level.cells.flat().reduce((s, p) => s + area(p.verts), 0);
    expect(total).toBeCloseTo(19 * area(hexagon([0, 0])), 6);
  });

  it("leaves no gap in the hexagons the board surrounds", () => {
    // every tile that can reach the middle seven hexagons is on the board,
    // so no loop of the region — no hole — has a corner inside one
    for (const ij of stHexagons(1)) {
      const hex = hexagon(ij);
      const inside = (p: (typeof hex)[number]): boolean =>
        hex.every((a, i) => orient(ring, a, hex[(i + 1) % 6]!, p) > 0);
      for (const loop of level.region) for (const v of loop) expect(inside(v)).toBe(false);
    }
    // the outer ring's far pieces lie off the board's hexagon, and gaps
    // open in it where its missing neighbours' pieces would go
    expect(level.region.length).toBeGreaterThan(1);
    const holes = level.region.filter((loop) => area(loop) < 0);
    expect(holes.length).toBeGreaterThan(0);
  });
});
