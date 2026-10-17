// Port of minesweeper/boards/archimedean.py — the Archimedean solids cut into
// boards: the cuboctahedron, truncated octahedron and snub cube, and the
// rhombicosidodecahedron, truncated icosidodecahedron and snub dodecahedron. Structure and formulas are kept textually close to
// the Python so the two stay diffable; hashable tuple keys become canonical
// strings. See the Python module for the full derivation.
//
// Every Archimedean solid is the polar dual of a Catalan solid, and
// `catalanFaces` already builds those, so nothing here solves for a point
// again: each Catalan face becomes an Archimedean vertex (the pole of its
// plane, on the unit sphere, since every Catalan face sits at distance 1) and
// each Catalan vertex an Archimedean face (the poles of the faces around it).
// On the cube base `join` gives the cuboctahedron, `kis` the truncated
// octahedron and `gyro` the snub cube; on the icosahedron `ortho`, `meta` and
// `gyro` give the rhombicosidodecahedron, truncated icosidodecahedron and snub
// dodecahedron.
//
// Faces are then subdivided, `frequency` cuts along each edge being the one
// size knob: triangles through `triGrid`, squares through `quadGrid`, which name
// a shared edge's points the same way whatever lies on either side of it. A
// hexagon cannot be cut into hexagons, so the truncated octahedron's are cut
// into three rhombi first (`splitHexagons`, `thSpokes`); the icosahedral
// solids' pentagons, hexagons and decagons are fanned into triangles from their
// centres instead (`fanFaces`), which keeps every symmetry. `frequency = 0` is
// the solid uncut, one cell per face and no fan: the icosahedral three's easy
// rung, 62, 62 and 92 cells, where the first cut is already 110 to 270.
import { cid, cross, dot, tangentOrder, type Board3D, type Vec3 } from "./core";
import { Base, catalanFaces, quadGrid, triGrid, type Op } from "./catalan";
import { convexBoard3d, type Cells, type Positions } from "./solids";

/** One Archimedean solid as (faces, vertex positions): the polar dual of the
 * Catalan solid `op` makes of `base`. Face keys are the Catalan vertex keys and
 * vertex keys the Catalan face keys, so the two solids name each other's
 * pieces. */
export function archimedeanFaces(base: Base, op: Op): { faces: Cells; positions: Positions } {
  const catalan = catalanFaces(base, op);
  const positions: Positions = new Map();
  const around = new Map<string, string[]>();
  for (const [cell, ring] of catalan.faces) {
    const [a, b, c] = ring.slice(0, 3).map((k) => catalan.positions.get(k)!) as [Vec3, Vec3, Vec3];
    const normal = cross(
      [b[0] - a[0], b[1] - a[1], b[2] - a[2]],
      [c[0] - a[0], c[1] - a[1], c[2] - a[2]],
    );
    // the pole of the plane <x, n> = <a, n>
    const scale = dot(normal, a);
    positions.set(cell, [normal[0] / scale, normal[1] / scale, normal[2] / scale]);
    for (const key of ring) {
      const list = around.get(key);
      if (list) list.push(cell);
      else around.set(key, [cell]);
    }
  }
  const faces: Cells = new Map();
  for (const [key, cells] of around) {
    faces.set(
      key,
      tangentOrder(
        catalan.positions.get(key)!,
        cells.map((c) => [c, positions.get(c)!] as [string, Vec3]),
      ),
    );
  }
  return { faces, positions };
}

// -- the truncated octahedron's hexagons --------------------------------------

/** Which corners of a truncated-octahedron hexagon its rhombi meet at.
 *
 * Three rhombi through a hexagon's centre use every other corner as a spoke, so
 * they keep the mirrors through those corners and lose the ones through the
 * edge midpoints between them — on this solid, the cube's edge mirrors,
 * whatever the choice — so the most a cut keeps is 24 of the 48 symmetries.
 * This rule keeps the pyritohedral 24 (coordinate mirrors, inversion, 3-fold
 * turns) rather than the chiral 24.
 *
 * A corner is a `t,face,u,v` flag: a cube face normal to axis `a` and a cube
 * edge along axis `b`. It is a spoke when `b` follows `a` cyclically — sign
 * flips and 3-fold turns keep that, a quarter turn reverses it. */
