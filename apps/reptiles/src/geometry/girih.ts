// Girih tiles: the five tiles medieval Islamic craftsmen laid their
// strapwork patterns with (Lu and Steinhardt, *Science* 315, 2007) — a
// regular decagon, a regular pentagon, an elongated hexagon, a bowtie and a
// rhombus. Every side is one unit long and every corner a multiple of 36°,
// so every tile is walked out exactly in ℤ[ζ10]. Hypersweeper has no board
// for them, so they are defined here, and the tests are their oracle
// (`tests/unit/girih.test.ts`).
//
// Two kinds of tiling are cut from them:
//
// - **Periodic** ones (`GIRIH_TILINGS`), each written down as one period —
//   two lattice steps and the tiles of one cell, as the star tilings are
//   (`stars.ts`) — and, where `subdivide` says so, that period's tiles each
//   cut once by the rule below: big hexagons laid side by side, each cut into
//   small hexagons and bowties, are a periodic girih pattern of their own.
//
// - **The self-similar one** (`girihPatch`): a decagon cut over and over by
//   the rule below, never repeating — the kind of pattern Lu and Steinhardt
//   found on the Darb-i Imam shrine in Isfahan (1453). The rule cuts a tile
//   τ² times bigger (τ the golden ratio) into small ones, and as theirs does,
//   the small tiles do not stop at the big tile's sides: each side of a big
//   tile runs along the long diagonal of a small hexagon, half of it on
//   either side, so the halves two big tiles lay along their shared side are
//   one hexagon. What is left inside the hexagons' halves is filled with
//   whole small tiles: the big bowtie with two bowties, the big hexagon with
//   two hexagons and three bowties, the big decagon with a decagon, ten
//   hexagons and ten bowties round it. Those fills were found by an exact
//   search (every way to fill each big tile, kept the most symmetric: the
//   decagon's and the bowtie's have all their tile's symmetry, the
//   hexagon's — which has none with all of it — its half turn), and the
//   tests check every one covers its big tile exactly. So the rule cuts only
//   decagons, hexagons and bowties into decagons, hexagons and bowties; the
//   pentagon and the rhombus appear only in periodic tilings. Grown from one
//   decagon the pattern keeps it at its centre, ringed by hexagons and
//   bowties in ever wider rings of ten.

import { cyclotomic, type Cyc, type Ring } from "./cyclotomic";
import { centredWindow } from "./hat";

/** The ring every girih tile is walked out in: ℤ[ζ10], ζ a turn of 36°. */
export const Z10: Ring = cyclotomic(10);

export type GirihKind = "decagon" | "pentagon" | "hexagon" | "bowtie" | "rhombus";

/** Each kind's turn at each of its corners, from its first, in tenths of a
 * full turn (36°): the walk turns left by that much at the corner. A corner
 * of 144° turns 1, 108° turns 2, 72° turns 3, and the bowtie's 216° turns
 * −1. The hexagon and the bowtie start at a 72° corner. */
