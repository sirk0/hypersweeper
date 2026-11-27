import { describe, expect, it } from "vitest";
import { starLines, timeLine, type Result } from "../../src/view/winPanel";

const result = (over: Partial<Result> = {}): Result => ({
  stars: 3,
  hints: 0,
  off: 0,
  ms: 42_000,
  best: null,
  newBest: true,
  ...over,
});

describe("the win panel", () => {
  it("tells the time, and the best it is measured against", () => {
    // a first finish is only its time
    expect(timeLine(result())).toBe("0:42");
    expect(timeLine(result({ best: 38_000, newBest: false }))).toBe("0:42 · best 0:38");
    expect(timeLine(result({ best: 50_000, newBest: true }))).toBe("0:42 · new best!");
  });

  it("puts a word under each star: earned, or what lost it", () => {
    expect(starLines(result()).map((l) => [l.earned, l.caption])).toEqual([
      [true, "Covered"],
      [true, "No hints"],
      [true, "Piles at 0"],
    ]);
    expect(starLines(result({ hints: 1, off: 2 })).map((l) => [l.earned, l.caption])).toEqual([
      [true, "Covered"],
      [false, "1 hint"],
      [false, "2 piles off"],
    ]);
    // the whole of it is each star's tooltip
    expect(starLines(result({ hints: 16, off: 1 })).map((l) => l.title)).toEqual([
      "Covered, no gaps, no overlaps.",
      "16 hints used.",
      "1 pile in the tray not at 0.",
    ]);
  });
});
