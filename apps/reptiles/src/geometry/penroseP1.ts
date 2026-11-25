// Penrose's first tiling, P1 (Penrose, "The role of aesthetics in pure and
// applied mathematical research", 1974; "Pentaplexity", 1979): regular
// pentagons, five-pointed stars, boats (three points of a star) and thin
// 36° diamonds, every side a unit and every corner a multiple of 36°, so every
// tile is walked out exactly in ℤ[ζ10]. Hypersweeper has no board for it, so it
// is grown here, and the tests are its oracle (`tests/unit/grown.test.ts`).
//
// The rule grows each tile by φ² and cuts it, as the Tilings Encyclopedia
// draws it ("Penrose Pentagon Boat Star"):
//
// - A big pentagon is six unit ones: one at each corner, two sides along the
//   big one's, and one in the middle, turned against it, sharing a side with
//   each. That leaves a golden triangle (a half diamond) on the middle of each
//   big side. Two big pentagons side by side make a diamond of their two
//   halves.
// - A big star, boat or diamond takes those halves on its sides too, which lie
//   in the big pentagons round it (in P1 no two of them ever share a side), and
//   the region they make with it is filled:
//   - the star with a star in its middle, five pentagons and five boats;
//   - the boat with a star toward its base, three pentagons and three boats;
//   - the diamond with a star at one tip, a pentagon and a boat at the other.
//   Each fill was found by an exact search of every way to fill the region.
//   The star has eleven ways, and only this one keeps its five-fold symmetry.
//   The boat has five, and this is the symmetric one the encyclopedia draws.
//   The diamond has two, one for each tip.
//
// Penrose's pentagons come in three kinds, by their matching rules, and they
// decide which tip of each diamond takes the star. The same thing can be read
// off the tiling itself: the star goes at the tip whose two pentagons, the
// ones along the diamond's sides there, each meet three tiles that are not
// pentagons. At the other tip they meet two. That holds at every diamond of
// the encyclopedia's patch, and it is what `subdivide` asks.

import { cyclotomic, type Cyc, type Ring } from "./cyclotomic";

/** The ring every P1 tile is walked out in: ℤ[ζ10], ζ a turn of 36°. */
export const Z10: Ring = cyclotomic(10);

export type P1Kind = "pentagon" | "star" | "boat" | "diamond";

export const P1_KINDS: readonly P1Kind[] = ["pentagon", "star", "boat", "diamond"];

/** Each kind's turn at each of its corners, from its first, in tenths of a
 * full turn: the walk turns left by that much at the corner. A point of 36°
 * turns 4, a pentagon's 108° corner 2, a diamond's or a boat's base corner of
 * 144° 1, and a star's dent of 252° turns −2. The star, the boat and the
 * diamond start at a point; the boat's first, third and fifth corners are
 * its points, and its base runs from its sixth to its seventh. */
export const P1_TURNS: Readonly<Record<P1Kind, readonly number[]>> = {
  pentagon: [2, 2, 2, 2, 2],
  star: [4, -2, 4, -2, 4, -2, 4, -2, 4, -2],
  boat: [4, -2, 4, -2, 4, 1, 1],
  diamond: [4, 1, 4, 1],
};

/** φ = ζ + ζ⁻¹, and φ², how much the rule grows a tile. */
const PHI = Z10.add(Z10.zeta(1), Z10.conj(Z10.zeta(1)));
export const PHI2 = Z10.mul(PHI, PHI);

/** A tile of `kind` whose first corner is `at` and whose first side leaves it
 * in direction ζ^`dir`, every side `size` long (a unit, unless given): walked
 * out a side at a time, turning at each corner, and checked to close.
 * Counter-clockwise. */
export function p1Cell(kind: P1Kind, at: Cyc, dir: number, size: Cyc = Z10.one): Cyc[] {
  const turns = P1_TURNS[kind];
  const out: Cyc[] = [];
  let p = at;
  let d = dir;
  turns.forEach((_, i) => {
    out.push(p);
    p = Z10.add(p, Z10.mul(size, Z10.zeta(d)));
    d += turns[(i + 1) % turns.length]!;
  });
  if (!Z10.eq(p, at)) throw new Error(`p1Cell: a ${kind} does not close`);
  return out;
}

