// Cell *motion*: the tiles themselves moving — sinking as they open, dipping
// under a press, hopping in the win wave — where `CellAnimations` only ever
// recolours them.
//
// The two board meshes are each one merged buffer, and an opened cell is re-cut
// in place (see cellStyle.ts), so moving a tile by rewriting its vertices would
// mean rewriting hundreds of them per cell per frame for a flood. Instead every
// vertex carries the index of the cell it belongs to (`aCell`), and the vertex
// shader moves it by that cell's entry in a small float texture: four numbers
// per cell, rewritten here once a frame while anything is moving. A 480-cell
// board is 7.5 KB a frame; nothing else is touched. `motionShader.ts` is the
// GPU half.
//
// The four channels, per cell:
//
//   * `lift`  — along the cell's outward normal, in cell radii (summed).
//   * `scale` — the whole tile about its centre (multiplied).
//   * `glyph` — the number / flag / mine on it, on top of `scale` (multiplied).
//   * `twist` — a turn about the normal, in radians (summed).
//
// Identity is (0, 1, 1, 0), and a cell with nothing in flight is written back
// to it exactly once, so a settled board is the board the meshes built.
//
// What moves, and why each is worth its frame:
//
//   * **open**  — a freshly opened cell drops from where its button stood into
//     its recess with a small overshoot, and its number springs up after it. A
//     flood staggers this by distance (`RIPPLE_PER_CELL`, the colour ripple's
//     own pace), so the wave you see and the one you hear are the same wave.
//   * **press** — a closed cell under a held mouse button or pen sinks a little
//     before the release, so the input answers *now* rather than on release.
//     Not under a finger, which covers the tile (see `input/controls.ts`).
//   * **hover** — a closed cell under the mouse rises a hair.
//   * **bounce** — a flag going in (or coming out) pushes its tile down and
//     lets it spring back.
//   * **dip** — the neighbours a chord reaches press down in turn.
//   * **wiggle** — a chord that could not open anything shakes its head.
//   * **shock** — a detonation's front knocks the tiles up as it passes,
//     strongest near the mine.
//   * **reveal** — the mines a loss uncovers pop in one after another, by
//     distance from the one that went off, instead of all at once.
//   * **hop** — the win wave lifts each tile as it passes.
//   * **build** — a new board assembles from its centre out.
//
// Everything is gated on `enabled` exactly as `CellAnimations` is (reduced
// motion, and the test seam): off, nothing starts and the board is drawn at
// identity.

import { RIPPLE_PER_CELL } from "./animations";

/** Floats per cell in the motion texture. */
export const MOTION_CHANNELS = 4;

export type MotionKind =
  | "open"
  | "bounce"
  | "dip"
  | "wiggle"
  | "shock"
  | "reveal"
  | "hop"
  | "build";

export interface Track {
  kind: MotionKind;
  start: number; // ms, delay already folded in
  /** Per-kind strength: the open's starting height, the shock's amplitude. */
  amount: number;
}

/** One cell's contribution at one instant. */
export interface Pose {
  lift: number;
  scale: number;
  glyph: number;
  twist: number;
}

export const IDENTITY: Readonly<Pose> = { lift: 0, scale: 1, glyph: 1, twist: 0 };

/** How long each kind runs, from its (delayed) start. */
export const MOTION_MS: Record<MotionKind, number> = {
  open: 300,
  bounce: 320,
  dip: 220,
  wiggle: 380,
  shock: 380,
  reveal: 300,
  hop: 460,
  build: 420,
};

/** How far a pressed tile sinks and shrinks, and how fast it gets there and
 * back. Pressing in is quick so it reads as the answer to the touch; letting go
 * is slower so the release is seen. */
export const PRESS_LIFT = -0.14;
export const PRESS_SCALE = 0.95;
const PRESS_IN_MS = 45;
const PRESS_OUT_MS = 110;
/** How far a hovered tile rises. */
export const HOVER_LIFT = 0.06;
const HOVER_MS = 70;

/** The stagger of the loss's shockwave and its mine reveal, per cell width. The
 * shock is a blast and outruns the reveal ripple; the mines follow slower, so
 * they read as a count rather than a flash. */
export const SHOCK_PER_CELL = 16;
export const MINE_PER_CELL = 34;
/** A new board assembles in this long at most, however big it is. */
export const BUILD_SPREAD_MS = 360;
/** Cap on how long the mine reveal may take to reach the farthest mine. */
export const MINE_SPREAD_MS = 900;

// -- easing ------------------------------------------------------------------

const clamp01 = (x: number): number => (x < 0 ? 0 : x > 1 ? 1 : x);

/** 0 → 1 with a small overshoot past 1 before it settles. */
export function easeOutBack(p: number, c = 1.7): number {
  const u = clamp01(p) - 1;
  return 1 + (c + 1) * u * u * u + c * u * u;
}

// -- one track at one instant ------------------------------------------------

