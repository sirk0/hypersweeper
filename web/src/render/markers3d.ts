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
//
// **Every pin is the same object.** Only where it stands, which way is up and
// how big it is differ between one and the next, so each of the four models is
// generated **once** — by running the shape code below against the identity
// frame — and thereafter placed by transforming that template
// (`MODELS`/`writeMarker`). That matters because the trigonometry, the normals
// and the colour ramp are the expensive part: a bomb is 648 triangles, and
// regenerating one from scratch costs thousands of short-lived arrays where
// replaying it costs one multiply-add per coordinate and a bulk copy of the
// colours. A board full of pins used to rebuild in tens of milliseconds; it now
// rebuilds in tens of microseconds, which is what makes a Klein scroll and a
// board-wide reveal feel instant.

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

/** A pin planted by *holding* a cell descends onto it: how big it starts, as a
 * multiple of its settled size, and how far above the cell it starts, in
 * multiples of its own height.
 *
 * The 2D flag drop this replaces is far bigger — up to ten times the settled
 * glyph — because it is a picture, and a picture has to be enormous before a
 * player reads it as the same flag that will end up in the cell. A pin does not:
 * it is an object with a size, and one three times too big reads as a mistake
 * rather than as an arrival. What it has instead is *height*, which a flat quad
 * pinned to the board could never use, so the drop is mostly a fall.
 *
 * Both numbers exist for one reason: the finger doing the holding is sitting on
 * the cell, so the pin has to be somewhere else — above it — for the moment it
 * is worth watching. */
const DROP_START_SCALE = 1.9;
const DROP_START_HEIGHT = 0.9;

/** The size and the height above its cell of a pin `progress` of the way
 * through its drop (0 at the top, 1 landed — both settle to exactly the resting
 * values at 1, so the hand-off to the standing pin is invisible). */
export function markerDrop(progress: number, fit: number): { scale: number; rise: number } {
  const ease = 1 - progress;
  return {
    scale: fit * (1 + (DROP_START_SCALE - 1) * ease),
    // Quadratic, so it falls the way a thing dropped falls — slowly out of the
    // top of the arc and fast into the cell — rather than sliding down at a
    // constant rate.
    rise: fit * MARKER_REACH * DROP_START_HEIGHT * ease * ease,
  };
}

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

/** How much each part of a model wants to light up, 0..1 — the static half of
 * the Realistic glow (`render/markerGlow.ts` owns the moving half). A pin's
 * **head** is the lamp and its stem is not; a bomb's casing carries more of it
 * than its horns, which are machined lead and read better dark. A **dead pin**
 * is zero throughout: a flag that turned out to be wrong has the life gone out
 * of it, which is already the whole idea of that model.
 *
 * Written per vertex, not per model, for the same reason the colours are (see
 * `sphere`) — a lamp that switches on across a whole ball at one value reads as
 * paint, where a ramp from the crown down reads as light. */
