// The hat's family: Tile(1,√3), the hat, the first aperiodic monotile (Smith,
// Myers, Kaplan and Goodman-Strauss, 2023); Tile(√3,1), the turtle, the same
// outline with its two edge lengths swapped; and the four metatiles H, T, P
// and F the hat's tilings are built from. Hypersweeper plays all three as
// boards, and Rep-tiles cuts levels from the same patch (`hatMetatiles`).
// Line-for-line port of minesweeper/boards/hat.py; see that file for the
// fuller commentary.
//
// The substitution is Craig S. Kaplan's (github.com/isohedral/hatviz, hat.js
// and geometry.js, © 2023 Craig S. Kaplan, BSD 3-Clause licence), ported as
// it is: the four metatiles, each a polygon carrying one to four hats, are
// glued edge to edge into a patch (`constructPatch`), and that patch cut into
// four bigger metatiles (`constructMetatiles`) to glue again. Its arithmetic
// is floating point — the bigger metatiles' outlines come from intersecting
// lines — but every hat it lays sits on the kite grid: drawn at twice
// hatviz's size, each corner of every hat and every metatile is a point
// x + y·ω of the Eisenstein lattice ℤ[ω], ω = e^{iπ/3} = ζ² in ℤ[ζ12], whose
// points lie a whole unit apart. So each corner is read back onto the lattice
// (`snap`), and the read throws if a corner is not within 1e-6 of a point:
// discrete identity, not two nearby points rounded to one key. The vertex ids
// are then the ℤ[ζ12] tuples [x, 0, y, 0] the Spectre board uses, and its
// window code cuts these patches unchanged.
//
// The hat's short edges (length 1) point at multiples of 60°, its long ones
// (√3) at 30° past them, and every hat in a tiling is turned by a multiple of
// 60° and perhaps mirrored, which keeps that split. So the turtle tiling is the
// hat tiling with each edge's length changed (`deformHats`) — exact, and the
// walk checks that each tile closes and that a corner two tiles share lands in
// one place. The hat keeps its 14th corner, the middle of its long side, as
// the Spectre keeps its flat one: a neighbour plants a corner there. The
// metatiles meet corner to side, so each one's sides are cut at every corner
// of the patch lying inside them (`metatileCells`) before the window is taken.

// The port of hatviz below — its float geometry, and `initialMetatiles` to
// `constructMetatiles` — keeps its licence:
//
// BSD 3-Clause License
//
// Copyright (c) 2023, Craig S. Kaplan
//
// Redistribution and use in source and binary forms, with or without
// modification, are permitted provided that the following conditions are met:
//
// 1. Redistributions of source code must retain the above copyright notice, this
//    list of conditions and the following disclaimer.
//
// 2. Redistributions in binary form must reproduce the above copyright notice,
//    this list of conditions and the following disclaimer in the documentation
//    and/or other materials provided with the distribution.
//
// 3. Neither the name of the copyright holder nor the names of its
//    contributors may be used to endorse or promote products derived from
//    this software without specific prior written permission.
//
// THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS"
// AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE
// IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE
// DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT HOLDER OR CONTRIBUTORS BE LIABLE
// FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL
// DAMAGES (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR
// SERVICES; LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER
// CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY,
// OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE
// OF THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.

import {
  cmpSortedZ12,
  type ExactTiles,
  exactBoard,
  windowTiles,
  z12Add,
  z12Cmp,
  type Z12Point,
  Z12_POWERS,
  z12Rot,
  z12ToXy,
} from "./aperiodic";
import { type Board, type CellId, cid, type Vertex } from "./core";

// -- hatviz's float geometry ----------------------------------------------------

type Pt = { x: number; y: number };
type Aff = readonly [number, number, number, number, number, number];

const HR3 = Math.sqrt(3) / 2;
const IDENT: Aff = [1, 0, 0, 0, 1, 0];
const pt = (x: number, y: number): Pt => ({ x, y });
const hexPt = (x: number, y: number): Pt => pt(x + 0.5 * y, HR3 * y);

