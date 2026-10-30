// Port of minesweeper/boards/hurwitz.py: the closed hyperbolic surfaces -- a
// regular {p,q} tiling glued up into a surface with no edge at all (the {7,3}
// Hurwitz surfaces: Klein's quartic, Macbeath's surface, one of the first
// Hurwitz triplet; and the Bolza, Dyck and Bring surfaces), drawn as a patch
// of the Poincaré disc that covers it. See that module's docstring for the
// construction; this file follows it step for step, and the conformance oracle
// holds the two to the same boards.
//
// In short: the surface's {p,q} map is read off its group exactly -- PSL(2,q)
// for a Hurwitz surface, a presentation enumerated by Todd--Coxeter for the
// others (darts are group elements, faces the cosets of <xy>, vertices of <y>); the
// disc's ring walk covers it, and the covering map is a breadth-first walk on
// ids alone; the board draws the shells out to where every cell has a copy,
// each face showing the cell it covers (`Board.faces`), with the surface's own
// adjacency and topology (`Board.quotient`). Each surface is a mode of its own,
// and grows from difficulty to difficulty by changing its tiling: a Wythoff
// tiling of it, or a Goldberg--Coxeter subdivision GC(n, 0) (`gcLoops`).
//
// What this port adds is the pan (`Board.disc.cover`): one step for each tile
// round the central one, the disc isometry that carries the central tile onto
// it and the symmetry of the surface that goes with it, so `render/disc.ts` can
// carry a view that has wandered a tile off centre back to it without the
// picture changing -- and the pan never ends.
import { cid, flatBoard, keepSymmetries, planeSymmetries, sharedVertexAdjacency } from "./core";
import type { Board, BoardSymmetry, CellId, DiscCover, SymmetryCandidate } from "./core";
import {
  ARC_SEGMENTS,
  arcPoints,
  centralPolygon,
  discDrawing,
  distance,
  drop,
  hyperbolicTiling,
  isometry,
  lift,
  shellGroups,
  toOrigin,
  wythoffLoops,
  type C,
  type V3,
  type WythoffOp,
  type WythoffOrigin,
} from "./hyperbolic";

/** A closed surface: its tiling {p,q}, its genus, and its group -- the order
 * of the field of a PSL(2,q) (a number), or the relator a presentation adds to
 * x^2, y^q and (xy)^p (a word in x, y and Y = y^-1). Mirrors `Surface`. */
export interface ClosedSurface {
  p: number;
  q: number;
  genus: number;
  group: number | string;
}

/** The surfaces, by name, in order of genus. Must match `CLOSED_SURFACES`. */
export const CLOSED_SURFACES: Record<string, ClosedSurface> = {
  bolza: { p: 8, q: 3, genus: 2, group: "xyxyxY".repeat(2) },
  quartic: { p: 7, q: 3, genus: 3, group: 7 },
  dyck: { p: 8, q: 3, genus: 3, group: "xyxY".repeat(3) },
  bring: { p: 5, q: 4, genus: 4, group: "xyxY".repeat(3) },
  macbeath: { p: 7, q: 3, genus: 7, group: 8 },
  triplet: { p: 7, q: 3, genus: 14, group: 13 },
};

/** The surface named `surface`, or an error. */
function surfaceOf(surface: string): ClosedSurface {
  const spec = CLOSED_SURFACES[surface];
  if (!spec) throw new Error(`unknown closed surface ${surface}`);
  return spec;
}

/** How many copies of the surface the view holds: its area over the
 * surface's. That is what decides how a closed surface plays -- under one copy
 * and a flag at the view's edge has its twin near the opposite edge, so the
 * whole surface reads at a glance; well over one and every cell is on screen
 * two or three times over; well under and most of the surface is off screen.
 * Must match `COVER_COPIES` in hurwitz.py. */
export const COVER_COPIES = 0.75;

/** How far round the centre of the view the pan always has board to show for
 * `surface`, in hyperbolic distance (`DiscCover.view`): the radius v whose disc
 * holds `COVER_COPIES` copies of the surface, cosh v = 1 + 2 COVER_COPIES
 * (g - 1) -- a disc's area is 2 pi (cosh v - 1), a genus-g surface's 4 pi (g - 1).
 * The tiling does not enter, so every difficulty of a surface shows the same
 * view, its cells smaller the harder it is. The pan keeps the view's centre on
 * the central tile and the patch reaches `patchReach` from its centre, so every
 * point this close to the view is drawn; the renderer hides what lies farther
 * out, which keeps the board's edge one fixed circle however the view steps
 * across the cover, and the board is framed to that circle. Mirrors
 * `cover_view`. */
export function coverView(surface: string): number {
  return Math.acosh(1 + 2 * COVER_COPIES * (surfaceOf(surface).genus - 1));
}

/** How far the view's centre can ever be from the patch's: the pan carries it
 * back onto the central p-gon of {p,q} (`discRecentre`), so its circumradius,
 * acosh(cot(pi/p) cot(pi/q)). Mirrors `view_shift`. */
export function viewShift(p: number, q: number): number {
  return Math.acosh(1 / (Math.tan(Math.PI / p) * Math.tan(Math.PI / q)));
}

/** How far from the centre the patch always reaches: the view, plus as far as
 * the view's centre can be from the patch's, plus the tiling's own tile
 * radius -- a tile whose centre is farther out cannot reach into the view.
 * Mirrors `patch_reach`. */
export function patchReach(surface: string, op: HurwitzOp): number {
  const { p, q } = surfaceOf(surface);
  return coverView(surface) + viewShift(p, q) + tileRadius(p, q, op);
}

const radiusCache = new Map<string, number>();

/** The farthest any tile's corner is from its own centre, in hyperbolic
 * distance, measured on the disc's first rings (the tiles are congruent by
 * type, so a few rings hold every kind). Mirrors `_tile_radius`. */
