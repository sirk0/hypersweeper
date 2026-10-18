import { describe, expect, it } from "vitest";
import { distortedDifficulties, isDistorted } from "../../src/boards/distortion";
import { blockedModes, modeFairness } from "../../src/boards/fairness";
import { hasMode } from "../../src/boards/presets";
import { CUSTOM_ONLY, randomMode, randomPool } from "../../src/boards/randomBoard";
import { quickPlayEntries } from "../../src/ui/boardTree";
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

  it("keeps the Custom-only boards off the home page and out of both pools", () => {
    expect(CUSTOM_ONLY.has("cube3d")).toBe(true);
    const home = quickPlayEntries().map((e) => e.key);
    for (const mode of CUSTOM_ONLY) {
      expect(hasMode(mode), mode).toBe(true);
      expect(home, mode).not.toContain(mode);
      expect(randomPool("flat"), mode).not.toContain(mode);
      expect(randomPool("3d"), mode).not.toContain(mode);
    }
  });

  it("never deals a board that cannot be played", () => {
    // The blocked boards (every cell in an indistinguishable pair) are in the
    // menu, greyed, and never dealt at random.
    const blocked = new Set(blockedModes());
    expect(blocked.size).toBeGreaterThan(0);
    for (const kind of ["flat", "3d"] as const) {
      // `random` is injected, so this walks the whole pool rather than sampling
      // it: every ticket lands on a playable board.
      const pool = randomPool(kind, "easy");
      for (let i = 0; i < pool.length; i++) {
        const mode = randomMode(kind, "easy", () => i / pool.length);
        expect(mode, `${kind} ${i}`).toBeDefined();
        expect(blocked.has(mode!), mode).toBe(false);
        expect(modeFairness(mode!)).not.toBe("blocked");
      }
    }
  });

  it("never deals a board at a difficulty its surface draws it distorted at", () => {
    // Distortion is per difficulty: the trefoil's squares are distorted on easy
    // only, so they leave the easy pool and stay in the other two.
    expect(distortedDifficulties("trefoil")).toEqual(["easy"]);
    expect(randomPool("3d", "easy")).not.toContain("trefoil");
    expect(randomPool("3d", "medium")).toContain("trefoil");
    expect(randomPool("3d", "hard")).toContain("trefoil");
    for (const difficulty of ["easy", "medium", "hard"]) {
      const pool = randomPool("3d", difficulty);
      expect(pool.length).toBeGreaterThan(0);
      for (let i = 0; i < pool.length; i++) {
        const mode = randomMode("3d", difficulty, () => i / pool.length);
        expect(mode, `${difficulty} ${i}`).toBeDefined();
        expect(isDistorted(mode!, difficulty), `${mode} ${difficulty}`).toBe(false);
      }
    }
  });
});
