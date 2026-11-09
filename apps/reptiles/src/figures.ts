// The figures: the tray's tiles across every level, matched up — the square
// of 4⁴ is the square of 3³.4², whatever ring each level is built in — and the
// levels grouped by the set of figures their tray holds: one figure (the
// square, the triangle, the Laves tiles…), then pairs, then packs of three
// and four. A level is under exactly one set: the one its tray is.
//
// Two tiles are the same figure when one is a turned, moved or mirrored copy
// of the other at its true size (the Pythagorean tiling's two squares are two
// figures). That is decided exactly: both are lifted into one ring, ℤ[ζN] for
// N the lcm of theirs, and compared by products of their edge vectors — never
// by rounding a coordinate (the repo rule in AGENTS.md). A round tile (the
// Spectre) is its own figure: the same polygon with straight edges (Tile(1,1))
// is another, and two round ones are one only where their curves match too.
// A tile of several pieces (the fish) matches another only piece for piece,
// all under the one motion — the same pieces set apart differently are
// another figure.

import { cyclotomic, dotSign, orient, type Cyc, type Ring } from "./geometry/cyclotomic";
import { posedCurve, regular, sides, signedArea, type Piece, type Shape } from "./geometry/shape";
import { LEVELS, levelByKey, type Level } from "./levels";

/** The levels of plain tiles: what the figures are read from. A level of
 * marked tiles (`decor`) belongs to the set of the tiling it marks
 * (`figureSetOf`), listed on that set's page with it. */
const PLAIN = LEVELS.filter((l) => !l.decor);

const gcd = (a: number, b: number): number => (b === 0 ? a : gcd(b, a % b));
const lcm = (a: number, b: number): number => (a / gcd(a, b)) * b;

/** `a` of ℤ[ζn] (`from`) as an element of ℤ[ζN] (`to`), n dividing N, times
 * the whole number `scale`: ζn is ζN^(N/n). */
function lift(from: Ring, to: Ring, a: Cyc, scale: number): Cyc {
  const step = to.n / from.n;
  let out = to.zero;
  a.forEach((c, j) => {
    if (c !== 0)
      out = to.add(
        out,
        to.zeta(j * step).map((x) => x * c * scale),
      );
  });
  return out;
}

/** The float area at true size: only ever a quick reject, by a margin far past
 * rounding, before the exact test. */
const area = (s: Shape): number =>
  Math.abs(s.pieces.reduce((sum, p) => sum + signedArea(p.verts.map((v) => s.ring.toXY(v))), 0));

/** A shape's pieces' side-count profile, the quick reject for a shape of
 * several: the vertex counts, sorted, and which are round. */
const profile = (s: Shape): string =>
  s.pieces
    .map((p) => `${p.verts.length}${p.curve ? "~" : ""}`)
    .sort()
    .join();

/** Whether `b` is a turned, moved, or mirrored copy of `a` — at the same size,
 * or with `size` false at any size (similar) — round edges and all, piece for
 * piece. Exact. */
