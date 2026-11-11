// A spiral patch in exact coordinates: one of Hypersweeper's spirals — the
// phyllotactic hexagons, Klaassen's heptagon, Klaassen's pentagons at five-,
// six- and seven-fold — trimmed to its `keep` centremost tiles as the
// Hypersweeper builder trims it, read off the very ids the builder keys its
// vertices by (`phyllotaxisExact` and its siblings in @tiling/geometry).
//
// Those ids are coefficients over ζ = exp(2πi/order): ℤ[ζ10] for the
// phyllotactic and five-fold spirals, ℤ[ζ12] for the six-fold, ℤ[ζ7] for
// Klaassen's and the seven-fold, which `exactPatch` carries into ℤ[ζ14]. The
// pentagonal spirals are not edge to edge, and Hypersweeper's outlines carry
// each T-vertex; a tile here is its real corners only.

import {
  klaassenExact,
  pentaSpiralExact,
  phyllotaxisExact,
  type ExactTiles,
} from "@tiling/geometry";
import { exactPatch, type ExactPatch } from "./exact";

/** Hypersweeper's spiral builders, by mode: (rings, keep) → exact tiles. */
const SPIRALS: Record<string, (rings: number, keep: number | null) => ExactTiles> = {
  phyllotaxis: phyllotaxisExact,
  klaassen: klaassenExact,
  pentaspiral5: (rings, keep) => pentaSpiralExact(5, rings, keep),
  pentaspiral6: (rings, keep) => pentaSpiralExact(6, rings, keep),
  pentaspiral7: (rings, keep) => pentaSpiralExact(7, rings, keep),
};

export const SPIRAL_MODES = Object.keys(SPIRALS);

/** The spiral `mode` grown `rings` out, trimmed to its `keep` centremost
 * tiles — or, with `keep` null, all of it (the patch its marks are read off). */
export function spiralPatch(mode: string, rings: number, keep: number | null): ExactPatch {
  const build = SPIRALS[mode];
  if (!build) throw new Error(`no spiral ${mode}`);
  return exactPatch(build(rings, keep));
}
