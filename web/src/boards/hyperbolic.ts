// Port of minesweeper/boards/hyperbolic.py: the regular {p,q} tilings of the
// hyperbolic plane, drawn in the Poincaré disc. See that module's docstring
// for the construction; this file follows it step for step, and the
// conformance oracle (data/conformance.json) holds the two to the same boards.
//
// In short: the tiling is built combinatorially, ring by ring, with integer
// vertex ids (no coordinate is ever read back into an id) -- a triangle
// tiling {3,q} as the dual of {q,3}, centred on a vertex; positions come
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

export type C = readonly [number, number];

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

/** The {p,q} tiling's faces out to `rings` rings round the centre, as
 * counterclockwise lists of integer vertex ids, and each face's ring: for
 * `p >= 4` ring 0 is the central p-gon, for {3,q} the q triangles round the
 * central vertex. Mirrors `hyperbolic_faces`. */
export function hyperbolicFaces(
  p: number,
  q: number,
  rings: number,
): { faces: number[][]; ringOf: number[] } {
  checkHyperbolic(p, q);
  return p === 3 ? dualFaces(q, rings) : ringWalk(p, q, rings);
}

/** {3,q} as the dual of {q,3}: one triangle for every {q,3} vertex that has
 * all three of its faces, its corners those faces' indices, counterclockwise,
 * lowest first; its ring the newest of those faces' rings, less one. Mirrors
 * `_dual_faces`. */
export function dualFaces(q: number, rings: number): { faces: number[][]; ringOf: number[] } {
  const primal = ringWalk(q, 3, rings + 1);
  // each corner of a {q,3} face: the face, and its corners before and after
  const star = new Map<number, [number, number, number][]>();
  primal.faces.forEach((face, f) => {
    face.forEach((v, i) => {
      const entry: [number, number, number] = [f, face[(i + q - 1) % q]!, face[(i + 1) % q]!];
      const round = star.get(v);
      if (round) round.push(entry);
      else star.set(v, [entry]);
    });
  });
  const faces: number[][] = [];
  const ringOf: number[] = [];
  for (const v of [...star.keys()].sort((a, b) => a - b)) {
    const round = star.get(v)!;
    if (round.length < 3) continue;
    // counterclockwise round v, face g is followed by the face whose corner
    // after v is g's corner before v
    const prev = new Map(round.map(([f, u]) => [f, u]));
    const byNext = new Map(round.map(([f, , w]) => [w, f]));
    const order = [Math.min(...prev.keys())];
    while (order.length < 3) order.push(byNext.get(prev.get(order[order.length - 1]!)!)!);
    faces.push(order);
    ringOf.push(Math.max(...order.map((f) => primal.ringOf[f]!)) - 1);
  }
  return { faces, ringOf };
}

/** The ring walk: ring 0 the central p-gon, each ring every face touching the
 * boundary so far. Needs `p >= 4`. Mirrors `_ring_walk`. */
