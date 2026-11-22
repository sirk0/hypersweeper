// A tiling's card picture in Tilings: its first board's outline with the
// tray's tiles drawn inside it, never crossing it.
//
// A rep-tile's one tile is the outline made small: drawn as the outline
// shrunk toward a point — the point where its two parts touch, on a kissing
// rep-tile (the fish, the kissing squares and triangles), so the tile's
// touching point is the outline's; else the middle of the outline's kernel,
// the points every corner of it is seen from, so the shrunk copy stays clear
// of the outline all round. Every other tiling's tiles sit side by side on
// one bottom line, at their true sizes (three to a row, the rows stacked),
// moved and shrunk until they fit inside the outline clear of it.
//
// All in floats, for drawing only: the picture is laid out in the outline's
// own units, y down (the board draws y up).

import type { Bulge, XY } from "../geometry/shape";
import { centroidOf, loopEdges, signedArea } from "../geometry/shape";
import type { Level } from "../levels";
import { alongEdge, jigsawPoints, loopsOf, loopsPath, type Loop } from "./curve";
import { decorParts, markUnit } from "./decor";
import { boardFit, outlineFrame } from "./icons";

const NS = "http://www.w3.org/2000/svg";

/** An affine map, as SVG's `matrix(a b c d e f)`: x' = a·x + c·y + e,
 * y' = b·x + d·y + f. */
export type Matrix = readonly [number, number, number, number, number, number];

const apply = ([a, b, c, d, e, f]: Matrix, [x, y]: XY): XY => [
  a * x + c * y + e,
  b * x + d * y + f,
];

/** The affine map that `f` is, read off three points. */
function matrixOf(f: (p: XY) => XY): Matrix {
  const [e, g] = f([0, 0]);
  const [x1, y1] = f([1, 0]);
  const [x2, y2] = f([0, 1]);
  return [x1 - e, y1 - g, x2 - e, y2 - g, e, g];
}

/** How a map scales lengths (a similarity's ratio). */
const ratioOf = ([a, b, c, d]: Matrix): number => Math.sqrt(Math.abs(a * d - b * c));

/** A closed loop's corners and, along each round edge, points on its arc —
 * or along each jigsaw edge, on its knob or socket. */
function flatten(xy: readonly XY[], curve?: readonly Bulge[], marks?: readonly number[]): XY[] {
  const out: XY[] = [];
  xy.forEach((a, i) => {
    out.push(a);
    const jig = jigsawPoints(a, xy[(i + 1) % xy.length]!, marks?.[i]);
    if (jig) {
      out.push(...jig.slice(0, -1));
      return;
    }
    const bulge = curve?.[i] ?? 0;
    if (!bulge) return;
    const b = xy[(i + 1) % xy.length]!;
    for (let k = 1; k < 8; k++) out.push(alongEdge(a, b, bulge, k / 8).at);
  });
  return out;
}

/** Whether `p` is inside `loops`, even-odd. */
function inside(loops: readonly XY[][], [px, py]: XY): boolean {
  let odd = false;
  for (const loop of loops)
    for (const [[ax, ay], [bx, by]] of loopEdges(loop))
      if (ay > py !== by > py && px < ax + ((py - ay) * (bx - ax)) / (by - ay)) odd = !odd;
  return odd;
}

const cross = (o: XY, a: XY, b: XY): number =>
  (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);

/** Whether segments ab and cd cross at a point inside both — each end
 * clearly off the other's line, by more than float noise: segments that
 * only meet at an end, or run along one another, do not cross. */
function properlyCross(a: XY, b: XY, c: XY, d: XY): boolean {
  const eps = 1e-9 * Math.hypot(b[0] - a[0], b[1] - a[1]) * Math.hypot(d[0] - c[0], d[1] - c[1]);
  const d1 = cross(c, d, a);
  const d2 = cross(c, d, b);
  const d3 = cross(a, b, c);
  const d4 = cross(a, b, d);
  const apart = (p: number, q: number): boolean => (p > eps && q < -eps) || (p < -eps && q > eps);
  return apart(d1, d2) && apart(d3, d4);
}

