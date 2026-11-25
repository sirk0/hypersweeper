// A level's tray tiles put together for a picture — a marking's card
// (`trayIcon`) and a tiling's card (`cardArt`): each tile laid with a whole
// edge along an edge of one already down, so they touch along a line, never
// only at a point, and use the picture's room rather than leave gaps.
//
// Two tiles join only as the board would let them: their two edges exactly
// the same length, the marks on them partners (`partner`: a colour's half
// disc against a tile of that colour, a line against a line, an arrow or a
// label pointing the same way, a knob in its socket), a round edge against
// the opposite bulge — and every other edge the new tile ends up sharing with
// one already down held to the same. A tile turns only by the level's rotate
// step and is mirrored only where the level flips; its tray pose is preferred.
// Tiles with no marks and no round edges may also lie a short edge along a
// longer one, at either end.
//
// Joins are found exactly, in the level's ring; only the overlap test, the
// ranking and the drawing read floats. A beam search keeps the arrangements
// that fill the square round them best. Where not every tile can be joined —
// no partner edge, or no room for it — the tiles are split into as few joined
// groups as it finds, each drawn apart.

import { orient, sameDirection, strictlyBetween, type Cyc } from "../geometry/cyclotomic";
import { NONE, partner } from "../geometry/marks";
import {
  loopEdges,
  posed,
  signedArea,
  spotKey,
  type Bulge,
  type Piece,
  type XY,
} from "../geometry/shape";
import type { Level } from "../levels";
import { alongEdge, jigsawPoints, loopsOf, loopsReach, type Loop } from "./curve";

/** A tray tile as a picture lays it: its kind and its pieces, exact, posed
 * and moved into its group (board units, y up). */
export interface LaidTile {
  kind: number;
  pieces: Piece[];
  /** Whether it is held as the tray holds it (no turn, no mirror). */
  asTray: boolean;
}

/** The tiles in joined groups: one group where every tile could be joined. */
export type TrayGroups = LaidTile[][];

interface Edge {
  a: Cyc;
  b: Cyc;
  /** a and b as drawn. */
  fa: XY;
  fb: XY;
  mark: number;
  curve: Bulge;
  /** Points along it as drawn, its ends left out, where it is not straight
   * (a round or a jigsaw edge): what the overlap test checks it by. */
  bend: XY[] | null;
  /** Its straight segment's box, as drawn. */
  box: Box;
  /** The box of all of it as drawn, its bend too. */
  reach: Box;
}

interface PosedKind {
  kind: number;
  /** Index among the kind's poses: 0 is the tray's own. */
  pose: number;
  pieces: Piece[];
  area: number;
  /** As drawn at the origin, to be moved where it is tried. */
  down: Down;
  /** Its edges (`down.drawn.edges`) by the vector each runs along, keyed
   * exactly. */
  byVec: Map<string, number[]>;
}

/** A posed tile at the origin, as drawn: its pieces' outlines and edges. */
interface Drawn {
  /** Each piece's straight outline. */
  polys: XY[][];
  edges: Edge[];
  box: Box;
}

/** A tile down in a group: its posed shape as drawn at the origin, and
 * where it was moved to — exactly (`t`) and as drawn (`off`). */
interface Down {
  tile: LaidTile;
  /** Which of its kind's poses. */
  pose: number;
  drawn: Drawn;
  t: Cyc;
  off: XY;
  box: Box;
}

