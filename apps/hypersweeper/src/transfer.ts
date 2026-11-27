import {
  ACHIEVEMENTS_BY_ID,
  earned,
  loadRecord,
  parseStored,
  replaceRecord,
  seedFromBoards,
  type Progress,
  type Stored,
} from "./achievements";
import { mergeStars, parseStars, replaceStars, storedStars, type Stars } from "./favourites";
import {
  mergeBoards,
  parseEntries,
  replaceBoards,
  storedBoards,
  type ScoreEntry,
} from "./leaderboard";
import {
  hasStoredSettings,
  loadSettings,
  saveSettings,
  settingsFromRecord,
  SCHEMA_VERSION as SETTINGS_VERSION,
  type Settings,
} from "./settings";

// Taking the record to another browser: a transfer link.
//
// Everything a player has earned lives in this browser's `localStorage` — the
// best times, the achievement record, the starred boards and the settings —
// and storage belongs to one origin. Another browser, another device, the
// home-screen copy of the game on an iPhone (which keeps storage of its own,
// apart from Safari's), or the same game served from a new address all start
// from nothing. A transfer link carries the record across:
//
//   <the game's address>#transfer=<token>
//
// Opening it imports the record before the app reads storage (`main.ts`), then
// says what came across. It rides in the fragment, which a browser never sends
// to the server, so the record is in no request and no log.
//
// **The payload is the stored records themselves**, under the names below, in
// exactly the shape each module writes to its key:
//
//   { v: 1, scores: <ms:scores>, achievements: <ms:achievements>,
//     favourites: <ms:favourites>, settings: <ms:settings> }
//
// so anything that can read the keys can write a link — including a plain
// script on an address the game has moved away from, with none of this code —
// and every part is validated here by the same parser that reads the key.
// A part may be missing; it is then simply not transferred.
//
// **Importing merges; it never overwrites.** The receiving browser may have a
// record of its own, and the same link may be opened twice, so every rule is
// idempotent: the fastest three times of both (`mergeBoards`, as iCloud does),
// the larger of each win count, the union of the shapes, the earliest date for
// each unlock, the later change to each star. Win counts take the larger
// rather than the sum — under-counting a player who won on both browsers is
// the price of a link that cannot double their record by being opened twice.
// Settings are the exception: adopted whole, and only where this browser has
// never saved any.
//
// **The token** is `z` and the payload deflated, or `j` and the payload as it
// is, base64url either way. `z` is what this app writes wherever the browser
// can compress (a record compresses about fivefold, which matters in a link a
// player pastes); `j` is for a writer that cannot.
//
// Not in the App Store builds: they keep the record in step through iCloud
// (`cloudRecord.ts`), which counts every device's wins separately and would
// count an imported total a second time. They can still *write* a link.

export const TRANSFER_VERSION = 1;

/** The fragment parameter a link carries its token in. */
export const TRANSFER_PARAM = "transfer";

/** A token longer than this is refused unread, and so is one that inflates
 * past `MAX_JSON`: a full record (every board at every difficulty) is tens of
 * kilobytes, so these only ever stop a link that is not one. */
const MAX_TOKEN = 1_000_000;
const MAX_JSON = 4_000_000;

/** The parts of a record a link carries, validated. */
export interface TransferRecord {
  boards: Record<string, ScoreEntry[]>;
  /** `null` when the link carried no achievement record (one is seeded from
   * its times on import, as a browser seeds its own). */
  record: Stored | null;
  stars: Stars;
  /** `null` when the link carried none. */
  settings: Settings | null;
}

/** This browser's side of an import. */
export interface LocalRecord {
  boards: Record<string, unknown>;
  record: Stored;
  stars: Stars;
  hasSettings: boolean;
}

/** What an import changed, for the window that reports it. */
export interface TransferSummary {
  /** Boards (at a difficulty) whose best times changed. */
  times: number;
  /** Achievements newly unlocked. */
  achievements: number;
  /** Boards newly starred. */
  stars: number;
  /** Whether the settings were adopted. */
  settings: boolean;
}

