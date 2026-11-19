// A patch of a tiling carried on past its edge: the outlines the board draws
// round a finished level, to show that it was one window onto a tiling that
// goes on (`SvgBoard.showBeyond`; which levels get what is src/extension.ts).
//
// Two ways to find it, and a patch that neither fits has none:
//
// - **A periodic tiling** is found from the patch alone: its translations are
//   measured off the drawing (`latticeOf`), the tiles are folded down to one
//   representative per translation class, and those are laid out again over
//   whatever region is asked for (`periodicExtension`). It never runs out.
// - **Anything else** (the aperiodic patches, the spirals, the rep-tiles) is
//   handed bigger patches of the same tiling, and the level is located inside
//   one by a similarity (`placeIn`): a translation, and for a rep-tile whose
//   inflation turns or mirrors, a rotation, reflection and scale too
//   (`grownExtension`). It reaches as far as that patch does (`reach`).
//
// A board here is a list of tiles, each its polygon's points in order, and
// `mid`, the point the view is measured from. This is the one place in the
// game that compares points in floats, and it may: everything here is
// render-only — no tile is placed, keyed or matched by it, and the rule that
// identity is exact (AGENTS.md) is about those. The floats are the drawing's.

import type { Vertex } from "@tiling/geometry";

export interface TilingExtension {
  /** How far from the board's `mid`, in its own units, the tiling is known in
   * every direction. Infinity for a periodic tiling. */
  readonly reach: number;
  /** The tiling's typical tile size: the median distance from a tile's centre
   * to its furthest corner, in the board's units. */
  readonly tile: number;
  /** The corners of every tile of the tiling beyond the board whose centre lies
   * within `radius` of the board's `mid`, in the board's own coordinates. */
  cells(radius: number): Vertex[][];
}

/** A tile reduced to what a match needs: its corners, their mean, and a
 * translation-invariant key. */
interface Tile {
  corners: Vertex[];
  c: Vertex;
  key: string;
  /** distance from the centre to the furthest corner */
  r: number;
}

/** The polygon's corners: the points where it actually turns. A tiling that is
 * not edge to edge carries T-vertices on its sides, and a tile at the board's
 * edge lacks the ones its missing neighbours would have put there, so a match
 * on the full point list would tell two copies of the same tile apart. */
function cornersOf(poly: readonly Vertex[]): Vertex[] {
  const n = poly.length;
  const out: Vertex[] = [];
  for (let i = 0; i < n; i++) {
    const a = poly[(i + n - 1) % n]!;
    const b = poly[i]!;
    const c = poly[(i + 1) % n]!;
    const ux = b[0] - a[0];
    const uy = b[1] - a[1];
    const vx = c[0] - b[0];
    const vy = c[1] - b[1];
    const cross = ux * vy - uy * vx;
    const len = Math.hypot(ux, uy) * Math.hypot(vx, vy);
    // a turn of more than ~0.06° (the ~1e-6 rad T-vertices read as straight)
    if (len === 0 || Math.abs(cross) > 1e-3 * len || ux * vx + uy * vy < 0) out.push(b);
  }
  return out.length >= 3 ? out : [...poly];
}

/** The typical tile size of a board: the median distance from a tile's centre
 * to its corners. Every tolerance below is a fraction of it. */
function tileSize(tiles: readonly Tile[]): number {
  const rs = tiles.map((t) => t.r).sort((a, b) => a - b);
  return rs[rs.length >> 1] ?? 1;
}

function tilesOf(cells: readonly (readonly Vertex[])[], quantum?: number): Tile[] {
  const raw = cells.map((poly) => {
    const corners = cornersOf(poly);
    let x = 0;
    let y = 0;
    for (const p of corners) {
      x += p[0];
      y += p[1];
    }
    const c: Vertex = [x / corners.length, y / corners.length];
    let r = 0;
    for (const p of corners) r = Math.max(r, Math.hypot(p[0] - c[0], p[1] - c[1]));
    return { corners, c, r, key: "" };
  });
  const q = quantum ?? tileSize(raw) * 1e-3;
  for (const t of raw) {
    t.key = t.corners
      .map((p) => `${Math.round((p[0] - t.c[0]) / q)},${Math.round((p[1] - t.c[1]) / q)}`)
      .sort()
      .join(";");
  }
  return raw;
}

