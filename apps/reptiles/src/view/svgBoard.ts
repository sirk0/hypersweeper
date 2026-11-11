// The board as SVG: the region, the placed tiles, the open edges, the tray with
// its controls (turn every tile either way, flip, remove mode), and while a
// tile is dragged, the floating tile and a dot on each of its corners that
// would meet the edge.
//
// The SVG is in screen pixels (its viewBox is its own size), holding three
// layers. The *world* — region and tiles, in board units with y up — carries
// one transform, the camera: fitted to the room the tray leaves at zoom 1, and
// pinched or wheeled in to four times that about any point (`zoomAt`, `panBy`).
// The *tray* sits on a strip pinned along the bottom (portrait) or the right
// (landscape), in two rows: a *shelf* of tiles at the board's own scale — so a
// tray tile is exactly the size it lands at, and zooming in grows them with the
// board — which scrolls along the strip, with a scroll bar, when it is longer
// than the room (`scrollTray`, `scrollBarBy`); then the controls, at a fixed
// size, in a row of their own — in landscape, the same turned: a column of
// tiles, then a column of controls. The floating
// tile is drawn over all of it, in world units. The pointer maps back to the world with one
// getScreenCTM().inverse(), and a turn counter-clockwise in board units reads
// counter-clockwise on screen.

import { centroidOf, type XY } from "../geometry/shape";
import {
  edgePath,
  loopsOf,
  loopsPath,
  loopsReach,
  outlinePath,
  reachPoints,
  shiftLoops,
  type Loop,
} from "./curve";
import type { Puzzle } from "../puzzle";
import { decorParts, markUnit } from "./decor";

const NS = "http://www.w3.org/2000/svg";

function el<K extends keyof SVGElementTagNameMap>(
  tag: K,
  attrs: Record<string, string | number>,
  parent?: Element,
): SVGElementTagNameMap[K] {
  const node = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
  parent?.appendChild(node);
  return node;
}

const points = (pts: XY[]): string => pts.map(([x, y]) => `${x},${y}`).join(" ");

/** A coloured or lined tile's bands and lines (view/decor.ts), drawn over it
 * in `parent`; nothing for a plain tile. */
function decor(
  loops: readonly Loop[],
  parent: Element,
  map: ((p: XY) => XY) | undefined,
  unit: number | undefined,
): void {
  for (const part of decorParts(loops, map, unit))
    el("path", { d: part.d, class: part.class }, parent);
}

/** The gap round the board, in tile edges, at zoom 1. */
const MARGIN = 0.3;
/** The tray strip's padding round its contents, in tile edges. */
const TRAY_PAD = 0.3;
/** How far in the board zooms, from fitted. */
export const MAX_ZOOM = 4;
/** The most of the screen's height (portrait) or width (landscape) the tray
 * strip grows to as the board zooms in: past it, the shelf stops growing. */
const TRAY_SHARE = 0.45;
/** A control knob's diameter on screen, in pixels, where the screen has room. */
const KNOB_PX = 48;
/** The scroll bar's row under the shelf, its visible track's thickness, and
 * its inset from the strip's ends, in pixels. */
const BAR_ROOM = 16;
const BAR = 5;
const BAR_INSET = 10;
/** Each board's own id for its shelf's clip path. */
let boards = 0;
/** The room left above the fitted board for the level's name, which is drawn
 * on the page behind it (`.board-name`), in pixels. */
const LABEL_ROOM = 22;
/** A control's radius, the gap between controls, and the room its label
 * takes underneath it. */
const KNOB = 0.4;
const KNOB_GAP = 0.15;
const LABEL = 0.3;
/** A pile's count badge radius, in tray units — but never under `PILE_PX`
 * on screen, where a wide board (the kissing square chain, 16 units) puts a
 * unit at a couple of dozen pixels. */
const PILE = 0.22;
const PILE_PX = 9;
/** The gap between one tray kind and the next. */
const TRAY_GAP = 0.35;

/**
 * A rotate control's picture, about (cx, cy): the axis of rotation as a dot,
 * a fixed ray straight up, a second ray turned one step from it, and an arrow
 * sweeping between them — counter-clockwise for dir = 1, clockwise for -1 — so
 * the angle drawn is the angle a press turns the tile by.
 */
