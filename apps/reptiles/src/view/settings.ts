// The settings screen: the player's choices (src/preferences.ts) — the colour
// scheme, the sound theme and its volume, haptics where the device can buzz, then the board — then what this build is, whether a newer one is
// deployed, and the privacy policy. The check itself is the shared one (`@tiling/platform`'s
// update.ts, Hypersweeper's too): it asks the server's `version.json`, not the
// service worker, and only then gets the worker onto the new build. A packaged
// app (the desktop shell) carries its build inside the bundle and has nothing
// to check against, so the row is left out there — and so is the link to the
// privacy policy (public/privacy.html): as in Hypersweeper's packaged apps, the
// settings there hand no URL to the system browser.

import { checkForUpdate, loadDeployedBuild } from "@tiling/platform";
import {
  SOUND_CHOICES,
  SOUND_OFF,
  SOUND_PRESETS,
  swatchLevels,
  type SoundPreset,
} from "@tiling/sound";
import { hapticsSupported } from "../haptics";
import { preferences, setPreferences, type Preferences } from "../preferences";
import { applySound, playSound, THEME_HINTS } from "../sound";
import { deviceScheme, SCHEME_LABELS, SCHEMES, type SchemePref } from "../scheme";

/** This build: the package version, and the short commit on a CI build. */
export function buildVersion(): string {
  return __APP_COMMIT__ ? `${__APP_VERSION__} (${__APP_COMMIT__})` : __APP_VERSION__;
}

/** Draw the settings into `host`; `changed` hears of every choice the player
 * makes, once it is kept. */
export function renderSettings(
  host: HTMLElement,
  changed: (now: Preferences) => void = () => {},
): void {
  host.replaceChildren();
  const lookHeading = document.createElement("h2");
  lookHeading.textContent = "Appearance";
  const lookList = document.createElement("ul");
  lookList.className = "settings-list";
  lookList.append(
    item(
      schemeRow(preferences().scheme, (scheme) => {
        setPreferences({ scheme });
        changed(preferences());
      }),
    ),
  );
  host.append(lookHeading, lookList);

  const soundHeading = document.createElement("h2");
  soundHeading.textContent = "Sound";
  host.append(soundHeading, soundList(changed));
  // Only where something can buzz: a switch for feedback the device cannot
  // give is a promise the game can't keep.
  if (hapticsSupported()) {
    const hapticsList = document.createElement("ul");
    hapticsList.className = "settings-list";
    hapticsList.append(
      item(
        toggle(
          "haptics",
          "Haptics",
          "Buzzes when a tile lands and when a board is finished.",
          preferences().haptics,
          (on) => {
            setPreferences({ haptics: on });
            changed(preferences());
          },
        ),
      ),
    );
    host.append(hapticsList);
  }

  const boardHeading = document.createElement("h2");
  boardHeading.textContent = "Board";
  const boardList = document.createElement("ul");
  boardList.className = "settings-list";
  boardList.append(
    item(
      toggle(
        "tiling-past-board",
        "Tiling past a finished board",
        "Draw the tiling on to the screen's edges, and zoom out to see more of it.",
        preferences().tilingPastBoard,
        (on) => {
          setPreferences({ tilingPastBoard: on });
          changed(preferences());
        },
      ),
    ),
  );
  host.append(boardHeading, boardList);

  const heading = document.createElement("h2");
  heading.textContent = "About";
  const list = document.createElement("ul");
  list.className = "settings-list";

  const versionRow = document.createElement("div");
  versionRow.className = "settings-row";
  const version = document.createElement("span");
  version.className = "settings-value";
  version.dataset["value"] = "version";
  version.textContent = buildVersion();
  versionRow.append(textBlock("Version").block, version);
  list.append(item(versionRow));

  if (!__APP_PACKAGED__) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "settings-row";
    button.dataset["action"] = "check-updates";
    const { block, hint } = textBlock("Check for updates");
    button.append(block);
    button.addEventListener("click", () => void checkUpdates(hint));
    list.append(item(button));
  }

  // The privacy policy, in every build: App Review asks for it inside the app
  // as well as on the store page. On the web, the page the site serves at
  // /privacy, in a tab of its own so the player keeps their place here. In a
  // packaged app, the copy of public/privacy.html bundled with the game,
  // opened in place — the app links out to nothing, its web view has no tabs
  // and serves no clean URLs, and the policy's own "Play Rep-tiles" link
  // (`./`) comes back; the board in play is kept as the page is left.
  const policy = document.createElement("a");
  policy.className = "settings-row";
  policy.dataset["action"] = "privacy-policy";
  if (__APP_PACKAGED__) {
    policy.href = `${import.meta.env.BASE_URL}privacy.html`;
  } else {
    policy.href = `${import.meta.env.BASE_URL}privacy`;
    policy.target = "_blank";
    policy.rel = "noopener";
  }
  const arrow = document.createElement("span");
  arrow.className = "settings-value";
  arrow.setAttribute("aria-hidden", "true");
  arrow.textContent = __APP_PACKAGED__ ? "›" : "↗";
  policy.append(textBlock("Privacy policy").block, arrow);
  list.append(item(policy));
  host.append(heading, list);
}

