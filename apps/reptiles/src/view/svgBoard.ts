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
// (landscape), in board units too, at the board's own scale for as long as the
// strip can take it — so zooming in grows the tray tiles with the board, which
// is what makes them easier to pick up. The floating tile is drawn over both,
// in world units. The pointer maps back to the world with one
// getScreenCTM().inverse(), and a turn counter-clockwise in board units reads
// counter-clockwise on screen.

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

/** The gap round the board, in tile edges, at zoom 1. */
const MARGIN = 0.3;
/** The tray strip's padding round its contents, in tile edges. */
const TRAY_PAD = 0.3;
/** How far in the board zooms, from fitted. */
export const MAX_ZOOM = 4;
/** The most of the screen's height (portrait) or width (landscape) the tray
 * strip grows to as the board zooms in. */
const TRAY_SHARE = 0.38;
/** The room left above the fitted board for the level's name, which is drawn
 * on the page behind it (`.board-name`), in pixels. */
const LABEL_ROOM = 22;
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
  /** The tray strip (screen pixels) and the tray on it (board units). */
  private zone: SVGRectElement;
  private tray: SVGGElement;
  /** Where each tray kind sits, centroid in tray units. */
  trayAt: XY[] = [];
  /** The camera: how far in from fitted, and the board point at the middle of
   * the room the tray leaves (null: the board's own middle). */
  private zoom = 1;
  private centre: XY | null = null;
  /** Pixels per board unit for the world and for the tray, the room the
   * board is framed in, the tray strip, and the two layers' offsets. */
  private scale = 1;
  private trayScale = 1;
  private view: Box = [0, 0, 0, 0];
  private strip: Box = [0, 0, 0, 0];
  private landscape = false;
  /** How far every tray tile is turned from resting flat, as a power of ζ —
   * the one rotate control turns them all together. */
  turn = 0;
  /** Whether every tray tile is held mirrored — the flip control, on a level
   * whose board uses some kind both ways round. */
  flip = false;
  /** The tray's contents (tiles and controls, padded), in tray units. */
  private trayBox: Box = [0, 0, 0, 0];
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
    this.tray = el("g", { class: "tray-layer" }, this.svg);
    this.moving = el("g", {}, this.svg);
    this.radius = puzzle.level.tiles.map((_, kind) =>
      Math.max(...this.outline(kind, 0).map(([x, y]) => Math.hypot(x, y))),
    );
    const { ring, region } = puzzle.level;
    const xy = region.flat().map((v) => ring.toXY(v));
    this.regionBox = [
      Math.min(...xy.map((p) => p[0])),
      Math.min(...xy.map((p) => p[1])),
      Math.max(...xy.map((p) => p[0])),
      Math.max(...xy.map((p) => p[1])),
    ];
    this.layout();
  }

  private sides(kind: number): number {
    return this.puzzle.level.tiles[kind]!.verts.length;
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
    const [sx, sy] = this.trayToScreen([px, py]);
    return this.screenToWorld([sx, sy]);
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
    if (this.puzzle.canTurn()) out.push("rotate-ccw", "rotate-cw");
    if (this.puzzle.canFlip()) out.push("flip");
    out.push("remove");
    return out;
  }

  /** Lay the tray out and fit everything to the element. The tray is a row
   * of circles in portrait, its controls two to a row at the row's end; a
   * column in landscape, the controls two to a row at its foot. */
  layout(): void {
    const { width, height } = this.svg.getBoundingClientRect();
    this.landscape = width > height;
    const kinds = this.radius.map((_, kind) => kind);
    const controls = this.controls();
    // A control's own box: the knob and its label underneath.
    const knobH = 2 * KNOB + LABEL;
    const cols = Math.min(2, controls.length);
    const rows = Math.ceil(controls.length / cols);
    const gridW = cols * 2 * KNOB + (cols - 1) * KNOB_GAP;
    const gridH = rows * knobH + (rows - 1) * KNOB_GAP;
    this.trayAt = [];
    this.controlsAt.clear();
    let along = 0;
    for (const kind of kinds) {
      const r = this.trayRadius(kind);
      if (this.landscape) {
        this.trayAt.push([0, along - r]);
        along -= 2 * r + TRAY_GAP;
      } else {
        this.trayAt.push([along + r, 0]);
        along += 2 * r + TRAY_GAP;
      }
    }
    controls.forEach((control, i) => {
      const col = i % cols;
      const row = Math.floor(i / cols);
      if (this.landscape) {
        // under the column, centred on it
        const kx = -gridW / 2 + KNOB + col * (2 * KNOB + KNOB_GAP);
        this.controlsAt.set(control, [kx, along - KNOB - row * (knobH + KNOB_GAP)]);
      } else {
        // at the end of the row, centred on it
        const kx = along + KNOB + col * (2 * KNOB + KNOB_GAP);
        this.controlsAt.set(control, [kx, gridH / 2 - KNOB - row * (knobH + KNOB_GAP)]);
      }
    });
    const boxes: Box[] = [];
    this.trayAt.forEach(([cx, cy], kind) => {
      const r = this.trayRadius(kind);
      boxes.push([cx - r, cy - r, cx + r, cy + r]);
    });
    for (const [kx, ky] of this.controlsAt.values())
      boxes.push([kx - KNOB, ky - KNOB - LABEL, kx + KNOB, ky + KNOB]);
    this.trayBox = [
      Math.min(...boxes.map((b) => b[0])) - TRAY_PAD,
      Math.min(...boxes.map((b) => b[1])) - TRAY_PAD,
      Math.max(...boxes.map((b) => b[2])) + TRAY_PAD,
      Math.max(...boxes.map((b) => b[3])) + TRAY_PAD,
    ];
    this.place();
    this.draw();
  }

  /** The scales, the board's room and the tray strip, for the zoom as it is:
   * the world fitted to what the tray leaves at zoom 1, the tray at the
   * world's scale as far as the strip allows. */
  private frame(width: number, height: number): void {
    const [x0, y0, x1, y1] = this.regionBox;
    const [t0, u0, t1, u1] = this.trayBox;
    const bw = x1 - x0 + 2 * MARGIN;
    const bh = y1 - y0 + 2 * MARGIN;
    const tw = t1 - t0;
    const th = u1 - u0;
    // The tray's scale with the board fitted (its own, if the board's will not
    // fit the strip), then the fit in what that strip leaves.
    if (this.landscape) {
      const s0 = Math.min((height - LABEL_ROOM) / bh, width / (bw + tw));
      const ts0 = Math.min(s0, height / th);
      const fit = Math.min((height - LABEL_ROOM) / bh, (width - ts0 * tw) / bw);
      this.scale = fit * this.zoom;
      this.trayScale = Math.min(this.scale, height / th, Math.max(ts0, (TRAY_SHARE * width) / tw));
      const strip = this.trayScale * tw;
      this.view = [0, LABEL_ROOM, width - strip, height];
      this.strip = [width - strip, 0, width, height];
    } else {
      const s0 = Math.min(width / bw, (height - LABEL_ROOM) / (bh + th));
      const ts0 = Math.min(s0, width / tw);
      const fit = Math.min(width / bw, (height - LABEL_ROOM - ts0 * th) / bh);
      this.scale = fit * this.zoom;
      this.trayScale = Math.min(this.scale, width / tw, Math.max(ts0, (TRAY_SHARE * height) / th));
      const strip = this.trayScale * th;
      this.view = [0, LABEL_ROOM, width, height - strip];
      this.strip = [0, height - strip, width, height];
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

  private trayToScreen([px, py]: XY): XY {
    const [t0, u0, t1, u1] = this.trayBox;
    const [z0, w0, z1, w1] = this.strip;
    const ts = this.trayScale;
    return [(z0 + z1) / 2 + ts * (px - (t0 + t1) / 2), (w0 + w1) / 2 - ts * (py - (u0 + u1) / 2)];
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
    const [t0, u0, t1, u1] = this.trayBox;
    const ts = this.trayScale;
    const ox = (z0 + z1) / 2 - ts * ((t0 + t1) / 2);
    const oy = (w0 + w1) / 2 + ts * ((u0 + u1) / 2);
    this.tray.setAttribute("transform", `matrix(${ts},0,0,${-ts},${ox},${oy})`);
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
      el(
        "line",
        { x1: e.axy[0], y1: e.axy[1], x2: e.bxy[0], y2: e.bxy[1], class: "open" },
        this.still,
      );
    }
    this.tray.replaceChildren();
    this.trayAt.forEach(([cx, cy], kind) => {
      const r = this.trayRadius(kind);
      el("circle", { cx, cy, r, class: "tray", "data-tray": kind }, this.tray);
      el(
        "polygon",
        {
          points: points(
            this.outline(kind, this.turn, this.flip).map(([x, y]): XY => [x + cx, y + cy]),
          ),
          class: `tile sides-${this.sides(kind)} in-tray`,
          "data-tray": kind,
        },
        this.tray,
      );
      // The pile's count: how many more the board was cut with. Past zero it
      // shows how many extra are down — allowed, but it costs a star.
      const left = this.puzzle.level.need[kind]! - this.puzzle.used(kind);
      const bx = cx + r * 0.72;
      const by = cy - r * 0.72;
      const badge = el(
        "g",
        { class: `pile${left < 0 ? " over" : left === 0 ? " done" : ""}`, "data-tray": kind },
        this.tray,
      );
      el("circle", { cx: bx, cy: by, r: PILE }, badge);
      const text = el("text", { x: bx, y: -by, transform: "scale(1,-1)" }, badge);
      text.textContent = left < 0 ? `+${-left}` : String(left);
    });
    for (const [control, [kx, ky]] of this.controlsAt) {
      const knob = el("g", { class: `knob knob-${control}` }, this.tray);
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
    outline: XY[],
    at: XY,
    fitsAt: XY | null,
    stick: XY[],
    discard = false,
  ): void {
    this.moving.replaceChildren();
    this.svg.classList.toggle("discarding", discard);
    const moved = outline.map(([x, y]): XY => [x + at[0], y + at[1]]);
    el(
      "polygon",
      {
        points: points(moved),
        class: `tile sides-${this.sides(kind)} floating${discard ? " discard" : ""}`,
      },
      this.moving,
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
