import { Color, SRGBColorSpace } from "three";

// Shape-based colour coding. A cell's colour is derived from its polygon alone
// — no shape tag exists on Board/Board3D, and none is needed:
//
//   hue        <- side count      (an even spectrum: 3 red, 4 orange, 5 yellow,
//                                  6 green, 8 teal, 12 blue, 13 violet)
//   chroma     <- how *regular* the polygon is, so a square reads as a clean
//                 orange and a diamond as a muted one — right next to it, and
//                 far from any triangle
//   lightness  <- the cell's state (hidden / opened), taken verbatim from the
//                 classic grays this replaced, so the hidden->opened step is
//                 unchanged — and, within a state, the tile's *size*, the one
//                 thing the axes above cannot see (a big square and a small one
//                 are the same shape); a smaller tile is drawn darker
//
// The maths runs in OkLCh rather than HSL: HSL lightness is not perceptual (a
// blue and a yellow at the same HSL L look nothing alike in brightness), which
// would wreck the constant hidden/opened contrast across hues.
//
// Everything tunable lives in SHAPE_PALETTE below — retuning the whole scheme
// is editing that one block.

export interface ShapeTone {
  /** Number of polygon sides. */
  sides: number;
  /** (minAngle/maxAngle + minSide/maxSide) / 2 — 1 for a regular polygon. */
  regularity: number;
  /** Which of the board's distinct shapes with this side count this is, and how
   * many there are (see `classifyShapes`). Two shapes with the same side count
   * — the Penrose thick and thin rhombi — would otherwise differ only by how
   * regular they are, which the faint board chroma barely carries; splitting
   * their hue a little way apart inside the side count's slot makes them tell
   * apart while both stay plainly "quadrilateral". Absent = the only one. */
  variant?: number;
  variantCount?: number;
  /** Which of the board's distinct *sizes* of this shape this is (0 = the
   * smallest), and how many there are. The isogonal tilings put two or three
   * sizes of one regular polygon on the same board — the Pythagorean tiling's
   * two squares, the three-scale triangular's three triangles — which side
   * count and regularity, the other two axes, cannot tell apart at all: they
   * are the *same shape*, just bigger. Size is carried mostly by lightness (the
   * one channel a shape does not otherwise use), with a hue fan and a chroma
   * boost behind it — see `sizeLightness`. Absent = the only size. */
  size?: number;
  sizeCount?: number;
}

/** Which lightness/chroma profile a colour is drawn at. */
export type BoardSurface = "flat" | "solid";

/** The four shades an icon paints one shape in. */
export type IconVariant = "base" | "light" | "dark" | "outline";

