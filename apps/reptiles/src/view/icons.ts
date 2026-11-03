// The small pictures the catalog and the home screen share: a board's
// outline, a tray tile, the three-bar difficulty ladder (drawn as Hypersweeper
// draws its own), and a row of stars; and the header's and home screen's
// glyphs, stroked in `currentColor` so they follow the theme.

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
  poly.setAttribute("class", `tile ${level.colours[kind]}`);
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

const STROKE = `stroke="currentColor" stroke-width="1.9" fill="none" stroke-linecap="round" stroke-linejoin="round"`;

/** The header's and home screen's glyphs, on a 24-unit square: home, restart,
 * a die for a new random level and the settings gear (both Hypersweeper's). */
export const GLYPHS: Record<string, string> = {
  home: `<path d="M3.8 11.2 L12 4 L20.2 11.2" ${STROKE}/>
    <path d="M6.2 9.4 V19.6 H17.8 V9.4" ${STROKE}/>
    <path d="M10.2 19.6 V14.4 H13.8 V19.6" ${STROKE}/>`,
  restart: `<path d="M4.5 12 A7.5 7.5 0 1 0 12 4.5" ${STROKE}/>
    <path d="M15.1 1.4 L11.4 4.5 L15.1 7.6" ${STROKE}/>`,
  random: `<rect x="3.4" y="3.4" width="17.2" height="17.2" rx="4.4" stroke="currentColor"
      stroke-width="1.8" fill="none"/>
    <circle cx="8.3" cy="8.3" r="1.55" fill="currentColor"/>
    <circle cx="12" cy="12" r="1.55" fill="currentColor"/>
    <circle cx="15.7" cy="15.7" r="1.55" fill="currentColor"/>`,
  // Hypersweeper's own gear (apps/hypersweeper/src/ui/settings.ts GEAR_ICON).
  settings: `<path fill="currentColor" fill-rule="evenodd" d="M21.48 10.50A9.6 9.6 0 0 1 21.48 13.50L18.60 13.65A6.8 6.8 0 0 1 17.83 15.50L19.77 17.64A9.6 9.6 0 0 1 17.64 19.77L15.50 17.83A6.8 6.8 0 0 1 13.65 18.60L13.50 21.48A9.6 9.6 0 0 1 10.50 21.48L10.35 18.60A6.8 6.8 0 0 1 8.50 17.83L6.36 19.77A9.6 9.6 0 0 1 4.23 17.64L6.17 15.50A6.8 6.8 0 0 1 5.40 13.65L2.52 13.50A9.6 9.6 0 0 1 2.52 10.50L5.40 10.35A6.8 6.8 0 0 1 6.17 8.50L4.23 6.36A9.6 9.6 0 0 1 6.36 4.23L8.50 6.17A6.8 6.8 0 0 1 10.35 5.40L10.50 2.52A9.6 9.6 0 0 1 13.50 2.52L13.65 5.40A6.8 6.8 0 0 1 15.50 6.17L17.64 4.23A9.6 9.6 0 0 1 19.77 6.36L17.83 8.50A6.8 6.8 0 0 1 18.60 10.35L21.48 10.50ZM8.6 12A3.4 3.4 0 1 0 15.4 12A3.4 3.4 0 1 0 8.6 12Z"/>`,
};

/** Fill every `<svg data-icon="…">` under `root` with its glyph. */
export function fillGlyphs(root: ParentNode): void {
  for (const svg of root.querySelectorAll<SVGSVGElement>("svg[data-icon]")) {
    const glyph = GLYPHS[svg.dataset["icon"] ?? ""];
    if (glyph) svg.innerHTML = glyph;
  }
}
