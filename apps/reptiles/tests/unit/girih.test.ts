// The girih tilings' oracle (src/geometry/girih.ts): Hypersweeper has no
// board for them, so their data is checked here instead — every tile its
// kind, unit-sided and closed; the rule's fills covering each big tile
// exactly with the hexagons halved along its sides; the self-similar patch
// and each periodic tiling overlapping nothing and leaving no gap; and the
// strapwork drawn on each tile running on from every edge's middle.

import { describe, expect, it } from "vitest";
import { properlyCross, type Cyc } from "../../src/geometry/cyclotomic";
import { Frontier } from "../../src/geometry/frontier";
import { outline } from "../../src/geometry/outline";
import {
  GIRIH_TILINGS,
  GIRIH_TURNS,
  SUBDIVIDED,
  TAU2,
  Z10,
  girihCell,
  girihCells,
  girihPatch,
  girihPeriodicPatch,
  girihPoint,
  girihTiling,
  subdivide,
  type GirihKind,
} from "../../src/geometry/girih";
import { strapwork } from "../../src/view/decor";
import { GIRIH, GIRIH_SELF_SIMILAR, LEVELS, levelByKey } from "../../src/levels";

const ring = Z10;

/** conj(u)·v − u·conj(v): 2i times the cross product of u and v, exactly. */
const twiceCross = (u: Cyc, v: Cyc): Cyc =>
  ring.sub(ring.mul(ring.conj(u), v), ring.mul(u, ring.conj(v)));

/** 2i times twice the polygon's signed area, exactly. */
const areaOf = (verts: readonly Cyc[]): Cyc =>
  verts.reduce(
    (sum, v, i) => ring.add(sum, twiceCross(v, verts[(i + 1) % verts.length]!)),
    ring.zero,
  );

const sumOf = (xs: readonly Cyc[]): Cyc => xs.reduce((s, x) => ring.add(s, x), ring.zero);

/** `cells` overlap nothing and leave no gap in their own outline. */
function tiles(cells: readonly Cyc[][]): boolean {
  let frontier = Frontier.ofRegion(ring, outline(ring, cells as Cyc[][]));
  for (const verts of cells) {
    const pieces = [{ verts }];
    if (!frontier.fits(pieces)) return false;
    frontier = frontier.cover(pieces);
  }
  return frontier.empty;
}

const KINDS = Object.keys(GIRIH_TURNS) as GirihKind[];

/** Which kind a cell is, by its corners' turns read from any corner, or
 * null: a unit girih tile, laid any way round. */
function kindOf(cell: readonly Cyc[]): GirihKind | null {
  for (const kind of KINDS) {
    const turns = GIRIH_TURNS[kind];
    if (turns.length !== cell.length) continue;
    for (let s = 0; s < cell.length; s++)
      for (let d = 0; d < 10; d++) {
        const walked = girihCell(kind, cell[s]!, d);
        if (walked.every((v, j) => ring.eq(v, cell[(s + j) % cell.length]!))) return kind;
      }
  }
  return null;
}

describe("the five girih tiles", () => {
  it.each(KINDS)("the %s is simple, counter-clockwise and unit-sided, its corners 36°s", (kind) => {
    const cell = girihCell(kind, ring.zero, 0);
    const m = cell.length;
    for (let i = 0; i < m; i++) {
      const e = ring.sub(cell[(i + 1) % m]!, cell[i]!);
      expect(ring.eq(ring.mul(e, ring.conj(e)), ring.one)).toBe(true);
      for (let j = i + 2; j < m; j++) {
        if (i === 0 && j === m - 1) continue;
        expect(
          properlyCross(ring, cell[i]!, cell[(i + 1) % m]!, cell[j]!, cell[(j + 1) % m]!),
        ).toBe(false);
      }
    }
    expect(GIRIH_TURNS[kind].reduce((a, b) => a + b, 0)).toBe(10); // one full turn
    const [x, y] = ring.toXY(areaOf(cell));
    expect(x).toBeCloseTo(0, 12);
    expect(y).toBeGreaterThan(0);
  });
});

