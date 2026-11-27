import { describe, expect, it } from "vitest";
import { CONFETTI, CONFETTI_COUNT, confettiStrips } from "../../src/view/confetti";

describe("a win's confetti — Hypersweeper's", () => {
  const at: [number, number] = [100, 200];
  const centre: [number, number] = [300, 180];
  const width = 600;
  const strips = confettiStrips(at, centre, width);

  it("throws Hypersweeper's count, in its six colours in turn", () => {
    expect(strips).toHaveLength(CONFETTI_COUNT);
    strips.forEach((s, k) => expect(s.colour).toBe(CONFETTI[k % CONFETTI.length]));
  });

  it("from two fountains low on either side, and a burst from the last tile", () => {
    strips.forEach((s, k) => {
      const fountain = k % 3;
      if (fountain === 2) {
        expect([s.x, s.y]).toEqual(at);
      } else {
        expect(s.x).toBeCloseTo(centre[0] + (fountain === 0 ? -0.45 : 0.45) * width);
        expect(s.y).toBeCloseTo(centre[1] + 0.55 * width);
        // each fountain leans in, toward the middle
        expect(Math.sign(s.vx)).toBe(fountain === 0 ? 1 : -1);
      }
      // every strip goes up first, and is pulled down the screen
      expect(s.vy).toBeLessThan(0);
      expect(s.gravity).toBeGreaterThan(0);
      expect(s.age).toBeLessThanOrEqual(0);
    });
  });
});
