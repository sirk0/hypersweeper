// Drawing a tile's marks (geometry/marks.ts) on top of it. Every mark is
// drawn so that two tiles that meet as they should make one shape across
// their edge, and two that would not, a broken one:
//
// - A colour — a coloured board's: a half disc on the middle of the edge,
//   inside the tile. Where colours alternate it is the colour that must lie
//   across (a red tile's blue half disc against a blue tile); where tiles of
//   one colour touch it is the edge's own colour, drawn alike on both tiles,
//   so the two halves make one disc: in two colours the second, in three the
//   one that is neither of the edge's two (between red and blue, gold). An
//   edge between two of one colour has nothing.
// - A line — a lined board's: across the tile from edge to edge, meeting
//   each edge square on and ending on it, so lines run on unbroken from tile
//   to tile: straight across to the opposite edge, or round the corner two
//   neighbouring edges share, on a circle about it (a Truchet tile's arc).
//   A tile with one lined edge has a half disc there instead of a stub: two
//   such tiles together make one disc.
// - An arrow — the Penrose rhombi's matching rule: a half disc set off the
//   middle of the edge towards the way the arrow points, dark for a single
//   arrow and blue for a double, so tiles meet only where the halves make a
//   whole disc.
//
// Each part is a path's `d` and class, in the coordinates `map` gives; the
// caller makes the elements. Nothing here is hit-tested: the classes carry
// `pointer-events: none`.

import { centroid, type XY } from "../geometry/shape";
import { LINE, arrow, colours, shared } from "../geometry/marks";
import type { Loop } from "./curve";

export interface DecorPart {
  d: string;
  class: string;
}

/** A colour's or a lone line's half disc: its radius, as a share of its
 * edge. */
const HALF = 0.17;
/** An arrow's half disc: its radius, and how far off the edge's middle it
 * sits, towards the arrow's head — both as shares of its edge. */
const DOT = 0.11;
const DOT_OFF = 0.2;

const fmt = (n: number): string => (Math.abs(n) < 1e-9 ? "0" : n.toFixed(4));
const pt = ([x, y]: XY): string => `${fmt(x)} ${fmt(y)}`;
const sub = (a: XY, b: XY): XY => [a[0] - b[0], a[1] - b[1]];
const cross = (a: XY, b: XY): number => a[0] * b[1] - a[1] * b[0];

/** The band colour of an edge shared between colours `lo` and `hi`, on a
 * board of `count` colours: the one colour that is neither, where there is
 * one, else the higher. */
export function sharedBand(lo: number, hi: number, count: number): number {
  if (count === 3) return 3 - lo - hi;
  return hi;
}

/** The arc from `from` to `to` about `centre`, the short way round, all
 * three already mapped: the SVG sweep flag is read off the mapped points, so
 * a mirroring map draws it the right way round. */
function arcTo(centre: XY, from: XY, to: XY): string {
  const r = Math.hypot(from[0] - centre[0], from[1] - centre[1]);
  const sweep = cross(sub(from, centre), sub(to, centre)) > 0 ? 1 : 0;
  return `A${fmt(r)} ${fmt(r)} 0 0 ${sweep} ${pt(to)}`;
}

/** A half disc of radius `r` centred at `at` on the edge a → b, on its left
 * (inside a counter-clockwise tile), as a closed path in mapped
 * coordinates. */
function halfDisc(a: XY, b: XY, at: XY, r: number, map: (p: XY) => XY): string {
  const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
  const [ux, uy] = [(b[0] - a[0]) / len, (b[1] - a[1]) / len];
  const p0 = map([at[0] - ux * r, at[1] - uy * r]);
  const p1 = map([at[0] + ux * r, at[1] + uy * r]);
  const inside = map([at[0] - uy * r, at[1] + ux * r]);
  const c = map(at);
  // half way round, through the point inside: sweep towards it
  const sweep = cross(sub(p0, c), sub(inside, c)) > 0 ? 1 : 0;
  const mr = Math.hypot(p0[0] - c[0], p0[1] - c[1]);
  return `M${pt(p0)}A${fmt(mr)} ${fmt(mr)} 0 0 ${sweep} ${pt(p1)}Z`;
}

/** The marks drawn on `loops` (a tile's, each with its marks), mapped by
 * `map`: half discs and a path of lines. Empty for an unmarked tile.
 * `count`: how many colours the board is painted in. */
export function decorParts(
  loops: readonly Loop[],
  map: (p: XY) => XY = (p) => p,
  count = 2,
): DecorPart[] {
  const discs = new Map<string, string[]>();
  const add = (cls: string, d: string): void => {
    discs.set(cls, [...(discs.get(cls) ?? []), d]);
  };
  const lines: string[] = [];
  for (const { xy, marks } of loops) {
    if (!marks) continue;
    const m = xy.length;
    const lined: number[] = [];
    marks.forEach((mark, i) => {
      const a = xy[i]!;
      const b = xy[(i + 1) % m]!;
      const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
      const mid: XY = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
      if (mark === LINE) {
        lined.push(i);
        return;
      }
      const way = arrow(mark);
      if (way) {
        const s = way.forward ? DOT_OFF : -DOT_OFF;
        const at: XY = [mid[0] + (b[0] - a[0]) * s, mid[1] + (b[1] - a[1]) * s];
        add(`decor dot${way.kind === 2 ? " double" : ""}`, halfDisc(a, b, at, DOT * len, map));
        return;
      }
      const pair = colours(mark);
      const edge = shared(mark);
      const colour = edge
        ? sharedBand(edge.lo, edge.hi, count)
        : pair && pair.own !== pair.other
          ? pair.other
          : null;
      if (colour !== null) add(`decor band paint-${colour}`, halfDisc(a, b, mid, HALF * len, map));
    });
    const mid = (i: number): XY => {
      const a = xy[i]!;
      const b = xy[(i + 1) % m]!;
      return [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
    };
    if (lined.length === 1) {
      const i = lined[0]!;
      const a = xy[i]!;
      const b = xy[(i + 1) % m]!;
      add("decor dot", halfDisc(a, b, mid(i), HALF * Math.hypot(b[0] - a[0], b[1] - a[1]), map));
    } else if (lined.length === 2) {
      const [i, j] = lined as [number, number];
      // two neighbouring edges: round the corner they share
      const corner = j === (i + 1) % m ? xy[j] : i === (j + 1) % m ? xy[i] : null;
      const [p, q] = [map(mid(i)), map(mid(j))];
      if (corner) lines.push(`M${pt(p)}${arcTo(map(corner), p, q)}`);
      else if (Math.abs(i - j) * 2 === m) lines.push(`M${pt(p)}L${pt(q)}`);
      else lines.push(`M${pt(p)}Q${pt(map(centroid(xy)))} ${pt(q)}`);
    } else if (lined.length > 2) {
      const c = map(centroid(xy));
      for (const i of lined) lines.push(`M${pt(map(mid(i)))}L${pt(c)}`);
    }
  }
  const out: DecorPart[] = [...discs.entries()]
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([cls, ds]) => ({ d: ds.join(""), class: cls }));
  if (lines.length) out.push({ d: lines.join(""), class: "decor line" });
  return out;
}
