// The small pictures the level list, the catalog and the home screen share:
// a board's outline, a tray tile, the three-bar difficulty ladder (drawn as
// Hypersweeper draws its own), and a row of stars.

import { centroid, type XY } from "../geometry/shape";
import type { Level } from "../levels";

const NS = "http://www.w3.org/2000/svg";

function svgIn(className: string, viewBox: [number, number, number, number]): SVGSVGElement {
  const svg = document.createElementNS(NS, "svg");
  svg.setAttribute("class", className);
  svg.setAttribute("aria-hidden", "true");
  svg.setAttribute("viewBox", viewBox.join(" "));
  return svg;
}

/** The board's outline, with no tiles in it. */
export function outlineIcon(level: Level): SVGSVGElement {
  const { ring, region } = level;
  // y flipped: the board draws y up
  const loops = region.map((loop) =>
    loop.map((v): XY => {
      const [x, y] = ring.toXY(v);
      return [x, -y];
    }),
  );
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
  path.setAttribute(
    "d",
    loops.map((l) => "M" + l.map((p) => p.join(",")).join("L") + "Z").join(""),
  );
  path.setAttribute("fill-rule", "evenodd");
  path.setAttribute("stroke-width", String(size * 0.035));
  svg.appendChild(path);
  return svg;
}

/** One tray tile, resting flat as the tray holds it. */
export function tileIcon(level: Level, kind: number): SVGSVGElement {
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

/** The difficulty ladder: three bars rising left to right, `filled` of them
 * solid — Hypersweeper's own icon. All three are always drawn: one bar alone
 * says nothing about which rung of what. */
export function barsIcon(filled: number): SVGSVGElement {
  const svg = svgIn("bars", [0, 0, 100, 100]);
  const width = 22;
  const gap = 9;
  const left = 50 - (3 * width + 2 * gap) / 2;
  const foot = 86;
  for (let i = 0; i < 3; i++) {
    const h = 30 + i * 24;
    const rect = document.createElementNS(NS, "rect");
    rect.setAttribute("x", String(left + i * (width + gap)));
    rect.setAttribute("y", String(foot - h));
    rect.setAttribute("width", String(width));
    rect.setAttribute("height", String(h));
    rect.setAttribute("rx", "3");
    rect.setAttribute("class", i < filled ? "bar on" : "bar");
    svg.appendChild(rect);
  }
  return svg;
}

/** Three stars, the first `earned` of them gold. */
export function starRow(earned: number): HTMLSpanElement {
  const row = document.createElement("span");
  row.className = "stars";
  row.setAttribute("aria-label", earned ? `${earned} of 3 stars` : "not finished yet");
  for (let i = 1; i <= 3; i++) {
    const star = document.createElement("span");
    star.className = i <= earned ? "star done" : "star";
    star.textContent = i <= earned ? "★" : "☆";
    row.appendChild(star);
  }
  return row;
}
