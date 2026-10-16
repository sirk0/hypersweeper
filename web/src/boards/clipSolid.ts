// The region a self-intersecting immersion encloses, taken from the geometry
// that is actually *drawn* rather than from the smooth surface behind it.
//
// A Klein board's neck passes through itself, and the sheet that ends up inside
// the other one has to come off or it caps the view down the bore. Cutting it
// against the analytic tube — the immersion's own circle at that height — is
// wrong twice over, because the board is drawn as flat tiles and the drawn tube
// is a *polygon* inscribed in that circle, lying inside it everywhere but at
// its corners. Cutting against the circle therefore
//
//   * eats tiles at the bottom of the bottle, where the two sheets converge on
//     one circle and the chords between them cross it, and
//   * leaves a slit along the self-intersection, because the cut edge follows
//     the circle while the tube that is meant to hide it follows the chords.
//
// Both go away if the cut is made against the drawn triangles, which is what
// this module does — exactly, with no sampling and no subdivision:
//
//   * The neck's cross-sections are horizontal, so slicing the tube at every
//     height one of its vertices sits at gives **slabs** inside which every
//     triangle either spans the full height or is absent altogether.
//   * Over one slab the tube is a band around its own axis, so what it encloses
//     splits into one **wedge** per triangle: the angular sector that triangle
//     spans, floored and ceiled by the slab and walled by the triangle's own
//     plane. Two triangles that share an edge share the sector wall through it,
//     so the wedges tile the interior with no gap and no overlap — an exact
//     decomposition of a region that is nowhere near convex, the drawn tube's
//     section being a star: a cell is fanned from its centroid, which on a
//     coarse board sits well inside the ring of its corners, so every cell of
//     the tube dips inward between them.
//   * A polygon minus a convex piece decomposes into convex parts
//     (`P \ ∩Hᵢ = ⋃ᵢ P ∩ H₁ ∩ … ∩ Hᵢ₋₁ ∩ ¬Hᵢ`), so subtracting the union is a
//     run of half-space clips and the cut lands on the exact polyline where
//     the two drawn sheets meet — one polyline per tiling and per size, since
//     that is what the tessellation makes it.
import type { Vec3 } from "./core";

export type Tri = [Vec3, Vec3, Vec3];

/** A half-space. Its inside is where `n·p + d <= 0`; `n` is a unit normal, so
 * the value is a signed distance. */
export interface ClipPlane {
  n: Vec3;
  d: number;
}

/** One convex piece of the enclosed region — the wedge between a slab's axis
 * and one triangle of the tube. The region is the union of them all. */
export interface ClipPiece {
  planes: ClipPlane[];
  min: Vec3;
  max: Vec3;
}

/** Below this share of a polygon's own area a surviving fragment is rounding
 * rather than geometry, and carrying it on would only fray the mesh. */
const SLIVER = 1e-7;

/** The tallest a slab may be, as a share of the tube's own height — see the
 * note on wedge walls in `buildClipSolid`. */
const SLAB_STEP = 1 / 128;

/** A polygon as triangles fanned from a centre point, in polygon winding. */
export function fanTriangles(poly: readonly Vec3[], centre: Vec3): Tri[] {
  const out: Tri[] = [];
  for (let e = 0; e < poly.length; e++) {
    out.push([centre, poly[e]!, poly[(e + 1) % poly.length]!]);
  }
  return out;
}

/** The part of `tris` at or below `y`, re-fanned. The Klein neck runs on past
 * its own tube into the belly, and up there the tube is no longer one loop per
 * height — nor is there anything left to cut, the other sheet ending at the
 * same seam — so the occluder is taken only as far as that seam. */
export function trianglesBelow(tris: readonly Tri[], y: number): Tri[] {
  const out: Tri[] = [];
  for (const t of tris) {
    const poly = clipHalf([t[0], t[1], t[2]], { n: [0, 1, 0], d: -y }, -1);
    for (let i = 1; i + 1 < poly.length; i++) out.push([poly[0]!, poly[i]!, poly[i + 1]!]);
  }
  return out;
}

/** The region a tube drawn as `tris` encloses, as convex pieces to be unioned.
 * `tris` must be a tube whose cross-sections are horizontal — every horizontal
 * plane through it meets it in one closed loop, star-shaped about its axis. */
