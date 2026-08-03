// Port of minesweeper/boards/fractal.py — the five self-similar (fractal) flat
// boards: the sphinx, the chair, the Sierpinski carpet, the pentaflake and the
// Gosper island. Structure and cell ids mirror the Python source so the two stay
// diffable; see it for the fuller commentary.
//
// Each is one tile inflated `levels` times: the tile is scaled up by the
// substitution's `factor` and refilled with copies of itself, so the patch grows
// by `children.length` per level and its outline converges on a self-similar
// shape — the tile again for the first four, the Gosper island for the fifth.
// That outline is the board — unlike every other flat board these are
// deliberately not a rectangular window, because trimming the patch to a square
// block would throw away the only thing that makes them what they are.
//
//   * The **sphinx** is the pentagonal hexiamond (six unit triangles, sides
//     3, 1, 1, 1, 2) on the triangular lattice. It is a *rep-tile*: four
//     half-size copies fill it exactly, and that rep-4 dissection is unique.
//   * The **chair** (L-tromino) is three unit squares, also a rep-4 rep-tile,
//     dissected by the classic chair substitution: four quarter-turns, none
//     reflected.
//   * The **Sierpinski carpet** is no rep-tile: the unit square tripled and
//     refilled with eight copies — the 3x3 block *minus its centre*. The
//     children do not fill the inflated tile, and that missing middle ninth,
//     repeated at every scale, is the board: the one flat board that is not a
//     disc (a level-n carpet has (8**n − 1) / 7 square holes).
//   * The **pentaflake** (Dürer's pentagon) is the regular pentagon scaled by
//     φ² and refilled with six: one per corner plus a half-turned middle. Like
//     the carpet it leaves gaps — five golden gnomons, one per side — and
//     unlike every other board here its lattice is not integer: five-fold
//     symmetry needs rank 4, so its vertex ids live in the cyclotomic ring
//     Z[ζ10], as Penrose's do in Z[ζ5].
//   * The **Gosper island** is the one whose *boundary* is the fractal: plain
//     regular hexagons, no holes at all, in a patch whose outline converges on
//     the Gosper island (the curve the flowsnake draws, dimension log3/log√7 =
//     1.129 — 7ⁿ hexagons behind only 6·3ⁿ boundary edges). The hexagon is no
//     rep-tile — seven make a flower, not a bigger hexagon — so what inflates is
//     the patch: seven level-(n−1) islands, one in the middle and six around it.
//     Its inflation is multiplication by the Eisenstein integer 2 + ζ (norm 7),
//     a *spiral* similarity of √7 at 19.106°: scaling by √7 alone would send the
//     lattice point 1 to (√7, 0), which is no lattice point, so an inflation of
//     seven must turn as it stretches — and that forced turn per level is what
//     roughens the island's edge.
//
// Every child translation is the parent's scaled by a power of the factor, so a
// placement stays an exact (rotation, mirror, lattice translation) triple all
// the way down and vertex ids need no tolerance. That is why the inflation only
// ever *multiplies* by the factor (`inflate`): the three integer lattices could
// divide it out again, but φ² is irrational and Z[ζ10] is dense in the plane.
//
// The sphinx's and the chair's outlines carry a vertex at *every* lattice step
// along their edges, not just at their corners: those two tilings are not edge
// to edge, and the collinear ids are what let shared-vertex adjacency see a
// neighbour that plants its corner mid-edge (the bargain the isogonal tilings
// and the Spectre make). `shapeMetrics` drops them again, so the sphinx reads as
// a pentagon and the chair as a hexagon. The carpet, the pentaflake and the
// Gosper island need none of that: their tiles meet edge to edge, corner to
// corner.

import { type Board, type CellId, cid, finalizeFlat, type Vertex } from "./core";

/** A vertex's coordinates in the tile's own lattice: two of them for the three
 * integer lattices, four for the pentaflake's cyclotomic ring. */
export type LatticePoint = readonly number[];

