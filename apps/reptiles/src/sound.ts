// The game's voice: what each move sounds like, through the synthesiser
// Hypersweeper shares (`@tiling/sound`, packages/sound) and in its three
// themes, Chime, Arcade and Blocks (Settings › Sound, src/preferences.ts;
// Blocks by default). As in Hypersweeper, `voicesFor` is pure — a move in,
// grains out — so the tests pin it without an audio context, and the call
// sites (input/drag.ts, main.ts, view/settings.ts) name moves, never
// oscillators.
//
// Stereo: a tile landing is heard from where it landed — its pan is where the
// tile's middle is across the screen (`SvgBoard.panAt`), -1 at the left edge
// to +1 at the right — and the win flourish leans toward the last tile laid.

import {
  flourishVoices,
  glideVoice,
  playVoices,
  setSoundPreset,
  setSoundVolume,
  strikeVoice,
  type SoundPreset,
  type Voice,
} from "@tiling/sound";

/** The theme a player who has not picked one hears: wooden knocks. */
export const DEFAULT_THEME = "blocks";

/** Each theme's line in Settings. The presets' own hints are Hypersweeper's
 * (Arcade's names its mine blast), so Rep-tiles says what it hears. */
export const THEME_HINTS: Readonly<Record<string, string>> = {
  chime: "Soft mallets, one note per tile shape",
  arcade: "Bright chiptune blips",
  blocks: "Dry wooden knocks, low and short",
  off: "No sound at all",
};

export type RepSound =
  /** A tile landed: a tile of `sides` sides, at `pan` across the screen. */
  | { kind: "place"; sides: number; pan: number }
  /** The tray turned one step, anticlockwise (1) or clockwise (-1). */
  | { kind: "turn"; dir: 1 | -1 }
  /** The board is covered, its last tile laid at `pan`. */
  | { kind: "win"; pan: number }
  /** What the settings play when a theme is picked or the volume set. */
  | { kind: "preview" };

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
    case "preview":
      // Enough of the theme to know it: a triangle landing on the left, a
      // hexagon on the right, then a turn.
      return [
        strikeVoice(preset, { sides: 3, pan: -0.6 }, 0),
        { ...strikeVoice(preset, { sides: 6, pan: 0.6 }, 0), delay: 0.13 },
        { ...glideVoice(preset, 4, 0, true), delay: 0.28 },
      ];
  }
}

/** Play a move's sound, if sound is on and the browser has let audio start. */
export function playSound(event: RepSound): void {
  playVoices((preset) => voicesFor(event, preset));
}

/** Put the player's theme and volume in force. */
export function applySound(theme: string, volume: number): void {
  setSoundPreset(theme);
  setSoundVolume(volume);
}
