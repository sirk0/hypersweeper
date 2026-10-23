// Port of minesweeper/boards/hurwitz.py: the closed hyperbolic surfaces -- the
// {7,3} tiling glued up into a surface with no edge at all (Klein's quartic,
// Macbeath's surface, one of the first Hurwitz triplet), drawn as a patch of
// the Poincaré disc that covers it. See that module's docstring for the
// construction; this file follows it step for step, and the conformance oracle
// holds the two to the same boards.
//
// In short: the surface's {7,3} map is read off its group, PSL(2,q), exactly
// (darts are group elements, faces the cosets of <xy>, vertices of <y>); the
// disc's ring walk covers it, and the covering map is a breadth-first walk on
// ids alone; the board draws the shells out to where every cell has a copy,
// each face showing the cell it covers (`Board.faces`), with the surface's own
// adjacency and topology (`Board.quotient`). Each surface is a mode of its own;
// Klein's quartic grows from difficulty to difficulty by subdividing its tiles
// (Goldberg--Coxeter GC(n, 0), `gcLoops`).
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
  dualFaces,
  hyperbolicTiling,
  isometry,
  lift,
  shellGroups,
  toOrigin,
  wythoffLoops,
  WYTHOFF_OPS,
  type C,
  type V3,
  type WythoffOp,
  type WythoffOrigin,
} from "./hyperbolic";

/** The surfaces, by name: the order of the field the group is PSL(2,q) over,
 * and the genus. Must match `HURWITZ_SURFACES`. */
export const HURWITZ_SURFACES: Record<string, readonly [number, number]> = {
  quartic: [7, 3],
  macbeath: [8, 7],
  triplet: [13, 14],
};

/** How far round the centre of the view the pan always has board to show for a
 * 6.6.7 patch, in hyperbolic distance (`DiscCover.view`): 3.0, 0.905 of the
 * disc. Farther out a tile is a few pixels across on a phone -- too small to
 * tap, and with the patch growing as e^d, most of what there is to draw. The
 * pan keeps the view's centre on the central tile and the patch reaches
 * `patchReach` from its centre, so every point this close to the view is drawn;
 * the renderer hides what lies farther out, which keeps the board's edge one
 * fixed circle however the view steps across the cover, and the board is
 * framed to that circle. Must match `COVER_VIEW` in hurwitz.py. */
export const COVER_VIEW = 3.0;

/** `COVER_VIEW` for tiling `op`: shorter by ln(n / sqrt(3)) for GC(n, 0),
 * whose tiles are that much smaller, so the cells hidden at the edge come out
 * the same size on screen. Mirrors `cover_view`. */
export function coverView(op: HurwitzOp): number {
  const n = gcOrder(op);
  return n !== null ? COVER_VIEW - Math.log(n / Math.sqrt(3)) : COVER_VIEW;
}

/** How far the view's centre can ever be from the patch's: the pan carries it
 * back onto the central {7,3} heptagon (`discRecentre`), so its circumradius,
 * acosh(cot(pi/7) cot(pi/3)). Mirrors `VIEW_SHIFT`. */
export const VIEW_SHIFT = Math.acosh(1 / (Math.tan(Math.PI / 7) * Math.tan(Math.PI / 3)));

/** How far from the centre the patch always reaches: the view, plus as far as
 * the view's centre can be from the patch's, plus the tiling's own tile
 * radius -- a tile whose centre is farther out cannot reach into the view.
 * Mirrors `patch_reach`. */
export function patchReach(op: HurwitzOp): number {
  return coverView(op) + VIEW_SHIFT + tileRadius(op);
}

const radiusCache = new Map<string, number>();

/** The farthest any tile's corner is from its own centre, in hyperbolic
 * distance, measured on the disc's first rings (the tiles are congruent by
 * type, so a few rings hold every kind). Mirrors `_tile_radius`. */