/** A tile placed: its kind, first corner and first side's direction. */
export interface P1Tile {
  kind: P1Kind;
  at: Cyc;
  dir: number;
}

/** A small tile of a big one's fill: its kind, its first corner and its
 * first side's direction in the big tile's frame — the big tile's first
 * corner at 0, its first side along ζ⁰, every side φ². */
type Child = readonly [kind: P1Kind, at: readonly number[], dir: number];

/** The fills of a big star, boat and diamond, each with the half diamonds on
 * its sides (found by an exact search: see above). The diamond's star is at
 * its first corner. */
// prettier-ignore
export const P1_FILLS: Readonly<Record<Exclude<P1Kind, "pentagon">, readonly Child[]>> = {
  star: [
    ["boat", [2, -1, 1, -2], 0], ["boat", [0, 1, 0, 1], 8], ["pentagon", [2, 0, 1, -2], 0],
    ["boat", [4, 0, 2, -3], 2], ["pentagon", [1, 0, 1, -1], 0], ["star", [2, 0, 1, -1], 1],
    ["pentagon", [3, 0, 2, -2], 0], ["pentagon", [1, 1, 1, 0], 0], ["pentagon", [2, 1, 2, -1], 0],
    ["boat", [1, 2, 2, 1], 6], ["boat", [4, 1, 3, -1], 4],
  ],
  boat: [
    ["boat", [2, -1, 1, -2], 0], ["boat", [0, 1, 0, 1], 8], ["pentagon", [2, 0, 1, -1], 8],
    ["boat", [4, 0, 2, -3], 2], ["pentagon", [1, 0, 1, 0], 8], ["star", [1, 1, 1, 0], 9],
    ["pentagon", [3, 0, 2, -1], 8],
  ],
  diamond: [["star", [0, 1, 0, 1], 8], ["pentagon", [1, 1, 0, 0], 9], ["boat", [3, 0, 2, -2], 3]],
};

/** A big pentagon's six small ones, in its frame: one at each corner, with
 * its first side along the big side from that corner, then the middle one,
 * whose sides are the corner ones' sides across from their corners. */
export function pentagonChildren(): P1Tile[] {
  const big = p1Cell("pentagon", Z10.zero, 0, PHI2);
  const corners = big.map((b, i): P1Tile => ({ kind: "pentagon", at: b, dir: 2 * i }));
  // a corner pentagon's third and fourth corners are a side of the middle one,
  // which runs the other way along it: from the fourth, back toward the third
  const [, , third, fourth] = p1Cell("pentagon", Z10.zero, 0);
  void third;
  return [...corners, { kind: "pentagon", at: fourth!, dir: 9 }];
}

/** The diamond two big pentagons make across the side from big corner i
 * (in the big pentagon's frame): its first corner the tip inside this one. */
function edgeDiamond(i: number): P1Tile {
  const big = p1Cell("pentagon", Z10.zero, 0, PHI2);
  const d = 2 * i;
  const p = Z10.add(big[i]!, Z10.zeta(d));
  return { kind: "diamond", at: Z10.add(p, Z10.zeta(d + 2)), dir: d + 7 };
}

const PENTAGON_CHILDREN = pentagonChildren();
const EDGE_DIAMONDS = [0, 1, 2, 3, 4].map(edgeDiamond);

/** The tiles across each side of each tile, by a side's two corners' keys:
 * a side a→b of one tile is b→a of the tile across it. */
function across(cells: readonly Cyc[][]): (i: number, side: number) => number | undefined {
  const owner = new Map<string, number>();
  const key = (a: Cyc, b: Cyc): string => `${Z10.key(a)}>${Z10.key(b)}`;
  cells.forEach((c, i) => c.forEach((a, j) => owner.set(key(a, c[(j + 1) % c.length]!), i)));
  return (i, side) => {
    const c = cells[i]!;
    return owner.get(key(c[(side + 1) % c.length]!, c[side]!));
  };
}

