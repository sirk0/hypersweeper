import { describe, expect, it } from "vitest";
import measured from "../../src/difficulty.json";
import { band, bandOf, measure } from "../../src/difficulty";
import { BOARDS, LEVELS, levelByKey, sameTray } from "../../src/levels";

const scores = measured as Record<string, { score: number }>;

describe("difficulty", () => {
  it.each(BOARDS.map((b) => b.key))(
    "%s: src/difficulty.json is in step with the measure",
    (key) => {
      const stored = scores[key];
      expect(stored, "run npm run difficulty").toBeDefined();
      // rounded as scripts/measure-difficulty.mts writes it: a score on a
      // half-thousandth (0.3025) is a float-noise miss for toBeCloseTo
      const level = levelByKey(key)!;
      expect(Number(measure(level).score.toFixed(3))).toBe(stored!.score);
      // a marked level on a board past the first (src/markedBoards.json):
      // the same tray as on its first board, and no easier than the board
      // plain — what scripts/find-marked-boards.mts kept it for
      if (level.decor && level.board > 1) {
        expect(sameTray(levelByKey(level.base)!, level), "run npm run marked-boards").toBe(true);
        expect(stored!.score).toBeGreaterThanOrEqual(
          scores[`${level.decor.of}-${level.board}`]!.score,
        );
      }
    },
  );

  it("holds the anchors the bands were set from", () => {
    // the same tile laid over and over, hardly a turn
    for (const name of ["4⁴", "3⁶", "6³", "4.8²", "3³.4²"]) {
      expect(bandOf(LEVELS.find((l) => l.name === name)!.key), name).toBe("easy");
    }
    // turning (and flipping) all the way through
    for (const name of ["V3².4.3.4", "V4.6.12"]) {
      expect(bandOf(LEVELS.find((l) => l.name === name)!.key), name).toBe("hard");
    }
  });

  it("puts every flag-transitive level in easy, and has levels in every band", () => {
    for (const level of LEVELS.filter((l) => l.group === "regular"))
      expect(bandOf(level.key)).toBe("easy");
    const bands = new Set(LEVELS.map((l) => bandOf(l.key)));
    expect([...bands].sort()).toEqual(["easy", "hard", "medium"]);
  });

  it("weighs a fine step harder than a coarse one", () => {
    // the same board would cost more turning at 15° than at 90°
    expect(band(0)).toBe("easy");
    const cairo = measure(levelByKey("cairo")!);
    const tetrakis = measure(levelByKey("tetrakis")!);
    expect(cairo.turning).toBeGreaterThan(tetrakis.turning);
  });
});
