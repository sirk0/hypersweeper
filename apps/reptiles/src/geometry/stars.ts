// The "uniform" tilings with star polygons: Grünbaum and Shephard's
// (*Tilings and Patterns*, 1987, §2.5), as Wikipedia's *Uniform tiling* lists
// them — four whose stars' points may take any angle α in a range, and
// eighteen that work at one angle only. Hypersweeper has no board for them,
// so they are defined here, and the tests are their oracle
// (`tests/unit/stars.test.ts`): no overlap and no gap over a block of
// periods, and every point where three or more tiles meet the tiling's own
// vertex configuration.
//
// A star {n_α} is an isotoxal 2n-gon — a regular star polygon seen as the
// simple polygon round it, or one of the family between — every side one unit
// long, its corners alternately its n points, of angle α, and its n dents, of
// 2π − 2π/n − α. A point of a tiling where only two tiles meet (a dent against
// another tile's corner) is no vertex: every other point has the one
// configuration, written as Wikipedia writes it with the angle in degrees —
// 3.6*60°.6**60° is a triangle, a six-pointed star's 60° point and another's
// dent round each vertex.
//
// Each tiling is written down as one period: two lattice steps and the tiles
// of one cell, each tile a kind, which of its corners it starts from (a
// star's point or dent), that corner and the direction of its first side. The
// corners and steps are points of ℤ[ζn], every side a unit ζᵏ, so the tiles
// are walked out exactly; a point is written as its whole coefficients on ζ⁰
// … ζ^(n/2 − 1) — ζ^(n/2) is −1. The data was found by growing each tiling
// out from its vertex configuration and reading off its period; only the
// exact result is kept here, and the tests check it.
//
// The four with an adjustable angle are each here at three angles, each a
// tiling of its own (a different star is a different tray): 3.6*α.6**α at
// 30°, 60° and 90°; 4.4*α.4**α at 30°, 45° and 60°; 6.3*α.3**α at 20°, 30°
// and 45°; 3.3*α.3.3**α at 20°, 30° and 40° — every angle a whole number of
// the ring's steps, and none so sharp its star is a sliver.

import { cyclotomic, type Cyc, type Ring } from "./cyclotomic";

/** A tile kind: a regular polygon of `sides`, or a star of `points` whose
 * points are `tip` degrees. */
export type StarKind =
  { readonly sides: number } | { readonly points: number; readonly tip: number };

export interface StarTiling {
  key: string;
  /** Its vertex configuration, as Wikipedia writes it, angles in degrees. */
  name: string;
  /** What it is, in words: the catalog's tooltip. */
  label: string;
  /** The ring, ℤ[ζn]. */
  n: number;
  /** The two lattice steps of its period. */
  a: readonly number[];
  b: readonly number[];
  kinds: readonly StarKind[];
  /** One period's tiles: its kind (an index into `kinds`), the corner it
   * starts from (a star's: 0 a point, 1 a dent), where that corner is, and
   * the direction its first side leaves it in (ζ to that power). */
  tiles: readonly (readonly [kind: number, first: number, at: readonly number[], dir: number])[];
  /** The corners round every vertex in order: `k` a regular k-gon's, `n*α` a
   * star's point, `n**α` its dent. */
  config: readonly string[];
}

/** Whether a kind is a star. */
export const isStar = (kind: StarKind): kind is Extract<StarKind, { points: number }> =>
  "points" in kind;

/** A kind's corners in order round it, from its corner 0 (a star's first
 * point), each as its label (`config`'s) and interior angle in degrees. */
export function cornersOfKind(kind: StarKind): { label: string; angle: number }[] {
  if (!isStar(kind)) {
    const k = kind.sides;
    return Array.from({ length: k }, () => ({ label: `${k}`, angle: 180 - 360 / k }));
  }
  const { points: n, tip } = kind;
  const dent = 360 - 360 / n - tip;
  return Array.from({ length: 2 * n }, (_, i) =>
    i % 2 ? { label: `${n}**${tip}`, angle: dent } : { label: `${n}*${tip}`, angle: tip },
  );
}

const RINGS = new Map<number, Ring>();
const ringOf = (n: number): Ring => {
  let ring = RINGS.get(n);
  if (!ring) RINGS.set(n, (ring = cyclotomic(n)));
  return ring;
};

/** The point Σ c_k ζ^k (k < n/2) the data writes as its coefficients. */
export function starPoint(ring: Ring, coefficients: readonly number[]): Cyc {
  return coefficients.reduce(
    (sum, c, k) =>
      ring.add(
        sum,
        ring.zeta(k).map((x) => x * c),
      ),
    ring.zero,
  );
}

