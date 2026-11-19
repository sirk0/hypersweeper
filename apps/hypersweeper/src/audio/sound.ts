import {
  clampPan,
  degreeFor,
  flourishVoices,
  glideVoice,
  gridNote,
  playVoices,
  semitones,
  strikeVoice,
  type CellSound,
  type SoundPreset,
  type Voice,
} from "@tiling/sound";

// The game's voice. Two halves, deliberately kept apart:
//
//   - `voicesFor(event, preset)` is **pure**: a game event in, a list of grains
//     out (when, what pitch, how wide, how loud). Every rule this feature has —
//     shape to pitch, a flood fill's cascade, the two Klein directions being
//     mirror images — lives there and is unit-tested without an audio context.
//   - `playSound(event)` hands them to the shared synthesiser
//     (`@tiling/sound`, packages/sound), which renders them into Web Audio
//     nodes and knows nothing about the game. The presets, the player and the
//     figures this builds from (a struck tile, a glide, the win flourish) are
//     there, shared with Rep-tiles.
//
// This is the single seam for sound, as `haptics.ts` is for touch: the call
// sites (session.ts, and the settings preview) name events, never oscillators.

export type { CellSound, SoundPreset, Voice };
// The player and the pitch helpers, re-exported so this stays the one seam the
// game's call sites (and its tests) import sound from.
export {
  degreeFor,
  gridNote,
  noteFor,
  partialsFor,
  setSoundPreset,
  setSoundVolume,
  soundChoice,
  soundEnabled,
  soundVolume,
  unlockAudio,
} from "@tiling/sound";

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
  /** `count` achievements unlocked by the win just played. */
  | { kind: "unlock"; count: number }
  /** One step of the Klein bottle's ring scroll. */
  | { kind: "scroll"; direction: number }
  /** The figure the settings picker plays when a preset is chosen. */
  | { kind: "preview" };

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

/**
 * The grains one game event sounds as. Pure — no audio context, no clock, no
 * globals — so every rule below is asserted in `tests/unit/sound.test.ts`.
 *
 * The rules:
 *   - **shape**: pitch and partial count both come from the cell's side count,
 *     so a triangle, a square, a pentagon and a hexagon are four voices.
 *   - **one collection**: every pitch here is a degree of the preset's grid —
 *     the shapes, the cascade's rise, the chord's bass note and the win
 *     flourish alike. A move opens several shapes at once, and their voices
 *     have to be a chord rather than a coincidence; keeping the whole engine
 *     on one pentatonic is what guarantees it whatever the board.
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
      const origin = event.cells.find((c) => c.ring === 0) ?? event.cells[0]!;
      if (event.chord) {
        // An octave below the *deepest* shape the move opened, not below the
        // chorded cell's: on a board of several shapes the chorded cell need
        // not be the lowest of them, and the accent has to stay the bass note
        // under the chord rather than land in the middle of it.
        let deepest = degreeFor(preset, origin.sides);
        for (const cell of event.cells) {
          const degree = degreeFor(preset, cell.sides);
          if (degree > deepest) deepest = degree;
        }
        voices.push({
          ...strikeVoice(preset, origin, 0),
          freq: semitones(preset.rootHz, gridNote(preset, deepest + preset.grid.length)),
          gain: preset.open.gain * preset.chordAccent,
        });
      }
      if (event.cells.length === 1) {
        voices.push(strikeVoice(preset, event.cells[0]!, 0));
        return voices;
      }
      for (const cell of thin(event.cells, preset.cascade.maxVoices)) {
        voices.push(strikeVoice(preset, cell, cell.ring));
      }
      return voices;
    }

    case "flag":
      // The same figure either way, glided up as a flag goes down and down as
      // it comes off — so the two are heard as one action and its undo.
      return [glideVoice(preset, event.sides, event.pan, event.on)];

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

    case "win":
      // The flourish sweeps the whole field, leaning toward the winning click
      // — the board is cleared, so the celebration is not local to one cell
      // the way an opening is.
      return flourishVoices(preset, event.pan);

    case "unlock": {
      const { notes, step, interval } = preset.unlock;
      // One note per achievement, so the figure is as big as the moment was:
      // a single unlock is a two-note lift, and a first win's six runs to the
      // preset's ceiling. The same rule the rest of this module follows — the
      // sound is derived from what happened, not chosen for it.
      const n = Math.max(2, Math.min(notes, Math.floor(event.count) + 1));
      return Array.from({ length: n }, (_, i) => ({
        delay: (i * step) / 1000,
        // Up from the root. The win flourish covers a wider range than this
        // (an octave below the root to a third above), so what separates the
        // two is the gesture rather than the register: that one is long and
        // sweeps the field, this one is short and stays put. Under reduced
        // motion they sound together, and what makes that safe is that both
        // are grid degrees — the one-collection rule.
        freq: semitones(preset.rootHz, gridNote(preset, -i * interval)),
        // Centred: this is about a card, not about a cell, so it has no place
        // in the stereo field the way an opening does.
        pan: 0,
        duration: preset.unlock.duration,
        attack: preset.unlock.attack,
        gain: preset.unlock.gain,
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
        strikeVoice(preset, { sides: 3, pan: -0.4 }, 0),
        { ...strikeVoice(preset, { sides: 6, pan: 0.4 }, 0), delay: 0.13 },
        ...voicesFor({ kind: "flag", on: true, sides: 4, pan: 0 }, preset).map((v) => ({
          ...v,
          delay: 0.28,
        })),
      ];
    }
  }
}

// -- playing ------------------------------------------------------------------

/**
 * Play a game event, if sound is on and the browser has let us start. Silent
 * and side-effect-free otherwise (see `playVoices` in `@tiling/sound`).
 */
export function playSound(event: SoundEvent): void {
  playVoices((preset) => voicesFor(event, preset));
}

/** Play the settings picker's sample of the current preset. */
export function previewSound(): void {
  playSound({ kind: "preview" });
}
