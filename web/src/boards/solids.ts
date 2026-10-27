// Port of minesweeper/boards/solids.py — the closed 3D boards (sphere family,
// fullerenes, cube, tetrahedra, frames). Structure and formulas are kept
// textually close to the Python so the two stay diffable; hashable tuple keys
// become canonical strings. Trig/last-ulp drift is far below the 1e-6
// quantization the topology helpers use.
import { brickRingsTiles } from "./aperiodic";
import {
  cid,
  cross,
  dot,
  isBoard3D,
  newellNormal,
  normalize,
  orientOutward,
  sharedVertexAdjacency,
  solidBoard,
  tangentOrder,
  type Board3D,
  type CellId,
  type Vec3,
} from "./core";

export { isBoard3D };

const ROOT3 = Math.sqrt(3);

export type Positions = Map<string, Vec3>;
export type Cells = Map<CellId, string[]>;

function gcdAll(values: number[]): number {
  let g = 0;
  for (let v of values) {
    v = Math.abs(v);
    while (v) [g, v] = [v, g % v];
  }
  return g;
}

export function centroidOf(points: readonly Vec3[]): Vec3 {
  const c: Vec3 = [0, 0, 0];
  for (const p of points) {
    c[0] += p[0];
    c[1] += p[1];
    c[2] += p[2];
  }
  return [c[0] / points.length, c[1] / points.length, c[2] / points.length];
}

export interface VertexFaces {
  vertices: Vec3[];
  faces: [number, number, number][];
}

