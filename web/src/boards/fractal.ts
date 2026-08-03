// Port of minesweeper/boards/fractal.py — the three self-similar (fractal) flat
// boards: the sphinx, the chair and the Sierpinski carpet. Structure and cell
// ids mirror the Python source so the two stay diffable; see it for the fuller
// commentary.
//
// Each is one tile inflated `levels` times: the tile is scaled up by the
// substitution's `factor` and refilled with copies of itself, so the patch grows
// by `children.length` per level and its outline stays the tile, scaled. That
// self-similar outline is the board — unlike every other flat board these are
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
//
// All three lattices are integer and every child translation is the parent's
// scaled by a power of the factor, so a placement stays an exact (rotation,
// mirror, integer translation) triple all the way down and vertex ids need no
// tolerance.
//
// The sphinx's and the chair's outlines carry a vertex at *every* lattice step
// along their edges, not just at their corners: those two tilings are not edge
// to edge, and the collinear ids are what let shared-vertex adjacency see a
// neighbour that plants its corner mid-edge (the bargain the isogonal tilings
// and the Spectre make). `shapeMetrics` drops them again, so the sphinx reads as
// a pentagon and the chair as a hexagon. The carpet needs none of that: its unit
// squares meet edge to edge, corner to corner.

import { type Board, type CellId, cid, finalizeFlat, type Vertex } from "./core";

export type LatticePoint = readonly [number, number];

/** The rigid motion x ↦ R^rot(M^mirror x) + translation, exactly. */
export type Placement = readonly [number, number, LatticePoint];

const IDENTITY: Placement = [0, 0, [0, 0]];

const ROOT3 = Math.sqrt(3);

// Triangular lattice: (a, b) stands for a·(1, 0) + b·(1/2, √3/2), so a 60°
// rotation and a mirror are both integer maps.
const triRotate = ([a, b]: LatticePoint): LatticePoint => [-b, a + b];
const triMirror = ([a, b]: LatticePoint): LatticePoint => [a + b, -b];
const triToXy = ([a, b]: LatticePoint): Vertex => [a + b / 2, (b * ROOT3) / 2];

const squareRotate = ([x, y]: LatticePoint): LatticePoint => [-y, x];
const squareMirror = ([x, y]: LatticePoint): LatticePoint => [x, -y];
const squareToXy = ([x, y]: LatticePoint): Vertex => [x, y];

export interface Substitution {
  mode: string;
  /** The unit tile, a vertex per lattice step along every edge, CCW. */
  outline: LatticePoint[];
  /** The unit tiles inside the tile scaled by `factor` — a dissection for a
   * rep-tile, a dissection with a hole in it for the carpet. */
  children: Placement[];
  /** Linear scale of one inflation (2 for the rep-4 tiles, 3 for the carpet). */
  factor: number;
  /** Rotation order of the lattice (6 triangular, 4 square). */
  order: number;
  /** Where to centre the cell's number/flag/mine glyph, in the tile's own
   * unrotated lattice coordinates — for a concave tile whose true centroid
   * sits right at the reflex corner (a poor, cramped glyph spot). Unset for
   * a tile whose centroid already fits a decent circle (the sphinx). */
  glyphAnchor?: LatticePoint;
  rotate(p: LatticePoint): LatticePoint;
  mirror(p: LatticePoint): LatticePoint;
  toXy(p: LatticePoint): Vertex;
}

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
  toXy: squareToXy,
};

export const SUBSTITUTIONS: Record<string, Substitution> = {
  sphinx: SPHINX,
  chair: CHAIR,
  carpet: CARPET,
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
  const [rot, mirrored, [tx, ty]] = at;
  const [x, y] = linear(tile, rot, mirrored, p);
  return [x + tx, y + ty];
}

/** `parent` after `child`, with the child's translation scaled to `size` (its
 * own tile's edge). Mirroring negates the inner rotation — the only thing the
 * mirror flag costs, as for the Spectre. */
function compose(tile: Substitution, parent: Placement, child: Placement, size: number): Placement {
  const [pRot, pMirror, [px, py]] = parent;
  const [cRot, cMirror, [cx, cy]] = child;
  const [dx, dy] = linear(tile, pRot, pMirror, [cx * size, cy * size]);
  const rot = pMirror ? pRot - cRot : pRot + cRot;
  return [
    ((rot % tile.order) + tile.order) % tile.order,
    pMirror ^ cMirror,
    [px + dx, py + dy],
  ];
}

/**
 * The `children.length ** levels` unit tiles of a level-`levels` supertile.
 * Starts from one tile of edge factor**levels and substitutes downwards,
 * dividing the edge by the factor each round; the children's translations are
 * in units of their own (once-smaller) tile, so scaling them by that size keeps
 * every placement an exact lattice point.
 */
export function substitutionPlacements(tile: Substitution, levels: number): Placement[] {
  if (levels < 0) throw new Error("levels must be >= 0");
  let placements: Placement[] = [IDENTITY];
  let size = tile.factor ** levels;
  for (let level = 0; level < levels; level++) {
    size /= tile.factor;
    const next: Placement[] = [];
    for (const parent of placements) {
      for (const child of tile.children) next.push(compose(tile, parent, child, size));
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
    const [rot, mirrored, [tx, ty]] = at;
    // a mirrored placement reverses the outline's winding; walk it backwards
    // so every cell's polygon stays counterclockwise
    const outline = mirrored ? [...tile.outline].reverse() : tile.outline;
    const keys = outline.map((v) => {
      const p = placePoint(tile, at, v);
      const key = `${p[0]},${p[1]}`;
      if (!positions.has(key)) positions.set(key, boardXy(tile, p));
      return key;
    });
    const cell = cid(rot, mirrored, tx, ty);
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
