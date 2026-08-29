import { describe, expect, it } from "vitest";
import { buildBoard, MODES } from "../../src/boards/presets";
import { boardFacts, shapeFacts } from "../../src/ui/boardFacts";

// What the info window says about a board (ui/boardFacts.ts). Everything there
// is derived from the board and its tiling rather than tabulated, so these are
// the tests that keep the derivation honest — a new tiling has to describe
// itself correctly with no edit to that file.

/** The shape rows of a board at easy, as "name × count". */
function shapes(mode: string): string[] {
  return shapeFacts(mode, buildBoard(mode, "easy")).map((s) => `${s.label} ${s.count}`);
}

function facts(mode: string, difficulty = "easy") {
  const board = buildBoard(mode, difficulty);
  return boardFacts(mode, difficulty, board, 10);
}

describe("shape names", () => {
  it("names a regular tile by its polygon", () => {
    expect(shapes("hex")).toEqual(["Regular hexagons 80"]);
    expect(shapes("square")).toEqual(["Squares 81"]);
    expect(shapes("trigrid")).toEqual(["Equilateral triangles 77"]);
  });

  it("splits a tiling of two shapes, and the counts add up", () => {
    const board = buildBoard("rhombitrihex", "easy");
    const rows = shapeFacts("rhombitrihex", board);
    expect(rows.map((r) => r.label)).toEqual([
      "Equilateral triangles",
      "Squares",
      "Regular hexagons",
    ]);
    expect(rows.reduce((sum, r) => sum + r.count, 0)).toBe(board.polygons.size);
  });

  it("uses the word for the shape where English has one", () => {
    // A Laves dual is one irregular tile throughout, and "quadrilateral" or
    // "irregular triangle" would be the least it could say about them.
    expect(shapes("rhombille")).toEqual(["Rhombi 80"]);
    expect(shapes("deltoidal")).toEqual(["Kites 76"]);
    expect(shapes("tetrakis")).toEqual(["Isosceles triangles 84"]);
    expect(shapes("kisrhombille")).toEqual(["Irregular triangles 72"]); // 30-60-90
    expect(shapes("cairo")).toEqual(["Irregular pentagons 80"]);
    expect(shapes("stackedbond")).toEqual(["Rectangles 91"]);
  });

  it("calls an equilateral tile equilateral, and nothing equiangular", () => {
    // The phyllotactic tile is an equilateral hexagon with 72°/144° corners.
    expect(shapes("phyllotaxis")).toEqual(["Equilateral hexagons 81"]);
    // The chair is the L-tromino: its corners *measure* equal only because a
    // reflex one reads as its complement, so it claims nothing.
    expect(shapes("chair")).toEqual(["Irregular hexagons 64"]);
  });

  it("tells two tiles of the same name apart", () => {
    // Penrose: two rhombi, alike in everything but their sharpest corner.
    expect(shapes("penrose")).toEqual(["Rhombi · 36° 31", "Rhombi · 72° 50"]);
    // The Pythagorean tiling: one square in two sizes.
    expect(shapes("pythagorean")).toEqual(["Squares · small 40", "Squares · large 47"]);
    expect(shapes("threescaletri")).toEqual([
      "Equilateral triangles · small 27",
      "Equilateral triangles · medium 27",
      "Equilateral triangles · large 31",
    ]);
  });

  it("names a wrapped board from the flat tiling, not from the bent tiles", () => {
    // The whole reason a wrapped board is named off its template: the immersion
    // bends every tile, and a hexagonal torus is still a tiling by regular
    // hexagons however far the drawn cells are from regular.
    expect(shapes("torushex")).toEqual(["Regular hexagons 84"]);
    expect(shapes("klein")).toEqual(["Squares 80"]);
    expect(shapes("mobiustrihex")).toEqual([
      "Equilateral triangles 54",
      "Regular hexagons 27",
    ]);
    expect(shapes("kleincairo")).toEqual(["Irregular pentagons 78"]);
    expect(shapes("torusstackedbond")).toEqual(["Rectangles 80"]);
  });

  it("measures a solid's own faces", () => {
    // Nothing to unroll: a Catalan solid's faces really are irregular, and a
    // uniform one's really are regular.
    expect(shapes("rhombictriaconta")).toEqual(["Rhombi 120"]);
    expect(shapes("cube")).toEqual(["Squares 96"]);
    expect(shapes("truncicosidodeca")).toEqual([
      "Squares 30",
      "Regular hexagons 20",
      "Regular decagons 12",
    ]);
  });
});

describe("boardFacts", () => {
  it("names the family a tiling comes from", () => {
    expect(facts("kleincairo").family).toBe("Laves");
    expect(facts("torusrhombitrihex").family).toBe("Uniform");
    expect(facts("pythagorean").family).toBe("Isogonal");
    expect(facts("herringbone").family).toBe("Congruent rectangles");
    expect(facts("hex").family).toBe("Regular");
    expect(facts("penrose").family).toBe("Aperiodic");
    expect(facts("gosper").family).toBe("Fractals");
    // A solid belongs to no tiling family; the group it is listed under is
    // what says what it is.
    expect(facts("rhombictriaconta").family).toBe("Catalan solids");
    expect(facts("cubeframe").family).toBe("Polyhedra");
  });

  it("names the surface, and calls a one-off flat board flat", () => {
    expect(facts("kleincairo").surface).toBe("Klein bottle");
    expect(facts("cairo").surface).toBe("Flat");
    // Shaped, aperiodic and fractal boards are modes of their own with no
    // SurfaceSpec behind them, and they are all on the plane.
    expect(facts("hexhex").surface).toBe("Flat");
    expect(facts("spectre").surface).toBe("Flat");
    // A solid is on none of them.
    expect(facts("icosahedron").surface).toBeNull();
  });

  it("names the tiling a shaped board is cut from, and does not repeat itself", () => {
    // "Hexagonal hexagon" does not say what it is made of; "Hexagons · Torus"
    // already does, so that row would be an echo.
    expect(facts("hexhex").tiling).toBe("Hexagons");
    expect(facts("torushex").tiling).toBeNull();
  });

  it("counts the cells of the board it is given", () => {
    const board = buildBoard("torushex", "medium");
    const f = boardFacts("torushex", "medium", board, 42);
    expect(f.cells).toBe(board.polygons.size);
    expect(f.mines).toBe(42);
    expect(f.name).toBe("Hexagons · Torus");
    expect(f.difficulty).toBe("Medium");
  });

  it("explains the ⚠ the board's name carries", () => {
    // The triakis boards are made entirely of indistinguishable pairs, so they
    // are graded and the name is marked. The mark is a tooltip on the desktop
    // and nothing at all on a phone; this is where it is spelled out.
    expect(facts("triakis").warning).toBeTruthy();
    expect(facts("square").warning).toBeUndefined();
  });

  it("has something to say about every board this build ships", () => {
    for (const mode of MODES) {
      const board = buildBoard(mode, "easy");
      const f = boardFacts(mode, "easy", board, 10);
      expect(f.family, mode).toBeTruthy();
      expect(f.name, mode).toBeTruthy();
      expect(f.shapes.length, mode).toBeGreaterThan(0);
      // Every cell is counted exactly once.
      expect(
        f.shapes.reduce((sum, s) => sum + s.count, 0),
        mode,
      ).toBe(board.polygons.size);
      // And no row hedges: a label always names a polygon.
      for (const shape of f.shapes) expect(shape.label, mode).toMatch(/\w/);
    }
  });
});