function ringWalk(p: number, q: number, rings: number): { faces: number[][]; ringOf: number[] } {
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

export function centralPolygon(p: number, q: number): C[] {
  const bigR = Math.acosh(1 / (Math.tan(Math.PI / p) * Math.tan(Math.PI / q)));
  const r = Math.tanh(bigR / 2);
  return Array.from({ length: p }, (_, k) => {
    const t = Math.PI / 2 + Math.PI / p + (2 * Math.PI * k) / p;
    return [r * Math.cos(t), r * Math.sin(t)] as C;
  });
}

/** z -> (z - a) / (1 - conj(a) z), taking a to 0. */
export const toOrigin = (a: C, z: C): C => div(sub(z, a), sub(ONE, mul(conj(a), z)));
/** Its inverse, taking 0 to a. */
const fromOrigin = (a: C, z: C): C => div(add(z, a), add(ONE, mul(conj(a), z)));

/** The orientation-preserving disc isometry taking a -> a2 and b -> b2. */
export function isometry(a: C, b: C, a2: C, b2: C): (z: C) => C {
  const w = toOrigin(a, b);
  const w2 = toOrigin(a2, b2);
  const turn = div(scaleC(w2, 1 / abs(w2)), scaleC(w, 1 / abs(w)));
  return (z) => fromOrigin(a2, mul(turn, toOrigin(a, z)));
}

/** Every vertex's point in the disc, placed face by face; the first face by
 * hand -- the central p-gon, or for {3,q} the star's first triangle, vertex 0
 * at the centre and its next corner straight up the vertical axis. Mirrors
 * `hyperbolic_positions`. */
export function hyperbolicPositions(p: number, q: number, faces: number[][]): Map<number, C> {
  const centre = centralPolygon(p, q);
  let first = centre;
  if (p === 3) {
    const side = abs(toOrigin(centre[0]!, centre[1]!)); // tanh(edge / 2)
    const t = Math.PI / 2 + (2 * Math.PI) / q;
    first = [[0, 0], [0, side], [side * Math.cos(t), side * Math.sin(t)]];
  }
  const pos = new Map<number, C>();
  faces[0]!.forEach((v, i) => pos.set(v, first[i]!));
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

export const distance = (z: C): number => 2 * Math.atanh(abs(z));

export function arcPoints(a: C, b: C, segments: number): C[] {
  const w = toOrigin(a, b);
  const length = Math.atanh(abs(w));
  const unit = scaleC(w, 1 / abs(w));
  const out: C[] = [];
  for (let s = 1; s < segments; s++) {
    out.push(fromOrigin(a, scaleC(unit, Math.tanh((length * s) / segments))));
  }
  return out;
}

interface Tiling {
  faces: number[][];
  ringOf: number[];
  pos: Map<number, C>;
  centres: C[];
}

const TILINGS = new Map<string, Tiling>();

/** `tiling`, for the closed surfaces (`hurwitz.ts`), which cover their own
 * patch of it. */
export const hyperbolicTiling = (p: number, q: number, rings: number): Tiling => tiling(p, q, rings);

/** The {p,q} tiling out to `rings` rings: its faces, their rings, every
 * vertex's position and every face's centre. Cached, and only ever read: a trim
 * regrows the tiling ring by ring from the first, the uniform tilings stand on
 * it, and the menu icons trim the same tilings the boards do. Mirrors
 * `_tiling`. */
function tiling(p: number, q: number, rings: number): Tiling {
  const key = `${p},${q},${rings}`;
  let built = TILINGS.get(key);
  if (!built) {
    const { faces, ringOf } = hyperbolicFaces(p, q, rings);
    const pos = hyperbolicPositions(p, q, faces);
    const centre = centralPolygon(p, q);
    built = { faces, ringOf, pos, centres: faces.map((face) => faceCentre(centre, face, pos)) };
    TILINGS.set(key, built);
  }
  return built;
}

/** Hyperbolic distance from the centre of the disc to the geodesic segment
 * from a to b. On the hyperboloid the segment is X(s) = (sinh(L - s) A +
 * sinh(s) B) / sinh L, and the distance to the centre is acosh of its time
 * coordinate, A_t cosh s + lean sinh s: least at tanh s = -lean / A_t if that
 * falls inside the segment, else at an end. Mirrors `_segment_distance`. */
function segmentDistance(a: C, b: C): number {
  const [at, ax, ay] = lift(a);
  const [bt, bx, by] = lift(b);
  const coshL = Math.max(at * bt - ax * bx - ay * by, 1);
  const sinhL = Math.sqrt(coshL * coshL - 1);
  if (sinhL === 0) return Math.acosh(at);
  const lean = (bt - at * coshL) / sinhL;
  const s = Math.atanh(-lean / at);
  const least =
    s > 0 && s < Math.acosh(coshL) ? Math.sqrt(at * at - lean * lean) : Math.min(at, bt);
  return Math.acosh(Math.max(least, 1));
}

const EDGE_KEY = 2 ** 26;

/** How far from the centre of the disc the faces built so far are whole: the
 * nearest point of their outline, every edge only one of them has. A face not
 * yet built lies outside that outline, and its centre lies at least its
 * inradius in from its own sides, so no such centre is nearer than this plus
 * the inradius. Mirrors `_reach`. */
function reach(faces: readonly (readonly number[])[], pos: Map<number, C>): number {
  // an edge keyed by its two end ids, lower first (ids stay far below 2^26)
  const sides = new Map<number, number>();
  for (const face of faces) {
    face.forEach((a, i) => {
      const b = face[(i + 1) % face.length]!;
      const key = a < b ? a * EDGE_KEY + b : b * EDGE_KEY + a;
      sides.set(key, (sides.get(key) ?? 0) + 1);
    });
  }
  let near = Infinity;
  for (const [key, n] of sides) {
    if (n !== 1) continue;
    const a = Math.floor(key / EDGE_KEY);
    near = Math.min(near, segmentDistance(pos.get(a)!, pos.get(key - a * EDGE_KEY)!));
  }
  return near;
}

/** Whether every face out to the `shells`-th distance is among `centres`:
 * `bound` -- the reach of the faces built, plus the smallest inradius a
 * missing face can have -- is past that shell (and a tolerance, so a missing
 * face cannot belong to it either). The bound is only measured once there
 * are that many shells to hold. */
function holdsShells(groups: number[][], centres: C[], shells: number, bound: () => number): boolean {
  if (groups.length < shells) return false;
  const last = groups[shells - 1]!;
  return bound() > distance(centres[last[last.length - 1]!]!) + SHELL_TOL;
}

/** Grow rings until no face that is missing could lie within the `shells`-th
 * distance -- the fewest rings that hold every face that close, counting from
 * `from`, and how many that was. Mirrors `_rings_for`; exported for the tests,
 * which grow it further to show that nothing nearer was missed. */
export function ringsFor(
  p: number,
  q: number,
  shells: number,
  from = 1,
): { faces: number[][]; pos: Map<number, C>; groups: number[][]; rings: number } {
  // a {p,q} face's inradius, the same for every face of the tiling
  const inradius = Math.acosh(Math.cos(Math.PI / q) / Math.sin(Math.PI / p));
  for (let rings = from; rings <= 12; rings++) {
    const { faces, pos, centres } = tiling(p, q, rings);
    const groups = shellGroups(centres);
    if (holdsShells(groups, centres, shells, () => reach(faces, pos) + inradius)) {
      return { faces, pos, groups, rings };
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
 * smallest distances from the centre of the disc (shell 1 is the central p-gon
 * alone, or for {3,q} the q triangles round the central vertex), less any rim
 * cells that trim leaves with a twin or a near-twin. `scale` is pixels per
 * unit of disc radius; `arc` is how many straight segments draw each geodesic
 * edge. Throws when the trim is not a disc. Mirrors
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
  const { cells, cornerMask, polygons, extent, rim } = discDrawing(faces, kept, pos, scale, arc);
  if (!isDisc(cells)) throw new Error(`${name} trimmed to ${shells} shells is not a disc`);
  const size = 2 * extent * scale;
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

/** The kept faces drawn in the disc: each one's point ids (its corners and the
 * arc points between them), which of those are corners, its polygon in pixels
 * -- centred on the disc's own centre, `scale` pixels to the unit -- the disc
 * radius the drawing reaches out to (`extent`) and the one out to which it is
 * whole (`rim`). `discBoard` makes a board of it; the closed surfaces
 * (`hurwitz.ts`) draw a patch of their cover with it. Mirrors `disc_drawing`. */
export function discDrawing(
  faces: readonly (readonly number[])[],
  kept: readonly number[],
  pos: Map<number, C>,
  scale: number,
  arc: number | ((a: C, b: C) => number),
): {
  cells: Map<CellId, string[]>;
  cornerMask: Map<CellId, boolean[]>;
  polygons: Map<CellId, Vertex[]>;
  extent: number;
  rim: number;
} {
  // `arc` may be decided edge by edge (the closed surfaces draw a far edge
  // straight); the decision is the edge's own, so both its faces agree.
  const segments = new Map<string, number>();
  const segmentsOf = (lo: number, hi: number): number => {
    if (typeof arc === "number") return arc;
    const key = `${lo}:${hi}`;
    let n = segments.get(key);
    if (n === undefined) segments.set(key, (n = arc(pos.get(lo)!, pos.get(hi)!)));
    return n;
  };
  // Arc points along each edge: ids built from the edge's end ids (the lower
  // first), positions computed once per edge from its lower end, so both faces
  // of an edge share the very same points.
  // Only the kept faces' corners: the tiling they were cut from can be
  // several times bigger, and none of the rest is drawn.
  const points = new Map<string, C>();
  for (const f of kept) for (const v of faces[f]!) points.set(String(v), pos.get(v)!);
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
      const n = segmentsOf(lo, hi);
      if (n > 1 && !points.has(`${lo}:${hi}:1`)) {
        arcPoints(pos.get(lo)!, pos.get(hi)!, n).forEach((z, s) =>
          points.set(`${lo}:${hi}:${s + 1}`, z),
        );
      }
      for (let t = 1; t < n; t++) {
        const s = a === lo ? t : n - t;
        ids.push(`${lo}:${hi}:${s}`);
        corner.push(false);
      }
    });
    cells.set(cid(f), ids);
    cornerMask.set(cid(f), corner);
  }

  // Centred on the disc's own centre, so the central p-gon (or vertex) sits in
  // the middle of the board whatever the trim.
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
  return { cells, cornerMask, polygons, extent, rim };
}

// -- the uniform tilings: Wythoff's construction on {p,q} ---------------------
//
// Port of the section of the same name in hyperbolic.py, which says why: a
// generating point in one flag triangle (face centre F, corner V, edge
// midpoint E) reflected everywhere, its place deciding the tiling --
// `ambo` 3.7.3.7, `zip` 6.6.7 (the hyperbolic soccer ball), `expand` 3.4.7.4,
// `bevel` 4.6.14 and `truncate` 3.14.14 on {7,3} (on {5,4} and {6,4} truncate
// centres 4.10.10 and 4.12.12 on their big face). New vertices are named by the part of their flag
// the op does not collapse, as tuples of the ring walk's integer ids, and
// renumbered in the order the faces meet them.

/** Must match `WYTHOFF_OPS`. */
export const WYTHOFF_OPS = ["ambo", "zip", "expand", "bevel", "truncate"] as const;
export type WythoffOp = (typeof WYTHOFF_OPS)[number];

/** The faces round a vertex, smallest first as the notation writes them.
 * Mirrors `_vertex_config`. */
export function vertexConfig(p: number, q: number, op: WythoffOp): number[] {
  const ring = {
    ambo: [p, q, p, q],
    zip: [2 * q, 2 * q, p],
    expand: [p, 4, q, 4],
    bevel: [4, 2 * q, 2 * p],
    truncate: [q, 2 * p, 2 * p],
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

export type V3 = readonly [number, number, number];

/** A disc point on the hyperboloid t^2 - x^2 - y^2 = 1. */
export function lift(z: C): V3 {
  const r2 = z[0] * z[0] + z[1] * z[1];
  const s = 1 - r2;
  return [(1 + r2) / s, (2 * z[0]) / s, (2 * z[1]) / s];
}

/** A timelike vector back to the disc, normalised and on the upper sheet. */
export function drop(v: V3): C {
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
  if (op === "truncate") return drop(minkCross(ve, minus(fv, fe)));
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
  const { loops, where, centres } = wythoffLoops(p, q, op, rings);
  const ids = new Map<string, number>();
  for (const loop of loops) for (const k of loop) if (!ids.has(k)) ids.set(k, ids.size);
  const faces = loops.map((loop) => loop.map((k) => ids.get(k)!));
  const pos = new Map<number, C>();
  for (const [k, id] of ids) pos.set(id, where.get(k)!);
  return { faces, pos, centres };
}

/** What a face of a uniform tiling stands on: an old face, an old vertex, or
 * an old edge (`u < v`). Mirrors the origins `wythoff_loops` returns. */
export type WythoffOrigin = readonly ["F", number] | readonly ["V", number] | readonly ["E", number, number];

export interface WythoffLoops {
  /** Each face as the loop of flag keys round it: the {p,q} ids the key is
   * named by, joined with commas (`f,u,v` on `zip`). */
  loops: string[][];
  where: Map<string, C>;
  centres: C[];
  origins: WythoffOrigin[];
}

const loopsCache = new Map<string, WythoffLoops>();

/** `wythoffFaces` before its vertices are renumbered: each face's loop of flag
 * keys, the keys' positions, each face's centre and what it stands on. The
 * closed surfaces (`hurwitz.ts`) read the keys and origins through their
 * covering map. Cached, and only ever read. Mirrors `wythoff_loops`. */
export function wythoffLoops(p: number, q: number, op: WythoffOp, rings: number): WythoffLoops {
  const cacheKey = `${p},${q},${op},${rings}`;
  const hit = loopsCache.get(cacheKey);
  if (hit) return hit;
  if (!WYTHOFF_OPS.includes(op)) throw new Error(`unknown Wythoff operation ${op}`);
  const { faces: base, pos: bpos } = tiling(p, q, rings);
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
    if (op === "truncate") return `${v},${u}`; // on the edge, so both its faces' flags meet here
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
  const origins: WythoffOrigin[] = [];
  // F: one per face of {p,q}, its flags in order round it
  base.forEach((_, f) => {
    const keys: string[] = [];
    for (let i = 0; i < p; i++) keys.push(flag(f, i, 1), flag(f, i, 0));
    const loop = ringOf(keys);
    if (loop.length >= 3) {
      newFaces.push(loop);
      centres.push(maps[f]!([0, 0]));
      origins.push(["F", f]);
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
      origins.push(["V", v]);
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
        origins.push(["E", u, v]);
      }
    }
  });
  const out = { loops: newFaces, where, centres, origins };
  loopsCache.set(cacheKey, out);
  return out;
}

/** Face indices grouped by their centre's distance from the disc's centre,
 * nearest first. Mirrors `_shell_groups`. */
export function shellGroups(centres: C[]): number[][] {
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

const WYTHOFF_TILINGS = new Map<string, ReturnType<typeof wythoffFaces>>();

/** `wythoffFaces`, cached as `tiling` is and for the same reason. Mirrors
 * `_wythoff_tiling`. */
function wythoffTiling(p: number, q: number, op: WythoffOp, rings: number) {
  const key = `${p},${q},${op},${rings}`;
  let built = WYTHOFF_TILINGS.get(key);
  if (!built) WYTHOFF_TILINGS.set(key, (built = wythoffFaces(p, q, op, rings)));
  return built;
}

/** The smallest inradius among the faces: every face is regular, so the
 * distance from its centre to the midpoint of one of its sides. Every shape
 * the tiling has is already among the faces round the central one. */
function leastInradius(faces: readonly (readonly number[])[], pos: Map<number, C>, centres: C[]): number {
  let least = Infinity;
  faces.forEach((face, f) => {
    const [mid] = arcPoints(pos.get(face[0]!)!, pos.get(face[1]!)!, 2);
    least = Math.min(least, distance(toOrigin(centres[f]!, mid!)));
  });
  return least;
}

/** Grow the {p,q} rings until no new face that is missing could lie within
 * the `shells`-th distance, as `ringsFor` does. Mirrors
 * `_wythoff_rings_for`; exported for the tests, as `ringsFor` is. */
export function wythoffRingsFor(
  p: number,
  q: number,
  op: WythoffOp,
  shells: number,
  from = 1,
): { faces: number[][]; pos: Map<number, C>; groups: number[][]; rings: number } {
  for (let rings = from; rings <= 12; rings++) {
    const { faces, pos, centres } = wythoffTiling(p, q, op, rings);
    const groups = shellGroups(centres);
    const bound = () => reach(faces, pos) + leastInradius(faces, pos, centres);
    if (holdsShells(groups, centres, shells, bound)) return { faces, pos, groups, rings };
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

// -- Böröczky's binary tiling, in the upper half-plane -----------------------
//
// Port of the section of the same name in hyperbolic.py, which says why: the
// half-plane cut along the horocycles y = 2**i and the geodesics x = j * 2**i
// between them, every tile the image of the unit one under z -> 2**i z + j 2**i,
// so all congruent; drawn as squares, each row half the width of the one above,
// in a rectangular window. Ids are the corners themselves, integer pairs in
// bottom-row tiles; a tile's bottom midpoint, where its two children meet, is a
// T-vertex the corner mask drops.

/** `top` tiles across the top row, `levels` rows; `scale` is the pixel width of
 * one top-row tile. Cells are `row,j`, row 0 the top row. */
export function binaryBoard(
  top: number,
  levels: number,
  mineCount: number,
  scale = 300,
): Board {
  if (top < 1 || levels < 1) {
    throw new Error("binaryBoard needs at least one tile and one row");
  }
  const cells = new Map<CellId, string[]>();
  const cornerMask = new Map<CellId, boolean[]>();
  const points = new Map<string, [number, number]>();
  const unit = scale / 2 ** (levels - 1);
  const height = 2 ** levels;
  const id = (x: number, y: number): string => {
    const k = cid(x, y);
    points.set(k, [x * unit, (height - y) * unit]);
    return k;
  };
  for (let row = 0; row < levels; row++) {
    const level = levels - 1 - row; // 0 = the bottom row
    const w = 2 ** level;
    for (let j = 0; j < top * 2 ** row; j++) {
      const [x0, x1, y0, y1] = [j * w, (j + 1) * w, w, 2 * w];
      // clockwise in the half-plane, which is the pixel space's (y down)
      // counterclockwise -- the order every flat builder uses
      const ids = [id(x0, y1), id(x1, y1), id(x1, y0)];
      const corner = [true, true, true];
      if (level > 0) {
        // the T-vertex where the two children below meet
        ids.push(id(x0 + w / 2, y0));
        corner.push(false);
      }
      ids.push(id(x0, y0));
      corner.push(true);
      cells.set(cid(row, j), ids);
      cornerMask.set(cid(row, j), corner);
    }
  }
  const polygons = new Map<CellId, Vertex[]>();
  for (const [cell, ids] of cells) {
    polygons.set(cell, ids.map((k) => [...points.get(k)!] as Vertex));
  }
  return flatBoard({
    mode: "hyperbolicbinary",
    polygons,
    adjacency: sharedVertexAdjacency(cells),
    mineCount,
    width: top * scale,
    height: (height - 1) * unit,
    cornerMask,
    curved: true,
    halfPlane: { boundary: height * unit, maxZoom: 2 ** (levels - 1) },
  });
}
