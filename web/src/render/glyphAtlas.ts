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

/** The flag's own colours. Named here because `drawFlag` below is where they
 * were first chosen, and `render/markers3d.ts` — the 3D pin that stands on a
 * flagged cell instead of this billboard on some themes — has to land on the
 * same family or the two looks would be two different flags. Deliberately fixed
 * rather than themed: the flag is the game's own glyph, not a control (see
 * README, "Settings and themes"). `ui/hud.ts` still spells its copy out by hand,
 * since that one is an inline SVG string. */
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
export function makeGlyphAtlas(cellPx = 192): GlyphAtlas {
  const canvas = document.createElement("canvas");
  canvas.width = COLS * cellPx;
  canvas.height = ROWS * cellPx;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("2d context unavailable for glyph atlas");

  ctx.textAlign = "center";
  ctx.textBaseline = "middle";

  SLOTS.forEach((glyph, i) => {
    if (glyph === 0) return;
    const cx = (i % COLS) * cellPx + cellPx / 2;
    const cy = Math.floor(i / COLS) * cellPx + cellPx / 2;
    if (typeof glyph === "number") {
      ctx.fillStyle = DIGIT_COLORS[glyph] ?? "#202020";
      const scale = glyph >= 10 ? 0.5 : 0.7; // two digits fit narrower
      // Rubik (the pygame board font); falls back to sans-serif until loaded.
      ctx.font = `bold ${Math.round(cellPx * scale)}px "Rubik", sans-serif`;
      ctx.fillText(String(glyph), cx, cy + cellPx * 0.03);
    } else if (glyph === "flag") {
      drawFlag(ctx, cx, cy, cellPx);
    } else if (glyph === "wrongFlag") {
      drawFlag(ctx, cx, cy, cellPx);
      drawCross(ctx, cx, cy, cellPx);
    } else if (glyph === "cross") {
      drawCross(ctx, cx, cy, cellPx);
    } else {
      drawMine(ctx, cx, cy, cellPx);
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
 * A flag with the detail a big cell deserves: a tapered mast, knobbed on top,
 * planted in a splayed stand on a ground slab — mast, stand and slab all on one
 * centre line — flying a pennant whose edges curve as cloth does, lit across
 * its width, folded darker where it falls away and creased at the hoist.
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
  // The mast, its stand and the ground slab all share one centre line — a flag
  // whose pole meets its base off-centre reads as a mistake at any size.
  const poleX = cx - s * 0.1;
  const top = cy - s * 0.36;
  const stand = cy + s * 0.24; // where the mast disappears into the stand
  const ground = cy + s * 0.33;

  // mast, tapering upward, ending in a knob; drawn first so the stand's
  // splayed foot closes over its base
  ctx.fillStyle = FLAG_COLORS.mast;
  ctx.beginPath();
  ctx.moveTo(poleX - s * 0.019, top);
  ctx.lineTo(poleX + s * 0.019, top);
  ctx.lineTo(poleX + s * 0.03, ground);
  ctx.lineTo(poleX - s * 0.03, ground);
  ctx.closePath();
  ctx.fill();
  ctx.beginPath();
  ctx.arc(poleX, top, s * 0.036, 0, Math.PI * 2);
  ctx.fill();

  // stand: a foot splaying out from the mast, on a ground slab
  ctx.fillStyle = FLAG_COLORS.stand;
  ctx.beginPath();
  ctx.moveTo(poleX - s * 0.055, stand);
  ctx.lineTo(poleX + s * 0.055, stand);
  ctx.lineTo(poleX + s * 0.16, ground);
  ctx.lineTo(poleX - s * 0.16, ground);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = FLAG_COLORS.slab;
  ctx.beginPath();
  ctx.moveTo(poleX - s * 0.19, ground);
  ctx.lineTo(poleX + s * 0.19, ground);
  ctx.lineTo(poleX + s * 0.19, ground + s * 0.05);
  ctx.lineTo(poleX - s * 0.19, ground + s * 0.05);
  ctx.closePath();
  ctx.fill();

  // the cloth: top edge lifting away from the mast, fly falling back
  const cloth = new Path2D();
  cloth.moveTo(poleX, top + s * 0.015);
  cloth.bezierCurveTo(
    poleX + s * 0.16,
    top - s * 0.04,
    poleX + s * 0.3,
    top + s * 0.02,
    poleX + s * 0.42,
    top + s * 0.07,
  );
  cloth.bezierCurveTo(
    poleX + s * 0.3,
    top + s * 0.15,
    poleX + s * 0.16,
    top + s * 0.16,
    poleX + s * 0.02,
    top + s * 0.27,
  );
  cloth.closePath();
  const lit = ctx.createLinearGradient(poleX, top, poleX + s * 0.42, top + s * 0.2);
  lit.addColorStop(0, FLAG_COLORS.clothLit);
  lit.addColorStop(0.55, FLAG_COLORS.cloth);
  lit.addColorStop(1, FLAG_COLORS.clothShade);
  ctx.fillStyle = lit;
  ctx.fill(cloth);

  // the fold along the lower edge, and the crease at the hoist
  ctx.save();
  ctx.clip(cloth);
  ctx.fillStyle = "rgba(120, 26, 24, 0.45)";
  ctx.beginPath();
  ctx.moveTo(poleX + s * 0.02, top + s * 0.27);
  ctx.bezierCurveTo(
    poleX + s * 0.18,
    top + s * 0.14,
    poleX + s * 0.32,
    top + s * 0.13,
    poleX + s * 0.42,
    top + s * 0.07,
  );
  ctx.lineTo(poleX + s * 0.42, top + s * 0.2);
  ctx.lineTo(poleX + s * 0.02, top + s * 0.32);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = "rgba(255, 255, 255, 0.16)";
  ctx.beginPath();
  ctx.moveTo(poleX, top);
  ctx.lineTo(poleX + s * 0.09, top + s * 0.01);
  ctx.lineTo(poleX + s * 0.05, top + s * 0.3);
  ctx.lineTo(poleX, top + s * 0.3);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
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
