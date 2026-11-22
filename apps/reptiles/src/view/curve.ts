// Drawing round edges. A tile's polygon stays exact (shape.ts); a round edge
// is drawn here as one symmetric cubic arc from corner to corner, bulging to
// its left or its right (`Bulge`). The arc is the same seen from either end,
// so an edge drawn in from one tile and out from its neighbour is one line.
//
// A jigsaw edge (`jigsaw` in geometry/marks.ts) is drawn here too, from its
// mark: a knob standing out of the tile or the socket it fits, each knob
// symmetric about the middle of its edge, so one tile's knob drawn from a to
// b is the very line of its neighbour's socket drawn from b to a; or a seam,
// straight or an S (a knob on its first half, a socket on its second), which
// drawn from either end is the same line.

import type { Ring } from "../geometry/cyclotomic";
import { KNOB_SIZES, SEAM_FLAT, SEAM_S, jigsaw } from "../geometry/marks";
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
  return loops.map((l) => outlinePath(l.xy, l.curve, map, l.marks)).join("");
}

/** What bounds a whole tile as drawn (`reachPoints`, loop by loop). */
export function loopsReach(loops: readonly Loop[]): XY[] {
  return loops.flatMap((l) => reachPoints(l.xy, l.curve, l.marks));
}

/** A step of a jigsaw edge's outline, in the edge's own frame: `t` along it
 * from its start (0) to its end (1), `h` out of the tile — to the right of
 * the edge, the tile being on its left — both in edge lengths. A line to
 * `p`, or a cubic through `c1` and `c2` to `p`. */
type Step = { p: XY } | { c1: XY; c2: XY; p: XY };

/** Each knob's first half, from where it leaves the edge to its middle
 * (t = 0.5); the second half is the first seen in a mirror, so every knob is
 * symmetric about its middle. Shapes told apart at a glance: a round head,
 * a square one, an arrowhead, two small round heads, a dovetail and a wide
 * flat head — each on a neck narrower than its head, as a jigsaw's is. */
const KNOB_HALVES: Step[][] = [
  // a round head
  [
    { p: [0.4, 0] },
    { c1: [0.45, 0], c2: [0.455, 0.035], p: [0.43, 0.07] },
    { c1: [0.39, 0.12], c2: [0.42, 0.21], p: [0.5, 0.21] },
  ],
  // a square head
  [
    { p: [0.455, 0] },
    { p: [0.455, 0.08] },
    { p: [0.375, 0.08] },
    { p: [0.375, 0.19] },
    { p: [0.5, 0.19] },
  ],
  // an arrowhead
  [{ p: [0.455, 0] }, { p: [0.455, 0.07] }, { p: [0.37, 0.085] }, { p: [0.5, 0.23] }],
  // two small round heads
  [
    { p: [0.33, 0] },
    { c1: [0.36, 0], c2: [0.365, 0.025], p: [0.35, 0.05] },
    { c1: [0.33, 0.085], c2: [0.35, 0.13], p: [0.39, 0.13] },
    { c1: [0.43, 0.13], c2: [0.45, 0.085], p: [0.43, 0.05] },
    { c1: [0.415, 0.025], c2: [0.42, 0], p: [0.45, 0] },
    { p: [0.5, 0] },
  ],
  // a dovetail
  [{ p: [0.45, 0] }, { p: [0.38, 0.17] }, { p: [0.5, 0.17] }],
  // a wide flat head
  [
    { p: [0.45, 0] },
    { c1: [0.47, 0.02], c2: [0.47, 0.05], p: [0.43, 0.065] },
    { c1: [0.33, 0.085], c2: [0.31, 0.16], p: [0.5, 0.16] },
  ],
];

/** `steps` (from the edge's start) seen in a mirror across t = `centre`, run
 * the other way: what follows them on, to the mirror image of the edge's
 * start. */
function mirrorSteps(steps: readonly Step[], centre = 0.5): Step[] {
  const m = ([t, h]: XY): XY => [2 * centre - t, h];
  // the points the steps pass, start first: each step runs from the one
  // before's `p`
  const out: Step[] = [];
  for (let i = steps.length - 1; i >= 0; i--) {
    const step = steps[i]!;
    const from = i > 0 ? steps[i - 1]!.p : ([0, 0] as XY);
    out.push("c1" in step ? { c1: m(step.c2), c2: m(step.c1), p: m(from) } : { p: m(from) });
  }
  return out;
}

/** A whole knob, standing out, from the edge's start to its end. */
const KNOBS_WHOLE: Step[][] = KNOB_HALVES.map((half) => [...half, ...mirrorSteps(half)]);

/** The S seam: a small round knob out on the first half of the edge and a
 * socket for it on the second, the one the other turned half round about
 * the middle — so the S drawn from either end is the same line. */
const S_SEAM: Step[] = (() => {
  // a small round knob between t = 0.15 and 0.45, from its start
  const half: Step[] = [
    { p: [0.24, 0] },
    { c1: [0.27, 0], c2: [0.275, 0.025], p: [0.26, 0.05] },
    { c1: [0.235, 0.085], c2: [0.255, 0.14], p: [0.3, 0.14] },
  ];
  // …to t = 0.36, where it meets the edge again
  const knob = [...half, ...mirrorSteps(half, 0.3).slice(0, -1)];
  const turn = ([t, h]: XY): XY => [1 - t, -h];
  // the socket: the knob turned half round, run from its far end back, on
  // to the edge's end
  const pts = [[0, 0] as XY, ...knob.map((s) => s.p)];
  const socket: Step[] = [];
  for (let i = knob.length - 1; i >= 0; i--) {
    const step = knob[i]!;
    const from = pts[i]!;
    socket.push(
      "c1" in step ? { c1: turn(step.c2), c2: turn(step.c1), p: turn(from) } : { p: turn(from) },
    );
  }
  return [...knob, { p: turn(pts[pts.length - 1]!) }, ...socket];
})();

