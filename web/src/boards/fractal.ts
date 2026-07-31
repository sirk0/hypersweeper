// Port of minesweeper/boards/fractal.py — the two rep-tile (fractal) flat
// boards, the sphinx and the chair. Structure and cell ids mirror the Python
// source so the two stay diffable; see it for the fuller commentary.
//
// A *rep-tile* is a polygon that tiles a scaled copy of itself. Both tiles here
// are rep-4: four half-size copies fill the tile exactly, so inflating one tile
// `levels` times gives 4**levels tiles whose outline is the tile again, scaled.
// That self-similar outline is the board — unlike every other flat board these
// are deliberately not a rectangular window, because trimming the patch to a
// square block would throw away the only thing that makes them what they are.
//
//   * The **sphinx** is the pentagonal hexiamond (six unit triangles, sides
//     3, 1, 1, 1, 2) on the triangular lattice. Its rep-4 dissection is unique.
//   * The **chair** (L-tromino) is three unit squares, dissected by the classic
//     chair substitution: four quarter-turns, none reflected.
//
// Both lattices are integer and every child translation is the parent's scaled
// by a power of two, so a placement stays an exact (rotation, mirror, integer
// translation) triple all the way down and vertex ids need no tolerance.
//
// Tile outlines carry a vertex at *every* lattice step along their edges, not
// just at their corners: the tilings are not edge to edge, and those collinear
// ids are what let shared-vertex adjacency see a neighbour that plants its
// corner mid-edge (the bargain the isogonal tilings and the Spectre make).
// `shapeMetrics` drops them again, so the sphinx reads as a pentagon and the
// chair as a hexagon.

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

export interface RepTile {
  mode: string;
  /** The unit tile, a vertex per lattice step along every edge, CCW. */
  outline: LatticePoint[];
  /** The unit tiles of a size-2 tile: the rep-4 dissection. */
  children: Placement[];
  /** Rotation order of the lattice (6 triangular, 4 square). */
  order: number;
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

export const SPHINX: RepTile = {
  mode: "sphinx",
  outline: SPHINX_OUTLINE,
  children: SPHINX_CHILDREN,
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

export const CHAIR: RepTile = {
  mode: "chair",
  outline: CHAIR_OUTLINE,
  children: CHAIR_CHILDREN,
  order: 4,
  rotate: squareRotate,
  mirror: squareMirror,
  toXy: squareToXy,
};

export const REP_TILES: Record<string, RepTile> = { sphinx: SPHINX, chair: CHAIR };

/** The rotation/mirror part of a placement, applied to a lattice point. */
function linear(tile: RepTile, rot: number, mirrored: number, p: LatticePoint): LatticePoint {
  let out = mirrored ? tile.mirror(p) : p;
  for (let i = ((rot % tile.order) + tile.order) % tile.order; i > 0; i--) {
    out = tile.rotate(out);
  }
  return out;
}

export function placePoint(tile: RepTile, at: Placement, p: LatticePoint): LatticePoint {
  const [rot, mirrored, [tx, ty]] = at;
  const [x, y] = linear(tile, rot, mirrored, p);
  return [x + tx, y + ty];
}

/** `parent` after `child`, with the child's translation scaled to `size` (its
 * own tile's edge). Mirroring negates the inner rotation — the only thing the
 * mirror flag costs, as for the Spectre. */
function compose(tile: RepTile, parent: Placement, child: Placement, size: number): Placement {
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
 * The 4**`levels` unit tiles of a level-`levels` supertile. Starts from one
 * tile of edge 2**levels and substitutes downwards, halving the edge each
 * round; the children's translations are in units of their own (half-size)
 * tile, so scaling them by that size keeps every placement an exact lattice
 * point.
 */
export function repPlacements(tile: RepTile, levels: number): Placement[] {
  if (levels < 0) throw new Error("levels must be >= 0");
  let placements: Placement[] = [IDENTITY];
  let size = 1 << levels;
  for (let level = 0; level < levels; level++) {
    size /= 2;
    const next: Placement[] = [];
    for (const parent of placements) {
      for (const child of tile.children) next.push(compose(tile, parent, child, size));
    }
    placements = next;
  }
  return placements;
}

function repBoard(tile: RepTile, levels: number, mineCount: number, scale: number): Board {
  const cells = new Map<CellId, string[]>();
  const positions = new Map<string, Vertex>();
  for (const at of repPlacements(tile, levels)) {
    const [rot, mirrored, [tx, ty]] = at;
    // a mirrored placement reverses the outline's winding; walk it backwards
    // so every cell's polygon stays counterclockwise
    const outline = mirrored ? [...tile.outline].reverse() : tile.outline;
    const keys = outline.map((v) => {
      const p = placePoint(tile, at, v);
      const key = `${p[0]},${p[1]}`;
      if (!positions.has(key)) positions.set(key, tile.toXy(p));
      return key;
    });
    cells.set(cid(rot, mirrored, tx, ty), keys);
  }
  if (cells.size !== 4 ** levels) throw new Error("substitution produced overlapping placements");
  return finalizeFlat(tile.mode, cells, positions, mineCount, scale);
}

/** The sphinx rep-tile, inflated `levels` times: 4**levels sphinxes filling one
 * sphinx-shaped patch. `scale` is pixels per unit triangle edge. */
export function sphinxBoard(levels: number, mineCount: number, scale = 26): Board {
  return repBoard(SPHINX, levels, mineCount, scale);
}

/** The chair (L-tromino) rep-tile, inflated `levels` times: 4**levels chairs
 * filling one L-shaped patch. `scale` is pixels per unit square edge. */
export function chairBoard(levels: number, mineCount: number, scale = 26): Board {
  return repBoard(CHAIR, levels, mineCount, scale);
}
