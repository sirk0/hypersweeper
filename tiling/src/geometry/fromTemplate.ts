// A window of one of Hypersweeper's periodic tilings, in exact coordinates —
// the same tiles `archimedeanBoard` puts on its flat board.
//
// Hypersweeper builds those tilings from a template (`ArchTemplate` in
// web/src/boards/tilings.ts): one rectangular domain of cells, each cell a list
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

import { archTemplate } from "@boards/tilings";
import { cyclotomic, type Cyc, type Ring } from "./cyclotomic";

/** The rings tried, smallest first: a tiling lands in the first whose
 * directions hold every edge it has. */
const ORDERS = [4, 6, 8, 12, 24];

export interface Window {
  ring: Ring;
  cells: Cyc[][];
}

export function templateWindow(tiling: string, nx: number, ny: number): Window {
  const t = archTemplate(tiling);
  const W = t.width;
  const H = t.height;
  const at = (m: number, n: number, tag: string): [number, number] => {
    const v = t.verts.get(tag)!;
    return [m * W + v[0], n * H + v[1]];
  };

  // The grown patch and its centre: archimedeanBoard's own steps.
  interface Grown {
    ids: string[];
    pts: [number, number][];
    centroid: [number, number];
  }
  const grown: Grown[] = [];
  for (let m = 0; m < nx + 2; m++) {
    for (let n = 0; n < ny + 2; n++) {
      for (const { refs } of t.cells) {
        const ids = refs.map((r) => `${m + r.dm},${n + r.dn},${r.tag}`);
        const pts = refs.map((r) => at(m + r.dm, n + r.dn, r.tag));
        const cx = pts.reduce((s, p) => s + p[0], 0) / pts.length;
        const cy = pts.reduce((s, p) => s + p[1], 0) / pts.length;
        grown.push({ ids, pts, centroid: [cx, cy] });
      }
    }
  }
  const midX = ((nx + 2) * W) / 2;
  const midY = ((ny + 2) * H) / 2;
  let c0: [number, number] = [0, 0];
  let best = Infinity;
  if (t.centre) {
    for (let m = 0; m < nx + 2; m++) {
      for (let n = 0; n < ny + 2; n++) {
        const p: [number, number] = [t.centre[0] + m * W, t.centre[1] + n * H];
        const d = (p[0] - midX) ** 2 + (p[1] - midY) ** 2;
        if (d < best) [best, c0] = [d, p];
      }
    }
  } else {
    const biggest = Math.max(...grown.map((g) => g.ids.length));
    for (const g of grown) {
      if (g.ids.length !== biggest) continue;
      const d = (g.centroid[0] - midX) ** 2 + (g.centroid[1] - midY) ** 2;
      if (d < best) [best, c0] = [d, g.centroid];
    }
  }
  const halfW = (nx * W) / 2;
  const halfH = (ny * H) / 2;
  const slack = 1e-6 * Math.max(1, W, H);
  const kept = grown.filter((g) =>
    g.pts.every(([x, y]) => Math.abs(x - c0[0]) <= halfW + slack && Math.abs(y - c0[1]) <= halfH + slack),
  );
  if (kept.length === 0) throw new Error(`templateWindow: nothing fits a ${nx}×${ny} window of ${tiling}`);

  // Every edge as a direction index — in the first ring whose directions fit
  // them all — with y flipped.
  const edges = kept.flatMap((g) =>
    g.pts.map((p, i) => {
      const q = g.pts[(i + 1) % g.pts.length]!;
      const dx = q[0] - p[0];
      const dy = -(q[1] - p[1]);
      if (Math.abs(Math.hypot(dx, dy) - 1) > 1e-6) {
        throw new Error(`templateWindow: ${tiling} has an edge that is not one unit long`);
      }
      return Math.atan2(dy, dx);
    }),
  );
  const n = ORDERS.find((order) =>
    edges.every((a) => {
      const k = (a * order) / (2 * Math.PI);
      return Math.abs(k - Math.round(k)) < 1e-6;
    }),
  );
  if (n === undefined) throw new Error(`templateWindow: ${tiling} has edges at no 15° multiple`);
  const ring = cyclotomic(n);
  const dirOf = (p: [number, number], q: [number, number]): number =>
    Math.round((Math.atan2(-(q[1] - p[1]), q[0] - p[0]) * n) / (2 * Math.PI));

  // Walk the edges outward from the first vertex, cell by cell.
  const exact = new Map<string, Cyc>([[kept[0]!.ids[0]!, ring.zero]]);
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
    if (next.length === pending.length) throw new Error(`templateWindow: the ${tiling} window is not connected`);
    pending = next;
  }
  return { ring, cells: kept.map((g) => g.ids.map((id) => exact.get(id)!)) };
}