/** The sound themes — Hypersweeper's three presets, then Off — each a row
 * with its swatch, the one in force ticked; and under them, while one is on,
 * the volume. Picking a theme plays it (and the click that picks it is the
 * gesture a browser lets audio start on); the slider is heard as it is
 * dragged, and kept, with a sample, when it is let go. */
function soundList(changed: (now: Preferences) => void): HTMLElement {
  const list = document.createElement("ul");
  list.className = "settings-list";
  list.setAttribute("role", "radiogroup");
  list.setAttribute("aria-label", "Sound");
  const rows = SOUND_CHOICES.map((key) => {
    const preset = SOUND_PRESETS[key] ?? null;
    const button = document.createElement("button");
    button.type = "button";
    button.className = "settings-row settings-sound";
    button.setAttribute("role", "radio");
    button.dataset["sound"] = key;
    const { block, hint } = textBlock(preset?.label ?? "Off");
    hint.textContent = THEME_HINTS[key] ?? preset?.hint ?? "";
    hint.removeAttribute("aria-live");
    const check = document.createElement("span");
    check.className = "settings-check";
    check.setAttribute("aria-hidden", "true");
    button.append(swatch(key, preset), block, check);
    button.addEventListener("click", () => {
      setPreferences({ sound: key });
      applySound(key, preferences().volume);
      show();
      playSound({ kind: "preview" });
      changed(preferences());
    });
    list.append(item(button));
    return button;
  });

  const volume = volumeRow((level, keep) => {
    applySound(preferences().sound, level);
    if (!keep) return;
    setPreferences({ volume: level });
    playSound({ kind: "preview" });
    changed(preferences());
  });
  const volumeItem = item(volume);
  list.append(volumeItem);

  const show = (): void => {
    const picked = preferences().sound;
    for (const row of rows) {
      const on = row.dataset["sound"] === picked;
      row.setAttribute("aria-checked", String(on));
      row.querySelector(".settings-check")!.textContent = on ? "✓" : "";
    }
    // Off has no level to set.
    volumeItem.hidden = picked === SOUND_OFF;
  };
  show();
  return list;
}

/** A theme's voice in miniature: a bar per partial, as loud as that partial
 * (`swatchLevels`, the same picture Hypersweeper's settings draw). */
function swatch(key: string, preset: SoundPreset | null): HTMLElement {
  const el = document.createElement("span");
  el.className = "sound-swatch";
  el.dataset["sound"] = key;
  el.setAttribute("aria-hidden", "true");
  for (const amp of swatchLevels(preset)) {
    const bar = document.createElement("span");
    bar.className = "sound-swatch-bar";
    bar.style.height = `${Math.round(12 + 88 * amp)}%`;
    el.append(bar);
  }
  return el;
}

/** The volume: a slider, 0–100%. `set(level, keep)` hears it as it is
 * dragged (`keep` false) and once more when it is let go (`keep` true). */