export const SHAPE_PALETTE = {
  /** [sides, OkLCh hue°]; linear in between, clamped outside. Monotone, so the
   * ramp walks one way round the wheel and 3-4-5-6 change gradually. The
   * anchors sit on the side counts the tilings actually produce (3, 4, 5, 6, 8,
   * 12, and the 13-gon hat) and are spread evenly over the spectrum — spacing
   * them evenly in `sides` instead would spend most of the wheel on the gaps at
   * 7 and 9-11, which no board has, and leave triangles and squares nearly the
   * same colour at the faint chroma the board is tinted with. */
  hueAnchors: [
    [3, 25], // red
    [4, 65], // orange
    [5, 105], // yellow
    [6, 148], // green
    [8, 195], // teal
    [12, 260], // blue
    [13, 310], // violet
  ] as [number, number][],

  /** How far apart the extreme variants of one side count are pushed: in hue
   * degrees, well inside the ~40° step between side counts so a diamond stays
   * nearer a square than any triangle, and in lightness, because at the faint
   * chroma the board carries, hue alone barely separates two quadrilaterals.
   * The lightness spread shifts both states equally, so it never eats into the
   * hidden/opened contrast. */
  hueSplit: 34,
  variantLightness: 0.05,

  /** How far apart the *sizes* of one shape are pushed, on three axes at once.
   * Size is the only thing separating those tiles — a small square and a large
   * one are the same hue and the same regularity — and one axis alone was too
   * quiet to read on a board (the isogonal tilings, where a tile's neighbours
   * are mostly the *other* size), so it gets the widest treatment of the three
   * shape axes:
   *
   *   lightness  the big one. Spread **downward only**, from the largest tile
   *              (which keeps the shape's own tone) to the smallest: the opened
   *              tone already sits near white, so lifting a size above it would
   *              clip to white and lose the distinction it was drawn for — and
   *              lose it exactly where the numbers are. Applied to the closed
   *              and opened tone equally, so the hidden/opened contrast the
   *              board is read by is untouched.
   *   hue        a small fan about the shape's hue, spread evenly across the
   *              sizes. Well inside the side count's ~40° slot (and inside the
   *              variant split), so every size still reads as the same shape.
   *   chroma     the smaller the tile the more saturated. It is the *opened*
   *              tone this actually reaches — a pale wash sitting far from the
   *              gamut edge, and the one on screen while playing; the closed
   *              tone is already at the edge for its hue, so there the extra is
   *              clamped away and size shows in lightness alone.
   */
  sizeLightness: 0.155,
  sizeHueSplit: 22,
  sizeChroma: 0.45,

  /** Regularity below `floor` counts as maximally irregular, at or above `top`
   * as regular. `top` sits below 1 because the surface immersions stretch their
   * tiles — a torus square measures about 0.7 — and a wrapped tiling should
   * still read as the clean shape it is. */
  regularity: { floor: 0.3, top: 0.8 },
  /** Fraction of the full chroma a maximally irregular tile keeps. Well above
   * zero: an irregular tiling is a whole board, and muting it far would just
   * make that board look dirty rather than make its tile look irregular. The
   * variant split below is what tells two shapes of the same side count apart,
   * so this only has to read as a shade of purity. */
  irregularChroma: 0.72,
  /** How much darker a maximally irregular tile is drawn. Applied equally to
   * both states, so it never touches the hidden/opened contrast. */
  lightnessSkew: 0.02,

  /** Board tones. Lightness comes from the gray each one replaces, so the
   * hidden -> opened step is numerically the one the board always had.
   *
   * Chroma is carried almost entirely by the closed tiles: an opened cell sits
   * near white, where sRGB has very little chroma left to give (about 0.03 for
   * a red at L 0.94 against 0.14 at L 0.77), and it has a number to stay
   * readable under. So closed tiles are properly colourful and opened ones a
   * clean pale wash of the same hue — which is also where the eye is while
   * playing. `cap` keeps a tone off the gamut edge, where a hue turns harsh
   * and starts clipping.
   *
   * `cuspBlend` is what makes a tile *saturated* rather than merely tinted.
   * sRGB holds almost no vivid red or blue at the gray's lightness — a red
   * there is dusty rose whatever chroma you ask for — so a hue whose most
   * colourful lightness sits below the gray's is drawn part of the way down
   * toward it. The shift is applied to the closed and opened tone alike, so the
   * step between them is still the gray board's, hue by hue; and it only ever
   * darkens, because the hues that peak *above* the gray (yellow, green)
   * already have all the chroma they can use up there. */
  board: {
    flat: {
      hidden: "#b4b4b4",
      revealed: "#ececec",
      chroma: { hidden: 0.145, revealed: 0.048 },
    },
    // Wider lightness split than the flat board: a curved surface's faces pick
    // up large shading differences of their own, which swamps a tint the flat
    // renderer's head-on lighting shows plainly.
    solid: {
      hidden: "#b4b4b4",
      revealed: "#efefef",
      chroma: { hidden: 0.155, revealed: 0.052 },
    },
    cap: 0.9,
    cuspBlend: 0.4,
    /** The **classic** board's grays, used by the one cell style that switches
     * the shape colours off (`CellStyle.monochrome`). Not the anchors above:
     * those were chosen for the colour scheme — the opened tone was pushed near
     * white so a pale wash of a hue still reads under a number — and a gray
     * board drawn at them has a hidden/opened step far wider than the classic
     * board ever had. These are a quotation instead, of `HIDDEN_FACE` and
     * `REVEALED_FACE` in the pygame build (minesweeper/gui.py), which is this
     * game's own classic board. The step between them is small on purpose: the
     * beveled relief is what tells closed from opened here, which is the whole
     * classic idiom. */
    mono: { hidden: "#bdbdbd", revealed: "#cdcdcd" },
  },

  /** Menu icons. They share the board's hue and regularity — a triangle is red
   * in the menu and red on the board — but keep the icon set's own vivid
   * lightness/chroma, because the board tint is deliberately faint and a 38 px
   * glyph painted in it would read as gray.
   *
   * Unlike the board, an icon does not hold its lightness fixed across hues:
   * sRGB simply has no vivid orange or yellow at the old indigo's lightness
   * (they come out brown and olive), so each hue is drawn near the lightness
   * where it is most colourful, pulled part-way back toward the indigo so the
   * set still reads as one family. */
  icon: {
    /** The indigo the icons used to be drawn in: the lightness reference. */
    base: "#6366f1",
    /** 0 = each hue at its own most vivid lightness, 1 = all at the indigo's. */
    lightnessBlend: 0.45,
    /** Fraction of the chroma still available at that lightness. */
    chroma: 0.85,
    // The light/dark variants only have to separate two tiles *of the same
    // shape* now that different shapes already differ in hue, so they lift and
    // drop less than the old indigo trio did — a washed-out pale tile would
    // throw away the hue that is now doing the work. `dark` still has to carry
    // the hairlines that subdivide a tile (tetrakis, triakis, kisrhombille).
    lightness: { base: 0, light: 0.08, dark: -0.17, outline: -0.06 },
    chromaScale: { base: 1, light: 0.85, dark: 1.05, outline: 0.95 },
  },

  /** Per-board shape classing (see `classifyShapes`): where to split the
   * regularity line, what grid to snap a class to, the share of its side count
   * a class must reach to count as a shape of its own rather than a few cells a
   * surface seam stretched, and how far apart two classes must land on the
   * cleanliness scale to be different *shapes* at all.
   *
   * `sizeGap` is the same idea one axis over: how much bigger one tile has to
   * be than another, in span, to count as a different size. Deliberately
   * coarse — the sizes it is there for differ by a third or a half (the
   * Pythagorean squares are 2:1) — so that tiles which merely *measure* a
   * little apart stay one size. The Penrose rhombi are the case that decides
   * it: same edge length, spans 10% apart, and they are already told apart by
   * hue, so they must not also split in lightness. */
  cluster: { gap: 0.08, snap: 0.05, minShare: 0.08, minCleanGap: 0.15, sizeGap: 0.15 },
} as const;