function inv(t: Aff): Aff {
  const det = t[0] * t[4] - t[1] * t[3];
  return [
    t[4] / det,
    -t[1] / det,
    (t[1] * t[5] - t[2] * t[4]) / det,
    -t[3] / det,
    t[0] / det,
    (t[2] * t[3] - t[0] * t[5]) / det,
  ];
}

function mul(a: Aff, b: Aff): Aff {
  return [
    a[0] * b[0] + a[1] * b[3],
    a[0] * b[1] + a[1] * b[4],
    a[0] * b[2] + a[1] * b[5] + a[2],
    a[3] * b[0] + a[4] * b[3],
    a[3] * b[1] + a[4] * b[4],
    a[3] * b[2] + a[4] * b[5] + a[5],
  ];
}

const padd = (p: Pt, q: Pt): Pt => pt(p.x + q.x, p.y + q.y);
const psub = (p: Pt, q: Pt): Pt => pt(p.x - q.x, p.y - q.y);
const trot = (ang: number): Aff => [
  Math.cos(ang),
  -Math.sin(ang),
  0,
  Math.sin(ang),
  Math.cos(ang),
  0,
];
const ttrans = (tx: number, ty: number): Aff => [1, 0, tx, 0, 1, ty];
const rotAbout = (p: Pt, ang: number): Aff =>
  mul(ttrans(p.x, p.y), mul(trot(ang), ttrans(-p.x, -p.y)));
const transPt = (m: Aff, p: Pt): Pt =>
  pt(m[0] * p.x + m[1] * p.y + m[2], m[3] * p.x + m[4] * p.y + m[5]);
/** The similarity taking the unit interval onto p→q. */
const matchSeg = (p: Pt, q: Pt): Aff => [q.x - p.x, p.y - q.y, p.x, q.y - p.y, q.x - p.x, p.y];
/** The similarity taking p1→q1 onto p2→q2. */
const matchTwo = (p1: Pt, q1: Pt, p2: Pt, q2: Pt): Aff =>
  mul(matchSeg(p2, q2), inv(matchSeg(p1, q1)));

function intersect(p1: Pt, q1: Pt, p2: Pt, q2: Pt): Pt {
  const d = (q2.y - p2.y) * (q1.x - p1.x) - (q2.x - p2.x) * (q1.y - p1.y);
  const ua = ((q2.x - p2.x) * (p1.y - p2.y) - (q2.y - p2.y) * (p1.x - p2.x)) / d;
  return pt(p1.x + ua * (q1.x - p1.x), p1.y + ua * (q1.y - p1.y));
}

/** The hat, in hatviz's frame: its thirteen corners as hex coordinates. The
 * long side from (0,−2) to (2,−2) is two short edges in a line. */
const HAT_HEX: readonly (readonly [number, number])[] = [
  [0, 0], [-1, -1], [0, -2], [2, -2], [2, -1], [4, -2], [5, -1],
  [4, 0], [3, 0], [2, 2], [0, 3], [0, 2], [-1, 2],
]; // prettier-ignore
const HAT_OUTLINE: Pt[] = HAT_HEX.map(([x, y]) => hexPt(x, y));

/** Which of the four metatiles. */
export type MetaKind = "H" | "T" | "P" | "F";

/** A hat's place in hatviz's patch: in which first-generation metatile, and
 * whether it is the H's mirrored one (hatviz's `H1`). */
interface HatChild {
  hat: true;
  mirrored: boolean;
}

interface Child {
  t: Aff;
  geom: MetaTile | HatChild;
}

class MetaTile {
  children: Child[] = [];
  constructor(
    public shape: Pt[],
    /** Set on the four first-generation metatiles. */
    public kind?: MetaKind,
  ) {}

  add(t: Aff, geom: MetaTile | HatChild): void {
    this.children.push({ t, geom });
  }

  evalChild(n: number, i: number): Pt {
    const ch = this.children[n]!;
    return transPt(ch.t, (ch.geom as MetaTile).shape[i]!);
  }

