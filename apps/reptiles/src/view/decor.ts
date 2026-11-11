// Drawing a tile's marks (geometry/marks.ts) on top of it. Every mark is
// drawn so that two tiles that meet as they should make one shape across
// their edge, and two that would not, a broken one:
//
// - A colour — a coloured board's: a half disc on the middle of the edge,
//   inside the tile, in the colour that must lie across it (a red tile's
//   blue half disc against a blue tile). An edge with a tile of its own
//   colour across has none: no half disc, the same colour.
// - A line — a lined board's: across the tile from edge to edge, meeting
//   each edge square on and ending on it, so lines run on unbroken from tile
//   to tile: straight across to the opposite edge, or round the corner two
//   neighbouring edges share, on a circle about it (a Truchet tile's arc) —
//   or, for two edges further apart on an octagon or a dodecagon, about the
//   point past the tile where their lines meet. On an irregular tile (a
//   Laves tile's kite, rhombus or pentagon) it is a curve that leaves each
//   edge along its inward normal: square on all the same.
//   A line that would end in a tile is cut back to a half disc (`END`, see
//   src/colourings.ts), with one across it: two such tiles together make one
//   disc, and a half disc never meets a line.
// - An arrow — Penrose's matching rules, on his rhombi and his kites and
//   darts: an arc about one of the tile's corners, crossing the edge a share
//   of the way back from the arrow's head (so where it crosses shows which
//   way the arrow points), joining two edges of one kind of arrow that meet
//   there — as the 3⁶ lines go round a triangle's corner — dark for one kind
//   and blue for the other. A tile's arcs run on into its neighbours' only
//   where their arrows agree.
// - A label — a matching rule read off an aperiodic tiling's or a spiral's
//   own patch (src/patchMarks.ts): a point on its edge a third of the way
//   back from its head (a second six classes a fifth), or on the middle of
//   its edge where it has no way, and the tile's points of one class joined
//   by a line in the class's colour, leaving each edge square on there — so
//   two tiles meeting as they should run one line on across their edge; the
//   wrong class or the wrong way, two lines apart. A class with one point on
//   a tile is a half disc there instead: two tiles together make one disc.
//
// Each part is a path's `d` and class, in the coordinates `map` gives; the
// caller makes the elements. Nothing here is hit-tested: the classes carry
// `pointer-events: none`.

import type { Cyc } from "../geometry/cyclotomic";
import { centroid, realCorners, type XY } from "../geometry/shape";
import { END, LINE, arrow, colours, label } from "../geometry/marks";
import { alongEdge, type Loop } from "./curve";
import { PATCH_MARKED, type Level } from "../levels";

export interface DecorPart {
  d: string;
  class: string;
  /** A line's width, in the mapped coordinates, where it is set by the
   * level's edge length rather than by the stylesheet (a label's line). */
  width?: number;
}

/** A colour's or a cut line's half disc: its radius, as a share of its
 * edge. */
const HALF = 0.17;
/** An arrow's half disc, where no arcs can be drawn: its radius, a share
 * of its edge. */
const DOT = 0.11;
/** Where an arrow's arc crosses its edge, by the arrow's kind: a share of
 * the edge back from its head. Never a half — the crossing is what shows
 * which way the arrow points — and the two kinds' never adding to one, so
 * a rhombus's crossings pair up about only one pair of corners. */
// The rhombi's: a thin rhombus's arcs go round its 144° corners, so stay
// small there (0.3 and 1 − 0.618), a thick one's round its 72° ones. The
// kites' and darts': round a kite's tip and tail, a dart's tip and notch —
// 0.382 of an edge, the golden ratio's, as Conway's arcs are drawn.
const ARC_AT = [0, 0.3, 0.618, 0.382, 0.382];

/** How many colours labels come in, and where a label's half disc sits: a
 * share of its edge back from its head, by how many times round the colours
 * its class is. */
