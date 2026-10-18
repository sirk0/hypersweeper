import { describe, expect, it } from "vitest";
import raw from "@data/distortion.json";
import {
  distortedDifficulties,
  distortedRow,
  distortionHint,
  isDistorted,
} from "../../src/boards/distortion";
import { threeDMenuModes } from "../../src/boards/catalog";
import { hasMode } from "../../src/boards/presets";

// `data/distortion.json` is measured by `scripts/difficulty/distortion.py`.
// What is pinned here is how the app reads it and the shape of the list, not
// its contents beyond a couple of anchors -- a re-measure moves the list, and
// pinning all of it would only make that look like a regression.

const DISTORTED = (raw as {
  distorted: Record<string, Record<string, { shapeP90: number; crosses: boolean }>>;
}).distorted;

describe("the distorted-board list", () => {
  it("names only real 3D modes and real difficulties", () => {
    expect(Object.keys(DISTORTED).length).toBeGreaterThan(0);
    for (const [mode, rows] of Object.entries(DISTORTED)) {
      expect(hasMode(mode), mode).toBe(true);
      expect(threeDMenuModes(), mode).toContain(mode);
      for (const d of Object.keys(rows)) expect(["easy", "medium", "hard"]).toContain(d);
    }
  });

  it("lists a board at one level or at all three, never two", () => {
    // The generator promotes a board flagged at two levels to all three.
    for (const [mode, rows] of Object.entries(DISTORTED)) {
      expect([1, 3], mode).toContain(Object.keys(rows).length);
    }
  });

  it("answers per difficulty", () => {
    expect(isDistorted("trefoil", "easy")).toBe(true);
    expect(isDistorted("trefoil", "medium")).toBe(false);
    expect(isDistorted("torus", "easy")).toBe(false);
    expect(distortedRow("torus", "easy")).toBeUndefined();
    expect(distortedDifficulties("kleinkisrhombille")).toEqual(["easy", "medium", "hard"]);
  });

  it("never answers for an inherited property", () => {
    expect(isDistorted("toString", "easy")).toBe(false);
    expect(isDistorted("trefoil", "toString")).toBe(false);
    expect(distortedDifficulties("constructor")).toEqual([]);
  });

  it("says which levels are the problem", () => {
    expect(distortionHint("trefoil", "easy")).toBe(
      "Distorted on Easy — Medium and Hard draw the tiles truer",
    );
    expect(distortionHint("trefoil", "medium")).toBeUndefined();
    expect(distortionHint("kleinkisrhombille", "hard")).toBe(
      "Distorted — this surface stretches the tiles well out of shape",
    );
  });
});