export function buildClipSolid(tris: readonly Tri[]): ClipPiece[] {
  if (tris.length < 3) return [];
  const levels: number[] = [];
  for (const t of tris) for (const p of t) levels.push(p[1]);
  levels.sort((a, b) => a - b);
  const span = levels[levels.length - 1]! - levels[0]!;
  if (!(span > 0)) return [];
  // Vertex heights, merged: two vertices meant to sit on one rim can arrive
  // apart by a rounding of the wrap's own arithmetic, and a hairline slab
  // between them has no section worth the name.
  const eps = span * 1e-6;
  const rims: number[] = [];
  for (const y of levels) {
    if (!rims.length || y - rims[rims.length - 1]! > eps) rims.push(y);
  }
  // A wedge's two walls are pinned where its triangle crosses the slab's mid
  // height, and the crossing drifts as the tube leans, so a wedge is only
  // exactly its triangle's sector in the middle of its slab. Splitting a tall
  // slab into steps no deeper than SLAB_STEP shrinks that drift with it — the
  // one place this is an approximation, and the reason a four-domain board (a
  // tube two rows tall) comes out as sharp as a forty-domain one.
  const step = span * SLAB_STEP;
  const cuts: number[] = [];
  for (let i = 0; i < rims.length; i++) {
    cuts.push(rims[i]!);
    if (i + 1 === rims.length) break;
    const parts = Math.ceil((rims[i + 1]! - rims[i]!) / step);
    for (let j = 1; j < parts; j++) {
      cuts.push(rims[i]! + ((rims[i + 1]! - rims[i]!) * j) / parts);
    }
  }
  const pieces: ClipPiece[] = [];
  for (let k = 0; k + 1 < cuts.length; k++) {
    const yMin = cuts[k]!;
    const yMax = cuts[k + 1]!;
    const mid = (yMin + yMax) / 2;
    // Only triangles spanning the whole slab bound it over the whole slab —
    // which, the cuts being every vertex height, is all of the ones that meet
    // its interior at all.
    const spanning: Tri[] = [];
    const rim: Vec3[] = [];
    for (const t of tris) {
      const lo = Math.min(t[0][1], t[1][1], t[2][1]);
      const hi = Math.max(t[0][1], t[1][1], t[2][1]);
      if (lo > yMin + eps || hi < yMax - eps) continue;
      const seg = sliceTriangle(t, mid);
      if (!seg) continue;
      spanning.push(t);
      rim.push(seg[0], seg[1]);
    }
    if (rim.length < 6) continue; // fewer than three edges is no closed section
    const axis = mean(rim);
    const yBounds: ClipPlane[] = [
      { n: [0, -1, 0], d: yMin },
      { n: [0, 1, 0], d: -yMax },
    ];
    for (let i = 0; i < spanning.length; i++) {
      const piece = wedge(axis, spanning[i]!, rim[2 * i]!, rim[2 * i + 1]!, yBounds, yMin, yMax);
      if (piece) pieces.push(piece);
    }
  }
  return pieces;
}

/** The wedge between the slab's axis and one triangle of the tube: the
 * triangle's own plane, the two vertical planes through the axis and the
 * points where the triangle crosses the slab's mid height, and the slab's own
 * floor and ceiling. The two crossing points are on the edges the triangle
 * shares with its neighbours, and both neighbours build their wall from the
 * same point and the same axis — which is what makes the wedges meet exactly.
 * Null where the triangle stands on the axis and the wedge is flat. */
function wedge(
  axis: Vec3,
  t: Tri,
  left: Vec3,
  right: Vec3,
  yBounds: readonly ClipPlane[],
  yMin: number,
  yMax: number,
): ClipPiece | null {
  const face = planeThrough(t[0], t[1], t[2], axis);
  if (!face) return null;
  const a = radialWall(axis, left, right);
  const b = radialWall(axis, right, left);
  if (!a || !b) return null;
  const min: Vec3 = [Infinity, yMin, Infinity];
  const max: Vec3 = [-Infinity, yMax, -Infinity];
  for (const p of [axis, t[0], t[1], t[2]]) {
    for (const c of [0, 2]) {
      min[c] = Math.min(min[c]!, p[c]!);
      max[c] = Math.max(max[c]!, p[c]!);
    }
  }
  return { planes: [face, a, b, ...yBounds], min, max };
}

/** The vertical plane through the axis and `through`, facing so that `inside`
 * is on its inner side. */
function radialWall(axis: Vec3, through: Vec3, inside: Vec3): ClipPlane | null {
  const dx = through[0] - axis[0];
  const dz = through[2] - axis[2];
  const len = Math.hypot(dx, dz);
  if (!(len > 0)) return null;
  const n: Vec3 = [-dz / len, 0, dx / len];
  const d = -(n[0] * axis[0] + n[2] * axis[2]);
  const s = n[0] * inside[0] + n[2] * inside[2] + d;
  if (s === 0) return null;
  return s < 0 ? { n, d } : { n: [-n[0], 0, -n[2]], d: -d };
}

/** The plane through three points, oriented so `inside` is on its `<= 0` side.
 * Null when the three are collinear or `inside` lies on the plane. */
