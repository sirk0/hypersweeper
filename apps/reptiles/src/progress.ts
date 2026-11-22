// The best this player has done on each level — the stars in the catalog,
// 1 to 3. Kept in localStorage, which can be missing or throw (a private
// window, blocked site data), so every access goes through the shared guard
// (`@tiling/platform`) and the game works without it: the stars then last until
// the page is closed.

import { readObject, storage } from "@tiling/platform";

const KEY = "rep-tiles.stars";
/** Where the stars were kept while the game was called Tiling Simulator, and,
 * before stars were earned in threes, the bare list of finished levels — each
 * of those counts as one star. Read once more, never written. */
const RENAMED_KEY = "tiling-simulator.stars";
const OLD_KEY = "tiling-simulator.solved";

/** The JSON array stored at `key`, or null — only the oldest key held one. */
function readList(key: string): unknown[] | null {
  try {
    const raw = storage()?.getItem(key);
    const parsed: unknown = raw ? JSON.parse(raw) : null;
    return Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function load(): Map<string, number> {
  const best = new Map<string, number>();
  for (const k of readList(OLD_KEY) ?? []) if (typeof k === "string") best.set(k, 1);
  for (const stars of [readObject(RENAMED_KEY), readObject(KEY)]) {
    if (!stars) continue;
    for (const [k, n] of Object.entries(stars)) {
      if (typeof n === "number" && n >= 1 && n <= 3)
        best.set(k, Math.max(best.get(k) ?? 0, Math.floor(n)));
    }
  }
  return best;
}

const best = load();

/** The most stars earned on a level so far, 0 if it has never been finished. */
export function starsFor(level: string): number {
  return best.get(level) ?? 0;
}

function save(): void {
  try {
    storage()?.setItem(KEY, JSON.stringify(Object.fromEntries(best)));
  } catch {
    // kept in memory only
  }
}

/** Every level's best — what iCloud is kept in step with (cloudStars.ts). */
export function allStars(): ReadonlyMap<string, number> {
  return best;
}

const listeners: (() => void)[] = [];

/** Hear of stars arriving from elsewhere (another device, through iCloud), so
 * a screen showing them can be drawn again. A finish here is not told: the
 * screen it happens on draws its own. */
export function onStarsMerged(listener: () => void): void {
  listeners.push(listener);
}

/** Record a finish; only an improvement is kept. */
export function recordStars(level: string, stars: number): void {
  if (stars <= starsFor(level)) return;
  best.set(level, stars);
  save();
}

/** Take in another record's stars — each level's most — and tell the
 * listeners if anything rose. */
export function mergeStars(from: ReadonlyMap<string, number>): void {
  let changed = false;
  for (const [level, n] of from) {
    if (n >= 1 && n <= 3 && n > starsFor(level)) {
      best.set(level, Math.floor(n));
      changed = true;
    }
  }
  if (!changed) return;
  save();
  for (const listener of listeners) listener();
}
