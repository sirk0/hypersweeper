// Figures: the levels by the tiles in their tray. The first screen lists every
// set — one figure, then pairs, then packs of three and four — a row each,
// scrolling sideways as the catalog's families do; picking a set lists its
// tilings, easiest first, under their difficulty.

import { BARS, bandOf, scoreOf, type Band } from "../difficulty";
import type { FigureSet } from "../figures";
import type { Level } from "../levels";
import { levelCard } from "./catalog";
import { barsIcon, figureIcon } from "./icons";

const BUCKETS: { size: number; name: string; hint: string }[] = [
  { size: 1, name: "One figure", hint: "One shape throughout" },
  { size: 2, name: "Pairs", hint: "Two shapes" },
  { size: 3, name: "Packs of 3", hint: "Three shapes" },
  { size: 4, name: "Packs of 4", hint: "Four shapes" },
];

const BANDS: { band: Band; name: string }[] = [
  { band: "easy", name: "Easy" },
  { band: "medium", name: "Medium" },
  { band: "hard", name: "Hard" },
];

const plural = (n: number, word: string): string => `${n} ${word}${n === 1 ? "" : "s"}`;

export function renderFigures(
  host: HTMLElement,
  sets: FigureSet[],
  stars: (key: string) => number,
  pick: (set: FigureSet) => void,
): void {
  host.replaceChildren();
  const sizes = [...new Set(sets.map((s) => s.figures.length))];
  for (const size of sizes) {
    const bucket = BUCKETS.find((b) => b.size === size) ?? {
      size,
      name: `Packs of ${size}`,
      hint: `${size} shapes`,
    };
    const section = document.createElement("section");
    section.className = "family";
    const heading = document.createElement("h2");
    heading.textContent = bucket.name;
    const hint = document.createElement("p");
    hint.className = "family-hint";
    hint.textContent = bucket.hint;
    const row = document.createElement("div");
    row.className = "family-row";
    for (const set of sets.filter((s) => s.figures.length === size))
      row.appendChild(figureCard(set, stars, pick));
    section.append(heading, hint, row);
    host.appendChild(section);
  }
}

function figureCard(
  set: FigureSet,
  stars: (key: string) => number,
  pick: (set: FigureSet) => void,
): HTMLButtonElement {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "card figure-card";
  button.dataset["figure"] = set.key;
  button.title = set.levels.map((l) => l.name).join(", ");
  const name = document.createElement("span");
  name.className = "card-name";
  name.textContent = set.name;
  const meta = document.createElement("span");
  meta.className = "card-meta";
  const count = document.createElement("span");
  count.className = "figure-count";
  count.textContent = plural(set.levels.length, "tiling");
  const earned = set.levels.reduce((sum, l) => sum + stars(l.key), 0);
  const tally = document.createElement("span");
  tally.className = "figure-stars";
  tally.textContent = `★ ${earned}/${set.levels.length * 3}`;
  meta.append(count, tally);
  button.append(figureIcon(set.levels[0]!), name, meta);
  button.addEventListener("click", () => pick(set));
  return button;
}

/** One set's tilings, easiest first, under Easy, Medium and Hard. */
export function renderFigure(
  host: HTMLElement,
  set: FigureSet,
  stars: (key: string) => number,
  pick: (level: Level) => void,
): void {
  host.replaceChildren();
  const head = document.createElement("div");
  head.className = "figure-head";
  const about = document.createElement("p");
  about.className = "family-hint";
  about.textContent = `${plural(set.levels.length, "tiling")} with exactly ${
    set.figures.length === 1 ? "this tile" : `these ${set.figures.length} tiles`
  }`;
  head.append(figureIcon(set.levels[0]!), about);
  host.appendChild(head);
  const levels = [...set.levels].sort((a, b) => scoreOf(a.key) - scoreOf(b.key));
  for (const { band, name } of BANDS) {
    const members = levels.filter((l) => bandOf(l.key) === band);
    if (members.length === 0) continue;
    const section = document.createElement("section");
    section.className = "family band-group";
    section.dataset["band"] = band;
    const heading = document.createElement("h2");
    heading.className = "band-heading";
    heading.append(barsIcon(BARS[band]), name);
    const grid = document.createElement("div");
    grid.className = "figure-grid";
    for (const level of members) grid.appendChild(levelCard(level, stars(level.key), pick));
    section.append(heading, grid);
    host.appendChild(section);
  }
}
