import { Color } from "three";
import { cross, normalize, type Vec3 } from "../boards/core";
import { FLAG_COLORS, MINE_COLORS } from "./glyphAtlas";

// The 3D models that **stand on** a cell of a board you can turn, for the styles
// whose cell style asks for them (`CellStyle.solidMarkers`). Everywhere else a
// flag and a mine are the atlas billboards — pictures, turned to face the
// camera — which is right on a flat board, where there is no other angle to see
// one from, and is exactly what falls down on a solid: drag a sphere around and
// the flags never turn with it, because they are not objects.
//
// Two shapes, and both are **rotationally symmetric about the axis they stand
// on**. That is the whole design rule here, learned the hard way: the first
// version of this file offered a pennant on a mast, and a pennant is a sheet
// containing its own pole, so seen straight *down* that pole it is a line. On a
// solid, every cell facing the viewer is exactly that case. A pin has no front,
// so it has no angle it fails at.
//
//   pin  — a stem under a round head, on a flagged cell. Also drawn dead gray on
//          a cell whose flag turns out to have been wrong, where the atlas's
//          bare `cross` glyph is billboarded over it.
//   bomb — a casing studded with spikes, on a mined cell once the board is
//          revealed on a loss. Proportioned off `drawMine` in glyphAtlas.ts, so
//          the 2D mine and this are one object seen two ways; the cell the
//          player actually hit takes the same model in a hot tint.
//
// House style, not Three.js primitives: every shape is written as bare triangles
// into one merged non-indexed buffer, the way `SolidBoard.writeGeometry` cuts a
// cell. That keeps all the markers of a board in a single draw call and a single
// rebuild. Nothing here depends on the camera, which is what lets `SolidBoard`
// rebuild markers only when a cell's *state* changes rather than on every frame
// of a drag — worth having, because a smooth sphere is not a cheap thing to
// rewrite sixty times a second.

/** A pin, a dead (wrongly-placed) pin, a mine, and the mine that went off. */
export type Marker = "pin" | "deadPin" | "bomb" | "bombHot";

/** Every length is a fraction of the cell's **inradius** (`CellGeom.fit` — its
 * centroid-to-nearest-edge distance), which is what the billboards have always
 * been sized by and the only measure that makes a marker *fit its tile*.
 *
 * The obvious alternative, the mean centroid-to-vertex distance, is what these
 * were first written against, and on a stretched surface it is not a width at
 * all: the immersions bend cells into long thin slivers whose mean vertex
 * distance is set by the long axis, so a bomb sized that way came out several
 * times wider than the tile under it. The ratio between the two is not a
 * constant either — it is 0.48 on the sphere's kites, 0.60 on the plain torus
 * and under 0.09 on the isogonal Klein wraps — which is exactly why one of them
 * is a size and the other is not.
 *
 * Calibrated so the widest part of each model lands at ~0.76 of the inradius,
 * just inside the 0.9 the glyph quads use. That leaves the sphere, the board
 * these were tuned by eye on, drawing them at the size it always did. */
const STEM_H = 0.71;
const STEM_R0 = 0.105;
const STEM_R1 = 0.08;
const STEM_SIDES = 10;
const HEAD_R = 0.63;

/** The casing, and how far the spikes reach past it — the ratios `drawMine`
 * uses (horns from 0.9r to 1.34r), rounded to what reads in three dimensions. */
const BOMB_R = 0.63;
const SPIKE_FROM = 0.84;
const SPIKE_TO = 1.2;
const SPIKE_R = 0.21;
/** Blunt: the horn narrows to this fraction of its base and is then capped flat
 * rather than run out to a point. `drawMine`'s are round-capped lead cylinders,
 * not needles, and a needle at this size is a hairline that reads as noise. */
const SPIKE_TAPER = 0.72;
const SPIKE_SIDES = 7;

/** Segments around, rings pole to pole. Enough that the silhouette of a head
 * this size has no corner the eye can find; the *shading* is smooth well below
 * this, because the normals are radial rather than per-face (see `sphere`). */
const SPHERE_SEGMENTS = 18;
const SPHERE_RINGS = 12;

/** How far the tallest model reaches above the cell it stands on, as a fraction
 * of the cell's inradius — the pin, whose head is the higher of the two. The
 * renderer frames a marker board with this much clearance over every cell (see
 * `SolidBoard`'s hull), because the camera fit is measured once at build time
 * and a marker outside it is one the board's rim crops in half. */