export function icosahedron(): VertexFaces {
  const phi = (1 + Math.sqrt(5)) / 2;
  const vertices: Vec3[] = [];
  for (const x of [-1, 1]) {
    for (const z of [-phi, phi]) {
      vertices.push([0, x, z], [x, z, 0], [z, 0, x]);
    }
  }
  // edges have squared length 4; faces are the 3-cliques of the edge graph
  const touching = (i: number, j: number): boolean => {
    const a = vertices[i]!;
    const b = vertices[j]!;
    const d = (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2;
    return Math.abs(d - 4) < 1e-9;
  };
  const faces: [number, number, number][] = [];
  for (let i = 0; i < 12; i++) {
    for (let j = i + 1; j < 12; j++) {
      if (!touching(i, j)) continue;
      for (let k = j + 1; k < 12; k++) {
        if (touching(i, k) && touching(j, k)) {
          // consistent winding: orient every face counterclockwise as seen
          // from outside
          const [a, b, c] = [vertices[i]!, vertices[j]!, vertices[k]!];
          const normal = newellNormal([a, b, c]);
          const outward =
            normal[0] * (a[0] + b[0] + c[0]) +
            normal[1] * (a[1] + b[1] + c[1]) +
            normal[2] * (a[2] + b[2] + c[2]);
          faces.push(outward > 0 ? [i, j, k] : [i, k, j]);
        }
      }
    }
  }
  if (faces.length !== 20) throw new Error("icosahedron faces != 20");
  return { vertices, faces };
}

/** A regular dodecahedron, already fanned into triangles: its 12 pentagonal
 * faces are the icosahedron's dual (a Platonic solid's face-centroid dual is
 * exactly its regular dual, since the symmetry group is transitive on both
 * faces and vertices, so every centroid lands the same distance out) — one
 * dodecahedron corner per icosahedron face, one dodecahedron pentagon per
 * icosahedron vertex, the five icosahedron faces around it. Each pentagon is
 * then split into 5 triangles fanned from its own planar centre (the plain
 * average of its 5 corners, *not* pushed back out to the corners' sphere,
 * which is what keeps the fan flat rather than tenting outward). The vertex
 * list is the 20 corners followed by the 12 fan centres; the face list is
 * 5*12 = 60 triangles. */
function dodecahedron(): VertexFaces {
  const { vertices: icoVertices, faces: icoFaces } = icosahedron();
  const corners = icoFaces.map((face) =>
    normalize(centroidOf(face.map((i) => icoVertices[i]!))),
  );
  const vertexFaces = new Map<number, number[]>();
  icoFaces.forEach((face, faceIndex) => {
    for (const v of face) {
      let ids = vertexFaces.get(v);
      if (!ids) vertexFaces.set(v, (ids = []));
      ids.push(faceIndex);
    }
  });

  const vertices: Vec3[] = [...corners];
  const faces: [number, number, number][] = [];
  for (const [v, faceIds] of vertexFaces) {
    const ordered = tangentOrder(
      icoVertices[v]!,
      faceIds.map((fi): [number, Vec3] => [fi, corners[fi]!]),
    );
    const pentagon = ordered.map((fi) => corners[fi]!);
    const center = centroidOf(pentagon);
    const centerIndex = vertices.length;
    vertices.push(center);
    for (let i = 0; i < 5; i++) {
      faces.push([centerIndex, ordered[i]!, ordered[(i + 1) % 5]!]);
    }
  }
  return { vertices, faces };
}

/** A regular octahedron: six vertices on the coordinate axes, the eight
 * faces one per octant (every choice of sign for each axis). */
function octahedron(): VertexFaces {
  const vertices: Vec3[] = [
    [1, 0, 0],
    [-1, 0, 0],
    [0, 1, 0],
    [0, -1, 0],
    [0, 0, 1],
    [0, 0, -1],
  ];
  const faces: [number, number, number][] = [];
  for (const ix of [0, 1]) {
    for (const iy of [2, 3]) {
      for (const iz of [4, 5]) {
        const [a, b, c] = [vertices[ix]!, vertices[iy]!, vertices[iz]!];
        const normal = newellNormal([a, b, c]);
        const outward =
          normal[0] * (a[0] + b[0] + c[0]) +
          normal[1] * (a[1] + b[1] + c[1]) +
          normal[2] * (a[2] + b[2] + c[2]);
        faces.push(outward > 0 ? [ix, iy, iz] : [ix, iz, iy]);
      }
    }
  }
  return { vertices, faces };
}

/** A regular tetrahedron: four vertices on alternate cube corners, the four
 * faces being the four vertex triples. Winding is arbitrary (each subdivided
 * cell is re-oriented outward on assembly). */
export function tetrahedron(): VertexFaces {
  const vertices: Vec3[] = [
    [1, 1, 1],
    [1, -1, -1],
    [-1, 1, -1],
    [-1, -1, 1],
  ];
  const faces: [number, number, number][] = [
    [1, 2, 3],
    [0, 2, 3],
    [0, 1, 3],
    [0, 1, 2],
  ];
  return { vertices, faces };
}

/** Assemble a closed convex board, orienting each polygon outward by its
 * centroid direction. Correct for any convex solid that contains the origin
 * (sphere, cube, tetrahedron): every surface point has a positive dot with
 * its face's outward normal. */
export function convexBoard3d(
  mode: string,
  cells: Cells,
  positions: Positions,
  mineCount: number,
  radius = 1,
): Board3D {
  const adjacency = sharedVertexAdjacency(cells);
  const polygons = new Map<CellId, Vec3[]>();
  for (const [cell, keys] of cells) {
    const polygon = keys.map((key) => positions.get(key)!);
    polygons.set(cell, orientOutward(polygon, centroidOf(polygon)));
  }
  return solidBoard({
    mode,
    polygons,
    adjacency,
    mineCount,
    radius,
    twoSided: false,
    clip: null,
    cornerMask: null,
  });
}

/** Mark a board as a regular tiling bent onto the sphere (see
 * `Board3D.regularTiles`). Set on the board rather than spread into a copy,
 * which would evaluate its lazy `symmetries`. */
function bentRegular(board: Board3D): Board3D {
  board.regularTiles = true;
  return board;
}

// -- 3D builders --------------------------------------------------------------

/** Subdivide each triangular face into `frequency**2` triangles. Defaults to
 * the icosahedron; `project` normalizes vertices onto the unit sphere (a
 * geodesic icosahedron), otherwise they stay on the flat faces (e.g. a
 * triangulated tetrahedron).
 *
 * Returns (positions, triangles). Vertex keys are gcd-normalized barycentric
 * weights over the corners, so vertices on shared edges match exactly across
 * faces. */
export function geodesic(
  frequency: number,
  base?: VertexFaces,
  project = true,
): { positions: Positions; triangles: string[][] } {
  const { vertices, faces } = base ?? icosahedron();
  const positions: Positions = new Map();
  const triangles: string[][] = [];
  for (const face of faces) {
    const corners = face.map((v) => vertices[v]!);

    const key = (i: number, j: number): string => {
      const weights = [frequency - i - j, i, j];
      const items: [number, number][] = [];
      for (let n = 0; n < 3; n++) {
        if (weights[n]! > 0) items.push([face[n]!, weights[n]!]);
      }
      const g = gcdAll(items.map(([, w]) => w));
      const vertexKey = items
        .map(([v, w]) => [v, w / g] as [number, number])
        .sort((a, b) => a[0] - b[0] || a[1] - b[1])
        .map(([v, w]) => `${v}:${w}`)
        .join("|");
      if (!positions.has(vertexKey)) {
        const point: Vec3 = [0, 1, 2].map(
          (axis) =>
            (weights[0]! * corners[0]![axis]! +
              weights[1]! * corners[1]![axis]! +
              weights[2]! * corners[2]![axis]!) /
            frequency,
        ) as Vec3;
        positions.set(vertexKey, project ? normalize(point) : point);
      }
      return vertexKey;
    };

    for (let i = 0; i < frequency; i++) {
      for (let j = 0; j < frequency - i; j++) {
        triangles.push([key(i, j), key(i + 1, j), key(i, j + 1)]);
        if (i + j < frequency - 1) {
          triangles.push([key(i + 1, j), key(i + 1, j + 1), key(i, j + 1)]);
        }
      }
    }
  }
  return { positions, triangles };
}

/** A class III geodesic icosahedron {3,5+}_{h,k}: the triangular lattice laid
 * over each face so the face's corners sit `h` steps along it, a 60-degree
 * left turn (seen from outside), then `k` more — `T = h*h + h*k + k*k` small
 * triangles a face. `geodesic` is the `k = 0` case, where the lattice runs
 * along the edges; with `k > 0` it runs across them and the subdivision is
 * chiral (`(k, h)` is its mirror image).
 *
 * Each face walks the lattice triangles whose centre lies strictly inside it,
 * so each triangle is taken exactly once. A centre can only land on an edge
 * when `h % 3 === k % 3` — class II, `(1, 1)`, `(2, 2)`, and the chiral
 * `(4, 1)` as well — so those are refused. A point is named by integer
 * barycentric weights over the face's corners, summing to `T`, gcd-normalised
 * as in `geodesic`. A triangle straddling an edge has one corner beyond it,
 * with one negative weight; that corner is renamed over the neighbouring face
 * across the edge, whose far corner D is A + B - C in the unfolded net, so the
 * weights stay integers and the key exact. With `gcd(h, k) == 1` no lattice
 * point but a corner lies on an edge; with `g = gcd(h, k) > 1` the edge is
 * cut `g` ways, and each of those points has a zero weight on the far corner
 * and the same two weights over the edge's ends from either face, so the two
 * faces name it alike. */
export function geodesicHK(
  h: number,
  k: number,
): { positions: Positions; triangles: string[][] } {
  if (k <= 0 || (h - k) % 3 === 0) throw new Error(`geodesicHK(${h}, ${k})`);
  const { vertices, faces } = icosahedron();
  const total = h * h + h * k + k * k;
  // directed edge -> the face's third corner
  const beyond = new Map<string, number>();
  for (const face of faces) {
    for (let i = 0; i < 3; i++) {
      beyond.set(`${face[i]},${face[(i + 1) % 3]}`, face[(i + 2) % 3]!);
    }
  }
  const positions: Positions = new Map();

  const key = (face: readonly number[], weights: readonly number[]): string => {
    let corners = [...face];
    let w = [...weights];
    const low = Math.min(...w);
    if (low < 0) {
      if (w.filter((x) => x < 0).length !== 1) throw new Error("two negative weights");
      const n = w.indexOf(low);
      // rotate the negative weight onto the third corner C
      corners = [...corners.slice(n + 1), ...corners.slice(0, n + 1)];
      w = [...w.slice(n + 1), ...w.slice(0, n + 1)];
      const [a, b] = corners as [number, number, number];
      const [wa, wb, wc] = w as [number, number, number];
      corners = [a, b, beyond.get(`${b},${a}`)!];
      w = [wa + wc, wb + wc, -wc];
    }
    const items: [number, number][] = [];
    for (let n = 0; n < 3; n++) {
      if (w[n]! > 0) items.push([corners[n]!, w[n]!]);
    }
    const g = gcdAll(items.map(([, x]) => x));
    const vertexKey = items
      .map(([v, x]) => [v, x / g] as [number, number])
      .sort((p, q) => p[0] - q[0] || p[1] - q[1])
      .map(([v, x]) => `${v}:${x}`)
      .join("|");
    if (!positions.has(vertexKey)) {
      const point = [0, 1, 2].map(
        (axis) =>
          (w[0]! * vertices[corners[0]!]![axis]! +
            w[1]! * vertices[corners[1]!]![axis]! +
            w[2]! * vertices[corners[2]!]![axis]!) /
          total,
      ) as Vec3;
      positions.set(vertexKey, normalize(point));
    }
    return vertexKey;
  };

  // lattice point i*e1 + j*e2 (e2 = e1 turned 60 degrees left) over the
  // corners A = 0, B = (h, k), C = B turned 60 degrees = (-k, h + k)
  const weightsAt = (i: number, j: number): [number, number, number] => {
    const b = i * (h + k) + j * k;
    const c = j * h - i * k;
    return [total - b - c, b, c];
  };

  const triangles: string[][] = [];
  const reach = h + k;
  for (const face of faces) {
    for (let i = -reach; i <= 2 * reach; i++) {
      for (let j = -reach; j <= 2 * reach; j++) {
        const pair: [number, number][][] = [
          [[i, j], [i + 1, j], [i, j + 1]],
          [[i + 1, j], [i + 1, j + 1], [i, j + 1]],
        ];
        for (const tri of pair) {
          const cornerWeights = tri.map(([p, q]) => weightsAt(p, q));
          const centre = [0, 1, 2].map((n) =>
            cornerWeights.reduce((sum, cw) => sum + cw[n]!, 0),
          );
          if (Math.min(...centre) > 0) {
            triangles.push(cornerWeights.map((cw) => key(face, cw)));
          }
        }
      }
    }
  }
  if (triangles.length !== 20 * total) throw new Error("geodesicHK triangle count");
  return { positions, triangles };
}

/** One cell per geodesic vertex, made of the surrounding triangle centers. */
function goldbergDual(
  mode: string,
  positions: Positions,
  triangles: string[][],
  mineCount: number,
): Board3D {
  const centers: Positions = new Map();
  const around = new Map<string, string[]>();
  for (const triangle of triangles) {
    const triangleId = [...triangle].sort().join(";");
    centers.set(
      triangleId,
      normalize(centroidOf(triangle.map((k) => positions.get(k)!))),
    );
    for (const key of triangle) {
      let ids = around.get(key);
      if (!ids) around.set(key, (ids = []));
      ids.push(triangleId);
    }
  }
  const cells: Cells = new Map();
  for (const [key, triangleIds] of around) {
    const ring: [string, Vec3][] = triangleIds.map((tid) => [
      tid,
      centers.get(tid)!,
    ]);
    cells.set(key, tangentOrder(positions.get(key)!, ring));
  }
  return bentRegular(convexBoard3d(mode, cells, centers, mineCount));
}

/** The dual of a geodesic icosahedron, Goldberg GP(frequency, 0): always 12
 * pentagons plus `10 * frequency**2 - 10` hexagons. */
function goldbergBoard(
  mode: string,
  frequency: number,
  mineCount: number,
): Board3D {
  const { positions, triangles } = geodesic(frequency);
  return goldbergDual(mode, positions, triangles, mineCount);
}

/** The class I Goldberg polyhedron GP(frequency, 0), projected onto the unit
 * sphere: 12 pentagons and `10 * frequency**2 - 10` hexagons. The default is
 * GP(3,0), the C180 fullerene (92 cells) the mode is named after; `frequency`
 * is the board's size knob. */
export function c180Board(mineCount: number, frequency = 3): Board3D {
  return goldbergBoard("c180", frequency, mineCount);
}

/** The class III Goldberg polyhedron GP(h, k), projected onto the unit sphere:
 * `10 * T + 2` cells for `T = h*h + h*k + k*k`, always 12 of them pentagons.
 * The dual of the class III geodesic icosahedron (`geodesicHK`). Chiral —
 * GP(k, h) is its mirror image — so of the icosahedron's symmetries it keeps
 * the 60 rotations only. The default is GP(2,1), the C140 fullerene (72 cells)
 * the mode is named after, whose 60 hexagons are a single orbit, each touching
 * one pentagon; `(h, k)` is the board's size knob. */
export function gp21Board(mineCount: number, h = 2, k = 1): Board3D {
  const { positions, triangles } = geodesicHK(h, k);
  return goldbergDual("gp21", positions, triangles, mineCount);
}

/** A sphere tiled with triangles: a geodesic icosahedron with
 * `20 * frequency**2` triangular cells — `icosahedronBoard`'s subdivision
 * projected onto the unit sphere, so the same graph drawn round. `frequency`
 * is the board's size knob. */
export function sphereTriangleBoard(mineCount: number, frequency = 2): Board3D {
  const { positions, triangles } = geodesic(frequency);
  const cells: Cells = new Map();
  triangles.forEach((triangle, n) => cells.set(cid("t", n), [...triangle]));
  return bentRegular(convexBoard3d("spheretri", cells, positions, mineCount));
}

/** The cube of `n x n` faces a side, drawn round: `sphereCells` maps each of
 * its `6 * n**2` squares to its corner keys, which are the cube's integer
 * lattice points on `[-n, n]**3` (as `cubeBoard`), so the antipode is plain
 * negation (surfaces.ts `negateKey`). `positions` places each by the
 * *equiangular* cube map (every coordinate through `tan(π/4 · c)`, then onto
 * the unit sphere), which keeps the squares near the cube's corners from
 * shrinking the way a straight projection does. Shared by the spherical cube
 * (`sphereSquareBoard`) and by its antipodal quotient, the projective plane,
 * and Boy's surface, which draw that quotient two ways. */
export function cubedSphere(n: number): { sphereCells: Cells; positions: Positions } {
  const sphereCells: Cells = new Map();
  const positions: Positions = new Map();
  for (let axis = 0; axis < 3; axis++) {
    const [uAxis, vAxis] = [0, 1, 2].filter((a) => a !== axis) as [number, number];
    for (const sign of [-1, 1]) {
      for (let i = 0; i < n; i++) {
        for (let j = 0; j < n; j++) {
          const keys: string[] = [];
          for (const [du, dv] of [
            [0, 0],
            [1, 0],
            [1, 1],
            [0, 1],
          ] as const) {
            const coord: Vec3 = [0, 0, 0];
            coord[axis] = sign * n;
            coord[uAxis] = -n + 2 * (i + du);
            coord[vAxis] = -n + 2 * (j + dv);
            const key = cid(...coord);
            keys.push(key);
            if (!positions.has(key)) {
              const square = coord.map((c) => Math.tan(((Math.PI / 4) * c) / n)) as Vec3;
              positions.set(key, normalize(square));
            }
          }
          sphereCells.set([...keys].sort().join(";"), keys);
        }
      }
    }
  }
  return { sphereCells, positions };
}

/** A sphere tiled with squares: the spherical cube, `6 * n**2` square cells —
 * `cubeBoard`'s grid on the same lattice keys, put on the sphere by the
 * equiangular cube map (`cubedSphere`), so the same graph drawn round. `n`, the squares
 * along a cube edge, is the board's size knob. */
export function sphereSquareBoard(mineCount: number, n = 4): Board3D {
  const { sphereCells, positions } = cubedSphere(n);
  return bentRegular(convexBoard3d("spheresquare", sphereCells, positions, mineCount));
}

/** One of a flag's three mirrors, named by the corner opposite it. */
export type Mirror = "v" | "e" | "f";

/** The Wythoff generating point of a Schwarz triangle: given one "flag" (a
 * mutually incident vertex, edge and face)'s three axis directions — `vDir`
 * the vertex axis, `eDir` its edge's midpoint, `fDir` its face's centroid, the
 * three corners of a fundamental (Schwarz) triangle whose sides are the
 * group's mirror planes — the point lying *on* the mirrors named by `zero` and
 * at *equal* distances from those named by `equal`.
 *
 * Reflecting it through the group's symmetries generates a uniform polyhedron
 * with every edge the same length by construction: unlike rectifying a solid
 * and then truncating the result (a sequential approximation that, no matter
 * how the two steps are tuned, cannot make all of its face shapes regular at
 * once), this always lands on the exact Archimedean solid, because a flag's
 * three mirrors are just three planes through the origin and both constraint
 * kinds are linear in the point. Two constraints, so the answer is one cross
 * product.
 *
 * `catalan.ts` reads every non-chiral Conway operation off this;
 * `equal=["v","e","f"]` — equidistant from all three — is the omnitruncation
 * (the truncated icosidodecahedron, on the icosahedron). */
export function wythoffPoint(
  vDir: Vec3,
  eDir: Vec3,
  fDir: Vec3,
  zero: Mirror[] = [],
  equal: Mirror[] = [],
): Vec3 {
  const v = normalize(vDir);
  const e = normalize(eDir);
  const f = normalize(fDir);
  const mirrorNormal = (a: Vec3, b: Vec3, toward: Vec3): Vec3 => {
    const n = normalize(cross(a, b));
    return dot(n, toward) >= 0 ? n : [-n[0], -n[1], -n[2]];
  };
  // the mirror opposite each corner is the plane through the other two
  const n: Record<Mirror, Vec3> = {
    v: mirrorNormal(e, f, v),
    e: mirrorNormal(f, v, e),
    f: mirrorNormal(v, e, f),
  };
  const rows: Vec3[] = zero.map((c) => n[c]);
  for (let i = 0; i + 1 < equal.length; i++) {
    const a = n[equal[i]!];
    const b = n[equal[i + 1]!];
    rows.push([a[0] - b[0], a[1] - b[1], a[2] - b[2]]);
  }
  if (rows.length !== 2) throw new Error("a Wythoff point needs two constraints");
  let p = normalize(cross(rows[0]!, rows[1]!));
  if (dot(p, v) + dot(p, e) + dot(p, f) < 0) p = [-p[0], -p[1], -p[2]];
  return p;
}

/** A cube surface tiled with `6 * n**2` squares: each face an n x n grid.
 * Vertices are integer points on `[-n, n]**3` (a surface vertex has one axis
 * at +-n; the grid lines step by 2), so cells on adjacent faces sharing a
 * cube edge or corner become neighbors automatically. */
export function cubeBoard(n: number, mineCount: number): Board3D {
  const cells: Cells = new Map();
  const positions: Positions = new Map();
  for (let axis = 0; axis < 3; axis++) {
    const [uAxis, vAxis] = [0, 1, 2].filter((a) => a !== axis) as [
      number,
      number,
    ];
    for (const sign of [-1, 1]) {
      for (let i = 0; i < n; i++) {
        for (let j = 0; j < n; j++) {
          const keys: string[] = [];
          for (const [du, dv] of [
            [0, 0],
            [1, 0],
            [1, 1],
            [0, 1],
          ] as const) {
            const coord: [number, number, number] = [0, 0, 0];
            coord[axis] = sign * n;
            coord[uAxis] = -n + 2 * (i + du);
            coord[vAxis] = -n + 2 * (j + dv);
            const key = cid(...coord);
            keys.push(key);
            if (!positions.has(key)) {
              positions.set(key, [coord[0] / n, coord[1] / n, coord[2] / n]);
            }
          }
          cells.set(cid(axis, sign, i, j), keys);
        }
      }
    }
  }
  return convexBoard3d("cube", cells, positions, mineCount, ROOT3);
}

// -- brick-bond cubes -------------------------------------------------------
//
// Three of the five congruent-rectangle bonds (boards/tilings.ts, family
// "rectangle") lay on a cube, and they are exactly the three whose fundamental
// block is a *square*: the stacked bond is two 1x1/2 bricks stacked, the basket
// weave two laid one way or the other in a checkerboard, and the three-brick
// weave three 1x1/3 bricks the same way. The running bond's block is offset
// half a brick and the herringbone's is a diagonal, so neither fills a square
// face.
//
// The brick rings (`aperiodic.ts`) lay on one too, by a different route: they
// have no block at all, but n rings fill a 2n x 2n square exactly, and a cube
// face is a square. So that cube's faces are each the flat board, whole.

const BRICK_BLOCK = 6; // lattice units per block: divisible by 2 and by 3

/** bond -> [bricks per block, whether the block turns on a checkerboard]. */
export const BRICK_BONDS: Record<string, [number, boolean]> = {
  stackedbond: [2, false],
  basketweave: [2, true],
  basketweave3: [3, true],
};

/** The one brick pattern a cube also takes that is not a bond: no block, the
 * whole face is the flat board's concentric rings (`brickCubeBoard`). */
export const BRICK_RINGS = "brickrings";

/** One block's bricks as `[u0, v0, u1, v1]` in block-local units: `count`
 * courses laid across the block, or turned a quarter-turn. */
function brickCourses(
  count: number,
  turned: boolean,
): [number, number, number, number][] {
  const step = BRICK_BLOCK / count;
  const out: [number, number, number, number][] = [];
  for (let k = 0; k < count; k++) {
    out.push(
      turned
        ? [k * step, 0, (k + 1) * step, BRICK_BLOCK]
        : [0, k * step, BRICK_BLOCK, (k + 1) * step],
    );
  }
  return out;
}

/** One face's bricks as `[suffix, [u0, v0, u1, v1]]`, in lattice units from
 * the face's `(-half, -half)` corner; `suffix` ends the cell id (port of
 * `_face_bricks`).
 *
 * A bond's face is an n x n grid of blocks, each cut into the bond's bricks
 * (and, for the weaves, turned on a checkerboard `phase` shifts). The brick
 * rings' face is the flat board's `n` rings, its rows along u. */
function faceBricks(
  bond: string,
  n: number,
  phase: number,
): [number[], [number, number, number, number]][] {
  const out: [number[], [number, number, number, number]][] = [];
  if (bond === BRICK_RINGS) {
    brickRingsTiles(n).forEach(([x, y, w, h], b) => {
      out.push([[b], [x + n, y + n, x + n + w, y + n + h]]);
    });
    return out;
  }
  const [count, checkered] = BRICK_BONDS[bond]!;
  const block = BRICK_BLOCK;
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      const turned = checkered && (i + j + phase) % 2 === 1;
      brickCourses(count, turned).forEach(([u0, v0, u1, v1], b) => {
        out.push([
          [i, j, b],
          [i * block + u0, j * block + v0, i * block + u1, j * block + v1],
        ]);
      });
    }
  }
  return out;
}

