// Board symmetries: the motions of a board that permute its cells without
// changing the game.
//
// A symmetry here is a permutation of the cells that preserves adjacency, so
// the contents can be slid along it and every number still counts the mines
// beside it. The UI offers each one as a button; the geometry never moves, only
// what is painted on it. That is the whole point on a board part of which
// cannot be brought into view by turning it — the Klein bottle's neck hides the
// sheet it passes through, and a donut's inner wall is only ever glimpsed
// through the hole — and on a flat board, where nothing is hidden, it is a way
// to look at the same puzzle from another angle.
//
// There are two ways in, because the two kinds of board hide their symmetry in
// different places:
//
//   * A **wrapped** board is a flat tiling glued to itself, and its symmetries
//     are the motions of the plane that survive the gluing. Its drawn cells are
//     *not* congruent — a donut's inner tiles are smaller than its outer ones —
//     so nothing can be found by looking at the geometry. `boards/surfaces.ts`
//     offers candidate motions of the board's own lattice and `keepSymmetries`
//     rules on them.
//   * A **flat** board is a finite patch, so it has no translations at all, but
//     its symmetries *are* congruences of the drawing: the rotations and
//     reflections of the plane that map the patch onto itself. `planeSymmetries`
//     finds them by measuring, which needs no help from the builder and works
//     the same on a square grid, a Penrose patch and a Gosper island.
import type { AnyBoard, CellId, Vec3, Vertex } from "./core";

/** The board symmetries the UI offers, in the order their controls are drawn.
 *
 * A wrapped surface has two directions — round the **ring** (the loop through
 * the hole) and round the **tube** (the cross-section) — and the flat window it
 * is cut from has the same two: its x becomes the ring and its y the tube. So
 * the names carry over. `ring` and `tube` are translations, which only a closed
 * direction has; `turn` is a rotation (a quarter turn on a square board, and on
 * every wrapped surface the half turn that stands it on its head); the two
 * mirrors reverse one direction each. */
export const SYMMETRY_IDS = ["ring", "tube", "turn", "mirror-ring", "mirror-tube"] as const;

export type SymmetryId = (typeof SYMMETRY_IDS)[number];

/** One symmetry of a board: a permutation of its cells that preserves
 * adjacency, so the contents can be moved along it and every number still
 * counts the mines around it.
 *
 * `involution` is measured, not declared: a motion that is its own inverse — a
 * reflection, a half turn — gets one button rather than a back/forward pair. */
export interface BoardSymmetry {
  id: SymmetryId;
  /** cell -> the cell its contents move to, one step forward. */
  cycle: Map<CellId, CellId>;
  /** Whether applying it twice is the identity. */
  involution: boolean;
}

/** Whether `cycle` really is an automorphism of `adjacency`: a bijection over
 * the same cells that carries neighbours to neighbours. Every candidate
 * symmetry is put through this before a board keeps it — a lattice motion that
 * looks like a symmetry of the flat tiling need not survive the seam gluing (a
 * Klein bottle's tube translation is the standard example: conjugating it by
 * the ring seam inverts it, so only the *half*-tube step descends), and a
 * permutation that is not an automorphism would silently deal a board wrong
 * numbers. */
export function isAutomorphism(
  adjacency: Map<CellId, CellId[]>,
  cycle: Map<CellId, CellId>,
): boolean {
  if (cycle.size !== adjacency.size) return false;
  const images = new Set<CellId>();
  for (const [cell, image] of cycle) {
    if (!adjacency.has(cell) || !adjacency.has(image)) return false;
    images.add(image);
  }
  if (images.size !== cycle.size) return false;
  for (const [cell, neighbours] of adjacency) {
    const there = new Set(adjacency.get(cycle.get(cell)!)!);
    if (there.size !== neighbours.length) return false;
    for (const n of neighbours) if (!there.has(cycle.get(n)!)) return false;
  }
  return true;
}

/** Whether every cell comes back to itself after two steps. */
export function isInvolution(cycle: Map<CellId, CellId>): boolean {
  for (const [cell, image] of cycle) if (cycle.get(image) !== cell) return false;
  return true;
}

