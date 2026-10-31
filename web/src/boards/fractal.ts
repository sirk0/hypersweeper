// Port of minesweeper/boards/fractal.py — the self-similar flat boards, in two
// menu families: the rep-tiles (the sphinx, the chair, the L-tetromino, the
// P-pentomino, the trapezoid, the right trapezoid, the half trapezoid, the
// stretched chair, the rhombic L, the isosceles right triangle, the 30-60-90
// triangle, the T-tetromino and the five-triangle) and the fractals (the Sierpinski carpet, the
// pentaflake and the Gosper island). Structure and cell ids mirror the Python
// source so the two stay diffable; see it for the fuller commentary.
//
// Each is one tile inflated `levels` times: the tile is scaled up by the
// substitution's `factor` and refilled with copies of itself, so the patch grows
// by `children.length` per level and its outline converges on a self-similar
// shape — the tile again for all but the Gosper island. That outline is the
// board — unlike every other flat board these are deliberately not a
// rectangular window, because trimming the patch to a square block would throw
// away the only thing that makes them what they are. A rep-tile's n children
// fill the tile grown by √n exactly (four for most; two, three, sixteen and five
// for the right triangles, the T-tetromino and the five-triangle), so its patch is the tile again, with no hole
// and a straight edge; the fractals leave holes or grow a rough edge.
//
//   * The **sphinx** is the pentagonal hexiamond (six unit triangles, sides
//     3, 1, 1, 1, 2) on the triangular lattice. It is a *rep-tile*: four
//     half-size copies fill it exactly, and that rep-4 dissection is unique.
//   * The **chair** (L-tromino) is three unit squares, also a rep-4 rep-tile,
//     dissected by the classic chair substitution: four quarter-turns, none
//     reflected.
//   * The **L-tetromino** and the **P-pentomino** are the next two polyomino
//     rep-4 tiles (the T, S and Z tetrominoes are no rep-tiles at all); the
//     **trapezoid** is the triamond, half a hexagon, on the triangular lattice.
//   * The **right trapezoid** (a square and half a square) and the **half
//     trapezoid** (a doubled triamond cut down its mirror line) are the two
//     quadrilaterals, both chiral, each with a side that crosses the lattice's
//     unit faces rather than running along them. The **stretched chair** (the
//     chair drawn out into dominoes) and the **rhombic L** (the L-tetromino
//     sheared into rhombi) are the last rep-4 polyforms an exhaustive search
//     turns up, up to eleven squares and ten triangles. All four dissections
//     are unique and all four reflect a child.
//   * The **isosceles right triangle** (rep-2) and the **30-60-90 triangle**
//     (rep-3) inflate by 1 + i and 1 + ζ — √2 and √3, turning 45° and 30° a
//     level — hence `twist` (a reflected child under a turning inflation) and
//     `upright` (every level drawn the same way up). The **T-tetromino** is
//     rep-16: four Ts fill a 4x4 square as a pinwheel of quarter turns. The
//     **five-triangle** (the 1:2 right triangle, rep-5) has a builder of its own
//     at the end of the module.
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
// The rep-tiles' outlines, bar the trapezoid's, carry a vertex at *every*
// lattice step along their edges, not just at their corners: those tilings are
// not edge to edge, and the collinear ids are what let shared-vertex adjacency
// see a neighbour that plants its corner mid-edge (the bargain the isogonal
// tilings and the Spectre make). `shapeMetrics` drops them again, so the sphinx
// reads as a pentagon and the chair as a hexagon. The trapezoid, the carpet, the
// pentaflake and the Gosper island need none of that: their tiles meet edge to
// edge, corner to corner.

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

/** Multiply by 1 + i, the isosceles right triangle's inflation: √2 at 45°, the
 * square lattice's own Gaussian integer of norm 2. Scaling by √2 alone would
 * leave the lattice, so — as for the Gosper island — the inflation turns as it
 * stretches. */
const squareTurn = ([x, y]: LatticePoint): LatticePoint => [x! - y!, x! + y!];

/** Multiply by 1 + ζ, the 30-60-90 triangle's inflation: √3 at 30°, the
 * Eisenstein integer of norm 3. (ζ² = ζ − 1, whence (a + bζ)(1 + ζ) =
 * (a − b) + (a + 2b)ζ.) */
const drafterScale = ([a, b]: LatticePoint): LatticePoint => [a! - b!, a! + 2 * b!];