export const GIRIH_TURNS: Readonly<Record<GirihKind, readonly number[]>> = {
  decagon: [1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
  pentagon: [2, 2, 2, 2, 2],
  hexagon: [3, 1, 1, 3, 1, 1],
  bowtie: [3, 3, -1, 3, 3, -1],
  rhombus: [3, 2, 3, 2],
};

/** A tile of `kind` whose first corner is `at` and whose first side leaves
 * it in direction ζ^`dir`, every side `size` long (a unit, unless given):
 * walked out a side at a time, turning at each corner, and checked to
 * close. Counter-clockwise. */
export function girihCell(kind: GirihKind, at: Cyc, dir: number, size: Cyc = Z10.one): Cyc[] {
  const turns = GIRIH_TURNS[kind];
  const out: Cyc[] = [];
  let p = at;
  let d = dir;
  turns.forEach((_, i) => {
    out.push(p);
    p = Z10.add(p, Z10.mul(size, Z10.zeta(d)));
    d += turns[(i + 1) % turns.length]!;
  });
  if (!Z10.eq(p, at)) throw new Error(`girihCell: a ${kind} does not close`);
  return out;
}

/** A tile placed: its kind, first corner and first side's direction. */
export interface GirihTile {
  kind: GirihKind;
  at: Cyc;
  dir: number;
}

/** τ = ζ + ζ⁻¹ = 2 cos 36°, the golden ratio, and τ² = τ + 1, how much the
 * rule grows a tile. */
const TAU: Cyc = Z10.add(Z10.zeta(1), Z10.zeta(-1));
export const TAU2: Cyc = Z10.add(TAU, Z10.one);

/** The point Σ c_k ζ^k the data writes as its coefficients. */
export function girihPoint(coefficients: readonly number[]): Cyc {
  return coefficients.reduce(
    (sum, c, k) =>
      Z10.add(
        sum,
        Z10.zeta(k).map((x) => x * c),
      ),
    Z10.zero,
  );
}

type Daughter = readonly [kind: GirihKind, at: readonly number[], dir: number];

/** The rule: each big tile — first corner at 0, first side along ζ⁰, every
 * side τ² long — and the whole small tiles inside it, every small tile's
 * first corner as `girihPoint` reads it. The hexagons halved by its sides
 * are not listed: one lies along every side (`subdivide`). */
// prettier-ignore
const RULE: Readonly<Partial<Record<GirihKind, readonly Daughter[]>>> = {
  decagon: [
    ["decagon", [0, 1, 1, 1], 0],
    ["hexagon", [0, 0, 0, 0], 1], ["hexagon", [2, 0, 1, -1], 2], ["hexagon", [3, 1, 2, -1], 3],
    ["hexagon", [3, 2, 3, 0], 4], ["hexagon", [2, 3, 3, 2], 5], ["hexagon", [0, 4, 2, 4], 6],
    ["hexagon", [-2, 4, 1, 5], 7], ["hexagon", [-3, 3, 0, 5], 8], ["hexagon", [-3, 2, -1, 4], 9],
    ["hexagon", [-2, 1, -1, 2], 0],
    ["bowtie", [0, 1, 0, 0], 0], ["bowtie", [2, 0, 2, -1], 1], ["bowtie", [3, 1, 2, 0], 2],
    ["bowtie", [2, 3, 2, 1], 3], ["bowtie", [1, 3, 3, 2], 4], ["bowtie", [0, 3, 2, 4], 5],
    ["bowtie", [-2, 4, 0, 5], 6], ["bowtie", [-3, 3, 0, 4], 7], ["bowtie", [-2, 1, 0, 3], 8],
    ["bowtie", [-1, 1, -1, 2], 9],
  ],
  hexagon: [
    ["hexagon", [2, 0, 1, -1], 2], ["hexagon", [1, 2, 2, 1], 7],
    ["bowtie", [2, 1, 2, -1], 0], ["bowtie", [1, 1, 1, 1], 5], ["bowtie", [2, 0, 2, -1], 1],
  ],
  bowtie: [
    ["bowtie", [0, 1, 0, 0], 0],
    ["bowtie", [0, 1, 1, 1], 0],
  ],
};

/** The kinds the rule cuts. */
export const SUBDIVIDED: readonly GirihKind[] = ["decagon", "hexagon", "bowtie"];

const tileKey = (cell: readonly Cyc[]): string =>
  cell
    .map((v) => Z10.key(v))
    .sort()
    .join("|");

/** The tiles once each is grown by τ² and cut by the rule: the small tiles
 * inside each big one, then one small hexagon along each big side — its long
 * diagonal the side — kept once where two big tiles share the side. In the
 * order the big tiles come, each one's own small tiles first, then its
 * sides' hexagons that are new. */
export function subdivide(tiles: readonly GirihTile[]): GirihTile[] {
  const out: GirihTile[] = [];
  const seen = new Set<string>();
  const add = (tile: GirihTile): void => {
    const key = tileKey(girihCell(tile.kind, tile.at, tile.dir));
    if (seen.has(key)) return;
    seen.add(key);
    out.push(tile);
  };
  for (const { kind, at, dir } of tiles) {
    const rule = RULE[kind];
    if (!rule) throw new Error(`subdivide: the rule does not cut a ${kind}`);
    const origin = Z10.mul(TAU2, at);
    const turn = Z10.zeta(dir);
    for (const [k, q, e] of rule)
      add({ kind: k, at: Z10.add(origin, Z10.mul(turn, girihPoint(q))), dir: dir + e });
    const big = girihCell(kind, origin, dir, TAU2);
    const turns = GIRIH_TURNS[kind];
    let d = dir;
    big.forEach((corner, i) => {
      // the hexagon from this corner, its long diagonal along side i
      add({ kind: "hexagon", at: corner, dir: d - 1 });
      d += turns[(i + 1) % turns.length]!;
    });
  }
  return out.map((t) => ({ ...t, dir: ((t.dir % 10) + 10) % 10 }));
}

/** The self-similar pattern: one unit decagon cut `depth` times, every
 * tile a unit one — its decagon, the first, at its centre. */
export function girihPatch(depth: number): GirihTile[] {
  let tiles: GirihTile[] = [{ kind: "decagon", at: Z10.zero, dir: 0 }];
  for (let i = 0; i < depth; i++) tiles = subdivide(tiles);
  return tiles;
}

/** The cells of `tiles`. */
export const girihCells = (tiles: readonly GirihTile[]): Cyc[][] =>
  tiles.map((t) => girihCell(t.kind, t.at, t.dir));

/** A window on the self-similar pattern: the `keep` tiles of the patch
 * grown `depth` times nearest its middle — the decagon — as the hat's
 * windows are kept (`centredWindow`, a square block), or nearest tile
 * `centre`'s middle: another board from the same patch. With `keep` null,
 * the whole patch. */
export function girihWindow(
  depth: number,
  keep: number | null,
  centre?: number,
): { ring: Ring; cells: Cyc[][]; tiles: GirihTile[] } {
  const tiles = girihPatch(depth);
  const cells = girihCells(tiles);
  if (keep === null) return { ring: Z10, cells, tiles };
  const kept = centredWindow(Z10, cells, keep, centre);
  return { ring: Z10, cells: kept.map((i) => cells[i]!), tiles: kept.map((i) => tiles[i]!) };
}

// -- the periodic tilings --------------------------------------------------

export interface GirihTiling {
  key: string;
  /** What the game calls it. */
  name: string;
  /** What it is, in words: the catalog's tooltip. */
  label: string;
  /** The two lattice steps of its period, before any cut. */
  a: readonly number[];
  b: readonly number[];
  /** One period's tiles before any cut: kind, first corner, first side's
   * direction. */
  tiles: readonly Daughter[];
  /** How many times the rule cuts the period (0 or 1). */
  subdivide: number;
}

/** The periodic girih tilings, in the order they are listed. */
// prettier-ignore
export const GIRIH_TILINGS: readonly GirihTiling[] = [
  {
    key: "girihdecagons",
    name: "Decagons and bowties",
    label: "Girih decagons side by side in a lattice, a bowtie in every gap",
    a: [2, 0, 2, -1], b: [-1, 2, 0, 2],
    tiles: [["decagon", [0, 0, 0, 0], 0], ["bowtie", [-1, -2, -2, -1], 4]],
    subdivide: 0,
  },
  {
    key: "girihhexagons",
    name: "Hexagons cut",
    label: "Big girih hexagons side by side, each cut into hexagons and bowties",
    a: [1, 1, 0, 0], b: [0, 1, 1, 0],
    tiles: [["hexagon", [0, 0, 0, 0], 0]],
    subdivide: 1,
  },
  {
    key: "girihbowties",
    name: "Bowties cut",
    label: "Big girih bowties side by side, each cut into bowties and hexagons",
    a: [1, 0, 0, 1], b: [0, 0, 1, 1],
    tiles: [["bowtie", [0, 0, 0, 0], 0]],
    subdivide: 1,
  },
];

/** The periodic girih tiling keyed `key`. */
export function girihTiling(key: string): GirihTiling {
  const spec = GIRIH_TILINGS.find((t) => t.key === key);
  if (!spec) throw new Error(`no girih tiling ${key}`);
  return spec;
}

type XY = [number, number];

/** A periodic tiling's lattice steps, after its cuts. */
export function girihSteps(key: string): [Cyc, Cyc] {
  const spec = girihTiling(key);
  let [a, b] = [girihPoint(spec.a), girihPoint(spec.b)];
  for (let i = 0; i < spec.subdivide; i++) [a, b] = [Z10.mul(TAU2, a), Z10.mul(TAU2, b)];
  return [a, b];
}

/** The periods i·a + j·b for lo ≤ i, j ≤ hi of the tiling before its cuts,
 * laid out and then cut: every tile once (a hexagon two big tiles lay along
 * their side is one). A cut patch's hexagons along its rim stick out past
 * it, halves the big tiles outside would have met. */
export function girihPeriodicPatch(key: string, lo: number, hi: number): GirihTile[] {
  const memo = `${key}|${lo}|${hi}`;
  const known = PATCHES.get(memo);
  if (known) return known;
  const spec = girihTiling(key);
  const [a, b] = [girihPoint(spec.a), girihPoint(spec.b)];
  let tiles: GirihTile[] = [];
  for (let i = lo; i <= hi; i++)
    for (let j = lo; j <= hi; j++) {
      const t = Z10.add(
        a.map((x) => x * i),
        b.map((x) => x * j),
      );
      for (const [kind, at, dir] of spec.tiles)
        tiles.push({ kind, at: Z10.add(t, girihPoint(at)), dir });
    }
  for (let s = 0; s < spec.subdivide; s++) tiles = subdivide(tiles);
  if (PATCHES.size > 32) PATCHES.clear();
  PATCHES.set(memo, tiles);
  return tiles;
}

/** The patches built, by tiling and block: a board search cuts thousands
 * of windows from a few. */
const PATCHES = new Map<string, GirihTile[]>();

/** The tiles of periodic tiling `key` that fit whole in a `box`-edge square
 * — centred on its period's first tile, after its cuts, moved by `offset` —
 * and of those the largest piece joined edge to edge, as the star tilings'
 * windows are cut (`starWindow`). A corner on the square's edge, to a
 * millionth, is inside it. */
export function girihPeriodicWindow(
  key: string,
  box: number,
  offset: XY = [0, 0],
): { ring: Ring; cells: Cyc[][]; centre: XY } {
  const spec = girihTiling(key);
  const [a, b] = girihSteps(key).map((v) => Z10.toXY(v));
  const first = girihPeriodicPatch(key, 0, 0)[0]!;
  const cell0 = girihCell(first.kind, first.at, first.dir);
  const c0 = cell0.map((v) => Z10.toXY(v));
  const centre: XY = [
    c0.reduce((s, p) => s + p[0], 0) / c0.length + offset[0],
    c0.reduce((s, p) => s + p[1], 0) / c0.length + offset[1],
  ];
  // the periods (before the cuts) whose tiles can reach the square
  const grow = spec.subdivide ? 2.618033988749895 ** spec.subdivide : 1;
  const reach = box / 2 + Math.max(Math.hypot(...a!), Math.hypot(...b!)) + 2 * grow;
  const det = a![0] * b![1] - a![1] * b![0];
  const lattice = ([x, y]: XY): XY => [
    (x * b![1] - y * b![0]) / det,
    (a![0] * y - a![1] * x) / det,
  ];
  const corners = [
    [-1, -1],
    [-1, 1],
    [1, -1],
    [1, 1],
  ].map(([sx, sy]) => lattice([centre[0] + sx! * reach, centre[1] + sy! * reach]));
  const lo = Math.floor(Math.min(...corners.flat())) - 1;
  const hi = Math.ceil(Math.max(...corners.flat())) + 1;
  const cells = cellsOf(girihPeriodicPatch(key, lo, hi));
  const half = box / 2;
  const slack = 1e-6;
  const kept = cells.filter((cell) =>
    cell.every((v) => {
      const [x, y] = Z10.toXY(v);
      return Math.abs(x - centre[0]) <= half + slack && Math.abs(y - centre[1]) <= half + slack;
    }),
  );
  return { ring: Z10, cells: largestPiece(kept), centre };
}

const CELLS = new WeakMap<readonly GirihTile[], Cyc[][]>();
const cellsOf = (tiles: readonly GirihTile[]): Cyc[][] => {
  let cells = CELLS.get(tiles);
  if (!cells) CELLS.set(tiles, (cells = girihCells(tiles)));
  return cells;
};

/** The largest of `cells`' pieces joined edge to edge (the first, of two as
 * large): a tile meeting the rest at a point only is left out. */
function largestPiece(cells: Cyc[][]): Cyc[][] {
  const edgeKey = (u: Cyc, v: Cyc): string => {
    const [p, q] = [Z10.key(u), Z10.key(v)];
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
