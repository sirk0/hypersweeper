// Colourings: a periodic board painted by its symmetries, and the edge marks
// that let a player lay it.
//
// A colouring of a tiling paints each tile so that the pattern repeats with a
// coarser period than the tiling's: squares in rows, aaaa over bbbb, or as a
// checkerboard. Each such colouring here is linear in the tiling's lattice:
// a tile of translation class `t` at lattice point (i, j) is colour
// (a·i + b·j + c[t]) mod k, for k colours — rows are (0, 1), the checkerboard
// (1, 1). Every candidate with each colour equally common is tried.
//
// No one tile can check a colouring, but every edge can: a tile of colour a
// with b across an edge carries the mark (a, b) there (geometry/marks.ts),
// and the tile across carries (b, a) — drawn, wherever the two differ, as a
// half disc of the colour across. So each colouring becomes a tray of
// marked tiles, and the frontier checks the marks as tiles go down. A
// colouring is kept only where every tile of one colour is the same marked
// tile, up to a turn (`makeLevel` reads off the kinds; the caller checks
// there is one per colour) — the colourings that look alike everywhere.
//
// The same colouring in one colour, with a line drawn across every edge
// between two tiles that were the same colour, is a lined board: a line meets
// a line, a blank edge a blank one. A colouring with no two tiles of a colour
// touching has no lines, and no lined board.
//
// The window's rim edges have no tile across them on the board, but they do
// in the tiling, and a tray tile is the tiling's tile: which tile lies across
// each edge of each translation class is read off the window's inner edges
// (`atlas`), so a rim tile's marks are its marks in the tiling.

import type { Cyc, Ring } from "./geometry/cyclotomic";
import {
  BLANK,
  LINE,
  SAME,
  colourMark,
  colours as pairOf,
  shared as sharedOf,
  sharedMark,
} from "./geometry/marks";
import type { Piece, Shape } from "./geometry/shape";
import { selfTurns } from "./geometry/shape";

/** The translations a tiling repeats by: every i·u + j·v. */
export interface Lattice {
  u: Cyc;
  v: Cyc;
}

/** One way to paint a board: each cell's edge marks, piece by piece, and
 * its colour. */
export interface Painting {
  /** How many colours: 1 for a lined board. */
  colours: number;
  /** Lines in one colour, rather than colours. */
  lines: boolean;
  /** Each edge's mark: the colour pair (`colourMark`) — this tile's, the one
   * across. */
  marks: number[][][];
  /** The same edges with the colours' order forgotten (`sharedMark`: the two
   * colours an edge lies between, or `SAME`): where these make one tile per
   * shape, every tile reads alike but for its own colour, and the colouring
   * plays as its lined board does. Unset on a lined board, and where no two
   * tiles of a colour touch. */
  alike?: number[][][];
  /** Each cell's colour, 0 on a lined board. */
  paints: number[];
  /** One colour of a 3-colouring by itself, the other two made one: a third
   * of the tiles one colour, two thirds the other. */
  third?: boolean;
  /** Which colouring it is, to paint it again (`paintingOf`). */
  params: PaintingParams;
}

/** Where a cell lies in the tiling: its translation class, its lattice point,
 * and which of its vertices the class's first cell's vertex 0 lands on. */
interface Site {
  type: number;
  i: number;
  j: number;
  shift: number;
}

const mod = (a: number, k: number): number => ((a % k) + k) % k;

/** i·u + j·v. */
function at(lattice: Lattice, i: number, j: number): Cyc {
  return lattice.u.map((x, n) => i * x + j * lattice.v[n]!);
}

/** Each cell's site: its translation class (the first cell of each is its
 * base) and where in the lattice it lies. The lattice point is solved for in
 * floats — choosing among whole numbers — and then checked exactly. */
