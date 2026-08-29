import type { BoardSymmetry } from "../boards/core";
import { screens, type HudSlot } from "../config/screens";
import { DEFAULT_HOLD_MS } from "../input/hold";

// The game header, rendered from the shared UI-screen config
// (`data/ui/screens.json`) rather than hand-laid-out, so the pygame and TS
// front-ends can share one description of the chrome. M0 renders the header
// statically; wiring the actions to a live game session lands in M1.

// Inline SVGs for slots whose config declares an `icon` we can draw; slots
// with no entry here fall back to their text label. The flag mirrors the
// in-game glyph (glyphAtlas.ts drawFlag): dark pole and base, red pennant —
// the one icon that keeps fixed colours, because it stands for the game's own
// flag rather than for a control. The rest stroke in `currentColor` so they
// follow the theme's text colour (a fixed dark stroke would vanish on the dark
// theme's buttons). Sized by CSS (--hud-icon) rather than hard-coded
// width/height attributes, so the header controls can grow to a comfortable
// touch size on phones.
export const ICONS: Record<string, string> = {
  flag: `<svg viewBox="0 0 24 24" aria-hidden="true">
    <path d="M6.4 18.1 H11.6 L13.6 20.4 H4.4 Z" fill="#3a3f4b"/>
    <rect x="3.6" y="20.4" width="10.8" height="1.5" fill="#22252d"/>
    <path d="M8.5 3.8 H9.5 L9.9 18.1 H8.1 Z" fill="#2b2f3a"/>
    <circle cx="9" cy="3.8" r="0.9" fill="#2b2f3a"/>
    <path d="M9 4.2 C12.2 2.8 15.4 4.2 19 5.5
             C16 7.6 12.6 8 9.5 10.9 Z" fill="#e5534b"/>
    <path d="M19 5.5 L9.5 10.9 C12.6 8 16 7.6 19 5.5 Z" fill="#b93731"/>
  </svg>`,
  // Back to the menu.
  "arrow-left": `<svg viewBox="0 0 24 24" aria-hidden="true">
    <path d="M20 12 H5 M11 5 L4 12 L11 19" stroke="currentColor"
      stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
  </svg>`,
  // The board-symmetry controls, drawn on the board bar rather than in this
  // header (see ui/boardInfo.ts) but kept in one icon table so a slot's `icon`
  // name resolves the same either way.
  //
  // The double chevrons are the finished article: a **step** round the ring
  // (left/right) or round the tube (up/down) has no angle to show. The turn and
  // mirror drawings below are only what a button holds until the board it
  // belongs to has been measured — each of those is generated from the motion
  // the button really makes, so the arc is the actual angle and the mirror line
  // the actual plane (ui/symmetryIcon.ts).
  "chevrons-left": `<svg viewBox="0 0 24 24" aria-hidden="true">
    <path d="M17 5 L10 12 L17 19 M11 5 L4 12 L11 19" stroke="currentColor"
      stroke-width="1.9" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
  </svg>`,
  "chevrons-right": `<svg viewBox="0 0 24 24" aria-hidden="true">
    <path d="M7 5 L14 12 L7 19 M13 5 L20 12 L13 19" stroke="currentColor"
      stroke-width="1.9" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
  </svg>`,
  "chevrons-up": `<svg viewBox="0 0 24 24" aria-hidden="true">
    <path d="M5 17 L12 10 L19 17 M5 11 L12 4 L19 11" stroke="currentColor"
      stroke-width="1.9" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
  </svg>`,
  "chevrons-down": `<svg viewBox="0 0 24 24" aria-hidden="true">
    <path d="M5 7 L12 14 L19 7 M5 13 L12 20 L19 13" stroke="currentColor"
      stroke-width="1.9" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
  </svg>`,
  // Fallbacks (see above): a generic turn and a generic mirror, replaced by the
  // board's own the moment one is on screen.
  "rotate-right": `<svg viewBox="0 0 24 24" aria-hidden="true">
    <path d="M19.5 12 A7.5 7.5 0 1 1 12 4.5" stroke="currentColor"
      stroke-width="1.9" fill="none" stroke-linecap="round"/>
    <path d="M8.9 1.4 L12.6 4.5 L8.9 7.6" stroke="currentColor"
      stroke-width="1.9" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
  </svg>`,
  "rotate-left": `<svg viewBox="0 0 24 24" aria-hidden="true">
    <path d="M4.5 12 A7.5 7.5 0 1 0 12 4.5" stroke="currentColor"
      stroke-width="1.9" fill="none" stroke-linecap="round"/>
    <path d="M15.1 1.4 L11.4 4.5 L15.1 7.6" stroke="currentColor"
      stroke-width="1.9" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
  </svg>`,

  "mirror-vertical": `<svg viewBox="0 0 24 24" aria-hidden="true">
    <path d="M12 3 V21" stroke="currentColor" stroke-width="1.5"
      stroke-dasharray="2.4 2.6" stroke-linecap="round"/>
    <path d="M4 6 L10.2 12 L4 18 Z" fill="currentColor"/>
    <path d="M20 6 L13.8 12 L20 18 Z" fill="none" stroke="currentColor"
      stroke-width="1.6" stroke-linejoin="round"/>
  </svg>`,
  "mirror-horizontal": `<svg viewBox="0 0 24 24" aria-hidden="true">
    <path d="M3 12 H21" stroke="currentColor" stroke-width="1.5"
      stroke-dasharray="2.4 2.6" stroke-linecap="round"/>
    <path d="M6 4 L18 4 L12 10.2 Z" fill="currentColor"/>
    <path d="M6 20 L18 20 L12 13.8 Z" fill="none" stroke="currentColor"
      stroke-width="1.6" stroke-linejoin="round"/>
  </svg>`,
  // What this board is: the info window (ui/infoDialog.ts). The same ring as
  // the ? beside it, with the i's dot and stem on one centre line for the same
  // reason the question mark's are.
  // Another board, dealt at random from the half of the catalogue this one came
  // from (boards/randomBoard.ts). A die, and deliberately not the shuffle
  // arrows: this board already has controls that reorder its contents (the
  // symmetry chevrons on the row below), and a shuffle glyph in the header
  // would read as one more of those rather than as a new board. Three pips on
  // the diagonal — five turn into a blot at the 26px this is drawn at.
  random: `<svg viewBox="0 0 24 24" aria-hidden="true">
    <rect x="3.4" y="3.4" width="17.2" height="17.2" rx="4.4" stroke="currentColor"
      stroke-width="1.8" fill="none"/>
    <circle cx="8.3" cy="8.3" r="1.55" fill="currentColor"/>
    <circle cx="12" cy="12" r="1.55" fill="currentColor"/>
    <circle cx="15.7" cy="15.7" r="1.55" fill="currentColor"/>
  </svg>`,
  info: `<svg viewBox="0 0 24 24" aria-hidden="true">
    <circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="1.8" fill="none"/>
    <circle cx="12" cy="7.6" r="1.05" fill="currentColor"/>
    <path d="M12 10.9 V16.9" stroke="currentColor" stroke-width="1.8"
      fill="none" stroke-linecap="round"/>
  </svg>`,
  // How to play. The same question mark the menu header carries (help.ts), so
  // the two read as one control wherever the player meets it. The hook ends on
  // the glyph's own centre line (x = 12) and the dot sits under it: drawn with
  // the stem ending anywhere else, the dot reads as knocked sideways, which is
  // exactly what it was.
  help: `<svg viewBox="0 0 24 24" aria-hidden="true">
    <circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="1.8" fill="none"/>
    <path d="M9.1 9.5a2.9 2.9 0 1 1 2.9 3.3 V14.6" stroke="currentColor"
      stroke-width="1.8" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
    <circle cx="12" cy="17.4" r="1.05" fill="currentColor"/>
  </svg>`,
};

