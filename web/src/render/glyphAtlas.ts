import { CanvasTexture, LinearFilter, SRGBColorSpace, Texture } from "three";

// A canvas-baked texture atlas of the cell glyphs (digits 1-8, flag, mine).
// One texture, sampled by UV quads over each cell, keeps the whole board to a
// couple of draw calls. Rebake (`makeGlyphAtlas`) when the device pixel ratio
// changes so glyphs stay crisp.

// A digit 1..26, a flag, a mine, a crossed-out flag (a misplaced flag revealed
// on loss), or that cross on its own — which is what a misplaced flag needs on a
// board whose style stands a real 3D pin on the cell, since the pin is already
// the flag and only the "you were wrong" mark is missing. 0 means empty.
export type Glyph = number | "flag" | "mine" | "wrongFlag" | "cross";

/** The largest number a cell can be asked to draw, which is the largest degree
 * in the catalogue: 26, on the volume board, where a cell's neighbours are the
 * 3x3x3 block of cubes around it minus itself. (Shared-vertex adjacency on the
 * surfaces reaches 21, and on triangles and hexagons 12.) A board that could
 * out-count this would draw the *wrong* number rather than none, so
 * `tests/unit/conformance.test.ts` measures the whole catalogue against it. */
export const MAX_DIGIT_GLYPH = 26;

// Slot order in the atlas grid. Index 0 (empty) is intentionally blank.
const SLOTS: Glyph[] = [
  ...Array.from({ length: MAX_DIGIT_GLYPH + 1 }, (_, n) => n as Glyph),
  "flag", "mine", "wrongFlag", "cross",
];
const COLS = 6;
const ROWS = 6; // 6x6 = 36 slots; the last five are spare

// Classic minesweeper digit colours; 9+ reuse a neutral dark tone.
const DIGIT_COLORS: Record<number, string> = {
  1: "#2f6bff",
  2: "#2e9e3f",
  3: "#e5534b",
  4: "#1b2a78",
  5: "#8a1f1f",
  6: "#1f8a8a",
  7: "#202020",
  8: "#6b6b6b",
};

/** The flag's own colours: `mast` and `cloth` are what the 2D glyph below
 * actually draws. `stand`, `slab`, `clothLit` and `clothShade` are no longer
 * read here; they live on for `render/markers3d.ts` — the 3D pin that stands
 * on a flagged cell instead of this billboard on some themes, and has to land
 * on the same family or the two looks would be two different flags.
 * Deliberately fixed rather than themed: the flag is the game's own glyph, not
 * a control (see README, "Settings and themes"). `ui/hud.ts` still spells its
 * copy out by hand, since that one is an inline SVG string. */
export const FLAG_COLORS = {
  mast: "#2b2f3a",
  stand: "#3a3f4b",
  slab: "#22252d",
  clothLit: "#f2695f",
  cloth: "#e5534b",
  clothShade: "#c33a35",
} as const;

/** The mine's, for the same reason — `render/markers3d.ts` builds the 3D bomb
 * that stands on a mined cell where a style asks for one, and it and `drawMine`
 * below are meant to be the same object seen two ways. The casing is a radial
 * gradient in 2D; in 3D the lighting does that, so the three casing tones are
 * named for what they are rather than by gradient stop. */
export const MINE_COLORS = {
  /** The casing where the key light lands. */
  casingLit: "#5a616f",
  casing: "#2c303a",
  /** ...and where it falls away, at the terminator. */
  casingShade: "#141720",
  spike: "#4b5261",
  /** The one ink `drawFlatMine` draws the whole glyph in — the modelled
   * casing's own tone taken to a single flat value, a step darker than
   * `casing` so a solid disc of it holds against a light opened tile. */
  flatCasing: "#1f232b",
  /** ...and its one square of light. Warm rather than pure white, so it sits
   * with the Sand page; on Classic's grays it reads as the plain glint it is. */
  glint: "#f4f1e8",
} as const;

