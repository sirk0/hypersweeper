// The player's choices in Settings, kept in localStorage through the shared
// guard (`@tiling/platform`): it can be missing or throw, and then a choice
// lasts until the page is closed.

import { storage } from "@tiling/platform";

const LINES_KEY = "rep-tiles.lines";

let lines: boolean | null = null;

/** Whether a coloured board draws a line across every edge between two tiles
 * of one colour, so its stripes read as stripes. On unless turned off. A
 * lined board in one colour always draws its lines: they are its rule. */
export function showLines(): boolean {
  if (lines === null) {
    try {
      lines = storage()?.getItem(LINES_KEY) !== "0";
    } catch {
      lines = true;
    }
  }
  return lines;
}

export function setShowLines(on: boolean): void {
  lines = on;
  try {
    storage()?.setItem(LINES_KEY, on ? "1" : "0");
  } catch {
    // kept in memory only
  }
}
