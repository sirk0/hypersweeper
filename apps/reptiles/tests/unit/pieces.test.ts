import { describe, expect, it } from "vitest";
import { cyclotomic } from "../../src/geometry/cyclotomic";
import { Frontier } from "../../src/geometry/frontier";
import { outline } from "../../src/geometry/outline";
import { PIECE_TILES, piecePatch, tileShape } from "../../src/geometry/pieces";
import {
  allVerts,
  piece,
  polygon,
  posed,
  restFlat,
  selfTurns,
  signedArea,
  spotKey,
  turnsOnto,
  type Piece,
  type Shape,
} from "../../src/geometry/shape";
import { figureSetOf, sameFigure } from "../../src/figures";
import { levelByKey, LEVELS } from "../../src/levels";
import { Puzzle } from "../../src/puzzle";

const Z4 = cyclotomic(4);

/** Two unit squares corner to corner, the second up and to the right. */
const kissing: Shape = {
  ring: Z4,
  pieces: [
    piece([
      [0, 0],
      [1, 0],
      [1, 1],
      [0, 1],
    ]),
    piece([
      [1, 1],
      [2, 1],
      [2, 2],
      [1, 2],
    ]),
  ],
};

describe("a tile of several pieces", () => {
  it("is moved, turned and matched piece by piece", () => {
    const moved = posed(kissing, { rot: 1, flip: false, t: [3, 0] });
    expect(moved).toHaveLength(2);
    // a quarter turn takes up-and-right to up-and-left
    expect(
      turnsOnto(
        kissing,
        moved.map((p) => p.verts),
      ),
    ).toEqual([1, 3]);
    // the same two squares, but apart: not the tile
    const apart = [
      kissing.pieces[0]!.verts,
      posed(polygon(Z4, kissing.pieces[1]!.verts), { rot: 0, flip: false, t: [1, 0] })[0]!.verts,
    ];
    expect(turnsOnto(kissing, apart)).toEqual([]);
    expect(selfTurns(kissing)).toEqual([0, 2]);
  });

  it("is one figure only with the same pieces the same way apart", () => {
    const turned = { ring: Z4, pieces: posed(kissing, { rot: 3, flip: true, t: [5, 5] }) };
    expect(sameFigure(kissing, turned)).toBe(true);
    // two squares side by side are a domino's pieces, not the kissing squares
    const side: Shape = {
      ring: Z4,
      pieces: [kissing.pieces[0]!, piece(kissing.pieces[0]!.verts.map((v) => Z4.add(v, [1, 0])))],
    };
    expect(sameFigure(kissing, side)).toBe(false);
    expect(sameFigure(kissing, polygon(Z4, kissing.pieces[0]!.verts))).toBe(false);
  });

  it("rests on a side with every piece above it", () => {
    const rest = restFlat(
      Z4,
      posed(kissing, { rot: 1, flip: false, t: [7, 2] }).map((p) => p.verts),
    );
    const xy = allVerts(rest.pieces).map((v) => Z4.toXY(v));
    expect(Math.min(...xy.map(([, y]) => y))).toBe(0);
    const [a, b] = rest.pieces[0]!.verts.map((v) => Z4.toXY(v));
    expect(a).toEqual([0, 0]);
    expect(b![1]).toBe(0);
  });

  it("fits and covers where every piece does, and snaps by any corner", () => {
    // a 2×2 block is two kissing pairs, one each way
    const block = [
      [0, 0],
      [2, 0],
      [2, 2],
      [0, 2],
    ];
    let f = Frontier.ofRegion(Z4, [block]);
    const spots = f.placements(kissing, [1, 1], 3, false, selfTurns(kissing));
    expect(spots.map((s) => spotKey(Z4, s))).toEqual([spotKey(Z4, kissing.pieces)]);
    f = f.cover(kissing.pieces);
    // the other pair is the tile turned a quarter: the frontier is its two
    // squares, pinched at the middle
    expect(f.fits(kissing.pieces)).toBe(false);
    const other = f.placements(kissing, [1, 1], 3, false, [1]);
    expect(other).toHaveLength(1);
    expect(f.cover(other[0]!).empty).toBe(true);
  });
});

