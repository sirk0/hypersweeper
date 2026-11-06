// Drawing round edges. A tile's polygon stays exact (shape.ts); a round edge
// is drawn here as one symmetric cubic arc from corner to corner, bulging to
// its left or its right (`Bulge`), or as a wave, a cubic S whose two control
// points stand off to either side. The arc is the same seen from either end,
// so an edge drawn in from one tile and out from its neighbour is one line;
// the S is the same turned half a turn about its middle, so it is the same
// wave from both tiles.

import type { Ring } from "../geometry/cyclotomic";
import { isWave, type Bulge, type Piece, type XY } from "../geometry/shape";

/** One piece of a tile as drawn: its outline, in board units, and its round
 * edges, if it has them. A tile is one loop, or one per piece (the fish). */
export interface Loop {
  xy: XY[];
  curve?: readonly Bulge[] | undefined;
}

/** `pieces` as loops to draw. */
export function loopsOf(ring: Ring, pieces: readonly Piece[]): Loop[] {
  return pieces.map((p) => ({ xy: p.verts.map((v) => ring.toXY(v)), curve: p.curve }));
}

/** `loops` moved by `f` (a shift: the curves keep). */
export function shiftLoops(loops: readonly Loop[], f: (p: XY) => XY): Loop[] {
  return loops.map((l) => ({ xy: l.xy.map(f), curve: l.curve }));
}

/** One SVG path for a whole tile: a closed sub-path per loop. */
export function loopsPath(loops: readonly Loop[], map?: (p: XY) => XY): string {
  return loops.map((l) => outlinePath(l.xy, l.curve, map)).join("");
}

/** What bounds a whole tile as drawn (`reachPoints`, loop by loop). */
export function loopsReach(loops: readonly Loop[]): XY[] {
  return loops.flatMap((l) => reachPoints(l.xy, l.curve));
}

/** How far a round edge's control points stand off it, as a share of its
 * length — the arc's deepest point is three quarters of that — and how far
 * along it they sit from each end. Matched by eye to the Spectre as drawn by
 * its finders: deep, steep-sided bulges. */
const LIFT = 0.6;
const ALONG = 0.15;
/** A wave's: each half of the S about as deep as a third of an arc. */
const WAVE_LIFT = 0.55;
const WAVE_ALONG = 0.3;

/** The two control points of a round edge from `a` to `b`. */
function controls(a: XY, b: XY, bulge: Bulge): [XY, XY] {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const wave = isWave(bulge);
  const lift = wave ? WAVE_LIFT * Math.sign(bulge) : LIFT * bulge;
  const along = wave ? WAVE_ALONG : ALONG;
  // the left normal, (−dy, dx), times the lift, to the side it bulges; a
  // wave's second control point stands off to the other side
  const nx = -dy * lift;
  const ny = dx * lift;
  const back = wave ? -1 : 1;
  return [
    [a[0] + along * dx + nx, a[1] + along * dy + ny],
    [b[0] - along * dx + back * nx, b[1] - along * dy + back * ny],
  ];
}

const pt = ([x, y]: XY): string => `${x},${y}`;

/** One edge's path command, from wherever the path stands (`a`) to `b`: a
 * straight line, or the arc. `map` (affine: a camera, a y flip) is applied
 * after the arc is laid out, so it bulges the right way in board space. */
export function edgeTo(a: XY, b: XY, bulge: Bulge, map: (p: XY) => XY = (p) => p): string {
  if (!bulge) return `L${pt(map(b))}`;
  const [c1, c2] = controls(a, b, bulge);
  return `C${pt(map(c1))} ${pt(map(c2))} ${pt(map(b))}`;
}

/** An SVG path for the closed polygon `xy`, its edges round where `curve`
 * says (edge i from xy[i] to xy[i + 1]); straight where it is unset. */
export function outlinePath(xy: XY[], curve?: readonly Bulge[], map?: (p: XY) => XY): string {
  if (xy.length === 0) return "";
  const at = map ?? ((p: XY): XY => p);
  let d = `M${pt(at(xy[0]!))}`;
  xy.forEach((a, i) => {
    const b = xy[(i + 1) % xy.length]!;
    d += edgeTo(a, b, curve?.[i] ?? 0, at);
  });
  return d + "Z";
}

/** One open edge as a path of its own. */
export function edgePath(a: XY, b: XY, bulge: Bulge): string {
  return `M${pt(a)}${edgeTo(a, b, bulge)}`;
}

/** `xy` and points along its round edges' arcs: what bounds the drawn tile,
 * as its corners alone bound a straight one. */
export function reachPoints(xy: XY[], curve?: readonly Bulge[]): XY[] {
  if (!curve) return xy;
  const out = [...xy];
  xy.forEach((a, i) => {
    const bulge = curve[i] ?? 0;
    if (!bulge) return;
    const b = xy[(i + 1) % xy.length]!;
    const [c1, c2] = controls(a, b, bulge);
    for (let k = 1; k < 8; k++) {
      const t = k / 8;
      const u = 1 - t;
      const w = [u * u * u, 3 * u * u * t, 3 * u * t * t, t * t * t] as const;
      out.push([
        w[0] * a[0] + w[1] * c1[0] + w[2] * c2[0] + w[3] * b[0],
        w[0] * a[1] + w[1] * c1[1] + w[2] * c2[1] + w[3] * b[1],
      ]);
    }
  });
  return out;
}
