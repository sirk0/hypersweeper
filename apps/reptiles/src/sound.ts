// The game's voice: what each move sounds like, through the synthesiser
// Hypersweeper shares (`@tiling/sound`, packages/sound). As in Hypersweeper,
// `voicesFor` is pure — a move in, grains out — so the tests pin it without an
// audio context, and the call sites (input/drag.ts, main.ts) name moves, never
// oscillators. Settings › Sound turns it off (src/preferences.ts).

import {
  flourishVoices,
  glideVoice,
  playVoices,
  strikeVoice,
  type SoundPreset,
  type Voice,
} from "@tiling/sound";

export type RepSound =
  /** A tile landed: a tile of `sides` sides, at `pan` across the screen. */
  | { kind: "place"; sides: number; pan: number }
  /** The tray turned one step, anticlockwise (1) or clockwise (-1). */
  | { kind: "turn"; dir: 1 | -1 }
  /** The board is covered. */
  | { kind: "win"; pan: number };

/** The grains a move sounds as. Pure. */
export function voicesFor(event: RepSound, preset: SoundPreset): Voice[] {
  switch (event.kind) {
    case "place":
      // The click Hypersweeper makes when a cell opens: pitched and coloured
      // by the tile's shape, heard where it landed.
      return [strikeVoice(preset, { sides: event.sides, pan: event.pan }, 0)];
    case "turn":
      // A short beep, centred — a turn moves every tray tile, not one place —
      // gliding up one way round and down the other.
      return [glideVoice(preset, 4, 0, event.dir === 1)];
    case "win":
      return flourishVoices(preset, event.pan);
  }
}

/** Play a move's sound, if sound is on and the browser has let audio start. */
export function playSound(event: RepSound): void {
  playVoices((preset) => voicesFor(event, preset));
}
