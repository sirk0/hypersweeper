// The wire format between the app and the collector, and the one place either
// side decides what a valid event is. Both halves import this module — the
// browser shapes an event with `payloadFor` (src/analytics.ts), the Cloudflare
// Pages Function validates one with `parseEvent` (functions/api/tally.ts) — so
// the two cannot drift apart, and a board added to the catalog is understood by
// the collector the moment it is deployed.
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

/** Longest a clock is believed, in seconds. Ten hours is past any real game and
 * keeps a hand-posted number from dragging a mean around. */
export const MAX_SECONDS = 36_000;

/** Longest mode name accepted, well past the longest real one (19 characters)
 * and inside Analytics Engine's 96-byte index limit. */
const MAX_MODE_LENGTH = 48;

export type EventKind = "start" | "end";
export type Outcome = "won" | "lost";

/** What a call site names: a board opened, or a board finished. */
export interface GameEvent {
  kind: EventKind;
  mode: string;
  difficulty: string;
  /** How an `end` finished. Ignored on a `start`. */
  outcome?: Outcome;
  /** Milliseconds on the clock, rounded to whole seconds on the wire — the
   * leaderboard needs the precision to break ties, a mean never does. */
  ms?: number;
}

/** The JSON that goes over the wire. Short keys because this is sent on every
 * game and read by nobody; `v` so a future shape can be told from this one
 * rather than guessed at. */
export interface EventPayload {
  v: 1;
  e: EventKind;
  m: string;
  d: string;
  o?: Outcome;
  s?: number;
}

/** A validated event, as the collector sees it: outcome and seconds resolved to
 * total values so the write site has no branches left. */
export interface ParsedEvent {
  kind: EventKind;
  mode: string;
  difficulty: string;
  /** `null` on a start. */
  outcome: Outcome | null;
  /** 0 on a start. */
  seconds: number;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Whole seconds on the wire, clamped into a range worth believing. */
function seconds(ms: number): number {
  return Math.min(MAX_SECONDS, Math.max(0, Math.round(ms / 1000)));
}

/** The wire form of a game event, or `null` when there is nothing worth
 * sending — an unknown board, an unknown difficulty, an end with no outcome.
 * Dropping it here rather than at the collector means a build that has drifted
 * from the catalog stays silent instead of filling the dataset with rows no
 * report can name. */
export function payloadFor(event: GameEvent): EventPayload | null {
  if (!MODES.has(event.mode) || !DIFFICULTIES.has(event.difficulty)) return null;
  const base: EventPayload = { v: 1, e: event.kind, m: event.mode, d: event.difficulty };
  if (event.kind === "start") return base;
  if (event.outcome !== "won" && event.outcome !== "lost") return null;
  if (typeof event.ms !== "number" || !Number.isFinite(event.ms)) return null;
  // Conditional spread rather than `{ o: undefined }`: `exactOptionalPropertyTypes`
  // is on, and an explicitly-undefined key is not the same as an absent one
  // (JSON.stringify drops it, but the type says otherwise).
  return { ...base, o: event.outcome, s: seconds(event.ms) };
}

/** The validated event in an unknown POST body, or `null`. Total: any junk —
 * a string, an array, a version this build does not speak, a board that does
 * not exist — answers `null` rather than throwing. Every field is checked on
 * its own and nothing unrecognised is carried through, so the collector can
 * only ever store values from this file's own vocabulary. */
export function parseEvent(body: unknown): ParsedEvent | null {
  if (!isRecord(body)) return null;
  if (body["v"] !== 1) return null;
  const kind = body["e"];
  if (kind !== "start" && kind !== "end") return null;
  const mode = body["m"];
  if (typeof mode !== "string" || mode.length > MAX_MODE_LENGTH || !MODES.has(mode)) {
    return null;
  }
  const difficulty = body["d"];
  if (typeof difficulty !== "string" || !DIFFICULTIES.has(difficulty)) return null;
  if (kind === "start") {
    // An outcome or a clock on a start is noise from a hand-written post; drop
    // the fields, keep the event.
    return { kind, mode, difficulty, outcome: null, seconds: 0 };
  }
  const outcome = body["o"];
  if (outcome !== "won" && outcome !== "lost") return null;
  const s = body["s"];
  if (typeof s !== "number" || !Number.isFinite(s)) return null;
  return {
    kind,
    mode,
    difficulty,
    outcome,
    seconds: Math.min(MAX_SECONDS, Math.max(0, Math.round(s))),
  };
}
