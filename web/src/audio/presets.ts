// What the game sounds like — a table of numbers rather than a folder of audio
// files. Every sound is synthesised at play time (audio/sound.ts), for the same
// reason the menu icons are drawn from paths and the boards from lattices: a
// sound here is *parametric*. A cell's voice is derived from how many sides it
// has, a flood fill's cascade from how far the flood spread, a Klein scroll's
// glide from which way it went — none of which a set of recorded clips could
// carry without one file per case.
//
// A preset is one entry in this table, in the shape of `render/cellStyle.ts`:
// a stack of plain numbers the engine reads, so adding a fourth character is a
// row here rather than a change in the engine. `off` is not an entry — it is
// the absence of one (`soundPreset` returns null), so a silenced game never
// builds an audio graph at all.
//
// These stay in TypeScript rather than in `data/ui/screens.json`: that file is
// the config the pygame front-end shares, and sound is web-only (the pygame
// build is deliberately silent). Cell styles live in TS for the same reason.

/** How a cell's tone is built. A voice is one oscillator running a periodic
 * wave of `partials` harmonics, where the partial count is the cell's own side
 * count — a triangle is three partials, a hexagon six, so a tile's shape is
 * heard in its timbre as well as in its pitch. */
export interface Timbre {
  /** Ceiling on the partial count. Past a handful more harmonics stop reading
   * as a rounder tile and start reading as a buzz, and the Spectre's 13 sides
   * would otherwise be indistinguishable from the pentaflake's 5. */
  partialCap: number;
  /** The k-th partial's amplitude is 1 / k**decay — the higher, the purer. */
  decay: number;
  /** Keep only the odd partials (the hollow, square-ish tone of a chiptune). */
  oddOnly: boolean;
}

/** The shape of one grain of sound: how fast it arrives, how long it lasts and
 * how loud it is. Durations are seconds, so they go to the Web Audio clock
 * unconverted; the cascade's `step` is the one exception (ms, like the
 * animation timings it is matched to). */
export interface Envelope {
  attack: number;
  duration: number;
  gain: number;
}

export interface SoundPreset {
  key: string;
  label: string;
  /** The settings row's one-line description. */
  hint: string;
  timbre: Timbre;
  /** The pitch of a *triangle* — the fewest sides a tile can have, and so the
   * top of the board's range. */
  rootHz: number;
  /** Semitones below `rootHz` per side count, indexed by `sides - 3` and
   * clamped at both ends: a triangle pings at the root, a square a step below
   * it, a hexagon lower still. Descending, because more sides read as rounder
   * and heavier. */
  scale: readonly number[];
  /** One cell opening under the finger. */
  open: Envelope;
  /** A flood fill — the same voice per ring of the spread, which is what makes
   * a recursive opening sound like a wave rather than like a click. */
  cascade: {
    /** ms of delay per ring out from the click. Matched to the reveal
     * ripple's own stagger (RIPPLE_PER_CELL) so the wave is seen and heard
     * arriving together. */
    step: number;
    /** Most grains one flood may schedule. A 500-cell flood is thinned to
     * this many across its whole spread (audio/sound.ts `thin`), so the wave
     * keeps its shape instead of turning into a wall of voices. */
    maxVoices: number;
    /** Semitones the wave rises per ring, capped at an octave. Without it a
     * flood on a board of one tile shape would be one note repeated; with it
     * the cascade lifts as it spreads, which is the sound of the opening
     * running away from the click. */
    rise: number;
    /** How much quieter each further ring is (per ring, floored at 35%). */
    falloff: number;
  };
  /** Gain of the extra low grain a *chord* drops at the chorded cell — the one
   * move that opens several cells from an already-open one. */
  chordAccent: number;
  /** A flag going down (glided up by `interval` semitones) or coming off (the
   * same figure inverted). */
  flag: Envelope & { interval: number };
  /** A detonated mine: a filtered noise blast over a pitched drop. */
  lose: {
    blast: Envelope & { cutoff: number };
    drop: Envelope & { fromHz: number; toHz: number };
  };
  /** A cleared board: a rising arpeggio sweeping across the stereo field. */
  win: Envelope & { notes: number; step: number; interval: number };
  /** One step of the Klein bottle's ring scroll: a glide, mirrored between the
   * two directions (see `voicesFor`). */
  scroll: Envelope & {
    fromHz: number;
    interval: number;
    /** How far out the glide's pan sweeps, 0..1. */
    pan: number;
    noise: number;
  };
  /** Noise mixed into the percussive voices, 0 (a pure tone) to 1. */
  noise: number;
}

