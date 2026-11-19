import {
  clampPan,
  degreeFor,
  gridNote,
  noteFor,
  partialsFor,
  semitones,
  type Voice,
} from "./engine";
import type { SoundPreset } from "./presets";

// The figures a game's events are voiced as — pure functions of a preset, so a
// game's `voicesFor` composes them and its tests pin what it sounds like
// without an audio context. Each is named for the sound, not for the move:
// Hypersweeper strikes a tile when a cell opens, Rep-tiles when a tile lands.

/** A tile, as a source of sound: the shape it is (side count), where it is
 * across the stereo field (-1 hard left .. +1 hard right) and which ring of a
 * spreading wave it sounds in (0 = the tile under the finger). */
export interface CellSound {
  sides: number;
  pan: number;
  ring: number;
}

/** Longest a cascade may run. Past this the wave has said what it has to say,
 * and the tiles beyond it were thinned out anyway. */
const MAX_CASCADE_S = 1.1;

/** How far ring `n` wanders off the beat, -0.5..0.5. A golden-ratio sequence:
 * deterministic, so a `voicesFor` stays pure and its tests can pin it, but
 * low-discrepancy, so it never settles into a pattern the ear can hear as a
 * rhythm of its own. Ring 0 is exactly on the beat — that grain is the tile
 * under the finger, and a click has to answer at once. */
export function swingOf(ring: number): number {
  if (ring <= 0) return 0;
  const x = ring * 0.6180339887498949;
  return x - Math.floor(x) - 0.5;
}

/** One tile struck: pitched and coloured by its shape, panned where it is.
 * `ring` places it in a cascade — later, higher by whole grid degrees, and
 * quieter; ring 0 is a single click. */
export function strikeVoice(
  preset: SoundPreset,
  cell: { sides: number; pan: number },
  ring: number,
): Voice {
  // Whole degrees of the grid, capped at an octave: the rings of a flood
  // overlap, so a fractional rise would put each one out of tune with the
  // last instead of stacking the collection.
  const rise = Math.min(preset.grid.length, Math.round(ring * preset.cascade.rise));
  // Off the metronome. Held under half a step, so the wave still arrives in
  // ring order however far out it goes.
  const swing = swingOf(ring) * Math.min(0.49, preset.cascade.swing);
  const beat = ((ring + swing) * preset.cascade.step) / 1000;
  return {
    delay: Math.max(0, Math.min(MAX_CASCADE_S, beat)),
    freq: semitones(preset.rootHz, gridNote(preset, degreeFor(preset, cell.sides) - rise)),
    pan: clampPan(cell.pan),
    duration: preset.open.duration,
    attack: preset.open.attack,
    gain:
      preset.open.gain *
      Math.max(0.35, 1 - ring * preset.cascade.falloff) *
      (1 + swingOf(ring + 1) * preset.cascade.swing * 0.4),
    partials: partialsFor(preset, cell.sides),
    noise: preset.noise,
    noiseDecay: preset.strike,
  };
}

/** A short glide off a tile's note, up (`up`) or the same figure inverted —
 * so the two are heard as one action and its undo. Hypersweeper's flag going
 * down and coming off; Rep-tiles' turn one way and the other. */
export function glideVoice(preset: SoundPreset, sides: number, pan: number, up: boolean): Voice {
  const base = noteFor(preset, sides);
  const step = up ? preset.flag.interval : -preset.flag.interval;
  return {
    delay: 0,
    freq: base,
    endFreq: semitones(base, step),
    pan: clampPan(pan),
    duration: preset.flag.duration,
    attack: preset.flag.attack,
    gain: preset.flag.gain * (up ? 1 : 0.8),
    partials: partialsFor(preset, sides),
    noise: preset.noise * 0.5,
    noiseDecay: preset.strike,
  };
}

/** A finished board: a rising arpeggio sweeping across the stereo field,
 * leaning toward `pan` (where the finishing move was). */
export function flourishVoices(preset: SoundPreset, pan: number): Voice[] {
  const { notes, step, interval } = preset.win;
  // Up the grid from an octave below the root, `interval` degrees a note.
  // The notes overlap, so the flourish is a chord as much as a run — a
  // constant semitone interval spelled an augmented triad.
  const start = preset.grid.length;
  const last = Math.max(1, notes - 1);
  return Array.from({ length: notes }, (_, i) => ({
    delay: (i * step) / 1000,
    freq: semitones(preset.rootHz, gridNote(preset, start - i * interval)),
    // The flourish sweeps the whole field, leaning toward the finishing move —
    // the board is done, so the celebration is not local to one tile the way
    // a click is.
    pan: clampPan(-0.6 + (1.2 * i) / last + pan * 0.3),
    duration: preset.win.duration,
    attack: preset.win.attack,
    gain: preset.win.gain,
    partials: Math.min(preset.timbre.partialCap, 4),
    noise: 0,
  }));
}

/** A preset's voice in miniature, for a settings swatch: the loudness of each
 * of its first `bars` partials, 0..1 — the spectrum the engine synthesises, so
 * the swatches differ exactly where the presets do (Chime's harmonics fall away
 * smoothly, Arcade's even ones are missing, Blocks' drop off a cliff). `null`
 * (Off) is all zeros. */
export function swatchLevels(preset: SoundPreset | null, bars = 5): number[] {
  return Array.from({ length: bars }, (_, i) => {
    const k = i + 1;
    if (!preset || (preset.timbre.oddOnly && k % 2 === 0)) return 0;
    return 1 / k ** preset.timbre.decay;
  });
}
