import { screens, themeSpec } from "../config/screens";
import { animationsEnabled } from "../settings";
import { THEME_KEYS } from "./theme";

// The settings page. It is not a modal: the menu already has a page mechanism
// (`Menu.go`, which re-runs the current view), so settings is one more page in
// it, built from the same `.menu-entry` cards as every other row. That keeps
// the phone layout, the scrolling body and the back-row idiom for free.
//
// Three sections: the theme picker (the pygame palettes, ported in
// data/ui/screens.json), the animations override, and an About block naming
// the build.

/** The gear that opens this page. Hand-drawn like the header icons in hud.ts
 * rather than generated like the board art in icons.ts, and stroked in
 * `currentColor` so it follows the theme's text colour. */
export const GEAR_ICON = `<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
  <path d="M12 15.2a3.2 3.2 0 1 0 0-6.4 3.2 3.2 0 0 0 0 6.4Z"
    fill="none" stroke="currentColor" stroke-width="1.7"/>
  <path d="M19.4 13a7.6 7.6 0 0 0 0-2l1.9-1.5-1.9-3.3-2.3.9a7.6 7.6 0 0 0-1.7-1L15 3.6h-3.8L10.9 6a7.6 7.6 0 0 0-1.8 1l-2.3-.9L4.9 9.5 6.8 11a7.6 7.6 0 0 0 0 2l-1.9 1.5 1.9 3.3 2.3-.9a7.6 7.6 0 0 0 1.8 1l.3 2.5H15l.4-2.5a7.6 7.6 0 0 0 1.7-1l2.3.9 1.9-3.3Z"
    fill="none" stroke="currentColor" stroke-width="1.7"
    stroke-linejoin="round"/>
</svg>`;

/** The app's build identity: the package version, plus the short commit on a
 * CI build (empty locally, where the version alone is all there is). */
export function buildVersion(): string {
  return __APP_COMMIT__ ? `${__APP_VERSION__} (${__APP_COMMIT__})` : __APP_VERSION__;
}

/** The pygame build, which GitHub Pages serves at the site root while this app
 * mounts under `/next/`. `null` when there is no such sibling (the dev server
 * and any plain-root deploy), so the link is only offered where it works. */
function classicBuildHref(): string | null {
  const base = import.meta.env.BASE_URL;
  return base.endsWith("next/") ? base.slice(0, -"next/".length) : null;
}

const REPO_URL = "https://github.com/sirk0/minesweeper-tiles";

export interface SettingsHost {
  /** The active theme key. */
  theme: string;
  /** The stored animations preference; `null` follows the OS setting. */
  animations: boolean | null;
  setTheme(key: string): void;
  setAnimations(pref: boolean | null): void;
}

function heading(text: string): HTMLElement {
  const el = document.createElement("h2");
  el.className = "settings-heading";
  el.textContent = text;
  return el;
}

/** A theme's palette in miniature: its page field, a card on top and an accent
 * dot — enough to tell the seven apart at a glance without naming colours. */
function themeSwatch(key: string): HTMLElement {
  const spec = themeSpec(key);
  const el = document.createElement("span");
  el.className = "theme-swatch";
  el.style.background = spec.background;
  el.style.borderColor = spec.border;
  const card = document.createElement("span");
  card.className = "theme-swatch-card";
  card.style.background = spec.panel;
  const dot = document.createElement("span");
  dot.className = "theme-swatch-dot";
  dot.style.background = spec.accent;
  el.append(card, dot);
  return el;
}

function textBlock(label: string, hint?: string): HTMLElement {
  const box = document.createElement("span");
  box.className = "menu-entry-text";
  const labelEl = document.createElement("span");
  labelEl.className = "menu-entry-label";
  labelEl.textContent = label;
  box.append(labelEl);
  if (hint !== undefined) {
    const hintEl = document.createElement("span");
    hintEl.className = "menu-entry-hint";
    hintEl.textContent = hint;
    box.append(hintEl);
  }
  return box;
}

function row(children: HTMLElement[], cls = ""): HTMLElement {
  const li = document.createElement("li");
  const el = document.createElement("div");
  el.className = `menu-entry settings-static ${cls}`.trim();
  el.append(...children);
  li.append(el);
  return li;
}

function buttonRow(
  children: HTMLElement[],
  onClick: () => void,
  cls = "",
): { li: HTMLElement; btn: HTMLButtonElement } {
  const li = document.createElement("li");
  const btn = document.createElement("button");
  btn.className = `menu-entry ${cls}`.trim();
  btn.append(...children);
  btn.addEventListener("click", onClick);
  li.append(btn);
  return { li, btn };
}