  recentre(): void {
    let cx = 0;
    let cy = 0;
    for (const p of this.shape) {
      cx += p.x;
      cy += p.y;
    }
    cx /= this.shape.length;
    cy /= this.shape.length;
    this.shape = this.shape.map((p) => pt(p.x - cx, p.y - cy));
    const m = ttrans(-cx, -cy);
    for (const ch of this.children) ch.t = mul(m, ch.t);
  }
}

const HAT: HatChild = { hat: true, mirrored: false };
const HAT_MIRRORED: HatChild = { hat: true, mirrored: true };

function initialMetatiles(): [MetaTile, MetaTile, MetaTile, MetaTile] {
  const hOutline = [
    pt(0, 0), pt(4, 0), pt(4.5, HR3), pt(2.5, 5 * HR3), pt(1.5, 5 * HR3), pt(-0.5, HR3),
  ]; // prettier-ignore
  const h = new MetaTile(hOutline, "H");
  const hat = HAT_OUTLINE;
  h.add(matchTwo(hat[5]!, hat[7]!, hOutline[5]!, hOutline[0]!), HAT);
  h.add(matchTwo(hat[9]!, hat[11]!, hOutline[1]!, hOutline[2]!), HAT);
  h.add(matchTwo(hat[5]!, hat[7]!, hOutline[3]!, hOutline[4]!), HAT);
  h.add(
    mul(ttrans(2.5, HR3), mul([-0.5, -HR3, 0, HR3, -0.5, 0], [0.5, 0, 0, 0, -0.5, 0])),
    HAT_MIRRORED,
  );

  const t = new MetaTile([pt(0, 0), pt(3, 0), pt(1.5, 3 * HR3)], "T");
  t.add([0.5, 0, 0.5, 0, 0.5, HR3], HAT);

  const second = mul(ttrans(0, 2 * HR3), mul([0.5, HR3, 0, -HR3, 0.5, 0], [0.5, 0, 0, 0, 0.5, 0]));
  const p = new MetaTile([pt(0, 0), pt(4, 0), pt(3, 2 * HR3), pt(-1, 2 * HR3)], "P");
  p.add([0.5, 0, 1.5, 0, 0.5, HR3], HAT);
  p.add(second, HAT);

  const f = new MetaTile([pt(0, 0), pt(3, 0), pt(3.5, HR3), pt(3, 2 * HR3), pt(-1, 2 * HR3)], "F");
  f.add([0.5, 0, 1.5, 0, 0.5, HR3], HAT);
  f.add(second, HAT);
  return [h, t, p, f];
}

/** hatviz's gluing rules: each new metatile is laid against an edge of one
 * already placed (or, for six-entry rules, between two). */
const RULES: readonly (readonly (number | MetaKind)[])[] = [
  ["H"],
  [0, 0, "P", 2], [1, 0, "H", 2], [2, 0, "P", 2], [3, 0, "H", 2],
  [4, 4, "P", 2], [0, 4, "F", 3], [2, 4, "F", 3], [4, 1, 3, 2, "F", 0],
  [8, 3, "H", 0], [9, 2, "P", 0], [10, 2, "H", 0], [11, 4, "P", 2],
  [12, 0, "H", 2], [13, 0, "F", 3], [14, 2, "F", 1], [15, 3, "H", 4],
  [8, 2, "F", 1], [17, 3, "H", 0], [18, 2, "P", 0], [19, 2, "H", 2],
  [20, 4, "F", 3], [20, 0, "P", 2], [22, 0, "H", 2], [23, 4, "F", 3],
  [23, 0, "F", 3], [16, 0, "P", 2], [9, 4, 0, 2, "T", 2], [4, 0, "F", 3],
]; // prettier-ignore

