// The boards in play, kept so a level left half-covered — for another screen,
// a reload, or an iPhone that closed the app in the background — opens again
// as it was left: its tiles, the time spent on it so far and the hints shown
// (so leaving cannot win back the no-hint star). Restart, Play again or
// finishing the board forgets it.
//
// Kept in localStorage through the shared guard (`@tiling/platform`), as the
// stars are: where storage is missing or throws, a board lasts as long as the
// page. Each tile is kept exactly, as its kind, its turn, whether it is
// flipped and its pieces' vertices — a `Cyc` is a list of integers, so nothing
// is rounded — and is checked again as it is laid back (`Puzzle.resume`): a
// tile that is not its kind held that way, or does not fit, drops the whole
// board. A board is also kept with a fingerprint of the level's own cells, so
// a level whose board or tiles have changed since starts afresh.

import { readObject, storage } from "@tiling/platform";
import type { Cyc } from "./geometry/cyclotomic";
import { spotKey } from "./geometry/shape";
import type { Level } from "./levels";
import type { LaidTile } from "./puzzle";

const KEY = "rep-tiles.boards";

/** At most this many boards are kept; past it, the one left longest ago goes. */
export const MAX_SAVED = 30;

/** A tile as kept: its kind, turn and side, and its pieces' vertices. */
export interface SavedTile {
  kind: number;
  rot: number;
  flip: boolean;
  verts: Cyc[][];
}

export interface SavedBoard {
  /** The level's cells, fingerprinted (`fingerprint`). */
  fp: string;
  tiles: SavedTile[];
  /** The time spent on the board so far, in milliseconds. */
  ms: number;
  /** Hints shown on it. */
  hints: number;
  /** When it was kept (Date.now), to drop the oldest past `MAX_SAVED`. */
  at: number;
}

/** What a level's board and tiles are, in a few characters: a hash of its own
 * cells, exactly (`spotKey`, marks included), and how many kinds it has. */
export function fingerprint(level: Level): string {
  const { ring } = level;
  const text = level.cells
    .map((c) => spotKey(ring, c))
    .sort()
    .join("/");
  // FNV-1a, 32-bit
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return `${level.tiles.length}.${level.cells.length}.${(h >>> 0).toString(36)}`;
}

const isInt = (x: unknown): x is number => typeof x === "number" && Number.isInteger(x);

/** A tile read back, if it is one: vertices of `size` integers each. */
function readTile(raw: unknown, size: number): SavedTile | null {
  if (!raw || typeof raw !== "object") return null;
  const { kind, rot, flip, verts } = raw as Record<string, unknown>;
  if (!isInt(kind) || !isInt(rot) || typeof flip !== "boolean" || !Array.isArray(verts))
    return null;
  if (verts.length === 0) return null;
  for (const piece of verts) {
    if (!Array.isArray(piece) || piece.length < 3) return null;
    for (const v of piece)
      if (!Array.isArray(v) || v.length !== size || !v.every(isInt)) return null;
  }
  return { kind, rot, flip, verts: verts as Cyc[][] };
}

/** Every kept board, by level key; anything unreadable is left out. */
function readAll(): Map<string, unknown> {
  return new Map(Object.entries(readObject(KEY) ?? {}));
}

function writeAll(all: Map<string, unknown>): void {
  try {
    if (all.size === 0) storage()?.removeItem(KEY);
    else storage()?.setItem(KEY, JSON.stringify(Object.fromEntries(all)));
  } catch {
    // kept in memory only, until the page goes
  }
}

/** The board kept for `level`, if there is one and it was kept for the level
 * as it is now. Its tiles are still to be checked as they are laid
 * (`Puzzle.resume`). */
export function loadBoard(level: Level): SavedBoard | null {
  const raw = readAll().get(level.key);
  if (!raw || typeof raw !== "object") return null;
  const { fp, tiles, ms, hints, at } = raw as Record<string, unknown>;
  if (fp !== fingerprint(level) || !Array.isArray(tiles)) return null;
  const size = level.ring.zero.length;
  const read = tiles.map((t) => readTile(t, size));
  if (read.some((t) => t === null)) return null;
  return {
    fp,
    tiles: read as SavedTile[],
    ms: typeof ms === "number" && ms >= 0 && Number.isFinite(ms) ? ms : 0,
    hints: isInt(hints) && hints >= 0 ? hints : 0,
    at: typeof at === "number" ? at : 0,
  };
}

/** Keep `level`'s board as it stands — or, with nothing down and no hint
 * shown, forget it. */
export function saveBoard(
  level: Level,
  layout: readonly LaidTile[],
  ms: number,
  hints: number,
): void {
  if (layout.length === 0 && hints === 0) {
    forgetBoard(level.key);
    return;
  }
  const all = readAll();
  all.delete(level.key);
  const board: SavedBoard = {
    fp: fingerprint(level),
    tiles: layout.map(({ kind, rot, flip, pieces }) => ({
      kind,
      rot,
      flip,
      verts: pieces.map((p) => p.verts),
    })),
    ms: Math.round(ms),
    hints,
    at: Date.now(),
  };
  all.set(level.key, board);
  // past the limit, the board left longest ago goes
  const age = (v: unknown): number =>
    v && typeof v === "object" && typeof (v as { at?: unknown }).at === "number"
      ? (v as { at: number }).at
      : 0;
  while (all.size > MAX_SAVED) {
    let oldest: string | null = null;
    for (const [k, v] of all) if (oldest === null || age(v) < age(all.get(oldest))) oldest = k;
    all.delete(oldest!);
  }
  writeAll(all);
}

/** Forget the board kept for a level: it was restarted or finished. */
export function forgetBoard(levelKey: string): void {
  const all = readAll();
  if (all.delete(levelKey)) writeAll(all);
}

/** How many boards are kept: a player with any is no newcomer (the tutorial
 * opens by itself only for one with none). */
export function keptCount(): number {
  return readAll().size;
}

/** The keys of every level with a board kept — each one in progress, its
 * cards washed green — read once for a whole page of cards. */
export function keptKeys(): Set<string> {
  return new Set(readAll().keys());
}

/** Whether a board is kept for the level with this key — Play reads Resume. */
export function hasBoard(levelKey: string): boolean {
  return readAll().has(levelKey);
}