/** The rigid motion x ↦ R^rot(M^mirror x) + translation, exactly. */
export type Placement = readonly [number, number, LatticePoint];

const ROOT3 = Math.sqrt(3);

// Triangular lattice: (a, b) stands for a·(1, 0) + b·(1/2, √3/2), so a 60°
// rotation and a mirror are both integer maps.
const triRotate = ([a, b]: LatticePoint): LatticePoint => [-b!, a! + b!];
const triMirror = ([a, b]: LatticePoint): LatticePoint => [a! + b!, -b!];
const triToXy = ([a, b]: LatticePoint): Vertex => [a! + b! / 2, (b! * ROOT3) / 2];

/** Multiply by 2 + ζ, the Gosper island's inflation: the triangular lattice is
 * the ring of Eisenstein integers Z[ζ], ζ = exp(iπ/3), and 2 + ζ is one of its
 * elements of norm 7 — length √7, argument atan(√3/5) = 19.106°. Scaling by √7
 * alone would leave the lattice (it would send 1 to (√7, 0), and the ring's real
 * elements are the integers), so an inflation of seven *must* turn as it
 * stretches. (ζ² = ζ − 1, whence (a + bζ)(2 + ζ) = (2a − b) + (a + 3b)ζ.) */
const gosperScale = ([a, b]: LatticePoint): LatticePoint => [2 * a! - b!, a! + 3 * b!];

const squareRotate = ([x, y]: LatticePoint): LatticePoint => [-y!, x!];
const squareMirror = ([x, y]: LatticePoint): LatticePoint => [x!, -y!];
const squareToXy = ([x, y]: LatticePoint): Vertex => [x!, y!];

/** Scaling on an integer lattice: multiply every coordinate. */
const times =
  (n: number) =>
  (p: LatticePoint): LatticePoint =>
    p.map((c) => c * n);

// Z[ζ10] — the pentaflake's lattice, ζ = exp(iπ/5): (a, b, c, d) stands for
// a + bζ + cζ² + dζ³. Rank 4 is forced, not a convenience: no lattice of two
// integers carries a 72° rotation, so there is no integer plane to build a
// five-fold tiling on (the same reason Penrose lives in Z[ζ5]). Every power
// reduces through ζ's minimal polynomial x⁴ − x³ + x² − x + 1, i.e.
// ζ⁴ = ζ³ − ζ² + ζ − 1 and ζ⁵ = −1.

/** Multiply by ζ: a 36° turn, so the rotation order is 10. */
const pentaRotate = ([a, b, c, d]: LatticePoint): LatticePoint => [
  -d!,
  a! + d!,
  b! - d!,
  c! + d!,
];

/** Complex conjugation, ζ^k ↦ ζ^(10−k): the mirror in the real axis
 * (conj(ζ) = 1 − ζ + ζ² − ζ³). */
const pentaMirror = ([a, b, c, d]: LatticePoint): LatticePoint => [
  a! + b!,
  -b!,
  b! - d!,
  -b! - c!,
];

/** Multiply by φ² = 2 + ζ² − ζ³, the inflation factor. (φ = ζ + 1/ζ =
 * 2cos36° is real and lives in the ring, so the scaling stays exact where a
 * float would not.) */
function pentaScale(p: LatticePoint): LatticePoint {
  const r2 = pentaRotate(pentaRotate(p));
  const r3 = pentaRotate(r2);
  return p.map((c, k) => 2 * c + r2[k]! - r3[k]!);
}

const ZETA10 = [0, 1, 2, 3].map(
  (k): Vertex => [Math.cos((Math.PI * k) / 5), Math.sin((Math.PI * k) / 5)],
);

const pentaToXy = (p: LatticePoint): Vertex => [
  p.reduce((sum, c, k) => sum + c * ZETA10[k]![0], 0),
  p.reduce((sum, c, k) => sum + c * ZETA10[k]![1], 0),
];

