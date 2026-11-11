// Drawing round edges. A tile's polygon stays exact (shape.ts); a round edge
// is drawn here as one symmetric cubic arc from corner to corner, bulging to
// its left or its right (`Bulge`). The arc is the same seen from either end,
// so an edge drawn in from one tile and out from its neighbour is one line.

import type { Ring } from "../geometry/cyclotomic";
import type { Bulge, Piece, XY } from "../geometry/shape";

/** One piece of a tile as drawn: its outline, in board units, and its round
 * edges, if it has them. A tile is one loop, or one per piece (the fish). */
export interface Loop {
  xy: XY[];
  curve?: readonly Bulge[] | undefined;
  /** Edge marks, on a coloured or lined tile (see view/decor.ts). */
  marks?: readonly number[] | undefined;
}

/** `pieces` as loops to draw. */
export function loopsOf(ring: Ring, pieces: readonly Piece[]): Loop[] {
  return pieces.map((p) => ({
    xy: p.verts.map((v) => ring.toXY(v)),
    curve: p.curve,
    marks: p.marks,
  }));
}

/** `loops` moved by `f` (a shift: the curves keep). */
export function shiftLoops(loops: readonly Loop[], f: (p: XY) => XY): Loop[] {
  return loops.map((l) => ({ xy: l.xy.map(f), curve: l.curve, marks: l.marks }));
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

/** The two control points of a round edge from `a` to `b`. */
function controls(a: XY, b: XY, bulge: Bulge): [XY, XY] {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  // the left normal, (−dy, dx), times the lift, to the side it bulges
  const nx = -dy * LIFT * bulge;
  const ny = dx * LIFT * bulge;
  return [
    [a[0] + ALONG * dx + nx, a[1] + ALONG * dy + ny],
    [b[0] - ALONG * dx + nx, b[1] - ALONG * dy + ny],
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

/** The point a share `t` along the edge a → b as drawn — on its arc, if it
 * is round — and the unit direction the edge runs there. The arc is the same
 * from either end, so `t` from one end is 1 − `t` from the other: two tiles'
 * marks on their shared edge land on one point. */
export function alongEdge(a: XY, b: XY, bulge: Bulge, t: number): { at: XY; dir: XY } {
  const unit = (x: number, y: number): XY => {
    const len = Math.hypot(x, y);
    return [x / len, y / len];
  };
  if (!bulge)
    return {
      at: [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t],
      dir: unit(b[0] - a[0], b[1] - a[1]),
    };
  const [c1, c2] = controls(a, b, bulge);
  const u = 1 - t;
  const w = [u * u * u, 3 * u * u * t, 3 * u * t * t, t * t * t] as const;
  // the derivative: 3[(1 − t)²(c1 − a) + 2(1 − t)t(c2 − c1) + t²(b − c2)]
  const d = [u * u, 2 * u * t, t * t] as const;
  return {
    at: [
      w[0] * a[0] + w[1] * c1[0] + w[2] * c2[0] + w[3] * b[0],
      w[0] * a[1] + w[1] * c1[1] + w[2] * c2[1] + w[3] * b[1],
    ],
    dir: unit(
      d[0] * (c1[0] - a[0]) + d[1] * (c2[0] - c1[0]) + d[2] * (b[0] - c2[0]),
      d[0] * (c1[1] - a[1]) + d[1] * (c2[1] - c1[1]) + d[2] * (b[1] - c2[1]),
    ),
  };
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
