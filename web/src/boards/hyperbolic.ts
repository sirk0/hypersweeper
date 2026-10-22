// Port of minesweeper/boards/hyperbolic.py: the regular {p,q} tilings of the
// hyperbolic plane, drawn in the Poincaré disc. See that module's docstring
// for the construction; this file follows it step for step, and the
// conformance oracle (data/conformance.json) holds the two to the same boards.
//
// In short: the tiling is built combinatorially, ring by ring, with integer
// vertex ids (no coordinate is ever read back into an id); positions come
// afterwards, each face placed by the disc isometry taking the central
// polygon's matching edge onto an edge already placed; edges are drawn as
// geodesic arcs through points whose ids derive from the edge's own ends; and
// the board keeps the faces at the `shells` smallest hyperbolic distances from
// the centre, so every trim keeps the central polygon's dihedral symmetry --
// less every rim cell that trim leaves with a twin or a near-twin.
import { flatBoard, sharedVertexAdjacency, cid } from "./core";
import type { Board, CellId, Vertex } from "./core";

/** Points per edge for drawing the geodesic arcs. Must match ARC_SEGMENTS. */
export const ARC_SEGMENTS = 3;

/** Face centres closer than this in distance are one shell. Must match
 * `_SHELL_TOL`. */
const SHELL_TOL = 1e-7;

// -- complex arithmetic -------------------------------------------------------

type C = readonly [number, number];

const add = (a: C, b: C): C => [a[0] + b[0], a[1] + b[1]];
const sub = (a: C, b: C): C => [a[0] - b[0], a[1] - b[1]];
const mul = (a: C, b: C): C => [a[0] * b[0] - a[1] * b[1], a[0] * b[1] + a[1] * b[0]];
const conj = (a: C): C => [a[0], -a[1]];
const abs = (a: C): number => Math.hypot(a[0], a[1]);
function div(a: C, b: C): C {
  const d = b[0] * b[0] + b[1] * b[1];
  return [(a[0] * b[0] + a[1] * b[1]) / d, (a[1] * b[0] - a[0] * b[1]) / d];
}
const scaleC = (a: C, k: number): C => [a[0] * k, a[1] * k];
const ONE: C = [1, 0];

function checkHyperbolic(p: number, q: number): void {
  if (p < 3 || q < 3 || (p - 2) * (q - 2) <= 4) {
    throw new Error(`{${p},${q}} is not a hyperbolic tiling`);
  }
}

/** The {p,q} tiling's faces out to `rings` rings round the central one, as
 * counterclockwise lists of integer vertex ids, and each face's ring. Mirrors
 * `hyperbolic_faces`. */
export function hyperbolicFaces(
  p: number,
  q: number,
  rings: number,
): { faces: number[][]; ringOf: number[] } {
  checkHyperbolic(p, q);
  const faces: number[][] = [Array.from({ length: p }, (_, i) => i)];
  const ringOf = [0];
  const count = new Map<number, number>();
  for (let i = 0; i < p; i++) count.set(i, 1);
  let boundary = Array.from({ length: p }, (_, i) => i);
  let nextId = p;
  const fresh = (): number => nextId++;

  for (let ring = 1; ring <= rings; ring++) {
    let need = boundary.map((v) => q - count.get(v)!);
    if (Math.min(...need) < 1) throw new Error("boundary vertex already closed");
    // Start the walk at an anchor so the runs between anchors never wrap.
    const start = need.findIndex((d) => d >= 2);
    if (start < 0) throw new Error("no anchor on the boundary");
    boundary = [...boundary.slice(start), ...boundary.slice(0, start)];
    need = [...need.slice(start), ...need.slice(0, start)];
    const n = boundary.length;
    const anchors: number[] = [];
    for (let i = 0; i < n; i++) if (need[i]! >= 2) anchors.push(i);
    const spokes = new Map<number, number[]>();
    for (const i of anchors) {
      spokes.set(i, Array.from({ length: need[i]! - 1 }, fresh));
    }
    const newBoundary: number[] = [];
    const first = faces.length;
    anchors.forEach((i, a) => {
      const v = boundary[i]!;
      const tips = spokes.get(i)!;
      // the faces touching the boundary at v alone, between its spokes
      for (let t = 0; t < tips.length - 1; t++) {
        const inner = Array.from({ length: p - 3 }, fresh);
        faces.push([v, tips[t]!, ...inner, tips[t + 1]!]);
        ringOf.push(ring);
        newBoundary.push(tips[t]!, ...inner);
      }
      // the face along the run of boundary from this anchor to the next
      const j = anchors[(a + 1) % anchors.length]!;
      const end = j > i ? j : j + n;
      const run: number[] = [];
      for (let k = i; k <= end; k++) run.push(boundary[k % n]!);
      const gap = p - run.length - 2;
      if (gap < 0) throw new Error(`{${p},${q}}: a face cannot span its boundary run`);
      const inner = Array.from({ length: gap }, fresh);
      faces.push([...run.reverse(), tips[tips.length - 1]!, ...inner, spokes.get(j)![0]!]);
      ringOf.push(ring);
      newBoundary.push(tips[tips.length - 1]!, ...inner);
    });
    // every old boundary vertex is now interior; count the new faces
    for (const face of faces.slice(first)) {
      for (const v of face) count.set(v, (count.get(v) ?? 0) + 1);
    }
    boundary = newBoundary;
  }
  return { faces, ringOf };
}