export function tileRadius(p: number, q: number, op: HurwitzOp): number {
  const cacheKey = `${p},${q},${op}`;
  const hit = radiusCache.get(cacheKey);
  if (hit !== undefined) return hit;
  let loops: string[][];
  let where: Map<string, C>;
  let centres: C[];
  const n = gcOrder(op);
  if (n !== null) ({ loops, where, centres } = gcLoops(p, q, n, 3));
  else if (op === "none") {
    const t = hyperbolicTiling(p, q, 3);
    loops = t.faces.map((face) => face.map(String));
    where = new Map([...t.pos].map(([v, z]) => [String(v), z]));
    centres = t.centres;
  } else ({ loops, where, centres } = wythoffLoops(p, q, op as WythoffOp, 3));
  let far = 0;
  loops.forEach((loop, f) => {
    for (const k of loop) far = Math.max(far, 2 * Math.atanh(Math.hypot(...toOrigin(centres[f]!, where.get(k)!))));
  });
  radiusCache.set(cacheKey, far);
  return far;
}

/** How many device pixels a unit of the board's disc can be drawn as, at
 * most, for a view that strays up to `shift` from the centre (`viewShift`):
 * the pan's worst case (a translation by `shift` magnifies by at most
 * e^shift) on a disc a thousand device pixels in radius -- a retina desktop's
 * at more than twice the fitted zoom, a phone's at three times. Zoomed
 * further still, a rim edge drawn straight is off by about a pixel, under the
 * gap between two tiles. The web port's alone: the pygame game draws a static
 * disc, every edge at full curve. */
const drawnScale = (shift: number): number => Math.exp(shift) * 1000;

/**
 * How many segments draw the edge from a to b: as many as its curve needs,
 * at most `most`. A geodesic of the disc is a circular arc, and its chord
 * misses it by the sagitta; k segments miss it by about the sagitta over k^2.
 * The patch's view never comes closer to an edge than `shift`, so how big
 * the edge can ever be shown is known, and an edge whose miss could never
 * reach half a pixel is drawn straight. That is nearly every edge out at the
 * rim, which is most of a patch -- and every corner a cell's outline carries
 * is another run of the cell's bevel, so it is most of what the renderer
 * draws.
 */
export function edgeSegments(a: C, b: C, most: number, shift = viewShift(7, 3)): number {
  const [m] = arcPoints(a, b, 2);
  const sag = Math.hypot(m![0] - (a[0] + b[0]) / 2, m![1] - (a[1] + b[1]) / 2) * drawnScale(shift);
  for (let k = 1; k < most; k++) if (sag / (k * k) <= 0.5) return k;
  return most;
}

/** What each surface is called, for the info window. */
export const HURWITZ_LABELS: Record<string, string> = {
  bolza: "Bolza surface",
  quartic: "Klein quartic",
  dyck: "Dyck's surface",
  bring: "Bring's surface",
  macbeath: "Macbeath surface",
  triplet: "First Hurwitz triplet",
};

/** The surface a closed hyperbolic board is drawn on, named and with its genus
 * -- by its mode, since two surfaces can share a genus (Klein's quartic and
 * Dyck's surface are both genus 3). Null for a mode that is no surface here. */
export function hurwitzSurfaceLabel(mode: string): string | null {
  const name = Object.keys(SURFACE_MODES).find((s) => SURFACE_MODES[s] === mode);
  return name ? `${HURWITZ_LABELS[name]}, genus ${CLOSED_SURFACES[name]!.genus}` : null;
}

/** `"none"` is {p,q} itself, then its Wythoff tilings (`WYTHOFF_OPS` bar
 * `truncate`: 3.14.14's triangles are tiny beside its 14-gons), then its
 * Goldberg--Coxeter subdivisions GC(n, 0) (`gcLoops`). Must match
 * `HURWITZ_OPS`. */
export const HURWITZ_OPS = [
  "none",
  "ambo",
  "zip",
  "expand",
  "bevel",
  "gc2",
  "gc3",
  "gc4",
  "gc5",
  "gc6",
  "gc7",
  "gc8",
] as const;
export type HurwitzOp = (typeof HURWITZ_OPS)[number];

/** Each surface's mode: one surface a mode, whatever the difficulty, which
 * grows the board by changing the tiling, never the surface. Must match
 * `SURFACE_MODES`. */
export const SURFACE_MODES: Record<string, string> = Object.fromEntries(
  Object.keys(CLOSED_SURFACES).map((name) => [name, name]),
);

/** The n of a Goldberg--Coxeter tiling `gc<n>`, or null for any other. */
function gcOrder(op: HurwitzOp): number | null {
  return op.startsWith("gc") ? Number(op.slice(2)) : null;
}

// -- the group ----------------------------------------------------------------

/** Addition, multiplication and negation in GF(q). Mirrors `_field`. */
function field(q: number): {
  add: (a: number, b: number) => number;
  mul: (a: number, b: number) => number;
  neg: (a: number) => number;
} {
  if (q === 8) {
    return {
      add: (a, b) => a ^ b,
      mul: (a, b) => {
        let r = 0;
        for (let i = 0; i < 3; i++) if ((b >> i) & 1) r ^= a << i;
        for (const i of [4, 3]) if ((r >> i) & 1) r ^= 0b1011 << (i - 3);
        return r;
      },
      neg: (a) => a,
    };
  }
  return {
    add: (a, b) => (a + b) % q,
    mul: (a, b) => (a * b) % q,
    neg: (a) => (q - a) % q,
  };
}

export interface HurwitzGroup {
  /** The elements in order, each a matrix (a, b, c, d) packed as the number
   * a q^3 + b q^2 + c q + d -- the lesser of it and its negative -- so numeric
   * order is Python's tuple order. */
  elements: number[];
  times: (m: number, n: number) => number;
  x: number;
  y: number;
}

const groupCache = new Map<number, HurwitzGroup>();

/** PSL(2,q) and its Hurwitz generators: the first x of order 2 and y of order
 * 3, x then y in element order, with xy of order 7 that generate the whole
 * group. Mirrors `hurwitz_group`. */