function thSpokes(base: Base, hexagon: string[]): boolean[] {
  return hexagon.map((key) => {
    const [, fi, u, v] = key.split(",").map(Number) as [number, number, number, number];
    const dir = base.faceDirs[fi]!;
    let faceAxis = 0;
    for (let k = 1; k < 3; k++) if (Math.abs(dir[k]!) > Math.abs(dir[faceAxis]!)) faceAxis = k;
    const edgeAxis = [0, 1, 2].find(
      (k) => base.vertices[u]![k]! > 0 !== base.vertices[v]![k]! > 0,
    )!;
    return edgeAxis === (faceAxis + 1) % 3;
  });
}

/** Cut every hexagon into three rhombi through its own planar centre and the
 * corners `spokes(ring)` marks (every other one); leave the other faces alone.
 * The centre is the plain average of the corners, so the rhombi lie flat in the
 * hexagon's plane. */
function splitHexagons(
  faces: Cells,
  positions: Positions,
  spokes: (ring: string[]) => boolean[],
): { faces: Cells; positions: Positions } {
  const outCells: Cells = new Map();
  const outPos: Positions = new Map(positions);
  for (const [cell, ring] of faces) {
    if (ring.length !== 6) {
      outCells.set(cell, ring);
      continue;
    }
    const marks = spokes(ring);
    const start = marks.indexOf(true);
    if (!marks.every((m, i) => m === ((i - start + 6) % 2 === 0))) {
      throw new Error(`hexagon ${cell} spokes do not alternate`);
    }
    const centre = ["c", cell].join("|");
    const points = ring.map((k) => positions.get(k)!);
    outPos.set(centre, [0, 1, 2].map(
      (a) => points.reduce((sum, p) => sum + p[a]!, 0) / 6,
    ) as Vec3);
    for (let r = 0; r < 3; r++) {
      const i = start + 2 * r;
      outCells.set(cid(cell, r), [centre, ring[i % 6]!, ring[(i + 1) % 6]!, ring[(i + 2) % 6]!]);
    }
  }
  return { faces: outCells, positions: outPos };
}

// -- the icosahedral solids' big faces ------------------------------------------

/** Fan every face of more than four sides into triangles from its own planar
 * centre; leave triangles and squares alone. The centre is the plain average of
 * the corners, so the fan lies flat — the rule `solids.dodecahedron` fans a
 * dodecahedron's pentagons by — and keeps the face's whole dihedral symmetry. */
function fanFaces(faces: Cells, positions: Positions): { faces: Cells; positions: Positions } {
  const outCells: Cells = new Map();
  const outPos: Positions = new Map(positions);
  for (const [cell, ring] of faces) {
    if (ring.length <= 4) {
      outCells.set(cell, ring);
      continue;
    }
    const centre = ["c", cell].join("|");
    const points = ring.map((k) => positions.get(k)!);
    outPos.set(centre, [0, 1, 2].map(
      (a) => points.reduce((sum, p) => sum + p[a]!, 0) / ring.length,
    ) as Vec3);
    ring.forEach((key, i) => {
      outCells.set(cid(cell, i), [key, ring[(i + 1) % ring.length]!, centre]);
    });
  }
  return { faces: outCells, positions: outPos };
}

// -- subdivision --------------------------------------------------------------

/** Cut every triangle and quadrilateral `frequency` ways along each edge. The
 * two grids run on their own faces and are merged: a point on an edge a
 * triangle shares with a square comes out of both with the same id and the same
 * coordinates, so the merge is exact. */
function subdivideMixed(
  faces: Cells,
  positions: Positions,
  frequency: number,
): { faces: Cells; positions: Positions } {
  const bySides = new Map<number, Cells>();
  for (const [cell, ring] of faces) {
    let group = bySides.get(ring.length);
    if (!group) bySides.set(ring.length, (group = new Map()));
    group.set(cell, ring);
  }
  for (const sides of bySides.keys()) {
    if (sides !== 3 && sides !== 4) {
      throw new Error(`cannot subdivide faces with ${[...bySides.keys()].sort()} sides`);
    }
  }
  const cells: Cells = new Map();
  const outPos: Positions = new Map();
  for (const [sides, grid] of [[3, triGrid], [4, quadGrid]] as const) {
    const group = bySides.get(sides);
    if (!group) continue;
    const sub = grid(group, positions, frequency);
    for (const [cell, ring] of sub.faces) {
      cells.set(cell, ring);
      for (const k of ring) outPos.set(k, sub.positions.get(k)!);
    }
  }
  return { faces: cells, positions: outPos };
}

