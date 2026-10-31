// Which wrapped boards draw their cells too far out of shape, at which
// difficulty.
//
// A tiling laid on a curved surface has to bend and stretch, and on a few
// surfaces it does so badly enough that the board stops reading as the tiling
// it is: the Klein bottle's neck, the trefoil's crossings, a coarse easy window
// on a donut. Those boards stay in the menu — the surface is still worth
// seeing — but the row carries a mark while its difficulty is selected, the
// board's caption says so, and the random launchers never deal them, since a
// tap meant to produce a nice surprise should not land on a squashed one.
//
// Unlike fairness, this is per difficulty all the way to the row: most of
// these boards are distorted on easy only, where a few large cells have to
// span the whole curve, and medium and hard are fine.
//
// `data/distortion.json` is the list, measured by
// `scripts/difficulty/distortion.py` against each tiling's own flat shape.

import raw from "@tiling/data/distortion.json";
import { difficulty as difficultySpec, hasDifficulty } from "../config/screens";

interface DistortedRow {
  shapeP90: number;
  stretch: number;
  bend: number;
  folded: number;
  crosses: boolean;
}

const DISTORTED =
  (raw as { distorted?: Record<string, Record<string, DistortedRow>> }).distorted ?? {};

const ORDER = ["easy", "medium", "hard"];

/** The measured row for one board, or `undefined` if it draws true.
 *
 * `Object.hasOwn`, never `in`: the mode can come from a share link. */
export function distortedRow(mode: string, difficulty: string): DistortedRow | undefined {
  if (!Object.hasOwn(DISTORTED, mode)) return undefined;
  const rows = DISTORTED[mode];
  if (rows === undefined || !Object.hasOwn(rows, difficulty)) return undefined;
  return rows[difficulty];
}

/** Is this board drawn too far out of shape at this difficulty? */
export function isDistorted(mode: string, difficulty: string): boolean {
  return distortedRow(mode, difficulty) !== undefined;
}

/** The difficulties this board is distorted at, easy first; empty for most. */
export function distortedDifficulties(mode: string): string[] {
  if (!Object.hasOwn(DISTORTED, mode)) return [];
  const rows = DISTORTED[mode] ?? {};
  return ORDER.filter((d) => Object.hasOwn(rows, d));
}

function label(key: string): string {
  return hasDifficulty(key) ? difficultySpec(key).label : key;
}

/** The line shown against a distorted board at a distorted difficulty, or
 * `undefined` when it draws true there. Says which levels are the problem,
 * since a board distorted on easy alone is one pill away from a good one. */
export function distortionHint(mode: string, difficulty: string): string | undefined {
  if (!isDistorted(mode, difficulty)) return undefined;
  const bad = distortedDifficulties(mode);
  if (bad.length === ORDER.length) {
    return "Distorted — this surface stretches the tiles well out of shape";
  }
  const good = ORDER.filter((d) => !bad.includes(d)).map(label);
  return (
    `Distorted on ${bad.map(label).join(" and ")} — ` +
    `${good.join(" and ")} draw${good.length === 1 ? "s" : ""} the tiles truer`
  );
}
