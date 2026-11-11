// Matching rules and colourings read off an aperiodic tiling's own patch.
//
// An aperiodic level is a window onto a patch its builder grows far past it
// (the Penrose wheel's 430 rhombi round a 29-rhombus window). That patch is
// the tiling, as far as anything here knows it, so both kinds of marks are
// read off it. A spiral is read the same way: grown past its window, it is
// no more periodic than they are — its centre is a point unlike any other.
//
// - **Matching rules.** Every tile of the patch is listed in its prototile's
//   own order (`FramedPatch`): edge j of every copy is the same edge of the
//   prototile — a *slot* — whichever way the copy is turned or mirrored. Each
//   shared edge of the patch says which two slots may meet, and whether their
//   arrows, if they have them, must point the same way along it. Slots that
//   meet, directly or by a chain, are one class (`deriveRules`), and a class
//   whose slots can all be given a way along their edge so that every
//   meeting agrees is drawn as an arrow; a class where they cannot (an odd
//   cycle of meetings) as a label with no way. That is the finest rule of
//   that shape every shared edge of the patch keeps — so the window keeps
//   it, and a player laying it must too.
// - **Colourings.** A proper colouring of the window and the tiles round it
//   (`around`): no two tiles that share an edge alike. An aperiodic tiling
//   has no colouring whose tiles of a colour all read alike — their
//   neighbours differ from place to place — so the tray holds one tile per
//   distinct marked tile, and `chooseColouring` looks for the colouring with
//   the fewest (the script writes it down: src/aperiodicColourings.json).
//
// A mark is a label on a whole edge, never cut part-way (frontier.ts), so
// every edge is first cut at every corner of the tile across it, and every
// copy of a slot the same way (`refine`): the hat's long side at its middle,
// Tile(1,1) at its flat corner, the metatiles and the Socolar–Taylor tile's
// pieces where their neighbours' corners land.
//
// Everything is exact. Floats only find the corners near an edge before the
// exact test (`strictlyBetween`), and order points already known to be on
// one edge.

import { strictlyBetween, type Cyc, type Ring } from "./geometry/cyclotomic";
import { ccw } from "./geometry/outline";
import { corners } from "./geometry/repTile";

/** A patch with each tile listed in its prototile's own order: `kind`, which
 * prototile, and its pieces, each piece's corners in the prototile's order —
 * edge j running from corner j to j + 1, counter-clockwise or not as the
 * copy is mirrored. */
export interface FramedPatch {
  ring: Ring;
  cells: { kind: number; pieces: Cyc[][] }[];
}

/** One piece of a refined tile: its corners in the prototile's order with
 * every split point added, and each edge's slot (`kind:piece:edge:sub`). */
export interface RefinedPiece {
  verts: Cyc[];
  slots: string[];
}

export interface RefinedPatch {
  ring: Ring;
  cells: { kind: number; pieces: RefinedPiece[] }[];
}

/** The turn (and mirror) that carries `from` onto `to`, two vectors of one
 * length: ζ^k·from, or ζ^k·conj(from). Null if none does. */
function turnOnto(ring: Ring, from: Cyc, to: Cyc): { k: number; conj: boolean } | null {
  for (const conj of [false, true]) {
    const f = conj ? ring.conj(from) : from;
    for (let k = 0; k < ring.n; k++) if (ring.eq(ring.mul(ring.zeta(k), f), to)) return { k, conj };
  }
  return null;
}

const apply = (ring: Ring, { k, conj }: { k: number; conj: boolean }, w: Cyc): Cyc =>
  ring.mul(ring.zeta(k), conj ? ring.conj(w) : w);

const undo = (ring: Ring, { k, conj }: { k: number; conj: boolean }, w: Cyc): Cyc => {
  const back = ring.mul(ring.zeta(-k), w);
  return conj ? ring.conj(back) : back;
};

/** Every point of `points` strictly inside the edge a → b. A grid of floats
 * finds the few near it; `strictlyBetween` decides, exactly. */
