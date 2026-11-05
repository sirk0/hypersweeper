import { describe, expect, it } from "vitest";
import { gcDisc } from "../src/hurwitz";
import { hyperbolicBoard, hyperbolicUniformBoard } from "../src/hyperbolic";

// A hyperbolic board drawn at a zero scale is a board of NaN coordinates: it
// builds, and whatever draws it shows nothing. Hypersweeper 0.3.44 shipped
// that way — the builders lost their mine-count parameter, one call reached
// `hyperbolicUniformBoard` through a spread and kept passing the old `0`, and
// the hyperbolic Uniform and Closed surfaces menu rows had no icons. So the
// disc drawing refuses an argument that cannot be a scale or an arc count,
// and a shifted argument fails where it is passed instead.

describe("hyperbolic builders' arguments", () => {
  it("refuse a scale that would draw the board as a point", () => {
    expect(() => hyperbolicUniformBoard(7, 3, "expand", 3, 0)).toThrow(/scale/);
    expect(() => hyperbolicBoard(7, 3, 3, 0)).toThrow(/scale/);
    expect(() => hyperbolicBoard(7, 3, 3, -1)).toThrow(/scale/);
    expect(() => hyperbolicBoard(7, 3, 3, Number.NaN)).toThrow(/scale/);
    expect(() => gcDisc(7, 3, 3, 4, 0)).toThrow(/scale/);
  });

  it("refuse an arc segment count that is not a positive integer", () => {
    expect(() => hyperbolicBoard(7, 3, 3, 100, 0)).toThrow(/arc/);
    expect(() => hyperbolicBoard(7, 3, 3, 100, 2.5)).toThrow(/arc/);
  });

  it("build a board of finite coordinates at a valid scale", () => {
    const board = hyperbolicUniformBoard(7, 3, "expand", 3, 1);
    expect(board.width).toBeGreaterThan(0);
    for (const polygon of board.polygons.values()) {
      for (const [x, y] of polygon) expect(Number.isFinite(x) && Number.isFinite(y)).toBe(true);
    }
  });
});