/** Whether the permutation moves nothing (a candidate worth no button). */
export function isIdentity(cycle: Map<CellId, CellId>): boolean {
  for (const [cell, image] of cycle) if (cell !== image) return false;
  return true;
}

export function invertCycle(cycle: Map<CellId, CellId>): Map<CellId, CellId> {
  const out = new Map<CellId, CellId>();
  for (const [from, to] of cycle) out.set(to, from);
  return out;
}

/** A board's symmetry by id, or null when it has none of that kind. */
export function symmetryOf(board: AnyBoard, id: SymmetryId): BoardSymmetry | null {
  return board.symmetries.find((s) => s.id === id) ?? null;
}

/** A symmetry a builder offers, before the board has checked it. `build`
 * returns null when the motion did not even land on the board's own cells, and
 * is only called until one candidate for an id survives — a mirror whose axis
 * has to be searched for offers a handful, and the later ones are never walked.
 */
export interface SymmetryCandidate {
  id: SymmetryId;
  build: () => Map<CellId, CellId> | null;
}

/** The candidates that really are symmetries, in `SYMMETRY_IDS` order and at
 * most one per id.
 *
 * A **mirror must be its own inverse**. What a template offers under
 * `mirror-tube` is sometimes a *glide* reflection — p4g (the snub square tiling
 * and its Cairo dual) has no plain horizontal mirror, only a mirror composed
 * with half a domain along the ring — and that is a different motion with a
 * different undo. One button cannot honestly be both, so the glide is dropped
 * rather than drawn as a reflection: those boards keep their translations, and
 * the half turn, and no mirror across the tube.
 *
 * No two controls may be the **same** permutation either. A board with a single
 * mirror line answers to both mirror ids — a chair patch has one, and every
 * candidate for the second is the candidate for the first — and two buttons
 * that do the same thing are one button and a puzzle. */
export function keepSymmetries(
  adjacency: Map<CellId, CellId[]>,
  candidates: readonly SymmetryCandidate[],
): BoardSymmetry[] {
  const kept: BoardSymmetry[] = [];
  const same = (a: Map<CellId, CellId>, b: Map<CellId, CellId>) => {
    for (const [cell, image] of a) if (b.get(cell) !== image) return false;
    return true;
  };
  for (const id of SYMMETRY_IDS) {
    for (const candidate of candidates) {
      if (candidate.id !== id) continue;
      const cycle = candidate.build();
      // An identity is a real symmetry and a useless button: a two-cell tube's
      // half turn, a mirror whose axis runs through every cell.
      if (!cycle || isIdentity(cycle) || !isAutomorphism(adjacency, cycle)) continue;
      const involution = isInvolution(cycle);
      if (!involution && id.startsWith("mirror-")) continue; // a glide, see above
      if (kept.some((other) => same(other.cycle, cycle))) continue;
      kept.push({ id, cycle, involution });
      break;
    }
  }
  return kept;
}

// -- flat boards: the point group, measured off the drawing -------------------

/** How close two points must be to count as the same one, as a fraction of the
 * closest that two *different* cell centres come. A symmetric board's images
 * land on their targets to floating-point noise, orders of magnitude inside
 * this; a near miss is a different cell. */
const MATCH_FRACTION = 0.2;

/** A point in as many dimensions as the board has — two for a flat one, three
 * for a solid. Everything below is written over both. */
type Point = readonly number[];

function centroidOf(polygon: readonly Point[]): number[] {
  const c = new Array<number>(polygon[0]!.length).fill(0);
  for (const p of polygon) {
    for (let i = 0; i < c.length; i++) c[i]! += p[i]!;
  }
  return c.map((v) => v / polygon.length);
}

function distance(a: Point, b: Point): number {
  let sum = 0;
  for (let i = 0; i < a.length; i++) sum += (a[i]! - b[i]!) ** 2;
  return Math.sqrt(sum);
}

/** Every offset in {-1, 0, 1}^d, so a lookup can sweep the block around its own
 * bucket. Nine cells in the plane, twenty-seven on a solid. */
function neighbourhood(dimensions: number): number[][] {
  let offsets: number[][] = [[]];
  for (let i = 0; i < dimensions; i++) {
    offsets = offsets.flatMap((o) => [-1, 0, 1].map((d) => [...o, d]));
  }
  return offsets;
}