function planeThrough(a: Vec3, b: Vec3, c: Vec3, inside: Vec3): ClipPlane | null {
  const n = normalOf(a, b, c);
  if (!n) return null;
  const d = -dot(n, a);
  const s = dot(n, inside) + d;
  if (s === 0) return null;
  return s < 0 ? { n, d } : { n: [-n[0], -n[1], -n[2]], d: -d };
}

/** Cut `tris` down to the part of them outside `solid`, exactly. Passes the
 * geometry through untouched when there is nothing to subtract. */
export function subtractSolid(
  tris: readonly Tri[],
  solid: readonly ClipPiece[] | null,
): Tri[] {
  if (!solid || !solid.length) return tris as Tri[];
  const out: Tri[] = [];
  for (const tri of tris) {
    const keep = triangleArea(tri) * SLIVER;
    const lo = Math.min(tri[0][1], tri[1][1], tri[2][1]);
    const hi = Math.max(tri[0][1], tri[1][1], tri[2][1]);
    let polys: Vec3[][] = [[tri[0], tri[1], tri[2]]];
    for (let i = firstPiece(solid, lo); i < solid.length && solid[i]!.min[1] <= hi; i++) {
      if (!polys.length) break;
      const piece = solid[i]!;
      const next: Vec3[][] = [];
      for (const poly of polys) {
        if (outsideBox(poly, piece)) {
          next.push(poly);
          continue;
        }
        for (const part of subtractConvex(poly, piece.planes)) {
          if (polygonArea(part) > keep) next.push(part);
        }
      }
      polys = next;
    }
    for (const poly of polys) {
      for (let i = 1; i + 1 < poly.length; i++) out.push([poly[0]!, poly[i]!, poly[i + 1]!]);
    }
  }
  return out;
}

/** Total area of a triangle set. */
export function trianglesArea(tris: readonly Tri[]): number {
  let total = 0;
  for (const t of tris) total += triangleArea(t);
  return total;
}

/** Does the solid swallow any part of `tris` worth more than `minArea`? What
 * picks out the handful of cells the cut reaches, and exact where sampling
 * the polygon would miss a patch that sits wholly inside one big cell. */
export function reachesSolid(
  tris: readonly Tri[],
  solid: readonly ClipPiece[],
  minArea: number,
): boolean {
  let area = 0;
  for (const tri of tris) {
    const lo = Math.min(tri[0][1], tri[1][1], tri[2][1]);
    const hi = Math.max(tri[0][1], tri[1][1], tri[2][1]);
    for (let i = firstPiece(solid, lo); i < solid.length && solid[i]!.min[1] <= hi; i++) {
      const piece = solid[i]!;
      let poly: Vec3[] = [tri[0], tri[1], tri[2]];
      if (outsideBox(poly, piece)) continue;
      for (const h of piece.planes) {
        poly = clipHalf(poly, h, -1);
        if (poly.length < 3) break;
      }
      area += polygonArea(poly);
      if (area > minArea) return true;
    }
  }
  return false;
}

/** The part of `tris` *inside* `solid`, exactly — the complement of
 * `subtractSolid`, so the two partition a sheet between them. The pieces tile
 * the region with no overlap (see `buildClipSolid`), so the inside is each
 * triangle clipped down to each piece in turn. The one thing that could still
 * be counted twice is a polygon lying flat *in* a wall two pieces share — a
 * horizontal sheet at exactly a slab's height is in the floor of one slab and
 * the ceiling of the next — so a part lying in a wall is given to only one of
 * the two: the piece the wall's normal points out of the canonical way. */
export function intersectSolid(tris: readonly Tri[], solid: readonly ClipPiece[]): Tri[] {
  const out: Tri[] = [];
  for (const tri of tris) {
    const keep = triangleArea(tri) * SLIVER;
    for (const poly of insideParts(tri, solid)) {
      if (!(polygonArea(poly) > keep)) continue;
      for (let i = 1; i + 1 < poly.length; i++) out.push([poly[0]!, poly[i]!, poly[i + 1]!]);
    }
  }
  return out;
}

/** The parts of one triangle inside each piece of the solid it reaches, as
 * convex polygons (possibly degenerate — the caller weighs them). A part lying
 * flat in one of a piece's walls is kept by only one of the two pieces that
 * can share that wall (see `intersectSolid`). */
