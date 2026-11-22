import { afterEach, describe, expect, it, vi } from "vitest";
import { curveOnto } from "../../src/geometry/shape";
import { Puzzle } from "../../src/puzzle";
import { tutorialSteps } from "../../src/tutorial";

// The first-run tutorial's boards (src/tutorial.ts): each teaches the one
// thing its coach card says, and nothing it has not taught yet.

const step = (title: string) => {
  const found = tutorialSteps().find((s) => s.title === title);
  if (!found) throw new Error(`no step ${title}`);
  return found;
};

/** How many of the board's cells a tray tile fits as the tray first holds it:
 * a translate of it, neither turned nor flipped. */
function fitsAsHeld(title: string): number {
  const { level } = step(title);
  const held = new Puzzle(level).shapeAt(0, 0, false);
  return level.cells.filter((cell) => {
    try {
      curveOnto(
        held,
        cell.map((p) => p.verts),
      );
      return true;
    } catch {
      return false;
    }
  }).length;
}

describe("the tutorial", () => {
  it("has four steps, in the order the coach teaches them", () => {
    expect(tutorialSteps().map((s) => s.title)).toEqual(["Drag", "Turn", "Flip", "Take off"]);
    for (const s of tutorialSteps()) {
      expect(s.level.tiles).toHaveLength(1);
      expect(new Puzzle(s.level).solve()).toBe(true);
    }
  });

  it("Drag needs no turn and no flip: every square fits as held", () => {
    const { level } = step("Drag");
    expect([level.turn, level.mirror, level.need]).toEqual([0, false, [4]]);
    expect(fitsAsHeld("Drag")).toBe(4);
  });

  it("Turn needs a 60° turn for its down triangles, and no flip", () => {
    const { level } = step("Turn");
    expect(level.turn * (360 / level.ring.n)).toBe(60);
    expect([level.mirror, level.need]).toEqual([false, [5]]);
    expect(fitsAsHeld("Turn")).toBe(3);
  });

  it("Flip needs the mirror image, and no turn", () => {
    const { level } = step("Flip");
    expect([level.turn, level.mirror, level.need]).toEqual([0, true, [2]]);
    expect(fitsAsHeld("Flip")).toBe(1);
  });

  it("Take off opens with a domino that must come off before the board finishes", () => {
    const { level, laid } = step("Take off");
    const p = new Puzzle(level);
    p.resume(laid);
    expect(p.tiles).toHaveLength(1);
    expect(p.solve()).toBe(false);
    p.reset();
    p.resume(laid);
    p.lift(p.tiles[0]!.id);
    expect(p.solve()).toBe(true);
    // the domino along the foot lies as held; the upright one needs a turn
    expect(level.turn * (360 / level.ring.n)).toBe(90);
    expect(level.mirror).toBe(false);
  });
});

describe("seen once", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("is unseen until marked, and stays seen", async () => {
    const items: Record<string, string> = {};
    vi.stubGlobal("localStorage", {
      getItem: (key: string) => items[key] ?? null,
      setItem: (key: string, value: string) => void (items[key] = value),
    });
    vi.resetModules();
    const t = await import("../../src/tutorial");
    expect(t.tutorialSeen()).toBe(false);
    t.markTutorialSeen();
    expect(t.tutorialSeen()).toBe(true);
    expect(JSON.parse(items["rep-tiles.tutorial"]!)).toEqual({ seen: true });
  });
});