/** One cut of every tile: each grown by φ² and cut by the rule. With
 * `centre`, a pentagon's index, also where its middle child is in the result. */
export function subdivide(tiles: readonly P1Tile[]): P1Tile[];
export function subdivide(tiles: readonly P1Tile[], centre: number): [P1Tile[], number];
export function subdivide(
  tiles: readonly P1Tile[],
  centre?: number,
): P1Tile[] | [P1Tile[], number] {
  let middle = -1;
  const cells = tiles.map((t) => p1Cell(t.kind, t.at, t.dir));
  const next = across(cells);
  // how many sides of tile `i` meet a tile that is not a pentagon, and how
  // many meet nothing (the patch's rim, where the count is not known)
  const others = (i: number | undefined): [number, number] => {
    if (i === undefined) return [0, 1];
    let known = 0;
    let open = 0;
    cells[i]!.forEach((_, s) => {
      const n = next(i, s);
      if (n === undefined) open++;
      else if (tiles[n]!.kind !== "pentagon") known++;
    });
    return [known, open];
  };
  const out: P1Tile[] = [];
  const seen = new Set<string>();
  const place = (base: P1Tile, child: { kind: P1Kind; at: Cyc; dir: number }): void => {
    const at = Z10.add(Z10.mul(PHI2, base.at), Z10.mul(Z10.zeta(base.dir), child.at));
    const tile = { kind: child.kind, at, dir: (((base.dir + child.dir) % 10) + 10) % 10 };
    const key = p1Cell(tile.kind, tile.at, tile.dir)
      .map((v) => Z10.key(v))
      .sort()
      .join(";");
    if (seen.has(key)) throw new Error("subdivide: a tile laid twice");
    seen.add(key);
    out.push(tile);
  };
  tiles.forEach((t, i) => {
    if (t.kind === "pentagon") {
      for (const child of PENTAGON_CHILDREN) place(t, child);
      if (i === centre) middle = out.length - 1;
      // a diamond across each side another pentagon shares, laid once — and
      // across a side that meets nothing yet, the patch's rim, as though a
      // pentagon were there: the seed is a pentagon ringed by pentagons, as
      // the middle one of every big pentagon's six is, and no notch is left
      // in the rim to grow inward with every cut
      for (let s = 0; s < 5; s++) {
        const n = next(i, s);
        const pentagon = n === undefined || tiles[n]!.kind === "pentagon";
        if (pentagon && (n === undefined || i < n)) place(t, EDGE_DIAMONDS[s]!);
      }
      return;
    }
    let frame = t;
    if (t.kind === "diamond") {
      // the star goes at the tip whose two pentagons meet more tiles that are
      // not pentagons: three each there, two at the other tip
      // (near the patch's rim a pentagon there may have sides that meet
      // nothing yet: a tip all of whose sides are known settles it, for the
      // other tip too)
      const tip = (sides: [number, number]): { known: number; open: number } => {
        const [a, b] = sides.map((s) => others(next(i, s)));
        return { known: a![0] + b![0], open: a![1] + b![1] };
      };
      const first = tip([3, 0]);
      const third = tip([1, 2]);
      const starAtThird = !first.open
        ? first.known < 6
        : !third.open
          ? third.known === 6
          : third.known > first.known;
      if (starAtThird) frame = { kind: "diamond", at: cells[i]![2]!, dir: t.dir + 5 };
    }
    for (const [kind, at, dir] of P1_FILLS[t.kind]) place(frame, { kind, at, dir });
  });
  return centre === undefined ? out : [out, middle];
}

/** The tiles laid again with tile `centre` as a pentagon turned 0 at the
 * origin: the whole patch turned and moved, exactly. */
function recentred(tiles: readonly P1Tile[], centre: number): P1Tile[] {
  const { at, dir } = tiles[centre]!;
  const turn = Z10.zeta(-dir);
  return tiles.map((t) => ({
    kind: t.kind,
    at: Z10.mul(turn, Z10.sub(t.at, at)),
    dir: (((t.dir - dir) % 10) + 10) % 10,
  }));
}

