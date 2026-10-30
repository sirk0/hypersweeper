// The board as SVG: the region, the placed tiles, the open edges, the tray, and
// while a tile is dragged, the floating tile and the ghost of where it would
// snap. Everything is drawn in board units (y up); one transform on the root
// group flips it to SVG's y-down, so the pointer maps back with one
// getScreenCTM().inverse().

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

export class SvgBoard {
  readonly svg: SVGSVGElement;
  private root: SVGGElement;
  private still: SVGGElement;
  private moving: SVGGElement;
  /** Where each tray kind sits, centroid in board units. */
  trayAt: XY[] = [];
  private tileXY: XY[][] = [];
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
    const { ring } = puzzle.level;
    // Each tray tile's outline about its own centroid.
    this.tileXY = puzzle.level.tiles.map((shape) => {
      const xy = shape.verts.map((v) => ring.toXY(v));
      const [cx, cy] = centroid(xy);
      return xy.map(([x, y]): XY => [x - cx, y - cy]);
    });
    this.layout();
  }

  /** Fit board and tray to the element: tray below in portrait, to the right
   * in landscape. */
  layout(): void {
    const { ring, region } = this.puzzle.level;
    const xy = region.flat().map((v) => ring.toXY(v));
    const x0 = Math.min(...xy.map((p) => p[0]));
    const x1 = Math.max(...xy.map((p) => p[0]));
    const y0 = Math.min(...xy.map((p) => p[1]));
    const y1 = Math.max(...xy.map((p) => p[1]));
    const tray = Math.max(...this.tileXY.flat().map(([x, y]) => Math.hypot(x, y))) * 2 + 2 * MARGIN;
    const { width, height } = this.svg.getBoundingClientRect();
    const landscape = width > height;
    const kinds = this.tileXY.length;
    this.trayAt = this.tileXY.map((_, i): XY => {
      const along = (i + 0.5) / kinds;
      return landscape
        ? [x1 + MARGIN + tray / 2, y1 - along * (y1 - y0)]
        : [x0 + along * (x1 - x0), y0 - MARGIN - tray / 2];
    });
    const w = x1 - x0 + 2 * MARGIN + (landscape ? tray + MARGIN : 0);
    const h = y1 - y0 + 2 * MARGIN + (landscape ? 0 : tray + MARGIN);
    // viewBox in SVG (y-down) coordinates: the board's top is at -y1.
    this.svg.setAttribute("viewBox", `${x0 - MARGIN} ${-y1 - MARGIN} ${w} ${h}`);
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
          class: `tile kind-${tile.kind}${tile.id === this.selected ? " selected" : ""}`,
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
    this.tileXY.forEach((outline, kind) => {
      const [cx, cy] = this.trayAt[kind]!;
      el("circle", { cx, cy, r: Math.max(...outline.map(([x, y]) => Math.hypot(x, y))) + 0.25, class: "tray", "data-tray": kind }, this.still);
      el(
        "polygon",
        {
          points: points(outline.map(([x, y]): XY => [x + cx, y + cy])),
          class: `tile kind-${kind} in-tray`,
          "data-tray": kind,
        },
        this.still,
      );
    });
  }

  /** A tray tile's outline about its own centroid. */
  outline(kind: number): XY[] {
    return this.tileXY[kind]!;
  }

  /** The dragged tile — `outline` about its centroid, moved to `at` — and,
   * when it would snap, a dot on each corner it would stick to. */
  drawDrag(kind: number, outline: XY[], at: XY, stick: XY[]): void {
    this.moving.replaceChildren();
    const moved = outline.map(([x, y]): XY => [x + at[0], y + at[1]]);
    el("polygon", { points: points(moved), class: `tile kind-${kind} floating` }, this.moving);
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
