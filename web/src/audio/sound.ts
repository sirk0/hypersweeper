import {
  DEFAULT_SOUND,
  resolveSound,
  SOUND_OFF,
  soundPreset,
  type SoundPreset,
} from "./presets";

// The game's voice. Two halves, deliberately kept apart:
//
//   - `voicesFor(event, preset)` is **pure**: a game event in, a list of grains
//     out (when, what pitch, how wide, how loud). Every rule this feature has —
//     shape to pitch, a flood fill's cascade, the two Klein directions being
//     mirror images — lives there and is unit-tested without an audio context.
//   - `playSound(event)` renders those grains into Web Audio nodes on the
//     shared context. It knows nothing about the game.
//
// This is the single seam for sound, as `haptics.ts` is for touch: the call
// sites (session.ts, and the settings preview) name events, never oscillators.
//
// Everything global is reached defensively. The module is imported by the node
// unit tests, where there is no `window`, no `document` and no `AudioContext`;
// it is imported on iOS, where an `AudioContext` exists but stays suspended
// until a gesture resumes it; and it is imported on the settings page, where
// the player may have chosen `off` and no graph should ever be built.

export type { SoundPreset };

/** A cell, as a source of sound: the shape it is (side count), where it is
 * across the stereo field (-1 hard left .. +1 hard right) and which ring of a
 * flood fill it was opened in (0 = the cell clicked). */
export interface CellSound {
  sides: number;
  pan: number;
  ring: number;
}

export type SoundEvent =
  /** Cells opened by one move. One cell is a single note; several are the
   * cascade — the recursive opening running outward from the click. */
  | { kind: "open"; cells: readonly CellSound[]; chord?: boolean }
  /** A flag placed (`on`) or cleared. */
  | { kind: "flag"; on: boolean; sides: number; pan: number }
  /** A mine went off, at `pan`. */
  | { kind: "lose"; pan: number }
  /** The board was cleared, from a winning click at `pan`. */
  | { kind: "win"; pan: number }
  /** One step of the Klein bottle's ring scroll. */
  | { kind: "scroll"; direction: number }
  /** The figure the settings picker plays when a preset is chosen. */
  | { kind: "preview" };

/** One grain of sound: a single oscillator (and/or noise burst) with its own
 * envelope and stereo position. Times are seconds from the moment the event is
 * played. `endFreq`/`endPan` make the grain glide; without them it holds. */
export interface Voice {
  delay: number;
  freq: number;
  endFreq?: number;
  pan: number;
  endPan?: number;
  duration: number;
  attack: number;
  gain: number;
  /** Harmonics in the tone — the cell's side count, capped by the preset. */
  partials: number;
  /** Noise mixed in, 0 (a pure tone) to 1 (a pure hiss). */
  noise: number;
  /** Low-pass cutoff over the whole grain, when it wants one. */
  cutoff?: number;
}

/** Longest a flood's cascade may run. Past this the wave has said what it has
 * to say, and the cells beyond it were thinned out anyway. */
const MAX_CASCADE_S = 1.1;
/** Most grains that may be sounding at once, across all events. A cascade and
 * a loss overlapping must not turn into a wall — voices past this are dropped,
 * newest first, which keeps the ones already ringing intact. */
const MAX_ACTIVE_VOICES = 24;

function clampPan(pan: number): number {
  return pan < -1 ? -1 : pan > 1 ? 1 : pan;
}

function semitones(hz: number, steps: number): number {
  return hz * 2 ** (steps / 12);
}

/** The pitch of a tile with `sides` sides: a step down the preset's scale per
 * side, clamped at both ends (a triangle at the root; anything past the
 * scale's length — the Spectre's 13-gon — at its bottom). */
export function noteFor(preset: SoundPreset, sides: number): number {
  const i = Math.max(0, Math.min(preset.scale.length - 1, Math.round(sides) - 3));
  return semitones(preset.rootHz, preset.scale[i]!);
}

/** How many harmonics a tile's voice is built from: its own side count, capped.
 * A triangle is three partials and a hexagon six, so the shape is in the
 * timbre and not only in the pitch. */
export function partialsFor(preset: SoundPreset, sides: number): number {
  return Math.max(1, Math.min(preset.timbre.partialCap, Math.round(sides)));
}

/** Thin a flood's cells down to at most `max` grains, keeping the spread: the
 * list is sampled at an even stride across the whole ring range, so the first
 * ring and the last are always heard and the wave keeps its shape. Sorting by
 * ring first is what makes the stride a walk outward from the click. */
