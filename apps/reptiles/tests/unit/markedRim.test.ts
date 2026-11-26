import { describe, expect, it } from "vitest";
import { LEVELS, levelByKey, type Level } from "../../src/levels";
import { Puzzle } from "../../src/puzzle";
import { realCorners } from "../../src/geometry/shape";
import { strictlyBetween } from "../../src/geometry/cyclotomic";
import { part } from "./shard";

// The rim takes any mark, so on an empty marked board a tile lands at a corner
// of the rim wherever its plain outline does — however the rim and the tile's
// sides are cut. A marked board's rim is cut at every point where two of the
// board's own tiles meet along it, and a tile's sides where the tiles across
// land; a mirrored sphinx in `sphinx.rules`' corner was turned away because
// those points did not line up (`fitsOne` in frontier.ts).

/** Each placement that fits at a corner of the empty board, by where it lies:
 * its outline's real corners, exactly (a mark changes none of them, and a cut
 * adds only flat points). Not one with a corner of the rim part-way along a
 * side: the tile past that corner would meet the side part-way, which a mark
 * never allows, so a marked tile is turned away there as it is anywhere. */
function fitsAtRim(level: Level, flips: boolean): Set<string> {
  const puzzle = new Puzzle(level);
  const { ring } = level;
  const corners = [...puzzle.uncovered.corners.values()];
  const out = new Set<string>();
  for (const corner of corners)
    for (const { spot, flip } of puzzle.fitsAt(ring.toXY(corner))) {
      if (flip && !flips) continue;
      const sides = spot.flatMap((p) =>
        p.verts.map((v, i) => [v, p.verts[(i + 1) % p.verts.length]!]),
      );
      if (corners.some((c) => sides.some(([a, b]) => strictlyBetween(ring, a!, b!, c)))) continue;
      const keys = spot.flatMap((p) => {
        const real = realCorners(ring, p.verts);
        return p.verts.filter((_, i) => real[i]).map((v) => ring.key(v));
      });
      out.add(keys.sort().join(" "));
    }
  return out;
}

const MARKED = LEVELS.filter(
  (l) =>
    l.decor && !l.decor.jigsaw && !l.decor.vertex && l.ring.n === levelByKey(l.decor.of)!.ring.n,
);

describe("a marked board's rim takes any mark", () => {
  it("lays the sphinx mirrored in the corner of the sphinx's matching rules", () => {
    const level = levelByKey("sphinx.rules")!;
    const puzzle = new Puzzle(level);
    const fits = puzzle.fitsAt([0, 0]).map((f) => `${f.rot}${f.flip ? "F" : ""}`);
    expect(fits.sort()).toEqual(["0", "2F", "6F", "8"]);
  });

  it.each(part(MARKED.map((l) => [l.key, l] as const)))(
    "%s: the empty board takes a tile wherever its plain outline fits the rim",
    (_, level) => {
      const plain = levelByKey(level.decor!.of)!;
      const marked = fitsAtRim(level, true);
      // a mirror only where the marked level flips too
      const missing = [...fitsAtRim(plain, level.mirror)].filter((k) => !marked.has(k));
      expect(missing).toEqual([]);
    },
    60_000,
  );
});