describe("the rep-tiles of several pieces", () => {
  const area = (pieces: readonly Piece[], ring: typeof Z4): number =>
    pieces.reduce((s, p) => s + signedArea(p.verts.map((v) => ring.toXY(v))), 0);

  it.each(Object.keys(PIECE_TILES))("%s: its children cover the grown tile exactly", (key) => {
    const def = PIECE_TILES[key]!;
    const { ring, factor } = def;
    const tile = tileShape(def);
    // the grown tile, as a region
    const grown = tile.pieces.map((p) => p.verts.map((v) => ring.mul(factor, v)));
    let f = Frontier.ofRegion(ring, outline(ring, grown));
    const { cells } = piecePatch(key, 1);
    for (const cell of cells) {
      // each child is the tile, turned or mirrored
      const sits = [false, true].some(
        (flip) =>
          turnsOnto({ ring, pieces: posed(tile, { rot: 0, flip, t: ring.zero }) }, cell).length > 0,
      );
      expect(sits).toBe(true);
      const pieces = cell.map((p) => piece(p));
      expect(f.fits(pieces)).toBe(true);
      f = f.cover(pieces);
    }
    expect(f.empty).toBe(true);
    const norm = ring.toXY(ring.mul(factor, ring.conj(factor)))[0];
    expect(cells.length).toBe(Math.round(norm));
    expect(area(tile.pieces, ring) * cells.length).toBeCloseTo(
      area(
        grown.map((v) => piece(v)),
        ring,
      ),
      9,
    );
  });

  it("grows twice by cutting every child again", () => {
    const { ring, cells } = piecePatch("kissingsquares", 2);
    expect(cells).toHaveLength(16);
    const keys = new Set(
      cells.map((c) =>
        spotKey(
          ring,
          c.map((p) => piece(p)),
        ),
      ),
    );
    expect(keys.size).toBe(16);
    expect(() => piecePatch("fish", 2)).toThrow();
  });

  const levels = LEVELS.filter((l) => l.pieceTile);
  it("has the fish and the kissing squares and triangles, in the rep-tiles", () => {
    expect(levels.map((l) => l.key)).toEqual(Object.keys(PIECE_TILES));
    expect(levels.map((l) => l.name)).toEqual([
      "Right-angled fish",
      "60° fish",
      "Kissing squares",
      "Kissing triangles",
      "Kissing square chain",
    ]);
    for (const l of levels) expect(l.group).toBe("reptile");
  });

  it.each(levels.map((l) => l.key))("%s: one tile of several pieces", (key) => {
    const level = levelByKey(key)!;
    expect(level.tiles).toHaveLength(1);
    expect(level.tiles[0]!.pieces.length).toBeGreaterThan(1);
    expect(level.colours).toEqual(["pieces"]);
    expect(level.need).toEqual([level.cells.length]);
    expect(level.cells.length).toBeGreaterThanOrEqual(8);
    expect(level.cells.length).toBeLessThanOrEqual(16);
    expect(level.configs).toEqual([]);
    // its own figure, in the row of figures of several pieces
    const set = figureSetOf(level);
    expect(set.bucket).toBe("pieces");
    expect(set.levels).toEqual([level]);
    expect(set.name).toBe(level.name);
  });

  it("can be finished tile by tile, by dragging", () => {
    const p = new Puzzle(levelByKey("fish")!);
    const { ring } = p.level;
    for (const cell of p.level.cells) {
      // each of the board's own tiles snaps down at its own centroid, held
      // as it lies there
      const xy = cell.map((c) => c.verts.map((v) => ring.toXY(v)));
      const [cx, cy] = [
        xy.flat().reduce((s, [x]) => s + x, 0),
        xy.flat().reduce((s, [, y]) => s + y, 0),
      ].map((s) => s / xy.flat().length);
      const sits = [false, true].flatMap((flip) =>
        p
          .orientations(0)
          .map((rot) => ({ rot, flip, spot: p.snap(0, [cx!, cy!], 0.3, rot, flip) })),
      );
      const own = sits.find((s) => s.spot && spotKey(ring, s.spot) === spotKey(ring, cell));
      expect(own).toBeDefined();
      p.place(0, own!.spot!, own!.rot, own!.flip);
    }
    expect(p.won).toBe(true);
  });
});
