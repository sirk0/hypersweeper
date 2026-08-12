import type { Vec3 } from "../boards/core";
import { subtractSolid, type ClipPiece, type Tri } from "../boards/clipSolid";

// Cutting the drawn surface against a `SurfaceClip` (see boards/core): the
// Klein bottle's immersion passes through itself, and the sheet that ends up
// enclosed by the other one caps the view down the hole. The board says
// *where* the cut is — as the enclosed region the other sheet's own drawn
// triangles bound, so the two meet along the exact polyline they really share
// — and `clipSolid.ts` performs it. This module is the renderer's face of
// that: the fan its meshes triangulate a cell with, the cut, and where a cut
// cell's number ends up.

export { fanTriangles, type Tri } from "../boards/clipSolid";

/** Cut triangles down to the part of them outside the clip's enclosed region,
 * or pass them through untouched when there is no clip. */
export function clipTriangles(tris: Tri[], solid: readonly ClipPiece[] | null): Tri[] {
  return subtractSolid(tris, solid);
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
