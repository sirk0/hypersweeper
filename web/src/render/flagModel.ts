import { Color } from "three";
import { cross, normalize, type Vec3 } from "../boards/core";
import { FLAG_COLORS } from "./glyphAtlas";

// The 3D marker that **stands on** a flagged cell of a solid board, for the
// themes whose cell style asks for one (`CellStyle.flagMarker`). Everywhere else
// a flag is still the atlas billboard — a picture of a flag, turned to face the
// camera — which is fine on a flat board, where there is no other angle to see
// it from, and is exactly what falls down on a solid: drag a sphere around and
// the flags never turn with it, because they are not objects.
//
// Three shapes, and they exist as three because a literal flag has one real
// problem: seen from **straight above**, a pole with a cloth on it is a dot with
// a line beside it. Each shape answers that differently, and the themes named
// after them (Realistic 1/2/3) are there to be compared:
//
//   cloth — a mast flying one pennant, swivelled about its own pole so the cloth
//           faces the viewer. The most flag-like, and the one that still thins
//           out overhead: a swivel cannot help when the axis it turns about is
//           pointing at you.
//   vanes — the same mast carrying three pennants at 120°. A fixed object, no
//           swivel: it turns with the board like the tile it stands on, and from
//           overhead it reads as a three-point star rather than a line.
//   pin   — no cloth at all: a stem under a round head. Rotationally symmetric,
//           so it is the same picture from every direction including straight
//           down — the least flag-like and the most legible.
//
// House style, not Three.js primitives: every shape is written as bare triangles
// into one merged non-indexed buffer, the way `SolidBoard.writeGeometry` cuts a
// cell. That keeps all the flags of a board in a single draw call and a single
// rebuild, which is what `SolidBoard.rebuildFlags` wants — the set of flagged
// cells changes on nearly every move.

export type FlagMarker = "cloth" | "vanes" | "pin";

/** Every length here is a fraction of the cell's radius, so a marker is the same
 * size relative to its tile on a 12-cell cube and a 500-cell sphere.
 *
 * The mast is kept **short** on purpose. A solid's camera is fitted to a hull
 * measured once when the mesh is built (`SolidBoard`'s `hull`, `fitSolid` in
 * renderer.ts), and a marker is not in it — growing the hull for flags would
 * zoom every board out whether or not one is ever placed. So a marker standing
 * far proud of the tiles would be cropped at the board's rim; at this height it
 * clears the tiles and stays inside the frame. */
const MAST_H = 0.62;
const MAST_R0 = 0.024; // at the foot
const MAST_R1 = 0.015; // under the knob
const MAST_SIDES = 6;
const FOOT_H = 0.05;
const FOOT_R = 0.08;
const KNOB_R = 0.034;

const CLOTH_W = 0.46;
const CLOTH_H = 0.27;
/** How far the cloth ripples out of its own plane, and over how many crests.
 * Baked into the geometry rather than animated: a waving flag would have to keep
 * the renderer's on-demand loop awake forever (see renderer.ts `renderOnce`).
 * Shallow on purpose — deep enough to read as cloth from the side, not so deep
 * that the pennant becomes a crumpled ribbon at the size it is actually seen. */
const CLOTH_WAVE = 0.035;
const CLOTH_CRESTS = 1.25;
const CLOTH_COLS = 10;

const VANE_W = 0.36;
const VANE_H = 0.24;
const VANES = 3;

const STEM_H = 0.26;
const STEM_R0 = 0.032;
const STEM_R1 = 0.024;
const HEAD_R = 0.15;
const HEAD_SEGMENTS = 10;
const HEAD_RINGS = 6;

// Converted once. `new Color(hex)` is the same sRGB -> working-space conversion
// the cell colours go through in boardMesh.ts, so the marker and the board are
// written into their buffers in the same space.
const MAST = new Color(FLAG_COLORS.mast);
const FOOT = new Color(FLAG_COLORS.stand);
const KNOB = new Color(FLAG_COLORS.slab);
const CLOTH_LIT = new Color(FLAG_COLORS.clothLit);
const CLOTH = new Color(FLAG_COLORS.cloth);
const CLOTH_DARK = new Color(FLAG_COLORS.clothShade);