/** A tile of `kind`, starting from its corner `first` at `at`, its first
 * side leaving in direction ζ^`dir`: walked out a unit side at a time,
 * turning left at each corner by π less its angle, and checked to close. */
export function kindCell(ring: Ring, kind: StarKind, first: number, at: Cyc, dir: number): Cyc[] {
  const all = cornersOfKind(kind);
  const corners = [...all.slice(first), ...all.slice(0, first)];
  const verts: Cyc[] = [];
  let p = at;
  let d = dir;
  corners.forEach((_, i) => {
    verts.push(p);
    p = ring.add(p, ring.zeta(d));
    const turn = ((180 - corners[(i + 1) % corners.length]!.angle) * ring.n) / 360;
    if (!Number.isInteger(turn))
      throw new Error(`kindCell: a corner of ${JSON.stringify(kind)} turns off ℤ[ζ${ring.n}]`);
    d += turn;
  });
  if (!ring.eq(p, at)) throw new Error(`kindCell: ${JSON.stringify(kind)} does not close`);
  return verts;
}

/** A tiling's one period, exactly: its ring, lattice steps, and the cells of
 * one period with each one's kind. */
export function starMotif(key: string): {
  spec: StarTiling;
  ring: Ring;
  a: Cyc;
  b: Cyc;
  cells: Cyc[][];
  kinds: number[];
} {
  const spec = starTiling(key);
  const ring = ringOf(spec.n);
  return {
    spec,
    ring,
    a: starPoint(ring, spec.a),
    b: starPoint(ring, spec.b),
    cells: spec.tiles.map(([kind, first, at, dir]) =>
      kindCell(ring, spec.kinds[kind]!, first, starPoint(ring, at), dir),
    ),
    kinds: spec.tiles.map(([kind]) => kind),
  };
}

/** The star tiling keyed `key`. */
export function starTiling(key: string): StarTiling {
  const spec = STAR_TILINGS.find((t) => t.key === key);
  if (!spec) throw new Error(`no star tiling ${key}`);
  return spec;
}

/** Its periods i·a + j·b for lo ≤ i, j ≤ hi, laid out: every tile with its
 * kind and the period it is in. */
export function starPatch(
  key: string,
  lo: number,
  hi: number,
): { ring: Ring; cells: Cyc[][]; kinds: number[]; at: [number, number][] } {
  const { ring, a, b, cells, kinds } = starMotif(key);
  const out: { cells: Cyc[][]; kinds: number[]; at: [number, number][] } = {
    cells: [],
    kinds: [],
    at: [],
  };
  for (let i = lo; i <= hi; i++) {
    for (let j = lo; j <= hi; j++) {
      const t = ring.add(
        a.map((x) => x * i),
        b.map((x) => x * j),
      );
      cells.forEach((cell, c) => {
        out.cells.push(cell.map((v) => ring.add(v, t)));
        out.kinds.push(kinds[c]!);
        out.at.push([i, j]);
      });
    }
  }
  return { ring, ...out };
}

export type XY = [number, number];

/** A tiling's lattice steps, drawn. */
export function starSteps(key: string): [XY, XY] {
  const { ring, a, b } = starMotif(key);
  return [ring.toXY(a), ring.toXY(b)];
}

/**
 * The tiles of tiling `key` that fit whole in a `box`-edge square — centred
 * on the tile of the most corners in its period (its biggest star or
 * polygon), moved by `offset` — and of those the largest piece joined edge
 * to edge, as `templateWindow` keeps a periodic window. A corner on the
 * square's edge, to a millionth, is inside it.
 */
export function starWindow(
  key: string,
  box: number,
  offset: XY = [0, 0],
): { ring: Ring; cells: Cyc[][]; centre: XY } {
  const { ring, cells: motif } = starMotif(key);
  const [a, b] = starSteps(key);
  const centreOf = (cell: Cyc[]): XY => {
    const pts = cell.map((v) => ring.toXY(v));
    return [
      pts.reduce((s, p) => s + p[0], 0) / pts.length,
      pts.reduce((s, p) => s + p[1], 0) / pts.length,
    ];
  };
  const most = Math.max(...motif.map((c) => c.length));
  const [mx, my] = centreOf(motif.find((c) => c.length === most)!);
  const centre: XY = [mx + offset[0], my + offset[1]];
  // the periods whose tiles can reach the square: its corners, and a tile's
  // reach past them, in lattice coordinates
  const reach =
    box / 2 +
    Math.max(
      ...motif.flatMap((c) => c.map((v) => Math.hypot(...ring.toXY(v)))),
      Math.hypot(...a),
      Math.hypot(...b),
    ) +
    1;
  const det = a[0] * b[1] - a[1] * b[0];
  const lattice = ([x, y]: XY): XY => [(x * b[1] - y * b[0]) / det, (a[0] * y - a[1] * x) / det];
  const corners = [
    [-1, -1],
    [-1, 1],
    [1, -1],
    [1, 1],
  ].map(([sx, sy]) => lattice([centre[0] + sx! * reach, centre[1] + sy! * reach]));
  const lo = Math.floor(Math.min(...corners.flat())) - 1;
  const hi = Math.ceil(Math.max(...corners.flat())) + 1;
  const { cells } = starPatch(key, lo, hi);
  const half = box / 2;
  const slack = 1e-6;
  const kept = cells.filter((cell) =>
    cell.every((v) => {
      const [x, y] = ring.toXY(v);
      return Math.abs(x - centre[0]) <= half + slack && Math.abs(y - centre[1]) <= half + slack;
    }),
  );
  return { ring, cells: largestPiece(ring, kept), centre };
}

