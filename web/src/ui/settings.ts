import { ACHIEVEMENTS, earned as earnedIds, loadProgress } from "../achievements";
import {
  SOUND_CHOICES,
  SOUND_OFF,
  SOUND_PRESETS,
  soundLabel,
} from "../audio/presets";
import { previewSound, setSoundPreset, setSoundVolume } from "../audio/sound";
import { screens } from "../config/screens";
import { hapticsSupported } from "../haptics";
import {
  clampHoldMs,
  holdLabel,
  HOLD_MS_MAX,
  HOLD_MS_MIN,
  HOLD_MS_STEP,
  longPressSupported,
} from "../input/hold";
import { allBestTimes } from "../leaderboard";
import { animationsEnabled } from "../settings";
import { checkForUpdate, loadDeployedBuild } from "../update";
import {
  activeScheme,
  SCHEME_KEYS,
  SCHEME_LABELS,
  THEME_KEYS,
  theme as themeDef,
  themePalette,
  themeVars,
  type Scheme,
  type SchemePref,
} from "./theme";

// The settings page. It is not a modal: the menu already has a page mechanism
// (`Menu.go`, which re-runs the current view), so settings is one more page in
// it, built from the same `.menu-entry` cards as every other row. That keeps
// the phone layout, the scrolling body and the back-row idiom for free.
//
// Five sections: the best times (a page below, like the theme picker), the two
// appearance settings — the theme (the board's cell style and the page it sits
// on) and the colour scheme (which palette the chrome paints with), each a page
// below — the sound / haptics / animations behaviour rows, the Privacy switch,
// and an About block naming the build.
//
// Two pages rather than one list of every combination: the two axes are
// independent, so a single picker would be nine rows that all have to be read to
// find the two facts they encode.
//
// Two of those are conditional, on the same principle: a row is only offered
// where the thing behind it exists. Haptics needs a device that can buzz
// (`hapticsSupported`); Privacy needs a build that carries the play counter
// (`__APP_ANALYTICS__`). The About block holds no outward links: what is here is
// what this build can actually do.

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
  /** The stored colour-scheme preference; `"auto"` follows the device. */
  scheme: SchemePref;
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
  /** How long a press has to be held before it flags, in ms. */
  holdToFlagMs: number;
  /** Whether the page behind the board follows that board's own tiling. */
  backgrounds: boolean;
  /** Whether anonymous play counts are reported. */
  analytics: boolean;
  setTheme(key: string): void;
  setScheme(pref: SchemePref): void;
  setDifficulty(key: string): void;
  setAnimations(pref: boolean | null): void;
  setSound(key: string): void;
  /** Persist the volume. Unlike the other setters this must **not** re-render
   * the page: it is called from a slider the player is still holding. */
  setVolume(level: number): void;
  setHaptics(on: boolean): void;
  /** Persist the hold-to-flag duration. Like `setVolume` and unlike the rest,
   * this must **not** re-render the page: it comes from a slider under the
   * player's finger. */
  setHoldToFlag(ms: number): void;
  setBackgrounds(on: boolean): void;
  setAnalytics(on: boolean): void;
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

/** How many achievements are unlocked — the Achievements row's subtitle. Off
 * the stored record alone; nothing here builds a board. */
