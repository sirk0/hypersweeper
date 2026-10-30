import { Capacitor, registerPlugin, type PluginListenerHandle } from "@capacitor/core";
import {
  emptyProgress,
  loadRecord,
  parseStored,
  replaceRecord,
  type Progress,
  type Stored,
} from "./achievements";
import { mergeStars, parseStars, replaceStars, storedStars, type Stars } from "./favourites";
import { catchUpGameCenter } from "./gameCenter";
import { TOP_N, parseEntries, replaceBoards, storedBoards, type ScoreEntry } from "./leaderboard";
import { readObject, storage } from "./storage";

// iCloud, where the App Store builds keep the record in step.
//
// The same app runs on an iPhone, an iPad and a Mac, and the best times and
// the achievement record live in each one's `localStorage` — one device's, and
// gone with the app when it is deleted. In the App Store builds the native
// `CloudRecord` plugin (ios/App/App/CloudRecordPlugin.swift) hands the page
// iCloud's key-value store, the same few keys on every device signed in to the
// player's account and kept through a reinstall, and this mirrors the record
// (and the starred boards, `favourites.ts`) there and merges back what the
// other devices wrote. Everywhere else — the
// website, the PWA, Android, the Electron Mac app, the App Clip — the plugin is
// not there and nothing here runs.
//
// **The local record stays the game's.** `leaderboard.ts` and
// `achievements.ts` read and write `localStorage` exactly as before; a sync
// merges iCloud into them and them into iCloud, at launch, after a win, and
// whenever iCloud says another device wrote. So a win while offline, or while
// signed out of iCloud, is simply merged next time.
//
// **Four kinds of key**, because the records merge differently:
//
// - `scores`: every device's best times, one key. A union is idempotent — the
//   fastest three of everyone's times are the same however often the same time
//   is merged — so each device writes the whole merged list, and when two
//   writes cross (iCloud keeps the later), the other device hears of it, merges
//   again and writes back what was lost.
// - `wins.<device>`: one per device, holding that device's own wins. Win
//   counts are not idempotent: merging two copies of "won the cube 3 times"
//   must not make 6. So each device counts what *it* added since it last
//   merged (the local record minus `base`, the total it last wrote) into its
//   own key, no other device ever writes that key, and the record is the sum
//   of all of them. A reinstall is a new device: the old key stays and keeps
//   counting, which is exactly right — those wins happened.
// - `favourites`: every board's star and when it last changed, one key. For
//   each board the later change wins — idempotent like `scores`, so it is
//   written whole the same way — and an unstar is a change like any other, so
//   it reaches the other devices instead of being merged back.
// - `reset`: when each record was last cleared. Clearing is the one change a
//   merge cannot express — every other device still holds what was cleared and
//   would merge it straight back — so a clear is a date instead: times set
//   before it, and device keys counting from before it, are left out of every
//   merge from then on, on every device.
//
// iCloud gives the app 1 MB and 1024 keys. A device key is a few kilobytes and
// the shared list at most ~60 KB with every board played, so neither is close.

interface CloudRecordPlugin {
  read(): Promise<{ values: Record<string, string> }>;
  write(options: { values: Record<string, string | null> }): Promise<void>;
  addListener(
    event: "change",
    listener: (change: { keys: string[] }) => void,
  ): Promise<PluginListenerHandle>;
}

const Native = registerPlugin<CloudRecordPlugin>("CloudRecord");

/** iCloud's keys. */
const SCORES = "scores";
const FAVOURITES = "favourites";
const RESET = "reset";
const WINS = "wins.";

/** This device's side of the sync, in `localStorage`. */
const STATE_KEY = "ms:cloud";

/** When each record was last cleared, on any device (epoch ms; 0 never). */
export interface Resets {
  scores: number;
  achievements: number;
}

/** What this device remembers between syncs. */
export interface SyncState {
  /** Names this device's `wins.<device>` key. New on every install. */
  device: string;
  /** The achievements reset `own` counts from. */
  since: number;
  /** This device's own wins since `since` — what its key holds. */
  own: Stored;
  /** The merged total last written to the local record. The local record
   * minus this is what the device has won since. */
  base: Progress;
  /** The newest clears this device knows of. */
  reset: Resets;
}

export interface MergeInput {
  /** The local best times (`storedBoards()`). */
  boards: Record<string, unknown>;
  /** The local achievement record (`loadRecord()`). */
  record: Stored;
  /** The local stars (`storedStars()`); none when left out. */
  stars?: Stars;
  state: SyncState;
  /** Every string iCloud holds. */
  cloud: Record<string, string>;
}