// -- the Poincaré disc --------------------------------------------------------

function centralPolygon(p: number, q: number): C[] {
  const bigR = Math.acosh(1 / (Math.tan(Math.PI / p) * Math.tan(Math.PI / q)));
  const r = Math.tanh(bigR / 2);
  return Array.from({ length: p }, (_, k) => {
    const t = Math.PI / 2 + Math.PI / p + (2 * Math.PI * k) / p;
    return [r * Math.cos(t), r * Math.sin(t)] as C;
  });
}

/** z -> (z - a) / (1 - conj(a) z), taking a to 0. */
const toOrigin = (a: C, z: C): C => div(sub(z, a), sub(ONE, mul(conj(a), z)));
/** Its inverse, taking 0 to a. */
const fromOrigin = (a: C, z: C): C => div(add(z, a), add(ONE, mul(conj(a), z)));

/** The orientation-preserving disc isometry taking a -> a2 and b -> b2. */
function isometry(a: C, b: C, a2: C, b2: C): (z: C) => C {
  const w = toOrigin(a, b);
  const w2 = toOrigin(a2, b2);
  const turn = div(scaleC(w2, 1 / abs(w2)), scaleC(w, 1 / abs(w)));
  return (z) => fromOrigin(a2, mul(turn, toOrigin(a, z)));
}

/** Every vertex's point in the disc, placed face by face. Mirrors
 * `hyperbolic_positions`. */
export function hyperbolicPositions(p: number, q: number, faces: number[][]): Map<number, C> {
  const centre = centralPolygon(p, q);
  const pos = new Map<number, C>();
  faces[0]!.forEach((v, i) => pos.set(v, centre[i]!));
  let pending = faces.map((_, f) => f).slice(1);
  while (pending.length) {
    const deferred: number[] = [];
    for (const f of pending) {
      const face = faces[f]!;
      let k = -1;
      for (let i = 0; i < p; i++) {
        if (pos.has(face[i]!) && pos.has(face[(i + 1) % p]!)) {
          k = i;
          break;
        }
      }
      if (k < 0) {
        deferred.push(f);
        continue;
      }
      const m = isometry(
        centre[k]!,
        centre[(k + 1) % p]!,
        pos.get(face[k]!)!,
        pos.get(face[(k + 1) % p]!)!,
      );
      face.forEach((v, i) => {
        if (!pos.has(v)) pos.set(v, m(centre[i]!));
      });
    }
    if (deferred.length === pending.length) throw new Error("faces cannot be placed");
    pending = deferred;
  }
  return pos;
}

function faceCentre(centre: C[], face: number[], pos: Map<number, C>): C {
  return isometry(centre[0]!, centre[1]!, pos.get(face[0]!)!, pos.get(face[1]!)!)([0, 0]);
}

const distance = (z: C): number => 2 * Math.atanh(abs(z));

function arcPoints(a: C, b: C, segments: number): C[] {
  const w = toOrigin(a, b);
  const length = Math.atanh(abs(w));
  const unit = scaleC(w, 1 / abs(w));
  const out: C[] = [];
  for (let s = 1; s < segments; s++) {
    out.push(fromOrigin(a, scaleC(unit, Math.tanh((length * s) / segments))));
  }
  return out;
}

