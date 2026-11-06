import { describe, expect, it } from "vitest";
import { cyclotomic, type Cyc } from "../../src/geometry/cyclotomic";
import { Frontier } from "../../src/geometry/frontier";
import { hatMetatiles } from "../../src/geometry/hat";
import { mysticPatch } from "../../src/geometry/mystic";
import { outline } from "../../src/geometry/outline";
import {
  OUT,
  WAVE,
  polygon,
  sideCount,
  signedArea,
  turnsOnto,
  type Bulge,
} from "../../src/geometry/shape";
import { figureSetOf, sameFigure } from "../../src/figures";
import { Puzzle } from "../../src/puzzle";
import { levelByKey, type Level } from "../../src/levels";

const Z12 = cyclotomic(12);
const area = (verts: readonly Cyc[]): number => signedArea(verts.map((v) => Z12.toXY(v)));

describe("the Spectre's patch with its Mystics whole", () => {
  const whole = mysticPatch(3, 1e9);
  const mystics = whole.parts.filter((p) => p.length === 2);
  // Tile(1,1) with its flat corner kept, straight: what every half is
  const spectre = polygon(Z12, levelByKey("spectre")!.tiles[0]!.pieces[0]!.verts);

  it("is the cluster's 559 Spectres, each pair of a Mystic glued", () => {
    expect(whole.parts.flat()).toHaveLength(559);
    expect(whole.cells).toHaveLength(559 - mystics.length);
    expect(mystics.length).toBeGreaterThan(40);
    for (const part of whole.parts.flat())
      expect(sameFigure(polygon(Z12, part), spectre)).toBe(true);
  });

  it("glues each Mystic from two Spectres, one turned 30° against the other", () => {
    for (const [a, b] of mystics as [Cyc[], Cyc[]][]) {
      const turns = turnsOnto(polygon(Z12, a), [b]);
      expect(turns.map((k) => ((k % 12) + 12) % 12)).toSatisfy((ks: number[]) =>
        ks.every((k) => k === 1 || k === 11),
      );
    }
    const i = whole.parts.findIndex((p) => p.length === 2);
    const mystic = whole.cells[i]!;
    expect(mystic).toHaveLength(20); // 28 corners, less 8 inside
    expect(sideCount(Z12, mystic)).toBe(18);
    expect(area(mystic)).toBeCloseTo(2 * area(whole.parts[i]![0]!), 9);
    // every Mystic is the one tile
    for (const [j, p] of whole.parts.entries()) {
      if (p.length === 2)
        expect(sameFigure(polygon(Z12, whole.cells[j]!), polygon(Z12, mystic))).toBe(true);
    }
  });

  it("tiles without overlap or gap", () => {
    const loops = outline(Z12, whole.cells);
    expect(loops).toHaveLength(1);
    const tiles = whole.cells.reduce((s, c) => s + area(c), 0);
    expect(area(loops[0]!)).toBeCloseTo(tiles, 6);
  });
});

describe("the levels of Spectres and Mystics, and the wavy Spectre", () => {
  const round = levelByKey("spectre")!;
  const wavy = levelByKey("spectrewave")!;
  const mystic = levelByKey("mystic")!;
  const mysticWave = levelByKey("mysticwave")!;

  it("are named, and the Mystics' are cut from the Spectre's cluster", () => {
    expect([wavy.name, mystic.name, mysticWave.name]).toEqual([
      "Wavy Spectre",
      "Spectres & Mystics",
      "Wavy Mystics",
    ]);
    expect(wavy.aperiodic).toEqual({ mode: "spectre", depth: 3, keep: 33 });
    expect(mystic.mystic).toEqual({ depth: 3, keep: 28 });
    expect(mysticWave.mystic).toEqual({ depth: 3, keep: 28 });
  });

  it("the wavy Spectre: Tile(1,1), every edge the one wave", () => {
    const tile = wavy.tiles[0]!.pieces[0]!;
    expect(tile.verts).toHaveLength(14);
    expect(tile.curve).toEqual(tile.verts.map(() => WAVE));
    expect(wavy.need).toEqual(round.need);
    expect(wavy.colours).toEqual(round.colours);
    expect(wavy.mirror).toBe(false);
    expect(sameFigure(wavy.tiles[0]!, round.tiles[0]!)).toBe(false);
  });

  it.each([
    ["mystic", OUT],
    ["mysticwave", WAVE],
  ] as [string, Bulge][])(
    "%s: a Spectre and a Mystic, never flipped, one outline",
    (key, bulge) => {
      const level = levelByKey(key)!;
      expect(level.tiles.map((t) => sideCount(level.ring, t.pieces[0]!.verts))).toEqual([13, 18]);
      expect(level.colours).toEqual(["sides-13", "sides-18"]);
      expect(level.need).toEqual([24, 4]);
      expect(level.mirror).toBe(false);
      expect(level.region).toHaveLength(1);
      // its Spectre is the Spectre level's, or the wavy one's
      const own = bulge === WAVE ? wavy : round;
      expect(sameFigure(level.tiles[0]!, own.tiles[0]!)).toBe(true);
      expect(sameFigure(level.tiles[0]!, (bulge === WAVE ? round : wavy).tiles[0]!)).toBe(false);
      // the Mystic's curves are its halves': out and in by turns, or one wave
      const m = level.tiles[1]!.pieces[0]!;
      if (bulge === WAVE) expect(m.curve).toEqual(m.verts.map(() => WAVE));
      else expect(m.curve!.every((b, i) => b === -m.curve![(i + 1) % 20]!)).toBe(true);
    },
  );

  it("are four figures of their own", () => {
    expect(sameFigure(mystic.tiles[1]!, mysticWave.tiles[1]!)).toBe(false);
    expect(figureSetOf(mystic).levels).toEqual([mystic]);
    expect(figureSetOf(mysticWave).levels).toEqual([mysticWave]);
    expect(figureSetOf(wavy).levels).toEqual([wavy]);
  });

  /** Every edge two of the board's tiles share, as each one's curve. */
  const meetings = (level: Level): [Bulge, Bulge][] => {
    const { ring } = level;
    const bulge = new Map<string, Bulge>();
    for (const cell of level.cells) {
      const { verts, curve } = cell[0]!;
      verts.forEach((a, i) =>
        bulge.set(`${ring.key(a)}>${ring.key(verts[(i + 1) % verts.length]!)}`, curve![i]!),
      );
    }
    const out: [Bulge, Bulge][] = [];
    for (const [k, b] of bulge) {
      const [ak, bk] = k.split(">");
      const twin = bulge.get(`${bk}>${ak}`);
      if (twin !== undefined) out.push([b, twin]);
    }
    return out;
  };

  it.each([wavy, mystic, mysticWave].map((l) => [l.key, l] as const))(
    "%s: its tiles meet on the same line along every edge",
    (_, level) => {
      const met = meetings(level);
      expect(met.length).toBeGreaterThan(2 * level.cells.length);
      // an arc out from one tile is in from the other; a wave the same wave
      for (const [a, b] of met) expect(b).toBe(a === WAVE || a === -WAVE ? a : -a);
      // and the board's own tiles cover the round rim exactly
      let f = Frontier.ofRegion(level.ring, level.region, level.regionCurves);
      for (const cell of level.cells) {
        expect(f.fits(cell)).toBe(true);
        f = f.cover(cell);
      }
      expect(f.empty).toBe(true);
      expect(level.regionCurves!.flat().every((b) => b !== 0)).toBe(true);
    },
  );

  it("the wavy Spectre refuses one waved the other way about", () => {
    const tile = wavy.tiles[0]!.pieces[0]!;
    const p = new Puzzle({
      ...wavy,
      tiles: [
        { ring: wavy.ring, pieces: [{ ...tile, curve: tile.curve!.map(() => -WAVE as Bulge) }] },
      ],
    });
    expect(p.solve(200)).toBe(false);
    expect(new Puzzle(wavy).solve()).toBe(true);
  });
});

