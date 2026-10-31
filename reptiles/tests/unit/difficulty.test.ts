import { describe, expect, it } from "vitest";
import measured from "../../src/difficulty.json";
import { band, bandOf, measure } from "../../src/difficulty";
import { LEVELS, levelByKey } from "../../src/levels";

describe("difficulty", () => {
  it.each(LEVELS.map((l) => l.key))("%s: src/difficulty.json is in step with the measure", (key) => {
    const stored = (measured as Record<string, { score: number }>)[key];
    expect(stored, "run npm run difficulty").toBeDefined();
    expect(measure(levelByKey(key)!).score).toBeCloseTo(stored!.score, 3);
  });

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
    for (const level of LEVELS.filter((l) => l.group === "regular")) expect(bandOf(level.key)).toBe("easy");
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
