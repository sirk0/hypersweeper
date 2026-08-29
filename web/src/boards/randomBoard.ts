import { flatMenuModes, threeDMenuModes } from "./catalog";
import { pickWeighted } from "./fairness";
import { hasMode } from "./presets";

// Dealing a board at random, from one half of the catalogue.
//
// The home page's Flat and 3D rows are the reason this exists (ui/menu.ts), and
// the record window's "New board" is the second caller: a win is the moment a
// player decides what to play next, and it should be able to deal them one on
// the same terms the menu does — the same pools, and the same weighting, which
// keeps the boards whose tiling forces guesses in the pool but deals them a
// quarter as often (boards/fairness.ts).

/** Which half of the catalogue: the plane, or everything off it. */
export type RandomKind = "flat" | "3d";

/** Every board that half can deal, filtered to the modes this build has got.
 * The pools are exactly what the two pickers reach, so a board that is not in
 * the menu is not dealt here either. */
export function randomPool(kind: RandomKind): string[] {
  const modes = kind === "flat" ? flatMenuModes() : threeDMenuModes();
  return modes.filter(hasMode);
}

/** One board from that half, or undefined when it has none to give. */
export function randomMode(kind: RandomKind, random: () => number = Math.random): string | undefined {
  return pickWeighted(randomPool(kind), random);
}
