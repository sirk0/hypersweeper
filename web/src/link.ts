import { hasDifficulty } from "./config/screens";
import { hasMode } from "./boards/presets";

// Shareable board links: `?mode=<mode>&difficulty=<key>` (plus an optional
// `seed`), the form the address bar carries while a board is open so that
// copying it is all sharing takes.
//
// A link is untrusted input — it is typed, edited, truncated by chat clients and
// forwarded between versions of the app that do not offer the same boards. So
// **every parameter is read on its own and only if its value is one this build
// knows**: an unrecognised value is dropped, not repaired and not passed
// through, and dropping one never costs the others. A link to a board that does
// not exist here (`?mode=kleinfloret` — the floret pentagonal is chiral, so it
// has no Klein bottle wrap) opens the menu rather than failing; if that same
// link named a difficulty, the menu still opens on it.
//
// Anything else in the query string is ignored, so links may safely carry
// tracking or campaign parameters.

/** The parts of a link this build recognises. Each is `null` when absent or
 * unusable, never a value the app has not validated. */
export interface BoardLink {
  mode: string | null;
  difficulty: string | null;
  seed: number | null;
}

/** Mode and difficulty keys are lowercase throughout `data/`, so a link that
 * got title-cased on its way through a chat client still resolves. Trimming
 * covers a stray space from a hand-edited URL. */
function normalise(value: string | null): string | null {
  if (value === null) return null;
  const trimmed = value.trim().toLowerCase();
  return trimmed === "" ? null : trimmed;
}

export function parseBoardLink(search: string): BoardLink {
  let params: URLSearchParams;
  try {
    params = new URLSearchParams(search);
  } catch {
    return { mode: null, difficulty: null, seed: null };
  }
  const mode = normalise(params.get("mode"));
  const difficulty = normalise(params.get("difficulty"));
  const seed = params.get("seed");
  return {
    mode: mode !== null && hasMode(mode) ? mode : null,
    difficulty: difficulty !== null && hasDifficulty(difficulty) ? difficulty : null,
    seed: parseSeed(seed),
  };
}

/** A seed is only usable if it is a whole number the RNG can take: `mulberry32`
 * does `seed >>> 0`, which turns a fraction, an infinity or a NaN into
 * something that no longer matches the board the sharer saw. */
function parseSeed(raw: string | null): number | null {
  if (raw === null || raw.trim() === "") return null;
  const n = Number(raw);
  return Number.isSafeInteger(n) ? n : null;
}

/** The query string for a board, for the address bar. Only the parameters that
 * identify the board: a seed is carried only when the board was opened with
 * one, so an ordinary game stays re-rollable on reload. */
export function boardLinkQuery(
  mode: string,
  difficulty: string,
  seed?: number | undefined,
): string {
  const params = new URLSearchParams({ mode, difficulty });
  if (seed !== undefined) params.set("seed", String(seed));
  return `?${params.toString()}`;
}