function stepGlyph(
  kx: number,
  ky: number,
  dir: 1 | -1,
  step: number,
): { axis: XY; rays: string; arc: string; head: string } {
  // A step of up to a right angle is a wedge opening upward, so the axis sits
  // low and the wedge fills the button. A wider one — the prismatic
  // pentagonal's 180° — would swing its second ray out through the bottom; it
  // turns about the button's own centre instead.
  const wide = step > Math.PI / 2 + 1e-9;
  const cx = kx;
  const cy = wide ? ky : ky - KNOB * 0.4;
  const ray = wide ? KNOB * 0.72 : KNOB * 0.98;
  const r = wide ? KNOB * 0.5 : KNOB * 0.68;
  const from = Math.PI / 2;
  const sweep = dir * step;
  const at = (a: number, len: number): XY => [cx + len * Math.cos(a), cy + len * Math.sin(a)];
  const rays = points([at(from, ray), [cx, cy], at(from + sweep, ray)]);
  const arc: XY[] = [];
  for (let i = 0; i <= 16; i++) arc.push(at(from + (sweep * i) / 16, r));
  const end = from + sweep;
  const [ex, ey] = at(end, r);
  const tangent: XY = [-Math.sin(end) * dir, Math.cos(end) * dir];
  const radial: XY = [Math.cos(end), Math.sin(end)];
  const w = KNOB * 0.26;
  // the tip at the second ray, the base behind it along the arc
  const head: XY[] = [
    [ex, ey],
    [ex - tangent[0] * w + radial[0] * w * 0.6, ey - tangent[1] * w + radial[1] * w * 0.6],
    [ex - tangent[0] * w - radial[0] * w * 0.6, ey - tangent[1] * w - radial[1] * w * 0.6],
  ];
  return { axis: [cx, cy], rays, arc: points(arc), head: points(head) };
}

/** The tray's controls, after its tiles: turn every tile either way, flip
 * them, and remove mode. */
type Control = "rotate-ccw" | "rotate-cw" | "flip" | "remove";

type Box = [number, number, number, number];

export class SvgBoard {
  readonly svg: SVGSVGElement;
  /** The world layer (region, tiles, open edges) and the dragged tile over
   * everything: both under the camera's transform. */
  private still: SVGGElement;
  private moving: SVGGElement;
  /** The tray strip (screen pixels); on it, the shelf of tiles (board units,
   * clipped to its room) and the controls. */
  private zone: SVGRectElement;
  private shelf: SVGGElement;
  private shelfClip: SVGRectElement;
  private knobs: SVGGElement;
  /** The shelf's scroll bar: a hit area over its whole row, the track, and
   * the thumb; and where the track runs, and the shelf's length and overflow,
   * in pixels. */
  private bar: SVGGElement;
  private barHit: SVGRectElement;
  private barTrack: SVGRectElement;
  private barThumb: SVGRectElement;
  private track: Box = [0, 0, 0, 0];
  private shelfLength = 0;
  private overflow = 0;
  /** Where each tray kind sits, centroid in tray units. */
  trayAt: XY[] = [];
  /** The camera: how far in from fitted, and the board point at the middle of
   * the room the tray leaves (null: the board's own middle). */
  private zoom = 1;
  private centre: XY | null = null;
  /** Pixels per board unit for the world, the shelf and the controls; the
   * room the board is framed in, the tray strip, and the shelf's room on it. */
  private scale = 1;
  private shelfScale = 1;
  private knobScale = 1;
  private view: Box = [0, 0, 0, 0];
  private strip: Box = [0, 0, 0, 0];
  private shelfRoom: Box = [0, 0, 0, 0];
  /** Where the shelf's own (0, 0) and the controls' land on screen. */
  private shelfAt: XY = [0, 0];
  private knobsAt: XY = [0, 0];
  /** How far the shelf is scrolled along the strip, in pixels. */
  private scrolled = 0;
  private landscape = false;
  /** How far every tray tile is turned from resting flat, as a power of ζ —
   * the one rotate control turns them all together. */
  turn = 0;
  /** Whether every tray tile is held mirrored — the flip control, on a level
   * whose board uses some kind both ways round. */
  flip = false;
  /** The shelf's tiles and the controls, each padded, in their own units. */
  private shelfBox: Box = [0, 0, 0, 0];
  private knobBox: Box = [0, 0, 0, 0];
  /** The region's bounding box, in board units. */
  private regionBox: Box = [0, 0, 0, 0];
  /** Where each control sits. */
  private controlsAt = new Map<Control, XY>();
  /** Per tray kind, its farthest corner from its centroid — the same at any turn. */
  private radius: number[];
  /** Whether the remove mode is on: placed tiles show as removable. */
  get removing(): boolean {
    return this.svg.classList.contains("removing");
  }