function thin(cells: readonly CellSound[], max: number): CellSound[] {
  const sorted = [...cells].sort((a, b) => a.ring - b.ring);
  if (sorted.length <= max || max < 1) return sorted;
  const out: CellSound[] = [];
  for (let i = 0; i < max; i++) {
    out.push(sorted[Math.round((i * (sorted.length - 1)) / (max - 1))]!);
  }
  return out;
}

function openVoice(preset: SoundPreset, cell: CellSound, ring: number): Voice {
  const rise = Math.min(12, ring * preset.cascade.rise);
  return {
    delay: Math.min(MAX_CASCADE_S, (ring * preset.cascade.step) / 1000),
    freq: semitones(noteFor(preset, cell.sides), rise),
    pan: clampPan(cell.pan),
    duration: preset.open.duration,
    attack: preset.open.attack,
    gain: preset.open.gain * Math.max(0.35, 1 - ring * preset.cascade.falloff),
    partials: partialsFor(preset, cell.sides),
    noise: preset.noise,
  };
}

/**
 * The grains one game event sounds as. Pure — no audio context, no clock, no
 * globals — so every rule below is asserted in `tests/unit/sound.test.ts`.
 *
 * The rules:
 *   - **shape**: pitch and partial count both come from the cell's side count,
 *     so a triangle, a square, a pentagon and a hexagon are four voices.
 *   - **stereo**: a grain is panned where its cell is on screen, so a board
 *     opened on the left is heard on the left.
 *   - **a click vs. a flood**: one opened cell is one note; a recursive
 *     opening is a cascade of grains, one per ring, staggered outward from the
 *     click, rising in pitch and falling in level as it spreads — and each
 *     grain panned by its own cell, so the wave sweeps the stereo field.
 *   - **the two scroll directions are opposites**: forward glides up while it
 *     sweeps left to right; back is that figure reflected in both axes.
 */
export function voicesFor(event: SoundEvent, preset: SoundPreset): Voice[] {
  switch (event.kind) {
    case "open": {
      if (event.cells.length === 0) return [];
      const voices: Voice[] = [];
      // A chord is the one move that opens cells from an already-open one;
      // give it a low grain at the chorded cell so it does not sound like an
      // ordinary click that happened to cascade.
      const origin =
        event.cells.find((c) => c.ring === 0) ?? event.cells[0]!;
      if (event.chord) {
        voices.push({
          ...openVoice(preset, origin, 0),
          freq: noteFor(preset, origin.sides) / 2,
          gain: preset.open.gain * preset.chordAccent,
        });
      }
      if (event.cells.length === 1) {
        voices.push(openVoice(preset, event.cells[0]!, 0));
        return voices;
      }
      for (const cell of thin(event.cells, preset.cascade.maxVoices)) {
        voices.push(openVoice(preset, cell, cell.ring));
      }
      return voices;
    }

    case "flag": {
      // The same figure either way, glided up as a flag goes down and down as
      // it comes off — so the two are heard as one action and its undo.
      const base = noteFor(preset, event.sides);
      const step = event.on ? preset.flag.interval : -preset.flag.interval;
      return [
        {
          delay: 0,
          freq: base,
          endFreq: semitones(base, step),
          pan: clampPan(event.pan),
          duration: preset.flag.duration,
          attack: preset.flag.attack,
          gain: preset.flag.gain * (event.on ? 1 : 0.8),
          partials: partialsFor(preset, event.sides),
          noise: preset.noise * 0.5,
        },
      ];
    }

    case "lose": {
      const pan = clampPan(event.pan);
      const { blast, drop } = preset.lose;
      return [
        {
          delay: 0,
          freq: drop.fromHz * 2,
          pan,
          duration: blast.duration,
          attack: blast.attack,
          gain: blast.gain,
          partials: 1,
          noise: 1,
          cutoff: blast.cutoff,
        },
        {
          delay: 0.02,
          freq: drop.fromHz,
          endFreq: drop.toHz,
          pan,
          duration: drop.duration,
          attack: drop.attack,
          gain: drop.gain,
          partials: 3,
          noise: 0.1,
        },
      ];
    }

    case "win": {
      const { notes, step, interval } = preset.win;
      const base = preset.rootHz / 2;
      const last = Math.max(1, notes - 1);
      return Array.from({ length: notes }, (_, i) => ({
        delay: (i * step) / 1000,
        freq: semitones(base, i * interval),
        // The flourish sweeps the whole field, leaning toward the winning
        // click — the board is cleared, so the celebration is not local to
        // one cell the way an opening is.
        pan: clampPan(-0.6 + (1.2 * i) / last + event.pan * 0.3),
        duration: preset.win.duration,
        attack: preset.win.attack,
        gain: preset.win.gain,
        partials: Math.min(preset.timbre.partialCap, 4),
        noise: 0,
      }));
    }

    case "scroll": {
      // Forward and back are the same glide reflected in both axes: pitch
      // rises where the other falls, and the sweep runs left-to-right where
      // the other runs right-to-left. Reversing one gives the other exactly,
      // which is what makes the pair feel like a thing and its undo.
      const dir = event.direction > 0 ? 1 : -1;
      const { fromHz, interval, pan } = preset.scroll;
      const high = semitones(fromHz, interval);
      return [
        {
          delay: 0,
          freq: dir > 0 ? fromHz : high,
          endFreq: dir > 0 ? high : fromHz,
          pan: clampPan(-dir * pan),
          endPan: clampPan(dir * pan),
          duration: preset.scroll.duration,
          attack: preset.scroll.attack,
          gain: preset.scroll.gain,
          partials: Math.min(preset.timbre.partialCap, 5),
          noise: preset.scroll.noise,
        },
      ];
    }

    case "preview": {
      // Enough of the preset to recognise it: two tiles of different shapes
      // opening across the field, then a flag going down between them.
      return [
        openVoice(preset, { sides: 3, pan: -0.4, ring: 0 }, 0),
        { ...openVoice(preset, { sides: 6, pan: 0.4, ring: 0 }, 0), delay: 0.13 },
        ...voicesFor({ kind: "flag", on: true, sides: 4, pan: 0 }, preset).map((v) => ({
          ...v,
          delay: 0.28,
        })),
      ];
    }
  }
}

