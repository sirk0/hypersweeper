// The settings screen: the player's choices (src/preferences.ts), then what
// this build is, and whether a newer one is deployed. The check itself is the shared one (`@tiling/platform`'s
// update.ts, Hypersweeper's too): it asks the server's `version.json`, not the
// service worker, and only then gets the worker onto the new build. A packaged
// app (the desktop shell) carries its build inside the bundle and has nothing
// to check against, so the row is left out there.

import { checkForUpdate, loadDeployedBuild } from "@tiling/platform";
import { preferences, setPreferences, type Preferences } from "../preferences";

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
  host.append(heading, list);
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
