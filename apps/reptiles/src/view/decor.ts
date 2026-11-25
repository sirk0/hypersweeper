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
//   edge along its inward normal: square on all the same. On a star (a
//   star tiling's) it runs in to the axis of the point its edge runs to and
//   along it through the middle (`starLines`): an arc round a dent, or a
//   curve between two far edges, would leave the tile.
//   Three or more lined edges on a tile are one such line between two of
//   them with a branch off it from each other one (`branched`): straight on
//   along its edge's normal where that meets the line at a fair angle, else
//   curving round to meet it square on — every branch ending inside the
//   line's stroke, so lines meeting in a tile leave no notch.
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
//   wrong class or the wrong way, two lines apart Three of a class branch as
//   a lined tile's lines do. A class with one point on
//   a tile is a half disc there instead: two tiles together make one disc.
//
// - Strapwork — a girih tile's (geometry/girih.ts): no mark, and it asks
//   nothing of where a tile goes, but the pattern the tiles are for. From
//   the middle of every edge two lines leave at 54° to it, one toward each
//   end, and each runs on until it meets another (Hankin's method,
//   `strapwork`): a ten-pointed star in the decagon, a five-pointed one in
//   the pentagon. Every edge's two lines leave its middle at the same
//   angles, so whatever two girih tiles meet along an edge, their lines run
//   on into each other.
//
// Each part is a path's `d` and class, in the coordinates `map` gives; the
// caller makes the elements. Nothing here is hit-tested: the classes carry
// `pointer-events: none`.

import type { Cyc } from "../geometry/cyclotomic";
import { realCorners, type XY } from "../geometry/shape";
import { END, LINE, arrow, colours, label } from "../geometry/marks";
import { alongEdge, loopsPath, type Loop } from "./curve";
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

const dot = (a: XY, b: XY): number => a[0] * b[0] + a[1] * b[1];
const lerp = (a: XY, b: XY, t: number): XY => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
const unit = ([x, y]: XY): XY => {
  const len = Math.hypot(x, y);
  return [x / len, y / len];
};

/** A line drawn inside a tile: its path (`d`, mapped, one subpath) and the
 * point a share `t` along it, unmapped; with `weight`, how much more its
 * length counts against it as the line others branch off (`branched`). */
export interface Curve {
  d: string;
  at: (t: number) => XY;
  weight?: number;
}

/** The cubic p → q with controls c1 and c2, as a `Curve`. */
function cubic(p: XY, c1: XY, c2: XY, q: XY, map: (p: XY) => XY): Curve {
  return {
    d: `M${pt(map(p))}C${pt(map(c1))} ${pt(map(c2))} ${pt(map(q))}`,
    at: (t) => {
      const s = 1 - t;
      const [a, b, c, d] = [s * s * s, 3 * s * s * t, 3 * s * t * t, t * t * t];
      return [
        a * p[0] + b * c1[0] + c * c2[0] + d * q[0],
        a * p[1] + b * c1[1] + c * c2[1] + d * q[1],
      ];
    },
  };
}

/** How many points a line is read at, to branch onto it (floats: a
 * drawing). */
const SAMPLES = 64;
/** The least angle a straight branch may meet its line at; shallower, it
 * curves round to meet it square on. */
const SHALLOW = (35 * Math.PI) / 180;
/** How far from either end of its line a curved branch may meet it, as a
 * share of the line: never at an end, which lies on the tile's edge. */
const INNER = 0.2;
/** What two branches crossing each other cost, as a share of their line's
 * length. */
const CROSSING = 0.5;

/** Whether two polylines cross, away from their ends (floats: a drawing). */
function crosses(p: readonly XY[], q: readonly XY[]): boolean {
  for (let i = 1; i < p.length; i++)
    for (let j = 1; j < q.length; j++) {
      const [a, b, c, d] = [p[i - 1]!, p[i]!, q[j - 1]!, q[j]!];
      const [ab, cd] = [sub(b, a), sub(d, c)];
      const den = cross(ab, cd);
      if (Math.abs(den) < 1e-12) continue;
      const t = cross(sub(c, a), cd) / den;
      const u = cross(sub(c, a), ab) / den;
      if (t > 1e-6 && t < 1 - 1e-6 && u > 1e-6 && u < 1 - 1e-6) return true;
    }
  return false;
}