/** Points of the plane looked up to a tolerance: a grid of buckets `tol` wide,
 * a lookup searching the 3 x 3 around it. */
class PointIndex<T> {
  private readonly buckets = new Map<string, { p: Vertex; v: T }[]>();
  constructor(private readonly tol: number) {}
  private key(i: number, j: number): string {
    return `${i},${j}`;
  }
  add(p: Vertex, v: T): void {
    const k = this.key(Math.round(p[0] / this.tol), Math.round(p[1] / this.tol));
    let b = this.buckets.get(k);
    if (!b) this.buckets.set(k, (b = []));
    b.push({ p, v });
  }
  find(p: Vertex): T | undefined {
    const i = Math.round(p[0] / this.tol);
    const j = Math.round(p[1] / this.tol);
    for (let di = -1; di <= 1; di++) {
      for (let dj = -1; dj <= 1; dj++) {
        for (const e of this.buckets.get(this.key(i + di, j + dj)) ?? []) {
          if (Math.abs(e.p[0] - p[0]) <= this.tol && Math.abs(e.p[1] - p[1]) <= this.tol) {
            return e.v;
          }
        }
      }
    }
    return undefined;
  }
}

/** Which tile, if any, covers a point: tiles bucketed by their bounding boxes. */
class TileCover {
  private readonly buckets = new Map<string, Tile[]>();
  constructor(
    tiles: readonly Tile[],
    private readonly size: number,
  ) {
    for (const t of tiles) {
      const [x0, y0, x1, y1] = bounds(t.corners);
      for (let i = Math.floor(x0 / size); i <= Math.floor(x1 / size); i++) {
        for (let j = Math.floor(y0 / size); j <= Math.floor(y1 / size); j++) {
          const k = `${i},${j}`;
          let b = this.buckets.get(k);
          if (!b) this.buckets.set(k, (b = []));
          b.push(t);
        }
      }
    }
  }
  at(p: Vertex): Tile | undefined {
    const k = `${Math.floor(p[0] / this.size)},${Math.floor(p[1] / this.size)}`;
    return this.buckets.get(k)?.find((t) => inside(t.corners, p));
  }
}

function bounds(pts: readonly Vertex[]): [number, number, number, number] {
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const [x, y] of pts) {
    x0 = Math.min(x0, x);
    y0 = Math.min(y0, y);
    x1 = Math.max(x1, x);
    y1 = Math.max(y1, y);
  }
  return [x0, y0, x1, y1];
}

function inside(poly: readonly Vertex[], [x, y]: Vertex): boolean {
  let hit = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i]!;
    const [xj, yj] = poly[j]!;
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) hit = !hit;
  }
  return hit;
}

function area(poly: readonly Vertex[]): number {
  let s = 0;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    s += poly[j]![0] * poly[i]![1] - poly[i]![0] * poly[j]![1];
  }
  return Math.abs(s) / 2;
}

// -- periodic tilings ---------------------------------------------------------

/** Whether translating the whole board by `t` maps it into the tiling it was
 * cut from: every tile lands either on a tile of the same shape or off the
 * board altogether — never on a different tile. */
function isPeriod(
  tiles: readonly Tile[],
  at: PointIndex<Tile>,
  cover: TileCover,
  t: Vertex,
): boolean {
  let hits = 0;
  for (const tile of tiles) {
    const p: Vertex = [tile.c[0] + t[0], tile.c[1] + t[1]];
    const there = at.find(p);
    if (there) {
      if (there.key !== tile.key) return false;
      hits++;
    } else if (cover.at(p)) {
      return false;
    }
  }
  return hits > 0;
}

/** Two translations generating the board's lattice of periods, shortest first,
 * or null if it has no two independent ones it can show. */