const LABEL_COLOURS = 6;
const LABEL_AT = [1 / 3, 0.2, 0.42];
/** A label's line: its width, as a share of the level's edge length (or,
 * without one, of the tile's mean edge). */
const LABEL_LINE = 0.07;

const fmt = (n: number): string => (Math.abs(n) < 1e-9 ? "0" : n.toFixed(4));
const pt = ([x, y]: XY): string => `${fmt(x)} ${fmt(y)}`;
const sub = (a: XY, b: XY): XY => [a[0] - b[0], a[1] - b[1]];
const cross = (a: XY, b: XY): number => a[0] * b[1] - a[1] * b[0];

/** The arc from `from` to `to` about `centre`, the short way round — or,
 * with `long`, the long way — all three already mapped: the SVG sweep flag is
 * read off the mapped points, so a mirroring map draws it the right way
 * round. */
function arcTo(centre: XY, from: XY, to: XY, long = false): string {
  const r = Math.hypot(from[0] - centre[0], from[1] - centre[1]);
  const short = cross(sub(from, centre), sub(to, centre)) > 0 ? 1 : 0;
  return `A${fmt(r)} ${fmt(r)} 0 ${long ? 1 : 0} ${long ? 1 - short : short} ${pt(to)}`;
}

/** Which corners of the polygon `xy` the arcs across its arrows are drawn
 * about: corner v joins the crossings on the edges either side of it (v − 1
 * and v) when they are one kind and the same distance from it (floats: a
 * drawing, not an identity), and every edge with an arrow is joined once.
 * Null if no such set of corners covers them — the arrows are then drawn as
 * half discs. */
function arcsOf(xy: XY[], crossings: Map<number, { kind: number; at: XY }>): number[] | null {
  if (crossings.size === 0) return [];
  const m = xy.length;
  const dist = (i: number, v: number): number => {
    const { at } = crossings.get(i)!;
    return Math.hypot(at[0] - xy[v]![0], at[1] - xy[v]![1]);
  };
  const joins: number[] = [];
  for (let v = 0; v < m; v++) {
    const before = crossings.get((v - 1 + m) % m);
    const after = crossings.get(v);
    if (!before || !after || before.kind !== after.kind) continue;
    const [d0, d1] = [dist((v - 1 + m) % m, v), dist(v, v)];
    if (Math.abs(d0 - d1) < 1e-6 * Math.max(1, d0)) joins.push(v);
  }
  // the corners, no two sharing an edge, that cover every crossing
  const pick = (from: number, used: Set<number>, chosen: number[]): number[] | null => {
    if (used.size === crossings.size) return chosen;
    for (let n = from; n < joins.length; n++) {
      const v = joins[n]!;
      const edges = [(v - 1 + m) % m, v];
      if (edges.some((e) => used.has(e))) continue;
      const found = pick(n + 1, new Set([...used, ...edges]), [...chosen, v]);
      if (found) return found;
    }
    return null;
  };
  return pick(0, new Set(), []);
}

/** Where the lines of the polygon `xy`'s edges i and j meet — "parallel"
 * if they never do — when the two edges' middles are as far from it (as on
 * a regular polygon): a circle about it through both middles crosses each
 * edge square on. Null where they are not (floats: a drawing, not an
 * identity). */
export function meet(xy: readonly XY[], i: number, j: number): XY | "parallel" | null {
  const m = xy.length;
  const [a, b, c, d] = [xy[i]!, xy[(i + 1) % m]!, xy[j]!, xy[(j + 1) % m]!];
  const [d1, d2] = [sub(b, a), sub(d, c)];
  const den = cross(d1, d2);
  if (Math.abs(den) < 1e-9 * Math.hypot(...d1) * Math.hypot(...d2)) return "parallel";
  const t = cross(sub(c, a), d2) / den;
  const x: XY = [a[0] + t * d1[0], a[1] + t * d1[1]];
  const r1 = Math.hypot(x[0] - (a[0] + b[0]) / 2, x[1] - (a[1] + b[1]) / 2);
  const r2 = Math.hypot(x[0] - (c[0] + d[0]) / 2, x[1] - (c[1] + d[1]) / 2);
  return Math.abs(r1 - r2) < 1e-6 * Math.max(1, r1) ? x : null;
}