export interface TransferMerge {
  boards: Record<string, ScoreEntry[]>;
  record: Stored;
  stars: Stars;
  /** The settings to save, or `null` to leave them. */
  settings: Settings | null;
  changed: { boards: boolean; record: boolean; stars: boolean };
  summary: TransferSummary;
}

// -- the payload (pure) ------------------------------------------------------

function asObject(raw: unknown): Record<string, unknown> | null {
  return typeof raw === "object" && raw !== null && !Array.isArray(raw)
    ? (raw as Record<string, unknown>)
    : null;
}

/** The stored records as a link's payload. */
export function packRecord(parts: {
  scores: Record<string, unknown> | null;
  achievements: Record<string, unknown> | null;
  favourites: Record<string, unknown> | null;
  settings: Record<string, unknown> | null;
}): Record<string, unknown> {
  const payload: Record<string, unknown> = { v: TRANSFER_VERSION };
  for (const [name, rec] of Object.entries(parts)) if (rec) payload[name] = rec;
  return payload;
}

/** A payload, validated part by part — or `null` when it is not one this
 * build reads (not an object, or another version). A part that is unreadable
 * costs that part alone. */
export function parseTransfer(raw: unknown): TransferRecord | null {
  const payload = asObject(raw);
  if (!payload || payload["v"] !== TRANSFER_VERSION) return null;
  const boardsRaw = asObject(asObject(payload["scores"])?.["boards"]) ?? {};
  const boards: Record<string, ScoreEntry[]> = {};
  for (const [key, list] of Object.entries(boardsRaw)) {
    const entries = parseEntries(list);
    if (entries.length > 0) boards[key] = entries;
  }
  const achievements = asObject(payload["achievements"]);
  const settings = asObject(payload["settings"]);
  return {
    boards,
    record: achievements ? parseStored(achievements) : null,
    stars: parseStars(asObject(payload["favourites"])?.["modes"]),
    settings: settings ? settingsFromRecord(settings) : null,
  };
}

/** JSON with object keys sorted, so "has this changed" is a string compare. */
function stable(value: unknown): string {
  return JSON.stringify(value, (_key, v: unknown) => {
    if (typeof v !== "object" || v === null || Array.isArray(v)) return v;
    const sorted: Record<string, unknown> = {};
    for (const k of Object.keys(v).sort()) sorted[k] = (v as Record<string, unknown>)[k];
    return sorted;
  });
}

/** Both records' progress, each count the larger of the two — idempotent, so
 * a link opened twice does not double it. */
export function maxProgress(a: Progress, b: Progress): Progress {
  const wins: Record<string, Record<string, number>> = {};
  for (const side of [a.wins, b.wins]) {
    for (const [mode, byDifficulty] of Object.entries(side)) {
      const into = (wins[mode] ??= {});
      for (const [difficulty, n] of Object.entries(byDifficulty)) {
        into[difficulty] = Math.max(into[difficulty] ?? 0, n);
      }
    }
  }
  return {
    wins,
    flagless: Math.max(a.flagless, b.flagless),
    shapes: [...new Set([...a.shapes, ...b.shapes])].sort((x, y) => x - y),
  };
}

/** Unlock dates from both: the earliest known for each, a 0 ("not known")
 * giving way to a real date. */
function earliest(a: Record<string, number>, b: Record<string, number>): Record<string, number> {
  const out = { ...a };
  for (const [id, at] of Object.entries(b)) {
    const have = out[id];
    if (have === undefined || have === 0 || (at > 0 && at < have)) out[id] = at;
  }
  return out;
}

function unlockedCount(unlocked: Record<string, number>): number {
  return Object.keys(unlocked).filter((id) => ACHIEVEMENTS_BY_ID.has(id)).length;
}

