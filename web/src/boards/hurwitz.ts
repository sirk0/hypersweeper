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
// adjacency and topology (`Board.quotient`).
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
  centralPolygon,
  discDrawing,
  distance,
  hyperbolicTiling,
  isometry,
  shellGroups,
  vertexConfig,
  wythoffLoops,
  WYTHOFF_OPS,
  type C,
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

/** How far from the centre the patch always reaches, in hyperbolic distance:
 * past every face whose centre is this close, whatever the surface. Must match
 * `PATCH_REACH` in hurwitz.py, which says how it is reckoned. */
export const PATCH_REACH = 4.8;

/** How far round the centre of the view the pan always has board to show, in
 * hyperbolic distance (`DiscCover.view`). The pan keeps the view's centre on
 * the central tile, and the patch reaches `PATCH_REACH` from its centre, so
 * every point this close to the view is drawn; the renderer hides what lies
 * farther out, which keeps the board's edge one fixed circle however the view
 * steps across the cover. 3.6 is 0.95 of the disc's radius. */
export const COVER_VIEW = 3.6;

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

/** `"none"` is {7,3} itself; the rest are its Wythoff tilings. Must match
 * `HURWITZ_OPS`. */
export const HURWITZ_OPS = ["none", ...WYTHOFF_OPS] as const;
export type HurwitzOp = (typeof HURWITZ_OPS)[number];

/** The mode: `hurwitz` and the tiling's vertex configuration. Mirrors
 * `hurwitz_mode`. */
export function hurwitzMode(op: HurwitzOp): string {
  if (op === "none") return "hurwitz73";
  return "hurwitz" + vertexConfig(7, 3, op).join("");
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

/** The disc out to `rings` rings in tiling `op`, and how it covers the
 * surface. Mirrors `_patch`. */
function patch(surface: string, op: HurwitzOp, rings: number): Patch {
  const { phiFace, phi } = cover(surface, rings);
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
  const want =
    faces.length +
    { none: 0, ambo: vertices, zip: vertices, expand: vertices + edges, bevel: vertices + edges }[op];
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
 * the first to reach every cell or out to `PATCH_REACH`, whichever is farther,
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
    const near = groups.filter((group) => distance(p.centres[group[0]!]!) <= PATCH_REACH).length;
    const keep = Math.max(reach, near) + margin;
    if (groups.length <= keep) continue;
    const base = hyperbolicTiling(7, 3, rings);
    let outer = Infinity;
    base.centres.forEach((z, f) => {
      if (base.ringOf[f] === rings) outer = Math.min(outer, distance(z));
    });
    const cut = distance(p.centres[groups[keep - 1]![0]!]!);
    if (outer > cut + 1.0 && outer > PATCH_REACH + 1.0) {
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
      const [u, v] = ids.map((x) => vertexMap.get(Number(x))!).sort((s, r) => s - r);
      return `E,${u},${v}`;
    };
    const cells = new Map<CellId, CellId>();
    for (const key of surfaceCells.keys()) cells.set(nameOf.get(key)!, nameOf.get(moved(key))!);
    steps.push({ c, rot, cells });
  }
  return { steps, view: COVER_VIEW };
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
    arc,
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
  const size = 2 * extent * scale;
  const board = flatBoard({
    mode: hurwitzMode(op),
    polygons,
    adjacency,
    mineCount,
    width: size,
    height: size,
    cornerMask,
    curved: true,
    regularTiles: true,
    disc: { cx: extent * scale, cy: extent * scale, radius: scale, rim, cover: coverSteps_ },
    faces: faceCell,
    quotient,
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
