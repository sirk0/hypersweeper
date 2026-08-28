import { fullModeLabel } from "../boards/catalog";
import { fairnessHint, fairnessOf } from "../boards/fairness";
import { screens, type HudSlot } from "../config/screens";
import { ICONS, slotVisible } from "./hud";
import { planeLie, symmetryIcon, type SymmetryPicture } from "./symmetryIcon";

// Three small things drawn around a board, all about telling the player what
// they are looking at.
//
// **The name** says which board it is. Nothing else on the game screen does:
// the menu's Flat and 3D rows each open a *random* board, so a player could be
// dropped on a truncated icosahedron or a Möbius strip with no way to find out
// which. It is also what makes a screenshot of the game say what it is.
//
// It is drawn *behind* the board rather than above it — its own fixed layer,
// inserted before the canvas, which is transparent — so it costs the board no
// height and a board zoomed up over it simply covers it. What the name *means*
// is spelled out by the header's info button (ui/infoDialog.ts).
//
// **The caption** is the row under the header carrying the board's own
// controls, the symmetry chevrons and mirrors, which do not fit in the header
// row once it holds two slots a side. Nothing else is on that row: a board with
// no symmetries has no row at all. How-to-play briefly sat at its right end and
// was taken off again — the game screen already carries a header, a control row
// and the board itself, and a page link on top of that is clutter; the menu's ?
// is where the rules live.
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

/** One control on the caption row, from its shared-config slot: the same
 * `hud-btn` classes and `data-slot` name the header's own buttons carry, so a
 * control reads and is found the same wherever it is drawn. */
function button(slot: HudSlot, onAction: (action: string) => void): HTMLButtonElement {
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
  return btn;
}

export class BoardInfo {
  /** The caption strip: the board's own controls (the symmetry chevrons and
   * mirrors). Sits in the `#ui` flex column directly under the header, so it is
   * part of the space the board is framed below. A board with all of them shows
   * six or seven, so the row wraps; a board with none hides the strip. */
  readonly caption: HTMLElement;
  /** The board's name, drawn behind the board. Not in the `#ui` column at all —
   * the app inserts it before the canvas (see the `App` constructor), which is
   * where the stacking order that puts the board over it comes from. */
  readonly nameLayer: HTMLElement;
  private readonly nameEl: HTMLElement;
  private readonly barButtons: HTMLElement[] = [];
  private readonly controls: HTMLElement;
  /** The first-run hint, positioned over the board rather than in the column —
   * it is transient, and reserving layout for it would shift the board when it
   * left. */
  readonly hint: HTMLElement;

  private hintTimer = 0;

  constructor(onAction: (action: string) => void) {
    this.caption = document.createElement("div");
    this.caption.className = "board-caption";
    this.caption.hidden = true;

    this.nameLayer = document.createElement("div");
    this.nameLayer.className = "board-name-layer";
    this.nameLayer.hidden = true;
    this.nameEl = document.createElement("span");
    this.nameEl.className = "board-name";
    this.nameLayer.append(this.nameEl);

    // The controls sit in a group of their own so they wrap as a block: on a
    // narrow phone a board with seven of them does not fit on one line, and one
    // orphaned button below the rest reads as a mistake where a second whole
    // row reads as a row.
    const controls = document.createElement("div");
    controls.className = "board-caption-controls";
    this.caption.append(controls);

    // Built from the shared config like the header's slots, and with the same
    // `hud-btn` classes and `data-slot` names, so a control reads and is found
    // the same wherever it is drawn.
    for (const slot of screens.hud.boardBar) {
      const btn = button(slot, onAction);
      btn.hidden = true; // until the board says it has this symmetry
      this.barButtons.push(btn);
      controls.append(btn);
    }
    this.controls = controls;

    this.hint = document.createElement("div");
    this.hint.className = "board-hint";
    this.hint.hidden = true;
    // Announced, but never in the way: a tap on the hint should open the cell
    // underneath it like any other tap on the board.
    this.hint.setAttribute("role", "status");
  }

  /** Name the board on screen, and show the controls it has. `conditions` is
   * what the board's symmetries make true (see `boardConditions`); a slot with
   * no `visibleWhen` is always shown. `pictures` says what each control's
   * motion looks like, which is what its icon is drawn from — see
   * ui/symmetryIcon.ts. */
  setBoard(
    mode: string,
    difficulty: string,
    conditions: ReadonlySet<string> = new Set(),
    pictures: ReadonlyMap<string, SymmetryPicture> = new Map(),
  ): void {
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
      btn.hidden = !slotVisible(btn.dataset["visibleWhen"], conditions);
    }
    this.drawIcons(pictures);
    // A board with no controls hides the strip outright rather than reserving
    // an empty row: the name is not in it, so there is nothing in there to
    // reserve the height for.
    const bare = this.barButtons.every((b) => b.hidden);
    this.controls.hidden = bare;
    this.caption.hidden = bare;
    this.nameLayer.hidden = false;
  }

  /** Re-draw the icons alone. The renderer turns a landscape flat board on its
   * side when the viewport goes portrait, and a mirror line turns with it, so
   * this is called again whenever the board is re-framed. */
  drawIcons(pictures: ReadonlyMap<string, SymmetryPicture>): void {
    for (const btn of this.barButtons) {
      const slot = screens.hud.boardBar.find((entry) => entry.slot === btn.dataset["slot"]);
      if (!slot?.action) continue;
      const [, id, step] = slot.action.split(":");
      const picture = pictures.get(id ?? "");
      const drawn = picture ? symmetryIcon(picture, Number(step)) : null;
      const fallback = slot.icon ? ICONS[slot.icon] : undefined;
      const icon = drawn ?? fallback;
      if (icon) btn.innerHTML = icon;
      // the icon says what the motion is, so the label can stop guessing
      const label = (picture && describe(picture, Number(step))) ?? slot.label ?? slot.slot;
      btn.setAttribute("aria-label", label);
      btn.title = label;
      // what a test asserts against: the pixels of a 26px glyph are no evidence
      if (!picture) continue;
      btn.dataset["motion"] = picture.kind;
      if (picture.kind === "turn") btn.dataset["turns"] = String(picture.turns);
      else delete btn.dataset["turns"];
      if (picture.kind === "reflection") btn.dataset["mirror"] = planeLie(picture.normal);
      else delete btn.dataset["mirror"];
    }
  }

  hide(): void {
    this.caption.hidden = true;
    this.nameLayer.hidden = true;
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

/** What a control does, in words, for the tooltip and for a screen reader: the
 * icon's own content spelled out. A turn names its angle, a reflection the line
 * it mirrors in. */
function describe(picture: SymmetryPicture, direction: number): string | null {
  if (picture.kind === "turn") {
    const degrees = Math.round(360 / picture.turns);
    return direction < 0 ? `Turn back ${degrees}°` : `Turn ${degrees}°`;
  }
  if (picture.kind === "reflection") {
    return {
      vertical: "Mirror in a vertical plane (left to right)",
      horizontal: "Mirror in a horizontal plane (top to bottom)",
      diagonal: "Mirror in a diagonal plane",
      facing: "Mirror in the plane facing you (front to back)",
    }[planeLie(picture.normal)];
  }
  return null;
}