  set removing(on: boolean) {
    this.svg.classList.toggle("removing", on);
  }

  constructor(
    host: HTMLElement,
    private puzzle: Puzzle,
  ) {
    this.svg = el("svg", { class: "board", role: "img", "aria-label": "Tiling board" });
    host.appendChild(this.svg);
    this.still = el("g", { class: "world" }, this.svg);
    this.zone = el("rect", { class: "tray-zone" }, this.svg);
    const clipId = `shelf-clip-${++boards}`;
    const clip = el("clipPath", { id: clipId, clipPathUnits: "userSpaceOnUse" }, this.svg);
    this.shelfClip = el("rect", {}, clip);
    const room = el("g", { "clip-path": `url(#${clipId})` }, this.svg);
    this.shelf = el("g", { class: "tray-layer" }, room);
    this.knobs = el("g", { class: "tray-controls" }, this.svg);
    this.bar = el("g", { class: "tray-scroll", "data-scrollbar": "" }, this.svg);
    this.barHit = el("rect", { class: "tray-scroll-hit" }, this.bar);
    this.barTrack = el("rect", { class: "tray-scroll-track", rx: BAR / 2 }, this.bar);
    this.barThumb = el("rect", { class: "tray-scroll-thumb", rx: BAR / 2 }, this.bar);
    this.moving = el("g", {}, this.svg);
    // as far as the drawn tile reaches, round edges and all
    this.radius = puzzle.level.tiles.map((_, kind) =>
      Math.max(...loopsReach(this.outline(kind, 0)).map(([x, y]) => Math.hypot(x, y))),
    );
    const { ring, region, regionCurves } = puzzle.level;
    const xy = region.flatMap((loop, i) =>
      reachPoints(
        loop.map((v) => ring.toXY(v)),
        regionCurves?.[i],
      ),
    );
    this.regionBox = [
      Math.min(...xy.map((p) => p[0])),
      Math.min(...xy.map((p) => p[1])),
      Math.max(...xy.map((p) => p[0])),
      Math.max(...xy.map((p) => p[1])),
    ];
    this.layout();
  }

  /** Whether a client (screen) point is over the tray strip. */
  overTray(clientX: number, clientY: number): boolean {
    const r = this.svg.getBoundingClientRect();
    const x = clientX - r.left;
    const y = clientY - r.top;
    const [x0, y0, x1, y1] = this.strip;
    return x >= x0 && x <= x1 && y >= y0 && y <= y1;
  }

  /** Where a tray kind sits, in board (world) units — where a tile picked up
   * from the tray starts. */
  trayCentre(kind: number): XY {
    const [px, py] = this.trayAt[kind]!;
    const [ox, oy] = this.shelfAt;
    return this.screenToWorld([ox + this.shelfScale * px, oy - this.shelfScale * py]);
  }

  /** Scroll the shelf by a drag of (dx, dy) screen pixels — the part along
   * the strip. */
  scrollTray(dx: number, dy: number): void {
    this.scrolled -= this.landscape ? dy : dx;
    this.place();
  }

  /** The scroll bar's track length and its thumb's, in pixels. */
  private thumbSpan(): { track: number; thumb: number } {
    const [a0, b0, a1, b1] = this.track;
    const track = this.landscape ? b1 - b0 : a1 - a0;
    const room = this.shelfLength - this.overflow;
    const thumb = Math.min(track, Math.max(28, (track * room) / Math.max(1, this.shelfLength)));
    return { track, thumb };
  }

  /** Move the scroll bar's thumb by a drag of (dx, dy) screen pixels. */
  scrollBarBy(dx: number, dy: number): void {
    const { track, thumb } = this.thumbSpan();
    if (track <= thumb) return;
    this.scrolled += ((this.landscape ? dy : dx) * this.overflow) / (track - thumb);
    this.place();
  }

