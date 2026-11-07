import { describe, expect, it } from "vitest";
import { traySignature } from "../../src/colourings";
import { measure } from "../../src/difficulty";
import { cyclotomic } from "../../src/geometry/cyclotomic";
import { Frontier } from "../../src/geometry/frontier";
import { BLANK, LINE, NONE, colourMark, colours, crossed, partner } from "../../src/geometry/marks";
import {
  centroid,
  piece,
  posed,
  regular,
  selfTurns,
  spotKey,
  walk,
  type Piece,
  type Shape,
} from "../../src/geometry/shape";
import { LEVELS, levelByKey, type Level } from "../../src/levels";
import { Puzzle } from "../../src/puzzle";
import { decorParts } from "../../src/view/decor";
import { loopsOf } from "../../src/view/curve";

const Z4 = cyclotomic(4);
const COLOURED = LEVELS.filter((l) => l.decor);

/** A unit square at (x, y) with `marks` on its edges: bottom, right, top,
 * left. */
const square = (x: number, y: number, marks: number[]): Piece[] =>
  posed(regular(Z4, 4), { rot: 0, flip: false, t: [x, y] }).map((p) =>
    piece(p.verts, undefined, marks),
  );

/** Each cell's edges, by their two ends, with the mark on that side. */
function sides(level: Level): Map<string, number> {
  const { ring } = level;
  const out = new Map<string, number>();
  for (const cell of level.cells)
    for (const { verts, marks } of cell)
      verts.forEach((a, i) =>
        out.set(`${ring.key(a)}>${ring.key(verts[(i + 1) % verts.length]!)}`, marks![i]!),
      );
  return out;
}

describe("edge marks", () => {
  it("pairs a colour pair with the pair the other way round, a line with a line", () => {
    expect(partner(colourMark(0, 1))).toBe(colourMark(1, 0));
    expect(partner(colourMark(2, 2))).toBe(colourMark(2, 2));
    expect(partner(LINE)).toBe(LINE);
    expect(partner(BLANK)).toBe(BLANK);
    expect(partner(NONE)).toBe(NONE);
    expect(colours(colourMark(3, 1))).toEqual({ own: 3, other: 1 });
    expect(colours(LINE)).toBeNull();
    expect(crossed(LINE, false)).toBe(true);
    expect(crossed(colourMark(1, 1), false)).toBe(false);
    expect(crossed(colourMark(1, 1), true)).toBe(true);
    expect(crossed(colourMark(0, 1), true)).toBe(false);
  });

  it("lays a tile along a marked edge only with the mark it asks for; the rim takes any", () => {
    const region = walk(Z4, [
      [0, 2],
      [1, 1],
      [2, 2],
      [3, 1],
    ]);
    // a square striped across: lines left and right, blank top and bottom
    const striped = [BLANK, LINE, BLANK, LINE];
    const upright = [LINE, BLANK, LINE, BLANK];
    let f = Frontier.ofRegion(Z4, [region]);
    // the rim takes either way round
    expect(f.fits(square(0, 0, striped))).toBe(true);
    expect(f.fits(square(0, 0, upright))).toBe(true);
    f = f.cover(square(0, 0, striped));
    // its right edge carries a line: the next square must bring one there
    expect(f.fits(square(1, 0, upright))).toBe(false);
    expect(f.fits(square(1, 0, striped))).toBe(true);
    expect(f.cover(square(1, 0, striped)).empty).toBe(true);
  });

  it("counts a tile's marks in its turns and its spot", () => {
    const striped: Shape = { ring: Z4, pieces: square(0, 0, [BLANK, LINE, BLANK, LINE]) };
    expect(selfTurns(regular(Z4, 4))).toEqual([0, 1, 2, 3]);
    expect(selfTurns(striped)).toEqual([0, 2]);
    const turned = posed(striped, { rot: 1, flip: false, t: [1, 0] });
    expect(spotKey(Z4, turned)).not.toBe(spotKey(Z4, striped.pieces));
  });
});

