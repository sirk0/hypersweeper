import { describe, expect, it } from "vitest";
import { Color, SRGBColorSpace } from "three";
import { buildBoard } from "../../src/boards/presets";
import { COLORS } from "../../src/render/boardMesh";
import {
  cellPalette,
  classifyShapes,
  iconHex,
  shapeMetrics,
  SHAPE_PALETTE,
  type ShapeTone,
} from "../../src/render/shapePalette";

// The shape colour code: what a cell's polygon says about its colour. Guards
// the three things the scheme rides on — the regularity metric, the per-board
// shape classing that keeps a bent tiling one colour, and the hidden/opened
// lightness step, which has to stay exactly the one the gray board had.

/** A regular n-gon, optionally scaled on y (which breaks its regularity). */
function ngon(n: number, squash = 1): [number, number][] {
  return Array.from({ length: n }, (_, k) => {
    const a = (2 * Math.PI * k) / n;
    return [Math.cos(a), Math.sin(a) * squash];
  });
}

/** A rhombus with the given acute angle, in degrees. */
function rhombus(acute: number): [number, number][] {
  const a = (acute * Math.PI) / 180;
  return [
    [0, 0],
    [1, 0],
    [1 + Math.cos(a), Math.sin(a)],
    [Math.cos(a), Math.sin(a)],
  ];
}

/** OkLab lightness of a colour, read back through sRGB. */
function lightness(color: Color): number {
  const rgb = { r: 0, g: 0, b: 0 };
  color.getRGB(rgb, SRGBColorSpace);
  const lin = (c: number): number =>
    c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  const [r, g, b] = [lin(rgb.r), lin(rgb.g), lin(rgb.b)];
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s;
}

describe("shape metrics", () => {
  it("scores every regular polygon 1", () => {
    for (const n of [3, 4, 5, 6, 8, 12]) {
      expect(shapeMetrics(ngon(n)).sides).toBe(n);
      expect(shapeMetrics(ngon(n)).regularity).toBeCloseTo(1, 6);
    }
  });

  it("scores the tilings' irregular tiles the way the metric says", () => {
    // (minAngle/maxAngle + minSide/maxSide) / 2
    expect(shapeMetrics(rhombus(60)).regularity).toBeCloseTo(0.75, 6); // rhombille
    expect(shapeMetrics(rhombus(72)).regularity).toBeCloseTo(0.8333, 4); // Penrose thick
    expect(shapeMetrics(rhombus(36)).regularity).toBeCloseTo(0.625, 6); // Penrose thin
    // 30-60-90 (kisrhombille) and 45-45-90 (tetrakis)
    expect(
      shapeMetrics([
        [0, 0],
        [Math.sqrt(3), 0],
        [0, 1],
      ]).regularity,
    ).toBeCloseTo(0.4167, 4);
    expect(
      shapeMetrics([
        [0, 0],
        [1, 0],
        [0, 1],
      ]).regularity,
    ).toBeCloseTo(0.6036, 4);
  });

  it("works on 3D polygons", () => {
    const flat = ngon(6).map(([x, y]) => [x, y, 0]);
    expect(shapeMetrics(flat).regularity).toBeCloseTo(1, 6);
  });

  it("a squashed polygon scores below a regular one", () => {
    expect(shapeMetrics(ngon(6, 0.5)).regularity).toBeLessThan(0.9);
  });
});

describe("per-board shape classing", () => {
  it("gives a flat tiling one class per tile shape", () => {
    const classes = (mode: string): Set<string> =>
      new Set(
        [...classifyShapes(buildBoard(mode, "easy").polygons).values()].map(
          (t) => `${t.sides}/${t.regularity}`,
        ),
      );
    expect(classes("square").size).toBe(1);
    expect(classes("hex").size).toBe(1);
    // triangle + square + hexagon
    expect(classes("rhombitrihex").size).toBe(3);
    // the two Penrose rhombi: same side count, told apart by regularity
    expect(classes("penrose").size).toBe(2);
  });

  it("keeps a tiling the surface immersion bent to one colour", () => {
    // A torus square measures ~0.7 rather than 1, and no two cells the same;
    // classed as one shape they stay one flat colour instead of a gradient.
    for (const mode of ["torus", "mobiuskisrhombille", "klein"]) {
      const tones = classifyShapes(buildBoard(mode, "easy").polygons);
      const distinct = new Set([...tones.values()].map((t) => `${t.sides}/${t.regularity}`));
      expect(distinct.size).toBe(1);
    }
  });

  it("marks how many shapes share a side count", () => {
    const penrose = [...classifyShapes(buildBoard("penrose", "easy").polygons).values()];
    expect(new Set(penrose.map((t) => t.variant))).toEqual(new Set([0, 1]));
    for (const t of penrose) expect(t.variantCount).toBe(2);
    const square = [...classifyShapes(buildBoard("square", "easy").polygons).values()];
    for (const t of square) expect(t.variantCount).toBe(1);
  });
});

describe("shape colours", () => {
  const shapes: ShapeTone[] = [
    { sides: 3, regularity: 1 },
    { sides: 4, regularity: 1 },
    { sides: 4, regularity: 0.6 },
    { sides: 5, regularity: 0.75 },
    { sides: 6, regularity: 1 },
    { sides: 12, regularity: 1 },
    { sides: 13, regularity: 0.625 },
  ];

  it("keeps the hidden -> opened step the gray board had, for every shape", () => {
    const grayStep = lightness(COLORS.revealed) - lightness(COLORS.hidden);
    for (const tone of shapes) {
      const p = cellPalette(tone, "flat");
      expect(lightness(p.revealed) - lightness(p.hidden)).toBeCloseTo(grayStep, 3);
    }
  });

  it("walks the hue one way as the side count grows", () => {
    const hues = SHAPE_PALETTE.hueAnchors.map(([, h]) => h);
    for (let i = 1; i < hues.length; i++) expect(hues[i]!).toBeGreaterThan(hues[i - 1]!);
  });

  it("gives a diamond a colour nearer a square's than a triangle's", () => {
    const dist = (a: Color, b: Color): number =>
      Math.hypot(a.r - b.r, a.g - b.g, a.b - b.b);
    const square = cellPalette({ sides: 4, regularity: 1 }, "flat").hidden;
    const diamond = cellPalette({ sides: 4, regularity: 0.6 }, "flat").hidden;
    const triangle = cellPalette({ sides: 3, regularity: 1 }, "flat").hidden;
    expect(dist(diamond, square)).toBeLessThan(dist(diamond, triangle));
  });

  it("draws a regular tile with more chroma than an irregular one", () => {
    const chroma = (c: Color): number => Math.max(c.r, c.g, c.b) - Math.min(c.r, c.g, c.b);
    expect(chroma(cellPalette({ sides: 5, regularity: 1 }, "flat").hidden)).toBeGreaterThan(
      chroma(cellPalette({ sides: 5, regularity: 0.35 }, "flat").hidden),
    );
  });

  it("gives menu icons the board's hues at the icon set's saturation", () => {
    for (const tone of shapes) {
      for (const variant of ["base", "light", "dark", "outline"] as const) {
        expect(iconHex(tone, variant)).toMatch(/^#[0-9a-f]{6}$/);
      }
      // vivid enough to read at 38px, unlike the faint board tone
      const icon = new Color(iconHex(tone, "base"));
      const board = cellPalette(tone, "flat").hidden;
      const chroma = (c: Color): number => Math.max(c.r, c.g, c.b) - Math.min(c.r, c.g, c.b);
      expect(chroma(icon)).toBeGreaterThan(chroma(board));
    }
  });
});
