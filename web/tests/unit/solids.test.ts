import { describe, expect, it } from "vitest";
import {
  c80Board,
  cubeBoard,
  cubeFrameBoard,
  rhombicosidodecahedronBoard,
  snubDodecahedronBoard,
  sphereTriangleBoard,
  steppedBipyramidBoard,
  tetrahedronBoard,
  tetrahedronFrameBoard,
  truncatedIcosidodecahedronBoard,
} from "../../src/boards/solids";
import {
  deltoidalHexecontahedronBoard,
  deltoidalIcositetrahedronBoard,
  disdyakisDodecahedronBoard,
  disdyakisTriacontahedronBoard,
  pentagonalIcositetrahedronBoard,
  pentakisDodecahedronBoard,
  rhombicDodecahedronBoard,
  rhombicTriacontahedronBoard,
  sphereBoard,
  tetrakisHexahedronBoard,
  triakisIcosahedronBoard,
  triakisOctahedronBoard,
  triakisTetrahedronBoard,
} from "../../src/boards/catalan";
import { Base, type Op } from "../../src/boards/catalan";
import {
  archimedeanFaces,
  cuboctahedronBoard,
  rhombicosidodecahedronSplitBoard,
  snubCubeBoard,
  snubDodecahedronSplitBoard,
  truncatedIcosidodecahedronSplitBoard,
  truncatedOctahedronBoard,
} from "../../src/boards/archimedean";
import {
  boundaryComponents,
  eulerCharacteristic,
  newellNormal,
  type Board3D,
  type Vec3,
} from "../../src/boards/core";

// Structural invariants of the solids, mirrored from the Python suite
// (tests/test_boards.py) — shape mixes and vertex degrees the conformance
// oracle's aggregate counts don't pin down.

function sizes(board: Board3D): number[] {
  return [...board.polygons.values()].map((p) => p.length).sort((a, b) => a - b);
}

function count(xs: number[], x: number): number {
  return xs.filter((v) => v === x).length;
}

describe("solids", () => {
  it("sphere has sixty pentagons, each with seven neighbors", () => {
    const board = sphereBoard(7);
    expect(board.adjacency.size).toBe(60);
    expect(sizes(board).every((s) => s === 5)).toBe(true);
    for (const n of board.adjacency.values()) expect(n.length).toBe(7);
  });

  it("c80 is a chamfered dodecahedron: 12 pentagons + 30 hexagons", () => {
    const s = sizes(c80Board(5));
    expect(count(s, 5)).toBe(12);
    expect(count(s, 6)).toBe(30);
  });

  it("snub dodecahedron is 12 pentagons + 80 triangles", () => {
    const board = snubDodecahedronBoard(10);
    const s = sizes(board);
    expect(board.adjacency.size).toBe(92);
    expect(count(s, 3)).toBe(80);
    expect(count(s, 5)).toBe(12);
  });

  it("rhombicosidodecahedron is 20 triangles + 30 squares + 12 pentagons", () => {
    const board = rhombicosidodecahedronBoard(10);
    const s = sizes(board);
    expect(board.adjacency.size).toBe(62);
    expect(count(s, 3)).toBe(20);
    expect(count(s, 4)).toBe(30);
    expect(count(s, 5)).toBe(12);
  });

  it("truncated icosidodecahedron is 30 squares + 20 hexagons + 12 decagons", () => {
    const board = truncatedIcosidodecahedronBoard(10);
    const s = sizes(board);
    expect(board.adjacency.size).toBe(62);
    expect(count(s, 4)).toBe(30);
    expect(count(s, 6)).toBe(20);
    expect(count(s, 10)).toBe(12);
  });

  it("geodesic sphere has 20 * frequency^2 triangles", () => {
    const board = sphereTriangleBoard(10, 2);
    expect(board.polygons.size).toBe(80);
    expect(sizes(board).every((s) => s === 3)).toBe(true);
  });

  it("cube is six n x n square faces", () => {
    for (const n of [2, 4, 6]) {
      const board = cubeBoard(n, 5);
      expect(board.polygons.size).toBe(6 * n * n);
      expect(sizes(board).every((s) => s === 4)).toBe(true);
    }
  });

  it("tetrahedron is four subdivided triangular faces", () => {
    for (const frequency of [1, 4, 6]) {
      const board = tetrahedronBoard(3, frequency);
      expect(board.polygons.size).toBe(4 * frequency * frequency);
      expect(sizes(board).every((s) => s === 3)).toBe(true);
    }
  });

  it("tetrahedron frame is 16 * frequency^2 triangles", () => {
    const board = tetrahedronFrameBoard(8, 2);
    expect(board.polygons.size).toBe(16 * 4);
    expect(sizes(board).every((s) => s === 3)).toBe(true);
  });

  it("polycube surfaces are all quads", () => {
    for (const board of [
      cubeFrameBoard(6, 2, 40),
      steppedBipyramidBoard(6, 3, 20),
    ]) {
      expect(sizes(board).every((s) => s === 4)).toBe(true);
    }
  });

  it("polycube builders validate their arguments", () => {
    expect(() => cubeFrameBoard(4, 2, 5)).toThrow();
    expect(() => steppedBipyramidBoard(4, 1, 5)).toThrow();
  });

  it("solids are closed and one-sided, and carry their own point group", () => {
    // Measured off the polyhedron, so each gets its own: the pentagonal
    // hexecontahedron is chiral and has no mirror, the cube quarters about
    // three axes. See tests/unit/symmetries.test.ts for the whole catalogue.
    for (const board of [sphereBoard(7), cubeBoard(4, 12)]) {
      expect(board.twoSided).toBe(false);
      expect(board.symmetries.map((s) => s.id)).toContain("ring");
    }
    expect(sphereBoard(7).symmetries.map((s) => s.id)).toEqual(["ring", "tube"]);
    expect(cubeBoard(4, 12).symmetries.map((s) => s.id)).toEqual(["ring", "tube", "mirror-ring"]);
  });
});

