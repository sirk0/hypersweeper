import { describe, expect, it } from "vitest";
import { distortedDifficulties, isDistorted } from "../../src/modes/distortion";
import { blockedModes, modeFairness } from "../../src/modes/fairness";
import { hasMode } from "../../src/modes/presets";
import {
  CUSTOM_ONLY,
  RANDOM_KINDS,
  randomKindOf,
  randomMode,
  randomPool,
} from "../../src/modes/randomBoard";
import { surfaceCaution, threeDMenuModes } from "../../src/modes/catalog";
import { quickPlayEntries } from "../../src/ui/boardTree";
import { isBoard3D } from "../../src/boards/core";
import { buildBoard, MODES } from "../../src/modes/presets";

// The pools the home page's Flat, 3D and Hyperbolic rows deal from, and the
// record window's "New board" with them (modes/randomBoard.ts).

describe("random board pools", () => {
  it("deals only boards this build has got", () => {
    for (const kind of RANDOM_KINDS) {
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
    for (const mode of randomPool("hyperbolic")) {
      expect(isBoard3D(buildBoard(mode, "easy")), mode).toBe(false);
    }
    const flat = new Set(randomPool("flat"));
    expect(randomPool("3d").some((mode) => flat.has(mode))).toBe(false);
    expect(randomPool("hyperbolic").some((mode) => flat.has(mode))).toBe(false);
  });

  it("deals another board from the pool the one on screen came from", () => {
    for (const kind of RANDOM_KINDS) {
      for (const mode of randomPool(kind)) {
        expect(randomKindOf(mode, isBoard3D(buildBoard(mode, "easy"))), mode).toBe(kind);
      }
    }
  });

  it("keeps the Custom-only boards off the home page and out of every pool", () => {
    expect(CUSTOM_ONLY.has("cube3d")).toBe(true);
    const home = quickPlayEntries().map((e) => e.key);
    for (const mode of CUSTOM_ONLY) {
      expect(hasMode(mode), mode).toBe(true);
      expect(home, mode).not.toContain(mode);
      for (const kind of RANDOM_KINDS) expect(randomPool(kind), mode).not.toContain(mode);
    }
  });

  it("never deals a board that cannot be played", () => {
    // The blocked boards (every cell in an indistinguishable pair) are in the
    // menu, greyed, and never dealt at random.
    const blocked = new Set(blockedModes());
    expect(blocked.size).toBeGreaterThan(0);
    for (const kind of RANDOM_KINDS) {
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

  it("never deals a board whose surface carries a caution", () => {
    // Boy's surface is in the 3D menu, marked, at every difficulty, and in no
    // random pool at any of them -- and it is the only surface so marked.
    expect(threeDMenuModes()).toContain("boy");
    expect(MODES.filter((mode) => surfaceCaution(mode) !== undefined)).toEqual(["boy"]);
    for (const difficulty of [undefined, "easy", "medium", "hard"]) {
      expect(randomPool("3d", difficulty), String(difficulty)).not.toContain("boy");
    }
    expect(randomPool("3d", "medium")).toContain("projective");
  });
});