/** Mixing constants for the spatial hash below — the usual large odd primes,
 * one per axis. Two buckets colliding costs a slightly longer scan and nothing
 * else: what a lookup returns is decided by measuring, not by the key. */
const HASH_PRIMES = [73856093, 19349663, 83492791];

/** Cell centres in a grid, so the image of a point is looked up rather than
 * searched for. Keyed by a hash of the bucket indices rather than by a string:
 * a symmetry search asks this tens of thousands of times, and building 27
 * strings per lookup is most of the cost of the whole thing. */
class PointIndex {
  private readonly buckets = new Map<number, CellId[]>();
  private readonly offsets: number[][];

  constructor(
    private readonly points: Map<CellId, Point>,
    private readonly cell: number,
    private readonly dimensions: number,
  ) {
    this.offsets = neighbourhood(dimensions);
    const zero = new Array<number>(dimensions).fill(0);
    for (const [id, p] of points) {
      const key = this.key(p, zero);
      const bucket = this.buckets.get(key);
      if (bucket) bucket.push(id);
      else this.buckets.set(key, [id]);
    }
  }

  private key(p: Point, offset: readonly number[]): number {
    let hash = 0;
    for (let i = 0; i < this.dimensions; i++) {
      hash ^= (Math.floor(p[i]! / this.cell) + offset[i]!) * HASH_PRIMES[i]!;
    }
    return hash >>> 0;
  }

  /** The nearest indexed point to `p`, and how far off it is. */
  nearest(p: Point): { id: CellId; distance: number } | null {
    let best: CellId | null = null;
    let bestDistance = Infinity;
    for (const offset of this.offsets) {
      for (const id of this.buckets.get(this.key(p, offset)) ?? []) {
        const d = distance(this.points.get(id)!, p);
        if (d < bestDistance) {
          bestDistance = d;
          best = id;
        }
      }
    }
    return best === null ? null : { id: best, distance: bestDistance };
  }
}

/** The closest two cells that share a vertex come, which sets how far a moved
 * point may miss its target and still be counted as landing on it. */
function closestGap(
  centres: Map<CellId, Point>,
  adjacency: Map<CellId, CellId[]>,
): number {
  let gap = Infinity;
  for (const [cell, c] of centres) {
    for (const other of adjacency.get(cell) ?? []) {
      const q = centres.get(other);
      if (q) gap = Math.min(gap, distance(c, q));
    }
  }
  return gap;
}

/** The permutation a rigid motion induces, or null when it is no symmetry:
 * some cell's image is off the board, lands on a cell of a different shape, or
 * two cells land on one.
 *
 * A candidate is never believed on its cell centres alone. Two tiles can share
 * a centre and be a different shape — the sphinx patch is one tile in four
 * orientations — so the whole polygon has to land on the target's. */
function permutationUnder<P extends Point>(
  polygons: Map<CellId, P[]>,
  centres: Map<CellId, Point>,
  index: PointIndex,
  tolerance: number,
  motion: (p: P) => Point,
): Map<CellId, CellId> | null {
  const moved = new Map<CellId, CellId>();
  for (const [cell, polygon] of polygons) {
    const hit = index.nearest(motion(centres.get(cell)! as P));
    if (hit === null || hit.distance > tolerance) return null;
    const target = polygons.get(hit.id)!;
    if (target.length !== polygon.length) return null;
    const taken = new Array<boolean>(target.length).fill(false);
    for (const vertex of polygon) {
      const image = motion(vertex);
      let found = false;
      for (let i = 0; i < target.length && !found; i++) {
        if (!taken[i] && distance(target[i]!, image) <= tolerance) {
          taken[i] = true;
          found = true;
        }
      }
      if (!found) return null;
    }
    moved.set(cell, hit.id);
  }
  return moved;
}

/** A rigid motion of the plane about a fixed centre. */
type PlaneMotion = (p: Point) => Vertex;

function rotation(centre: Vertex, angle: number): PlaneMotion {
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  return (p) => {
    const dx = p[0]! - centre[0];
    const dy = p[1]! - centre[1];
    return [centre[0] + c * dx - s * dy, centre[1] + s * dx + c * dy];
  };
}