interface Box {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

interface State {
  down: Down[];
  left: number[];
  area: number;
  score: number;
  /** What tells two states apart, the same however they were reached. */
  key: string;
}

const BEAM = 10;

const MEMO = new WeakMap<Level, TrayGroups>();

/** The level's tray tiles in as few joined groups as the search finds. */
export function trayGroups(level: Level): TrayGroups {
  let out = MEMO.get(level);
  if (!out) {
    out = layOut(level);
    MEMO.set(level, out);
  }
  return out;
}

function layOut(level: Level): TrayGroups {
  const { ring } = level;
  const poses = level.tiles.map((shape, kind) => {
    const turns =
      level.turn > 0
        ? Array.from({ length: Math.ceil(ring.n / level.turn) }, (_, i) => i * level.turn)
        : [0];
    const flips = level.mirror ? [false, true] : [false];
    const seen = new Set<string>();
    const out: PosedKind[] = [];
    for (const flip of flips)
      for (const rot of turns) {
        const pieces = posed(shape, { rot, flip, t: ring.zero });
        const key = spotKey(ring, pieces);
        if (seen.has(key)) continue;
        seen.add(key);
        const tile = { kind, pieces, asTray: out.length === 0 };
        out.push({
          kind,
          pose: out.length,
          pieces,
          area: areaOf(ring, pieces),
          down: downAt(level, tile, drawnOf(level, pieces), ring.zero, out.length),
          byVec: new Map(),
        });
      }
    for (const p of out)
      p.down.drawn.edges.forEach((e, i) => {
        const key = ring.key(ring.sub(e.b, e.a));
        p.byVec.set(key, [...(p.byVec.get(key) ?? []), i]);
      });
    return out;
  });
  const plain = level.tiles.every((s) =>
    s.pieces.every(
      (p) => !(p.marks ?? []).some((m) => m !== NONE) && !(p.curve ?? []).some((c) => c !== 0),
    ),
  );
  const scale = typicalEdge(level);
  const groups: TrayGroups = [];
  let left = level.tiles.map((_, k) => k);
  while (left.length) {
    const group = bestGroup(level, poses, left, plain, scale);
    groups.push(group.map((d) => d.tile));
    const used = new Set(group.map((d) => d.tile.kind));
    left = left.filter((k) => !used.has(k));
  }
  return groups;
}

/** The largest group of `kinds` the beam joins, filling its square best. */
function bestGroup(
  level: Level,
  poses: PosedKind[][],
  kinds: number[],
  plain: boolean,
  scale: number,
): Down[] {
  let beam: State[] = kinds.map((kind) => {
    const p = poses[kind]![0]!;
    const down = [p.down];
    return {
      down,
      left: kinds.filter((k) => k !== kind),
      area: p.area,
      score: scoreOf(down, p.area, 0),
      key: keyOf(level, down),
    };
  });
  let best = beam;
  while (beam[0]!.left.length) {
    const next: State[] = [];
    const seen = new Set<string>();
    for (const state of beam)
      for (const tile of joins(level, poses, state, plain, scale)) {
        const down = [...state.down, tile];
        const key = keyOf(level, down);
        if (seen.has(key)) continue;
        seen.add(key);
        const area = state.area + poses[tile.tile.kind]![0]!.area;
        const turned = down.filter((d) => !d.tile.asTray).length;
        next.push({
          down,
          left: state.left.filter((k) => k !== tile.tile.kind),
          area,
          score: scoreOf(down, area, turned),
          key,
        });
      }
    if (!next.length) break;
    // best first; within a float's error of each other, the one found first
    // — the order the search makes, which is exact — so no float breaks a tie
    const order = next.map((s, i) => ({ s, i }));
    order.sort((p, q) =>
      Math.abs(p.s.score - q.s.score) > 1e-9 ? q.s.score - p.s.score : p.i - q.i,
    );
    beam = [];
    for (const { s } of order) {
      if (beam.length === BEAM) break;
      if (bendsClear(s.down.at(-1)!, s.down.slice(0, -1), scale)) beam.push(s);
    }
    if (!beam.length) break;
    best = beam;
  }
  return best[0]!.down;
}

/** How well a group uses the square round it: its tiles' area over the
 * square's, less a little for each tile not held as the tray holds it. */
function scoreOf(down: Down[], area: number, turned: number): number {
  const box = unionBox(down.map((d) => d.box));
  const side = Math.max(box.x1 - box.x0, box.y1 - box.y0);
  return area / (side * side) - 0.02 * turned;
}

/** Every way to lay one more of `state.left` joined to the group. */
function joins(
  level: Level,
  poses: PosedKind[][],
  state: State,
  plain: boolean,
  scale: number,
): Down[] {
  const { ring } = level;
  const out: Down[] = [];
  const seen = new Set<string>();
  const tryAt = (p: PosedKind, t: Cyc): void => {
    // poses of a kind are distinct, so its pose and move name the spot
    const key = `${p.kind}:${p.pose}:${ring.key(t)}`;
    if (seen.has(key)) return;
    seen.add(key);
    const tile = downAt(
      level,
      { kind: p.kind, pieces: p.pieces, asTray: p.pose === 0 },
      p.down.drawn,
      t,
      p.pose,
    );
    if (!state.down.every((d) => fitsBeside(level, tile, d, plain, scale))) return;
    tile.tile.pieces = p.pieces.map((q) => ({ ...q, verts: q.verts.map((v) => ring.add(v, t)) }));
    out.push(tile);
  };
  for (const d of state.down)
    for (const de of d.drawn.edges) {
      const e = { ...de, a: ring.add(de.a, d.t), b: ring.add(de.b, d.t) };
      // the new tile's edge runs b → a along it
      const want = ring.sub(e.a, e.b);
      const wantKey = ring.key(want);
      for (const kind of state.left)
        for (const p of poses[kind]!) {
          const { edges } = p.down.drawn;
          for (const i of p.byVec.get(wantKey) ?? []) {
            const f = edges[i]!;
            if (f.curve !== -e.curve || f.mark !== partner(e.mark)) continue;
            tryAt(p, ring.sub(e.b, f.a));
          }
          // a short edge along a longer one, or a long one along a short
          // one, flush with either end
          if (plain)
            for (const f of edges) {
              const vec = ring.sub(f.b, f.a);
              if (ring.eq(vec, want) || !sameDirection(ring, vec, want)) continue;
              tryAt(p, ring.sub(e.b, f.a));
              tryAt(p, ring.sub(e.a, f.b));
            }
        }
    }
  return out;
}

/** Whether `tile` lies beside `other`, overlapping nothing, every edge they
 * share whole a partner pair — and, unless both are plain, no edge of one
 * lying part-way along an edge of the other. */
function fitsBeside(level: Level, tile: Down, other: Down, plain: boolean, scale: number): boolean {
  const { ring } = level;
  const eps = 1e-7 * scale;
  if (!boxesMeet(tile.box, other.box, eps)) return true;
  // `tile` read in `other`'s frame, as drawn
  const dx = tile.off[0] - other.off[0];
  const dy = tile.off[1] - other.off[1];
  const f0: XY = [0, 0];
  const f1: XY = [0, 0];
  // the edges that lie along each other, exactly
  for (const fe of tile.drawn.edges) {
    f0[0] = fe.fa[0] + dx;
    f0[1] = fe.fa[1] + dy;
    f1[0] = fe.fb[0] + dx;
    f1[1] = fe.fb[1] + dy;
    for (const ge of other.drawn.edges) {
      if (!shiftedMeet(fe.box, dx, dy, ge.box, eps)) continue;
      if (segmentGap(f0, f1, ge.fa, ge.fb) > eps) continue;
      const fa = ring.add(fe.a, tile.t);
      const fb = ring.add(fe.b, tile.t);
      const ga = ring.add(ge.a, other.t);
      const gb = ring.add(ge.b, other.t);
      if (ring.eq(fa, gb) && ring.eq(fb, ga)) {
        if (fe.curve !== -ge.curve || fe.mark !== partner(ge.mark)) return false;
        continue;
      }
      if (plain) continue;
      const collinear = orient(ring, ga, gb, fa) === 0 && orient(ring, ga, gb, fb) === 0;
      if (!collinear) continue;
      const along =
        strictlyBetween(ring, ga, gb, fa) ||
        strictlyBetween(ring, ga, gb, fb) ||
        strictlyBetween(ring, fa, fb, ga) ||
        strictlyBetween(ring, fa, fb, gb) ||
        (ring.eq(fa, ga) && ring.eq(fb, gb));
      if (along) return false;
    }
  }
  return (
    !overlaps(tile.drawn, other.drawn, dx, dy, eps) &&
    !overlaps(other.drawn, tile.drawn, -dx, -dy, eps)
  );
}

/** Whether any of `a`, moved by `[dx, dy]`, lies inside `b`, read in
 * floats: an edge of one crossing one of the other, or a point of one well
 * inside the other. */
function overlaps(a: Drawn, b: Drawn, dx: number, dy: number, eps: number): boolean {
  const mv = ([x, y]: XY): XY => [x + dx, y + dy];
  for (const f of a.edges) {
    const fa = mv(f.fa);
    const fb = mv(f.fb);
    for (const g of b.edges)
      if (shiftedMeet(f.box, dx, dy, g.box, eps) && properlyCross(fa, fb, g.fa, g.fb, eps))
        return true;
  }
  const deep = (pt: XY): boolean =>
    inBox(b.box, pt, eps) &&
    b.polys.some((poly) => insidePoly(poly, pt) && boundaryGap(poly, pt) > eps);
  for (const poly of a.polys) {
    const m = poly.length;
    for (let i = 0; i < m; i++) {
      const p = mv(poly[i]!);
      const q = mv(poly[(i + 1) % m]!);
      for (const t of [0, 0.25, 0.5, 0.75])
        if (deep([p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t])) return true;
    }
    if (deep(mv(innerPoint(poly)))) return true;
  }
  return false;
}

/** Whether no round or jigsaw edge of `tile` or of the tiles in `others`
 * bulges into another, but where two share it: it would cross the other's
 * outline as drawn. Asked only of the arrangements the beam would keep — it
 * is the slow part, and rarely says no. */
function bendsClear(tile: Down, others: readonly Down[], scale: number): boolean {
  const eps = 1e-7 * scale;
  for (const other of others) {
    if (!boxesMeet(tile.box, other.box, eps)) continue;
    const dx = tile.off[0] - other.off[0];
    const dy = tile.off[1] - other.off[1];
    if (bendsCross(tile.drawn, other.drawn, dx, dy, eps)) return false;
    if (bendsCross(other.drawn, tile.drawn, -dx, -dy, eps)) return false;
  }
  return true;
}

function bendsCross(a: Drawn, b: Drawn, dx: number, dy: number, eps: number): boolean {
  const mv = ([x, y]: XY): XY => [x + dx, y + dy];
  // a round or jigsaw edge bulging into the other, but where it is shared:
  // it would cross the other's outline as drawn
  for (const e of a.edges) {
    if (!e.bend) continue;
    const ea = mv(e.fa);
    const eb = mv(e.fb);
    if (b.edges.some((g) => near(g.fa, eb, eps) && near(g.fb, ea, eps))) continue;
    const line = [ea, ...e.bend.map(mv), eb];
    for (const g of b.edges) {
      if (!shiftedMeet(e.reach, dx, dy, g.reach, eps)) continue;
      const other = [g.fa, ...(g.bend ?? []), g.fb];
      for (let i = 1; i < line.length; i++)
        for (let j = 1; j < other.length; j++)
          if (properlyCross(line[i - 1]!, line[i]!, other[j - 1]!, other[j]!, eps)) return true;
    }
  }
  return false;
}

const near = (p: XY, q: XY, eps: number): boolean => Math.hypot(p[0] - q[0], p[1] - q[1]) <= eps;

/** A point just inside a counter-clockwise polygon: its longest edge's
 * middle, nudged in. */
function innerPoint(poly: XY[]): XY {
  let best: [XY, XY] = [poly[0]!, poly[1]!];
  let len = -1;
  for (const [p, q] of loopEdges(poly)) {
    const l = Math.hypot(q[0] - p[0], q[1] - p[1]);
    if (l > len) {
      len = l;
      best = [p, q];
    }
  }
  const [p, q] = best;
  const k = 1e-3;
  // the inner side of a counter-clockwise edge is its left
  return [(p[0] + q[0]) / 2 - (q[1] - p[1]) * k, (p[1] + q[1]) / 2 + (q[0] - p[0]) * k];
}

function insidePoly(poly: readonly XY[], [px, py]: XY): boolean {
  let odd = false;
  const m = poly.length;
  for (let i = 0, j = m - 1; i < m; j = i++) {
    const [ax, ay] = poly[j]!;
    const [bx, by] = poly[i]!;
    if (ay > py !== by > py && px < ax + ((py - ay) * (bx - ax)) / (by - ay)) odd = !odd;
  }
  return odd;
}

function boundaryGap(poly: readonly XY[], p: XY): number {
  let gap = Infinity;
  const m = poly.length;
  for (let i = 0, j = m - 1; i < m; j = i++)
    gap = Math.min(gap, pointToSegment(p, poly[j]!, poly[i]!));
  return gap;
}

const cross = (o: XY, a: XY, b: XY): number =>
  (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);

/** Whether segments ab and cd cross at a point inside both, each end
 * clearly off the other's line. */
function properlyCross(a: XY, b: XY, c: XY, d: XY, eps: number): boolean {
  const lab = Math.hypot(b[0] - a[0], b[1] - a[1]);
  const lcd = Math.hypot(d[0] - c[0], d[1] - c[1]);
  const d1 = cross(c, d, a) / lcd;
  const d2 = cross(c, d, b) / lcd;
  const d3 = cross(a, b, c) / lab;
  const d4 = cross(a, b, d) / lab;
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
  if (properlyCross(a, b, c, d, 0)) return 0;
  return Math.min(
    pointToSegment(a, c, d),
    pointToSegment(b, c, d),
    pointToSegment(c, a, b),
    pointToSegment(d, a, b),
  );
}

function drawnOf(level: Level, pieces: readonly Piece[]): Drawn {
  const { ring } = level;
  const polys: XY[][] = [];
  const edges: Edge[] = [];
  for (const p of pieces) {
    const xy = p.verts.map((v) => ring.toXY(v));
    polys.push(xy);
    xy.forEach((fa, i) => {
      const j = (i + 1) % xy.length;
      const fb = xy[j]!;
      const mark = p.marks?.[i] ?? NONE;
      const curve = p.curve?.[i] ?? 0;
      let bend: XY[] | null = jigsawPoints(fa, fb, mark)?.slice(0, -1) ?? null;
      if (!bend && curve)
        bend = Array.from({ length: 7 }, (_, k) => alongEdge(fa, fb, curve, (k + 1) / 8).at);
      const box = boxOf([fa, fb]);
      const reach = boxOf([fa, fb, ...(bend ?? [])]);
      edges.push({ a: p.verts[i]!, b: p.verts[j]!, fa, fb, mark, curve, bend, box, reach });
    });
  }
  return { polys, edges, box: boxOf(loopsReach(loopsOf(ring, pieces))) };
}

/** `tile`, drawn as `drawn` is at the origin, moved there by `t`. */
function downAt(level: Level, tile: LaidTile, drawn: Drawn, t: Cyc, pose: number): Down {
  const [dx, dy] = level.ring.toXY(t);
  const { box } = drawn;
  return {
    tile,
    pose,
    drawn,
    t,
    off: [dx, dy],
    box: { x0: box.x0 + dx, y0: box.y0 + dy, x1: box.x1 + dx, y1: box.y1 + dy },
  };
}

function areaOf(ring: Level["ring"], pieces: readonly Piece[]): number {
  return pieces.reduce((s, p) => s + Math.abs(signedArea(p.verts.map((v) => ring.toXY(v)))), 0);
}

/** The tiles' middle edge length: what the float tolerances scale by. */
function typicalEdge(level: Level): number {
  const lens = level.tiles
    .flatMap((s) => s.pieces)
    .flatMap((p) => loopEdges(p.verts.map((v) => level.ring.toXY(v))))
    .map(([a, b]) => Math.hypot(b[0] - a[0], b[1] - a[1]))
    .sort((a, b) => a - b);
  return lens[Math.floor(lens.length / 2)] ?? 1;
}

/** A group's tiles, named exactly — each its pose and its move, less its
 * first kind's — the same group, however it was reached. */
function keyOf(level: Level, down: Down[]): string {
  const { ring } = level;
  const tiles = [...down].sort((p, q) => p.tile.kind - q.tile.kind);
  const origin = tiles[0]!.t;
  return tiles.map((d) => `${d.tile.kind}:${d.pose}:${ring.key(ring.sub(d.t, origin))}`).join("|");
}

function boxOf(points: readonly XY[]): Box {
  const xs = points.map(([x]) => x);
  const ys = points.map(([, y]) => y);
  return { x0: Math.min(...xs), y0: Math.min(...ys), x1: Math.max(...xs), y1: Math.max(...ys) };
}

function unionBox(boxes: readonly Box[]): Box {
  return {
    x0: Math.min(...boxes.map((b) => b.x0)),
    y0: Math.min(...boxes.map((b) => b.y0)),
    x1: Math.max(...boxes.map((b) => b.x1)),
    y1: Math.max(...boxes.map((b) => b.y1)),
  };
}

const inBox = (b: Box, [x, y]: XY, eps: number): boolean =>
  x >= b.x0 - eps && x <= b.x1 + eps && y >= b.y0 - eps && y <= b.y1 + eps;

/** Whether box `a` moved by `[dx, dy]` meets `b`. */
function shiftedMeet(a: Box, dx: number, dy: number, b: Box, eps: number): boolean {
  return (
    a.x0 + dx <= b.x1 + eps &&
    b.x0 <= a.x1 + dx + eps &&
    a.y0 + dy <= b.y1 + eps &&
    b.y0 <= a.y1 + dy + eps
  );
}

function boxesMeet(a: Box, b: Box, eps: number): boolean {
  return a.x0 <= b.x1 + eps && b.x0 <= a.x1 + eps && a.y0 <= b.y1 + eps && b.y0 <= a.y1 + eps;
}

/** One tile as a picture places it: its loops (board units, y up) and the
 * map into the picture (y down), `matrix(a b c d e f)`. */
export interface PlacedTile {
  kind: number;
  loops: Loop[];
  matrix: readonly [number, number, number, number, number, number];
}

/** The groups laid side by side in rows, each row on one bottom line and
 * the rows stacked, centred — as many rows as fill the square round them
 * best — a gap between groups: in board units, y down. A single group is
 * just itself. */
export function groupsPlaced(level: Level, groups: TrayGroups = trayGroups(level)): PlacedTile[] {
  const { ring } = level;
  const boxes = groups.map((g) => boxOf(g.flatMap((t) => loopsReach(loopsOf(ring, t.pieces)))));
  // y down: a group's box flipped
  const w = boxes.map((b) => b.x1 - b.x0);
  const h = boxes.map((b) => b.y1 - b.y0);
  const gap = groups.length > 1 ? 0.15 * Math.max(...w, ...h) : 0;
  const n = groups.length;
  let bestRows: number[][] = [groups.map((_, i) => i)];
  let bestFill = -1;
  for (let perRow = n; perRow >= 1; perRow--) {
    const rows: number[][] = [];
    for (let i = 0; i < n; i += perRow)
      rows.push(Array.from({ length: Math.min(perRow, n - i) }, (_, j) => i + j));
    const width = Math.max(
      ...rows.map((r) => r.reduce((s, k) => s + w[k]!, 0) + gap * (r.length - 1)),
    );
    const height =
      rows.reduce((s, r) => s + Math.max(...r.map((k) => h[k]!)), 0) + gap * (rows.length - 1);
    const fill = 1 / Math.max(width, height) ** 2;
    if (fill > bestFill * (1 + 1e-9)) {
      bestFill = fill;
      bestRows = rows;
    }
  }
  const widths = bestRows.map((r) => r.reduce((s, k) => s + w[k]!, 0) + gap * (r.length - 1));
  const widest = Math.max(...widths);
  const out: PlacedTile[] = [];
  let bottom = 0;
  bestRows.forEach((row, r) => {
    bottom += Math.max(...row.map((k) => h[k]!));
    let at = (widest - widths[r]!) / 2;
    for (const k of row) {
      const b = boxes[k]!;
      // flipped (y down), the group's lowest point on the row's bottom line
      for (const t of groups[k]!)
        out.push({
          kind: t.kind,
          loops: loopsOf(ring, t.pieces),
          matrix: [1, 0, 0, -1, at - b.x0, bottom + b.y0],
        });
      at += w[k]! + gap;
    }
    bottom += gap;
  });
  return out.sort((p, q) => p.kind - q.kind);
}
