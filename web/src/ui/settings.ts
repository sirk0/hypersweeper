import {
  SOUND_CHOICES,
  SOUND_OFF,
  SOUND_PRESETS,
  soundLabel,
} from "../audio/presets";
import { previewSound, setSoundPreset, setSoundVolume } from "../audio/sound";
import { screens } from "../config/screens";
import { hapticsSupported } from "../haptics";
import { allBestTimes } from "../leaderboard";
import { animationsEnabled } from "../settings";
import { THEME_KEYS, theme as themeDef, themePalette, themeVars } from "./theme";

// The settings page. It is not a modal: the menu already has a page mechanism
// (`Menu.go`, which re-runs the current view), so settings is one more page in
// it, built from the same `.menu-entry` cards as every other row. That keeps
// the phone layout, the scrolling body and the back-row idiom for free.
//
// Four sections: the best times (a page below, like the theme picker), the
// theme (one page below — a theme now carries the chrome palette *and* the
// board's cell style, so there is no second appearance picker to pair with it),
// the sound / haptics / animations behaviour rows, and an About block naming the
// build.
//
// The Haptics row is conditional (`hapticsSupported`) and the About block holds
// no outward links: what is here is what this build can actually do.

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

/** The live view of the stored preferences that the menu reads and writes.
 * Implemented by `App` over `settings.ts`. */
export interface SettingsHost {
  /** The active theme key. */
  theme: string;
  /** The difficulty the menu launches boards at. */
  difficulty: string;
  /** The stored animations preference; `null` follows the OS setting. */
  animations: boolean | null;
  /** The active sound choice: a key in `SOUND_PRESETS`, or `"off"`. */
  sound: string;
  /** How loud it plays, 0..1. */
  volume: number;
  /** Whether the game buzzes on a flag, a win and a mine. */
  haptics: boolean;
  setTheme(key: string): void;
  setDifficulty(key: string): void;
  setAnimations(pref: boolean | null): void;
  setSound(key: string): void;
  /** Persist the volume. Unlike the other setters this must **not** re-render
   * the page: it is called from a slider the player is still holding. */
  setVolume(level: number): void;
  setHaptics(on: boolean): void;
}

