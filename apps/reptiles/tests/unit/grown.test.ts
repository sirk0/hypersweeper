// The oracle for the aperiodic tilings Rep-tiles grows itself
// (src/geometry/grown.ts): Hypersweeper has no board for them, so each patch
// is checked here instead — overlapping nothing and leaving no gap, every
// tile its kind's prototile turned — and each tiling's own facts below it.

import { describe, expect, it } from "vitest";
import type { Cyc, Ring } from "../../src/geometry/cyclotomic";
import { Frontier } from "../../src/geometry/frontier";
import { GROWN, grownWindow } from "../../src/geometry/grown";
import { outline } from "../../src/geometry/outline";
import { corners } from "../../src/geometry/repTile";
import { aperiodicPatch } from "../../src/geometry/aperiodic";
import { MYSTIC, MYSTIC_SPECTRE, mysticPatch } from "../../src/geometry/mystic";
import {
  P1_FILLS,
  P1_KINDS,
  P1_TURNS,
  PHI2,
  Z10 as P1_RING,
  p1Cell,
  p1Patch,
  pentagonChildren,
  type P1Kind,
} from "../../src/geometry/penroseP1";
import { signedArea } from "../../src/geometry/shape";
import { spectreLabelledExact } from "@tiling/geometry";
import { ROBINSON_ACUTE, ROBINSON_OBTUSE, robinsonPatch } from "../../src/geometry/robinson";
import { LEVELS, PATCH_MARKED, levelByKey } from "../../src/levels";

/** `cells` overlap nothing and leave no gap in their own outline. */
function tiles(ring: Ring, cells: readonly Cyc[][]): boolean {
  let frontier = Frontier.ofRegion(ring, outline(ring, cells as Cyc[][]));
  for (const verts of cells) {
    const pieces = [{ verts }];
    if (!frontier.fits(pieces)) return false;
    frontier = frontier.cover(pieces);
  }
  return frontier.empty;
}

/** |b − a|², exactly. */
const norm = (ring: Ring, a: Cyc, b: Cyc): Cyc => {
  const v = ring.sub(b, a);
  return ring.mul(v, ring.conj(v));
};

describe.each(GROWN.map((g) => [g.key, g] as const))("the grown tiling %s", (key, grown) => {
  it("overlaps nothing and leaves no gap", () => {
    const { ring, cells } = grownWindow(key, grown.depth, null);
    expect(tiles(ring, cells)).toBe(true);
  });

  it("lists every tile from the corner its kind's first is turned onto it by", () => {
    const { ring, cells, kinds } = grownWindow(key, grown.depth, null);
    const first = new Map<number, Cyc[]>();
    cells.forEach((c, i) => {
      const f = first.get(kinds[i]!);
      if (!f) return void first.set(kinds[i]!, c);
      expect(c).toHaveLength(f.length);
      c.forEach((_, j) =>
        expect(
          ring.eq(
            norm(ring, c[j]!, c[(j + 1) % c.length]!),
            norm(ring, f[j]!, f[(j + 1) % f.length]!),
          ),
        ).toBe(true),
      );
    });
  });

  it("is an aperiodic level, windowed round the patch's middle, its rule read off the patch", () => {
    const level = levelByKey(key)!;
    expect(level.group).toBe("aperiodic");
    expect(level.name).toBe(grown.name);
    expect(level.grown).toEqual({ depth: grown.depth, keep: grown.keep });
    expect(level.cells).toHaveLength(grown.keep);
    expect(level.region).toHaveLength(1);
    expect(PATCH_MARKED).toContain(key);
    const keys = LEVELS.map((l) => l.key);
    expect(keys.indexOf(key)).toBeGreaterThan(keys.indexOf(grown.after));
  });
});