function pointToSegment([px, py]: XY, [ax, ay]: XY, [bx, by]: XY): number {
  const dx = bx - ax;
  const dy = by - ay;
  const len = dx * dx + dy * dy;
  const t = len === 0 ? 0 : Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / len));
  return Math.hypot(px - ax - t * dx, py - ay - t * dy);
}

function segmentGap(a: XY, b: XY, c: XY, d: XY): number {
  if (properlyCross(a, b, c, d)) return 0;
  return Math.min(
    pointToSegment(a, c, d),
    pointToSegment(b, c, d),
    pointToSegment(c, a, b),
    pointToSegment(d, a, b),
  );
}

interface Box {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

function boxOf(points: readonly XY[]): Box {
  const xs = points.map(([x]) => x);
  const ys = points.map(([, y]) => y);
  return { x0: Math.min(...xs), y0: Math.min(...ys), x1: Math.max(...xs), y1: Math.max(...ys) };
}

/** Whether every one of `polys` lies inside the region `loops`, no part of
 * it nearer the region's rim than `margin`. */
export function insideRegion(
  polys: readonly XY[][],
  loops: readonly XY[][],
  margin: number,
): boolean {
  const box = boxOf(polys.flat());
  const near = (a: XY, b: XY): boolean =>
    Math.max(a[0], b[0]) >= box.x0 - margin &&
    Math.min(a[0], b[0]) <= box.x1 + margin &&
    Math.max(a[1], b[1]) >= box.y0 - margin &&
    Math.min(a[1], b[1]) <= box.y1 + margin;
  const rim = loops.flatMap((l) => loopEdges(l)).filter(([a, b]) => near(a, b));
  // every corner in first: the quick way out for most places tried
  for (const poly of polys) for (const p of poly) if (!inside(loops, p)) return false;
  for (const poly of polys)
    for (const [a, b] of loopEdges(poly))
      for (const [c, d] of rim) if (segmentGap(a, b, c, d) < margin) return false;
  // no hole of the region inside a tile
  for (const loop of loops) for (const poly of polys) if (inside([poly], loop[0]!)) return false;
  return true;
}

/** One tile kind as the card draws it: its loops in its own units (y up)
 * and the map that places them in the picture. */
export interface Placed {
  kind: number;
  loops: Loop[];
  matrix: Matrix;
}

export interface CardLayout {
  /** The outline: viewBox, path, stroke width (`outlineFrame`). */
  frame: ReturnType<typeof outlineFrame>;
  /** The region's loops as drawn (y down), round edges sampled. */
  region: XY[][];
  tiles: Placed[];
  /** How a tile was placed: shrunk toward the point its parts touch at
   * (`pinch`), toward the outline's kernel (`kernel`), or moved and shrunk
   * till it fits (`fit`). */
  how: "pinch" | "kernel" | "fit";
  /** On `pinch`: that point, as drawn. */
  pinch?: XY;
  /** The gap kept between a tile's outline and the rim: their two half
   * strokes and a sliver. */
  margin: number;
  /** A tile's stroke width, as drawn. */
  tileStroke: number;
}

/** Each placed tile's loops as drawn, round edges sampled. */
export function placedPolys(placed: readonly Placed[]): XY[][] {
  return placed.flatMap((p) =>
    p.loops.map((l) => flatten(l.xy, l.curve).map((q) => apply(p.matrix, q))),
  );
}

const flipY = ([x, y]: XY): XY => [x, -y];

/** Where a tiling's card draws its tiles. */
export function cardLayout(level: Level): CardLayout {
  const frame = outlineFrame(level);
  const { ring } = level;
  const region = level.region.map((loop, i) =>
    flatten(
      loop.map((v) => ring.toXY(v)),
      level.regionCurves?.[i],
      level.regionMarks?.[i],
    ).map(flipY),
  );
  const tileStroke = frame.stroke * 0.6;
  const margin = frame.stroke / 2 + tileStroke / 2 + frame.stroke * 0.3;
  const base = { frame, region, margin, tileStroke };
  const reptile = repTileLayout(level, region, margin);
  if (reptile) return { ...base, ...reptile };
  return { ...base, how: "fit", tiles: fitted(rowsOf(level), region, margin) };
}

/** The tray's tiles side by side at their true sizes, resting flat, three to
 * a row (four as two and two), each row's tiles on one bottom line and the
 * rows stacked, centred on one another: in units of the tiles, y down. */
function rowsOf(level: Level): Placed[] {
  const { ring } = level;
  const shapes = level.tiles.map((t) => loopsOf(ring, t.pieces));
  const boxes = shapes.map((loops) =>
    boxOf(loops.flatMap((l) => flatten(l.xy, l.curve)).map(flipY)),
  );
  const n = shapes.length;
  const perRow = n === 4 ? 2 : 3;
  const tallest = Math.max(...boxes.map((b) => b.y1 - b.y0));
  const gap = tallest * 0.25;
  const rows: number[][] = [];
  for (let i = 0; i < n; i += perRow) rows.push(shapes.slice(i, i + perRow).map((_, j) => i + j));
  const widths = rows.map(
    (row) => row.reduce((w, k) => w + boxes[k]!.x1 - boxes[k]!.x0, 0) + gap * (row.length - 1),
  );
  const widest = Math.max(...widths);
  const placed: Placed[] = [];
  let bottom = 0;
  rows.forEach((row, r) => {
    const height = Math.max(...row.map((k) => boxes[k]!.y1 - boxes[k]!.y0));
    bottom += height;
    let at = (widest - widths[r]!) / 2;
    for (const k of row) {
      const b = boxes[k]!;
      // the tile's lowest point on the row's bottom line
      placed.push({ kind: k, loops: shapes[k]!, matrix: [1, 0, 0, -1, at - b.x0, bottom - b.y1] });
      at += b.x1 - b.x0 + gap;
    }
    bottom += gap;
  });
  return placed;
}

/** `tiles` (in their own units, as `rowsOf` lays them) scaled and moved to
 * fit inside `region` clear of its rim: as big as 55% of the outline's size
 * at most, as near its middle as fits. */
function fitted(tiles: Placed[], region: XY[][], margin: number): Placed[] {
  const local = placedPolys(tiles);
  const own = boxOf(local.flat());
  const rim = boxOf(region.flat());
  const span = Math.max(rim.x1 - rim.x0, rim.y1 - rim.y0);
  const [mx, my] = centroidOf(region);
  const size = Math.max(own.x1 - own.x0, own.y1 - own.y0);
  const ox = (own.x0 + own.x1) / 2;
  const oy = (own.y0 + own.y1) / 2;
  // places on a grid over the outline's box, nearest its middle first
  const STEPS = 24;
  const spots: XY[] = [];
  for (let i = 0; i <= STEPS; i++)
    for (let j = 0; j <= STEPS; j++)
      spots.push([
        rim.x0 + ((rim.x1 - rim.x0) * i) / STEPS,
        rim.y0 + ((rim.y1 - rim.y0) * j) / STEPS,
      ]);
  spots.sort((p, q) => Math.hypot(p[0] - mx, p[1] - my) - Math.hypot(q[0] - mx, q[1] - my));
  const at = (s: number, [x, y]: XY): Matrix => [s, 0, 0, s, x - s * ox, y - s * oy];
  const moved = (m: Matrix): Placed[] => tiles.map((t) => ({ ...t, matrix: compose(m, t.matrix) }));
  const fits = (s: number, spot: XY): Matrix | null => {
    if (!inside(region, spot)) return null;
    const m = at(s, spot);
    const polys = local.map((poly) => poly.map((p) => apply(m, p)));
    return insideRegion(polys, region, margin) ? m : null;
  };
  const start = (0.55 * span) / size;
  // near the middle first, a little smaller if it must be; then anywhere,
  // smaller and smaller
  const near = spots.filter(([x, y]) => Math.hypot(x - mx, y - my) <= 0.1 * span);
  const passes: [XY[], number][] = [
    [[[mx, my], ...near], 5],
    [spots, 14],
  ];
  let s = start;
  for (const [where, tries] of passes) {
    s = start;
    for (let t = 0; t < tries; t++, s *= 0.85)
      for (const spot of where) {
        const m = fits(s, spot);
        if (m) return moved(m);
      }
  }
  return moved(at(s, [mx, my]));
}

/** `outer` after `inner`. */
function compose(outer: Matrix, inner: Matrix): Matrix {
  return matrixOf((p) => apply(outer, apply(inner, p)));
}

/** A rep-tile's tile as its outline shrunk toward a point, where it can be:
 * the point the outline's parts touch at, else its kernel's middle. */
function repTileLayout(
  level: Level,
  region: XY[][],
  margin: number,
): Pick<CardLayout, "how" | "pinch" | "tiles"> | null {
  const fit = boardFit(level);
  if (!fit) return null;
  const { ring } = level;
  const loops = loopsOf(ring, level.tiles[0]!.pieces);
  const { angle, flip } = fit.pose;
  const [cx, cy] = fit.centre;
  const [bx, by] = fit.board;
  // the tile laid on the board — the outline itself — in board units, y up
  const laid = (p: XY): XY => {
    const [x, y] = flip ? [p[0], -p[1]] : p;
    const dx = (x - cx) * fit.scale;
    const dy = (y - cy) * fit.scale;
    return [
      bx + dx * Math.cos(angle) - dy * Math.sin(angle),
      by + dx * Math.sin(angle) + dy * Math.cos(angle),
    ];
  };
  // …shrunk by k toward c (as drawn, y down)
  const shrunk = (c: XY, k: number): Placed[] => [
    {
      kind: 0,
      loops,
      matrix: matrixOf((p) => {
        const [x, y] = flipY(laid(p));
        return [c[0] + k * (x - c[0]), c[1] + k * (y - c[1])];
      }),
    },
  ];
  const pinch = pinchOf(level);
  if (pinch) {
    const tiles = shrunk(pinch, 0.5);
    if (touchesOnlyAt(placedPolys(tiles), region)) return { how: "pinch", pinch, tiles };
  }
  if (region.length === 1) {
    const kernel = kernelOf(region[0]!);
    if (kernel.length >= 3) {
      const c = kernel
        .reduce<XY>((s, p) => [s[0] + p[0], s[1] + p[1]], [0, 0])
        .map((v) => v / kernel.length) as unknown as XY;
      for (let k = 0.5; k > 0.2; k -= 0.05) {
        const tiles = shrunk(c, k);
        if (insideRegion(placedPolys(tiles), region, margin)) return { how: "kernel", tiles };
      }
    }
  }
  // neither (the kissing square chain: its parts touch at three points, and
  // shrinking toward one leaves the others out): fit the laid tile
  const laidTiles: Placed[] = [{ kind: 0, loops, matrix: matrixOf((p) => flipY(laid(p))) }];
  return { how: "fit", tiles: fitted(laidTiles, region, margin) };
}

/** The point a region's parts touch at, as drawn — a corner two of its
 * loops share, or one loop passes twice — where there is exactly one. */
function pinchOf(level: Level): XY | null {
  const seen = new Set<string>();
  const twice: string[] = [];
  for (const loop of level.region)
    for (const v of loop) {
      const key = v.join(",");
      if (seen.has(key)) twice.push(key);
      seen.add(key);
    }
  if (twice.length !== 1) return null;
  const v = level.region.flat().find((u) => u.join(",") === twice[0])!;
  return flipY(level.ring.toXY(v));
}

/** Whether `polys` lie inside `region`, crossing its rim nowhere — a copy
 * shrunk toward a corner of it runs along the rim's two edges out of that
 * corner, so touching is allowed: no margin here. */
function touchesOnlyAt(polys: readonly XY[][], region: readonly XY[][]): boolean {
  const rim = region.flatMap((l) => loopEdges(l));
  for (const poly of polys) {
    const [cx, cy] = centroidOf([poly]);
    // each corner nudged toward its piece's middle: those on the rim, in
    for (const [x, y] of poly)
      if (!inside(region, [x + (cx - x) * 1e-6, y + (cy - y) * 1e-6])) return false;
    for (const [a, b] of loopEdges(poly))
      for (const [c, d] of rim) if (properlyCross(a, b, c, d)) return false;
  }
  return true;
}

/** The kernel of a simple polygon: the points every part of it is seen
 * from, the inner sides of all its edges cut out of its box. */
function kernelOf(loop: XY[]): XY[] {
  const ccw = signedArea(loop) > 0;
  const box = boxOf(loop);
  let poly: XY[] = [
    [box.x0, box.y0],
    [box.x1, box.y0],
    [box.x1, box.y1],
    [box.x0, box.y1],
  ];
  for (const [a, b] of loopEdges(loop)) {
    // the inner side: left of a → b on a counter-clockwise loop
    const side = (p: XY): number => (ccw ? 1 : -1) * cross(a, b, p);
    const out: XY[] = [];
    poly.forEach((p, i) => {
      const q = poly[(i + 1) % poly.length]!;
      const sp = side(p);
      const sq = side(q);
      if (sp >= 0) out.push(p);
      if (sp * sq < 0) {
        const t = sp / (sp - sq);
        out.push([p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t]);
      }
    });
    poly = out;
    if (poly.length < 3) return [];
  }
  return Math.abs(signedArea(poly)) > 1e-9 * (box.x1 - box.x0) ** 2 ? poly : [];
}

/** The card's picture: the outline, the tiles inside it. */
export function cardArt(level: Level): SVGSVGElement {
  const layout = cardLayout(level);
  const { frame } = layout;
  const svg = document.createElementNS(NS, "svg");
  svg.setAttribute("class", "card-picture");
  svg.setAttribute("aria-hidden", "true");
  svg.setAttribute("viewBox", frame.viewBox.join(" "));
  const rim = document.createElementNS(NS, "path");
  rim.setAttribute("class", "rim");
  rim.setAttribute("d", frame.d);
  rim.setAttribute("fill-rule", "evenodd");
  rim.setAttribute("stroke-width", String(frame.stroke));
  svg.appendChild(rim);
  const unit = markUnit(level);
  for (const { kind, loops, matrix } of layout.tiles) {
    const g = document.createElementNS(NS, "g");
    g.setAttribute("transform", `matrix(${matrix.join(" ")})`);
    const path = document.createElementNS(NS, "path");
    path.setAttribute("d", loopsPath(loops));
    path.setAttribute("class", `tile ${level.colours[kind]}`);
    // stroked in the tile's own units, which the map scales
    path.setAttribute("stroke-width", String(layout.tileStroke / ratioOf(matrix)));
    g.appendChild(path);
    for (const part of decorParts(loops, (p) => p, unit, { class: level.colours[kind]! })) {
      const d = document.createElementNS(NS, "path");
      d.setAttribute("d", part.d);
      d.setAttribute("class", part.class);
      if (part.width !== undefined) d.setAttribute("style", `stroke-width: ${part.width}`);
      g.appendChild(d);
    }
    svg.appendChild(g);
  }
  return svg;
}
