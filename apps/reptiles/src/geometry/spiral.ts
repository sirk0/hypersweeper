// A spiral patch in exact coordinates: one of Hypersweeper's spirals — the
// phyllotactic hexagons, Klaassen's heptagon, Klaassen's pentagons at five-,
// six- and seven-fold — trimmed to its `keep` centremost tiles as the
// Hypersweeper builder trims it, read off the very ids the builder keys its
// vertices by (`phyllotaxisExact` and its siblings in @tiling/geometry).
//
// Those ids are coefficients over ζ = exp(2πi/order): ℤ[ζ10] for the
// phyllotactic and five-fold spirals, ℤ[ζ12] for the six-fold, ℤ[ζ7] for
// Klaassen's and the seven-fold. The tiles of a ζ7 spiral sit at every
// fourteenth of a turn, not only every seventh, so those are carried into
// ℤ[ζ14] — the same ring, ζ7 = ζ14² — where the tray's rotate step can reach
// them. Each point is mirrored in the x axis: Hypersweeper's drawing runs y
// down, and a spiral is chiral, so this is the way round it shows it.
//
// The pentagonal spirals are not edge to edge, and Hypersweeper's outlines
// carry each T-vertex; a tile here is its real corners only (`corners`).

import {
  klaassenExact,
  pentaSpiralExact,
  phyllotaxisExact,
  type ExactTiles,
} from "@tiling/geometry";
import { cyclotomic, type Cyc, type Ring } from "./cyclotomic";
import { corners } from "./repTile";

export interface SpiralPatch {
  ring: Ring;
  cells: Cyc[][];
}

/** Hypersweeper's spiral builders, by mode: (rings, keep) → exact tiles. */
const SPIRALS: Record<string, (rings: number, keep: number) => ExactTiles> = {
  phyllotaxis: phyllotaxisExact,
  klaassen: klaassenExact,
  pentaspiral5: (rings, keep) => pentaSpiralExact(5, rings, keep),
  pentaspiral6: (rings, keep) => pentaSpiralExact(6, rings, keep),
  pentaspiral7: (rings, keep) => pentaSpiralExact(7, rings, keep),
};

export const SPIRAL_MODES = Object.keys(SPIRALS);

export function spiralPatch(mode: string, rings: number, keep: number): SpiralPatch {
  const build = SPIRALS[mode];
  if (!build) throw new Error(`no spiral ${mode}`);
  const { order, cells } = build(rings, keep);
  const n = order % 2 ? 2 * order : order;
  const ring = cyclotomic(n);
  // ζ_order^i, the builder's basis, as an element of ℤ[ζn]
  const basis = (cells[0]?.[0] ?? []).map((_, i) => ring.zeta((i * n) / order));
  const toCyc = (p: readonly number[]): Cyc =>
    ring.conj(p.reduce<Cyc>((sum, c, i) => sum.map((x, j) => x + c * basis[i]![j]!), ring.zero));
  return { ring, cells: cells.map((cell) => corners(ring, cell.map(toCyc))) };
}
