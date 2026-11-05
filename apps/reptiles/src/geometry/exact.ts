// Tiles a Hypersweeper builder publishes in exact coordinates (`ExactTiles` in
// @tiling/geometry: the spirals', the aperiodic tilings') read into a ring
// here.
//
// A builder's ids are coefficients over ζ = exp(2πi/order). An odd order is
// carried into ℤ[ζ(2·order)] — the same ring, ζ_order = ζ²: the tiles of a ζ7
// spiral sit at every fourteenth of a turn, not only every seventh, and the
// tray's rotate step has to reach them. Each point is mirrored in the x axis:
// Hypersweeper's drawing runs y down, and a chiral board (a spiral, the
// Spectre) is to show the way round Hypersweeper shows it. A tile is its real
// corners only (`corners`): the collinear points a builder keeps for its
// shared-vertex adjacency — T-vertices, the Spectre's flat corner — are
// dropped, unless the caller keeps them (`keepFlat`: a round tile's curves
// meet at its flat corner).

import type { ExactTiles } from "@tiling/geometry";
import { cyclotomic, type Cyc, type Ring } from "./cyclotomic";
import { corners } from "./repTile";

export interface ExactPatch {
  ring: Ring;
  cells: Cyc[][];
}

export function exactPatch({ order, cells }: ExactTiles, keepFlat = false): ExactPatch {
  const n = order % 2 ? 2 * order : order;
  const ring = cyclotomic(n);
  // ζ_order^i, the builder's basis, as an element of ℤ[ζn]
  const basis = (cells[0]?.[0] ?? []).map((_, i) => ring.zeta((i * n) / order));
  const toCyc = (p: readonly number[]): Cyc =>
    ring.conj(p.reduce<Cyc>((sum, c, i) => sum.map((x, j) => x + c * basis[i]![j]!), ring.zero));
  const read = (cell: readonly (readonly number[])[]): Cyc[] => cell.map(toCyc);
  return {
    ring,
    cells: cells.map((cell) => (keepFlat ? read(cell) : corners(ring, read(cell)))),
  };
}