export interface Substitution {
  mode: string;
  /** The unit tile, a vertex per lattice step along every edge, CCW. */
  outline: LatticePoint[];
  /** The unit tiles inside the tile scaled by `factor` — a dissection for a
   * rep-tile, a dissection with holes in it for the carpet and the
   * pentaflake. */
  children: Placement[];
  /** Linear scale of one inflation (2 for the rep-4 tiles, 3 for the carpet,
   * φ² for the pentaflake). */
  factor: number;
  /** Rotation order of the lattice (6 triangular, 4 square, 10 for Z[ζ10]). */
  order: number;
  /** Where to centre the cell's number/flag/mine glyph, in the tile's own
   * unrotated lattice coordinates — for a concave tile whose true centroid
   * sits right at the reflex corner (a poor, cramped glyph spot). Unset for
   * a tile whose centroid already fits a decent circle (the sphinx). */
  glyphAnchor?: LatticePoint;
  rotate(p: LatticePoint): LatticePoint;
  mirror(p: LatticePoint): LatticePoint;
  /** `factor` again, done exactly on the lattice. */
  scale(p: LatticePoint): LatticePoint;
  toXy(p: LatticePoint): Vertex;
}

/** The lattice's zero, in the tile's own coordinate count. */
const origin = (tile: Substitution): LatticePoint => tile.outline[0]!.map(() => 0);

// The sphinx: bottom edge 3, then 1 up-left, 1 left, 1 up-left, 2 down-left.
const SPHINX_OUTLINE: LatticePoint[] = [
  [0, 0],
  [1, 0],
  [2, 0],
  [3, 0],
  [2, 1],
  [1, 1],
  [0, 2],
  [0, 1],
];

// The unique dissection of the size-2 sphinx into four unit sphinxes; three of
// the four children are reflected.
const SPHINX_CHILDREN: Placement[] = [
  [3, 1, [3, 0]],
  [4, 0, [0, 4]],
  [0, 1, [1, 2]],
  [3, 1, [6, 0]],
];

export const SPHINX: Substitution = {
  mode: "sphinx",
  outline: SPHINX_OUTLINE,
  children: SPHINX_CHILDREN,
  factor: 2,
  order: 6,
  rotate: triRotate,
  mirror: triMirror,
  scale: times(2),
  toXy: triToXy,
};

// The chair (L-tromino): three unit squares.
const CHAIR_OUTLINE: LatticePoint[] = [
  [0, 0],
  [1, 0],
  [2, 0],
  [2, 1],
  [1, 1],
  [1, 2],
  [0, 2],
  [0, 1],
];

// The classic chair substitution: four quarter-turns, none reflected.
const CHAIR_CHILDREN: Placement[] = [
  [0, 0, [0, 0]],
  [3, 0, [0, 4]],
  [0, 0, [1, 1]],
  [1, 0, [4, 0]],
];

export const CHAIR: Substitution = {
  mode: "chair",
  outline: CHAIR_OUTLINE,
  children: CHAIR_CHILDREN,
  factor: 2,
  order: 4,
  // The centre of the "elbow" unit square — (0,0)-(1,0)-(1,1)-(0,1), the one
  // touching both of the tile's other two squares — the south-west quadrant
  // of the tile in its icon orientation. Ties the other two squares for
  // inradius (each is exactly half a cell edge from its nearest boundary),
  // so this is just the one fixed choice, not a bigger circle.
  glyphAnchor: [0.5, 0.5],
  rotate: squareRotate,
  mirror: squareMirror,
  scale: times(2),
  toXy: squareToXy,
};

// The Sierpinski carpet: the unit square, tripled and refilled with the eight
// subsquares of the 3x3 block that are not its centre. The children leave the
// middle ninth empty — the square is no rep-tile and this is no dissection —
// and that hole, repeated at every scale, is the whole point.
const SQUARE_OUTLINE: LatticePoint[] = [
  [0, 0],
  [1, 0],
  [1, 1],
  [0, 1],
];

