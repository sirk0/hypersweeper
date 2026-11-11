import { describe, expect, it } from "vitest";
import colouringsData from "../../src/colourings.json";
import {
  COLOURS_CAP,
  RULES_CAP,
  chooseColourings,
  regularColourings,
} from "../../src/colouringChoice";
import { latticeOf, traySignature } from "../../src/colourings";
import { measure } from "../../src/difficulty";
import { cyclotomic, strictlyBetween, type Cyc } from "../../src/geometry/cyclotomic";
import { Frontier } from "../../src/geometry/frontier";
import {
  BLANK,
  END,
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
  realCorners,
  regular,
  selfTurns,
  spotKey,
  walk,
  type Piece,
  type Shape,
} from "../../src/geometry/shape";
import {
  COLOURED as COLOURED_LATTICES,
  LAVES,
  LEVELS,
  RECTANGLES,
  TWO_ISOHEDRAL_KEYED,
  makeFirstBoard,
  paintBase,
  periodicContext,
  TWO_UNIFORM,
  UNIFORM,
  levelByKey,
  PATCH_MARKED,
  plainKinds,
  type Level,
} from "../../src/levels";
import aperiodicColourings from "../../src/aperiodicColourings.json";
import { Puzzle } from "../../src/puzzle";
import { decorParts, meet } from "../../src/view/decor";
import { loopsOf } from "../../src/view/curve";

