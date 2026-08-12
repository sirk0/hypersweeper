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
  /** The preset's pitch collection: one octave of semitone offsets below
   * `rootHz`, descending from 0, repeating every 12 semitones in both
   * directions (`gridNote` in audio/sound.ts). Every note the preset can play
   * is a member — the shapes, the cascade's rise and the win flourish all
   * land on it — which is what keeps simultaneous voices consonant however
   * they are combined. All three are anhemitonic pentatonics: no semitone, no
   * tritone, so no pair of members can clash. */
  grid: readonly number[];
  /** Which degree of `grid` each side count takes, indexed by `sides - 3` for
   * 3..13 and clamped at both ends (a triangle at the root, the Spectre's
   * 13-gon at the bottom). Ascending, so pitch descends: more sides read as
   * rounder and heavier.
   *
   * Deliberately *not* one degree per side. Degrees are skipped so that the
   * shape sets that actually share a board come out as chords — measured
   * across every mode in data/presets.json, those sets are {3,4} {3,5} {3,6}
   * {3,12} {4,8} {5,6} {3,4,6} {3,4,5} {4,6,12} {4,6,10} and nothing else,
   * and `tests/unit/soundHarmony.test.ts` re-measures them rather than
   * trusting this comment. Side counts 7, 9 and 11 are in no board at all;
   * their entries only keep the table indexable. */
  degrees: readonly number[];
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
    /** Degrees of `grid` the wave rises per ring, rounded to a whole degree
     * and capped at an octave. Without it a flood on a board of one tile
     * shape would be one note repeated; with it the cascade lifts as it
     * spreads, which is the sound of the opening running away from the click.
     *
     * Degrees rather than semitones because the rings *overlap*: a grain
     * rings for `open.duration` against a stagger of `step`, so ten rings of
     * a flood are sounding at once. This was a fraction of a semitone per
     * ring, which put every ring a fifth of a tone off the last — beating,
     * not a chord. Quantised to the grid, a flood can only ever stack members
     * of the collection. */
    rise: number;
    /** How much quieter each further ring is (per ring, floored at 35%). */
    falloff: number;
  };
  /** Gain of the extra low grain a *chord* drops under the move — the one
   * move that opens several cells from an already-open one. */
  chordAccent: number;
  /** A flag going down (glided up by `interval` semitones) or coming off (the
   * same figure inverted). Semitones, not degrees: a flag is a lone gesture
   * rather than part of a chord, so its glide is free to leave the grid. */
  flag: Envelope & { interval: number };
  /** A detonated mine: a filtered noise blast over a pitched drop. */
  lose: {
    blast: Envelope & { cutoff: number };
    drop: Envelope & { fromHz: number; toHz: number };
  };
  /** A cleared board: a rising arpeggio sweeping across the stereo field,
   * walking up `grid` by `interval` degrees a note from an octave below the
   * root. Degrees, because the notes overlap (each rings for `duration`
   * against a stagger of `step` ms) and so sound as a chord — stacking a
   * constant interval instead spelled an augmented triad. */
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

// The three collections. A pentatonic has no semitone and no tritone, so no
// two of its members can clash; which *rotation* it is decides where the
// thirds fall, and so what chord a board's shapes spell.
//
// Only two rotations put a third rather than a second between the first two
// degrees, which a triangle and a square need (they share four boards). Chime
// and Arcade take one each; Blocks takes a third rotation and pays for it with
// a spelling of its own, below.

/** Thirds at the top and in the middle: the shapes come out *major*. */
const PENTATONIC_BRIGHT = [0, -3, -5, -7, -10];
/** The same collection rotated: the shapes come out *minor*. */
const PENTATONIC_DARK = [0, -3, -5, -8, -10];
/** A fourth off the root — the wooden preset's shapes sit on open intervals
 * with a minor triad where three shapes meet. */
const PENTATONIC_OPEN = [0, -2, -5, -7, -9];

/** The spelling Chime and Arcade share: side counts 3..13 onto grid degrees.
 * One degree per side would put a *second* between a hexagon and a decagon and
 * between a triangle and a dodecagon; the three skips (5→6, 11→12, and the
 * fifth the square takes at the top) are what land the real shape sets on
 * chord tones instead. */
