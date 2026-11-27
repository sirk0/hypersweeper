// The catalog — called Tilings on screen: its families — named for their
// symmetry — put together in five groups (view/groups.ts). On a phone,
// Tilings is the groups' index (`renderGroupIndex`), a card each, and a
// group's page is its families, each a grid of small cards; on a desktop the
// sidebar lists the groups, and a group's page is the same grids of small
// cards, as many to a row as fit. A card shows what a player starts with (the first board's outline,
// the tray's tiles inside it at their true sizes — view/cardArt.ts), the tiling's name, its first board's difficulty as
// Hypersweeper's three bars (a desktop's only), how many boards and tile sets it has (plain,
// matching rules, colourings, jigsaws — in the DOM, not shown), and the stars earned of them — a star
// row of each board's best and each tile set's, summed (tally.ts) — the card
// tinted the more of them are earned. A tiling of more than one level opens its own
// page (view/picker.ts), where a board and its tiles are picked.

import { BARS, bandOf } from "../difficulty";
import { GROUPS, levelByKey, type Level } from "../levels";
import { tierOf } from "../tally";
import { cardArt } from "./cardArt";
import type { MenuGroup } from "./groups";
import { barsIcon, starRow, trayIcon } from "./icons";

/** How many levels the tiling `level` is the first board of has, and the
 * stars earned of `max` to earn (tally.ts). */
export type Tally = (level: Level) => {
  levels: number;
  stars: number;
  max: number;
  /** Boards the tiling is cut in, and the tile sets it has — what its page's
   * Tiles row holds: plain, matching rules and colourings. */
  boards?: number;
  sets?: number;
  /** Whether any of its levels is in progress (a board kept half-covered,
   * saved.ts): the card is washed green. */
  inPlay?: boolean;
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

/** A group's tilings, the levels they are, and the stars earned of `max`. */
export interface GroupTally {
  tilings: number;
  levels: number;
  stars: number;
  max: number;
}

/** The phone's Tilings: the five groups, a card each — the group's icon (its
 * `icon` tiling's tray, as the desktop sidebar draws it), its name, its hint,
 * how many tilings it has and the stars earned of them. A card opens the
 * group's page. */
export function renderGroupIndex(
  host: HTMLElement,
  groups: readonly MenuGroup[],
  tally: (group: MenuGroup) => GroupTally,
  open: (key: string) => void,
): void {
  host.replaceChildren();
  const list = document.createElement("div");
  list.className = "group-list";
  for (const group of groups) {
    const { tilings, stars, max } = tally(group);
    const button = document.createElement("button");
    button.type = "button";
    button.className = "group-card";
    button.dataset["group"] = group.key;
    const icon = document.createElement("span");
    icon.className = "group-icon";
    const text = document.createElement("span");
    text.className = "group-text";
    const name = document.createElement("span");
    name.className = "group-name";
    name.textContent = group.name;
    const hint = document.createElement("span");
    hint.className = "group-hint";
    hint.textContent = group.hint;
    const meta = document.createElement("span");
    meta.className = "group-meta";
    meta.textContent = `${tilings} tilings · ★ ${stars}/${max}`;
    text.append(name, hint, meta);
    button.append(icon, text);
    button.addEventListener("click", () => open(group.key));
    list.appendChild(button);
    // drawn once the page is up: building a level takes a moment
    setTimeout(() => {
      const level = levelByKey(group.icon);
      if (level && icon.isConnected) icon.replaceChildren(trayIcon(level));
    }, 0);
  }
  host.appendChild(list);
}

/** A tiling's card: its first board's outline, its tray's tiles, its name,
 * how many levels it is (where more than one), its first board's
 * difficulty, and the stars — earned of those to earn. */
export function levelCard(
  level: Level,
  { levels, stars, max, boards = 1, sets = 1, inPlay = false }: ReturnType<Tally>,
  pick: (level: Level) => void,
): HTMLButtonElement {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "card";
  button.title = level.label;
  button.dataset["tiling"] = level.key;
  button.dataset["stars"] = String(tierOf(stars, max));
  if (inPlay) button.classList.add("in-play");
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
    tallied.textContent = `★ ${stars}/${max}`;
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