// -- the player ---------------------------------------------------------------

let choice: string = DEFAULT_SOUND;
let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let noiseBuffer: AudioBuffer | null = null;
let activeVoices = 0;
/** Periodic waves are per (partial count, timbre) and immutable, so they are
 * built once and reused — a cascade of fourteen grains costs one wave, not
 * fourteen. */
const waveCache = new Map<string, PeriodicWave>();

/** Choose the preset (a key in SOUND_PRESETS, or `off`). Validated here, so a
 * stored record from another build cannot reach the engine. */
export function setSoundPreset(key: string | null | undefined): void {
  choice = resolveSound(key);
  if (!master || !ctx) return;
  // Choosing Off silences what is *already* ringing (a cascade can be a second
  // long), and choosing a preset again lifts the mute — over a few
  // milliseconds either way, since stepping a gain discontinuously clicks.
  const now = ctx.currentTime;
  master.gain.cancelScheduledValues(now);
  master.gain.setValueAtTime(master.gain.value, now);
  master.gain.linearRampToValueAtTime(choice === SOUND_OFF ? 0 : 1, now + 0.03);
}

/** The active choice — what the settings page ticks. */
export function soundChoice(): string {
  return choice;
}

/** Whether anything would be heard. Call sites check this before doing the
 * work of measuring shapes and projecting pans for a silenced game. */
export function soundEnabled(): boolean {
  return soundPreset(choice) !== null;
}

function audioContext(): AudioContext | null {
  if (ctx) return ctx;
  if (typeof window === "undefined") return null;
  const Ctor =
    window.AudioContext ??
    (window as unknown as { webkitAudioContext?: typeof AudioContext })
      .webkitAudioContext;
  if (!Ctor) return null;
  try {
    ctx = new Ctor();
  } catch {
    return null; // a policy-disabled or exhausted audio stack
  }
  master = ctx.createGain();
  master.gain.value = 1;
  master.connect(ctx.destination);
  return ctx;
}

/**
 * Let audio start on the player's first gesture. Browsers refuse to run an
 * `AudioContext` that was not created or resumed inside a user gesture — on
 * iOS a context built at load time stays suspended forever, and everything
 * scheduled into it is silently lost. So the context is built on the first
 * pointer or key event and resumed there, once, whatever the player does
 * first. Nothing is heard before that, by construction.
 */
export function unlockAudio(): void {
  if (typeof window === "undefined" || !window.addEventListener) return;
  const unlock = (): void => {
    const c = audioContext();
    if (c?.state === "suspended") void c.resume().catch(() => {});
    if (c) {
      for (const type of ["pointerdown", "keydown", "touchend"] as const) {
        window.removeEventListener(type, unlock);
      }
    }
  };
  for (const type of ["pointerdown", "keydown", "touchend"] as const) {
    window.addEventListener(type, unlock, { passive: true });
  }
}