export function hurwitzGroup(q: number): HurwitzGroup {
  const hit = groupCache.get(q);
  if (hit) return hit;
  const { add, mul, neg } = field(q);
  const pack = (a: number, b: number, c: number, d: number) => ((a * q + b) * q + c) * q + d;
  const canon = (a: number, b: number, c: number, d: number) =>
    Math.min(pack(a, b, c, d), pack(neg(a), neg(b), neg(c), neg(d)));
  const unpack = (m: number): [number, number, number, number] => [
    Math.floor(m / (q * q * q)),
    Math.floor(m / (q * q)) % q,
    Math.floor(m / q) % q,
    m % q,
  ];
  const set = new Set<number>();
  for (let a = 0; a < q; a++)
    for (let b = 0; b < q; b++)
      for (let c = 0; c < q; c++)
        for (let d = 0; d < q; d++)
          if (add(mul(a, d), neg(mul(b, c))) === 1) set.add(canon(a, b, c, d));
  const elements = [...set].sort((u, v) => u - v);
  const size = q * q * q * q;
  const table = new Map<number, number>();
  const times = (m: number, n: number): number => {
    const key = m * size + n;
    let out = table.get(key);
    if (out === undefined) {
      const [a, b, c, d] = unpack(m);
      const [e, f, g, h] = unpack(n);
      out = canon(
        add(mul(a, e), mul(b, g)),
        add(mul(a, f), mul(b, h)),
        add(mul(c, e), mul(d, g)),
        add(mul(c, f), mul(d, h)),
      );
      table.set(key, out);
    }
    return out;
  };
  const identity = canon(1, 0, 0, 1);
  const order = (m: number): number => {
    let k = 1;
    let power = m;
    while (power !== identity) {
      power = times(power, m);
      k++;
    }
    return k;
  };
  const generates = (x: number, y: number): boolean => {
    const seen = new Set([identity]);
    let frontier = [identity];
    while (frontier.length) {
      const next: number[] = [];
      for (const g of frontier) {
        for (const h of [times(g, x), times(g, y)]) {
          if (!seen.has(h)) {
            seen.add(h);
            next.push(h);
          }
        }
      }
      frontier = next;
    }
    return seen.size === elements.length;
  };
  const involutions = elements.filter((m) => order(m) === 2);
  const triples = elements.filter((m) => order(m) === 3);
  for (const x of involutions) {
    for (const y of triples) {
      if (order(times(x, y)) === 7 && generates(x, y)) {
        const out = { elements, times, x, y };
        groupCache.set(q, out);
        return out;
      }
    }
  }
  throw new Error(`PSL(2,${q}) has no Hurwitz generators`);
}

const tcCache = new Map<string, readonly [number[], number[]]>();

/**
 * The group <x, y | x^2, y^q, (xy)^p, relator> acting on itself on the right:
 * x and y as permutations of its elements, numbered breadth-first from the
 * identity, x before y -- a numbering that depends only on the group and its
 * generators, so it is `todd_coxeter`'s whatever order either enumeration
 * runs in. Haselgrove--Leech--Trotter over the trivial subgroup; throws if it
 * outgrows `limit` cosets. Mirrors `todd_coxeter`.
 */
export function toddCoxeter(p: number, q: number, relator: string, limit = 100_000): readonly [number[], number[]] {
  const cacheKey = `${p},${q},${relator},${limit}`;
  const hit = tcCache.get(cacheKey);
  if (hit) return hit;
  // generator columns: x, x^-1, y, y^-1
  const inverse = [1, 0, 3, 2];
  const letter: Record<string, number> = { x: 0, X: 1, y: 2, Y: 3 };
  const relators = [
    [0, 0],
    Array<number>(q).fill(2),
    Array.from({ length: 2 * p }, (_, i) => (i % 2 === 0 ? 0 : 2)),
    [...relator].map((c) => letter[c]!),
  ];
  const table: (number | null)[][] = [[null, null, null, null]];
  const parent = [0];
  const find = (c: number): number => {
    while (parent[c] !== c) {
      parent[c] = parent[parent[c]!]!;
      c = parent[c]!;
    }
    return c;
  };
  const coincide = (a0: number, b0: number): void => {
    const pending: [number, number][] = [[a0, b0]];
    while (pending.length) {
      const [s, t0] = pending.pop()!;
      let a = find(s);
      let b = find(t0);
      if (a === b) continue;
      if (a > b) [a, b] = [b, a];
      parent[b] = a;
      for (let g = 0; g < 4; g++) {
        const t = table[b]![g];
        if (t === null || t === undefined) continue;
        table[b]![g] = null;
        if (table[t]![inverse[g]!] === b) table[t]![inverse[g]!] = null;
        const u = table[a]![g];
        if (u === null || u === undefined) {
          table[a]![g] = t;
          const back = table[t]![inverse[g]!];
          if (back === null || back === undefined) table[t]![inverse[g]!] = a;
          else pending.push([back, a]);
        } else {
          pending.push([u, t]);
          if (table[t]![inverse[g]!] === null) table[t]![inverse[g]!] = find(a);
        }
      }
    }
  };
  const define = (c: number, g: number): number => {
    if (table.length >= limit) throw new Error("the coset enumeration does not close");
    const n = table.length;
    table.push([null, null, null, null]);
    parent.push(n);
    table[c]![g] = n;
    table[n]![inverse[g]!] = c;
    return n;
  };
  const scan = (c: number, word: number[]): void => {
    // trace the relator forward from c, then backward, defining the gap
    let f = c;
    let i = 0;
    while (i < word.length && table[f]![word[i]!] !== null) f = table[f]![word[i++]!]!;
    if (i === word.length) {
      if (f !== c) coincide(f, c);
      return;
    }
    let b = c;
    let j = word.length - 1;
    while (j >= i && table[b]![inverse[word[j]!]!] !== null) b = table[b]![inverse[word[j--]!]!]!;
    if (j < i) {
      coincide(f, b);
      return;
    }
    while (i < j) f = define(f, word[i++]!);
    table[f]![word[i]!] = b;
    table[b]![inverse[word[i]!]!] = f;
  };
  for (let c = 0; c < table.length; c++) {
    for (const word of relators) {
      if (find(c) !== c) break;
      scan(c, word);
    }
    if (find(c) === c) for (let g = 0; g < 4; g++) if (table[c]![g] === null) define(c, g);
  }
  // renumber the live cosets breadth-first from the identity, x before y
  const number = new Map<number, number>([[0, 0]]);
  const order = [0];
  for (let k = 0; k < order.length; k++) {
    for (const g of [0, 2]) {
      const d = find(table[order[k]!]![g]!);
      if (!number.has(d)) {
        number.set(d, order.length);
        order.push(d);
      }
    }
  }
  const out = [
    order.map((c) => number.get(find(table[c]![0]!))!),
    order.map((c) => number.get(find(table[c]![2]!))!),
  ] as const;
  tcCache.set(cacheKey, out);
  return out;
}