/** This browser's record and a link's, merged. Pure. */
export function mergeTransfer(
  local: LocalRecord,
  incoming: TransferRecord,
  now: number = Date.now(),
): TransferMerge {
  const before = mergeBoards([local.boards]);
  const boards = mergeBoards([local.boards, incoming.boards]);
  let times = 0;
  for (const [key, entries] of Object.entries(boards)) {
    if (stable(entries) !== stable(before[key] ?? [])) times++;
  }

  const theirs = incoming.record ?? {
    progress: seedFromBoards(Object.entries(incoming.boards)),
    unlocked: {},
  };
  const progress = maxProgress(local.record.progress, theirs.progress);
  const unlocked = earliest(local.record.unlocked, theirs.unlocked);
  // What the merged progress earns that neither side had marked: dated now,
  // as a browser dates what its own record already earns (`loadStored`).
  const at = Number.isFinite(now) && now > 0 ? Math.floor(now) : 0;
  for (const id of earned(progress)) if (unlocked[id] === undefined) unlocked[id] = at;
  const record: Stored = { progress, unlocked };

  const stars = mergeStars(local.stars, incoming.stars);
  const starred = (s: Stars) => Object.values(s).filter((x) => x.on).length;

  const settings = local.hasSettings ? null : incoming.settings;
  return {
    boards,
    record,
    stars,
    settings,
    changed: {
      boards: stable(boards) !== stable(before),
      record: stable(record) !== stable(local.record),
      stars: stable(stars) !== stable(local.stars),
    },
    summary: {
      times,
      achievements: Math.max(0, unlockedCount(unlocked) - unlockedCount(local.record.unlocked)),
      stars: Math.max(0, starred(stars) - starred(local.stars)),
      settings: settings !== null,
    },
  };
}

// -- the token (pure, but for the browser's compression streams) --------------

function toBase64Url(bytes: Uint8Array): string {
  let binary = "";
  // In slices: `String.fromCharCode(...bytes)` on a large array overflows the
  // argument limit.
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64Url(text: string): Uint8Array | null {
  if (!/^[A-Za-z0-9_-]*$/.test(text)) return null;
  try {
    const binary = atob(text.replace(/-/g, "+").replace(/_/g, "/"));
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return bytes;
  } catch {
    return null;
  }
}

/** All of a stream, or `null` past `limit` bytes. */
async function readAll(
  stream: ReadableStream<Uint8Array>,
  limit: number,
): Promise<Uint8Array | null> {
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.length;
    if (size > limit) {
      await reader.cancel();
      return null;
    }
    chunks.push(value);
  }
  const out = new Uint8Array(size);
  let at = 0;
  for (const chunk of chunks) {
    out.set(chunk, at);
    at += chunk.length;
  }
  return out;
}

function through(bytes: Uint8Array, transform: GenericTransformStream): ReadableStream<Uint8Array> {
  return new Blob([bytes as BlobPart])
    .stream()
    .pipeThrough(transform) as ReadableStream<Uint8Array>;
}

/** A payload as a token: deflated where the browser can, as it is otherwise. */
export async function encodeTransfer(payload: Record<string, unknown>): Promise<string> {
  const json = new TextEncoder().encode(JSON.stringify(payload));
  if (typeof CompressionStream === "function") {
    try {
      const packed = await readAll(
        through(json, new CompressionStream("deflate-raw")),
        Number.POSITIVE_INFINITY,
      );
      if (packed) return `z${toBase64Url(packed)}`;
    } catch {
      /* fall through to the uncompressed form */
    }
  }
  return `j${toBase64Url(json)}`;
}

