import { screens, type HudSlot } from "../config/screens";

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
const ICONS: Record<string, string> = {
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
  // Double chevrons for the two Klein scroll controls (back / forward).
  "chevrons-left": `<svg viewBox="0 0 24 24" aria-hidden="true">
    <path d="M17 5 L10 12 L17 19 M11 5 L4 12 L11 19" stroke="currentColor"
      stroke-width="1.9" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
  </svg>`,
  "chevrons-right": `<svg viewBox="0 0 24 24" aria-hidden="true">
    <path d="M7 5 L14 12 L7 19 M13 5 L20 12 L13 19" stroke="currentColor"
      stroke-width="1.9" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
  </svg>`,
};

export interface HudState {
  minesRemaining: number;
  elapsedSeconds: number;
  status: "playing" | "won" | "lost";
  flagMode: boolean;
  hasCellCycle: boolean;
}

export class Hud {
  readonly root: HTMLElement;
  private state: HudState = {
    minesRemaining: 0,
    elapsedSeconds: 0,
    status: "playing",
    flagMode: false,
    hasCellCycle: false,
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
    if (this.flagBtn) this.flagBtn.classList.toggle("active", this.state.flagMode);
    // Toggle config-driven conditional visibility (e.g. Klein scroll arrows).
    for (const btn of this.root.querySelectorAll<HTMLElement>("[data-visible-when]")) {
      const cond = btn.dataset.visibleWhen;
      const visible = cond === "hasCellCycle" ? this.state.hasCellCycle : true;
      btn.style.display = visible ? "" : "none";
    }
  }
}