export interface GlyphAtlas {
  texture: Texture;
  /** UV rect [u0, v0, u1, v1] for a glyph, or null for empty. */
  uv(glyph: Glyph): [number, number, number, number] | null;
}

function slotIndex(glyph: Glyph): number {
  return SLOTS.indexOf(glyph);
}

// Half again the old 128: a cell on a big board (a pentagon of the 60-pentagon
// sphere fills ~70 CSS px, so ~140 device px on a retina screen) draws the flag
// and the mine near enough 1:1, and their detail survives.
/** What a cell style asks of the atlas: which flag to bake and which face the
 * digits are set in. A subset of `CellStyle` rather than the thing itself, so
 * this module keeps knowing nothing about relief. */
export interface GlyphOptions {
  flatMine?: true;
  digitFont?: string;
}

export function makeGlyphAtlas(cellPx = 192, options: GlyphOptions = {}): GlyphAtlas {
  const canvas = document.createElement("canvas");
  canvas.width = COLS * cellPx;
  canvas.height = ROWS * cellPx;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("2d context unavailable for glyph atlas");

  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  const mine = options.flatMine ? drawFlatMine : drawMine;

  SLOTS.forEach((glyph, i) => {
    if (glyph === 0) return;
    const cx = (i % COLS) * cellPx + cellPx / 2;
    const cy = Math.floor(i / COLS) * cellPx + cellPx / 2;
    if (typeof glyph === "number") {
      ctx.fillStyle = DIGIT_COLORS[glyph] ?? "#202020";
      const scale = glyph >= 10 ? 0.5 : 0.7; // two digits fit narrower
      // Rubik (the pygame board font) unless the style names another; falls back
      // to sans-serif until the face has loaded.
      const face = options.digitFont ?? '"Rubik", sans-serif';
      ctx.font = `bold ${Math.round(cellPx * scale)}px ${face}`;
      ctx.fillText(String(glyph), cx, cy + cellPx * 0.03);
    } else if (glyph === "flag") {
      drawFlag(ctx, cx, cy, cellPx);
    } else if (glyph === "wrongFlag") {
      drawFlag(ctx, cx, cy, cellPx);
      drawCross(ctx, cx, cy, cellPx);
    } else if (glyph === "cross") {
      drawCross(ctx, cx, cy, cellPx);
    } else {
      mine(ctx, cx, cy, cellPx);
    }
  });

  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  texture.magFilter = LinearFilter;
  texture.minFilter = LinearFilter;
  texture.needsUpdate = true;

  return {
    texture,
    uv(glyph) {
      const i = slotIndex(glyph);
      if (i < 0 || glyph === 0) return null;
      const col = i % COLS;
      const row = Math.floor(i / COLS);
      const u0 = col / COLS;
      const u1 = (col + 1) / COLS;
      // Canvas y grows downward, texture v grows upward.
      const v1 = 1 - row / ROWS;
      const v0 = 1 - (row + 1) / ROWS;
      return [u0, v0, u1, v1];
    },
  };
}

/**
 * The game's one flag glyph: a mast hoisting a deep pennant flush against its
 * right side, a knobbed masthead and a splayed foot planting it — rather than
 * standing it on a T. One drawing, sized to survive every cell from a 140px
 * sphere pentagon down to a 28px triangle on a mixed tiling; there is no
 * second, simpler version for a small one.
 *
 * Drawn rather than set as an emoji: the app ships two fonts (Rubik for the
 * board, DSEG7 for the counters) and neither carries 🚩, so an emoji flag would
 * fall through to whatever the platform has — a different picture on every
 * device, and nothing at all under the headless browser the visual baselines
 * are shot in.
 */
