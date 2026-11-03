// The outline of a patch of cells: what a level's region is, read off the very
// cells a Hypersweeper board is made of. Every cell edge is listed
// counter-clockwise; an edge two cells share appears once each way and
// cancels, and what is left — chained end to start — is the patch's boundary,
// outer loops counter-clockwise and holes clockwise. Exact, like everything
// here: edges cancel by vertex key, never by distance.
//
// Where cells do not meet edge to edge — a brick's corner part-way along its
// neighbour's side, in a running bond — each side is first cut at every other
// cell's corner that lies strictly inside it (`strictlyBetween`, exact), so
// the shared stretch cancels piece by piece.

import { strictlyBetween, type Cyc, type Ring } from "./cyclotomic";
import { signedArea } from "./shape";

/** `verts` in counter-clockwise order (reversed if they were clockwise). */
export function ccw(ring: Ring, verts: Cyc[]): Cyc[] {
  return signedArea(verts.map((v) => ring.toXY(v))) < 0 ? [...verts].reverse() : verts;
}

/** Each cell's corners, with every other cell's corner that lies strictly
 * inside one of its sides added there in order — a no-op edge to edge. Floats
 * only prefilter by bounding box and order points already known to be on one
 * side. */
function withTVertices(ring: Ring, cells: Cyc[][]): Cyc[][] {
  const points = new Map<string, { p: Cyc; xy: [number, number] }>();
  for (const cell of cells) for (const p of cell) points.set(ring.key(p), { p, xy: ring.toXY(p) });
  const all = [...points.values()];
  const eps = 1e-9;
  return cells.map((cell) =>
    cell.flatMap((a, i) => {
      const b = cell[(i + 1) % cell.length]!;
      const [ax, ay] = ring.toXY(a);
      const [bx, by] = ring.toXY(b);
      const cuts = all.filter(
        ({ p, xy: [x, y] }) =>
          x >= Math.min(ax, bx) - eps &&
          x <= Math.max(ax, bx) + eps &&
          y >= Math.min(ay, by) - eps &&
          y <= Math.max(ay, by) + eps &&
          strictlyBetween(ring, a, b, p),
      );
      cuts.sort(
        (u, v) => Math.hypot(u.xy[0] - ax, u.xy[1] - ay) - Math.hypot(v.xy[0] - ax, v.xy[1] - ay),
      );
      return [a, ...cuts.map((c) => c.p)];
    }),
  );
}

export function outline(ring: Ring, cells: Cyc[][]): Cyc[][] {
  const open = new Map<string, { a: Cyc; b: Cyc; ak: string; bk: string }>();
  for (const cell of withTVertices(
    ring,
    cells.map((c) => ccw(ring, c)),
  )) {
    const verts = cell;
    verts.forEach((a, i) => {
      const b = verts[(i + 1) % verts.length]!;
      const ak = ring.key(a);
      const bk = ring.key(b);
      if (open.has(`${bk}>${ak}`)) open.delete(`${bk}>${ak}`);
      else open.set(`${ak}>${bk}`, { a, b, ak, bk });
    });
  }
  const from = new Map<string, { a: Cyc; bk: string; used: boolean }[]>();
  for (const e of open.values()) {
    const list = from.get(e.ak);
    const entry = { a: e.a, bk: e.bk, used: false };
    if (list) list.push(entry);
    else from.set(e.ak, [entry]);
  }
  const loops: Cyc[][] = [];
  for (const [start, list] of from) {
    for (const first of list) {
      if (first.used) continue;
      const loop: Cyc[] = [];
      let at = first;
      for (;;) {
        at.used = true;
        loop.push(at.a);
        if (at.bk === start && loop.length > 1) break;
        const next = from.get(at.bk)?.find((e) => !e.used);
        if (!next) break;
        at = next;
      }
      loops.push(loop);
    }
  }
  return loops;
}
