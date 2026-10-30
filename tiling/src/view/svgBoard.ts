// The board as SVG: the region, the placed tiles, the open edges, the tray with
// its rotate control, and while a tile is dragged, the floating tile and a dot
// on each of its corners that would meet the edge. Everything is drawn in board units (y up);
// one transform on the root group flips it to SVG's y-down, so the pointer maps
// back with one getScreenCTM().inverse(), and a turn counter-clockwise in board
// units reads counter-clockwise on screen.

import type { XY } from "../geometry/shape";
import { centroid } from "../geometry/shape";
import type { Puzzle } from "../puzzle";

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

/** The gap round the board, and between the board and the tray, in tile edges. */
const MARGIN = 0.6;
/** A rotate control's radius, its gap from the tray, and the room its angle
 * label takes underneath it. */
const KNOB = 0.4;
const KNOB_GAP = 0.15;
const LABEL = 0.3;
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
  // The axis sits low, so the wedge above it fills the button.
  const cx = kx;
  const cy = ky - KNOB * 0.4;
  const ray = KNOB * 0.98;
  const r = KNOB * 0.68;
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

export class SvgBoard {
  readonly svg: SVGSVGElement;
  private root: SVGGElement;
  private still: SVGGElement;
  private moving: SVGGElement;
  /** Where each tray kind sits, centroid in board units. */
  trayAt: XY[] = [];
  /** Per tray kind, how it is turned: its shape rotated by ζ^turn. */
  turns: number[];
  /** Per tray kind, where its rotate control sits. */
  private knobsAt: XY[] = [];
  /** Per tray kind, its farthest corner from its centroid — the same at any turn. */
  private radius: number[];
  /** The placed tile picked by a tap, drawn highlighted; what Delete removes. */
  selected: number | null = null;

  constructor(
    host: HTMLElement,
    private puzzle: Puzzle,
  ) {
    this.svg = el("svg", { class: "board", role: "img", "aria-label": "Tiling board" });
    host.appendChild(this.svg);
    this.root = el("g", { transform: "scale(1,-1)" }, this.svg);
    this.still = el("g", {}, this.root);
    this.moving = el("g", {}, this.root);
    this.turns = [...puzzle.level.starts];
    this.radius = puzzle.level.tiles.map((_, kind) =>
      Math.max(...this.outline(kind, 0).map(([x, y]) => Math.hypot(x, y))),
    );
    this.layout();
  }

  private sides(kind: number): number {
    return this.puzzle.level.tiles[kind]!.verts.length;
  }

  /** A kind's outline turned by ζ^rot, about its own centroid. */
  outline(kind: number, rot: number): XY[] {
    const { ring } = this.puzzle.level;
    const xy = this.puzzle.shapeAt(kind, rot).verts.map((v) => ring.toXY(v));
    const [cx, cy] = centroid(xy);
    return xy.map(([x, y]): XY => [x - cx, y - cy]);
  }

  /** A kind's tray circle radius. */
  private trayRadius(kind: number): number {
    return this.radius[kind]! + 0.25;
  }

  /** Fit board and tray to the element. The tray is a row of circles under
   * the board in portrait, a column to the right of it in landscape; each
   * kind's rotate control sits to the right of its circle either way. */
  layout(): void {
    const { ring, region } = this.puzzle.level;
    const xy = region.flat().map((v) => ring.toXY(v));
    const x0 = Math.min(...xy.map((p) => p[0]));
    const x1 = Math.max(...xy.map((p) => p[0]));
    const y0 = Math.min(...xy.map((p) => p[1]));
    const y1 = Math.max(...xy.map((p) => p[1]));
    const { width, height } = this.svg.getBoundingClientRect();
    const landscape = width > height;
    const kinds = this.radius.map((_, kind) => kind);
    const widest = Math.max(...kinds.map((k) => this.trayRadius(k)));
    // Each kind's slot along the tray: its circle, then its control if any.
    const knobRoom = (kind: number): number => (!landscape && this.puzzle.canTurn(kind) ? KNOB_GAP + 2 * KNOB : 0);
    const slot = (kind: number): number => 2 * this.trayRadius(kind) + knobRoom(kind);
    const total = kinds.reduce((sum, k) => sum + slot(k), 0) + TRAY_GAP * (kinds.length - 1);
    let along = landscape ? (y0 + y1) / 2 + total / 2 : (x0 + x1) / 2 - total / 2;
    this.trayAt = [];
    this.knobsAt = [];
    for (const kind of kinds) {
      const r = this.trayRadius(kind);
      const off = r + KNOB_GAP + KNOB;
      if (landscape) {
        const c: XY = [x1 + MARGIN + widest, along - r];
        this.trayAt.push(c);
        this.knobsAt.push([c[0] + off, c[1]]);
        along -= slot(kind) + TRAY_GAP;
      } else {
        const c: XY = [along + r, y0 - MARGIN - widest];
        this.trayAt.push(c);
        this.knobsAt.push([c[0] + off, c[1]]);
        along += slot(kind) + TRAY_GAP;
      }
    }
    // Everything drawn, as boxes: the region, each tray circle, each control.
    const boxes: [number, number, number, number][] = [[x0, y0, x1, y1]];
    this.trayAt.forEach(([cx, cy], kind) => {
      const r = this.trayRadius(kind);
      boxes.push([cx - r, cy - r, cx + r, cy + r]);
      if (!this.puzzle.canTurn(kind)) return;
      const [kx, ky] = this.knobsAt[kind]!;
      boxes.push([kx - KNOB, ky - KNOB - LABEL, kx + KNOB, ky + KNOB]);
    });
    const bx0 = Math.min(...boxes.map((b) => b[0])) - MARGIN;
    const by0 = Math.min(...boxes.map((b) => b[1])) - MARGIN;
    const bx1 = Math.max(...boxes.map((b) => b[2])) + MARGIN;
    const by1 = Math.max(...boxes.map((b) => b[3])) + MARGIN;
    // viewBox in SVG (y-down) coordinates: the top is at -by1.
    this.svg.setAttribute("viewBox", `${bx0} ${-by1} ${bx1 - bx0} ${by1 - by0}`);
    this.draw();
  }

