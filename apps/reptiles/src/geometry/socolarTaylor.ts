// The Socolar–Taylor tile: a single tile that tiles the plane only
// aperiodically (Socolar and Taylor, 2010). It is a hexagon decorated so that
// its neighbours must match it — and drawn as a shape that forces the same
// rules with nothing printed on it, the price being that the shape is not one
// piece: a notched hexagon (the body), a small rectangle at a corner of it on
// each side (the black stripes' rule: a stripe runs on across every edge), and
// out past each corner of the hexagon a pair of larger rectangles corner to
// corner (the red–blue rule, between tiles one tile apart: which way the pair
// turns is the flag's hand). Nineteen pieces in all, together exactly the
// hexagon's area. The tiling uses the tile and its mirror image.
//
// Every tile sits on a hexagon of a hexagonal lattice, in one of twelve ways
// (six turns, either side up), so a patch is a choice of way per hexagon. No
// formula gives it — the paper gives one for the mirror only — but the shape
// forces it: `socolarTaylorSearch` lays the hexagons ring by ring, trying each
// way in turn, and keeps a tile only where it overlaps nothing and every bit
// of plane that no tile still to come can reach is covered. That is exact:
// every edge of the tile runs along a line of the kisrhombille tiling (the
// triangular lattice of its corners, cut by its altitudes), so each tile is a
// set of that tiling's small triangles, and the search compares sets of them.
// The search's patch four rings out is written out in `SOCOLAR_TAYLOR_PATCH`
// (it takes a quarter of a minute to find); the level's board is its middle
// two rings, 19 tiles, so the board carries on at least two rings further.
// The tests check the written patch has no overlap and no gap (`stFaults`),
// and that the board's tiles cover its region exactly.

import { cyclotomic, type Cyc, type Ring } from "./cyclotomic";
import { piece, posed, type Shape } from "./shape";

const Z12 = cyclotomic(12);

/** A point (a, b) of the tile's lattice — x = a·cos 30°, y = b/2, a + b even —
 * as ((a + b)/2)·ζ + ((a − b)/2)·ζ⁻¹ in ℤ[ζ12]. */
export function stPoint([a, b]: readonly [number, number]): Cyc {
  if ((a + b) % 2) throw new Error(`(${a}, ${b}) is no point of the lattice`);
  return Z12.add(
    Z12.zeta(1).map((c) => (c * (a + b)) / 2),
    Z12.zeta(11).map((c) => (c * (a - b)) / 2),
  );
}

/** A point of ℤ[ζ12] back as (a, b) — only the lattice's points have one. In
 * the power basis 1, ζ, ζ², ζ³ that is e1·ζ + e3·ζ³: a = e1, b = e1 + 2·e3. */
export function stLattice(p: Cyc): [number, number] {
  const [e0, e1, e2, e3] = p as [number, number, number, number];
  if (e0 !== 0 || e2 !== 0) throw new Error("not a point of the tile's lattice");
  return [e1, e1 + 2 * e3];
}

/** The tile, counter-clockwise, y up, in (a, b): the hexagon of the body has
 * its corners at (0, ±20) and (±10, ±10) — circumradius 10 in the ring's
 * units — and the tile is as Socolar and Taylor draw it, pointing up. */