describe("Robinson's triangles", () => {
  const { ring, cells, kinds } = robinsonPatch(4);
  const kites = aperiodicPatch("kitedart", 4, null).cells;

  it("cut every kite and dart in two along its axis", () => {
    expect(cells).toHaveLength(2 * kites.length);
    kites.forEach((kite, i) => {
      const [a, b] = [cells[2 * i]!, cells[2 * i + 1]!];
      // the two halves share the axis and between them have the kite's corners
      expect(ring.eq(a[0]!, b[0]!) && ring.eq(a[2]!, b[1]!)).toBe(true);
      const keys = new Set([...a, ...b].map((v) => ring.key(v)));
      expect(keys).toEqual(new Set(kite.map((v) => ring.key(v))));
    });
  });

  it("are the acute golden triangle and the obtuse one", () => {
    const phi = ring.add(ring.zeta(1), ring.conj(ring.zeta(1)));
    const one = ring.key(ring.one);
    // 1/φ² = 2 − φ
    const short = ring.key(ring.sub(ring.add(ring.one, ring.one), phi));
    const sides = (c: Cyc[]): string[] =>
      c.map((v, j) => ring.key(norm(ring, v, c[(j + 1) % 3]!))).sort();
    cells.forEach((c, i) => {
      const expected =
        kinds[i] === ROBINSON_ACUTE ? [one, one, short].sort() : [one, short, short].sort();
      expect(sides(c)).toEqual(expected);
    });
    expect(new Set(kinds)).toEqual(new Set([ROBINSON_ACUTE, ROBINSON_OBTUSE]));
  });

  it("make a level of two triangles that turn by 36° and never flip", () => {
    const level = levelByKey("robinson")!;
    expect(level.tiles).toHaveLength(2);
    expect(level.mirror).toBe(false);
    expect(level.turn).toBe(1);
  });
});

describe("Tile(1,1) and the Mystic", () => {
  const { ring, cells, kinds } = mysticPatch(3);
  const area = (c: readonly Cyc[]): number => Math.abs(signedArea(c.map((v) => ring.toXY(v))));

  it("fuse each of the Spectre patch's Mystics, and keep every other Spectre", () => {
    const spectres = spectreLabelledExact(3).labels;
    const mystics = spectres.filter((l) => l === "Gamma1").length;
    expect(kinds.filter((k) => k === MYSTIC)).toHaveLength(mystics);
    expect(cells).toHaveLength(spectres.length - mystics);
  });

  it("make the Mystic of two Spectres: an 18-gon of twice a Spectre's area", () => {
    const spectre = area(cells[kinds.indexOf(MYSTIC_SPECTRE)]!);
    cells.forEach((c, i) => {
      if (kinds[i] !== MYSTIC) return;
      expect(c).toHaveLength(18);
      expect(area(c)).toBeCloseTo(2 * spectre, 9);
    });
  });

  it("make a level of the two, turned by 30° and never flipped", () => {
    const level = levelByKey("mystic")!;
    expect(level.tiles.map((t) => t.pieces[0]!.verts.length)).toEqual([13, 18]);
    expect(level.mirror).toBe(false);
    expect(level.turn).toBe(1);
  });
});

