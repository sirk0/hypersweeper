// An aperiodic patch in exact coordinates: one of Hypersweeper's aperiodic
// tilings — the Penrose rhombi, Penrose's kites and darts, Ammann–Beenker's
// squares and rhombi, the Spectre — as the centred window its builder trims to
// `keep` tiles (variant 0, the patch's sun or star in the middle), read off
// the very ids the builder keys its vertices by (`penroseExact` and its
// siblings in @tiling/geometry).
//
// Those are ℤ[ζ10] for both Penrose tilings, ℤ[ζ8] for Ammann–Beenker and
// ℤ[ζ12] for the Spectre. The Penrose patches are grown by *deflating* a
// unit wheel, so their edges come out 1/φ^depth; they are scaled back up here
// by φ^depth — φ = ζ + ζ⁻¹ is in the ring, so exactly — to unit edges (a
// kite's and a dart's long ones; their short ones are 1/φ). The other two
// inflate outward from unit tiles already. The Spectre's flat corner is
// dropped (`exactPatch`), so it is the 13-gon it looks.

import {
  ammannBeenkerExact,
  kiteDartExact,
  penroseExact,
  spectreExact,
  type ExactTiles,
} from "@tiling/geometry";
import { exactPatch, type ExactPatch } from "./exact";

/** Hypersweeper's aperiodic builders, by mode: (depth, keep) → exact tiles,
 * and whether the patch was deflated (its edges 1/φ^depth). */
const APERIODIC: Record<string, [(depth: number, keep: number) => ExactTiles, boolean]> = {
  penrose: [penroseExact, true],
  kitedart: [kiteDartExact, true],
  ammannbeenker: [ammannBeenkerExact, false],
  spectre: [spectreExact, false],
};

export const APERIODIC_MODES = Object.keys(APERIODIC);

/** How much the builder for `mode` shrank a unit edge at `depth`: the scale
 * its board takes to draw that edge one unit long. */
export function aperiodicShrink(mode: string, depth: number): number {
  const deflated = APERIODIC[mode]?.[1];
  return deflated ? ((1 + Math.sqrt(5)) / 2) ** -depth : 1;
}

export function aperiodicPatch(mode: string, depth: number, keep: number): ExactPatch {
  const entry = APERIODIC[mode];
  if (!entry) throw new Error(`no aperiodic tiling ${mode}`);
  const [build, deflated] = entry;
  const { ring, cells } = exactPatch(build(depth, keep));
  if (!deflated) return { ring, cells };
  const phi = ring.add(ring.zeta(1), ring.conj(ring.zeta(1)));
  let grow = ring.one;
  for (let i = 0; i < depth; i++) grow = ring.mul(grow, phi);
  return { ring, cells: cells.map((cell) => cell.map((v) => ring.mul(grow, v))) };
}