  /** Put the scroll bar's thumb's middle at a client point on the track. */
  scrollBarTo(clientX: number, clientY: number): void {
    const r = this.svg.getBoundingClientRect();
    const [a0, b0] = this.track;
    const at = this.landscape ? clientY - r.top - b0 : clientX - r.left - a0;
    const { track, thumb } = this.thumbSpan();
    if (track <= thumb) return;
    this.scrolled = ((at - thumb / 2) * this.overflow) / (track - thumb);
    this.place();
  }

  /** A kind's outline — a loop per piece, round edges and all — mirrored if
   * `flip`, turned by ζ^rot, about its own centroid. */
  outline(kind: number, rot: number, flip = false): Loop[] {
    const { ring } = this.puzzle.level;
    const loops = loopsOf(ring, this.puzzle.shapeAt(kind, rot, flip).pieces);
    const [cx, cy] = centroidOf(loops.map((l) => l.xy));
    return shiftLoops(loops, ([x, y]) => [x - cx, y - cy]);
  }

  /** A kind's tray circle radius. */
  private trayRadius(kind: number): number {
    return this.radius[kind]! + 0.25;
  }

  private controls(): Control[] {
    const out: Control[] = [];
    if (this.puzzle.canTurn()) out.push("rotate-ccw", "rotate-cw");
    if (this.puzzle.canFlip()) out.push("flip");
    out.push("remove");
    return out;
  }

  /** Lay the tray out and fit everything to the element. The shelf is a row
   * of circles in portrait, a column in landscape; the controls are two to a
   * row, at the row's end or the column's foot. */
  layout(): void {
    const { width, height } = this.svg.getBoundingClientRect();
    this.landscape = width > height;
    const controls = this.controls();
    // A control's own box: the knob and its label underneath. One row of them
    // under the shelf in portrait; one column beside it in landscape.
    const knobH = 2 * KNOB + LABEL;
    const cols = this.landscape ? 1 : controls.length;
    const rows = Math.ceil(controls.length / cols);
    const gridW = cols * 2 * KNOB + (cols - 1) * KNOB_GAP;
    const gridH = rows * knobH + (rows - 1) * KNOB_GAP;
    this.trayAt = [];
    let along = 0;
    this.radius.forEach((_, kind) => {
      const r = this.trayRadius(kind);
      this.trayAt.push(this.landscape ? [0, -(along + r)] : [along + r, 0]);
      along += 2 * r + TRAY_GAP;
    });
    const shelfBoxes: Box[] = this.trayAt.map(([cx, cy], kind) => {
      const r = this.trayRadius(kind);
      return [cx - r, cy - r, cx + r, cy + r];
    });
    this.shelfBox = [
      Math.min(...shelfBoxes.map((b) => b[0])) - TRAY_PAD,
      Math.min(...shelfBoxes.map((b) => b[1])) - TRAY_PAD,
      Math.max(...shelfBoxes.map((b) => b[2])) + TRAY_PAD,
      Math.max(...shelfBoxes.map((b) => b[3])) + TRAY_PAD,
    ];
    this.controlsAt.clear();
    controls.forEach((control, i) => {
      const col = i % cols;
      const row = Math.floor(i / cols);
      const kx = -gridW / 2 + KNOB + col * (2 * KNOB + KNOB_GAP);
      this.controlsAt.set(control, [kx, gridH / 2 - KNOB - row * (knobH + KNOB_GAP)]);
    });
    this.knobBox = [
      -gridW / 2 - TRAY_PAD,
      -gridH / 2 - TRAY_PAD,
      gridW / 2 + TRAY_PAD,
      gridH / 2 + TRAY_PAD,
    ];
    this.place();
    this.draw();
  }