function sitesOf(ring: Ring, cells: Piece[][], lattice: Lattice): Site[] {
  const [ux, uy] = ring.toXY(lattice.u);
  const [vx, vy] = ring.toXY(lattice.v);
  const det = ux * vy - uy * vx;
  const bases: Cyc[][] = [];
  return cells.map((cell) => {
    if (cell.length !== 1) throw new Error("colourings: one piece a tile");
    const verts = cell[0]!.verts;
    const m = verts.length;
    for (const [type, base] of bases.entries()) {
      if (base.length !== m) continue;
      for (let s = 0; s < m; s++) {
        const t = ring.sub(verts[s]!, base[0]!);
        if (!base.every((b, n) => ring.eq(verts[(s + n) % m]!, ring.add(b, t)))) continue;
        const [dx, dy] = ring.toXY(t);
        const i = Math.round((dx * vy - dy * vx) / det);
        const j = Math.round((ux * dy - uy * dx) / det);
        if (ring.eq(t, at(lattice, i, j))) return { type, i, j, shift: s };
      }
    }
    bases.push(verts);
    return { type: bases.length - 1, i: 0, j: 0, shift: 0 };
  });
}

/** Across each edge of each translation class (`type:edge`, the edge counted
 * from the class's base), which class lies, and how far along the lattice. */
type Atlas = Map<string, { type: number; di: number; dj: number }>;

function atlasOf(ring: Ring, cells: Piece[][], sites: Site[]): Atlas {
  const byEdge = new Map<string, number>();
  cells.forEach((cell, c) => {
    const verts = cell[0]!.verts;
    verts.forEach((a, e) =>
      byEdge.set(`${ring.key(a)}>${ring.key(verts[(e + 1) % verts.length]!)}`, c),
    );
  });
  const atlas: Atlas = new Map();
  cells.forEach((cell, c) => {
    const verts = cell[0]!.verts;
    const here = sites[c]!;
    const m = verts.length;
    verts.forEach((a, e) => {
      const across = byEdge.get(`${ring.key(verts[(e + 1) % m]!)}>${ring.key(a)}`);
      if (across === undefined) return;
      const there = sites[across]!;
      const key = `${here.type}:${mod(e - here.shift, m)}`;
      const entry = { type: there.type, di: there.i - here.i, dj: there.j - here.j };
      const known = atlas.get(key);
      if (known && (known.type !== entry.type || known.di !== entry.di || known.dj !== entry.dj))
        throw new Error("colourings: the lattice does not repeat the tiling");
      atlas.set(key, entry);
    });
  });
  return atlas;
}

/** Which colouring a painting is: (a·i + b·j + c[t]) mod k — with `alone`,
 * that one colour against the other two made one — as edge marks, or with
 * `lines` as its lined board. Enough to paint it again (`paintingOf`), so a
 * search's choices can be written down (`src/colourings.json`). */
export interface PaintingParams {
  k: number;
  a: number;
  b: number;
  c: number[];
  alone?: number;
  lines: boolean;
}

/** A board's cells placed in its tiling: each cell's site, and what lies
 * across each edge of each translation class. */
interface Placed {
  cells: Piece[][];
  sites: Site[];
  /** Across each edge of each cell: the class and the lattice point. */
  across: { type: number; i: number; j: number }[][];
  types: number;
}

/** Same vertices, in any order. */
const cellKey = (ring: Ring, cell: Piece[]): string =>
  cell[0]!.verts
    .map((v) => ring.key(v))
    .sort()
    .join("|");

/** Place `cells` in the tiling `lattice` repeats — reading what lies across
 * each edge off the board's own inner edges, and off `context`'s, a bigger
 * patch of the same tiling in the same coordinates (where the board is too
 * small to show every tile's neighbours: the snub hexagonal's one hexagon). */
function place(ring: Ring, cells: Piece[][], lattice: Lattice, context: Piece[][] = []): Placed {
  const own = new Set(cells.map((c) => cellKey(ring, c)));
  // the board's cells first, so each class's base is one of them
  const all = [...cells, ...context.filter((c) => !own.has(cellKey(ring, c)))];
  const sites = sitesOf(ring, all, lattice);
  const atlas = atlasOf(ring, all, sites);
  const types = Math.max(...sites.map((s) => s.type)) + 1;
  const across = cells.map((cell, c) => {
    const s = sites[c]!;
    const m = cell[0]!.verts.length;
    return Array.from({ length: m }, (_, e) => {
      const there = atlas.get(`${s.type}:${mod(e - s.shift, m)}`);
      if (!there) throw new Error("colourings: the window is too small to see every neighbour");
      return { type: there.type, i: s.i + there.di, j: s.j + there.dj };
    });
  });
  return { cells, sites, across, types };
}