const CARPET_CHILDREN: Placement[] = [0, 1, 2]
  .flatMap((y) => [0, 1, 2].map((x): LatticePoint => [x, y]))
  .filter(([x, y]) => !(x === 1 && y === 1))
  .map((translation): Placement => [0, 0, translation]);

export const CARPET: Substitution = {
  mode: "carpet",
  outline: SQUARE_OUTLINE,
  children: CARPET_CHILDREN,
  factor: 3,
  order: 4,
  rotate: squareRotate,
  mirror: squareMirror,
  scale: times(3),
  toXy: squareToXy,
};

// The pentaflake (Dürer's pentagon): the unit pentagon is the one of
// circumradius 1 with a vertex on the real axis, so its corners are the five
// even powers of ζ, walked counterclockwise.
const PENTAGON_OUTLINE: LatticePoint[] = [
  [1, 0, 0, 0], // ζ⁰
  [0, 0, 1, 0], // ζ²
  [-1, 1, -1, 1], // ζ⁴
  [0, -1, 0, 0], // ζ⁶
  [0, 0, 0, -1], // ζ⁸
];

// Scaled by φ² the pentagon holds six: one seated in each corner, sharing that
// corner with the parent, plus one in the middle turned a half turn (a pentagon
// has no half turn of its own, so the middle child is the only thing that breaks
// the parent's five-fold symmetry down to the substitution's). A corner child's
// centre is φζ^2k — the parent's circumradius φ² less the child's 1, along the
// corner — and φ = 1 + ζ² − ζ³ is itself in the ring, so the translations are
// exact.
//
// The middle child shares a whole edge with each corner child, and adjacent
// corner children meet at a single point (that same edge's end, where three
// pentagons and 3·108 = 324° meet). The 36° left over at each of the five sides
// is the gap: a golden gnomon, and the reason this is a fractal with holes and
// not a dissection.
const PENTAFLAKE_CHILDREN: Placement[] = [
  [0, 0, [1, 0, 1, -1]], // φζ⁰
  [0, 0, [0, 1, 0, 1]], // φζ²
  [0, 0, [-1, 0, 0, 1]], // φζ⁴
  [0, 0, [-1, 0, -1, 0]], // φζ⁶
  [0, 0, [1, -1, 0, -1]], // φζ⁸
  [5, 0, [0, 0, 0, 0]], // the middle one, turned a half turn
];

export const PENTAFLAKE: Substitution = {
  mode: "pentaflake",
  outline: PENTAGON_OUTLINE,
  children: PENTAFLAKE_CHILDREN,
  factor: (3 + Math.sqrt(5)) / 2, // φ²
  order: 10,
  rotate: pentaRotate,
  mirror: pentaMirror,
  scale: pentaScale,
  toXy: pentaToXy,
};

// The Gosper island: the unit regular hexagon of circumradius 1, its corners the
// six units of the lattice (ζ^k, walked counterclockwise). Hexagon centres are
// the sublattice of index 3 generated by θ = 1 + ζ (length √3, 30°) — one step
// from a hexagon to a neighbour.
const HEXAGON_OUTLINE: LatticePoint[] = [
  [1, 0],
  [0, 1],
  [-1, 1],
  [-1, 0],
  [0, -1],
  [1, -1],
];

// The flower: the hexagon itself plus its six neighbours, at θζ^k. Those seven
// translations are a complete set of residues modulo 2 + ζ — {0} and the six
// units, one per nonzero class of Z[ζ]/(2 + ζ) = F7 — which is what makes the
// flower tile the plane by the inflated lattice and the inflation a bijection on
// digit strings: the level-n patch is exactly the 7ⁿ sums θ·Σ d_k (2 + ζ)^k, all
// distinct.
//
// Every child is a plain translation. The turn is in the inflation instead: each
// level is laid down 19.106° round from the one below, and it is that
// accumulated twist, not any gap, that roughens the island's edge.
const GOSPER_CHILDREN: Placement[] = [
  [0, 0, [0, 0]], // the middle of the flower
  [0, 0, [1, 1]], // θ
  [0, 0, [-1, 2]], // θζ
  [0, 0, [-2, 1]], // θζ²
  [0, 0, [-1, -1]], // θζ³
  [0, 0, [1, -2]], // θζ⁴
  [0, 0, [2, -1]], // θζ⁵
];