function constructPatch(tiles: Record<MetaKind, MetaTile>): MetaTile {
  const ret = new MetaTile([]);
  for (const r of RULES) {
    if (r.length === 1) {
      ret.add(IDENT, tiles[r[0] as MetaKind]);
      continue;
    }
    let p: Pt;
    let q: Pt;
    let kind: MetaKind;
    let edge: number;
    if (r.length === 4) {
      const ch = ret.children[r[0] as number]!;
      const poly = (ch.geom as MetaTile).shape;
      const i = r[1] as number;
      p = transPt(ch.t, poly[(i + 1) % poly.length]!);
      q = transPt(ch.t, poly[i]!);
      kind = r[2] as MetaKind;
      edge = r[3] as number;
    } else {
      const chP = ret.children[r[0] as number]!;
      const chQ = ret.children[r[2] as number]!;
      p = transPt(chQ.t, (chQ.geom as MetaTile).shape[r[3] as number]!);
      q = transPt(chP.t, (chP.geom as MetaTile).shape[r[1] as number]!);
      kind = r[4] as MetaKind;
      edge = r[5] as number;
    }
    const npoly = tiles[kind].shape;
    ret.add(matchTwo(npoly[edge]!, npoly[(edge + 1) % npoly.length]!, p, q), tiles[kind]);
  }
  return ret;
}

function constructMetatiles(patch: MetaTile): Record<MetaKind, MetaTile> {
  const bps1 = patch.evalChild(8, 2);
  const bps2 = patch.evalChild(21, 2);
  const rbps = transPt(rotAbout(bps1, (-2 * Math.PI) / 3), bps2);
  const p72 = patch.evalChild(7, 2);
  const p252 = patch.evalChild(25, 2);
  const llc = intersect(bps1, rbps, patch.evalChild(6, 2), p72);
  let w = psub(patch.evalChild(6, 2), llc);

  const hOutline = [llc, bps1];
  w = transPt(trot(-Math.PI / 3), w);
  hOutline.push(padd(hOutline[1]!, w));
  hOutline.push(patch.evalChild(14, 2));
  w = transPt(trot(-Math.PI / 3), w);
  hOutline.push(psub(hOutline[3]!, w));
  hOutline.push(patch.evalChild(6, 2));

  const take = (shape: Pt[], from: number[]): MetaTile => {
    const meta = new MetaTile(shape);
    for (const i of from) meta.add(patch.children[i]!.t, patch.children[i]!.geom);
    return meta;
  };
  const h = take(hOutline, [0, 9, 16, 27, 26, 6, 1, 8, 10, 15]);
  const p = take([p72, padd(p72, psub(bps1, llc)), bps1, llc], [7, 2, 3, 4, 28]);
  const f = take(
    [bps2, patch.evalChild(24, 2), patch.evalChild(25, 0), p252, padd(p252, psub(llc, bps1))],
    [21, 20, 22, 23, 24, 25],
  );
  const aaa = hOutline[2]!;
  const bbb = padd(hOutline[1]!, psub(hOutline[4]!, hOutline[5]!));
  const ccc = transPt(rotAbout(bbb, -Math.PI / 3), aaa);
  const t = take([bbb, ccc, aaa], [11]);
  for (const m of [h, p, f, t]) m.recentre();
  return { H: h, T: t, P: p, F: f };
}

/** The H metatile after `depth` substitutions — the first generation's four,
 * glued and cut `depth` times. */
function superH(depth: number): MetaTile {
  const [h, t, p, f] = initialMetatiles();
  let tiles: Record<MetaKind, MetaTile> = { H: h, T: t, P: p, F: f };
  for (let i = 0; i < depth; i++) tiles = constructMetatiles(constructPatch(tiles));
  return tiles.H;
}

/** Every first-generation metatile in `meta`, placed. */
function firstGeneration(
  meta: MetaTile,
  at: Aff,
  out: { kind: MetaKind; meta: MetaTile; t: Aff }[],
): void {
  if (meta.kind) {
    out.push({ kind: meta.kind, meta, t: at });
    return;
  }
  for (const ch of meta.children) firstGeneration(ch.geom as MetaTile, mul(at, ch.t), out);
}

// -- exact ----------------------------------------------------------------------

/** An Eisenstein integer x + y·ω, as hex coordinates. */
export type Hex = readonly [number, number];

