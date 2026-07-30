import { describe, expect, it } from "vitest";
import { Color, SRGBColorSpace } from "three";
import presets from "@data/presets.json";
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

/** OkLab L / chroma / hue of a colour, read back through sRGB. */
function oklch(color: Color): { l: number; c: number; h: number } {
  const rgb = { r: 0, g: 0, b: 0 };
  color.getRGB(rgb, SRGBColorSpace);
  const lin = (c: number): number =>
    c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  const [r, g, b] = [lin(rgb.r), lin(rgb.g), lin(rgb.b)];
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  const okA = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s;
  const okB = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s;
  return {
    l: 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    c: Math.hypot(okA, okB),
    h: (Math.atan2(okB, okA) * 180) / Math.PI,
  };
}

function lightness(color: Color): number {
  return oklch(color).l;
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

  it("only ever gives one side count two colours on Penrose", () => {
    // Penrose is the one board in the catalog whose tiles genuinely share a
    // side count. Anywhere else, two colours for one side count means the
    // classer has mistaken a surface's distortion for a second tile shape —
    // which is what a torus of triangles, and 20 other wraps, used to do.
    const offenders: string[] = [];
    for (const mode of Object.keys(presets.presets)) {
      const perSides = new Map<number, Set<number>>();
      for (const t of classifyShapes(buildBoard(mode, "easy").polygons).values()) {
        const seen = perSides.get(t.sides) ?? new Set<number>();
        seen.add(t.regularity);
        perSides.set(t.sides, seen);
      }
      for (const [sides, seen] of perSides) {
        if (seen.size > 1) offenders.push(`${mode} ${sides}gon x${seen.size}`);
      }
    }
    expect(offenders).toEqual(["penrose 4gon x2"]);
  });

  it("does not split a tiling the projection stretched into two shapes", () => {
    // The geodesic sphere's 80 triangles measure 0.85 (60 of them, stretched by
    // the projection) and 1.00, but both are a regular triangle as far as the
    // palette is concerned, so they must come out one colour rather than two.
    for (const mode of ["spheretri", "snubdodec"]) {
      const triangles = [...classifyShapes(buildBoard(mode, "easy").polygons).values()].filter(
        (t) => t.sides === 3,
      );
      expect(new Set(triangles.map((t) => t.regularity)).size).toBe(1);
      for (const t of triangles) expect(t.variantCount).toBe(1);
    }
  });

  it("marks how many shapes share a side count", () => {
    const penrose = [...classifyShapes(buildBoard("penrose", "easy").polygons).values()];
    expect(new Set(penrose.map((t) => t.variant))).toEqual(new Set([0, 1]));
    for (const t of penrose) expect(t.variantCount).toBe(2);
    const square = [...classifyShapes(buildBoard("square", "easy").polygons).values()];
    for (const t of square) expect(t.variantCount).toBe(1);
  });

  it("ignores the T-vertices of a tiling that is not edge to edge", () => {
    // An isogonal tile carries the corners of the neighbours whose edge it
    // splits: a rotated-triangular triangle is a six-point polygon and its
    // hexagon a six-point polygon too. Measured raw they would be one side
    // count in two "shapes"; measured by their corners they are a triangle
    // and a hexagon.
    const sides = new Set(
      [...classifyShapes(buildBoard("rotatedtri", "easy").polygons).values()].map((t) => t.sides),
    );
    expect(sides).toEqual(new Set([3, 6]));
    for (const t of classifyShapes(buildBoard("offsetsquare", "easy").polygons).values()) {
      expect(t.sides).toBe(4);
      expect(t.regularity).toBe(1); // a square, not an irregular hexagon
    }
  });

  it("splits one shape into its sizes, and only where they really differ", () => {
    const sizes = (mode: string): number =>
      [...classifyShapes(buildBoard(mode, "easy").polygons).values()][0]!.sizeCount!;
    expect(sizes("pythagorean")).toBe(2); // squares 2:1
    expect(sizes("threescaletri")).toBe(3); // triangles 1 : 2 : 3
    expect(sizes("offsetsquare")).toBe(1); // one size of square
    // The Penrose rhombi share an edge length and their spans are only ~10%
    // apart; hue already separates them, so they must stay one size.
    for (const t of classifyShapes(buildBoard("penrose", "easy").polygons).values()) {
      expect(t.sizeCount).toBe(1);
    }
    // every size of a shape gets used, smallest first
    const three = [...classifyShapes(buildBoard("threescaletri", "easy").polygons).values()];
    expect(new Set(three.map((t) => t.size))).toEqual(new Set([0, 1, 2]));
  });

  it("draws a bigger tile lighter, in both states equally", () => {
    const small = cellPalette({ sides: 4, regularity: 1, size: 0, sizeCount: 2 }, "flat");
    const big = cellPalette({ sides: 4, regularity: 1, size: 1, sizeCount: 2 }, "flat");
    expect(lightness(big.hidden)).toBeGreaterThan(lightness(small.hidden));
    expect(lightness(big.revealed)).toBeGreaterThan(lightness(small.revealed));
    // the hidden -> opened step is the same for both, so size never eats into
    // the contrast the board is read by
    const step = (p: { hidden: Color; revealed: Color }): number =>
      lightness(p.revealed) - lightness(p.hidden);
    expect(step(big)).toBeCloseTo(step(small), 3);
  });

  it("separates the sizes on lightness, hue and chroma at once", () => {
    const tone = (size: number, sizeCount: number): ShapeTone => ({
      sides: 4,
      regularity: 1,
      size,
      sizeCount,
    });
    const closed = (size: number, sizeCount = 3): { l: number; c: number; h: number } =>
      oklch(cellPalette(tone(size, sizeCount), "flat").hidden);
    const [smallest, middle, biggest] = [closed(0), closed(1), closed(2)];
    // Three sizes come out three plainly different tones, ordered by size, and
    // the smallest is far enough from the biggest to read across a board.
    expect(biggest!.l - middle!.l).toBeGreaterThan(0.03);
    expect(middle!.l - smallest!.l).toBeGreaterThan(0.03);
    expect(biggest!.l - smallest!.l).toBeGreaterThan(0.1);
    // Hue fans across the sizes, but stays well inside the side count's slot
    // (~40°), so every size still reads as the same shape.
    expect(Math.abs(biggest!.h - smallest!.h)).toBeGreaterThan(8);
    expect(Math.abs(biggest!.h - smallest!.h)).toBeLessThan(30);
    // A smaller tile asks for more chroma, and on the *opened* tone — the pale
    // wash, far from the gamut edge, and the one on screen while playing —
    // it gets it. The closed tone is already at the edge for its hue, so there
    // the request is clamped and the size shows in lightness alone.
    const opened = (size: number): number =>
      oklch(cellPalette(tone(size, 3), "flat").revealed).c;
    expect(opened(0)).toBeGreaterThan(opened(2));

    // Nothing is pushed *above* the shape's own tone: the biggest tile is drawn
    // exactly as a shape with one size is, which is what keeps the opened tone
    // (already near white) from clipping and swallowing the distinction.
    const only = oklch(cellPalette({ sides: 4, regularity: 1 }, "flat").hidden);
    expect(closed(2, 3)!.l).toBeCloseTo(only.l, 6);
    expect(oklch(cellPalette(tone(1, 2), "flat").revealed).l).toBeCloseTo(
      oklch(cellPalette({ sides: 4, regularity: 1 }, "flat").revealed).l,
      6,
    );
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

  it("paints a menu icon in the same hue as the board", () => {
    for (const tone of shapes) {
      for (const variant of ["base", "light", "dark", "outline"] as const) {
        expect(iconHex(tone, variant)).toMatch(/^#[0-9a-f]{6}$/);
      }
      const icon = oklch(new Color(iconHex(tone, "base")));
      const board = oklch(cellPalette(tone, "flat").hidden);
      expect(Math.abs(icon.h - board.h)).toBeLessThan(2);
    }
  });

  it("saturates the closed tile and leaves the opened one a pale wash", () => {
    for (const tone of shapes) {
      const p = cellPalette(tone, "flat");
      // enough colour to read as the hue rather than a tinted gray ...
      expect(oklch(p.hidden).c).toBeGreaterThan(0.05);
      // ... and much less on the opened cell, which has a number to carry
      expect(oklch(p.revealed).c).toBeLessThan(oklch(p.hidden).c);
    }
  });
});