function earnedAchievements(): number {
  return earnedIds(loadProgress()).length;
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
 * WebGL preview — the point is to tell a few rows apart in a list, and a canvas
 * per row would cost a renderer each.
 *
 * Both pickers draw with it, which is why `scheme` is a parameter rather than
 * something read off the host: the theme page shows every theme under the scheme
 * in force, and the scheme page shows the theme in force under every scheme. */
function themeSwatch(key: string, scheme: Scheme): HTMLElement {
  const spec = themeDef(key);
  const el = document.createElement("span");
  el.className = "theme-swatch";
  for (const [name, value] of Object.entries(
    themeVars(themePalette(key, scheme), spec.texture?.[scheme]),
  )) {
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

/** Ask the *server* which build it is serving, and get onto it if it is not
 * this one (`src/update.ts`, where the whole rule and the reason for it live).
 *
 * The state of the service worker is deliberately not part of the answer: it
 * updates itself silently on launch, so "nothing is installing" says nothing
 * about whether this page is the newest build — which is how the check came to
 * report "up to date" on a phone that showed a new version the moment the app
 * was closed and reopened. */
async function checkForUpdates(status: HTMLElement): Promise<void> {
  status.textContent = "Checking…";
  const found = await checkForUpdate();
  if (found.state === "unreachable") {
    status.textContent = "Could not check for updates.";
    return;
  }
  if (found.state === "current") {
    status.textContent = "You are on the latest build.";
    return;
  }
  status.textContent = `Version ${found.build.version} found — updating…`;
  // Resolves by reloading, so anything after it is the case where the download
  // is still running: the next launch will finish it, which is worth saying
  // rather than leaving the row on "updating…" for good.
  if (!(await loadDeployedBuild())) {
    status.textContent = "The new build is still downloading — reopen the app to finish.";
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
      [themeSwatch(key, activeScheme(host.scheme)), textBlock(spec.label, spec.hint), check],
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

/** The colour scheme page: Auto, Light, Dark. A page of its own beside the
 * theme, and for the same reason the sound picker is one — it is a short list of
 * choices, and the settings row above already reports which is on.
 *
 * Each row wears the *current theme* under that scheme, so the list previews
 * what picking it does rather than naming a colour. Auto shows whichever way the
 * device currently leans and says so, which is the same shape as the Animations
 * row's "Following your system setting (on/off)" — a preference that defers has
 * to show what it is deferring to, or it reads as broken on the day the two
 * disagree.
 *
 * No footer about the next board: unlike a theme, a scheme is chrome and page
 * only. The board is lit head-on by a fixed rig and reads the same either way,
 * so the change is complete the moment it is made — including on a board still
 * in play behind the menu. */
export function renderSchemePicker(host: SettingsHost): DocumentFragment {
  const frag = document.createDocumentFragment();
  const list = document.createElement("ul");
  list.className = "menu-list";
  const following = activeScheme("auto");
  for (const key of SCHEME_KEYS) {
    const check = document.createElement("span");
    check.className = "settings-check";
    check.textContent = key === host.scheme ? "✓" : "";
    const hint =
      key === "auto"
        ? `Following your device (${SCHEME_LABELS[following].toLowerCase()})`
        : key === "light"
          ? "Always the light palette"
          : "Always the dark palette";
    const { li, btn } = buttonRow(
      [
        themeSwatch(host.theme, key === "auto" ? following : key),
        textBlock(SCHEME_LABELS[key], hint),
        check,
      ],
      () => host.setScheme(key),
      "settings-theme",
    );
    btn.dataset["scheme"] = key;
    btn.setAttribute("aria-pressed", String(key === host.scheme));
    if (key === host.scheme) btn.classList.add("active");
    list.append(li);
  }
  frag.append(list);
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

/** The hold-to-flag row: a slider setting how long a press has to be held on a
 * touch screen before it plants a flag.
 *
 * Shaped like the volume row and for the same reason — it is a level rather
 * than a choice, so a list of named speeds would be a list of guesses about the
 * player's hand — and it does not re-render its page either: the value is being
 * dragged. Unlike the volume there is nothing to preview, so the label updated
 * in place *is* the feedback while dragging, and the change is felt on the next
 * held press (`controls.ts` asks at every press).
 *
 * The row is inline on the settings page rather than behind a page of its own:
 * it is one control, and the sound row has a page because there are four
 * presets and a level under it. */
function holdRow(host: SettingsHost): HTMLElement {
  const li = document.createElement("li");
  const box = document.createElement("div");
  box.className = "menu-entry settings-static settings-volume settings-hold";
  const text = textBlock("Hold to flag", holdLabel(host.holdToFlagMs));
  const hint = text.querySelector(".menu-entry-hint");

  const slider = document.createElement("input");
  slider.type = "range";
  slider.className = "settings-range";
  slider.min = String(HOLD_MS_MIN);
  slider.max = String(HOLD_MS_MAX);
  slider.step = String(HOLD_MS_STEP);
  slider.value = String(clampHoldMs(host.holdToFlagMs));
  slider.dataset["setting"] = "hold-to-flag";
  slider.setAttribute("aria-label", "Hold to flag");
  const ms = (): number => clampHoldMs(Number(slider.value));
  slider.addEventListener("input", () => {
    if (hint) hint.textContent = holdLabel(ms());
  });
  slider.addEventListener("change", () => host.setHoldToFlag(ms()));

  box.append(text, slider);
  li.append(box);
  return li;
}

/** The pages this one opens. An object rather than a run of positional
 * callbacks: there are five of them now, and at the call site five bare arrows
 * in a row say nothing about which is which. */
export interface SettingsPages {
  openThemes(): void;
  openSchemes(): void;
  openBestTimes(): void;
  openSounds(): void;
  openAchievements(): void;
}

/** Build the settings page body. The caller (Menu) supplies the back row and
 * puts this into `.menu-body`; `pages` opens the pages below it. */
export function renderSettings(host: SettingsHost, pages: SettingsPages): DocumentFragment {
  const { openThemes, openSchemes, openBestTimes, openSounds, openAchievements } = pages;
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

  // Above the times, because it is the wider record: the times say how fast one
  // board went, this says how much of the catalogue has been played at all.
  const achievementsChevron = document.createElement("span");
  achievementsChevron.className = "menu-entry-chevron";
  achievementsChevron.textContent = "›";
  const earned = earnedAchievements();
  const { li: achLi, btn: achBtn } = buttonRow(
    [
      textBlock(
        "Achievements",
        earned === 0
          ? `None yet · ${ACHIEVEMENTS.length} to unlock`
          : `${earned} of ${ACHIEVEMENTS.length} unlocked`,
      ),
      achievementsChevron,
    ],
    openAchievements,
    "menu-submenu",
  );
  achBtn.dataset["settingsGroup"] = "achievements";

  records.append(achLi, bestLi);
  frag.append(records);

  // -- Appearance ------------------------------------------------------------
  frag.append(heading("Appearance"));
  const appearance = document.createElement("ul");
  appearance.className = "menu-list";
  const chevron = document.createElement("span");
  chevron.className = "menu-entry-chevron";
  chevron.textContent = "›";
  const scheme = activeScheme(host.scheme);
  const { li: themeLi, btn: themeBtn } = buttonRow(
    [
      themeSwatch(host.theme, scheme),
      textBlock("Theme", themeDef(host.theme).label),
      chevron,
    ],
    openThemes,
    "menu-submenu",
  );
  themeBtn.dataset["settingsGroup"] = "theme";
  appearance.append(themeLi);

  // The second half of what used to be one setting. It reports the *choice*
  // rather than what the choice resolves to, with the resolution in brackets —
  // "Auto" alone would leave a player who wanted dark unable to tell whether
  // their device had been asked and answered light, or the setting had not
  // taken.
  const schemeChevron = document.createElement("span");
  schemeChevron.className = "menu-entry-chevron";
  schemeChevron.textContent = "›";
  const { li: schemeLi, btn: schemeBtn } = buttonRow(
    [
      themeSwatch(host.theme, scheme),
      textBlock(
        "Colour scheme",
        host.scheme === "auto"
          ? `Auto · ${SCHEME_LABELS[scheme].toLowerCase()}`
          : SCHEME_LABELS[host.scheme],
      ),
      schemeChevron,
    ],
    openSchemes,
    "menu-submenu",
  );
  schemeBtn.dataset["settingsGroup"] = "scheme";
  appearance.append(schemeLi);

  // Beside the theme rather than under Behaviour: this is what the page is
  // made of, not what the game does. It is shown whatever theme is active,
  // unlike the conditional rows below — the setting is real either way, and
  // only its *effect* waits for a theme that has a pattern to draw. Saying so
  // in the hint beats a row that appears and disappears with the theme.
  const bgKnob = document.createElement("span");
  bgKnob.className = "settings-switch";
  const { li: bgLi, btn: bgBtn } = buttonRow(
    [
      textBlock(
        "Custom backgrounds",
        themeDef(host.theme).patterned
          ? "The page behind the board follows its own tiling"
          : "The page follows the board's tiling, on the Realistic theme",
      ),
      bgKnob,
    ],
    () => host.setBackgrounds(!host.backgrounds),
    "settings-toggle",
  );
  bgBtn.dataset["setting"] = "backgrounds";
  bgBtn.setAttribute("role", "switch");
  bgBtn.setAttribute("aria-checked", String(host.backgrounds));
  bgBtn.classList.toggle("on", host.backgrounds);
  appearance.append(bgLi);
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

  // Conditional on the same principle as the haptics row below: `controls.ts`
  // arms the hold for a touch or a pen and never for a mouse, which flags by
  // right-click instead, so on a machine with no touch screen the setting has
  // nothing behind it and gets no row rather than a slider that changes
  // nothing.
  if (longPressSupported()) behaviour.append(holdRow(host));

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

  // -- Privacy ---------------------------------------------------------------
  // Its own section rather than a fourth Behaviour row: sound, haptics and
  // animations are what the game *does*, and this is what leaves the machine.
  // Someone who came to the settings page looking for it should find it by
  // heading. Left out entirely of any build that carries no collector — the
  // packaged apps, a dev server (analytics.ts folds away under
  // __APP_ANALYTICS__) — because a switch there would promise something with
  // nothing behind it, exactly as with the update row below and
  // the haptics row on a device that cannot buzz.
  if (__APP_ANALYTICS__) {
    frag.append(heading("Privacy"));
    const privacy = document.createElement("ul");
    privacy.className = "menu-list";
    const statsKnob = document.createElement("span");
    statsKnob.className = "settings-switch";
    const { li: statsLi, btn: statsBtn } = buttonRow(
      [
        textBlock("Analytics", "Anonymous counts of which boards are played and won"),
        statsKnob,
      ],
      () => host.setAnalytics(!host.analytics),
      "settings-toggle",
    );
    statsBtn.dataset["setting"] = "analytics";
    statsBtn.setAttribute("role", "switch");
    statsBtn.setAttribute("aria-checked", String(host.analytics));
    statsBtn.classList.toggle("on", host.analytics);
    privacy.append(statsLi);
    frag.append(privacy);

    const note = document.createElement("p");
    note.className = "settings-note";
    note.textContent =
      "No account, no cookie, no identifier — only the board's name, the " +
      "difficulty, whether it was won and how long it took.";
    frag.append(note);
  }

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
    // The status goes *under* the label, in the row's own text block, rather
    // than opposite it as a value: some of what it has to say is a sentence
    // ("the new build is still downloading — reopen the app to finish"), and at
    // the right-hand edge of a phone-width row that squeezed "Check for
    // updates" onto three lines and ran straight over them. A hint line is the
    // page's own idiom for a row that explains itself, and it wraps.
    const status = document.createElement("span");
    status.className = "menu-entry-hint settings-status";
    const label = textBlock("Check for updates");
    label.append(status);
    const { li: updLi, btn: updBtn } = buttonRow(
      [label],
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