/** One metatile of a hat patch: its kind, its corners, and its hats' corners
 * — each hat fourteen, in `HAT14` order, the midpoint of its long side kept,
 * counter-clockwise or clockwise as the hat is mirrored or not. */
export interface HatMeta {
  kind: MetaKind;
  corners: Hex[];
  hats: { corners: Hex[]; mirrored: boolean }[];
}

/** The hat with its long side's midpoint: fourteen corners. */
const HAT14: Hex[] = [...HAT_HEX.slice(0, 3), [1, -2], ...HAT_HEX.slice(3)] as Hex[];

const METAS = new Map<number, HatMeta[]>();

/** The first-generation metatiles of the H metatile `depth` substitutions on,
 * read onto the lattice at twice hatviz's size, the first hat's first corner
 * at the origin. Remembered per depth: a depth-4 patch is 3025 metatiles and
 * 7921 hats, and every deal cuts its board from the same one. */
export function hatMetatiles(depth: number): HatMeta[] {
  const hit = METAS.get(depth);
  if (hit) return hit;
  const placed: { kind: MetaKind; meta: MetaTile; t: Aff }[] = [];
  firstGeneration(superH(depth), IDENT, placed);
  const first = placed[0]!;
  const firstHat = first.meta.children[0]!;
  const origin = transPt(mul(first.t, firstHat.t), HAT_OUTLINE[0]!);
  const snap = (p: Pt): Hex => {
    const X = 2 * (p.x - origin.x);
    const Y = 2 * (p.y - origin.y);
    const y = Y / HR3; // Y = y·√3/2
    const x = X - 0.5 * y;
    const rx = Math.round(x);
    const ry = Math.round(y);
    if (Math.abs(x - rx) > 1e-6 || Math.abs(y - ry) > 1e-6) {
      throw new Error(`hat corner (${X}, ${Y}) is off the kite grid`);
    }
    return [rx + 0, ry + 0];
  };
  const metas = placed.map(({ kind, meta, t }) => ({
    kind,
    corners: meta.shape.map((p) => snap(transPt(t, p))),
    hats: meta.children.map((ch) => {
      const m = mul(t, ch.t);
      return {
        corners: HAT14.map(([x, y]) => snap(transPt(m, hexPt(x, y)))),
        mirrored: (ch.geom as HatChild).mirrored,
      };
    }),
  }));
  METAS.set(depth, metas);
  return metas;
}

const hexKey = ([x, y]: Hex): string => `${x},${y}`;
/** x + y·ω in ℤ[ζ12], ω = ζ². */
const hexZ12 = ([x, y]: Hex): Z12Point => [x, 0, y, 0];
/** |x + y·ω|². */
const hexNorm = ([x, y]: Hex): number => x * x + x * y + y * y;

/** Twice a polygon's signed area, over √3/2 (the frame 1, ω is right-handed,
 * so the sign is the Euclidean one): positive counter-clockwise. */
function hexArea2(corners: readonly Hex[]): number {
  let sum = 0;
  corners.forEach((a, i) => {
    const b = corners[(i + 1) % corners.length]!;
    sum += a[0] * b[1] - a[1] * b[0];
  });
  return sum;
}

/** A clockwise outline walked the other way, from the same first corner. */
const ccw = <T>(ids: readonly T[]): T[] => [ids[0]!, ...ids.slice(1).reverse()];

/** The product of two points of ℤ[ζ12]. */
function z12Mul(p: Z12Point, q: Z12Point): Z12Point {
  let out: Z12Point = [0, 0, 0, 0];
  q.forEach((c, k) => {
    if (!c) return;
    const r = z12Rot(p, k);
    out = z12Add(out, [c * r[0], c * r[1], c * r[2], c * r[3]]);
  });
  return out;
}

/** √3 = ζ + ζ⁻¹ = 2ζ − ζ³. */
const SQRT3: Z12Point = z12Add(Z12_POWERS[1]!, Z12_POWERS[11]!);
const ONE: Z12Point = Z12_POWERS[0]!;

