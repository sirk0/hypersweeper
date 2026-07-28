// Board animations, shared by the flat PolygonBoard and the 3D SolidBoard.
//
// Five effects, all driven from a single clock the renderer ticks each frame
// while anything is pending (`step`); when nothing is pending the renderer
// leaves the loop idle (`pending`). The meshes own the buffers, so this class
// only tracks timing and returns, per frame, what changed:
//
//   * reveal ripple — each freshly opened cell flashes brighter than its
//     settled colour, staggered by its distance from the click so a wave
//     sweeps outward across a flood fill (the mesh recolours the reported
//     cells, adding `lightness`).
//   * flag drop — a flag placed by *holding* a cell lands from far above the
//     board: an oversized flag shrinks into its cell (the mesh draws one extra
//     quad, sized from `dropProgress`). It exists because the finger doing the
//     holding is covering that cell — the drop starts well outside the
//     fingertip, so the placement is seen while it happens. No other input
//     gets it: a right-click and a tap in flag mode both leave the cell in
//     plain sight, where an animation would be decoration rather than news.
//   * flag pop — a flag the *game* places springs in with a small overshoot
//     (the mesh rebuilds glyphs, scaling each by `popScale`). This is the win
//     wave's auto-flag cascade.
//   * lose shake — the whole board jitters and settles when a mine detonates
//     (the mesh offsets its group position by `shakeOffset`).
//   * win wave — every cell warms to gold and fades back when the board is
//     cleared, staggered from the winning click so one wave sweeps the whole
//     board (the mesh blends toward its win tint by `winMix`), with the mines
//     the win auto-flagged popping their flags in as the wave reaches them (a
//     `startPop` delayed to the same stagger).
//
// `enabled` gates every trigger, so turning it off (the `prefers-reduced-motion`
// affordance, or the `window.__ms.animations(false)` test seam) makes each
// board render its final state instantly and keeps the render loop idle.

/** Peak lightness boost of a reveal flash, in HSL L units (0..1). */
const PULSE_LIGHT = 0.35;
/** Reveal flash timing: rise to the peak, then fall back to the settled tone. */
const PULSE_RISE = 60; // ms
const PULSE_FALL = 260; // ms
/** Stagger added per cell-width of distance from the reveal origin. */
export const RIPPLE_PER_CELL = 28; // ms
/** Flag-pop duration. */
const POP_MS = 240;
/** Flag-drop duration, and the share of it the flag spends held at full size
 * before it starts moving. The hold is the whole point: an eased shrink alone
 * is nearest its settled size for most of its life, so the big flag — the only
 * part of this a covered cell can show — would be gone before the eye caught
 * it. Hold first, then travel. */
const DROP_MS = 420;
const DROP_HOLD = 0.35;
/** Lose-shake duration and oscillation frequency. */
const SHAKE_MS = 440;
const SHAKE_HZ = 11;
/** Win-wave timing: a slower sweep than the reveal ripple, and a longer, gentler
 * rise and fall — a celebration rather than a flick. */
export const WIN_PER_CELL = 26; // ms of stagger per cell-width from the win
const WIN_RISE = 120; // ms
const WIN_FALL = 420; // ms
/** How far a cell is pulled toward the win tint at the crest of the wave. The
 * mesh owns the colour (`WIN_TINT` in boardMesh.ts) and mixes by this; just
 * short of 1 so a hidden tile and an opened one still read a shade apart under
 * the wave. */
const WIN_PEAK = 0.9;

/** What a single tick changed; the mesh applies it to its own buffers. */
export interface AnimStep {
  /** Cell indices whose reveal-flash lightness may have changed this frame
   * (includes cells whose flash just finished, so the mesh writes them back to
   * the settled colour exactly once). */
  recolor: number[];
  /** Whether a flag pop or drop is in flight, so the mesh rebuilds its glyph
   * quads. Stays true for the frame one finishes on, so the mesh draws the
   * settled glyphs (and drops the drop's quad) exactly once. */
  glyphsDirty: boolean;
  /** Board position offset for the lose-shake (`[0, 0]` when not shaking). */
  offset: [number, number];
  /** Whether any animation still needs another frame after this one. */
  active: boolean;
}

interface Reveal {
  start: number; // when this cell's flash begins (origin time + stagger)
}

