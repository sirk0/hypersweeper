// The Laves tilings, exactly: each the dual of a uniform tiling. A Laves tile
// stands on each vertex of the uniform tiling, its corners the centres of the
// faces round that vertex, in turn — so the kite of V3.4.6.4 has its corners
// at the centres of a triangle, a square, a hexagon and a square.
//
// A regular polygon's centre is the mean of its corners, so in a ring of
// cyclotomic integers it is exact once scaled by the side count: L·centre =
// (L/m)·Σ corners is integral when m divides L. The whole board is built at
// L — the least common multiple of the face sizes — in a ring whose `unit` is
// L, so it is drawn back at the uniform tiling's own size. The uniform patch
// comes from `templateWindow`, in a ring that also holds a quarter turn: a
// dual edge crosses a uniform edge at right angles.

import { ccw } from "./outline";
import { cyclotomic, type Cyc, type Ring } from "./cyclotomic";
import { templateWindow } from "./fromTemplate";
import { cornersOf, span } from "./vertexRule";

function lcm(a: number, b: number): number {
  const gcd = (x: number, y: number): number => (y === 0 ? x : gcd(y, x % y));
  return (a / gcd(a, b)) * b;
}

/**
 * The tiles of the dual of uniform tiling `tiling` that fit whole in a
 * `box`-edge square (in the uniform tiling's edge lengths), centred on the face
 * centre nearest the middle of the patch — a point the dual turns about.
 */
export function lavesWindow(tiling: string, box: number): { ring: Ring; cells: Cyc[][] } {
  // A uniform patch comfortably bigger than the square, so every dual tile
  // that could fit has its whole vertex star in it.
  const uniform = templateWindow(tiling, box * 1.5 + 6, { quarter: true, dropStrays: true });
  const base = uniform.ring;
  const L = uniform.cells.reduce((acc, c) => lcm(acc, c.length), 1);
  const ring = cyclotomic(base.n, L);
  const scale = (k: number, v: Cyc): Cyc => v.map((x) => k * x);

  // Every face centre, scaled by L, and the corners round every vertex.
  const round = new Map<string, { start: number; centre: Cyc; spanned: number }[]>();
  for (const raw of uniform.cells) {
    const cell = ccw(base, raw);
    const sum = cell.reduce((acc, v) => base.add(acc, v), base.zero);
    const centre = scale(L / cell.length, sum);
    for (const [key, corner] of cornersOf(base, cell)) {
      const list = round.get(key) ?? [];
      list.push({ start: corner.start, centre, spanned: span(base.n, corner.sides) });
      round.set(key, list);
    }
  }
  // A dual tile for every vertex with its faces all the way round, corners
  // counter-clockwise: the faces taken in the order their corners start.
  const duals: Cyc[][] = [];
  for (const corners of round.values()) {
    if (corners.reduce((sum, c) => sum + c.spanned, 0) !== base.n) continue;
    duals.push([...corners].sort((a, b) => a.start - b.start).map((c) => c.centre));
  }
  if (duals.length === 0) throw new Error(`lavesWindow: no whole vertex in the ${tiling} patch`);

  // Centre on the face centre nearest the middle, and keep what fits.
  const pts = duals.flat().map((v) => ring.toXY(v));
  const mx = pts.reduce((sum, p) => sum + p[0], 0) / pts.length;
  const my = pts.reduce((sum, p) => sum + p[1], 0) / pts.length;
  let c0: [number, number] = [0, 0];
  let best = Infinity;
  for (const p of pts) {
    const d = (p[0] - mx) ** 2 + (p[1] - my) ** 2;
    if (d < best) [best, c0] = [d, p];
  }
  const half = box / 2 + 1e-9;
  const cells = duals.filter((tile) =>
    tile.every((v) => {
      const [x, y] = ring.toXY(v);
      return Math.abs(x - c0[0]) <= half && Math.abs(y - c0[1]) <= half;
    }),
  );
  return { ring, cells };
}