export interface HudState {
  minesRemaining: number;
  elapsedSeconds: number;
  status: "playing" | "won" | "lost";
  flagMode: boolean;
  /** Whether a press on the board is being counted towards a flag. The header's
   * flag blinks while it is — the finger doing the holding is covering the very
   * cell it will flag, so this is the only place the countdown can be shown. */
  holding: boolean;
  /** How long that hold lasts (Settings › Hold to flag), which is the beat the
   * blink runs at: two blinks and the flag lands. */
  holdMs: number;
  /** Which of the config's `visibleWhen` conditions this board meets — see
   * `boardConditions`. */
  conditions: ReadonlySet<string>;
}

/** The `visibleWhen` conditions a board satisfies (see the boardBar section of
 * `data/ui/screens.json`): `symmetry:<id>` for every symmetry it carries, and
 * `symmetry-pair:<id>` for the ones that are not their own inverse. A
 * reflection is, and so is a Klein bottle's half-tube step, so those get one
 * button where a translation gets a back/forward pair. */
export function boardConditions(symmetries: readonly BoardSymmetry[]): Set<string> {
  const conditions = new Set<string>();
  for (const symmetry of symmetries) {
    conditions.add(`symmetry:${symmetry.id}`);
    if (!symmetry.involution) conditions.add(`symmetry-pair:${symmetry.id}`);
  }
  return conditions;
}