function shellsOf(centre: C[], faces: number[][], pos: Map<number, C>): number[][] {
  const rows = faces
    .map((face, f) => [distance(faceCentre(centre, face, pos)), f] as const)
    .sort((x, y) => x[0] - y[0] || x[1] - y[1]);
  const groups: number[][] = [];
  let last = -Infinity;
  for (const [d, f] of rows) {
    if (d - last > SHELL_TOL) groups.push([]);
    groups[groups.length - 1]!.push(f);
    last = d;
  }
  return groups;
}

function ringsFor(
  p: number,
  q: number,
  shells: number,
): { faces: number[][]; pos: Map<number, C>; groups: number[][] } {
  const centre = centralPolygon(p, q);
  for (let rings = 1; rings <= 12; rings++) {
    const { faces, ringOf } = hyperbolicFaces(p, q, rings);
    const pos = hyperbolicPositions(p, q, faces);
    const groups = shellsOf(centre, faces, pos);
    let outer = Infinity;
    faces.forEach((face, f) => {
      if (ringOf[f] === rings) outer = Math.min(outer, distance(faceCentre(centre, face, pos)));
    });
    if (groups.length > shells) {
      const cut = distance(faceCentre(centre, faces[groups[shells - 1]![0]!]!, pos));
      if (outer > cut + 1.0) return { faces, pos, groups };
    }
  }
  throw new Error("too many shells");
}

/**
 * `kept` less every face whose closed neighbourhood (itself and every face
 * sharing a vertex with it) is another kept face's too, or another kept face's
 * less one cell, repeated until none is left. All of a twin class goes, never
 * all but one, which keeps the trim's symmetry; of a near-twin pair, the
 * smaller. Mirrors `_without_twins` -- see "A trim then drops its twins" in
 * that module's docstring.
 */
function withoutTwins(faces: readonly (readonly number[])[], kept: number[]): number[] {
  for (;;) {
    const at = new Map<number, number[]>();
    for (const f of kept) {
      for (const v of faces[f]!) {
        const star = at.get(v);
        if (star) star.push(f);
        else at.set(v, [f]);
      }
    }
    const hood = new Map<number, Set<number>>();
    const key = new Map<number, string>();
    for (const f of kept) {
      const near = new Set<number>();
      for (const v of faces[f]!) for (const g of at.get(v)!) near.add(g);
      hood.set(f, near);
      key.set(f, [...near].sort((a, b) => a - b).join(","));
    }
    const seen = new Map<string, number>();
    for (const h of key.values()) seen.set(h, (seen.get(h) ?? 0) + 1);
    const twins = new Set(kept.filter((f) => seen.get(key.get(f)!)! > 1));
    // a near-twin's bigger partner is in its own neighbourhood
    for (const f of kept) {
      const mine = hood.get(f)!;
      for (const g of mine) {
        const theirs = hood.get(g)!;
        if (theirs.size === mine.size + 1 && [...mine].every((x) => theirs.has(x))) {
          twins.add(f);
          break;
        }
      }
    }
    if (twins.size === 0) return kept;
    kept = kept.filter((f) => !twins.has(f));
  }
}

/** Connected, Euler characteristic 1 and one boundary circle, on ids alone. */
function isDisc(cells: Map<CellId, string[]>): boolean {
  const edges = new Map<string, [string, string, number]>();
  const vertices = new Set<string>();
  for (const ids of cells.values()) {
    ids.forEach((a, i) => {
      vertices.add(a);
      const b = ids[(i + 1) % ids.length]!;
      const key = a < b ? `${a}|${b}` : `${b}|${a}`;
      const e = edges.get(key);
      if (e) e[2]++;
      else edges.set(key, [a, b, 1]);
    });
  }
  if (vertices.size - edges.size + cells.size !== 1) return false;
  const rim = new Map<string, string[]>();
  for (const [a, b, n] of edges.values()) {
    if (n !== 1) continue;
    rim.set(a, [...(rim.get(a) ?? []), b]);
    rim.set(b, [...(rim.get(b) ?? []), a]);
  }
  for (const v of rim.values()) if (v.length !== 2) return false;
  const start = rim.keys().next().value!;
  const seen = new Set([start]);
  const stack = [start];
  while (stack.length) {
    for (const nxt of rim.get(stack.pop()!)!) {
      if (!seen.has(nxt)) {
        seen.add(nxt);
        stack.push(nxt);
      }
    }
  }
  return seen.size === rim.size;
}