export function tileRadius(op: HurwitzOp): number {
  const hit = radiusCache.get(op);
  if (hit !== undefined) return hit;
  let loops: string[][];
  let where: Map<string, C>;
  let centres: C[];
  const n = gcOrder(op);
  if (n !== null) ({ loops, where, centres } = gcLoops(n, 3));
  else if (op === "none") {
    const t = hyperbolicTiling(7, 3, 3);
    loops = t.faces.map((face) => face.map(String));
    where = new Map([...t.pos].map(([v, z]) => [String(v), z]));
    centres = t.centres;
  } else ({ loops, where, centres } = wythoffLoops(7, 3, op as WythoffOp, 3));
  let far = 0;
  loops.forEach((loop, f) => {
    for (const k of loop) far = Math.max(far, 2 * Math.atanh(Math.hypot(...toOrigin(centres[f]!, where.get(k)!))));
  });
  radiusCache.set(op, far);
  return far;
}

/** How many device pixels a unit of the board's disc can be drawn as, at
 * most: the pan's worst case (a translation by `VIEW_SHIFT` magnifies by at
 * most e^VIEW_SHIFT) on a disc a thousand device pixels in radius -- a retina
 * desktop's at more than twice the fitted zoom, a phone's at three times.
 * Zoomed further still, a rim edge drawn straight is off by about a pixel,
 * under the gap between two tiles. The web port's alone: the pygame game
 * draws a static disc, every edge at full curve. */
const DRAWN_SCALE = Math.exp(VIEW_SHIFT) * 1000;

/**
 * How many segments draw the edge from a to b: as many as its curve needs,
 * at most `most`. A geodesic of the disc is a circular arc, and its chord
 * misses it by the sagitta; k segments miss it by about the sagitta over k^2.
 * The patch's view never comes closer to an edge than `VIEW_SHIFT`, so how big
 * the edge can ever be shown is known, and an edge whose miss could never
 * reach half a pixel is drawn straight. That is nearly every edge out at the
 * rim, which is most of a patch -- and every corner a cell's outline carries
 * is another run of the cell's bevel, so it is most of what the renderer
 * draws.
 */
export function edgeSegments(a: C, b: C, most: number): number {
  const [m] = arcPoints(a, b, 2);
  const sag = Math.hypot(m![0] - (a[0] + b[0]) / 2, m![1] - (a[1] + b[1]) / 2) * DRAWN_SCALE;
  for (let k = 1; k < most; k++) if (sag / (k * k) <= 0.5) return k;
  return most;
}

/** What each surface is called, for the info window. */
export const HURWITZ_LABELS: Record<string, string> = {
  quartic: "Klein quartic",
  macbeath: "Macbeath surface",
  triplet: "First Hurwitz triplet",
};

/** The surface a closed hyperbolic board is drawn on, named and with its genus
 * -- read off the board's own topology, since the surface is the board's size
 * rather than its mode. Null for a genus no surface here has. */
export function hurwitzSurfaceLabel(euler: number): string | null {
  const genus = 1 - euler / 2;
  const name = Object.entries(HURWITZ_SURFACES).find(([, [, g]]) => g === genus)?.[0];
  return name ? `${HURWITZ_LABELS[name]}, genus ${genus}` : null;
}

/** `"none"` is {7,3} itself, then its Wythoff tilings, then its
 * Goldberg--Coxeter subdivisions GC(n, 0) (`gcLoops`). Must match
 * `HURWITZ_OPS`. */
export const HURWITZ_OPS = ["none", ...WYTHOFF_OPS, "gc2", "gc3", "gc4"] as const;
export type HurwitzOp = (typeof HURWITZ_OPS)[number];

/** Each surface's mode: one surface a mode, whatever the difficulty. Must
 * match `SURFACE_MODES`. */
export const SURFACE_MODES: Record<string, string> = {
  quartic: "quartic",
  macbeath: "macbeath667",
  triplet: "triplet667",
};

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

const mapCache = new Map<string, number[][]>();

/** The surface's {7,3} map: each face as its seven vertex ids in order,
 * numbered in the order of the first element of their coset. Mirrors
 * `hurwitz_map`. */