function insideParts(tri: Tri, solid: readonly ClipPiece[]): Vec3[][] {
  const out: Vec3[][] = [];
  const lo = Math.min(tri[0][1], tri[1][1], tri[2][1]);
  const hi = Math.max(tri[0][1], tri[1][1], tri[2][1]);
  pieces: for (let i = firstPiece(solid, lo); i < solid.length && solid[i]!.min[1] <= hi; i++) {
    const piece = solid[i]!;
    let poly: Vec3[] = [tri[0], tri[1], tri[2]];
    if (outsideBox(poly, piece)) continue;
    const flat = IN_WALL * Math.max(1, ...piece.max.map((v, a) => v - piece.min[a]!));
    for (const h of piece.planes) {
      if (!leansCanonical(h.n) && poly.every((p) => Math.abs(dot(h.n, p) + h.d) <= flat)) {
        continue pieces;
      }
      poly = clipHalf(poly, h, -1);
      if (poly.length < 3) break;
    }
    if (poly.length >= 3) out.push(poly);
  }
  return out;
}

/** How close to a wall, relative to the piece's size, a polygon must lie to be
 * lying *in* it: rounding, not geometry. */
const IN_WALL = 1e-9;

/** Whether a normal's first non-zero component, in y, x, z order, is positive.
 * Two pieces sharing a wall see it with opposite normals, so exactly one of
 * them has it canonical. */
function leansCanonical(n: Vec3): boolean {
  for (const a of [1, 0, 2]) {
    if (n[a]! > 0) return true;
    if (n[a]! < 0) return false;
  }
  return false;
}

/** Where two drawn sheets cross: the segments along which a triangle of `a`
 * passes through a triangle of `b`, exactly. Pairs that share a vertex are
 * skipped — sheets that meet along a common edge are joined there, not
 * crossing — and so are coplanar pairs, which touch rather than cross. */
export function crossingSegments(a: readonly Tri[], b: readonly Tri[]): [Vec3, Vec3][] {
  const boxes = b.map(triBox);
  const out: [Vec3, Vec3][] = [];
  for (const s of a) {
    const box = triBox(s);
    for (let j = 0; j < b.length; j++) {
      const bb = boxes[j]!;
      if (
        box.max[0] < bb.min[0] || box.min[0] > bb.max[0] ||
        box.max[1] < bb.min[1] || box.min[1] > bb.max[1] ||
        box.max[2] < bb.min[2] || box.min[2] > bb.max[2]
      ) {
        continue;
      }
      const t = b[j]!;
      if (s.some((p) => t.some((q) => p[0] === q[0] && p[1] === q[1] && p[2] === q[2]))) continue;
      const seg = triangleCrossing(s, t);
      if (seg) out.push(seg);
    }
  }
  return out;
}

/** The segment two triangles share where they pass through each other, or null
 * where they miss, touch, or lie in one plane. Each triangle is cut by the
 * other's plane; the two cuts lie on the planes' common line, and what they
 * share of it is the crossing. */
function triangleCrossing(s: Tri, t: Tri): [Vec3, Vec3] | null {
  const ns = normalOf(s[0], s[1], s[2]);
  const nt = normalOf(t[0], t[1], t[2]);
  if (!ns || !nt) return null;
  const cutS = cutByPlane(s, nt, -dot(nt, t[0]));
  if (!cutS) return null;
  const cutT = cutByPlane(t, ns, -dot(ns, s[0]));
  if (!cutT) return null;
  const dir: Vec3 = [
    ns[1] * nt[2] - ns[2] * nt[1],
    ns[2] * nt[0] - ns[0] * nt[2],
    ns[0] * nt[1] - ns[1] * nt[0],
  ];
  if (!(Math.hypot(dir[0], dir[1], dir[2]) > 1e-12)) return null;
  const along = (p: Vec3) => dot(dir, p);
  const [s0, s1] = [along(cutS[0]), along(cutS[1])];
  const [t0, t1] = [along(cutT[0]), along(cutT[1])];
  const lo = Math.max(Math.min(s0, s1), Math.min(t0, t1));
  const hi = Math.min(Math.max(s0, s1), Math.max(t0, t1));
  if (!(hi > lo)) return null;
  // Both cuts lie on the one line, so the overlap's ends are points of either.
  const at = (v: number): Vec3 => {
    const [p, q] = cutS;
    const [pv, qv] = [along(p), along(q)];
    const k = qv === pv ? 0 : (v - pv) / (qv - pv);
    return [p[0] + (q[0] - p[0]) * k, p[1] + (q[1] - p[1]) * k, p[2] + (q[2] - p[2]) * k];
  };
  return [at(lo), at(hi)];
}

/** Where a triangle crosses the plane `n·p + d = 0`, as a segment; null where
 * it lies wholly to one side, only touches, or lies in the plane. */