  /** The scales, the board's room, the tray strip, and on it the shelf's
   * room, the scroll bar and the controls, for the zoom as it is. The shelf is
   * at the world's scale, up to `TRAY_SHARE` of the screen; the controls at a
   * fixed size; and the world fitted, at zoom 1, to what the strip leaves. */
  private frame(width: number, height: number): void {
    const [x0, y0, x1, y1] = this.regionBox;
    const [s0, t0, s1, t1] = this.shelfBox;
    const [k0, l0, k1, l1] = this.knobBox;
    const land = this.landscape;
    // Across the strip and along it: the screen, the board, the shelf.
    const across = land ? width : height;
    const length = land ? height : width;
    const boardAcross = (land ? x1 - x0 : y1 - y0) + 2 * MARGIN;
    const boardAlong = (land ? y1 - y0 : x1 - x0) + 2 * MARGIN;
    const shelfAcross = land ? s1 - s0 : t1 - t0;
    const shelfAlong = land ? t1 - t0 : s1 - s0;
    this.knobScale = Math.min(KNOB_PX / (2 * KNOB), (0.13 * Math.min(width, height)) / (2 * KNOB));
    const ks = this.knobScale;
    // The controls' block: a row under the shelf in portrait, a column beside
    // it in landscape.
    const knobsW = ks * (k1 - k0);
    const knobsH = ks * (l1 - l0);
    const cap = (TRAY_SHARE * across) / shelfAcross;
    const shelfThick = (scale: number): number => Math.min(scale, cap) * shelfAcross;
    const thickness = (scale: number): number =>
      shelfThick(scale) + BAR_ROOM + (land ? knobsW : knobsH);
    // The largest fit that leaves the board and the strip both on screen: the
    // strip grows with the scale, so search for it. The label's room comes off
    // the screen's height: across the strip in portrait, along it in landscape.
    const roomAlong = land ? length - LABEL_ROOM : length;
    const roomAcross = land ? across : across - LABEL_ROOM;
    let lo = 0;
    let hi = Math.min(roomAlong / boardAlong, roomAcross / boardAcross);
    for (let i = 0; i < 40; i++) {
      const mid = (lo + hi) / 2;
      if (mid * boardAcross + thickness(mid) <= roomAcross) lo = mid;
      else hi = mid;
    }
    this.scale = lo * this.zoom;
    this.shelfScale = Math.min(this.scale, cap);
    const ss = this.shelfScale;
    const strip = thickness(this.scale);
    const thick = shelfThick(this.scale);
    const shelfRoomLen = length;
    this.shelfLength = ss * shelfAlong;
    this.overflow = Math.max(0, this.shelfLength - shelfRoomLen);
    this.scrolled = Math.min(this.overflow, Math.max(0, this.scrolled));
    // Where the shelf starts along the strip: centred in its room while it
    // fits, scrolled once it does not.
    const start = this.overflow > 0 ? -this.scrolled : (shelfRoomLen - this.shelfLength) / 2;
    if (land) {
      const sx0 = width - strip;
      this.view = [0, LABEL_ROOM, sx0, height];
      this.strip = [sx0, 0, width, height];
      // The shelf column, the bar down its right-hand side, the controls'
      // column beside that.
      const shelfX1 = sx0 + thick;
      this.shelfRoom = [sx0, 0, shelfX1, height];
      this.shelfAt = [(sx0 + shelfX1) / 2 - ss * ((s0 + s1) / 2), start + ss * t1];
      const bx = shelfX1 + (BAR_ROOM - BAR) / 2;
      this.track = [bx, BAR_INSET, bx + BAR, height - BAR_INSET];
      this.knobsAt = [shelfX1 + BAR_ROOM + knobsW / 2, height / 2];
    } else {
      const sy0 = height - strip;
      this.view = [0, LABEL_ROOM, width, sy0];
      this.strip = [0, sy0, width, height];
      // The shelf row, the bar under it, the controls' row under that.
      this.shelfRoom = [0, sy0, width, sy0 + thick];
      this.shelfAt = [start - ss * s0, sy0 + thick / 2 + ss * ((t0 + t1) / 2)];
      const by = sy0 + thick + (BAR_ROOM - BAR) / 2;
      this.track = [BAR_INSET, by, width - BAR_INSET, by + BAR];
      this.knobsAt = [width / 2, sy0 + thick + BAR_ROOM + knobsH / 2];
    }
  }