describe("colourings", () => {
  it("paints each regular board lined, then in two and three colours", () => {
    expect(COLOURED.map((l) => l.key)).toEqual([
      "squares.lines",
      "squares.2striped",
      "squares.2apart",
      "squares.3striped",
      "squares.3apart",
      "triangles.lines",
      "triangles.linkedpairs",
      "triangles.2apart",
      "triangles.2striped",
      "triangles.2paired",
      "triangles.3paired",
      "triangles.3paired2",
      "hexagons.lines",
      "hexagons.2striped",
      "hexagons.3striped",
      "hexagons.3apart",
    ]);
    for (const level of COLOURED) {
      expect(level.group).toBe("colourings");
      expect(levelByKey(level.key)).toBe(level);
      const plain = levelByKey(level.decor!.of)!;
      expect(level.name.startsWith(`${plain.name} · `)).toBe(true);
      // the plain board, tile for tile
      expect(
        level.cells.map((c) =>
          spotKey(
            level.ring,
            c.map((p) => ({ verts: p.verts })),
          ),
        ),
      ).toEqual(plain.cells.map((c) => spotKey(plain.ring, c)));
    }
  });

  it.each(COLOURED.map((l) => l.key))(
    "%s: one marked tile per colour, every shared edge's two marks partners",
    (key) => {
      const level = levelByKey(key)!;
      const { colours: count, lines } = level.decor!;
      expect(level.tiles).toHaveLength(lines ? 1 : count);
      const all = sides(level);
      let shared = 0;
      for (const [edge, mark] of all) {
        const [a, b] = edge.split(">");
        const across = all.get(`${b}>${a}`);
        if (across === undefined) continue;
        shared++;
        expect(across).toBe(partner(mark));
      }
      expect(shared).toBeGreaterThan(0);
      if (!lines) {
        // each kind is its colour all round, painted so
        level.tiles.forEach((t, kind) => {
          const own = new Set(t.pieces[0]!.marks!.map((m) => colours(m)!.own));
          expect(own.size).toBe(1);
          expect(level.colours[kind]).toContain(`paint-${[...own][0]}`);
        });
        expect(new Set(level.colours).size).toBe(count);
      }
    },
  );

  it("keeps one of every pair of colourings that make the same tray: rows, not columns too", () => {
    const signatures = COLOURED.map(
      (l) => `${l.decor!.of}|${l.decor!.lines}|${traySignature(l.tiles)}`,
    );
    expect(new Set(signatures).size).toBe(signatures.length);
  });

  it("holds a marked tile so that it fits no cell as the tray has it, where it can", () => {
    // squares striped across rest striped up and down: one turn to lay them
    const lined = new Puzzle(levelByKey("squares.lines")!);
    expect(lined.canTurn()).toBe(true);
    expect((lined.level.turn * 360) / lined.level.ring.n).toBe(90);
    const cell = lined.level.cells[4]!; // the second row's first, in the rim's corner
    const c = centroid(cell[0]!.verts.map((v) => lined.level.ring.toXY(v)));
    // with the rim free, a corner tile goes either way; an inner one is
    // pinned only by its neighbours: lay the bottom row, then the next row's
    // first tile has one way to go
    for (const below of lined.level.cells.slice(0, 4)) lined.place(0, below, 1);
    expect(lined.snap(0, c, 0.2, 0)).toBeNull();
    expect(lined.snap(0, c, 0.2, 1)).not.toBeNull();
    // a checkerboard's tile is the same whichever way it rests
    expect(new Puzzle(levelByKey("squares.2apart")!).canTurn()).toBe(false);
  });

  it("refuses a tile of the wrong colour", () => {
    const p = new Puzzle(levelByKey("squares.2apart")!);
    const { ring } = p.level;
    const [first, second] = p.level.cells;
    p.layOwn();
    const tile = p.tiles.find((t) => spotKey(ring, t.pieces) === spotKey(ring, second!))!;
    p.lift(tile.id);
    const c = centroid(second![0]!.verts.map((v) => ring.toXY(v)));
    // the checkerboard's two tiles: the right one lands, the other does not
    expect(p.snap(tile.kind, c, 0.2, 0)).not.toBeNull();
    expect(p.snap(1 - tile.kind, c, 0.2, 0)).toBeNull();
    expect(first).toBeDefined();
  });

  it.each(COLOURED.map((l) => l.key))("%s is no easier than its plain board", (key) => {
    const level = levelByKey(key)!;
    expect(measure(level).score).toBeGreaterThanOrEqual(
      measure(levelByKey(level.decor!.of)!).score - 1e-9,
    );
  });

  it("draws a band in the colour across each edge, and lines where asked", () => {
    const level = levelByKey("squares.2striped")!;
    const loops = loopsOf(level.ring, level.tiles[0]!.pieces);
    const own = colours(level.tiles[0]!.pieces[0]!.marks![0]!)!.own;
    const parts = decorParts(loops, false);
    // two bands, both the other colour; no lines unless asked
    expect(parts.map((p) => p.class)).toEqual([`decor band paint-${1 - own}`]);
    expect(parts[0]!.d.match(/M/g)).toHaveLength(2);
    const withLines = decorParts(loops, true);
    expect(withLines.map((p) => p.class)).toContain("decor line");
    // a lined board's lines are its rule: drawn either way
    const lined = levelByKey("squares.lines")!;
    expect(
      decorParts(loopsOf(lined.ring, lined.tiles[0]!.pieces), false).map((p) => p.class),
    ).toEqual(["decor line"]);
  });
});