function cutByPlane(t: Tri, n: Vec3, d: number): [Vec3, Vec3] | null {
  const dist = t.map((p) => dot(n, p) + d);
  const scale = Math.max(...t.map((p) => Math.abs(p[0]) + Math.abs(p[1]) + Math.abs(p[2])), 1);
  const eps = 1e-12 * scale;
  if (dist.every((v) => v >= -eps) || dist.every((v) => v <= eps)) return null;
  const hits: Vec3[] = [];
  for (let i = 0; i < 3; i++) {
    const a = t[i]!;
    const b = t[(i + 1) % 3]!;
    const da = dist[i]!;
    const db = dist[(i + 1) % 3]!;
    if ((da < 0 && db > 0) || (da > 0 && db < 0)) {
      const k = da / (da - db);
      hits.push([a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k]);
    } else if (da === 0) {
      hits.push(a);
    }
  }
  return hits.length >= 2 ? [hits[0]!, hits[1]!] : null;
}

function triBox(t: Tri): { min: Vec3; max: Vec3 } {
  return {
    min: [
      Math.min(t[0][0], t[1][0], t[2][0]),
      Math.min(t[0][1], t[1][1], t[2][1]),
      Math.min(t[0][2], t[1][2], t[2][2]),
    ],
    max: [
      Math.max(t[0][0], t[1][0], t[2][0]),
      Math.max(t[0][1], t[1][1], t[2][1]),
      Math.max(t[0][2], t[1][2], t[2][2]),
    ],
  };
}

/** Everything within `r` of the segment `ab`, as one convex piece: a prism of
 * `CAPSULE_SIDES` faces round it, each standing `r` off the axis, with ends
 * rounded off by rings of faces at `CAPSULE_ELEVATIONS` and a flat cap `r`
 * past either end — so the round capsule fits inside and no corner reaches past
 * about 1.17 `r`. A union of these along a polyline is a band of width `r`
 * round it, whatever angle the surfaces it is cut into meet at. The ends have
 * to be rounded: square caps poke a corner out at every bend of the polyline,
 * and the band came out saw-toothed. */
export function capsulePiece(a: Vec3, b: Vec3, r: number): ClipPiece {
  const ab: Vec3 = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
  const len = Math.hypot(ab[0], ab[1], ab[2]);
  const u: Vec3 = len > 0 ? [ab[0] / len, ab[1] / len, ab[2] / len] : [1, 0, 0];
  const ref: Vec3 = Math.abs(u[0]) < 0.9 ? [1, 0, 0] : [0, 1, 0];
  const e1 = unit([
    u[1] * ref[2] - u[2] * ref[1],
    u[2] * ref[0] - u[0] * ref[2],
    u[0] * ref[1] - u[1] * ref[0],
  ]);
  const e2: Vec3 = [
    u[1] * e1[2] - u[2] * e1[1],
    u[2] * e1[0] - u[0] * e1[2],
    u[0] * e1[1] - u[1] * e1[0],
  ];
  const planes: ClipPlane[] = [];
  /** The face whose outward normal is `n`, standing `r` off `at`. */
  const face = (n: Vec3, at: Vec3) => planes.push({ n, d: -dot(n, at) - r });
  for (let k = 0; k < CAPSULE_SIDES; k++) {
    const th = (2 * k * Math.PI) / CAPSULE_SIDES;
    const w: Vec3 = [
      Math.cos(th) * e1[0] + Math.sin(th) * e2[0],
      Math.cos(th) * e1[1] + Math.sin(th) * e2[1],
      Math.cos(th) * e1[2] + Math.sin(th) * e2[2],
    ];
    face(w, a);
    for (const el of CAPSULE_ELEVATIONS) {
      const [c, s] = [Math.cos(el), Math.sin(el)];
      face([c * w[0] + s * u[0], c * w[1] + s * u[1], c * w[2] + s * u[2]], b);
      face([c * w[0] - s * u[0], c * w[1] - s * u[1], c * w[2] - s * u[2]], a);
    }
  }
  face(u, b);
  face([-u[0], -u[1], -u[2]], a);
  const reach = 1.1 * r;
  const min: Vec3 = [0, 1, 2].map((i) => Math.min(a[i]!, b[i]!) - reach) as Vec3;
  const max: Vec3 = [0, 1, 2].map((i) => Math.max(a[i]!, b[i]!) + reach) as Vec3;
  return { planes, min, max };
}

/** A capsule's faces round its axis, and the elevations of the rings that
 * round off its ends: no corner reaches past 1 / cos²(22.5°), about 1.17, of
 * its radius. Every face is a cut a polygon may be split along, so this is a
 * trade: twelve sides and two rings took a corner in to 1.07 and cost a Klein
 * board a quarter more to build, for a band edge that looks the same. */
const CAPSULE_SIDES = 8;
const CAPSULE_ELEVATIONS = [Math.PI / 4];

