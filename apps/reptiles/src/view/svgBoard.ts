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
// (landscape): a *shelf* of tiles at the board's own scale — so a tray tile is
// exactly the size it lands at, and zooming in grows them with the board — in
// one to three rows of tight slots, every tile on screen at zoom 1 (the board
// shrinks to make room), which scrolls along the strip, with a scroll bar, once
// zooming in makes it longer than the room (`scrollTray`, `scrollBarBy`); then
// the controls, at a fixed size, in a row of their own — in landscape, the same
// turned: columns of tiles, then a column of controls. The floating
// tile is drawn over all of it, in world units. The pointer maps back to the world with one
// getScreenCTM().inverse(), and a turn counter-clockwise in board units reads
// counter-clockwise on screen.

import { centroidOf, posed, turnsOntoPieces, type Piece, type XY } from "../geometry/shape";
import type { Hint } from "../hint";
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
import { decorParts, markUnit, type MarkUnit } from "./decor";

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

/** The font size text is laid out at before it is scaled down to the board's
 * units: WebKit lays out a sub-pixel font (a 0.24px pile count) off where
 * Chromium does, so no text is ever set that small. */
const TEXT_PX = 100;
/** How far above its baseline a line of digits' middle is, in ems: Space
 * Grotesk's digits stand 0 to 700 of its 1000 units. Read off the font, not
 * from `dominant-baseline`, which Safari and Chromium place differently. */
const DIGITS_MIDDLE = 0.35;

/** `content` centred on (x, y) — in y-up units, `size` units to the em —
 * flipped upright against the root's y flip. */
function centredText(
  parent: Element,
  [x, y]: XY,
  size: number,
  content: string,
  cls?: string,
): SVGTextElement {
  const k = size / TEXT_PX;
  const text = el(
    "text",
    {
      x: 0,
      y: DIGITS_MIDDLE * TEXT_PX,
      transform: `translate(${x} ${y}) scale(${k} ${-k})`,
      ...(cls ? { class: cls } : {}),
    },
    parent,
  );
  text.style.fontSize = `${TEXT_PX}px`;
  text.textContent = content;
  return text;
}

/** A coloured or lined tile's bands and lines (view/decor.ts), drawn over it
 * in `parent`, and its border (in its colour classes, `edge`) again over
 * them; nothing for a plain tile. */
function decor(
  loops: readonly Loop[],
  parent: Element,
  map: ((p: XY) => XY) | undefined,
  unit: MarkUnit | undefined,
  edge: string,
): void {
  for (const part of decorParts(loops, map, unit, { class: edge }))
    el(
      "path",
      {
        d: part.d,
        class: part.class,
        ...(part.width === undefined ? {} : { style: `stroke-width: ${part.width}` }),
      },
      parent,
    );
}

/** The gap round the board, in tile edges, at zoom 1. */
const MARGIN = 0.3;
/** The tray card's padding round the shelf, in tile edges — but never under
 * `TRAY_PAD_SHARE` of the tiles' size (`Spacing`). */
const TRAY_PAD = 0.15;
const TRAY_PAD_SHARE = 0.08;
/** The controls' padding round their row, in control units. */
const KNOB_PAD = 0.25;
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
/** The least room, in pixels, left between the shelf's ends and the screen's
 * edges at zoom 1. */
const SHELF_INSET = 6;
/** Each board's own id for its shelf's clip path. */
let boards = 0;
/** The room left above the fitted board for the level's name, which is drawn
 * on the page behind it (`.board-name`), in pixels — unless the stylesheet
 * says otherwise (`--label-room`): on a desktop the name is in the header,
 * and the board takes this room too. */
const LABEL_ROOM = 22;
/** The tray is a card (`--tray-card-gap`: 10px on a phone, 14px on a
 * desktop): inset from the screen's edges by the gap, as long as its tiles
 * and controls need (the strip, while the shelf scrolls), rounded by this. A
 * gap of 0 would make it a plain strip from end to end. */
const CARD_RADIUS = 18;
/** A control's radius, and the gap between controls. */
const KNOB = 0.4;
const KNOB_GAP = 0.15;
/** A pile's count badge radius, in tray units — but never under `PILE_PX`
 * on screen, where a wide board (the kissing square chain, 16 units) puts a
 * unit at a couple of dozen pixels. */