describe("Penrose's pentagons (P1)", () => {
  const R = P1_RING;
  /** The golden triangle on the middle of each side of the big `kind` (side
   * φ², framed at 0), apex outward (`out`) or in. */
  const halves = (kind: P1Kind, out: boolean): Cyc[][] => {
    const big = p1Cell(kind, R.zero, 0, PHI2);
    const turns = P1_TURNS[kind];
    let d = 0;
    return big.map((a, i) => {
      const p = R.add(a, R.zeta(d));
      const q = R.add(p, R.mul(R.sub(R.add(R.zeta(1), R.conj(R.zeta(1))), R.one), R.zeta(d)));
      const apex = R.add(p, R.zeta(out ? d - 2 : d + 2));
      d += turns[(i + 1) % turns.length]!;
      return out ? [p, apex, q] : [p, q, apex];
    });
  };

  it("cuts a big pentagon into six pentagons and a half diamond on each side", () => {
    const kids = pentagonChildren().map((t) => p1Cell(t.kind, t.at, t.dir));
    const cells = [...kids, ...halves("pentagon", false)];
    expect(tiles(R, cells)).toBe(true);
    const big = outline(R, cells);
    expect(big).toHaveLength(1);
    expect(new Set(corners(R, big[0]!).map((v) => R.key(v)))).toEqual(
      new Set(p1Cell("pentagon", R.zero, 0, PHI2).map((v) => R.key(v))),
    );
  });

  it.each(["star", "boat", "diamond"] as const)(
    "fills a big %s and the half diamonds on its sides exactly",
    (kind) => {
      const fill = P1_FILLS[kind].map(([k, at, dir]) => p1Cell(k, at as Cyc, dir));
      const region = outline(R, [p1Cell(kind, R.zero, 0, PHI2), ...halves(kind, true)]);
      expect(region).toHaveLength(1);
      expect(tiles(R, fill)).toBe(true);
      expect(new Set(outline(R, fill)[0]!.map((v) => R.key(v)))).toEqual(
        new Set(region[0]!.map((v) => R.key(v))),
      );
    },
  );

  const patch = p1Patch(1);
  const cells = patch.map((t) => p1Cell(t.kind, t.at, t.dir));

  it("never lets a star, a boat or a diamond share a side with another", () => {
    const owner = new Map<string, number>();
    const key = (a: Cyc, b: Cyc): string => `${R.key(a)}>${R.key(b)}`;
    cells.forEach((c, i) => c.forEach((a, j) => owner.set(key(a, c[(j + 1) % c.length]!), i)));
    cells.forEach((c, i) => {
      if (patch[i]!.kind === "pentagon") return;
      c.forEach((a, j) => {
        const n = owner.get(key(c[(j + 1) % c.length]!, a));
        if (n !== undefined) expect(patch[n]!.kind).toBe("pentagon");
      });
    });
  });

  it("has the rule's tile frequencies round its middle", () => {
    // a pentagon's children: six pentagons and, across each side another
    // pentagon shares, half a diamond; a star's, a boat's and a diamond's as
    // their fills count them — so the counts grow by this matrix, whose
    // largest eigenvector the frequencies are
    const fill = (kind: Exclude<P1Kind, "pentagon">) =>
      P1_KINDS.map((k) => P1_FILLS[kind].filter(([c]) => c === k).length);
    const [s, b, d] = (["star", "boat", "diamond"] as const).map(fill);
    // diamonds: the pentagon–pentagon sides, (5P − 10S − 7B − 4D) / 2
    const M = [
      [6, s![0]!, b![0]!, d![0]!],
      [0, s![1]!, b![1]!, d![1]!],
      [0, s![2]!, b![2]!, d![2]!],
      [2.5, -5, -3.5, -2],
    ];
    let x = [1, 0, 0, 0];
    for (let i = 0; i < 60; i++) {
      x = M.map((row) => row.reduce((sum, m, j) => sum + m * x[j]!, 0));
      x = x.map((v) => v / x[0]!);
    }
    const count = [0, 0, 0, 0];
    const mid = R.toXY(R.zero);
    cells.forEach((c, i) => {
      const [px, py] = R.toXY(c[0]!);
      if (Math.hypot(px - mid[0], py - mid[1]) < 30) count[P1_KINDS.indexOf(patch[i]!.kind)]!++;
    });
    for (const k of [1, 2, 3]) expect(count[k]! / count[0]!).toBeCloseTo(x[k]!, 1);
  });

  it("make a level of four tiles that turn by 36° and never flip, a star among them", () => {
    const level = levelByKey("penrosep1")!;
    expect(level.tiles.map((t) => t.pieces[0]!.verts.length).sort((a, b) => a - b)).toEqual([
      4, 5, 7, 10,
    ]);
    expect(level.mirror).toBe(false);
    expect(level.turn).toBe(1);
  });
});
