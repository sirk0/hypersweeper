// The player's own choices, from Settings. Kept in localStorage through the
// shared guard (`@tiling/platform`), as the stars are: where storage is
// missing or throws, a choice lasts until the page is closed, and an
// unreadable record reads as the defaults.

import { readObject, storage } from "@tiling/platform";
import { clampVolume, DEFAULT_VOLUME, SOUND_OFF, SOUND_PRESETS } from "@tiling/sound";
import { isScheme, type SchemePref } from "./scheme";
import { DEFAULT_THEME } from "./sound";

const KEY = "rep-tiles.settings";

export interface Preferences {
  /** Once a board is finished, draw the tiling it was cut from on past its
   * edge as outlines, and let it zoom out to see more of it
   * (src/extension.ts, `SvgBoard.showBeyond`). Off unless the player turns it
   * on. */
  tilingPastBoard: boolean;
  /** The colour scheme (src/scheme.ts): Auto follows the device. */
  scheme: SchemePref;
  /** The sound theme (src/sound.ts): a preset of the shared synthesiser —
   * Chime, Arcade or Blocks, Hypersweeper's three — or `off`. Blocks unless
   * the player picks another. */
  sound: string;
  /** How loud it plays, 0..1. */
  volume: number;
  /** Whether a tile landing and a finished board are felt (src/haptics.ts).
   * On unless the player turns it off; Settings offers it only where
   * something can buzz — an iPhone in the App Store app, or an Android
   * browser. */
  haptics: boolean;
}

const DEFAULTS: Preferences = {
  tilingPastBoard: false,
  scheme: "auto",
  sound: DEFAULT_THEME,
  volume: DEFAULT_VOLUME,
  haptics: true,
};

/** A stored theme, or the default for anything this build does not know. An
 * on/off switch came before the themes: off stays off. */
function soundOf(stored: unknown): string {
  if (stored === false) return SOUND_OFF;
  if (stored === SOUND_OFF) return SOUND_OFF;
  return typeof stored === "string" && Object.hasOwn(SOUND_PRESETS, stored)
    ? stored
    : DEFAULTS.sound;
}

function load(): Preferences {
  const stored = readObject(KEY);
  return {
    tilingPastBoard:
      typeof stored?.["tilingPastBoard"] === "boolean"
        ? stored["tilingPastBoard"]
        : DEFAULTS.tilingPastBoard,
    scheme: isScheme(stored?.["scheme"]) ? stored["scheme"] : DEFAULTS.scheme,
    sound: soundOf(stored?.["sound"]),
    volume:
      typeof stored?.["volume"] === "number" ? clampVolume(stored["volume"]) : DEFAULTS.volume,
    haptics: typeof stored?.["haptics"] === "boolean" ? stored["haptics"] : DEFAULTS.haptics,
  };
}

let current = load();

/** The player's choices as they stand. */
export function preferences(): Preferences {
  return current;
}

/** Change some of them, and keep them. */
export function setPreferences(change: Partial<Preferences>): void {
  current = { ...current, ...change };
  try {
    storage()?.setItem(KEY, JSON.stringify(current));
  } catch {
    // kept in memory only
  }
}
