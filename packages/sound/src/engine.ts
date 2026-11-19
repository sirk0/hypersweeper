import {
  clampVolume,
  DEFAULT_SOUND,
  DEFAULT_VOLUME,
  resolveSound,
  SOUND_OFF,
  soundPreset,
  type SoundPreset,
} from "./presets";

// The synthesiser every game shares. Two halves, deliberately kept apart:
//
//   - a game's own `voicesFor(event, preset)` is **pure**: a game event in, a
//     list of grains out (when, what pitch, how wide, how loud), built from
//     the figures in `figures.ts` and the pitch helpers here. Every rule a
//     game's sound has lives there and is unit-tested without an audio
//     context.
//   - `playVoices(build)` renders those grains into Web Audio nodes on the
//     shared context. It knows nothing about any game.
//
// Everything global is reached defensively. The module is imported by the node
// unit tests, where there is no `window`, no `document` and no `AudioContext`;
// it is imported on iOS, where an `AudioContext` exists but stays suspended
// until a gesture resumes it; and it is imported on a settings page, where the
// player may have chosen `off` and no graph should ever be built.

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
  /** Harmonics in the tone — the tile's side count, capped by the preset. */
  partials: number;
  /** Noise mixed in, 0 (a pure tone) to 1 (a pure hiss). */
  noise: number;
  /** Seconds over which that noise falls away, when it is a *strike* rather
   * than a texture: the mallet hitting the tile, gone long before the tone it
   * started is. Absent, the noise holds for the whole grain, which is what
   * Hypersweeper's mine blast and Klein scroll rush want. */
  noiseDecay?: number;
  /** Low-pass cutoff over the whole grain, when it wants one. Absent, the
   * grain gets the tracking filter instead (`playVoice`), which opens on its
   * own partials and closes to `timbre.close`. */
  cutoff?: number;
}

/** Most grains that may be sounding at once, across all events. A cascade and
 * a loss overlapping must not turn into a wall — voices past this are dropped,
 * newest first, which keeps the ones already ringing intact. */
const MAX_ACTIVE_VOICES = 24;

export function clampPan(pan: number): number {
  return pan < -1 ? -1 : pan > 1 ? 1 : pan;
}

export function semitones(hz: number, steps: number): number {
  return hz * 2 ** (steps / 12);
}

/** Semitones below the root at grid degree `degree`. The grid is one octave
 * of the preset's collection and repeats in both directions, so a degree past
 * its end drops an octave and a *negative* degree rises above the root — which
 * is what lets the win flourish walk up off the top of it. */
export function gridNote(preset: SoundPreset, degree: number): number {
  const n = preset.grid.length;
  const i = ((degree % n) + n) % n;
  return preset.grid[i]! - 12 * Math.floor(degree / n);
}

/** Which degree of the grid a tile with `sides` sides takes, clamped at both
 * ends (a triangle at the root; anything past the spelling's length — the
 * Spectre's 13-gon — at its bottom). */
export function degreeFor(preset: SoundPreset, sides: number): number {
  const i = Math.max(0, Math.min(preset.degrees.length - 1, Math.round(sides) - 3));
  return preset.degrees[i]!;
}

/** The pitch of a tile with `sides` sides: its degree of the preset's grid,
 * below the root. The spelling is chosen so that the shape sets which share a
 * board come out as chords rather than as whatever one-degree-per-side
 * happened to give (see `degrees` in presets.ts). */
export function noteFor(preset: SoundPreset, sides: number): number {
  return semitones(preset.rootHz, gridNote(preset, degreeFor(preset, sides)));
}

/** How many harmonics a tile's voice is built from: its own side count, capped.
 * A triangle is three partials and a hexagon six, so the shape is in the
 * timbre and not only in the pitch. */
export function partialsFor(preset: SoundPreset, sides: number): number {
  return Math.max(1, Math.min(preset.timbre.partialCap, Math.round(sides)));
}

// -- the player ---------------------------------------------------------------

let choice: string = DEFAULT_SOUND;
/** The ceiling every voice is scaled by (a game's volume setting), 0..1. The
 * presets' own gains are the *balance* between a game's sounds — a flag
 * against a cascade — and this is how loud that whole balance plays, so it
 * belongs on the master gain rather than in `voicesFor`, which stays pure and
 * preset-only. */
let volume = DEFAULT_VOLUME;
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
  rampMaster();
}

/** Set the ceiling every sound plays at, 0..1. Clamped here, so a stored
 * record from another build cannot push the master gain past 1 or negative.
 * Applied to the graph already running, like the preset: a slider is audible
 * while it is dragged. */
export function setSoundVolume(level: number): void {
  volume = clampVolume(level);
  rampMaster();
}

/** The volume in force — what a settings slider shows. */
export function soundVolume(): number {
  return volume;
}

/** Move the master gain to what the current choice and volume ask for. Off is
 * a mute rather than a stop, so it silences what is *already* ringing (a
 * cascade can be a second long) — and every move is a short ramp, since
 * stepping a gain discontinuously clicks. */
