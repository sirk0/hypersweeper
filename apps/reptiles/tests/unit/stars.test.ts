// The star tilings' oracle (src/geometry/stars.ts): Hypersweeper has no board
// for them, so their data is checked here instead — each tile its kind, one
// period's tiles exactly a lattice cell's area and overlapping nothing over a
// block of periods (so its translates tile the plane), and every point where
// three or more tiles meet the tiling's vertex configuration.

import { describe, expect, it } from "vitest";
import { properlyCross, type Cyc, type Ring } from "../../src/geometry/cyclotomic";
import { Frontier } from "../../src/geometry/frontier";
import { outline } from "../../src/geometry/outline";
import {
  cornersOfKind,
  isStar,
  STAR_TILINGS,
  starMotif,
  starWindow,
} from "../../src/geometry/stars";

/** conj(u)·v − u·conj(v): 2i times the cross product of u and v, exactly. */
const twiceCross = (ring: Ring, u: Cyc, v: Cyc): Cyc =>
  ring.sub(ring.mul(ring.conj(u), v), ring.mul(u, ring.conj(v)));

/** 2i times twice the polygon's signed area, exactly. */
const areaOf = (ring: Ring, verts: readonly Cyc[]): Cyc =>
  verts.reduce(
    (sum, v, i) => ring.add(sum, twiceCross(ring, v, verts[(i + 1) % verts.length]!)),
    ring.zero,
  );

/** The block of periods −r…r each way, each tile with its kind and the
 * corner its vertex list starts from. */
function block(key: string, r: number) {
  const { ring, a, b, cells, spec } = starMotif(key);
  const tiles: { verts: Cyc[]; labels: string[]; angles: number[]; centre: boolean }[] = [];
  for (let i = -r; i <= r; i++) {
    for (let j = -r; j <= r; j++) {
      const t = ring.add(
        a.map((x) => x * i),
        b.map((x) => x * j),
      );
      cells.forEach((cell, c) => {
        const [kind, first] = spec.tiles[c]!;
        const corners = cornersOfKind(spec.kinds[kind]!);
        const turned = [...corners.slice(first), ...corners.slice(0, first)];
        tiles.push({
          verts: cell.map((v) => ring.add(v, t)),
          labels: turned.map((c) => c.label),
          angles: turned.map((c) => c.angle),
          centre: i === 0 && j === 0,
        });
      });
    }
  }
  return { ring, spec, tiles };
}

describe.each(STAR_TILINGS.map((t) => [t.key, t] as const))("star tiling %s", (key, spec) => {
  it("lays every tile simple, counter-clockwise and unit-sided", () => {
    const { ring, cells } = starMotif(key);
    for (const cell of cells) {
      const m = cell.length;
      for (let i = 0; i < m; i++) {
        const e = ring.sub(cell[(i + 1) % m]!, cell[i]!);
        expect(ring.eq(ring.mul(e, ring.conj(e)), ring.one)).toBe(true);
        // no two sides that do not share a corner cross
        for (let j = i + 2; j < m; j++) {
          if (i === 0 && j === m - 1) continue;
          expect(
            properlyCross(ring, cell[i]!, cell[(i + 1) % m]!, cell[j]!, cell[(j + 1) % m]!),
          ).toBe(false);
        }
      }
      const [x, y] = ring.toXY(areaOf(ring, cell));
      expect(x).toBeCloseTo(0, 12);
      expect(y).toBeGreaterThan(0); // 2i · (positive area)
    }
  });

  it("fills exactly one lattice cell a period, overlapping nothing", () => {
    const { ring, a, b, cells } = starMotif(key);
    const total = cells.reduce((sum, cell) => ring.add(sum, areaOf(ring, cell)), ring.zero);
    // a polygon's sum is twice its area; the cell's area is a × b
    const cell = twiceCross(ring, a, b);
    expect(ring.eq(total, ring.add(cell, cell))).toBe(true);
    // every tile of a block of periods fits where the others are not
    const { tiles } = block(key, 2);
    let frontier = Frontier.ofRegion(
      ring,
      outline(
        ring,
        tiles.map((t) => t.verts),
      ),
    );
    for (const t of tiles) {
      const pieces = [{ verts: t.verts }];
      expect(frontier.fits(pieces)).toBe(true);
      frontier = frontier.cover(pieces);
    }
    expect(frontier.empty).toBe(true);
  });

  it("has its vertex configuration at every point three or more tiles meet", () => {
    const { ring, tiles } = block(key, 1);
    // every corner round every point of the middle period's tiles
    const round = new Map<string, { dir: number; label: string; angle: number }[]>();
    const dirOf = (e: Cyc): number => {
      for (let k = 0; k < ring.n; k++) if (ring.eq(e, ring.zeta(k))) return k;
      throw new Error("a side off the ring's directions");
    };
    const middle = new Set(tiles.filter((t) => t.centre).flatMap((t) => t.verts.map(ring.key)));
    for (const t of tiles) {
      t.verts.forEach((v, i) => {
        const k = ring.key(v);
        if (!middle.has(k)) return;
        const out = ring.sub(t.verts[(i + 1) % t.verts.length]!, v);
        round
          .set(k, round.get(k) ?? [])
          .get(k)!
          .push({ dir: dirOf(out), label: t.labels[i]!, angle: t.angles[i]! });
      });
    }
    const config = spec.config.join(".");
    const ways = new Set<string>();
    for (const order of [spec.config, [...spec.config].reverse()])
      for (let s = 0; s < order.length; s++)
        ways.add([...order.slice(s), ...order.slice(0, s)].join("."));
    let vertices = 0;
    for (const corners of round.values()) {
      // round the point exactly, edge to edge: the corners fill it
      expect(corners.reduce((s, c) => s + c.angle, 0)).toBeCloseTo(360, 9);
      corners.sort((p, q) => p.dir - q.dir);
      // each corner starts where the one before it ends
      corners.forEach((c, i) => {
        const next = corners[(i + 1) % corners.length]!;
        expect(((c.dir + (c.angle * ring.n) / 360 - next.dir) % ring.n) % ring.n).toBe(0);
      });
      if (corners.length >= 3) {
        expect(ways.has(corners.map((c) => c.label).join(".")), config).toBe(true);
        vertices++;
      } else {
        // a point of two tiles is no vertex: a star's dent and a corner
        expect(corners).toHaveLength(2);
        expect(corners.some((c) => c.angle > 180)).toBe(true);
      }
    }
    expect(vertices).toBeGreaterThan(0);
  });

  it("uses every kind it lists, a star among them", () => {
    const used = new Set(spec.tiles.map(([kind]) => kind));
    expect(used.size).toBe(spec.kinds.length);
    expect(spec.kinds.some(isStar)).toBe(true);
    // the configuration names only its own kinds' corners
    const labels = new Set(spec.kinds.flatMap((k) => cornersOfKind(k).map((c) => c.label)));
    for (const label of spec.config) expect(labels.has(label)).toBe(true);
  });

  it("cuts a window of whole tiles, joined edge to edge", () => {
    const { cells } = starWindow(key, 6);
    expect(cells.length).toBeGreaterThan(0);
  });
});
