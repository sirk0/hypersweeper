// Hyperbolic panning: the view transform of a board drawn in the Poincaré
// disc. Pure arithmetic, kept out of `polygonBoard.ts` for the same reason
// zoom.ts is kept out of `renderer.ts` — it is unit testable without a WebGL
// context. The mesh owns the state and hands it to its vertex shader.
//
// Every orientation-preserving isometry of the disc is a Möbius map
//
//     z -> rot * (z - c) / (1 - conj(c) z),     |rot| = 1, |c| < 1,
//
// so a view is the pair (c, rot): `c` is the point of the board's own disc
// that is shown at the centre, `rot` the turn it is shown at. The identity
// (c = 0, rot = 1) is the board as it was built. Because the map is conformal,
// a cell keeps its shape as it moves — a rim cell dragged to the centre is
// drawn as big as the central one, which no Euclidean zoom can do.
//
// A drag is a *transvection*: the translation along the geodesic through the
// two points, so the point under the finger follows the finger and nothing
// turns that a translation would not turn. Two translations along different
// lines compose to a translation and a turn — the disc's holonomy — which is
// why the view carries `rot` at all.

export type Cx = readonly [number, number];

export interface DiscView {
  /** The board point shown at the centre of the disc (|c| < 1). */
  readonly c: Cx;
  /** The turn it is shown at (|rot| = 1). */
  readonly rot: Cx;
}

export const DISC_IDENTITY: DiscView = { c: [0, 0], rot: [1, 0] };

/** How far out of the disc a finger is taken at its word. Past it a pixel is
 * worth more than a cell of hyperbolic distance — and past the rim it is worth
 * infinitely many — so a drag there moves the board as if it had been made at
 * this radius: still under the finger's direction, never a lurch. */
export const GRAB_LIMIT = 0.95;

const mul = (a: Cx, b: Cx): Cx => [a[0] * b[0] - a[1] * b[1], a[0] * b[1] + a[1] * b[0]];
const conj = (a: Cx): Cx => [a[0], -a[1]];
const abs2 = (a: Cx): number => a[0] * a[0] + a[1] * a[1];
function div(a: Cx, b: Cx): Cx {
  const d = abs2(b);
  return [(a[0] * b[0] + a[1] * b[1]) / d, (a[1] * b[0] - a[0] * b[1]) / d];
}

/** Where the view draws the board point `z`. */
export function discMap(v: DiscView, z: Cx): Cx {
  const num: Cx = [z[0] - v.c[0], z[1] - v.c[1]];
  const cz = mul(conj(v.c), z);
  return mul(v.rot, div(num, [1 - cz[0], -cz[1]]));
}

/** The board point the view draws at `w` — the inverse of `discMap`. */
export function discUnmap(v: DiscView, w: Cx): Cx {
  const u = div(w, v.rot);
  const cu = mul(conj(v.c), u);
  return div([u[0] + v.c[0], u[1] + v.c[1]], [1 + cu[0], cu[1]]);
}

/** How much the view magnifies the board at `z` (|M'(z)|, conformal, so the
 * same in every direction). A cell's relief is scaled by it at its centre, so
 * a tile keeps its proportions — bevel to width — wherever it is drawn. */
export function discScale(v: DiscView, z: Cx): number {
  const w = discMap(v, z);
  return (1 - abs2(w)) / (1 - abs2(z));
}

// -- composition, as 2x2 complex matrices ((a, b), (c, d)): z -> (az+b)/(cz+d)

type Mat = readonly [Cx, Cx, Cx, Cx];

const matMul = (m: Mat, n: Mat): Mat => {
  const add = (x: Cx, y: Cx): Cx => [x[0] + y[0], x[1] + y[1]];
  return [
    add(mul(m[0], n[0]), mul(m[1], n[2])),
    add(mul(m[0], n[1]), mul(m[1], n[3])),
    add(mul(m[2], n[0]), mul(m[3], n[2])),
    add(mul(m[2], n[1]), mul(m[3], n[3])),
  ];
};

const viewMat = (v: DiscView): Mat => [v.rot, mul(v.rot, [-v.c[0], -v.c[1]]), [-v.c[0], v.c[1]], [1, 0]];

/** The disc translation z -> (z + p) / (1 + conj(p) z), taking 0 to p. */
const shift = (p: Cx): Mat => [[1, 0], p, conj(p), [1, 0]];

function fromMat(m: Mat): DiscView {
  const c = div([-m[1][0], -m[1][1]], m[0]);
  const r = div(m[0], m[3]);
  const n = Math.hypot(r[0], r[1]);
  return { c, rot: [r[0] / n, r[1] / n] };
}

function capped(z: Cx, limit: number): Cx {
  const n = Math.hypot(z[0], z[1]);
  return n > limit ? [(z[0] * limit) / n, (z[1] * limit) / n] : z;
}

/**
 * The view after a drag from `from` to `to` (both points as the view draws
 * them, in disc units): the translation along the geodesic through them
 * composed after the view, so what was drawn at `from` is drawn at `to`.
 * `reach` bounds how far the board can be carried — the point shown at the
 * centre never leaves the disc of that radius, so the board cannot be lost
 * off into the rim the way a Euclidean pan is kept from leaving the screen.
 */
export function discDrag(v: DiscView, from: Cx, to: Cx, reach: number): DiscView {
  const a = capped(from, GRAB_LIMIT);
  const b = capped(to, GRAB_LIMIT);
  if (a[0] === b[0] && a[1] === b[1]) return v;
  // u: where the translation taking a to 0 sends b; conjugating the plain
  // translation 0 -> u by that one gives the translation a -> b along their
  // own geodesic.
  const back = shift([-a[0], -a[1]]);
  const num: Cx = [b[0] - a[0], b[1] - a[1]];
  const ab = mul(conj(a), b);
  const u = div(num, [1 - ab[0], -ab[1]]);
  const t = matMul(shift(a), matMul(shift(u), back));
  const next = fromMat(matMul(t, viewMat(v)));
  return { c: capped(next.c, reach), rot: next.rot };
}
