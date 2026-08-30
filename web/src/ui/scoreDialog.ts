import type { Achievement } from "../achievements";
import { difficulty as difficultySpec } from "../config/screens";
import { fullModeLabel } from "../boards/catalog";
import { formatTime, TOP_N, type ScoreEntry } from "../leaderboard";
import type { ShareResult } from "../share";
import { menuIcon } from "./icons";
import { closeButton, openModal, type ModalHandle } from "./modal";

// The window a win puts up: when the time makes the board's top three, when it
// unlocks an achievement, or both.
//
// Achievements share this card rather than opening one of their own. The app
// has exactly two modals on purpose (see ui/modal.ts), and an unlock wants
// saying at the same instant a record does — a third overlay would either stack
// on this one or queue behind it, and both read as the app talking over itself.
// A win that unlocks something but sets no record is the case that made this
// window open on more than a rank: without it the game's answer to finishing
// the last board of a family was silence.
//
// A record is a moment: it belongs on top of the board that was just cleared,
// and it has to be dismissible back to it. So it is a real overlay rather than
// a page, and the modal obligations that come with that — Escape, the backdrop
// click, the focus ring — are ui/modal.ts's, shared with the info window.
//
// Everything it paints comes from theme custom properties, so it follows the
// eight palettes (including the web-only dark ones) with no per-theme code. The
// board itself is never themed — that invariant is untouched here; this is
// chrome sitting on top of it.

const MEDALS = ["🥇", "🥈", "🥉"];
const RANK_TITLES = ["New best time!", "Second best time", "Third best time"];
/** How long the share button shows what happened before going back to itself. */
const SHARE_LABEL_MS = 2000;

/** The share glyph, and the two answers it can give back once it has no label
 * left to say them in (see `shareButton`). */
const SHARE_GLYPHS = {
  share: `<svg viewBox="0 0 24 24" aria-hidden="true">
    <path d="M12 3.4 V14.6 M8.3 7.1 L12 3.4 L15.7 7.1" stroke="currentColor"
      stroke-width="1.8" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
    <path d="M7.4 10.6 H5.6 A1.6 1.6 0 0 0 4 12.2 V18.8 A1.6 1.6 0 0 0 5.6 20.4
      H18.4 A1.6 1.6 0 0 0 20 18.8 V12.2 A1.6 1.6 0 0 0 18.4 10.6 H16.6"
      stroke="currentColor" stroke-width="1.8" fill="none" stroke-linecap="round"
      stroke-linejoin="round"/>
  </svg>`,
  copied: `<svg viewBox="0 0 24 24" aria-hidden="true">
    <path d="M5 12.4 L9.8 17.2 L19 6.8" stroke="currentColor" stroke-width="2"
      fill="none" stroke-linecap="round" stroke-linejoin="round"/>
  </svg>`,
  failed: `<svg viewBox="0 0 24 24" aria-hidden="true">
    <path d="M6.8 6.8 L17.2 17.2 M17.2 6.8 L6.8 17.2" stroke="currentColor"
      stroke-width="2" fill="none" stroke-linecap="round"/>
  </svg>`,
} as const;

export interface ScoreDialogOptions {
  mode: string;
  difficulty: string;
  /** 1-based position the finishing time took, or `null` when it did not make
   * the board's top three (in which case there is an unlock to show instead). */
  rank: number | null;
  /** The board's new top list, fastest first — `rank - 1` is the new row.
   * Empty when there is no rank. */
  entries: ScoreEntry[];
  /** What this win just unlocked, in list order. May be empty. */
  unlocked?: readonly Achievement[] | undefined;
  /** Go to the full achievements list. The unlock list's last row is this,
   * which is the only way to that page from a finished board — Settings is a
   * long way round from the card that just said you unlocked something. */
  onShowAll?: (() => void) | undefined;
  /** Whether the open transition runs (the app's animations preference). */
  animate: boolean;
  /** Which of the two actions is the highlighted one. A board the player chose
   * is one they came for, so playing it again is the obvious next move; a board
   * the game *dealt* them — the home page's Flat/3D rows, the header's die, this
   * window's own New board — is one of a wander through the catalogue, and the
   * next move there is another board. Defaults to Play again. */
  primary?: "play-again" | "new-board" | undefined;
  onPlayAgain(): void;
  /** Deal another board at random, from the half of the catalogue this one came
   * from (see boards/randomBoard.ts). Optional so a layout from the test seam
   * can leave it out; the app always passes one. */
  onNewBoard?: (() => void) | undefined;
  onClose(): void;
  /** Offer this board's link. Resolves with how it went, so the button can say
   * "Link copied" when nothing visible happened (see share.ts). Omitted when
   * the board has no link to share — a layout from the test seam. */
  onShare?: (() => Promise<ShareResult>) | undefined;
}

export type ScoreDialogHandle = ModalHandle;

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  cls: string,
  text?: string,
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  node.className = cls;
  if (text !== undefined) node.textContent = text;
  return node;
}

