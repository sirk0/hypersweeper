import { fullModeLabel } from "./boards/catalog";
import { difficulty as difficultySpec, hasDifficulty } from "./config/screens";
import { boardLinkQuery } from "./link";

// Handing a board to someone else.
//
// The address bar has always been the share link (see link.ts), but it is not a
// thing a player can reach: an installed PWA and an iOS standalone window have
// no address bar at all, and a phone browser's is a truncated pill. So the app
// offers the link directly.
//
// The split here is the one `sound.ts` and `analyticsEvent.ts` use — a pure
// half holding every rule, and a thin impure wrapper around the browser APIs —
// because the rules are what the unit tests can pin without a document, a
// clipboard permission or a share sheet.
//
// The link names *this* board: every ordinary game is dealt from a seed
// (`App.startGame`), so the recipient opens the same mine layout rather than
// another board of the same kind.

/** What a board a share names. `seed` is null only for a board built from an
 * explicit mine layout (the test seam), which no link reproduces. */
export interface ShareBoard {
  mode: string;
  difficulty: string;
  seed: number | null;
  /** A finished game's time, when the share is of a win. */
  elapsedMs?: number | undefined;
}

/** The absolute URL that reopens a board. Built on `boardLinkQuery`, not on a
 * second query builder, so the link a share hands out and the link the address
 * bar carries cannot drift apart.
 *
 * `base` is the page the app is served from — pass `window.location` at the
 * call site. Any existing query is dropped rather than appended to: the board's
 * parameters are the whole link, and a stale `seed` from the current board
 * would otherwise ride along. */
export function shareUrlFor(board: ShareBoard, base: { origin: string; pathname: string }): string {
  const query = boardLinkQuery(
    board.mode,
    board.difficulty,
    board.seed ?? undefined,
  );
  return `${base.origin}${base.pathname}${query}`;
}

/** Seconds, as the record window writes them — a bare count, since a board can
 * take longer than a minute and "93s" sorts and reads better than "1:33" beside
 * the LED timer the player just watched. */
function formatSeconds(ms: number): string {
  return `${Math.round(ms / 1000)}s`;
}

/** The sentence that goes with the link. Names the board the way the best-times
 * page and the record window do (`fullModeLabel` — the tiling *and* the surface,
 * since "Hexagons" alone names five different boards), and the difficulty by its
 * own label rather than its key. */
export function shareTextFor(board: ShareBoard): string {
  // A share is always of a live session, so the key is one this build knows —
  // but `difficulty()` throws on an unknown one, and a share button is not
  // worth an exception, so fall back to the raw key.
  const diff = hasDifficulty(board.difficulty)
    ? difficultySpec(board.difficulty).label
    : board.difficulty;
  const name = `${fullModeLabel(board.mode)} · ${diff}`;
  return board.elapsedMs === undefined
    ? `Hypersweeper — ${name}`
    : `Hypersweeper — ${name} in ${formatSeconds(board.elapsedMs)}`;
}

/** How a share ended, for the call site's feedback. `shared` means the platform
 * took it (a share sheet); `copied` means it went to the clipboard and the
 * player has to be told so, since nothing visible happened. */
export type ShareResult = "shared" | "copied" | "failed";

/** Offer the board's link, by whatever means this platform has.
 *
 * `navigator.share` first — on a phone that is the share sheet, which is what
 * "send this to someone" means there. Otherwise the clipboard. Both must be
 * called from a user gesture, which both call sites (the record window's button
 * and the header's) are.
 *
 * A share the player cancels resolves `failed`, not an error: dismissing the
 * sheet is a normal outcome and must not look like a broken button. */
export async function shareBoard(
  board: ShareBoard,
  nav: Navigator = navigator,
  base: { origin: string; pathname: string } = window.location,
): Promise<ShareResult> {
  const url = shareUrlFor(board, base);
  const text = shareTextFor(board);
  if (typeof nav.share === "function") {
    try {
      await nav.share({ title: "Hypersweeper", text, url });
      return "shared";
    } catch {
      // Cancelled, or refused (a desktop browser may define `share` and then
      // reject). Fall through to the clipboard rather than failing outright.
    }
  }
  // Checked rather than optional-chained: `nav.clipboard?.writeText(…)` on a
  // platform with no clipboard evaluates to `undefined`, which awaits happily
  // and would have the button report "Link copied" having copied nothing.
  if (typeof nav.clipboard?.writeText !== "function") return "failed";
  try {
    await nav.clipboard.writeText(`${text}\n${url}`);
    return "copied";
  } catch {
    return "failed";
  }
}