/**
 * The {p,q} tiling in the Poincaré disc, trimmed to the faces at the `shells`
 * smallest distances from the central p-gon (shell 1 is that p-gon alone),
 * less any rim cells that trim leaves with a twin or a near-twin. `scale` is pixels per unit of disc radius; `arc` is how many straight
 * segments draw each geodesic edge. Throws when the trim is not a disc. Mirrors
 * `hyperbolic_board`.
 */
export function hyperbolicBoard(
  p: number,
  q: number,
  shells: number,
  mineCount: number,
  scale = 300,
  arc = ARC_SEGMENTS,
): Board {
  checkHyperbolic(p, q);
  if (shells < 1) throw new Error("shells must be at least 1");
  const { faces, pos, groups } = ringsFor(p, q, shells);
  const kept = withoutTwins(
    faces,
    groups
      .slice(0, shells)
      .flat()
      .sort((a, b) => a - b),
  );
  return discBoard(`hyperbolic${p}${q}`, `{${p},${q}}`, shells, faces, kept, pos, mineCount, scale, arc);
}

/** The kept faces as a board in the disc, each edge drawn as its geodesic arc
 * and the board centred on the disc's own centre. Shared by the regular {p,q}
 * boards and the uniform ones below. Mirrors `_disc_board`. */
function discBoard(
  mode: string,
  name: string,
  shells: number,
  faces: readonly (readonly number[])[],
  kept: number[],
  pos: Map<number, C>,
  mineCount: number,
  scale: number,
  arc: number,
): Board {
  // Arc points along each edge: ids built from the edge's end ids (the lower
  // first), positions computed once per edge from its lower end, so both faces
  // of an edge share the very same points.
  const points = new Map<string, C>();
  for (const [v, z] of pos) points.set(String(v), z);
  const cells = new Map<CellId, string[]>();
  const cornerMask = new Map<CellId, boolean[]>();
  for (const f of kept) {
    const face = faces[f]!;
    const ids: string[] = [];
    const corner: boolean[] = [];
    face.forEach((a, i) => {
      const b = face[(i + 1) % face.length]!;
      ids.push(String(a));
      corner.push(true);
      const lo = Math.min(a, b);
      const hi = Math.max(a, b);
      if (!points.has(`${lo}:${hi}:1`)) {
        arcPoints(pos.get(lo)!, pos.get(hi)!, arc).forEach((z, s) =>
          points.set(`${lo}:${hi}:${s + 1}`, z),
        );
      }
      for (let t = 1; t < arc; t++) {
        const s = a === lo ? t : arc - t;
        ids.push(`${lo}:${hi}:${s}`);
        corner.push(false);
      }
    });
    cells.set(cid(f), ids);
    cornerMask.set(cid(f), corner);
  }
  if (!isDisc(cells)) throw new Error(`${name} trimmed to ${shells} shells is not a disc`);

  // Centred on the disc's own centre, so the central p-gon sits in the middle
  // of the board whatever the trim.
  let extent = 0;
  for (const ids of cells.values()) {
    for (const k of ids) extent = Math.max(extent, abs(points.get(k)!));
  }
  const polygons = new Map<CellId, Vertex[]>();
  for (const [cell, ids] of cells) {
    polygons.set(
      cell,
      ids.map((k) => {
        const [x, y] = points.get(k)!;
        return [(x + extent) * scale, (y + extent) * scale] as Vertex;
      }),
    );
  }
  const size = 2 * extent * scale;
  // How far out the board is whole: the nearest point of its outline (every
  // point on an edge only one cell has) to the centre. The outer shell is
  // ragged by about a cell, so this is well inside `extent` -- and it is what
  // bounds the pan, the board being solid within it.
  const sides = new Map<string, number>();
  for (const ids of cells.values()) {
    ids.forEach((a, i) => {
      const b = ids[(i + 1) % ids.length]!;
      const key = a < b ? `${a}|${b}` : `${b}|${a}`;
      sides.set(key, (sides.get(key) ?? 0) + 1);
    });
  }
  let rim = Infinity;
  for (const [key, n] of sides) {
    if (n !== 1) continue;
    for (const k of key.split("|")) rim = Math.min(rim, abs(points.get(k)!));
  }
  return flatBoard({
    mode,
    polygons,
    adjacency: sharedVertexAdjacency(cells),
    mineCount,
    width: size,
    height: size,
    cornerMask,
    curved: true,
    regularTiles: true,
    disc: { cx: extent * scale, cy: extent * scale, radius: scale, rim },
  });
}

