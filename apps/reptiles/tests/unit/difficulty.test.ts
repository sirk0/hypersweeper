import { describe, expect, it } from "vitest";
import measured from "../../src/difficulty.json";
import {
  band,
  bandOf,
  measureTraps,
  measureTurning,
  scoreFrom,
  scoreOf,
  wrongShare,
  type Stored,
} from "../../src/difficulty";
import { BOARDS, LEVELS, levelByKey, sameTray } from "../../src/levels";

const stored = measured as Record<string, Stored>;

/** Boards whose traps are measured again here: the anchors, a board of each
 * kind of tiling, and a marked one — a few seconds in all. The rest are too
 * slow to measure on every run (the hat's take seconds each), so only their
 * turning is checked, and their score against it. */
const TRAPS_CHECKED = [
  "squares",
  "triangles",
  "trihex",
  "truncsquare",
  "elongated",
  "cairo",
  "kisrhombille",
  "squaretrihexdual",
  "runningbond",
  "pentaspiral5",
  "penrose",
  "ammannbeenker",
  "spectre",
  "sphinx",
  "trihex.lines",
  "squares.2apart",
];

const PERIODIC = new Set([
  "regular",
  "uniform",
  "2-uniform",
  "laves",
  "2-isohedral",
  "pentagonal",
  "isogonal",
  "rectangle",
]);

const median = (xs: number[]): number => {
  const s = [...xs].sort((a, b) => a - b);
  return s[s.length >> 1]!;
};

describe("difficulty", () => {
  it.each(BOARDS.map((b) => b.key))(
    "%s: src/difficulty.json is in step with the measure",
    (key) => {
      const m = stored[key];
      expect(m, "run npm run difficulty").toBeDefined();
      const level = levelByKey(key)!;
      const turning = measureTurning(level);
      expect([turning.presses, turning.flips], "run npm run difficulty").toEqual([
        m!.presses,
        m!.flips,
      ]);
      // rounded as scripts/measure-difficulty.mts writes it: a score on a
      // half-thousandth (0.3025) is a float-noise miss for toBeCloseTo
      expect(Number(scoreFrom(turning, m!).toFixed(3))).toBe(m!.score);
      // a marked level on a board past the first (src/markedBoards.json):
      // the same tray as on its first board — what
      // scripts/find-marked-boards.mts kept it for
      if (level.decor && level.board > 1)
        expect(sameTray(levelByKey(level.base)!, level), "run npm run marked-boards").toBe(true);
    },
  );

  it.each(TRAPS_CHECKED)("%s: its traps are as src/difficulty.json has them", (key) => {
    const { fits, seen, hidden } = measureTraps(levelByKey(key)!);
    expect({ fits, seen, hidden }, "run npm run difficulty").toEqual({
      fits: stored[key]!.fits,
      seen: stored[key]!.seen,
      hidden: stored[key]!.hidden,
    });
  });

  it("holds the anchors the bands were set from", () => {
    // the same tile laid over and over, hardly a turn, hardly a wrong fit
    for (const name of ["4⁴", "3⁶", "6³", "4.8²", "3³.4²"]) {
      expect(bandOf(LEVELS.find((l) => l.name === name)!.key), name).toBe("easy");
    }
    // turning (and flipping) all the way through
    for (const name of ["V3².4.3.4", "V4.6.12"]) {
      expect(bandOf(LEVELS.find((l) => l.name === name)!.key), name).toBe("hard");
    }
    // most tiles that fit the edge are wrong, and many look right
    for (const key of ["spectre", "hat"]) expect(bandOf(key), key).toBe("hard");
  });

  it("finds every fit right on the regular boards, and most wrong on the Spectre's", () => {
    for (const key of ["squares", "triangles", "hexagons"]) {
      expect(stored[key]!.seen + stored[key]!.hidden, key).toBe(0);
    }
    expect(wrongShare(stored.spectre!)).toBeGreaterThan(0.5);
  });

  it("ranks periodic tilings below spirals, and spirals below aperiodic ones", () => {
    const plain = LEVELS.filter((l) => !l.decor);
    const of = (pick: (group: string) => boolean): number =>
      median(plain.filter((l) => pick(l.group)).map((l) => scoreOf(l.key)));
    const periodic = of((g) => PERIODIC.has(g));
    const spiral = of((g) => g === "spiral");
    const aperiodic = of((g) => g === "aperiodic");
    expect(periodic).toBeLessThan(spiral);
    expect(spiral).toBeLessThan(aperiodic);
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
    const cairo = measureTurning(levelByKey("cairo")!);
    const tetrakis = measureTurning(levelByKey("tetrakis")!);
    expect(cairo.turning).toBeGreaterThan(tetrakis.turning);
  });
});