function noise(c: AudioContext): AudioBuffer {
  if (noiseBuffer) return noiseBuffer;
  const buffer = c.createBuffer(1, Math.floor(c.sampleRate), c.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  noiseBuffer = buffer;
  return buffer;
}

/** The periodic wave for `partials` harmonics under this preset's timbre. One
 * sine is left as the oscillator's own `sine` type — cheaper, and identical. */
function wave(c: AudioContext, preset: SoundPreset, partials: number): PeriodicWave | null {
  if (partials <= 1) return null;
  const { decay, oddOnly } = preset.timbre;
  const key = `${partials}|${decay}|${oddOnly}`;
  const cached = waveCache.get(key);
  if (cached) return cached;
  const real = new Float32Array(partials + 1);
  const imag = new Float32Array(partials + 1);
  for (let k = 1; k <= partials; k++) {
    if (oddOnly && k % 2 === 0) continue;
    imag[k] = 1 / k ** decay;
  }
  const built = c.createPeriodicWave(real, imag);
  waveCache.set(key, built);
  return built;
}

/** Render one grain onto the graph, starting at `t0 + voice.delay`. */
function playVoice(c: AudioContext, out: GainNode, v: Voice, t0: number, preset: SoundPreset): void {
  const start = t0 + v.delay;
  const end = start + v.duration;
  const env = c.createGain();
  // Exponential ramps everywhere: a linear attack on a short grain clicks, and
  // an exponential one cannot reach 0, hence the tiny floor at both ends.
  const floor = 0.0001;
  env.gain.setValueAtTime(floor, start);
  env.gain.exponentialRampToValueAtTime(Math.max(v.gain, floor * 2), start + v.attack);
  env.gain.exponentialRampToValueAtTime(floor, end);

  let tail: AudioNode = env;
  if (v.cutoff != null) {
    const filter = c.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.setValueAtTime(v.cutoff, start);
    filter.frequency.exponentialRampToValueAtTime(Math.max(60, v.cutoff * 0.2), end);
    env.connect(filter);
    tail = filter;
  }
  // StereoPannerNode is the whole point of the feature, but it is also the one
  // node here an old WebKit may not have; without it the grain still sounds,
  // centred.
  if (typeof c.createStereoPanner === "function") {
    const panner = c.createStereoPanner();
    panner.pan.setValueAtTime(clampPan(v.pan), start);
    if (v.endPan != null) panner.pan.linearRampToValueAtTime(clampPan(v.endPan), end);
    tail.connect(panner);
    panner.connect(out);
  } else {
    tail.connect(out);
  }

  const toneGain = 1 - v.noise;
  if (toneGain > 0.001) {
    const osc = c.createOscillator();
    const periodic = wave(c, preset, v.partials);
    if (periodic) osc.setPeriodicWave(periodic);
    else osc.type = "sine";
    osc.frequency.setValueAtTime(v.freq, start);
    if (v.endFreq != null) {
      osc.frequency.exponentialRampToValueAtTime(Math.max(20, v.endFreq), end);
    }
    const g = c.createGain();
    g.gain.value = toneGain;
    osc.connect(g);
    g.connect(env);
    activeVoices++;
    osc.onended = () => {
      activeVoices = Math.max(0, activeVoices - 1);
    };
    osc.start(start);
    osc.stop(end + 0.02);
  }
  if (v.noise > 0.001) {
    const src = c.createBufferSource();
    src.buffer = noise(c);
    src.loop = true;
    const g = c.createGain();
    g.gain.value = v.noise;
    src.connect(g);
    g.connect(env);
    src.start(start);
    src.stop(end + 0.02);
  }
}

/**
 * Play a game event, if sound is on and the browser has let us start. Silent
 * and side-effect-free otherwise: off, no `AudioContext`, a hidden tab (a
 * backgrounded game should not chirp), or a context the player has not yet
 * unlocked with a gesture.
 */
export function playSound(event: SoundEvent): void {
  const preset = soundPreset(choice);
  if (!preset) return;
  if (typeof document !== "undefined" && document.hidden) return;
  const c = audioContext();
  if (!c || !master) return;
  // A context can be suspended by the browser at any time (a tab going to the
  // background and back); ask once and carry on — grains scheduled while it is
  // still suspended simply start when it resumes.
  if (c.state === "suspended") void c.resume().catch(() => {});
  const t0 = c.currentTime + 0.008;
  for (const voice of voicesFor(event, preset)) {
    if (activeVoices >= MAX_ACTIVE_VOICES) break;
    playVoice(c, master, voice, t0, preset);
  }
}

/** Play the settings picker's sample of the current preset. */
export function previewSound(): void {
  playSound({ kind: "preview" });
}
