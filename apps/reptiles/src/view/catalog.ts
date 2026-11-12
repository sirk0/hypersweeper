// The catalog — called Tilings on screen: every tiling, a family to a row —
// named for its symmetry — each row scrolling sideways through its tilings'
// cards. A card shows what a player starts with (the first board's outline,
// the tray's tiles), the tiling's name, its first board's difficulty as
// Hypersweeper's three bars, and how many levels it is — every board by
// every way its tiles are marked (plain, matching rules, colourings) — with
// the stars earned on them. A tiling of more than one level opens its own
// page (view/picker.ts), where a board and its tiles are picked.

import { BARS, bandOf } from "../difficulty";
import { GROUPS, type Level } from "../levels";
import { barsIcon, outlineIcon, starRow, tileIcon } from "./icons";

/** How many levels the tiling `level` is the first board of has, and the
 * stars earned on them. */
export type Tally = (level: Level) => { levels: number; stars: number };

export function renderCatalog(
  host: HTMLElement,
  levels: Level[],
  tally: Tally,
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
      const counted = tally(level);
      row.appendChild(levelCard(level, counted, counted.levels > 1 ? pickTiling : pick));
    }
    section.append(heading, hint, row);
    host.appendChild(section);
  }
}

/** A tiling's card: its first board's outline, its tray's tiles, its name,
 * how many levels it is (where more than one), its first board's
 * difficulty, and the stars — earned of those to earn. */
export function levelCard(
  level: Level,
  { levels, stars }: { levels: number; stars: number },
  pick: (level: Level) => void,
): HTMLButtonElement {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "card";
  button.title = level.label;
  button.dataset["tiling"] = level.key;
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
  if (levels > 1) {
    const tallied = document.createElement("span");
    tallied.className = "card-stars";
    tallied.textContent = `★ ${stars}/${levels * 3}`;
    meta.append(bars, tallied);
  } else meta.append(bars, starRow(stars));
  button.append(outlineIcon(level), tiles, name);
  if (levels > 1) {
    const count = document.createElement("span");
    count.className = "card-levels";
    count.textContent = `${levels} levels`;
    button.append(count);
  }
  button.append(meta);
  button.addEventListener("click", () => pick(level));
  return button;
}