function linkRow(label: string, href: string, hint: string): HTMLElement {
  const li = document.createElement("li");
  const a = document.createElement("a");
  a.className = "menu-entry settings-link";
  a.href = href;
  a.target = "_blank";
  a.rel = "noopener noreferrer";
  a.append(textBlock(label, hint));
  const chevron = document.createElement("span");
  chevron.className = "menu-entry-chevron";
  chevron.textContent = "›";
  a.append(chevron);
  li.append(a);
  return li;
}

/** Ask the service worker for a fresh build. In dev (and any browser without
 * one) there is nothing registered, which is reported rather than hidden. */
async function checkForUpdates(status: HTMLElement): Promise<void> {
  status.textContent = "Checking…";
  const sw = navigator.serviceWorker;
  if (!sw) {
    status.textContent = "Updates are not available in this browser.";
    return;
  }
  try {
    const reg = await sw.getRegistration();
    if (!reg) {
      status.textContent = "No installed build to update (running from source).";
      return;
    }
    await reg.update();
    if (reg.installing ?? reg.waiting) {
      status.textContent = "A new build is downloading — reloading…";
      window.setTimeout(() => window.location.reload(), 800);
    } else {
      status.textContent = "You are on the latest build.";
    }
  } catch {
    status.textContent = "Could not check for updates.";
  }
}

/** Build the settings page body. The caller (Menu) supplies the back row and
 * puts this into `.menu-body`. */
export function renderSettings(host: SettingsHost): DocumentFragment {
  const frag = document.createDocumentFragment();

  // -- Appearance ------------------------------------------------------------
  frag.append(heading("Appearance"));
  const themes = document.createElement("ul");
  themes.className = "menu-list";
  for (const key of THEME_KEYS) {
    const check = document.createElement("span");
    check.className = "settings-check";
    check.textContent = key === host.theme ? "✓" : "";
    const { li, btn } = buttonRow(
      [themeSwatch(key), textBlock(themeSpec(key).label), check],
      () => host.setTheme(key),
      "settings-theme",
    );
    btn.dataset["theme"] = key;
    btn.setAttribute("aria-pressed", String(key === host.theme));
    if (key === host.theme) btn.classList.add("active");
    themes.append(li);
  }
  frag.append(themes);

  // -- Behaviour -------------------------------------------------------------
  frag.append(heading("Behaviour"));
  const behaviour = document.createElement("ul");
  behaviour.className = "menu-list";
  const on = animationsEnabled(host.animations);
  const knob = document.createElement("span");
  knob.className = "settings-switch";
  const { li: animLi, btn: animBtn } = buttonRow(
    [
      textBlock(
        "Animations",
        host.animations === null
          ? `Following your system setting (${on ? "on" : "off"})`
          : "Reveals and explosions animate",
      ),
      knob,
    ],
    // Flipping the switch is an explicit choice, so it stops following the OS.
    () => host.setAnimations(!on),
    "settings-toggle",
  );
  animBtn.dataset["setting"] = "animations";
  animBtn.setAttribute("role", "switch");
  animBtn.setAttribute("aria-checked", String(on));
  animBtn.classList.toggle("on", on);
  behaviour.append(animLi);
  frag.append(behaviour);

  // -- About -----------------------------------------------------------------
  frag.append(heading("About"));
  const about = document.createElement("ul");
  about.className = "menu-list";

  const version = document.createElement("span");
  version.className = "settings-value";
  version.dataset["value"] = "version";
  version.textContent = buildVersion();
  about.append(row([textBlock("Version"), version]));

  const status = document.createElement("span");
  status.className = "menu-entry-hint settings-status";
  const { li: updLi, btn: updBtn } = buttonRow(
    [textBlock("Check for updates"), status],
    () => void checkForUpdates(status),
    "settings-update",
  );
  updBtn.dataset["action"] = "check-updates";
  about.append(updLi);

  about.append(linkRow("Source code", REPO_URL, "github.com/sirk0/minesweeper-tiles"));
  const classic = classicBuildHref();
  if (classic) {
    about.append(linkRow("Original pygame build", classic, "The Python version of this game"));
  }
  frag.append(about);

  const footer = document.createElement("p");
  footer.className = "settings-footer";
  footer.textContent = `${screens.menu.title} — boards from flat tilings to Klein bottles.`;
  frag.append(footer);

  return frag;
}
