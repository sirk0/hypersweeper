import { describe, expect, it } from "vitest";
import { LEVELS } from "../../src/levels";
import { cardLayout, insideRegion, placedPolys } from "../../src/view/cardArt";

// A tiling's card in Tilings draws its tray's tiles inside its first board's
// outline: clear of the rim all round, or — a kissing rep-tile — shrunk toward
// the point its two parts touch at, so the tile's touching point is the
// outline's. Several tiles sit on one bottom line.
describe("a tiling's card picture", () => {
  const plain = LEVELS.filter((l) => !l.decor);

  it("draws every tile inside the outline, clear of it", () => {
    for (const level of plain) {
      const layout = cardLayout(level);
      expect(layout.tiles, level.key).toHaveLength(level.tiles.length);
      if (layout.how === "pinch") continue;
      expect(insideRegion(placedPolys(layout.tiles), layout.region, layout.margin), level.key).toBe(
        true,
      );
    }
  });

  it("shrinks a kissing rep-tile toward the point its parts touch at", () => {
    for (const key of ["fish", "fish60", "kissingsquares", "kissingtriangles"]) {
      const layout = cardLayout(plain.find((l) => l.key === key)!);
      expect(layout.how, key).toBe("pinch");
      // the tile's own touching point lies on the outline's
      const corners = placedPolys(layout.tiles).flat();
      const [px, py] = layout.pinch!;
      const at = corners.filter(([x, y]) => Math.hypot(x - px, y - py) < 1e-9);
      expect(at.length, key).toBe(2);
    }
  });

  it("shrinks every other rep-tile toward the middle of its outline, clear of it", () => {
    const rest = plain.filter(
      (l) =>
        l.group === "reptile" &&
        !["fish", "fish60", "kissingsquares", "kissingtriangles", "kissingchain"].includes(l.key),
    );
    expect(rest.length).toBe(12);
    for (const level of rest) expect(cardLayout(level).how, level.key).toBe("kernel");
  });

  it("sits several tiles on one bottom line", () => {
    for (const level of plain.filter((l) => l.tiles.length > 1 && l.tiles.length <= 3)) {
      const layout = cardLayout(level);
      const bottoms = layout.tiles.map((t) =>
        Math.max(...placedPolys([t]).flatMap((poly) => poly.map(([, y]) => y))),
      );
      for (const b of bottoms) expect(b, level.key).toBeCloseTo(bottoms[0]!, 9);
    }
  });
});
