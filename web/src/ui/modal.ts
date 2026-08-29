// The shell every modal in this app shares.
//
// There are two of them — the record window a win puts up (ui/scoreDialog.ts)
// and the info window the header's ⓘ opens (ui/infoDialog.ts) — and everything
// else that looks like a page *is* a page (the settings and how-to-play screens
// are `Menu` views for exactly that reason). A modal is for something that
// belongs on top of the board rather than instead of it, and that carries
// obligations no card should have to remember twice: Escape and a backdrop
// click close it, focus moves in on open and back to where it was on close, and
// tabbing stays inside it rather than walking off into the HUD behind the
// scrim, where clicks do not land.
//
// The caller builds the card and says what is in its tab ring; this owns the
// backdrop, the keys, the focus and the open transition. Everything is painted
// from theme custom properties by `styles.css`, so both windows follow all
// eight palettes with no per-theme code here.

export interface ModalHandle {
  readonly root: HTMLElement;
  /** Remove the window and restore focus. Safe to call twice — the app closes
   * its windows on restart and on the way back to the menu as well as from
   * their own buttons. */
  close(): void;
}

export interface ModalOptions {
  /** `data-dialog` on the backdrop: what a test (and a stylesheet) names this
   * window by. */
  name: string;
  /** Id of the element that titles it, for `aria-labelledby`. */
  labelledBy: string;
  /** Whether the open transition runs (the app's animations preference). */
  animate: boolean;
  /** The window's focusable controls, in tab order. Read on each key rather
   * than captured, so a card whose buttons come and go stays honest. */
  focusRing(): HTMLElement[];
  /** Where focus lands on open. Defaults to the first of the ring. */
  initialFocus?(): HTMLElement | null;
  onClose?(): void;
}

/** Mount `card` (a `.dialog`) in a backdrop on `host`, wired up as a modal. */
export function openModal(
  host: HTMLElement,
  card: HTMLElement,
  opts: ModalOptions,
): ModalHandle {
  const previousFocus = document.activeElement as HTMLElement | null;

  const backdrop = document.createElement("div");
  backdrop.className = "dialog-backdrop";
  backdrop.dataset["dialog"] = opts.name;
  card.setAttribute("role", "dialog");
  card.setAttribute("aria-modal", "true");
  card.setAttribute("aria-labelledby", opts.labelledBy);
  backdrop.append(card);

  // A click on the field around the card dismisses; one inside it must not.
  backdrop.addEventListener("click", (e) => {
    if (e.target === backdrop) handle.close();
  });

  const onKey = (e: KeyboardEvent): void => {
    if (e.key === "Escape") {
      e.preventDefault();
      handle.close();
      return;
    }
    if (e.key !== "Tab") return;
    const ring = opts.focusRing();
    const first = ring[0];
    const last = ring[ring.length - 1];
    if (!first || !last) return;
    const active = document.activeElement;
    if (e.shiftKey && (active === first || !card.contains(active))) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && active === last) {
      e.preventDefault();
      first.focus();
    }
  };
  // Capture, so the app's own window-level key handling (zoom, rotation) does
  // not act on keys aimed at the window.
  window.addEventListener("keydown", onKey, true);

  let closed = false;
  const handle: ModalHandle = {
    root: backdrop,
    close() {
      if (closed) return;
      closed = true;
      window.removeEventListener("keydown", onKey, true);
      backdrop.remove();
      previousFocus?.focus?.();
      opts.onClose?.();
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
  (opts.initialFocus?.() ?? opts.focusRing()[0])?.focus();
  return handle;
}

/** The × every window carries at its top right. */
export function closeButton(onClick: () => void): HTMLButtonElement {
  const btn = document.createElement("button");
  btn.className = "dialog-close";
  btn.textContent = "×";
  btn.dataset["action"] = "close";
  btn.setAttribute("aria-label", "Close");
  btn.addEventListener("click", onClick);
  return btn;
}
