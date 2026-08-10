import { fullModeLabel } from "../boards/catalog";
import { fairnessHint, fairnessOf } from "../boards/fairness";
import { screens } from "../config/screens";
import { ICONS } from "./hud";

// Two small things drawn over a board, both about telling the player what they
// are looking at.
//
// **The caption** names the board. Until now nothing on the game screen did:
// the menu's Flat and 3D rows each open a *random* board, so a player could be
// dropped on a truncated icosahedron or a Möbius strip with no way to find out
// which. It is also what makes a screenshot of the game say what it is, which
// matters now that a board carries a share link.
//
// **The hint** is the app's only first-run affordance. Long-press-to-flag and
// right-click-to-flag were documented on the how-to-play page and nowhere else,
// which is no use to someone who has just tapped Classic and is looking at a
// grid. It shows once ever (`settings.seenHint`) and goes away on the first
// move, so it costs a returning player nothing.

/** How long the hint stays up if the player does nothing at all. */
const HINT_MS = 7000;

/** Whether this is a touch screen, which decides what the hint says. `hover:
 * none` rather than `maxTouchPoints`, which a touch-capable laptop also reports
 * while its user is on a mouse. */
function isTouch(): boolean {
  return typeof window.matchMedia === "function" && window.matchMedia("(hover: none)").matches;
}

export class BoardInfo {
  /** The caption strip. Sits in the `#ui` flex column directly under the
   * header, so it is part of the space the board is framed below. It also
   * carries the board's own controls — the Klein scroll chevrons — which do not
   * fit in the header row on a phone once it holds two slots a side. */
  readonly caption: HTMLElement;
  private readonly nameEl: HTMLElement;
  private readonly barButtons: HTMLElement[] = [];
  /** The first-run hint, positioned over the board rather than in the column —
   * it is transient, and reserving layout for it would shift the board when it
   * left. */
  readonly hint: HTMLElement;

  private hintTimer = 0;

  constructor(onAction: (action: string) => void) {
    this.caption = document.createElement("div");
    this.caption.className = "board-caption";
    this.caption.hidden = true;

    this.nameEl = document.createElement("span");
    this.nameEl.className = "board-caption-name";
    this.caption.append(this.nameEl);

    // Built from the shared config like the header's slots, and with the same
    // `hud-btn` classes and `data-slot` names, so a control reads and is found
    // the same wherever it is drawn.
    for (const slot of screens.hud.boardBar) {
      const btn = document.createElement("button");
      btn.className = "hud-btn hud-icon-btn board-bar-btn";
      btn.dataset.slot = slot.slot;
      const icon = slot.icon ? ICONS[slot.icon] : undefined;
      if (icon) btn.innerHTML = icon;
      else btn.textContent = slot.label ?? slot.slot;
      btn.setAttribute("aria-label", slot.label ?? slot.slot);
      btn.title = slot.label ?? slot.slot;
      if (slot.visibleWhen) btn.dataset.visibleWhen = slot.visibleWhen;
      if (slot.action) btn.addEventListener("click", () => onAction(slot.action!));
      btn.hidden = true;
      this.barButtons.push(btn);
      this.caption.append(btn);
    }

    this.hint = document.createElement("div");
    this.hint.className = "board-hint";
    this.hint.hidden = true;
    // Announced, but never in the way: a tap on the hint should open the cell
    // underneath it like any other tap on the board.
    this.hint.setAttribute("role", "status");
  }

  /** Name the board on screen, and show the controls it has. */
  setBoard(mode: string, difficulty: string, hasCellCycle = false): void {
    // The caption is also where a graded board says so. The menu row carries
    // the mark too, but the Flat and 3D entries deal a board at random and
    // never show that row -- and this is the board where losing is not the
    // player's fault, so it is the one that most needs saying. Only `warn`
    // reaches here: a blocked board never opens.
    const level = fairnessOf(mode, difficulty);
    const warning = fairnessHint(level);
    this.nameEl.textContent =
      warning === undefined ? fullModeLabel(mode) : `${fullModeLabel(mode)} ⚠`;
    this.nameEl.title = warning ?? "";
    for (const btn of this.barButtons) {
      const cond = btn.dataset["visibleWhen"];
      btn.hidden = cond === "hasCellCycle" ? !hasCellCycle : false;
    }
    this.caption.classList.toggle(
      "has-controls",
      this.barButtons.some((b) => !b.hidden),
    );
    this.caption.hidden = false;
  }

  hide(): void {
    this.caption.hidden = true;
    this.dismissHint();
  }

  /** Put the first-run hint up. The caller decides whether it is owed one; this
   * only knows how to show it. */
  showHint(): void {
    // A non-breaking hyphen in "right‑click": with the ordinary one the line
    // wraps mid-word on a narrow phone, which reads as a typo.
    this.hint.textContent = isTouch()
      ? "Tap to open · press and hold to flag"
      : "Click to open · right‑click to flag";
    this.hint.hidden = false;
    // Two frames, so the class change is a transition rather than the first
    // paint (the same trick the record window uses).
    requestAnimationFrame(() =>
      requestAnimationFrame(() => this.hint.classList.add("open")),
    );
    window.clearTimeout(this.hintTimer);
    this.hintTimer = window.setTimeout(() => this.dismissHint(), HINT_MS);
  }

  /** Take it down — on the first move, on leaving the board, or on its timer.
   * Safe to call when it was never shown. */
  dismissHint(): void {
    window.clearTimeout(this.hintTimer);
    this.hintTimer = 0;
    if (this.hint.hidden) return;
    this.hint.classList.remove("open");
    this.hint.hidden = true;
  }
}