const SPELLING = [0, 3, 5, 6, 7, 8, 9, 10, 11, 13, 14];
/** Blocks' rotation puts its thirds elsewhere, so it needs its own spelling —
 * and gets a shallower descent out of it, which suits the lowest preset. */
const SPELLING_OPEN = [0, 2, 4, 5, 6, 7, 8, 9, 10, 12, 13];

/** Soft mallets on a pentatonic scale — the default. Sine-ish partials with a
 * quick attack and a long tail, so a flood fill rings out like a struck
 * instrument rather than clattering. Its shapes spell a major triad: on the
 * rhombitrihexagonal board the triangles, squares and hexagons a chord opens
 * are 1046 / 698 / 440 Hz. */
const CHIME: SoundPreset = {
  key: "chime",
  label: "Chime",
  hint: "Soft mallets, one note per tile shape",
  timbre: { partialCap: 8, decay: 1.8, oddOnly: false },
  // The root is a triangle, and the roots are set so that the boards played
  // most keep their pitch through the retuning: a plain square board lands
  // within a semitone of where it used to ring in all three presets. A
  // hexagon board drops a third — that widened gap between the square and the
  // hexagon is exactly what makes the triad, so it cannot be anchored too.
  rootHz: 1046,
  grid: PENTATONIC_BRIGHT,
  degrees: SPELLING,
  open: { attack: 0.004, duration: 0.3, gain: 0.5 },
  cascade: { step: 30, maxVoices: 14, rise: 0.5, falloff: 0.06 },
  chordAccent: 1.2,
  flag: { attack: 0.003, duration: 0.17, gain: 0.45, interval: 5 },
  lose: {
    blast: { attack: 0.002, duration: 0.5, gain: 0.5, cutoff: 900 },
    drop: { attack: 0.006, duration: 0.85, gain: 0.45, fromHz: 220, toHz: 55 },
  },
  win: { attack: 0.006, duration: 0.5, gain: 0.4, notes: 5, step: 110, interval: 2 },
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
 * detuned blast for the mine. The cabinet, not the concert hall. Shares
 * Chime's spelling over the rotated collection, so the same shape sets come
 * out *minor* — which is the contrast a second scale used to carry. */
const ARCADE: SoundPreset = {
  key: "arcade",
  label: "Arcade",
  hint: "Bright chiptune blips and a noisy blast",
  timbre: { partialCap: 6, decay: 1.1, oddOnly: true },
  rootHz: 988,
  grid: PENTATONIC_DARK,
  degrees: SPELLING,
  open: { attack: 0.002, duration: 0.13, gain: 0.34 },
  cascade: { step: 24, maxVoices: 16, rise: 0.7, falloff: 0.05 },
  chordAccent: 1.35,
  flag: { attack: 0.001, duration: 0.1, gain: 0.32, interval: 7 },
  lose: {
    blast: { attack: 0.001, duration: 0.42, gain: 0.42, cutoff: 1600 },
    drop: { attack: 0.002, duration: 0.6, gain: 0.34, fromHz: 300, toHz: 45 },
  },
  win: { attack: 0.002, duration: 0.22, gain: 0.32, notes: 6, step: 80, interval: 2 },
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
  // Up from 340: the spelling descends three octaves, and at the old root a
  // 12- or 13-gon board sat under 50 Hz, which a phone cannot reproduce.
  rootHz: 415,
  grid: PENTATONIC_OPEN,
  degrees: SPELLING_OPEN,
  open: { attack: 0.001, duration: 0.11, gain: 0.5 },
  cascade: { step: 22, maxVoices: 18, rise: 0.25, falloff: 0.04 },
  chordAccent: 1.3,
  flag: { attack: 0.001, duration: 0.09, gain: 0.44, interval: 4 },
  lose: {
    blast: { attack: 0.001, duration: 0.55, gain: 0.5, cutoff: 700 },
    drop: { attack: 0.004, duration: 0.7, gain: 0.4, fromHz: 150, toHz: 40 },
  },
  win: { attack: 0.003, duration: 0.18, gain: 0.42, notes: 5, step: 95, interval: 2 },
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

/** Half volume, and the level a record without one means. The presets are
 * balanced against each other, not against the room: at the top of the range a
 * cascade on a big board is louder than a player who has just opened the game
 * asked for, so the slider starts halfway and has somewhere to go in both
 * directions. */
export const DEFAULT_VOLUME = 0.5;

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