/** Insert every vertex that lies *inside* another cell's edge into that edge —
 * the 3D twin of `insertTVertices` in tilings.ts.
 *
 * A brick cube needs it twice over. Within a face the weaves are not edge to
 * edge: a course's end abuts the middle of the turned brick beside it. And at
 * the twelve cube edges the two faces subdivide the shared line differently,
 * because a face's bricks run along one of its two directions and no choice of
 * directions makes all twelve agree. Recorded as a vertex of the brick whose
 * edge it splits, the point is collinear — the drawn rectangle is unchanged —
 * but the two bricks now share a vertex id, which is what
 * `sharedVertexAdjacency` runs on and what makes the mesh close: without it the
 * Euler characteristic is not 2 and a cube edge counts as a boundary.
 *
 * Vertices are integer triples and every brick edge is axis-aligned, so this is
 * exact integer arithmetic with no tolerance to get wrong. */
function splitAtLatticePoints(
  cells: Map<string, Vec3[]>,
): Map<string, Vec3[]> {
  const vertices = new Set<string>();
  for (const keys of cells.values()) {
    for (const key of keys) vertices.add(cid(...key));
  }
  const out = new Map<string, Vec3[]>();
  for (const [cell, keys] of cells) {
    const split: Vec3[] = [];
    for (let i = 0; i < keys.length; i++) {
      const a = keys[i]!;
      const b = keys[(i + 1) % keys.length]!;
      split.push(a);
      const delta = [b[0] - a[0], b[1] - a[1], b[2] - a[2]] as Vec3;
      const steps = Math.max(...delta.map(Math.abs));
      const unit = delta.map((d) => d / steps) as Vec3;
      for (let s = 1; s < steps; s++) {
        const point: Vec3 = [
          a[0] + unit[0] * s,
          a[1] + unit[1] * s,
          a[2] + unit[2] * s,
        ];
        if (vertices.has(cid(...point))) split.push(point);
      }
    }
    out.set(cell, split);
  }
  return out;
}