/** Reflection in the line through `centre` at `angle` to the x axis. */
function reflection(centre: Vertex, angle: number): PlaneMotion {
  const c = Math.cos(2 * angle);
  const s = Math.sin(2 * angle);
  return (p) => {
    const dx = p[0]! - centre[0];
    const dy = p[1]! - centre[1];
    return [centre[0] + c * dx + s * dy, centre[1] + s * dx - c * dy];
  };
}

/**
 * The rotations and reflections of the plane that map a flat board onto itself,
 * as cell permutations.
 *
 * Measured rather than declared, so it needs nothing from the builder and works
 * the same on a square grid, a hexagonal patch, a Penrose window and a Gosper
 * island. Every symmetry fixes the centroid of the cell centres — that point is
 * defined by the set the symmetry permutes — so each is pinned by where it
 * sends *one* cell, and the outermost cell is the one to ask: only a cell the
 * same distance from the centre can be its image, which is a handful of
 * candidates rather than the whole board.
 */
export function planeSymmetries(
  polygons: Map<CellId, Vertex[]>,
  adjacency: Map<CellId, CellId[]>,
): BoardSymmetry[] {
  if (polygons.size < 2) return [];
  const centres = new Map<CellId, Point>();
  let sx = 0;
  let sy = 0;
  for (const [cell, polygon] of polygons) {
    const c = centroidOf(polygon) as Vertex;
    centres.set(cell, c);
    sx += c[0];
    sy += c[1];
  }
  const centre: Vertex = [sx / centres.size, sy / centres.size];

  // A bucket a good deal wider than the closest two centres come, so a lookup
  // sweeps the block around its own and cannot miss its own answer.
  let extent = 0;
  for (const c of centres.values()) {
    extent = Math.max(extent, Math.abs(c[0]! - centre[0]), Math.abs(c[1]! - centre[1]));
  }
  if (extent === 0) return [];
  const index = new PointIndex(centres, (2 * extent) / Math.sqrt(centres.size) + 1e-9, 2);
  const gap = closestGap(centres, adjacency);
  if (!Number.isFinite(gap) || gap <= 0) return [];
  const tolerance = gap * MATCH_FRACTION;
  const permutation = (motion: PlaneMotion) =>
    permutationUnder(polygons, centres, index, tolerance, motion);

  // The outermost cell, and every cell that could be its image.
  const radius = (c: Point) => distance(c, centre);
  let farRadius = 0;
  for (const c of centres.values()) farRadius = Math.max(farRadius, radius(c));
  if (farRadius <= tolerance) return [];
  // the lowest id among the outermost cells, so the same board always asks the
  // same one and its symmetries come out in the same order every build
  let far: CellId | null = null;
  for (const [cell, c] of centres) {
    if (Math.abs(radius(c) - farRadius) > tolerance) continue;
    if (far === null || cell < far) far = cell;
  }
  if (far === null) return [];
  const from = centres.get(far)!;
  const fromAngle = Math.atan2(from[1]! - centre[1], from[0]! - centre[0]);

  const turns: number[] = [];
  const axes: number[] = [];
  for (const [cell, c] of centres) {
    if (Math.abs(radius(c) - farRadius) > tolerance) continue;
    const toAngle = Math.atan2(c[1]! - centre[1], c[0]! - centre[0]);
    if (cell !== far) turns.push(toAngle - fromAngle);
    axes.push((fromAngle + toAngle) / 2);
  }
  // smallest turn first: the rotations of a finite figure are cyclic, so the
  // shortest one that works generates every other
  turns.sort((a, b) => Math.abs(a) - Math.abs(b) || b - a);

  const candidates: SymmetryCandidate[] = [];
  for (const angle of turns) {
    candidates.push({ id: "turn", build: () => permutation(rotation(centre, angle)) });
  }
  // A reflection is named for the direction it reverses, so the axis nearest
  // vertical is the one that swaps left for right (the ring's own direction on
  // the surfaces this window wraps onto) and the axis nearest horizontal swaps
  // top for bottom. A board whose only mirror is diagonal is offered as
  // whichever of the two it leans towards.
  const byDistance = (want: number) => (a: number, b: number) =>
    Math.abs(axisGap(a, want)) - Math.abs(axisGap(b, want));
  for (const [id, want] of [
    ["mirror-ring", Math.PI / 2],
    ["mirror-tube", 0],
  ] as const) {
    for (const angle of [...axes].sort(byDistance(want))) {
      candidates.push({ id, build: () => permutation(reflection(centre, angle)) });
    }
  }
  return keepSymmetries(adjacency, candidates);
}