/** A point in the marker's own frame: +y up the pole, +x the direction the
 * cloth flies, +z out of the cloth's plane. */
type Local = [number, number, number];

/** Where a marker is planted, and the triangle sink it writes into. */
interface Frame {
  origin: Vec3;
  /** The frame's axes in board-local space, already scaled by the cell size, so
   * placing a point is three multiply-adds and no per-vertex normalisation. */
  ex: Vec3;
  ey: Vec3;
  ez: Vec3;
  pos: number[];
  nrm: number[];
  col: number[];
}

function place(f: Frame, p: Local): Vec3 {
  return [
    f.origin[0] + f.ex[0] * p[0] + f.ey[0] * p[1] + f.ez[0] * p[2],
    f.origin[1] + f.ex[1] * p[0] + f.ey[1] * p[1] + f.ez[1] * p[2],
    f.origin[2] + f.ex[2] * p[0] + f.ey[2] * p[1] + f.ez[2] * p[2],
  ];
}

/** One triangle, its normal taken from its own winding — flat shading, like the
 * grout mesh and the cell walls. A cloth is `DoubleSide`, so a strip whose
 * winding reverses across a ripple is still lit from whichever face is showing. */
function tri(f: Frame, a: Local, b: Local, c: Local, ca: Color, cb = ca, cc = cb): void {
  const p = place(f, a);
  const q = place(f, b);
  const r = place(f, c);
  const n = normalize(
    cross(
      [q[0] - p[0], q[1] - p[1], q[2] - p[2]],
      [r[0] - p[0], r[1] - p[1], r[2] - p[2]],
    ),
  );
  f.pos.push(p[0], p[1], p[2], q[0], q[1], q[2], r[0], r[1], r[2]);
  for (let i = 0; i < 3; i++) f.nrm.push(n[0], n[1], n[2]);
  f.col.push(ca.r, ca.g, ca.b, cb.r, cb.g, cb.b, cc.r, cc.g, cc.b);
}

function quad(
  f: Frame,
  a: Local,
  b: Local,
  c: Local,
  d: Local,
  ca: Color,
  cb = ca,
  cc = cb,
  cd = cc,
): void {
  tri(f, a, b, c, ca, cb, cc);
  tri(f, a, c, d, ca, cc, cd);
}

/** A tapered n-sided prism between two heights — the mast, the foot, the pin's
 * stem. Closed at the top when `cap`, so a stem cut off under a head is not a
 * hole seen from above. */
function frustum(
  f: Frame,
  y0: number,
  y1: number,
  r0: number,
  r1: number,
  sides: number,
  color: Color,
  cap = false,
): void {
  for (let i = 0; i < sides; i++) {
    const a = (i / sides) * Math.PI * 2;
    const b = ((i + 1) / sides) * Math.PI * 2;
    const p0: Local = [Math.cos(a) * r0, y0, Math.sin(a) * r0];
    const p1: Local = [Math.cos(b) * r0, y0, Math.sin(b) * r0];
    const p2: Local = [Math.cos(b) * r1, y1, Math.sin(b) * r1];
    const p3: Local = [Math.cos(a) * r1, y1, Math.sin(a) * r1];
    quad(f, p0, p1, p2, p3, color);
    if (cap) tri(f, [0, y1, 0], p3, p2, color);
  }
}

/** The knob on top of the mast — an octahedron, which at this size is a bead and
 * costs eight triangles. The atlas flag has one; without it the mast reads as a
 * cut wire. */
