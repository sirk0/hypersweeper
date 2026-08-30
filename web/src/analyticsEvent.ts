// The wire format between the app and the collector, and the one place either
// side decides what a valid event is. Both halves import this module — the
// browser shapes an event with `payloadFor` (src/analytics.ts), the Cloudflare
// Pages Function validates one with `parseEvent` (functions/api/tally.ts) — so
// the two cannot drift apart, and a board added to the catalog is understood by
// the collector the moment it is deployed.
//
// It also owns the *dataset* schema: `DATASET_BLOBS` and `DATASET_DOUBLES` are
// the collector's column layout as data rather than as a comment, so a column's
// position and its meaning are one thing. See docs/agents/metrics.md, whose
// table `tests/unit/analyticsSchema.test.ts` checks against these arrays.
//
// Pure by construction: no globals, no storage, no network, no DOM. That is
// what lets the node unit tests pin the whole contract (the round-trip test in
// tests/unit/analytics.test.ts is the contract), and what lets the same file
// compile for a Worker, which has no DOM at all.
//
// Relative imports rather than the `@data` alias every other module uses: this
// file is bundled twice, once by Vite (which knows the alias) and once by
// wrangler's esbuild (which does not).
import catalogData from "../../data/catalog.json";
import presetsData from "../../data/presets.json";

/** Every board this build knows, as a set. A `Set` rather than `Object.hasOwn`
 * on the preset record, and emphatically not `in`: mode names arrive over the
 * network here, and `link.ts` already carries the scar of a lookup that walked
 * the prototype chain — `constructor`, `toString` and `__proto__` are not
 * boards, and a set built from `Object.keys` cannot think they are. */
const MODES: ReadonlySet<string> = new Set(Object.keys(presetsData.presets));

const DIFFICULTIES: ReadonlySet<string> = new Set(catalogData.difficulties);

/** What the collector says a board *is*: the full name it goes by, and the
 * three taxonomy keys worth grouping by. */
export interface BoardInfo {
  label: string;
  tiling: string;
  surface: string;
  family: string;
}

/** mode -> its name and taxonomy, generated into `data/catalog.json` by
 * `scripts/export_data.py`. A `Map`, for the same reason `MODES` is a `Set`.
 * The cast keeps tsc from inferring a 179-key literal type for a table nothing
 * reads structurally. */
const BOARDS: ReadonlyMap<string, BoardInfo> = new Map(
  Object.entries(catalogData.modeInfo as Record<string, BoardInfo>),
);

/** The board behind a mode, or `null`. Only ever called with a mode that has
 * already passed `MODES`, so a miss means the two generated files disagree. */
export function boardInfo(mode: string): BoardInfo | null {
  return BOARDS.get(mode) ?? null;
}

/** Longest a clock is believed, in seconds. Ten hours is past any real game and
 * keeps a hand-posted number from dragging a mean around. */
export const MAX_SECONDS = 36_000;

/** Ceilings for the rest of the numbers, in the same spirit: past anything the
 * catalogue can produce, and low enough that a hand-posted row cannot move an
 * average. The largest shipped board is a few thousand cells. */
const MAX_CELLS = 100_000;
const MAX_MOVES = 100_000;
const MAX_FIRST_MOVE_MS = MAX_SECONDS * 1000;

/** Longest mode name accepted, well past the longest real one (19 characters)
 * and inside Analytics Engine's 96-byte index limit. */
const MAX_MODE_LENGTH = 48;

/** Longest version string accepted. `0.2.83` is six. */
const MAX_VERSION_LENGTH = 16;
const VERSION_SHAPE = /^\d+\.\d+\.\d+$/;

export type EventKind = "start" | "end";
export type Outcome = "won" | "lost";

/** How a board came to be opened. Crossed with `PreviousState` this is the
 * whole of "how the game started": a re-roll from the win card is
 * `random`/`won`, the smiley after stepping on a mine is `again`/`lost`. */
export type StartTrigger = "menu" | "random" | "again" | "link";

/** What the board *before* this one was doing when it was replaced. Empty when
 * there was no board before it — the first of a visit. */
export type PreviousState = "" | "playing" | "won" | "lost";

export type DeviceClass = "phone" | "tablet" | "desktop" | "unknown";