export const MARKER_REACH = STEM_H + HEAD_R * 1.62;

// Converted once. `new Color(hex)` is the same sRGB -> working-space conversion
// the cell colours go through in boardMesh.ts, so the markers and the board are
// written into their buffers in the same space.
const STEM = new Color(FLAG_COLORS.mast);
const FOOT = new Color(FLAG_COLORS.stand);
const HEAD_LIT = new Color(FLAG_COLORS.clothLit);
const HEAD = new Color(FLAG_COLORS.cloth);
const HEAD_SHADE = new Color(FLAG_COLORS.clothShade);
// A flag that turned out to be wrong: the same pin with the life gone out of
// it. Desaturating rather than recolouring keeps it reading as the marker the
// player placed, which is the point — the cross over it says the rest.
const DEAD_LIT = new Color("#9aa0ab");
const DEAD = new Color("#767c88");
const DEAD_SHADE = new Color("#565b65");
const CASING_LIT = new Color(MINE_COLORS.casingLit);
const CASING = new Color(MINE_COLORS.casing);
const CASING_SHADE = new Color(MINE_COLORS.casingShade);
const SPIKE = new Color(MINE_COLORS.spike);
// The one that went off. Its tile is already the hard-coded red the board uses
// for an exploded cell, so the casing goes hot rather than staying iron —
// otherwise the cell that ended the game is the one bomb you cannot pick out.
const HOT_LIT = new Color("#ffb15a");
const HOT = new Color("#e0603a");
const HOT_SHADE = new Color("#7d2418");

/** A point in the marker's own frame: +y up the axis it stands on. */
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

/** A direction in the marker's frame, rotated into board-local space but *not*
 * scaled — a normal must not carry the cell size. The axes are unit vectors
 * times `scale`, so dividing it back out is all it takes. */
function direction(f: Frame, d: Local, scale: number): Vec3 {
  return normalize([
    (f.ex[0] * d[0] + f.ey[0] * d[1] + f.ez[0] * d[2]) / scale,
    (f.ex[1] * d[0] + f.ey[1] * d[1] + f.ez[1] * d[2]) / scale,
    (f.ex[2] * d[0] + f.ey[2] * d[1] + f.ez[2] * d[2]) / scale,
  ]);
}

/** One triangle. With no `normals` it is flat-shaded off its own winding, which
 * is what a cone or a short frustum wants; pass three per-vertex normals and the
 * rasteriser interpolates between them instead, which is the only way a sphere
 * of a few hundred triangles reads as having no edges at all. The marker
 * material must have `flatShading` **off** or these are thrown away. */
function tri(
  f: Frame,
  a: Local,
  b: Local,
  c: Local,
  colors: Color | [Color, Color, Color],
  normals?: [Vec3, Vec3, Vec3],
): void {
  const p = place(f, a);
  const q = place(f, b);
  const r = place(f, c);
  const ns =
    normals ??
    (() => {
      const n = normalize(
        cross(
          [q[0] - p[0], q[1] - p[1], q[2] - p[2]],
          [r[0] - p[0], r[1] - p[1], r[2] - p[2]],
        ),
      );
      return [n, n, n] as [Vec3, Vec3, Vec3];
    })();
  const cs = Array.isArray(colors) ? colors : [colors, colors, colors];
  f.pos.push(p[0], p[1], p[2], q[0], q[1], q[2], r[0], r[1], r[2]);
  for (const n of ns) f.nrm.push(n[0], n[1], n[2]);
  for (const c of cs) f.col.push(c.r, c.g, c.b);
}

/** A tapered n-sided drum between two heights — the pin's stem, its little
 * foot. Smooth-normalled around its axis, so even a ten-sided stem has no
 * visible corner running up it. Capped at the top when `cap`. */
