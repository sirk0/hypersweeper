// The small pictures the catalog and the home screen share: a board's
// outline (and where a rep-tile's tile lies on it, for the card picture in
// view/cardArt.ts), a marking's tray, the three-bar difficulty ladder (drawn as Hypersweeper
// draws its own), and a row of stars; and the header's and home screen's
// glyphs, stroked in `currentColor` so they follow the theme.

import { centroidOf, signedArea, type XY } from "../geometry/shape";
import type { Level } from "../levels";
import { loopsOf, loopsPath, loopsReach, outlinePath, reachPoints } from "./curve";
import { decorParts, markUnit, type MarkUnit } from "./decor";

const NS = "http://www.w3.org/2000/svg";

function svgIn(className: string, viewBox: [number, number, number, number]): SVGSVGElement {
  const svg = document.createElementNS(NS, "svg");
  svg.setAttribute("class", className);
  svg.setAttribute("aria-hidden", "true");
  svg.setAttribute("viewBox", viewBox.join(" "));
  return svg;
}

/** A board's outline as the pictures draw it, y flipped (the board draws y
 * up): a square viewBox round it with a little room, its path, and its
 * stroke's width. */
export function outlineFrame(level: Level): {
  viewBox: [number, number, number, number];
  d: string;
  stroke: number;
} {
  const { ring, region, regionCurves } = level;
  const flipY = ([x, y]: XY): XY => [x, -y];
  const loops = region.map((loop, i) =>
    reachPoints(
      loop.map((v) => ring.toXY(v)),
      regionCurves?.[i],
    ).map(flipY),
  );
  const all = loops.flat();
  const x0 = Math.min(...all.map((p) => p[0]));
  const x1 = Math.max(...all.map((p) => p[0]));
  const y0 = Math.min(...all.map((p) => p[1]));
  const y1 = Math.max(...all.map((p) => p[1]));
  const size = Math.max(x1 - x0, y1 - y0) * 1.08;
  const cx = (x0 + x1) / 2;
  const cy = (y0 + y1) / 2;
  // round edges laid out in board space (y up), then flipped
  const d = region
    .map((loop, i) =>
      outlinePath(
        loop.map((v) => ring.toXY(v)),
        regionCurves?.[i],
        flipY,
      ),
    )
    .join("");
  return { viewBox: [cx - size / 2, cy - size / 2, size, size], d, stroke: size * 0.035 };
}

/** The board's outline, with no tiles in it. */
export function outlineIcon(level: Level): SVGSVGElement {
  const { viewBox, d, stroke } = outlineFrame(level);
  const svg = svgIn("level-outline", viewBox);
  const path = document.createElementNS(NS, "path");
  path.setAttribute("d", d);
  path.setAttribute("fill-rule", "evenodd");
  path.setAttribute("stroke-width", String(stroke));
  svg.appendChild(path);
  return svg;
}

/** How a card turns a rep-tile's tile: mirrored in the x axis first, where `flip`,
 * then turned by `angle` radians — any angle, not only the ring's steps: the
 * right isosceles triangle rests on its long side but its board stands on a
 * short one, 45° round, which no turn of ℤ[ζ4] reaches. For drawing only. */
export interface IconPose {
  angle: number;
  flip: boolean;
}

/** How `boardFit` lays a rep-tile's tile on its board: mirrored where
 * `pose.flip`, its `centre` (the centroid, after the mirror) moved to the
 * board's centroid `board`, turned by `pose.angle` and scaled by `scale` —
 * the board's outline, when `miss` is 0. */
export interface BoardFit {
  pose: IconPose;
  /** How far off it is, in board units: the farthest corner of either from
   * the other's outline — 0 where the tile is the board made small. */
  miss: number;
  centre: XY;
  board: XY;
  scale: number;
}

/** How a rep-tile's one tile is turned (and, where it must be, mirrored) and
 * laid to be its board's outline — the board being one big copy of it — or
 * null for any other level. Read in floats, for drawing only: each angle
 * that lays one of the tile's edges along one of the board's, the tile there
 * centred and scaled to the board's area against the board's outline —
 * every corner of either on the other's outline — and the closest kept,
 * unmirrored on a tie. */
export function boardFit(level: Level): BoardFit | null {
  if (level.group !== "reptile" || level.tiles.length !== 1) return null;
  const { ring, region } = level;
  const tile = level.tiles[0]!.pieces.map((p) => p.verts.map((v) => ring.toXY(v)));
  const board = region.map((loop) => loop.map((v) => ring.toXY(v)));
  const area = (loops: XY[][]): number => Math.abs(loops.reduce((a, l) => a + signedArea(l), 0));
  const [bx, by] = centroidOf(board);
  const scale = Math.sqrt(area(board) / area(tile));
  const segments = (loops: XY[][]): [XY, XY][] =>
    loops.flatMap((l) => l.map((p, i): [XY, XY] => [p, l[(i + 1) % l.length]!]));
  const directions = (loops: XY[][]): number[] =>
    segments(loops).map(([[ax, ay], [cx, cy]]) => Math.atan2(cy - ay, cx - ax));
  const away = ([px, py]: XY, segs: [XY, XY][]): number =>
    Math.min(
      ...segs.map(([[ax, ay], [cx, cy]]) => {
        const dx = cx - ax;
        const dy = cy - ay;
        const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy)));
        return Math.hypot(px - ax - t * dx, py - ay - t * dy);
      }),
    );
  const boardSegs = segments(board);
  const boardDirs = directions(board);
  let best: BoardFit | null = null;
  for (const flip of [false, true]) {
    // mirrored, listed backwards so it still runs counter-clockwise, as the
    // board does: else every edge would point the other way along the board's
    const own = tile.map((l) => (flip ? [...l].reverse() : l).map((p) => mirrorIf(p, flip)));
    const [cx, cy] = centroidOf(own);
    for (const td of directions(own))
      for (const bd of boardDirs) {
        const angle = bd - td;
        const laid = own.map((l) =>
          l.map((p): XY => {
            const [x, y] = turn([p[0] - cx, p[1] - cy], angle);
            return [bx + x * scale, by + y * scale];
          }),
        );
        const laidSegs = segments(laid);
        const miss =
          laid.flat().reduce((m, p) => Math.max(m, away(p, boardSegs)), 0) +
          board.flat().reduce((m, p) => Math.max(m, away(p, laidSegs)), 0);
        // a mirror, or another angle, only where it fits clearly better
        if (best === null || miss < best.miss - 1e-6 * scale)
          best = { pose: { angle, flip }, miss, centre: [cx, cy], board: [bx, by], scale };
      }
  }
  return best;
}