export const GOSPER: Substitution = {
  mode: "gosper",
  outline: HEXAGON_OUTLINE,
  children: GOSPER_CHILDREN,
  factor: Math.sqrt(7),
  order: 6,
  rotate: triRotate,
  mirror: triMirror,
  scale: gosperScale,
  toXy: triToXy,
};

export const SUBSTITUTIONS: Record<string, Substitution> = {
  sphinx: SPHINX,
  chair: CHAIR,
  carpet: CARPET,
  pentaflake: PENTAFLAKE,
  gosper: GOSPER,
};

/** The rotation/mirror part of a placement, applied to a lattice point. */
function linear(tile: Substitution, rot: number, mirrored: number, p: LatticePoint): LatticePoint {
  let out = mirrored ? tile.mirror(p) : p;
  for (let i = ((rot % tile.order) + tile.order) % tile.order; i > 0; i--) {
    out = tile.rotate(out);
  }
  return out;
}

export function placePoint(tile: Substitution, at: Placement, p: LatticePoint): LatticePoint {
  const [rot, mirrored, translation] = at;
  return linear(tile, rot, mirrored, p).map((c, k) => c + translation[k]!);
}

/** `parent` after `child`. Mirroring negates the inner rotation — the only
 * thing the mirror flag costs, as for the Spectre. */
function compose(tile: Substitution, parent: Placement, child: Placement): Placement {
  const [pRot, pMirror, pTranslation] = parent;
  const [cRot, cMirror, cTranslation] = child;
  const moved = linear(tile, pRot, pMirror, cTranslation);
  const rot = pMirror ? pRot - cRot : pRot + cRot;
  return [
    ((rot % tile.order) + tile.order) % tile.order,
    pMirror ^ cMirror,
    moved.map((c, k) => c + pTranslation[k]!),
  ];
}

/** `p` scaled by factor**power, exactly. Only ever multiplies: the pentaflake's
 * factor is irrational, so there is no dividing back down. */
function inflate(tile: Substitution, p: LatticePoint, power: number): LatticePoint {
  let out = p;
  for (let i = 0; i < power; i++) out = tile.scale(out);
  return out;
}

/**
 * The `children.length ** levels` unit tiles of a level-`levels` supertile.
 * Substitutes from the top down: the first round's children are supertiles of
 * edge factor**(levels − 1) and the last round's are unit tiles. Their
 * translations are given in units of their own tile, so inflating them to the
 * round's size keeps every placement an exact lattice point.
 */
export function substitutionPlacements(tile: Substitution, levels: number): Placement[] {
  if (levels < 0) throw new Error("levels must be >= 0");
  let placements: Placement[] = [[0, 0, origin(tile)]];
  for (let power = levels - 1; power >= 0; power--) {
    const children = tile.children.map(
      ([rot, mirrored, translation]): Placement => [
        rot,
        mirrored,
        inflate(tile, translation, power),
      ],
    );
    const next: Placement[] = [];
    for (const parent of placements) {
      for (const child of children) next.push(compose(tile, parent, child));
    }
    placements = next;
  }
  return placements;
}

// The menu icon (icons.ts) draws tile.toXy(...) straight into an SVG, where a
// larger y ends up higher (icons flip y for the y-down SVG canvas); the game
// board goes through the same-looking "flip y" in polygonBoard.ts, but into a
// y-*up* WebGL scene, so a larger native y ends up lower there instead — the
// two flips cancel oppositely, and the tiles render upside down relative to
// their icons. Negating y alone here, on the board only, cancels
// that back out.
function boardXy(tile: Substitution, p: LatticePoint): Vertex {
  const [x, y] = tile.toXy(p);
  return [x, -y];
}