// Z[ζ10] — the pentaflake's lattice, ζ = exp(iπ/5): (a, b, c, d) stands for
// a + bζ + cζ² + dζ³. Rank 4 is forced, not a convenience: no lattice of two
// integers carries a 72° rotation, so there is no integer plane to build a
// five-fold tiling on (the same reason Penrose lives in Z[ζ5]). Every power
// reduces through ζ's minimal polynomial x⁴ − x³ + x² − x + 1, i.e.
// ζ⁴ = ζ³ − ζ² + ζ − 1 and ζ⁵ = −1.

/** Multiply by ζ: a 36° turn, so the rotation order is 10. */
const pentaRotate = ([a, b, c, d]: LatticePoint): LatticePoint => [-d!, a! + d!, b! - d!, c! + d!];

/** Complex conjugation, ζ^k ↦ ζ^(10−k): the mirror in the real axis
 * (conj(ζ) = 1 − ζ + ζ² − ζ³). */
const pentaMirror = ([a, b, c, d]: LatticePoint): LatticePoint => [a! + b!, -b!, b! - d!, -b! - c!];

/** Multiply by φ² = 2 + ζ² − ζ³, the inflation factor. (φ = ζ + 1/ζ =
 * 2cos36° is real and lives in the ring, so the scaling stays exact where a
 * float would not.) */
function pentaScale(p: LatticePoint): LatticePoint {
  const r2 = pentaRotate(pentaRotate(p));
  const r3 = pentaRotate(r2);
  return p.map((c, k) => 2 * c + r2[k]! - r3[k]!);
}