const dartsCache = new Map<string, readonly [number[], number[]]>();

/** How x and y act on the surface's darts, numbered 0 .. |G| - 1: for a
 * Hurwitz group the elements of PSL(2,q) in order, times x or y on the right;
 * for a presentation the cosets `toddCoxeter` counts. Mirrors `_darts`. */
export function darts(surface: string): readonly [number[], number[]] {
  const hit = dartsCache.get(surface);
  if (hit) return hit;
  const { p, q, group } = surfaceOf(surface);
  let out: readonly [number[], number[]];
  if (typeof group === "string") out = toddCoxeter(p, q, group);
  else {
    const { elements, times, x, y } = hurwitzGroup(group);
    const index = new Map(elements.map((g, i) => [g, i]));
    out = [elements.map((g) => index.get(times(g, x))!), elements.map((g) => index.get(times(g, y))!)];
  }
  dartsCache.set(surface, out);
  return out;
}

const mapCache = new Map<string, number[][]>();

/** The surface's {p,q} map: each face as its p vertex ids in order, numbered
 * in the order of the first dart of their coset. Mirrors `hurwitz_map`. */
export function hurwitzMap(surface: string): number[][] {
  const hit = mapCache.get(surface);
  if (hit) return hit;
  const [stepX, stepY] = darts(surface);
  const { p, q } = surfaceOf(surface);
  const turn = stepX.map((d) => stepY[d]!);
  const cosets = (step: readonly number[], n: number): number[] => {
    const out: number[] = Array<number>(step.length).fill(-1);
    let k = 0;
    for (let d = 0; d < step.length; d++) {
      if (out[d] !== -1) continue;
      let h = d;
      for (let i = 0; i < n; i++) {
        out[h] = k;
        h = step[h]!;
      }
      k++;
    }
    return out;
  };
  const faceOf = cosets(turn, p);
  const vertexOf = cosets(stepY, q);
  const faces: number[][] = [];
  for (let d = 0; d < turn.length; d++) {
    const f = faceOf[d]!;
    if (faces[f]) continue;
    const corners: number[] = [];
    let h = d;
    for (let i = 0; i < p; i++) {
      corners.push(vertexOf[h]!);
      h = turn[h]!;
    }
    faces[f] = corners;
  }
  mapCache.set(surface, faces);
  return faces;
}

/** The length of the map's Petrie polygons, which tells the surfaces of the
 * first Hurwitz triplet apart. Mirrors `petrie_length`. */
export function petrieLength(surface: string): number {
  const left = new Map<string, number>();
  const right = new Map<string, number>();
  const faces = hurwitzMap(surface);
  const p = faces[0]!.length;
  for (const face of faces) {
    for (let i = 0; i < p; i++) {
      const u = face[(i + p - 1) % p]!;
      const v = face[i]!;
      const w = face[(i + 1) % p]!;
      left.set(`${u}>${v}`, w);
      right.set(`${w}>${v}`, u);
    }
  }
  const start = `${faces[0]![0]}>${faces[0]![1]}`;
  let [a, b] = [faces[0]![0]!, faces[0]![1]!];
  let steps = 0;
  for (;;) {
    const turn = steps % 2 === 0 ? left : right;
    [a, b] = [b, turn.get(`${a}>${b}`)!];
    steps++;
    if (`${a}>${b}` === start && steps % 2 === 0) return steps;
  }
}

// -- the cover ----------------------------------------------------------------

/** The edges of a map of p-gons, each directed edge -> (face, corner). */
function across(faces: readonly (readonly number[])[]): Map<string, readonly [number, number]> {
  const out = new Map<string, readonly [number, number]>();
  faces.forEach((face, f) => {
    const p = face.length;
    for (let i = 0; i < p; i++) out.set(`${face[i]}>${face[(i + 1) % p]}`, [f, i]);
  });
  return out;
}

/**
 * The walk that carries one map of p-gons onto another: `from`'s face 0
 * corner i goes to `to`'s face `face` corner `offset + i`, and every face
 * across an edge from one already carried goes to the one across that edge's
 * image. Returns the face map and the vertex map (whatever of `from` the walk
 * reaches). Shared by the covering map (`from` the disc) and the surface's
 * symmetries (`from` the surface itself).
 */
function carry(
  from: readonly (readonly number[])[],
  to: readonly (readonly number[])[],
  face: number,
  offset: number,
): { faceMap: Map<number, number>; vertexMap: Map<number, number> } {
  const p = from[0]!.length;
  const target = across(to);
  const source = new Map<string, number>();
  from.forEach((f, i) => {
    for (let k = 0; k < p; k++) source.set(`${f[k]}>${f[(k + 1) % p]}`, i);
  });
  const vertexMap = new Map<number, number>();
  from[0]!.forEach((v, i) => vertexMap.set(v, to[face]![(offset + i) % p]!));
  const faceMap = new Map<number, number>([[0, face]]);
  const stack = [0];
  while (stack.length) {
    const f = stack.pop()!;
    const corners = from[f]!;
    for (let i = 0; i < p; i++) {
      const a = corners[i]!;
      const b = corners[(i + 1) % p]!;
      const g = source.get(`${b}>${a}`);
      if (g === undefined || faceMap.has(g)) continue;
      const [h, k] = target.get(`${vertexMap.get(b)}>${vertexMap.get(a)}`)!;
      const start = from[g]!.indexOf(b);
      for (let s = 0; s < p; s++) {
        const v = from[g]![(start + s) % p]!;
        const w = to[h]![(k + s) % p]!;
        const was = vertexMap.get(v);
        if (was !== undefined && was !== w) throw new Error("the disc does not cover the surface");
        vertexMap.set(v, w);
      }
      faceMap.set(g, h);
      stack.push(g);
    }
  }
  return { faceMap, vertexMap };
}

interface Cover {
  phiFace: number[];
  phi: Map<number, number>;
}

const coverCache = new Map<string, Cover>();

/** The covering map from the {p,q} disc out to `rings` rings onto the surface.
 * Mirrors `_cover`. */