// -- OkLab / OkLCh <-> sRGB --------------------------------------------------
// Björn Ottosson's matrices. `Color` is fed through setRGB(..., SRGBColorSpace)
// so three's colour management converts to its linear working space itself.

function srgbToLinear(c: number): number {
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

function linearToSrgb(c: number): number {
  return c <= 0.0031308 ? 12.92 * c : 1.055 * Math.pow(c, 1 / 2.4) - 0.055;
}

interface Lch {
  l: number;
  c: number;
  h: number; // degrees
}

function hexToLch(hex: string): Lch {
  const v = parseInt(hex.slice(1), 16);
  const r = srgbToLinear(((v >> 16) & 255) / 255);
  const g = srgbToLinear(((v >> 8) & 255) / 255);
  const b = srgbToLinear((v & 255) / 255);
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  const okL = 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s;
  const okA = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s;
  const okB = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s;
  return {
    l: okL,
    c: Math.hypot(okA, okB),
    h: (Math.atan2(okB, okA) * 180) / Math.PI,
  };
}

/** OkLCh -> sRGB triple in 0..1, unclamped (so gamut can be tested). */
function lchToRgb({ l, c, h }: Lch): [number, number, number] {
  const rad = (h * Math.PI) / 180;
  const a = c * Math.cos(rad);
  const b = c * Math.sin(rad);
  const l_ = (l + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m_ = (l - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s_ = (l - 0.0894841775 * a - 1.291485548 * b) ** 3;
  return [
    linearToSrgb(4.0767416621 * l_ - 3.3077115913 * m_ + 0.2309699292 * s_),
    linearToSrgb(-1.2684380046 * l_ + 2.6097574011 * m_ - 0.3413193965 * s_),
    linearToSrgb(-0.0041960863 * l_ - 0.7034186147 * m_ + 1.707614701 * s_),
  ];
}

function inGamut(rgb: [number, number, number]): boolean {
  return rgb.every((v) => v >= -0.001 && v <= 1.001);
}

/** The requested colour, with chroma pulled back (never lightness or hue) until
 * it fits in sRGB — a clipped channel would silently skew the hue, which is the
 * one thing the whole scheme rides on. */
function fitRgb(lch: Lch): [number, number, number] {
  let rgb = lchToRgb(lch);
  if (inGamut(rgb)) return rgb.map((v) => Math.min(1, Math.max(0, v))) as [number, number, number];
  let lo = 0;
  let hi = lch.c;
  for (let i = 0; i < 12; i++) {
    const mid = (lo + hi) / 2;
    if (inGamut(lchToRgb({ ...lch, c: mid }))) lo = mid;
    else hi = mid;
  }
  rgb = lchToRgb({ ...lch, c: lo });
  return rgb.map((v) => Math.min(1, Math.max(0, v))) as [number, number, number];
}

/** The largest in-gamut chroma at this lightness and hue. */
function maxChroma(l: number, h: number): number {
  let lo = 0;
  let hi = 0.45;
  for (let i = 0; i < 14; i++) {
    const mid = (lo + hi) / 2;
    if (inGamut(lchToRgb({ l, c: mid, h }))) lo = mid;
    else hi = mid;
  }
  return lo;
}

/** The lightness at which a hue is most colourful (its sRGB gamut cusp) —
 * around 0.87 for yellow, 0.45 for blue. Scanned coarsely then refined; the
 * result feeds the icon profile only, and is cached per hue. */
const cuspCache = new Map<number, number>();
function cuspLightness(h: number): number {
  const key = Math.round(h);
  let best = cuspCache.get(key);
  if (best === undefined) {
    let bestChroma = -1;
    best = 0.5;
    for (let step = 0; step <= 40; step++) {
      const l = 0.3 + (step / 40) * 0.65;
      const c = maxChroma(l, h);
      if (c > bestChroma) {
        bestChroma = c;
        best = l;
      }
    }
    cuspCache.set(key, best);
  }
  return best;
}

function lchToColor(lch: Lch): Color {
  const [r, g, b] = fitRgb(lch);
  return new Color().setRGB(r, g, b, SRGBColorSpace);
}

function lchToHex(lch: Lch): string {
  const [r, g, b] = fitRgb(lch);
  const byte = (v: number): string =>
    Math.round(v * 255)
      .toString(16)
      .padStart(2, "0");
  return `#${byte(r)}${byte(g)}${byte(b)}`;
}

// -- shape -> tone -----------------------------------------------------------

/** How straight a vertex has to be to not be a corner at all, in radians, on
 * a *flat* polygon. A tile of an isogonal tiling carries T-vertices — the
 * corners of the neighbours whose edge it splits — sitting at exactly 180°
 * there, and counting one would make a square measure as an irregular
 * pentagon. The threshold is far below the flattest genuine corner on any
 * flat board (a Klein-bottle quad, ~172°) and far above the ~1e-6 rad that
 * vertex-tag rounding costs.
 *
 * A curved immersion (torus/cylinder/Mobius/Klein) bends a flat-template
 * straight line, so the *same* T-vertex reads anywhere up to several tens of
 * degrees off straight there — well past this threshold, and sometimes past
 * a tiling's own flattest genuine corner, so no geometric threshold (global or
 * relative to the polygon's own angles) can separate the two on every curved
 * board; a badly-warped cell can bend a real corner down as far as a
 * T-vertex, closing the gap between them entirely. That is what
 * `Board3D.cornerMask` is for: every curved wrap of an Archimedean/Laves
 * template supplies one, known exactly at build time from the flat template,
 * and `corners` uses it instead of this threshold whenever it is given. */
const STRAIGHT = 0.02;

const distance = (a: readonly number[], b: readonly number[]): number => {
  let sum = 0;
  for (let k = 0; k < a.length; k++) sum += (a[k]! - b[k]!) ** 2;
  return Math.sqrt(sum);
};

/** The angle a polygon turns through at vertex `i`, unsigned. */
function cornerAngle(poly: readonly (readonly number[])[], i: number): number {
  const n = poly.length;
  const prev = poly[(i + n - 1) % n]!;
  const cur = poly[i]!;
  const next = poly[(i + 1) % n]!;
  const back = distance(cur, prev);
  const side = distance(cur, next);
  if (side === 0 || back === 0) return Math.PI;
  let dotProduct = 0;
  for (let k = 0; k < cur.length; k++) {
    dotProduct += (prev[k]! - cur[k]!) * (next[k]! - cur[k]!);
  }
  return Math.acos(Math.min(1, Math.max(-1, dotProduct / (back * side))));
}

/** The polygon's real corners: the vertices where it actually turns. Identity
 * for every edge-to-edge tiling; for an isogonal one it drops the T-vertices,
 * so the tile is measured as the regular polygon it is drawn as.
 *
 * When `mask` is given (an Archimedean/Laves wrap's `Board3D.cornerMask`, one
 * bool per polygon vertex, true = real corner) it is authoritative — known at
 * build time from the tiling's flat template, so it needs no geometry and is
 * exact even where a curved immersion bends a T-vertex as far from flat as a
 * genuine corner (see `Board3D.cornerMask`'s own comment). Without one — a
 * flat board, a solid, or any tiling with no T-vertices — the exact STRAIGHT
 * threshold on the (necessarily flat) geometry does the same job. */
export function corners(
  poly: readonly (readonly number[])[],
  mask?: readonly boolean[],
): readonly (readonly number[])[] {
  const n = poly.length;
  if (n < 3) return poly;
  if (mask) {
    const kept = poly.filter((_, i) => mask[i]);
    return kept.length >= 3 ? kept : poly;
  }
  // No mask: a flat board (or a shape with no T-vertices at all), where
  // T-vertices read as ~1e-6 rad and the exact threshold alone finds them.
  const exact = poly.filter((_, i) => Math.abs(cornerAngle(poly, i) - Math.PI) > STRAIGHT);
  return exact.length >= 3 && exact.length < n ? exact : poly;
}

/**
 * Side count, regularity and span of a polygon, in 2D or 3D (side lengths by
 * distance, corner angles by dot product — so flat boards, solids and the
 * immersed surfaces all go through this one function). Collinear vertices are
 * dropped first (see `corners`).
 *
 * Corner angles are unsigned, i.e. a reflex corner counts as its 360°
 * complement. Every board tile but the hat monotile is convex, and for the hat
 * it only means its silhouette scores as slightly more regular than it is.
 */
export function shapeMetrics(
  polygon: readonly (readonly number[])[],
  cornerMask?: readonly boolean[],
): ShapeTone {
  const poly = corners(polygon, cornerMask);
  const n = poly.length;
  if (n < 3) return { sides: n, regularity: 1 };
  const dist = distance;
  let minSide = Infinity;
  let maxSide = 0;
  let minAngle = Infinity;
  let maxAngle = 0;
  for (let i = 0; i < n; i++) {
    const prev = poly[(i + n - 1) % n]!;
    const cur = poly[i]!;
    const next = poly[(i + 1) % n]!;
    const side = dist(cur, next);
    if (side < minSide) minSide = side;
    if (side > maxSide) maxSide = side;
    const back = dist(cur, prev);
    if (side === 0 || back === 0) continue;
    let dotProduct = 0;
    for (let k = 0; k < cur.length; k++) {
      dotProduct += (prev[k]! - cur[k]!) * (next[k]! - cur[k]!);
    }
    const angle = Math.acos(Math.min(1, Math.max(-1, dotProduct / (back * side))));
    if (angle < minAngle) minAngle = angle;
    if (angle > maxAngle) maxAngle = angle;
  }
  const regularity = (minAngle / maxAngle + minSide / maxSide) / 2;
  return {
    sides: n,
    regularity: Number.isFinite(regularity) ? Math.min(1, Math.max(0, regularity)) : 1,
  };
}

/** How big a tile is: the mean distance from its centroid to its corners. Works
 * in 2D and 3D, and is proportional to edge length for a regular polygon, so
 * two squares in a 2:1 tiling come out 2:1. */
export function tileSpan(
  polygon: readonly (readonly number[])[],
  cornerMask?: readonly boolean[],
): number {
  const poly = corners(polygon, cornerMask);
  const dims = poly[0]?.length ?? 2;
  const centre = new Array(dims).fill(0) as number[];
  for (const p of poly) for (let k = 0; k < dims; k++) centre[k]! += p[k]! / poly.length;
  let total = 0;
  for (const p of poly) total += distance(p, centre);
  return total / poly.length;
}

/**
 * One tone per cell, classed **per board**.
 *
 * The immersed surfaces distort their tiles (a Möbius board's quads land in
 * dozens of distinct signatures), so colouring each cell by its own regularity
 * would paint a saturation gradient across the board. Instead cells are grouped
 * by side count, their regularities clustered on the line (split wherever a
 * sorted gap exceeds `cluster.gap`), and every member of a cluster takes the
 * cluster's median snapped to a coarse grid. A torus of squares comes out one
 * flat colour; Penrose still splits into its thick and thin rhombi, whose
 * regularities are far apart.
 *
 * Splitting one side count into several shapes only ever happens on a **flat**
 * board, where congruent tiles measure identically and the clusters mean what
 * they say. On a curved one the measurement cannot carry that decision: a
 * surface of revolution makes every ring of cells congruent to itself and
 * different from the next, so a torus of triangles reads as several triangle
 * shapes when it has one, and torus 3.4.6.4 as eight shapes when it has three.
 * Those boards get one class per side count, which is right for every 3D board
 * in the catalog — none has two tiles with the same number of sides.
 *
 * Clusters the palette would paint the same are merged even on a flat board.
 * That is what keeps a geodesic sphere in one colour: its triangles measure
 * 0.85 and 1.00, the projection having left twenty of the eighty exact, but
 * both are simply "a regular triangle" to the colour model.
 *
 * What that leaves is Penrose — the one board in the catalog whose tiles
 * genuinely share a side count, its thick and thin rhombi exact at 0.83 and
 * 0.63 on the flat plane.
 */
export function classifyShapes<K>(
  polygons: Iterable<[K, readonly (readonly number[])[]]>,
  cornerMasks?: Map<K, readonly boolean[]> | null,
): Map<K, ShapeTone> {
  const raw = new Map<K, ShapeTone>();
  const spans = new Map<K, number>();
  const bySides = new Map<number, number[]>();
  const spansBySides = new Map<number, number[]>();
  // Vertices with a z are a board laid on a surface — see above.
  let curved = false;
  for (const [key, poly] of polygons) {
    const mask = cornerMasks?.get(key);
    const tone = shapeMetrics(poly, mask);
    if ((poly[0]?.length ?? 2) > 2) curved = true;
    raw.set(key, tone);
    const span = tileSpan(poly, mask);
    spans.set(key, span);
    let group = bySides.get(tone.sides);
    if (!group) bySides.set(tone.sides, (group = []));
    group.push(tone.regularity);
    let sizeGroup = spansBySides.get(tone.sides);
    if (!sizeGroup) spansBySides.set(tone.sides, (sizeGroup = []));
    sizeGroup.push(span);
  }

  const { gap, snap, minShare, minCleanGap, sizeGap } = SHAPE_PALETTE.cluster;
  // sides -> the representative regularity of each distinct shape, ascending
  const classes = new Map<number, number[]>();
  for (const [sides, values] of bySides) {
    values.sort((a, b) => a - b);
    if (curved) {
      classes.set(sides, [Math.round(values[Math.floor(values.length / 2)]! / snap) * snap]);
      continue;
    }
    const clusters: number[][] = [];
    let current: number[] = [];
    for (const v of values) {
      if (current.length && v - current[current.length - 1]! > gap) {
        clusters.push(current);
        current = [];
      }
      current.push(v);
    }
    if (current.length) clusters.push(current);
    // A handful of cells stretched by a surface seam are not a shape of their
    // own; fold anything below the share threshold into its nearest neighbour.
    const floor = values.length * minShare;
    let kept = clusters.filter((c) => c.length >= floor);
    if (!kept.length) kept = [clusters.reduce((a, b) => (b.length > a.length ? b : a))];

    // Collapse clusters the palette would paint alike (see the doc comment):
    // the survivor is the one with the most cells, so a projection's handful of
    // exact tiles does not outvote the many it stretched.
    const shapes: { value: number; count: number }[] = [];
    for (const c of kept) {
      const value = Math.round(c[Math.floor(c.length / 2)]! / snap) * snap;
      const previous = shapes[shapes.length - 1];
      if (previous && cleanliness(value) - cleanliness(previous.value) < minCleanGap) {
        if (c.length > previous.count) {
          previous.value = value;
          previous.count = c.length;
        }
        continue;
      }
      shapes.push({ value, count: c.length });
    }
    classes.set(sides, shapes.map((s) => s.value));
  }

  // sides -> the representative span of each distinct size, ascending. Split
  // on a *relative* gap, so the scale a board happens to be drawn at never
  // matters; one size on a curved board, for the same reason regularity gets
  // one class there (an immersion stretches every ring of cells differently).
  const sizes = new Map<number, number[]>();
  for (const [sideCount, values] of spansBySides) {
    values.sort((a, b) => a - b);
    if (curved) {
      sizes.set(sideCount, [values[Math.floor(values.length / 2)]!]);
      continue;
    }
    const groups: number[][] = [];
    let current: number[] = [];
    for (const v of values) {
      const previous = current[current.length - 1];
      if (previous !== undefined && (v - previous) / previous > sizeGap) {
        groups.push(current);
        current = [];
      }
      current.push(v);
    }
    if (current.length) groups.push(current);
    sizes.set(sideCount, groups.map((g) => g[Math.floor(g.length / 2)]!));
  }

  const toned = new Map<K, ShapeTone>();
  for (const [key, tone] of raw) {
    const reps = classes.get(tone.sides)!;
    let variant = 0;
    for (let i = 1; i < reps.length; i++) {
      if (Math.abs(tone.regularity - reps[i]!) < Math.abs(tone.regularity - reps[variant]!)) {
        variant = i;
      }
    }
    const sizeReps = sizes.get(tone.sides)!;
    const span = spans.get(key)!;
    let size = 0;
    for (let i = 1; i < sizeReps.length; i++) {
      if (Math.abs(span - sizeReps[i]!) < Math.abs(span - sizeReps[size]!)) size = i;
    }
    toned.set(key, {
      sides: tone.sides,
      regularity: reps[variant]!,
      variant,
      variantCount: reps.length,
      size,
      sizeCount: sizeReps.length,
    });
  }
  return toned;
}

// -- tone -> colour ----------------------------------------------------------

/** The hue of a shape: its side count's slot, nudged within that slot when the
 * board has more than one shape with that many sides, and again when it has
 * more than one size of this one. */
function hueForTone(tone: ShapeTone): number {
  return (
    hueFor(tone.sides) +
    SHAPE_PALETTE.hueSplit * variantOffset(tone) +
    SHAPE_PALETTE.sizeHueSplit * sizeOffset(tone)
  );
}

function hueFor(sides: number): number {
  const anchors = SHAPE_PALETTE.hueAnchors;
  const first = anchors[0]!;
  const last = anchors[anchors.length - 1]!;
  if (sides <= first[0]) return first[1];
  if (sides >= last[0]) return last[1];
  for (let i = 1; i < anchors.length; i++) {
    const [x1, h1] = anchors[i]!;
    if (sides <= x1) {
      const [x0, h0] = anchors[i - 1]!;
      return h0 + ((h1 - h0) * (sides - x0)) / (x1 - x0);
    }
  }
  return last[1];
}

/** 1 for a regular polygon, 0 for a maximally irregular one. */
function cleanliness(regularity: number): number {
  const { floor, top } = SHAPE_PALETTE.regularity;
  return Math.min(1, Math.max(0, (regularity - floor) / (top - floor)));
}

/** How far this shape's variant sits from the middle of its side count's slot,
 * in -0.5..0.5; 0 when the board has only one shape with that many sides. */
function variantOffset(tone: ShapeTone): number {
  const count = tone.variantCount ?? 1;
  return count < 2 ? 0 : (tone.variant ?? 0) / (count - 1) - 0.5;
}

/** Where this tile's size sits among the board's sizes of the shape, centred:
 * -0.5 for the smallest, 0.5 for the biggest, 0 when there is only one. Drives
 * the hue fan, which has no reason to favour either end. */
function sizeOffset(tone: ShapeTone): number {
  const count = tone.sizeCount ?? 1;
  return count < 2 ? 0 : (tone.size ?? 0) / (count - 1) - 0.5;
}

/** The same position measured downward from the biggest tile: 0 for the
 * biggest, -1 for the smallest, and 0 when the shape has only one size. This is
 * the one the lightness and chroma spreads use — see `sizeLightness` for why
 * they only ever go down from the shape's own tone, never up. */
function sizeDrop(tone: ShapeTone): number {
  const count = tone.sizeCount ?? 1;
  return count < 2 ? 0 : (tone.size ?? 0) / (count - 1) - 1;
}

/** A shape's colour at a given base lightness: the side count's hue, the
 * requested chroma scaled by how regular the tile is and clamped to what the
 * gamut holds at that lightness, and the lightness itself nudged by the tile's
 * regularity and variant. */
function toneLch(tone: ShapeTone, baseLightness: number, chroma: number): Lch {
  const clean = cleanliness(tone.regularity);
  const { irregularChroma, lightnessSkew, variantLightness, sizeLightness, sizeChroma } =
    SHAPE_PALETTE;
  const drop = sizeDrop(tone);
  const l =
    baseLightness -
    lightnessSkew * (1 - clean) +
    variantLightness * variantOffset(tone) +
    sizeLightness * drop;
  const h = hueForTone(tone);
  const wanted =
    chroma * (irregularChroma + (1 - irregularChroma) * clean) * (1 - sizeChroma * drop);
  return { l, c: Math.min(wanted, maxChroma(l, h) * SHAPE_PALETTE.board.cap), h };
}

/** How far a hue's board tones are pulled down toward the lightness where it is
 * most colourful. Never positive: see `cuspBlend`. */
function boardLightnessShift(tone: ShapeTone): number {
  const reference = boardGrays.flat.hidden.l;
  const drop = Math.min(0, cuspLightness(hueForTone(tone)) - reference);
  return drop * SHAPE_PALETTE.board.cuspBlend;
}

export interface CellPalette {
  hidden: Color;
  revealed: Color;
}

const boardGrays = {
  flat: {
    hidden: hexToLch(SHAPE_PALETTE.board.flat.hidden),
    revealed: hexToLch(SHAPE_PALETTE.board.flat.revealed),
  },
  solid: {
    hidden: hexToLch(SHAPE_PALETTE.board.solid.hidden),
    revealed: hexToLch(SHAPE_PALETTE.board.solid.revealed),
  },
};

const paletteCache = new Map<string, CellPalette>();

/** The plain gray pair — the board's own tones with no hue on them at all, i.e.
 * exactly the grays every anchor above is derived from. The Classic theme's
 * board (`CellStyle.monochrome`) is drawn in these: a shape-coloured board is a
 * different game to look at, whatever the tiles are cut like. Memoised per
 * surface like the coloured ones. */
function grayPalette(surface: BoardSurface): CellPalette {
  const key = `${surface}|gray`;
  let palette = paletteCache.get(key);
  if (!palette) {
    // Through the same OkLCh -> sRGB path every coloured tone takes (rather
    // than straight off the hex), so a gray board and a chroma-0 shape colour
    // are the same colour under three's colour management. One pair for both
    // surfaces: the anchors above split flat and solid to keep a *tint* legible
    // under a curved surface's own shading, and there is no tint here.
    palette = {
      hidden: lchToColor(hexToLch(SHAPE_PALETTE.board.mono.hidden)),
      revealed: lchToColor(hexToLch(SHAPE_PALETTE.board.mono.revealed)),
    };
    paletteCache.set(key, palette);
  }
  return palette;
}

/** The hidden/opened pair a cell of this shape is drawn in — or, when the cell
 * style is monochrome, the board's grays whatever the shape. Memoised: a board
 * has thousands of cells and a handful of shapes. */
export function cellPalette(
  tone: ShapeTone,
  surface: BoardSurface,
  monochrome = false,
): CellPalette {
  if (monochrome) return grayPalette(surface);
  const key = `${surface}|${tone.sides}|${tone.regularity.toFixed(3)}|${tone.variant ?? 0}/${
    tone.variantCount ?? 1
  }|${tone.size ?? 0}/${tone.sizeCount ?? 1}`;
  let palette = paletteCache.get(key);
  if (!palette) {
    const gray = boardGrays[surface];
    const { chroma } = SHAPE_PALETTE.board[surface];
    const shift = boardLightnessShift(tone);
    palette = {
      hidden: lchToColor(toneLch(tone, gray.hidden.l + shift, chroma.hidden)),
      revealed: lchToColor(toneLch(tone, gray.revealed.l + shift, chroma.revealed)),
    };
    paletteCache.set(key, palette);
  }
  return palette;
}

const iconBase = hexToLch(SHAPE_PALETTE.icon.base);

/** The hex a menu icon paints this shape in — same hue and regularity as the
 * board, at the icon set's own saturation. */
export function iconHex(tone: ShapeTone, variant: IconVariant): string {
  const { lightnessBlend, chroma, lightness, chromaScale } = SHAPE_PALETTE.icon;
  const hue = hueForTone(tone);
  const cusp = cuspLightness(hue);
  const l = cusp + (iconBase.l - cusp) * lightnessBlend + lightness[variant];
  const available = maxChroma(l, hue) * chroma * chromaScale[variant];
  return lchToHex(toneLch(tone, l, available));
}