/** Three or more arms — points on a tile's edges, each leaving its edge
 * along `n`, its inward normal — joined as one line between two of them
 * (`line`, drawn as a lone pair of them would be) with each other arm
 * branching off it: straight on along its normal where that meets the line
 * at a fair angle, else a curve meeting the line square on at its nearest
 * point. Every branch ends inside the line's stroke, so no butt end leaves
 * a notch, and no two arms run into one point side by side. Of every pair,
 * the one whose line and branches are least ink (a curved branch counted
 * half again, and two branches crossing more) is drawn. Subpaths in mapped
 * coordinates. */
export function branched(
  arms: readonly { at: XY; n: XY }[],
  line: (a: number, b: number) => Curve,
  map: (p: XY) => XY = (p) => p,
): string {
  let best: { cost: number; d: string } | null = null;
  for (let a = 0; a < arms.length; a++)
    for (let b = a + 1; b < arms.length; b++) {
      const main = line(a, b);
      const along = Array.from({ length: SAMPLES + 1 }, (_, k) => main.at(k / SAMPLES));
      let length = 0;
      for (let k = 1; k < along.length; k++) length += Math.hypot(...sub(along[k]!, along[k - 1]!));
      let cost = length * (main.weight ?? 1);
      let d = main.d;
      const branches: XY[][] = [];
      for (let k = 0; k < arms.length; k++) {
        if (k === a || k === b) continue;
        const { at, n } = arms[k]!;
        // straight on: the nearest crossing of the arm's normal with the line
        let hit: { s: number; p: XY; dir: XY } | null = null;
        for (let e = 1; e < along.length; e++) {
          const [p0, p1] = [along[e - 1]!, along[e]!];
          const dir = sub(p1, p0);
          const den = cross(n, dir);
          if (Math.abs(den) < 1e-12) continue;
          const w = sub(p0, at);
          const s = cross(w, dir) / den;
          const u = cross(w, n) / den;
          if (s > 1e-9 && u >= 0 && u <= 1 && (!hit || s < hit.s))
            hit = { s, p: lerp(p0, p1, u), dir };
        }
        if (hit && Math.abs(cross(n, unit(hit.dir))) >= Math.sin(SHALLOW)) {
          cost += hit.s;
          d += `M${pt(map(at))}L${pt(map(hit.p))}`;
          branches.push([at, hit.p]);
          continue;
        }
        // else round to the line's nearest point, meeting it square on
        const [first, last] = [Math.ceil(INNER * SAMPLES), Math.floor((1 - INNER) * SAMPLES)];
        let near = first;
        for (let e = first + 1; e <= last; e++)
          if (Math.hypot(...sub(along[e]!, at)) < Math.hypot(...sub(along[near]!, at))) near = e;
        const p = along[near]!;
        const tangent = unit(
          sub(along[Math.min(near + 1, SAMPLES)]!, along[Math.max(near - 1, 0)]!),
        );
        let normal: XY = [-tangent[1], tangent[0]];
        if (dot(normal, sub(at, p)) < 0) normal = [-normal[0], -normal[1]];
        const reach = Math.hypot(...sub(p, at));
        const h = 0.4 * reach;
        cost += 1.5 * reach;
        const branch = cubic(
          at,
          [at[0] + n[0] * h, at[1] + n[1] * h],
          [p[0] + normal[0] * h, p[1] + normal[1] * h],
          p,
          map,
        );
        d += branch.d;
        branches.push(Array.from({ length: 17 }, (_, k) => branch.at(k / 16)));
      }
      for (let i = 0; i < branches.length; i++)
        for (let j = i + 1; j < branches.length; j++)
          if (crosses(branches[i]!, branches[j]!)) cost += CROSSING * length;
      if (!best || cost < best.cost - 1e-9) best = { cost, d };
    }
  return best!.d;
}

/** A star's middle and, for each edge, the point its edge runs to (the
 * convex end of it; a star's every edge runs from a dent to a point) — or
 * null for a tile that is no star: one whose corners do not turn out and
 * in by turns, at least three of each. A star is star-shaped about its
 * middle, the mean of its corners, so every line drawn there in the
 * triangles middle–corner–corner stays inside it. (Floats: a drawing.) */
interface StarHub {
  centre: XY;
  tips: number[];
  /** The radius of the polygon of its dents' largest disc about the
   * middle: room to round a corner in, inside the tile. */
  room: number;
}