/** Where `track` puts a cell at `now`. Pure, so it is what the unit tests pin. A
 * track that has not started yet holds its *starting* pose — an opened cell
 * waiting its turn in a flood still stands where its button was, and a mine
 * waiting its turn in the loss reveal is still hidden — which is what makes a
 * stagger read as a wave rather than as a jump followed by a wave. */
export function trackPose(track: Track, now: number, out: Pose): void {
  const ms = MOTION_MS[track.kind];
  const p = (now - track.start) / ms;
  const t = clamp01(p);
  switch (track.kind) {
    case "open": {
      // Drop from the button's height to the floor, overshooting into it.
      out.lift += track.amount * (1 - easeOutBack(t, 2.2));
      // The number arrives once the tile has mostly landed.
      out.glyph *= p <= 0.25 ? 0 : easeOutBack((t - 0.25) / 0.75, 2);
      return;
    }
    case "bounce":
      // Pushed in, back up past rest, settled: a sine under a squared decay.
      out.lift += -0.22 * Math.sin(2.2 * Math.PI * t) * (1 - t) * (1 - t);
      out.scale *= 1 - 0.05 * Math.sin(Math.PI * t) * (1 - t);
      // A flag going in springs up out of the tile (one coming out has no
      // glyph left to scale, so this is moot for it).
      out.glyph *= p <= 0 ? 0 : easeOutBack(Math.min(1, t / 0.55), 2.4);
      return;
    case "dip":
      out.lift += -0.16 * Math.sin(Math.PI * t);
      out.scale *= 1 - 0.04 * Math.sin(Math.PI * t);
      return;
    case "wiggle":
      out.twist += 0.16 * Math.sin(t * 3 * 2 * Math.PI) * (1 - t);
      return;
    case "shock":
      out.lift += track.amount * Math.sin(Math.PI * t) * (1 - 0.3 * t);
      return;
    case "reveal":
      out.glyph *= p <= 0 ? 0 : easeOutBack(t, 2.4);
      return;
    case "hop":
      out.lift += 0.32 * Math.sin(Math.PI * t) * (1 - t * 0.4);
      return;
    case "build": {
      const s = p <= 0 ? 0 : easeOutBack(t, 1.4);
      out.scale *= s;
      return;
    }
  }
}

/** Frame-rate-independent approach of `value` toward `target` with time
 * constant `tau` ms — what press and hover ride on, since they follow a
 * pointer rather than a clock. */
export function approach(value: number, target: number, dt: number, tau: number): number {
  if (tau <= 0) return target;
  const k = Math.exp(-Math.max(0, dt) / tau);
  const next = target + (value - target) * k;
  return Math.abs(next - target) < 1e-3 ? target : next;
}

/** The stagger entries for a wave out of `origin`: one per cell, delayed by its
 * distance in cell widths times `perCell`, optionally squeezed so the farthest
 * cell starts no later than `cap` ms (a hard board is several times wider than
 * an easy one, and a celebration that takes three seconds to arrive is one the
 * player has already looked away from). */
export function waveDelays(
  cells: readonly { index: number; center: readonly number[] }[],
  origin: readonly number[] | null,
  unit: number,
  perCell: number,
  cap = Infinity,
): { index: number; delay: number; distance: number }[] {
  const out = cells.map(({ index, center }) => {
    let d = 0;
    if (origin) {
      let sum = 0;
      for (let k = 0; k < center.length; k++) {
        const e = (center[k] ?? 0) - (origin[k] ?? 0);
        sum += e * e;
      }
      d = Math.sqrt(sum) / (unit || 1);
    }
    return { index, delay: d * perCell, distance: d };
  });
  const far = out.reduce((m, e) => Math.max(m, e.delay), 0);
  if (far > cap) for (const e of out) e.delay *= cap / far;
  return out;
}

// -- the clock ---------------------------------------------------------------

export class CellMotion {
  enabled = true;
  /** `MOTION_CHANNELS` floats per cell — the texture's backing store. */
  readonly data: Float32Array;
  private readonly tracks = new Map<number, Track[]>();
  /** Press and hover follow the pointer, not a clock: a target per cell and
   * the value easing toward it. */
  private readonly press = new Map<number, { value: number; target: number }>();
  private readonly hover = new Map<number, { value: number; target: number }>();
  /** Cells written away from identity last frame, so the frame they settle on
   * writes them back exactly once. */
  private dirty = new Set<number>();
  private lastNow: number | null = null;
  private readonly pose: Pose = { ...IDENTITY };

  /** `data` may be handed in (a texture's padded backing store); it must hold
   * at least `count` cells. */
  constructor(
    readonly count: number,
    data?: Float32Array,
  ) {
    this.data = data ?? new Float32Array(Math.max(1, count) * MOTION_CHANNELS);
    for (let i = 0; i < count; i++) this.write(i, IDENTITY);
  }