function drawFlag(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  s: number,
): void {
  // A 24-unit grid at u = s * 0.96 / 24 — the same grid the old flat flag used,
  // grown ~4% (the glyph's extremes are x 20.4 / y 20.6, 0.34*s from centre,
  // well inside the 0.5*s slot the linear-filtered atlas needs).
  const u = (s * 0.96) / 24;
  const at = (x: number, y: number): [number, number] => [cx + (x - 12) * u, cy + (y - 12) * u];

  ctx.fillStyle = FLAG_COLORS.mast;
  // the mast: a plain bar, its right side flush with the cloth's hoist edge
  ctx.beginPath();
  ctx.moveTo(...at(6.7, 4.0));
  ctx.lineTo(...at(8.0, 4.0));
  ctx.lineTo(...at(8.0, 19.4));
  ctx.lineTo(...at(6.7, 19.4));
  ctx.closePath();
  ctx.fill();
  // the masthead knob, its lower right touching the cloth's top corner and no further
  ctx.beginPath();
  ctx.arc(...at(7.35, 3.55), 0.95 * u, 0, Math.PI * 2);
  ctx.fill();
  // the foot: a splayed wedge, wider than the mast and lower than a bar, so
  // the flag reads as planted rather than as a T
  ctx.beginPath();
  ctx.moveTo(...at(5.9, 18.4));
  ctx.lineTo(...at(8.8, 18.4));
  ctx.lineTo(...at(11.4, 20.6));
  ctx.lineTo(...at(3.3, 20.6));
  ctx.closePath();
  ctx.fill();

  // the cloth: hoisted flush on the mast, deep enough that no bare stick shows
  ctx.fillStyle = FLAG_COLORS.cloth;
  ctx.beginPath();
  ctx.moveTo(...at(8.0, 4.2));
  ctx.lineTo(...at(20.4, 8.4));
  ctx.lineTo(...at(8.0, 13.6));
  ctx.closePath();
  ctx.fill();
}

/**
 * The mine with everything modelled taken out of it: one filled disc, eight
 * straight spikes, one square of light. What a style asks for with
 * `CellStyle.flatMine`.
 *
 * It exists for the reason the flag glyph used to have a flat counterpart:
 * `drawMine` below is *relief* —
 * a radial-gradient casing, a reflected rim light, a specular highlight — and
 * relief is what a flat style is deliberately not doing; a quiet board turns a
 * shaded iron sphere into the loudest object on it. At the size a triangle of a
 * mixed tiling gives a glyph the shading collapses into a smudge anyway, while
 * a disc and eight spikes survive the same box, which is the other half of it.
 *
 * The spikes are butt-capped and start inside the casing, so disc and spikes
 * fuse into one silhouette with no seam to alias at small sizes, and there are
 * exactly two colours in the whole glyph.
 */
function drawFlatMine(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  s: number,
): void {
  // Sized as `drawMine` is, and for the same reason: the spikes have to stay
  // inside the slot, since the atlas samples with a linear filter and anything
  // over the edge bleeds into the neighbouring glyph.
  const r = s * 0.25;

  ctx.strokeStyle = MINE_COLORS.flatCasing;
  ctx.lineWidth = r * 0.2;
  ctx.lineCap = "butt";
  for (let k = 0; k < 8; k++) {
    const a = (k * Math.PI) / 4;
    const [ca, sa] = [Math.cos(a), Math.sin(a)];
    ctx.beginPath();
    ctx.moveTo(cx + ca * r * 0.6, cy + sa * r * 0.6);
    ctx.lineTo(cx + ca * r * 1.42, cy + sa * r * 1.42);
    ctx.stroke();
  }

  ctx.fillStyle = MINE_COLORS.flatCasing;
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fill();

  // One square glint, up and left, where the modelled casing's specular sits.
  ctx.fillStyle = MINE_COLORS.glint;
  ctx.fillRect(cx - r * 0.52, cy - r * 0.52, r * 0.3, r * 0.3);
}

/** A dark X across the cell — drawn over a flag to mark it as misplaced when
 * the board is revealed on loss (matches gui.py's `draw_flag(wrong=True)`). */