// prettier-ignore
const TILE_AB: [number, number][][] = [
  // the body, a notch in each side
  [[0, -20], [2, -18], [1, -15], [6, -10], [7, -13], [10, -10], [10, -6], [8, -6], [8, 4], [10, 4],
   [10, 10], [7, 13], [6, 10], [1, 15], [2, 18], [0, 20], [-2, 18], [-1, 15], [-6, 10], [-7, 13],
   [-10, 10], [-10, 4], [-8, 4], [-8, -6], [-10, -6], [-10, -10], [-7, -13], [-6, -10], [-1, -15],
   [-2, -18]],
  // the small rectangles, one across each side, at a corner of its notch
  [[-2, 18], [-3, 21], [-4, 20], [-3, 17]],
  [[2, 18], [3, 17], [4, 20], [3, 21]],
  [[10, -6], [12, -6], [12, -4], [10, -4]],
  [[2, -18], [3, -21], [4, -20], [3, -17]],
  [[-3, -17], [-4, -20], [-3, -21], [-2, -18]],
  [[-10, -6], [-10, -4], [-12, -4], [-12, -6]],
  // past each corner of the hexagon, two rectangles corner to corner
  [[0, 30], [2, 30], [2, 34], [0, 34]],
  [[-2, 26], [0, 26], [0, 30], [-2, 30]],
  [[16, 12], [18, 14], [17, 17], [15, 15]],
  [[13, 13], [15, 15], [14, 18], [12, 16]],
  [[15, -15], [17, -17], [18, -14], [16, -12]],
  [[12, -16], [14, -18], [15, -15], [13, -13]],
  [[0, -30], [0, -34], [2, -34], [2, -30]],
  [[-2, -30], [0, -30], [0, -26], [-2, -26]],
  [[-14, -18], [-12, -16], [-13, -13], [-15, -15]],
  [[-17, -17], [-15, -15], [-16, -12], [-18, -14]],
  [[-15, 15], [-13, 13], [-12, 16], [-14, 18]],
  [[-18, 14], [-16, 12], [-15, 15], [-17, 17]],
];

/** The Socolar–Taylor tile: its nineteen pieces, centred on its hexagon. */
export const SOCOLAR_TAYLOR: Shape = {
  ring: Z12,
  pieces: TILE_AB.map((p) => piece(p.map(stPoint))),
};

/** The centre of the lattice's hexagon (i, j), in (a, b): i steps of one
 * neighbour, to the right, and j of the next, up and to the right. */
export function stCentre([i, j]: readonly [number, number]): [number, number] {
  return [20 * i + 10 * j, 30 * j];
}

/** A tile on the board: its hexagon, how far it is turned (in sixths of a
 * turn) and whether it is mirrored first. */
export type StTile = [i: number, j: number, turn: number, flip: boolean];

/** The hexagons out to `radius` rings round (0, 0), ring by ring, each ring
 * anticlockwise from the right. */
export function stHexagons(radius: number): [number, number][] {
  const out: [number, number][] = [[0, 0]];
  const dirs: [number, number][] = [
    [-1, 1],
    [-1, 0],
    [0, -1],
    [1, -1],
    [1, 0],
    [0, 1],
  ];
  for (let r = 1; r <= radius; r++) {
    let at: [number, number] = [r, 0];
    for (const [di, dj] of dirs) {
      for (let s = 0; s < r; s++) {
        out.push(at);
        at = [at[0] + di, at[1] + dj];
      }
    }
  }
  return out;
}

/** The tile on its hexagon, turned and mirrored as `tile` says: its pieces. */
export function stCell([i, j, turn, flip]: StTile): Cyc[][] {
  const t = stPoint(stCentre([i, j]));
  return posed(SOCOLAR_TAYLOR, { rot: 2 * turn, flip, t }).map((p) => p.verts);
}

// -- the search ----------------------------------------------------------------

/** The kisrhombille's small triangles, each named by its centroid times 18
 * (in (a, b): a whole number then) packed into one number. */
const SPAN = 1 << 13;
const pack = (a18: number, b18: number): number => (a18 + SPAN / 2) * SPAN + (b18 + SPAN / 2);

/** Whether (x, y) is inside the polygon `poly` (crossing count, exact on
 * whole numbers; the point is never on an edge). */
function inside(poly: [number, number][], x: number, y: number): boolean {
  let odd = false;
  for (let k = 0; k < poly.length; k++) {
    const [x1, y1] = poly[k]!;
    const [x2, y2] = poly[(k + 1) % poly.length]!;
    if (y1 <= y !== y2 <= y) {
      // the edge crosses the line through the point: to its right?
      const cross = (x2 - x1) * (y - y1) - (x - x1) * (y2 - y1);
      if (cross > 0 === y2 > y1) odd = !odd;
    }
  }
  return odd;
}

/** The small triangles the tile covers turned by `turn` sixths and mirrored
 * if `flip`, centred on the origin — 3600 of them, the hexagon's area. */