/** The tiles whose middles lie within `radius` of the middle of the pentagon
 * at the origin (floats: they only choose which whole tiles stay), in order. */
function disc(tiles: readonly P1Tile[], radius: number): P1Tile[] {
  const [cx, cy] = middleOf(p1Cell("pentagon", Z10.zero, 0));
  return tiles.filter((t) => {
    const [x, y] = middleOf(p1Cell(t.kind, t.at, t.dir));
    return Math.hypot(x - cx, y - cy) <= radius;
  });
}

function middleOf(cell: readonly Cyc[]): [number, number] {
  let x = 0;
  let y = 0;
  for (const v of cell) {
    const [px, py] = Z10.toXY(v);
    x += px;
    y += py;
  }
  return [x / cell.length, y / cell.length];
}

/** How far round its middle pentagon the seed disc is kept, in edges: far
 * enough that a cut's rim, where the tiles round a pentagon are not all
 * known, never reaches what the next disc keeps. */
const SEED_RADIUS = 16;

const tileKey = (t: P1Tile): string => `${t.kind}|${Z10.key(t.at)}|${t.dir}`;

/**
 * P1 round a pentagon ringed by pentagons, ringed by…: the tiling the rule
 * keeps unchanged about such a pentagon (cut, the pentagon's middle child is
 * one again). A rule that looks at a tile's neighbours to cut it cannot be
 * started from one tile — the tiles round it are not there to look at — so it
 * is found as its fixed point: one pentagon cut, the patch laid again with the
 * middle child of the middle pentagon at the origin, cut down to a disc round
 * it, and cut again, until the disc comes out the same. Every tile of it is
 * then one the rule laid knowing all it asks of the tiles round it.
 */
export function p1Seed(): P1Tile[] {
  let tiles: P1Tile[] = [{ kind: "pentagon", at: Z10.zero, dir: 0 }];
  let centre = 0;
  let last = "";
  for (let round = 0; round < 40; round++) {
    [tiles, centre] = subdivide(tiles, centre);
    tiles = disc(recentred(tiles, centre), SEED_RADIUS);
    centre = tiles.findIndex((t) => t.kind === "pentagon" && Z10.isZero(t.at) && t.dir === 0);
    const key = tiles.map(tileKey).sort().join(";");
    if (key === last) return tiles;
    last = key;
  }
  throw new Error("p1Seed: the disc does not settle");
}

/** How much of a cut disc is kept: past it, the rim's tiles — laid not
 * knowing all the tiles round them, their fills reaching out where nothing
 * is — may be wrong, or overlap. */
const KEPT = 0.75;

/** The patch: the seed disc (`p1Seed`) cut `depth` times more, its middle
 * pentagon's middle child at the origin, each cut trimmed back to the disc
 * it is sure of. Every tile a unit one. */
export function p1Patch(depth: number): P1Tile[] {
  let tiles = p1Seed();
  let centre = tiles.findIndex((t) => t.kind === "pentagon" && Z10.isZero(t.at) && t.dir === 0);
  let radius = SEED_RADIUS;
  for (let i = 0; i < depth; i++) {
    [tiles, centre] = subdivide(tiles, centre);
    radius *= ((3 + Math.sqrt(5)) / 2) * KEPT;
    tiles = disc(recentred(tiles, centre), radius);
    centre = tiles.findIndex((t) => t.kind === "pentagon" && Z10.isZero(t.at) && t.dir === 0);
  }
  return tiles;
}

/** `p1Patch` as cells and kinds (the order of `P1_KINDS`), for `GROWN`. */
export function p1Grown(depth: number): { ring: Ring; cells: Cyc[][]; kinds: number[] } {
  const tiles = p1Patch(depth);
  return {
    ring: Z10,
    cells: tiles.map((t) => p1Cell(t.kind, t.at, t.dir)),
    kinds: tiles.map((t) => P1_KINDS.indexOf(t.kind)),
  };
}