/** A half disc of radius `r` centred at `at` on the edge a → b, on its left
 * (inside a counter-clockwise tile), as a closed path in mapped
 * coordinates. */
function halfDisc(a: XY, b: XY, at: XY, r: number, map: (p: XY) => XY): string {
  const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
  return halfDiscAlong([(b[0] - a[0]) / len, (b[1] - a[1]) / len], at, r, map);
}

/** A half disc of radius `r` centred at `at` on an edge running the unit
 * direction `dir` there, on its left. */
function halfDiscAlong([ux, uy]: XY, at: XY, r: number, map: (p: XY) => XY): string {
  const p0 = map([at[0] - ux * r, at[1] - uy * r]);
  const p1 = map([at[0] + ux * r, at[1] + uy * r]);
  const inside = map([at[0] - uy * r, at[1] + ux * r]);
  const c = map(at);
  // half way round, through the point inside: sweep towards it
  const sweep = cross(sub(p0, c), sub(inside, c)) > 0 ? 1 : 0;
  const mr = Math.hypot(p0[0] - c[0], p0[1] - c[1]);
  return `M${pt(p0)}A${fmt(mr)} ${fmt(mr)} 0 0 ${sweep} ${pt(p1)}Z`;
}

/** What a level's marks are sized by (`decorParts`): `disc`, the edge
 * length its half discs are, and `line`, the one its labels' lines are. */
export interface MarkUnit {
  disc?: number | undefined;
  line?: number | undefined;
}

const UNITS = new WeakMap<Level, MarkUnit | undefined>();

/** The middle of `lengths`. */
const median = (lengths: number[]): number | undefined =>
  [...lengths].sort((a, b) => a - b)[Math.floor(lengths.length / 2)];

/** What a level's marks are sized by (`decorParts`), on a level marked from
 * its patch: its half discs by the middle of its tray tiles' edge lengths,
 * so a disc on an edge cut short is as big as its tile's others; its lines
 * by the middle of their sides' — corner to real corner, the cuts left out
 * (the metatiles' edges are cut short all over) — so every line of the level
 * is one width, and two tiles' meet as one. Nothing on every other level:
 * each disc is sized by its own edge. */
export function markUnit(level: Level): MarkUnit | undefined {
  if (UNITS.has(level)) return UNITS.get(level);
  let unit: MarkUnit | undefined;
  if (level.decor && PATCH_MARKED.includes(level.decor.of)) {
    const { ring } = level;
    const length = (a: Cyc, b: Cyc): number => {
      const [[ax, ay], [bx, by]] = [ring.toXY(a), ring.toXY(b)];
      return Math.hypot(bx - ax, by - ay);
    };
    const pieces = level.tiles.flatMap((t) => t.pieces);
    const edges = pieces.flatMap(({ verts }) =>
      verts.map((v, i) => length(v, verts[(i + 1) % verts.length]!)),
    );
    const sides = pieces.flatMap(({ verts }) => {
      const real = realCorners(ring, verts);
      const at = verts.filter((_, i) => real[i]);
      return at.map((v, i) => length(v, at[(i + 1) % at.length]!));
    });
    unit = { disc: median(edges), line: median(sides) };
  }
  UNITS.set(level, unit);
  return unit;
}

/** The marks drawn on `loops` (a tile's, each with its marks), mapped by
 * `map`: half discs and a path of lines. Empty for an unmarked tile. With
 * `sizes` — a level's own edge lengths, the same for every tile of it
 * (`markUnit`) — a half disc is sized by `disc`, not by its edge, but for
 * staying on its edge: an edge cut short (a metatile's, where a corner of the
 * tile across lands) keeps a disc as big as its tile's others; and a label's
 * line is as wide as `line` says. A half disc on a round edge sits on its
 * arc. */
