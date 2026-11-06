// The hat family: Tile(1,√3), the hat, the first aperiodic monotile (Smith,
// Myers, Kaplan and Goodman-Strauss, 2023); Tile(√3,1), the turtle, the same
// outline with its two edge lengths swapped; and the four metatiles H, T, P
// and F the hat's tilings are built from. Hypersweeper has no board for any of
// them, so their patches are made here.
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
// discrete identity, not two nearby points rounded to one key.
//
// The hat's short edges (length 1) point at multiples of 60°, its long ones
// (√3) at 30° past them, and every hat in a tiling is turned by a multiple of
// 60° and perhaps mirrored, which keeps that split. Every member of the family
// Tile(a,b) has the same edge directions with lengths a and b, and a hat
// tiling is a Tile(a,b) tiling with each edge's length changed: `deform` walks
// the hats' edges from one corner and lays each corner again with every short
// edge a in length and every long one b — exact, and the walk checks that each
// tile closes and that a corner two tiles share lands in one place.

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

import { cyclotomic, type Cyc, type Ring } from "./cyclotomic";

const Z12 = cyclotomic(12);

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
type Hex = readonly [number, number];

const hexKey = ([x, y]: Hex): string => `${x},${y}`;
/** x + y·ω in ℤ[ζ12], ω = ζ². */
const hexCyc = ([x, y]: Hex): Cyc => [x, 0, y, 0];
const hexSub = (a: Hex, b: Hex): Hex => [a[0] - b[0], a[1] - b[1]];
/** |x + y·ω|². */
const hexNorm = ([x, y]: Hex): number => x * x + x * y + y * y;

/** One metatile of a hat patch: its kind, its corners, and its hats' corners
 * — each hat fourteen, the midpoint of its long side kept, counter-clockwise
 * or clockwise as the hat is mirrored. */
export interface HatMeta {
  kind: MetaKind;
  corners: Hex[];
  hats: { corners: Hex[]; mirrored: boolean }[];
}

/** The hat with its long side's midpoint: fourteen corners. */
const HAT14: Hex[] = [...HAT_HEX.slice(0, 3), [1, -2], ...HAT_HEX.slice(3)] as Hex[];

/** The first-generation metatiles of the H metatile `depth` substitutions on,
 * read onto the lattice at twice hatviz's size, the first hat's first corner
 * at the origin. */
export function hatMetatiles(depth: number): HatMeta[] {
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
  return placed.map(({ kind, meta, t }) => ({
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
}

/** √3 = ζ + ζ⁻¹. */
const SQRT3: Cyc = Z12.add(Z12.zeta(1), Z12.zeta(-1));

/** The hats as Tile(a,b): each corner laid again with every short edge (a
 * unit, at a multiple of 60°) `a` long and every long one (√3, at 30° past)
 * `b` long, `a` and `b` reals of ℤ[ζ12]. Walked from the first hat's first
 * corner; a tile whose corner the walk has laid already must land on it, or
 * the hats were no tiling. */
export function deform(hats: Hex[][], a: Cyc, b: Cyc): Cyc[][] {
  const at = new Map<string, Cyc>();
  at.set(hexKey(hats[0]![0]!), Z12.zero);
  const edge = (d: Hex): Cyc => {
    const norm = hexNorm(d);
    if (norm === 1) return Z12.mul(a, hexCyc(d));
    if (norm === 3) {
      // d = √3·u, u a unit at an odd multiple of 30°: u = d·√3/3
      const u3 = Z12.mul(SQRT3, hexCyc(d));
      if (u3.some((c) => c % 3)) throw new Error(`long edge ${d} is not √3 long`);
      return Z12.mul(
        b,
        u3.map((c) => c / 3),
      );
    }
    throw new Error(`edge ${d} is no edge of the hat`);
  };
  const out: (Cyc[] | undefined)[] = hats.map(() => undefined);
  let left = hats.length;
  while (left) {
    let progress = false;
    hats.forEach((hat, i) => {
      if (out[i]) return;
      const start = hat.findIndex((v) => at.has(hexKey(v)));
      if (start < 0) return;
      const laid: Cyc[] = new Array<Cyc>(hat.length);
      let p = at.get(hexKey(hat[start]!))!;
      for (let k = 0; k < hat.length; k++) {
        const j = (start + k) % hat.length;
        const v = hat[j]!;
        const known = at.get(hexKey(v));
        if (known && !Z12.eq(known, p)) throw new Error("the hats do not deform: a corner moved");
        at.set(hexKey(v), p);
        laid[j] = p;
        p = Z12.add(p, edge(hexSub(hat[(j + 1) % hat.length]!, v)));
      }
      if (!Z12.eq(p, laid[start]!)) throw new Error("a deformed hat does not close");
      out[i] = laid;
      left--;
      progress = true;
    });
    if (!progress) throw new Error("the hats are not joined corner to corner");
  }
  return out as Cyc[][];
}

/** The `keep` cells nearest the patch's middle — the mean of their corners'
 * means — by Chebyshev distance, a square block, as Hypersweeper trims its
 * aperiodic boards (`windowRows` in @tiling/geometry, its centred window);
 * ties in substitution order. Returns their indices. */
export function centredWindow(ring: Ring, cells: Cyc[][], keep: number): number[] {
  const centroids = cells.map((cell) => {
    let x = 0;
    let y = 0;
    for (const v of cell) {
      const [px, py] = ring.toXY(v);
      x += px;
      y += py;
    }
    return [x / cell.length, y / cell.length] as const;
  });
  let gx = 0;
  let gy = 0;
  for (const [x, y] of centroids) {
    gx += x;
    gy += y;
  }
  gx /= centroids.length;
  gy /= centroids.length;
  const rank = centroids.map(([x, y]) =>
    Math.floor(Math.max(Math.abs(x - gx), Math.abs(y - gy)) * 1e6 + 0.5),
  );
  return cells
    .map((_, i) => i)
    .sort((i, j) => rank[i]! - rank[j]! || i - j)
    .slice(0, keep);
}

/** Which tile of the family a level is made of. */
export type HatTile = "hat" | "turtle" | "metatiles";

export interface HatPatch {
  ring: Ring;
  cells: Cyc[][];
  /** Per cell, whether it is a mirrored hat (or turtle); all false for the
   * metatiles. */
  mirrored: boolean[];
}

/** The window of `keep` tiles of `tile` nearest the middle of the H metatile
 * `depth` substitutions on: hats, turtles (the hats deformed, `deform`), or
 * the first-generation metatiles themselves. Each tile is its real corners;
 * a hat's long side runs straight through its fourteenth. */
export function hatPatch(tile: HatTile, depth: number, keep: number): HatPatch {
  const metas = hatMetatiles(depth);
  let cells: Cyc[][];
  let mirrored: boolean[];
  if (tile === "metatiles") {
    cells = metas.map((m) => m.corners.map(hexCyc));
    mirrored = cells.map(() => false);
  } else {
    const hats = metas.flatMap((m) => m.hats);
    mirrored = hats.map((h) => h.mirrored);
    const corners = hats.map((h) => h.corners);
    cells = tile === "hat" ? corners.map((c) => c.map(hexCyc)) : deform(corners, SQRT3, Z12.one);
    // drop the long side's midpoint, the fourth corner of fourteen
    cells = cells.map((c) => c.filter((_, i) => i !== 3));
  }
  const kept = centredWindow(Z12, cells, keep);
  return { ring: Z12, cells: kept.map((i) => cells[i]!), mirrored: kept.map((i) => mirrored[i]!) };
}