const mirrorIf = ([x, y]: XY, flip: boolean): XY => (flip ? [x, -y] : [x, y]);
const turn = ([x, y]: XY, angle: number): XY => [
  x * Math.cos(angle) - y * Math.sin(angle),
  x * Math.sin(angle) + y * Math.cos(angle),
];

/** A coloured or lined tile's bands and lines (view/decor.ts), over it. */
function decorate(
  svg: SVGSVGElement,
  loops: ReturnType<typeof loopsOf>,
  map: (p: XY) => XY,
  unit: MarkUnit | undefined,
  edge: string,
): void {
  for (const part of decorParts(loops, map, unit, { class: edge })) {
    const path = document.createElementNS(NS, "path");
    path.setAttribute("d", part.d);
    path.setAttribute("class", part.class);
    if (part.width !== undefined) path.setAttribute("style", `stroke-width: ${part.width}`);
    svg.appendChild(path);
  }
}

/** Every tray tile of `level` in a grid of as near square as fits them —
 * three tiles in a row of three, four as two by two, six as three by two —
 * each in the middle of its cell, all at one scale (their true sizes), with
 * their marks: what a marking's card shows, big, in place of the board. */
export function trayIcon(level: Level): SVGSVGElement {
  const { ring } = level;
  const shapes = level.tiles.map((t) => loopsOf(ring, t.pieces));
  // each tile's box, y flipped as drawn
  const boxes = shapes.map((loops) => {
    const xy = loopsReach(loops);
    const xs = xy.map(([x]) => x);
    const ys = xy.map(([, y]) => -y);
    return { x0: Math.min(...xs), x1: Math.max(...xs), y0: Math.min(...ys), y1: Math.max(...ys) };
  });
  const n = shapes.length;
  const cols = Math.ceil(Math.sqrt(n));
  const rows = Math.ceil(n / cols);
  const cell = Math.max(...boxes.flatMap((b) => [b.x1 - b.x0, b.y1 - b.y0])) * 1.18;
  const size = Math.max(cols, rows) * cell;
  const svg = svgIn("tray-icon", [(cols * cell - size) / 2, (rows * cell - size) / 2, size, size]);
  shapes.forEach((loops, kind) => {
    const b = boxes[kind]!;
    // the last row's tiles centred under the rest
    const row = Math.floor(kind / cols);
    const inRow = row === rows - 1 ? n - row * cols : cols;
    const col = kind % cols;
    const cx = (col + 0.5 + (cols - inRow) / 2) * cell;
    const cy = (row + 0.5) * cell;
    const dx = cx - (b.x0 + b.x1) / 2;
    const dy = cy - (b.y0 + b.y1) / 2;
    const map = ([x, y]: XY): XY => [x + dx, -y + dy];
    const poly = document.createElementNS(NS, "path");
    poly.setAttribute("d", loopsPath(loops, map));
    poly.setAttribute("class", `tile ${level.colours[kind]}`);
    poly.setAttribute("stroke-width", String(cell * 0.03));
    svg.appendChild(poly);
    decorate(svg, loops, map, markUnit(level), level.colours[kind]!);
  });
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
 * a light bulb for the hint, a die for a new random level and the settings
 * gear (both Hypersweeper's). */
export const GLYPHS: Record<string, string> = {
  back: `<path d="M14.6 5.4 L8 12 L14.6 18.6" ${STROKE}/>`,
  home: `<path d="M3.8 11.2 L12 4 L20.2 11.2" ${STROKE}/>
    <path d="M6.2 9.4 V19.6 H17.8 V9.4" ${STROKE}/>
    <path d="M10.2 19.6 V14.4 H13.8 V19.6" ${STROKE}/>`,
  restart: `<path d="M4.5 12 A7.5 7.5 0 1 0 12 4.5" ${STROKE}/>
    <path d="M15.1 1.4 L11.4 4.5 L15.1 7.6" ${STROKE}/>`,
  hint: `<path d="M9.2 17.2 V15.6 C9.2 14.2 8.4 13.4 7.5 12.4 A6 6 0 1 1 16.5 12.4 C15.6 13.4 14.8 14.2 14.8 15.6 V17.2 Z" ${STROKE}/>
    <path d="M9.6 20.4 H14.4" ${STROKE}/>
    <path d="M12 13.6 V11.4 M10.4 10.2 L12 11.4 L13.6 10.2" ${STROKE}/>`,
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