/** The largest of `cells`' pieces joined edge to edge (the first, of two as
 * large): a tile meeting the rest at a point only is left out. */
function largestPiece(ring: Ring, cells: Cyc[][]): Cyc[][] {
  const edgeKey = (u: Cyc, v: Cyc): string => {
    const [p, q] = [ring.key(u), ring.key(v)];
    return p < q ? `${p}|${q}` : `${q}|${p}`;
  };
  const byEdge = new Map<string, number[]>();
  cells.forEach((cell, i) =>
    cell.forEach((v, j) => {
      const k = edgeKey(v, cell[(j + 1) % cell.length]!);
      byEdge.set(k, [...(byEdge.get(k) ?? []), i]);
    }),
  );
  const piece = new Array<number>(cells.length).fill(-1);
  const sizes: number[] = [];
  cells.forEach((_, start) => {
    if (piece[start]! >= 0) return;
    const id = sizes.length;
    sizes.push(0);
    const stack = [start];
    piece[start] = id;
    while (stack.length) {
      const i = stack.pop()!;
      sizes[id]!++;
      const cell = cells[i]!;
      cell.forEach((v, j) => {
        for (const o of byEdge.get(edgeKey(v, cell[(j + 1) % cell.length]!))!) {
          if (piece[o]! < 0) {
            piece[o] = id;
            stack.push(o);
          }
        }
      });
    }
  });
  const biggest = sizes.indexOf(Math.max(...sizes, 0));
  return cells.filter((_, i) => piece[i] === biggest);
}

/** The twenty-two tilings, the four of an adjustable angle at three angles
 * each first, then the eighteen as Wikipedia lists them. */
