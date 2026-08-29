import { readObject, storage } from "./storage";

// Best times: the fastest three wins on each board, at each difficulty, kept on
// this device.
//
// Storage layout mirrors `settings.ts` — one stable key holding one JSON object
// that carries its own `version`, never a versioned key name (which silently
// resets everyone on a schema change, because the new build reads a key nobody
// has written). It is a *separate* key from the settings record: this is game
// history rather than a preference, it grows with every board played, and the
// settings record is small on purpose so it can be rewritten and mirrored
// across tabs cheaply.
//
// Reading is total, like settings: a board whose entry list is corrupt costs
// the player that board's records, not the whole leaderboard. Nothing here ever
// deletes a record it cannot interpret — a board key this build does not know
// (a mode renamed, a board not in this deploy) is carried through every write
// untouched, so downgrading or a half-finished rename does not throw away
// times.

const KEY = "ms:scores";

/** Bump only when a stored field changes *meaning*. Purely additive fields
 * need no bump — an older record simply lacks them. */
export const SCHEMA_VERSION = 1;

/** How many times are kept per board per difficulty. */
export const TOP_N = 3;

export interface ScoreEntry {
  /** The winning time in whole milliseconds. Ranking is on this rather than on
   * the seconds the HUD shows, so two 41-second wins still order correctly. */
  ms: number;
  /** When it was set (epoch ms), for the date beside it in the list. */
  at: number;
}

/** A board's records: the mode, the difficulty and up to `TOP_N` times. */
export interface BoardScores {
  mode: string;
  difficulty: string;
  entries: ScoreEntry[];
}

/** The storage key for one board at one difficulty. `|` cannot occur in a mode
 * or difficulty key (both are lowercase identifiers from `data/`), so the two
 * parts are always recoverable. */
export function boardKey(mode: string, difficulty: string): string {
  return `${mode}|${difficulty}`;
}

/** The mode and difficulty a `boardKey` was built from, or `null` when the key
 * is not one. Exported for `achievements.ts`, which seeds itself from the
 * best-times list — a complete record of every board this device has won. */
export function splitBoardKey(key: string): { mode: string; difficulty: string } | null {
  const i = key.indexOf("|");
  if (i <= 0 || i === key.length - 1) return null;
  return { mode: key.slice(0, i), difficulty: key.slice(i + 1) };
}

/** The `boards` map of the stored record, unvalidated. Separated from
 * `parseEntries` so a single unreadable board does not cost the others. */
function readBoards(): Record<string, unknown> {
  const rec = readObject(KEY);
  const boards = rec?.["boards"];
  if (typeof boards !== "object" || boards === null || Array.isArray(boards)) return {};
  return boards as Record<string, unknown>;
}

/** Validate one stored entry list: drop anything that is not an entry with a
 * usable time, sort fastest first, and keep at most `TOP_N`. Sorting on read
 * rather than trusting the stored order means a hand-edited file, or a record
 * written by a build with a different `TOP_N`, still reads sensibly. */
function parseEntries(raw: unknown): ScoreEntry[] {
  if (!Array.isArray(raw)) return [];
  const entries: ScoreEntry[] = [];
  for (const item of raw) {
    if (typeof item !== "object" || item === null) continue;
    const ms = (item as Record<string, unknown>)["ms"];
    const at = (item as Record<string, unknown>)["at"];
    if (typeof ms !== "number" || !Number.isFinite(ms) || ms < 0) continue;
    entries.push({
      ms: Math.floor(ms),
      at: typeof at === "number" && Number.isFinite(at) && at > 0 ? Math.floor(at) : 0,
    });
  }
  // Ties keep the older record first — see `rankFor`.
  entries.sort((a, b) => a.ms - b.ms || a.at - b.at);
  return entries.slice(0, TOP_N);
}

/** The stored times for one board at one difficulty, fastest first. */
export function bestTimes(mode: string, difficulty: string): ScoreEntry[] {
  return parseEntries(readBoards()[boardKey(mode, difficulty)]);
}

/** Every board that has any stored time, keyed by `boardKey`. One read of
 * storage for the whole list, so the best-times page can walk the catalog in
 * its own order without going back to `localStorage` per board. Board keys this
 * build does not recognise are included; it is the caller that decides it has
 * nothing to label them with. */
export function allBestTimes(): Map<string, ScoreEntry[]> {
  const out = new Map<string, ScoreEntry[]>();
  for (const [key, raw] of Object.entries(readBoards())) {
    if (!splitBoardKey(key)) continue;
    const entries = parseEntries(raw);
    if (entries.length > 0) out.set(key, entries);
  }
  return out;
}

/** Where a time of `ms` would place among `entries` (1-based), or `null` when
 * it does not make the top `TOP_N`.
 *
 * A time *equal* to a stored one ranks below it: you have to beat a record to
 * take its place, and the earlier run keeps the position it earned. With whole
 * milliseconds an exact tie is rare on a real board but routine on a tiny one
 * (a first click that floods the whole field wins in 0 ms). */
export function rankFor(ms: number, entries: ScoreEntry[]): number | null {
  if (!Number.isFinite(ms) || ms < 0) return null;
  const ahead = entries.filter((e) => e.ms <= ms).length;
  return ahead < TOP_N ? ahead + 1 : null;
}

/** Record a winning time, returning its rank and the board's new top list — or
 * `null` when the time did not place (and nothing was written).
 *
 * The record is re-read immediately before it is written, so a game finished in
 * another tab meanwhile keeps its entry, and boards (or future fields) this
 * build does not know about are carried through untouched.
 *
 * A write the browser refuses (private mode, quota) still reports the rank: the
 * player did just set that time, and the dialog saying so is the truth about
 * the game they played. It simply will not be there next launch — the same
 * bargain `saveSettings` makes with a refused write. */
export function recordTime(
  mode: string,
  difficulty: string,
  ms: number,
  now: number = Date.now(),
): { rank: number; entries: ScoreEntry[] } | null {
  if (!Number.isFinite(ms) || ms < 0) return null;
  const time = Math.floor(ms);
  const key = boardKey(mode, difficulty);
  const entries = parseEntries(readBoards()[key]);
  const rank = rankFor(time, entries);
  if (rank === null) return null;

  const at = Number.isFinite(now) && now > 0 ? Math.floor(now) : 0;
  const updated = [...entries];
  updated.splice(rank - 1, 0, { ms: time, at });
  updated.length = Math.min(updated.length, TOP_N);

  const store = storage();
  if (store) {
    const rec = readObject(KEY) ?? {};
    const boards = readBoards();
    try {
      store.setItem(
        KEY,
        JSON.stringify({ ...rec, version: SCHEMA_VERSION, boards: { ...boards, [key]: updated } }),
      );
    } catch {
      /* quota exceeded, or storage disabled mid-session */
    }
  }
  return { rank, entries: updated };
}

/** Forget every stored time (the settings page's clear action). Only this
 * app's own key is touched. */
export function clearBestTimes(): void {
  try {
    storage()?.removeItem(KEY);
  } catch {
    /* storage disabled mid-session */
  }
}

/** A stored time as the player saw it on the HUD: whole seconds, counted down
 * the same way the header counter does. Milliseconds only ever break ties; they
 * are never shown, so the number here is the number that was on the clock. */
export function formatTime(ms: number): string {
  return String(Math.floor(ms / 1000));
}