/** Crossing segments joined end to end into polylines and simplified to
 * within `tolerance` (Douglas–Peucker). The drawn crossing comes out as one
 * short segment per pair of triangles that cross, and a capsule each is dozens
 * of heavily overlapping pieces that a cut has to work through one by one;
 * a few longer ones make the same band. */
export function crossingPolylines(
  segments: readonly (readonly [Vec3, Vec3])[],
  tolerance: number,
): Vec3[][] {
  const scale = Math.max(
    1,
    ...segments.flatMap(([a, b]) => [Math.abs(a[0]), Math.abs(a[1]), Math.abs(a[2]), Math.abs(b[0])]),
  );
  const eps = 1e-7 * scale;
  const same = (p: Vec3, q: Vec3) =>
    Math.abs(p[0] - q[0]) <= eps && Math.abs(p[1] - q[1]) <= eps && Math.abs(p[2] - q[2]) <= eps;
  const unused = new Set(segments.map((_, i) => i));
  const lines: Vec3[][] = [];
  while (unused.size) {
    const first = unused.values().next().value as number;
    unused.delete(first);
    const line: Vec3[] = [segments[first]![0], segments[first]![1]];
    for (const atEnd of [true, false]) {
      for (;;) {
        const tip = atEnd ? line[line.length - 1]! : line[0]!;
        let next: Vec3 | null = null;
        for (const i of unused) {
          const [a, b] = segments[i]!;
          if (same(a, tip)) next = b;
          else if (same(b, tip)) next = a;
          if (next) {
            unused.delete(i);
            break;
          }
        }
        if (!next) break;
        if (atEnd) line.push(next);
        else line.unshift(next);
      }
    }
    lines.push(simplify(line, tolerance));
  }
  return lines;
}

/** Douglas–Peucker: the fewest of `line`'s points that keep every dropped one
 * within `tolerance` of the line through the kept ones either side. */
function simplify(line: readonly Vec3[], tolerance: number): Vec3[] {
  if (line.length <= 2) return [...line];
  const a = line[0]!;
  const b = line[line.length - 1]!;
  let far = -1;
  let worst = tolerance;
  for (let i = 1; i + 1 < line.length; i++) {
    const d = segmentDistance(line[i]!, a, b);
    if (d > worst) {
      worst = d;
      far = i;
    }
  }
  if (far < 0) return [a, b];
  const left = simplify(line.slice(0, far + 1), tolerance);
  return [...left.slice(0, -1), ...simplify(line.slice(far), tolerance)];
}

function segmentDistance(p: Vec3, a: Vec3, b: Vec3): number {
  const ab: Vec3 = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
  const ap: Vec3 = [p[0] - a[0], p[1] - a[1], p[2] - a[2]];
  const len2 = dot(ab, ab);
  const k = len2 > 0 ? Math.max(0, Math.min(1, dot(ap, ab) / len2)) : 0;
  return Math.hypot(ap[0] - ab[0] * k, ap[1] - ab[1] * k, ap[2] - ab[2] * k);
}

/** Pieces put in the order every query here relies on: by the height of their
 * floors (see `firstPiece`). */
export function byFloor(pieces: ClipPiece[]): ClipPiece[] {
  return pieces.sort((p, q) => p.min[1] - q.min[1]);
}

/** The part of `tris` inside a union of pieces that may **overlap** — a
 * collar's capsules, unlike a tube's slabs, share ground with their
 * neighbours — with nothing counted twice: each piece takes its share of what
 * the ones before it left. */
export function intersectUnion(tris: readonly Tri[], pieces: readonly ClipPiece[]): Tri[] {
  const out: Tri[] = [];
  let rest = tris as Tri[];
  for (const piece of pieces) {
    if (!rest.length) break;
    if (rest.every((t) => outsideBox([t[0], t[1], t[2]], piece))) continue;
    out.push(...intersectSolid(rest, [piece]));
    rest = subtractSolid(rest, [piece]);
  }
  return out;
}

function unit(v: Vec3): Vec3 {
  const l = Math.hypot(v[0], v[1], v[2]);
  return [v[0] / l, v[1] / l, v[2] / l];
}

/** The box the whole region fits in, or null for an empty one. */
export function solidBounds(solid: readonly ClipPiece[]): { min: Vec3; max: Vec3 } | null {
  if (!solid.length) return null;
  const min: Vec3 = [Infinity, Infinity, Infinity];
  const max: Vec3 = [-Infinity, -Infinity, -Infinity];
  for (const piece of solid) {
    for (let a = 0; a < 3; a++) {
      min[a] = Math.min(min[a]!, piece.min[a]!);
      max[a] = Math.max(max[a]!, piece.max[a]!);
    }
  }
  return { min, max };
}