/** Whether a slot with this `visibleWhen` shows on a board meeting
 * `conditions`. A slot with no condition always shows. */
export function slotVisible(
  condition: string | undefined,
  conditions: ReadonlySet<string>,
): boolean {
  return condition === undefined || conditions.has(condition);
}

export class Hud {
  readonly root: HTMLElement;
  private state: HudState = {
    minesRemaining: 0,
    elapsedSeconds: 0,
    status: "playing",
    flagMode: false,
    holding: false,
    holdMs: DEFAULT_HOLD_MS,
    conditions: new Set<string>(),
  };
  private readonly counters = new Map<string, HTMLElement>();
  private smiley: HTMLButtonElement | null = null;
  private flagBtn: HTMLButtonElement | null = null;

  constructor(private readonly onAction: (action: string) => void) {
    this.root = document.createElement("header");
    this.root.className = "hud";
    const cfg = screens.hud;
    this.root.append(
      this.cluster("hud-left", cfg.left),
      this.cluster("hud-center", cfg.center),
      this.cluster("hud-right", cfg.right),
    );
    this.render();
  }

  setState(next: Partial<HudState>): void {
    this.state = { ...this.state, ...next };
    this.render();
  }

  private cluster(cls: string, slots: HudSlot[]): HTMLElement {
    const el = document.createElement("div");
    el.className = `hud-cluster ${cls}`;
    for (const slot of slots) el.append(this.buildSlot(slot));
    return el;
  }

  private buildSlot(slot: HudSlot): HTMLElement {
    if (slot.kind === "counter") {
      const el = document.createElement("div");
      el.className = "hud-counter";
      el.dataset.slot = slot.slot;
      el.dataset.digits = String(slot.digits ?? 3);
      if (slot.source) this.counters.set(slot.source, el);
      return el;
    }
    if (slot.kind === "reset") {
      const btn = document.createElement("button");
      btn.className = "hud-smiley";
      btn.dataset.slot = slot.slot;
      btn.setAttribute("aria-label", "Restart");
      btn.addEventListener("click", () => this.onAction(slot.action ?? "restart"));
      this.smiley = btn;
      return btn;
    }
    const btn = document.createElement("button");
    btn.className = "hud-btn";
    btn.dataset.slot = slot.slot;
    const icon = slot.icon ? ICONS[slot.icon] : undefined;
    if (icon) {
      btn.classList.add("hud-icon-btn");
      btn.innerHTML = icon;
      btn.setAttribute("aria-label", slot.label ?? slot.slot);
      btn.title = slot.label ?? slot.slot;
    } else {
      btn.textContent = slot.label ?? slot.slot;
    }
    if (slot.action) btn.addEventListener("click", () => this.onAction(slot.action!));
    if (slot.slot === "flag-mode") this.flagBtn = btn;
    if (slot.visibleWhen) btn.dataset.visibleWhen = slot.visibleWhen;
    return btn;
  }

  private render(): void {
    const pad = (n: number, d: number) =>
      Math.max(0, Math.min(10 ** d - 1, Math.floor(n)))
        .toString()
        .padStart(d, "0");
    for (const [source, el] of this.counters) {
      const digits = Number(el.dataset.digits ?? 3);
      const value = source === "minesRemaining" ? this.state.minesRemaining : this.state.elapsedSeconds;
      el.textContent = pad(value, digits);
    }
    if (this.smiley) this.smiley.textContent = screens.smiley[this.state.status];
    if (this.flagBtn) {
      this.flagBtn.classList.toggle("active", this.state.flagMode);
      // The blink itself is CSS (`.hud-btn.holding`); what is set here is the
      // beat, so the icon pulses at the hold the player has chosen rather than
      // at one fixed rate that would say the same thing at 200 ms and at a
      // second.
      this.flagBtn.classList.toggle("holding", this.state.holding);
      this.flagBtn.style.setProperty("--hold-duration", `${this.state.holdMs}ms`);
    }
    // Toggle config-driven conditional visibility (the board-symmetry controls;
    // no header slot carries one today, but a slot reads the same either way).
    for (const btn of this.root.querySelectorAll<HTMLElement>("[data-visible-when]")) {
      const visible = slotVisible(btn.dataset.visibleWhen, this.state.conditions);
      btn.style.display = visible ? "" : "none";
    }
  }
}
