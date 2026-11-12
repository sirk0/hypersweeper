// Figures: the levels by the tiles in their tray. The first screen lists every
// set — one figure by its sides (triangles, quadrilaterals, pentagons,
// hexagons, 7+-gons), one figure of several pieces, regular pairs, irregular pairs (one irregular figure is
// enough), then packs of three or more — a row each,
// scrolling sideways as the catalog's families do; picking a set opens its
// page, where a board of any of its tilings and that tiling's tiles are
// picked (view/picker.ts), the boards grouped under their tilings, easiest
// first.

import { scoreOf } from "../difficulty";
import { BUCKETS, type Bucket, type FigureSet } from "../figures";
import type { Level } from "../levels";
import type { Tally } from "./catalog";
import { figureIcon } from "./icons";
import { renderPicker } from "./picker";

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

const plural = (n: number, word: string): string => `${n} ${word}${n === 1 ? "" : "s"}`;

export function renderFigures(
  host: HTMLElement,
  sets: FigureSet[],
  tally: Tally,
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
    for (const set of members) row.appendChild(figureCard(set, tally, pick));
    section.append(heading, hint, row);
    host.appendChild(section);
  }
}

function figureCard(
  set: FigureSet,
  tally: Tally,
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
  const { levels, stars } = set.levels
    .map(tally)
    .reduce((a, b) => ({ levels: a.levels + b.levels, stars: a.stars + b.stars }));
  const tallied = document.createElement("span");
  tallied.className = "figure-stars";
  tallied.textContent = `★ ${stars}/${levels * 3}`;
  tallied.title = plural(levels, "level");
  meta.append(count, tallied);
  button.append(figureIcon(set.levels[0]!), name, meta);
  button.addEventListener("click", () => pick(set));
  return button;
}

/** One set's page: its figures, then its tilings' boards, grouped under
 * each tiling, easiest first, and the picked tiling's tiles (view/picker.ts). */
export function renderFigure(
  host: HTMLElement,
  set: FigureSet,
  stars: (key: string) => number,
  play: (level: Level) => void,
  initial: string | null,
  remember: (key: string) => void,
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
  const body = document.createElement("div");
  host.classList.add("picker");
  host.append(head, body);
  renderPicker(body, {
    tilings: [...set.levels].sort((a, b) => scoreOf(a.key) - scoreOf(b.key)),
    stars,
    play,
    initial,
    remember,
    hint: "Every board of every tiling with these tiles",
  });
}