function cover(surface: string, rings: number): Cover {
  const cacheKey = `${surface},${rings}`;
  const hit = coverCache.get(cacheKey);
  if (hit) return hit;
  const { p, q } = surfaceOf(surface);
  const base = hyperbolicTiling(p, q, rings).faces;
  const { faceMap, vertexMap } = carry(base, hurwitzMap(surface), 0, 0);
  const out = { phiFace: base.map((_, f) => faceMap.get(f)!), phi: vertexMap };
  coverCache.set(cacheKey, out);
  return out;
}

/** A surface cell, named by what it stands on: `F,face`, `V,vertex` or
 * `E,u,v`. */
function cellKey(origin: WythoffOrigin, phiFace: readonly number[], phi: Map<number, number>): string {
  if (origin[0] === "F") return `F,${phiFace[origin[1]]}`;
  if (origin[0] === "V") return `V,${phi.get(origin[1])}`;
  const [u, v] = [phi.get(origin[1])!, phi.get(origin[2])!].sort((s, t) => s - t);
  return `E,${u},${v}`;
}

/** A disc key carried down to its surface vertex. Mirrors `_patch`'s `key`. */
function surfaceKey(op: HurwitzOp, k: string, phiFace: readonly number[], phi: Map<number, number>): string {
  if (op === "none") return String(phi.get(Number(k)));
  const ids = k.split(",").map(Number);
  const v = (i: number) => phi.get(ids[i]!)!;
  if (op === "ambo") return [v(0), v(1)].sort((s, t) => s - t).join(",");
  if (op === "zip") return [phiFace[ids[0]!], ...[v(1), v(2)].sort((s, t) => s - t)].join(",");
  if (op === "expand") return `${phiFace[ids[0]!]},${v(1)}`;
  return `${phiFace[ids[0]!]},${v(1)},${v(2)}`;
}

interface Patch {
  loops: string[][];
  where: Map<string, C>;
  centres: C[];
  cells: string[];
  key: (k: string) => string;
}

// -- the subdivided tilings: Goldberg--Coxeter GC(n, 0) ------------------------
//
// Port of the section of the same name in hurwitz.py, which says why: the
// dual {q,p} cut into small triangles (q = 3) or an n x n grid of squares
// (q = 4), and the dual taken again -- a p-gon round every p-gon's centre,
// hexagons or squares everywhere else. A point of the cut is named by what it
// lies inside (nothing for a face's centre, `u,v` for the edge a point on a
// side crosses, `v` for the corner a point inside a dual polygon stands on)
// and its weights over its dual polygon's corners (the ring walk's faces),
// `face:weight` pairs sorted and joined by `;` -- the two parts joined by
// `/`. A small polygon is named by its points, sorted and joined by `|`.

interface GcLoops {
  loops: string[][];
  where: Map<string, C>;
  centres: C[];
  origins: string[];
}

const gcCache = new Map<string, GcLoops>();

/** A point's name from what it lies inside and its (face, weight) pairs, zero
 * weights dropped. */
function pointKey(support: readonly number[], pairs: [number, number][]): string {
  const held = pairs
    .filter(([, w]) => w > 0)
    .sort((a, b) => a[0] - b[0] || a[1] - b[1])
    .map(([f, w]) => `${f}:${w}`)
    .join(";");
  return `${[...support].sort((a, b) => a - b).join(",")}/${held}`;
}

/** The dual {q,p} of the {p,q} disc out to `rings` rings: for every vertex
 * with all q of its faces, the vertex, its faces counterclockwise from the
 * least, and the far end of the edge each face shares with the next. Mirrors
 * `_stars`. */
function stars(p: number, q: number, rings: number): [number, number[], number[]][] {
  const { faces } = hyperbolicTiling(p, q, rings);
  const star = new Map<number, [number, number, number][]>();
  faces.forEach((face, f) => {
    face.forEach((v, i) => {
      const entry: [number, number, number] = [f, face[(i + p - 1) % p]!, face[(i + 1) % p]!];
      const round = star.get(v);
      if (round) round.push(entry);
      else star.set(v, [entry]);
    });
  });
  const out: [number, number[], number[]][] = [];
  for (const v of [...star.keys()].sort((a, b) => a - b)) {
    const round = star.get(v)!;
    if (round.length < q) continue;
    // counterclockwise round v, face g is followed by the face whose corner
    // after v is g's corner before v: the two share that edge
    const prev = new Map(round.map(([f, u]) => [f, u]));
    const byNext = new Map(round.map(([f, , w]) => [w, f]));
    const order = [Math.min(...prev.keys())];
    while (order.length < q) order.push(byNext.get(prev.get(order[order.length - 1]!)!)!);
    out.push([v, order, order.map((f) => prev.get(f)!)]);
  }
  return out;
}

/** GC(n, 0) of the {p,q} disc out to `rings` rings (q of 3 or 4): each cell
 * as the loop of the small polygons round its point, counterclockwise, their
 * positions, each cell's centre (its point) and its point's key. Mirrors
 * `gc_loops`. */
