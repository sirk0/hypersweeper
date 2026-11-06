import { describe, expect, it } from "vitest";
import { cyclotomic, type Cyc } from "../../src/geometry/cyclotomic";
import { Frontier } from "../../src/geometry/frontier";
import { deform, hatMetatiles, hatPatch } from "../../src/geometry/hat";
import { ccw, outline } from "../../src/geometry/outline";
import { piece, polygon, signedArea, sideCount, turnsOnto, posed } from "../../src/geometry/shape";
import { figureSetOf, sameFigure } from "../../src/figures";
import { levelByKey, LEVELS } from "../../src/levels";

const Z12 = cyclotomic(12);
const area = (verts: readonly Cyc[]): number => signedArea(verts.map((v) => Z12.toXY(v)));
const metas = hatMetatiles(3);
const hats = metas.flatMap((m) => m.hats);
const hexCyc = ([x, y]: readonly [number, number]): Cyc => [x, 0, y, 0];
const lengths = (verts: readonly Cyc[]): number[] =>
  verts.map((v, i) => {
    const [ax, ay] = Z12.toXY(v);
    const [bx, by] = Z12.toXY(verts[(i + 1) % verts.length]!);
    return Math.round(Math.hypot(bx - ax, by - ay) * 1e9) / 1e9;
  });

describe("the hat's patch", () => {
  it("is the H metatile three substitutions on: 442 metatiles, 1156 hats", () => {
    expect(metas).toHaveLength(442);
    expect(hats).toHaveLength(1156);
    const count = (k: string): number => metas.filter((m) => m.kind === k).length;
    expect([count("H"), count("T"), count("P"), count("F")]).toEqual([147, 22, 105, 168]);
    // H carries four hats, one of them mirrored; T one; P and F two
    for (const m of metas) {
      expect(m.hats).toHaveLength({ H: 4, T: 1, P: 2, F: 2 }[m.kind]);
      expect(m.hats.filter((h) => h.mirrored)).toHaveLength(m.kind === "H" ? 1 : 0);
    }
  });

  it("is hats, each one the hat turned by sixths, the mirrored ones flipped", () => {
    const hat = polygon(Z12, hats[0]!.corners.map(hexCyc));
    for (const h of hats) {
      const cell = [h.corners.map(hexCyc)];
      const flip = h.mirrored;
      const turns = turnsOnto(
        { ring: Z12, pieces: posed(hat, { rot: 0, flip, t: Z12.zero }) },
        cell,
      );
      expect(turns.length).toBeGreaterThan(0);
      expect(turns.every((k) => k % 2 === 0)).toBe(true); // by sixths of a turn
    }
    // short edges 1, long ones √3 — fourteen of them, the long side halved
    const r3 = Math.round(Math.sqrt(3) * 1e9) / 1e9;
    expect(lengths(hats[0]!.corners.map(hexCyc))).toEqual([
      r3, 1, 1, 1, 1, r3, r3, 1, 1, r3, r3, 1, 1, r3,
    ]); // prettier-ignore
  });

  it("tiles without overlap or gap, as hats and as metatiles", () => {
    for (const cells of [
      hats.map((h) => h.corners.map(hexCyc)),
      metas.map((m) => m.corners.map(hexCyc)),
    ]) {
      const loops = outline(Z12, cells);
      expect(loops).toHaveLength(1);
      const tiles = cells.reduce((s, c) => s + Math.abs(area(c)), 0);
      expect(area(loops[0]!)).toBeCloseTo(tiles, 6);
    }
  });

  it("mirrors about one hat in seven, no two of those sharing a side", () => {
    const mirrored = hats.filter((h) => h.mirrored);
    expect(mirrored).toHaveLength(147);
    expect(hats.length / mirrored.length).toBeGreaterThan(6.5);
    expect(hats.length / mirrored.length).toBeLessThan(8.5);
    const sides = new Set<string>();
    for (const h of mirrored) {
      h.corners.forEach((a, i) => {
        const b = h.corners[(i + 1) % h.corners.length]!;
        const key = [a.join(), b.join()].sort().join("|");
        expect(sides.has(key)).toBe(false);
        sides.add(key);
      });
    }
  });

  it("deforms into Tile(1,1), the Spectre's tile with straight edges", () => {
    const corners = hats.map((h) => h.corners);
    const cells = deform(corners, Z12.one, Z12.one).map((c) =>
      ccw(
        Z12,
        c.filter((_, i) => i !== 3),
      ),
    );
    const tile11 = levelByKey("tile11")!.tiles[0]!;
    for (const cell of cells) {
      expect(lengths(cell).every((l) => l === 1 || l === 2)).toBe(true);
      expect(sameFigure(polygon(Z12, cell), tile11)).toBe(true);
    }
  });

  it("deforms into turtles: every short edge √3, every long one 1", () => {
    const { cells } = hatPatch("turtle", 3, 1e9);
    expect(cells).toHaveLength(1156);
    const turtle = polygon(Z12, cells[0]!);
    for (const cell of cells) expect(sameFigure(polygon(Z12, ccw(Z12, cell)), turtle)).toBe(true);
    const loops = outline(Z12, cells);
    expect(loops).toHaveLength(1);
    expect(area(loops[0]!)).toBeCloseTo(
      cells.reduce((s, c) => s + Math.abs(area(c)), 0),
      6,
    );
  });

  it("refuses hats that do not join into a tiling", () => {
    const [a, b] = hats;
    const apart = b!.corners.map(([x, y]) => [x + 1000, y] as const);
    expect(() => deform([a!.corners, apart], Z12.one, Z12.one)).toThrow();
  });
});