function cover(turn: number, flip: boolean): number[] {
  const polys = posed(SOCOLAR_TAYLOR, { rot: 2 * turn, flip, t: Z12.zero }).map((p) =>
    p.verts.map((v) => {
      const [a, b] = stLattice(v);
      return [18 * a, 18 * b] as [number, number];
    }),
  );
  const boxes = polys.map((poly) => {
    const xs = poly.map(([x]) => x);
    const ys = poly.map(([, y]) => y);
    return [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)] as const;
  });
  const within = (x: number, y: number): boolean =>
    polys.some((poly, n) => {
      const [x0, x1, y0, y1] = boxes[n]!;
      return x > x0 && x < x1 && y > y0 && y < y1 && inside(poly, x, y);
    });
  const out: number[] = [];
  // every triangle of the lattice has one upright side, (a, b) to (a, b + 2),
  // with the triangle to its right (s = 1) or its left (s = −1)
  for (let a = -24; a <= 24; a++) {
    for (let b = -40; b <= 40; b++) {
      if ((a + b) % 2) continue;
      for (const s of [1, -1]) {
        const v: [number, number][] = [
          [a, b],
          [a + s, b + 1],
          [a, b + 2],
        ];
        const g2 = [v[0]![0] + v[1]![0] + v[2]![0], v[0]![1] + v[1]![1] + v[2]![1]];
        for (let k = 0; k < 3; k++) {
          const p = v[k]!;
          for (const q of [v[(k + 1) % 3]!, v[(k + 2) % 3]!]) {
            // the centroid of (centroid, corner, mid-side), times 18
            const x = 2 * g2[0]! + 6 * p[0] + 3 * (p[0] + q[0]);
            const y = 2 * g2[1]! + 6 * p[1] + 3 * (p[1] + q[1]);
            if (within(x, y)) out.push(pack(x, y));
          }
        }
      }
    }
  }
  return out;
}

let WAYS: { turn: number; flip: boolean; cover: number[] }[] | undefined;

/** Each of the twelve ways, as [turn, flip] with its small triangles. */
export function stWays(): { turn: number; flip: boolean; cover: number[] }[] {
  WAYS ??= [false, true].flatMap((flip) =>
    [0, 1, 2, 3, 4, 5].map((turn) => ({ turn, flip, cover: cover(turn, flip) })),
  );
  return WAYS;
}

/** How far hexagon (i, j) moves a packed small triangle. */
function shift([i, j]: readonly [number, number]): number {
  const [a, b] = stCentre([i, j]);
  return pack(18 * a, 18 * b) - pack(0, 0);
}

/** For the patch `radius` rings round: per hexagon (in `stHexagons` order),
 * the small triangles that no hexagon after it — on the patch or off it —
 * can reach, so that every one must be covered once it is laid. */
function dueBy(radius: number): number[][] {
  const hexagons = stHexagons(radius);
  const order = new Map(hexagons.map(([i, j], n) => [`${i},${j}`, n]));
  const reach = new Set<number>();
  for (const w of stWays()) for (const k of w.cover) reach.add(k);
  // a tile reaches less than two hexagons from its own
  const last = new Map<number, number>();
  for (const [i, j] of stHexagons(radius + 2)) {
    const n = order.get(`${i},${j}`) ?? Infinity;
    const d = shift([i, j]);
    for (const k of reach) last.set(k + d, Math.max(last.get(k + d) ?? -1, n));
  }
  const due: number[][] = hexagons.map(() => []);
  for (const [k, n] of last) if (n !== Infinity) due[n]!.push(k);
  return due;
}

/**
 * A patch of the tiling `radius` rings round a hexagon, found by search: the
 * hexagons in `stHexagons` order, the first unturned, each trying the twelve
 * ways in `stWays` order and keeping one that overlaps no tile laid and leaves
 * uncovered no small triangle that every tile able to reach it has passed.
 * Null if there is none. Four rings take a quarter of a minute.
 */
export function socolarTaylorSearch(radius: number): StTile[] | null {
  const ways = stWays();
  const hexagons = stHexagons(radius);
  const due = dueBy(radius);
  const covered = new Set<number>();
  const tiles: StTile[] = [];
  const lay = (n: number): boolean => {
    if (n === hexagons.length) return true;
    const [i, j] = hexagons[n]!;
    const d = shift([i, j]);
    for (const w of n === 0 ? ways.slice(0, 1) : ways) {
      const keys = w.cover.map((k) => k + d);
      if (keys.some((k) => covered.has(k))) continue;
      for (const k of keys) covered.add(k);
      if (due[n]!.every((k) => covered.has(k))) {
        tiles.push([i, j, w.turn, w.flip]);
        if (lay(n + 1)) return true;
        tiles.pop();
      }
      for (const k of keys) covered.delete(k);
    }
    return false;
  };
  return lay(0) ? tiles : null;
}