// The thirteen Catalan solids, in menu order, with the face count each is
// named for. Mirrors tests/test_boards.py::TestCatalanSolids — the properties
// that tell a Catalan solid from something merely Catalan-shaped, none of
// which survives a construction that is only topologically right.
const CATALAN: [string, (m: number, f?: number) => Board3D, number, number][] = [
  ["triakistetra", triakisTetrahedronBoard, 12, 3],
  ["rhombicdodeca", rhombicDodecahedronBoard, 12, 4],
  ["triakisocta", triakisOctahedronBoard, 24, 3],
  ["tetrakishexa", tetrakisHexahedronBoard, 24, 3],
  ["deltoidalicositetra", deltoidalIcositetrahedronBoard, 24, 4],
  ["pentagonalicositetra", pentagonalIcositetrahedronBoard, 24, 5],
  ["disdyakisdodeca", disdyakisDodecahedronBoard, 48, 3],
  ["rhombictriaconta", rhombicTriacontahedronBoard, 30, 4],
  ["triakisicosa", triakisIcosahedronBoard, 60, 3],
  ["pentakisdodeca", pentakisDodecahedronBoard, 60, 3],
  ["deltoidalhexeconta", deltoidalHexecontahedronBoard, 60, 4],
  ["sphere", sphereBoard, 60, 5],
  ["disdyakistriaconta", disdyakisTriacontahedronBoard, 120, 3],
];

function faceNormal(polygon: Vec3[]): Vec3 {
  const n = newellNormal(polygon);
  const len = Math.hypot(n[0], n[1], n[2]);
  return [n[0] / len, n[1] / len, n[2] / len];
}

describe("Catalan solids", () => {
  for (const [mode, build, faces, sides] of CATALAN) {
    const bare = build(0, sides === 5 ? 0 : 1);

    it(`${mode} is ${faces} congruent planar ${sides}-gons on one insphere`, () => {
      expect(bare.polygons.size).toBe(faces);
      expect(new Set(sizes(bare))).toEqual(new Set([sides]));

      const shapes = new Set<string>();
      const radii = new Set<number>();
      for (const polygon of bare.polygons.values()) {
        const centre: Vec3 = [0, 1, 2].map(
          (a) => polygon.reduce((s, p) => s + p[a]!, 0) / polygon.length,
        ) as Vec3;
        const normal = faceNormal(polygon);
        // planar
        for (const p of polygon) {
          const off = [0, 1, 2].reduce((s, a) => s + normal[a]! * (p[a]! - centre[a]!), 0);
          expect(Math.abs(off)).toBeLessThan(1e-9);
        }
        // congruent, and every face plane the same distance out
        const edges = polygon.map((p, i) => {
          const q = polygon[(i + 1) % polygon.length]!;
          return Math.round(Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]) * 1e9) / 1e9;
        });
        shapes.add([...edges].sort((a, b) => a - b).join(","));
        const d = [0, 1, 2].reduce((s, a) => s + normal[a]! * polygon[0]![a]!, 0);
        radii.add(Math.round(Math.abs(d) * 1e9) / 1e9);
      }
      expect(shapes.size, `${mode} face shapes`).toBe(1);
      expect(radii.size, `${mode} insphere radii`).toBe(1);
    });

    it(`${mode} stays closed at every subdivision`, () => {
      // the size knob's real risk is a subdivision vertex on a shared edge
      // keyed differently by the two faces that meet there: the board would
      // still draw, and the cells either side of the seam would simply stop
      // being neighbours
      for (const frequency of [1, 2, 3]) {
        const board = build(0, frequency);
        const perFace = sides === 5 ? 5 * frequency ** 2 : frequency ** 2;
        expect(board.polygons.size).toBe(faces * perFace);
        expect(eulerCharacteristic(board)).toBe(2);
        expect(boundaryComponents(board)).toBe(0);
      }
    });
  }

  it("the pentagonal hexecontahedron keeps its seven-neighbour pentagons", () => {
    // `sphere` is the one Catalan solid that was already in the game, drawn
    // projected onto the unit sphere. Rebuilt flat-faced it is the same board
    // to the game, so a share link or a best time still addresses it.
    const board = sphereBoard(10, 0);
    expect(board.polygons.size).toBe(60);
    expect(new Set(sizes(board))).toEqual(new Set([5]));
    expect(new Set([...board.adjacency.values()].map((n) => n.length))).toEqual(new Set([7]));
  });
});

