// The catalog — called Tilings on screen: every level, a family to a row — named for its symmetry —
// each row scrolling sideways through its levels' cards. A
// card shows what a player starts with (the board's outline, the tray's
// tiles), the level's name, its difficulty as Hypersweeper's three bars, and
// the stars earned on it.
//
// A tiling whose tiles also come marked — its matching rules and colourings
// (`markedOf`) — says how many on its card, and opens its own page
// (`renderTiling`): the plain tiles first, then the marked ones under Matching
// rules and Colourings. A figure set's page lists them the same way after its
// plain tilings (`renderMarked`).

import { BARS, bandOf, scoreOf } from "../difficulty";
import { GROUPS, MARKED_GROUPS, markedOf, type Level } from "../levels";
import { barsIcon, outlineIcon, starRow, tileIcon } from "./icons";

export function renderCatalog(
  host: HTMLElement,
  levels: Level[],
  stars: (key: string) => number,
  pick: (level: Level) => void,
  pickTiling: (level: Level) => void,
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
    for (const level of members) {
      const marked = markedOf(level.key).length;
      row.appendChild(levelCard(level, stars(level.key), marked ? pickTiling : pick, marked));
    }
    section.append(heading, hint, row);
    host.appendChild(section);
  }
}

/** A section of cards under a heading and a hint, in a grid. */
function gridSection(
  name: string,
  about: string,
  levels: Level[],
  stars: (key: string) => number,
  pick: (level: Level) => void,
  key: string,
): HTMLElement {
  const section = document.createElement("section");
  section.className = "family marked-group";
  section.dataset["group"] = key;
  const heading = document.createElement("h2");
  heading.textContent = name;
  const hint = document.createElement("p");
  hint.className = "family-hint";
  hint.textContent = about;
  const grid = document.createElement("div");
  grid.className = "figure-grid";
  for (const level of levels) grid.appendChild(levelCard(level, stars(level.key), pick));
  section.append(heading, hint, grid);
  return section;
}

/** The marked levels of `plain` — each tiling's matching rules, then its
 * colourings, easiest first — as sections appended to `host`. */
export function renderMarked(
  host: HTMLElement,
  plain: Level[],
  stars: (key: string) => number,
  pick: (level: Level) => void,
): void {
  const marked = plain.flatMap((l) => markedOf(l.key));
  for (const group of MARKED_GROUPS) {
    const members = marked
      .filter((l) => l.group === group.key)
      .sort((a, b) => scoreOf(a.key) - scoreOf(b.key));
    if (members.length)
      host.appendChild(gridSection(group.name, group.hint, members, stars, pick, group.key));
  }
}

/** One tiling's page: its plain tiles, then its matching rules and its
 * colourings. */
export function renderTiling(
  host: HTMLElement,
  plain: Level,
  stars: (key: string) => number,
  pick: (level: Level) => void,
): void {
  host.replaceChildren();
  host.appendChild(gridSection("Plain tiles", plain.label, [plain], stars, pick, "plain"));
  renderMarked(host, [plain], stars, pick);
}

/** A level's card: its outline, tray tiles, name, how many boards its tiling
 * has (where more than one), how many marked levels it has (`marked`, where
 * any), difficulty and stars — the best on any of its boards. */
export function levelCard(
  level: Level,
  earned: number,
  pick: (level: Level) => void,
  marked = 0,
): HTMLButtonElement {
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
  button.append(outlineIcon(level), tiles, name);
  if (level.boards > 1) {
    const boards = document.createElement("span");
    boards.className = "card-boards";
    boards.textContent = `${level.boards} boards`;
    button.append(boards);
  }
  if (marked > 0) {
    // a tiling with marked levels opens its page: plain, rules, colourings
    button.dataset["marked"] = String(marked);
    const more = document.createElement("span");
    more.className = "card-marked";
    more.textContent = `+${marked} marked`;
    button.append(more);
  }
  button.append(meta);
  button.addEventListener("click", () => pick(level));
  return button;
}