// -- the uniform tilings: Wythoff's construction on {p,q} ---------------------
//
// Port of the section of the same name in hyperbolic.py, which says why: a
// generating point in one flag triangle (face centre F, corner V, edge
// midpoint E) reflected everywhere, its place deciding the tiling --
// `ambo` 3.7.3.7, `zip` 6.6.7 (the hyperbolic soccer ball), `expand` 3.4.7.4,
// `bevel` 4.6.14 on {7,3}. New vertices are named by the part of their flag
// the op does not collapse, as tuples of the ring walk's integer ids, and
// renumbered in the order the faces meet them.

/** Must match `WYTHOFF_OPS`. */
export const WYTHOFF_OPS = ["ambo", "zip", "expand", "bevel"] as const;
export type WythoffOp = (typeof WYTHOFF_OPS)[number];

/** The faces round a vertex, smallest first as the notation writes them.
 * Mirrors `_vertex_config`. */
function vertexConfig(p: number, q: number, op: WythoffOp): number[] {
  const ring = {
    ambo: [p, q, p, q],
    zip: [2 * q, 2 * q, p],
    expand: [p, 4, q, 4],
    bevel: [4, 2 * q, 2 * p],
  }[op];
  const turns = ring.map((_, i) => [...ring.slice(i), ...ring.slice(0, i)]);
  const all = [...turns, ...turns.map((t) => [...t].reverse())];
  const less = (a: number[], b: number[]): boolean => {
    for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return a[i]! < b[i]!;
    return false;
  };
  return all.reduce((best, t) => (less(t, best) ? t : best));
}

/** The mode name: `hyperbolic` and the vertex configuration's digits. Mirrors
 * `wythoff_mode`. */
export function wythoffMode(p: number, q: number, op: WythoffOp): string {
  return `hyperbolic${vertexConfig(p, q, op).join("")}`;
}

type V3 = readonly [number, number, number];

/** A disc point on the hyperboloid t^2 - x^2 - y^2 = 1. */
function lift(z: C): V3 {
  const r2 = z[0] * z[0] + z[1] * z[1];
  const s = 1 - r2;
  return [(1 + r2) / s, (2 * z[0]) / s, (2 * z[1]) / s];
}

/** A timelike vector back to the disc, normalised and on the upper sheet. */
function drop(v: V3): C {
  const [t, x, y] = v;
  let norm = Math.sqrt(t * t - x * x - y * y);
  if (t < 0) norm = -norm;
  const d = 1 + t / norm;
  return [x / norm / d, y / norm / d];
}

/** A vector Minkowski-orthogonal to both a and b. */
function minkCross(a: V3, b: V3): V3 {
  return [
    -(a[1] * b[2] - a[2] * b[1]),
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0],
  ];
}

const minus = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];

/** The geodesic through a and b as its unit normal, signed so `inside` is on
 * its positive side. */
function line(a: C, b: C, inside: C): V3 {
  const n = minkCross(lift(a), lift(b));
  let length = Math.sqrt(n[1] * n[1] + n[2] * n[2] - n[0] * n[0]);
  const x = lift(inside);
  if (-n[0] * x[0] + n[1] * x[1] + n[2] * x[2] < 0) length = -length;
  return [n[0] / length, n[1] / length, n[2] / length];
}

/** The midpoint of the central p-gon's edge from corner 0 to corner 1. */
function edgeMidpoint(p: number, q: number): C {
  const inR = Math.acosh(Math.cos(Math.PI / q) / Math.sin(Math.PI / p));
  const t = Math.PI / 2 + (2 * Math.PI) / p;
  const r = Math.tanh(inR / 2);
  return [r * Math.cos(t), r * Math.sin(t)];
}

