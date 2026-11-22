// The best this player has done on each level — the stars in the catalog,
// 1 to 3, and the fastest finish, in milliseconds (`bestTimeFor`). Kept in localStorage, which can be missing or throw (a private
// window, blocked site data), so every access goes through the shared guard
// (`@tiling/platform`) and the game works without it: the stars then last until
// the page is closed.

import { readObject, storage } from "@tiling/platform";

const KEY = "rep-tiles.stars";
const TIMES_KEY = "rep-tiles.times";
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

/** A stored finish time: a whole, positive number of milliseconds. */
export const isTime = (n: unknown): n is number =>
  typeof n === "number" && Number.isFinite(n) && n > 0;

function loadTimes(): Map<string, number> {
  const out = new Map<string, number>();
  for (const [k, ms] of Object.entries(readObject(TIMES_KEY) ?? {}))
    if (isTime(ms)) out.set(k, Math.round(ms));
  return out;
}

const times = loadTimes();

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

function saveTimes(): void {
  try {
    storage()?.setItem(TIMES_KEY, JSON.stringify(Object.fromEntries(times)));
  } catch {
    // kept in memory only
  }
}

/** A time as the win card and a tiling's page show it: minutes and seconds,
 * `1:05`. */
export function formatTime(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

/** The fastest finish of a level so far, in milliseconds, or null — any
 * finish, from the first tile down to the last, however many stars. */
export function bestTimeFor(level: string): number | null {
  return times.get(level) ?? null;
}

/** Every level's fastest finish — what iCloud is kept in step with. */
export function allTimes(): ReadonlyMap<string, number> {
  return times;
}

/** Record a finish's time; only a faster one is kept. True if it was. */
export function recordTime(level: string, ms: number): boolean {
  if (!isTime(ms)) return false;
  const was = times.get(level);
  const rounded = Math.max(1, Math.round(ms));
  if (was !== undefined && was <= rounded) return false;
  times.set(level, rounded);
  saveTimes();
  return true;
}

const listeners: (() => void)[] = [];

/** Hear of stars or best times arriving from elsewhere (another device,
 * through iCloud), so a screen showing them can be drawn again. A finish here is not told: the
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

/** Take in another record's times — each level's fastest — and tell the
 * listeners if any fell. */
export function mergeTimes(from: ReadonlyMap<string, number>): void {
  let changed = false;
  for (const [level, ms] of from) {
    const was = times.get(level);
    if (isTime(ms) && (was === undefined || ms < was)) {
      times.set(level, Math.round(ms));
      changed = true;
    }
  }
  if (!changed) return;
  saveTimes();
  for (const listener of listeners) listener();
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
