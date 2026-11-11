// A rep-tile patch in exact coordinates: one of Hypersweeper's substitution
// tiles (`SUBSTITUTIONS` in @tiling/geometry — the sphinx, the chair, the
// L-tetromino…) inflated `levels` times, so its children fill the tile grown
// by √n per level, and the patch's outline is the tile again.
//
// Hypersweeper places every child exactly on the tile's own lattice — square
// (x, y) or triangular (a, b) = a + b·ζ6 — and only *draws* a turning
// inflation (the two right triangles') turned back upright, by a multiple of
// 45° or 30°. Here that drawing turn is done exactly too: each lattice point
// becomes x + y·i (or a + b·ζ6) in the first of ℤ[ζ4], ζ8, ζ12, ζ24 that also
// holds the turn, and is multiplied by it. So the cells are the very tiles
// Hypersweeper draws, at its unit, y up as it shows them.
//
// Hypersweeper's outlines carry a vertex at every lattice step along each
// side, for its shared-vertex adjacency; a tile here is its real corners only,
// so those collinear points are dropped (exactly: `orient` is zero). The
// tiles still meet part-way along each other's sides — the frontier and the
// outline handle the T-junctions, as for the brick bonds.

import { placePoint, SUBSTITUTIONS, substitutionPlacements } from "@tiling/geometry";
import { cyclotomic, orient, type Cyc, type Ring } from "./cyclotomic";

export interface RepTilePatch {
  ring: Ring;
  cells: Cyc[][];
}

/** `verts` with every corner that does not turn removed. */
export function corners(ring: Ring, verts: Cyc[]): Cyc[] {
  return verts.filter((v, i) => {
    const prev = verts[(i - 1 + verts.length) % verts.length]!;
    const next = verts[(i + 1) % verts.length]!;
    return orient(ring, prev, v, next) !== 0;
  });
}

/** The patch's cells as `substitutionPlacements` lays them: each one's real
 * corners in the tile's own outline order, so edge j of every cell is the
 * same edge of the tile — counter-clockwise, or clockwise where the copy is
 * mirrored. What a rep-tile's matching rules are read off (`FramedPatch`). */
export function repTilePatch(mode: string, levels: number): RepTilePatch {
  const tile = SUBSTITUTIONS[mode];
  if (!tile) throw new Error(`no substitution tile ${mode}`);
  if (tile.order !== 4 && tile.order !== 6) {
    throw new Error(`${mode}: only the square and triangular lattices are rep-tiles here`);
  }
  // The turn Hypersweeper draws the patch at (`substitutionXy`), in degrees.
  const degrees = (tile.upright ?? 0) - (levels * (tile.twist ?? 0) * 180) / tile.order;
  const n = [4, 8, 12, 24].find(
    (m) => m % (tile.order === 4 ? 4 : 12) === 0 && Number.isInteger((degrees * m) / 360),
  );
  if (!n) throw new Error(`${mode}: no ring holds a ${degrees}° turn`);
  const ring = cyclotomic(n);
  const second = ring.zeta(n / tile.order); // i, or ζ6
  const upright = ring.zeta((degrees * n) / 360);
  const toCyc = (p: readonly number[]): Cyc =>
    ring.mul(
      upright,
      ring.add(
        ring.one.map((c) => c * p[0]!),
        second.map((c) => c * p[1]!),
      ),
    );
  const cells = substitutionPlacements(tile, levels).map((at) =>
    corners(
      ring,
      tile.outline.map((v) => toCyc(placePoint(tile, at, v))),
    ),
  );
  return { ring, cells };
}