// The Archimedean solids cut into boards: the mode, its builder, the base and
// the Conway operation on it whose Catalan solid it is the dual of, the bare
// face mix, and the cells per frequency**2 once the big faces are cut (the
// truncated octahedron's hexagons into rhombi, the icosahedral ones' faces into
// triangle fans). Mirrors tests/test_boards.py::TestArchimedeanSolids.
const ARCHIMEDEAN: [
  string,
  (m: number, f?: number) => Board3D,
  string,
  Op,
  Record<number, number>,
  number,
][] = [
  ["cubocta", cuboctahedronBoard, "cube", "join", { 3: 8, 4: 6 }, 14],
  ["truncocta", truncatedOctahedronBoard, "cube", "kis", { 4: 6, 6: 8 }, 30],
  ["snubcube", snubCubeBoard, "cube", "gyro", { 3: 32, 4: 6 }, 38],
  ["rhombicosidodecasplit", rhombicosidodecahedronSplitBoard, "icosa", "ortho", { 3: 20, 4: 30, 5: 12 }, 110],
  ["truncicosidodecasplit", truncatedIcosidodecahedronSplitBoard, "icosa", "meta", { 4: 30, 6: 20, 10: 12 }, 270],
  ["snubdodecsplit", snubDodecahedronSplitBoard, "icosa", "gyro", { 3: 80, 5: 12 }, 140],
];

describe("Archimedean solids", () => {
  for (const [mode, build, base, op, mix, perFace] of ARCHIMEDEAN) {
    it(`${mode}: the Catalan dual is regular polygons of one edge on one sphere`, () => {
      const { faces, positions } = archimedeanFaces(new Base(base), op);
      const counts: Record<number, number> = {};
      const lengths = new Set<number>();
      for (const ring of faces.values()) {
        counts[ring.length] = (counts[ring.length] ?? 0) + 1;
        const points = ring.map((k) => positions.get(k)!);
        const centre = [0, 1, 2].map(
          (a) => points.reduce((s, p) => s + p[a]!, 0) / points.length,
        );
        const sides = points.map((p, i) => {
          const q = points[(i + 1) % points.length]!;
          return Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]);
        });
        const spokes = points.map((p) => Math.hypot(p[0] - centre[0]!, p[1] - centre[1]!, p[2] - centre[2]!));
        expect(Math.max(...sides) - Math.min(...sides)).toBeLessThan(1e-12);
        expect(Math.max(...spokes) - Math.min(...spokes)).toBeLessThan(1e-12);
        for (const side of sides) lengths.add(Math.round(side * 1e12) / 1e12);
      }
      expect(counts).toEqual(mix);
      expect(lengths.size, `${mode} edge lengths`).toBe(1);
      for (const p of positions.values()) {
        expect(Math.abs(Math.hypot(p[0], p[1], p[2]) - 1)).toBeLessThan(1e-12);
      }
    });

    it(`${mode} stays closed at every subdivision`, () => {
      // a point on an edge between a triangle and a square is named by two
      // different grids; if they disagreed the cells either side would
      // quietly stop being neighbours
      for (const frequency of base === "icosa" ? [1, 2] : [1, 2, 3, 4]) {
        const board = build(0, frequency);
        expect(board.mode).toBe(mode);
        expect(board.polygons.size).toBe(perFace * frequency ** 2);
        expect(eulerCharacteristic(board)).toBe(2);
        expect(boundaryComponents(board)).toBe(0);
      }
    });
  }
});
