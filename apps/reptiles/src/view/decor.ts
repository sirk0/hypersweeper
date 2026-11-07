// Drawing a coloured or lined tile's marks (geometry/marks.ts) on top of it.
//
// - A colour pair (own, other) with other ≠ own: a band along the inside of
//   the edge in the colour that must lie across it — so a tile says, edge by
//   edge, what goes next to it, and a right placement puts each band against
//   a tile of its colour.
// - A line: from the middle of each crossed edge in towards the tile's middle
//   — two crossed edges one curve through it, so a row of lined tiles draws
//   one unbroken stripe. A `LINE` mark is always crossed; a pair of one
//   colour (a stripe running on) only when the player has asked for lines on
//   coloured boards (`prefs.ts`).
//
// Each part is a path's `d` and class, in the coordinates `map` gives; the
// caller makes the elements. Nothing here is hit-tested: the classes carry
// `pointer-events: none`.

import { centroid, type XY } from "../geometry/shape";
import { colours, crossed } from "../geometry/marks";
import type { Loop } from "./curve";

export interface DecorPart {
  d: string;
  class: string;
}

/** How deep a band reaches into the tile, as a share of its shortest edge,
 * and how far in from each corner it stops, as a share of its edge. Its ends
 * run along the corners' bisectors, so two bands meeting at a sharp corner
 * (a triangle's) never overlap. */
const BAND = 0.12;
const INSET = 0.1;

/** The polygon `xy` (counter-clockwise, convex) moved in by `w` all round:
 * each corner along its bisector. */
function inset(xy: XY[], w: number): XY[] {
  const m = xy.length;
  return xy.map((p, i) => {
    const prev = xy[(i - 1 + m) % m]!;
    const next = xy[(i + 1) % m]!;
    const unit = (a: XY, b: XY): XY => {
      const l = Math.hypot(b[0] - a[0], b[1] - a[1]);
      return [(b[0] - a[0]) / l, (b[1] - a[1]) / l];
    };
    const [ix, iy] = unit(prev, p);
    const [ox, oy] = unit(p, next);
    // the two edges' left normals, into the tile, and their mean
    const [nx, ny] = [-iy - oy, ix + ox];
    const half = Math.hypot(nx, ny) / 2; // cos of half the turn
    const len = Math.hypot(nx, ny);
    return [p[0] + ((nx / len) * w) / half, p[1] + ((ny / len) * w) / half];
  });
}

const fmt = (n: number): string => (Math.abs(n) < 1e-9 ? "0" : n.toFixed(4));
const pt = ([x, y]: XY): string => `${fmt(x)} ${fmt(y)}`;

/** The marks drawn on `loops` (a tile's, each with its marks), mapped by
 * `map`: a band per edge whose other colour differs, a path of lines. Empty
 * for an unmarked tile. `same`: draw lines across edges of one colour too. */
export function decorParts(
  loops: readonly Loop[],
  same: boolean,
  map: (p: XY) => XY = (p) => p,
): DecorPart[] {
  const bands = new Map<number, string[]>();
  const lines: string[] = [];
  for (const { xy, marks } of loops) {
    if (!marks) continue;
    const m = xy.length;
    const c = centroid(xy);
    const shortest = Math.min(
      ...xy.map((a, i) => Math.hypot(xy[(i + 1) % m]![0] - a[0], xy[(i + 1) % m]![1] - a[1])),
    );
    const inner = inset(xy, shortest * BAND);
    const mids: XY[] = [];
    marks.forEach((mark, i) => {
      const a = xy[i]!;
      const b = xy[(i + 1) % m]!;
      const dx = b[0] - a[0];
      const dy = b[1] - a[1];
      if (crossed(mark, same)) mids.push([(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]);
      const pair = colours(mark);
      if (!pair || pair.own === pair.other) return;
      // the band between the edge and the same edge of the inset outline,
      // each stopped short of the corners by the same share
      const ia = inner[i]!;
      const ib = inner[(i + 1) % m]!;
      const [ex, ey] = [ib[0] - ia[0], ib[1] - ia[1]];
      const quad: XY[] = [
        [a[0] + dx * INSET, a[1] + dy * INSET],
        [b[0] - dx * INSET, b[1] - dy * INSET],
        [ib[0] - ex * INSET, ib[1] - ey * INSET],
        [ia[0] + ex * INSET, ia[1] + ey * INSET],
      ];
      const d = `M${quad.map((p) => pt(map(p))).join("L")}Z`;
      bands.set(pair.other, [...(bands.get(pair.other) ?? []), d]);
    });
    if (mids.length === 2) {
      lines.push(`M${pt(map(mids[0]!))}Q${pt(map(c))} ${pt(map(mids[1]!))}`);
    } else {
      for (const mid of mids) lines.push(`M${pt(map(mid))}L${pt(map(c))}`);
      // a lone stub ends in a dot at the middle, so it reads as a line's end
      if (mids.length === 1) lines.push(`M${pt(map(c))}l0 0`);
    }
  }
  const out: DecorPart[] = [...bands.entries()]
    .sort(([a], [b]) => a - b)
    .map(([colour, ds]) => ({ d: ds.join(""), class: `decor band paint-${colour}` }));
  if (lines.length) out.push({ d: lines.join(""), class: "decor line" });
  return out;
}