/** The generating point in the central p-gon's flag triangle at corner 0 and
 * the edge from corner 0 to corner 1. Mirrors `_generating_point`. */
function generatingPoint(p: number, q: number, op: WythoffOp): C {
  const mid = edgeMidpoint(p, q);
  if (op === "ambo") return mid;
  const corner = centralPolygon(p, q)[0]!;
  const inside = scaleC(add(corner, mid), 1 / 3);
  const fv = line([0, 0], corner, inside);
  const fe = line([0, 0], mid, inside);
  const ve = line(corner, mid, inside);
  if (op === "zip") return drop(minkCross(fe, minus(fv, ve)));
  if (op === "expand") return drop(minkCross(fv, minus(fe, ve)));
  return drop(minkCross(minus(fv, fe), minus(fe, ve)));
}

/** The uniform tiling `op` of {p,q}, from the {p,q} tiling out to `rings`
 * rings: its faces as counterclockwise lists of integer vertex ids, each
 * vertex's position, and each face's centre. Mirrors `wythoff_faces`. */
export function wythoffFaces(
  p: number,
  q: number,
  op: WythoffOp,
  rings: number,
): { faces: number[][]; pos: Map<number, C>; centres: C[] } {
  if (!WYTHOFF_OPS.includes(op)) throw new Error(`unknown Wythoff operation ${op}`);
  const base = hyperbolicFaces(p, q, rings).faces;
  const bpos = hyperbolicPositions(p, q, base);
  const centre = centralPolygon(p, q);
  const w0 = generatingPoint(p, q, op);
  const t = 2 * (Math.PI / 2 + (2 * Math.PI) / p);
  const w1 = mul([Math.cos(t), Math.sin(t)], conj(w0)); // its mirror across F-E
  const mid = edgeMidpoint(p, q);
  const turn = Array.from({ length: p }, (_, k): C => [
    Math.cos((2 * Math.PI * k) / p),
    Math.sin((2 * Math.PI * k) / p),
  ]);

  const key = (f: number, i: number, side: number): string => {
    // the flag at face f's corner i, on its edge to the next corner (side 0)
    // or from the previous one (side 1), named by what the op keeps
    const face = base[f]!;
    const v = face[i]!;
    const u = side === 0 ? face[(i + 1) % p]! : face[(i + p - 1) % p]!;
    const edge = `${Math.min(u, v)},${Math.max(u, v)}`;
    if (op === "ambo") return edge;
    if (op === "zip") return `${f},${edge}`;
    if (op === "expand") return `${f},${v}`;
    return `${f},${v},${u}`;
  };

  const maps = base.map((face) =>
    isometry(centre[0]!, centre[1]!, bpos.get(face[0]!)!, bpos.get(face[1]!)!),
  );
  const where = new Map<string, C>();
  const flag = (f: number, i: number, side: number): string => {
    const k = key(f, i, side);
    if (!where.has(k)) {
      const local = side === 0 ? mul(turn[i]!, w0) : mul(turn[(i + p - 1) % p]!, w1);
      where.set(k, maps[f]!(local));
    }
    return k;
  };
  const ringOf = (keys: string[]): string[] => {
    const out = keys.filter((k, j) => k !== keys[(j + keys.length - 1) % keys.length]);
    return new Set(out).size === out.length ? out : [];
  };

  const newFaces: string[][] = [];
  const centres: C[] = [];
  // F: one per face of {p,q}, its flags in order round it
  base.forEach((_, f) => {
    const keys: string[] = [];
    for (let i = 0; i < p; i++) keys.push(flag(f, i, 1), flag(f, i, 0));
    const loop = ringOf(keys);
    if (loop.length >= 3) {
      newFaces.push(loop);
      centres.push(maps[f]!([0, 0]));
    }
  });
  // V: one per vertex with its whole star, the faces round it counterclockwise
  const left = new Map<string, [number, number]>(); // directed edge -> (face, index)
  const star = new Map<number, [number, number][]>();
  base.forEach((face, f) => {
    face.forEach((v, i) => {
      left.set(`${v}>${face[(i + 1) % p]}`, [f, i]);
      const at = star.get(v);
      if (at) at.push([f, i]);
      else star.set(v, [[f, i]]);
    });
  });
  for (const v of [...star.keys()].sort((a, b) => a - b)) {
    const round = star.get(v)!;
    if (round.length !== q) continue;
    let [f, i] = round.reduce((a, b) => (b[0] < a[0] || (b[0] === a[0] && b[1] < a[1]) ? b : a));
    const keys: string[] = [];
    for (let n = 0; n < q; n++) {
      keys.push(flag(f, i, 0), flag(f, i, 1));
      [f, i] = left.get(`${v}>${base[f]![(i + p - 1) % p]}`)!;
    }
    const loop = ringOf(keys);
    if (loop.length >= 3) {
      newFaces.push(loop);
      centres.push(bpos.get(v)!);
    }
  }
  // E: one per edge with both its faces, round the edge's midpoint
  base.forEach((face, f) => {
    for (let i = 0; i < p; i++) {
      const u = face[i]!;
      const v = face[(i + 1) % p]!;
      const other = left.get(`${v}>${u}`);
      if (u > v || !other) continue;
      const [g, j] = other;
      const loop = ringOf([flag(g, (j + 1) % p, 1), flag(g, j, 0), flag(f, (i + 1) % p, 1), flag(f, i, 0)]);
      if (loop.length >= 3) {
        newFaces.push(loop);
        centres.push(maps[f]!(mul(turn[i]!, mid)));
      }
    }
  });
  const ids = new Map<string, number>();
  for (const loop of newFaces) for (const k of loop) if (!ids.has(k)) ids.set(k, ids.size);
  const faces = newFaces.map((loop) => loop.map((k) => ids.get(k)!));
  const pos = new Map<number, C>();
  for (const [k, id] of ids) pos.set(id, where.get(k)!);
  return { faces, pos, centres };
}