export function latticeOf(
  cells: readonly (readonly Vertex[])[],
  mid: Vertex,
): [Vertex, Vertex] | null {
  const tiles = tilesOf(cells);
  if (tiles.length < 2) return null;
  const size = tileSize(tiles);
  const tol = size * 1e-3;
  const at = new PointIndex<Tile>(tol);
  for (const t of tiles) at.add(t.c, t);
  const cover = new TileCover(tiles, size * 2);
  // Every period carries some tile onto another of the same shape, so the
  // candidates are the offsets from one tile to its twins: from the tile
  // nearest the middle of the commonest shape, which has twins every way.
  const classes = new Map<string, Tile[]>();
  for (const t of tiles) {
    let c = classes.get(t.key);
    if (!c) classes.set(t.key, (c = []));
    c.push(t);
  }
  const common = [...classes.values()].sort((a, b) => b.length - a.length)[0]!;
  const [mx, my] = mid;
  const ref = common.reduce((best, t) =>
    Math.hypot(t.c[0] - mx, t.c[1] - my) < Math.hypot(best.c[0] - mx, best.c[1] - my) ? t : best,
  );
  const offsets = common
    .filter((t) => t !== ref)
    .map((t): Vertex => [t.c[0] - ref.c[0], t.c[1] - ref.c[1]])
    .sort((a, b) => Math.hypot(...a) - Math.hypot(...b));
  let first: Vertex | null = null;
  for (const t of offsets) {
    if (first) {
      const cross = first[0] * t[1] - first[1] * t[0];
      if (Math.abs(cross) < tol * Math.hypot(...first)) continue;
    }
    if (!isPeriod(tiles, at, cover, t)) continue;
    if (!first) first = t;
    else return [first, t];
  }
  return null;
}

/** A periodic board's tiling, from one copy of each translation class of its
 * tiles — or null if the board has no lattice, or holds too little of it to
 * cover the plane. A board too small to show its whole period may be handed a
 * wider patch of the same tiling round it, in the same coordinates
 * (`context`), to measure the lattice and the classes off; the board's own
 * tiles are still the ones left out. */
export function periodicExtension(
  cells: readonly (readonly Vertex[])[],
  mid: Vertex,
  context?: readonly (readonly Vertex[])[],
): TilingExtension | null {
  const source = context ?? cells;
  const lattice = latticeOf(source, mid);
  if (!lattice) return null;
  const [a, b] = lattice;
  const det = a[0] * b[1] - a[1] * b[0];
  const tiles = tilesOf(source);
  const tol = tileSize(tiles) * 1e-3;
  // lattice coordinates of a point: p = u a + v b
  const coords = (p: Vertex): Vertex => [
    (p[0] * b[1] - p[1] * b[0]) / det,
    (a[0] * p[1] - a[1] * p[0]) / det,
  ];
  // One tile of each translation class: the class is the tile's shape and
  // where it sits in its period, compared to a tolerance (with the period's
  // wrap-around), since a board's far corners carry float error.
  const reps: Tile[] = [];
  const classOf = new Map<string, PointIndex<true>>();
  for (const t of tiles) {
    const [u, v] = coords(t.c);
    const fu = u - Math.floor(u);
    const fv = v - Math.floor(v);
    let at = classOf.get(t.key);
    if (!at) classOf.set(t.key, (at = new PointIndex<true>(1e-3)));
    let known = false;
    for (const du of [-1, 0, 1]) {
      for (const dv of [-1, 0, 1]) known ||= at.find([fu + du, fv + dv]) !== undefined;
    }
    if (known) continue;
    at.add([fu, fv], true);
    reps.push(t);
  }
  // Every class present, or the copies leave holes: the classes' areas must
  // add up to one period's.
  const covered = reps.reduce((s, t) => s + area(t.corners), 0);
  if (Math.abs(covered - Math.abs(det)) > 1e-3 * Math.abs(det)) return null;
  const own = new PointIndex<true>(tol);
  for (const t of context ? tilesOf(cells) : tiles) own.add(t.c, true);
  const span = Math.max(...reps.map((t) => t.r));
  return {
    reach: Infinity,
    tile: tileSize(tiles),
    cells(radius) {
      const out: Vertex[][] = [];
      const R = radius + span;
      // the lattice coordinates the circle can reach: |u| <= R |b| / |det|
      const du = Math.ceil((R * Math.hypot(...b)) / Math.abs(det)) + 1;
      const dv = Math.ceil((R * Math.hypot(...a)) / Math.abs(det)) + 1;
      for (const t of reps) {
        const [u0, v0] = coords([mid[0] - t.c[0], mid[1] - t.c[1]]);
        const iu = Math.round(u0);
        const iv = Math.round(v0);
        for (let i = iu - du; i <= iu + du; i++) {
          for (let j = iv - dv; j <= iv + dv; j++) {
            const ox = i * a[0] + j * b[0];
            const oy = i * a[1] + j * b[1];
            const c: Vertex = [t.c[0] + ox, t.c[1] + oy];
            if (Math.hypot(c[0] - mid[0], c[1] - mid[1]) > radius) continue;
            if (own.find(c)) continue;
            out.push(t.corners.map(([x, y]): Vertex => [x + ox, y + oy]));
          }
        }
      }
      return out;
    },
  };
}