/** A cube surface tiled with one congruent rectangle: each face an n x n grid
 * of square blocks, each block cut into the bond's bricks, so the board is
 * `6 * bricks * n**2` cells (12 n**2 for the two-brick bonds, 18 n**2 for the
 * three-brick weave).
 *
 * `bond` may also be `BRICK_RINGS`, and then `n` counts rings: each face is the
 * flat brick-rings board of `n` rings, 2n bricks long a side, so the board is
 * `12 n**2` 2x1 bricks with every face's rings about its own centre.
 *
 * Vertices are integer points on `[-N, N]**3` where `N = 3n` (a surface vertex
 * has one axis at +-N; a block is 6 units, so a half- and a third-split both
 * land on the lattice) — `N = n` for the rings, whose bricks are whole lattice
 * units already — which is what lets bricks meeting at a cube edge or corner
 * share a vertex id and become neighbors.
 *
 * A face's bricks run along the first of its two axes taken cyclically (x-face
 * -> y, y-face -> z, z-face -> x), so the six faces are related by the cube's
 * own rotations rather than one face being laid out differently from the rest.
 * That leaves the bond broken at some of the twelve edges — a brick cannot run
 * round a corner — and `splitAtLatticePoints` is what stitches the mesh back
 * together across the break. The rings break at every one of the twelve: a
 * face's outer ring cuts its row edges (along u) at even steps from the corner
 * and its side edges (along v) at odd ones, and the cyclic rule makes each cube
 * edge one face's u and the other face's v, so the two cuts never line up. */
