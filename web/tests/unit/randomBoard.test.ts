import { describe, expect, it } from "vitest";
import { blockedModes, modeFairness } from "../../src/boards/fairness";
import { hasMode } from "../../src/boards/presets";
import { randomMode, randomPool } from "../../src/boards/randomBoard";
import { isBoard3D } from "../../src/boards/core";
import { buildBoard } from "../../src/boards/presets";

// The two pools the home page's Flat and 3D rows deal from, and the record
// window's "New board" with them (boards/randomBoard.ts).

describe("random board pools", () => {
  it("deals only boards this build has got", () => {
    for (const kind of ["flat", "3d"] as const) {
      expect(randomPool(kind).length).toBeGreaterThan(0);
      for (const mode of randomPool(kind)) expect(hasMode(mode), mode).toBe(true);
    }
  });

  it("splits the catalogue by whether the board is flat", () => {
    // The record window picks its pool by the won board's own `is3d`, so the
    // two halves have to mean exactly that.
    for (const mode of randomPool("flat")) {
      expect(isBoard3D(buildBoard(mode, "easy")), mode).toBe(false);
    }
    for (const mode of randomPool("3d")) {
      expect(isBoard3D(buildBoard(mode, "easy")), mode).toBe(true);
    }
    const flat = new Set(randomPool("flat"));
    expect(randomPool("3d").some((mode) => flat.has(mode))).toBe(false);
  });

  it("never deals a board that cannot be played", () => {
    // The blocked boards (every cell in an indistinguishable pair) are in the
    // menu, greyed, and never dealt at random.
    const blocked = new Set(blockedModes());
    expect(blocked.size).toBeGreaterThan(0);
    for (const kind of ["flat", "3d"] as const) {
      // `random` is injected, so this walks the whole pool rather than sampling
      // it: every ticket lands on a playable board.
      const pool = randomPool(kind);
      for (let i = 0; i < pool.length; i++) {
        const mode = randomMode(kind, () => i / pool.length);
        expect(mode, `${kind} ${i}`).toBeDefined();
        expect(blocked.has(mode!), mode).toBe(false);
        expect(modeFairness(mode!)).not.toBe("blocked");
      }
    }
  });
});
