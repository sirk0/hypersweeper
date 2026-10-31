import { readObject, storage } from "./storage";

// Favourites: the boards a player has starred, listed on the menu's home page.
//
// Storage follows `leaderboard.ts` — one stable key holding one JSON object
// that carries its own `version`, total reads, a re-read before every write,
// guarded `setItem`. It is per *board*, not per board and difficulty: the star
// says "I like this board", and the difficulty pills choose how to play it.
//
// **A favourite is a switch with a date, not a list entry.** Each board keeps
// whether it is starred and when that last changed, and an unstarred board
// keeps its entry (`on: false`) instead of being dropped. That is what lets the
// iCloud sync (`cloudRecord.ts`) merge two devices: for each board the later
// change wins, so starring on the phone and unstarring on the Mac an hour later
// ends unstarred on both, where a plain set union would bring the star straight
// back. The entries are bounded by the catalogue, so keeping them costs nothing.
//
// A board key this build does not know (a renamed mode, a board not in this
// deploy) is carried through every write, as best times do; it is only the menu
// that leaves out what it has no row for.

const KEY = "ms:favourites";

/** Bump only when a stored field changes *meaning*. */
export const SCHEMA_VERSION = 1;

/** One board's star: whether it is on, and when it last changed (epoch ms). */
export interface Star {
  on: boolean;
  at: number;
}

export type Stars = Record<string, Star>;

function time(raw: unknown): number {
  return typeof raw === "number" && Number.isFinite(raw) && raw > 0 ? Math.floor(raw) : 0;
}

/** Validate a stored `modes` map: anything that is not a star is dropped, one
 * board at a time, so a corrupt entry costs that board alone. */
export function parseStars(raw: unknown): Stars {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return {};
  const out: Stars = {};
  for (const [mode, value] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof value !== "object" || value === null) continue;
    const on = (value as Record<string, unknown>)["on"];
    if (typeof on !== "boolean") continue;
    out[mode] = { on, at: time((value as Record<string, unknown>)["at"]) };
  }
  return out;
}

/** Every stored star, unstarred boards included — what the iCloud merge needs. */
export function storedStars(): Stars {
  return parseStars(readObject(KEY)?.["modes"]);
}

/** The starred boards, in the order they were starred. */
export function favourites(): string[] {
  return Object.entries(storedStars())
    .filter(([, s]) => s.on)
    .sort(([a, x], [b, y]) => x.at - y.at || (a < b ? -1 : 1))
    .map(([mode]) => mode);
}

export function isFavourite(mode: string): boolean {
  return storedStars()[mode]?.on === true;
}

const listeners = new Set<() => void>();

function write(stars: Stars): void {
  const store = storage();
  if (!store) return;
  const rec = readObject(KEY) ?? {};
  try {
    store.setItem(KEY, JSON.stringify({ ...rec, version: SCHEMA_VERSION, modes: stars }));
  } catch {
    /* quota exceeded, or storage disabled mid-session */
  }
}

/** Star or unstar a board, returning whether it is now starred. The record is
 * re-read first, so a star set in another tab meanwhile is kept. A refused
 * write still answers as if it landed — the star the player just tapped is
 * what they see; it simply will not be there next launch. */
export function setFavourite(mode: string, on: boolean, now: number = Date.now()): boolean {
  write({ ...storedStars(), [mode]: { on, at: time(now) } });
  return on;
}

export function toggleFavourite(mode: string, now: number = Date.now()): boolean {
  return setFavourite(mode, !isFavourite(mode), now);
}

/** Replace the stored stars with the iCloud merge's result, and tell the page:
 * a star that arrived from another device has to show up in the menu. */
export function replaceStars(stars: Stars): void {
  write(stars);
  for (const fn of listeners) fn();
}

/** The two sides of a sync, merged: for each board the later change wins. On
 * an exact tie a star beats an unstar, so the answer does not depend on which
 * side is which. Pure — the iCloud merge's unit tests call it directly. */
export function mergeStars(a: Stars, b: Stars): Stars {
  const out: Stars = { ...a };
  for (const [mode, star] of Object.entries(b)) {
    const have = out[mode];
    if (!have || star.at > have.at || (star.at === have.at && star.on && !have.on)) {
      out[mode] = star;
    }
  }
  return out;
}

/** Call `onChange` whenever the favourites change from outside this page's
 * own clicks — another tab, or another device through iCloud. Returns an
 * unsubscribe function. */
export function subscribeFavourites(onChange: () => void): () => void {
  listeners.add(onChange);
  const handler = (e: StorageEvent): void => {
    // `key === null` is a `localStorage.clear()` from another tab.
    if (e.key === null || e.key === KEY) onChange();
  };
  const win = typeof window === "undefined" ? null : window;
  win?.addEventListener("storage", handler);
  return () => {
    listeners.delete(onChange);
    win?.removeEventListener("storage", handler);
  };
}
