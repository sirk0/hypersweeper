// The catalog — called Tilings on screen: every tiling, a family to a row —
// named for its symmetry — each row scrolling sideways through its tilings'
// cards. A card shows what a player starts with (the first board's outline,
// the tray's tiles inside it at their true sizes — view/cardArt.ts), the tiling's name, its first board's difficulty as
// Hypersweeper's three bars, and how many levels it is — every board by
// every way its tiles are marked (plain, matching rules, colourings) — with
// the stars earned on them. A tiling of more than one level opens its own
// page (view/picker.ts), where a board and its tiles are picked.

import { BARS, bandOf } from "../difficulty";
import { GROUPS, type Level } from "../levels";
import { cardArt } from "./cardArt";
import { barsIcon, starRow } from "./icons";

/** How many levels the tiling `level` is the first board of has, and the
 * stars earned on them. */
export type Tally = (level: Level) => {
  levels: number;
  stars: number;
  /** Boards the tiling is cut in, and the tile sets it has — what its page's
   * Tiles row holds: plain, matching rules and colourings. */
  boards?: number;
  sets?: number;
};

export function renderCatalog(
  host: HTMLElement,
  levels: Level[],
  tally: Tally,
  pick: (level: Level) => void,
  pickTiling: (level: Level) => void,
  /** The families to list — a desktop group's (view/groups.ts) — or every
   * one. */
  families?: readonly string[],
): void {
  host.replaceChildren();
  for (const group of GROUPS) {
    if (families && !families.includes(group.key)) continue;
    const members = levels.filter((l) => l.group === group.key);
    if (members.length === 0) continue;
    const section = document.createElement("section");
    section.className = "family";
    section.dataset["family"] = group.key;
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
  { levels, stars, boards = 1, sets = 1 }: ReturnType<Tally>,
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
  // the tiles inside the board's outline, clear of it (view/cardArt.ts)
  const art = document.createElement("span");
  art.className = "card-art";
  art.append(cardArt(level));
  button.append(art, name);
  if (boards > 1 || sets > 1) {
    const counts = document.createElement("span");
    counts.className = "card-levels";
    if (boards > 1) {
      const b = document.createElement("span");
      b.className = "card-boards";
      b.textContent = `${boards} boards`;
      counts.append(b);
    }
    if (sets > 1) {
      const r = document.createElement("span");
      r.className = "card-sets";
      r.textContent = `${sets} tile sets`;
      r.title = "Plain tiles, matching rules, colourings and jigsaws";
      counts.append(r);
    }
    button.append(counts);
  }
  button.append(meta);
  button.addEventListener("click", () => pick(level));
  return button;
}
