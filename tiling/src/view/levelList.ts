// The level list down the right-hand side. Each level shows what a player
// starts with and nothing more: the outline of its board, the tiles in its
// tray, its vertex configuration as its name (3.4.6.4), and the best of three
// stars earned. No picture of the tiling itself — that is the puzzle.

import { notation, type Level } from "../levels";
import { centroid, type XY } from "../geometry/shape";

const NS = "http://www.w3.org/2000/svg";

function svgIn(className: string, viewBox: [number, number, number, number]): SVGSVGElement {
  const svg = document.createElementNS(NS, "svg");
  svg.setAttribute("class", className);
  svg.setAttribute("aria-hidden", "true");
  svg.setAttribute("viewBox", viewBox.join(" "));
  return svg;
}

/** The board's outline, with no tiles in it. */
function outlineIcon(level: Level): SVGSVGElement {
  const { ring, region } = level;
  // y flipped: the board draws y up
  const loops = region.map((loop) => loop.map((v): XY => {
    const [x, y] = ring.toXY(v);
    return [x, -y];
  }));
  const all = loops.flat();
  const x0 = Math.min(...all.map((p) => p[0]));
  const x1 = Math.max(...all.map((p) => p[0]));
  const y0 = Math.min(...all.map((p) => p[1]));
  const y1 = Math.max(...all.map((p) => p[1]));
  const size = Math.max(x1 - x0, y1 - y0) * 1.08;
  const cx = (x0 + x1) / 2;
  const cy = (y0 + y1) / 2;
  const svg = svgIn("level-outline", [cx - size / 2, cy - size / 2, size, size]);
  const path = document.createElementNS(NS, "path");
  path.setAttribute("d", loops.map((l) => "M" + l.map((p) => p.join(",")).join("L") + "Z").join(""));
  path.setAttribute("fill-rule", "evenodd");
  path.setAttribute("stroke-width", String(size * 0.035));
  svg.appendChild(path);
  return svg;
}

/** One tray tile, resting flat as the tray holds it. */
function tileIcon(level: Level, kind: number): SVGSVGElement {
  const { ring } = level;
  const xy = level.tiles[kind]!.verts.map((v) => ring.toXY(v));
  const [cx, cy] = centroid(xy);
  const r = Math.max(...xy.map(([x, y]) => Math.hypot(x - cx, y - cy))) * 1.1;
  const svg = svgIn("level-tile", [-r, -r, 2 * r, 2 * r]);
  const poly = document.createElementNS(NS, "polygon");
  poly.setAttribute("points", xy.map(([x, y]) => `${x - cx},${cy - y}`).join(" "));
  poly.setAttribute("class", `tile sides-${xy.length}`);
  poly.setAttribute("stroke-width", String(r * 0.1));
  svg.appendChild(poly);
  return svg;
}

export function renderLevelList(
  host: HTMLElement,
  levels: Level[],
  current: string,
  stars: (key: string) => number,
  pick: (level: Level) => void,
): void {
  host.replaceChildren();
  for (const level of levels) {
    const li = document.createElement("li");
    const button = document.createElement("button");
    button.type = "button";
    button.className = "level-pick";
    button.title = level.label;
    if (level.key === current) button.setAttribute("aria-current", "true");

    const name = document.createElement("span");
    name.className = "level-name";
    name.textContent = notation(level.config);

    const tiles = document.createElement("span");
    tiles.className = "level-tiles";
    tiles.setAttribute("aria-label", `tiles: ${level.tiles.map((t) => `${t.verts.length}-gon`).join(", ")}`);
    level.tiles.forEach((_, kind) => tiles.appendChild(tileIcon(level, kind)));

    const earned = stars(level.key);
    const row = document.createElement("span");
    row.className = "stars";
    row.setAttribute("aria-label", earned ? `${earned} of 3 stars` : "not finished yet");
    for (let i = 1; i <= 3; i++) {
      const star = document.createElement("span");
      star.className = i <= earned ? "star done" : "star";
      star.textContent = i <= earned ? "★" : "☆";
      row.appendChild(star);
    }

    const text = document.createElement("span");
    text.className = "level-text";
    const bottom = document.createElement("span");
    bottom.className = "level-row";
    bottom.append(tiles, row);
    text.append(name, bottom);
    button.append(outlineIcon(level), text);
    button.addEventListener("click", () => pick(level));
    li.appendChild(button);
    host.appendChild(li);
  }
}