/** The date a stored time was set, short enough to sit at the end of its row.
 * `at` is 0 for a record written by a build that did not store one (or one
 * whose timestamp did not survive validation), which shows nothing rather than
 * "1 Jan 1970". */
function whenLabel(at: number, isNew: boolean): string {
  if (isNew) return "just now";
  if (at <= 0) return "";
  try {
    return new Date(at).toLocaleDateString(undefined, { month: "short", day: "numeric" });
  } catch {
    return "";
  }
}

/** The top-three list, with the row just set marked. */
function scoreList(entries: ScoreEntry[], rank: number): HTMLElement {
  const list = el("ol", "score-list");
  entries.slice(0, TOP_N).forEach((entry, i) => {
    const isNew = i === rank - 1;
    const row = el("li", `score-row${isNew ? " current" : ""}`);
    row.dataset["rank"] = String(i + 1);
    if (isNew) row.dataset["new"] = "1";
    const value = el("span", "score-value");
    value.append(el("span", "score-time", formatTime(entry.ms)), el("span", "score-unit", "s"));
    row.append(
      el("span", "score-medal", MEDALS[i] ?? ""),
      value,
      el("span", "score-when", whenLabel(entry.at, isNew)),
    );
    list.append(row);
  });
  return list;
}

/** How many unlocks the card lists before it says "and N more". A first win
 * earns six at once — its first board, its first difficulty, its shape, its
 * family, its surface and (a first click that floods the field plants no flag)
 * the flagless one. Six rows push the buttons off a phone's screen, and the
 * card scrolling is no answer when what scrolls away is "Play again". The rest
 * are on the Achievements page, which is where the whole list lives anyway. */
const MAX_UNLOCKS_SHOWN = 4;

/** What the win just unlocked: one row each, icon, name and the line saying
 * what it was for, and then the way to the rest.
 *
 * That last row is there whether or not the list was truncated. Most wins
 * unlock one or two things, so a link that only appeared past four would
 * almost never be there — and the point of it is that the card is where a
 * player is thinking about achievements, not the settings page. It says the
 * count when there is one to say and names the page otherwise. */
function unlockList(
  unlocked: readonly Achievement[],
  onShowAll?: (() => void) | undefined,
): { list: HTMLElement; link: HTMLButtonElement | null } {
  const list = el("ul", "dialog-unlocks");
  for (const achievement of unlocked.slice(0, MAX_UNLOCKS_SHOWN)) {
    const row = el("li", "dialog-unlock");
    row.dataset["achievement"] = achievement.id;
    const icon = el("span", "dialog-unlock-icon");
    icon.innerHTML = menuIcon(achievement.icon);
    const text = el("span", "dialog-unlock-text");
    text.append(
      el("span", "dialog-unlock-label", achievement.label),
      el("span", "dialog-unlock-hint", achievement.hint),
    );
    row.append(icon, text);
    list.append(row);
  }
  const rest = unlocked.length - MAX_UNLOCKS_SHOWN;
  // Without somewhere to send them, a truncated list still has to say it left
  // something out — it just says it as text rather than as a way there.
  if (!onShowAll) {
    if (rest > 0) list.append(el("li", "dialog-unlock-more", `and ${rest} more`));
    return { list, link: null };
  }
  const row = el("li", "dialog-unlock-link");
  const label = rest > 0 ? `and ${rest} more` : "All achievements";
  const link = el("button", "dialog-unlock-more", label);
  link.dataset["action"] = "show-achievements";
  if (rest > 0) link.dataset["more"] = String(rest);
  link.addEventListener("click", onShowAll);
  row.append(link);
  list.append(row);
  return { list, link };
}

/** The board's link, as the icon in the card's top-left corner — the mirror of
 * the × opposite it.
 *
 * It is chrome rather than one of the actions, and that is the whole point of
 * the move: the row at the foot of the card asks what to play next, and a link
 * is not an answer to that question. Standing among the answers it made two
 * real choices look like four.
 *
 * Sharing is also the one thing here that does *not* dismiss the card: the
 * player is looking at the time they just set, and the share sheet (or the
 * clipboard) belongs on top of it, not instead of it. This is still the only
 * place the app offers a board's link — the game header used to carry one, and
 * carries the ⓘ now.
 *
 * A clipboard write is invisible, so the icon has to say what happened where a
 * word used to: the glyph swaps for a tick or a cross, and the note under it
 * spells that out. A share *sheet* is its own feedback and gets neither. */
function shareButton(onShare: () => Promise<ShareResult>): HTMLButtonElement {
  const btn = el("button", "dialog-share");
  btn.dataset["action"] = "share";
  btn.setAttribute("aria-label", "Share this board");
  btn.title = "Share this board";
  const glyph = el("span", "dialog-share-icon");
  glyph.innerHTML = SHARE_GLYPHS.share;
  // Always present and empty until there is something to say, so nothing has to
  // add or remove it — an empty span draws nothing.
  const note = el("span", "dialog-share-note");
  btn.append(glyph, note);
  let reset = 0;
  btn.addEventListener("click", () => {
    window.clearTimeout(reset);
    void onShare().then((result) => {
      if (result === "shared") return;
      const copied = result === "copied";
      glyph.innerHTML = copied ? SHARE_GLYPHS.copied : SHARE_GLYPHS.failed;
      note.textContent = copied ? "Link copied" : "Could not share";
      btn.dataset["state"] = result;
      reset = window.setTimeout(() => {
        glyph.innerHTML = SHARE_GLYPHS.share;
        note.textContent = "";
        delete btn.dataset["state"];
      }, SHARE_LABEL_MS);
    });
  });
  return btn;
}