/** A jigsaw edge's steps, in the edge's frame, from its mark; null for an
 * edge that is not one, or is a flat seam (drawn as a straight line). */
function jigsawSteps(mark: number | undefined): { steps: readonly Step[]; size: number } | null {
  const jig = mark === undefined ? null : jigsaw(mark);
  if (!jig) return null;
  const size = KNOB_SIZES[jig.size]!;
  if ("seam" in jig) {
    if (jig.seam === SEAM_FLAT) return null;
    const flip = (s: Step): Step => {
      const f = ([t, h]: XY): XY => [t, -h];
      return "c1" in s ? { c1: f(s.c1), c2: f(s.c2), p: f(s.p) } : { p: f(s.p) };
    };
    return { steps: jig.seam === SEAM_S ? S_SEAM : S_SEAM.map(flip), size };
  }
  const whole = KNOBS_WHOLE[jig.knob]!;
  const steps = jig.out
    ? whole
    : whole.map((s) => {
        const f = ([t, h]: XY): XY => [t, -h];
        return "c1" in s ? { c1: f(s.c1), c2: f(s.c2), p: f(s.p) } : { p: f(s.p) };
      });
  return { steps, size };
}

/** A point of a jigsaw edge's frame laid on the edge a → b: shrunk towards
 * the edge's middle by `size` (but for the edge's ends), `h` to the right of
 * a → b. */
function onEdge(a: XY, b: XY, size: number, [t, h]: XY): XY {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  // the edge's own ends stay put: only the knob shrinks
  const u = t === 0 || t === 1 ? t : 0.5 + (t - 0.5) * size;
  const v = h * size;
  return [a[0] + u * dx + v * dy, a[1] + u * dy - v * dx];
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
export function edgeTo(
  a: XY,
  b: XY,
  bulge: Bulge,
  map: (p: XY) => XY = (p) => p,
  mark?: number,
): string {
  const jig = jigsawSteps(mark);
  if (jig) {
    const at = (p: XY): string => pt(map(onEdge(a, b, jig.size, p)));
    return jig.steps
      .map((s) => ("c1" in s ? `C${at(s.c1)} ${at(s.c2)} ${at(s.p)}` : `L${at(s.p)}`))
      .join("");
  }
  if (!bulge) return `L${pt(map(b))}`;
  const [c1, c2] = controls(a, b, bulge);
  return `C${pt(map(c1))} ${pt(map(c2))} ${pt(map(b))}`;
}

/** An SVG path for the closed polygon `xy`, its edges round where `curve`
 * says (edge i from xy[i] to xy[i + 1]), jigsaw edges where `marks` say;
 * straight where neither does. */
export function outlinePath(
  xy: XY[],
  curve?: readonly Bulge[],
  map?: (p: XY) => XY,
  marks?: readonly number[],
): string {
  if (xy.length === 0) return "";
  const at = map ?? ((p: XY): XY => p);
  let d = `M${pt(at(xy[0]!))}`;
  xy.forEach((a, i) => {
    const b = xy[(i + 1) % xy.length]!;
    d += edgeTo(a, b, curve?.[i] ?? 0, at, marks?.[i]);
  });
  return d + "Z";
}

/** One open edge as a path of its own — a jigsaw edge as the tile laid
 * along it must have it (`mark`, which a frontier edge holds). */
export function edgePath(a: XY, b: XY, bulge: Bulge, mark?: number): string {
  return `M${pt(a)}${edgeTo(a, b, bulge, undefined, mark)}`;
}

/** Points along a jigsaw edge a → b as drawn, every corner and point its
 * curves pass — what bounds it, and what the tests check for clearance —
 * or null where it is drawn straight. */
export function jigsawPoints(a: XY, b: XY, mark: number | undefined, per = 8): XY[] | null {
  const jig = jigsawSteps(mark);
  if (!jig) return null;
  const out: XY[] = [];
  let from: XY = [0, 0];
  for (const s of jig.steps) {
    if ("c1" in s)
      for (let k = 1; k < per; k++) {
        const t = k / per;
        const u = 1 - t;
        const w = [u * u * u, 3 * u * u * t, 3 * u * t * t, t * t * t] as const;
        out.push(
          onEdge(a, b, jig.size, [
            w[0] * from[0] + w[1] * s.c1[0] + w[2] * s.c2[0] + w[3] * s.p[0],
            w[0] * from[1] + w[1] * s.c1[1] + w[2] * s.c2[1] + w[3] * s.p[1],
          ]),
        );
      }
    out.push(onEdge(a, b, jig.size, s.p));
    from = s.p;
  }
  return out;
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
export function reachPoints(xy: XY[], curve?: readonly Bulge[], marks?: readonly number[]): XY[] {
  if (!curve && !marks) return xy;
  const out = [...xy];
  xy.forEach((a, i) => {
    const jig = jigsawPoints(a, xy[(i + 1) % xy.length]!, marks?.[i]);
    if (jig) out.push(...jig);
    const bulge = curve?.[i] ?? 0;
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
