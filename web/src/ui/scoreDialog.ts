import { difficulty as difficultySpec } from "../config/screens";
import { fullModeLabel } from "../boards/catalog";
import { formatTime, TOP_N, type ScoreEntry } from "../leaderboard";
import type { ShareResult } from "../share";
import { closeButton, openModal, type ModalHandle } from "./modal";

// The window a win puts up when the time makes the board's top three.
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
/** How long the share button says what happened before going back to "Share". */
const SHARE_LABEL_MS = 2000;

export interface ScoreDialogOptions {
  mode: string;
  difficulty: string;
  /** 1-based position the finishing time took. */
  rank: number;
  /** The board's new top list, fastest first — `rank - 1` is the new row. */
  entries: ScoreEntry[];
  /** Whether the open transition runs (the app's animations preference). */
  animate: boolean;
  onPlayAgain(): void;
  /** Deal another board at random, from the half of the catalogue this one came
   * from (see boards/randomBoard.ts). Optional so a layout from the test seam
   * can leave it out; the app always passes one. */
  onNewBoard?: (() => void) | undefined;
  onMenu(): void;
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

/** Build the dialog and add it to `host`. The caller keeps the handle and
 * closes it when the board goes away. */
export function openScoreDialog(
  host: HTMLElement,
  opts: ScoreDialogOptions,
): ScoreDialogHandle {
  const dialog = el("div", "dialog");
  dialog.dataset["rank"] = String(opts.rank);

  const title = el("h2", "dialog-title", RANK_TITLES[opts.rank - 1] ?? "Top time");
  title.id = "score-dialog-title";

  const label = fullModeLabel(opts.mode);
  let difficultyLabel = opts.difficulty;
  try {
    difficultyLabel = difficultySpec(opts.difficulty).label;
  } catch {
    /* a board played at a difficulty this build has dropped still gets a row */
  }

  const close = (): void => handle.close();

  const actions = el("div", "dialog-actions");
  const buttons: HTMLElement[] = [];
  const again = el("button", "dialog-btn dialog-primary", "Play again");
  again.dataset["action"] = "play-again";
  again.addEventListener("click", () => {
    close();
    opts.onPlayAgain();
  });
  buttons.push(again);

  // The same board again, then a different one: a win is the moment a player
  // decides what to play next, and until now the only way to another board was
  // back out to the menu and pick one. This is the home page's Flat/3D deal,
  // aimed at the half of the catalogue the board that was just won came from.
  if (opts.onNewBoard) {
    const fresh = el("button", "dialog-btn", "New board");
    fresh.dataset["action"] = "new-board";
    fresh.addEventListener("click", () => {
      close();
      opts.onNewBoard!();
    });
    buttons.push(fresh);
  }

  // Sharing is the one action here that does *not* dismiss the card: the player
  // is looking at the time they just set, and the share sheet (or the clipboard
  // toast) belongs on top of it, not instead of it. It is also the only place
  // the app offers a board's link — the game header used to carry a share
  // button too, and it is the info button now.
  if (opts.onShare) {
    const share = el("button", "dialog-btn dialog-share", "Share");
    share.dataset["action"] = "share";
    let resetLabel = 0;
    share.addEventListener("click", () => {
      window.clearTimeout(resetLabel);
      void opts.onShare!().then((result) => {
        // A share sheet is its own feedback; a clipboard write is invisible and
        // has to say so, or the button reads as broken.
        if (result === "shared") return;
        share.textContent = result === "copied" ? "Link copied" : "Could not share";
        share.dataset["state"] = result;
        resetLabel = window.setTimeout(() => {
          share.textContent = "Share";
          delete share.dataset["state"];
        }, SHARE_LABEL_MS);
      });
    });
    buttons.push(share);
  }

  const menu = el("button", "dialog-btn", "Menu");
  menu.dataset["action"] = "menu";
  menu.addEventListener("click", () => {
    close();
    opts.onMenu();
  });
  buttons.push(menu);
  actions.append(...buttons);
  // The stylesheet lays two buttons out side by side, four as a square, and
  // three with the primary on a row of its own — an odd one out below a pair
  // reads as a mistake where a full-width one reads as the first choice.
  actions.dataset["buttons"] = String(buttons.length);

  const dismiss = closeButton(close);

  dialog.append(
    dismiss,
    el("div", "dialog-medal", MEDALS[opts.rank - 1] ?? "🏅"),
    title,
    el("p", "dialog-subtitle", `${label} · ${difficultyLabel}`),
    scoreList(opts.entries, opts.rank),
    actions,
  );

  const handle = openModal(host, dialog, {
    name: "score",
    labelledBy: title.id,
    animate: opts.animate,
    focusRing: () => [dismiss, ...buttons],
    initialFocus: () => again,
    onClose: opts.onClose,
  });
  return handle;
}