export function decorParts(
  loops: readonly Loop[],
  map: (p: XY) => XY = (p) => p,
  sizes?: MarkUnit,
): DecorPart[] {
  const unit = sizes?.disc;
  const discs = new Map<string, string[]>();
  const add = (cls: string, d: string): void => {
    discs.set(cls, [...(discs.get(cls) ?? []), d]);
  };
  const lines: string[] = [];
  // how far the map stretches a length: a label's line is as wide on a tray
  // tile or an icon as on the board, for its size
  const [o, x1] = [map([0, 0]), map([1, 0])];
  const stretch = Math.hypot(x1[0] - o[0], x1[1] - o[1]);
  const widths = new Map<string, number>();
  for (const { xy, marks, curve } of loops) {
    if (!marks) continue;
    const m = xy.length;
    // a half disc a share `t` along edge i, as drawn, at most `room` of the
    // edge from its nearer end: its radius `share` of its edge, or of `unit`
    const disc = (i: number, t: number, share: number): string => {
      const a = xy[i]!;
      const b = xy[(i + 1) % m]!;
      const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
      const room = 0.9 * Math.min(t, 1 - t) * len;
      const r = unit === undefined ? share * len : Math.min(share * unit, room);
      const { at, dir } = alongEdge(a, b, curve?.[i] ?? 0, t);
      return halfDiscAlong(dir, at, r, map);
    };
    const lined: number[] = [];
    const labelled: { i: number; t: number; cls: number; at: XY; n: XY }[] = [];
    const crossings = new Map<number, { kind: number; at: XY }>();
    marks.forEach((mark, i) => {
      const a = xy[i]!;
      const b = xy[(i + 1) % m]!;
      if (mark === LINE) {
        lined.push(i);
        return;
      }
      if (mark === END) {
        add("decor dot", disc(i, 0.5, HALF));
        return;
      }
      const tag = label(mark);
      if (tag) {
        // a share back from its head: from b, or from a
        const f = tag.forward === null ? 0.5 : LABEL_AT[Math.floor(tag.cls / LABEL_COLOURS) % 3]!;
        const t = tag.forward ? 1 - f : f;
        const { at, dir } = alongEdge(a, b, curve?.[i] ?? 0, t);
        labelled.push({ i, t, cls: tag.cls, at, n: [-dir[1], dir[0]] });
        return;
      }
      const way = arrow(mark);
      if (way) {
        // where its arc crosses: a share of the edge back from its head
        const [head, tail] = way.forward ? [b, a] : [a, b];
        const f = ARC_AT[way.kind]!;
        crossings.set(i, {
          kind: way.kind,
          at: [head[0] + (tail[0] - head[0]) * f, head[1] + (tail[1] - head[1]) * f],
        });
        return;
      }
      const pair = colours(mark);
      const colour = pair && pair.own !== pair.other ? pair.other : null;
      if (colour !== null) add(`decor band paint-${colour}`, disc(i, 0.5, HALF));
    });
    // labels: each class's marks on this tile joined, so that a tile's
    // lines run on into its neighbours' where they meet as they should — a
    // curve leaving each edge square on, through the point the half disc
    // marked, so two tiles' lines meet there along one normal. Two marks of
    // a class are one curve; more are paired as they come round the outline
    // (neighbours' pairs never cross), and an odd three meet at a hub; a
    // lone one stays a half disc, as a line never ends in a tile.
    // a tile of several pieces (the Socolar–Taylor tile's nineteen, ten
    // classes among them) keeps its half discs: lines across it would tangle
    if (loops.length > 1)
      for (const { i, t, cls } of labelled)
        add(`decor label label-${cls % LABEL_COLOURS}`, disc(i, t, DOT));
    else if (labelled.length) {
      const edge =
        sizes?.line ??
        xy.reduce((sum, a, i) => sum + Math.hypot(...sub(xy[(i + 1) % m]!, a)), 0) / m;
      type Mark = (typeof labelled)[number];
      const gap = (p: Mark, q: Mark): number => Math.hypot(...sub(p.at, q.at));
      // square on to each edge: each arm along its inward normal, a share
      // of the gap — a curve between two marks near one corner stays small
      const between = (p: Mark, q: Mark): string => {
        const h = 0.45 * gap(p, q);
        const c1: XY = [p.at[0] + p.n[0] * h, p.at[1] + p.n[1] * h];
        const c2: XY = [q.at[0] + q.n[0] * h, q.at[1] + q.n[1] * h];
        return `M${pt(map(p.at))}C${pt(map(c1))} ${pt(map(c2))} ${pt(map(q.at))}`;
      };
      const hub = (three: Mark[]): string => {
        const c: XY = [
          three.reduce((sum, l) => sum + l.at[0], 0) / 3,
          three.reduce((sum, l) => sum + l.at[1], 0) / 3,
        ];
        return three
          .map((l) => {
            const h = 0.6 * Math.hypot(...sub(c, l.at));
            const q: XY = [l.at[0] + l.n[0] * h, l.at[1] + l.n[1] * h];
            return `M${pt(map(l.at))}Q${pt(map(q))} ${pt(map(c))}`;
          })
          .join("");
      };
      const byCls = new Map<number, Mark[]>();
      for (const l of labelled) byCls.set(l.cls, [...(byCls.get(l.cls) ?? []), l]);
      for (const [cls, list] of byCls) {
        const colour = cls % LABEL_COLOURS;
        if (list.length === 1) {
          add(`decor label label-${colour}`, disc(list[0]!.i, list[0]!.t, DOT));
          continue;
        }
        // in order round the outline, from whichever mark makes the pairs
        // shortest in all (floats: a drawing, the first of a tie)
        const k = list.length;
        let best: { cost: number; d: string } | null = null;
        for (let start = 0; start < k; start++) {
          const run = [...list.slice(start), ...list.slice(0, start)];
          let cost = 0;
          let d = "";
          let r = 0;
          if (k % 2) {
            cost += gap(run[0]!, run[1]!) + gap(run[1]!, run[2]!);
            d += hub(run.slice(0, 3));
            r = 3;
          }
          for (; r + 1 < k; r += 2) {
            cost += gap(run[r]!, run[r + 1]!);
            d += between(run[r]!, run[r + 1]!);
          }
          if (!best || cost < best.cost - 1e-9) best = { cost, d };
        }
        const cls_ = `decor label-line label-${colour}`;
        add(cls_, best!.d);
        widths.set(cls_, LABEL_LINE * edge * stretch);
      }
    }
    const mid = (i: number): XY => {
      const a = xy[i]!;
      const b = xy[(i + 1) % m]!;
      return [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
    };
    // arrows: arcs about the tile's corners, each joining two crossings of
    // one kind the same way from its corner
    const covered = arcsOf(xy, crossings);
    for (const v of covered ?? []) {
      const m0 = (v - 1 + m) % m;
      const p = map(crossings.get(m0)!.at);
      const q = map(crossings.get(v)!.at);
      const prev = xy[m0]!;
      const here = xy[v]!;
      const next = xy[(v + 1) % m]!;
      // a reflex corner (a dart's notch) is gone round the long way
      const reflex = cross(sub(here, prev), sub(next, here)) < 0;
      const kind = crossings.get(v)!.kind;
      add(
        `decor arc${kind % 2 === 0 ? " double" : ""}`,
        `M${pt(p)}${arcTo(map(here), p, q, reflex)}`,
      );
    }
    if (!covered)
      for (const [i, { kind, at }] of crossings) {
        const a = xy[i]!;
        const b = xy[(i + 1) % m]!;
        const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
        add(`decor dot${kind % 2 === 0 ? " double" : ""}`, halfDisc(a, b, at, DOT * len, map));
      }
    // edge i's unit normal into the tile (on its left: tiles run
    // counter-clockwise)
    const inward = (i: number): XY => {
      const [a, b] = [xy[i]!, xy[(i + 1) % m]!];
      const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
      return [-(b[1] - a[1]) / len, (b[0] - a[0]) / len];
    };
    // `h` along edge i's inward normal from its middle
    const off = (i: number, h: number): XY => {
      const [n, c] = [inward(i), mid(i)];
      return [c[0] + n[0] * h, c[1] + n[1] * h];
    };
    // whether `to` lies square on from edge i's middle (floats: a drawing)
    const squareOn = (i: number, to: XY): boolean => {
      const d = sub(to, mid(i));
      return Math.abs(cross(inward(i), d)) < 1e-6 * Math.max(1, Math.hypot(...d));
    };
    // (never one: a line that would end here is cut back to a half disc)
    if (lined.length === 2) {
      const [i, j] = lined as [number, number];
      const [p, q] = [map(mid(i)), map(mid(j))];
      const centre = meet(xy, i, j);
      const gap = Math.hypot(...sub(mid(j), mid(i)));
      // two parallel edges facing each other: straight across
      if (centre === "parallel" && squareOn(i, mid(j))) lines.push(`M${pt(p)}L${pt(q)}`);
      // about the point the two edges' lines meet, where both middles are
      // as far from it: then the arc meets each edge square on — round the
      // corner two neighbouring edges share, or round a point past the
      // tile for two further apart (an octagon's or a dodecagon's)
      else if (centre && centre !== "parallel") lines.push(`M${pt(p)}${arcTo(map(centre), p, q)}`);
      // an irregular tile's (a Laves tile's kite, rhombus or pentagon): a
      // curve leaving each middle along the edge's inward normal, so it
      // still meets each edge square on and runs on into the tile across —
      // round the corner two neighbouring edges share as an arc round it
      // would, each arm as long as a circle's through that middle (4/3 ·
      // tan(φ/4) of its distance from the corner, φ the turn); between two
      // edges further apart, a share of the gap
      else {
        const corner = j === (i + 1) % m ? j : i === (j + 1) % m ? i : null;
        let [hi, hj] = [gap * 0.4, gap * 0.4];
        if (corner !== null) {
          const c = xy[corner]!;
          const [ni, nj] = [inward(i), inward(j)];
          const turn = Math.acos(Math.max(-1, Math.min(1, ni[0] * nj[0] + ni[1] * nj[1])));
          const kappa = (4 / 3) * Math.tan((Math.PI - turn) / 4);
          hi = kappa * Math.hypot(...sub(mid(i), c));
          hj = kappa * Math.hypot(...sub(mid(j), c));
        }
        lines.push(`M${pt(p)}C${pt(map(off(i, hi)))} ${pt(map(off(j, hj)))} ${pt(q)}`);
      }
    } else if (lined.length > 2) {
      // spokes to the middle of the tile, each leaving its edge square on
      const hub = centroid(xy);
      const c = map(hub);
      for (const i of lined) {
        const from = map(mid(i));
        if (squareOn(i, hub)) lines.push(`M${pt(from)}L${pt(c)}`);
        else {
          const reach = Math.hypot(...sub(hub, mid(i)));
          lines.push(`M${pt(from)}Q${pt(map(off(i, reach * 0.6)))} ${pt(c)}`);
        }
      }
    }
  }
  const out: DecorPart[] = [...discs.entries()]
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([cls, ds]) => {
      const width = widths.get(cls);
      return width === undefined
        ? { d: ds.join(""), class: cls }
        : { d: ds.join(""), class: cls, width };
    });
  if (lines.length) out.push({ d: lines.join(""), class: "decor line" });
  return out;
}
