import { describe, expect, it } from "vitest";
import type { XY } from "../../src/geometry/shape";
import { LEVELS } from "../../src/levels";
import { cardLayout, insideRegion, placedPolys } from "../../src/view/cardArt";

// A tiling's card in Tilings draws its tray's tiles inside its first board's
// outline: clear of the rim all round, or — a kissing rep-tile — shrunk toward
// the point its two parts touch at, so the tile's touching point is the
// outline's. Several tiles are joined edge to edge (view/trayLayout.ts).
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

  it("joins several tiles edge to edge", () => {
    for (const level of plain.filter((l) => l.tiles.length > 1 && l.group !== "reptile")) {
      const layout = cardLayout(level);
      const polys = placedPolys(layout.tiles);
      const size =
        Math.max(...polys.flat().map(([x]) => x)) - Math.min(...polys.flat().map(([x]) => x));
      const eps = 1e-9 * size;
      // two edges along each other for a stretch: on one line, overlapping
      const alongside = ([a, b]: XY[], [c, d]: XY[]): boolean => {
        const len = Math.hypot(b![0] - a![0], b![1] - a![1]);
        const ux = (b![0] - a![0]) / len;
        const uy = (b![1] - a![1]) / len;
        const off = (p: XY): number => (p[0] - a![0]) * uy - (p[1] - a![1]) * ux;
        if (Math.abs(off(c!)) > eps || Math.abs(off(d!)) > eps) return false;
        const at = (p: XY): number => (p[0] - a![0]) * ux + (p[1] - a![1]) * uy;
        const [lo, hi] = [Math.min(at(c!), at(d!)), Math.max(at(c!), at(d!))];
        return Math.min(hi, len) - Math.max(lo, 0) > eps;
      };
      const edges = (poly: XY[]): XY[][] => poly.map((p, k) => [p, poly[(k + 1) % poly.length]!]);
      // every tile lies along another for a stretch of edge
      polys.forEach((poly, i) => {
        const touching = polys.some(
          (other, j) =>
            j !== i && edges(poly).some((f) => edges(other).some((g) => alongside(f, g))),
        );
        expect(touching, `${level.key}: tile ${i}`).toBe(true);
      });
    }
  });
});