// prettier-ignore
export const STAR_TILINGS: readonly StarTiling[] = [
  {
    key: "star36a30",
    name: "3.6*30°.6**30°",
    label: "Six-pointed stars and triangles, their points 30°",
    n: 12,
    a: [1, 0, 1, -1, 1, -1],
    b: [-1, 1, 1, 0, 1, -1],
    kinds: [{ sides: 3 }, { points: 6, tip: 30 }],
    tiles: [
      [0, 0, [0, 0, 0, 0, 0, 0], 0],
      [0, 0, [0, 0, 1, 0, 0, -1], 2],
      [1, 0, [0, 0, 1, 0, 1, -1], 0],
    ],
    config: ["3", "6*30", "6**30"],
  },
  {
    key: "star36a60",
    name: "3.6*60°.6**60°",
    label: "Six-pointed stars and triangles, their points 60°",
    n: 6,
    a: [0, -2, -1],
    b: [2, -1, -1],
    kinds: [{ sides: 3 }, { points: 6, tip: 60 }],
    tiles: [
      [0, 0, [1, -1, 0], 5],
      [0, 0, [0, -1, -1], 4],
      [1, 0, [0, -1, -1], 5],
    ],
    config: ["3", "6*60", "6**60"],
  },
  {
    key: "star36a90",
    name: "3.6*90°.6**90°",
    label: "Six-pointed stars and triangles, their points 90°",
    n: 12,
    a: [1, 1, 1, 0, 1, -1],
    b: [-1, 1, 1, 1, 1, 0],
    kinds: [{ sides: 3 }, { points: 6, tip: 90 }],
    tiles: [
      [0, 0, [0, 1, 1, 0, 0, 0], 2],
      [1, 0, [0, 1, 1, 0, 1, 0], 0],
      [0, 0, [-1, 1, 1, 1, 1, 0], 0],
    ],
    config: ["3", "6*90", "6**90"],
  },
  {
    key: "star44a30",
    name: "4.4*30°.4**30°",
    label: "Four-pointed stars and squares, their points 30°",
    n: 12,
    a: [1, -1, 0, -1, 0, 0],
    b: [1, 0, 0, 1, -1, 0],
    kinds: [{ sides: 4 }, { points: 4, tip: 30 }],
    tiles: [
      [0, 0, [1, -1, 0, 0, 0, 0], 9],
      [1, 0, [1, -1, 0, 0, 0, 0], 0],
    ],
    config: ["4", "4*30", "4**30"],
  },
  {
    key: "star44a45",
    name: "4.4*45°.4**45°",
    label: "Four-pointed stars and squares, their points 45°",
    n: 8,
    a: [1, 0, 1, -1],
    b: [-1, 1, 1, 0],
    kinds: [{ sides: 4 }, { points: 4, tip: 45 }],
    tiles: [
      [0, 0, [0, 0, 0, 0], 0],
      [1, 0, [0, 0, 1, 0], 0],
    ],
    config: ["4", "4*45", "4**45"],
  },
  {
    key: "star44a60",
    name: "4.4*60°.4**60°",
    label: "Four-pointed stars and squares, their points 60°",
    n: 12,
    a: [1, 0, 0, 1, 0, -1],
    b: [-1, 0, 1, 1, 0, 0],
    kinds: [{ sides: 4 }, { points: 4, tip: 60 }],
    tiles: [
      [0, 0, [0, 0, 0, 0, 0, 0], 0],
      [1, 0, [0, 0, 0, 1, 0, 0], 0],
    ],
    config: ["4", "4*60", "4**60"],
  },
  {
    key: "star63a20",
    name: "6.3*20°.3**20°",
    label: "Three-pointed stars and hexagons, their points 20°",
    n: 18,
    a: [-1, 0, 0, -1, 0, 0, -1, 1, 0],
    b: [1, -1, 0, -1, 0, 0, -1, 0, 0],
    kinds: [{ sides: 6 }, { points: 3, tip: 20 }],
    tiles: [
      [1, 1, [0, 0, 0, 0, 0, 0, 0, 0, 0], 7],
      [1, 0, [0, 0, 0, 0, 0, 0, -1, 1, 0], 12],
      [0, 0, [1, -1, 0, -1, 0, 0, -1, 1, 0], 9],
    ],
    config: ["6", "3*20", "3**20"],
  },
  {
    key: "star63a30",
    name: "6.3*30°.3**30°",
    label: "Three-pointed stars and hexagons, their points 30°",
    n: 12,
    a: [-1, 0, -1, 0, -1, 1],
    b: [1, -1, -1, 0, -1, 0],
    kinds: [{ sides: 6 }, { points: 3, tip: 30 }],
    tiles: [
      [1, 1, [0, 0, 0, 0, 0, 0], 5],
      [1, 0, [0, 0, 0, 0, -1, 1], 8],
      [0, 0, [1, -1, -1, 0, -1, 1], 6],
    ],
    config: ["6", "3*30", "3**30"],
  },
  {
    key: "star63a45",
    name: "6.3*45°.3**45°",
    label: "Three-pointed stars and hexagons, their points 45°",
    n: 24,
    a: [-1, 0, 0, 0, -1, 0, 0, 0, -1, 0, 0, 1],
    b: [1, 0, 0, -1, -1, 0, 0, 0, -1, 0, 0, 0],
    kinds: [{ sides: 6 }, { points: 3, tip: 45 }],
    tiles: [
      [1, 1, [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], 11],
      [1, 0, [0, 0, 0, 0, 0, 0, 0, 0, -1, 0, 0, 1], 16],
      [0, 0, [1, 0, 0, -1, -1, 0, 0, 0, -1, 0, 0, 1], 12],
    ],
    config: ["6", "3*45", "3**45"],
  },
  {
    key: "star333a20",
    name: "3.3*20°.3.3**20°",
    label: "Three-pointed stars and triangles, their points 20°",
    n: 18,
    a: [0, 0, 0, 0, -1, 0, -1, 1, 0],
    b: [0, 1, 0, 1, -1, 0, 0, 0, 0],
    kinds: [{ sides: 3 }, { points: 3, tip: 20 }],
    tiles: [
      [1, 1, [0, 0, 0, 0, 0, 0, 0, 0, 0], 7],
      [0, 0, [0, 0, 0, 1, -1, 0, -1, 1, 0], 12],
      [0, 0, [0, 0, 0, 1, -1, 0, -1, 1, 0], 16],
    ],
    config: ["3", "3*20", "3", "3**20"],
  },
  {
    key: "star333a30",
    name: "3.3*30°.3.3**30°",
    label: "Three-pointed stars and triangles, their points 30°",
    n: 12,
    a: [0, 0, 0, -1, -1, 1],
    b: [-1, 1, 2, -2, -2, 1],
    kinds: [{ sides: 3 }, { points: 3, tip: 30 }],
    tiles: [
      [1, 1, [0, 0, 0, 0, 0, 0], 5],
      [0, 0, [0, 0, 1, -1, -1, 1], 8],
      [0, 0, [1, 0, 0, -1, -1, 1], 7],
    ],
    config: ["3", "3*30", "3", "3**30"],
  },
  {
    key: "star333a40",
    name: "3.3*40°.3.3**40°",
    label: "Three-pointed stars and triangles, their points 40°",
    n: 18,
    a: [0, 0, 1, 1, 0, -1, 0, 0, 0],
    b: [-1, 0, 0, 0, 0, 1, 0, 0, 0],
    kinds: [{ sides: 3 }, { points: 3, tip: 40 }],
    tiles: [
      [0, 0, [0, 0, 0, 0, 0, 0, 0, 0, 0], 0],
      [1, 0, [0, 0, 0, 0, 0, 0, 0, 0, 0], 3],
      [0, 0, [0, 0, 0, 0, 0, 0, 0, 0, 0], 5],
    ],
    config: ["3", "3*40", "3", "3**40"],
  },
  {
    key: "star464",
    name: "4.6.4*30°.6",
    label: "Squares, hexagons and four-pointed stars",
    n: 12,
    a: [1, 1, 0, 0, 0, -1],
    b: [0, 0, 1, 1, 1, 0],
    kinds: [{ sides: 4 }, { sides: 6 }, { points: 4, tip: 30 }],
    tiles: [
      [0, 0, [0, 0, 0, 0, 0, 0], 0],
      [1, 0, [1, 0, 0, 0, 0, 0], 11],
      [1, 0, [0, 0, 0, 1, 0, 0], 0],
      [2, 0, [1, 0, 0, 1, 0, 0], 1],
    ],
    config: ["4", "6", "4*30", "6"],
  },
  {
    key: "star84",
    name: "(8.4*45°)²",
    label: "Octagons and four-pointed stars",
    n: 8,
    a: [1, 1, 1, 1],
    b: [-1, -1, 1, 1],
    kinds: [{ sides: 8 }, { points: 4, tip: 45 }],
    tiles: [
      [0, 0, [0, 0, 0, 0], 0],
      [1, 0, [0, 0, 0, 0], 3],
    ],
    config: ["8", "4*45", "8", "4*45"],
  },
  {
    key: "star12124",
    name: "12.12.4*60°",
    label: "Dodecagons and four-pointed stars",
    n: 12,
    a: [1, 1, 0, -1, -1, -1],
    b: [1, 1, 1, 1, 1, 0],
    kinds: [{ sides: 12 }, { points: 4, tip: 60 }],
    tiles: [
      [1, 0, [0, 0, 0, 0, 0, 0], 10],
      [0, 0, [1, 1, 0, -1, 0, 0], 10],
    ],
    config: ["12", "12", "4*60"],
  },
  {
    key: "star338438",
    name: "3.3.8*15°.4**60°.8*15°",
    label: "Eight- and four-pointed stars and triangles",
    n: 24,
    a: [-1, 0, 0, -1, 0, -1, 0, 0, -1, 1, 0, -1],
    b: [0, 0, 1, -1, 0, 1, -1, 0, 0, -1, 0, -1],
    kinds: [{ sides: 3 }, { points: 4, tip: 60 }, { points: 8, tip: 15 }],
    tiles: [
      [1, 1, [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], 9],
      [2, 0, [0, 0, 0, -1, 0, 0, 0, 0, 0, 0, 0, -1], 17],
      [0, 0, [0, 0, 0, -1, 0, 0, 0, 0, 0, 0, 0, -1], 18],
      [0, 0, [0, 0, 0, -1, 0, 0, 0, 0, 0, 0, 0, -1], 22],
      [0, 0, [0, 0, 0, -1, 0, -1, 0, 0, 0, 1, 0, -1], 16],
      [0, 0, [-1, 0, 1, -2, 0, 0, -1, 0, 0, 0, 0, -2], 20],
    ],
    config: ["3", "3", "8*15", "4**60", "8*15"],
  },
  {
    key: "star3383438",
    name: "3.3.8*15°.3.4.3.8*15°",
    label: "Eight-pointed stars, squares and triangles",
    n: 24,
    a: [-1, 0, 0, -1, 0, -1, 0, 0, -1, 1, 0, -1],
    b: [0, 0, 1, -1, 0, 1, -1, 0, 0, -1, 0, -1],
    kinds: [{ sides: 3 }, { sides: 4 }, { points: 8, tip: 15 }],
    tiles: [
      [1, 0, [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], 13],
      [0, 0, [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], 19],
      [0, 0, [0, 0, 0, 0, 0, 0, 0, -1, 0, 0, 0, 0], 13],
      [2, 0, [0, 0, 0, 0, 0, 0, 0, -1, 0, 0, 0, 0], 17],
      [0, 0, [0, 0, 0, 0, 0, 0, 0, -1, 0, 0, 0, 0], 18],
      [0, 0, [0, 0, 0, 0, 0, 0, 0, -1, 0, 0, 0, 0], 22],
      [0, 0, [0, -1, 0, 0, 0, 0, 0, -1, 0, 0, 0, 0], 16],
      [0, 0, [0, 0, 1, -1, 0, 1, -1, 0, 0, 0, 0, -1], 17],
      [0, 0, [0, 0, 1, -1, 0, 0, -1, 0, 0, 0, 0, -1], 15],
      [0, 0, [-1, 0, 1, -1, 0, 0, -1, -1, 0, 0, 0, -1], 20],
    ],
    config: ["3", "3", "8*15", "3", "4", "3", "8*15"],
  },
  {
    key: "star34838",
    name: "3.4.8.3.8*15°",
    label: "Octagons, eight-pointed stars, squares and triangles",
    n: 24,
    a: [0, 1, 1, -1, 0, 0, -1, 0, 0, 0, -1, -1],
    b: [1, 1, 0, 0, 1, 0, 0, 1, 1, 0, 0, 0],
    kinds: [{ sides: 3 }, { sides: 4 }, { sides: 8 }, { points: 8, tip: 15 }],
    tiles: [
      [0, 0, [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], 0],
      [3, 0, [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], 23],
      [0, 0, [1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0], 21],
      [0, 0, [1, 0, 0, 0, 0, 1, -1, 0, 1, -1, 0, 0], 2],
      [0, 0, [0, 0, 1, -1, 0, 1, -1, 0, 1, -1, 0, -1], 20],
      [0, 0, [1, 0, 1, -1, 0, 1, -1, 0, 1, -1, 0, 0], 23],
      [1, 0, [1, 0, 0, 0, 0, 1, 0, 0, 1, -1, 0, 0], 22],
      [1, 0, [0, 0, 1, -1, 0, 1, -1, 0, 0, -1, 0, -1], 22],
      [2, 0, [1, 0, 1, 0, 0, 1, -1, 0, 1, -1, 0, 0], 19],
      [0, 0, [1, 1, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0], 22],
      [0, 0, [1, 1, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0], 3],
      [0, 0, [1, 0, 0, 0, 1, 1, 0, 0, 1, -1, -1, 0], 1],
    ],
    config: ["3", "4", "8", "3", "8*15"],
  },
  {
    key: "star55454",
    name: "5.5.4*18°.5.4*18°",
    label: "Pentagons and four-pointed stars",
    n: 20,
    a: [0, 0, 1, 0, 0, -1, 0, 0, -1, -1],
    b: [1, 0, 0, 1, 1, 0, 0, 1, 0, 0],
    kinds: [{ sides: 5 }, { points: 4, tip: 18 }],
    tiles: [
      [0, 0, [0, 0, 0, 0, 0, 0, 0, 0, 0, 0], 0],
      [1, 0, [0, 0, 0, 0, 0, 0, 0, 0, 0, 0], 19],
      [0, 0, [1, 0, 0, 0, 1, -1, 0, 0, 0, 0], 19],
      [0, 0, [1, 0, 0, 0, 1, 0, 0, 0, 0, 0], 1],
      [1, 0, [1, 0, 0, 0, 1, -1, 0, 0, 0, -1], 2],
      [0, 0, [1, 0, 0, 1, 1, -1, 0, 1, 0, -1], 18],
    ],
    config: ["5", "5", "4*18", "5", "4*18"],
  },
  {
    key: "star4666",
    name: "4.6*30°.6**90°.6*30°",
    label: "Two kinds of six-pointed star, and squares",
    n: 12,
    a: [-1, 1, -2, -1, -1, -2],
    b: [2, 1, 1, 2, -1, 1],
    kinds: [{ sides: 4 }, { points: 6, tip: 30 }, { points: 6, tip: 90 }],
    tiles: [
      [0, 0, [0, 0, 0, 0, 0, 0], 0],
      [1, 0, [0, 0, 0, 0, 0, 0], 11],
      [1, 0, [0, 0, -1, 0, 0, -1], 9],
      [0, 0, [0, 0, -1, 0, 0, -1], 10],
      [2, 1, [1, 0, 0, 1, 0, 0], 10],
      [0, 0, [1, 1, -1, 1, -1, 0], 11],
    ],
    config: ["4", "6*30", "6**90", "6*30"],
  },
  {
    key: "star46",
    name: "(4.6*30°)³",
    label: "Six-pointed stars and squares",
    n: 12,
    a: [1, 1, 0, 1, -1, 0],
    b: [1, 0, 1, 1, 0, 1],
    kinds: [{ sides: 4 }, { points: 6, tip: 30 }],
    tiles: [
      [0, 0, [0, 0, 0, 0, 0, 0], 0],
      [0, 0, [1, 0, 0, 1, 0, 0], 10],
      [1, 0, [1, 0, 0, 1, 0, 0], 1],
      [0, 0, [1, 0, 0, 1, 0, 0], 2],
    ],
    config: ["4", "6*30", "4", "6*30", "4", "6*30"],
  },
  {
    key: "star996",
    name: "9.9.6*80°",
    label: "Nonagons and six-pointed stars",
    n: 18,
    a: [-2, 0, -2, 0, -1, 0, 0, 1, 0],
    b: [0, 1, 0, 0, -1, 0, -2, 0, -2],
    kinds: [{ sides: 9 }, { points: 6, tip: 80 }],
    tiles: [
      [0, 0, [0, 0, 0, 0, 0, 0, 0, 0, 0], 7],
      [1, 0, [0, 0, 0, 0, 0, 0, 0, 0, 0], 14],
      [0, 0, [-1, 1, -1, 0, -1, 0, -1, 1, -1], 10],
    ],
    config: ["9", "9", "6*80"],
  },
  {
    key: "star66",
    name: "(6.6*60°)²",
    label: "Hexagrams and hexagons",
    n: 6,
    a: [0, -2, -2],
    b: [2, 0, -2],
    kinds: [{ sides: 6 }, { points: 6, tip: 60 }],
    tiles: [
      [1, 0, [0, 0, 0], 5],
      [0, 0, [0, -1, -1], 4],
      [0, 0, [1, 0, -2], 4],
    ],
    config: ["6", "6*60", "6", "6*60"],
  },
  {
    key: "star123",
    name: "(12.3*30°)²",
    label: "Dodecagons and three-pointed stars",
    n: 12,
    a: [1, 1, 1, 1, -1, -1],
    b: [0, 0, 0, 0, 2, 2],
    kinds: [{ sides: 12 }, { points: 3, tip: 30 }],
    tiles: [
      [0, 0, [0, 0, 0, 0, 0, 0], 0],
      [1, 0, [1, 1, 0, 0, 0, 0], 1],
      [1, 0, [0, 0, 0, 0, 1, 1], 3],
    ],
    config: ["12", "3*30", "12", "3*30"],
  },
  {
    key: "star346312",
    name: "3.4.6.3.12*30°",
    label: "Twelve-pointed stars, hexagons, squares and triangles",
    n: 12,
    a: [1, 1, 1, 2, 0, -2],
    b: [0, 1, 1, 2, 1, 1],
    kinds: [{ sides: 3 }, { sides: 4 }, { sides: 6 }, { points: 12, tip: 30 }],
    tiles: [
      [0, 0, [0, 0, 0, 0, 0, 0], 0],
      [0, 0, [1, 0, 0, 0, 1, 0], 11],
      [2, 0, [1, 0, 0, 0, 1, 0], 1],
      [0, 0, [1, 0, 0, 1, 0, -1], 2],
      [1, 0, [1, 0, 0, 1, 1, -1], 0],
      [2, 0, [1, 0, 1, 1, 0, -1], 11],
      [0, 0, [1, 1, 0, 1, 1, 0], 0],
      [3, 0, [1, 1, 0, 1, 1, 0], 2],
      [0, 0, [1, 1, 0, 1, 1, 0], 3],
      [0, 0, [1, 1, 0, 1, 1, 1], 2],
      [0, 0, [2, 0, 0, 2, 1, -1], 1],
      [0, 0, [1, 1, 0, 1, 2, 1], 1],
      [1, 0, [1, 1, 1, 2, 0, -1], 11],
      [0, 0, [1, 1, 1, 2, 0, -1], 2],
      [0, 0, [2, 1, 1, 2, 1, 0], 11],
      [0, 0, [1, 2, 1, 2, 1, 0], 0],
      [0, 0, [1, 1, 2, 2, 1, 0], 1],
      [1, 0, [2, 2, 1, 2, 1, 0], 1],
    ],
    config: ["3", "4", "6", "3", "12*30"],
  },
  {
    key: "star33312",
    name: "3.3.3.12*30°.3.3.12*30°",
    label: "Twelve-pointed stars and triangles",
    n: 12,
    a: [2, 1, 0, 0, 0, -1],
    b: [-2, 0, 2, 1, 0, 1],
    kinds: [{ sides: 3 }, { points: 12, tip: 30 }],
    tiles: [
      [0, 0, [0, 0, 0, 0, 0, 0], 0],
      [0, 0, [0, 0, 0, 0, 0, 0], 2],
      [0, 0, [-1, 0, 1, 0, 0, 0], 0],
      [1, 0, [-1, 0, 1, 0, 0, 0], 2],
      [0, 0, [-1, 0, 1, 0, 0, 0], 3],
      [0, 0, [1, 0, 0, 0, 1, 0], 11],
      [0, 0, [1, 0, 0, 0, 1, 0], 1],
      [0, 0, [1, 0, 0, 1, 0, -1], 2],
      [0, 0, [1, 0, 0, 1, 1, -1], 0],
      [0, 0, [1, 0, 0, 1, 1, -1], 2],
      [0, 0, [1, 0, 1, 0, 0, -1], 1],
      [0, 0, [1, 1, 0, 0, 0, -1], 0],
      [0, 0, [1, 0, 1, 1, 0, -1], 2],
      [0, 0, [-2, 0, 2, 1, 0, 0], 5],
      [0, 0, [0, 0, 2, 1, 0, 0], 11],
    ],
    config: ["3", "3", "3", "12*30", "3", "3", "12*30"],
  },
  {
    key: "star18183",
    name: "18.18.3*40°",
    label: "Octadecagons and three-pointed stars",
    n: 18,
    a: [-1, -1, -1, -1, -1, -1, -1, -1, 0],
    b: [0, 0, 0, 0, 0, -1, -2, -2, -1],
    kinds: [{ sides: 18 }, { points: 3, tip: 40 }],
    tiles: [
      [1, 0, [0, 0, 0, 0, 0, -1, -1, -1, 0], 13],
      [0, 0, [0, 1, 0, -1, -1, -1, -1, -1, 0], 10],
      [1, 0, [0, 0, -1, -1, -1, -1, -1, -1, 0], 10],
    ],
    config: ["18", "18", "3*40"],
  },
  {
    key: "star3666",
    name: "3.6.6*60°.6",
    label: "Hexagrams, hexagons and triangles",
    n: 6,
    a: [2, -2, -2],
    b: [3, 1, -1],
    kinds: [{ sides: 3 }, { sides: 6 }, { points: 6, tip: 60 }],
    tiles: [
      [1, 0, [0, 0, 0], 4],
      [2, 0, [1, 0, 0], 5],
      [1, 0, [1, -1, -1], 4],
      [1, 0, [2, 0, -2], 4],
      [0, 0, [2, -1, -2], 4],
      [0, 0, [3, 0, -2], 5],
    ],
    config: ["3", "6", "6*60", "6"],
  },
  {
    key: "star8386",
    name: "8.3*15°.8.6*75°",
    label: "Octagons, and three- and six-pointed stars",
    n: 24,
    a: [1, 1, 0, 1, 0, 0, 0, 0, -1, 0, -1, -1],
    b: [0, 0, 0, 0, 1, 0, 1, 1, 1, 1, 0, 1],
    kinds: [{ sides: 8 }, { points: 3, tip: 15 }, { points: 6, tip: 75 }],
    tiles: [
      [0, 0, [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], 0],
      [0, 0, [1, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0], 20],
      [1, 0, [1, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0], 5],
      [2, 0, [0, 0, 0, 0, 0, 0, 1, 0, 0, 1, 0, 0], 3],
      [0, 0, [1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0], 22],
      [1, 0, [1, 0, 0, 1, 0, 0, 0, 0, -1, 0, 0, -1], 1],
    ],
    config: ["8", "3*15", "8", "6*75"],
  },
  {
    key: "star9393",
    name: "9.3.9.3*20°",
    label: "Nonagons, triangles and three-pointed stars",
    n: 18,
    a: [1, 0, 1, 0, 1, 0, 0, -1, 0],
    b: [0, 0, 0, 0, 0, 0, 1, 1, 1],
    kinds: [{ sides: 3 }, { sides: 9 }, { points: 3, tip: 20 }],
    tiles: [
      [1, 0, [0, 0, 0, 0, 0, 0, 0, 0, 0], 0],
      [2, 0, [1, -1, 1, -1, 1, -1, 1, 0, 1], 5],
      [0, 0, [1, 0, 1, 0, 0, 0, 0, 0, 0], 1],
    ],
    config: ["9", "3", "9", "3*20"],
  },
];
