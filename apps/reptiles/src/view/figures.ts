// Figures: the levels by the tiles in their tray. The first screen lists every
// set — one figure by its sides (triangles, quadrilaterals, pentagons,
// hexagons, 7+-gons), one figure of several pieces, regular pairs, irregular pairs (one irregular figure is
// enough), then packs of three or more — a row each,
// scrolling sideways as the catalog's families do; picking a set lists its
// tilings, easiest first, under their difficulty.

import { BARS, bandOf, scoreOf, type Band } from "../difficulty";
import { BUCKETS, type Bucket, type FigureSet } from "../figures";
import type { Level } from "../levels";
import { levelCard } from "./catalog";
import { barsIcon, figureIcon } from "./icons";

const ROWS: Record<Bucket, { name: string; hint: string }> = {
  triangles: { name: "Triangles", hint: "One three-sided tile throughout" },
  quadrilaterals: { name: "Quadrilaterals", hint: "One four-sided tile throughout" },
  pentagons: { name: "Pentagons", hint: "One five-sided tile throughout" },
  hexagons: { name: "Hexagons", hint: "One six-sided tile throughout" },
  polygons: { name: "7+-gons", hint: "One tile of seven sides or more" },
  pieces: { name: "Several pieces", hint: "One tile of two or more separate pieces" },
  "regular-pairs": { name: "Regular pairs", hint: "Two regular polygons" },
  "irregular-pairs": { name: "Irregular pairs", hint: "Two shapes, at least one irregular" },
  packs: { name: "Packs of 3+", hint: "Three shapes or more" },
};

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
  for (const bucket of BUCKETS) {
    const members = sets.filter((s) => s.bucket === bucket);
    if (members.length === 0) continue;
    const { name, hint: about } = ROWS[bucket];
    const section = document.createElement("section");
    section.className = "family";
    const heading = document.createElement("h2");
    heading.textContent = name;
    const hint = document.createElement("p");
    hint.className = "family-hint";
    hint.textContent = about;
    const row = document.createElement("div");
    row.className = "family-row";
    for (const set of members) row.appendChild(figureCard(set, stars, pick));
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