describe("the hat's family's levels", () => {
  const hat = levelByKey("hat")!;
  const turtle = levelByKey("turtle")!;
  const meta = levelByKey("hatmetatiles")!;

  it("follow the Spectres and come before the Socolar–Taylor tile", () => {
    const aperiodic = LEVELS.filter((l) => l.group === "aperiodic").map((l) => l.key);
    expect(aperiodic.slice(-8)).toEqual([
      "spectre",
      "spectrewave",
      "mystic",
      "mysticwave",
      "hat",
      "turtle",
      "hatmetatiles",
      "socolartaylor",
    ]);
    expect([hat.name, turtle.name, meta.name]).toEqual(["The hat", "The turtle", "Hat metatiles"]);
    expect(hat.hat).toEqual({ tile: "hat", depth: 3, keep: 36 });
    expect(turtle.hat).toEqual({ tile: "turtle", depth: 3, keep: 34 });
    expect(meta.hat).toEqual({ tile: "metatiles", depth: 3, keep: 26 });
  });

  it.each([
    ["hat", 36],
    ["turtle", 34],
  ])("%s: one 13-sided tile, turned by sixths and flipped, one outline", (key, n) => {
    const level = levelByKey(key)!;
    expect(level.tiles).toHaveLength(1);
    expect(sideCount(level.ring, level.tiles[0]!.pieces[0]!.verts)).toBe(13);
    expect(level.colours).toEqual(["sides-13"]);
    expect(level.mirror).toBe(true);
    expect((level.turn * 360) / level.ring.n).toBe(60);
    expect(level.need).toEqual([n]);
    expect(level.region).toHaveLength(1);
    // some of its tiles are mirrored, a few
    const tile = level.tiles[0]!;
    const flipped = level.cells.filter((c) => turnsOnto(tile, [c[0]!.verts]).length === 0).length;
    expect(flipped).toBeGreaterThanOrEqual(3);
    expect(flipped).toBeLessThanOrEqual(n / 5);
  });

  it("hat metatiles: a triangle, a parallelogram, a pentagon and a hexagon, never flipped", () => {
    expect(meta.tiles.map((t) => sideCount(meta.ring, t.pieces[0]!.verts))).toEqual([3, 4, 5, 6]);
    expect(meta.mirror).toBe(false);
    expect((meta.turn * 360) / meta.ring.n).toBe(60);
    expect(meta.need).toEqual([1, 7, 9, 9]); // T, P, F, H
    expect(meta.region).toHaveLength(1);
    // T is equilateral, 3 hats' short sides a side; P is 4 by 2
    expect(lengths(meta.tiles[0]!.pieces[0]!.verts)).toEqual([6, 6, 6]);
    expect(lengths(meta.tiles[1]!.pieces[0]!.verts).sort()).toEqual([4, 4, 8, 8]);
  });

  it("covers each region exactly with the board's own tiles", () => {
    for (const level of [hat, turtle, meta]) {
      let f = Frontier.ofRegion(level.ring, level.region);
      for (const cell of level.cells) {
        expect(f.fits(cell)).toBe(true);
        f = f.cover(cell);
      }
      expect(f.empty).toBe(true);
    }
  });

  it("are three figures, none of them Tile(1,1)", () => {
    const tile11 = levelByKey("tile11")!.tiles[0]!;
    expect(sameFigure(hat.tiles[0]!, turtle.tiles[0]!)).toBe(false);
    expect(sameFigure(hat.tiles[0]!, tile11)).toBe(false);
    expect(sameFigure(turtle.tiles[0]!, tile11)).toBe(false);
    expect(figureSetOf(hat).levels).toEqual([hat]);
    expect(figureSetOf(turtle).levels).toEqual([turtle]);
    expect(figureSetOf(meta).levels).toEqual([meta]);
    expect(figureSetOf(meta).bucket).toBe("packs");
  });

  it("lays each tile as one piece", () => {
    // the level's cells are its patch's, kept as single pieces
    for (const level of [hat, turtle, meta]) {
      for (const cell of level.cells) expect(cell).toEqual([piece(cell[0]!.verts)]);
    }
  });
});