export function gcLoops(p: number, q: number, n: number, rings: number): GcLoops {
  const cacheKey = `${p},${q},${n},${rings}`;
  const hit = gcCache.get(cacheKey);
  if (hit) return hit;
  if (n < 2) throw new Error("a subdivision needs n of at least 2");
  if (q !== 3 && q !== 4) throw new Error("a subdivision needs a tiling of valence 3 or 4");
  const { centres } = hyperbolicTiling(p, q, rings);
  const lifted = centres.map(lift);
  const blend = (points: readonly V3[], weights: readonly number[]): C =>
    drop([0, 1, 2].map((axis) => points.reduce((sum, pt, i) => sum + weights[i]! * pt[axis]!, 0)) as unknown as V3);
  const pointAt = new Map<string, C>();
  const around = new Map<string, string[]>();
  const where = new Map<string, C>();
  const order: string[] = [];
  for (const [v, corners, shared] of stars(p, q, rings)) {
    const point = (weights: number[]): string => {
      const held = weights.flatMap((w, i) => (w ? [i] : []));
      let support: number[];
      if (held.length === 1) support = [];
      else if (held.length === 2) {
        // corners i and i + 1 (cyclically) share the edge to shared[i]
        const i = held[0] === 0 && held[1] === q - 1 ? held[1]! : held[0]!;
        support = [v, shared[i]!];
      } else support = [v];
      const key = pointKey(
        support,
        held.map((i) => [corners[i]!, weights[i]!] as [number, number]),
      );
      if (!pointAt.has(key)) {
        pointAt.set(key, blend(corners.map((f) => lifted[f]!), weights));
        order.push(key);
      }
      return key;
    };
    const smalls: string[][] = [];
    if (q === 3) {
      for (let a = 0; a < n; a++) {
        for (let b = 0; b < n - a; b++) {
          smalls.push([point([n - a - b, a, b]), point([n - a - 1 - b, a + 1, b]), point([n - a - b - 1, a, b + 1])]);
          if (a + b <= n - 2) {
            smalls.push([
              point([n - a - b - 1, a + 1, b]),
              point([n - a - b - 2, a + 1, b + 1]),
              point([n - a - b - 1, a, b + 1]),
            ]);
          }
        }
      }
    } else {
      const grid = (i: number, j: number) => point([(n - i) * (n - j), i * (n - j), i * j, (n - i) * j]);
      for (let i = 0; i < n; i++)
        for (let j = 0; j < n; j++) smalls.push([grid(i, j), grid(i + 1, j), grid(i + 1, j + 1), grid(i, j + 1)]);
    }
    for (const small of smalls) {
      const key = [...small].sort().join("|");
      if (where.has(key)) continue;
      where.set(
        key,
        blend(
          small.map((k) => lift(pointAt.get(k)!)),
          small.map(() => 1),
        ),
      );
      for (const k of small) {
        const list = around.get(k);
        if (list) list.push(key);
        else around.set(k, [key]);
      }
    }
  }
  const out: GcLoops = { loops: [], where, centres: [], origins: [] };
  for (const key of order) {
    const smalls = around.get(key)!;
    const corner = !key.includes(";");
    if (smalls.length !== (corner ? p : q === 3 ? 6 : 4)) continue; // a small polygon round it was not built
    const z = pointAt.get(key)!;
    const angle = (t: string) => {
      const w = toOrigin(z, where.get(t)!);
      return Math.atan2(w[1], w[0]);
    };
    out.loops.push([...smalls].sort((s, t) => angle(s) - angle(t)));
    out.centres.push(z);
    out.origins.push(key);
  }
  gcCache.set(cacheKey, out);
  return out;
}

/** GC(n, 0) of {p,q} on its own, in the disc -- no surface, no cover --
 * trimmed to the cells at the `shells` smallest distances from the centre: a
 * picture of the subdivided tiling for a menu card, which the board itself is
 * too costly to build for. */
export function gcDisc(p: number, q: number, n: number, shells: number, scale: number): Board {
  for (let rings = 2; rings <= 8; rings++) {
    const g = gcLoops(p, q, n, rings);
    const groups = shellGroups(g.centres);
    if (groups.length <= shells) continue;
    const base = hyperbolicTiling(p, q, rings);
    let outer = Infinity;
    base.centres.forEach((z, f) => {
      if (base.ringOf[f] === rings) outer = Math.min(outer, distance(z));
    });
    if (outer <= distance(g.centres[groups[shells - 1]![0]!]!) + 1.0) continue;
    const ids = new Map<string, number>();
    const faces = groups
      .slice(0, shells)
      .flat()
      .map((f) =>
        g.loops[f]!.map((k) => {
          let id = ids.get(k);
          if (id === undefined) ids.set(k, (id = ids.size));
          return id;
        }),
      );
    const pos = new Map<number, C>();
    for (const [k, id] of ids) pos.set(id, g.where.get(k)!);
    const drawing = discDrawing(faces, faces.map((_, i) => i), pos, scale, ARC_SEGMENTS);
    const size = 2 * drawing.extent * scale;
    return flatBoard({
      mode: `gc${n}`,
      polygons: drawing.polygons,
      adjacency: sharedVertexAdjacency(drawing.cells),
      width: size,
      height: size,
      cornerMask: drawing.cornerMask,
      curved: true,
      regularTiles: true,
    });
  }
  throw new Error("too many shells");
}

/** A point's key carried down to the surface: what it lies inside through
 * the vertex map, each face through the face map, re-sorted. */
function pointDown(key: string, faceOf: (f: number) => number, vertexOf: (v: number) => number): string {
  const [support, held] = key.split("/");
  return pointKey(
    support ? support.split(",").map((v) => vertexOf(Number(v))) : [],
    held!.split(";").map((pair) => {
      const [f, w] = pair.split(":").map(Number);
      return [faceOf(f!), w!] as [number, number];
    }),
  );
}

/** The disc out to `rings` rings in tiling `op`, and how it covers the
 * surface. Mirrors `_patch`. */
function patch(surface: string, op: HurwitzOp, rings: number): Patch {
  const { p, q } = surfaceOf(surface);
  const { phiFace, phi } = cover(surface, rings);
  const n = gcOrder(op);
  if (n !== null) {
    const g = gcLoops(p, q, n, rings);
    const down = (k: string) =>
      pointDown(
        k,
        (f) => phiFace[f]!,
        (v) => phi.get(v)!,
      );
    return {
      loops: g.loops,
      where: g.where,
      centres: g.centres,
      cells: g.origins.map((o) => `G,${down(o)}`),
      key: (k) => k.split("|").map(down).sort().join("|"),
    };
  }
  if (op === "none") {
    const t = hyperbolicTiling(p, q, rings);
    const where = new Map<string, C>();
    for (const [v, z] of t.pos) where.set(String(v), z);
    return {
      loops: t.faces.map((face) => face.map(String)),
      where,
      centres: t.centres,
      cells: t.faces.map((_, f) => `F,${phiFace[f]}`),
      key: (k) => surfaceKey(op, k, phiFace, phi),
    };
  }
  const w = wythoffLoops(p, q, op as WythoffOp, rings);
  return {
    loops: w.loops,
    where: w.where,
    centres: w.centres,
    cells: w.origins.map((o) => cellKey(o, phiFace, phi)),
    key: (k) => surfaceKey(op, k, phiFace, phi),
  };
}

/** Whether two loops are the same cycle, read from any start. */
function sameLoop(a: readonly string[], b: readonly string[]): boolean {
  if (a.length !== b.length) return false;
  const i = b.indexOf(a[0]!);
  if (i < 0) return false;
  return a.every((k, j) => k === b[(i + j) % b.length]);
}