export class CellAnimations {
  enabled = true;
  private readonly reveals = new Map<number, Reveal>();
  private readonly wins = new Map<number, Reveal>();
  private readonly pops = new Map<number, number>(); // cell index -> start time
  // At most one drop is ever in flight: it answers a single deliberate
  // gesture, so a second flag simply takes over the animation.
  private drop: { index: number; start: number } | null = null;
  private shakeStart: number | null = null;
  private shakeAmp = 0;

  /** Begin reveal flashes for the given cells at their per-cell stagger. */
  startReveals(entries: { index: number; delay: number }[], now: number): void {
    if (!this.enabled) return;
    for (const e of entries) this.reveals.set(e.index, { start: now + e.delay });
  }

  /** Begin the win wave over the given cells at their per-cell stagger. */
  startWin(entries: { index: number; delay: number }[], now: number): void {
    if (!this.enabled) return;
    for (const e of entries) this.wins.set(e.index, { start: now + e.delay });
  }

  /** Begin a flag pop on a cell, optionally held back by `delay` ms so a
   * cascade of pops can ride the win wave. */
  startPop(index: number, now: number, delay = 0): void {
    if (!this.enabled) return;
    this.pops.set(index, now + delay);
  }

  /** Begin the landing of a flag the player just placed. */
  startDrop(index: number, now: number): void {
    if (!this.enabled) return;
    this.drop = { index, start: now };
  }

  /** Begin a lose-shake of the given amplitude (in board world units). */
  startShake(amplitude: number, now: number): void {
    if (!this.enabled) return;
    this.shakeStart = now;
    this.shakeAmp = amplitude;
  }

  /** Drop every in-flight animation (used when a board is reset). */
  reset(): void {
    this.reveals.clear();
    this.wins.clear();
    this.pops.clear();
    this.drop = null;
    this.shakeStart = null;
  }

  /** Whether the render loop needs to keep ticking this board. */
  pending(): boolean {
    return (
      this.reveals.size > 0 ||
      this.wins.size > 0 ||
      this.pops.size > 0 ||
      this.drop != null ||
      this.shakeStart != null
    );
  }

  /** Extra HSL lightness for a cell's reveal flash right now (0 when idle). */
  lightness(index: number, now: number): number {
    const r = this.reveals.get(index);
    if (!r) return 0;
    const t = now - r.start;
    if (t <= 0) return 0; // still waiting its turn in the ripple
    if (t < PULSE_RISE) return PULSE_LIGHT * (t / PULSE_RISE);
    const f = t - PULSE_RISE;
    if (f < PULSE_FALL) return PULSE_LIGHT * (1 - f / PULSE_FALL);
    return 0;
  }

  /** How far a cell is tinted toward the win colour right now (0 when the wave
   * is idle, has not reached it yet, or has passed). */
  winMix(index: number, now: number): number {
    const w = this.wins.get(index);
    if (!w) return 0;
    const t = now - w.start;
    if (t <= 0) return 0; // still waiting its turn in the wave
    if (t < WIN_RISE) return WIN_PEAK * (t / WIN_RISE);
    const f = t - WIN_RISE;
    if (f < WIN_FALL) return WIN_PEAK * (1 - f / WIN_FALL);
    return 0;
  }

  /** Glyph scale for a cell's flag pop right now (1 when idle) — an
   * ease-out-back springing from 0 through a small overshoot to 1. A pop that
   * has not started yet reads 0, so a delayed flag stays hidden until its turn
   * rather than appearing at full size and then springing. */
  popScale(index: number, now: number): number {
    const start = this.pops.get(index);
    if (start === undefined) return 1;
    const t = now - start;
    if (t <= 0) return 0;
    if (t >= POP_MS) return 1;
    const p = t / POP_MS;
    const c = 1.7;
    const u = p - 1;
    return 1 + (c + 1) * u * u * u + c * u * u; // easeOutBack, 0 → ~1.1 → 1
  }

  /** The cell a flag is currently dropping onto, or null. */
  dropIndex(): number | null {
    return this.drop?.index ?? null;
  }

  /** How far the flag drop has come, 0 (held at its largest, where it can be
   * read past a fingertip) to 1 (home), or null when nothing is dropping. It
   * holds, then eases in and out, so both ends of the trip are legible and the
   * middle is quick.
   *
   * This is *progress*, not a scale: how big the flag starts is a question
   * about the board (a 30x16 grid of small cells and a four-cell tetrahedron
   * want very different multiples of a cell), so the mesh owns that end of the
   * interpolation and this class owns only the clock. */
  dropProgress(now: number): number | null {
    if (!this.drop) return null;
    const p = (now - this.drop.start) / DROP_MS;
    if (p <= DROP_HOLD) return 0;
    if (p >= 1) return null;
    const q = (p - DROP_HOLD) / (1 - DROP_HOLD);
    const u = -2 * q + 2;
    return q < 0.5 ? 4 * q * q * q : 1 - (u * u * u) / 2; // easeInOutCubic
  }

