import { screens, themeSpec } from "../config/screens";
import { allBestTimes } from "../leaderboard";
import { animationsEnabled } from "../settings";
import { THEME_KEYS } from "./theme";

// The settings page. It is not a modal: the menu already has a page mechanism
// (`Menu.go`, which re-runs the current view), so settings is one more page in
// it, built from the same `.menu-entry` cards as every other row. That keeps
// the phone layout, the scrolling body and the back-row idiom for free.
//
// Four sections: the best times (a page below, like the theme picker), the
// theme picker (the pygame palettes, ported in data/ui/screens.json), the
// animations override, and an About block naming the build.

/** The gear that opens this page, filled in `currentColor` so it follows the
 * theme's text colour.
 *
 * The outline is *generated* rather than hand-drawn: eight teeth at 45°, each
 * an arc at the tip radius joined to the root arc by slanted flanks, every
 * point placed by (r, θ) about (12, 12). That makes it symmetric under a 45°
 * rotation by construction — so it spans 2.52..21.48 on both axes and the hub
 * hole sits on the exact centre, which a path typed out by hand does not. The
 * hub is punched out by `fill-rule="evenodd"`. */
export const GEAR_ICON = `<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
  <path fill="currentColor" fill-rule="evenodd" d="M21.48 10.50A9.6 9.6 0 0 1 21.48 13.50L18.60 13.65A6.8 6.8 0 0 1 17.83 15.50L19.77 17.64A9.6 9.6 0 0 1 17.64 19.77L15.50 17.83A6.8 6.8 0 0 1 13.65 18.60L13.50 21.48A9.6 9.6 0 0 1 10.50 21.48L10.35 18.60A6.8 6.8 0 0 1 8.50 17.83L6.36 19.77A9.6 9.6 0 0 1 4.23 17.64L6.17 15.50A6.8 6.8 0 0 1 5.40 13.65L2.52 13.50A9.6 9.6 0 0 1 2.52 10.50L5.40 10.35A6.8 6.8 0 0 1 6.17 8.50L4.23 6.36A9.6 9.6 0 0 1 6.36 4.23L8.50 6.17A6.8 6.8 0 0 1 10.35 5.40L10.50 2.52A9.6 9.6 0 0 1 13.50 2.52L13.65 5.40A6.8 6.8 0 0 1 15.50 6.17L17.64 4.23A9.6 9.6 0 0 1 19.77 6.36L17.83 8.50A6.8 6.8 0 0 1 18.60 10.35L21.48 10.50ZM8.6 12A3.4 3.4 0 1 0 15.4 12A3.4 3.4 0 1 0 8.6 12Z"/>
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

/** The live view of the stored preferences that the menu reads and writes.
 * Implemented by `App` over `settings.ts`. */
export interface SettingsHost {
  /** The active theme key. */
  theme: string;
  /** The difficulty the menu launches boards at. */
  difficulty: string;
  /** The stored animations preference; `null` follows the OS setting. */
  animations: boolean | null;
  setTheme(key: string): void;
  setDifficulty(key: string): void;
  setAnimations(pref: boolean | null): void;
}

/** How many distinct boards have a recorded time — the Best times row's
 * subtitle. Counted over the stored keys rather than the catalog, so it costs
 * one read however many boards the build has. */
function boardsWithTimes(): number {
  const modes = new Set<string>();
  for (const key of allBestTimes().keys()) modes.add(key.slice(0, key.indexOf("|")));
  return modes.size;
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

/** The theme page: the full list, ticked at the active one. Reached from the
 * Theme row on the settings page rather than being spelled out there — seven
 * palettes would bury the rest of the page, and the row already reports which
 * one is on. Picking stays on the page, so the choice is visible immediately in
 * the chrome around it. */
export function renderThemePicker(host: SettingsHost): DocumentFragment {
  const frag = document.createDocumentFragment();
  const list = document.createElement("ul");
  list.className = "menu-list";
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
    list.append(li);
  }
  frag.append(list);
  return frag;
}

/** Build the settings page body. The caller (Menu) supplies the back row and
 * puts this into `.menu-body`; `openThemes` and `openBestTimes` open the pages
 * below it. */
export function renderSettings(
  host: SettingsHost,
  openThemes: () => void,
  openBestTimes: () => void,
): DocumentFragment {
  const frag = document.createDocumentFragment();

  // -- Records ---------------------------------------------------------------
  frag.append(heading("Records"));
  const records = document.createElement("ul");
  records.className = "menu-list";
  const recordsChevron = document.createElement("span");
  recordsChevron.className = "menu-entry-chevron";
  recordsChevron.textContent = "›";
  const boards = boardsWithTimes();
  const { li: bestLi, btn: bestBtn } = buttonRow(
    [
      textBlock(
        "Best times",
        boards === 0
          ? "No times yet"
          : `${boards} ${boards === 1 ? "board" : "boards"} · fastest three each`,
      ),
      recordsChevron,
    ],
    openBestTimes,
    "menu-submenu",
  );
  bestBtn.dataset["settingsGroup"] = "best-times";
  records.append(bestLi);
  frag.append(records);

  // -- Appearance ------------------------------------------------------------
  frag.append(heading("Appearance"));
  const appearance = document.createElement("ul");
  appearance.className = "menu-list";
  const chevron = document.createElement("span");
  chevron.className = "menu-entry-chevron";
  chevron.textContent = "›";
  const { li: themeLi, btn: themeBtn } = buttonRow(
    [
      themeSwatch(host.theme),
      textBlock("Theme", themeSpec(host.theme).label),
      chevron,
    ],
    openThemes,
    "menu-submenu",
  );
  themeBtn.dataset["settingsGroup"] = "theme";
  appearance.append(themeLi);
  frag.append(appearance);

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
