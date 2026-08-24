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
import type { AnyBoard, CellId, Vertex } from "./core";

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
 * the half turn, and no mirror across the tube. */
export function keepSymmetries(
  adjacency: Map<CellId, CellId[]>,
  candidates: readonly SymmetryCandidate[],
): BoardSymmetry[] {
  const kept: BoardSymmetry[] = [];
  for (const id of SYMMETRY_IDS) {
    for (const candidate of candidates) {
      if (candidate.id !== id) continue;
      const cycle = candidate.build();
      // An identity is a real symmetry and a useless button: a two-cell tube's
      // half turn, a mirror whose axis runs through every cell.
      if (!cycle || isIdentity(cycle) || !isAutomorphism(adjacency, cycle)) continue;
      const involution = isInvolution(cycle);
      if (!involution && id.startsWith("mirror-")) continue; // a glide, see above
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

function centroidOf(polygon: readonly Vertex[]): Vertex {
  let x = 0;
  let y = 0;
  for (const p of polygon) {
    x += p[0];
    y += p[1];
  }
  return [x / polygon.length, y / polygon.length];
}

/** Cell centres in a grid, so the image of a point is looked up rather than
 * searched for. */
class PointIndex {
  private readonly buckets = new Map<string, CellId[]>();

  constructor(
    private readonly points: Map<CellId, Vertex>,
    private readonly cell: number,
  ) {
    for (const [id, p] of points) {
      const key = this.key(p);
      const bucket = this.buckets.get(key);
      if (bucket) bucket.push(id);
      else this.buckets.set(key, [id]);
    }
  }

  private key(p: Vertex): string {
    return `${Math.floor(p[0] / this.cell)},${Math.floor(p[1] / this.cell)}`;
  }

  /** The nearest indexed point to `p`, and how far off it is. */
  nearest(p: Vertex): { id: CellId; distance: number } | null {
    const cx = Math.floor(p[0] / this.cell);
    const cy = Math.floor(p[1] / this.cell);
    let best: CellId | null = null;
    let bestDistance = Infinity;
    for (let dx = -1; dx <= 1; dx++) {
      for (let dy = -1; dy <= 1; dy++) {
        for (const id of this.buckets.get(`${cx + dx},${cy + dy}`) ?? []) {
          const q = this.points.get(id)!;
          const d = Math.hypot(q[0] - p[0], q[1] - p[1]);
          if (d < bestDistance) {
            bestDistance = d;
            best = id;
          }
        }
      }
    }
    return best === null ? null : { id: best, distance: bestDistance };
  }
}

/** A rigid motion of the plane, as a 2x2 matrix about a fixed centre. */
type PlaneMotion = (p: Vertex) => Vertex;

function rotation(centre: Vertex, angle: number): PlaneMotion {
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  return ([x, y]) => {
    const dx = x - centre[0];
    const dy = y - centre[1];
    return [centre[0] + c * dx - s * dy, centre[1] + s * dx + c * dy];
  };
}

/** Reflection in the line through `centre` at `angle` to the x axis. */
function reflection(centre: Vertex, angle: number): PlaneMotion {
  const c = Math.cos(2 * angle);
  const s = Math.sin(2 * angle);
  return ([x, y]) => {
    const dx = x - centre[0];
    const dy = y - centre[1];
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
 *
 * A candidate is not believed on its centres alone. Two tiles can be the same
 * distance apart and a different shape (the sphinx patch is one tile in four
 * orientations), so the whole polygon has to land on the target's, and the
 * permutation still has to be an automorphism of the adjacency.
 */
export function planeSymmetries(
  polygons: Map<CellId, Vertex[]>,
  adjacency: Map<CellId, CellId[]>,
): BoardSymmetry[] {
  if (polygons.size < 2) return [];
  const centres = new Map<CellId, Vertex>();
  let sx = 0;
  let sy = 0;
  for (const [cell, polygon] of polygons) {
    const c = centroidOf(polygon);
    centres.set(cell, c);
    sx += c[0];
    sy += c[1];
  }
  const centre: Vertex = [sx / centres.size, sy / centres.size];

  // A bucket a good deal wider than the closest two centres come, so a lookup
  // sweeps a 3x3 block and cannot miss its own answer.
  let extent = 0;
  for (const c of centres.values()) {
    extent = Math.max(extent, Math.abs(c[0] - centre[0]), Math.abs(c[1] - centre[1]));
  }
  if (extent === 0) return [];
  const index = new PointIndex(centres, (2 * extent) / Math.sqrt(centres.size) + 1e-9);
  let gap = Infinity;
  for (const [cell, c] of centres) {
    for (const other of adjacency.get(cell) ?? []) {
      const q = centres.get(other);
      if (q) gap = Math.min(gap, Math.hypot(q[0] - c[0], q[1] - c[1]));
    }
  }
  if (!Number.isFinite(gap) || gap <= 0) return [];
  const tolerance = gap * MATCH_FRACTION;

  /** The permutation a motion induces, or null when it is not a symmetry: some
   * cell's image is off the board, lands on a cell of a different shape, or two
   * cells land on one. */
  const permutation = (motion: PlaneMotion): Map<CellId, CellId> | null => {
    const moved = new Map<CellId, CellId>();
    for (const [cell, polygon] of polygons) {
      const hit = index.nearest(motion(centres.get(cell)!));
      if (hit === null || hit.distance > tolerance) return null;
      const target = polygons.get(hit.id)!;
      if (target.length !== polygon.length) return null;
      // the drawn tile has to land on the drawn tile, not merely its centre on
      // its centre: congruent tiles in different orientations share centres
      const taken = new Array<boolean>(target.length).fill(false);
      for (const vertex of polygon) {
        const [px, py] = motion(vertex);
        let found = false;
        for (let i = 0; i < target.length && !found; i++) {
          const q = target[i]!;
          if (!taken[i] && Math.hypot(q[0] - px, q[1] - py) <= tolerance) {
            taken[i] = true;
            found = true;
          }
        }
        if (!found) return null;
      }
      moved.set(cell, hit.id);
    }
    return moved;
  };

  // The outermost cell, and every cell that could be its image.
  const radius = (c: Vertex) => Math.hypot(c[0] - centre[0], c[1] - centre[1]);
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
  const fromAngle = Math.atan2(from[1] - centre[1], from[0] - centre[0]);

  const turns: number[] = [];
  const axes: number[] = [];
  for (const [cell, c] of centres) {
    if (Math.abs(radius(c) - farRadius) > tolerance) continue;
    const toAngle = Math.atan2(c[1] - centre[1], c[0] - centre[0]);
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
