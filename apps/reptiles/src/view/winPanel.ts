// The win panel: what a finished board shows in its tray card, in place of
// the tiles and controls — "Tiled!", the time, the three stars each with a
// word on what earned or lost it, and Play again and Next level.
//
// It is never a popup over the board. The card is sized for it when the level
// opens (`SvgBoard`'s `PanelSize`, measured here on a hidden copy holding the
// widest it can say), so a finish only swaps what is in the card: nothing
// moves or resizes.

import { formatTime } from "../progress";
import type { PanelSize } from "./svgBoard";

/** How a board was finished. */
export interface Result {
  /** Stars earned, 1 to 3. */
  stars: number;
  /** How many hints were shown. */
  hints: number;
  /** How many tray piles were not at 0. */
  off: number;
  /** The time taken, and the level's best before it (null: none). */
  ms: number;
  best: number | null;
  newBest: boolean;
}

/** The widest a panel can be: what its size is measured with. */
const WIDEST: Result = {
  stars: 1,
  hints: 99,
  off: 22,
  ms: 59 * 60_000 + 59_000,
  best: 59 * 60_000 + 59_000,
  newBest: false,
};

const plural = (n: number, one: string): string => `${n} ${one}${n === 1 ? "" : "s"}`;

/** The time, and the best it is measured against: "0:42", "0:42 · best
 * 0:38", "0:42 · new best!" — a first finish is only its time. */
export function timeLine(r: Result): string {
  const time = formatTime(r.ms);
  if (r.best === null) return time;
  return r.newBest ? `${time} · new best!` : `${time} · best ${formatTime(r.best)}`;
}

/** The three stars, each earned or not, a word under it and the whole of it
 * as its tooltip: covering the board, no hints, every pile at 0. */
export function starLines(r: Result): { earned: boolean; caption: string; title: string }[] {
  return [
    { earned: true, caption: "Covered", title: "Covered, no gaps, no overlaps." },
    r.hints === 0
      ? { earned: true, caption: "No hints", title: "No hints." }
      : {
          earned: false,
          caption: plural(r.hints, "hint"),
          title: `${plural(r.hints, "hint")} used.`,
        },
    r.off === 0
      ? { earned: true, caption: "Piles at 0", title: "Every pile in the tray down to 0." }
      : {
          earned: false,
          caption: `${plural(r.off, "pile")} off`,
          title: `${plural(r.off, "pile")} in the tray not at 0.`,
        },
  ];
}

/** Fill a panel (`.won-card`, or the hidden copy it is measured on) with `r`. */
export function fillPanel(root: HTMLElement, r: Result): void {
  root.querySelector("[data-won=time]")!.textContent = timeLine(r);
  const stars = root.querySelector("[data-won=stars]")!;
  stars.setAttribute("aria-label", `${r.stars} of 3 stars`);
  stars.replaceChildren(
    ...starLines(r).map(({ earned, caption, title }) => {
      const li = document.createElement("li");
      li.title = title;
      if (!earned) li.classList.add("lost");
      const star = document.createElement("span");
      star.className = "won-star";
      star.setAttribute("aria-hidden", "true");
      star.textContent = earned ? "★" : "☆";
      const words = document.createElement("span");
      words.className = "won-caption";
      words.textContent = caption;
      li.append(star, words);
      return li;
    }),
  );
}

/** How big the panel `card` (`.won-card`) is at its widest, at most
 * `maxWidth` across: measured on a hidden copy of it beside it, so the
 * stylesheet — fonts, a desktop's sizes — is the one it is shown with. */
export function panelSize(card: HTMLElement): PanelSize {
  let probe: HTMLElement | null = null;
  return (maxWidth) => {
    if (!probe) {
      const copy = card.cloneNode(true) as HTMLElement;
      for (const node of [copy, ...copy.querySelectorAll("[id]")]) node.removeAttribute("id");
      fillPanel(copy, WIDEST);
      probe = document.createElement("div");
      probe.className = "won-probe";
      probe.setAttribute("aria-hidden", "true");
      probe.append(copy);
      // beside the panel's own place, so it is styled as the panel is
      card.parentElement!.after(probe);
    }
    const copy = probe.firstElementChild as HTMLElement;
    copy.style.maxWidth = `${maxWidth}px`;
    const { width, height } = copy.getBoundingClientRect();
    return [Math.ceil(width), Math.ceil(height)];
  };
}