export function brickCubeBoard(
  bond: string,
  n: number,
  mineCount: number,
): Board3D {
  if (bond !== BRICK_RINGS && !BRICK_BONDS[bond]) {
    throw new Error(`unknown brick bond: ${bond}`);
  }
  if (n < 1) throw new Error("need at least one block per face side");
  const half = bond === BRICK_RINGS ? n : (n * BRICK_BLOCK) / 2;

  let cells = new Map<string, Vec3[]>();
  for (let axis = 0; axis < 3; axis++) {
    const uAxis = (axis + 1) % 3;
    const vAxis = (axis + 2) % 3;
    for (const sign of [-1, 1]) {
      // A weave's quarter-turn centres are its block *corners*, and a face
      // centre is one only when n is even. So for even n the checkerboard has
      // to be flipped on the three negative faces, or the two halves of the
      // cube carry the pattern in opposite phase where they meet: measured,
      // that costs an even-n weave cube all but 6 of its 24 rotations and fans
      // its neighbour counts out from two classes into four (a 6-cell class of
      // degree 5 appears, one per face). Flipped, every size of every bond
      // keeps a symmetry group of order 24 — the full rotation group for even
      // n, and the 12 rotations plus inversion the odd sizes already had.
      const phase = n % 2 === 0 && sign < 0 ? 1 : 0;
      for (const [suffix, [u0, v0, u1, v1]] of faceBricks(bond, n, phase)) {
        const keys: Vec3[] = [];
        for (const [u, v] of [
          [u0, v0],
          [u1, v0],
          [u1, v1],
          [u0, v1],
        ] as const) {
          const coord: Vec3 = [0, 0, 0];
          coord[axis] = sign * half;
          coord[uAxis] = -half + u;
          coord[vAxis] = -half + v;
          keys.push(coord);
        }
        cells.set(cid(axis, sign, ...suffix), keys);
      }
    }
  }

  cells = splitAtLatticePoints(cells);
  const keyed: Cells = new Map();
  const positions: Positions = new Map();
  for (const [cell, keys] of cells) {
    keyed.set(
      cell,
      keys.map((key) => {
        const id = cid(...key);
        if (!positions.has(id)) {
          positions.set(id, [key[0] / half, key[1] / half, key[2] / half]);
        }
        return id;
      }),
    );
  }
  return convexBoard3d("cube" + bond, keyed, positions, mineCount, ROOT3);
}