describe("the rule", () => {
  // the big tile, the whole small tiles inside it, and a hexagon along each
  // side: its long diagonal the side, so half of it is inside
  const cut = (kind: GirihKind) => {
    const big = girihCell(kind, ring.zero, 0, TAU2);
    const small = subdivide([{ kind, at: ring.zero, dir: 0 }]);
    const along = big.map((corner, i) => {
      const next = big[(i + 1) % big.length]!;
      return small.find((t) => {
        if (t.kind !== "hexagon") return false;
        const c = girihCell(t.kind, t.at, t.dir);
        return ring.eq(c[0]!, corner) && ring.eq(c[3]!, next);
      });
    });
    return { big, small, along };
  };

  it.each(SUBDIVIDED)(
    "cuts a big %s along every side through a hexagon's long diagonal",
    (kind) => {
      const { big, small, along } = cut(kind);
      expect(along.every((t) => t !== undefined)).toBe(true);
      const inner = small.filter((t) => !along.includes(t));
      // every inner tile inside the big one, overlapping no other or a hexagon's half
      let frontier = Frontier.ofRegion(ring, [big]);
      for (const t of along) {
        // its inside half: the big side and the three sides inside it
        const c = girihCell(t!.kind, t!.at, t!.dir);
        const half = [c[3]!, c[4]!, c[5]!, c[0]!];
        expect(frontier.fits([{ verts: half }])).toBe(true);
        frontier = frontier.cover([{ verts: half }]);
      }
      for (const t of inner) {
        const pieces = [{ verts: girihCell(t.kind, t.at, t.dir) }];
        expect(frontier.fits(pieces)).toBe(true);
        frontier = frontier.cover(pieces);
      }
      expect(frontier.empty).toBe(true);
      // and by area, exactly: twice the big tile is twice the inner tiles and
      // each hexagon whole
      const inside = sumOf(inner.map((t) => areaOf(girihCell(t.kind, t.at, t.dir))));
      const hexagons = sumOf(along.map((t) => areaOf(girihCell(t!.kind, t!.at, t!.dir))));
      expect(
        ring.eq(ring.add(ring.add(inside, inside), hexagons), ring.add(areaOf(big), areaOf(big))),
      ).toBe(true);
      // every small tile a unit decagon, hexagon or bowtie
      for (const t of small) expect(SUBDIVIDED).toContain(kindOf(girihCell(t.kind, t.at, t.dir)));
    },
  );

  it("cuts the decagon into a decagon, ten hexagons and ten bowties, keeping all its symmetry", () => {
    const { small, along } = cut("decagon");
    const inner = small.filter((t) => !along.includes(t));
    const count = (k: GirihKind) => inner.filter((t) => t.kind === k).length;
    expect([count("decagon"), count("hexagon"), count("bowtie")]).toEqual([1, 10, 10]);
    // a turn of 36° about the decagon's middle carries the cut onto itself
    const big = girihCell("decagon", ring.zero, 0, TAU2);
    const turn = (v: Cyc): Cyc => ring.add(big[1]!, ring.mul(ring.zeta(1), v));
    const keys = new Set(small.map((t) => keyOf(girihCell(t.kind, t.at, t.dir))));
    for (const t of small)
      expect(keys.has(keyOf(girihCell(t.kind, t.at, t.dir).map(turn)))).toBe(true);
  });
});

const keyOf = (cell: readonly Cyc[]): string =>
  cell
    .map((v) => ring.key(v))
    .sort()
    .join("|");

describe("the self-similar pattern", () => {
  it.each([1, 2])("cut %i times, overlaps nothing and leaves no gap", (depth) => {
    const patch = girihPatch(depth);
    expect(tiles(girihCells(patch))).toBe(true);
    // one decagon, at the middle, and hexagons and bowties
    expect(patch.filter((t) => t.kind === "decagon")).toHaveLength(1);
    for (const t of patch) expect(kindOf(girihCell(t.kind, t.at, t.dir))).toBe(t.kind);
  });

  it("grows hexagons and bowties in the golden ratio's fourth power, never repeating", () => {
    // by the rule's counts, the hexagons and bowties of a cut multiply by
    // [[5, 3], [3, 2]] — eigenvalue τ⁴ — so their ratio tends to τ, which no
    // periodic tiling can have
    const counts = [1, 2, 3].map((d) => {
      const p = girihPatch(d);
      return [
        p.filter((t) => t.kind === "hexagon").length,
        p.filter((t) => t.kind === "bowtie").length,
      ];
    });
    expect(counts).toEqual([
      [20, 10],
      [160, 90],
      [1130, 670],
    ]);
  });
});

