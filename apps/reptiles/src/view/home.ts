// The first screen: a level of a chosen difficulty, dealt at random, or a
// level picked by hand from Tilings (the catalog, by family). (The settings gear is in the screen's corner,
// in index.html.) On a desktop it is the Quick start page beside the
// sidebar: the three difficulties as big cards, each the picture of a
// tiling of that difficulty (`SHOWCASE`) — its board's outline and its tiles,
// as its Tilings card draws it, never the board tiled, which would give it
// away — and no Tilings row: the sidebar lists the tilings.

import { BARS, type Band } from "../difficulty";
import { levelByKey } from "../levels";
import { cardArt } from "./cardArt";
import { barsIcon } from "./icons";

/** The tiling each difficulty's desktop card pictures: one of its own
 * difficulty (held to it by tests/unit/groups.test.ts). */
export const SHOWCASE: Record<Band, string> = {
  easy: "trihex",
  medium: "rhombitrihex",
  hard: "spectre",
};

const BANDS: { band: Band; label: string; hint: string }[] = [
  { band: "easy", label: "Easy", hint: "Hardly a turn, and a tile that fits is right" },
  { band: "medium", label: "Medium", hint: "Turning now and then, a wrong fit here and there" },
  { band: "hard", label: "Hard", hint: "Turning all the way, or tiles that fit but are wrong" },
];

export function renderHome(
  host: HTMLElement,
  /** Per band, how many levels and stars of how many. */
  tally: (band: Band) => { levels: number; stars: number },
  play: (band: Band) => void,
  catalog: () => void,
  /** The desktop's Quick start: the cards carry their pictures. */
  wide = false,
): void {
  host.replaceChildren();
  // the three difficulties are the main buttons, in the middle…
  const bands = document.createElement("div");
  bands.className = "home-bands";
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
    const about = document.createElement("span");
    about.className = "home-hint";
    about.textContent = hint;
    button.querySelector(".home-text")?.append(about);
    if (wide) {
      const art = document.createElement("span");
      art.className = "home-art";
      button.prepend(art);
      // drawn once the page is up: building the level takes a moment
      setTimeout(() => {
        const level = levelByKey(SHOWCASE[band]);
        if (level && art.isConnected) art.replaceChildren(cardArt(level));
      }, 0);
    }
    bands.appendChild(button);
  }
  // …and Tilings under them, at the foot
  const more = document.createElement("div");
  more.className = "home-more";
  const grid = document.createElement("span");
  grid.className = "catalog-glyph";
  grid.setAttribute("aria-hidden", "true");
  grid.textContent = "▦";
  more.appendChild(pick("catalog-pick", grid, "Tilings", "Every tiling, by family", catalog));
  // …and under it the way to the other games, a quiet link: only in a web
  // build (null in a packaged one), in a new tab so the game stays put. The
  // desktop's is in the sidebar's foot (main.ts), and this row is hidden there.
  if (__GAMES_SITE_URL__) {
    const games = document.createElement("a");
    games.className = "home-games";
    games.href = __GAMES_SITE_URL__;
    games.target = "_blank";
    games.rel = "noopener";
    games.dataset["action"] = "more-games";
    games.title = "Every game, on tiling-games.pages.dev";
    games.textContent = "More games ↗";
    more.appendChild(games);
  }
  host.append(bands, more);
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
  if (className.startsWith("band-")) button.classList.add("primary");
  const name = document.createElement("span");
  name.className = "home-label";
  name.textContent = label;
  const meta = document.createElement("span");
  meta.className = "home-meta";
  meta.textContent = hint;
  const text = document.createElement("span");
  text.className = "home-text";
  text.append(name, meta);
  // the bars and the words: one line under a desktop card's picture
  const line = document.createElement("span");
  line.className = "home-line";
  line.append(icon, text);
  button.append(line);
  button.addEventListener("click", onClick);
  return button;
}