function knob(f: Frame, y: number, r: number, color: Color): void {
  const top: Local = [0, y + r, 0];
  const bot: Local = [0, y - r, 0];
  const ring: Local[] = [
    [r, y, 0],
    [0, y, r],
    [-r, y, 0],
    [0, y, -r],
  ];
  for (let i = 0; i < 4; i++) {
    const a = ring[i]!;
    const b = ring[(i + 1) % 4]!;
    tri(f, top, a, b, color);
    tri(f, bot, b, a, color);
  }
}

/** A pennant hanging off the mast, flying along +x. Built as a strip of
 * `CLOTH_COLS` quads so it can carry a baked ripple in z and taper toward the
 * fly; the ripple is what makes it cloth rather than a card, and it is also what
 * keeps the shape alive when the viewer is nearly edge-on to it.
 *
 * `spin` turns the whole pennant about the mast, which is how `vanes` gets its
 * three from one. Pinned at the hoist (amplitude ramps in from 0) so it stays
 * attached to the pole however deep the ripple. */
function pennant(
  f: Frame,
  yTop: number,
  width: number,
  height: number,
  wave: number,
  spin: number,
): void {
  const cs = Math.cos(spin);
  const sn = Math.sin(spin);
  // In the pennant's own 2D frame before the spin: u runs out along the fly,
  // w out of the cloth plane.
  const at = (u: number, y: number, w: number): Local => [
    u * cs - w * sn,
    y,
    u * sn + w * cs,
  ];
  for (let i = 0; i < CLOTH_COLS; i++) {
    const t0 = i / CLOTH_COLS;
    const t1 = (i + 1) / CLOTH_COLS;
    const edge = (t: number): { u: number; hi: number; lo: number; w: number } => {
      const u = t * width;
      // The top edge lifts a little as it leaves the mast and the fly falls
      // back, the way the atlas flag's bezier does.
      const hi = yTop + height * 0.1 * Math.sin(t * Math.PI);
      const lo = yTop - height * (1 - 0.28 * t * t);
      return { u, hi, lo, w: wave * t * Math.sin(t * Math.PI * 2 * CLOTH_CRESTS) };
    };
    const a = edge(t0);
    const b = edge(t1);
    // Colour by the ripple: a crest turned into the light takes the lit tone, a
    // deep trough the shaded one, everything between the base red. Cheap, and it
    // reads even where the cloth is close to edge-on and the lighting has little
    // to say. Weighted toward the light: the cloth is small on screen and a
    // pennant that is mostly its shadow tone reads as brown, not red.
    const tone = (w: number): Color =>
      w > wave * 0.25 ? CLOTH_LIT : w < -wave * 0.55 ? CLOTH_DARK : CLOTH;
    quad(
      f,
      at(a.u, a.hi, a.w),
      at(b.u, b.hi, b.w),
      at(b.u, b.lo, b.w),
      at(a.u, a.lo, a.w),
      tone(a.w),
      tone(b.w),
      tone(b.w),
      tone(a.w),
    );
  }
}

/** The mast every cloth-carrying marker stands on: a splayed foot so the pole
 * does not read as stabbing through the tile, a tapered shaft, a knob. */
function mast(f: Frame): void {
  frustum(f, 0, FOOT_H, FOOT_R, MAST_R0 * 1.4, MAST_SIDES, FOOT);
  frustum(f, 0, MAST_H, MAST_R0, MAST_R1, MAST_SIDES, MAST);
  knob(f, MAST_H, KNOB_R, KNOB);
}

/** The pin's head: a low-poly sphere, shaded from lit at the crown to the base
 * tone underneath, so it reads as a bead rather than a ball of flat colour even
 * where the key light does not reach it. */