describe.each(GIRIH_TILINGS.map((t) => [t.key, t] as const))("girih tiling %s", (key, spec) => {
  it("fills exactly one lattice cell a period, before its cut", () => {
    const tilesOf = spec.tiles.map(([kind, at, dir]) => girihCell(kind, girihPoint(at), dir));
    const total = sumOf(tilesOf.map(areaOf));
    const cell = twiceCross(girihPoint(spec.a), girihPoint(spec.b));
    expect(ring.eq(total, ring.add(cell, cell))).toBe(true);
  });

  it("overlaps nothing and leaves no gap over a block of periods", () => {
    expect(tiles(girihCells(girihPeriodicPatch(key, -2, 2)))).toBe(true);
  });

  it("is a level of the Girih family", () => {
    const level = levelByKey(key)!;
    expect(level.group).toBe("girih");
    expect(level.name).toBe(girihTiling(key).name);
    expect(level.girihTiling?.box).toBe(GIRIH.find(([k]) => k === key)![1]);
    for (const cell of level.cells) expect(kindOf(cell[0]!.verts)).not.toBeNull();
  });
});

describe("the girih levels", () => {
  it("list the periodic tilings after the pentagonal ones, and the self-similar one after Ammann–Beenker", () => {
    const girih = LEVELS.filter((l) => l.group === "girih").map((l) => l.key);
    expect(girih).toEqual(GIRIH.map(([k]) => k));
    const aperiodic = LEVELS.filter((l) => l.group === "aperiodic").map((l) => l.key);
    expect(aperiodic.slice(0, 4)).toEqual(["penrose", "kitedart", "ammannbeenker", "girih"]);
  });

  it("windows the self-similar pattern round its decagon: a decagon, hexagons and bowties", () => {
    const level = levelByKey("girih")!;
    expect(level.girih).toEqual({ depth: GIRIH_SELF_SIMILAR.depth, keep: GIRIH_SELF_SIMILAR.keep });
    expect(level.cells).toHaveLength(GIRIH_SELF_SIMILAR.keep);
    expect(level.region).toHaveLength(1);
    const kinds = level.cells.map((c) => kindOf(c[0]!.verts));
    expect(new Set(kinds)).toEqual(new Set(["decagon", "hexagon", "bowtie"]));
    expect(kinds.filter((k) => k === "decagon")).toHaveLength(1);
    // no tile is ever turned over (each is its own mirror image), and every
    // turn is a tenth
    expect(level.mirror).toBe(false);
    expect(level.turn).toBe(1);
  });
});

describe("strapwork", () => {
  it.each(KINDS)("leaves every edge of the %s twice, from its middle, at 54°", (kind) => {
    const xy = girihCell(kind, ring.zero, 0).map((v) => ring.toXY(v));
    const runs = strapwork(xy);
    const ends = runs.flatMap((r) => [r[0]!, r.at(-1)!]);
    const m = xy.length;
    for (let i = 0; i < m; i++) {
      const [a, b] = [xy[i]!, xy[(i + 1) % m]!];
      const mid: [number, number] = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
      const here = ends.filter((p) => Math.hypot(p[0] - mid[0], p[1] - mid[1]) < 1e-9);
      expect(here, `${kind} edge ${i}`).toHaveLength(2);
    }
    // each run leaves its edges at 54°: its first leg's angle to the edge
    for (const run of runs) {
      const [p, q] = [run[0]!, run[1]!];
      const i = xy.findIndex((a, j) => {
        const b = xy[(j + 1) % m]!;
        return Math.hypot((a[0] + b[0]) / 2 - p[0], (a[1] + b[1]) / 2 - p[1]) < 1e-9;
      });
      const [a, b] = [xy[i]!, xy[(i + 1) % m]!];
      const cos =
        ((b[0] - a[0]) * (q[0] - p[0]) + (b[1] - a[1]) * (q[1] - p[1])) /
        Math.hypot(b[0] - a[0], b[1] - a[1]) /
        Math.hypot(q[0] - p[0], q[1] - p[1]);
      expect(Math.abs(cos)).toBeCloseTo(Math.cos((54 * Math.PI) / 180), 9);
    }
  });

  it("draws a ten-pointed star in the decagon and a five-pointed one in the pentagon", () => {
    for (const [kind, points] of [
      ["decagon", 10],
      ["pentagon", 5],
    ] as const) {
      const runs = strapwork(girihCell(kind, ring.zero, 0).map((v) => ring.toXY(v)));
      // one run round each corner, bent where its two lines meet
      expect(runs).toHaveLength(points);
      for (const run of runs) expect(run).toHaveLength(3);
    }
  });
});