export function sameFigure(a: Shape, b: Shape, size = true): boolean {
  if (profile(a) !== profile(b)) return false;
  if (size) {
    const [x, y] = [area(a), area(b)];
    if (Math.abs(x - y) > 1e-6 * Math.max(1, x, y)) return false;
  }
  const ring = cyclotomic(lcm(a.ring.n, b.ring.n));
  // at true size: each scaled by the other's drawing unit (whole numbers)
  const lifted = (s: Shape, scale: number): Piece[] =>
    s.pieces.map((p) => ({
      verts: p.verts.map((v) => lift(s.ring, ring, v, scale)),
      ...(p.curve ? { curve: p.curve } : {}),
    }));
  const pa = lifted(a, b.ring.unit);
  const pb = lifted(b, a.ring.unit);
  // a mirror is the conjugate, listed backwards to stay counter-clockwise
  const mirrored = pa.map((p) => ({
    verts: p.verts.map((v) => ring.conj(v)).reverse(),
    ...(p.curve ? { curve: posedCurve(p.curve, true)! } : {}),
  }));
  const norm = (z: Cyc): Cyc => ring.mul(z, ring.conj(z));
  for (const from of [pa, mirrored]) {
    const [first, ...rest] = from;
    const a0 = first!.verts[0]!;
    const sa = ring.sub(first!.verts[1]!, a0);
    // b = λ·a + τ for one complex λ: anchored on a's first edge landing on
    // each edge of each of b's pieces in turn
    for (const anchor of pb) {
      for (let s = 0; s < anchor.verts.length; s++) {
        const b0 = anchor.verts[s]!;
        const sb = ring.sub(anchor.verts[(s + 1) % anchor.verts.length]!, b0);
        if (size && !ring.eq(norm(sb), norm(sa))) continue;
        // q is where λ·a + τ takes p: (q − b₀)·(a₁ − a₀) = (b₁ − b₀)·(p − a₀)
        const lands = (p: Cyc, q: Cyc): boolean =>
          ring.eq(ring.mul(ring.sub(q, b0), sa), ring.mul(sb, ring.sub(p, a0)));
        // a piece lands on one of b's, listed from some vertex — each edge
        // bulging as the edge of b it lies on
        const onto = (p: Piece, q: Piece): boolean => {
          const m = p.verts.length;
          if (q.verts.length !== m) return false;
          for (let j = 0; j < m; j++) {
            if (
              p.verts.every((v, i) => lands(v, q.verts[(i + j) % m]!)) &&
              (!p.curve || p.curve.every((c, i) => q.curve![(i + j) % m] === c))
            )
              return true;
          }
          return false;
        };
        if (!onto(first!, anchor)) continue;
        const free = pb.filter((q) => q !== anchor);
        if (
          rest.every((p) => {
            const i = free.findIndex((q) => onto(p, q));
            return i >= 0 && free.splice(i, 1).length === 1;
          })
        )
          return true;
      }
    }
  }
  return false;
}

const REGULAR_NAMES: Record<number, string> = {
  3: "Triangle",
  4: "Square",
  5: "Pentagon",
  6: "Hexagon",
  8: "Octagon",
  10: "Decagon",
  12: "Dodecagon",
};

const SIDE_WORDS: Record<number, string> = {
  3: "Triangle",
  4: "Quadrilateral",
  5: "Pentagon",
  6: "Hexagon",
  7: "Heptagon",
  8: "Octagon",
  9: "Nonagon",
  10: "Decagon",
  11: "Hendecagon",
  12: "Dodecagon",
};

/** The regular polygon's name, where `shape` is one, at any size. */
function regularName(shape: Shape): string | undefined {
  if (shape.pieces.length !== 1 || shape.pieces[0]!.curve) return undefined;
  const m = shape.pieces[0]!.verts.length;
  const name = REGULAR_NAMES[m];
  if (!name) return undefined;
  return sameFigure(regular(cyclotomic(m % 2 ? 2 * m : m), m), shape, false) ? name : undefined;
}

/** A quadrilateral's plain name, read exactly in its own ring: a rectangle
 * (the bricks), a rhombus, a kite, or a dart — a kite with a dent. */
function quadName(shape: Shape): string | undefined {
  const { ring, pieces } = shape;
  if (pieces.length !== 1) return undefined;
  const { verts } = pieces[0]!;
  if (verts.length !== 4) return undefined;
  const edges = verts.map((v, i) => ring.sub(verts[(i + 1) % 4]!, v));
  const norms = edges.map((e) => ring.mul(e, ring.conj(e)));
  const same = (i: number, j: number): boolean => ring.eq(norms[i]!, norms[j]!);
  if (edges.every((e, i) => dotSign(ring, e, edges[(i + 1) % 4]!) === 0)) return "Rectangle";
  if (same(0, 1) && same(1, 2) && same(2, 3)) return "Rhombus";
  if ((same(0, 1) && same(2, 3)) || (same(1, 2) && same(3, 0))) {
    const dented = verts.some(
      (v, i) => orient(ring, verts[(i + 3) % 4]!, v, verts[(i + 1) % 4]!) < 0,
    );
    return dented ? "Dart" : "Kite";
  }
  return undefined;
}