function head(f: Frame, cy: number, r: number): void {
  const point = (ring: number, seg: number): Local => {
    const phi = (ring / HEAD_RINGS) * Math.PI;
    const theta = (seg / HEAD_SEGMENTS) * Math.PI * 2;
    return [
      Math.sin(phi) * Math.cos(theta) * r,
      cy + Math.cos(phi) * r,
      Math.sin(phi) * Math.sin(theta) * r,
    ];
  };
  const tone = (ring: number): Color =>
    ring <= HEAD_RINGS / 3 ? CLOTH_LIT : ring >= (HEAD_RINGS * 2) / 3 ? CLOTH_DARK : CLOTH;
  for (let ring = 0; ring < HEAD_RINGS; ring++) {
    for (let seg = 0; seg < HEAD_SEGMENTS; seg++) {
      const a = point(ring, seg);
      const b = point(ring, seg + 1);
      const c = point(ring + 1, seg + 1);
      const d = point(ring + 1, seg);
      const up = tone(ring);
      const down = tone(ring + 1);
      // The poles collapse to a point, so those rings are triangles.
      if (ring === 0) tri(f, a, c, d, up, down, down);
      else if (ring === HEAD_RINGS - 1) tri(f, a, b, c, up, up, down);
      else quad(f, a, b, c, d, up, up, down, down);
    }
  }
}

/**
 * Append one marker's triangles to `pos` / `nrm` / `col`.
 *
 * `origin` is where it is planted (the cell's raised top-face centre) and `up`
 * the cell's outward normal — the pole stands along it, so a marker leans with
 * its tile as the solid turns, which is most of what says it is standing on the
 * board rather than painted on it.
 *
 * `tangent` is **the direction the cloth flies**, and the caller chooses it
 * because that is where the three shapes differ. `vanes` and `pin` want
 * something fixed to the cell, so the marker turns with the board; `cloth` wants
 * `up × toCamera`, which puts the cloth's face toward the viewer — the swivel
 * that keeps a single pennant from going edge-on. It need not be perpendicular
 * to `up` or normalised; the component along `up` is projected out here.
 *
 * `scale` is the cell's radius (times the flag-pop animation's scale, when one
 * is running), and every constant above is a fraction of it.
 */
export function writeFlagModel(
  kind: FlagMarker,
  origin: Vec3,
  up: Vec3,
  tangent: Vec3,
  scale: number,
  pos: number[],
  nrm: number[],
  col: number[],
): void {
  if (!(scale > 0)) return;
  const ey = normalize(up);
  const along = tangent[0] * ey[0] + tangent[1] * ey[1] + tangent[2] * ey[2];
  const flat: Vec3 = [
    tangent[0] - ey[0] * along,
    tangent[1] - ey[1] * along,
    tangent[2] - ey[2] * along,
  ];
  // A tangent (near-)parallel to the normal leaves nothing to project — the
  // `cloth` kind hits it whenever the viewer is straight down the pole. Any
  // perpendicular will do there, since at that angle the cloth is a sliver
  // whichever way it points; what matters is not dividing by ~0 and flinging the
  // marker off the board.
  const ex =
    Math.hypot(flat[0], flat[1], flat[2]) > 1e-6
      ? normalize(flat)
      : normalize(cross(ey, Math.abs(ey[0]) < 0.9 ? [1, 0, 0] : [0, 1, 0]));
  const ez = cross(ex, ey);
  const f: Frame = {
    origin,
    ex: [ex[0] * scale, ex[1] * scale, ex[2] * scale],
    ey: [ey[0] * scale, ey[1] * scale, ey[2] * scale],
    ez: [ez[0] * scale, ez[1] * scale, ez[2] * scale],
    pos,
    nrm,
    col,
  };
  if (kind === "pin") {
    frustum(f, 0, STEM_H, STEM_R0, STEM_R1, MAST_SIDES, MAST, true);
    head(f, STEM_H + HEAD_R * 0.72, HEAD_R);
    return;
  }
  mast(f);
  if (kind === "cloth") {
    pennant(f, MAST_H - 0.06, CLOTH_W, CLOTH_H, CLOTH_WAVE, 0);
    return;
  }
  for (let i = 0; i < VANES; i++) {
    pennant(f, MAST_H - 0.06, VANE_W, VANE_H, CLOTH_WAVE * 0.6, (i / VANES) * Math.PI * 2);
  }
}
