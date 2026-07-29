import { difficulty as difficultySpec } from "../config/screens";
import { fullModeLabel } from "../boards/catalog";
import { formatTime, TOP_N, type ScoreEntry } from "../leaderboard";

// The window a win puts up when the time makes the board's top three.
//
// This is the one modal in the app — everything else that looks like a page is
// a page (the settings screen is a `Menu` view for exactly that reason). A
// record is different: it is a moment, it belongs on top of the board that was
// just cleared, and it has to be dismissible back to that board. So it is a
// real overlay, with the modal obligations that come with it: Escape and a
// backdrop click close it, focus moves in on open and back to the element that
// had it on close, and the buttons are reachable in tab order.
//
// Everything it paints comes from theme custom properties, so it follows the
// seven palettes (including the web-only dark one) with no per-theme code. The
// board itself is never themed — that invariant is untouched here; this is
// chrome sitting on top of it.

const MEDALS = ["🥇", "🥈", "🥉"];
const RANK_TITLES = ["New best time!", "Second best time", "Third best time"];

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
  onMenu(): void;
  onClose(): void;
}

export interface ScoreDialogHandle {
  readonly root: HTMLElement;
  /** Remove the dialog and restore focus. Safe to call twice — the app closes
   * it on restart and on the way back to the menu as well as from its own
   * buttons. */
  close(): void;
}

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
  const previousFocus = document.activeElement as HTMLElement | null;

  const backdrop = el("div", "dialog-backdrop");
  backdrop.dataset["dialog"] = "score";
  const dialog = el("div", "dialog");
  dialog.setAttribute("role", "dialog");
  dialog.setAttribute("aria-modal", "true");
  dialog.setAttribute("aria-labelledby", "score-dialog-title");
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
  const again = el("button", "dialog-btn dialog-primary", "Play again");
  again.dataset["action"] = "play-again";
  again.addEventListener("click", () => {
    close();
    opts.onPlayAgain();
  });
  const menu = el("button", "dialog-btn", "Menu");
  menu.dataset["action"] = "menu";
  menu.addEventListener("click", () => {
    close();
    opts.onMenu();
  });
  actions.append(again, menu);

  const dismiss = el("button", "dialog-close", "×");
  dismiss.dataset["action"] = "close";
  dismiss.setAttribute("aria-label", "Close");
  dismiss.addEventListener("click", close);

  dialog.append(
    dismiss,
    el("div", "dialog-medal", MEDALS[opts.rank - 1] ?? "🏅"),
    title,
    el("p", "dialog-subtitle", `${label} · ${difficultyLabel}`),
    scoreList(opts.entries, opts.rank),
    actions,
  );
  backdrop.append(dialog);

  // A click on the field around the card dismisses; one inside it must not.
  backdrop.addEventListener("click", (e) => {
    if (e.target === backdrop) close();
  });

  const onKey = (e: KeyboardEvent): void => {
    if (e.key === "Escape") {
      e.preventDefault();
      close();
      return;
    }
    // Keep tabbing inside the dialog while it is up: without this the focus
    // ring walks off into the HUD behind the backdrop, where clicks do not land.
    if (e.key !== "Tab") return;
    const focusable = [dismiss, again, menu];
    const first = focusable[0]!;
    const last = focusable[focusable.length - 1]!;
    const active = document.activeElement;
    if (e.shiftKey && (active === first || !dialog.contains(active))) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && active === last) {
      e.preventDefault();
      first.focus();
    }
  };
  // Capture, so the app's own window-level key handling (zoom, rotation) does
  // not act on keys aimed at the dialog.
  window.addEventListener("keydown", onKey, true);

  let closed = false;
  const handle: ScoreDialogHandle = {
    root: backdrop,
    close() {
      if (closed) return;
      closed = true;
      window.removeEventListener("keydown", onKey, true);
      backdrop.remove();
      previousFocus?.focus?.();
      opts.onClose();
    },
  };

  host.append(backdrop);
  if (opts.animate) {
    // Two frames: one for the element to exist at its start state, one for the
    // class change to be a transition rather than the initial paint.
    requestAnimationFrame(() => requestAnimationFrame(() => backdrop.classList.add("open")));
  } else {
    backdrop.classList.add("open");
  }
  again.focus();
  return handle;
}