/** The boundary of a polycube (a union of axis-aligned unit cubes), tiled by
 * unit squares. `solid(i, j, k)` says whether the unit cube at integer
 * indices is filled; `extent` is the `(nx, ny, nz)` bounding box. Cubes are
 * scaled uniformly and centered in `[-1, 1]`.
 *
 * A unit square is a cell exactly when it separates a filled cube from empty
 * space, and it is wound so its normal points outward (out of the filled
 * cube) — which, unlike the centroid rule `convexBoard3d` uses, is also
 * correct for the concave step shoulders and inner walls these solids have.
 * Vertices are the integer lattice points, so faces meeting at an edge or
 * corner share vertex ids and become neighbors. */
function polycubeSurface(
  mode: string,
  solid: (i: number, j: number, k: number) => boolean,
  extent: [number, number, number],
  mineCount: number,
): Board3D {
  const [nx, ny, nz] = extent;
  const center: Vec3 = [nx / 2, ny / 2, nz / 2];
  const scale = 2 / Math.max(nx, ny, nz);

  const position = (p: readonly number[]): Vec3 => [
    (p[0]! - center[0]) * scale,
    (p[1]! - center[1]) * scale,
    (p[2]! - center[2]) * scale,
  ];

  const filled = (i: number, j: number, k: number): boolean =>
    i >= 0 && i < nx && j >= 0 && j < ny && k >= 0 && k < nz && solid(i, j, k);

  const cells: Cells = new Map();
  const positions: Positions = new Map();
  for (let i = 0; i < nx; i++) {
    for (let j = 0; j < ny; j++) {
      for (let k = 0; k < nz; k++) {
        if (!solid(i, j, k)) continue;
        for (let axis = 0; axis < 3; axis++) {
          for (const sign of [-1, 1]) {
            const step = [0, 0, 0];
            step[axis] = sign;
            if (filled(i + step[0]!, j + step[1]!, k + step[2]!)) {
              continue; // interior face, not on the boundary
            }
            const base = [i, j, k];
            if (sign > 0) base[axis]! += 1; // the far face of the cube
            const [uAxis, vAxis] = [0, 1, 2].filter((a) => a !== axis) as [
              number,
              number,
            ];
            let corners: number[][] = [];
            for (const [du, dv] of [
              [0, 0],
              [1, 0],
              [1, 1],
              [0, 1],
            ] as const) {
              const p = [...base];
              p[uAxis]! += du;
              p[vAxis]! += dv;
              corners.push(p);
            }
            const outward: Vec3 = [0, 0, 0];
            outward[axis] = sign;
            const pts = corners.map(position);
            if (dot(newellNormal(pts), outward) <= 0) {
              corners = corners.reverse();
            }
            const keys: string[] = [];
            for (const p of corners) {
              const key = cid(...(p as [number, number, number]));
              keys.push(key);
              if (!positions.has(key)) positions.set(key, position(p));
            }
            cells.set(cid(i, j, k, axis, sign), keys);
          }
        }
      }
    }
  }
  let radius = 0;
  for (const p of positions.values()) {
    radius = Math.max(radius, Math.hypot(p[0], p[1], p[2]));
  }
  // Closed but non-convex: each cell is already wound outward by the builder
  // (its outward normal is known from which cube face it is), so — unlike
  // convexBoard3d — orientation is not inferred from the centroid direction,
  // which is wrong for the inward-facing tunnel walls.
  const adjacency = sharedVertexAdjacency(cells);
  const polygons = new Map<CellId, Vec3[]>();
  for (const [cell, keys] of cells) {
    polygons.set(
      cell,
      keys.map((key) => positions.get(key)!),
    );
  }
  return solidBoard({
    mode,
    polygons,
    adjacency,
    mineCount,
    radius,
    twoSided: false,
    clip: null,
    cornerMask: null,
  });
}