const PILE = 0.22;
/** A pile's count's font size, in its units, and a rotate control's step's
 * (smaller for a step of three digits, 180°, to stay inside its arrow). */
const PILE_FONT = 0.24;
const DEGREES_FONT = 0.2;
const DEGREES_FONT_LONG = 0.16;
const PILE_PX = 9;
/** A tray slot's padding round its tile, and the gap between one slot and
 * the next — along a row and from row to row — in tile edges; but never under
 * these shares of the tiles' size (`Spacing`). */
const SLOT_PAD = 0.08;
const TRAY_GAP = 0.2;
const SLOT_PAD_SHARE = 0.06;
const TRAY_GAP_SHARE = 0.1;
/** The most rows (columns, in landscape) the shelf is laid in. */
const MAX_ROWS = 3;
/** How much bigger a layout with more rows must let the board be to be
 * taken over one with fewer. */
const MORE_ROWS = 1.02;

/**
 * A rotate control's picture, about (kx, ky): an open circle of an arrow
 * round the button's middle — counter-clockwise for dir = 1, clockwise for -1
 * — its gap at the top and its head at the gap's far side, pointing on round,
 * so the step's size can sit inside it (`knob-degrees`).
 */
function turnGlyph(kx: number, ky: number, dir: 1 | -1): { arc: string; head: string } {
  const r = KNOB * 0.66;
  const gap = (75 * Math.PI) / 180;
  const from = Math.PI / 2 + (dir * gap) / 2;
  const sweep = dir * (2 * Math.PI - gap);
  const at = (a: number, len = r): XY => [kx + len * Math.cos(a), ky + len * Math.sin(a)];
  // the head: its base square across the arc's end, its tip on round along it
  const end = from + sweep;
  const length = KNOB * 0.3;
  const half = KNOB * 0.17;
  const [ex, ey] = at(end);
  const tangent: XY = [-dir * Math.sin(end), dir * Math.cos(end)];
  const head: XY[] = [
    [ex + tangent[0] * length, ey + tangent[1] * length],
    at(end, r + half),
    at(end, r - half),
  ];
  // the arc stops inside the head, so its round end never shows past it
  const stop = sweep - (dir * (length * 0.3)) / r;
  const arc: XY[] = [];
  for (let i = 0; i <= 48; i++) arc.push(at(from + (stop * i) / 48));
  return { arc: points(arc), head: points(head) };
}

/** The tray's controls, after its tiles: turn every tile either way, flip
 * them, and remove mode. */
type Control = "rotate-ccw" | "rotate-cw" | "flip" | "remove";

type Box = [number, number, number, number];

/** The shelf's spacing, in tray units: a slot's padding round its tile, the
 * gap between slots, and the card's padding round the shelf. Each is a share
 * of a tile edge, or of the tiles' size — the median slot's longer side —
 * where that is more: the hat's metatiles are many short edges round, and at
 * a tile edge apiece their plates would touch. */
type Spacing = { slot: number; gap: number; pad: number };

function spacingOf(reach: readonly Box[]): Spacing {
  const sides = reach.map(([x0, y0, x1, y1]) => Math.max(x1 - x0, y1 - y0)).sort((a, b) => a - b);
  const size = sides[Math.floor(sides.length / 2)] ?? 1;
  return {
    slot: Math.max(SLOT_PAD, SLOT_PAD_SHARE * size),
    gap: Math.max(TRAY_GAP, TRAY_GAP_SHARE * size),
    pad: Math.max(TRAY_PAD, TRAY_PAD_SHARE * size),
  };
}

/** A way to lay the shelf: each kind's centroid and slot, and the whole
 * shelf's box, padded — in tray units. */