function rampMaster(): void {
  if (!master || !ctx) return;
  const now = ctx.currentTime;
  master.gain.cancelScheduledValues(now);
  master.gain.setValueAtTime(master.gain.value, now);
  master.gain.linearRampToValueAtTime(masterLevel(), now + 0.03);
}

function masterLevel(): number {
  return choice === SOUND_OFF ? 0 : volume;
}

/** The active choice — what a settings page ticks. */
export function soundChoice(): string {
  return choice;
}

/** The preset in force, or `null` when sound is off. */
export function activePreset(): SoundPreset | null {
  return soundPreset(choice);
}

/** Whether anything would be heard. Call sites check this before doing the
 * work of measuring shapes and projecting pans for a silenced game. */
export function soundEnabled(): boolean {
  return activePreset() !== null;
}

function audioContext(): AudioContext | null {
  if (ctx) return ctx;
  if (typeof window === "undefined") return null;
  const Ctor =
    window.AudioContext ??
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return null;
  try {
    ctx = new Ctor();
  } catch {
    return null; // a policy-disabled or exhausted audio stack
  }
  master = ctx.createGain();
  // The graph is built on the first gesture, long after the stored preferences
  // were applied, so it opens at whatever they asked for.
  master.gain.value = masterLevel();
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
function playVoice(
  c: AudioContext,
  out: GainNode,
  v: Voice,
  t0: number,
  preset: SoundPreset,
): void {
  const start = t0 + v.delay;
  const end = start + v.duration;
  const env = c.createGain();
  // Exponential ramps everywhere: a linear attack on a short grain clicks, and
  // an exponential one cannot reach 0, hence the tiny floor at both ends.
  const floor = 0.0001;
  env.gain.setValueAtTime(floor, start);
  env.gain.exponentialRampToValueAtTime(Math.max(v.gain, floor * 2), start + v.attack);
  env.gain.exponentialRampToValueAtTime(floor, end);

  // Brightness falls faster than loudness. A struck bar, bead or block sheds
  // its high partials in the first few tens of milliseconds and rings on at
  // the fundamental; a periodic wave under one gain envelope holds its eighth
  // harmonic exactly as long as its first, which is the sound of an
  // oscillator rather than of a thing being hit. So every grain runs through
  // a low-pass that opens wide enough to pass all the partials its side count
  // asked for — the attack is where a timbre is read, so the shape still
  // carries — and closes to `timbre.close` times its own fundamental.
  const nyquist = c.sampleRate * 0.45;
  const open = v.cutoff ?? Math.min(nyquist, v.freq * (v.partials + 1.5));
  const shut = v.cutoff != null ? v.cutoff * 0.2 : v.freq * preset.timbre.close;
  const filter = c.createBiquadFilter();
  filter.type = "lowpass";
  filter.frequency.setValueAtTime(Math.max(60, open), start);
  filter.frequency.exponentialRampToValueAtTime(Math.max(60, Math.min(open, shut)), end);
  env.connect(filter);
  const tail: AudioNode = filter;
  // StereoPannerNode is the one node here an old WebKit may not have; without
  // it the grain still sounds, centred.
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
    // A strike, not a hiss: on a tile's voice the noise is the mallet making
    // contact, so it decays in its own few tens of milliseconds and leaves the
    // tone ringing alone. Held flat under the whole grain — which is what the
    // mine's blast and the scroll's rush still want — it reads as circuit hum,
    // and it is most of what made the soft presets sound synthetic.
    const noiseEnd = v.noiseDecay != null ? Math.min(end, start + v.attack + v.noiseDecay) : end;
    if (v.noiseDecay != null) {
      g.gain.setValueAtTime(v.noise, start);
      g.gain.exponentialRampToValueAtTime(0.0001, noiseEnd);
    } else {
      g.gain.value = v.noise;
    }
    src.connect(g);
    g.connect(env);
    src.start(start);
    src.stop(noiseEnd + 0.02);
  }
}

/**
 * Play the grains `build` makes from the preset in force, if sound is on and
 * the browser has let us start. Silent and side-effect-free otherwise: off
 * (`build` is not even called), no `AudioContext`, a hidden tab (a
 * backgrounded game should not chirp), or a context the player has not yet
 * unlocked with a gesture.
 */
export function playVoices(build: (preset: SoundPreset) => readonly Voice[]): void {
  const preset = activePreset();
  if (!preset) return;
  if (typeof document !== "undefined" && document.hidden) return;
  const c = audioContext();
  if (!c || !master) return;
  // A context can be suspended by the browser at any time (a tab going to the
  // background and back); ask once and carry on — grains scheduled while it is
  // still suspended simply start when it resumes.
  if (c.state === "suspended") void c.resume().catch(() => {});
  const t0 = c.currentTime + 0.008;
  for (const voice of build(preset)) {
    if (activeVoices >= MAX_ACTIVE_VOICES) break;
    playVoice(c, master, voice, t0, preset);
  }
}