/** How far a mirror axis is from `want`, mod π (an axis and its opposite are
 * the same line). */
function axisGap(angle: number, want: number): number {
  const d = ((angle - want) % Math.PI + Math.PI) % Math.PI;
  return d > Math.PI / 2 ? d - Math.PI : d;
}

// -- solids: the point group of a polyhedron, measured the same way -----------
//
// A solid's rotations and reflections are congruences of the drawing exactly as
// a flat board's are, so they are measured, not declared — thirteen Catalan
// solids, five Platonic ones, the frames and the brick cubes would otherwise be
// twenty tables of axes to keep in step with twenty builders. What changes in
// three dimensions is that one cell no longer pins a motion: a rotation has an
// axis to find first. The axes are not searched for blindly either — a
// symmetry axis of a polyhedron passes through a face centre, a vertex or an
// edge midpoint, and subdividing the faces leaves all three among the *board's*
// own cell centres, cell vertices and edge midpoints. That is a few thousand
// directions to try, each rejected or kept on one rotated cell before the whole
// board is walked.

/** A 3x3 matrix, row-major. */
type Mat3 = readonly [number, number, number, number, number, number, number, number, number];

function applyMat(m: Mat3, p: Point): Vec3 {
  const [x, y, z] = [p[0]!, p[1]!, p[2]!];
  return [
    m[0] * x + m[1] * y + m[2] * z,
    m[3] * x + m[4] * y + m[5] * z,
    m[6] * x + m[7] * y + m[8] * z,
  ];
}

/** Rotation by `angle` about a unit axis (Rodrigues). */
function axisRotation(axis: Vec3, angle: number): Mat3 {
  const [x, y, z] = axis;
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  const t = 1 - c;
  return [
    t * x * x + c, t * x * y - s * z, t * x * z + s * y,
    t * x * y + s * z, t * y * y + c, t * y * z - s * x,
    t * x * z - s * y, t * y * z + s * x, t * z * z + c,
  ];
}

/** Reflection in the plane through the origin with unit normal `n`. */
function planeReflection(n: Vec3): Mat3 {
  const [x, y, z] = n;
  return [
    1 - 2 * x * x, -2 * x * y, -2 * x * z,
    -2 * x * y, 1 - 2 * y * y, -2 * y * z,
    -2 * x * z, -2 * y * z, 1 - 2 * z * z,
  ];
}

function dot(a: Vec3, b: Vec3): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

function cross(a: Vec3, b: Vec3): Vec3 {
  return [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0],
  ];
}

/** A direction as a stable key, with the two ends of an axis reading the same:
 * a rotation about `d` and about `-d` are the same axis (the sense comes from
 * the angle), and a mirror's normal has no sense at all. */
function axisKey(v: Vec3): string | null {
  const length = Math.hypot(v[0], v[1], v[2]);
  if (length < 1e-9) return null;
  let [x, y, z] = [v[0] / length, v[1] / length, v[2] / length];
  // canonical end: the first coordinate that is not (nearly) zero decides
  const lead = Math.abs(x) > 1e-6 ? x : Math.abs(y) > 1e-6 ? y : z;
  if (lead < 0) [x, y, z] = [-x, -y, -z];
  const round = (c: number) => Math.round(c * 1e5) / 1e5 || 0;
  return `${round(x)},${round(y)},${round(z)}`;
}

function unit(v: Vec3): Vec3 {
  const length = Math.hypot(v[0], v[1], v[2]) || 1;
  return [v[0] / length, v[1] / length, v[2] / length];
}

/** The rotation orders a polyhedron can have. Five is the icosahedral group's;
 * six belongs to no polyhedral group but costs nothing to ask for, and a board
 * is not required to be a Platonic solid. */
const SAMPLE_CELLS = 16;