export function hurwitzMap(surface: string): number[][] {
  const hit = mapCache.get(surface);
  if (hit) return hit;
  const spec = HURWITZ_SURFACES[surface];
  if (!spec) throw new Error(`unknown Hurwitz surface ${surface}`);
  const { elements, times, x, y } = hurwitzGroup(spec[0]);
  const turn = times(x, y);
  const cosets = (generator: number, n: number): Map<number, number> => {
    const out = new Map<number, number>();
    let k = 0;
    for (const g of elements) {
      if (out.has(g)) continue;
      let h = g;
      for (let i = 0; i < n; i++) {
        out.set(h, k);
        h = times(h, generator);
      }
      k++;
    }
    return out;
  };
  const faceOf = cosets(turn, 7);
  const vertexOf = cosets(y, 3);
  const faces: number[][] = [];
  for (const g of elements) {
    const f = faceOf.get(g)!;
    if (faces[f]) continue;
    const corners: number[] = [];
    let h = g;
    for (let i = 0; i < 7; i++) {
      corners.push(vertexOf.get(h)!);
      h = times(h, turn);
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
  for (const face of faces) {
    for (let i = 0; i < 7; i++) {
      const u = face[(i + 6) % 7]!;
      const v = face[i]!;
      const w = face[(i + 1) % 7]!;
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

/** The edges of a map of heptagons, each directed edge -> (face, corner). */
function across(faces: readonly (readonly number[])[]): Map<string, readonly [number, number]> {
  const out = new Map<string, readonly [number, number]>();
  faces.forEach((face, f) => {
    for (let i = 0; i < 7; i++) out.set(`${face[i]}>${face[(i + 1) % 7]}`, [f, i]);
  });
  return out;
}

/**
 * The walk that carries one map of heptagons onto another: `from`'s face 0
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
  const target = across(to);
  const source = new Map<string, number>();
  from.forEach((f, i) => {
    for (let k = 0; k < 7; k++) source.set(`${f[k]}>${f[(k + 1) % 7]}`, i);
  });
  const vertexMap = new Map<number, number>();
  from[0]!.forEach((v, i) => vertexMap.set(v, to[face]![(offset + i) % 7]!));
  const faceMap = new Map<number, number>([[0, face]]);
  const stack = [0];
  while (stack.length) {
    const f = stack.pop()!;
    const corners = from[f]!;
    for (let i = 0; i < 7; i++) {
      const a = corners[i]!;
      const b = corners[(i + 1) % 7]!;
      const g = source.get(`${b}>${a}`);
      if (g === undefined || faceMap.has(g)) continue;
      const [h, k] = target.get(`${vertexMap.get(b)}>${vertexMap.get(a)}`)!;
      const start = from[g]!.indexOf(b);
      for (let s = 0; s < 7; s++) {
        const v = from[g]![(start + s) % 7]!;
        const w = to[h]![(k + s) % 7]!;
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

/** The covering map from the {7,3} disc out to `rings` rings onto the surface.
 * Mirrors `_cover`. */
function cover(surface: string, rings: number): Cover {
  const cacheKey = `${surface},${rings}`;
  const hit = coverCache.get(cacheKey);
  if (hit) return hit;
  const base = hyperbolicTiling(7, 3, rings).faces;
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
// triangles dual to {7,3} cut into n * n small ones, and the dual taken again
// -- a heptagon round every heptagon's centre, hexagons everywhere else. A
// point of the cut is named by its weights over its triangle's corners (the
// ring walk's faces), `face:weight` pairs sorted and joined by `;`; a small
// triangle by its three points, sorted and joined by `|`.

interface GcLoops {
  loops: string[][];
  where: Map<string, C>;
  centres: C[];
  origins: string[];
}

const gcCache = new Map<string, GcLoops>();

/** A point's name from its (face, weight) pairs, zero weights dropped. */
function pointKey(pairs: [number, number][]): string {
  return pairs
    .filter(([, w]) => w > 0)
    .sort((a, b) => a[0] - b[0] || a[1] - b[1])
    .map(([f, w]) => `${f}:${w}`)
    .join(";");
}

/** GC(n, 0) of the {7,3} disc out to `rings` rings: each cell as the loop of
 * the small triangles round its point, counterclockwise, their positions, each
 * cell's centre (its point) and its point's key. Mirrors `gc_loops`. */
export function gcLoops(n: number, rings: number): GcLoops {
  const cacheKey = `${n},${rings}`;
  const hit = gcCache.get(cacheKey);
  if (hit) return hit;
  if (n < 2) throw new Error("a subdivision needs n of at least 2");
  const { centres } = hyperbolicTiling(7, 3, rings);
  const triangles = dualFaces(7, rings - 1).faces; // corners: faces of the tiling above
  const lifted = centres.map(lift);
  const blend = (points: readonly V3[], weights: readonly number[]): C =>
    drop([0, 1, 2].map((axis) => points.reduce((sum, p, i) => sum + weights[i]! * p[axis]!, 0)) as unknown as V3);
  const pointAt = new Map<string, C>();
  const around = new Map<string, string[]>();
  const where = new Map<string, C>();
  const order: string[] = [];
  for (const corners of triangles) {
    const point = (a: number, b: number): string => {
      const weights = [n - a - b, a, b];
      const key = pointKey(corners.map((f, i) => [f, weights[i]!] as [number, number]));
      if (!pointAt.has(key)) {
        pointAt.set(key, blend(corners.map((f) => lifted[f]!), weights));
        order.push(key);
      }
      return key;
    };
    const smalls: string[][] = [];
    for (let a = 0; a < n; a++) {
      for (let b = 0; b < n - a; b++) {
        smalls.push([point(a, b), point(a + 1, b), point(a, b + 1)]);
        if (a + b <= n - 2) smalls.push([point(a + 1, b), point(a + 1, b + 1), point(a, b + 1)]);
      }
    }
    for (const tri of smalls) {
      const key = [...tri].sort().join("|");
      if (where.has(key)) continue;
      where.set(key, blend(tri.map((k) => lift(pointAt.get(k)!)), [1, 1, 1]));
      for (const k of tri) {
        const list = around.get(k);
        if (list) list.push(key);
        else around.set(k, [key]);
      }
    }
  }
  const out: GcLoops = { loops: [], where, centres: [], origins: [] };
  for (const key of order) {
    const tris = around.get(key)!;
    if (tris.length !== (key.includes(";") ? 6 : 7)) continue; // a triangle round it was not built
    const z = pointAt.get(key)!;
    const angle = (t: string) => {
      const w = toOrigin(z, where.get(t)!);
      return Math.atan2(w[1], w[0]);
    };
    out.loops.push([...tris].sort((s, t) => angle(s) - angle(t)));
    out.centres.push(z);
    out.origins.push(key);
  }
  gcCache.set(cacheKey, out);
  return out;
}

/** GC(n, 0) of {7,3} on its own, in the disc -- no surface, no cover --
 * trimmed to the cells at the `shells` smallest distances from the centre: a
 * picture of the subdivided tiling for a menu card, which the board itself is
 * too costly to build for. */
export function gcDisc(n: number, shells: number, scale: number): Board {
  for (let rings = 2; rings <= 8; rings++) {
    const g = gcLoops(n, rings);
    const groups = shellGroups(g.centres);
    if (groups.length <= shells) continue;
    const base = hyperbolicTiling(7, 3, rings);
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
      mineCount: 0,
      width: size,
      height: size,
      cornerMask: drawing.cornerMask,
      curved: true,
      regularTiles: true,
    });
  }
  throw new Error("too many shells");
}

/** A point's key carried down to the surface: each face through the covering
 * map, re-sorted. */
function pointDown(key: string, faceOf: (f: number) => number): string {
  return pointKey(
    key.split(";").map((pair) => {
      const [f, w] = pair.split(":").map(Number);
      return [faceOf(f!), w!] as [number, number];
    }),
  );
}

/** The disc out to `rings` rings in tiling `op`, and how it covers the
 * surface. Mirrors `_patch`. */
function patch(surface: string, op: HurwitzOp, rings: number): Patch {
  const { phiFace, phi } = cover(surface, rings);
  const n = gcOrder(op);
  if (n !== null) {
    const g = gcLoops(n, rings);
    const down = (k: string) => pointDown(k, (f) => phiFace[f]!);
    return {
      loops: g.loops,
      where: g.where,
      centres: g.centres,
      cells: g.origins.map((o) => `G,${down(o)}`),
      key: (k) => k.split("|").map(down).sort().join("|"),
    };
  }
  if (op === "none") {
    const t = hyperbolicTiling(7, 3, rings);
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
  const w = wythoffLoops(7, 3, op as WythoffOp, rings);
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

const cellsCache = new Map<string, Map<string, string[]>>();

/** The surface's cells in tiling `op`, each as its corners' surface vertex ids
 * in order. Mirrors `hurwitz_cells`. */
export function hurwitzCells(surface: string, op: HurwitzOp): Map<string, string[]> {
  const cacheKey = `${surface},${op}`;
  const hit = cellsCache.get(cacheKey);
  if (hit) return hit;
  if (!HURWITZ_OPS.includes(op)) throw new Error(`unknown tiling ${op}`);
  const faces = hurwitzMap(surface);
  const vertices = new Set(faces.flat()).size;
  const edges = (7 * faces.length) / 2;
  const n = gcOrder(op);
  const want =
    faces.length +
    (n !== null
      ? edges * (n - 1) + (vertices * (n - 1) * (n - 2)) / 2
      : { none: 0, ambo: vertices, zip: vertices, expand: vertices + edges, bevel: vertices + edges }[
          op as "none" | WythoffOp
        ]);
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
    const far = patchReach(op);
    const near = groups.filter((group) => distance(p.centres[group[0]!]!) <= far).length;
    const keep = Math.max(reach, near) + margin;
    if (groups.length <= keep) continue;
    const base = hyperbolicTiling(7, 3, rings);
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
 * One step per tile round the central heptagon of the {7,3} disc: the
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
  const t = hyperbolicTiling(7, 3, rings);
  const { phiFace, phi } = cover(surface, rings);
  const centre = centralPolygon(7, 3);
  const surfaceFaces = hurwitzMap(surface);
  const surfaceCells = hurwitzCells(surface, op);
  const steps: DiscCover["steps"][number][] = [];
  const disc = new Map<string, number>();
  t.faces.forEach((face, f) => {
    for (let i = 0; i < 7; i++) disc.set(`${face[i]}>${face[(i + 1) % 7]}`, f);
  });
  const central = t.faces[0]!;
  for (let k = 0; k < 7; k++) {
    // the tile across the central heptagon's edge k, its corners lined up so
    // that the central corner k + 1 lands on the corner the two tiles share
    const a = central[k]!;
    const b = central[(k + 1) % 7]!;
    const g = disc.get(`${b}>${a}`)!;
    const neighbour = t.faces[g]!;
    const j = (neighbour.indexOf(b) - (k + 1) + 14) % 7;
    const map = isometry(
      centre[0]!,
      centre[1]!,
      t.pos.get(neighbour[j]!)!,
      t.pos.get(neighbour[(j + 1) % 7]!)!,
    );
    const back = isometry(
      t.pos.get(neighbour[j]!)!,
      t.pos.get(neighbour[(j + 1) % 7]!)!,
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
      const [kind, ...ids] = key.split(",");
      if (kind === "F") return `F,${faceMap.get(Number(ids[0]))}`;
      if (kind === "V") return `V,${vertexMap.get(Number(ids[0]))}`;
      if (kind === "G") return `G,${pointDown(ids[0]!, (f) => faceMap.get(f)!)}`;
      const [u, v] = ids.map((x) => vertexMap.get(Number(x))!).sort((s, r) => s - r);
      return `E,${u},${v}`;
    };
    const cells = new Map<CellId, CellId>();
    for (const key of surfaceCells.keys()) cells.set(nameOf.get(key)!, nameOf.get(moved(key))!);
    steps.push({ c, rot, cells });
  }
  return { steps, view: coverView(op) };
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
  mineCount: number,
  scale = 300,
  arc = ARC_SEGMENTS,
): Board {
  if (margin < 0) throw new Error("margin must not be negative");
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
    (a, b) => edgeSegments(a, b, arc),
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
  // board does. The patch's polygons run on past the frame, hidden.
  const shown = Math.tanh(coverView(op) / 2);
  const shift = (shown - extent) * scale;
  for (const poly of polygons.values()) {
    for (const p of poly) {
      p[0] += shift;
      p[1] += shift;
    }
  }
  const size = 2 * shown * scale;
  // Faces the pan can never bring into the view: farther from the centre than
  // the view's reach plus the most its centre strays plus a tile. They stay
  // on the board -- every cell has a copy, which the pygame game and the cell
  // names need -- but the renderer builds nothing for them.
  const reach = patchReach(op);
  const unseen = new Set<CellId>();
  drawn.forEach((f, face) => {
    if (distance(p.centres[f]!) > reach) unseen.add(cid(face));
  });
  const board = flatBoard({
    mode: SURFACE_MODES[surface]!,
    polygons,
    adjacency,
    mineCount,
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

/** The patch's own point group (the central heptagon's turns and mirrors),
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