/** The surface of a cube frame (a level-1 Menger sponge): an `n x n x n`
 * stack of unit cubes with an `(n - 2*thickness)` cube bored out of the
 * middle of each face, meeting in a hollow centre. What is left are the
 * twelve edge bars plus eight corners — a genus-5 solid whose whole boundary
 * is tiled by unit squares.
 *
 * A unit cube is kept when at least two of its three coordinates lie in the
 * outer band (within `thickness` of a face). */
export function cubeFrameBoard(
  n: number,
  thickness: number,
  mineCount: number,
): Board3D {
  if (!(thickness >= 1 && 2 * thickness < n)) {
    throw new Error("thickness must be >= 1 and leave a non-empty hole");
  }
  const outer = (c: number): boolean => c < thickness || c >= n - thickness;
  const solid = (i: number, j: number, k: number): boolean =>
    Number(outer(i)) + Number(outer(j)) + Number(outer(k)) >= 2;
  return polycubeSurface("cubeframe", solid, [n, n, n], mineCount);
}

/** A stepped bipyramid: a stepped pyramid of square terraces stitched
 * base-to-base with its z-mirror image (the shared biggest terrace kept only
 * once). Square layer `d` steps from the middle has side `base - 2*d`, so
 * the solid is widest at the equator and tapers to a small square top and
 * bottom — a terraced diamond whose staircase surface (concave at every
 * shoulder) is tiled by unit squares.
 *
 * `levels` counts the terraces of one pyramid; the apex square has side
 * `base - 2*(levels - 1)` and the whole stack is `2*levels - 1` layers
 * tall. */
export function steppedBipyramidBoard(
  base: number,
  levels: number,
  mineCount: number,
): Board3D {
  if (!(levels >= 2 && base - 2 * (levels - 1) >= 1)) {
    throw new Error("need levels >= 2 and a positive apex square");
  }
  const height = 2 * levels - 1;
  const middle = levels - 1; // the z-index of the biggest (equator) terrace
  const solid = (i: number, j: number, k: number): boolean => {
    const margin = Math.abs(k - middle); // each step in shrinks by 1
    return margin <= i && i < base - margin && margin <= j && j < base - margin;
  };
  return polycubeSurface(
    "steppedbipyramid",
    solid,
    [base, base, height],
    mineCount,
  );
}

/** A single stepped pyramid (a Mesoamerican-style ziggurat): square terraces
 * stepping in from a full `base` x `base` foundation to a
 * `base - 2*(levels - 1)` apex. Unlike `steppedBipyramidBoard` — one of these
 * mirrored base-to-base, so the shared foundation square sits inside the
 * solid — there is nothing below layer 0 here, so the foundation is itself
 * on the boundary and, like every terrace step and side wall, a playable
 * cell. */
export function steppedPyramidBoard(
  base: number,
  levels: number,
  mineCount: number,
): Board3D {
  if (!(levels >= 2 && base - 2 * (levels - 1) >= 1)) {
    throw new Error("need levels >= 2 and a positive apex square");
  }
  const solid = (i: number, j: number, k: number): boolean => {
    const margin = k; // each step up from the foundation shrinks by 1
    return margin <= i && i < base - margin && margin <= j && j < base - margin;
  };
  return polycubeSurface("steppedpyramid", solid, [base, base, levels], mineCount);
}

/** A regular tetrahedron tiled with triangles: each of the 4 faces
 * subdivided into `frequency**2` cells, kept flat on the faces. */
export function tetrahedronBoard(mineCount: number, frequency = 4): Board3D {
  const { positions, triangles } = geodesic(frequency, tetrahedron(), false);
  const cells: Cells = new Map();
  triangles.forEach((triangle, n) => cells.set(cid("t", n), [...triangle]));
  let radius = 0;
  for (const p of positions.values()) {
    radius = Math.max(radius, Math.hypot(p[0], p[1], p[2]));
  }
  return convexBoard3d("tetrahedron", cells, positions, mineCount, radius);
}