// -- a bigger patch ------------------------------------------------------------

type Map2 = (p: Vertex) => Vertex;

/** The ways a tile's corners can be matched to another's: mirrored or not,
 * walking its corners forward or back. */
const WALKS: [mirror: boolean, step: number][] = [
  [false, 1],
  [false, -1],
  [true, 1],
  [true, -1],
];

/** Where the board sits in a bigger patch of its tiling: the similarity
 * carrying the board's pixel space into the patch's (`to`) and back (`from`),
 * or null if the patch does not hold a copy of the board. Of several copies (a
 * rep-tile's patch holds the smaller one in each of its corners), the one with
 * the most of the patch round it every way (`reachOf`), so the tiling runs on
 * as far as it can. */
export function placeIn(
  cells: readonly (readonly Vertex[])[],
  mid: Vertex,
  patch: readonly (readonly Vertex[])[],
): { to: Map2; from: Map2 } | null {
  const tiles = tilesOf(cells);
  const big = tilesOf(patch);
  const [mx, my] = mid;
  const ref = tiles.reduce((best, t) =>
    Math.hypot(t.c[0] - mx, t.c[1] - my) < Math.hypot(best.c[0] - mx, best.c[1] - my) ? t : best,
  );
  const bigSize = tileSize(big);
  const at = new PointIndex<Tile>(bigSize * 1e-3);
  for (const t of big) at.add(t.c, t);
  const n = ref.corners.length;
  // Every copy of the board in the patch, once each (found again from
  // another of its corners, it maps the board's middle to the same point).
  const copies: { to: Map2; from: Map2; centre: Vertex }[] = [];
  const seen = new PointIndex<true>(bigSize * 1e-3);
  const r = ref.corners;
  const tol = bigSize * 1e-3;
  for (const cand of big) {
    const u = cand.corners;
    if (u.length !== n) continue;
    // Every corner it could start at, walked either way (the two patches need
    // not wind the same way round), the map turning or mirroring.
    for (let s = 0; s < n; s++) {
      for (const [mirror, step] of WALKS) {
        const u0 = u[s]!;
        const u1 = u[(s + step + n) % n]!;
        const to = similarity(r[0]!, r[1]!, u0, u1, mirror);
        if (!to) continue;
        let ok = true;
        for (let i = 0; i < n && ok; i++) {
          const p = to(r[i]!);
          const q = u[(((s + step * i) % n) + n) % n]!;
          ok = Math.abs(p[0] - q[0]) <= tol && Math.abs(p[1] - q[1]) <= tol;
        }
        if (!ok) continue;
        const centre = to([mx, my]);
        const probe = to([mx + 1, my]);
        if (seen.find(centre) && seen.find(probe)) continue;
        if (!tiles.every((t) => at.find(to(t.c))?.corners.length === t.corners.length)) continue;
        seen.add(centre, true);
        seen.add(probe, true);
        copies.push({ to, from: similarity(u0, u1, r[0]!, r[1]!, mirror)!, centre });
      }
    }
  }
  if (copies.length === 0) return null;
  // Of those, the one with the most patch round it — measured on the few
  // nearest the patch's centre of mass (not its box's middle, which an
  // L-shaped patch does not even cover), and against a sample of the patch's
  // tiles, as measuring is a pass over them.
  const middle: Vertex = [
    big.reduce((sum, t) => sum + t.c[0], 0) / big.length,
    big.reduce((sum, t) => sum + t.c[1], 0) / big.length,
  ];
  const off = (c: Vertex) => Math.hypot(c[0] - middle[0], c[1] - middle[1]);
  copies.sort((a, b) => off(a.centre) - off(b.centre));
  const stride = Math.max(1, Math.floor(big.length / 3000));
  const centres = big.filter((_, i) => i % stride === 0).map((t) => ({ c: t.c, d: 0 }));
  let best: { to: Map2; from: Map2; reach: number } | null = null;
  for (const copy of copies.slice(0, 64)) {
    for (const e of centres) e.d = Math.hypot(e.c[0] - copy.centre[0], e.c[1] - copy.centre[1]);
    const reach = reachOf(centres, copy.centre);
    if (!best || reach > best.reach) best = { ...copy, reach };
  }
  return best && { to: best.to, from: best.from };
}