/** A browser tab, or a home-screen/installed launch. The macOS and iPhone apps
 * do not report at all, so there is no native value here. */
export type ShellKind = "browser" | "standalone";

const TRIGGERS: ReadonlySet<string> = new Set<StartTrigger>([
  "menu",
  "random",
  "again",
  "link",
]);
const PREVIOUS: ReadonlySet<string> = new Set<PreviousState>([
  "",
  "playing",
  "won",
  "lost",
]);
const DEVICES: ReadonlySet<string> = new Set<DeviceClass>([
  "phone",
  "tablet",
  "desktop",
  "unknown",
]);
const SHELLS: ReadonlySet<string> = new Set<ShellKind>(["browser", "standalone"]);

/** How far a game got. Only an `end` carries these. */
export interface GameStats {
  /** Safe cells opened. The mine a loss stepped on is *not* one of them — see
   * `Game.reveal`, which reveals it without counting it. */
  opened: number;
  /** Flags the player had on mines when the game ended. Counted before a win
   * auto-flags the rest, which is the only way this number means anything. */
  flagsRight: number;
  /** …and on safe cells. */
  flagsWrong: number;
  reveals: number;
  chords: number;
  flagMoves: number;
  /** Board open to first move, in ms. */
  firstMoveMs: number;
  /** Whether the view was ever rotated or zoomed. */
  viewMoved: boolean;
}

/** What a call site names: a board opened, or a board finished. */
export interface GameEvent {
  kind: EventKind;
  mode: string;
  difficulty: string;
  trigger: StartTrigger;
  from: PreviousState;
  device: DeviceClass;
  shell: ShellKind;
  version: string;
  cells: number;
  mines: number;
  /** How an `end` finished. Ignored on a `start`. */
  outcome?: Outcome;
  /** Milliseconds on the clock, rounded to whole seconds on the wire — the
   * leaderboard needs the precision to break ties, a mean never does. */
  ms?: number;
  /** Ignored on a `start`. */
  stats?: GameStats;
}

/** What a call site in the app names: the game's own facts. The client
 * context — device, shell, build version — is filled in by `analytics.ts`,
 * which is where the globals live; this file stays pure. */
export type GameFacts = Omit<GameEvent, "device" | "shell" | "version">;

/** The JSON that goes over the wire. Short keys because this is sent on every
 * game and read by nobody; `v` so a future shape can be told from this one
 * rather than guessed at. */
export interface EventPayload {
  v: 2;
  e: EventKind;
  m: string;
  d: string;
  t: StartTrigger;
  f: PreviousState;
  dv: DeviceClass;
  sh: ShellKind;
  vr: string;
  c: number;
  n: number;
  o?: Outcome;
  s?: number;
  op?: number;
  fr?: number;
  fw?: number;
  rv?: number;
  ch?: number;
  fl?: number;
  fm?: number;
  vm?: 0 | 1;
}

/** A validated event, as the collector sees it: every field resolved to a total
 * value, so the write site has no branches left. The board columns are derived
 * here from the (already validated) mode rather than sent, which is what keeps
 * the collector's promise that it can only ever store values from its own
 * vocabulary. */
export interface ParsedEvent {
  kind: EventKind;
  mode: string;
  difficulty: string;
  /** `null` on a start. */
  outcome: Outcome | null;
  /** 0 on a start. */
  seconds: number;
  board: string;
  tiling: string;
  surface: string;
  family: string;
  /** `""` on a v1 event, which predates the field. */
  trigger: StartTrigger | "";
  from: PreviousState;
  /** `""` on a v1 event — which is *not* `"unknown"`: one build could not tell,
   * the other never looked. */
  device: DeviceClass | "";
  shell: ShellKind | "";
  version: string;
  cells: number;
  mines: number;
  opened: number;
  flagsRight: number;
  flagsWrong: number;
  reveals: number;
  chords: number;
  flagMoves: number;
  firstMoveMs: number;
  /** 0 or 1 — a double, because Analytics Engine has no boolean. */
  viewMoved: number;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Whole seconds on the wire, clamped into a range worth believing. */
function seconds(ms: number): number {
  return Math.min(MAX_SECONDS, Math.max(0, Math.round(ms / 1000)));
}

/** A count as it goes on the wire: a whole number in `[0, max]`. Junk becomes
 * 0 rather than rejecting the event — losing a game's outcome over a bad move
 * counter would be the wrong trade. */
function count(value: unknown, max: number): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return 0;
  return Math.min(max, Math.max(0, Math.round(value)));
}

