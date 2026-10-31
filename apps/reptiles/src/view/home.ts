// The first screen: a level of a chosen difficulty, dealt at random, or the
// catalog to pick one by hand.

import { BARS, type Band } from "../difficulty";
import { barsIcon } from "./icons";

const BANDS: { band: Band; label: string; hint: string }[] = [
  { band: "easy", label: "Easy", hint: "One tile laid over and over, hardly a turn" },
  { band: "medium", label: "Medium", hint: "A few kinds, turning now and then" },
  { band: "hard", label: "Hard", hint: "Turning — and flipping — all the way" },
];

export function renderHome(
  host: HTMLElement,
  /** Per band, how many levels and stars of how many. */
  tally: (band: Band) => { levels: number; stars: number },
  play: (band: Band) => void,
  catalog: () => void,
): void {
  host.replaceChildren();
  for (const { band, label, hint } of BANDS) {
    const { levels, stars } = tally(band);
    const button = document.createElement("button");
    button.type = "button";
    button.className = `home-pick band-${band}`;
    button.title = hint;
    const name = document.createElement("span");
    name.className = "home-label";
    name.textContent = label;
    const meta = document.createElement("span");
    meta.className = "home-meta";
    meta.textContent = `${levels} levels · ★ ${stars} / ${levels * 3}`;
    const text = document.createElement("span");
    text.className = "home-text";
    text.append(name, meta);
    button.append(barsIcon(BARS[band]), text);
    button.addEventListener("click", () => play(band));
    host.appendChild(button);
  }
  const all = document.createElement("button");
  all.type = "button";
  all.className = "home-pick catalog-pick";
  const name = document.createElement("span");
  name.className = "home-label";
  name.textContent = "Catalog";
  const meta = document.createElement("span");
  meta.className = "home-meta";
  meta.textContent = "Every level, by family";
  const text = document.createElement("span");
  text.className = "home-text";
  text.append(name, meta);
  const grid = document.createElement("span");
  grid.className = "catalog-glyph";
  grid.setAttribute("aria-hidden", "true");
  grid.textContent = "▦";
  all.append(grid, text);
  all.addEventListener("click", catalog);
  host.appendChild(all);
}