export interface Figure {
  id: number;
  /** One tile of this figure as a tray holds it, and the level and kind it is. */
  shape: Shape;
  level: Level;
  kind: number;
  name: string;
  /** A regular polygon, at any size. */
  regular: boolean;
  /** How far from regular: 0 for a regular polygon, more the less regular. */
  distortion: number;
}

/** The rows the figure sets are listed in, in order: one figure, by its side
 * count (seven or more together), and a figure of several pieces apart; pairs,
 * both regular or at least one not; and packs of three or more. */
export const BUCKETS = [
  "triangles",
  "quadrilaterals",
  "pentagons",
  "hexagons",
  "polygons",
  "pieces",
  "regular-pairs",
  "irregular-pairs",
  "packs",
] as const;
export type Bucket = (typeof BUCKETS)[number];

export interface FigureSet {
  /** The key of its first level: the set's id in a URL (`?figure=squares`). */
  key: string;
  figures: Figure[];
  /** Its levels, in the game's order. */
  levels: Level[];
  /** Its figures' names, " + " between: "Triangle + Square". */
  name: string;
  bucket: Bucket;
}

interface Figures {
  figures: Figure[];
  /** Per level key, its tray's figure ids, kind by kind. */
  byLevel: Map<string, number[]>;
  sets: FigureSet[];
}

let memo: Figures | undefined;

function build(): Figures {
  const figures: Figure[] = [];
  const byLevel = new Map<string, number[]>();
  for (const level of PLAIN) {
    byLevel.set(
      level.key,
      level.tiles.map((shape, kind) => {
        const known = figures.find((f) => sameFigure(f.shape, shape));
        if (known) return known.id;
        const id = figures.length;
        figures.push({ id, shape, level, kind, name: "", regular: false, distortion: 0 });
        return id;
      }),
    );
  }
  // levels grouped by the set of figures in their tray, in order of first use
  const groups = new Map<string, Level[]>();
  for (const level of PLAIN) {
    const ids = [...byLevel.get(level.key)!].sort((x, y) => x - y);
    // a lone figure joins the first lone figure of its shape at any size:
    // V4.8²'s triangle and the isosceles right rep-tile are one figure
    if (ids.length === 1) {
      const alike = figures.find(
        (f) => groups.has(String(f.id)) && sameFigure(f.shape, figures[ids[0]!]!.shape, false),
      );
      if (alike) ids[0] = alike.id;
    }
    const key = ids.join(",");
    groups.set(key, [...(groups.get(key) ?? []), level]);
  }
  // the rep-tiles are named for their shape: the sphinx, the 30-60-90 triangle
  const shapeNames = [...groups.entries()]
    .filter(([, levels]) => levels.some((l) => l.group === "reptile"))
    .map(([key, levels]) => ({
      shape: figures[Number(key)]!.shape,
      name: levels.find((l) => l.group === "reptile")!.name,
    }));
  for (const f of figures) {
    // a regular polygon or a brick by its shape; else a rep-tile's shape name;
    // else by the level it alone tiles (V3.6.3.6), else by its shape again,
    // else its sides
    const quad = quadName(f.shape);
    const regular = regularName(f.shape);
    f.regular = regular !== undefined;
    f.distortion = regular ? 0 : distortion(f.shape);
    f.name =
      regular ??
      (quad === "Rectangle" ? quad : undefined) ??
      shapeNames.find((n) => sameFigure(n.shape, f.shape, false))?.name ??
      groups.get(String(f.id))?.[0]?.name ??
      quad ??
      (f.shape.pieces.length > 1 ? `${f.shape.pieces.length} pieces` : undefined) ??
      SIDE_WORDS[sides(f.shape)] ??
      `${sides(f.shape)}-gon`;
  }
  const sets: FigureSet[] = [...groups.entries()].map(([key, levels]) => {
    // in the tray's own order, fewest sides first (a lone figure: the first
    // of its shape)
    const ids = key.includes(",") ? byLevel.get(levels[0]!.key)! : [Number(key)];
    const set = ids.map((id) => figures[id]!);
    const regular = set.every((f) => f.regular);
    const lone = set[0]!.shape;
    const bucket: Bucket =
      set.length === 1
        ? lone.pieces.length > 1
          ? "pieces"
          : ((["triangles", "quadrilaterals", "pentagons", "hexagons"] as const)[sides(lone) - 3] ??
            "polygons")
        : set.length === 2
          ? regular
            ? "regular-pairs"
            : "irregular-pairs"
          : "packs";
    return {
      key: levels[0]!.key,
      figures: set,
      levels,
      name: set.map((f) => f.name).join(" + "),
      bucket,
    };
  });
  // by row; then fewer figures first (the packs of 3 before the 4); then
  // regular first, then closest to regular; then by side counts, fewest first
  // — Triangle + Square, Triangle + Hexagon, Square + …; then by first use
  const first = (s: FigureSet): number => LEVELS.indexOf(s.levels[0]!);
  const irregular = (s: FigureSet): number => (s.figures.every((f) => f.regular) ? 0 : 1);
  const mean = (s: FigureSet): number =>
    s.figures.reduce((sum, f) => sum + f.distortion, 0) / s.figures.length;
  sets.sort(
    (x, y) =>
      BUCKETS.indexOf(x.bucket) - BUCKETS.indexOf(y.bucket) ||
      x.figures.length - y.figures.length ||
      irregular(x) - irregular(y) ||
      mean(x) - mean(y) ||
      bySides(x, y) ||
      first(x) - first(y),
  );
  return { figures, byLevel, sets };
}