const Z4 = cyclotomic(4);
const APERIODIC_COLOURINGS = aperiodicColourings as Record<string, { tiles: number }>;
const COLOURED = LEVELS.filter((l) => l.decor);
/** The tilings whose full colouring choice is too slow for a unit test. */
const SLOW_CHOICE = [
  "studdedtri2",
  "tritrunctrihex",
  "snubelongated2",
  "snubelongated",
  "dissectedtrunchex2",
  "dissectedtrunchex",
  "hexrings",
  "dodecarhombitrihex",
  "studdedtri2dual",
  "tritrunctrihexdual",
  "snubelongated2dual",
  "snubelongateddual",
  "dissectedtrunchex2dual",
  "dissectedtrunchexdual",
  "hexringsdual",
  "dodecarhombitrihexdual",
];

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
    // a line cut back to a half disc meets only a half disc
    expect(partner(END)).toBe(END);
    expect(END).not.toBe(LINE);
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
  it("paints each regular board lined, then in two and three colours; the other uniform ones, the 2-uniform ones, the Laves ones, the 2-isohedral ones and the congruent-rectangle bonds as src/colourings.json lists; and gives Penrose's tilings their arrows, and the aperiodic levels, the spirals and the rep-tiles rules read off their patch", () => {
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
      "trihex.lines",
      "trihex.dots",
      "trihex.2oneinthreebyshape",
      "trihex.2oneinthree",
      "trihex.3byshape",
      "truncsquare.lines",
      "truncsquare.lines2",
      "truncsquare.2oneinthree",
      "truncsquare.2oneinthree2",
      "truncsquare.3colours",
      "trunchex.lines",
      "trunchex.lines2",
      "trunchex.2oneinthreebyshape",
      "trunchex.2oneinthree",
      "trunchex.3byshape",
      "elongated.lines",
      "elongated.lines2",
      "elongated.2oneinthreebyshape",
      "elongated.2oneinthree",
      "elongated.3byshape",
      "snubsquare.lines",
      "snubsquare.lines2",
      "snubsquare.2oneinthreebyshape",
      "snubsquare.2oneinthree",
      "snubsquare.3byshape",
      "snubhex.lines",
      "snubhex.dots",
      "snubhex.2oneinthreebyshape",
      "snubhex.2oneinthreebyshape2",
      "snubhex.2oneinthreebyshape3",
      "rhombitrihex.lines",
      "rhombitrihex.dots",
      "rhombitrihex.2oneinthreebyshape",
      "rhombitrihex.2oneinthreebyshape2",
      "rhombitrihex.3byshape",
      "trunctrihex.lines",
      "trunctrihex.lines2",
      "trunctrihex.2oneinthreebyshape",
      "trunctrihex.2byshape",
      "trunctrihex.3byshape",
      "studdedtri.lines",
      "studdedtri.dots",
      "studdedtri.2oneinthreebyshape",
      "studdedtri.2oneinthreebyshape2",
      "studdedtri.3byshape",
      "studdedtri2.lines",
      "studdedtri2.dots",
      "elongated2.lines",
      "elongated2.lines2",
      "elongated2.2oneinthreebyshape",
      "elongated2.2oneinthree",
      "elongated2.2oneinthree2",
      "elongated3.lines",
      "elongated3.lines2",
      "elongated3.2oneinthreebyshape",
      "elongated3.2oneinthree",
      "elongated3.2oneinthree2",
      "tritrunctrihex.lines",
      "tritrunctrihex.dots",
      "tritrunctrihex.2oneinthreebyshape",
      "tritrunctrihex.2oneinthreebyshape2",
      "tritrunctrihex.2oneinthreebyshape3",
      "fannedhex.lines",
      "fannedhex.lines2",
      "fannedhex.2oneinthree",
      "fannedhex.2oneinthree2",
      "fannedhex.2oneinthree3",
      "hexbands.lines",
      "hexbands.lines2",
      "hexbands.2oneinthree",
      "hexbands.2oneinthree2",
      "hexbands.3colours",
      "snubelongated2.dots",
      "snubelongated2.dots2",
      "snubelongated2.2oneinthree",
      "snubelongated2.2oneinthree2",
      "snubelongated2.2oneinthree3",
      "snubelongated.lines",
      "snubelongated.lines2",
      "snubelongated.2oneinthreebyshape",
      "snubelongated.2oneinthree",
      "snubelongated.3byshape",
      "dissectedtrunchex2.lines",
      "dissectedtrunchex2.dots",
      "dissectedtrunchex2.2oneinthreebyshape",
      "dissectedtrunchex2.2oneinthreebyshape2",
      "dissectedtrunchex2.2oneinthreebyshape3",
      "squarerows2.lines",
      "squarerows2.lines2",
      "squarerows2.2oneinthreebyshape",
      "squarerows2.2oneinthreebyshape2",
      "squarerows2.2oneinthree",
      "squarerows3.lines",
      "squarerows3.lines2",
      "squarerows3.2oneinthreebyshape",
      "squarerows3.2oneinthreebyshape2",
      "squarerows3.2oneinthree",
      "dissectedtrunchex.dots",
      "dissectedtrunchex.dots2",
      "dissectedtrunchex.2oneinthreebyshape",
      "dissectedtrunchex.2oneinthreebyshape2",
      "dissectedtrunchex.2oneinthreebyshape3",
      "hexrows.lines",
      "hexrows.lines2",
      "hexrows.2oneinthreebyshape",
      "hexrows.2oneinthree",
      "hexrows.3byshape",
      "dodecasquare.lines",
      "dodecasquare.lines2",
      "dodecasquare.2byshape",
      "dodecasquare.2oneinthreebyshape",
      "dodecasquare.2byshape2",
      "hexrings.dots",
      "hexrings.dots2",
      "hexrings.2oneinthreebyshape",
      "squaretrihex.lines",
      "squaretrihex.lines2",
      "squaretrihex.2oneinthreebyshape",
      "squaretrihex.2oneinthreebyshape2",
      "squaretrihex.2oneinthree",
      "squaretrihex2.lines",
      "squaretrihex2.lines2",
      "squaretrihex2.2oneinthreebyshape",
      "squaretrihex2.2oneinthreebyshape2",
      "squaretrihex2.2oneinthree",
      "dodecarhombitrihex.lines",
      "dodecarhombitrihex.lines2",
      "dodecarhombitrihex.2oneinthreebyshape",
      "dodecarhombitrihex.3byshape",
      "dodecarhombitrihex.3byshape2",
      "tetrakis.lines",
      "tetrakis.lines2",
      "tetrakis.2apart",
      "rhombille.lines",
      "rhombille.2oneinthree",
      "rhombille.2oneinthree2",
      "rhombille.3striped",
      "triakis.lines",
      "triakis.linkedpairs",
      "triakis.2oneinthree",
      "triakis.2oneinthree2",
      "triakis.3mixed",
      "cairo.lines",
      "cairo.lines2",
      "prismaticpent.lines",
      "prismaticpent.branchinglines",
      "prismaticpent.2oneinthree",
      "prismaticpent.2oneinthree2",
      "prismaticpent.3paired",
      "floret.lines",
      "floret.lines2",
      "floret.3paired",
      "deltoidal.lines",
      "deltoidal.linkedpairs",
      "deltoidal.2oneinthree",
      "deltoidal.2oneinthree2",
      "deltoidal.2oneinthree3",
      "kisrhombille.lines",
      "kisrhombille.lines2",
      "kisrhombille.2apart",
      "kisrhombille.3mixed",
      "studdedtridual.dots",
      "studdedtridual.dots2",
      "studdedtridual.2byshape",
      "studdedtridual.2byshape2",
      "studdedtri2dual.lines",
      "studdedtri2dual.lines2",
      "studdedtri2dual.2colours",
      "studdedtri2dual.2oneinthree",
      "studdedtri2dual.3colours",
      "elongated2dual.lines",
      "elongated2dual.lines2",
      "elongated2dual.2oneinthreebyshape",
      "elongated2dual.2oneinthree",
      "elongated2dual.3byshape",
      "elongated3dual.lines",
      "elongated3dual.lines2",
      "elongated3dual.2oneinthreebyshape",
      "elongated3dual.2oneinthreebyshape2",
      "elongated3dual.2oneinthree",
      "trirhombitrihexdual.lines",
      "trirhombitrihexdual.lines2",
      "trirhombitrihexdual.2oneinthree",
      "trirhombitrihexdual.2oneinthree2",
      "trirhombitrihexdual.3colours",
      "tritrunctrihexdual.lines",
      "tritrunctrihexdual.lines2",
      "fannedhexdual.lines",
      "fannedhexdual.lines2",
      "hexbandsdual.lines",
      "hexbandsdual.lines2",
      "hexbandsdual.2oneinthree",
      "hexbandsdual.2oneinthree2",
      "hexbandsdual.2oneinthree3",
      "snubelongated2dual.lines",
      "snubelongated2dual.lines2",
      "snubelongated2dual.2oneinthreebyshape",
      "snubelongated2dual.2oneinthreebyshape2",
      "snubelongated2dual.3byshape",
      "snubelongateddual.lines",
      "snubelongateddual.lines2",
      "dissectedtrunchex2dual.lines",
      "dissectedtrunchex2dual.lines2",
      "dissectedtrunchex2dual.2colours",
      "dissectedtrunchex2dual.2colours2",
      "dissectedtrunchex2dual.3byshape",
      "squarerows2dual.lines",
      "squarerows2dual.lines2",
      "squarerows2dual.2oneinthreebyshape",
      "squarerows2dual.2oneinthree",
      "squarerows2dual.3byshape",
      "squarerows3dual.lines",
      "squarerows3dual.lines2",
      "squarerows3dual.2oneinthreebyshape",
      "squarerows3dual.2oneinthreebyshape2",
      "squarerows3dual.2oneinthree",
      "dissectedtrunchexdual.dots",
      "dissectedtrunchexdual.dots2",
      "dissectedtrunchexdual.2colours",
      "dissectedtrunchexdual.2oneinthree",
      "dissectedtrunchexdual.3byshape",
      "hexrowsdual.lines",
      "hexrowsdual.lines2",
      "hexrowsdual.2oneinthreebyshape",
      "hexrowsdual.2oneinthree",
      "hexrowsdual.3byshape",
      "dodecasquaredual.lines",
      "dodecasquaredual.lines2",
      "hexringsdual.lines",
      "hexringsdual.lines2",
      "hexringsdual.2oneinthreebyshape",
      "hexringsdual.2oneinthreebyshape2",
      "hexringsdual.3byshape",
      "squaretrihexdual.lines",
      "squaretrihexdual.lines2",
      "squaretrihexdual.2oneinthree",
      "squaretrihex2dual.lines",
      "squaretrihex2dual.lines2",
      "squaretrihex2dual.2oneinthree",
      "dodecarhombitrihexdual.lines",
      "dodecarhombitrihexdual.lines2",
      "dodecarhombitrihexdual.2oneinthreebyshape",
      "dodecarhombitrihexdual.2oneinthreebyshape2",
      "dodecarhombitrihexdual.2oneinthree",
      "stackedbond.lines",
      "stackedbond.2oneinthree",
      "stackedbond.2oneinthree2",
      "stackedbond.2oneinthree3",
      "runningbond.lines",
      "runningbond.lines2",
      "runningbond.2oneinthree",
      "runningbond.2oneinthree2",
      "runningbond.2oneinthree3",
      "basketweave.lines",
      "basketweave.lines2",
      "basketweave3.2oneinthree",
      "basketweave3.3mixed",
      "basketweave3.3mixed2",
      "herringbone.lines",
      "herringbone.branchinglines",
      "herringbone.2oneinthree",
      "herringbone.2oneinthree2",
      "herringbone.2oneinthree3",
      "penrose.rules",
      "kitedart.rules",
      "ammannbeenker.rules",
      "ammannbeenker.3apart",
      "tile11.rules",
      "spectre.rules",
      "hat.rules",
      "turtle.rules",
      "hatmetatiles.rules",
      "socolartaylor.rules",
      "phyllotaxis.rules",
      "klaassen.3apart",
      "pentaspiral5.rules",
      "pentaspiral6.rules",
      "pentaspiral7.rules",
      "sphinx.rules",
      "chair.rules",
      "ltetromino.rules",
      "trapezoid.rules",
      "trapezoid.3apart",
      "righttrapezoid.rules",
      "halftrapezoid.rules",
      "stretchedchair.rules",
      "rhombicl.rules",
      "rightisosceles.rules",
      "rightisosceles.3apart",
      "drafter.rules",
      "drafter.3apart",
      "ttetromino.rules",
      "fish.rules",
      "fish.3apart",
      "fish60.rules",
      "kissingsquares.rules",
      "kissingsquares.3apart",
      "kissingtriangles.3apart",
      "kissingchain.rules",
    ]);
    for (const level of COLOURED) {
      // matching rules and colourings: two groups
      expect(level.group).toBe(level.decor!.rules ? "rules" : "colourings");
      expect(levelByKey(level.key)).toBe(level);
      const plain = levelByKey(level.decor!.of)!;
      expect(level.name.startsWith(`${plain.name} · `)).toBe(true);
      // the plain board, tile for tile (by its real corners: a marked
      // aperiodic tile is cut where the tile across has a corner)
      const real = (ring: Level["ring"], cell: Piece[]): string =>
        spotKey(
          ring,
          cell.map((p) => ({ verts: p.verts.filter((_, i) => realCorners(ring, p.verts)[i]) })),
        );
      expect(level.cells.map((c) => real(level.ring, c))).toEqual(
        plain.cells.map((c) => real(plain.ring, c)),
      );
    }
  });

  it.each(COLOURED.map((l) => l.key))(
    "%s: no more tiles than the plain board's per colour, every shared edge's two marks partners",
    (key) => {
      const level = levelByKey(key)!;
      const plain = levelByKey(level.decor!.of)!;
      const { colours: count, rules } = level.decor!;
      const marks = level.tiles.flatMap((t) => t.pieces.flatMap((p) => p.marks!));
      // colours alternate (each tile says what lies across it), or the
      // edges carry their own colour, alike both sides
      const alternate = marks.some((m) => colours(m) !== null);
      expect(marks.every((m) => (colours(m) !== null) === alternate)).toBe(true);
      if (rules) expect(level.tiles).toHaveLength(plain.tiles.length);
      else if (PATCH_MARKED.includes(plain.key)) {
        // an aperiodic colouring: proper — no two tiles of a colour share an
        // edge — and as many tray tiles as the choice found
        expect(marks.every((m) => colours(m)!.own !== colours(m)!.other)).toBe(true);
        expect(level.tiles).toHaveLength(APERIODIC_COLOURINGS[plain.key]!.tiles);
      } else {
        if (alternate && plain.tiles.length === 1) expect(level.tiles).toHaveLength(count);
        expect(level.tiles.length).toBeLessThanOrEqual(count * plain.tiles.length);
        // one tray tile per colour and shape: every cell of one colour and
        // plain kind is one kind of the tray
        const kinds = plainKinds(plain);
        const marked = plainKinds(level);
        const byGroup = new Map<string, Set<number>>();
        level.cells.forEach((_, i) => {
          const own = colours(level.cells[i]![0]!.marks![0]!)?.own ?? 0;
          const group = `${own}:${kinds[i]}`;
          byGroup.set(group, (byGroup.get(group) ?? new Set()).add(marked[i]!));
        });
        for (const group of byGroup.values()) expect(group.size).toBe(1);
      }
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
          const own = new Set(t.pieces.flatMap((p) => p.marks!.map((m) => colours(m)!.own)));
          expect(own.size).toBe(1);
          expect(level.colours[kind]).toContain(`paint-${[...own][0]}`);
        });
        expect(new Set(level.colours.flatMap((c) => c.match(/paint-\d/g) ?? [])).size).toBe(count);
      }
    },
  );

  it("rests a marked tray's tiles of one outline all the same way round, a mirror image as its mirror", () => {
    for (const level of COLOURED) {
      const { ring } = level;
      // a tray tile's real corners, moved to their centre (N·v − Σ), turned
      // by ζ^k and mirrored or not
      const outline = (s: Shape, k: number, flip: boolean): string => {
        const pts = s.pieces.flatMap(({ verts }) => {
          const real = realCorners(ring, verts);
          return verts
            .filter((_, i) => real[i])
            .map((v) => ring.mul(ring.zeta(k), flip ? ring.conj(v) : v));
        });
        const sum = pts.reduce((a, v) => ring.add(a, v), ring.zero);
        return pts
          .map((v) => ring.key(ring.sub(v.map((x) => x * pts.length) as Cyc, sum)))
          .sort()
          .join("|");
      };
      const held = new Map<string, Set<string>>();
      for (const tile of level.tiles) {
        if (tile.pieces.length !== 1) continue;
        let canon = "";
        for (const flip of [false, true])
          for (let k = 0; k < ring.n; k++) {
            const key = outline(tile, k, flip);
            if (!canon || key < canon) canon = key;
          }
        // a tile and its mirror image in the upright are held alike — but
        // for one that is its own mirror image, which is only itself turned
        const own = outline(tile, 0, false);
        const mirror = outline(tile, ring.n / 2, true);
        const symmetric = [...Array(ring.n).keys()].some((k) => outline(tile, k, true) === own);
        const way = symmetric || own < mirror ? own : mirror;
        held.set(canon, (held.get(canon) ?? new Set()).add(way));
      }
      for (const ways of held.values()) expect(ways.size, level.key).toBe(1);
    }
  });

  it("keeps one of every pair of colourings that make the same tray: rows, not columns too", () => {
    const signatures = COLOURED.map(
      (l) => `${l.decor!.of}|${l.decor!.rules}|${traySignature(l.tiles)}`,
    );
    expect(new Set(signatures).size).toBe(signatures.length);
  });

  it("finds each regular board's lattice from its cells, the one its colourings are painted on", () => {
    const Z12 = cyclotomic(12);
    const hand: [string, Cyc, Cyc][] = [
      ["squares", Z4.one, Z4.zeta(1)],
      ["triangles", Z12.one, Z12.zeta(2)],
      ["hexagons", Z12.add(Z12.zeta(1), Z12.zeta(-1)), Z12.add(Z12.zeta(3), Z12.zeta(1))],
    ];
    for (const [key, u, v] of hand) {
      const { ring, cells } = levelByKey(key)!;
      const found = latticeOf(ring, cells);
      // each basis a whole combination of the other: one lattice
      const spans = (p: Cyc, q: Cyc, w: Cyc): boolean => {
        const [px, py] = ring.toXY(p);
        const [qx, qy] = ring.toXY(q);
        const [wx, wy] = ring.toXY(w);
        const det = px * qy - py * qx;
        const i = Math.round((wx * qy - wy * qx) / det);
        const j = Math.round((px * wy - py * wx) / det);
        return ring.eq(
          w,
          p.map((x, n) => i * x + j * q[n]!),
        );
      };
      for (const w of [u, v]) expect(spans(found.u, found.v, w), key).toBe(true);
      for (const w of [found.u, found.v]) expect(spans(u, v, w), key).toBe(true);
    }
  });

  it("keeps at most two lined and three coloured levels on each other uniform tiling, each 2-uniform one, each Laves one, each 2-isohedral one and each bond", () => {
    for (const [key] of [
      ...UNIFORM,
      ...TWO_UNIFORM,
      ...LAVES,
      ...TWO_ISOHEDRAL_KEYED,
      ...RECTANGLES,
    ]) {
      const marked = COLOURED.filter((l) => l.decor!.of === key);
      expect(marked.filter((l) => l.decor!.rules).length, key).toBeLessThanOrEqual(RULES_CAP);
      expect(marked.filter((l) => !l.decor!.rules).length, key).toBeLessThanOrEqual(COLOURS_CAP);
      // every uniform and Laves tiling and every bond has some; a 2-uniform or 2-isohedral
      // one may have none as hard as its plain board
      if (![...TWO_UNIFORM, ...TWO_ISOHEDRAL_KEYED].some(([two]) => two === key))
        expect(marked.length, key).toBeGreaterThan(0);
    }
    for (const family of [TWO_UNIFORM, TWO_ISOHEDRAL_KEYED])
      expect(
        family.filter(([key]) => COLOURED.some((l) => l.decor!.of === key)).length,
      ).toBeGreaterThan(family.length / 2);
  });

  // The full choice on the 2-uniform tilings of a dozen or more translation
  // classes takes from half a minute to six (hexrings, nineteen classes), and
  // on the 2-isohedral tilings of most classes from ten seconds to four:
  // those are left to `npm run colourings` (`SLOW_CHOICE`), and their listed paintings
  // are checked only by building them (`paintedLevel` throws on one
  // that no longer makes a level) and by the tests above.
  it.each(
    [...UNIFORM, ...TWO_UNIFORM, ...LAVES, ...TWO_ISOHEDRAL_KEYED, ...RECTANGLES].filter(
      ([key]) => !SLOW_CHOICE.includes(key),
    ),
  )(
    "%s: src/colourings.json is in step with the choice (npm run colourings)",
    (key, box) => {
      const plain = levelByKey(key)!;
      expect(chooseColourings(plain, box)).toEqual(
        (colouringsData as Record<string, unknown>)[key],
      );
    },
    30_000,
  );

  it.each(COLOURED_LATTICES)(
    "%s: src/colourings.json lists every painting worth a level (npm run colourings)",
    (key, lattice) => {
      expect(regularColourings(levelByKey(key)!, lattice)).toEqual(
        (colouringsData as Record<string, unknown>)[key],
      );
    },
    30_000,
  );

  it.each(RECTANGLES)(
    "%s: painted on bricks cut into steps, one tile, every piece of a side meeting one piece across",
    (key, box) => {
      const plain = makeFirstBoard(key);
      const base = paintBase(plain);
      const { ring } = base;
      // one tile, as the plain board's brick: the same real corners, cut
      // alike all round (the stacked bond, edge to edge, not at all)
      expect(base.tiles).toHaveLength(1);
      expect(base.cells).toHaveLength(plain.cells.length);
      const verts = base.cells.map((c) => c[0]!.verts.length);
      expect(new Set(verts).size).toBe(1);
      expect(verts[0]).toBe(key === "stackedbond" ? 4 : key === "basketweave3" ? 8 : 6);
      const real = (cell: Piece[]): string =>
        cell[0]!.verts
          .filter((_, i) => realCorners(ring, cell[0]!.verts)[i])
          .map((v) => ring.key(v))
          .sort()
          .join("|");
      expect(base.cells.map(real).sort()).toEqual(plain.cells.map(real).sort());
      // no corner of the wider patch lies part-way along a window brick's
      // side: edge to edge, every piece of a side meeting one piece across,
      // as a painting needs
      const context = periodicContext(base, box);
      const corners = new Map<string, Cyc>();
      for (const cell of context)
        for (const { verts } of cell) for (const v of verts) corners.set(ring.key(v), v);
      for (const cell of base.cells)
        for (const { verts } of cell)
          verts.forEach((a, i) => {
            const b = verts[(i + 1) % verts.length]!;
            for (const p of corners.values()) expect(strictlyBetween(ring, a, b, p)).toBe(false);
          });
    },
  );

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

  const LINED = COLOURED.filter((l) =>
    l.tiles.every((t) => t.pieces[0]!.marks!.every((m) => m === LINE || m === END || m === BLANK)),
  );
  it.each(LINED.map((l) => l.key))(
    "%s: no line ends in a tile — it is cut back to half discs, which meet only half discs",
    (key) => {
      const level = levelByKey(key)!;
      expect(level.decor!.rules).toBe(true);
      // "dots" where every line was cut back to half discs, else lines
      const hasLine = level.tiles.some((t) => t.pieces[0]!.marks!.includes(LINE));
      if (level.tiles.length > 1) expect(level.decor!.label).toMatch(hasLine ? /^lines/ : /^dots/);
      const marks = sides(level);
      for (const t of level.tiles) {
        const lines = t.pieces[0]!.marks!.filter((m) => m === LINE).length;
        expect(lines).not.toBe(1);
      }
      // across every shared edge, a line meets a line and a half disc a half disc
      for (const [edge, mark] of marks) {
        const [a, b] = edge.split(">");
        const across = marks.get(`${b}>${a}`);
        if (across !== undefined && (mark === LINE || mark === END)) expect(across).toBe(mark);
      }
    },
  );

  it("draws a line cut back as a half disc, and no line", () => {
    const tile = { ring: Z4, pieces: square(0, 0, [END, BLANK, BLANK, BLANK]) };
    const parts = decorParts(loopsOf(Z4, tile.pieces));
    expect(parts.map((p) => p.class)).toEqual(["decor dot"]);
    // 3.12²'s: a dodecagon's line runs on through it, and two lines that
    // would end in its triangles are cut back to half discs
    const lined = levelByKey("trunchex.lines2")!;
    const twelve = lined.tiles.find((t) => t.pieces[0]!.verts.length === 12)!;
    expect(decorParts(loopsOf(lined.ring, twelve.pieces)).map((p) => p.class)).toEqual([
      "decor dot",
      "decor line",
    ]);
  });

  it("draws a line between two edges further apart about where their lines meet, square on to each", () => {
    // a dodecagon lined on edges 0 and 3: a quarter turn apart
    const Z12 = cyclotomic(12);
    const twelve = regular(Z12, 12).pieces[0]!.verts;
    const marks = twelve.map((_, i) => (i === 0 || i === 3 ? LINE : BLANK));
    const tile = { ring: Z12, pieces: [piece(twelve, undefined, marks)] };
    const xy = twelve.map((v) => Z12.toXY(v));
    const [line] = decorParts(loopsOf(Z12, tile.pieces));
    expect(line!.class).toBe("decor line");
    expect(line!.d).toMatch(/^M[^A-Z]*A[^A-Z]*$/);
    const centre = meet(xy, 0, 3);
    if (centre === null || centre === "parallel") throw new Error("the lines meet");
    for (const i of [0, 3]) {
      const [a, b] = [xy[i]!, xy[(i + 1) % 12]!];
      const mid = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
      // the centre lies on the edge's line, so the circle crosses the edge
      // square on at its middle
      const along = (mid[0]! - centre[0]) * (b[1] - a[1]) - (mid[1]! - centre[1]) * (b[0] - a[0]);
      expect(along).toBeCloseTo(0, 9);
    }
    // the arc's radius reaches both middles
    const r = Number(line!.d.split("A")[1]!.split(" ")[0]);
    const [a, b] = [xy[0]!, xy[1]!];
    expect(r).toBeCloseTo(
      Math.hypot((a[0] + b[0]) / 2 - centre[0], (a[1] + b[1]) / 2 - centre[1]),
      3,
    );
    // opposite edges never meet: straight across
    expect(meet(xy, 0, 6)).toBe("parallel");
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

  it("draws a line on an irregular tile as a curve square on to each edge: a kite's, a rhombus's", () => {
    const num = (d: string): number[] => (d.match(/-?\d+(\.\d+)?/g) ?? []).map(Number);
    const s = Math.sqrt(3);
    // a kite (V3.4.6.4's), two neighbouring edges lined, 1 and √3 long;
    // and a 60° rhombus (V3.6.3.6's), two opposite edges lined —
    // parallel, but not facing each other
    const kite: [number, number][] = [
      [0, 0],
      [1, 0],
      [1.5, s / 2],
      [0, s],
    ];
    const rhombus: [number, number][] = [
      [0, 0],
      [1, 0],
      [1.5, s / 2],
      [0.5, s / 2],
    ];
    for (const [xy, i, j] of [
      [kite, 1, 2],
      [rhombus, 0, 2],
    ] as const) {
      const marks = xy.map((_, n) => (n === i || n === j ? LINE : BLANK));
      const [line] = decorParts([{ xy: [...xy], marks }]);
      expect(line!.class).toBe("decor line");
      expect(line!.d).toMatch(/^M[^A-Z]*C[^A-Z]*$/);
      const [x0, y0, c1x, c1y, c2x, c2y, x1, y1] = num(line!.d) as [
        number,
        number,
        number,
        number,
        number,
        number,
        number,
        number,
      ];
      const mid = (n: number): [number, number] => {
        const [a, b] = [xy[n]!, xy[(n + 1) % xy.length]!];
        return [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
      };
      // from one lined edge's middle to the other's
      expect(Math.hypot(x0 - mid(i)[0], y0 - mid(i)[1])).toBeLessThan(1e-3);
      expect(Math.hypot(x1 - mid(j)[0], y1 - mid(j)[1])).toBeLessThan(1e-3);
      // leaving each square on: the control point's step along the edge is 0
      const along = (n: number, [px, py]: [number, number], [cx, cy]: [number, number]): number => {
        const [a, b] = [xy[n]!, xy[(n + 1) % xy.length]!];
        return (cx - px) * (b[0] - a[0]) + (cy - py) * (b[1] - a[1]);
      };
      expect(along(i, [x0, y0], [c1x, c1y])).toBeCloseTo(0, 3);
      expect(along(j, [x1, y1], [c2x, c2y])).toBeCloseTo(0, 3);
    }
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
