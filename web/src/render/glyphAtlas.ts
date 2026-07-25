import { CanvasTexture, LinearFilter, SRGBColorSpace, Texture } from "three";

// A canvas-baked texture atlas of the cell glyphs (digits 1-8, flag, mine).
// One texture, sampled by UV quads over each cell, keeps the whole board to a
// couple of draw calls. Rebake (`makeGlyphAtlas`) when the device pixel ratio
// changes so glyphs stay crisp.

// A digit 1..12 (shared-vertex adjacency on triangles/hexagons can exceed 8),
// a flag, a mine, or a crossed-out flag (a misplaced flag revealed on loss).
// 0 means empty.
export type Glyph = number | "flag" | "mine" | "wrongFlag";

// Slot order in the atlas grid. Index 0 (empty) is intentionally blank.
// 16 slots fill the 4x4 grid exactly.
const SLOTS: Glyph[] = [
  0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, "flag", "mine", "wrongFlag",
];
const COLS = 4;
const ROWS = 4; // 4x4 = 16 slots, all used

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
 * A flag with the detail a big cell deserves: a tapered mast standing on a
 * two-tone plinth, a knob on top, and a pennant whose edges curve as cloth
 * does — lit across its width and folded darker where it falls away, with the
 * hoist creased against the mast.
 *
 * Drawn rather than set as an emoji on purpose: 🚩 is a different picture on
 * every platform (and missing outright on some Linux/CI fonts), while the
 * board's flag has to line up with the same flag the menu and the header
 * smiley draw.
 */
function drawFlag(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  s: number,
): void {
  const poleX = cx - s * 0.13;
  const top = cy - s * 0.34;
  const foot = cy + s * 0.29;

  // plinth: a shallow trapezoid on a base slab
  ctx.fillStyle = "#3a3f4b";
  ctx.beginPath();
  ctx.moveTo(cx - s * 0.11, foot - s * 0.05);
  ctx.lineTo(cx + s * 0.11, foot - s * 0.05);
  ctx.lineTo(cx + s * 0.2, foot + s * 0.05);
  ctx.lineTo(cx - s * 0.2, foot + s * 0.05);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = "#22252d";
  ctx.beginPath();
  ctx.moveTo(cx - s * 0.2, foot + s * 0.05);
  ctx.lineTo(cx + s * 0.2, foot + s * 0.05);
  ctx.lineTo(cx + s * 0.2, foot + s * 0.09);
  ctx.lineTo(cx - s * 0.2, foot + s * 0.09);
  ctx.closePath();
  ctx.fill();

  // mast, tapering toward the top, with a knob
  ctx.fillStyle = "#2b2f3a";
  ctx.beginPath();
  ctx.moveTo(poleX - s * 0.018, top);
  ctx.lineTo(poleX + s * 0.018, top);
  ctx.lineTo(poleX + s * 0.032, foot - s * 0.04);
  ctx.lineTo(poleX - s * 0.032, foot - s * 0.04);
  ctx.closePath();
  ctx.fill();
  ctx.beginPath();
  ctx.arc(poleX, top, s * 0.035, 0, Math.PI * 2);
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
  lit.addColorStop(0, "#f2695f");
  lit.addColorStop(0.55, "#e5534b");
  lit.addColorStop(1, "#c33a35");
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
 * The mine as the bomb it is meant to read as: a shaded iron ball with tapered
 * spikes, a fuse curling out of its cap and a lit spark on the end — the
 * picture 💣 draws, without depending on an emoji font the browser may render
 * in a wholly different style (or, headless, not at all).
 */
function drawMine(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  s: number,
): void {
  // Sized so the spikes, the fuse and its spark all stay inside the slot — the
  // atlas samples with a linear filter, and anything over the edge bleeds into
  // the neighbouring glyph.
  const r = s * 0.25;
  const bx = cx - s * 0.06;
  const by = cy + s * 0.11;

  // spikes, tapering out of the body
  ctx.fillStyle = "#22252d";
  for (let k = 0; k < 8; k++) {
    const a = (k * Math.PI) / 4 + Math.PI / 8;
    const [ca, sa] = [Math.cos(a), Math.sin(a)];
    const [px, py] = [-sa, ca]; // perpendicular
    const w = r * 0.26;
    ctx.beginPath();
    ctx.moveTo(bx + px * w, by + py * w);
    ctx.lineTo(bx + ca * r * 1.45, by + sa * r * 1.45);
    ctx.lineTo(bx - px * w, by - py * w);
    ctx.closePath();
    ctx.fill();
  }

  // fuse: a cord out of the cap, with a spark on the end
  ctx.strokeStyle = "#6b5238";
  ctx.lineWidth = s * 0.045;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(bx + r * 0.34, by - r * 0.92);
  ctx.bezierCurveTo(
    bx + r * 1.05,
    by - r * 1.3,
    bx + r * 0.65,
    by - r * 1.7,
    bx + r * 1.25,
    by - r * 1.72,
  );
  ctx.stroke();
  const spark = ctx.createRadialGradient(
    bx + r * 1.32,
    by - r * 1.76,
    0,
    bx + r * 1.32,
    by - r * 1.76,
    r * 0.42,
  );
  spark.addColorStop(0, "#fff3c4");
  spark.addColorStop(0.45, "#ffb020");
  spark.addColorStop(1, "rgba(255, 120, 0, 0)");
  ctx.fillStyle = spark;
  ctx.beginPath();
  ctx.arc(bx + r * 1.32, by - r * 1.76, r * 0.42, 0, Math.PI * 2);
  ctx.fill();

  // the cap the fuse leaves through
  ctx.fillStyle = "#3a3f4b";
  ctx.beginPath();
  ctx.ellipse(bx + r * 0.3, by - r * 0.88, r * 0.24, r * 0.16, -0.6, 0, Math.PI * 2);
  ctx.fill();

  // body: lit from the upper left, with a rim of reflected light below right
  const shell = ctx.createRadialGradient(
    bx - r * 0.35,
    by - r * 0.4,
    r * 0.1,
    bx,
    by,
    r * 1.15,
  );
  shell.addColorStop(0, "#5a616f");
  shell.addColorStop(0.5, "#2c303a");
  shell.addColorStop(1, "#141720");
  ctx.fillStyle = shell;
  ctx.beginPath();
  ctx.arc(bx, by, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = "rgba(150, 160, 180, 0.35)";
  ctx.lineWidth = s * 0.012;
  ctx.beginPath();
  ctx.arc(bx, by, r * 0.97, Math.PI * 0.15, Math.PI * 0.75);
  ctx.stroke();

  // specular highlight
  ctx.fillStyle = "rgba(255, 255, 255, 0.9)";
  ctx.beginPath();
  ctx.ellipse(bx - r * 0.36, by - r * 0.38, r * 0.24, r * 0.16, -0.7, 0, Math.PI * 2);
  ctx.fill();
}