/** The hats as Tile(a,b): each corner laid again with every short edge (a
 * unit, at a multiple of 60°) `a` long and every long one (√3, at 30° past)
 * `b` long, `a` and `b` reals of ℤ[ζ12]. Walked breadth first from the first
 * hat's first corner, laid at the origin; a tile whose corner the walk has
 * laid already must land on it, and must close, or the hats were no tiling.
 * The walk's order does not change where any corner lands. */
export function deformHats(
  hats: readonly (readonly Hex[])[],
  a: Z12Point,
  b: Z12Point,
): Z12Point[][] {
  const edge = (d: Hex): Z12Point => {
    const norm = hexNorm(d);
    if (norm === 1) return z12Mul(a, hexZ12(d));
    if (norm === 3) {
      // d = √3·u, u a unit at an odd multiple of 30°: u = d·√3/3
      const u3 = z12Mul(SQRT3, hexZ12(d));
      if (u3.some((c) => c % 3)) throw new Error(`long edge ${d} is not √3 long`);
      return z12Mul(b, [u3[0] / 3, u3[1] / 3, u3[2] / 3, u3[3] / 3]);
    }
    throw new Error(`edge ${d} is no edge of the hat`);
  };
  const on = new Map<string, number[]>();
  hats.forEach((hat, i) => {
    for (const v of hat) {
      const k = hexKey(v);
      const list = on.get(k);
      if (list) list.push(i);
      else on.set(k, [i]);
    }
  });
  const at = new Map<string, Z12Point>([[hexKey(hats[0]![0]!), [0, 0, 0, 0]]]);
  const out: (Z12Point[] | undefined)[] = hats.map(() => undefined);
  const queue = [0];
  const queued = new Set([0]);
  for (let head = 0; head < queue.length; head++) {
    const i = queue[head]!;
    const hat = hats[i]!;
    const start = hat.findIndex((v) => at.has(hexKey(v)));
    const laid: Z12Point[] = new Array<Z12Point>(hat.length);
    let p = at.get(hexKey(hat[start]!))!;
    for (let k = 0; k < hat.length; k++) {
      const j = (start + k) % hat.length;
      const v = hat[j]!;
      const known = at.get(hexKey(v));
      if (known && z12Cmp(known, p) !== 0)
        throw new Error("the hats do not deform: a corner moved");
      at.set(hexKey(v), p);
      laid[j] = p;
      const next = hat[(j + 1) % hat.length]!;
      p = z12Add(p, edge([next[0] - v[0], next[1] - v[1]]));
    }
    if (z12Cmp(p, laid[start]!) !== 0) throw new Error("a deformed hat does not close");
    out[i] = laid;
    for (const v of hat) {
      for (const other of on.get(hexKey(v))!) {
        if (!queued.has(other)) {
          queued.add(other);
          queue.push(other);
        }
      }
    }
  }
  if (out.some((cell) => !cell)) throw new Error("the hats are not joined corner to corner");
  return out as Z12Point[][];
}

const gcd = (a: number, b: number): number => {
  a = Math.abs(a);
  b = Math.abs(b);
  while (b) [a, b] = [b, a % b];
  return a;
};

/** A polygon's outline with every one of `points` that lies strictly inside a
 * side inserted on it, in order. Exact: the lattice points on a side are its
 * ends' difference over the gcd of its coordinates, stepped. */
function splitEdges(corners: readonly Hex[], points: ReadonlySet<string>): Hex[] {
  const out: Hex[] = [];
  corners.forEach((a, i) => {
    const b = corners[(i + 1) % corners.length]!;
    out.push(a);
    const dx = b[0] - a[0];
    const dy = b[1] - a[1];
    const g = gcd(dx, dy);
    for (let k = 1; k < g; k++) {
      const p: Hex = [a[0] + (k * dx) / g, a[1] + (k * dy) / g];
      if (points.has(hexKey(p))) out.push(p);
    }
  });
  return out;
}