const GLOW_HEAD = 1;
const GLOW_STEM = 0.12;
const GLOW_DEAD = 0;
const GLOW_CASING = 0.55;
const GLOW_SPIKE = 0.35;
const GLOW_HOT_CASING = 1;
const GLOW_HOT_SPIKE = 0.7;
/** What is left of a sphere's glow weight at its underside — see `sphere`. */
const GLOW_UNDERSIDE = 0.45;

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
  glo: number[];
  /** The glow weight `tri` stamps on what it writes — a pen the shape code sets
   * and then draws with, so no primitive needs a parameter for it. `sphere`
   * moves it ring by ring inside its own loop, which is what ramps a head. */
  glow: number;
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
  glows?: [number, number, number],
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
  if (glows) f.glo.push(glows[0], glows[1], glows[2]);
  else f.glo.push(f.glow, f.glow, f.glow);
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
  // ...and one glow weight per ring beside it, on the same schedule and for the
  // same reason: a ball lit at one value across all of it reads as paint, and a
  // weight per *triangle* would band it. The pen (`f.glow`) is the crown, and
  // the underside keeps `GLOW_UNDERSIDE` of it — a head glows from the top, the
  // way it is already coloured from the top.
  const glows: number[] = [];
  for (let ring = 0; ring <= SPHERE_RINGS; ring++) {
    const t = ring / SPHERE_RINGS;
    tones.push(
      t <= 0.5
        ? lit.clone().lerp(mid, t * 2)
        : mid.clone().lerp(shade, (t - 0.5) * 2),
    );
    glows.push(f.glow * (1 - (1 - GLOW_UNDERSIDE) * t));
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
    const gu = glows[ring]!;
    const gd = glows[ring + 1]!;
    for (let seg = 0; seg < SPHERE_SEGMENTS; seg++) {
      const a = at(ring, seg);
      const b = at(ring, seg + 1);
      const c = at(ring + 1, seg + 1);
      const d = at(ring + 1, seg);
      // The poles collapse to a point, so those rings are triangles.
      if (ring === 0) {
        tri(f, a, c, d, [up, down, down], [nAt(a), nAt(c), nAt(d)], [gu, gd, gd]);
      } else if (ring === SPHERE_RINGS - 1) {
        tri(f, a, b, c, [up, up, down], [nAt(a), nAt(b), nAt(c)], [gu, gu, gd]);
      } else {
        tri(f, a, b, c, [up, up, down], [nAt(a), nAt(b), nAt(c)], [gu, gu, gd]);
        tri(f, a, c, d, [up, down, down], [nAt(a), nAt(c), nAt(d)], [gu, gd, gd]);
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

/** One marker kind, generated once in its own frame: unit `scale`, standing on
 * the origin, +y up. Positions are fractions of a cell's inradius (the caller
 * multiplies by it), normals are already unit, and the colours never depend on
 * anything outside this file, so they are copied straight through. */
interface MarkerModel {
  pos: Float32Array;
  nrm: Float32Array;
  col: Float32Array;
  /** One weight per vertex, not three — see `MarkerSink.glow`. */
  glow: Float32Array;
  verts: number;
}

/** Where a marker's triangles are written, and how many vertices are in there
 * already. `writeMarker` advances `count`; the caller sizes the arrays up front
 * from `markerVertexCount`. */
export interface MarkerSink {
  pos: Float32Array;
  nrm: Float32Array;
  col: Float32Array;
  /** The static half of the Realistic glow: how much this vertex lights up when
   * the board's markers are lit. **One float per vertex**, so it is indexed by
   * `count` where the others are indexed by `count * 3` — the one place here
   * where that is not the same number. */
  glow: Float32Array;
  count: number;
}

function buildModel(kind: Marker): MarkerModel {
  const pos: number[] = [];
  const nrm: number[] = [];
  const col: number[] = [];
  const glo: number[] = [];
  // The identity frame: unit axes and no offset, so a point placed through it
  // comes out exactly as the shape code wrote it.
  const f: Frame = {
    origin: [0, 0, 0],
    ex: [1, 0, 0],
    ey: [0, 1, 0],
    ez: [0, 0, 1],
    pos,
    nrm,
    col,
    glo,
    glow: 0,
  };
  if (kind === "pin" || kind === "deadPin") {
    const dead = kind === "deadPin";
    const [lit, mid, shade] = dead
      ? [DEAD_LIT, DEAD, DEAD_SHADE]
      : [HEAD_LIT, HEAD, HEAD_SHADE];
    f.glow = dead ? GLOW_DEAD : GLOW_STEM;
    drum(f, 0, STEM_H, STEM_R0, STEM_R1, STEM_SIDES, dead ? FOOT : STEM, 1, true);
    f.glow = dead ? GLOW_DEAD : GLOW_HEAD;
    sphere(f, STEM_H + HEAD_R * 0.62, HEAD_R, 1, lit, mid, shade);
  } else {
    const hot = kind === "bombHot";
    const [lit, mid, shade] = hot
      ? [HOT_LIT, HOT, HOT_SHADE]
      : [CASING_LIT, CASING, CASING_SHADE];
    // The casing is centred **on** the surface rather than resting on it: a mine
    // is a thing half buried where it was laid, not a marker someone planted. It
    // is also what makes one bomb enough on a two-sided surface — a sphere
    // straddling the tile pokes out equally on both faces, so unlike the pin it
    // needs no second copy for the far side (see `SolidBoard.rebuildMarkers`).
    f.glow = hot ? GLOW_HOT_CASING : GLOW_CASING;
    sphere(f, 0, BOMB_R, 1, lit, mid, shade);
    f.glow = hot ? GLOW_HOT_SPIKE : GLOW_SPIKE;
    for (const dir of SPIKE_DIRS) spike(f, 0, BOMB_R, dir);
  }
  return {
    pos: Float32Array.from(pos),
    nrm: Float32Array.from(nrm),
    col: Float32Array.from(col),
    glow: Float32Array.from(glo),
    verts: pos.length / 3,
  };
}

const MODELS = new Map<Marker, MarkerModel>();

function model(kind: Marker): MarkerModel {
  let m = MODELS.get(kind);
  if (!m) {
    m = buildModel(kind);
    MODELS.set(kind, m);
  }
  return m;
}

/** How many vertices one of these takes in the buffer — what a caller needs to
 * size its arrays before writing any. */
export function markerVertexCount(kind: Marker): number {
  return model(kind).verts;
}

/**
 * Place one marker's triangles into `out`, starting at `out.count`.
 *
 * `origin` is where it is planted (the cell's top-face centre) and `up` the
 * direction it stands in — the cell's normal, so a marker leans with its tile as
 * the solid turns, which is most of what says it is standing on the board rather
 * than painted on it. On a two-sided surface, whose cells have no consistent
 * outward direction at all, the caller writes the marker twice with `up` negated
 * the second time, so there is one on each face.
 *
 * `scale` is the cell's inradius (times the flag-pop animation's scale, when one
 * is running), and every constant above is a fraction of it.
 *
 * This is the whole hot path: a copy of the model's colours and, per vertex,
 * three multiply-adds for the position and three more for the normal. The axes
 * are pre-scaled — exactly as the frame used to be — so a placed position is
 * bit-for-bit what generating the model in place produced. The normal needs no
 * `normalize`: `ex`/`ey`/`ez` are orthonormal, so a unit model normal comes out
 * of the rotation still unit.
 */
export function writeMarker(
  kind: Marker,
  origin: Vec3,
  up: Vec3,
  scale: number,
  out: MarkerSink,
): void {
  if (!(scale > 0)) return;
  const ey = normalize(up);
  // Nothing here has a front, so the two axes across the marker are free: any
  // perpendicular will do, and the cheap one is a cross with whichever
  // coordinate axis `ey` is least aligned with.
  const ex = normalize(cross(ey, Math.abs(ey[0]) < 0.9 ? [1, 0, 0] : [0, 1, 0]));
  const ez = cross(ex, ey);
  const m = model(kind);
  const base = out.count * 3;
  out.col.set(m.col, base);
  // A weight is one float per vertex, so this one is offset by `count` rather
  // than by `count * 3`. Like the colours it never depends on where the marker
  // stands, which is what keeps the glow off the rebuild path entirely: the
  // *amount* of light is a uniform, and this is only ever which parts take it.
  out.glow.set(m.glow, out.count);
  const [ox, oy, oz] = origin;
  const [rx, ry, rz] = ex;
  const [ux, uy, uz] = ey;
  const [fx, fy, fz] = ez;
  const sxx = rx * scale, sxy = ry * scale, sxz = rz * scale;
  const syx = ux * scale, syy = uy * scale, syz = uz * scale;
  const szx = fx * scale, szy = fy * scale, szz = fz * scale;
  const { pos: mp, nrm: mn } = m;
  for (let j = 0, end = m.verts * 3; j < end; j += 3) {
    const px = mp[j]!, py = mp[j + 1]!, pz = mp[j + 2]!;
    out.pos[base + j] = ox + sxx * px + syx * py + szx * pz;
    out.pos[base + j + 1] = oy + sxy * px + syy * py + szy * pz;
    out.pos[base + j + 2] = oz + sxz * px + syz * py + szz * pz;
    const nx = mn[j]!, ny = mn[j + 1]!, nz = mn[j + 2]!;
    out.nrm[base + j] = rx * nx + ux * ny + fx * nz;
    out.nrm[base + j + 1] = ry * nx + uy * ny + fy * nz;
    out.nrm[base + j + 2] = rz * nx + uz * ny + fz * nz;
  }
  out.count += m.verts;
}