function substitutionBoard(
  tile: Substitution,
  levels: number,
  mineCount: number,
  scale: number,
): Board {
  const cells = new Map<CellId, string[]>();
  const positions = new Map<string, Vertex>();
  const anchors = new Map<CellId, LatticePoint>();
  for (const at of substitutionPlacements(tile, levels)) {
    const [rot, mirrored, translation] = at;
    // a mirrored placement reverses the outline's winding; walk it backwards
    // so every cell's polygon stays counterclockwise
    const outline = mirrored ? [...tile.outline].reverse() : tile.outline;
    const keys = outline.map((v) => {
      const p = placePoint(tile, at, v);
      const key = p.join(",");
      if (!positions.has(key)) positions.set(key, boardXy(tile, p));
      return key;
    });
    const cell = cid(rot, mirrored, ...translation);
    cells.set(cell, keys);
    if (tile.glyphAnchor) anchors.set(cell, placePoint(tile, at, tile.glyphAnchor));
  }
  if (cells.size !== tile.children.length ** levels) {
    throw new Error("substitution produced overlapping placements");
  }
  const board = finalizeFlat(tile.mode, cells, positions, mineCount, scale);
  if (anchors.size === 0) return board;
  // Match finalizeFlat's own shift-then-scale exactly, off the same
  // `positions` it read (an anchor isn't one of the cells' own vertices, so
  // it isn't already in there).
  let minX = Infinity;
  let minY = Infinity;
  for (const p of positions.values()) {
    if (p[0] < minX) minX = p[0];
    if (p[1] < minY) minY = p[1];
  }
  const glyphAnchor = new Map<CellId, Vertex>();
  for (const [cell, anchor] of anchors) {
    const [ax, ay] = boardXy(tile, anchor);
    glyphAnchor.set(cell, [(ax - minX) * scale, (ay - minY) * scale]);
  }
  return { ...board, glyphAnchor };
}

/** The sphinx rep-tile, inflated `levels` times: 4**levels sphinxes filling one
 * sphinx-shaped patch. `scale` is pixels per unit triangle edge. */
export function sphinxBoard(levels: number, mineCount: number, scale = 26): Board {
  return substitutionBoard(SPHINX, levels, mineCount, scale);
}

/** The chair (L-tromino) rep-tile, inflated `levels` times: 4**levels chairs
 * filling one L-shaped patch. `scale` is pixels per unit square edge. */
export function chairBoard(levels: number, mineCount: number, scale = 26): Board {
  return substitutionBoard(CHAIR, levels, mineCount, scale);
}

/** The Sierpinski carpet, inflated `levels` times: 8**levels unit squares in a
 * 3**levels square patch (1, 8, 64, 512, 4096 tiles), the middle ninth of every
 * block left out at every scale. `scale` is pixels per unit square edge. */
export function carpetBoard(levels: number, mineCount: number, scale = 26): Board {
  return substitutionBoard(CARPET, levels, mineCount, scale);
}

/** The pentaflake, inflated `levels` times: 6**levels regular pentagons in a
 * pentagon-shaped patch (1, 6, 36, 216, 1296 tiles), with a gnomon-shaped gap
 * left over per side at every scale. `scale` is pixels per unit pentagon
 * circumradius. */
export function pentaflakeBoard(levels: number, mineCount: number, scale = 26): Board {
  return substitutionBoard(PENTAFLAKE, levels, mineCount, scale);
}

/** The Gosper island, inflated `levels` times: 7**levels regular hexagons
 * (1, 7, 49, 343, 2401 tiles) in a patch with no holes whose outline converges
 * on the Gosper island — and which is turned 19.106° further round with every
 * level. `scale` is pixels per unit hexagon circumradius. */
export function gosperBoard(levels: number, mineCount: number, scale = 26): Board {
  return substitutionBoard(GOSPER, levels, mineCount, scale);
}