/** The colouring `colour` in `count` colours as edge marks — and, with
 * `lined`, the lined board it makes in one colour, where it has lines. */
function paint(
  { sites, across }: Placed,
  colour: (t: number, i: number, j: number) => number,
  count: number,
  params: PaintingParams,
  lined: boolean,
  kinds?: readonly number[],
): Painting[] {
  const out: Painting[] = [];
  const pairs = across.map((edges, cell) => {
    const s = sites[cell]!;
    const own = colour(s.type, s.i, s.j);
    return edges.map((there) => [own, colour(there.type, there.i, there.j)] as const);
  });
  const paints = pairs.map((edges) => edges[0]![0]);
  if (
    !params.lines &&
    !(
      kinds &&
      split(
        pairs.map((edges) => edges.map(([own, other]) => colourMark(own, other))),
        (c) => `${paints[c]}:${kinds[c]}`,
      )
    )
  )
    out.push({
      colours: count,
      lines: false,
      marks: pairs.map((edges) => [edges.map(([own, other]) => colourMark(own, other))]),
      // (only where tiles of one colour touch: where colours alternate, every
      // edge lies between two colours and reads alike, yet the tiles must
      // alternate — the checkerboard)
      ...(pairs.some((edges) => edges.some(([own, other]) => own === other))
        ? { alike: pairs.map((edges) => [edges.map(([own, other]) => sharedMark(own, other))]) }
        : {}),
      paints,
      ...(params.alone !== undefined ? { third: true } : {}),
      params,
    });
  if (!lined) return out;
  const lines = pairs.map((edges) => [edges.map(([own, other]) => (own === other ? LINE : BLANK))]);
  const flat = lines.flat(2);
  if (
    flat.includes(LINE) &&
    flat.includes(BLANK) &&
    !(
      kinds &&
      split(
        lines.map((cell) => cell[0]!),
        (c) => String(kinds[c]),
      )
    )
  )
    out.push({
      colours: 1,
      lines: true,
      marks: lines,
      paints: paints.map(() => 0),
      params: { ...params, lines: true },
    });
  return out;
}

/** Whether cells of one group read their marks differently round them
 * (`marksKey`): then they are more kinds than groups. */
export function split(
  marks: readonly (readonly number[])[],
  group: (cell: number) => string,
): boolean {
  const keys = new Map<string, string>();
  return marks.some((cell, c) => {
    const g = group(c);
    const key = marksKey(cell);
    const known = keys.get(g);
    keys.set(g, key);
    return known !== undefined && known !== key;
  });
}

/** The colour function `params` names. */
function colourOf(params: PaintingParams): (t: number, i: number, j: number) => number {
  const { k, a, b, c, alone } = params;
  const base = (t: number, i: number, j: number): number => mod(a * i + b * j + c[t]!, k);
  return alone === undefined ? base : (t, i, j) => (base(t, i, j) === alone ? 1 : 0);
}

/**
 * Every linear colouring of the board `cells` in 2 or 3 colours (`counts`)
 * with each colour equally common, as edge marks — and, for each, the lined
 * board it makes in one colour, where it has lines; and each 3-colouring
 * with two of its colours made one, in 2 colours, a third and two thirds.
 * `context`, a bigger patch of the same tiling in the same coordinates, shows
 * the board's rim tiles' neighbours where the board itself does not. With
 * `kinds`, each cell's tile kind on the plain board, a painting is left out
 * where two cells of one kind and colour read their marks differently: it
 * could make no tray of one tile per colour and kind. Not yet
 * sorted out: two may make the same tray, and some no tray of one tile per
 * colour; the caller builds each and keeps what is new. Made one at a time:
 * a board of nine translation classes (the snub hexagonal's) has hundreds of
 * thousands.
 */