// Why the hat and the turtle have no round levels: a curve on an edge has to
// be the same line from both tiles there, and the hat's tilings turn one hat
// in seven over. Among the 1156 hats of the patch, the edges that meet tie the
// hat's fourteen edges together into two classes; an arc must flip at every
// meeting (out on one side is in on the other) and a wave must flip at every
// meeting of a hat with a mirrored one. Neither can be done round either
// class, so every curve on the hat is straight — and the turtle's tilings are
// the hat's, edge for edge.
describe("the hat", () => {
  const hats = hatMetatiles(3).flatMap((m) => m.hats);
  const edges = new Map<string, [hat: number, edge: number]>();
  hats.forEach((h, i) => {
    const n = h.corners.length;
    for (let j = 0; j < n; j++) {
      // counter-clockwise round the tile: a mirrored hat lists its corners
      // clockwise, its edge j the same edge of the hat
      let [a, b] = [h.corners[j]!, h.corners[(j + 1) % n]!];
      if (h.mirrored) [a, b] = [b, a];
      edges.set(`${a.join()}>${b.join()}`, [i, j]);
    }
  });
  const meets: [p: number, q: number, mixed: boolean][] = [];
  for (const [k, [i, p]] of edges) {
    const [a, b] = k.split(">");
    const twin = edges.get(`${b}>${a}`);
    if (twin && twin[0] < i)
      meets.push([p, twin[1], hats[i]!.mirrored !== hats[twin[0]]!.mirrored]);
  }

  /** Whether the hat's edges can be signed so that each meeting flips the
   * sign exactly where `flips` says, on any edge at all (union–find by
   * parity). */
  const signable = (flips: (mixed: boolean) => boolean): boolean[] => {
    const parent = [...Array(14).keys()];
    const parity = Array<number>(14).fill(0);
    const find = (x: number): [number, number] => {
      let p = 0;
      while (parent[x] !== x) {
        p ^= parity[x]!;
        x = parent[x]!;
      }
      return [x, p];
    };
    const broken = new Set<number>();
    for (const [p, q, mixed] of meets) {
      const want = flips(mixed) ? 1 : 0;
      const [rp, pp] = find(p);
      const [rq, pq] = find(q);
      if (rp === rq) {
        if ((pp ^ pq) !== want) broken.add(rp);
      } else {
        parent[rp] = rq;
        parity[rp] = pp ^ pq ^ want;
      }
    }
    const bad = new Set([...broken].map((r) => find(r)[0]));
    return [...Array(14).keys()].map((e) => !bad.has(find(e)[0]));
  };

  it("meets itself along every one of its fourteen edges", () => {
    expect(meets.length).toBeGreaterThan(5000);
    const used = new Set(meets.flatMap(([p, q]) => [p, q]));
    expect(used.size).toBe(14);
  });

  it("can take no arc and no wave on any edge", () => {
    expect(signable(() => true).some(Boolean)).toBe(false); // arcs
    expect(signable((mixed) => mixed).some(Boolean)).toBe(false); // waves
  });
});