  /** The scroll bar: shown only while the shelf overflows. */
  private placeBar(): void {
    this.bar.style.display = this.overflow > 0 ? "" : "none";
    if (this.overflow <= 0) return;
    const [a0, b0, a1, b1] = this.track;
    const { track, thumb } = this.thumbSpan();
    const at = ((track - thumb) * this.scrolled) / this.overflow;
    const box = (r: SVGRectElement, x: number, y: number, w: number, h: number): void => {
      for (const [k, v] of Object.entries({ x, y, width: w, height: h }))
        r.setAttribute(k, String(v));
    };
    const pad = (BAR_ROOM - BAR) / 2;
    box(this.barTrack, a0, b0, a1 - a0, b1 - b0);
    if (this.landscape) {
      box(this.barHit, a0 - pad, b0, BAR_ROOM, b1 - b0);
      box(this.barThumb, a0, b0 + at, a1 - a0, thumb);
    } else {
      box(this.barHit, a0, b0 - pad, a1 - a0, BAR_ROOM);
      box(this.barThumb, a0 + at, b0, thumb, b1 - b0);
    }
  }

  /** The camera's middle, held where the board can still fill the room: the
   * board's own middle at zoom 1, and within reach of its edges zoomed in. */
  private clamp([cx, cy]: XY): XY {
    const [x0, y0, x1, y1] = this.regionBox;
    const slack = 1 - 1 / this.zoom;
    const hx = ((x1 - x0) / 2 + MARGIN) * slack;
    const hy = ((y1 - y0) / 2 + MARGIN) * slack;
    const mx = (x0 + x1) / 2;
    const my = (y0 + y1) / 2;
    return [Math.min(mx + hx, Math.max(mx - hx, cx)), Math.min(my + hy, Math.max(my - hy, cy))];
  }

  /** The world layer's offset: the camera's middle at the middle of the room. */
  private worldOffset(): XY {
    const [cx, cy] = this.centre ?? this.clamp([0, 0]);
    const [vx0, vy0, vx1, vy1] = this.view;
    return [(vx0 + vx1) / 2 - this.scale * cx, (vy0 + vy1) / 2 + this.scale * cy];
  }

  private screenToWorld([sx, sy]: XY): XY {
    const [tx, ty] = this.worldOffset();
    return [(sx - tx) / this.scale, (ty - sy) / this.scale];
  }

  /** Size the SVG to its element and set both layers' transforms and the
   * strip — everything a zoom or a pan changes, and nothing it does not. */
  private place(): void {
    const { width, height } = this.svg.getBoundingClientRect();
    if (width <= 0 || height <= 0) return;
    this.svg.setAttribute("viewBox", `0 0 ${width} ${height}`);
    this.frame(width, height);
    this.centre = this.clamp(this.centre ?? [0, 0]);
    const [tx, ty] = this.worldOffset();
    const world = `matrix(${this.scale},0,0,${-this.scale},${tx},${ty})`;
    this.still.setAttribute("transform", world);
    this.moving.setAttribute("transform", world);
    const [z0, w0, z1, w1] = this.strip;
    for (const [k, v] of Object.entries({ x: z0, y: w0, width: z1 - z0, height: w1 - w0 }))
      this.zone.setAttribute(k, String(v));
    const [r0, q0, r1, q1] = this.shelfRoom;
    for (const [k, v] of Object.entries({ x: r0, y: q0, width: r1 - r0, height: q1 - q0 }))
      this.shelfClip.setAttribute(k, String(v));
    const ss = this.shelfScale;
    this.shelf.setAttribute(
      "transform",
      `matrix(${ss},0,0,${-ss},${this.shelfAt[0]},${this.shelfAt[1]})`,
    );
    this.placeBar();
    const ks = this.knobScale;
    this.knobs.setAttribute(
      "transform",
      `matrix(${ks},0,0,${-ks},${this.knobsAt[0]},${this.knobsAt[1]})`,
    );
  }

  /** Zoom by `factor` about a client point, which stays put on the board. */
  zoomAt(factor: number, clientX: number, clientY: number): void {
    const zoom = Math.min(MAX_ZOOM, Math.max(1, this.zoom * factor));
    if (zoom === this.zoom) return;
    const p = this.toBoard(clientX, clientY);
    const r = this.svg.getBoundingClientRect();
    this.zoom = zoom;
    this.frame(r.width, r.height);
    const [vx0, vy0, vx1, vy1] = this.view;
    const sx = clientX - r.left - (vx0 + vx1) / 2;
    const sy = clientY - r.top - (vy0 + vy1) / 2;
    this.centre = this.clamp([p[0] - sx / this.scale, p[1] + sy / this.scale]);
    this.place();
  }

