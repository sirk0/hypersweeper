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
// A drag step is a *translation along a line through the centre of the view*
// (a diameter), the one that moves the point under the finger exactly as the
// finger moved (`dragShift`), so what the player grabbed stays under their
// finger. Not the translation along the geodesic through the finger's two
// positions, which keeps the grabbed point but, near the rim, slides along a
// tight circle there and swings the rest of the board — its centre too — off
// at a sharp angle: a sideways drag at the edge sent the board up or down.
// Two translations along different lines compose to a translation and a turn
// — the disc's holonomy — which is why the view carries `rot` at all.

export type Cx = readonly [number, number];

export interface DiscView {
  /** The board point shown at the centre of the disc (|c| < 1). */
  readonly c: Cx;
  /** The turn it is shown at (|rot| = 1). */
  readonly rot: Cx;
}

export const DISC_IDENTITY: DiscView = { c: [0, 0], rot: [1, 0] };

/** How close to the centre of the view the board's own rim may be carried, in
 * disc radii. A disc board is finite, so a pan that went on until its last
 * cell was in the middle showed half a screen of nothing; held here, the board
 * still fills most of the view at its farthest, and its rim cells come in to
 * where they are big enough to tap. */
export const EDGE_HOLD = 0.75;

/** How much faster than a drag through the centre a drag made anywhere may
 * move the board. Near the rim a pixel is worth a whole cell of hyperbolic
 * distance — past it, infinitely many — so a drag taken literally there flung
 * the board. Capped, the grabbed point follows the finger exactly wherever
 * that is no faster than this (out to sqrt(1 - 1/DRAG_SPEED) of the radius,
 * 0.71 at 2); beyond, it goes the way the finger goes, more slowly. */
export const DRAG_SPEED = 2;

/** A finger out at the rim or off the disc altogether is taken to be here, on
 * the same ray, its movement applied from this point. */
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

/** Where a drag step from `from` to `to` (finger positions as the view draws
 * them, disc units) carries the centre of the view: the translation along a
 * diameter that moves the point under the finger, `a`, by the finger's own
 * movement `d`. A translation with velocity `t` at the centre moves `a` at
 * t - conj(t) a^2, so t = (d + conj(d) a^2) / (1 - |a|^4) — exactly `d` at the
 * centre, growing as 1 / (1 - |a|^2) towards the rim, where it is held to
 * `DRAG_SPEED` times |d| (shortened, never turned, so the grabbed point still
 * moves the way the finger does). A finger past `GRAB_LIMIT` is taken to be
 * at it, on the same ray. */
export function dragShift(from: Cx, to: Cx): Cx {
  const a = capped(from, GRAB_LIMIT);
  const d: Cx = [to[0] - from[0], to[1] - from[1]];
  const a2 = mul(a, a);
  const k = 1 - abs2(a2);
  const da = mul(conj(d), a2);
  let t: Cx = [(d[0] + da[0]) / k, (d[1] + da[1]) / k];
  const n = Math.hypot(t[0], t[1]);
  if (n === 0) return [0, 0];
  const most = DRAG_SPEED * Math.hypot(d[0], d[1]);
  if (n > most) t = [(t[0] * most) / n, (t[1] * most) / n];
  // Run for unit time: 2|t| of hyperbolic distance from the centre, which is
  // tanh(|t|) of the disc's radius.
  const m = Math.hypot(t[0], t[1]);
  return [(t[0] * Math.tanh(m)) / m, (t[1] * Math.tanh(m)) / m];
}

/** How far from the centre of the board as built the view may be centred, in
 * disc units, for a board that is whole out to `rim`: no point of its outline
 * then comes closer than `EDGE_HOLD` to the middle of the view. Measured in
 * hyperbolic distance: every outline point is at least R = 2 atanh(rim) from
 * the board's centre, so at least R - d from a view centred d away from it
 * (the triangle inequality) — and everything nearer the view's centre than
 * that is board. */
export function discReach(rim: number): number {
  const spare = 2 * Math.atanh(rim) - 2 * Math.atanh(EDGE_HOLD);
  return spare > 0 ? Math.tanh(spare / 2) : 0;
}

/**
 * The view after a drag step from `from` to `to` (both points as the view
 * draws them, in disc units): the translation `dragShift` finds, composed
 * after the view, so what was drawn under the finger follows it — exactly
 * away from the rim, in the finger's direction at `DRAG_SPEED` near it. A step
 * is one pointer move: the translation is exact to first order in it, which is
 * what a stream of them, re-aimed at every move, needs. `reach` bounds how far
 * the board can be carried (`discReach`) — the point shown at the centre
 * never leaves the disc of that radius, so the board cannot be lost off into
 * the rim the way a Euclidean pan is kept from leaving the screen.
 */
export function discDrag(v: DiscView, from: Cx, to: Cx, reach: number): DiscView {
  if (from[0] === to[0] && from[1] === to[1]) return v;
  const p = dragShift(from, to);
  if (p[0] === 0 && p[1] === 0) return v;
  const next = fromMat(matMul(shift(p), viewMat(v)));
  return { c: capped(next.c, reach), rot: next.rot };
}

// -- a board with no edge: the closed surfaces ----------------------------------

/** One step of a closed surface's cover (`DiscCover` in boards/core.ts): the
 * isometry carrying the central tile onto one next to it, in the shape of a
 * view. */
export interface CoverStep {
  readonly c: Cx;
  readonly rot: Cx;
}

/** At most this many steps are taken at once. A drag moves the view by a
 * fraction of a tile, so one is almost always enough; the cap only stops a
 * pathological view from spinning the loop. */
const MAX_RECENTRE = 16;

/**
 * Carry a view that has wandered off the central tile back onto it.
 *
 * A closed surface drawn as a patch of its cover looks the same from every
 * tile, once the labels are moved by the surface's matching symmetry: so while
 * the point shown at the centre of the view is nearer the centre of a
 * neighbouring tile than the central one's, the view is composed with the step
 * that carries the central tile there, and the step is reported for the labels
 * to follow. The view draws exactly what it did -- every point lands where it
 * was, showing the cell it showed -- but its centre is back within the central
 * tile, so the patch around it is whole however far the pan goes. Returns the
 * new view and the indices of the steps taken, in order.
 */
export function discRecentre(
  v: DiscView,
  steps: readonly CoverStep[],
): { view: DiscView; taken: number[] } {
  const taken: number[] = [];
  let view = v;
  for (let n = 0; n < MAX_RECENTRE; n++) {
    // hyperbolic distance from the view's centre, as the disc radius of its
    // image when that point is moved to 0 -- monotonic in the distance itself
    const near = (p: Cx) => {
      const num: Cx = [view.c[0] - p[0], view.c[1] - p[1]];
      const pc = mul(conj(p), view.c);
      return Math.sqrt(abs2(num) / abs2([1 - pc[0], -pc[1]]));
    };
    let best = -1;
    let bestD = Math.sqrt(abs2(view.c));
    steps.forEach((s, k) => {
      const centre = mul(s.rot, [-s.c[0], -s.c[1]]); // the step's image of 0
      const d = near(centre);
      if (d < bestD - 1e-12) [best, bestD] = [k, d];
    });
    if (best < 0) break;
    view = fromMat(matMul(viewMat(view), viewMat(steps[best]!)));
    taken.push(best);
  }
  return { view, taken };
}
