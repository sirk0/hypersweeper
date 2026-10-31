// The vertex rule of a uniform tiling: every vertex is surrounded the same
// way, a cyclic sequence of regular polygons — 3.6.3.6 is triangle, hexagon,
// triangle, hexagon round each point. A level with a rule lets a tile land only
// where every vertex it touches can still become exactly that: the corners
// already round the point, plus the new one, must sit where the sequence puts
// them, read either way round. That is what stops six triangles standing in for
// a hexagon — they cover the same ground, but leave vertices no uniform 3.6.3.6
// tiling has.
//
// A corner is kept as the direction its tile's first edge leaves the vertex
// in (an index k of ζ^k, read exactly off a unit edge) and the polygon's side
// count; a regular p-gon's corner spans (p − 2)·n / 2p of the n directions.

import type { Cyc, Ring } from "./cyclotomic";

export interface Corner {
  /** ζ^start is the direction of the corner's first edge, counter-clockwise. */
  start: number;
  sides: number;
}

/** The direction index k with ζ^k = v, for a unit vector v. */
function direction(ring: Ring, v: Cyc): number {
  for (let k = 0; k < ring.n; k++) if (ring.eq(ring.zeta(k), v)) return k;
  throw new Error("vertexRule: an edge is not one unit long along a ring direction");
}

/** Each corner of a counter-clockwise polygon, keyed by its vertex. */
export function cornersOf(ring: Ring, verts: Cyc[]): [string, Corner][] {
  const m = verts.length;
  return verts.map((v, i) => [
    ring.key(v),
    { start: direction(ring, ring.sub(verts[(i + 1) % m]!, v)), sides: m },
  ]);
}

/** How many of the n directions a regular p-gon's corner spans. */
export function span(n: number, sides: number): number {
  const s = ((sides - 2) * n) / (2 * sides);
  if (!Number.isInteger(s))
    throw new Error(`vertexRule: a ${sides}-gon's corner is not a whole step of ζ${n}`);
  return s;
}

/**
 * Whether `corners`, round one vertex, sit as some turn of `config` (or of
 * it reversed) places them: lay the sequence round the point starting with
 * each of its entries at the first corner, and every corner present must land
 * exactly on an entry of its own polygon. Gaps are fine — they are what is
 * still to come — and a complete vertex is just the case with none.
 */
export function fitsConfig(
  n: number,
  config: readonly number[],
  corners: readonly Corner[],
): boolean {
  if (corners.length === 0) return true;
  const first = corners[0]!;
  for (const seq of [config, [...config].reverse()]) {
    for (let j = 0; j < seq.length; j++) {
      if (seq[j] !== first.sides) continue;
      const laid = new Map<number, number>();
      let at = first.start;
      for (let i = 0; i < seq.length; i++) {
        const sides = seq[(j + i) % seq.length]!;
        laid.set(((at % n) + n) % n, sides);
        at += span(n, sides);
      }
      if (corners.every((c) => laid.get(((c.start % n) + n) % n) === c.sides)) return true;
    }
  }
  return false;
}