  /** Start `kind` on each entry's cell after its delay. */
  start(
    kind: MotionKind,
    entries: readonly { index: number; delay?: number; amount?: number }[],
    now: number,
  ): void {
    if (!this.enabled) return;
    for (const e of entries) {
      if (e.index < 0 || e.index >= this.count) continue;
      const list = this.tracks.get(e.index) ?? [];
      // One track of a kind per cell: a second open of the same cell (a scroll
      // repaints every cell) restarts it rather than stacking two drops.
      const track: Track = { kind, start: now + (e.delay ?? 0), amount: e.amount ?? 0 };
      const at = list.findIndex((t) => t.kind === kind);
      if (at >= 0) list[at] = track;
      else list.push(track);
      this.tracks.set(e.index, list);
    }
  }

  /** Hold (`on`) or release a press on cell `index`; -1 releases every press. */
  setPress(index: number, on: boolean): void {
    this.setTarget(this.press, index, on ? 1 : 0);
  }

  setHover(index: number, on: boolean): void {
    this.setTarget(this.hover, index, on ? 1 : 0);
  }

  private setTarget(
    map: Map<number, { value: number; target: number }>,
    index: number,
    target: number,
  ): void {
    if (index < 0) {
      for (const s of map.values()) s.target = 0;
      return;
    }
    if (!this.enabled) {
      map.delete(index);
      return;
    }
    const s = map.get(index);
    if (s) s.target = target;
    else if (target) map.set(index, { value: 0, target });
  }

  /** Whether anything still needs frames. */
  pending(): boolean {
    return this.tracks.size > 0 || this.press.size > 0 || this.hover.size > 0 || this.dirty.size > 0;
  }

  /** Drop everything and stand the board at identity. */
  reset(): void {
    this.tracks.clear();
    this.press.clear();
    this.hover.clear();
    for (let i = 0; i < this.count; i++) this.write(i, IDENTITY);
    this.dirty.clear();
    this.lastNow = null;
  }

  /** Advance to `now` and rewrite `data` for every cell that moved. Returns
   * whether `data` changed (the caller re-uploads the texture on true). */
  step(now: number): boolean {
    const dt = this.lastNow == null ? 16 : now - this.lastNow;
    this.lastNow = now;
    if (!this.pending()) {
      this.lastNow = null;
      return false;
    }
    const touched = new Set<number>();
    const ease = (
      map: Map<number, { value: number; target: number }>,
      inMs: number,
      outMs: number,
    ) => {
      for (const [i, s] of map) {
        s.value = approach(s.value, s.target, dt, s.target > s.value ? inMs : outMs);
        touched.add(i);
        if (s.value === 0 && s.target === 0) map.delete(i);
      }
    };
    ease(this.press, PRESS_IN_MS, PRESS_OUT_MS);
    ease(this.hover, HOVER_MS, HOVER_MS);
    for (const [i, list] of this.tracks) {
      touched.add(i);
      const live = list.filter((t) => now - t.start < MOTION_MS[t.kind]);
      if (live.length) this.tracks.set(i, live);
      else this.tracks.delete(i);
    }
    // Last frame's cells that nothing touches now go back to identity, once.
    for (const i of this.dirty) if (!touched.has(i)) this.write(i, IDENTITY);
    const next = new Set<number>();
    for (const i of touched) {
      const pose = this.poseOf(i, now);
      this.write(i, pose);
      if (!isIdentity(pose)) next.add(i);
      else if (this.tracks.has(i) || this.press.has(i) || this.hover.has(i)) next.add(i);
    }
    this.dirty = next;
    return true;
  }

  /** The combined pose of cell `i` at `now`. */
  poseOf(i: number, now: number): Pose {
    const pose = this.pose;
    pose.lift = 0;
    pose.scale = 1;
    pose.glyph = 1;
    pose.twist = 0;
    for (const t of this.tracks.get(i) ?? []) trackPose(t, now, pose);
    const p = this.press.get(i)?.value ?? 0;
    if (p) {
      pose.lift += PRESS_LIFT * p;
      pose.scale *= 1 + (PRESS_SCALE - 1) * p;
    }
    const h = this.hover.get(i)?.value ?? 0;
    if (h) pose.lift += HOVER_LIFT * h;
    return pose;
  }

  private write(i: number, pose: Readonly<Pose>): void {
    const k = i * MOTION_CHANNELS;
    this.data[k] = pose.lift;
    this.data[k + 1] = pose.scale;
    this.data[k + 2] = pose.glyph;
    this.data[k + 3] = pose.twist;
  }
}

function isIdentity(p: Readonly<Pose>): boolean {
  return (
    Math.abs(p.lift) < 1e-4 &&
    Math.abs(p.scale - 1) < 1e-4 &&
    Math.abs(p.glyph - 1) < 1e-4 &&
    Math.abs(p.twist) < 1e-4
  );
}

/** The flood's stagger, re-exported so a mesh can pace its opens by it. */
export { RIPPLE_PER_CELL };
