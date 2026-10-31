// The level list down the right-hand side, in sections by family — named for
// their symmetry: flag-transitive, vertex-transitive, 2-isogonal. Each level
// shows what a player starts with and nothing more: the outline of its board,
// the tiles in its tray, its vertex configuration as its name (3.4.6.4), and
// the best of three stars earned. No picture of the tiling itself — that is
// the puzzle.

import { GROUPS, type Level } from "../levels";
import { outlineIcon, starRow, tileIcon } from "./icons";

export function renderLevelList(
  host: HTMLElement,
  levels: Level[],
  current: string,
  stars: (key: string) => number,
  pick: (level: Level) => void,
): void {
  host.replaceChildren();
  for (const group of GROUPS) {
    const members = levels.filter((l) => l.group === group.key);
    if (members.length === 0) continue;
    const section = document.createElement("li");
    section.className = "level-group";
    const heading = document.createElement("h3");
    heading.textContent = group.name;
    heading.title = group.hint;
    const list = document.createElement("ol");
    for (const level of members) list.appendChild(levelItem(level, current, stars, pick));
    section.append(heading, list);
    host.appendChild(section);
  }
}

function levelItem(
  level: Level,
  current: string,
  stars: (key: string) => number,
  pick: (level: Level) => void,
): HTMLLIElement {
  const li = document.createElement("li");
  const button = document.createElement("button");
  button.type = "button";
  button.className = "level-pick";
  button.title = level.label;
  if (level.key === current) button.setAttribute("aria-current", "true");

  const name = document.createElement("span");
  name.className = "level-name";
  name.textContent = level.name;

  const tiles = document.createElement("span");
  tiles.className = "level-tiles";
  tiles.setAttribute("aria-label", `tiles: ${level.tiles.map((t) => `${t.verts.length}-gon`).join(", ")}`);
  level.tiles.forEach((_, kind) => tiles.appendChild(tileIcon(level, kind)));

  const row = starRow(stars(level.key));

  const text = document.createElement("span");
  text.className = "level-text";
  const bottom = document.createElement("span");
  bottom.className = "level-row";
  bottom.append(tiles, row);
  text.append(name, bottom);
  button.append(outlineIcon(level), text);
  button.addEventListener("click", () => pick(level));
  li.appendChild(button);
  return li;
}
