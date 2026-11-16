import { describe, expect, it } from "vitest";
import { LEVELS } from "../../src/levels";
import { boardFit } from "../../src/view/icons";

// A rep-tile's card in Tilings draws its tile inside its board's outline,
// turned (and mirrored where it must be) so the tile is the outline made
// small — at any angle, not only the board's own turns: the right isosceles
// triangle and the right-angled fish stand 45° off how the tray holds them.
describe("a rep-tile's card", () => {
  const reptiles = LEVELS.filter((l) => l.group === "reptile" && !l.decor);

  it("lays its tile on its board's outline, every corner of either on the other's", () => {
    expect(reptiles.length).toBe(17);
    for (const level of reptiles) {
      const fit = boardFit(level)!;
      expect(fit.miss, level.key).toBeLessThan(1e-6);
      // a mirror only on a level that flips: the card shows a tile the
      // player has
      if (fit.pose.flip) expect(level.mirror, level.key).toBe(true);
    }
  });

  it("turns no other tiling's tiles", () => {
    expect(boardFit(LEVELS.find((l) => l.key === "squares")!)).toBeNull();
  });
});