/** The similarity carrying p0 to q0 and p1 to q1, mirrored or not. */
function similarity(p0: Vertex, p1: Vertex, q0: Vertex, q1: Vertex, mirror: boolean): Map2 | null {
  // z -> A z' + B, z' = z or its conjugate
  const px = p1[0] - p0[0];
  const py = mirror ? -(p1[1] - p0[1]) : p1[1] - p0[1];
  const qx = q1[0] - q0[0];
  const qy = q1[1] - q0[1];
  const d = px * px + py * py;
  if (d === 0) return null;
  const ar = (qx * px + qy * py) / d;
  const ai = (qy * px - qx * py) / d;
  const map = (x: number, y: number): Vertex => {
    const yy = mirror ? -y : y;
    return [ar * x - ai * yy, ai * x + ar * yy];
  };
  const [bx, by] = map(p0[0], p0[1]);
  const ox = q0[0] - bx;
  const oy = q0[1] - by;
  return ([x, y]) => {
    const [mx, my] = map(x, y);
    return [mx + ox, my + oy];
  };
}

/** The tiling a patch shows round the board: every patch tile not standing on
 * one of the board's, carried back into the board's coordinates. */
export function patchExtension(
  cells: readonly (readonly Vertex[])[],
  mid: Vertex,
  patch: readonly (readonly Vertex[])[],
): TilingExtension | null {
  const place = placeIn(cells, mid, patch);
  if (!place) return null;
  const tiles = tilesOf(cells);
  const own = new PointIndex<true>(tileSize(tiles) * 1e-3);
  for (const t of tiles) own.add(t.c, true);
  const rest: Vertex[][] = [];
  for (const t of tilesOf(patch)) {
    if (!own.find(place.from(t.c))) rest.push(t.corners.map(place.from));
  }
  return listedExtension(rest, mid, tileSize(tiles));
}

/** An extension that is a fixed list of tiles round `mid` (a patch's, or the
 * list a game's worker sends back): it reaches as far as they do every way. */
export function listedExtension(cells: Vertex[][], mid: Vertex, tile: number): TilingExtension {
  const rest = cells.map((corners) => {
    let x = 0;
    let y = 0;
    for (const p of corners) {
      x += p[0];
      y += p[1];
    }
    const c: Vertex = [x / corners.length, y / corners.length];
    return { corners, c, d: Math.hypot(c[0] - mid[0], c[1] - mid[1]) };
  });
  return {
    reach: reachOf(rest, mid),
    tile,
    cells: (radius) => rest.filter((t) => t.d <= radius).map((t) => t.corners),
  };
}

/** How far a patch reaches every way from `mid`: the shortest, over a fan of
 * directions, of the furthest tile out in that direction. */
function reachOf(rest: readonly { c: Vertex; d: number }[], mid: Vertex): number {
  const FAN = 48;
  const far = new Array<number>(FAN).fill(0);
  for (const t of rest) {
    const [x, y] = t.c;
    const k = Math.floor(((Math.atan2(y - mid[1], x - mid[0]) + Math.PI) / (2 * Math.PI)) * FAN);
    far[Math.min(FAN - 1, k)] = Math.max(far[Math.min(FAN - 1, k)]!, t.d);
  }
  return Math.min(...far);
}

/**
 * The tiling round a board found in bigger patches of it, the smallest first
 * (grown lazily: a patch past the one that reaches far enough is never built),
 * or null if none holds the board. The first that reaches `want` from `mid` is
 * kept, else the furthest-reaching.
 */
export function grownExtension(
  cells: readonly (readonly Vertex[])[],
  mid: Vertex,
  patches: Iterable<readonly (readonly Vertex[])[]>,
  want = Infinity,
): TilingExtension | null {
  let best: TilingExtension | null = null;
  for (const patch of patches) {
    const ext = patchExtension(cells, mid, patch);
    if (ext && (!best || ext.reach > best.reach)) best = ext;
    if (best && best.reach >= want) break;
  }
  return best;
}
