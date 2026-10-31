// The board as SVG: the region, the placed tiles, the open edges, the tray with
// its controls (rotate every tile, remove mode), and while a tile is dragged, the floating tile and a dot
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
/** A control's radius, the gap between controls, and the room its label
 * takes underneath it. */
const KNOB = 0.4;
const KNOB_GAP = 0.15;
const LABEL = 0.3;
/** A pile's count badge radius. */
const PILE = 0.22;
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

/** The tray's controls, after its tiles: turn every tile, and remove mode. */
type Control = "rotate" | "flip" | "remove";

export class SvgBoard {
  readonly svg: SVGSVGElement;
  private root: SVGGElement;
  private still: SVGGElement;
  private moving: SVGGElement;
  /** Where each tray kind sits, centroid in board units. */
  trayAt: XY[] = [];
  /** How far every tray tile is turned from resting flat, as a power of ζ —
   * the one rotate control turns them all together. */
  turn = 0;
  /** Whether every tray tile is held mirrored — the flip control, on a level
   * whose board uses some kind both ways round. */
  flip = false;
  /** The tray's own box (tiles and controls), in board units: a placed tile
   * dropped back in it is taken off the board. */
  private trayBox: [number, number, number, number] = [0, 0, 0, 0];
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
    this.root = el("g", { transform: "scale(1,-1)" }, this.svg);
    this.still = el("g", {}, this.root);
    this.moving = el("g", {}, this.root);
    this.radius = puzzle.level.tiles.map((_, kind) =>
      Math.max(...this.outline(kind, 0).map(([x, y]) => Math.hypot(x, y))),
    );
    this.layout();
  }

  private sides(kind: number): number {
    return this.puzzle.level.tiles[kind]!.verts.length;
  }

  /** Whether a board point is over the tray. */
  overTray([x, y]: XY): boolean {
    const [x0, y0, x1, y1] = this.trayBox;
    return x >= x0 && x <= x1 && y >= y0 && y <= y1;
  }

  /** A kind's outline, mirrored if `flip`, turned by ζ^rot, about its own
   * centroid. */
  outline(kind: number, rot: number, flip = false): XY[] {
    const { ring } = this.puzzle.level;
    const xy = this.puzzle.shapeAt(kind, rot, flip).verts.map((v) => ring.toXY(v));
    const [cx, cy] = centroid(xy);
    return xy.map(([x, y]): XY => [x - cx, y - cy]);
  }

  /** A kind's tray circle radius. */
  private trayRadius(kind: number): number {
    return this.radius[kind]! + 0.25;
  }

  private controls(): Control[] {
    const out: Control[] = [];
    if (this.puzzle.canTurn()) out.push("rotate");
    if (this.puzzle.canFlip()) out.push("flip");
    out.push("remove");
    return out;
  }

  /** Fit board and tray to the element. The tray is a row of circles under
   * the board in portrait, its controls stacked at the row's end; a column to
   * the right of it in landscape, the controls side by side at its foot. */
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
    const controls = this.controls();
    // A control's own box: the knob and its label underneath.
    const knobH = 2 * KNOB + LABEL;
    // Along the tray: each circle, then the controls as one more slot.
    const controlSlot = landscape ? knobH : 2 * KNOB;
    const total =
      kinds.reduce((sum, k) => sum + 2 * this.trayRadius(k), 0) + controlSlot + TRAY_GAP * kinds.length;
    let along = landscape ? (y0 + y1) / 2 + total / 2 : (x0 + x1) / 2 - total / 2;
    this.trayAt = [];
    for (const kind of kinds) {
      const r = this.trayRadius(kind);
      if (landscape) {
        this.trayAt.push([x1 + MARGIN + widest, along - r]);
        along -= 2 * r + TRAY_GAP;
      } else {
        this.trayAt.push([along + r, y0 - MARGIN - widest]);
        along += 2 * r + TRAY_GAP;
      }
    }
    this.controlsAt.clear();
    const span = controls.length * 2 * KNOB + (controls.length - 1) * KNOB_GAP;
    controls.forEach((control, i) => {
      if (landscape) {
        // side by side under the column, centred on it
        const cx = x1 + MARGIN + widest - span / 2 + KNOB + i * (2 * KNOB + KNOB_GAP);
        this.controlsAt.set(control, [cx, along - KNOB]);
      } else {
        // stacked at the end of the row, centred on it
        const stack = controls.length * knobH + (controls.length - 1) * KNOB_GAP;
        const top = y0 - MARGIN - widest + stack / 2;
        this.controlsAt.set(control, [along + KNOB, top - KNOB - i * (knobH + KNOB_GAP)]);
      }
    });
    // Everything drawn, as boxes: the region, each tray circle, each control.
    const tray: [number, number, number, number][] = [];
    this.trayAt.forEach(([cx, cy], kind) => {
      const r = this.trayRadius(kind);
      tray.push([cx - r, cy - r, cx + r, cy + r]);
    });
    for (const [kx, ky] of this.controlsAt.values()) tray.push([kx - KNOB, ky - KNOB - LABEL, kx + KNOB, ky + KNOB]);
    const pad = MARGIN / 2;
    this.trayBox = [
      Math.min(...tray.map((b) => b[0])) - pad,
      Math.min(...tray.map((b) => b[1])) - pad,
      Math.max(...tray.map((b) => b[2])) + pad,
      Math.max(...tray.map((b) => b[3])) + pad,
    ];
    const boxes: [number, number, number, number][] = [[x0, y0, x1, y1], ...tray];
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
          class: `tile sides-${tile.verts.length}`,
          "data-tile": tile.id,
        },
        this.still,
      );
    }
    for (const e of this.puzzle.openEdges) {
      el("line", { x1: e.axy[0], y1: e.axy[1], x2: e.bxy[0], y2: e.bxy[1], class: "open" }, this.still);
    }
    const [tx0, ty0, tx1, ty1] = this.trayBox;
    el("rect", { x: tx0, y: ty0, width: tx1 - tx0, height: ty1 - ty0, rx: 0.3, class: "tray-zone" }, this.still);
    this.trayAt.forEach(([cx, cy], kind) => {
      const r = this.trayRadius(kind);
      el("circle", { cx, cy, r, class: "tray", "data-tray": kind }, this.still);
      el(
        "polygon",
        {
          points: points(this.outline(kind, this.turn, this.flip).map(([x, y]): XY => [x + cx, y + cy])),
          class: `tile sides-${this.sides(kind)} in-tray`,
          "data-tray": kind,
        },
        this.still,
      );
      // The pile's count: how many more the board was cut with. Past zero it
      // shows how many extra are down — allowed, but it costs a star.
      const left = this.puzzle.level.need[kind]! - this.puzzle.used(kind);
      const bx = cx + r * 0.72;
      const by = cy - r * 0.72;
      const badge = el("g", { class: `pile${left < 0 ? " over" : left === 0 ? " done" : ""}`, "data-tray": kind }, this.still);
      el("circle", { cx: bx, cy: by, r: PILE }, badge);
      const text = el("text", { x: bx, y: -by, transform: "scale(1,-1)" }, badge);
      text.textContent = left < 0 ? `+${-left}` : String(left);
    });
    for (const [control, [kx, ky]] of this.controlsAt) {
      const knob = el("g", { class: `knob knob-${control}` }, this.still);
      el("circle", { cx: kx, cy: ky, r: KNOB }, knob);
      let label: string;
      if (control === "rotate") {
        // One control, clockwise, for every tile at once: the turns are few,
        // so pressing it again is quicker than choosing a direction.
        const turn = this.puzzle.level.turn;
        const degrees = `${Math.round((360 * turn) / ring.n)}°`;
        knob.setAttribute("data-turn", "-1");
        el("title", {}, knob).textContent = `Turn every tile ${degrees} (R)`;
        const { axis, rays, arc, head } = stepGlyph(kx, ky, -1, (2 * Math.PI * turn) / ring.n);
        el("polyline", { points: rays, class: "knob-ray" }, knob);
        el("polyline", { points: arc, class: "knob-arc" }, knob);
        el("polygon", { points: head, class: "knob-head" }, knob);
        el("circle", { cx: axis[0], cy: axis[1], r: KNOB * 0.1, class: "knob-axis" }, knob);
        label = `↻ ${degrees}`;
      } else if (control === "flip") {
        // Mirror every tile in the tray, and the one in hand: a tile and its
        // mirror image either side of a dashed axis.
        knob.setAttribute("data-flip", "");
        el("title", {}, knob).textContent = "Flip every tile over (F)";
        const a = KNOB * 0.55;
        const h = KNOB * 0.5;
        el("polyline", { points: points([[kx, ky - KNOB * 0.62], [kx, ky + KNOB * 0.62]]), class: "knob-mirror" }, knob);
        el("polygon", { points: points([[kx - 0.08 * KNOB, ky - h], [kx - 0.08 * KNOB, ky + h], [kx - a, ky - h]]), class: "knob-half" }, knob);
        el("polygon", { points: points([[kx + 0.08 * KNOB, ky - h], [kx + 0.08 * KNOB, ky + h], [kx + a, ky - h]]), class: "knob-half hollow" }, knob);
        label = "⇋ flip";
      } else {
        knob.setAttribute("data-remove", "");
        el("title", {}, knob).textContent = "Remove tiles: turn on, then tap tiles on the board (X)";
        const a = KNOB * 0.38;
        el("polyline", { points: points([[kx - a, ky - a], [kx + a, ky + a]]), class: "knob-x" }, knob);
        el("polyline", { points: points([[kx - a, ky + a], [kx + a, ky - a]]), class: "knob-x" }, knob);
        label = "remove";
      }
      // Text has to be flipped back upright against the root's y flip.
      const text = el("text", { x: kx, y: -(ky - KNOB - LABEL * 0.75), transform: "scale(1,-1)", class: "knob-label" }, knob);
      text.textContent = label;
    }
  }

  /** The dragged tile — `outline` about its centroid, moved to `at` — and,
   * when it would snap, a ✓ where it would land (`fitsAt`, that spot's
   * centroid) and a dot on each of its corners that would meet the edge.
   * `discard`: it is over the tray, and letting go takes it off the board. */
  drawDrag(kind: number, outline: XY[], at: XY, fitsAt: XY | null, stick: XY[], discard = false): void {
    this.moving.replaceChildren();
    this.svg.classList.toggle("discarding", discard);
    const moved = outline.map(([x, y]): XY => [x + at[0], y + at[1]]);
    el("polygon", { points: points(moved), class: `tile sides-${this.sides(kind)} floating${discard ? " discard" : ""}` }, this.moving);
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
    const m = this.root.getScreenCTM();
    if (!m) return [0, 0];
    const p = new DOMPoint(clientX, clientY).matrixTransform(m.inverse());
    return [p.x, p.y];
  }
}