/** Minor pentatonic, descending — the default board scale. Twelve entries
 * covers every tile in the catalog (3 sides up to the Spectre's 13 and the
 * phyllotactic hexagon's neighbours); anything past it clamps to the bottom. */
const MINOR_PENTATONIC = [0, -3, -5, -7, -10, -12, -15, -17, -19, -22, -24, -27];
/** Major pentatonic, descending — brighter, for the arcade preset. */
const MAJOR_PENTATONIC = [0, -2, -4, -7, -9, -12, -14, -16, -19, -21, -24, -26];
/** A tighter, mostly-diatonic descent: the wooden preset's knocks sit close
 * together, so its shapes differ in timbre more than in pitch. */
const WOOD_STEPS = [0, -2, -3, -5, -7, -8, -10, -12, -14, -15, -17, -19];

/** Soft mallets on a pentatonic scale — the default. Sine-ish partials with a
 * quick attack and a long tail, so a flood fill rings out like a struck
 * instrument rather than clattering. */
const CHIME: SoundPreset = {
  key: "chime",
  label: "Chime",
  hint: "Soft mallets, one note per tile shape",
  timbre: { partialCap: 8, decay: 1.8, oddOnly: false },
  rootHz: 880,
  scale: MINOR_PENTATONIC,
  open: { attack: 0.004, duration: 0.3, gain: 0.5 },
  cascade: { step: 30, maxVoices: 14, rise: 0.8, falloff: 0.06 },
  chordAccent: 1.2,
  flag: { attack: 0.003, duration: 0.17, gain: 0.45, interval: 5 },
  lose: {
    blast: { attack: 0.002, duration: 0.5, gain: 0.5, cutoff: 900 },
    drop: { attack: 0.006, duration: 0.85, gain: 0.45, fromHz: 220, toHz: 55 },
  },
  win: { attack: 0.006, duration: 0.5, gain: 0.4, notes: 5, step: 110, interval: 4 },
  scroll: {
    attack: 0.005,
    duration: 0.26,
    gain: 0.34,
    fromHz: 330,
    interval: 7,
    pan: 0.85,
    noise: 0.1,
  },
  noise: 0.12,
};

/** Square-wave blips: odd partials only, short and bright, with a noisy
 * detuned blast for the mine. The cabinet, not the concert hall. */
const ARCADE: SoundPreset = {
  key: "arcade",
  label: "Arcade",
  hint: "Bright chiptune blips and a noisy blast",
  timbre: { partialCap: 6, decay: 1.1, oddOnly: true },
  rootHz: 740,
  scale: MAJOR_PENTATONIC,
  open: { attack: 0.002, duration: 0.13, gain: 0.34 },
  cascade: { step: 24, maxVoices: 16, rise: 1.2, falloff: 0.05 },
  chordAccent: 1.35,
  flag: { attack: 0.001, duration: 0.1, gain: 0.32, interval: 7 },
  lose: {
    blast: { attack: 0.001, duration: 0.42, gain: 0.42, cutoff: 1600 },
    drop: { attack: 0.002, duration: 0.6, gain: 0.34, fromHz: 300, toHz: 45 },
  },
  win: { attack: 0.002, duration: 0.22, gain: 0.32, notes: 6, step: 80, interval: 4 },
  scroll: {
    attack: 0.002,
    duration: 0.2,
    gain: 0.3,
    fromHz: 420,
    interval: 12,
    pan: 0.9,
    noise: 0.05,
  },
  noise: 0.2,
};

