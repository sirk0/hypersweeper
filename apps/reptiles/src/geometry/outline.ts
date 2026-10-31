// The outline of a patch of cells: what a level's region is, read off the very
// cells a Hypersweeper board is made of. Every cell edge is listed
// counter-clockwise; an edge two cells share appears once each way and
// cancels, and what is left — chained end to start — is the patch's boundary,
// outer loops counter-clockwise and holes clockwise. Exact, like everything
// here: edges cancel by vertex key, never by distance.

import type { Cyc, Ring } from "./cyclotomic";
import { signedArea } from "./shape";

/** `verts` in counter-clockwise order (reversed if they were clockwise). */
export function ccw(ring: Ring, verts: Cyc[]): Cyc[] {
  return signedArea(verts.map((v) => ring.toXY(v))) < 0 ? [...verts].reverse() : verts;
}

export function outline(ring: Ring, cells: Cyc[][]): Cyc[][] {
  const open = new Map<string, { a: Cyc; b: Cyc; ak: string; bk: string }>();
  for (const cell of cells) {
    const verts = ccw(ring, cell);
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