class PointGrid {
  private readonly cells = new Map<string, { p: Cyc; x: number; y: number }[]>();
  constructor(
    private readonly ring: Ring,
    points: Iterable<Cyc>,
    private readonly size: number,
  ) {
    for (const p of points) {
      const [x, y] = ring.toXY(p);
      const key = `${Math.floor(x / size)},${Math.floor(y / size)}`;
      const list = this.cells.get(key);
      if (list) list.push({ p, x, y });
      else this.cells.set(key, [{ p, x, y }]);
    }
  }
  inside(a: Cyc, b: Cyc): Cyc[] {
    const [ax, ay] = this.ring.toXY(a);
    const [bx, by] = this.ring.toXY(b);
    const s = this.size;
    const out: Cyc[] = [];
    for (
      let i = Math.floor((Math.min(ax, bx) - 1e-6) / s);
      i <= Math.floor((Math.max(ax, bx) + 1e-6) / s);
      i++
    )
      for (
        let j = Math.floor((Math.min(ay, by) - 1e-6) / s);
        j <= Math.floor((Math.max(ay, by) + 1e-6) / s);
        j++
      )
        for (const { p } of this.cells.get(`${i},${j}`) ?? [])
          if (strictlyBetween(this.ring, a, b, p)) out.push(p);
    return out;
  }
}

/**
 * The patch with every edge cut where a corner of the tile across lands on
 * it, every copy of a slot cut the same way: a cut one copy needs, every
 * copy gets, which may put a corner on another tile's edge in turn — so it
 * goes round until nothing more is cut. A cut is kept in the slot's first
 * copy's frame (the vector from its start), and carried to each other copy
 * by the turn (and mirror) that carries that edge onto it.
 */
export function refine(patch: FramedPatch): RefinedPatch {
  const { ring } = patch;
  type Copy = { a: Cyc; b: Cyc; slot: string; to: { k: number; conj: boolean } };
  const reps = new Map<string, Cyc>();
  const copies: Copy[][][] = patch.cells.map(({ kind, pieces }) =>
    pieces.map((verts, p) =>
      verts.map((a, j) => {
        const b = verts[(j + 1) % verts.length]!;
        const slot = `${kind}:${p}:${j}`;
        const d = ring.sub(b, a);
        let rep = reps.get(slot);
        if (!rep) reps.set(slot, (rep = d));
        const to = turnOnto(ring, rep, d);
        if (!to) throw new Error(`refine: slot ${slot} is no copy of its prototile's edge`);
        return { a, b, slot, to };
      }),
    ),
  );
  // each slot's cuts, as vectors from its start in its first copy's frame
  const cuts = new Map<string, Map<string, Cyc>>();
  let lengths = 0;
  let count = 0;
  for (const cell of copies)
    for (const piece of cell)
      for (const { a, b } of piece) {
        const [ax, ay] = ring.toXY(a);
        const [bx, by] = ring.toXY(b);
        lengths += Math.hypot(bx - ax, by - ay);
        count++;
      }
  const size = Math.max(lengths / Math.max(count, 1), 1e-6);
  // a copy's corners, with its slot's cuts carried onto it, in order
  const cutCopy = ({ a, b, slot, to }: Copy): Cyc[] => {
    const own = [...(cuts.get(slot)?.values() ?? [])].map((w) => ring.add(a, apply(ring, to, w)));
    const [ax, ay] = ring.toXY(a);
    const far = (p: Cyc): number => {
      const [x, y] = ring.toXY(p);
      return Math.hypot(x - ax, y - ay);
    };
    void b;
    return own.sort((p, q) => far(p) - far(q));
  };
  for (let round = 0; ; round++) {
    if (round > 12) throw new Error("refine: the cuts do not settle");
    const points = new Map<string, Cyc>();
    for (const cell of copies)
      for (const piece of cell)
        for (const copy of piece) {
          points.set(ring.key(copy.a), copy.a);
          for (const p of cutCopy(copy)) points.set(ring.key(p), p);
        }
    const grid = new PointGrid(ring, points.values(), size);
    let changed = false;
    for (const cell of copies)
      for (const piece of cell)
        for (const { a, b, slot, to } of piece)
          for (const x of grid.inside(a, b)) {
            const w = undo(ring, to, ring.sub(x, a));
            const key = ring.key(w);
            let own = cuts.get(slot);
            if (!own) cuts.set(slot, (own = new Map()));
            if (!own.has(key)) {
              own.set(key, w);
              changed = true;
            }
          }
    if (!changed) break;
  }
  return {
    ring,
    cells: copies.map((cell, n) => ({
      kind: patch.cells[n]!.kind,
      pieces: cell.map((piece) => {
        const verts: Cyc[] = [];
        const slots: string[] = [];
        for (const copy of piece) {
          const between = cutCopy(copy);
          [copy.a, ...between].forEach((v, sub) => {
            verts.push(v);
            slots.push(`${copy.slot}:${sub}`);
          });
        }
        return { verts, slots };
      }),
    })),
  };
}

