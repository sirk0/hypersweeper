// The first screen: a level of a chosen difficulty, dealt at random, or the
// catalog to pick one by hand. (The settings gear is in the screen's corner,
// in index.html.)

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
    const button = pick(
      `band-${band}`,
      barsIcon(BARS[band]),
      label,
      `${levels} levels · ★ ${stars} / ${levels * 3}`,
      () => play(band),
    );
    button.title = hint;
    host.appendChild(button);
  }
  const grid = document.createElement("span");
  grid.className = "catalog-glyph";
  grid.setAttribute("aria-hidden", "true");
  grid.textContent = "▦";
  host.appendChild(pick("catalog-pick", grid, "Catalog", "Every level, by family", catalog));
}

function pick(
  className: string,
  icon: Element,
  label: string,
  hint: string,
  onClick: () => void,
): HTMLButtonElement {
  const button = document.createElement("button");
  button.type = "button";
  button.className = `home-pick ${className}`;
  const name = document.createElement("span");
  name.className = "home-label";
  name.textContent = label;
  const meta = document.createElement("span");
  meta.className = "home-meta";
  meta.textContent = hint;
  const text = document.createElement("span");
  text.className = "home-text";
  text.append(name, meta);
  button.append(icon, text);
  button.addEventListener("click", onClick);
  return button;
}
