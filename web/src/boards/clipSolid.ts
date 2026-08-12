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

/** The first piece that can reach up to `lo`. Pieces come out slab by slab
 * from the bottom, so their heights are sorted and this is a bisection. The
 * bound is inclusive: a flat cell can lie in a slab's own floor, and it is that
 * slab that has to cut it. */
function firstPiece(solid: readonly ClipPiece[], lo: number): number {
  let a = 0;
  let b = solid.length;
  while (a < b) {
    const m = (a + b) >> 1;
    if (solid[m]!.max[1] < lo) a = m + 1;
    else b = m;
  }
  return a;
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
function outsideBox(poly: readonly Vec3[], piece: ClipPiece): boolean {
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