/** A token's payload, or `null` when it is not a readable one. Never throws. */
export async function decodeTransfer(token: string): Promise<unknown> {
  if (token.length < 2 || token.length > MAX_TOKEN) return null;
  const bytes = fromBase64Url(token.slice(1));
  if (!bytes) return null;
  let json: Uint8Array | null;
  try {
    if (token[0] === "j") {
      json = bytes.length <= MAX_JSON ? bytes : null;
    } else if (token[0] === "z" && typeof DecompressionStream === "function") {
      json = await readAll(through(bytes, new DecompressionStream("deflate-raw")), MAX_JSON);
    } else {
      return null;
    }
  } catch {
    return null; // not deflate data
  }
  if (!json) return null;
  try {
    return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(json)) as unknown;
  } catch {
    return null;
  }
}

/** The token in a URL, a fragment, or a whole pasted message — whatever was
 * around it (the share sheet's text, a chat client's line breaks). `null` when
 * there is none. */
export function findToken(text: string): string | null {
  const match = new RegExp(`(?:^|[#&?])${TRANSFER_PARAM}=([jz][A-Za-z0-9_-]+)`).exec(
    text.replace(/\s+/g, ""),
  );
  return match?.[1] ?? null;
}

/** The address a token opens: this page, the transfer in its fragment. */
export function transferUrlFor(base: { origin: string; pathname: string }, token: string): string {
  return `${base.origin}${base.pathname}#${TRANSFER_PARAM}=${token}`;
}

// -- this browser ------------------------------------------------------------

/** This browser's record as a link's payload. */
export function currentRecord(): Record<string, unknown> {
  const record = loadRecord();
  const boards = storedBoards();
  const stars = storedStars();
  return packRecord({
    scores: Object.keys(boards).length > 0 ? { version: 1, boards } : null,
    achievements: { version: 1, ...record.progress, unlocked: record.unlocked },
    favourites: Object.keys(stars).length > 0 ? { version: 1, modes: stars } : null,
    // Versioned, or the reading side would migrate it as a first-version record.
    settings: hasStoredSettings() ? { ...loadSettings(), version: SETTINGS_VERSION } : null,
  });
}

/** Merge a link's record into this browser's, and say what changed. */
export function importRecord(incoming: TransferRecord, now: number = Date.now()): TransferSummary {
  // The achievement record first: reading it seeds it from *this* browser's
  // times when there is none, and that must happen before the link's arrive.
  const local: LocalRecord = {
    record: loadRecord(),
    boards: storedBoards(),
    stars: storedStars(),
    hasSettings: hasStoredSettings(),
  };
  const merged = mergeTransfer(local, incoming, now);
  // Written whenever the times are, as the iCloud sync does: a missing record
  // would re-seed from the merged times on the next read.
  if (merged.changed.record || merged.changed.boards) replaceRecord(merged.record);
  if (merged.changed.boards) replaceBoards(merged.boards);
  if (merged.changed.stars) replaceStars(merged.stars);
  if (merged.settings) saveSettings(merged.settings);
  return merged.summary;
}

/** An empty record, for a summary of a link that brought nothing new. */
export function nothingTransferred(): TransferSummary {
  return { times: 0, achievements: 0, stars: 0, settings: false };
}

/** What `takeTransferLink` found in the address. */
export type TransferOutcome =
  | { state: "imported"; summary: TransferSummary }
  | { state: "unreadable" }
  | { state: "unsupported" };

/** Import the record a link carries in this page's address, if it carries
 * one, and take it out of the address either way — so a reload, a bookmark or
 * the board link the app writes next carries no copy of it. `null` when the
 * address has none. Runs before the app reads storage (`main.ts`). */
export async function takeTransferLink(supported: boolean): Promise<TransferOutcome | null> {
  const token = findToken(window.location.hash);
  if (token === null) return null;
  try {
    window.history.replaceState(null, "", `${window.location.pathname}${window.location.search}`);
  } catch {
    /* a sandboxed frame may refuse; the import still runs */
  }
  if (!supported) return { state: "unsupported" };
  const incoming = parseTransfer(await decodeTransfer(token));
  if (!incoming) return { state: "unreadable" };
  return { state: "imported", summary: importRecord(incoming) };
}