/** Does the polygon reach into the box? Touching counts, as in `outsideBox`. */
export function touchesBox(poly: readonly Vec3[], box: { min: Vec3; max: Vec3 }): boolean {
  return !outsideBox(poly, box);
}

/** The pieces that can reach any of `polys`, in the same order — the rest of
 * the decomposition has nothing left to subtract from and need not be kept. */
export function pruneSolid(
  solid: readonly ClipPiece[],
  polys: readonly (readonly Vec3[])[],
): ClipPiece[] {
  const boxes = polys.map((poly) => {
    const min: Vec3 = [Infinity, Infinity, Infinity];
    const max: Vec3 = [-Infinity, -Infinity, -Infinity];
    for (const p of poly) {
      for (let a = 0; a < 3; a++) {
        min[a] = Math.min(min[a]!, p[a]!);
        max[a] = Math.max(max[a]!, p[a]!);
      }
    }
    return { min, max };
  });
  // Touching counts as reaching, exactly as `outsideBox` has it.
  return solid.filter((piece) =>
    boxes.some((box) => {
      for (let a = 0; a < 3; a++) {
        if (box.max[a]! < piece.min[a]! || box.min[a]! > piece.max[a]!) return false;
      }
      return true;
    }),
  );
}

/** The first piece that can reach up to `lo`. Every region here lists its
 * pieces by the height of their floors (`min[1]`), which is what lets a scan
 * stop at the first piece starting above what it is looking for. Where to
 * *start* is a bisection on the running highest top so far: a slab tube's
 * pieces come out slab by slab and their tops are sorted already, but a
 * collar's capsules lean every which way, and only the running maximum is
 * monotone for both. The bound is inclusive: a flat cell can lie in a slab's
 * own floor, and it is that slab that has to cut it. */
function firstPiece(solid: readonly ClipPiece[], lo: number): number {
  const tops = runningTops(solid);
  let a = 0;
  let b = solid.length;
  while (a < b) {
    const m = (a + b) >> 1;
    if (tops[m]! < lo) a = m + 1;
    else b = m;
  }
  return a;
}

const topsCache = new WeakMap<readonly ClipPiece[], Float64Array>();

function runningTops(solid: readonly ClipPiece[]): Float64Array {
  let tops = topsCache.get(solid);
  if (!tops || tops.length !== solid.length) {
    tops = new Float64Array(solid.length);
    let top = -Infinity;
    for (let i = 0; i < solid.length; i++) {
      top = Math.max(top, solid[i]!.max[1]);
      tops[i] = top;
    }
    topsCache.set(solid, tops);
  }
  return tops;
}

/** Whether a point is inside the tube the occluder draws, by parity of a ray
 * cast through its own horizontal cross-section. Exact, and independent of the
 * decomposition above — which is what makes it worth testing against. */
export function insideOccluder(occluder: readonly Tri[], p: Vec3): boolean {
  let crossings = 0;
  for (const t of occluder) {
    const seg = sliceTriangle(t, p[1]);
    if (!seg) continue;
    if (raySplits(p, seg[0], seg[1])) crossings++;
  }
  return crossings % 2 === 1;
}

/** Does the +x ray from `p` cross the segment a–b, in the x–z plane? */
function raySplits(p: Vec3, a: Vec3, b: Vec3): boolean {
  if (a[2] > p[2] === b[2] > p[2]) return false;
  const t = (p[2] - a[2]) / (b[2] - a[2]);
  return a[0] + (b[0] - a[0]) * t > p[0];
}

/** Signed depth of a point: negative inside the solid, positive outside, and
 * how far in each direction. Zero on any internal face of the decomposition,
 * so read the sign, not the size. */
export function solidDepth(solid: readonly ClipPiece[], p: Vec3): number {
  let best = Infinity;
  for (let i = firstPiece(solid, p[1]); i < solid.length && solid[i]!.min[1] <= p[1]; i++) {
    const piece = solid[i]!;
    if (
      p[0] < piece.min[0] || p[0] > piece.max[0] ||
      p[1] < piece.min[1] || p[1] > piece.max[1] ||
      p[2] < piece.min[2] || p[2] > piece.max[2]
    ) {
      continue;
    }
    let worst = -Infinity;
    for (const h of piece.planes) worst = Math.max(worst, dot(h.n, p) + h.d);
    best = Math.min(best, worst);
  }
  return best;
}

/** Is the polygon clear of the piece's box? Touching does not count as clear:
 * a flat cell can lie in a slab's own floor, and that slab still has to cut
 * it — the bottom of the Klein bottle is exactly such a cell. */
function outsideBox(poly: readonly Vec3[], piece: { min: Vec3; max: Vec3 }): boolean {
  for (let a = 0; a < 3; a++) {
    let lo = Infinity;
    let hi = -Infinity;
    for (const p of poly) {
      lo = Math.min(lo, p[a]!);
      hi = Math.max(hi, p[a]!);
    }
    if (hi < piece.min[a]! || lo > piece.max[a]!) return true;
  }
  return false;
}

