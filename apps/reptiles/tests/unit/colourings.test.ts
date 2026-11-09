import { describe, expect, it } from "vitest";
import { traySignature } from "../../src/colourings";
import { measure } from "../../src/difficulty";
import { cyclotomic } from "../../src/geometry/cyclotomic";
import { Frontier } from "../../src/geometry/frontier";
import {
  BLANK,
  LINE,
  NONE,
  SAME,
  arrow,
  arrowMark,
  colourMark,
  colours,
  partner,
  posedMarks,
  shared,
  sharedMark,
} from "../../src/geometry/marks";
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
    // a shared edge colour is the same from both sides, in either order
    expect(sharedMark(2, 0)).toBe(sharedMark(0, 2));
    expect(partner(sharedMark(0, 2))).toBe(sharedMark(0, 2));
    expect(shared(sharedMark(2, 0))).toEqual({ lo: 0, hi: 2 });
    expect(sharedMark(1, 1)).toBe(SAME);
    // an arrow's partner points the other way round the other tile, and a
    // mirror turns it round too
    expect(partner(arrowMark(2, true))).toBe(arrowMark(2, false));
    expect(arrow(arrowMark(1, false))).toEqual({ kind: 1, forward: false });
    // (listed backwards: edge j of the mirror image is edge m − 2 − j)
    expect(posedMarks([arrowMark(1, true), LINE, arrowMark(2, false)], true)).toEqual([
      LINE,
      arrowMark(1, false),
      arrowMark(2, true),
    ]);
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
  it("paints each regular board lined, then in two and three colours; and gives Penrose's tilings their arrows", () => {
    expect(COLOURED.map((l) => l.key)).toEqual([
      "squares.lines",
      "squares.2apart",
      "squares.2oneinthree",
      "squares.2oneinthree2",
      "squares.3striped",
      "squares.3apart",
      "triangles.lines",
      "triangles.linkedpairs",
      "triangles.2apart",
      "triangles.2oneinthree",
      "triangles.3paired",
      "triangles.3paired2",
      "hexagons.lines",
      "hexagons.2oneinthree",
      "hexagons.2oneinthree2",
      "hexagons.3striped",
      "hexagons.3apart",
      "penrose.rules",
      "kitedart.rules",
    ]);
    for (const level of COLOURED) {
      // matching rules and colourings: two groups
      expect(level.group).toBe(level.decor!.rules ? "rules" : "colourings");
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
    "%s: no more tiles than the plain board's per colour, every shared edge's two marks partners",
    (key) => {
      const level = levelByKey(key)!;
      const plain = levelByKey(level.decor!.of)!;
      const { colours: count, rules } = level.decor!;
      const marks = level.tiles.flatMap((t) => t.pieces[0]!.marks!);
      // colours alternate (each tile says what lies across it), or the
      // edges carry their own colour, alike both sides
      const alternate = marks.some((m) => colours(m) !== null);
      expect(marks.every((m) => (colours(m) !== null) === alternate)).toBe(true);
      if (rules) expect(level.tiles).toHaveLength(plain.tiles.length);
      else if (alternate) expect(level.tiles).toHaveLength(count);
      expect(level.tiles.length).toBeLessThanOrEqual(count * plain.tiles.length);
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
      if (!rules && alternate) {
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
      (l) => `${l.decor!.of}|${l.decor!.rules}|${traySignature(l.tiles)}`,
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

  it("leaves a colouring of one tile to the lined boards, and colours every regular board in two tiles", () => {
    // a colouring whose tiles all read alike plays as a lined board does
    for (const level of COLOURED.filter((l) => !l.decor!.rules))
      expect(level.tiles.length).toBeGreaterThan(levelByKey(level.decor!.of)!.tiles.length);
    // the hexagons can't alternate in two colours: a third of them one colour
    for (const plain of ["squares", "triangles", "hexagons"])
      expect(
        COLOURED.some((l) => l.decor!.of === plain && !l.decor!.rules && l.tiles.length === 2),
        plain,
      ).toBe(true);
    const third = levelByKey("hexagons.2oneinthree2")!;
    // the blue hexagons apart, each ringed by red: red across every side
    expect(third.need).toEqual([12, 8]);
    const ringed = third.tiles[1]!.pieces[0]!.marks!.map((m) => colours(m)!);
    expect(ringed.every(({ own, other }) => own !== other)).toBe(true);
  });

  it("draws a colour as a half disc on the edge: the colour across, or the edge's own", () => {
    const apart = levelByKey("squares.2apart")!;
    const own = colours(apart.tiles[0]!.pieces[0]!.marks![0]!)!.own;
    const apartParts = decorParts(loopsOf(apart.ring, apart.tiles[0]!.pieces));
    expect(apartParts.map((p) => p.class)).toEqual([`decor band paint-${1 - own}`]);
    // four half discs, each an arc closed along its edge
    expect(apartParts[0]!.d.match(/A/g)).toHaveLength(4);
    // where colours touch, the same: each half disc the colour across, and
    // none where that is the tile's own — the hexagons a third of them blue
    const level = levelByKey("hexagons.2oneinthree2")!;
    level.tiles.forEach((t, kind) => {
      const marks = t.pieces[0]!.marks!.map((m) => colours(m)!);
      const own = marks[0]!.own;
      expect(level.colours[kind]).toContain(`paint-${own}`);
      const across = [...new Set(marks.filter((m) => m.other !== own).map((m) => m.other))];
      expect(decorParts(loopsOf(level.ring, t.pieces)).map((p) => p.class)).toEqual(
        across.map((c) => `decor band paint-${c}`),
      );
    });
    for (const coloured of COLOURED.filter((l) => !l.decor!.rules))
      for (const t of coloured.tiles)
        expect(decorParts(loopsOf(coloured.ring, t.pieces)).map((p) => p.class)).not.toContain(
          "decor line",
        );
  });

  it("draws a line from edge to edge, ending on each edge's middle, or a half disc alone", () => {
    const num = (d: string): number[] => (d.match(/-?\d+(\.\d+)?/g) ?? []).map(Number);
    // squares: straight across
    const squares = levelByKey("squares.lines")!;
    const [sq] = decorParts(loopsOf(squares.ring, squares.tiles[0]!.pieces));
    expect(sq!.class).toBe("decor line");
    expect(sq!.d).toMatch(/^M[^A-Z]*L[^A-Z]*$/);
    // triangles: round the corner two lined edges share, a circle about it
    // through both their middles — inside the tile, square on to each edge
    const triangles = levelByKey("triangles.lines")!;
    const tile = triangles.tiles[0]!;
    const xy = tile.pieces[0]!.verts.map((v) => triangles.ring.toXY(v));
    const [tri] = decorParts(loopsOf(triangles.ring, tile.pieces));
    expect(tri!.d).toMatch(/^M[^A-Z]*A[^A-Z]*$/);
    const [x0, y0, r, , , , , x1, y1] = num(tri!.d);
    expect(r).toBeCloseTo(0.5, 4);
    const mids = xy.map((a, i) => {
      const b = xy[(i + 1) % xy.length]!;
      return [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
    });
    const lined = tile.pieces[0]!.marks!.flatMap((m, i) => (m === LINE ? [mids[i]!] : []));
    for (const [x, y] of [
      [x0, y0],
      [x1, y1],
    ])
      expect(lined.some(([mx, my]) => Math.hypot(mx! - x!, my! - y!) < 1e-3)).toBe(true);
    // one lined edge: a half disc there, two tiles making one disc
    const pairs = levelByKey("triangles.linkedpairs")!;
    expect(decorParts(loopsOf(pairs.ring, pairs.tiles[0]!.pieces)).map((p) => p.class)).toEqual([
      "decor dot",
    ]);
  });

  it("gives the Penrose rhombi their arrows: a single and a double on each, two kinds of tile", () => {
    const rules = levelByKey("penrose.rules")!;
    expect(rules.tiles).toHaveLength(2);
    expect(rules.mirror).toBe(false);
    for (const t of rules.tiles) {
      const kinds = t.pieces[0]!.marks!.map((m) => arrow(m)!.kind).sort();
      expect(kinds).toEqual([1, 1, 2, 2]);
      // two arcs about opposite corners, one of each kind
      const parts = decorParts(loopsOf(rules.ring, t.pieces));
      expect(parts.map((p) => p.class)).toEqual(["decor arc", "decor arc double"]);
      for (const p of parts) expect(p.d.match(/A/g)).toHaveLength(1);
    }
    // the arrows break the rhombi's half-turn symmetry: they need turning
    for (const t of rules.tiles) expect(selfTurns(t)).toEqual([0]);
    expect(new Puzzle(rules).solve()).toBe(true);
  });

  it("gives Penrose's kites and darts his vertex rule: no kite fills a dart's notch", () => {
    const rules = levelByKey("kitedart.rules")!;
    expect(rules.tiles).toHaveLength(2);
    expect(rules.mirror).toBe(false);
    const angleAt = (xy: [number, number][], v: number): number => {
      const m = xy.length;
      const [p, h, n] = [xy[(v - 1 + m) % m]!, xy[v]!, xy[(v + 1) % m]!];
      const a = Math.atan2(p[1] - h[1], p[0] - h[0]) - Math.atan2(n[1] - h[1], n[0] - h[0]);
      return ((((a * 180) / Math.PI) % 360) + 360) % 360;
    };
    // the arrows on the two edges at a corner: pointing into it, or out
    const into = (marks: number[], v: number): [boolean, boolean] => {
      const m = marks.length;
      return [arrow(marks[(v - 1 + m) % m]!)!.forward, !arrow(marks[v]!)!.forward];
    };
    const corners = rules.tiles.map((t) => {
      const xy = t.pieces[0]!.verts.map((v) => rules.ring.toXY(v));
      return xy.map((_, v) => ({
        angle: Math.round(angleAt(xy, v)),
        arrows: into(t.pieces[0]!.marks!, v),
      }));
    });
    const tail = corners.flat().find((c) => c.angle === 144)!; // the kite's
    const notch = corners.flat().find((c) => c.angle === 216)!; // the dart's
    // round the kite's tail its arrows point out, into the dart's notch in:
    // the two edges a kite would share there cannot both agree
    expect(tail.arrows).toEqual([false, false]);
    expect(notch.arrows).toEqual([true, true]);
    for (const t of rules.tiles) {
      expect(t.pieces[0]!.marks!.map((m) => arrow(m)!.kind).sort()).toEqual([3, 3, 4, 4]);
      expect(decorParts(loopsOf(rules.ring, t.pieces)).map((p) => p.class)).toEqual([
        "decor arc",
        "decor arc double",
      ]);
    }
    expect(new Puzzle(rules).solve()).toBe(true);
  });
});