export function* paintings(
  ring: Ring,
  cells: Piece[][],
  lattice: Lattice,
  counts: readonly number[] = [2, 3],
  context: Piece[][] = [],
  kinds?: readonly number[],
): Generator<Painting> {
  const placed = place(ring, cells, lattice, context);
  const { types } = placed;
  for (const k of counts) {
    // every c with c[0] = 0 (a colouring and its colours shifted are one)
    const offsets: number[][] = [];
    for (let n = 0; n < k ** (types - 1); n++)
      offsets.push([0, ...Array.from({ length: types - 1 }, (_, t) => Math.floor(n / k ** t) % k)]);
    for (let a = 0; a < k; a++) {
      for (let b = 0; b < k; b++) {
        for (const c of offsets) {
          const params: PaintingParams = { k, a, b, c, lines: false };
          const colour = colourOf(params);
          // each colour equally common over one period of the colouring
          const seen = new Array<number>(k).fill(0);
          for (let t = 0; t < types; t++)
            for (let i = 0; i < k; i++) for (let j = 0; j < k; j++) seen[colour(t, i, j)]!++;
          if (seen.some((n) => n !== seen[0])) continue;
          yield* paint(placed, colour, k, params, true, kinds);
          // and in two colours, one of the three by itself: a third of the
          // tiles one colour, the rest the other (the hexagons' only way
          // in two colours with neither all of one tile)
          if (k === 3)
            for (let alone = 0; alone < 3; alone++) {
              const third: PaintingParams = { ...params, alone };
              yield* paint(placed, colourOf(third), 2, third, false, kinds);
            }
        }
      }
    }
  }
}

/** The one painting `params` names (as `paintings` made it). */
export function paintingOf(
  ring: Ring,
  cells: Piece[][],
  lattice: Lattice,
  params: PaintingParams,
  context: Piece[][] = [],
): Painting {
  const placed = place(ring, cells, lattice, context);
  const count = params.lines ? 1 : params.alone !== undefined ? 2 : params.k;
  const made = paint(placed, colourOf(params), count, params, params.lines);
  const painting = made.find((p) => p.lines === params.lines);
  if (!painting) throw new Error("colourings: that painting has no lines");
  return painting;
}

/**
 * The translations that carry the patch `cells` onto itself, as far as it
 * reaches: the shortest one, and the shortest not along it — in a plane
 * lattice those two are a basis. A candidate is the step from a largest
 * cell to a translated copy of it, kept if it carries every cell whose image
 * lands on the patch's vertices onto a cell. Exact but for ordering lengths
 * and reading the sign of a cross product, both floats of values already
 * known to differ or be non-zero.
 */
export function latticeOf(ring: Ring, cells: Piece[][]): Lattice {
  const polys = cells.map((c) => c[0]!.verts);
  const vertKeys = new Set(polys.flat().map((v) => ring.key(v)));
  const cellKeys = new Set(cells.map((c) => cellKey(ring, c)));
  const big = polys.reduce((a, c) => (c.length > a.length ? c : a), polys[0]!);
  const found: { t: Cyc; x: number; y: number; len: number }[] = [];
  const tried = new Set<string>();
  for (const poly of polys) {
    if (poly.length !== big.length) continue;
    for (let s = 0; s < poly.length; s++) {
      const t = ring.sub(poly[s]!, big[0]!);
      if (ring.eq(t, ring.zero) || tried.has(ring.key(t))) continue;
      if (!big.every((v, n) => ring.eq(poly[(s + n) % poly.length]!, ring.add(v, t)))) continue;
      tried.add(ring.key(t));
      const carries = polys.every((p) => {
        const moved = p.map((v) => ring.add(v, t));
        if (!moved.every((v) => vertKeys.has(ring.key(v)))) return true;
        return cellKeys.has(
          moved
            .map((v) => ring.key(v))
            .sort()
            .join("|"),
        );
      });
      if (!carries) continue;
      const [x, y] = ring.toXY(t);
      found.push({ t, x, y, len: Math.hypot(x, y) });
    }
  }
  found.sort((p, q) => p.len - q.len);
  const u = found[0];
  const v = u && found.find((q) => Math.abs(u.x * q.y - u.y * q.x) > 1e-9 * u.len * q.len);
  if (!u || !v) throw new Error("colourings: the patch shows no lattice");
  return { u: u.t, v: v.t };
}