  /** Move the board by a drag of (dx, dy) screen pixels. */
  panBy(dx: number, dy: number): void {
    if (this.zoom === 1) return;
    const [cx, cy] = this.centre ?? [0, 0];
    this.centre = this.clamp([cx - dx / this.scale, cy + dy / this.scale]);
    this.place();
  }

  /** How far in the board is zoomed, from fitted. */
  get zoomed(): number {
    return this.zoom;
  }

  /** Redraw the settled picture: region, tiles, open edges, tray. */
  draw(): void {
    const { ring, region, regionCurves } = this.puzzle.level;
    this.still.replaceChildren();
    const d = region
      .map((loop, i) =>
        outlinePath(
          loop.map((v) => ring.toXY(v)),
          regionCurves?.[i],
        ),
      )
      .join("");
    el("path", { d, class: "region", "fill-rule": "evenodd" }, this.still);
    for (const tile of this.puzzle.tiles) {
      const loops = loopsOf(ring, tile.pieces);
      el(
        "path",
        {
          d: loopsPath(loops),
          class: `tile ${this.puzzle.level.colours[tile.kind]}`,
          "data-tile": tile.id,
        },
        this.still,
      );
      decor(loops, this.still, undefined, markUnit(this.puzzle.level));
    }
    for (const e of this.puzzle.openEdges) {
      el("path", { d: edgePath(e.axy, e.bxy, e.bulge), class: "open" }, this.still);
    }
    this.shelf.replaceChildren();
    this.knobs.replaceChildren();
    this.trayAt.forEach(([cx, cy], kind) => {
      const r = this.trayRadius(kind);
      el("circle", { cx, cy, r, class: "tray", "data-tray": kind }, this.shelf);
      const outline = this.outline(kind, this.turn, this.flip);
      const at = ([x, y]: XY): XY => [x + cx, y + cy];
      el(
        "path",
        {
          d: loopsPath(outline, at),
          class: `tile ${this.puzzle.level.colours[kind]} in-tray`,
          "data-tray": kind,
        },
        this.shelf,
      );
      decor(outline, this.shelf, at, markUnit(this.puzzle.level));
      // The pile's count: how many more the board was cut with. Past zero it
      // shows how many extra are down — allowed, but it costs a star.
      const left = this.puzzle.level.need[kind]! - this.puzzle.used(kind);
      const bx = cx + r * 0.72;
      const by = cy - r * 0.72;
      const badge = el(
        "g",
        { class: `pile${left < 0 ? " over" : left === 0 ? " done" : ""}`, "data-tray": kind },
        this.shelf,
      );
      const pr = Math.max(PILE, PILE_PX / this.shelfScale);
      el("circle", { cx: bx, cy: by, r: pr }, badge);
      const text = el("text", { x: bx, y: -by, transform: "scale(1,-1)" }, badge);
      // the stylesheet's size, grown with the badge
      if (pr > PILE) text.style.fontSize = `${(0.24 * pr) / PILE}px`;
      text.textContent = left < 0 ? `+${-left}` : String(left);
    });
    for (const [control, [kx, ky]] of this.controlsAt) {
      const knob = el("g", { class: `knob knob-${control}` }, this.knobs);
      el("circle", { cx: kx, cy: ky, r: KNOB }, knob);
      let label: string;
      if (control === "rotate-ccw" || control === "rotate-cw") {
        // Every tile at once, one step either way: at a 15° step the long way
        // round is twenty-odd presses, so each direction has its own control.
        const dir = control === "rotate-ccw" ? 1 : -1;
        const turn = this.puzzle.level.turn;
        const degrees = `${Math.round((360 * turn) / ring.n)}°`;
        knob.setAttribute("data-turn", String(dir));
        el("title", {}, knob).textContent =
          dir === 1
            ? `Turn every tile ${degrees} anticlockwise (Shift+R)`
            : `Turn every tile ${degrees} clockwise (R)`;
        const { axis, rays, arc, head } = stepGlyph(kx, ky, dir, (2 * Math.PI * turn) / ring.n);
        el("polyline", { points: rays, class: "knob-ray" }, knob);
        el("polyline", { points: arc, class: "knob-arc" }, knob);
        el("polygon", { points: head, class: "knob-head" }, knob);
        el("circle", { cx: axis[0], cy: axis[1], r: KNOB * 0.1, class: "knob-axis" }, knob);
        label = `${dir === 1 ? "↺" : "↻"} ${degrees}`;
      } else if (control === "flip") {
        // Mirror every tile in the tray, and the one in hand: a tile and its
        // mirror image either side of a dashed axis.
        knob.setAttribute("data-flip", "");
        el("title", {}, knob).textContent = "Flip every tile over (F)";
        const a = KNOB * 0.55;
        const h = KNOB * 0.5;
        el(
          "polyline",
          {
            points: points([
              [kx, ky - KNOB * 0.62],
              [kx, ky + KNOB * 0.62],
            ]),
            class: "knob-mirror",
          },
          knob,
        );
        el(
          "polygon",
          {
            points: points([
              [kx - 0.08 * KNOB, ky - h],
              [kx - 0.08 * KNOB, ky + h],
              [kx - a, ky - h],
            ]),
            class: "knob-half",
          },
          knob,
        );
        el(
          "polygon",
          {
            points: points([
              [kx + 0.08 * KNOB, ky - h],
              [kx + 0.08 * KNOB, ky + h],
              [kx + a, ky - h],
            ]),
            class: "knob-half hollow",
          },
          knob,
        );
        label = "⇋ flip";
      } else {
        knob.setAttribute("data-remove", "");
        el("title", {}, knob).textContent =
          "Remove tiles: turn on, then tap tiles on the board (X)";
        const a = KNOB * 0.38;
        el(
          "polyline",
          {
            points: points([
              [kx - a, ky - a],
              [kx + a, ky + a],
            ]),
            class: "knob-x",
          },
          knob,
        );
        el(
          "polyline",
          {
            points: points([
              [kx - a, ky + a],
              [kx + a, ky - a],
            ]),
            class: "knob-x",
          },
          knob,
        );
        label = "remove";
      }
      // Text has to be flipped back upright against the root's y flip.
      const text = el(
        "text",
        { x: kx, y: -(ky - KNOB - LABEL * 0.75), transform: "scale(1,-1)", class: "knob-label" },
        knob,
      );
      text.textContent = label;
    }
  }

