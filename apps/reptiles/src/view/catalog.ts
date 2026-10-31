// The catalog: every level, a family to a row — named for its symmetry, as the
// level list is — each row scrolling sideways through its levels' cards. A
// card shows what a player starts with (the board's outline, the tray's
// tiles), the level's name, its difficulty as Hypersweeper's three bars, and
// the stars earned on it.

import { BARS, bandOf } from "../difficulty";
import { GROUPS, type Level } from "../levels";
import { barsIcon, outlineIcon, starRow, tileIcon } from "./icons";

export function renderCatalog(
  host: HTMLElement,
  levels: Level[],
  stars: (key: string) => number,
  pick: (level: Level) => void,
): void {
  host.replaceChildren();
  for (const group of GROUPS) {
    const members = levels.filter((l) => l.group === group.key);
    if (members.length === 0) continue;
    const section = document.createElement("section");
    section.className = "family";
    const heading = document.createElement("h2");
    heading.textContent = group.name;
    const hint = document.createElement("p");
    hint.className = "family-hint";
    hint.textContent = group.hint;
    const row = document.createElement("div");
    row.className = "family-row";
    for (const level of members) row.appendChild(card(level, stars(level.key), pick));
    section.append(heading, hint, row);
    host.appendChild(section);
  }
}

function card(level: Level, earned: number, pick: (level: Level) => void): HTMLButtonElement {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "card";
  button.title = level.label;
  const band = bandOf(level.key);
  const name = document.createElement("span");
  name.className = "card-name";
  name.textContent = level.name;
  const tiles = document.createElement("span");
  tiles.className = "card-tiles";
  level.tiles.forEach((_, kind) => tiles.appendChild(tileIcon(level, kind)));
  const meta = document.createElement("span");
  meta.className = "card-meta";
  const bars = barsIcon(BARS[band]);
  bars.setAttribute("aria-hidden", "false");
  bars.setAttribute("role", "img");
  bars.setAttribute("aria-label", band);
  meta.append(bars, starRow(earned));
  button.append(outlineIcon(level), tiles, name, meta);
  button.addEventListener("click", () => pick(level));
  return button;
}