  /** Advance every animation to `now`, pruning finished ones, and report what
   * the mesh must redraw this frame. */
  step(now: number): AnimStep {
    const recolor: number[] = [];
    for (const [index, r] of this.reveals) {
      recolor.push(index); // active or just-finished: redraw once either way
      if (now - r.start >= PULSE_RISE + PULSE_FALL) this.reveals.delete(index);
    }
    for (const [index, w] of this.wins) {
      recolor.push(index);
      if (now - w.start >= WIN_RISE + WIN_FALL) this.wins.delete(index);
    }

    const glyphsDirty = this.pops.size > 0 || this.drop != null;
    for (const [index, start] of this.pops) {
      if (now - start >= POP_MS) this.pops.delete(index);
    }
    if (this.drop && now - this.drop.start >= DROP_MS) this.drop = null;

    const offset = this.shakeOffset(now);

    return { recolor, glyphsDirty, offset, active: this.pending() };
  }

  private shakeOffset(now: number): [number, number] {
    if (this.shakeStart == null) return [0, 0];
    const t = now - this.shakeStart;
    if (t >= SHAKE_MS) {
      this.shakeStart = null;
      return [0, 0];
    }
    const decay = 1 - t / SHAKE_MS;
    const s = Math.sin((t / 1000) * 2 * Math.PI * SHAKE_HZ) * this.shakeAmp * decay;
    return [s, s * 0.3];
  }
}

/** How big a dropping flag starts, as a fraction of the board's shorter
 * dimension, and the bounds that keep it sane at either extreme of cell size:
 * at least this many times the settled glyph, or a four-cell tetrahedron —
 * where a third of the board is barely more than one glyph — would read as no
 * drop at all; at most this many, or a 30x16 grid of small cells would drop a
 * flag taller than the screen. */
const DROP_START_FRAC = 0.32;
const DROP_MIN_SCALE = 4;
const DROP_MAX_SCALE = 10;

/** How far above the cell's centre a dropping flag of this half-size sits, so
 * that its foot stays on the cell and it grows *upward* out of it. That is
 * both the readable direction — a finger and the hand behind it cover the
 * cell and everything below — and the safe one: a flag several cells tall
 * centred on its cell would hang off the bottom of the screen whenever it was
 * planted near the near edge of the board. Zero once the flag is home, so it
 * lands on the settled glyph. */
export function dropRise(settled: number, half: number): number {
  return half - settled;
}

/** The half-size of the dropping flag's quad right now: it starts big and
 * lands on `settled`, the size of the glyph already drawn in the cell, so the
 * hand-off at the end of the drop is invisible. `extent` is the board's
 * shorter dimension in the same units. */
export function dropSize(
  settled: number,
  extent: number,
  progress: number,
): number {
  const start = Math.min(
    Math.max(extent * DROP_START_FRAC, settled * DROP_MIN_SCALE),
    settled * DROP_MAX_SCALE,
  );
  return settled + (start - settled) * (1 - progress);
}

/** A flag most of the board wide would blot out the cells it is about to land
 * among, so it starts a little transparent and firms up as it shrinks — only a
 * little, because being read at its largest is its whole job. */
export function dropOpacity(progress: number): number {
  return 0.75 + 0.25 * progress;
}

/** Turn a list of cells + their board-space centres into stagger entries for a
 * spreading wave (the reveal ripple, or the slower win sweep): delay grows with
 * distance from `origin`, measured in cell widths (`unit`), so the wave spreads
 * at a steady visual speed on any board. `perCell` sets its pace. */
export function rippleEntries(
  cells: { index: number; center: readonly number[] }[],
  origin: readonly number[] | null,
  unit: number,
  perCell: number = RIPPLE_PER_CELL,
): { index: number; delay: number }[] {
  return cells.map(({ index, center }) => {
    const d = origin ? distance(center, origin) : 0;
    return { index, delay: (d / unit) * perCell };
  });
}

function distance(a: readonly number[], b: readonly number[]): number {
  let sum = 0;
  for (let i = 0; i < a.length; i++) {
    const d = (a[i] ?? 0) - (b[i] ?? 0);
    sum += d * d;
  }
  return Math.sqrt(sum);
}
