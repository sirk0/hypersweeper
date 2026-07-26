import type { Vec3 } from "../boards/core";

// Cutting the drawn surface against a signed field (see SurfaceClip in
// boards/core): the Klein bottle's immersion passes through itself, and the
// sheet that ends up enclosed by the other one caps the view down the hole.
// The board says *where* the cut is; this is the geometry that performs it.

export type Tri = [Vec3, Vec3, Vec3];

/** A polygon as triangles fanned from a centre point, in polygon winding. */
export function fanTriangles(poly: readonly Vec3[], centre: Vec3): Tri[] {
  const out: Tri[] = [];
  for (let e = 0; e < poly.length; e++) {
    out.push([centre, poly[e]!, poly[(e + 1) % poly.length]!]);
  }
  return out;
}

// Splits per triangle before the linear cut below. The clip field is curved,
// so the zero crossing is only straight in the small: two 4-way splits put 16
// leaves under each triangle, enough for the cut edge to read as a curve on
// the handful of cells the clip reaches.
const CLIP_SUBDIVISIONS = 2;

/** Cut triangles down to the part of them where `field >= 0`, or pass them
 * through untouched when there is no field. */
export function clipTriangles(tris: Tri[], field: ((p: Vec3) => number) | null): Tri[] {
  if (!field) return tris;
  return tris.flatMap((tri) => subdivideAndClip(tri, field, CLIP_SUBDIVISIONS));
}

function subdivideAndClip(tri: Tri, field: (p: Vec3) => number, depth: number): Tri[] {
  if (depth <= 0) return clipLeaf(tri, field);
  const [a, b, c] = tri;
  const ab = midpoint(a, b);
  const bc = midpoint(b, c);
  const ca = midpoint(c, a);
  const parts: Tri[] = [
    [a, ab, ca],
    [ab, b, bc],
    [ca, bc, c],
    [ab, bc, ca],
  ];
  return parts.flatMap((part) => subdivideAndClip(part, field, depth - 1));
}

/** Marching triangles: keep the `field >= 0` side, cutting the two straddling
 * edges at their linearly interpolated zero crossing. Winding is preserved. */
function clipLeaf(tri: Tri, field: (p: Vec3) => number): Tri[] {
  const d = [field(tri[0]), field(tri[1]), field(tri[2])];
  const kept = d.map((v) => v >= 0);
  const count = kept.filter(Boolean).length;
  if (count === 3) return [tri];
  if (count === 0) return [];
  if (count === 1) {
    const i = kept.findIndex(Boolean);
    const j = (i + 1) % 3;
    const k = (i + 2) % 3;
    return [[tri[i]!, crossing(tri[i]!, tri[j]!, d[i]!, d[j]!), crossing(tri[i]!, tri[k]!, d[i]!, d[k]!)]];
  }
  const o = kept.findIndex((v) => !v); // the single vertex that is cut off
  const a = (o + 1) % 3;
  const b = (o + 2) % 3;
  const pa = crossing(tri[a]!, tri[o]!, d[a]!, d[o]!);
  const pb = crossing(tri[b]!, tri[o]!, d[b]!, d[o]!);
  return [
    [tri[a]!, tri[b]!, pb],
    [tri[a]!, pb, pa],
  ];
}

/** Where the segment p→q crosses field = 0, from the field's values there. */
function crossing(p: Vec3, q: Vec3, dp: number, dq: number): Vec3 {
  const t = dp === dq ? 0.5 : dp / (dp - dq);
  return [p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t, p[2] + (q[2] - p[2]) * t];
}

function midpoint(p: Vec3, q: Vec3): Vec3 {
  return [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2, (p[2] + q[2]) / 2];
}

/** Area-weighted centroid of a triangle set — where a cut cell's number sits,
 * so it lands on material that is still drawn. Null when nothing is left. */
export function triangleCentroid(tris: readonly Tri[]): Vec3 | null {
  const sum: Vec3 = [0, 0, 0];
  let weight = 0;
  for (const [a, b, c] of tris) {
    const area = triangleArea(a, b, c);
    if (!(area > 0)) continue;
    weight += area;
    sum[0] += ((a[0] + b[0] + c[0]) / 3) * area;
    sum[1] += ((a[1] + b[1] + c[1]) / 3) * area;
    sum[2] += ((a[2] + b[2] + c[2]) / 3) * area;
  }
  if (!weight) return null;
  return [sum[0] / weight, sum[1] / weight, sum[2] / weight];
}

function triangleArea(a: Vec3, b: Vec3, c: Vec3): number {
  const u: Vec3 = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
  const v: Vec3 = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
  return (
    Math.hypot(
      u[1] * v[2] - u[2] * v[1],
      u[2] * v[0] - u[0] * v[2],
      u[0] * v[1] - u[1] * v[0],
    ) / 2
  );
}
