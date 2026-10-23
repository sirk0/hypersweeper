import { describe, expect, it } from "vitest";
import { buildBoard, windowFor } from "../../src/boards/presets";

// `buildBoard` hands back the board it built last for the same mode,
// difficulty and window, so a restart does not rebuild it — see `BUILT` in
// src/boards/presets.ts.
describe("buildBoard", () => {
  it("hands a board just built back rather than building it again", () => {
    const board = buildBoard("hyperbolic64", "hard", 1);
    expect(buildBoard("hyperbolic64", "hard", 1)).toBe(board);
    // a seed only deals the mines on a board with one window
    expect(buildBoard("hyperbolic64", "hard", 2)).toBe(board);
    expect(buildBoard("hyperbolic64", "easy")).not.toBe(board);
  });

  it("builds another window of an aperiodic patch afresh", () => {
    const seeds = [...Array(64).keys()];
    const first = seeds.find((s) => windowFor("penrose", "easy", s) !== windowFor("penrose", "easy", 0))!;
    expect(first).toBeDefined();
    const board = buildBoard("penrose", "easy", 0);
    expect(buildBoard("penrose", "easy", first)).not.toBe(board);
    const same = seeds.find((s) => s !== 0 && windowFor("penrose", "easy", s) === windowFor("penrose", "easy", 0))!;
    expect(buildBoard("penrose", "easy", same)).toBe(board);
  });

  it("keeps only the last few, and rebuilds the same board after", () => {
    const board = buildBoard("square", "easy");
    for (const mode of ["hex", "triangle", "hyperbolic73", "hyperbolic83"]) buildBoard(mode, "easy");
    const again = buildBoard("square", "easy");
    expect(again).not.toBe(board);
    expect([...again.adjacency]).toEqual([...board.adjacency]);
  });
});