/** How far `shape` is from regular, for ordering only (a float, never an
 * identity): 1 − q/qₙ, where q = 4πA/P² is its isoperimetric quotient and qₙ
 * that of the regular polygon with as many sides, π/(n·tan(π/n)) — 0 for a
 * regular polygon, nearer 1 the longer, thinner or more dented it is. A tile
 * of several pieces is taken whole: every piece's area and perimeter, and all
 * their sides. */
export function distortion(shape: Shape): number {
  const n = sides(shape);
  let area = 0;
  let perimeter = 0;
  for (const p of shape.pieces) {
    const xy = p.verts.map((v) => shape.ring.toXY(v));
    area += Math.abs(signedArea(xy));
    xy.forEach(([x, y], i) => {
      const [u, w] = xy[(i + 1) % xy.length]!;
      perimeter += Math.hypot(u - x, w - y);
    });
  }
  const q = (4 * Math.PI * area) / perimeter ** 2;
  const qn = Math.PI / (n * Math.tan(Math.PI / n));
  return Math.max(0, 1 - q / qn);
}

/** Two sets of as many figures by their side counts, each list ascending,
 * compared term by term: [3, 4] before [3, 6] before [4, 4]. */
function bySides(x: FigureSet, y: FigureSet): number {
  const counts = (s: FigureSet): number[] =>
    s.figures.map((f) => sides(f.shape)).sort((a, b) => a - b);
  const [a, b] = [counts(x), counts(y)];
  for (let i = 0; i < Math.min(a.length, b.length); i++) if (a[i] !== b[i]) return a[i]! - b[i]!;
  return a.length - b.length;
}

const figuresMemo = (): Figures => (memo ??= build());

/** Every figure set, by row (`BUCKETS`), regular first, then closest to
 * regular. */
export function figureSets(): FigureSet[] {
  return figuresMemo().sets;
}

/** Every figure, in order of first use. */
export function allFigures(): Figure[] {
  return figuresMemo().figures;
}

/** The set `level`'s tray is — for a level of marked tiles, the set of the
 * tiling it marks. */
export function figureSetOf(level: Level): FigureSet {
  const plain = level.decor ? levelByKey(level.decor.of)! : level;
  return figuresMemo().sets.find((s) => s.levels.includes(plain))!;
}

export function figureSetByKey(key: string): FigureSet | undefined {
  return figuresMemo().sets.find((s) => s.key === key);
}