/** Each metatile's outline, its sides cut at every corner of the patch lying
 * inside them: the metatiles meet corner to side, and the window code and the
 * shared-vertex adjacency both need the patch edge to edge. */
function metatileCells(metas: readonly HatMeta[]): Hex[][] {
  const points = new Set(metas.flatMap((m) => m.corners.map(hexKey)));
  return metas.map((m) => splitEdges(m.corners, points));
}

// -- the glyph anchors ------------------------------------------------------------
//
// The hat and the turtle are not convex, and a number centred on a tile's
// vertex mean sits close to an edge — on the hat right above its notch. So each
// tile's number goes at the centre of its biggest inscribed circle, written as
// an affine combination of three of its corners, which holds for every copy,
// turned, moved or mirrored. See `_GLYPH_WEIGHTS` in hat.py for the two
// circles.

/** [a, b, c, s, t]: the number goes at P[a] + s·(P[b] − P[a]) + t·(P[c] − P[a]),
 * P a tile's corners in `HAT14` order. */
const GLYPH_WEIGHTS: Record<"hat" | "turtle", readonly [number, number, number, number, number]> = {
  hat: [12, 5, 9, 0.3173884626316028, 0.2324146839234146],
  turtle: [12, 4, 9, 2 * Math.sqrt(3) - 3, 0],
};

/** Where a hat's or a turtle's number goes. A mirrored tile's outline was
 * reversed to run counter-clockwise, which puts its corner j at index −j. */
function glyphAnchor(tile: "hat" | "turtle", label: string, polygon: readonly Vertex[]): Vertex {
  const n = polygon.length;
  let [a, b, c] = GLYPH_WEIGHTS[tile];
  const [, , , s, t] = GLYPH_WEIGHTS[tile];
  if (label === "flip") [a, b, c] = [(n - a) % n, (n - b) % n, (n - c) % n];
  const pa = polygon[a]!;
  const pb = polygon[b]!;
  const pc = polygon[c]!;
  return [
    pa[0] + s * (pb[0] - pa[0]) + t * (pc[0] - pa[0]),
    pa[1] + s * (pb[1] - pa[1]) + t * (pc[1] - pa[1]),
  ];
}

// -- the boards -------------------------------------------------------------------

/** Which tile a board of the hat's family is made of. */
export type HatTile = "hat" | "turtle" | "metatiles";

const HAT_MODES: Record<HatTile, string> = {
  hat: "hat",
  turtle: "turtle",
  metatiles: "hatmetatiles",
};

interface HatRow {
  label: string;
  verts: Z12Point[];
  sortedIds: Z12Point[];
}

const PATCHES = new Map<string, HatRow[]>();

/** The whole patch of `tile`s the H metatile `depth` substitutions on grows:
 * each labelled ("hat", or "flip" mirrored; or its metatile's kind), its
 * corners counter-clockwise. */
function hatFamilyPatch(tile: HatTile, depth: number): HatRow[] {
  const key = `${tile}/${depth}`;
  const hit = PATCHES.get(key);
  if (hit) return hit;
  const metas = hatMetatiles(depth);
  let labels: string[];
  let cells: Z12Point[][];
  if (tile === "metatiles") {
    labels = metas.map((m) => m.kind);
    cells = metatileCells(metas).map((corners) =>
      (hexArea2(corners) < 0 ? ccw(corners) : corners).map(hexZ12),
    );
  } else {
    const hats = metas.flatMap((m) => m.hats);
    labels = hats.map((h) => (h.mirrored ? "flip" : "hat"));
    cells =
      tile === "hat"
        ? hats.map((h) => h.corners.map(hexZ12))
        : deformHats(
            hats.map((h) => h.corners),
            SQRT3,
            ONE,
          );
    // a mirrored hat runs clockwise, and so does its turtle
    cells = cells.map((cell, i) => (hexArea2(hats[i]!.corners) > 0 ? cell : ccw(cell)));
  }
  const rows = cells.map((verts, i) => ({
    label: labels[i]!,
    verts,
    sortedIds: [...verts].sort(z12Cmp),
  }));
  PATCHES.set(key, rows);
  return rows;
}