/** A 0..1 level as the percentage the slider row reports. */
function volumeLabel(level: number): string {
  return `${Math.round(level * 100)}%`;
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

/** A theme in miniature: its page field (texture and all), a chrome card on it,
 * a strip of board tiles cut the way that theme cuts them — one of the four
 * "opened" — and an accent dot. Both halves of what a theme now means, so the
 * picker shows the difference rather than naming it.
 *
 * It is not a picture of the theme, it *is* the theme: every custom property
 * `applyTheme` writes to the document is written to this 38px box instead, so
 * the miniature resolves its colours through the same `var(--…)` chain the real
 * chrome does and no colour is written twice. The tiles are CSS rather than a
 * WebGL preview — the point is to tell four rows apart in a list, and a canvas
 * per row would cost a renderer each. */
function themeSwatch(key: string): HTMLElement {
  const spec = themeDef(key);
  const el = document.createElement("span");
  el.className = "theme-swatch";
  for (const [name, value] of Object.entries(themeVars(themePalette(key), spec.texture))) {
    el.style.setProperty(name, value);
  }
  const card = document.createElement("span");
  card.className = "theme-swatch-card";
  const cells = document.createElement("span");
  cells.className = "cell-swatch";
  cells.dataset["cellStyle"] = spec.cellStyle;
  for (let i = 0; i < 4; i++) {
    const tile = document.createElement("span");
    tile.className = i === 3 ? "cell-swatch-tile open" : "cell-swatch-tile";
    cells.append(tile);
  }
  const dot = document.createElement("span");
  dot.className = "theme-swatch-dot";
  el.append(card, cells, dot);
  return el;
}

/** A preset's voice in miniature: a bar per partial, as tall as that partial is
 * loud. Derived from the preset's own timbre numbers rather than drawn, so the
 * three swatches differ exactly where the three presets do — Chime's harmonics
 * fall away smoothly, Arcade's even ones are missing (the hollow square-wave
 * tone), Blocks' drop off a cliff. `off` shows the same bars flattened. */
function soundSwatch(key: string): HTMLElement {
  const el = document.createElement("span");
  el.className = "sound-swatch";
  el.dataset["sound"] = key;
  const preset = SOUND_PRESETS[key];
  const bars = 5;
  for (let k = 1; k <= bars; k++) {
    const bar = document.createElement("span");
    bar.className = "sound-swatch-bar";
    const amp =
      preset && !(preset.timbre.oddOnly && k % 2 === 0)
        ? 1 / k ** preset.timbre.decay
        : 0;
    bar.style.height = `${Math.round(12 + 88 * amp)}%`;
    el.append(bar);
  }
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
 * Theme row on the settings page rather than being spelled out there — the rows
 * carry a preview each and would bury the rest of the page, and the row already
 * reports which one is on. Picking stays on the page, so the choice is visible
 * immediately in the chrome around it.
 *
 * A theme changes the **board** too now (its cell style), and a style fixes the
 * mesh's vertex layout, so a board in play is never re-cut — hence the footer.
 * The chrome half of the change is instant either way. */
export function renderThemePicker(host: SettingsHost): DocumentFragment {
  const frag = document.createDocumentFragment();
  const list = document.createElement("ul");
  list.className = "menu-list";
  for (const key of THEME_KEYS) {
    const spec = themeDef(key);
    const check = document.createElement("span");
    check.className = "settings-check";
    check.textContent = key === host.theme ? "✓" : "";
    const { li, btn } = buttonRow(
      [themeSwatch(key), textBlock(spec.label, spec.hint), check],
      () => host.setTheme(key),
      "settings-theme",
    );
    btn.dataset["theme"] = key;
    btn.setAttribute("aria-pressed", String(key === host.theme));
    if (key === host.theme) btn.classList.add("active");
    list.append(li);
  }
  frag.append(list);
  const note = document.createElement("p");
  note.className = "settings-footer";
  note.textContent = "The board's tiles change on the next board you open.";
  frag.append(note);
  return frag;
}

/** The sound page: the three presets and Off. A page of its own like the theme
 * picker, and for the same reason — it is a list of choices,
 * and the row above it already reports which one is on.
 *
 * Picking one **plays it**. A preset is a sound, so a list of names alone would
 * be a list of guesses; and the click that chooses it is a user gesture, which
 * is the only moment a browser will let audio start at all — so the preview is
 * also what unlocks the first sound of the session. */
export function renderSoundPicker(host: SettingsHost): DocumentFragment {
  const frag = document.createDocumentFragment();
  const list = document.createElement("ul");
  list.className = "menu-list";
  for (const key of SOUND_CHOICES) {
    const preset = SOUND_PRESETS[key];
    const check = document.createElement("span");
    check.className = "settings-check";
    check.textContent = key === host.sound ? "✓" : "";
    const { li, btn } = buttonRow(
      [
        soundSwatch(key),
        textBlock(
          preset?.label ?? "Off",
          preset?.hint ?? "No sound at all",
        ),
        check,
      ],
      () => {
        host.setSound(key);
        // The host has persisted it by now, so the preview plays the preset
        // just chosen — including nothing at all for Off.
        setSoundPreset(key);
        if (key !== SOUND_OFF) previewSound();
      },
      "settings-sound",
    );
    btn.dataset["sound"] = key;
    btn.setAttribute("aria-pressed", String(key === host.sound));
    if (key === host.sound) btn.classList.add("active");
    list.append(li);
  }
  // Off has no level to set, so the slider is left out rather than sitting
  // there doing nothing; picking a preset re-renders the page and brings it
  // back. It joins the same list as the presets so the page keeps one rhythm —
  // a second `<ul>` would butt against the first, since the rows are spaced by
  // the list's own gap.
  if (host.sound !== SOUND_OFF) list.append(volumeRow(host));
  frag.append(list);

  const note = document.createElement("p");
  note.className = "settings-footer";
  note.textContent =
    "Tiles are pitched by their shape, panned by where they are on the board, " +
    "and a chain reaction opens as a cascade.";
  frag.append(note);
  return frag;
}

/** The volume row: a slider capping how loud the game plays, under the preset
 * list on the sound page (it is a level for the preset chosen there, so this is
 * where it belongs — the settings row above reports both).
 *
 * It is the one control here that does not re-render its page, because the
 * player is still holding it: dragging feeds the engine directly, so the change
 * is audible in the cascade already ringing, and only letting go persists the
 * value and plays the preview. The label is updated in place for the same
 * reason. */
function volumeRow(host: SettingsHost): HTMLElement {
  const li = document.createElement("li");
  const box = document.createElement("div");
  box.className = "menu-entry settings-static settings-volume";
  const text = textBlock("Volume", volumeLabel(host.volume));
  const hint = text.querySelector(".menu-entry-hint");

  const slider = document.createElement("input");
  slider.type = "range";
  slider.className = "settings-range";
  slider.min = "0";
  slider.max = "100";
  slider.step = "5";
  slider.value = String(Math.round(host.volume * 100));
  slider.dataset["setting"] = "volume";
  slider.setAttribute("aria-label", "Volume");
  const level = (): number => Number(slider.value) / 100;
  slider.addEventListener("input", () => {
    setSoundVolume(level());
    if (hint) hint.textContent = volumeLabel(level());
  });
  slider.addEventListener("change", () => {
    host.setVolume(level());
    previewSound(); // the same sample the preset rows play, at the new level
  });

  box.append(text, slider);
  li.append(box);
  return li;
}

/** Build the settings page body. The caller (Menu) supplies the back row and
 * puts this into `.menu-body`; `openThemes`, `openBestTimes` and `openSounds`
 * open the pages below it. */
export function renderSettings(
  host: SettingsHost,
  openThemes: () => void,
  openBestTimes: () => void,
  openSounds: () => void,
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
      textBlock("Theme", themeDef(host.theme).label),
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

  const soundChevron = document.createElement("span");
  soundChevron.className = "menu-entry-chevron";
  soundChevron.textContent = "›";
  // Both halves of the sound setting, since the page below holds both: which
  // preset, and how loud it plays.
  const soundHint =
    host.sound === SOUND_OFF
      ? soundLabel(host.sound)
      : `${soundLabel(host.sound)} · ${volumeLabel(host.volume)}`;
  const { li: soundLi, btn: soundBtn } = buttonRow(
    [soundSwatch(host.sound), textBlock("Sound", soundHint), soundChevron],
    openSounds,
    "menu-submenu",
  );
  soundBtn.dataset["settingsGroup"] = "sound";
  behaviour.append(soundLi);

  // Only where there is something to feel. On the iOS app this is the Taptic
  // Engine; in a browser, the Vibration API (or iOS Safari's one fixed tick).
  // A desktop browser with neither gets no row rather than a switch that
  // promises a buzz nothing can deliver.
  if (hapticsSupported()) {
    const buzzKnob = document.createElement("span");
    buzzKnob.className = "settings-switch";
    const { li: hapticLi, btn: hapticBtn } = buttonRow(
      [
        textBlock("Haptics", "Buzzes on a flag, a win and a mine"),
        buzzKnob,
      ],
      () => host.setHaptics(!host.haptics),
      "settings-toggle",
    );
    hapticBtn.dataset["setting"] = "haptics";
    hapticBtn.setAttribute("role", "switch");
    hapticBtn.setAttribute("aria-checked", String(host.haptics));
    hapticBtn.classList.toggle("on", host.haptics);
    behaviour.append(hapticLi);
  }

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

  // A packaged app (macOS, iOS) carries its build inside the bundle: there is
  // no service worker and nothing to fetch, so the row is left out entirely
  // rather than sitting there to report that updates are unavailable.
  if (!__APP_PACKAGED__) {
    const status = document.createElement("span");
    status.className = "menu-entry-hint settings-status";
    const { li: updLi, btn: updBtn } = buttonRow(
      [textBlock("Check for updates"), status],
      () => void checkForUpdates(status),
      "settings-update",
    );
    updBtn.dataset["action"] = "check-updates";
    about.append(updLi);
  }

  // Nothing links out of here: the About block reports what this build *is*
  // (its version, and whether a newer one is waiting), and a settings page that
  // sends the player to another site is not part of playing the game.
  frag.append(about);

  const footer = document.createElement("p");
  footer.className = "settings-footer";
  footer.textContent = `${screens.menu.title} — boards from flat tilings to Klein bottles.`;
  frag.append(footer);

  return frag;
}