/** Face indices grouped by their centre's distance from the disc's centre,
 * nearest first. Mirrors `_shell_groups`. */
function shellGroups(centres: C[]): number[][] {
  const rows = centres
    .map((z, f) => [distance(z), f] as const)
    .sort((x, y) => x[0] - y[0] || x[1] - y[1]);
  const groups: number[][] = [];
  let last = -Infinity;
  for (const [d, f] of rows) {
    if (d - last > SHELL_TOL) groups.push([]);
    groups[groups.length - 1]!.push(f);
    last = d;
  }
  return groups;
}

/** Grow the {p,q} rings until every new face out to the `shells`-th distance
 * is built. Mirrors `_wythoff_rings_for`. */
function wythoffRingsFor(
  p: number,
  q: number,
  op: WythoffOp,
  shells: number,
): { faces: number[][]; pos: Map<number, C>; groups: number[][] } {
  const centre = centralPolygon(p, q);
  for (let rings = 1; rings <= 12; rings++) {
    const { faces, pos, centres } = wythoffFaces(p, q, op, rings);
    const groups = shellGroups(centres);
    const base = hyperbolicFaces(p, q, rings);
    const bpos = hyperbolicPositions(p, q, base.faces);
    let outer = Infinity;
    base.faces.forEach((face, f) => {
      if (base.ringOf[f] === rings) outer = Math.min(outer, distance(faceCentre(centre, face, bpos)));
    });
    if (groups.length > shells) {
      const cut = distance(centres[groups[shells - 1]![0]!]!);
      if (outer > cut + 1.0) return { faces, pos, groups };
    }
  }
  throw new Error("too many shells");
}

/**
 * The uniform tiling `op` of {p,q} in the Poincaré disc, trimmed as
 * `hyperbolicBoard` trims: the faces at the `shells` smallest distances from
 * the central face, less their twins. Mirrors `hyperbolic_uniform_board`.
 */
export function hyperbolicUniformBoard(
  p: number,
  q: number,
  op: WythoffOp,
  shells: number,
  mineCount: number,
  scale = 300,
  arc = ARC_SEGMENTS,
): Board {
  checkHyperbolic(p, q);
  if (shells < 1) throw new Error("shells must be at least 1");
  const { faces, pos, groups } = wythoffRingsFor(p, q, op, shells);
  const kept = withoutTwins(
    faces,
    groups
      .slice(0, shells)
      .flat()
      .sort((a, b) => a - b),
  );
  const name = vertexConfig(p, q, op).join(".");
  return discBoard(wythoffMode(p, q, op), name, shells, faces, kept, pos, mineCount, scale, arc);
}