/** One of a closed set, or the empty string. */
function oneOf<T extends string>(
  value: unknown,
  allowed: ReadonlySet<string>,
): T | "" {
  return typeof value === "string" && allowed.has(value) ? (value as T) : "";
}

/** The wire form of a game event, or `null` when there is nothing worth
 * sending — an unknown board, an unknown difficulty, an end with no outcome.
 * Dropping it here rather than at the collector means a build that has drifted
 * from the catalog stays silent instead of filling the dataset with rows no
 * report can name. */
export function payloadFor(event: GameEvent): EventPayload | null {
  if (!MODES.has(event.mode) || !DIFFICULTIES.has(event.difficulty)) return null;
  const base: EventPayload = {
    v: 2,
    e: event.kind,
    m: event.mode,
    d: event.difficulty,
    t: event.trigger,
    f: event.from,
    dv: event.device,
    sh: event.shell,
    vr: VERSION_SHAPE.test(event.version) ? event.version : "",
    c: count(event.cells, MAX_CELLS),
    n: count(event.mines, MAX_CELLS),
  };
  if (event.kind === "start") return base;
  if (event.outcome !== "won" && event.outcome !== "lost") return null;
  if (typeof event.ms !== "number" || !Number.isFinite(event.ms)) return null;
  const stats = event.stats;
  // Conditional spread rather than `{ o: undefined }`: `exactOptionalPropertyTypes`
  // is on, and an explicitly-undefined key is not the same as an absent one
  // (JSON.stringify drops it, but the type says otherwise).
  return {
    ...base,
    o: event.outcome,
    s: seconds(event.ms),
    op: count(stats?.opened, MAX_CELLS),
    fr: count(stats?.flagsRight, MAX_CELLS),
    fw: count(stats?.flagsWrong, MAX_CELLS),
    rv: count(stats?.reveals, MAX_MOVES),
    ch: count(stats?.chords, MAX_MOVES),
    fl: count(stats?.flagMoves, MAX_MOVES),
    fm: count(stats?.firstMoveMs, MAX_FIRST_MOVE_MS),
    vm: stats?.viewMoved ? 1 : 0,
  };
}

/** The validated event in an unknown POST body, or `null`. Total: any junk —
 * a string, an array, a version this build does not speak, a board that does
 * not exist — answers `null` rather than throwing. Every field is checked on
 * its own and nothing unrecognised is carried through, so the collector can
 * only ever store values from this file's own vocabulary.
 *
 * **A `v: 1` body is still accepted, and must stay accepted.** The service
 * worker keeps older builds alive in players' caches for days after a deploy;
 * rejecting their posts would silently drop real games. A v1 event parses to
 * this same shape with the fields it predates left empty — and its board
 * columns still fill, because those are derived from the mode it does carry.
 */
