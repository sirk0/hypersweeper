// The view a board drawn in the upper half-plane (the binary tiling) is dragged
// by. Pure arithmetic, kept out of `renderer.ts` for the same reason `zoom.ts`
// and `disc.ts` are: it can be unit tested without a WebGL context.
//
// The orientation-preserving isometries of the upper half-plane that fix its
// point at infinity are z -> a z + b (a > 0, b real): a scaling about a point
// of the ideal line y = 0, then a slide along it. They act simply transitively
// -- exactly one takes any point to any other -- so the one that moves the
// point under the finger to where the finger went is the drag, with nothing
// left to choose (the disc's pan has to pick a diameter; this one does not).
// And each is a Euclidean similarity, which is the whole of why this needs no
// shader stage: it is a zoom and a pan of the ordinary flat camera. A bottom
// row dragged up is a bottom row magnified about the ideal line under it, and
// the rectangle the board is stays a rectangle, so the usual pan clamp is all
// the hold it needs.

/** The board-space map p -> a p + t (mesh units, y up) a drag asks for. */
export interface HalfPlaneMove {
  /** The magnification: the zoom is multiplied by it. */
  a: number;
  /** The translation, `[x, y]`. */
  t: readonly [number, number];
}

/** The half-plane isometry taking board point `from` to board point `to`, for
 * a board whose ideal line is at y = `line` (mesh units), with the zoom held to
 * [1, `maxZoom`] from its current `zoom`. Where the zoom is held the point
 * still follows the finger along the line, only no further across it. Null
 * when there is nothing to do, or when either point is on or past the ideal
 * line (the margin below the board), where no isometry reaches. */
export function halfPlaneDrag(
  from: readonly [number, number],
  to: readonly [number, number],
  line: number,
  zoom: number,
  maxZoom: number,
): HalfPlaneMove | null {
  const h0 = from[1] - line;
  const h1 = to[1] - line;
  if (!(h0 > 0) || !(h1 > 0)) return null;
  const next = Math.min(maxZoom, Math.max(1, zoom * (h1 / h0)));
  const a = next / zoom;
  const t: [number, number] = [to[0] - a * from[0], line * (1 - a)];
  if (a === 1 && t[0] === 0) return null;
  return { a, t };
}

/** Where the move draws board point `p`. */
export function halfPlaneApply(move: HalfPlaneMove, p: readonly [number, number]): [number, number] {
  return [move.a * p[0] + move.t[0], move.a * p[1] + move.t[1]];
}
