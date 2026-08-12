// The light a board's pins and bombs carry — the Realistic theme's markers,
// answering a move the way the reveal ripple and the sound cascade already do.
//
// A move already reaches the player three ways. The tiles it opened **flash**,
// staggered by their distance from the click (`CellAnimations`, at
// `RIPPLE_PER_CELL` ms per cell width). Each opened tile **sounds**, pitched and
// timbred by its own side count and panned by where it is on screen
// (`audio/sound.ts`). This is the third reading of that same event: a front of
// light sweeps out from the click and every standing marker brightens as it
// passes, at the same pace, so what is seen on the board, what is heard, and
// what the pins do are one wave.
//
// The rules, which is the whole of the design and all of what the unit tests
// pin:
//
//   * **pace** — the front travels one cell width per `RIPPLE_PER_CELL` ms, the
//     ripple's own stagger, which is also what `preset.cascade.step` is tuned
//     against. The light, the flash and the grain arrive together.
//   * **how much, from how many** — a one-cell open is a tick and a two-hundred
//     cell flood is a swell, but sub-linearly: the difference between 1 and 20
//     cells is worth more than the difference between 100 and 200.
//   * **what colour, from what shape** — the mean side count of the cells the
//     move opened, mapped the way `noteFor` maps it to a pitch (index
//     `sides - 3`, clamped): few-sided tiles glow pale, many-sided ones amber.
//     On a board of one tile shape that is a constant, so a hexagonal board
//     glows a different colour from a triangular one; on the uniform, Laves and
//     isogonal boards it moves from move to move.
//   * **it stops** — the swell holds only while the front is still inside the
//     flood, then falls away, leaving the resting ember. A board that has
//     finished opening is a board at rest.
//   * **a mine going off runs the same machinery hot** — a fast white flash on
//     the bomb that went off, a shockwave outrunning any reveal, and an ember
//     that stays lit and warm for the rest of the loss screen.
//
// Pure timing, like `CellAnimations`: no Three.js, no buffers, no clock of its
// own. The board samples it once a frame and writes the numbers into the marker
// shader's uniforms, which is why a glow costs no geometry at all — see
// `SolidBoard.updateGlow`.

import { RIPPLE_PER_CELL } from "./animations";

/** One opened cell as a source of light: the shape it is, and which ring of the
 * flood it was opened in — the same two facts `CellSound` carries, measured the
 * same two ways (`shapeMetrics` sides, a BFS from the click). */
export interface GlowCell {
  sides: number;
  ring: number;
}

/** What the marker shader needs this frame. The two distances are in **cell
 * widths** from the origin; the board scales them by its own `meanRadius`, so
 * the wave travels at a steady visual speed on any tiling. */
export interface GlowState {
  /** Strength of the travelling swell, 0..1. */
  amount: number;
  /** How far the swell's front has come, in cell widths. */
  front: number;
  /** The front's thickness, in cell widths. */
  width: number;
  /** 0 = few-sided and pale, 1 = many-sided and amber. */
  tone: number;
  /** The resting ember every marker carries, 0..1. */
  base: number;
  /** The detonation flash, 0..1 — the white on the bomb and its swell. */
  blast: number;
  /** How far the shockwave has come, in cell widths. */
  blastFront: number;
}

/** Rise to full brightness, and the fall back to the ember once the front has
 * left the flood behind. Quick up, unhurried down: a light that came on slowly
 * would lag the sound it belongs to, and one that snapped off would read as a
 * fault rather than as a wave passing. */
const RISE = 80; // ms
const FALL = 320; // ms
/** How bright the swell gets, against how many cells the move opened. The
 * smallest open — one cell, no flood — is worth `PEAK_MIN`; `PEAK_CAP` cells or
 * more is worth all of it, and the curve between is logarithmic, so the step
 * from 1 to 20 cells is most of the range and the step from 100 to 200 is
 * barely visible. A flood is a bigger event than a click, but not a hundred
 * times bigger.
 *
 * `PEAK_MAX` is well under 1 on purpose, and it is the number this was tuned
 * by eye against. The emissive term is *added* to a pin's own colour, so a
 * swell of 1 roughly doubles the head's brightness and washes it from red out
 * to pale peach — which reads as the model changing colour rather than as a
 * light passing over it. At this it plainly brightens and stays a red pin. */
const PEAK_MIN = 0.14;
const PEAK_MAX = 0.62;
const PEAK_CAP = 64;
/** The front's thickness, in cell widths. Wide enough that a pin is lit for
 * several frames as the wave crosses it — a thin front strobes — and narrow
 * enough that the board is not simply all lit at once. */
const WIDTH = 2.2;
/** The share of the swell that reaches every marker regardless of where it is.
 * Without it a pin on the far side of a sphere, or beyond the edge of a small
 * flood, would sit dark through a move that plainly happened; with too much of
 * it the wave stops being a wave. A quarter acknowledges the move everywhere
 * and leaves the front carrying the news. Baked into the marker shader, so it
 * lives here with the rest of the design. */
export const GLOW_GLOBAL_SHARE = 0.25;
/** The ember a marker carries at rest, before anything has happened and once
 * everything has finished, and the warmer one it settles to after a mine has
 * gone off. Small on purpose: this is what says the pins are objects with some
 * life in them, not a light left on. */
const IDLE = 0.06;
const EMBER = 0.11;
/** The blast: hard and fast up, a long way down, and a shockwave that outruns a
 * reveal by three to one — a detonation is not a flood fill. */