export interface MergeResult {
  boards: Record<string, ScoreEntry[]>;
  record: Stored;
  stars: Stars;
  state: SyncState;
  /** The iCloud keys to write. */
  writes: Record<string, string>;
  /** Whether the local best times, or the local achievement record, differ
   * from what was read — and so need writing back. */
  boardsChanged: boolean;
  recordChanged: boolean;
  /** Whether the local stars differ from the merge. */
  starsChanged: boolean;
}

// -- the merge (pure) --------------------------------------------------------

/** JSON with object keys sorted, so the same record always prints the same and
 * "has this changed" is a string comparison. */
function stable(value: unknown): string {
  return JSON.stringify(value, (_key, v: unknown) => {
    if (typeof v !== "object" || v === null || Array.isArray(v)) return v;
    const sorted: Record<string, unknown> = {};
    for (const k of Object.keys(v).sort()) sorted[k] = (v as Record<string, unknown>)[k];
    return sorted;
  });
}

function parseJson(raw: string | undefined): Record<string, unknown> | null {
  if (raw === undefined) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) return null;
    return parsed as Record<string, unknown>;
  } catch {
    return null;
  }
}

function time(raw: unknown): number {
  return typeof raw === "number" && Number.isFinite(raw) && raw > 0 ? Math.floor(raw) : 0;
}

function parseResets(raw: unknown): Resets {
  const rec = typeof raw === "string" ? parseJson(raw) : (raw as Record<string, unknown> | null);
  return { scores: time(rec?.["scores"]), achievements: time(rec?.["achievements"]) };
}

function asObject(raw: unknown): Record<string, unknown> {
  return typeof raw === "object" && raw !== null && !Array.isArray(raw)
    ? (raw as Record<string, unknown>)
    : {};
}

/** Two progress records together. */
export function addProgress(a: Progress, b: Progress): Progress {
  const wins: Record<string, Record<string, number>> = {};
  for (const side of [a.wins, b.wins]) {
    for (const [mode, byDifficulty] of Object.entries(side)) {
      const into = (wins[mode] ??= {});
      for (const [difficulty, n] of Object.entries(byDifficulty)) {
        into[difficulty] = (into[difficulty] ?? 0) + n;
      }
    }
  }
  return {
    wins,
    flagless: a.flagless + b.flagless,
    shapes: [...new Set([...a.shapes, ...b.shapes])].sort((x, y) => x - y),
  };
}

/** What `a` has that `b` does not: the wins counted since `b` was written.
 * Never negative — a count that went *down* locally (storage refused a write)
 * is not a loss to pass on. */
export function progressSince(a: Progress, b: Progress): Progress {
  const wins: Record<string, Record<string, number>> = {};
  for (const [mode, byDifficulty] of Object.entries(a.wins)) {
    for (const [difficulty, n] of Object.entries(byDifficulty)) {
      const more = n - (b.wins[mode]?.[difficulty] ?? 0);
      if (more > 0) (wins[mode] ??= {})[difficulty] = more;
    }
  }
  const had = new Set(b.shapes);
  return {
    wins,
    flagless: Math.max(0, a.flagless - b.flagless),
    shapes: a.shapes.filter((s) => !had.has(s)),
  };
}

/** Unlock dates from both: the earliest known for each. A date of 0 is "not
 * known" (see `loadStored`) and gives way to a real one. */
function earliest(a: Record<string, number>, b: Record<string, number>): Record<string, number> {
  const out = { ...a };
  for (const [id, at] of Object.entries(b)) {
    const have = out[id];
    if (have === undefined || have === 0 || (at > 0 && at < have)) out[id] = at;
  }
  return out;
}

function storedJson(rec: Stored, since: number): string {
  return stable({ v: 1, since, ...rec.progress, unlocked: rec.unlocked });
}

/** Every source's times for each board, cleared ones left out: the fastest
 * `TOP_N`, each time once. */