function drum(
  f: Frame,
  y0: number,
  y1: number,
  r0: number,
  r1: number,
  sides: number,
  color: Color,
  scale: number,
  cap = false,
): void {
  const at = (i: number, r: number, y: number): Local => [
    Math.cos((i / sides) * Math.PI * 2) * r,
    y,
    Math.sin((i / sides) * Math.PI * 2) * r,
  ];
  // Outward and level: the taper is slight, so the side normal is close enough
  // to horizontal that spending a cross product per rim point buys nothing.
  const side = (i: number): Vec3 =>
    direction(
      f,
      [Math.cos((i / sides) * Math.PI * 2), 0, Math.sin((i / sides) * Math.PI * 2)],
      scale,
    );
  const up = direction(f, [0, 1, 0], scale);
  for (let i = 0; i < sides; i++) {
    const p0 = at(i, r0, y0);
    const p1 = at(i + 1, r0, y0);
    const p2 = at(i + 1, r1, y1);
    const p3 = at(i, r1, y1);
    const na = side(i);
    const nb = side(i + 1);
    tri(f, p0, p1, p2, color, [na, nb, nb]);
    tri(f, p0, p2, p3, color, [na, nb, na]);
    if (cap) tri(f, [0, y1, 0], p3, p2, color, [up, up, up]);
  }
}

/** A sphere centred on the axis, with **radial** normals — the whole reason it
 * looks round rather than cut. Its own top-to-bottom gradient rides on top of
 * the lighting, the way the 2D glyphs are drawn with theirs, and is written
 * **per vertex**: a colour per triangle instead bands the ball, and because the
 * two triangles of each quad take different rings, the bands come out as a
 * sawtooth ring rather than even a clean stripe. */
function sphere(
  f: Frame,
  cy: number,
  r: number,
  scale: number,
  lit: Color,
  mid: Color,
  shade: Color,
): void {
  // One colour per ring, so the ramp is computed RINGS+1 times rather than once
  // per vertex. Crown to equator is lit->mid, equator to base mid->shade.
  const tones: Color[] = [];
  for (let ring = 0; ring <= SPHERE_RINGS; ring++) {
    const t = ring / SPHERE_RINGS;
    tones.push(
      t <= 0.5
        ? lit.clone().lerp(mid, t * 2)
        : mid.clone().lerp(shade, (t - 0.5) * 2),
    );
  }
  const at = (ring: number, seg: number): Local => {
    const phi = (ring / SPHERE_RINGS) * Math.PI;
    const theta = (seg / SPHERE_SEGMENTS) * Math.PI * 2;
    return [
      Math.sin(phi) * Math.cos(theta) * r,
      cy + Math.cos(phi) * r,
      Math.sin(phi) * Math.sin(theta) * r,
    ];
  };
  // The outward normal at a point of a sphere is the point itself, measured
  // from the centre — so it comes for free, exactly, at every subdivision.
  const nAt = (p: Local): Vec3 => direction(f, [p[0], p[1] - cy, p[2]], scale);
  for (let ring = 0; ring < SPHERE_RINGS; ring++) {
    const up = tones[ring]!;
    const down = tones[ring + 1]!;
    for (let seg = 0; seg < SPHERE_SEGMENTS; seg++) {
      const a = at(ring, seg);
      const b = at(ring, seg + 1);
      const c = at(ring + 1, seg + 1);
      const d = at(ring + 1, seg);
      // The poles collapse to a point, so those rings are triangles.
      if (ring === 0) {
        tri(f, a, c, d, [up, down, down], [nAt(a), nAt(c), nAt(d)]);
      } else if (ring === SPHERE_RINGS - 1) {
        tri(f, a, b, c, [up, up, down], [nAt(a), nAt(b), nAt(c)]);
      } else {
        tri(f, a, b, c, [up, up, down], [nAt(a), nAt(b), nAt(c)]);
        tri(f, a, c, d, [up, down, down], [nAt(a), nAt(c), nAt(d)]);
      }
    }
  }
}

/** The twelve vertices of an icosahedron, as unit directions: three golden
 * rectangles in the three coordinate planes. The mine's spikes go on these
 * rather than in a ring, because a ring has a top and this must not — the whole
 * point of a 3D marker here is that it reads the same whichever way the board
 * has been turned. */
const SPIKE_DIRS: Vec3[] = (() => {
  const p = (1 + Math.sqrt(5)) / 2;
  const raw: Vec3[] = [];
  for (const s of [1, -1]) {
    for (const t of [1, -1]) {
      raw.push([0, s, t * p], [s, t * p, 0], [t * p, 0, s]);
    }
  }
  return raw.map(normalize);
})();

