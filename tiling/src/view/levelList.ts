// The level list down the right-hand side: each level's name, a picture of its
// tile (or of its vertex configuration), and the best of three stars earned.

import type { Cyc } from "../geometry/cyclotomic";
import { centroid, posed, regular, type XY } from "../geometry/shape";
import { span } from "../geometry/vertexRule";
import type { Level } from "../levels";

const NS = "http://www.w3.org/2000/svg";

/** What a level's icon shows: its tile, or for a uniform tiling its vertex
 * configuration — the tiles round one vertex (a rosette), so 3.6.3.6 reads
 * as two triangles and two hexagons meeting at a point. */
function iconTiles(level: Level): Cyc[][] {
  const { ring, config } = level;
  if (!config) return [level.tiles[0]!.verts];
  let at = 0;
  return config.map((sides) => {
    const tile = posed(regular(ring, sides), { rot: at, flip: false, t: ring.zero });
    at += span(ring.n, sides);
    return tile;
  });
}

function tileIcon(level: Level): SVGSVGElement {
  const { ring } = level;
  const svg = document.createElementNS(NS, "svg");
  svg.setAttribute("class", "level-icon");
  svg.setAttribute("aria-hidden", "true");
  const tiles = iconTiles(level).map((verts) => verts.map((v) => ring.toXY(v)));
  const all = tiles.flat();
  const [cx, cy] = tiles.length === 1 ? centroid(tiles[0]!) : [0, 0];
  const r = Math.max(...all.map(([x, y]) => Math.hypot(x - cx, y - cy))) * 1.1;
  svg.setAttribute("viewBox", `${-r} ${-r} ${2 * r} ${2 * r}`);
  for (const xy of tiles) {
    const poly = document.createElementNS(NS, "polygon");
    // y flipped: the board draws y up
    poly.setAttribute("points", xy.map(([x, y]): XY => [x - cx, cy - y]).map((p) => p.join(",")).join(" "));
    poly.setAttribute("class", `tile sides-${xy.length}`);
    poly.setAttribute("stroke-width", String(r * 0.08));
    svg.appendChild(poly);
  }
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
    if (level.key === current) button.setAttribute("aria-current", "true");
    const name = document.createElement("span");
    name.className = "level-name";
    name.textContent = level.label;
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
    button.append(tileIcon(level), name, row);
    button.addEventListener("click", () => pick(level));
    li.appendChild(button);
    host.appendChild(li);
  }
}