/** Build the dialog and add it to `host`. The caller keeps the handle and
 * closes it when the board goes away. */
export function openScoreDialog(
  host: HTMLElement,
  opts: ScoreDialogOptions,
): ScoreDialogHandle {
  const unlocked = opts.unlocked ?? [];
  const dialog = el("div", "dialog");
  if (opts.rank !== null) dialog.dataset["rank"] = String(opts.rank);
  if (unlocked.length > 0) dialog.dataset["unlocked"] = String(unlocked.length);

  // With no rank the card is about the unlock, so it says so; the medal and the
  // list of times both belong to a rank and are left out.
  const heading =
    opts.rank !== null
      ? RANK_TITLES[opts.rank - 1] ?? "Top time"
      : unlocked.length > 1
        ? `${unlocked.length} achievements unlocked`
        : "Achievement unlocked";
  const title = el("h2", "dialog-title", heading);
  title.id = "score-dialog-title";

  const label = fullModeLabel(opts.mode);
  let difficultyLabel = opts.difficulty;
  try {
    difficultyLabel = difficultySpec(opts.difficulty).label;
  } catch {
    /* a board played at a difficulty this build has dropped still gets a row */
  }

  const close = (): void => handle.close();

  // One question, two buttons: the same board again, or a different one. A win
  // is the moment a player decides what to play next, and the row is that
  // decision and nothing else — Menu left it (the × and Escape go back to the
  // cleared board, the header's back button goes home) and Share moved to the
  // corner, because neither was an answer to it.
  //
  // Which one is highlighted is a fact about the board, not a preference: one
  // the player picked out of the catalogue is one they came for, so its obvious
  // next move is to play it again; one the game dealt them is a step in a
  // wander, and the next step is another board.
  const primary = opts.primary ?? "play-again";
  const actions = el("div", "dialog-actions");
  const buttons: HTMLElement[] = [];
  const btnClass = (action: string): string =>
    `dialog-btn${action === primary ? " dialog-primary" : ""}`;
  const again = el("button", btnClass("play-again"), "Play again");
  again.dataset["action"] = "play-again";
  again.addEventListener("click", () => {
    close();
    opts.onPlayAgain();
  });
  buttons.push(again);

  // The home page's Flat/3D deal, aimed at the half of the catalogue the board
  // that was just won came from.
  let fresh: HTMLElement | null = null;
  if (opts.onNewBoard) {
    fresh = el("button", btnClass("new-board"), "New board");
    fresh.dataset["action"] = "new-board";
    fresh.addEventListener("click", () => {
      close();
      opts.onNewBoard!();
    });
    buttons.push(fresh);
  }

  actions.append(...buttons);
  // Two side by side; one (a board with no New board to offer — the test seam)
  // takes the full width rather than half of it.
  actions.dataset["buttons"] = String(buttons.length);

  const dismiss = closeButton(close);
  // A board built from an explicit mine layout has no seed and so no link.
  const share = opts.onShare ? shareButton(opts.onShare) : null;

  dialog.append(
    dismiss,
    ...(share ? [share] : []),
    el("div", "dialog-medal", opts.rank !== null ? MEDALS[opts.rank - 1] ?? "🏅" : "🏅"),
    title,
    el("p", "dialog-subtitle", `${label} · ${difficultyLabel}`),
  );
  if (opts.rank !== null) dialog.append(scoreList(opts.entries, opts.rank));
  let showAll: HTMLButtonElement | null = null;
  if (unlocked.length > 0) {
    // Under the times when there are both: the card is opened by the record,
    // and the unlock is the thing the player did not know was coming.
    if (opts.rank !== null) dialog.append(el("p", "dialog-unlocks-heading", "Unlocked"));
    const built = unlockList(unlocked, opts.onShowAll);
    showAll = built.link;
    dialog.append(built.list);
  }
  dialog.append(actions);

  const handle = openModal(host, dialog, {
    name: "score",
    labelledBy: title.id,
    animate: opts.animate,
    // Both corner icons first, then the link into the achievements page — a
    // control like any other, so Tab has to reach it — then the actions, which
    // is the order they are drawn in.
    focusRing: () => [
      dismiss,
      ...(share ? [share] : []),
      ...(showAll ? [showAll] : []),
      ...buttons,
    ],
    // Focus lands on the highlighted button, whichever it is: it is the card's
    // answer to what to play next, so Enter should take it.
    initialFocus: () => (primary === "new-board" && fresh ? fresh : again),
    onClose: opts.onClose,
  });
  return handle;
}