function volumeRow(set: (level: number, keep: boolean) => void): HTMLElement {
  const row = document.createElement("div");
  row.className = "settings-row";
  const { block, hint } = textBlock("Volume");
  const percent = (level: number): string => `${Math.round(level * 100)}%`;
  hint.textContent = percent(preferences().volume);
  hint.removeAttribute("aria-live");
  const slider = document.createElement("input");
  slider.type = "range";
  slider.className = "settings-range";
  slider.min = "0";
  slider.max = "100";
  slider.step = "5";
  slider.value = String(Math.round(preferences().volume * 100));
  slider.dataset["setting"] = "volume";
  slider.setAttribute("aria-label", "Volume");
  const level = (): number => Number(slider.value) / 100;
  slider.addEventListener("input", () => {
    hint.textContent = percent(level());
    set(level(), false);
  });
  slider.addEventListener("change", () => set(level(), true));
  row.append(block, slider);
  return row;
}

/** The colour scheme: Auto, Light and Dark side by side, the one in force
 * lit. Auto says which the device is asking for. */
function schemeRow(current: SchemePref, set: (scheme: SchemePref) => void): HTMLElement {
  const row = document.createElement("div");
  row.className = "settings-row";
  const { block, hint } = textBlock("Colour scheme");
  hint.removeAttribute("aria-live");
  const group = document.createElement("div");
  group.className = "settings-choice";
  group.setAttribute("role", "radiogroup");
  group.setAttribute("aria-label", "Colour scheme");
  const buttons = SCHEMES.map((scheme) => {
    const button = document.createElement("button");
    button.type = "button";
    button.setAttribute("role", "radio");
    button.dataset["scheme"] = scheme;
    button.textContent = SCHEME_LABELS[scheme];
    button.addEventListener("click", () => {
      show(scheme);
      set(scheme);
    });
    return button;
  });
  const show = (picked: SchemePref): void => {
    for (const button of buttons)
      button.setAttribute("aria-checked", String(button.dataset["scheme"] === picked));
    hint.textContent = picked === "auto" ? `Following your device (${deviceScheme()})` : "";
  };
  show(current);
  group.append(...buttons);
  row.append(block, group);
  return row;
}

/** A row that turns a choice on and off: a switch, its label and what it
 * does. */
function toggle(
  key: string,
  label: string,
  about: string,
  on: boolean,
  set: (on: boolean) => void,
): HTMLButtonElement {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "settings-row";
  button.setAttribute("role", "switch");
  button.dataset["setting"] = key;
  const { block, hint } = textBlock(label);
  hint.textContent = about;
  hint.removeAttribute("aria-live");
  const knob = document.createElement("span");
  knob.className = "settings-switch";
  knob.setAttribute("aria-hidden", "true");
  const show = (value: boolean): void => button.setAttribute("aria-checked", String(value));
  show(on);
  button.append(block, knob);
  button.addEventListener("click", () => {
    const next = button.getAttribute("aria-checked") !== "true";
    show(next);
    set(next);
  });
  return button;
}

function item(child: HTMLElement): HTMLLIElement {
  const li = document.createElement("li");
  li.append(child);
  return li;
}

function textBlock(label: string): { block: HTMLElement; hint: HTMLElement } {
  const block = document.createElement("span");
  block.className = "settings-text";
  const name = document.createElement("span");
  name.textContent = label;
  const hint = document.createElement("span");
  hint.className = "settings-hint";
  hint.setAttribute("aria-live", "polite");
  block.append(name, hint);
  return { block, hint };
}

async function checkUpdates(status: HTMLElement): Promise<void> {
  status.textContent = "Checking…";
  const found = await checkForUpdate(
    { version: __APP_VERSION__, commit: __APP_COMMIT__ },
    import.meta.env.BASE_URL,
  );
  if (found.state === "unreachable") {
    status.textContent = "Could not check for updates.";
    return;
  }
  if (found.state === "current") {
    status.textContent = "You are on the latest build.";
    return;
  }
  status.textContent = `Version ${found.build.version} found — updating…`;
  // Resolves by reloading; if it returns, the new build is still downloading.
  if (!(await loadDeployedBuild())) {
    status.textContent = "The new build is still downloading — reopen the app to finish.";
  }
}
