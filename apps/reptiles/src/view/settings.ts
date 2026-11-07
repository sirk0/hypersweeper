// The settings screen: what this build is, and whether a newer one is
// deployed. The check itself is the shared one (`@tiling/platform`'s
// update.ts, Hypersweeper's too): it asks the server's `version.json`, not the
// service worker, and only then gets the worker onto the new build. A packaged
// app (the desktop shell) carries its build inside the bundle and has nothing
// to check against, so the row is left out there.
//
// Above it, how the boards are drawn: whether a coloured board draws a line
// across every edge between two tiles of one colour (`prefs.ts`).

import { checkForUpdate, loadDeployedBuild } from "@tiling/platform";
import { setShowLines, showLines } from "../prefs";

/** This build: the package version, and the short commit on a CI build. */
export function buildVersion(): string {
  return __APP_COMMIT__ ? `${__APP_VERSION__} (${__APP_COMMIT__})` : __APP_VERSION__;
}

export function renderSettings(host: HTMLElement): void {
  host.replaceChildren();
  host.append(...boardSettings());
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

/** The board's drawing: a switch for the lines across same-colour edges. */
function boardSettings(): HTMLElement[] {
  const heading = document.createElement("h2");
  heading.textContent = "Boards";
  const list = document.createElement("ul");
  list.className = "settings-list";
  const button = document.createElement("button");
  button.type = "button";
  button.className = "settings-row";
  button.dataset["action"] = "toggle-lines";
  button.setAttribute("role", "switch");
  const { block, hint } = textBlock("Lines on coloured boards");
  hint.textContent = "A line across each edge between two tiles of one colour";
  const value = document.createElement("span");
  value.className = "settings-value";
  value.dataset["value"] = "lines";
  const show = (): void => {
    const on = showLines();
    button.setAttribute("aria-checked", String(on));
    value.textContent = on ? "On" : "Off";
  };
  show();
  button.addEventListener("click", () => {
    setShowLines(!showLines());
    show();
  });
  button.append(block, value);
  list.append(item(button));
  return [heading, list];
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