/** Where a refined edge lies: its cell, piece and edge index. */
export interface EdgeAt {
  cell: number;
  piece: number;
  edge: number;
}

/** Every edge of the refined patch two tiles (or two pieces of one) share:
 * its two sides, and whether they run the same way along it (as listed,
 * each in its prototile's order). Throws if three edges lie on one. */
export function meetings(refined: RefinedPatch): { a: EdgeAt; b: EdgeAt; same: boolean }[] {
  const { ring } = refined;
  const owners = new Map<string, { at: EdgeAt; forward: boolean }[]>();
  refined.cells.forEach((cell, c) =>
    cell.pieces.forEach(({ verts }, p) =>
      verts.forEach((v, e) => {
        const [x, y] = [ring.key(v), ring.key(verts[(e + 1) % verts.length]!)];
        const key = x < y ? `${x}|${y}` : `${y}|${x}`;
        const list = owners.get(key) ?? [];
        list.push({ at: { cell: c, piece: p, edge: e }, forward: x < y });
        owners.set(key, list);
      }),
    ),
  );
  const out: { a: EdgeAt; b: EdgeAt; same: boolean }[] = [];
  for (const list of owners.values()) {
    if (list.length > 2) throw new Error("meetings: three tiles share an edge");
    if (list.length === 2)
      out.push({ a: list[0]!.at, b: list[1]!.at, same: list[0]!.forward === list[1]!.forward });
  }
  return out;
}

/** A slot's label: its class, and which end of it (as the prototile runs)
 * its arrow points to — true its end, false its start — or null where its
 * class has no way. */
export interface SlotRule {
  cls: number;
  toEnd: boolean | null;
}

/** Slot names in the prototile's order: kind, piece, edge, then sub-edge. */
const bySlot = (x: string, y: string): number => {
  const a = x.split(":").map(Number);
  const b = y.split(":").map(Number);
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return a[i]! - b[i]!;
  return 0;
};

/**
 * The finest matching rule every shared edge of the patch keeps: slots that
 * meet are one class, and the arrows of two that meet point the same way
 * along their edge (its head at one end of it). A union–find with parity —
 * each slot's way relative to its class's first — and a class where some
 * meeting asks a slot for both ways has none. Classes are numbered as their
 * first slot comes in the prototile's order.
 */
export function deriveRules(refined: RefinedPatch): Map<string, SlotRule> {
  const parent = new Map<string, string>();
  const parity = new Map<string, number>(); // the slot's way relative to its parent's
  const find = (s: string): [string, number] => {
    let p = parent.get(s);
    if (p === undefined) {
      parent.set(s, s);
      parity.set(s, 0);
      return [s, 0];
    }
    if (p === s) return [s, 0];
    const [root, up] = find(p);
    const own = parity.get(s)! ^ up;
    parent.set(s, root);
    parity.set(s, own);
    return [root, own];
  };
  const slotOf = ({ cell, piece, edge }: EdgeAt): string =>
    refined.cells[cell]!.pieces[piece]!.slots[edge]!;
  const all = new Set<string>();
  for (const cell of refined.cells)
    for (const piece of cell.pieces) for (const s of piece.slots) all.add(s);
  const pairs = meetings(refined).map(({ a, b, same }) => ({
    s: slotOf(a),
    t: slotOf(b),
    // run the same way along the edge: the same end; opposite ways, the
    // other end of each
    differ: same ? 0 : 1,
  }));
  for (const { s, t, differ } of pairs) {
    const [rs, ps] = find(s);
    const [rt, pt] = find(t);
    if (rs === rt) continue;
    parent.set(rt, rs);
    parity.set(rt, ps ^ pt ^ differ);
  }
  const wayless = new Set<string>();
  for (const { s, t, differ } of pairs) {
    const [rs, ps] = find(s);
    const [, pt] = find(t);
    if ((ps ^ pt) !== differ) wayless.add(rs);
  }
  const classes = new Map<string, number>();
  const out = new Map<string, SlotRule>();
  for (const s of [...all].sort(bySlot)) {
    const [root, way] = find(s);
    if (!classes.has(root)) classes.set(root, classes.size);
    out.set(s, { cls: classes.get(root)!, toEnd: wayless.has(root) ? null : way === 0 });
  }
  return out;
}

/** A cell's key: its real corners, all its pieces', sorted. */
function cornerKey(ring: Ring, pieces: readonly Cyc[][]): string {
  return pieces
    .flatMap((p) => corners(ring, p).map((v) => ring.key(v)))
    .sort()
    .join("|");
}