/** One horn: a short, barely-tapered stub off the casing, capped flat. */
function spike(f: Frame, cy: number, r: number, dir: Vec3): void {
  // A basis around the spike's own axis. The axis is a fixed icosahedral
  // direction, so any perpendicular does; take the more distant coordinate axis
  // to keep the cross product well conditioned.
  const up: Vec3 = Math.abs(dir[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0];
  const u = normalize(cross(dir, up));
  const v = cross(dir, u);
  const at = (i: number, radius: number, along: number): Local => {
    const a = (i / SPIKE_SIDES) * Math.PI * 2;
    const c = Math.cos(a) * radius;
    const s = Math.sin(a) * radius;
    return [
      dir[0] * along * r + u[0] * c * r + v[0] * s * r,
      cy + dir[1] * along * r + u[1] * c * r + v[1] * s * r,
      dir[2] * along * r + u[2] * c * r + v[2] * s * r,
    ];
  };
  const cap: Local = [dir[0] * SPIKE_TO * r, cy + dir[1] * SPIKE_TO * r, dir[2] * SPIKE_TO * r];
  const outer = SPIKE_R * SPIKE_TAPER;
  for (let i = 0; i < SPIKE_SIDES; i++) {
    // Flat-shaded on purpose: a lead horn is a machined stub, and the facets
    // are what tell it apart from the smooth casing it is set into.
    const a0 = at(i, SPIKE_R, SPIKE_FROM);
    const a1 = at(i + 1, SPIKE_R, SPIKE_FROM);
    const b0 = at(i, outer, SPIKE_TO);
    const b1 = at(i + 1, outer, SPIKE_TO);
    tri(f, a0, a1, b1, SPIKE);
    tri(f, a0, b1, b0, SPIKE);
    tri(f, cap, b0, b1, SPIKE);
  }
}

/**
 * Append one marker's triangles to `pos` / `nrm` / `col`.
 *
 * `origin` is where it is planted (the cell's top-face centre) and `up` the
 * direction it stands in — the cell's normal, so a marker leans with its tile as
 * the solid turns, which is most of what says it is standing on the board rather
 * than painted on it. On a two-sided surface, whose cells have no consistent
 * outward direction at all, the caller writes the marker twice with `up` negated
 * the second time, so there is one on each face.
 *
 * `scale` is the cell's radius (times the flag-pop animation's scale, when one
 * is running), and every constant above is a fraction of it.
 */
export function writeMarker(
  kind: Marker,
  origin: Vec3,
  up: Vec3,
  scale: number,
  pos: number[],
  nrm: number[],
  col: number[],
): void {
  if (!(scale > 0)) return;
  const ey = normalize(up);
  // Nothing here has a front, so the two axes across the marker are free: any
  // perpendicular will do, and the cheap one is a cross with whichever
  // coordinate axis `ey` is least aligned with.
  const ex = normalize(cross(ey, Math.abs(ey[0]) < 0.9 ? [1, 0, 0] : [0, 1, 0]));
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
  if (kind === "pin" || kind === "deadPin") {
    const dead = kind === "deadPin";
    const [lit, mid, shade] = dead
      ? [DEAD_LIT, DEAD, DEAD_SHADE]
      : [HEAD_LIT, HEAD, HEAD_SHADE];
    drum(f, 0, STEM_H, STEM_R0, STEM_R1, STEM_SIDES, dead ? FOOT : STEM, scale, true);
    sphere(f, STEM_H + HEAD_R * 0.62, HEAD_R, scale, lit, mid, shade);
    return;
  }
  const hot = kind === "bombHot";
  const [lit, mid, shade] = hot
    ? [HOT_LIT, HOT, HOT_SHADE]
    : [CASING_LIT, CASING, CASING_SHADE];
  // The casing is centred **on** the surface rather than resting on it: a mine
  // is a thing half buried where it was laid, not a marker someone planted. It
  // is also what makes one bomb enough on a two-sided surface — a sphere
  // straddling the tile pokes out equally on both faces, so unlike the pin it
  // needs no second copy for the far side (see `SolidBoard.rebuildMarkers`).
  sphere(f, 0, BOMB_R, scale, lit, mid, shade);
  for (const dir of SPIKE_DIRS) spike(f, 0, BOMB_R, dir);
}