/** What is wrong with `tiles` as a patch `radius` rings round, laid in
 * `stHexagons` order: how many small triangles two tiles cover, and how many
 * no tile covers that no tile off the patch could reach. Both 0 for a patch
 * of the tiling. */
export function stFaults(tiles: StTile[], radius: number): { overlaps: number; gaps: number } {
  const ways = stWays();
  const hexagons = stHexagons(radius);
  if (
    tiles.length !== hexagons.length ||
    tiles.some(([i, j], n) => i !== hexagons[n]![0] || j !== hexagons[n]![1])
  )
    throw new Error("stFaults: not the hexagons of the patch, in order");
  const covered = new Set<number>();
  let overlaps = 0;
  for (const [i, j, turn, flip] of tiles) {
    const w = ways.find((w) => w.turn === turn && w.flip === flip)!;
    const d = shift([i, j]);
    for (const k of w.cover) {
      if (covered.has(k + d)) overlaps++;
      covered.add(k + d);
    }
  }
  const gaps = dueBy(radius)
    .flat()
    .filter((k) => !covered.has(k)).length;
  return { overlaps, gaps };
}

/** A patch of the tiling four rings round, as `socolarTaylorSearch(4)` lays
 * it, ring by ring: [i, j, turn, flip]. */
// prettier-ignore
export const SOCOLAR_TAYLOR_PATCH: StTile[] = [
  // ring 0
  [0, 0, 0, false],
  // ring 1
  [1, 0, 0, false], [0, 1, 4, false], [-1, 1, 5, true], [-1, 0, 3, true], [0, -1, 1, false], [1, -1, 2, true],
  // ring 2
  [2, 0, 0, false], [1, 1, 5, true], [0, 2, 5, true], [-1, 2, 0, false], [-2, 2, 4, false], [-2, 1, 4, false],
  [-2, 0, 0, false], [-1, -1, 2, true], [0, -2, 2, true], [1, -2, 0, true], [2, -2, 1, false], [2, -1, 1, false],
  // ring 3
  [3, 0, 3, true], [2, 1, 4, false], [1, 2, 0, true], [0, 3, 4, true], [-1, 3, 2, false], [-2, 3, 1, true],
  [-3, 3, 5, false], [-3, 2, 0, true], [-3, 1, 5, true], [-3, 0, 0, false], [-2, -1, 1, false], [-1, -2, 0, false],
  [0, -3, 4, false], [1, -3, 5, false], [2, -3, 4, true], [3, -3, 2, false], [3, -2, 0, false], [3, -1, 2, true],
  // ring 4
  [4, 0, 0, false], [3, 1, 5, true], [2, 2, 4, false], [1, 3, 5, false], [0, 4, 0, true], [-1, 4, 3, false],
  [-2, 4, 5, true], [-3, 4, 0, false], [-4, 4, 0, false], [-4, 3, 4, true], [-4, 2, 5, true], [-4, 1, 4, false],
  [-4, 0, 0, false], [-3, -1, 2, true], [-2, -2, 4, true], [-1, -3, 2, false], [0, -4, 0, true], [1, -4, 0, true],
  [2, -4, 4, true], [3, -4, 3, true], [4, -4, 0, false], [4, -3, 1, true], [4, -2, 2, true], [4, -1, 1, false],
];

/** The level's board: the middle `rings` rings of `SOCOLAR_TAYLOR_PATCH` —
 * two, 19 tiles, which the patch carries on two rings past — each cell its
 * pieces. */
export function socolarTaylorPatch(rings: number): { ring: Ring; cells: Cyc[][][] } {
  const keep = stHexagons(rings).length;
  return { ring: Z12, cells: SOCOLAR_TAYLOR_PATCH.slice(0, keep).map(stCell) };
}
