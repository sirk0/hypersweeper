// Tiles as exact polygons, and the rigid motions that put them on the board.
//
// A Shape is any simple polygon — convex or not (the chair, the tromino, the
// sphinx and the spectre are concave), with edges of any length (bricks,
// kites) — listed counter-clockwise with y up. A Pose is a Euclidean isometry
// that keeps the vertices in the shape's ring: a rotation by a power of ζ, an
// optional mirror, then a translation.

import type { Cyc, Ring } from "./cyclotomic";

export type XY = [number, number];

export interface Shape {
  ring: Ring;
  verts: Cyc[];
}

export interface Pose {
  /** Rotate by ζ^rot. */
  rot: number;
  /** Mirror in the x axis (complex conjugation) before rotating. */
  flip: boolean;
  /** Then translate. */
  t: Cyc;
}

/** The shape's vertices under `pose`, still counter-clockwise: a mirror
 * reverses the winding, so its vertex order is reversed back. */
export function posed(shape: Shape, pose: Pose): Cyc[] {
  const { ring } = shape;
  const z = ring.zeta(pose.rot);
  const out = shape.verts.map((v) => ring.add(ring.mul(z, pose.flip ? ring.conj(v) : v), pose.t));
  if (pose.flip) out.reverse();
  return out;
}

/** A regular polygon with unit sides, its first edge along the x axis from the
 * origin. Needs `sides` to divide the ring's order, so each turn is a power of
 * ζ. */
export function regular(ring: Ring, sides: number): Shape {
  if (ring.n % sides !== 0) throw new Error(`a ${sides}-gon does not fit ℤ[ζ${ring.n}]`);
  const step = ring.n / sides;
  const verts: Cyc[] = [ring.zero];
  for (let i = 1; i < sides; i++) verts.push(ring.add(verts[i - 1]!, ring.zeta((i - 1) * step)));
  return { ring, verts };
}

/** A closed path walked from the origin: each step is `len` unit edges in
 * direction ζ^dir. How a region outline is written exactly. */
export function walk(ring: Ring, steps: [dir: number, len: number][]): Cyc[] {
  const verts: Cyc[] = [];
  let at = ring.zero;
  for (const [dir, len] of steps) {
    for (let i = 0; i < len; i++) {
      verts.push(at);
      at = ring.add(at, ring.zeta(dir));
    }
  }
  if (!ring.isZero(at)) throw new Error("walk: path does not close");
  return verts;
}

// -- float measures, for drawing and for picking the nearest snap ------------

export function signedArea(pts: XY[]): number {
  let a = 0;
  for (let i = 0; i < pts.length; i++) {
    const [x0, y0] = pts[i]!;
    const [x1, y1] = pts[(i + 1) % pts.length]!;
    a += x0 * y1 - x1 * y0;
  }
  return a / 2;
}

/** The area centroid of a simple polygon. */
export function centroid(pts: XY[]): XY {
  let a = 0;
  let cx = 0;
  let cy = 0;
  for (let i = 0; i < pts.length; i++) {
    const [x0, y0] = pts[i]!;
    const [x1, y1] = pts[(i + 1) % pts.length]!;
    const c = x0 * y1 - x1 * y0;
    a += c;
    cx += (x0 + x1) * c;
    cy += (y0 + y1) * c;
  }
  return [cx / (3 * a), cy / (3 * a)];
}

/** Winding number of a closed loop of edges about p (float; p is assumed off
 * every edge — callers only ask about points well clear of them). */
export function winding(edges: Iterable<[XY, XY]>, p: XY): number {
  let w = 0;
  for (const [[ax, ay], [bx, by]] of edges) {
    const cross = (bx - ax) * (p[1] - ay) - (p[0] - ax) * (by - ay);
    if (ay <= p[1]) {
      if (by > p[1] && cross > 0) w++;
    } else if (by <= p[1] && cross < 0) w--;
  }
  return w;
}

export function loopEdges(pts: XY[]): [XY, XY][] {
  return pts.map((p, i) => [p, pts[(i + 1) % pts.length]!]);
}

/** The turns k (0..n-1) for which ζᵏ·`shape` is a translate of the vertex
 * set `verts` — how a tile of that shape sits in a given cell. Empty when the
 * cell is not that shape at all. */
export function turnsOnto(shape: Shape, verts: Cyc[]): number[] {
  const { ring } = shape;
  if (verts.length !== shape.verts.length) return [];
  const keys = new Set(verts.map((v) => ring.key(v)));
  const turns: number[] = [];
  for (let k = 0; k < ring.n; k++) {
    const turned = shape.verts.map((v) => ring.mul(ring.zeta(k), v));
    // a translate maps some turned vertex onto verts[0]; try each
    const fits = turned.some((p) => {
      const t = ring.sub(verts[0]!, p);
      return turned.every((q) => keys.has(ring.key(ring.add(q, t))));
    });
    if (fits) turns.push(k);
  }
  return turns;
}

/** The turns that carry `shape` onto a translate of itself — k = 0 always;
 * 0, 4, 8 for a triangle in ℤ[ζ12]; every 2 for a hexagon there. Two
 * orientations of a tile that differ by one of these are the same
 * orientation. */
export function selfTurns(shape: Shape): number[] {
  return turnsOnto(shape, shape.verts);
}

/** The polygon `verts` (counter-clockwise) moved to rest on its longest side:
 * that side along the x axis from the origin, the rest above it — how the
 * tray holds a tile. Every side must run along one of the ring's directions,
 * as every side of every tile here does. */
export function restFlat(ring: Ring, verts: Cyc[]): Shape {
  const xy = verts.map((v) => ring.toXY(v));
  const m = verts.length;
  let side = 0;
  let longest = -1;
  for (let i = 0; i < m; i++) {
    const [ax, ay] = xy[i]!;
    const [bx, by] = xy[(i + 1) % m]!;
    // which side to stand on is a choice among sides, not an identity: the
    // first of the longest, by a margin well past rounding
    const len = Math.hypot(bx - ax, by - ay);
    if (len > longest + 1e-9) [longest, side] = [len, i];
  }
  const from = verts[side]!;
  const along = ring.sub(verts[(side + 1) % m]!, from);
  for (let k = 0; k < ring.n; k++) {
    const turned = ring.mul(ring.zeta(k), along);
    const [x, y] = ring.toXY(turned);
    // ζ^k turns the side onto the positive x axis: its imaginary part is 0,
    // exactly, and it points right
    if (ring.isZero(ring.sub(turned, ring.conj(turned))) && x > 0 && Math.abs(y) < 1e-9) {
      // listed from the side it rests on, so its first side is the flat one
      const order = [...verts.slice(side), ...verts.slice(0, side)];
      return { ring, verts: order.map((v) => ring.mul(ring.zeta(k), ring.sub(v, from))) };
    }
  }
  throw new Error("restFlat: a side runs along no ring direction");
}