const BLAST_RISE = 40; // ms
const BLAST_FALL = 700; // ms
const BLAST_PER_CELL = 9; // ms per cell width

/** The two ends of the tone ramp. Both are warm: the pin's head is red and its
 * light has to look like light *on* it, so the pale end is a near-white gold
 * rather than a blue that would read as a different object. */
export const GLOW_COOL = "#ffe9c4";
export const GLOW_WARM = "#ff8a2b";
/** The detonation, which is not on that ramp at all — a mine going off is
 * white, and everything else about the board's palette is what it fades to. */
export const GLOW_BLAST = "#fff6e2";

/** The tone a mean side count reads as. `noteFor` indexes the preset's scale by
 * `sides - 3` over twelve entries — a triangle at one end, the Spectre's 13-gon
 * at the other — so the light is ramped over the same span the pitch is, and a
 * shape that sounds low glows warm. */
function toneFor(meanSides: number): number {
  return Math.max(0, Math.min(1, (meanSides - 3) / 9));
}

/** How bright a move of `count` opened cells gets. */
function peakFor(count: number): number {
  const t = Math.min(1, Math.log(1 + count) / Math.log(1 + PEAK_CAP));
  return PEAK_MIN + (PEAK_MAX - PEAK_MIN) * t;
}

interface Wave {
  start: number;
  peak: number;
  /** The farthest ring the flood reached, which is how long the swell holds:
   * the front is inside the opening until it has passed the last cell to open.
   * A ring is a graph hop and the front is measured in cell widths, which agree
   * closely enough — the two are the same measure taken two ways, exactly as
   * the sound's stagger and the ripple's are. */
  span: number;
  tone: number;
}

export class MarkerGlow {
  /** Gates the moving parts only. The resting ember is a look rather than a
   * motion, so it survives `prefers-reduced-motion` — what that setting turns
   * off is the wave, the shockwave and the swell. */
  enabled = true;
  private wave: Wave | null = null;
  private blastStart: number | null = null;
  /** Set once a mine has gone off: the ember stays lit and goes warm. Not gated
   * by `enabled`, because it is not motion either. */
  private hot = false;
  /** The colour the ember holds between waves — the last thing the board said,
   * so a hexagonal board's pins keep glowing like a hexagonal board's. */
  private tone = toneFor(5);

  /** Light the markers for the cells a move just opened. */
  reveal(cells: readonly GlowCell[], now: number): void {
    if (!this.enabled || cells.length === 0) return;
    let span = 0;
    let sides = 0;
    for (const cell of cells) {
      if (cell.ring > span) span = cell.ring;
      sides += cell.sides;
    }
    this.tone = toneFor(sides / cells.length);
    this.wave = { start: now, peak: peakFor(cells.length), span, tone: this.tone };
  }

  /** A mine went off. Any reveal in flight is dropped — the board has stopped
   * being opened and started being lost, and the two waves would only muddle
   * each other, quite apart from sharing an origin uniform. */
  detonate(now: number): void {
    this.hot = true;
    this.tone = 1;
    this.wave = null;
    if (!this.enabled) return;
    this.blastStart = now;
  }

  /** Drop everything, ember included (a board being rebuilt from scratch). */
  reset(): void {
    this.wave = null;
    this.blastStart = null;
    this.hot = false;
    this.tone = toneFor(5);
  }

  /** Whether the render loop needs another frame after the last `sample`. */
  pending(): boolean {
    return this.enabled && (this.wave !== null || this.blastStart !== null);
  }

  /** The glow right now, pruning whatever has finished. Called once a frame,
   * and — like `CellAnimations.step` — it reports the settled state on the
   * frame it finishes on, so the last write always reaches the screen. */
  sample(now: number): GlowState {
    let amount = 0;
    let front = 0;
    let tone = this.tone;
    if (this.wave && this.enabled) {
      const t = now - this.wave.start;
      front = Math.max(0, t / RIPPLE_PER_CELL);
      amount = this.wave.peak * swell(t, this.wave.span);
      tone = this.wave.tone;
      if (t >= life(this.wave.span)) this.wave = null;
    }

    let blast = 0;
    let blastFront = 0;
    if (this.blastStart !== null && this.enabled) {
      const t = now - this.blastStart;
      blastFront = Math.max(0, t / BLAST_PER_CELL);
      blast = flash(t);
      if (t >= BLAST_RISE + BLAST_FALL) this.blastStart = null;
    }

    return {
      amount,
      front,
      width: WIDTH,
      tone,
      base: this.hot ? EMBER : IDLE,
      blast,
      blastFront,
    };
  }
}

/** How long a wave over a flood `span` rings deep lasts. */
function life(span: number): number {
  return RISE + span * RIPPLE_PER_CELL + FALL;
}

/** The swell's envelope: up, held while the front is still inside the flood,
 * then down. The hold is what makes a wide flood glow for as long as it is
 * opening and a single click a tick. */
function swell(t: number, span: number): number {
  if (t <= 0) return 0;
  if (t < RISE) return t / RISE;
  const travel = span * RIPPLE_PER_CELL;
  if (t < RISE + travel) return 1;
  const f = t - RISE - travel;
  return f < FALL ? 1 - f / FALL : 0;
}

/** The detonation's envelope. */
function flash(t: number): number {
  if (t <= 0) return 0;
  if (t < BLAST_RISE) return t / BLAST_RISE;
  const f = t - BLAST_RISE;
  return f < BLAST_FALL ? 1 - f / BLAST_FALL : 0;
}
