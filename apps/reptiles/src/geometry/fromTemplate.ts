// A window of one of Hypersweeper's periodic tilings, in exact coordinates —
// the same tiles `archimedeanBoard` puts on its flat board.
//
// Hypersweeper builds those tilings from a template (`ArchTemplate` in
// packages/geometry/src/tilings.ts): one rectangular domain of cells, each cell a list
// of vertex references (a tag naming a vertex of the domain, and which copy of
// the domain it is in). The positions are floats, but a reference *names* its
// vertex, so which vertices are one and the same is known without comparing
// any coordinates. What is left to make exact is each edge, and every edge of
// a uniform or 2-uniform tiling is one unit long in one of a few directions:
// reading which direction (one of n, at least 15° apart) off the float vector
// is choosing among a handful of angles, not deciding whether two points
// coincide. Walking the edges from one vertex then gives every vertex as a sum
// of unit vectors ζ^k — exact — and a vertex reached two ways must come out the
// same, which is checked.
//
// The window is chosen as `archimedeanBoard` chooses it (the unit tests compare
// the two tile for tile), and y is flipped on the way in: Hypersweeper draws y
// down, this game y up, so the level looks as the Hypersweeper board does.

import { archTemplate } from "@tiling/geometry";
import { cyclotomic, type Cyc, type Ring } from "./cyclotomic";

/** The rings tried, smallest first: a tiling lands in the first whose
 * directions hold every edge it has. */
const ORDERS = [4, 6, 8, 12, 24];

/** How far a template edge may be off one unit long, or off a ring
 * direction (in steps of it), and still be read as it. Templates store their
 * positions rounded to six decimals, so a snub square's edges come out 0.999999
 * or 1.000001 and a degree or so of a millionth off — while the directions it
 * chooses among are 15° apart. Only which direction an edge runs in is read
 * this way; the walk that follows is exact and checks itself. */
const TOLERANCE = 1e-4;

export interface Window {
  ring: Ring;
  cells: Cyc[][];
  /** How far the tiling was turned from Hypersweeper's drawing to put its
   * edges on the ring's directions, in radians: 0, unless it has no edge
   * along an axis at all (the snub hexagonal, drawn with its lattice square
   * and its tiles 19° off). Then the window is not `archimedeanBoard`'s. */
  turned: number;
}

type XY = [number, number];

/**
 * The tiles of `tiling` that fit whole in a `box`-edge square, in exact
 * coordinates. Where the tiling's edges already lie on a ring's directions
 * this is the very window `archimedeanBoard(tiling, box / width, box /
 * height)` keeps. Where they do not, the tiling is first turned so that one
 * of its edges is level — every other edge then lands on a ring direction too
 * — and the square is cut in that turned frame, so the board's tiles sit as
 * the tray holds them.
 */