function mergeBoards(
  sources: Record<string, unknown>[],
  reset: number,
): Record<string, ScoreEntry[]> {
  const keys = new Set(sources.flatMap((s) => Object.keys(s)));
  const out: Record<string, ScoreEntry[]> = {};
  for (const key of [...keys].sort()) {
    const seen = new Set<string>();
    const all: ScoreEntry[] = [];
    for (const source of sources) {
      for (const entry of parseEntries(source[key])) {
        if (reset > 0 && entry.at <= reset) continue;
        const id = `${entry.ms}@${entry.at}`;
        if (seen.has(id)) continue;
        seen.add(id);
        all.push(entry);
      }
    }
    const entries = parseEntries(all).slice(0, TOP_N);
    if (entries.length > 0) out[key] = entries;
  }
  return out;
}

/** One sync: the local record and iCloud's, merged. Pure, so the unit tests
 * can play several devices against one store. */
export function mergeRecords({
  boards,
  record,
  stars = {},
  state,
  cloud,
}: MergeInput): MergeResult {
  const writes: Record<string, string> = {};
  const known = parseResets(cloud[RESET]);
  const reset: Resets = {
    scores: Math.max(state.reset.scores, known.scores),
    achievements: Math.max(state.reset.achievements, known.achievements),
  };
  if (reset.scores !== known.scores || reset.achievements !== known.achievements) {
    writes[RESET] = stable(reset);
  }

  // -- achievements: a sum of every device's own wins.
  let mine = record;
  let base = state.base;
  let own = state.own;
  let since = state.since;
  let recordChanged = false;
  if (since < reset.achievements) {
    // Cleared on another device since this one last counted: so is this one.
    mine = { progress: emptyProgress(), unlocked: {} };
    base = emptyProgress();
    own = { progress: emptyProgress(), unlocked: {} };
    since = reset.achievements;
    recordChanged = true;
  }
  own = {
    progress: addProgress(own.progress, progressSince(mine.progress, base)),
    unlocked: earliest(own.unlocked, mine.unlocked),
  };
  let total = own.progress;
  let unlocked = own.unlocked;
  const ownKey = WINS + state.device;
  for (const [key, raw] of Object.entries(cloud)) {
    if (!key.startsWith(WINS) || key === ownKey) continue;
    const rec = parseJson(raw);
    if (!rec || time(rec["since"]) < reset.achievements) continue;
    const other = parseStored(rec);
    total = addProgress(total, other.progress);
    unlocked = earliest(unlocked, other.unlocked);
  }
  const merged: Stored = { progress: total, unlocked };
  if (stable(merged) !== stable(mine)) recordChanged = true;
  const ownJson = storedJson(own, since);
  const ownEmpty = stable(own) === stable({ progress: emptyProgress(), unlocked: {} });
  if (cloud[ownKey] !== ownJson && !(ownEmpty && cloud[ownKey] === undefined)) {
    writes[ownKey] = ownJson;
  }

  // -- best times: the fastest three of everyone's.
  const shared = asObject(parseJson(cloud[SCORES])?.["boards"]);
  const mergedBoards = mergeBoards([boards, shared], reset.scores);
  const boardsChanged = stable(mergedBoards) !== stable(mergeBoards([boards], 0));
  // Never an empty list over a full one: an empty merge has nothing to add.
  if (
    Object.keys(mergedBoards).length > 0 &&
    stable(mergedBoards) !== stable(mergeBoards([shared], 0))
  ) {
    writes[SCORES] = stable({ v: 1, boards: mergedBoards });
  }

  // -- favourites: the later change to each board's star.
  const sharedStars = parseStars(parseJson(cloud[FAVOURITES])?.["modes"]);
  const mergedStars = mergeStars(stars, sharedStars);
  const starsChanged = stable(mergedStars) !== stable(stars);
  if (Object.keys(mergedStars).length > 0 && stable(mergedStars) !== stable(sharedStars)) {
    writes[FAVOURITES] = stable({ v: 1, modes: mergedStars });
  }

  return {
    boards: mergedBoards,
    record: merged,
    stars: mergedStars,
    state: { device: state.device, since, own, base: total, reset },
    writes,
    boardsChanged,
    recordChanged,
    starsChanged,
  };
}

// -- this device's state -----------------------------------------------------