/** Where a level's cells lie in a patch of the same tiling: each one's index
 * in the patch, and `shift`, which carries the patch onto the level (the
 * level's point = the patch's + shift). The level's window is cut from the
 * patch as is, or moved; either way some cell of the patch is the level's
 * first, moved. */
export function locate(
  ring: Ring,
  patch: readonly (readonly Cyc[][])[],
  level: readonly (readonly Cyc[][])[],
): { window: number[]; shift: Cyc } {
  const keys = new Map<string, number>();
  patch.forEach((pieces, i) => keys.set(cornerKey(ring, pieces as Cyc[][]), i));
  const tryShift = (shift: Cyc): number[] | null => {
    const back = ring.neg(shift);
    const out: number[] = [];
    for (const pieces of level) {
      const i = keys.get(
        cornerKey(
          ring,
          pieces.map((p) => p.map((v) => ring.add(v, back))),
        ),
      );
      if (i === undefined) return null;
      out.push(i);
    }
    return out;
  };
  const plain = tryShift(ring.zero);
  if (plain) return { window: plain, shift: ring.zero };
  const first = corners(ring, level[0]![0]! as Cyc[])[0]!;
  const count = level[0]!.reduce((n, p) => n + corners(ring, p as Cyc[]).length, 0);
  for (const pieces of patch) {
    if (pieces.reduce((n, p) => n + corners(ring, p as Cyc[]).length, 0) !== count) continue;
    for (const v of corners(ring, pieces[0]! as Cyc[])) {
      const shift = ring.sub(first, v);
      const found = tryShift(shift);
      if (found) return { window: found, shift };
    }
  }
  throw new Error("locate: the level's cells are not in the patch");
}

/** What a level's marked cells need from a refined patch: each window cell's
 * pieces, moved onto the level and listed counter-clockwise, with each edge's
 * slot, whether the slot runs that way, and the patch cell across it (-1 for
 * none in the patch; the cell itself for one of its own pieces). */
export interface WindowCell {
  pieces: { verts: Cyc[]; slots: string[]; forward: boolean[]; across: number[] }[];
}

/** The window's cells, read off the refined patch (see `WindowCell`), and
 * the patch cells round it: those sharing an edge with one of its cells. */
export function windowCells(
  refined: RefinedPatch,
  window: readonly number[],
  shift: Cyc,
): { cells: WindowCell[]; around: number[] } {
  const { ring } = refined;
  // the cell across each edge, by the edge's place in its prototile's listing
  const acrossOf = new Map<string, number>();
  for (const { a, b } of meetings(refined)) {
    acrossOf.set(`${a.cell}:${a.piece}:${a.edge}`, b.cell);
    acrossOf.set(`${b.cell}:${b.piece}:${b.edge}`, a.cell);
  }
  const inWindow = new Set(window);
  const around = new Set<number>();
  const cells = window.map((c) => ({
    pieces: refined.cells[c]!.pieces.map(({ verts, slots }, p) => {
      const m = verts.length;
      // counter-clockwise: as listed, or the listing reversed, when edge e
      // is the listing's edge m − 2 − e run the other way
      const turned = ccw(ring, verts);
      const reversed = turned !== verts;
      const at = (e: number): number => (reversed ? (2 * m - 2 - e) % m : e);
      const across = turned.map((_, e) => acrossOf.get(`${c}:${p}:${at(e)}`) ?? -1);
      for (const a of across) if (a >= 0 && !inWindow.has(a)) around.add(a);
      return {
        verts: turned.map((v) => ring.add(v, shift)),
        slots: turned.map((_, e) => slots[at(e)]!),
        forward: turned.map(() => !reversed),
        across,
      };
    }),
  }));
  return { cells, around: [...around].sort((a, b) => a - b) };
}

// -- choosing a colouring -------------------------------------------------------

/** A proper colouring of a window and the cells round it, as
 * src/aperiodicColourings.json keeps it: how many colours, each window
 * cell's (in the level's cell order) and each cell round it's (in the order
 * `windowCells` lists them), and how many tray tiles it makes. */
export interface ChosenColouring {
  colours: number;
  tiles: number;
  cells: number[];
  around: number[];
}