/** `poly` minus the convex intersection of `planes`, as convex parts: peel off
 * what lies outside each half-space in turn and keep narrowing the rest, which
 * is exactly what the intersection swallows.
 *
 * A plane the polygon only *touches* is settled before it is cut, and settled
 * as a plane that takes nothing: a flat cell lying in a slab's own floor would
 * otherwise come out both peeled off and kept, and be drawn twice. The Klein
 * bottle has such cells — the fold at the bottom is horizontal, and the slabs
 * are cut at exactly the heights its vertices sit at. */
function subtractConvex(poly: Vec3[], planes: readonly ClipPlane[]): Vec3[][] {
  const out: Vec3[][] = [];
  let rest = poly;
  for (const h of planes) {
    if (rest.length < 3) return out;
    let lo = Infinity;
    let hi = -Infinity;
    for (const p of rest) {
      const d = dot(h.n, p) + h.d;
      lo = Math.min(lo, d);
      hi = Math.max(hi, d);
    }
    if (hi <= 0) continue; // nothing of `rest` lies outside this half-space
    if (lo >= 0) {
      out.push(rest); // none of it lies inside: the whole of it survives
      return out;
    }
    const outside = clipHalf(rest, h, 1);
    if (outside.length >= 3) out.push(outside);
    rest = clipHalf(rest, h, -1);
  }
  return out;
}

/** Sutherland–Hodgman: the part of a convex polygon where
 * `side * (n·p + d) >= 0`. */
function clipHalf(poly: readonly Vec3[], h: ClipPlane, side: 1 | -1): Vec3[] {
  const n = poly.length;
  const dist = poly.map((p) => side * (dot(h.n, p) + h.d));
  const out: Vec3[] = [];
  for (let i = 0; i < n; i++) {
    const a = poly[i]!;
    const b = poly[(i + 1) % n]!;
    const da = dist[i]!;
    const db = dist[(i + 1) % n]!;
    if (da >= 0) out.push(a);
    if ((da > 0 && db < 0) || (da < 0 && db > 0)) {
      const t = da / (da - db);
      out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]);
    }
  }
  return out;
}

/** Where a triangle meets the horizontal plane at `y`, as a segment. */
function sliceTriangle(t: Tri, y: number): [Vec3, Vec3] | null {
  const hits: Vec3[] = [];
  for (let i = 0; i < 3; i++) {
    const a = t[i]!;
    const b = t[(i + 1) % 3]!;
    const da = a[1] - y;
    const db = b[1] - y;
    if ((da > 0 && db > 0) || (da < 0 && db < 0)) continue;
    if (da === db) continue; // an edge lying in the plane: the other two carry
    const s = da / (da - db); // its ends
    if (s < 0 || s > 1) continue;
    hits.push([a[0] + (b[0] - a[0]) * s, y, a[2] + (b[2] - a[2]) * s]);
  }
  if (hits.length < 2) return null;
  return [hits[0]!, hits[hits.length - 1]!];
}

function normalOf(a: Vec3, b: Vec3, c: Vec3): Vec3 | null {
  const u: Vec3 = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
  const v: Vec3 = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
  const n: Vec3 = [
    u[1] * v[2] - u[2] * v[1],
    u[2] * v[0] - u[0] * v[2],
    u[0] * v[1] - u[1] * v[0],
  ];
  const len = Math.hypot(n[0], n[1], n[2]);
  if (!(len > 0)) return null;
  return [n[0] / len, n[1] / len, n[2] / len];
}

function triangleArea(t: Tri): number {
  const n = normalOf(t[0], t[1], t[2]);
  if (!n) return 0;
  return polygonArea([t[0], t[1], t[2]]);
}

function polygonArea(poly: readonly Vec3[]): number {
  if (poly.length < 3) return 0;
  const n: Vec3 = [0, 0, 0];
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i]!;
    const b = poly[(i + 1) % poly.length]!;
    n[0] += a[1] * b[2] - a[2] * b[1];
    n[1] += a[2] * b[0] - a[0] * b[2];
    n[2] += a[0] * b[1] - a[1] * b[0];
  }
  return Math.hypot(n[0], n[1], n[2]) / 2;
}

function dot(a: Vec3, b: Vec3): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

function mean(points: readonly Vec3[]): Vec3 {
  const c: Vec3 = [0, 0, 0];
  for (const p of points) {
    c[0] += p[0];
    c[1] += p[1];
    c[2] += p[2];
  }
  return [c[0] / points.length, c[1] / points.length, c[2] / points.length];
}
