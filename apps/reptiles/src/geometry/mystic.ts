// Tile(1,1) and the Mystic: the Spectre tiling (Smith, Myers, Kaplan and
// Goodman-Strauss, 2023) as its substitution builds it — of Spectres, and of
// Mystics, the cluster of two Spectres, one turned 30° against the other,
// that the rule lays as a unit (Kaplan's Γ). Read off the very patch
// Hypersweeper's Spectre board is (`spectreLabelledExact` in
// @tiling/geometry), each Mystic's two Spectres fused into the one outline
// they make: exact in ℤ[ζ12], straight edges, as the Tile(1,1) level's are.
// Neither tile is ever mirrored.

import { spectreLabelledExact } from "@tiling/geometry";
import type { Cyc, Ring } from "./cyclotomic";
import { exactPatch } from "./exact";
import { ccw, outline } from "./outline";
import { corners } from "./repTile";

/** The kinds: a lone Spectre (Tile(1,1)), and a Mystic. */
export const MYSTIC_SPECTRE = 0;
export const MYSTIC = 1;

/** The Spectre cluster grown `depth` substitutions, every Mystic one cell:
 * each tile's real corners, and its kind. */
export function mysticPatch(depth: number): { ring: Ring; cells: Cyc[][]; kinds: number[] } {
  const exact = spectreLabelledExact(depth);
  const patch = exactPatch(exact);
  const ring = patch.ring;
  // counter-clockwise, as every cell of a level is (the builder's y runs down)
  const spectres = patch.cells.map((c) => ccw(ring, c));
  const cells: Cyc[][] = [];
  const kinds: number[] = [];
  for (let i = 0; i < spectres.length; i++) {
    const label = exact.labels[i]!;
    if (label === "Gamma1") {
      if (exact.labels[i + 1] !== "Gamma2")
        throw new Error("mysticPatch: a Mystic is two Spectres");
      const loops = outline(ring, [spectres[i]!, spectres[i + 1]!]);
      if (loops.length !== 1)
        throw new Error("mysticPatch: a Mystic's Spectres do not share a side");
      cells.push(corners(ring, loops[0]!));
      kinds.push(MYSTIC);
      i++;
    } else {
      cells.push(spectres[i]!);
      kinds.push(MYSTIC_SPECTRE);
    }
  }
  return { ring, cells, kinds };
}