/** A cell's marks, read round it either way from any edge: the same for two
 * cells of one kind (a kind is its cells up to a turn and a mirror, which
 * carry its marks round its edges), so two different keys are two kinds. */
export function marksKey(marks: readonly number[]): string {
  const m = marks.length;
  // the least of the 2m readings, compared in place, then written once
  let best = { from: 0, step: 1 };
  const at = (r: { from: number; step: number }, n: number): number =>
    marks[mod(r.from + r.step * n, m)]!;
  for (const step of [1, -1])
    for (let from = 0; from < m; from++) {
      const r = { from, step };
      for (let n = 0; n < m; n++) {
        const d = at(r, n) - at(best, n);
        if (d < 0) best = r;
        if (d !== 0) break;
      }
    }
  return Array.from({ length: m }, (_, n) => at(best, n)).join(",");
}

/** The ways a shape's own turns (unmarked) shift its edges: for each, how
 * far round its vertex list a turn carries vertex 0. */
function shifts(shape: Shape): number[] {
  const { ring } = shape;
  const verts = shape.pieces[0]!.verts;
  const m = verts.length;
  const bare: Shape = { ring, pieces: [{ verts }] };
  return selfTurns(bare).map((k) => {
    const turned = verts.map((v) => ring.mul(ring.zeta(k), v));
    for (let s = 0; s < m; s++) {
      const t = ring.sub(verts[s]!, turned[0]!);
      if (turned.every((v, n) => ring.eq(ring.add(v, t), verts[(s + n) % m]!))) return s;
    }
    throw new Error("colourings: a self-turn that moves no vertex onto one");
  });
}

/** All orderings of 0..k-1. */
function permutations(k: number): number[][] {
  if (k <= 1) return [[0]];
  return permutations(k - 1).flatMap((p) =>
    Array.from({ length: k }, (_, i) => [...p.slice(0, i), k - 1, ...p.slice(i)]),
  );
}

/** One key for exactly the trays that are the same up to turning a tile,
 * mirroring them all, and naming the colours differently: two colourings
 * with one key are one puzzle (any cover wins, and the tray is what a
 * player has). */
export function traySignature(tiles: readonly Shape[]): string {
  const colourCount =
    1 +
    Math.max(
      0,
      ...tiles
        .flatMap((t) => t.pieces[0]!.marks ?? [])
        .map((m) => Math.max(pairOf(m)?.own ?? 0, pairOf(m)?.other ?? 0, sharedOf(m)?.hi ?? 0)),
    );
  let best: string | null = null;
  for (const perm of permutations(colourCount)) {
    for (const mirror of [false, true]) {
      const keys = tiles.map((shape) => {
        const marks = (shape.pieces[0]!.marks ?? []).map((m) => {
          const pair = pairOf(m);
          if (pair) return `${perm[pair.own]}${perm[pair.other]}`;
          const edge = sharedOf(m);
          if (edge) return `=${[perm[edge.lo]!, perm[edge.hi]!].sort().join("")}`;
          return String(m);
        });
        const seq = mirror ? [...marks].reverse() : marks;
        const m = seq.length;
        const turned = shifts(shape).map((s) =>
          Array.from({ length: m }, (_, n) => seq[mod(n + s, m)]!).join(","),
        );
        return `${m}:${turned.sort()[0]}`;
      });
      const key = keys.sort().join("|");
      if (best === null || key < best) best = key;
    }
  }
  return best!;
}

/** How many of each tile's edges have the same colour across (or a line):
 * the same count for every tile, or null where tiles differ. */
export function sameEdges(tiles: readonly Shape[]): number | null {
  const counts = tiles.map(
    (t) =>
      (t.pieces[0]!.marks ?? []).filter((m) => {
        if (m === LINE || m === SAME) return true;
        const pair = pairOf(m);
        return pair !== null && pair.own === pair.other;
      }).length,
  );
  return counts.every((n) => n === counts[0]) ? counts[0]! : null;
}