/** A regular octahedron tiled with triangles: each of the 8 faces
 * subdivided into `frequency**2` cells, kept flat on the faces (the same
 * flat, non-projected subdivision `tetrahedronBoard` uses). */
export function octahedronBoard(mineCount: number, frequency = 3): Board3D {
  const { positions, triangles } = geodesic(frequency, octahedron(), false);
  const cells: Cells = new Map();
  triangles.forEach((triangle, n) => cells.set(cid("t", n), [...triangle]));
  let radius = 0;
  for (const p of positions.values()) {
    radius = Math.max(radius, Math.hypot(p[0], p[1], p[2]));
  }
  return convexBoard3d("octahedron", cells, positions, mineCount, radius);
}

/** A regular icosahedron tiled with triangles: each of the 20 faces
 * subdivided into `frequency**2` cells, kept flat on the faces — unlike
 * `sphereTriangleBoard`, which projects the same subdivision onto the unit
 * sphere, this keeps the solid's flat facets (and their creased edges)
 * intact. */
export function icosahedronBoard(mineCount: number, frequency = 2): Board3D {
  const { positions, triangles } = geodesic(frequency, icosahedron(), false);
  const cells: Cells = new Map();
  triangles.forEach((triangle, n) => cells.set(cid("t", n), [...triangle]));
  let radius = 0;
  for (const p of positions.values()) {
    radius = Math.max(radius, Math.hypot(p[0], p[1], p[2]));
  }
  return convexBoard3d("icosahedron", cells, positions, mineCount, radius);
}

/** A regular dodecahedron tiled with triangles: each of its 12 pentagonal
 * faces fanned from its own centre into 5 triangles — `frequency=1` is
 * exactly that fan, 60 cells — and each of those 60 wedges further
 * subdivided into `frequency**2` flat triangles for the larger
 * difficulties, the same flat, non-projected subdivision the other Platonic
 * solids use. A regular pentagon is not equilateral like the other Platonic
 * faces, so its wedges are the one facet here that stay a little off-square
 * (72-54-54 triangles) at any frequency. */
export function dodecahedronBoard(mineCount: number, frequency = 1): Board3D {
  const { positions, triangles } = geodesic(frequency, dodecahedron(), false);
  const cells: Cells = new Map();
  triangles.forEach((triangle, n) => cells.set(cid("t", n), [...triangle]));
  let radius = 0;
  for (const p of positions.values()) {
    radius = Math.max(radius, Math.hypot(p[0], p[1], p[2]));
  }
  return convexBoard3d("dodecahedron", cells, positions, mineCount, radius);
}

/** A level-1 Sierpiński tetrahedron: midpoint-subdividing a regular
 * tetrahedron splits it into four corner sub-tetrahedra plus a central
 * octahedron, and the octahedron is carved out. What is left are the four
 * half-scale corner tetrahedra, meeting only at the six edge-midpoints of
 * the original — so on each original face the middle triangle is gone. Each
 * sub-tetrahedron face is subdivided into `frequency**2` flat triangles.
 *
 * Non-convex (the inward faces point toward the hollow centre), so unlike
 * `tetrahedronBoard` each triangle is oriented outward from its own
 * sub-tetrahedron's centroid rather than the origin. */
export function tetrahedronFrameBoard(
  mineCount: number,
  frequency = 4,
): Board3D {
  const { vertices: base } = tetrahedron();
  // Ten shared points: the 4 original corners, then the 6 edge midpoints.
  // A single global vertex list keeps the midpoints' subdivision keys
  // identical across the two sub-tetrahedra that meet at them.
  const verts: Vec3[] = [...base];
  const midIndex = new Map<string, number>();
  for (let a = 0; a < 4; a++) {
    for (let b = a + 1; b < 4; b++) {
      midIndex.set(`${a},${b}`, verts.length);
      verts.push([
        (base[a]![0] + base[b]![0]) / 2,
        (base[a]![1] + base[b]![1]) / 2,
        (base[a]![2] + base[b]![2]) / 2,
      ]);
    }
  }

  const cells: Cells = new Map();
  const positions: Positions = new Map();
  const centroids = new Map<CellId, Vec3>();
  for (let corner = 0; corner < 4; corner++) {
    const others = [0, 1, 2, 3].filter((j) => j !== corner);
    const tet = [
      corner,
      ...others.map((j) => midIndex.get(`${Math.min(corner, j)},${Math.max(corner, j)}`)!),
    ];
    const centroid = centroidOf(tet.map((v) => verts[v]!));
    const faces: [number, number, number][] = [
      [tet[1]!, tet[2]!, tet[3]!],
      [tet[0]!, tet[2]!, tet[3]!],
      [tet[0]!, tet[1]!, tet[3]!],
      [tet[0]!, tet[1]!, tet[2]!],
    ];
    const { positions: pos, triangles } = geodesic(
      frequency,
      { vertices: verts, faces },
      false,
    );
    for (const [k, v] of pos) positions.set(k, v);
    triangles.forEach((triangle, n) => {
      const cell = cid(corner, n);
      cells.set(cell, [...triangle]);
      centroids.set(cell, centroid);
    });
  }

  const adjacency = sharedVertexAdjacency(cells);
  const polygons = new Map<CellId, Vec3[]>();
  for (const [cell, keys] of cells) {
    const polygon = keys.map((key) => positions.get(key)!);
    const faceCentroid = centroidOf(polygon);
    const cc = centroids.get(cell)!;
    const outward: Vec3 = [
      faceCentroid[0] - cc[0],
      faceCentroid[1] - cc[1],
      faceCentroid[2] - cc[2],
    ];
    polygons.set(cell, orientOutward(polygon, outward));
  }
  let radius = 0;
  for (const p of positions.values()) {
    radius = Math.max(radius, Math.hypot(p[0], p[1], p[2]));
  }
  return solidBoard({
    mode: "tetraframe",
    polygons,
    adjacency,
    mineCount,
    radius,
    twoSided: false,
    clip: null,
    cornerMask: null,
  });
}