function starHub(xy: readonly XY[]): StarHub | null {
  const m = xy.length;
  if (m < 6 || m % 2) return null;
  const reflex = xy.map((v, i) => {
    const prev = xy[(i - 1 + m) % m]!;
    const next = xy[(i + 1) % m]!;
    return cross(sub(v, prev), sub(next, v)) < 0;
  });
  if (!reflex.every((r, i) => r !== reflex[(i + 1) % m])) return null;
  const centre: XY = [xy.reduce((s, p) => s + p[0], 0) / m, xy.reduce((s, p) => s + p[1], 0) / m];
  const tips = xy.map((_, i) => (reflex[i] ? (i + 1) % m : i));
  // the dents' polygon is convex and inside the star: its nearest side
  const dents = xy.filter((_, i) => reflex[i]);
  let room = Infinity;
  dents.forEach((a, k) => {
    const b = dents[(k + 1) % dents.length]!;
    const ab = sub(b, a);
    room = Math.min(room, Math.abs(cross(ab, sub(centre, a))) / Math.hypot(...ab));
  });
  return { centre, tips, room };
}

/**
 * A star's lines (`lined`, its lined edges): each leaves its edge's middle
 * square on, turns onto the axis of the point that edge runs to (the line
 * from the star's middle to that point's tip) where its normal meets it, and
 * runs along it to the middle — so it stays in the triangle middle–tip–dent
 * its edge bounds, inside the star however thin the point, where an arc
 * round a dent would leave it. Two lines are one curve through the middle,
 * rounded there inside the dents' polygon; more are the two whose turn at
 * the middle is the straightest as that one line, cornered at the middle,
 * and every other running into that corner, which lies on its centre line:
 * a butt end there is inside that line's stroke and its round join. A
 * subpath each, mapped.
 */
