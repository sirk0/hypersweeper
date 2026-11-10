// Which of a uniform tiling's colourings become levels: searching every one
// takes seconds (thousands of paintings on a board of six translation
// classes), so `npm run colourings` (scripts/find-colourings.mts) chooses
// here and writes the choice to src/colourings.json, which the game builds
// from. The tests choose again and fail while the file is out of step.

import { latticeOf, paintings, type PaintingParams } from "./colourings";
import { measure } from "./difficulty";
import { LINE } from "./geometry/marks";
import {
  paintedCandidates,
  plainKinds,
  uniformContext,
  type Level,
  type PaintedCandidate,
} from "./levels";

/** How many lined levels a uniform tiling keeps, and how many coloured. */
export const RULES_CAP = 2;
export const COLOURS_CAP = 3;

/**
 * The paintings of the uniform board `plain` (its window `box` edges square)
 * worth a level, at most `RULES_CAP` lined and `COLOURS_CAP` coloured: fewest
 * tray tiles first, then the hardest as measured — but a lined board with a
 * line still on it (not all cut back to half discs) before any without; among the coloured, the
 * best balanced one (every shape in every colour) and the best by shape (a
 * shape skipping a colour) both, where there are both. Lined first, then
 * coloured by how many colours.
 */
export function chooseColourings(plain: Level, box: number): PaintingParams[] {
  const context = uniformContext(plain, box);
  const lattice = latticeOf(plain.ring, context);
  const all = paintings(plain.ring, plain.cells, lattice, [2, 3], context, plainKinds(plain));
  const ranked = paintedCandidates(plain, all)
    .map((c) => ({ ...c, score: measure(c.level).score }))
    .sort((a, b) => a.level.tiles.length - b.level.tiles.length || b.score - a.score);
  // a lined board with a line left on it before one cut back to nothing but
  // half discs
  const drawn = (c: PaintedCandidate): number =>
    c.painting.marks.some((cell) => cell.some((edges) => edges.includes(LINE))) ? 0 : 1;
  const lined = ranked
    .filter((c) => c.painting.lines)
    .sort((a, b) => drawn(a) - drawn(b))
    .slice(0, RULES_CAP);
  const coloured = ranked.filter((c) => !c.painting.lines);
  const picked: PaintedCandidate[] = [];
  for (const byShape of [false, true]) {
    const best = coloured.find((c) => c.byShape === byShape);
    if (best) picked.push(best);
  }
  for (const c of coloured) if (picked.length < COLOURS_CAP && !picked.includes(c)) picked.push(c);
  const order = (c: PaintedCandidate): number => coloured.indexOf(c as (typeof coloured)[number]);
  picked.sort((a, b) => a.painting.colours - b.painting.colours || order(a) - order(b));
  return [...lined, ...picked].map((c) => c.painting.params);
}
