// The Laves tilings, exactly: each the dual of a uniform tiling. A Laves tile
// stands on each vertex of the uniform tiling, its corners the centres of the
// faces round that vertex, in turn — so the kite of V3.4.6.4 has its corners
// at the centres of a triangle, a square, a hexagon and a square. The
// 2-isohedral tilings are built the same way from a 2-uniform one: its two
// kinds of vertex give the dual its two kinds of tile.
//
// A regular polygon's centre is the mean of its corners, so in a ring of
// cyclotomic integers it is exact once scaled by the side count: L·centre =
// (L/m)·Σ corners is integral when m divides L. The whole board is built at
// L — the least common multiple of the face sizes — in a ring whose `unit` is
// L, so it is drawn back at the primal tiling's own size. The uniform patch
// comes from `templateWindow`, in a ring that also holds a quarter turn: a
// dual edge crosses a uniform edge at right angles.

import { ccw } from "./outline";
import { cyclotomic, type Cyc, type Ring } from "./cyclotomic";
import { archTemplate } from "@tiling/geometry";
import { templateWindow, type XY } from "./fromTemplate";
import { cornersOf, span } from "./vertexRule";

function lcm(a: number, b: number): number {
  const gcd = (x: number, y: number): number => (y === 0 ? x : gcd(y, x % y));
  return (a / gcd(a, b)) * b;
}

/**
 * The tiles of the dual of tiling `tiling` (uniform or 2-uniform) that fit
 * whole in a `box`-edge square (in that tiling's edge lengths), centred on the
 * face centre nearest the middle of the patch — a point the dual turns about.
 * Where the square cuts a few tiles off from the rest — a lone kite in a
 * corner — only the largest piece joined edge to edge is kept.
 */
export function lavesWindow(
  tiling: string,
  box: number,
  offset: XY = [0, 0],
): { ring: Ring; cells: Cyc[][] } {
  const { ring, duals, c0, toFrame } = dualPatch(tiling, box, offset[0] !== 0 || offset[1] !== 0);
  // the square moved by `offset`, a vector in the template's coordinates
  const [dx, dy] = toFrame(offset);
  const half = box / 2 + 1e-9;
  const inside = duals.filter((tile) =>
    tile.every((v) => {
      const [x, y] = ring.toXY(v);
      return Math.abs(x - c0[0] - dx) <= half && Math.abs(y - c0[1] - dy) <= half;
    }),
  );
  return { ring, cells: largestPiece(ring, inside) };
}

interface DualPatch {
  ring: Ring;
  duals: Cyc[][];
  /** The face centre nearest the middle: where the square is centred. */
  c0: XY;
  toFrame: (v: XY) => XY;
}

/** The dual patches built so far — a scan of where the square can go cuts
 * one patch many times. */
const DUAL_PATCHES = new Map<string, DualPatch>();

/** The dual tiles round every whole vertex of a uniform patch comfortably
 * bigger than a `box` square — by a domain more each way where the square is
 * to be `moved` — and the face centre nearest its middle. */
function dualPatch(tiling: string, box: number, moved: boolean): DualPatch {
  const memo = `${tiling}|${box}|${moved}`;
  const known = DUAL_PATCHES.get(memo);
  if (known) return known;
  const t = archTemplate(tiling);
  // A uniform patch comfortably bigger than the square, so every dual tile
  // that could fit has its whole vertex star in it.
  const size = box * 1.5 + 6 + (moved ? 2 * Math.max(t.width, t.height) : 0);
  const uniform = templateWindow(tiling, size, { quarter: true, dropStrays: true });
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

  // Centre on the face centre nearest the middle.
  const pts = duals.flat().map((v) => ring.toXY(v));
  const mx = pts.reduce((sum, p) => sum + p[0], 0) / pts.length;
  const my = pts.reduce((sum, p) => sum + p[1], 0) / pts.length;
  let c0: XY = [0, 0];
  let best = Infinity;
  for (const p of pts) {
    const d = (p[0] - mx) ** 2 + (p[1] - my) ** 2;
    if (d < best) [best, c0] = [d, p];
  }
  const patch = { ring, duals, c0, toFrame: uniform.toFrame };
  DUAL_PATCHES.set(memo, patch);
  return patch;
}

/** The largest set of cells joined edge to edge — dual tiles meet whole edge
 * to whole edge, so two that share one share both its ends, in turn. */
function largestPiece(ring: Ring, cells: Cyc[][]): Cyc[][] {
  const byEdge = new Map<string, number[]>();
  cells.forEach((cell, i) =>
    cell.forEach((v, j) => {
      const ends = [ring.key(v), ring.key(cell[(j + 1) % cell.length]!)].sort().join("|");
      byEdge.set(ends, [...(byEdge.get(ends) ?? []), i]);
    }),
  );
  const piece = new Array<number>(cells.length).fill(-1);
  const sizes: number[] = [];
  for (let start = 0; start < cells.length; start++) {
    if (piece[start] !== -1) continue;
    const id = sizes.length;
    const stack = [start];
    piece[start] = id;
    let size = 0;
    while (stack.length) {
      const i = stack.pop()!;
      size++;
      const cell = cells[i]!;
      cell.forEach((v, j) => {
        const ends = [ring.key(v), ring.key(cell[(j + 1) % cell.length]!)].sort().join("|");
        for (const k of byEdge.get(ends)!) {
          if (piece[k] === -1) {
            piece[k] = id;
            stack.push(k);
          }
        }
      });
    }
    sizes.push(size);
  }
  const biggest = sizes.indexOf(Math.max(...sizes));
  return cells.filter((_, i) => piece[i] === biggest);
}