/** How many cells the surface has in tiling `op`: F, V and E are its map's,
 * so this is arithmetic, not a build. Mirrors `cell_count`. */
export function cellCount(surface: string, op: HurwitzOp): number {
  const { p, q, genus } = surfaceOf(surface);
  // chi = V - E + F with pF = 2E = qV
  const faces = ((2 - 2 * genus) * 2 * q) / (2 * q - p * q + 2 * p);
  const edges = (p * faces) / 2;
  const vertices = (p * faces) / q;
  const n = gcOrder(op);
  if (n !== null) {
    return q === 3
      ? faces + edges * (n - 1) + (vertices * (n - 1) * (n - 2)) / 2
      : faces + edges * (n - 1) + vertices * (n - 1) ** 2;
  }
  const extra: Record<string, number> = {
    none: 0,
    ambo: vertices,
    zip: vertices,
    expand: vertices + edges,
    bevel: vertices + edges,
  };
  return faces + extra[op]!;
}

const cellsCache = new Map<string, Map<string, string[]>>();

/** The surface's cells in tiling `op`, each as its corners' surface vertex ids
 * in order. Mirrors `hurwitz_cells`. */
export function hurwitzCells(surface: string, op: HurwitzOp): Map<string, string[]> {
  const cacheKey = `${surface},${op}`;
  const hit = cellsCache.get(cacheKey);
  if (hit) return hit;
  if (!HURWITZ_OPS.includes(op)) throw new Error(`unknown tiling ${op}`);
  if (gcOrder(op) !== null && ![3, 4].includes(surfaceOf(surface).q))
    throw new Error(`${surface} has no subdivision`);
  const want = cellCount(surface, op);
  for (let rings = 2; rings <= 12; rings++) {
    const { loops, cells, key } = patch(surface, op, rings);
    const out = new Map<string, string[]>();
    loops.forEach((loop, f) => {
      const corners = loop.map(key);
      const was = out.get(cells[f]!);
      if (was) {
        if (!sameLoop(was, corners)) throw new Error("two copies of a cell disagree");
      } else out.set(cells[f]!, corners);
    });
    if (out.size === want) {
      cellsCache.set(cacheKey, out);
      return out;
    }
    if (out.size > want) throw new Error("the surface has more cells than its map counts");
  }
  throw new Error("the disc never reaches every cell");
}

/** Grow the disc until it holds every face out to the shells the patch keeps:
 * the first to reach every cell or out to `patchReach`, whichever is farther,
 * and `margin` more. Mirrors `_patch_for`. */
function patchFor(
  surface: string,
  op: HurwitzOp,
  margin: number,
): { patch: Patch; groups: number[][]; rings: number } {
  const { p: sides, q } = surfaceOf(surface);
  const target = hurwitzCells(surface, op).size;
  for (let rings = 2; rings <= 12; rings++) {
    const p = patch(surface, op, rings);
    const groups = shellGroups(p.centres);
    const seen = new Set<string>();
    let reach = -1;
    for (let s = 0; s < groups.length; s++) {
      for (const f of groups[s]!) seen.add(p.cells[f]!);
      if (seen.size === target) {
        reach = s + 1;
        break;
      }
    }
    if (reach < 0) continue;
    const far = patchReach(surface, op);
    const near = groups.filter((group) => distance(p.centres[group[0]!]!) <= far).length;
    const keep = Math.max(reach, near) + margin;
    if (groups.length <= keep) continue;
    const base = hyperbolicTiling(sides, q, rings);
    let outer = Infinity;
    base.centres.forEach((z, f) => {
      if (base.ringOf[f] === rings) outer = Math.min(outer, distance(z));
    });
    const cut = distance(p.centres[groups[keep - 1]![0]!]!);
    if (outer > cut + 1.0 && outer > far + 1.0) {
      return { patch: p, groups: groups.slice(0, keep), rings };
    }
  }
  throw new Error("the patch needs too many rings");
}

// -- the pan ------------------------------------------------------------------

/**
 * One step per tile round the central p-gon of the {p,q} disc: the
 * isometry carrying the central tile onto it, as a view-shaped pair (c, rot) --
 * z -> rot (z - c) / (1 - conj(c) z) -- and the symmetry of the surface it
 * covers, carried to the board's cells: for each cell, the cell the step puts
 * where it was (`cells.get(x)` is the cell that stands at x's place once the
 * view has been stepped). See `DiscCover`.
 */
function coverSteps(
  surface: string,
  op: HurwitzOp,
  rings: number,
  nameOf: Map<string, CellId>,
): DiscCover {
  const { p, q } = surfaceOf(surface);
  const t = hyperbolicTiling(p, q, rings);
  const { phiFace, phi } = cover(surface, rings);
  const centre = centralPolygon(p, q);
  const surfaceFaces = hurwitzMap(surface);
  const surfaceCells = hurwitzCells(surface, op);
  const steps: DiscCover["steps"][number][] = [];
  const disc = new Map<string, number>();
  t.faces.forEach((face, f) => {
    for (let i = 0; i < p; i++) disc.set(`${face[i]}>${face[(i + 1) % p]}`, f);
  });
  const central = t.faces[0]!;
  for (let k = 0; k < p; k++) {
    // the tile across the central p-gon's edge k, its corners lined up so
    // that the central corner k + 1 lands on the corner the two tiles share
    const a = central[k]!;
    const b = central[(k + 1) % p]!;
    const g = disc.get(`${b}>${a}`)!;
    const neighbour = t.faces[g]!;
    const j = (neighbour.indexOf(b) - (k + 1) + 2 * p) % p;
    const map = isometry(
      centre[0]!,
      centre[1]!,
      t.pos.get(neighbour[j]!)!,
      t.pos.get(neighbour[(j + 1) % p]!)!,
    );
    const back = isometry(
      t.pos.get(neighbour[j]!)!,
      t.pos.get(neighbour[(j + 1) % p]!)!,
      centre[0]!,
      centre[1]!,
    );
    const c = back([0, 0]);
    const w = map([0, 0]);
    // w = rot * (0 - c), so rot = -w / c
    const d = c[0] * c[0] + c[1] * c[1];
    const rot: C = [-(w[0] * c[0] + w[1] * c[1]) / d, -(w[1] * c[0] - w[0] * c[1]) / d];
    // The surface's symmetry that goes with it: face 0 corner i (the image of
    // the central corner i) onto the image of the neighbour's corner j + i.
    const image = phi.get(neighbour[j]!)!;
    const h = phiFace[g]!;
    const offset = surfaceFaces[h]!.indexOf(image);
    const { faceMap, vertexMap } = carry(surfaceFaces, surfaceFaces, h, offset);
    const moved = (key: string): string => {
      if (key.startsWith("G,")) {
        return `G,${pointDown(
          key.slice(2),
          (f) => faceMap.get(f)!,
          (v) => vertexMap.get(v)!,
        )}`;
      }
      const [kind, ...ids] = key.split(",");
      if (kind === "F") return `F,${faceMap.get(Number(ids[0]))}`;
      if (kind === "V") return `V,${vertexMap.get(Number(ids[0]))}`;
      const [u, v] = ids.map((x) => vertexMap.get(Number(x))!).sort((s, r) => s - r);
      return `E,${u},${v}`;
    };
    const cells = new Map<CellId, CellId>();
    for (const key of surfaceCells.keys()) cells.set(nameOf.get(key)!, nameOf.get(moved(key))!);
    steps.push({ c, rot, cells });
  }
  return { steps, view: coverView(surface) };
}