export function templateWindow(
  tiling: string,
  box: number,
  { quarter = false, dropStrays = false } = {},
): Window {
  const t = archTemplate(tiling);
  const W = t.width;
  const H = t.height;
  const at = (m: number, n: number, tag: string): XY => {
    const v = t.verts.get(tag)!;
    return [m * W + v[0], n * H + v[1]];
  };
  const angleOf = (p: XY, q: XY): number => Math.atan2(-(q[1] - p[1]), q[0] - p[0]);

  // The frame: Hypersweeper's, y flipped (it draws y down), turned by -alpha.
  const sample = t.cells.flatMap(({ refs }) =>
    refs.map((r, i) => {
      const q = refs[(i + 1) % refs.length]!;
      return angleOf(at(r.dm, r.dn, r.tag), at(q.dm, q.dn, q.tag));
    }),
  );
  // `quarter`: the ring must also hold a quarter turn — for a dual, whose
  // edges cross these at right angles.
  const ringFor = (alpha: number): number | undefined =>
    ORDERS.find(
      (order) =>
        (!quarter || order % 4 === 0) &&
        sample.every((a) => {
          const k = ((a - alpha) * order) / (2 * Math.PI);
          return Math.abs(k - Math.round(k)) < TOLERANCE;
        }),
    );
  let alpha = 0;
  let n = ringFor(0);
  if (n === undefined) {
    alpha = sample[0]!;
    n = ringFor(alpha);
  }
  if (n === undefined) throw new Error(`templateWindow: ${tiling} has edges at no 15° multiple`);
  const ring = cyclotomic(n);
  const [ca, sa] = [Math.cos(-alpha), Math.sin(-alpha)];
  const frame = ([x, y]: XY): XY => [x * ca + y * sa, x * sa - y * ca];

  // The grown patch and its centre: archimedeanBoard's own steps, unturned;
  // turned, a patch big enough to hold the square whichever way it lies.
  const nx = box / W;
  const ny = box / H;
  const spread = alpha === 0 ? [nx + 2, ny + 2] : [2 * nx + 4, 2 * ny + 4];
  interface Grown {
    ids: string[];
    pts: XY[];
    centroid: XY;
  }
  const grown: Grown[] = [];
  for (let m = 0; m < spread[0]!; m++) {
    for (let k = 0; k < spread[1]!; k++) {
      for (const { refs } of t.cells) {
        const ids = refs.map((r) => `${m + r.dm},${k + r.dn},${r.tag}`);
        const pts = refs.map((r) => frame(at(m + r.dm, k + r.dn, r.tag)));
        const cx = pts.reduce((sum, p) => sum + p[0], 0) / pts.length;
        const cy = pts.reduce((sum, p) => sum + p[1], 0) / pts.length;
        grown.push({ ids, pts, centroid: [cx, cy] });
      }
    }
  }
  const mid = frame([(spread[0]! * W) / 2, (spread[1]! * H) / 2]);
  let c0: XY = [0, 0];
  let best = Infinity;
  const consider = (p: XY): void => {
    const d = (p[0] - mid[0]) ** 2 + (p[1] - mid[1]) ** 2;
    if (d < best) [best, c0] = [d, p];
  };
  if (t.centre) {
    for (let m = 0; m < spread[0]!; m++) {
      for (let k = 0; k < spread[1]!; k++)
        consider(frame([t.centre[0] + m * W, t.centre[1] + k * H]));
    }
  } else {
    const biggest = Math.max(...grown.map((g) => g.ids.length));
    for (const g of grown) if (g.ids.length === biggest) consider(g.centroid);
  }
  const half = box / 2;
  const slack = 1e-6 * Math.max(1, W, H);
  const kept = grown.filter((g) =>
    g.pts.every(
      ([x, y]) => Math.abs(x - c0[0]) <= half + slack && Math.abs(y - c0[1]) <= half + slack,
    ),
  );
  if (kept.length === 0)
    throw new Error(`templateWindow: nothing fits a ${box}-edge window of ${tiling}`);
  for (const g of kept) {
    g.pts.forEach((p, i) => {
      const q = g.pts[(i + 1) % g.pts.length]!;
      if (Math.abs(Math.hypot(q[0] - p[0], q[1] - p[1]) - 1) > TOLERANCE) {
        throw new Error(`templateWindow: ${tiling} has an edge that is not one unit long`);
      }
    });
  }
  const dirOf = (p: XY, q: XY): number =>
    Math.round((Math.atan2(q[1] - p[1], q[0] - p[0]) * n) / (2 * Math.PI));

  // Walk the edges outward, cell by cell, from the tile nearest the centre —
  // never a stray at a corner.
  const seed = kept.reduce((a, b) =>
    Math.hypot(b.centroid[0] - c0[0], b.centroid[1] - c0[1]) <
    Math.hypot(a.centroid[0] - c0[0], a.centroid[1] - c0[1])
      ? b
      : a,
  );
  const exact = new Map<string, Cyc>([[seed.ids[0]!, ring.zero]]);
  let pending = kept.slice();
  while (pending.length > 0) {
    const next: Grown[] = [];
    for (const g of pending) {
      const start = g.ids.findIndex((id) => exact.has(id));
      if (start < 0) {
        next.push(g);
        continue;
      }
      const m = g.ids.length;
      for (let j = 0; j < m; j++) {
        const i = (start + j) % m;
        const i1 = (i + 1) % m;
        const here = exact.get(g.ids[i]!)!;
        const there = ring.add(here, ring.zeta(dirOf(g.pts[i]!, g.pts[i1]!)));
        const known = exact.get(g.ids[i1]!);
        if (known && !ring.eq(known, there)) {
          throw new Error(`templateWindow: ${tiling} does not close up exactly at ${g.ids[i1]}`);
        }
        exact.set(g.ids[i1]!, there);
      }
    }
    if (next.length === pending.length) {
      // `dropStrays`: a tile kept at a corner of the square, touching
      // nothing else kept, is left out instead — for a patch that is only a
      // means to something else (a dual), not a board.
      if (!dropStrays) throw new Error(`templateWindow: the ${tiling} window is not connected`);
      break;
    }
    pending = next;
  }
  const placed = kept.filter((g) => g.ids.every((id) => exact.has(id)));
  return { ring, cells: placed.map((g) => g.ids.map((id) => exact.get(id)!)), turned: alpha };
}