  /** Redraw the settled picture: region, tiles, open edges, tray. */
  draw(): void {
    const { ring, region } = this.puzzle.level;
    this.still.replaceChildren();
    const d = region
      .map((loop) => "M" + loop.map((v) => ring.toXY(v).join(",")).join("L") + "Z")
      .join("");
    el("path", { d, class: "region", "fill-rule": "evenodd" }, this.still);
    for (const tile of this.puzzle.tiles) {
      el(
        "polygon",
        {
          points: points(tile.verts.map((v) => ring.toXY(v))),
          class: `tile sides-${tile.verts.length}${tile.id === this.selected ? " selected" : ""}`,
          "data-tile": tile.id,
        },
        this.still,
      );
    }
    for (const e of this.puzzle.openEdges) {
      el("line", { x1: e.axy[0], y1: e.axy[1], x2: e.bxy[0], y2: e.bxy[1], class: "open" }, this.still);
    }
    // The selected tile on top, so the open edges do not hide its outline.
    const selected = this.still.querySelector(".selected");
    if (selected) this.still.appendChild(selected);
    this.trayAt.forEach(([cx, cy], kind) => {
      el("circle", { cx, cy, r: this.trayRadius(kind), class: "tray", "data-tray": kind }, this.still);
      el(
        "polygon",
        {
          points: points(this.outline(kind, this.turns[kind]!).map(([x, y]): XY => [x + cx, y + cy])),
          class: `tile sides-${this.sides(kind)} in-tray`,
          "data-tray": kind,
        },
        this.still,
      );
      if (!this.puzzle.canTurn(kind)) return;
      const { ring } = this.puzzle.level;
      const turn = this.puzzle.level.turns[kind]!;
      const step = (2 * Math.PI * turn) / ring.n;
      const degrees = `${Math.round((360 * turn) / ring.n)}°`;
      // One control, clockwise: the turns are few, so pressing it again is
      // quicker than choosing a direction.
      const [kx, ky] = this.knobsAt[kind]!;
      const knob = el("g", { class: "knob", "data-turn": -1, "data-kind": kind }, this.still);
      el("title", {}, knob).textContent = `Turn ${degrees} (R)`;
      el("circle", { cx: kx, cy: ky, r: KNOB }, knob);
      const { axis, rays, arc, head } = stepGlyph(kx, ky, -1, step);
      el("polyline", { points: rays, class: "knob-ray" }, knob);
      el("polyline", { points: arc, class: "knob-arc" }, knob);
      el("polygon", { points: head, class: "knob-head" }, knob);
      el("circle", { cx: axis[0], cy: axis[1], r: KNOB * 0.1, class: "knob-axis" }, knob);
      // Text has to be flipped back upright against the root's y flip.
      const label = el("text", { x: kx, y: -(ky - KNOB - LABEL * 0.75), transform: "scale(1,-1)", class: "knob-label" }, knob);
      label.textContent = `↻ ${degrees}`;
    });
  }

  /** The dragged tile — `outline` about its centroid, moved to `at` — and,
   * when it would snap, a dot on each of its corners that would meet the edge. */
  drawDrag(kind: number, outline: XY[], at: XY, stick: XY[]): void {
    this.moving.replaceChildren();
    const moved = outline.map(([x, y]): XY => [x + at[0], y + at[1]]);
    el("polygon", { points: points(moved), class: `tile sides-${this.sides(kind)} floating` }, this.moving);
    for (const [cx, cy] of stick) el("circle", { cx, cy, r: 0.11, class: "stick" }, this.moving);
  }

  clearDrag(): void {
    this.moving.replaceChildren();
  }

  /** A client (screen) point in board units. */
  toBoard(clientX: number, clientY: number): XY {
    const m = this.root.getScreenCTM();
    if (!m) return [0, 0];
    const p = new DOMPoint(clientX, clientY).matrixTransform(m.inverse());
    return [p.x, p.y];
  }
}