export function parseEvent(body: unknown): ParsedEvent | null {
  if (!isRecord(body)) return null;
  const version = body["v"];
  if (version !== 1 && version !== 2) return null;
  const kind = body["e"];
  if (kind !== "start" && kind !== "end") return null;
  const mode = body["m"];
  if (typeof mode !== "string" || mode.length > MAX_MODE_LENGTH || !MODES.has(mode)) {
    return null;
  }
  const difficulty = body["d"];
  if (typeof difficulty !== "string" || !DIFFICULTIES.has(difficulty)) return null;

  const board = boardInfo(mode);
  const appVersion = body["vr"];
  const context = {
    mode,
    difficulty,
    board: board?.label ?? mode,
    tiling: board?.tiling ?? "",
    surface: board?.surface ?? "",
    family: board?.family ?? "",
    trigger: oneOf<StartTrigger>(body["t"], TRIGGERS),
    from: oneOf<PreviousState>(body["f"], PREVIOUS),
    device: oneOf<DeviceClass>(body["dv"], DEVICES),
    shell: oneOf<ShellKind>(body["sh"], SHELLS),
    version:
      typeof appVersion === "string" &&
      appVersion.length <= MAX_VERSION_LENGTH &&
      VERSION_SHAPE.test(appVersion)
        ? appVersion
        : "",
    cells: count(body["c"], MAX_CELLS),
    mines: count(body["n"], MAX_CELLS),
  };

  if (kind === "start") {
    // An outcome or a clock on a start is noise from a hand-written post; drop
    // the fields, keep the event.
    return {
      kind,
      ...context,
      outcome: null,
      seconds: 0,
      opened: 0,
      flagsRight: 0,
      flagsWrong: 0,
      reveals: 0,
      chords: 0,
      flagMoves: 0,
      firstMoveMs: 0,
      viewMoved: 0,
    };
  }
  const outcome = body["o"];
  if (outcome !== "won" && outcome !== "lost") return null;
  const s = body["s"];
  if (typeof s !== "number" || !Number.isFinite(s)) return null;
  return {
    kind,
    ...context,
    outcome,
    seconds: Math.min(MAX_SECONDS, Math.max(0, Math.round(s))),
    opened: count(body["op"], MAX_CELLS),
    flagsRight: count(body["fr"], MAX_CELLS),
    flagsWrong: count(body["fw"], MAX_CELLS),
    reveals: count(body["rv"], MAX_MOVES),
    chords: count(body["ch"], MAX_MOVES),
    flagMoves: count(body["fl"], MAX_MOVES),
    firstMoveMs: count(body["fm"], MAX_FIRST_MOVE_MS),
    viewMoved: body["vm"] === 1 ? 1 : 0,
  };
}

/** One stored column: where it sits is its position in the array, what it means
 * is `note`, and what goes in it is `get`. */
export interface DatasetColumn<T> {
  name: string;
  note: string;
  get: (event: ParsedEvent) => T;
}

/** `blob1…` in order. **Append only, never renumber** — the positions are the
 * contract with every dashboard and with `scripts/metrics.mjs`, which reads
 * them by number and has no way to notice they moved. */
export const DATASET_BLOBS: readonly DatasetColumn<string>[] = [
  { name: "kind", note: '"start" | "end"', get: (e) => e.kind },
  { name: "difficulty", note: '"easy" | "medium" | "hard"', get: (e) => e.difficulty },
  { name: "outcome", note: '"won" | "lost"; "" on a start', get: (e) => e.outcome ?? "" },
  { name: "board", note: 'full name ("Hexagons · Torus")', get: (e) => e.board },
  { name: "tiling", note: 'tiling key; "" for a one-off board', get: (e) => e.tiling },
  { name: "surface", note: '"flat" | "torus" | … | "solid"', get: (e) => e.surface },
  { name: "family", note: '"regular" | "uniform" | "platonic" | …', get: (e) => e.family },
  { name: "trigger", note: '"menu" | "random" | "again" | "link"', get: (e) => e.trigger },
  { name: "from", note: 'previous board: "" | "playing" | "won" | "lost"', get: (e) => e.from },
  { name: "device", note: '"phone" | "tablet" | "desktop" | "unknown"', get: (e) => e.device },
  { name: "shell", note: '"browser" | "standalone"', get: (e) => e.shell },
  { name: "version", note: 'build version ("0.2.83")', get: (e) => e.version },
];

/** `double1…` in order. Append only, exactly as above. */
export const DATASET_DOUBLES: readonly DatasetColumn<number>[] = [
  { name: "seconds", note: "seconds on the clock; 0 on a start", get: (e) => e.seconds },
  { name: "cells", note: "total cells on the board", get: (e) => e.cells },
  { name: "mines", note: "mines on the board", get: (e) => e.mines },
  { name: "opened", note: "safe cells opened; 0 on a start", get: (e) => e.opened },
  { name: "flagsRight", note: "player flags on mines at the end", get: (e) => e.flagsRight },
  { name: "flagsWrong", note: "player flags on safe cells at the end", get: (e) => e.flagsWrong },
  { name: "reveals", note: "reveal moves", get: (e) => e.reveals },
  { name: "chords", note: "chord moves", get: (e) => e.chords },
  { name: "flagMoves", note: "flag toggles", get: (e) => e.flagMoves },
  { name: "firstMoveMs", note: "board open to first move, ms", get: (e) => e.firstMoveMs },
  { name: "viewMoved", note: "1 if the view was rotated or zoomed", get: (e) => e.viewMoved },
];
