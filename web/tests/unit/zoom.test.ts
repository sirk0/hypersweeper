import { describe, expect, it } from "vitest";
import {
  anchoredPan,
  clampPan,
  clampZoom,
  MAX_ZOOM,
  MIN_ZOOM,
} from "../../src/render/zoom";

describe("clampZoom", () => {
  it("keeps the framed board as the floor", () => {
    expect(clampZoom(0.2)).toBe(MIN_ZOOM);
    expect(clampZoom(1)).toBe(1);
  });

  it("caps magnification", () => {
    expect(clampZoom(3)).toBe(3);
    expect(clampZoom(MAX_ZOOM * 10)).toBe(MAX_ZOOM);
    expect(MAX_ZOOM).toBeGreaterThan(MIN_ZOOM);
  });
});

describe("anchoredPan", () => {
  // The world point under the anchor pixel must not move as the scale changes:
  // world = pan + wpp * offset, for the same offset before and after.
  const world = (pan: number, wpp: number, offset: number) => pan + wpp * offset;

  it("holds the point under the anchor while zooming in", () => {
    const wppBefore = 2;
    const wppAfter = 1; // 2x zoom
    const offset = 120; // px right of the view centre
    const pan = anchoredPan(5, wppBefore, wppAfter, offset);
    expect(world(pan, wppAfter, offset)).toBeCloseTo(
      world(5, wppBefore, offset),
      10,
    );
  });

  it("holds it while zooming back out too", () => {
    const pan = anchoredPan(-30, 0.5, 2, -80);
    expect(world(pan, 2, -80)).toBeCloseTo(world(-30, 0.5, -80), 10);
  });

  it("leaves the pan alone when the anchor is the view centre", () => {
    expect(anchoredPan(17, 2, 1, 0)).toBe(17);
  });
});

describe("clampPan", () => {
  it("pins a board smaller than the view to the centre", () => {
    expect(clampPan(50, 100, 300)).toBe(0);
    expect(clampPan(-50, 100, 300)).toBeCloseTo(0, 10); // -0 counts
  });

  it("allows exactly the overhang once zoomed in", () => {
    expect(clampPan(10, 300, 100)).toBe(10);
    expect(clampPan(500, 300, 100)).toBe(200);
    expect(clampPan(-500, 300, 100)).toBe(-200);
  });
});