function starLines(
  xy: readonly XY[],
  { centre, tips, room }: StarHub,
  lined: readonly number[],
  map: (p: XY) => XY,
): string {
  const m = xy.length;
  const along = (from: XY, to: XY, d: number): XY => {
    const v = sub(to, from);
    const len = Math.hypot(...v);
    return [from[0] + (v[0] * d) / len, from[1] + (v[1] * d) / len];
  };
  // each lined edge's middle and where its normal meets its point's axis
  const arms = lined.map((i) => {
    const [a, b] = [xy[i]!, xy[(i + 1) % m]!];
    const mid: XY = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
    const tip = xy[tips[i]!]!;
    const n: XY = [-(b[1] - a[1]), b[0] - a[0]];
    const axis = sub(tip, centre);
    // mid + s·n = centre + u·axis
    const den = cross(n, axis);
    const u = cross(n, sub(mid, centre)) / den;
    const turn: XY = [centre[0] + u * axis[0], centre[1] + u * axis[1]];
    return { mid, turn };
  });
  // an arm from its edge to `end`, on the way to the middle: straight along
  // the normal, rounded onto the axis
  const arm = ({ mid, turn }: (typeof arms)[number], end: XY): string => {
    const leg = Math.hypot(...sub(turn, mid));
    const on = Math.hypot(...sub(end, turn));
    const f = Math.min(0.9 * leg, 0.5 * on);
    const [p, q] = [along(turn, mid, f), along(turn, end, f)];
    return `M${pt(map(mid))}L${pt(map(p))}Q${pt(map(turn))} ${pt(map(q))}L${pt(map(end))}`;
  };
  // the arm from the middle back out to its edge
  const out = ({ mid, turn }: (typeof arms)[number], from: XY): string => {
    const leg = Math.hypot(...sub(turn, mid));
    const on = Math.hypot(...sub(from, turn));
    const f = Math.min(0.9 * leg, 0.5 * on);
    const [p, q] = [along(turn, from, f), along(turn, mid, f)];
    return `L${pt(map(p))}Q${pt(map(turn))} ${pt(map(q))}L${pt(map(mid))}`;
  };
  // the straightest pair through the middle
  let [x, y] = [0, 1];
  let best = Infinity;
  for (let a = 0; a < arms.length; a++)
    for (let b = a + 1; b < arms.length; b++) {
      const [u, v] = [sub(arms[a]!.turn, centre), sub(arms[b]!.turn, centre)];
      const c = dot(u, v) / (Math.hypot(...u) * Math.hypot(...v));
      if (c < best - 1e-9) [best, x, y] = [c, a, b];
    }
  const [first, second] = [arms[x]!, arms[y]!];
  let d: string;
  if (arms.length === 2) {
    // rounded at the middle, inside the dents' polygon
    const r =
      0.5 *
      Math.min(
        room,
        Math.hypot(...sub(first.turn, centre)),
        Math.hypot(...sub(second.turn, centre)),
      );
    const [p, q] = [along(centre, first.turn, r), along(centre, second.turn, r)];
    d = `${arm(first, p)}Q${pt(map(centre))} ${pt(map(q))}${out(second, q)}`;
  } else d = `${arm(first, centre)}${out(second, centre)}`;
  arms.forEach((a, k) => {
    if (k !== x && k !== y) d += arm(a, centre);
  });
  return d;
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

/** The angle girih strapwork leaves each edge at. */
const CONTACT = (54 * Math.PI) / 180;

/** `run` as a path, through `map`. */
const polyline = (run: readonly XY[], map: (p: XY) => XY): string =>
  run.map((p, i) => `${i ? "L" : "M"}${pt(map(p))}`).join("");

/** Whether `p` is inside the polygon `xy` (floats: a drawing). */
function inside(xy: readonly XY[], p: XY): boolean {
  let wind = false;
  xy.forEach((a, i) => {
    const b = xy[(i + 1) % xy.length]!;
    if (
      a[1] > p[1] !== b[1] > p[1] &&
      p[0] < a[0] + ((p[1] - a[1]) * (b[0] - a[0])) / (b[1] - a[1])
    )
      wind = !wind;
  });
  return wind;
}

/**
 * A girih tile's strapwork, by Hankin's method: from the middle of each
 * edge of `xy` (counter-clockwise) two rays into the tile at `CONTACT` to the
 * edge, one toward each end; rays paired where they meet inside the tile,
 * the nearest meetings first, each ray once — two rays along one line from
 * neighbouring edges (round a 72° corner) meet as one straight run. Each
 * run is a polyline from one edge's middle to another's, through the point
 * its two rays meet. Floats: a drawing, nothing is keyed by it.
 */
export function strapwork(xy: readonly XY[]): XY[][] {
  const m = xy.length;
  const rays: { from: XY; dir: XY }[] = [];
  xy.forEach((a, i) => {
    const b = xy[(i + 1) % m]!;
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const u: XY = [(b[0] - a[0]) / len, (b[1] - a[1]) / len];
    const n: XY = [-u[1], u[0]];
    const from: XY = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
    const [c, s] = [Math.cos(CONTACT), Math.sin(CONTACT)];
    rays.push({ from, dir: [c * u[0] + s * n[0], c * u[1] + s * n[1]] });
    rays.push({ from, dir: [-c * u[0] + s * n[0], -c * u[1] + s * n[1]] });
  });
  const scale = Math.max(...xy.map((p) => Math.hypot(...sub(p, xy[0]!))), 1);
  const eps = 1e-9 * scale;
  const meetings: { r: number; s: number; cost: number; at: XY | null }[] = [];
  rays.forEach((r, i) =>
    rays.forEach((q, j) => {
      if (j <= i || r.from === q.from) return;
      const d = sub(q.from, r.from);
      const det = cross(r.dir, q.dir);
      if (Math.abs(det) < 1e-9) {
        // one line, the two rays facing each other: one straight run
        if (Math.abs(cross(r.dir, d)) > eps || dot(r.dir, d) <= 0 || dot(q.dir, d) >= 0) return;
        meetings.push({ r: i, s: j, cost: Math.hypot(...d), at: null });
        return;
      }
      const t = cross(d, q.dir) / det;
      const u = cross(d, r.dir) / det;
      if (t <= eps || u <= eps) return;
      const at: XY = [r.from[0] + t * r.dir[0], r.from[1] + t * r.dir[1]];
      if (!inside(xy, at)) return;
      meetings.push({ r: i, s: j, cost: t + u, at });
    }),
  );
  meetings.sort((p, q) => p.cost - q.cost || p.r - q.r || p.s - q.s);
  const used = new Set<number>();
  const runs: XY[][] = [];
  for (const { r, s, at } of meetings) {
    if (used.has(r) || used.has(s)) continue;
    used.add(r);
    used.add(s);
    runs.push(at ? [rays[r]!.from, at, rays[s]!.from] : [rays[r]!.from, rays[s]!.from]);
  }
  return runs;
}

/** What a level's marks are sized by (`decorParts`): `disc`, the edge
 * length its half discs are, and `line`, the one its labels' lines are. */
export interface MarkUnit {
  disc?: number | undefined;
  line?: number | undefined;
  /** Every tile carries girih strapwork (`strapwork`). */
  strapwork?: boolean;
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
  if (level.girih || level.girihTiling) unit = { strapwork: true };
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
 * arc.
 *
 * With `edge` — the tile's colour classes, and its outline's width where the
 * stylesheet does not set it — the tile's outline is drawn again last, over
 * its marks (`tile-edge`): a line ends on its edge and a half disc sits on
 * it, so without it each would paint over half the tile's border, and only
 * on the side drawn last. Over them, every border is whole, and two tiles'
 * marks meet under it as one. */
export function decorParts(
  loops: readonly Loop[],
  map: (p: XY) => XY = (p) => p,
  sizes?: MarkUnit,
  edge?: { class: string; width?: number },
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
  if (sizes?.strapwork)
    for (const { xy } of loops)
      add(
        "decor strapwork",
        strapwork(xy)
          .map((run) => polyline(run, map))
          .join(""),
      );
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
      const between = (p: Mark, q: Mark): Curve => {
        const h = 0.45 * gap(p, q);
        const c1: XY = [p.at[0] + p.n[0] * h, p.at[1] + p.n[1] * h];
        const c2: XY = [q.at[0] + q.n[0] * h, q.at[1] + q.n[1] * h];
        return cubic(p.at, c1, c2, q.at, map);
      };
      // three: one line between two, the third branching off it
      const hub = (three: Mark[]): string =>
        branched(three, (a, b) => between(three[a]!, three[b]!), map);
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
            d += between(run[r]!, run[r + 1]!).d;
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
    // the line between lined edges i and j, leaving each middle square on
    const lineBetween = (i: number, j: number): Curve => {
      const [p, q] = [mid(i), mid(j)];
      const centre = meet(xy, i, j);
      const gap = Math.hypot(...sub(q, p));
      // two parallel edges facing each other: straight across
      if (centre === "parallel" && squareOn(i, q))
        return { d: `M${pt(map(p))}L${pt(map(q))}`, at: (t) => lerp(p, q, t) };
      // about the point the two edges' lines meet, where both middles are
      // as far from it: then the arc meets each edge square on — round the
      // corner two neighbouring edges share, or round a point past the
      // tile for two further apart (an octagon's or a dodecagon's)
      if (centre && centre !== "parallel") {
        const [u, v] = [sub(p, centre), sub(q, centre)];
        const r = Math.hypot(...u);
        const [from, turn] = [Math.atan2(u[1], u[0]), Math.atan2(cross(u, v), dot(u, v))];
        return {
          d: `M${pt(map(p))}${arcTo(map(centre), map(p), map(q))}`,
          at: (t) => [
            centre[0] + r * Math.cos(from + turn * t),
            centre[1] + r * Math.sin(from + turn * t),
          ],
        };
      }
      // an irregular tile's (a Laves tile's kite, rhombus or pentagon): a
      // curve leaving each middle along the edge's inward normal, so it
      // still meets each edge square on and runs on into the tile across —
      // round the corner two neighbouring edges share as an arc round it
      // would, each arm as long as a circle's through that middle (4/3 ·
      // tan(φ/4) of its distance from the corner, φ the turn); between two
      // edges further apart, a share of the gap
      const corner = j === (i + 1) % m ? j : i === (j + 1) % m ? i : null;
      let [hi, hj] = [gap * 0.4, gap * 0.4];
      if (corner !== null) {
        const c = xy[corner]!;
        const [ni, nj] = [inward(i), inward(j)];
        const turn = Math.acos(Math.max(-1, Math.min(1, dot(ni, nj))));
        const kappa = (4 / 3) * Math.tan((Math.PI - turn) / 4);
        hi = kappa * Math.hypot(...sub(p, c));
        hj = kappa * Math.hypot(...sub(q, c));
      }
      // (between two edges further apart, the loosest of these: another
      // line's to branch off, where there is one)
      return { ...cubic(p, off(i, hi), off(j, hj), q, map), weight: corner === null ? 1.5 : 1 };
    };
    // a star's lines run through its middle (`starLines`), but for two round
    // one point, which go round it as on any tile
    const star = lined.length >= 2 ? starHub(xy) : null;
    const tip = (i: number): number | null => star?.tips[i] ?? null;
    const roundOnePoint =
      lined.length === 2 && tip(lined[0]!) !== null && tip(lined[0]!) === tip(lined[1]!);
    if (star && !roundOnePoint) lines.push(starLines(xy, star, lined, map));
    // (never one: a line that would end here is cut back to a half disc)
    else if (lined.length === 2) lines.push(lineBetween(lined[0]!, lined[1]!).d);
    // more: one line between two of them, the others branching off it
    else if (lined.length > 2)
      lines.push(
        branched(
          lined.map((i) => ({ at: mid(i), n: inward(i) })),
          (a, b) => lineBetween(lined[a]!, lined[b]!),
          map,
        ),
      );
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
  if (edge && out.length) {
    const d = loopsPath(loops, map);
    const cls = `decor tile-edge ${edge.class}`;
    out.push(edge.width === undefined ? { d, class: cls } : { d, class: cls, width: edge.width });
  }
  return out;
}
