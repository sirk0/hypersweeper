import { flatMenuModes, hyperbolicMenuModes, surfaceCaution, threeDMenuModes } from "./catalog";
import { isDistorted } from "./distortion";
import { pickWeighted } from "./fairness";
import { hasMode } from "./presets";

// Dealing a board at random, from one part of the catalogue.
//
// The home page's Flat, 3D and Hyperbolic rows are the reason this exists
// (ui/menu.ts), and the record window's "New board" is the second caller: a win is the moment a
// player decides what to play next, and it should be able to deal them one on
// the same terms the menu does — the same pools, and the same weighting, which
// keeps the boards whose tiling forces guesses in the pool but deals them a
// quarter as often (boards/fairness.ts). A board its surface draws too far out
// of shape at the difficulty being dealt is left out of the pool altogether
// (boards/distortion.ts), and so is one on a surface that carries a caution
// (catalog.ts `surfaceCaution`, Boy's surface): both are in the menu, marked,
// for whoever wants them.

/** Which part of the catalogue: the plane, everything off it, or the
 * hyperbolic tilings (on the plane, but a pool and a home row of their own). */
export type RandomKind = "flat" | "3d" | "hyperbolic";

export const RANDOM_KINDS: readonly RandomKind[] = ["flat", "3d", "hyperbolic"];

export function isRandomKind(key: string): key is RandomKind {
  return (RANDOM_KINDS as readonly string[]).includes(key);
}

const POOLS: Record<RandomKind, () => string[]> = {
  flat: flatMenuModes,
  "3d": threeDMenuModes,
  hyperbolic: hyperbolicMenuModes,
};

/** Boards reachable through Custom only: off the home page, and so never
 * dealt here either, until their UX is ready to be promoted. The volume board
 * is the one — a cube of cubes played as a deck of slices still needs work. */
export const CUSTOM_ONLY: ReadonlySet<string> = new Set(["cube3d"]);

/** Every board that pool can deal, filtered to the modes this build has got.
 * The pools are what the pickers reach, less CUSTOM_ONLY and the boards
 * whose surface carries a caution, so a board that is not in the menu is not
 * dealt here either. Given a `difficulty`, the boards distorted at it are
 * dropped too. */
export function randomPool(kind: RandomKind, difficulty?: string): string[] {
  const modes = POOLS[kind]();
  return modes.filter(
    (mode) =>
      hasMode(mode) &&
      !CUSTOM_ONLY.has(mode) &&
      surfaceCaution(mode) === undefined &&
      (difficulty === undefined || !isDistorted(mode, difficulty)),
  );
}

/** One board from that pool at `difficulty`, or undefined when it has none to
 * give. */
export function randomMode(
  kind: RandomKind,
  difficulty: string,
  random: () => number = Math.random,
): string | undefined {
  return pickWeighted(randomPool(kind, difficulty), random);
}

/** The pool a board belongs to, which is the one "deal another" draws from:
 * a hyperbolic board deals another hyperbolic one, a flat board a flat one,
 * anything else one off the plane. */
export function randomKindOf(mode: string, is3d: boolean): RandomKind {
  if (is3d) return "3d";
  return hyperbolicMenuModes().includes(mode) ? "hyperbolic" : "flat";
}
