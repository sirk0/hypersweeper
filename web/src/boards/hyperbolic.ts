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
// the centre, so every trim keeps the central polygon's dihedral symmetry.
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
 * smallest distances from the central p-gon (shell 1 is that p-gon alone).
 * `scale` is pixels per unit of disc radius; `arc` is how many straight
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
  const kept = groups
    .slice(0, shells)
    .flat()
    .sort((a, b) => a - b);

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
  if (!isDisc(cells)) throw new Error(`{${p},${q}} trimmed to ${shells} shells is not a disc`);

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
  return flatBoard({
    mode: `hyperbolic${p}${q}`,
    polygons,
    adjacency: sharedVertexAdjacency(cells),
    mineCount,
    width: size,
    height: size,
    cornerMask,
    curved: true,
  });
}