function drawCross(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  s: number,
): void {
  const r = s * 0.36;
  ctx.strokeStyle = "#222428"; // MINE_COLOR
  ctx.lineWidth = s * 0.08;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(cx - r, cy - r);
  ctx.lineTo(cx + r, cy + r);
  ctx.moveTo(cx - r, cy + r);
  ctx.lineTo(cx + r, cy - r);
  ctx.stroke();
}

/**
 * The mine as a moored sea mine: a shaded iron sphere studded with Hertz
 * horns, split by its casing seam and shackled to a mooring ring below. No
 * fuse and no spark — this is the thing the board is named for, sitting there
 * waiting, not a cartoon bomb going off.
 *
 * Drawn rather than set as an emoji for the same reason as the flag: neither
 * shipped font carries 💣, so it would render differently on every device and
 * not at all headless.
 */
function drawMine(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  s: number,
): void {
  // Sized so the horns and the mooring ring stay inside the slot — the atlas
  // samples with a linear filter, and anything over the edge bleeds into the
  // neighbouring glyph.
  const r = s * 0.26;
  const bx = cx;
  const by = cy - s * 0.03;

  // Hertz horns: stubby lead cylinders with rounded ends, offset half a step
  // so none of them points straight down into the mooring ring
  ctx.strokeStyle = MINE_COLORS.spike;
  ctx.lineWidth = r * 0.28;
  ctx.lineCap = "round";
  for (let k = 0; k < 8; k++) {
    const a = (k * Math.PI) / 4 + Math.PI / 8;
    const [ca, sa] = [Math.cos(a), Math.sin(a)];
    ctx.beginPath();
    ctx.moveTo(bx + ca * r * 0.9, by + sa * r * 0.9);
    ctx.lineTo(bx + ca * r * 1.34, by + sa * r * 1.34);
    ctx.stroke();
  }

  // mooring ring, hanging from a shackle under the casing
  ctx.strokeStyle = "#3a3f4b";
  ctx.lineWidth = r * 0.16;
  ctx.beginPath();
  ctx.moveTo(bx, by + r * 0.9);
  ctx.lineTo(bx, by + r * 1.2);
  ctx.stroke();
  ctx.lineWidth = r * 0.13;
  ctx.beginPath();
  ctx.arc(bx, by + r * 1.42, r * 0.24, 0, Math.PI * 2);
  ctx.stroke();

  // casing: lit from the upper left, darkening to a rim at the lower right
  const shell = ctx.createRadialGradient(
    bx - r * 0.35,
    by - r * 0.4,
    r * 0.1,
    bx,
    by,
    r * 1.15,
  );
  shell.addColorStop(0, MINE_COLORS.casingLit);
  shell.addColorStop(0.5, MINE_COLORS.casing);
  shell.addColorStop(1, MINE_COLORS.casingShade);
  ctx.fillStyle = shell;
  ctx.beginPath();
  ctx.arc(bx, by, r, 0, Math.PI * 2);
  ctx.fill();

  // the seam where the two halves of the casing bolt together
  ctx.strokeStyle = "rgba(12, 14, 20, 0.55)";
  ctx.lineWidth = r * 0.08;
  ctx.beginPath();
  ctx.ellipse(bx, by + r * 0.12, r * 0.99, r * 0.3, 0, Math.PI * 0.02, Math.PI * 0.98);
  ctx.stroke();
  // reflected light along the lower rim
  ctx.strokeStyle = "rgba(150, 160, 180, 0.3)";
  ctx.lineWidth = r * 0.05;
  ctx.beginPath();
  ctx.arc(bx, by, r * 0.95, Math.PI * 0.2, Math.PI * 0.7);
  ctx.stroke();

  // specular highlight
  ctx.fillStyle = "rgba(255, 255, 255, 0.85)";
  ctx.beginPath();
  ctx.ellipse(bx - r * 0.38, by - r * 0.36, r * 0.22, r * 0.15, -0.7, 0, Math.PI * 2);
  ctx.fill();
}
