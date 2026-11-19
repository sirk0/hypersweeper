// The player's own choices, from Settings. Kept in localStorage through the
// shared guard (`@tiling/platform`), as the stars are: where storage is
// missing or throws, a choice lasts until the page is closed, and an
// unreadable record reads as the defaults.

import { readObject, storage } from "@tiling/platform";
import { isScheme, type SchemePref } from "./scheme";

const KEY = "rep-tiles.settings";

export interface Preferences {
  /** Once a board is finished, draw the tiling it was cut from on past its
   * edge as outlines, and let it zoom out to see more of it
   * (src/extension.ts, `SvgBoard.showBeyond`). Off unless the player turns it
   * on. */
  tilingPastBoard: boolean;
  /** The colour scheme (src/scheme.ts): Auto follows the device. */
  scheme: SchemePref;
}

const DEFAULTS: Preferences = { tilingPastBoard: false, scheme: "auto" };

function load(): Preferences {
  const stored = readObject(KEY);
  return {
    tilingPastBoard:
      typeof stored?.["tilingPastBoard"] === "boolean"
        ? stored["tilingPastBoard"]
        : DEFAULTS.tilingPastBoard,
    scheme: isScheme(stored?.["scheme"]) ? stored["scheme"] : DEFAULTS.scheme,
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