/** A small seeded generator (mulberry32): the choice is the same every run. */
function random(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** For each window cell, every way it reads as its kind's first cell: for
 * each correspondence, which of its edges is the reference's edge i. Kinds
 * are cells alike up to a turn or a mirror — one-piece cells by their edge
 * vectors, exactly; a tile of several pieces by its slots (its frame). */
function correspondences(
  ring: Ring,
  cells: readonly WindowCell[],
): { kind: number; maps: number[][] }[] {
  const refs: WindowCell[] = [];
  // a polygon's edge vectors, each as seen from its first: e_i · conj(e_0)
  const shapeKey = (verts: Cyc[], at: number[]): string => {
    const m = verts.length;
    const e = (i: number): Cyc => ring.sub(verts[(i + 1) % m]!, verts[i % m]!);
    const base = ring.conj(e(at[0]!));
    return at.map((i) => ring.key(ring.mul(e(i), base))).join(";");
  };
  return cells.map((cell) => {
    if (cell.pieces.length > 1) {
      // by its frame: the slots name the reference's edges
      const slots = cell.pieces.flatMap((p) => p.slots);
      let kind = refs.findIndex(
        (r) => r.pieces.flatMap((p) => p.slots).join(",") === [...slots].sort(bySlot).join(","),
      );
      if (kind < 0) {
        kind = refs.length;
        refs.push({
          pieces: [{ verts: [], slots: [...slots].sort(bySlot), forward: [], across: [] }],
        });
      }
      const order = refs[kind]!.pieces[0]!.slots;
      const index = new Map(slots.map((s, i) => [s, i]));
      return { kind, maps: [order.map((s) => index.get(s)!)] };
    }
    const verts = cell.pieces[0]!.verts;
    const m = verts.length;
    for (let kind = 0; kind < refs.length; kind++) {
      const ref = refs[kind]!.pieces[0]!.verts;
      if (ref.length !== m) continue;
      const refKey = shapeKey(
        ref,
        ref.map((_, i) => i),
      );
      // the reference mirrored, counter-clockwise: its edge i is the
      // reference's edge m − 2 − i, run the other way
      const mirror = ccw(
        ring,
        ref.map((v) => ring.conj(v)),
      );
      const mirrorKey = shapeKey(
        mirror,
        mirror.map((_, i) => i),
      );
      const maps: number[][] = [];
      for (let s = 0; s < m; s++) {
        const at = verts.map((_, i) => (i + s) % m);
        const key = shapeKey(verts, at);
        if (key === refKey) maps.push(ref.map((_, i) => (i + s) % m));
        if (key === mirrorKey) {
          const map = new Array<number>(m);
          for (let i = 0; i < m; i++) map[(2 * m - 2 - i) % m] = (i + s) % m;
          maps.push(map);
        }
      }
      if (maps.length) return { kind, maps };
    }
    refs.push(cell);
    return {
      kind: refs.length - 1,
      maps: [verts.map((_, i) => i)],
    };
  });
}

/**
 * The proper colouring of the window and the cells round it with the
 * fewest distinct marked tiles in the window, every colour among them:
 * three colours where some such three-colouring is found, else four. A seeded search — Kempe-chain swaps,
 * which keep a colouring proper, from many starts — so the same every run;
 * what it finds is written to src/aperiodicColourings.json and the game
 * reads that.
 */
export function chooseColouring(
  ring: Ring,
  cells: readonly WindowCell[],
  around: readonly number[],
  window: readonly number[],
  edges: readonly [number, number][],
  { starts = 40, moves = 4000, seed = 1 } = {},
): ChosenColouring {
  // the nodes: the window's cells, then those round it
  const nodes = [...window, ...around];
  const index = new Map(nodes.map((c, i) => [c, i]));
  const n = nodes.length;
  const near: number[][] = nodes.map(() => []);
  for (const [a, b] of edges) {
    const [i, j] = [index.get(a), index.get(b)];
    if (i === undefined || j === undefined || i === j) continue;
    if (!near[i]!.includes(j)) near[i]!.push(j);
    if (!near[j]!.includes(i)) near[j]!.push(i);
  }
  const kinds = correspondences(ring, cells);
  const acrossOf = cells.map((cell) =>
    cell.pieces.flatMap((p) => p.across.map((c) => (c < 0 ? -1 : index.get(c)!))),
  );
  // a colouring that leaves a colour out of the window paints its tray in
  // fewer colours than it is named for, the missing one only a mark at the
  // rim (Klaassen's window alone takes two): one is never chosen
  const MISSING = 1000;
  const tiles = (col: number[], k: number): number => {
    const used = new Set(col.slice(0, cells.length)).size;
    const seen = new Set<string>();
    cells.forEach((_, w) => {
      const { kind, maps } = kinds[w]!;
      const across = acrossOf[w]!.map((j) => (j < 0 ? 9 : j === w ? col[w]! : col[j]!));
      let best = "";
      for (const map of maps) {
        const read = map.map((e) => across[e]!).join("");
        if (!best || read < best) best = read;
      }
      seen.add(`${kind}|${col[w]}|${best}`);
    });
    return seen.size + MISSING * (k - used);
  };
  // how unequal the colours are: a tie-break among as many tiles
  const spread = (col: number[], k: number): number => {
    const counts = new Array<number>(k).fill(0);
    for (let w = 0; w < cells.length; w++) counts[col[w]!]!++;
    return Math.max(...counts) - Math.min(...counts);
  };
  // a proper k-colouring by DSATUR, ties broken at random; null if the
  // search runs out
  const dsatur = (k: number, rand: () => number): number[] | null => {
    const col = new Array<number>(n).fill(-1);
    let steps = 0;
    const go = (left: number): boolean => {
      if (left === 0) return true;
      if (++steps > 20000) return false;
      let pick = -1;
      let best = -1;
      for (let v = 0; v < n; v++) {
        if (col[v]! >= 0) continue;
        const sat = new Set(near[v]!.map((u) => col[u]!).filter((c) => c >= 0)).size;
        const score = sat * 1000 + near[v]!.length + rand();
        if (score > best) [best, pick] = [score, v];
      }
      const used = new Set(near[pick]!.map((u) => col[u]!));
      const order = [...Array(k).keys()].sort(() => rand() - 0.5);
      for (const c of order) {
        if (used.has(c)) continue;
        col[pick] = c;
        if (go(left - 1)) return true;
      }
      col[pick] = -1;
      return false;
    };
    return go(n) ? col : null;
  };
  for (const k of [3, 4]) {
    let best: { col: number[]; tiles: number; spread: number } | null = null;
    for (let start = 0; start < starts; start++) {
      const rand = random(seed * 1000 + start);
      const col = dsatur(k, rand);
      if (!col) continue;
      let cost = tiles(col, k);
      let even = spread(col, k);
      for (let move = 0; move < moves; move++) {
        // a Kempe chain: v's colour and another, swapped on v's component
        const v = Math.floor(rand() * n);
        const other = (col[v]! + 1 + Math.floor(rand() * (k - 1))) % k;
        const [x, y] = [col[v]!, other];
        const chain = [v];
        const inChain = new Set(chain);
        for (let i = 0; i < chain.length; i++)
          for (const u of near[chain[i]!]!)
            if (!inChain.has(u) && (col[u] === x || col[u] === y)) {
              inChain.add(u);
              chain.push(u);
            }
        for (const u of chain) col[u] = col[u] === x ? y : x;
        const now = tiles(col, k);
        const nowEven = spread(col, k);
        // keep a move no worse (a sideways one too, to wander), and now and
        // then a worse one
        if (now < cost || (now === cost && nowEven <= even) || rand() < 0.02) {
          [cost, even] = [now, nowEven];
          if (!best || cost < best.tiles || (cost === best.tiles && even < best.spread))
            best = { col: [...col], tiles: cost, spread: even };
        } else for (const u of chain) col[u] = col[u] === x ? y : x;
      }
      if (!best || cost < best.tiles || (cost === best.tiles && even < best.spread))
        best = { col: [...col], tiles: cost, spread: even };
    }
    if (best && best.tiles < MISSING) {
      // colours named as they first come
      const names = new Map<number, number>();
      const named = best.col.map((c) => {
        if (!names.has(c)) names.set(c, names.size);
        return names.get(c)!;
      });
      return {
        colours: k,
        tiles: best.tiles,
        cells: named.slice(0, window.length),
        around: named.slice(window.length),
      };
    }
  }
  throw new Error("chooseColouring: no proper colouring in four colours found");
}

/** Each pair of distinct patch cells sharing an edge, for `chooseColouring`. */
export function adjacency(refined: RefinedPatch): [number, number][] {
  const out: [number, number][] = [];
  const seen = new Set<string>();
  for (const { a, b } of meetings(refined)) {
    if (a.cell === b.cell) continue;
    const key = a.cell < b.cell ? `${a.cell}|${b.cell}` : `${b.cell}|${a.cell}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push([a.cell, b.cell]);
  }
  return out;
}