/** Wooden knocks: a low body under a lot of filtered noise, everything short.
 * The quietest of the three, and the one that stays out of the way when a
 * flood opens half the board. */
const BLOCKS: SoundPreset = {
  key: "blocks",
  label: "Blocks",
  hint: "Dry wooden knocks, low and short",
  timbre: { partialCap: 4, decay: 2.4, oddOnly: false },
  rootHz: 340,
  scale: WOOD_STEPS,
  open: { attack: 0.001, duration: 0.11, gain: 0.5 },
  cascade: { step: 22, maxVoices: 18, rise: 0.35, falloff: 0.04 },
  chordAccent: 1.3,
  flag: { attack: 0.001, duration: 0.09, gain: 0.44, interval: 4 },
  lose: {
    blast: { attack: 0.001, duration: 0.55, gain: 0.5, cutoff: 700 },
    drop: { attack: 0.004, duration: 0.7, gain: 0.4, fromHz: 150, toHz: 40 },
  },
  win: { attack: 0.003, duration: 0.18, gain: 0.42, notes: 5, step: 95, interval: 5 },
  scroll: {
    attack: 0.002,
    duration: 0.22,
    gain: 0.34,
    fromHz: 240,
    interval: 5,
    pan: 0.8,
    noise: 0.45,
  },
  noise: 0.55,
};

/** The presets, in the order the settings page lists them. */
export const SOUND_PRESETS: Record<string, SoundPreset> = {
  chime: CHIME,
  arcade: ARCADE,
  blocks: BLOCKS,
};

/** The key that means silence. Not a preset: with it chosen nothing ever
 * builds an audio graph, so a player who wants a quiet game pays nothing for
 * the feature at all. */
export const SOUND_OFF = "off";

/** What the picker lists: the presets, then Off. */
export const SOUND_CHOICES: readonly string[] = [...Object.keys(SOUND_PRESETS), SOUND_OFF];

/** Sound is on by default, at the gentlest preset. Nothing can be heard before
 * the player's first click either way — a browser refuses to start audio
 * without a gesture (see `unlockAudio`) — so the first sound of the game is
 * always one the player asked for by touching the board. */
export const DEFAULT_SOUND = "chime";

/** The named choice, or the default for anything this build does not know —
 * `Object.hasOwn`, never `in`, since the key can arrive from a settings record
 * written by another build. `off` is a valid choice, not a preset. */
export function resolveSound(key: string | null | undefined): string {
  if (key === SOUND_OFF) return SOUND_OFF;
  return key != null && Object.hasOwn(SOUND_PRESETS, key) ? key : DEFAULT_SOUND;
}

/** The preset a choice names, or `null` for silence. */
export function soundPreset(key: string | null | undefined): SoundPreset | null {
  const resolved = resolveSound(key);
  return resolved === SOUND_OFF ? null : SOUND_PRESETS[resolved]!;
}

/** Full volume — what every build before the slider played at, and so the
 * level a record without one means. */
export const DEFAULT_VOLUME = 1;

/** The 0..1 level `value` stands for. Like `resolveSound`, this is the guard
 * between a stored record and the engine: a level can arrive from another
 * build's settings, and a gain outside 0..1 (or a NaN, which poisons a Web
 * Audio ramp for good) must never reach the master gain. */
export function clampVolume(value: number): number {
  if (!Number.isFinite(value)) return DEFAULT_VOLUME;
  return Math.min(1, Math.max(0, value));
}

/** A choice's label for the settings row. */
export function soundLabel(key: string | null | undefined): string {
  const resolved = resolveSound(key);
  return resolved === SOUND_OFF ? "Off" : SOUND_PRESETS[resolved]!.label;
}