const ZETA10 = [0, 1, 2, 3].map((k): Vertex => [
  Math.cos((Math.PI * k) / 5),
  Math.sin((Math.PI * k) / 5),
]);

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
   * sits right at the reflex corner (a poor, cramped glyph spot), or simply
   * off to one side of the room the tile has (the sphinx's, under its notch).
   * Unset for a tile whose centroid already fits a decent circle. */
  glyphAnchor?: LatticePoint;
  rotate(p: LatticePoint): LatticePoint;
  mirror(p: LatticePoint): LatticePoint;
  /** `factor` again, done exactly on the lattice. */
  scale(p: LatticePoint): LatticePoint;
  toXy(p: LatticePoint): Vertex;
  /** How far `scale` turns a mirror, in rotation steps: s^p M s^−p =
   * R^(p·twist) M. Unset (0) for a pure scaling; 1 for the two right
   * triangles, whose inflation turns by half a lattice step. See
   * `substitutionPlacements`. */
  twist?: number;
  /** For a turning inflation: the turn, in degrees, that stands the unit tile
   * the way the board is drawn. Every level's patch is turned back by the
   * inflation's accumulated turn and by this, so all levels are drawn the same
   * way up (vertex ids stay on the lattice; only the drawing turns). */
  upright?: number;
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
  // Two thirds along each lattice axis — (1, √3/3) in the plane, the centre of
  // the biggest circle the sphinx holds, touching its long side, its left side
  // and the corner of its notch. The corner mean is no good here: it sits just
  // under the notch and leaves a circle a third the size. `sphinxpairsTemplate`
  // in boards/tilings.ts anchors the same point, so the sphinx's two boards —
  // this one inflated, that one laid down periodically — number alike.
  glyphAnchor: [2 / 3, 2 / 3],
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

// The L-tetromino: four unit squares, three in a row and one on the left end.
const LTETROMINO_OUTLINE: LatticePoint[] = [
  [0, 0],
  [1, 0],
  [2, 0],
  [3, 0],
  [3, 1],
  [2, 1],
  [1, 1],
  [1, 2],
  [0, 2],
  [0, 1],
];

// The L has no symmetry of its own, so its four dissections are four different
// ones; this is the only one with no child reflected — four quarter-turns, as
// for the chair.
const LTETROMINO_CHILDREN: Placement[] = [
  [0, 0, [2, 0]],
  [1, 0, [2, 0]],
  [2, 0, [6, 2]],
  [3, 0, [0, 4]],
];

export const LTETROMINO: Substitution = {
  mode: "ltetromino",
  outline: LTETROMINO_OUTLINE,
  children: LTETROMINO_CHILDREN,
  factor: 2,
  order: 4,
  // The centre of the corner square, the one touching both arms — as CHAIR
  // does, and for the same reason: the centroid sits off towards the long arm
  // and no square holds a bigger circle than another.
  glyphAnchor: [0.5, 0.5],
  rotate: squareRotate,
  mirror: squareMirror,
  scale: times(2),
  toXy: squareToXy,
};

// The P-pentomino: a 2x2 block of unit squares with a fifth on top of its left
// column.
const PPENTOMINO_OUTLINE: LatticePoint[] = [
  [0, 0],
  [1, 0],
  [2, 0],
  [2, 1],
  [2, 2],
  [1, 2],
  [1, 3],
  [0, 3],
  [0, 2],
  [0, 1],
];

// The P has two dissections and neither is reflection-free; this one reflects
// two of the four children.
const PPENTOMINO_CHILDREN: Placement[] = [
  [0, 0, [0, 0]],
  [0, 1, [0, 6]],
  [2, 1, [4, 0]],
  [3, 0, [1, 4]],
];

export const PPENTOMINO: Substitution = {
  mode: "ppentomino",
  outline: PPENTOMINO_OUTLINE,
  children: PPENTOMINO_CHILDREN,
  factor: 2,
  order: 4,
  // The middle of the 2x2 block, which holds a circle a whole cell edge across;
  // the centroid sits a little up and left of it, towards the fifth square.
  glyphAnchor: [1, 1],
  rotate: squareRotate,
  mirror: squareMirror,
  scale: times(2),
  toXy: squareToXy,
};

// The trapezoid (the triamond, half a hexagon): three unit triangles, a long
// base of 2 under a top of 1. Corners only: its substitution is edge to edge —
// a long side only ever meets a long side — so there is no T-vertex to record.
const TRAPEZOID_OUTLINE: LatticePoint[] = [
  [0, 0],
  [2, 0],
  [1, 1],
  [0, 1],
];

// Its dissection is unique: three children round the edge and one upside down
// in the middle. The tile is mirror-symmetric, so each child can be written
// reflected or not; this is the reflection-free way.
const TRAPEZOID_CHILDREN: Placement[] = [
  [0, 0, [1, 0]],
  [2, 0, [4, 0]],
  [3, 0, [2, 2]],
  [4, 0, [0, 2]],
];

export const TRAPEZOID: Substitution = {
  mode: "trapezoid",
  outline: TRAPEZOID_OUTLINE,
  children: TRAPEZOID_CHILDREN,
  factor: 2,
  order: 6,
  rotate: triRotate,
  mirror: triMirror,
  scale: times(2),
  toXy: triToXy,
};

// The right trapezoid: a unit square with half a square (cut along its
// diagonal) under it — parallel sides 1 and 2, one slanted side at 45°. The one
// rep-4 polyabolo that is not a triangle or a parallelogram, and chiral. The
// slanted side runs corner to corner of a unit square, so it has no lattice
// point in between to step through.
const RIGHT_TRAPEZOID_OUTLINE: LatticePoint[] = [
  [0, 0],
  [1, 1],
  [1, 2],
  [0, 2],
  [0, 1],
];

// Its dissection is unique, and one child of the four is reflected.
const RIGHT_TRAPEZOID_CHILDREN: Placement[] = [
  [0, 0, [0, 0]],
  [0, 0, [1, 1]],
  [0, 1, [0, 4]],
  [3, 0, [0, 4]],
];

export const RIGHT_TRAPEZOID: Substitution = {
  mode: "righttrapezoid",
  outline: RIGHT_TRAPEZOID_OUTLINE,
  children: RIGHT_TRAPEZOID_CHILDREN,
  factor: 2,
  order: 4,
  // The centre of the whole square, which holds a circle a cell edge across;
  // the corner mean sits down towards the half square, where it holds less.
  glyphAnchor: [0.5, 1.5],
  rotate: squareRotate,
  mirror: squareMirror,
  scale: times(2),
  toXy: squareToXy,
};

// The half trapezoid: a triamond twice the size cut in two down its mirror line
// — parallel sides 2 and 1, two right angles, a 60° corner and a 120° one. The
// cut halves unit triangles, so it is no polyiamond, but every corner is still a
// lattice point. Chiral, like the right trapezoid. The upright side has no
// lattice point in between; the base and the slanted side carry theirs.
const HALF_TRAPEZOID_OUTLINE: LatticePoint[] = [
  [0, 0],
  [1, 0],
  [2, 0],
  [1, 2],
  [0, 2],
  [0, 1],
];

// Its dissection is unique, and two children of the four are reflected.
const HALF_TRAPEZOID_CHILDREN: Placement[] = [
  [0, 0, [2, 0]],
  [0, 1, [0, 4]],
  [1, 1, [0, 0]],
  [4, 0, [0, 4]],
];

/** The centre of the biggest circle the half trapezoid holds, in its lattice
 * coordinates: it touches the base, the upright side and the slanted one, so
 * its radius is √3 − 1 and its centre (3 − √3, √3 − 1) in the plane, which is
 * 2 − 2/√3 along both lattice axes. */
const HALF_TRAPEZOID_INCENTRE = 2 - 2 / ROOT3;

export const HALF_TRAPEZOID: Substitution = {
  mode: "halftrapezoid",
  outline: HALF_TRAPEZOID_OUTLINE,
  children: HALF_TRAPEZOID_CHILDREN,
  factor: 2,
  order: 6,
  glyphAnchor: [HALF_TRAPEZOID_INCENTRE, HALF_TRAPEZOID_INCENTRE],
  rotate: triRotate,
  mirror: triMirror,
  scale: times(2),
  toXy: triToXy,
};

// The stretched chair: the chair with each square drawn out into an upright
// domino — a 2x2 block with a column of two on its left. Being stretched it
// cannot use the chair's quarter turns: its unique dissection turns one child a
// half turn and reflects two.
const STRETCHED_CHAIR_OUTLINE: LatticePoint[] = [
  [0, 0],
  [1, 0],
  [2, 0],
  [2, 1],
  [2, 2],
  [1, 2],
  [1, 3],
  [1, 4],
  [0, 4],
  [0, 3],
  [0, 2],
  [0, 1],
];

const STRETCHED_CHAIR_CHILDREN: Placement[] = [
  [0, 0, [0, 0]],
  [0, 0, [1, 2]],
  [0, 1, [0, 8]],
  [2, 1, [4, 0]],
];

export const STRETCHED_CHAIR: Substitution = {
  mode: "stretchedchair",
  outline: STRETCHED_CHAIR_OUTLINE,
  children: STRETCHED_CHAIR_CHILDREN,
  factor: 2,
  order: 4,
  // The middle of the 2x2 block, as for the P-pentomino: a circle a whole cell
  // edge across, where the centroid sits up towards the column.
  glyphAnchor: [1, 1],
  rotate: squareRotate,
  mirror: squareMirror,
  scale: times(2),
  toXy: squareToXy,
};

// The rhombic L: four 60° rhombi in the shape of the L-tetromino, three up a
// column and one beside the top — the L sheared onto the triangular lattice,
// eight unit triangles. Shearing kept no quarter turn, so it cannot reuse the
// L's reflection-free dissection: its own is unique and reflects two children.
const RHOMBIC_L_OUTLINE: LatticePoint[] = [
  [0, 0],
  [1, 0],
  [1, 1],
  [1, 2],
  [2, 2],
  [2, 3],
  [1, 3],
  [0, 3],
  [0, 2],
  [0, 1],
];

const RHOMBIC_L_CHILDREN: Placement[] = [
  [0, 0, [0, 1]],
  [1, 1, [1, 4]],
  [3, 0, [2, 3]],
  [4, 1, [3, 6]],
];

export const RHOMBIC_L: Substitution = {
  mode: "rhombicl",
  outline: RHOMBIC_L_OUTLINE,
  children: RHOMBIC_L_CHILDREN,
  factor: 2,
  order: 6,
  // The middle of the corner rhombus, the one touching both arms — as the
  // L-tetromino anchors its corner square.
  glyphAnchor: [0.5, 2.5],
  rotate: triRotate,
  mirror: triMirror,
  scale: times(2),
  toXy: triToXy,
};

// The isosceles right triangle — half a square, cut corner to corner — is
// rep-2: its altitude cuts it into two copies of itself, each √2 smaller and
// turned 45°. Its hypotenuse lies along the x axis, two lattice edges long, and
// its legs run diagonally across unit squares to the right angle at (1, 1).
// Corners only: like the trapezoid's, its substitution is edge to edge.
const RIGHT_ISOSCELES_OUTLINE: LatticePoint[] = [
  [0, 0],
  [2, 0],
  [1, 1],
];

// The two halves of the inflated tile, right angle to right angle at the middle
// of its hypotenuse; the reflection-free pair.
const RIGHT_ISOSCELES_CHILDREN: Placement[] = [
  [3, 0, [0, 2]],
  [2, 0, [2, 2]],
];

export const RIGHT_ISOSCELES: Substitution = {
  mode: "rightisosceles",
  outline: RIGHT_ISOSCELES_OUTLINE,
  children: RIGHT_ISOSCELES_CHILDREN,
  factor: Math.SQRT2,
  order: 4,
  rotate: squareRotate,
  mirror: squareMirror,
  scale: squareTurn,
  toXy: squareToXy,
  twist: 1,
  upright: 135,
};

// The 30-60-90 triangle (the "drafter", half an equilateral triangle) is rep-3:
// three copies, √3 smaller and turned 30°, meet at the centre of the equilateral
// triangle it is half of. Its hypotenuse lies along the lattice axis, two edges
// long, and the right angle is at (1, 1). Edge to edge, so corners only. It is
// chiral, so the dissection cannot avoid reflecting a child: two of the three are.
const DRAFTER_OUTLINE: LatticePoint[] = [
  [0, 0],
  [2, 0],
  [1, 1],
];

const DRAFTER_CHILDREN: Placement[] = [
  [1, 1, [0, 0]],
  [3, 0, [2, 2]],
  [3, 1, [2, 2]],
];

export const DRAFTER: Substitution = {
  mode: "drafter",
  outline: DRAFTER_OUTLINE,
  children: DRAFTER_CHILDREN,
  factor: ROOT3,
  order: 6,
  rotate: triRotate,
  mirror: triMirror,
  scale: drafterScale,
  toXy: triToXy,
  twist: 1,
  upright: 150,
};

// The T-tetromino: three unit squares in a row and one on top of the middle, a
// vertex at every lattice step. It is no rep-4 tile, but four Ts fill a 4x4
// square — a pinwheel of quarter turns — so the T scaled by four is its four
// squares, each a block of four Ts: rep-16.
const TTETROMINO_OUTLINE: LatticePoint[] = [
  [0, 0],
  [1, 0],
  [2, 0],
  [3, 0],
  [3, 1],
  [2, 1],
  [2, 2],
  [1, 2],
  [1, 1],
  [0, 1],
];

// Four blocks, the same pinwheel in each, none reflected.
const T_BLOCK: [number, LatticePoint][] = [
  [2, [3, 4]],
  [1, [4, 1]],
  [0, [1, 0]],
  [3, [0, 3]],
];
const TTETROMINO_CHILDREN: Placement[] = [
  [0, 0],
  [4, 0],
  [8, 0],
  [4, 4],
].flatMap(([bx, by]) => T_BLOCK.map(([rot, [x, y]]): Placement => [rot, 0, [x! + bx!, y! + by!]]));

export const TTETROMINO: Substitution = {
  mode: "ttetromino",
  outline: TTETROMINO_OUTLINE,
  children: TTETROMINO_CHILDREN,
  factor: 4,
  order: 4,
  // The middle of the bar's centre square, under the stem: a circle of half a
  // square fits there. The corner mean sits 0.3 higher, up against the stem's
  // inner corners, and leaves the glyph half that.
  glyphAnchor: [1.5, 0.5],
  rotate: squareRotate,
  mirror: squareMirror,
  scale: times(4),
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
  ltetromino: LTETROMINO,
  ppentomino: PPENTOMINO,
  trapezoid: TRAPEZOID,
  righttrapezoid: RIGHT_TRAPEZOID,
  halftrapezoid: HALF_TRAPEZOID,
  stretchedchair: STRETCHED_CHAIR,
  rhombicl: RHOMBIC_L,
  rightisosceles: RIGHT_ISOSCELES,
  drafter: DRAFTER,
  ttetromino: TTETROMINO,
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
 *
 * An inflation that turns (the two right triangles', the Gosper island's) does
 * not commute with a mirror: s^p M = R^(p·twist) M s^p, so a reflected child
 * picks up `power * twist` extra rotation steps at each round. (The Gosper
 * island turns by an angle no lattice rotation matches, and gets away with it
 * only because none of its children is reflected.)
 */
export function substitutionPlacements(tile: Substitution, levels: number): Placement[] {
  if (levels < 0) throw new Error("levels must be >= 0");
  const twist = tile.twist ?? 0;
  let placements: Placement[] = [[0, 0, origin(tile)]];
  for (let power = levels - 1; power >= 0; power--) {
    const children = tile.children.map(([rot, mirrored, translation]): Placement => [
      mirrored ? rot + power * twist : rot,
      mirrored,
      inflate(tile, translation, power),
    ]);
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
//
// A tile with an `upright` is also turned so every level stands the same way
// up: the right triangles' inflations turn 45° and 30° a level, and left alone a
// patch would come out a corner at one level and a long thin triangle lying on
// its hypotenuse at the next. (fractal.py's `board_xy`, before the y flip.)
export function substitutionXy(tile: Substitution, levels: number): (p: LatticePoint) => Vertex {
  if (tile.upright === undefined) return (p) => tile.toXy(p);
  const angle = ((tile.upright - (levels * (tile.twist ?? 0) * 180) / tile.order) * Math.PI) / 180;
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  return (p) => {
    const [x, y] = tile.toXy(p);
    return [x * cos - y * sin, x * sin + y * cos];
  };
}

function substitutionBoard(tile: Substitution, levels: number, scale: number): Board {
  const toXy = substitutionXy(tile, levels);
  const boardXy = (_tile: Substitution, p: LatticePoint): Vertex => {
    const [x, y] = toXy(p);
    return [x, -y];
  };
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
  const board = finalizeFlat(tile.mode, cells, positions, scale);
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
export function sphinxBoard(levels: number, scale = 26): Board {
  return substitutionBoard(SPHINX, levels, scale);
}

/** The chair (L-tromino) rep-tile, inflated `levels` times: 4**levels chairs
 * filling one L-shaped patch. `scale` is pixels per unit square edge. */
export function chairBoard(levels: number, scale = 26): Board {
  return substitutionBoard(CHAIR, levels, scale);
}

/** The L-tetromino rep-tile, inflated `levels` times: 4**levels Ls filling one
 * L-shaped patch. `scale` is pixels per unit square edge. */
export function ltetrominoBoard(levels: number, scale = 26): Board {
  return substitutionBoard(LTETROMINO, levels, scale);
}

/** The P-pentomino rep-tile, inflated `levels` times: 4**levels Ps filling one
 * P-shaped patch. `scale` is pixels per unit square edge. */
export function ppentominoBoard(levels: number, scale = 26): Board {
  return substitutionBoard(PPENTOMINO, levels, scale);
}

/** The trapezoid (triamond) rep-tile, inflated `levels` times: 4**levels
 * trapezoids filling one trapezoid-shaped patch. `scale` is pixels per unit
 * triangle edge. */
export function trapezoidBoard(levels: number, scale = 26): Board {
  return substitutionBoard(TRAPEZOID, levels, scale);
}

/** The right trapezoid (a square and a half) rep-tile, inflated `levels` times:
 * 4**levels trapezoids filling one trapezoid-shaped patch. `scale` is pixels
 * per unit square edge. */
export function rightTrapezoidBoard(levels: number, scale = 26): Board {
  return substitutionBoard(RIGHT_TRAPEZOID, levels, scale);
}

/** The half trapezoid (half a doubled triamond) rep-tile, inflated `levels`
 * times: 4**levels of them filling one patch of the same shape. `scale` is
 * pixels per unit triangle edge. */
export function halfTrapezoidBoard(levels: number, scale = 26): Board {
  return substitutionBoard(HALF_TRAPEZOID, levels, scale);
}

/** The stretched chair (an L of three upright dominoes) rep-tile, inflated
 * `levels` times: 4**levels of them filling one patch of the same shape.
 * `scale` is pixels per unit square edge. */
export function stretchedChairBoard(levels: number, scale = 26): Board {
  return substitutionBoard(STRETCHED_CHAIR, levels, scale);
}

/** The rhombic L (the L-tetromino sheared into four rhombi) rep-tile, inflated
 * `levels` times: 4**levels of them filling one L-shaped patch. `scale` is
 * pixels per unit triangle edge. */
export function rhombicLBoard(levels: number, scale = 26): Board {
  return substitutionBoard(RHOMBIC_L, levels, scale);
}

/** The isosceles right triangle rep-tile, inflated `levels` times: 2**levels
 * half-squares filling one triangle-shaped patch. `scale` is pixels per unit
 * square edge. */
export function rightIsoscelesBoard(levels: number, scale = 26): Board {
  return substitutionBoard(RIGHT_ISOSCELES, levels, scale);
}

/** The 30-60-90 triangle rep-tile, inflated `levels` times: 3**levels of them
 * filling one triangle-shaped patch. `scale` is pixels per unit triangle edge
 * (the tile's hypotenuse is two). */
export function drafterBoard(levels: number, scale = 26): Board {
  return substitutionBoard(DRAFTER, levels, scale);
}

/** The T-tetromino rep-tile, inflated `levels` times: 16**levels Ts filling one
 * T-shaped patch. `scale` is pixels per unit square edge. */
export function ttetrominoBoard(levels: number, scale = 26): Board {
  return substitutionBoard(TTETROMINO, levels, scale);
}

/** The Sierpinski carpet, inflated `levels` times: 8**levels unit squares in a
 * 3**levels square patch (1, 8, 64, 512, 4096 tiles), the middle ninth of every
 * block left out at every scale. `scale` is pixels per unit square edge. */
export function carpetBoard(levels: number, scale = 26): Board {
  return substitutionBoard(CARPET, levels, scale);
}

/** The pentaflake, inflated `levels` times: 6**levels regular pentagons in a
 * pentagon-shaped patch (1, 6, 36, 216, 1296 tiles), with a gnomon-shaped gap
 * left over per side at every scale. `scale` is pixels per unit pentagon
 * circumradius. */
export function pentaflakeBoard(levels: number, scale = 26): Board {
  return substitutionBoard(PENTAFLAKE, levels, scale);
}

/** The Gosper island, inflated `levels` times: 7**levels regular hexagons
 * (1, 7, 49, 343, 2401 tiles) in a patch with no holes whose outline converges
 * on the Gosper island — and which is turned 19.106° further round with every
 * level. `scale` is pixels per unit hexagon circumradius. */
export function gosperBoard(levels: number, scale = 26): Board {
  return substitutionBoard(GOSPER, levels, scale);
}

// -- the five-triangle ----------------------------------------------------------
//
// The 1:2 right triangle (legs 1 and 2, hypotenuse √5) is rep-5: the altitude
// from the right angle cuts off one copy √5 smaller, and what is left is a copy
// twice that size, cut rep-4 through the midpoints of its sides. Its inflation
// turns by atan(1/2) (multiplication by 2 + i) and every child is reflected, so
// the turn comes straight back off at the next level: each level's tiles take
// the four quarter turns of one hand, the hand and a 26.57° tilt alternating.
// The placement machinery cannot say that — a reflected child's twist would be
// (3 + 4i)/5, a rotation of no finite order — so the patch is cut affinely.
//
// Its famous relative, Conway and Radin's pinwheel, halves the twice copy's
// middle rectangle along the other diagonal, which reflects two of the five and
// sends the tiles off in ever more directions. Measured, that leaves 22 of a
// 125-cell patch's cells with an indistinguishable twin, a coin flip per mine,
// where this split leaves two. So this one ships, under the GIF's own name for
// the tile. See fractal.py.
//
// What carries over exactly is the dissection's *affine* description. A
// triangle is its corners in role order (A, B, C): A the 26.57° corner, B the
// right angle, C the 63.43° corner. The split points are fixed rational
// combinations of those — D = (A + 4C)/5 is the foot of the altitude from B, the
// rest are midpoints — and an affine rule applied to any similar triangle,
// reflected or not, is that triangle's own dissection. Every level divides by
// at most 10, so a root 10**levels times the unit is cut into exact integer
// corners all the way down (well inside 2^53 at any level that reads).
//
// The patch is not edge to edge (the altitude foot lands two fifths of the way
// along a neighbour's leg), so `fiveTriangleCells` records the T-vertices
// afterwards: every corner lying inside another tile's edge is inserted into
// that edge, exactly.

type Triangle = readonly [LatticePoint, LatticePoint, LatticePoint];

function fiveTriangleSplit([a, b, c]: Triangle): Triangle[] {
  /** sum(weight · point) / denominator, exactly (it always divides). */
  const mix = (terms: [number, LatticePoint][], denominator: number): LatticePoint => {
    const x = terms.reduce((sum, [w, p]) => sum + w * p[0]!, 0);
    const y = terms.reduce((sum, [w, p]) => sum + w * p[1]!, 0);
    if (x % denominator !== 0 || y % denominator !== 0)
      throw new Error("five-triangle left the grid");
    return [x / denominator, y / denominator];
  };
  const d = mix(
    [
      [1, a],
      [4, c],
    ],
    5,
  ); // the foot of the altitude from B
  const ad = mix(
    [
      [1, a],
      [1, d],
    ],
    2,
  );
  const db = mix(
    [
      [1, d],
      [1, b],
    ],
    2,
  );
  const ba = mix(
    [
      [1, b],
      [1, a],
    ],
    2,
  );
  return [
    [b, d, c], // the one copy √5 smaller, its small corner at B
    [a, ad, ba], // (A, D, B), twice a copy, cut through its midpoints: the corner at A,
    [ad, d, db], // ...the corner at D,
    [ba, db, b], // ...the corner at B,
    [db, ba, ad], // ...and the middle one, a half turn
  ];
}

/** The 5**levels triangles of a level-`levels` five-triangle patch, in (A, B, C)
 * role order, on the integer grid in which the root's short leg is 10**levels
 * long: A = (0, 0), B = (2k, 0), C = (2k, k). */
export function fiveTriangles(levels: number): Triangle[] {
  if (levels < 0) throw new Error("levels must be >= 0");
  const k = 10 ** levels;
  let triangles: Triangle[] = [
    [
      [0, 0],
      [2 * k, 0],
      [2 * k, k],
    ],
  ];
  for (let i = 0; i < levels; i++) triangles = triangles.flatMap(fiveTriangleSplit);
  return triangles;
}

/** Each triangle as a counterclockwise polygon carrying every T-vertex that
 * lies on its edges. */
function fiveTriangleCells(levels: number): Map<CellId, LatticePoint[]> {
  const triangles = fiveTriangles(levels);
  const corners = new Map<string, LatticePoint>();
  for (const tri of triangles) for (const p of tri) corners.set(p.join(","), p);
  // bucket the corners on a grid about one tile across, so an edge only looks
  // at the corners near it
  const size = Math.max(1, Math.floor(10 ** levels / 5 ** (Math.floor(levels / 2) + (levels % 2))));
  const buckets = new Map<string, LatticePoint[]>();
  for (const p of corners.values()) {
    const key = `${Math.floor(p[0]! / size)},${Math.floor(p[1]! / size)}`;
    const bucket = buckets.get(key);
    if (bucket) bucket.push(p);
    else buckets.set(key, [p]);
  }
  /** The corners strictly inside segment pq, from p towards q. */
  const between = (p: LatticePoint, q: LatticePoint): LatticePoint[] => {
    const [px, py] = [p[0]!, p[1]!];
    const [qx, qy] = [q[0]!, q[1]!];
    const length = (qx - px) ** 2 + (qy - py) ** 2;
    const found: [number, LatticePoint][] = [];
    for (
      let bx = Math.floor(Math.min(px, qx) / size);
      bx <= Math.floor(Math.max(px, qx) / size);
      bx++
    ) {
      for (
        let by = Math.floor(Math.min(py, qy) / size);
        by <= Math.floor(Math.max(py, qy) / size);
        by++
      ) {
        for (const v of buckets.get(`${bx},${by}`) ?? []) {
          const [vx, vy] = [v[0]!, v[1]!];
          if ((vx === px && vy === py) || (vx === qx && vy === qy)) continue;
          const cross = (qx - px) * (vy - py) - (qy - py) * (vx - px);
          const dot = (vx - px) * (qx - px) + (vy - py) * (qy - py);
          if (cross === 0 && dot > 0 && dot < length) found.push([dot, v]);
        }
      }
    }
    return found.sort((u, w) => u[0] - w[0]).map(([, v]) => v);
  };
  const cells = new Map<CellId, LatticePoint[]>();
  for (const [a, b, c] of triangles) {
    const turn = (b[0]! - a[0]!) * (c[1]! - a[1]!) - (b[1]! - a[1]!) * (c[0]! - a[0]!);
    const ring = turn > 0 ? [a, b, c] : [a, c, b];
    const polygon: LatticePoint[] = [];
    ring.forEach((p, i) => {
      polygon.push(p);
      polygon.push(...between(p, ring[(i + 1) % 3]!));
    });
    cells.set(cid(...a, ...b, ...c), polygon);
  }
  return cells;
}

/** The five-triangle rep-tile — the 1:2 right triangle — cut `levels` times:
 * 5**levels triangles (1, 5, 25, 125, 625 tiles) filling one triangle-shaped
 * patch. `scale` is pixels per the tile's
 * short leg. */
export function fiveTriangleBoard(levels: number, scale = 26): Board {
  const unit = 10 ** levels / 5 ** (levels / 2);
  const cells = new Map<CellId, string[]>();
  const positions = new Map<string, Vertex>();
  for (const [cell, polygon] of fiveTriangleCells(levels)) {
    cells.set(
      cell,
      polygon.map((p) => {
        const key = p.join(",");
        // y negated, as boardXy does for the lattice tiles, so the board stands
        // the way its icon does
        if (!positions.has(key)) positions.set(key, [p[0]! / unit, -p[1]! / unit]);
        return key;
      }),
    );
  }
  return finalizeFlat("fivetriangle", cells, positions, scale);
}