// -- the board ----------------------------------------------------------------

/**
 * The closed surface `surface` in tiling `op`, drawn as a patch of the
 * Poincaré disc that covers it: the shells out to where every cell has a copy,
 * and `margin` more. Mirrors `hurwitz_board`.
 */
export function hurwitzBoard(
  surface: string,
  op: HurwitzOp,
  margin: number,
  scale = 300,
  arc = ARC_SEGMENTS,
): Board {
  if (margin < 0) throw new Error("margin must not be negative");
  const { p: sides, q } = surfaceOf(surface);
  const shift = viewShift(sides, q);
  const surfaceCells = hurwitzCells(surface, op);
  const { patch: p, groups, rings } = patchFor(surface, op, margin);
  const drawn = groups.flatMap((group) => [...group].sort((a, b) => a - b));
  const ids = new Map<string, number>();
  const faces = drawn.map((f) =>
    p.loops[f]!.map((k) => {
      let id = ids.get(k);
      if (id === undefined) ids.set(k, (id = ids.size));
      return id;
    }),
  );
  const pos = new Map<number, C>();
  for (const [k, id] of ids) pos.set(id, p.where.get(k)!);
  const { polygons, cornerMask, extent, rim } = discDrawing(
    faces,
    faces.map((_, i) => i),
    pos,
    scale,
    (a, b) => edgeSegments(a, b, arc, shift),
  );
  // each cell is named after its copy nearest the centre: the first drawn
  const nameOf = new Map<string, CellId>();
  drawn.forEach((f, face) => {
    if (!nameOf.has(p.cells[f]!)) nameOf.set(p.cells[f]!, cid(face));
  });
  const faceCell = new Map<CellId, CellId>();
  drawn.forEach((f, face) => faceCell.set(cid(face), nameOf.get(p.cells[f]!)!));
  const quotient = new Map<CellId, string[]>();
  for (const [key, corners] of surfaceCells) quotient.set(nameOf.get(key)!, corners);
  const adjacency = sharedVertexAdjacency(quotient);
  const coverSteps_ = coverSteps(surface, op, rings, nameOf);
  // Framed to the circle the view shows (`coverClip`), not to the whole patch:
  // past it nothing is ever drawn, so the board fills its frame as a disc
  // board does. The patch's polygons run on past the frame, hidden. The clip
  // keeps a tile by its centre, so one just inside it reaches out by a tile
  // radius more -- a sliver at the triplet's view, half a heptagon at the
  // quartic's -- and the frame takes that in too.
  const shown = Math.tanh((coverView(surface) + tileRadius(sides, q, op)) / 2);
  const offset = (shown - extent) * scale;
  for (const poly of polygons.values()) {
    for (const p of poly) {
      p[0] += offset;
      p[1] += offset;
    }
  }
  const size = 2 * shown * scale;
  // Faces the pan can never bring into the view: farther from the centre than
  // the view's reach plus the most its centre strays plus a tile. They stay
  // on the board -- every cell has a copy, which the pygame game and the cell
  // names need -- but the renderer builds nothing for them.
  const reach = patchReach(surface, op);
  const unseen = new Set<CellId>();
  drawn.forEach((f, face) => {
    if (distance(p.centres[f]!) > reach) unseen.add(cid(face));
  });
  const board = flatBoard({
    mode: SURFACE_MODES[surface]!,
    polygons,
    adjacency,
    width: size,
    height: size,
    cornerMask,
    curved: true,
    regularTiles: true,
    disc: { cx: shown * scale, cy: shown * scale, radius: scale, rim, cover: coverSteps_ },
    faces: faceCell,
    quotient,
    unseen,
  });
  let measured: BoardSymmetry[] | null = null;
  return Object.defineProperty(board, "symmetries", {
    get: () => (measured ??= coverSymmetries(polygons, faceCell, adjacency)),
  });
}

/** The patch's own point group (the central p-gon's turns and mirrors),
 * measured off the drawing and carried down to the cells through `faces`; what
 * the surface does not carry -- a mirror of a chiral one -- `keepSymmetries`
 * drops. The projective plane's recipe (`antipodalSymmetries`). */
function coverSymmetries(
  polygons: Map<CellId, [number, number][]>,
  faces: Map<CellId, CellId>,
  adjacency: Map<CellId, CellId[]>,
): BoardSymmetry[] {
  // the drawing's own adjacency, by shared (quantized) corners
  const keyed = new Map<CellId, string[]>();
  for (const [face, polygon] of polygons) {
    keyed.set(
      face,
      polygon.map(([x, y]) => `${Math.round(x * 1e4)},${Math.round(y * 1e4)}`),
    );
  }
  const drawn = planeSymmetries(polygons, sharedVertexAdjacency(keyed));
  const candidates: SymmetryCandidate[] = drawn.map(({ id, cycle }) => ({
    id,
    build: () => {
      const down = new Map<CellId, CellId>();
      for (const cell of adjacency.keys()) down.set(cell, faces.get(cycle.get(cell)!)!);
      return down;
    },
  }));
  return keepSymmetries(adjacency, candidates);
}