/**
 * The rotations and reflections of space that map a solid board onto itself.
 *
 * Unlike the wrapped surfaces, whose cells are not congruent and whose
 * symmetries have to come from the lattice, a solid is drawn as the thing it
 * is: every symmetry of the polyhedron is a symmetry of the picture. So the
 * whole point group is found by measuring, and each board gets its own — a cube
 * turns a quarter about three axes, an icosahedron a fifth about six, a
 * tetrahedron a third and no quarter at all, and a *chiral* solid (the
 * pentagonal hexecontahedron, which is the snub operation's dual) has no mirror
 * anywhere.
 *
 * Five controls cannot be a whole group of forty-eight, so what is offered is a
 * set that generates it: rotations about three axes, the first the board's own
 * highest-order one and the others as near perpendicular to it as the solid
 * allows, plus a mirror through that first axis and one across it. Everything
 * else is a few presses away.
 */
export function solidSymmetries(
  polygons: Map<CellId, Vec3[]>,
  adjacency: Map<CellId, CellId[]>,
): BoardSymmetry[] {
  if (polygons.size < 2) return [];
  const centres = new Map<CellId, Point>();
  const middle = [0, 0, 0];
  for (const [cell, polygon] of polygons) {
    const c = centroidOf(polygon);
    centres.set(cell, c);
    for (let i = 0; i < 3; i++) middle[i]! += c[i]!;
  }
  for (let i = 0; i < 3; i++) middle[i]! /= centres.size;
  // Work about the fixed point every symmetry shares — the centroid of the cell
  // centres, which the boards put at the origin anyway.
  const atCentre = (p: Point): Vec3 => [p[0]! - middle[0]!, p[1]! - middle[1]!, p[2]! - middle[2]!];
  const centred = new Map<CellId, Point>();
  const shapes = new Map<CellId, Vec3[]>();
  let extent = 0;
  for (const [cell, polygon] of polygons) {
    centred.set(cell, atCentre(centres.get(cell)!));
    shapes.set(cell, polygon.map(atCentre));
    for (const p of shapes.get(cell)!) extent = Math.max(extent, Math.abs(p[0]), Math.abs(p[1]), Math.abs(p[2]));
  }
  if (extent === 0) return [];
  // A solid's cells sit on a *shell*, not through a volume, so their density is
  // two-dimensional and the bucket wants the square root rather than the cube.
  const index = new PointIndex(centred, (2 * extent) / Math.sqrt(centred.size) + 1e-9, 3);
  const gap = closestGap(centred, adjacency);
  if (!Number.isFinite(gap) || gap <= 0) return [];
  const tolerance = gap * MATCH_FRACTION;
  const permutation = (m: Mat3) =>
    permutationUnder(shapes, centred, index, tolerance, (p: Vec3) => applyMat(m, p));

  // ---- phase one: find the axes on a sample -------------------------------
  //
  // A high-symmetry solid has scores of them (a disdyakis triacontahedron has a
  // hundred and twenty), and walking every cell for each would cost most of a
  // second on a board this app builds while the player waits. So the search
  // runs on a handful of cells and only the few motions that are *offered* as
  // controls are ever built in full — `keepSymmetries` measures those against
  // the whole adjacency, so nothing is taken on the sample's word.
  const radius = (c: Point) => Math.hypot(c[0]!, c[1]!, c[2]!);
  let first: CellId | null = null;
  for (const [cell, c] of centred) {
    const best = first === null ? -1 : radius(centred.get(first)!);
    if (radius(c) > best + 1e-9 || (Math.abs(radius(c) - best) <= 1e-9 && cell < first!)) {
      first = cell;
    }
  }
  if (first === null) return [];
  const anchor = unit(centred.get(first)! as Vec3);
  // A second cell well off the first one's own line, so a motion that fixes the
  // first is still tested by the second.
  let offAxis: CellId | null = null;
  let bestOff = 0;
  for (const [cell, c] of centred) {
    const off = radius(c) * Math.sqrt(Math.max(0, 1 - dot(unit(c as Vec3), anchor) ** 2));
    if (
      off > bestOff + 1e-9 ||
      (Math.abs(off - bestOff) <= 1e-9 && offAxis !== null && cell < offAxis)
    ) {
      bestOff = off;
      offAxis = cell;
    }
  }
  if (offAxis === null) return [];
  // Those two first, because between them they reject nearly every candidate on
  // two lookups; then a spread of the rest to catch the few that survive by
  // luck.
  const ids = [...centred.keys()].sort();
  const stride = Math.max(1, Math.floor(ids.length / SAMPLE_CELLS));
  const sample: Vec3[] = [centred.get(first)! as Vec3, centred.get(offAxis)! as Vec3];
  for (let i = 0; i < ids.length; i += stride) sample.push(centred.get(ids[i]!)! as Vec3);
  /** Does this motion carry every sampled cell onto a cell? */
  const fits = (m: Mat3): boolean =>
    sample.every((p) => {
      const hit = index.nearest(applyMat(m, p));
      return hit !== null && hit.distance <= tolerance;
    });

  // Every direction a symmetry axis or a mirror normal could point along.
  //
  // An **axis** passes through a point of the surface it fixes, and on a
  // polyhedron that is a face centre, a vertex or an edge midpoint — all three
  // still there after the faces are subdivided, as a cell centre, a cell corner
  // or the midpoint of a cell edge.
  //
  // A **mirror normal** need be none of those. A plane that runs between two
  // cells and swaps them is normal to the line joining their centres, and one
  // that runs along a cell's own edge is normal to that edge — which is how a
  // tetrahedron's six mirrors are found, each perpendicular to the edge
  // opposite the one it contains, a direction no point of the solid lies on.
  const axisDirections = new Map<string, Vec3>();
  const normalDirections = new Map<string, Vec3>();
  const offer = (into: Map<string, Vec3>, v: Vec3) => {
    const key = axisKey(v);
    if (key !== null && !into.has(key)) into.set(key, unit(v));
  };
  const between = (a: Vec3, b: Vec3) => {
    offer(axisDirections, [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2]);
    offer(normalDirections, [b[0] - a[0], b[1] - a[1], b[2] - a[2]]);
  };
  for (const polygon of shapes.values()) {
    for (let i = 0; i < polygon.length; i++) {
      offer(axisDirections, polygon[i]!);
      between(polygon[i]!, polygon[(i + 1) % polygon.length]!);
    }
  }
  for (const [cell, c] of centred) {
    offer(axisDirections, c as Vec3);
    for (const other of adjacency.get(cell) ?? []) {
      const q = centred.get(other);
      if (q) between(c as Vec3, q as Vec3);
    }
  }
  // a mirror's normal may also lie along a two-fold axis (a cube's three face
  // planes are exactly those), so every axis direction is a candidate too
  for (const [key, v] of axisDirections) if (!normalDirections.has(key)) normalDirections.set(key, v);

  const turns = (axis: Vec3, order: number) => axisRotation(axis, (2 * Math.PI) / order);
  /** The largest order of rotation this axis carries, or 1 for none. A rotation
   * of order k has every divisor of k as a power of itself, so failing 2 rules
   * out 4 and 6 and failing 3 rules out 6 — which is what keeps this to three
   * probes for the many directions that carry nothing at all. */
  const orderOf = (axis: Vec3): number => {
    const two = fits(turns(axis, 2));
    const three = fits(turns(axis, 3));
    if (two && three && fits(turns(axis, 6))) return 6;
    if (two && fits(turns(axis, 4))) return 4;
    if (fits(turns(axis, 5))) return 5;
    return three ? 3 : two ? 2 : 1;
  };

  // The mirrors first, because they are what finds an axis that passes through
  // no point of the board at all: two mirror planes meet in a line, and that
  // line is a rotation axis. A cube *frame* is the case that needs it — its
  // four-fold axes go through the hole in the middle of each face, where there
  // is no cell, no corner and no edge to point at them. (A chiral solid has no
  // mirrors and no holes either, so its axes are all on the surface.)
  // Sorted throughout, so a board's symmetries come out the same every build.
  const normals: Vec3[] = [];
  for (const key of [...normalDirections.keys()].sort()) {
    const normal = normalDirections.get(key)!;
    if (fits(planeReflection(normal))) normals.push(normal);
  }
  for (let i = 0; i < normals.length; i++) {
    for (let j = i + 1; j < normals.length; j++) offer(axisDirections, cross(normals[i]!, normals[j]!));
  }
  const found: { axis: Vec3; order: number }[] = [];
  for (const key of [...axisDirections.keys()].sort()) {
    const axis = axisDirections.get(key)!;
    const order = orderOf(axis);
    if (order > 1) found.push({ axis, order });
  }
  if (found.length === 0 && normals.length === 0) return [];

  // ---- phase two: choose five, and let keepSymmetries rule on them ---------
  //
  // Five controls cannot be a group of forty-eight, so what is offered is a set
  // that generates it and nothing twice: three rotation axes and two mirror
  // planes, each taken once and struck off.
  found.sort((a, b) => b.order - a.order);
  const perpendicular = (a: Vec3, b: Vec3) => Math.abs(dot(a, b)) < 1e-6;
  const parallel = (a: Vec3, b: Vec3) => Math.abs(dot(a, b)) > 1 - 1e-6;

  const takenAxes = new Set<string>();
  /** The highest-order axis not yet spoken for, by the first of `wants` that
   * anything answers to. */
  const takeAxis = (...wants: ((axis: Vec3) => boolean)[]) => {
    for (const want of [...wants, () => true]) {
      for (const rotation of found) {
        const key = axisKey(rotation.axis)!;
        if (takenAxes.has(key) || !want(rotation.axis)) continue;
        takenAxes.add(key);
        return rotation;
      }
    }
    return null;
  };
  // The three axes a player expects of a cube: its own quarter turn, and two
  // more at right angles to it. Where the solid has no perpendicular pair — a
  // tetrahedron's three-fold axes are perpendicular to nothing — the second and
  // third fall back to any other axis, which still turns it somewhere new; and
  // where it has only one axis at all (a pyramid), there is nothing to fall
  // back to and it gets the one control it deserves.
  const ring = takeAxis();
  const principal = ring?.axis ?? null;
  const tube = principal && takeAxis((a) => perpendicular(a, principal));
  const turn =
    principal && tube
      ? takeAxis(
          (a) => perpendicular(a, principal) && perpendicular(a, tube.axis),
          (a) => perpendicular(a, principal),
        )
      : null;

  const takenNormals = new Set<string>();
  /** Unlike `takeAxis` this adds no catch-all: a caller that will settle for any
   * unused plane says so. */
  const takeNormal = (...wants: ((normal: Vec3) => boolean)[]) => {
    for (const want of wants) {
      for (const normal of normals) {
        const key = axisKey(normal)!;
        if (takenNormals.has(key) || !want(normal)) continue;
        takenNormals.add(key);
        return normal;
      }
    }
    return null;
  };
  // A mirror is named for the direction it reverses, as on a wrapped surface:
  // the plane *containing* the principal axis reverses the spin round it, and
  // the plane across it swaps the solid's two ends. An icosahedron has no plane
  // across its five-fold axis and a tetrahedron none across its three-fold one,
  // so the second falls back to a plane at some other angle, which is still a
  // second mirror and still worth a button.
  const mirrorRing = takeNormal(
    (n) => principal !== null && perpendicular(n, principal),
    () => true,
  );
  // No catch-all here: where every plane the solid has contains its principal
  // axis — a pyramid's four do — there is no second *kind* of mirror to offer,
  // and a button that repeated the first under another name would be a lie.
  const mirrorTube = principal
    ? takeNormal(
        (n) => parallel(n, principal),
        (n) => !perpendicular(n, principal),
      )
    : null;

  const candidates: SymmetryCandidate[] = [];
  const spin = (id: SymmetryId, r: { axis: Vec3; order: number } | null) => {
    if (r) candidates.push({ id, build: () => permutation(turns(r.axis, r.order)) });
  };
  const flip = (id: SymmetryId, normal: Vec3 | null) => {
    if (normal) candidates.push({ id, build: () => permutation(planeReflection(normal)) });
  };
  spin("ring", ring);
  spin("tube", tube);
  spin("turn", turn);
  flip("mirror-ring", mirrorRing);
  flip("mirror-tube", mirrorTube);
  return keepSymmetries(adjacency, candidates);
}