function archimedeanBoard(
  mode: string,
  op: Op,
  mineCount: number,
  frequency: number,
  baseKind = "cube",
): Board3D {
  if (frequency < 0) throw new Error("frequency must be at least 0");
  const base = new Base(baseKind);
  let { faces, positions } = archimedeanFaces(base, op);
  let sub: { faces: Cells; positions: Positions };
  if (frequency === 0) {
    // the bare solid, one cell per face: the icosahedral solids' easy rung
    sub = { faces, positions };
  } else {
    if (baseKind === "cube" && op === "kis") {
      ({ faces, positions } = splitHexagons(faces, positions, (ring) => thSpokes(base, ring)));
    }
    ({ faces, positions } = fanFaces(faces, positions));
    sub = subdivideMixed(faces, positions, frequency);
  }
  // the grids' keys nest a face key of whatever shape that face had; the cell
  // ids only have to be distinct
  const cells: Cells = new Map();
  let n = 0;
  for (const ring of sub.faces.values()) cells.set(cid("c", n++), ring);
  let radius = 0;
  for (const p of sub.positions.values()) radius = Math.max(radius, Math.hypot(p[0], p[1], p[2]));
  return convexBoard3d(mode, cells, sub.positions, mineCount, radius);
}

// -- the boards ----------------------------------------------------------------

/** A cuboctahedron: 8 triangles and 6 squares (3.4.3.4), the rectified cube
 * and the dual of the rhombic dodecahedron. Every face is cut `frequency**2`
 * ways, so `14 * frequency**2` cells. */
export function cuboctahedronBoard(mineCount: number, frequency = 4): Board3D {
  return archimedeanBoard("cubocta", "join", mineCount, frequency);
}

/** A truncated octahedron: 6 squares and 8 hexagons (4.6.6), the dual of the
 * tetrakis hexahedron and the one Archimedean solid that fills space. Each
 * hexagon is cut into three rhombi, and every quadrilateral then
 * `frequency**2` ways: `30 * frequency**2` cells. */
export function truncatedOctahedronBoard(mineCount: number, frequency = 3): Board3D {
  return archimedeanBoard("truncocta", "kis", mineCount, frequency);
}

/** A snub cube: 32 triangles and 6 squares (3.3.3.3.4), the dual of the
 * pentagonal icositetrahedron. Chiral — the octahedral rotations alone, no
 * mirror. Every face is cut `frequency**2` ways: `38 * frequency**2` cells. */
export function snubCubeBoard(mineCount: number, frequency = 2): Board3D {
  return archimedeanBoard("snubcube", "gyro", mineCount, frequency);
}

/** A rhombicosidodecahedron cut into a board: 20 triangles, 30 squares and 12
 * pentagons (3.4.5.4), each pentagon fanned into 5 triangles, then every face
 * cut `frequency**2` ways — `110 * frequency**2` cells, or the uncut solid's
 * 62 at `frequency = 0`. */
export function rhombicosidodecahedronSplitBoard(mineCount: number, frequency = 2): Board3D {
  return archimedeanBoard("rhombicosidodecasplit", "ortho", mineCount, frequency, "icosa");
}

/** A truncated icosidodecahedron cut into a board: 30 squares, 20 hexagons and
 * 12 decagons (4.6.10), the hexagons fanned into 6 triangles and the decagons
 * into 10, then every face cut `frequency**2` ways — `270 * frequency**2`
 * cells, or the uncut solid's 62 at `frequency = 0`. */
export function truncatedIcosidodecahedronSplitBoard(mineCount: number, frequency = 1): Board3D {
  return archimedeanBoard("truncicosidodecasplit", "meta", mineCount, frequency, "icosa");
}

/** A snub dodecahedron cut into a board: 80 triangles and 12 pentagons
 * (3.3.3.3.5), each pentagon fanned into 5 triangles, then every face cut
 * `frequency**2` ways — `140 * frequency**2` cells. Chiral, the icosahedral
 * rotations alone. `frequency = 0` is the uncut solid, 92 cells. */
export function snubDodecahedronSplitBoard(mineCount: number, frequency = 2): Board3D {
  return archimedeanBoard("snubdodecsplit", "gyro", mineCount, frequency, "icosa");
}