function hatFamilyKept(
  tile: HatTile,
  depth: number,
  keep: number | null,
  variant: number,
): HatRow[] {
  return windowTiles(
    hatFamilyPatch(tile, depth),
    (p) => z12ToXy(p as Z12Point),
    (a, b) => cmpSortedZ12(a.sortedIds, b.sortedIds),
    keep,
    variant,
  );
}

function hatFamilyBoard(
  tile: HatTile,
  depth: number,
  keep: number | null,
  scale: number,
  variant: number,
): Board {
  const rows = hatFamilyKept(tile, depth, keep, variant).map((row, i) => ({
    id: cid(row.label, i),
    ids: row.verts,
  }));
  const board = exactBoard(HAT_MODES[tile], rows, (p) => z12ToXy(p as Z12Point), scale);
  if (tile === "metatiles") return board;
  const anchors = new Map<CellId, Vertex>();
  for (const [cell, polygon] of board.polygons) {
    // a cell id is "label,index", as `cid` made it above
    anchors.set(cell, glyphAnchor(tile, cell.split(",")[0]!, polygon));
  }
  return { ...board, glyphAnchor: anchors };
}

function hatFamilyExact(
  tile: HatTile,
  depth: number,
  keep: number | null,
  variant: number,
): ExactTiles {
  return {
    order: 12,
    cells: hatFamilyKept(tile, depth, keep, variant).map((row) => [...row.verts]),
  };
}

/**
 * The hat, Tile(1,√3), the first aperiodic monotile: the hats of the H
 * metatile `depth` substitutions on (169, 1156, 7921 at depths 2 to 4), about
 * one in seven mirrored and labelled "flip". `keep`, `scale` and `variant` are
 * the Spectre's: `keep` tiles nearest a centre by Chebyshev distance, `variant`
 * 0 the centred window and any other integer one elsewhere in the same patch.
 * See `windowRows`.
 */
export function hatBoard(
  depth: number,
  keep: number | null = null,
  scale = 21,
  variant = 0,
): Board {
  return hatFamilyBoard("hat", depth, keep, scale, variant);
}

/** The turtle, Tile(√3,1): the hat's outline with its two edge lengths
 * swapped, laid as the hats of `hatBoard` are (`deformHats`), tile for tile. */
export function turtleBoard(
  depth: number,
  keep: number | null = null,
  scale = 21,
  variant = 0,
): Board {
  return hatFamilyBoard("turtle", depth, keep, scale, variant);
}

/** The hat's metatiles — H, T, P and F, labelled by kind — that the hats of
 * `hatBoard` are grouped into: 64, 442, 3025 at depths 2 to 4. They meet
 * corner to side, so each carries the corners of its neighbours that land on
 * its sides. */
export function hatMetatilesBoard(
  depth: number,
  keep: number | null = null,
  scale = 21,
  variant = 0,
): Board {
  return hatFamilyBoard("metatiles", depth, keep, scale, variant);
}

/** The hats `hatBoard(depth, keep, _, variant)` draws, exact in ℤ[ζ12] — each
 * its 14 corners, the long side's midpoint included. */
export function hatExact(depth: number, keep: number | null = null, variant = 0): ExactTiles {
  return hatFamilyExact("hat", depth, keep, variant);
}

/** The turtles `turtleBoard(depth, keep, _, variant)` draws, exact in ℤ[ζ12]. */
export function turtleExact(depth: number, keep: number | null = null, variant = 0): ExactTiles {
  return hatFamilyExact("turtle", depth, keep, variant);
}

/** The metatiles `hatMetatilesBoard(depth, keep, _, variant)` draws, exact in
 * ℤ[ζ12], each with its neighbours' corners on its sides. */
export function hatMetatilesExact(
  depth: number,
  keep: number | null = null,
  variant = 0,
): ExactTiles {
  return hatFamilyExact("metatiles", depth, keep, variant);
}
