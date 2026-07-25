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
//                 unchanged
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
   * cleanliness scale to be different *shapes* at all. */
  cluster: { gap: 0.08, snap: 0.05, minShare: 0.08, minCleanGap: 0.15 },
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

/**
 * Side count and regularity of a polygon, in 2D or 3D (side lengths by
 * distance, corner angles by dot product — so flat boards, solids and the
 * immersed surfaces all go through this one function).
 *
 * Corner angles are unsigned, i.e. a reflex corner counts as its 360°
 * complement. Every board tile but the hat monotile is convex, and for the hat
 * it only means its silhouette scores as slightly more regular than it is.
 */
export function shapeMetrics(poly: readonly (readonly number[])[]): ShapeTone {
  const n = poly.length;
  if (n < 3) return { sides: n, regularity: 1 };
  const dist = (a: readonly number[], b: readonly number[]): number => {
    let sum = 0;
    for (let k = 0; k < a.length; k++) sum += (a[k]! - b[k]!) ** 2;
    return Math.sqrt(sum);
  };
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
 * Clusters that the palette would paint the same are then merged back into
 * one. A sphere of geodesic triangles measures 0.85 and 1.00 — the projection
 * stretches sixty of the eighty — but both are simply "a regular triangle" to
 * the colour model, and splitting them would hand one group a different hue
 * for a difference the scheme does not otherwise draw. Penrose's rhombi, at
 * 0.60 and 0.85, land far enough apart to survive.
 */
export function classifyShapes<K>(
  polygons: Iterable<[K, readonly (readonly number[])[]]>,
): Map<K, ShapeTone> {
  const raw = new Map<K, ShapeTone>();
  const bySides = new Map<number, number[]>();
  for (const [key, poly] of polygons) {
    const tone = shapeMetrics(poly);
    raw.set(key, tone);
    let group = bySides.get(tone.sides);
    if (!group) bySides.set(tone.sides, (group = []));
    group.push(tone.regularity);
  }

  const { gap, snap, minShare, minCleanGap } = SHAPE_PALETTE.cluster;
  // sides -> the representative regularity of each distinct shape, ascending
  const classes = new Map<number, number[]>();
  for (const [sides, values] of bySides) {
    values.sort((a, b) => a - b);
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

  const toned = new Map<K, ShapeTone>();
  for (const [key, tone] of raw) {
    const reps = classes.get(tone.sides)!;
    let variant = 0;
    for (let i = 1; i < reps.length; i++) {
      if (Math.abs(tone.regularity - reps[i]!) < Math.abs(tone.regularity - reps[variant]!)) {
        variant = i;
      }
    }
    toned.set(key, {
      sides: tone.sides,
      regularity: reps[variant]!,
      variant,
      variantCount: reps.length,
    });
  }
  return toned;
}

// -- tone -> colour ----------------------------------------------------------

/** The hue of a shape: its side count's slot, nudged within that slot when the
 * board has more than one shape with that many sides. */
function hueForTone(tone: ShapeTone): number {
  return hueFor(tone.sides) + SHAPE_PALETTE.hueSplit * variantOffset(tone);
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

/** A shape's colour at a given base lightness: the side count's hue, the
 * requested chroma scaled by how regular the tile is and clamped to what the
 * gamut holds at that lightness, and the lightness itself nudged by the tile's
 * regularity and variant. */
function toneLch(tone: ShapeTone, baseLightness: number, chroma: number): Lch {
  const clean = cleanliness(tone.regularity);
  const { irregularChroma, lightnessSkew, variantLightness } = SHAPE_PALETTE;
  const l = baseLightness - lightnessSkew * (1 - clean) + variantLightness * variantOffset(tone);
  const h = hueForTone(tone);
  const wanted = chroma * (irregularChroma + (1 - irregularChroma) * clean);
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

/** The hidden/opened pair a cell of this shape is drawn in. Memoised: a board
 * has thousands of cells and a handful of shapes. */
export function cellPalette(tone: ShapeTone, surface: BoardSurface): CellPalette {
  const key = `${surface}|${tone.sides}|${tone.regularity.toFixed(3)}|${tone.variant ?? 0}/${
    tone.variantCount ?? 1
  }`;
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