type Shelf = { at: XY[]; slots: Box[]; box: Box };

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
  /** Where each tray kind sits, centroid in tray units, and its slot: the box
   * every way it can be held reaches, padded, in the same units. */
  trayAt: XY[] = [];
  private slots: Box[] = [];
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
  /** The tray as drawn: the strip, or on a desktop the card inside it. */
  private card: Box = [0, 0, 0, 0];
  private shelfRoom: Box = [0, 0, 0, 0];
  /** `LABEL_ROOM` and the card's gap, as the stylesheet sets them. */
  private labelRoom = LABEL_ROOM;
  private cardGap = 0;
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
  /** The hint on show, if any: a tile to lay — drawn where it lands, its tray
   * tile and the control that turns or flips it as it must be held marked —
   * or a placed tile to take off, outlined in the remove colour. */
  hint: Hint = null;
  /** The shelf's tiles and the controls, each padded, in their own units. */
  private shelfBox: Box = [0, 0, 0, 0];
  private knobBox: Box = [0, 0, 0, 0];
  /** The region's bounding box, in board units. */
  private regionBox: Box = [0, 0, 0, 0];
  /** Where each control sits. */
  private controlsAt = new Map<Control, XY>();
  /** Per tray kind, the box about its centroid that it reaches held any way
   * the level holds it — every turn of the rotate step, either side if it
   * flips — so a slot is the same size whichever way the tray is turned. */
  private reach: Box[];
  private space: Spacing;
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
    // as far as the drawn tile reaches, round edges and all, every way held
    const { turn, ring: tileRing } = puzzle.level;
    const rots: number[] = [];
    for (let rot = 0; rot < tileRing.n; rot += turn > 0 ? turn : tileRing.n) rots.push(rot);
    const flips = puzzle.canFlip() ? [false, true] : [false];
    this.reach = puzzle.level.tiles.map((_, kind) => {
      const xy = rots.flatMap((rot) =>
        flips.flatMap((f) => loopsReach(this.outline(kind, rot, f))),
      );
      return [
        Math.min(...xy.map((p) => p[0])),
        Math.min(...xy.map((p) => p[1])),
        Math.max(...xy.map((p) => p[0])),
        Math.max(...xy.map((p) => p[1])),
      ];
    });
    this.space = spacingOf(this.reach);
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

  private controls(): Control[] {
    const out: Control[] = [];
    if (this.puzzle.canTurn()) out.push("rotate-ccw", "rotate-cw");
    if (this.puzzle.canFlip()) out.push("flip");
    out.push("remove");
    return out;
  }

  /** Lay the tray out and fit everything to the element. The shelf is the
   * tiles in rows across the strip — columns in landscape — each in a slot
   * just big enough to hold it any way the level holds it: one row, or two or
   * three where that leaves the board bigger. The controls are in a row of
   * their own under the shelf, or a column beside it. */
  layout(): void {
    const { width, height } = this.svg.getBoundingClientRect();
    this.landscape = width > height;
    const style = getComputedStyle(this.svg);
    const px = (name: string, fallback: number): number => {
      const value = parseFloat(style.getPropertyValue(name));
      return Number.isFinite(value) ? value : fallback;
    };
    this.labelRoom = px("--label-room", LABEL_ROOM);
    this.cardGap = px("--tray-card-gap", 0);
    const controls = this.controls();
    // One row of controls under the shelf in portrait; one column beside it
    // in landscape.
    const knobH = 2 * KNOB;
    const cols = this.landscape ? 1 : controls.length;
    const rows = Math.ceil(controls.length / cols);
    const gridW = cols * 2 * KNOB + (cols - 1) * KNOB_GAP;
    const gridH = rows * knobH + (rows - 1) * KNOB_GAP;
    this.controlsAt.clear();
    controls.forEach((control, i) => {
      const col = i % cols;
      const row = Math.floor(i / cols);
      const kx = -gridW / 2 + KNOB + col * (2 * KNOB + KNOB_GAP);
      this.controlsAt.set(control, [kx, gridH / 2 - KNOB - row * (knobH + KNOB_GAP)]);
    });
    this.knobBox = [
      -gridW / 2 - KNOB_PAD,
      -gridH / 2 - KNOB_PAD,
      gridW / 2 + KNOB_PAD,
      gridH / 2 + KNOB_PAD,
    ];
    // Every way to lay the shelf in one to three rows; the one that lets the
    // board be biggest, fewer rows unless more are clearly better.
    let best: Shelf | null = null;
    let bestFit = 0;
    for (let n = 1; n <= Math.min(MAX_ROWS, this.reach.length); n++) {
      const shelf = this.shelfIn(n);
      const fit = width > 0 && height > 0 ? this.fit(width, height, shelf.box) : 0;
      if (best === null || fit > bestFit * MORE_ROWS) {
        best = shelf;
        bestFit = fit;
      }
    }
    this.trayAt = best!.at;
    this.slots = best!.slots;
    this.shelfBox = best!.box;
    this.place();
    this.draw();
  }

  /** The shelf in `n` rows (columns, in landscape): the tiles in their order,
   * cut where that makes the longest row shortest, each row centred along
   * the strip and each slot across its row. */
  private shelfIn(n: number): Shelf {
    const land = this.landscape;
    const { slot: SLOT, gap: GAP, pad: PAD } = this.space;
    // A slot's size along the strip and across it.
    const sizes = this.reach.map(([x0, y0, x1, y1]): XY => {
      const w = x1 - x0 + 2 * SLOT;
      const h = y1 - y0 + 2 * SLOT;
      return land ? [h, w] : [w, h];
    });
    const runLength = (from: number, to: number): number =>
      sizes.slice(from, to).reduce((sum, [a]) => sum + a, 0) + (to - from - 1) * GAP;
    // The cut points: tried every way, kinds are few.
    let cuts: number[] = [];
    let longest = Infinity;
    const tryCuts = (at: number[], from: number, left: number): void => {
      if (left === 1) {
        const ends = [...at, sizes.length];
        let start = 0;
        let worst = 0;
        for (const end of ends) {
          worst = Math.max(worst, runLength(start, end));
          start = end;
        }
        if (worst < longest - 1e-9) {
          longest = worst;
          cuts = at;
        }
        return;
      }
      for (let c = from + 1; c <= sizes.length - left + 1; c++) tryCuts([...at, c], c, left - 1);
    };
    tryCuts([], 0, n);
    const ends = [...cuts, sizes.length];
    const rows: [number, number][] = [];
    let start = 0;
    for (const end of ends) {
      rows.push([start, end]);
      start = end;
    }
    const thick = rows.map(([a, b]) => Math.max(...sizes.slice(a, b).map(([, c]) => c)));
    const total = thick.reduce((sum, t) => sum + t, 0) + (rows.length - 1) * GAP;
    const at: XY[] = [];
    const slots: Box[] = [];
    // Across: the first row at the top (portrait) or the left (landscape).
    let across = total / 2;
    rows.forEach(([a, b], r) => {
      const middle = across - thick[r]! / 2;
      across -= thick[r]! + GAP;
      let along = -runLength(a, b) / 2;
      for (let kind = a; kind < b; kind++) {
        // every plate as thick as its row, so a row's plates line up
        const [len] = sizes[kind]!;
        const wide = thick[r]!;
        const mid = along + len / 2;
        along += len + GAP;
        // The slot's middle, then the tile's centroid in it.
        const [sx, sy]: XY = land ? [-middle, -mid] : [mid, middle];
        const [hw, hh] = land ? [wide / 2, len / 2] : [len / 2, wide / 2];
        const [x0, y0, x1, y1] = this.reach[kind]!;
        at[kind] = [sx - (x0 + x1) / 2, sy - (y0 + y1) / 2];
        slots[kind] = [sx - hw, sy - hh, sx + hw, sy + hh];
      }
    });
    const half = longest / 2;
    const box: Box = land
      ? [-total / 2 - PAD, -half - PAD, total / 2 + PAD, half + PAD]
      : [-half - PAD, -total / 2 - PAD, half + PAD, total / 2 + PAD];
    return { at, slots, box };
  }

  /** The sizes a fit is made of, for a shelf of `shelfBox`: across the strip
   * and along it, the screen, the board and the shelf; the most the shelf
   * may scale to; and the controls' block's thickness across the strip. */
  private measures(width: number, height: number, shelfBox: Box) {
    const [x0, y0, x1, y1] = this.regionBox;
    const [s0, t0, s1, t1] = shelfBox;
    const [k0, l0, k1, l1] = this.knobBox;
    const land = this.landscape;
    const across = land ? width : height;
    const length = land ? height : width;
    const shelfAcross = land ? s1 - s0 : t1 - t0;
    const knobScale = Math.min(KNOB_PX / (2 * KNOB), (0.13 * Math.min(width, height)) / (2 * KNOB));
    return {
      land,
      across,
      length,
      boardAcross: (land ? x1 - x0 : y1 - y0) + 2 * MARGIN,
      boardAlong: (land ? y1 - y0 : x1 - x0) + 2 * MARGIN,
      shelfAcross,
      shelfAlong: land ? t1 - t0 : s1 - s0,
      cap: (TRAY_SHARE * across) / shelfAcross,
      knobScale,
      knobsW: knobScale * (k1 - k0),
      knobsH: knobScale * (l1 - l0),
    };
  }

  /** The world's scale at zoom 1: the largest that leaves the board, and the
   * strip with every tray tile on it, on screen. The strip grows with the
   * scale, so search for it — a long shelf shrinks the board rather than
   * scroll. The label's room comes off the screen's height: across the strip
   * in portrait, along it in landscape. */
  private fit(width: number, height: number, shelfBox: Box): number {
    const m = this.measures(width, height, shelfBox);
    const gap = this.cardGap;
    const knobs = (m.land ? m.knobsW : m.knobsH) + 2 * gap;
    const roomAlong = m.land ? m.length - this.labelRoom : m.length;
    const roomAcross = m.land ? m.across : m.across - this.labelRoom;
    const inset = Math.max(SHELF_INSET, gap);
    let lo = 0;
    let hi = Math.min(roomAlong / m.boardAlong, roomAcross / m.boardAcross);
    for (let i = 0; i < 40; i++) {
      const mid = (lo + hi) / 2;
      const shelf = Math.min(mid, m.cap);
      if (
        mid * m.boardAcross + shelf * m.shelfAcross + knobs <= roomAcross &&
        shelf * m.shelfAlong <= m.length - 2 * inset
      )
        lo = mid;
      else hi = mid;
    }
    return lo;
  }

  /** The scales, the board's room, the tray strip, and on it the shelf's
   * room, the scroll bar and the controls, for the zoom as it is. The shelf is
   * at the world's scale, up to `TRAY_SHARE` of the screen; the controls at a
   * fixed size; and the world fitted, at zoom 1, to what the strip leaves.
   * Zoomed in, a shelf longer than the strip scrolls, and only then is there
   * a scroll bar to make room for. */
  private frame(width: number, height: number): void {
    const [s0, t0, s1, t1] = this.shelfBox;
    const m = this.measures(width, height, this.shelfBox);
    const { land, length, knobsW, knobsH } = m;
    this.knobScale = m.knobScale;
    this.scale = this.fit(width, height, this.shelfBox) * this.zoom;
    this.shelfScale = Math.min(this.scale, m.cap);
    const ss = this.shelfScale;
    const thick = ss * m.shelfAcross;
    // on a desktop, the card's gap all round, inside the strip
    const g = this.cardGap;
    const shelfRoomLen = length - 2 * g;
    this.shelfLength = ss * m.shelfAlong;
    // a hair over is no overflow: the fit lands within float error of it
    this.overflow = this.shelfLength - shelfRoomLen > 0.5 ? this.shelfLength - shelfRoomLen : 0;
    this.scrolled = Math.min(this.overflow, Math.max(0, this.scrolled));
    const barRoom = this.overflow > 0 ? BAR_ROOM : 0;
    const strip = thick + barRoom + (land ? knobsW : knobsH) + 2 * g;
    // Where the shelf starts along the strip: centred in its room while it
    // fits, scrolled once it does not.
    const start = g + (this.overflow > 0 ? -this.scrolled : (shelfRoomLen - this.shelfLength) / 2);
    // The card's ends along the strip: about its tiles and its controls, both
    // centred, or the whole strip less the gap while the shelf scrolls. With
    // no gap, the strip runs end to end.
    const content = Math.max(
      this.overflow > 0 ? shelfRoomLen : this.shelfLength,
      land ? knobsH : knobsW,
    );
    const c0 = g > 0 ? Math.max(g, (length - content) / 2) : 0;
    const c1 = g > 0 ? Math.min(length - g, (length + content) / 2) : length;
    if (land) {
      const sx0 = width - strip;
      this.view = [0, this.labelRoom, sx0, height];
      this.strip = [sx0, 0, width, height];
      this.card = [sx0 + g, c0, width - g, c1];
      // The shelf, the bar down its right-hand side, the controls' column
      // beside that.
      const shelfX0 = sx0 + g;
      const shelfX1 = shelfX0 + thick;
      this.shelfRoom = [shelfX0, c0, shelfX1, c1];
      this.shelfAt = [(shelfX0 + shelfX1) / 2 - ss * ((s0 + s1) / 2), start + ss * t1];
      const bx = shelfX1 + (BAR_ROOM - BAR) / 2;
      this.track = [bx, BAR_INSET + g, bx + BAR, height - BAR_INSET - g];
      this.knobsAt = [shelfX1 + barRoom + knobsW / 2, height / 2];
    } else {
      const sy0 = height - strip;
      this.view = [0, this.labelRoom, width, sy0];
      this.strip = [0, sy0, width, height];
      this.card = [c0, sy0 + g, c1, height - g];
      // The shelf, the bar under it, the controls' row under that.
      const shelfY0 = sy0 + g;
      this.shelfRoom = [c0, shelfY0, c1, shelfY0 + thick];
      this.shelfAt = [start - ss * s0, shelfY0 + thick / 2 + ss * ((t0 + t1) / 2)];
      const by = shelfY0 + thick + (BAR_ROOM - BAR) / 2;
      this.track = [BAR_INSET + g, by, width - BAR_INSET - g, by + BAR];
      this.knobsAt = [width / 2, shelfY0 + thick + barRoom + knobsH / 2];
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
    const [z0, w0, z1, w1] = this.card;
    const rx = this.cardGap > 0 ? CARD_RADIUS : 0;
    for (const [k, v] of Object.entries({ x: z0, y: w0, width: z1 - z0, height: w1 - w0, rx }))
      this.zone.setAttribute(k, String(v));
    // The level's name, on the page behind the board, is centred over the
    // board's room, not under a strip down the right.
    this.svg.parentElement?.parentElement?.style.setProperty(
      "--tray-side",
      `${this.landscape ? width - this.strip[0] : 0}px`,
    );
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
      const colour = this.puzzle.level.colours[tile.kind]!;
      // a tile and its marks as one group, so its border over them follows
      // the tile's own hover (remove mode)
      const placed = el("g", { class: "placed" }, this.still);
      el("path", { d: loopsPath(loops), class: `tile ${colour}`, "data-tile": tile.id }, placed);
      decor(loops, placed, undefined, markUnit(this.puzzle.level), colour);
    }
    for (const e of this.puzzle.openEdges) {
      el("path", { d: edgePath(e.axy, e.bxy, e.bulge), class: "open" }, this.still);
    }
    // the hint over everything on the board, so it shows whole: a tile to
    // take off ringed, or a tile to lay outlined where it lands
    const hint = this.hint;
    const off =
      hint && "remove" in hint ? this.puzzle.tiles.find((t) => t.id === hint.remove) : null;
    if (off)
      el(
        "path",
        { d: loopsPath(loopsOf(ring, off.pieces)), class: "hint-off", "data-hint": "remove" },
        this.still,
      );
    const lay = hint && "place" in hint ? hint.place : null;
    const needs = lay ? this.holdFor(lay.kind, lay.spot) : null;
    if (lay)
      el(
        "path",
        { d: loopsPath(loopsOf(ring, lay.spot)), class: "hint-ghost", "data-hint": "place" },
        this.still,
      );
    this.shelf.replaceChildren();
    this.knobs.replaceChildren();
    this.trayAt.forEach(([cx, cy], kind) => {
      // The slot: what a press picks the tile up by, drawn as a plate under
      // it, its corners rounded by a share of its padding.
      const [x0, y0, x1, y1] = this.slots[kind]!;
      el(
        "rect",
        {
          x: x0,
          y: y0,
          width: x1 - x0,
          height: y1 - y0,
          rx: 2 * this.space.slot,
          class: `tray${lay?.kind === kind ? " hinted" : ""}`,
          "data-tray": kind,
        },
        this.shelf,
      );
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
      decor(outline, this.shelf, at, markUnit(this.puzzle.level), this.puzzle.level.colours[kind]!);
    });
    // The piles' counts, over every tile, so a neighbour never hides one: how
    // many more the board was cut with. Past zero it shows how many extra are
    // down — allowed, but it costs a star. Each at the tile's lower right as
    // it is held, kept on its slot (and a hair past it, into the gap), so the
    // shelf's edge never clips it.
    const pr = Math.max(PILE, PILE_PX / this.shelfScale);
    this.trayAt.forEach(([cx, cy], kind) => {
      const left = this.puzzle.level.need[kind]! - this.puzzle.used(kind);
      const xy = loopsReach(this.outline(kind, this.turn, this.flip));
      const [, sy0, sx1] = this.slots[kind]!;
      const edge = Math.min(this.space.pad, this.space.gap / 2);
      const bx = Math.min(cx + Math.max(...xy.map((p) => p[0])), sx1 + edge - pr);
      const by = Math.max(cy + Math.min(...xy.map((p) => p[1])), sy0 - edge + pr);
      const badge = el(
        "g",
        { class: `pile${left < 0 ? " over" : left === 0 ? " done" : ""}`, "data-tray": kind },
        this.shelf,
      );
      el("circle", { cx: bx, cy: by, r: pr }, badge);
      // a little over the badge's radius, grown with it
      centredText(badge, [bx, by], (PILE_FONT * pr) / PILE, left < 0 ? `+${-left}` : String(left));
    });
    for (const [control, [kx, ky]] of this.controlsAt) {
      const hinted = needs !== null && needs.control === control;
      const knob = el("g", { class: `knob knob-${control}${hinted ? " hinted" : ""}` }, this.knobs);
      el("circle", { cx: kx, cy: ky, r: KNOB, class: "knob-face" }, knob);
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
        const { arc, head } = turnGlyph(kx, ky, dir);
        el("polyline", { points: arc, class: "knob-arc" }, knob);
        el("polygon", { points: head, class: "knob-head" }, knob);
        // The number centred on the button, its ° hanging off to the right: a
        // hidden ° before it balances the one after.
        const number = degrees.slice(0, -1);
        const font = number.length > 2 ? DEGREES_FONT_LONG : DEGREES_FONT;
        const text = centredText(knob, [kx, ky], font, "", "knob-degrees");
        el("tspan", { "fill-opacity": 0 }, text).textContent = "°";
        text.append(number);
        el("tspan", {}, text).textContent = "°";
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
      }
    }
  }

  /** What a hinted tile needs before it lands on `spot`, held as the tray
   * holds it now: a flip, or turning one way (the way of fewer presses), or
   * nothing. */
  private holdFor(kind: number, spot: readonly Piece[]): { control: Control } | null {
    const { ring, tiles, turn, mirror } = this.puzzle.level;
    const n = ring.n;
    const mod = (k: number): number => ((k % n) + n) % n;
    let best: { flip: boolean; presses: number; control: Control | null } | null = null;
    for (const flip of mirror ? [this.flip, !this.flip] : [this.flip]) {
      const shape = { ring, pieces: posed(tiles[kind]!, { rot: 0, flip, t: ring.zero }) };
      for (const k of turnsOntoPieces(shape, spot)) {
        const d = mod(k - this.turn);
        let presses = 0;
        let control: Control | null = null;
        if (d !== 0) {
          if (turn === 0 || d % turn !== 0) continue; // not a way the tray holds it
          const ccw = d / turn;
          const cw = (n - d) / turn;
          presses = Math.min(ccw, cw);
          control = ccw <= cw ? "rotate-ccw" : "rotate-cw";
        }
        // a flip is a press too, and comes first
        if (flip !== this.flip) control = "flip";
        const cost = presses + (flip !== this.flip ? 1 : 0);
        if (!best || cost < best.presses) best = { flip, presses: cost, control };
      }
    }
    return best?.control ? { control: best.control } : null;
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
    decor(
      outline,
      this.moving,
      to,
      markUnit(this.puzzle.level),
      `${this.puzzle.level.colours[kind]} floating${discard ? " discard" : ""}`,
    );
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