  /** The dragged tile — `outline` about its centroid, moved to `at` — and,
   * when it would snap, a ✓ where it would land (`fitsAt`, that spot's
   * centroid) and a dot on each of its corners that would meet the edge.
   * `discard`: it is over the tray, and letting go takes it off the board. */
  drawDrag(
    kind: number,
    outline: readonly Loop[],
    at: XY,
    fitsAt: XY | null,
    stick: XY[],
    discard = false,
  ): void {
    this.moving.replaceChildren();
    this.svg.classList.toggle("discarding", discard);
    const to = ([x, y]: XY): XY => [x + at[0], y + at[1]];
    el(
      "path",
      {
        d: loopsPath(outline, to),
        class: `tile ${this.puzzle.level.colours[kind]} floating${discard ? " discard" : ""}`,
      },
      this.moving,
    );
    decor(outline, this.moving, to, markUnit(this.puzzle.level));
    for (const [cx, cy] of stick) el("circle", { cx, cy, r: 0.11, class: "stick" }, this.moving);
    if (fitsAt) {
      const [cx, cy] = fitsAt;
      const r = 0.2;
      const badge = el("g", { class: "fits" }, this.moving);
      el("circle", { cx, cy, r }, badge);
      const tick: XY[] = [
        [cx - r * 0.45, cy + r * 0.02],
        [cx - r * 0.1, cy - r * 0.35],
        [cx + r * 0.48, cy + r * 0.35],
      ];
      el("polyline", { points: points(tick) }, badge);
    }
  }

  clearDrag(): void {
    this.moving.replaceChildren();
    this.svg.classList.remove("discarding");
  }

  /** A client (screen) point in board units. */
  toBoard(clientX: number, clientY: number): XY {
    const m = this.still.getScreenCTM();
    if (!m) return [0, 0];
    const p = new DOMPoint(clientX, clientY).matrixTransform(m.inverse());
    return [p.x, p.y];
  }
}
