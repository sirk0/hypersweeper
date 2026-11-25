// The oracle for the aperiodic tilings Rep-tiles grows itself
// (src/geometry/grown.ts): Hypersweeper has no board for them, so each patch
// is checked here instead — overlapping nothing and leaving no gap, every
// tile its kind's prototile turned — and each tiling's own facts below it.

import { describe, expect, it } from "vitest";
import type { Cyc, Ring } from "../../src/geometry/cyclotomic";
import { Frontier } from "../../src/geometry/frontier";
import { GROWN, grownWindow } from "../../src/geometry/grown";
import { outline } from "../../src/geometry/outline";
import { aperiodicPatch } from "../../src/geometry/aperiodic";
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