function newDevice(): string {
  const bytes = new Uint8Array(8);
  crypto.getRandomValues(bytes);
  return [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** A first sync's state: nothing counted yet, so the whole local record is this
 * device's own, and it counts from the newest clear iCloud knows of. */
export function freshState(device: string, cloud: Record<string, string>): SyncState {
  const reset = parseResets(cloud[RESET]);
  return {
    device,
    since: reset.achievements,
    own: { progress: emptyProgress(), unlocked: {} },
    base: emptyProgress(),
    reset,
  };
}

function loadState(cloud: Record<string, string>): SyncState {
  const rec = readObject(STATE_KEY);
  const device = rec?.["device"];
  if (!rec || typeof device !== "string" || !/^[0-9a-f]{1,32}$/.test(device)) {
    return freshState(newDevice(), cloud);
  }
  return {
    device,
    since: time(rec["since"]),
    own: parseStored(asObject(rec["own"])),
    base: parseStored(asObject(rec["base"])).progress,
    reset: parseResets(rec["reset"]),
  };
}

function saveState(state: SyncState): void {
  try {
    storage()?.setItem(
      STATE_KEY,
      JSON.stringify({
        device: state.device,
        since: state.since,
        own: { ...state.own.progress, unlocked: state.own.unlocked },
        base: state.base,
        reset: state.reset,
      }),
    );
  } catch {
    /* quota exceeded, or storage disabled mid-session */
  }
}

// -- the sync ----------------------------------------------------------------

/** Whether this shell keeps the record in iCloud. */
export function cloudRecordSupported(): boolean {
  try {
    return Capacitor.isNativePlatform() && Capacitor.isPluginAvailable("CloudRecord");
  } catch {
    return false;
  }
}

/** Clears waiting to reach the next sync. */
const pendingClears: Partial<Resets> = {};

async function runSync(): Promise<void> {
  if (!storage()) return; // nothing local to sync
  const { values } = await Native.read();
  const cloud = values ?? {};
  // Achievements first: reading the record seeds it from the best times when
  // there is none, and that must be *this* device's times, not the ones the
  // merge is about to bring in from the others.
  const record = loadRecord();
  let state = loadState(cloud);
  for (const kind of ["scores", "achievements"] as const) {
    const at = pendingClears[kind];
    if (at === undefined) continue;
    delete pendingClears[kind];
    state.reset[kind] = Math.max(state.reset[kind], at);
    if (kind === "achievements") {
      // What this device counted before the clear is gone with it.
      state = {
        ...state,
        since: state.reset.achievements,
        own: { progress: emptyProgress(), unlocked: {} },
        base: emptyProgress(),
      };
    }
  }
  const result = mergeRecords({
    boards: storedBoards(),
    record,
    stars: storedStars(),
    state,
    cloud,
  });
  // Whenever the best times change, the achievement record is written too, so
  // there is always one — a missing record would re-seed from the merged
  // times and count the other devices' wins as this one's.
  if (result.recordChanged || result.boardsChanged) replaceRecord(result.record);
  if (result.boardsChanged) replaceBoards(result.boards);
  if (result.starsChanged) replaceStars(result.stars);
  saveState(result.state);
  if (Object.keys(result.writes).length > 0) await Native.write({ values: result.writes });
  if (result.recordChanged) catchUpGameCenter();
}

let queue: Promise<void> = Promise.resolve();
let started = false;

/** Merge the local record with iCloud's. Syncs run one at a time, in order;
 * each is fire-and-forget, and one that fails changes nothing. */
export function syncCloudRecord(): void {
  if (!started) return;
  queue = queue.then(runSync).catch(() => {});
}

/** Sync now, whenever iCloud brings another device's change, and whenever the
 * app comes back to the foreground. Called once, at launch; a no-op outside
 * the app.
 *
 * The foreground sync is for being offline. A sync made offline runs against
 * the device's cached copy of iCloud and is pushed when the network returns,
 * and a fresh install's writes are dropped until its first download arrives.
 * Either way, a sync after that redoes whatever did not land — every write is
 * worked out by comparing with what iCloud holds, never remembered as done.
 * iCloud's change event is not certain to come (a download that changed
 * nothing sends none), so coming back to the app is the other moment to look. */
export function startCloudRecord(): void {
  if (started || !cloudRecordSupported()) return;
  started = true;
  void Native.addListener("change", () => syncCloudRecord()).catch(() => {});
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") syncCloudRecord();
  });
  syncCloudRecord();
}

/** The player cleared one of the records here: clear it everywhere. The local
 * record is already gone (`clearBestTimes`, `clearAchievements`); this tells
 * iCloud when, so no device merges the old one back. */
export function clearCloudRecord(kind: keyof Resets, now: number = Date.now()): void {
  if (!started) return;
  pendingClears[kind] = Math.max(pendingClears[kind] ?? 0, now);
  syncCloudRecord();
}
