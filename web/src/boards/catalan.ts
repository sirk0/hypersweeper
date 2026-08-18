// Port of minesweeper/boards/catalan.py — the thirteen Catalan solids, the
// duals of the Archimedean solids. Structure and formulas are kept textually
// close to the Python so the two stay diffable; hashable tuple keys become
// canonical strings. See the Python module for the full derivation.
//
// Every Catalan solid is the polar dual of an Archimedean solid, and every
// Archimedean solid is one orbit of a single point — the Wythoff generating
// point — in the Schwarz triangle of a Platonic symmetry group. So: take a
// base solid and one flag, find that point (`wythoffPoint` for the five
// non-chiral operations, `snubPoint` for the chiral one), put a Catalan vertex
// at `n / <w, n>` on each face axis `n`, and group the base's flags into faces
// by the operation's own rule. Six operations over three symmetry groups give
// thirteen solids.
//
// Twelve to a hundred and twenty cells is not a minesweeper board, so every
// face is subdivided into smaller copies of itself and that is the boards' size
// knob: triangles through `geodesic` (the flat, non-projected subdivision the
// Platonic boards use), quadrilaterals through `quadGrid`, and pentagons — which
// cannot be cut into pentagons at all — fanned into five quadrilaterals first.
import {
  cid,
  cross,
  dot,
  normalize,
  tangentOrder,
  type Board3D,
  type Vec3,
} from "./core";
import {
  centroidOf,
  convexBoard3d,
  geodesic,
  icosahedron,
  tetrahedron,
  wythoffPoint,
  type Cells,
  type Mirror,
  type Positions,
  type VertexFaces,
} from "./solids";

// -- base solids --------------------------------------------------------------
//
// One base per symmetry group. Which of a dual pair is used does not matter —
// the flags are the same set either way, and `kis` and `kisdual` are what tell
// a group's two "kis" solids apart.

interface Polyhedron {
  vertices: Vec3[];
  faces: number[][];
}

/** A cube: the eight sign triples, six square faces wound consistently. */
function cube(): Polyhedron {
  const vertices: Vec3[] = [];
  for (const x of [-1, 1]) {
    for (const y of [-1, 1]) {
      for (const z of [-1, 1]) vertices.push([x, y, z]);
    }
  }
  const faces: number[][] = [];
  for (let axis = 0; axis < 3; axis++) {
    for (const sign of [-1, 1]) {
      const ring: number[] = [];
      vertices.forEach((v, i) => {
        if (v[axis] === sign) ring.push(i);
      });
      const centre = centroidOf(ring.map((i) => vertices[i]!));
      faces.push(tangentOrder(centre, ring.map((i) => [i, vertices[i]!] as [number, Vec3])));
    }
  }
  return { vertices, faces };
}

const BASES: Record<string, () => Polyhedron> = {
  tetra: () => {
    const { vertices, faces } = tetrahedron();
    return { vertices, faces: faces.map((f) => [...f]) };
  },
  cube,
  icosa: () => {
    const { vertices, faces } = icosahedron();
    return { vertices, faces: faces.map((f) => [...f]) };
  },
};

/** A Platonic solid plus the incidence tables the constructions read.
 * Everything a Catalan face needs is an exact incidence of this solid — a
 * vertex index, an ordered edge pair, a face index — which is what keeps the
 * Catalan vertex ids exact. */
class Base {
  vertices: Vec3[];
  faces: number[][];
  faceDirs: Vec3[];
  vertexFaces: number[][];
  edges: [number, number][];
  edgeDirs: Map<string, Vec3>;
  edgeFaces: Map<string, [number, number]>;
  faceEdges: [number, number][][];

  constructor(kind: string) {
    const base = BASES[kind]!();
    this.vertices = base.vertices.map(normalize);
    this.faces = base.faces;
    this.faceDirs = this.faces.map((face) =>
      normalize(centroidOf(face.map((i) => this.vertices[i]!))),
    );
    this.vertexFaces = this.vertices.map(() => []);
    this.faces.forEach((face, fi) => {
      for (const v of face) this.vertexFaces[v]!.push(fi);
    });
    // a vertex pair is an edge exactly when it lies on two common faces
    this.edges = [];
    for (let i = 0; i < this.vertices.length; i++) {
      for (let j = i + 1; j < this.vertices.length; j++) {
        const shared = this.vertexFaces[i]!.filter((f) => this.vertexFaces[j]!.includes(f));
        if (shared.length === 2) this.edges.push([i, j]);
      }
    }
    this.edges.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
    this.edgeDirs = new Map();
    this.edgeFaces = new Map();
    this.faceEdges = this.faces.map(() => []);
    for (const e of this.edges) {
      const [a, b] = [this.vertices[e[0]]!, this.vertices[e[1]]!];
      this.edgeDirs.set(ekey(e), normalize([
        (a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2,
      ]));
      const shared = this.vertexFaces[e[0]]!
        .filter((f) => this.vertexFaces[e[1]]!.includes(f))
        .sort((x, y) => x - y) as [number, number];
      this.edgeFaces.set(ekey(e), shared);
      for (const fi of shared) this.faceEdges[fi]!.push(e);
    }
  }

  /** The representative flag's three axis directions. Face 0, its corner 0,
   * and the edge from that corner to the next — the same flag `rotationTo`
   * measures every other one against, so the chiral construction and the radii
   * agree on which triangle they are in. */
  get flag(): [Vec3, Vec3, Vec3] {
    const face = this.faces[0]!;
    const [a, b] = [face[0]!, face[1]!];
    const edge: [number, number] = [Math.min(a, b), Math.max(a, b)];
    return [this.vertices[a]!, this.edgeDirs.get(ekey(edge))!, this.faceDirs[0]!];
  }

  vertexDegree(): number {
    return this.vertexFaces[0]!.length;
  }

  faceSides(): number {
    return this.faces[0]!.length;
  }
}

function ekey(e: readonly [number, number]): string {
  return `${e[0]},${e[1]}`;
}

// -- the chiral generating point ----------------------------------------------
//
// The five non-chiral operations read their point off `solids.wythoffPoint`; a
// snub has no mirror to be pinned by and needs its own solve.

/** Rodrigues' rotation of `p` about a unit `axis`. */
function rotate(axis: Vec3, angle: number, p: Vec3): Vec3 {
  const k = normalize(axis);
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  const kp = dot(k, p);
  const kx = cross(k, p);
  return [0, 1, 2].map((i) => p[i]! * c + kx[i]! * s + k[i]! * kp * (1 - c)) as Vec3;
}

/** The generating point of a snub polyhedron.
 *
 * A snub is generated by the *rotation* subgroup alone — it uses no mirror — so
 * unlike the five non-chiral operations its point is not pinned by lying on
 * mirrors. It is the interior point whose three edges come out equal:
 * `|w - R_v w| = |w - R_e w| = |w - R_f w|`, where R_v, R_e and R_f turn by
 * 2*pi/q, pi and 2*pi/p about the vertex, edge and face axes. Two equations in
 * the two free coordinates of a direction, solved by Newton with a numeric
 * Jacobian; for the cube it lands exactly on the snub cube's tribonacci
 * coordinates. */
function snubPoint(vDir: Vec3, eDir: Vec3, fDir: Vec3, q: number, p: number): Vec3 {
  const v = normalize(vDir);
  const e = normalize(eDir);
  const f = normalize(fDir);
  const point = (a: number, b: number): Vec3 => {
    const c = 1 - a - b;
    return normalize([0, 1, 2].map((i) => a * v[i]! + b * e[i]! + c * f[i]!) as Vec3);
  };
  const gap = (w: Vec3, axis: Vec3, angle: number): number => {
    const r = rotate(axis, angle, w);
    return (w[0] - r[0]) ** 2 + (w[1] - r[1]) ** 2 + (w[2] - r[2]) ** 2;
  };
  const residual = (a: number, b: number): [number, number] => {
    const w = point(a, b);
    const across = gap(w, e, Math.PI);
    return [gap(w, v, (2 * Math.PI) / q) - across, gap(w, f, (2 * Math.PI) / p) - across];
  };
  let a = 0.34;
  let b = 0.33;
  for (let n = 0; n < 100; n++) {
    const r = residual(a, b);
    const h = 1e-7;
    const ra = residual(a + h, b);
    const rb = residual(a, b + h);
    const ja = [(ra[0] - r[0]) / h, (ra[1] - r[1]) / h];
    const jb = [(rb[0] - r[0]) / h, (rb[1] - r[1]) / h];
    const det = ja[0]! * jb[1]! - ja[1]! * jb[0]!;
    if (Math.abs(det) < 1e-18) break;
    const da = (-r[0] * jb[1]! + r[1] * jb[0]!) / det;
    const db = (-r[1] * ja[0]! + r[0] * ja[1]!) / det;
    a += da;
    b += db;
    if (Math.abs(da) + Math.abs(db) < 1e-15) break;
  }
  return point(a, b);
}

// -- the six Conway operations ------------------------------------------------
//
// `zero`/`equal` are the Wythoff constraints placing the Archimedean vertex;
// the operation's name is also the rule grouping the base's flags into faces.

type Op = "join" | "kis" | "kisdual" | "ortho" | "meta" | "gyro";

const OPS: Record<Exclude<Op, "gyro">, { zero: Mirror[]; equal: Mirror[] }> = {
  // w = e, the rectification: its dual is the rhombic solid
  join: { zero: ["v", "f"], equal: [] },
  // on mirror n_v: truncating the *dual*, so the pyramids sit on the base
  kis: { zero: ["v"], equal: ["e", "f"] },
  // on mirror n_f: truncating the base, so the pyramids sit on its dual
  kisdual: { zero: ["f"], equal: ["v", "e"] },
  // on mirror n_e, the cantellation: its dual is the kite solid
  ortho: { zero: ["e"], equal: ["v", "f"] },
  // equidistant from all three, the omnitruncation: dual to the scalene solid
  meta: { zero: [], equal: ["v", "e", "f"] },
};

/** One Catalan solid as (faces, vertex positions), before subdivision. Vertex
 * keys are the base's own exact incidences — `v,i` a base vertex, `e,u,v` a
 * base edge (u < v), `f,i` a base face, `g|…` a snub triangle — so two faces
 * share a vertex id exactly when they touch. */
function catalanFaces(base: Base, op: Op): { faces: Cells; positions: Positions } {
  if (op === "gyro") return gyroFaces(base);
  const [vDir, eDir, fDir] = base.flag;
  const { zero, equal } = OPS[op];
  const w = wythoffPoint(vDir, eDir, fDir, zero, equal);
  const radius: Record<Mirror, number> = {
    v: 1 / dot(w, vDir),
    e: 1 / dot(w, eDir),
    f: 1 / dot(w, fDir),
  };
  const positions: Positions = new Map();

  const corner = (kind: Mirror, key: number | [number, number]): string => {
    let direction: Vec3;
    let vertexKey: string;
    if (kind === "v") {
      direction = base.vertices[key as number]!;
      vertexKey = cid("v", key as number);
    } else if (kind === "e") {
      const e = key as [number, number];
      direction = base.edgeDirs.get(ekey(e))!;
      vertexKey = cid("e", e[0], e[1]);
    } else {
      direction = base.faceDirs[key as number]!;
      vertexKey = cid("f", key as number);
    }
    const r = radius[kind];
    positions.set(vertexKey, [direction[0] * r, direction[1] * r, direction[2] * r]);
    return vertexKey;
  };

  const faces: Cells = new Map();
  if (op === "join") {
    // one rhombus per base edge: the two vertices it joins, and the two face
    // centres it separates
    for (const e of base.edges) {
      const [f1, f2] = base.edgeFaces.get(ekey(e))!;
      faces.set(cid("r", e[0], e[1]), [
        corner("v", e[0]), corner("f", f1), corner("v", e[1]), corner("f", f2),
      ]);
    }
  } else if (op === "kis") {
    // a pyramid raised on every base face: one triangle per (face, edge)
    base.faces.forEach((_face, fi) => {
      for (const e of base.faceEdges[fi]!) {
        faces.set(cid("t", fi, e[0], e[1]), [
          corner("v", e[0]), corner("v", e[1]), corner("f", fi),
        ]);
      }
    });
  } else if (op === "kisdual") {
    // the same pyramids raised on the *dual's* faces: the two face centres
    // take the vertices' place and the vertex takes the apex's
    base.vertices.forEach((_v, vi) => {
      for (const e of base.edges) {
        if (e[0] !== vi && e[1] !== vi) continue;
        const [f1, f2] = base.edgeFaces.get(ekey(e))!;
        faces.set(cid("t", vi, e[0], e[1]), [
          corner("f", f1), corner("f", f2), corner("v", vi),
        ]);
      }
    });
  } else if (op === "ortho") {
    // one kite per (face, corner): the corner, the face centre, and the
    // midpoints of the face's two edges meeting there
    base.faces.forEach((face, fi) => {
      for (const v of face) {
        const es = base.faceEdges[fi]!.filter((e) => e[0] === v || e[1] === v);
        faces.set(cid("k", fi, v), [
          corner("v", v), corner("e", es[0]!), corner("f", fi), corner("e", es[1]!),
        ]);
      }
    });
  } else {
    // one scalene triangle per flag — the barycentric subdivision
    base.faces.forEach((_face, fi) => {
      for (const e of base.faceEdges[fi]!) {
        for (const v of e) {
          faces.set(cid("t", fi, e[0], e[1], v), [
            corner("v", v), corner("e", e), corner("f", fi),
          ]);
        }
      }
    });
  }
  return { faces, positions };
}

// -- the chiral pair ----------------------------------------------------------

/** An orthonormal frame built from a flag's face and vertex axes. */
function frame(fDir: Vec3, vDir: Vec3): [Vec3, Vec3, Vec3] {
  const a = normalize(fDir);
  const d = dot(vDir, a);
  const b = normalize([vDir[0] - d * a[0], vDir[1] - d * a[1], vDir[2] - d * a[2]]);
  return [a, b, cross(a, b)];
}

/** The rotation taking the representative flag to flag `(fi, ci)`, as a 3x3
 * matrix in rows. Both flags carry an orthonormal frame built the same way from
 * their face and vertex axes, so the rotation is their product — and since a
 * rotation is determined by where it sends a flag, the |G| flags enumerate the
 * rotation subgroup exactly once each. */
function rotationTo(base: Base, fi: number, ci: number): [Vec3, Vec3, Vec3] {
  const ref = frame(base.faceDirs[0]!, base.vertices[base.faces[0]![0]!]!);
  const tgt = frame(base.faceDirs[fi]!, base.vertices[base.faces[fi]![ci]!]!);
  return [0, 1, 2].map(
    (row) =>
      [0, 1, 2].map((col) =>
        [0, 1, 2].reduce((sum, k) => sum + tgt[k]![row]! * ref[k]![col]!, 0),
      ) as Vec3,
  ) as [Vec3, Vec3, Vec3];
}

function applyMatrix(m: [Vec3, Vec3, Vec3], p: Vec3): Vec3 {
  return [dot(m[0], p), dot(m[1], p), dot(m[2], p)];
}

function distance(a: Vec3, b: Vec3): number {
  return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
}

/** The two chiral Catalan solids, dual to the snubs.
 *
 * A snub's faces are the p-gons at the base's face axes, the q-gons at its
 * vertex axes and, between them, a snub triangle for each of the two ways round
 * every base edge — and those triangles sit on no symmetry axis at all, which
 * is why this operation needs a third vertex orbit that the other five do not.
 *
 * The snub's vertices are the orbit of the generating point under the rotation
 * subgroup, and a rotation is fixed by where it sends a flag, so they are
 * indexed by the base's (face, corner) pairs. Its triangles are then read off
 * the edge graph — every triple of mutually adjacent snub vertices that is not
 * already one of the axis polygons — and the whole thing is polar-dualised: one
 * Catalan pentagon per snub vertex, its five corners the duals of the five
 * faces meeting there. */
function gyroFaces(base: Base): { faces: Cells; positions: Positions } {
  const [vDir, eDir, fDir] = base.flag;
  const w = snubPoint(vDir, eDir, fDir, base.vertexDegree(), base.faceSides());
  const flags: [number, number][] = [];
  const snub = new Map<string, Vec3>();
  base.faces.forEach((face, fi) => {
    for (let ci = 0; ci < face.length; ci++) {
      flags.push([fi, ci]);
      snub.set(`${fi},${ci}`, applyMatrix(rotationTo(base, fi, ci), w));
    }
  });
  flags.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const at = (flag: [number, number]): Vec3 => snub.get(`${flag[0]},${flag[1]}`)!;

  let edgeLength = Infinity;
  for (let i = 0; i < flags.length; i++) {
    for (let j = i + 1; j < flags.length; j++) {
      edgeLength = Math.min(edgeLength, distance(at(flags[i]!), at(flags[j]!)));
    }
  }

  // the polygons that sit on an axis: one per base face, one per base vertex
  const snubFaces: { key: string; ring: [number, number][] }[] = [];
  base.faces.forEach((face, fi) => {
    snubFaces.push({
      key: cid("f", fi),
      ring: face.map((_v, ci) => [fi, ci] as [number, number]),
    });
  });
  base.vertices.forEach((_v, vi) => {
    snubFaces.push({
      key: cid("v", vi),
      ring: base.vertexFaces[vi]!.map(
        (fi) => [fi, base.faces[fi]!.indexOf(vi)] as [number, number],
      ),
    });
  });
  const onAxis = new Set(
    snubFaces.map(({ ring }) => ring.map((f) => `${f[0]},${f[1]}`).sort().join(";")),
  );

  // ...and the snub triangles between them: mutually adjacent triples that no
  // axis polygon already claims (for the cube the vertex figure is a triangle
  // too, for the icosahedron the face is, so the filter earns its keep)
  const adjacent = (a: [number, number], b: [number, number]): boolean =>
    Math.abs(distance(at(a), at(b)) - edgeLength) < 1e-9;
  for (let i = 0; i < flags.length; i++) {
    for (let j = i + 1; j < flags.length; j++) {
      if (!adjacent(flags[i]!, flags[j]!)) continue;
      for (let k = j + 1; k < flags.length; k++) {
        if (!adjacent(flags[i]!, flags[k]!) || !adjacent(flags[j]!, flags[k]!)) continue;
        const ring = [flags[i]!, flags[j]!, flags[k]!];
        const tag = ring.map((f) => `${f[0]},${f[1]}`).sort().join(";");
        if (!onAxis.has(tag)) snubFaces.push({ key: `g|${tag}`, ring });
      }
    }
  }
  const expected = base.faces.length + base.vertices.length + flags.length;
  if (snubFaces.length !== expected) {
    throw new Error(`snub has ${snubFaces.length} faces, expected ${expected}`);
  }

  // polar dual: one Catalan vertex per snub face, one Catalan face per snub
  // vertex
  const positions: Positions = new Map();
  const around = new Map<string, string[]>();
  for (const { key, ring } of snubFaces) {
    const points = ring.map(at);
    const normal = normalize(centroidOf(points));
    const d = dot(points[0]!, normal);
    positions.set(key, [normal[0] / d, normal[1] / d, normal[2] / d]);
    for (const flag of ring) {
      const tag = `${flag[0]},${flag[1]}`;
      const list = around.get(tag);
      if (list) list.push(key);
      else around.set(tag, [key]);
    }
  }

  const faces: Cells = new Map();
  for (const [tag, ring] of around) {
    const [fi, ci] = tag.split(",").map(Number) as [number, number];
    faces.set(
      cid("p", fi, ci),
      tangentOrder(at([fi, ci]), ring.map((key) => [key, positions.get(key)!] as [string, Vec3])),
    );
  }
  return { faces, positions };
}

// -- subdivision --------------------------------------------------------------

function gcd(a: number, b: number): number {
  while (b) [a, b] = [b, a % b];
  return a;
}

/** The id of the point `step / total` of the way from `a` to `b`,
 * canonicalised so the two faces sharing that edge name it identically. */
function edgeKey(a: string, b: string, step: number, total: number): string {
  if (step === 0) return a;
  if (step === total) return b;
  const swap = b < a;
  const [lo, hi] = swap ? [b, a] : [a, b];
  const s = swap ? total - step : step;
  const g = gcd(s, total);
  return ["s", lo, hi, s / g, total / g].join("|");
}

function lerp(a: Vec3, b: Vec3, step: number, total: number): Vec3 {
  const t = step / total;
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}

/** Cut every quadrilateral face into `frequency**2` smaller ones. Interior
 * points are bilinear in the face's four corners; boundary points are computed
 * as a plain interpolation along the shared edge, in the direction `edgeKey`
 * canonicalises, so the two faces meeting there produce the same id *and* the
 * same coordinates. */
function quadGrid(
  faces: Cells,
  positions: Positions,
  frequency: number,
): { faces: Cells; positions: Positions } {
  if (frequency === 1) return { faces, positions };
  const outCells: Cells = new Map();
  const outPos: Positions = new Map();
  const n = frequency;
  for (const [cell, ring] of faces) {
    if (ring.length !== 4) throw new Error("the quad grid needs quadrilateral faces");
    const [k0, k1, k2, k3] = ring as [string, string, string, string];
    const [p0, p1, p2, p3] = ring.map((k) => positions.get(k)!) as [Vec3, Vec3, Vec3, Vec3];

    const side = (
      ka: string, kb: string, pa: Vec3, pb: Vec3, step: number,
    ): [string, Vec3] => [
      edgeKey(ka, kb, step, n),
      ka < kb ? lerp(pa, pb, step, n) : lerp(pb, pa, n - step, n),
    ];

    const at = (i: number, j: number): string => {
      let key: string;
      let point: Vec3;
      if (j === 0) [key, point] = side(k0, k1, p0, p1, i);
      else if (j === n) [key, point] = side(k3, k2, p3, p2, i);
      else if (i === 0) [key, point] = side(k0, k3, p0, p3, j);
      else if (i === n) [key, point] = side(k1, k2, p1, p2, j);
      else {
        key = ["q", cell, i, j].join("|");
        const s = i / n;
        const t = j / n;
        point = [0, 1, 2].map(
          (a) =>
            (1 - s) * (1 - t) * p0[a]! + s * (1 - t) * p1[a]! +
            s * t * p2[a]! + (1 - s) * t * p3[a]!,
        ) as Vec3;
      }
      outPos.set(key, point);
      return key;
    };

    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) {
        outCells.set(cid(cell, i, j), [at(i, j), at(i + 1, j), at(i + 1, j + 1), at(i, j + 1)]);
      }
    }
  }
  return { faces: outCells, positions: outPos };
}

/** Cut every pentagon into five quadrilaterals through its own planar centre
 * and its edge midpoints. The centre is the plain average of the corners, *not*
 * pushed back out to their sphere, which is what keeps the fan flat rather than
 * tenting outward — the same rule `solids.dodecahedron` fans a dodecahedron's
 * pentagons by. */
function fanPentagons(
  faces: Cells,
  positions: Positions,
): { faces: Cells; positions: Positions } {
  const outCells: Cells = new Map();
  const outPos: Positions = new Map(positions);
  for (const [cell, ring] of faces) {
    const points = ring.map((k) => positions.get(k)!);
    const centreKey = ["c", cell].join("|");
    outPos.set(centreKey, centroidOf(points));
    const mids = ring.map((key, i) => {
      const next = ring[(i + 1) % ring.length]!;
      const mid = edgeKey(key, next, 1, 2);
      outPos.set(mid, lerp(positions.get(key)!, positions.get(next)!, 1, 2));
      return mid;
    });
    ring.forEach((key, i) => {
      outCells.set(cid(cell, i), [key, mids[i]!, centreKey, mids[(i + mids.length - 1) % mids.length]!]);
    });
  }
  return { faces: outCells, positions: outPos };
}

/** Subdivide a Catalan solid's faces, by whatever their side count allows. */
function subdivide(
  faces: Cells,
  positions: Positions,
  frequency: number,
): { faces: Cells; positions: Positions } {
  const sides = new Set([...faces.values()].map((ring) => ring.length));
  if (sides.size !== 1) throw new Error("a Catalan solid has one face shape");
  const [n] = [...sides];
  if (n === 3) {
    // reuse the Platonic boards' own flat subdivision: gcd-normalised
    // barycentric ids over one global vertex list, so a point on a shared edge
    // comes out with the same id from either face
    const order = [...positions.keys()].sort();
    const index = new Map(order.map((key, i) => [key, i]));
    const base: VertexFaces = {
      vertices: order.map((key) => positions.get(key)!),
      faces: [...faces.values()].map(
        (ring) => ring.map((k) => index.get(k)!) as [number, number, number],
      ),
    };
    const grid = geodesic(frequency, base, false);
    const cells: Cells = new Map();
    grid.triangles.forEach((t, i) => cells.set(cid("t", i), t));
    return { faces: cells, positions: grid.positions };
  }
  if (n === 4) return quadGrid(faces, positions, frequency);
  if (n === 5) {
    if (frequency === 0) return { faces, positions };
    const fanned = fanPentagons(faces, positions);
    return quadGrid(fanned.faces, fanned.positions, frequency);
  }
  throw new Error(`cannot subdivide faces with ${n} sides`);
}

function catalanBoard(
  mode: string,
  base: string,
  op: Op,
  mineCount: number,
  frequency: number,
): Board3D {
  const built = catalanFaces(new Base(base), op);
  const { faces, positions } = subdivide(built.faces, built.positions, frequency);
  let radius = 0;
  for (const p of positions.values()) radius = Math.max(radius, Math.hypot(p[0], p[1], p[2]));
  return convexBoard3d(mode, faces, positions, mineCount, radius);
}

// -- the thirteen boards ------------------------------------------------------
//
// Listed in face-count order, which is the order the menu shows them in.

/** A triakis tetrahedron, dual of the truncated tetrahedron: a regular
 * tetrahedron with a pyramid raised on each of its four faces, so 12 isoceles
 * triangles, each cut into `frequency**2` cells. */
export function triakisTetrahedronBoard(mineCount: number, frequency = 3): Board3D {
  return catalanBoard("triakistetra", "tetra", "kis", mineCount, frequency);
}

/** A rhombic dodecahedron, dual of the cuboctahedron: 12 rhombi, one per cube
 * edge, each cut into `frequency**2` smaller rhombi. */
export function rhombicDodecahedronBoard(mineCount: number, frequency = 3): Board3D {
  return catalanBoard("rhombicdodeca", "cube", "join", mineCount, frequency);
}

/** A triakis octahedron, dual of the truncated cube: an octahedron with a
 * pyramid on each face, so 24 isoceles triangles. */
export function triakisOctahedronBoard(mineCount: number, frequency = 2): Board3D {
  return catalanBoard("triakisocta", "cube", "kisdual", mineCount, frequency);
}

/** A tetrakis hexahedron, dual of the truncated octahedron: a cube with a
 * pyramid on each face, so 24 isoceles triangles. */
export function tetrakisHexahedronBoard(mineCount: number, frequency = 2): Board3D {
  return catalanBoard("tetrakishexa", "cube", "kis", mineCount, frequency);
}

/** A deltoidal icositetrahedron, dual of the rhombicuboctahedron: 24 kites,
 * one per (cube face, corner) pair. */
export function deltoidalIcositetrahedronBoard(mineCount: number, frequency = 2): Board3D {
  return catalanBoard("deltoidalicositetra", "cube", "ortho", mineCount, frequency);
}

/** A pentagonal icositetrahedron, dual of the snub cube: 24 irregular
 * pentagons. Chiral — it has no mirror symmetry, and neither does its dual.
 * `frequency=0` keeps the bare pentagons; above that each is fanned into five
 * quadrilaterals and those are cut `frequency**2` ways. */
export function pentagonalIcositetrahedronBoard(mineCount: number, frequency = 1): Board3D {
  return catalanBoard("pentagonalicositetra", "cube", "gyro", mineCount, frequency);
}

/** A disdyakis dodecahedron, dual of the truncated cuboctahedron: the cube's
 * barycentric subdivision, 48 scalene triangles — one per flag, which is the
 * full order of the octahedral symmetry group. */
export function disdyakisDodecahedronBoard(mineCount: number, frequency = 2): Board3D {
  return catalanBoard("disdyakisdodeca", "cube", "meta", mineCount, frequency);
}

/** A rhombic triacontahedron, dual of the icosidodecahedron: 30 golden rhombi,
 * one per icosahedron edge. */
export function rhombicTriacontahedronBoard(mineCount: number, frequency = 2): Board3D {
  return catalanBoard("rhombictriaconta", "icosa", "join", mineCount, frequency);
}

/** A triakis icosahedron, dual of the truncated dodecahedron: an icosahedron
 * with a pyramid on each face, so 60 isoceles triangles. */
export function triakisIcosahedronBoard(mineCount: number, frequency = 2): Board3D {
  return catalanBoard("triakisicosa", "icosa", "kis", mineCount, frequency);
}

/** A pentakis dodecahedron, dual of the truncated icosahedron (the football):
 * a dodecahedron with a pyramid on each pentagon, so 60 isoceles triangles. */
export function pentakisDodecahedronBoard(mineCount: number, frequency = 2): Board3D {
  return catalanBoard("pentakisdodeca", "icosa", "kisdual", mineCount, frequency);
}

/** A deltoidal hexecontahedron, dual of the rhombicosidodecahedron: 60 kites,
 * one per (icosahedron face, corner) pair. */
export function deltoidalHexecontahedronBoard(mineCount: number, frequency = 2): Board3D {
  return catalanBoard("deltoidalhexeconta", "icosa", "ortho", mineCount, frequency);
}

/** A pentagonal hexecontahedron, dual of the snub dodecahedron: 60 irregular
 * pentagons, every one with exactly 7 neighbours. Chiral, like the pentagonal
 * icositetrahedron. `frequency=0` keeps the bare pentagons, which is the
 * 60-cell board this mode has always shipped as.
 *
 * Keeps the mode name `sphere` from when it was drawn projected onto the unit
 * sphere: it is the board's address in a share link and in the best-times
 * table, so renaming it would lose both. */
export function sphereBoard(mineCount: number, frequency = 0): Board3D {
  return catalanBoard("sphere", "icosa", "gyro", mineCount, frequency);
}

/** A disdyakis triacontahedron, dual of the truncated icosidodecahedron: the
 * icosahedron's barycentric subdivision, 120 scalene triangles — one per flag,
 * the full order of the icosahedral symmetry group, and the most faces any
 * Catalan solid has. */
export function disdyakisTriacontahedronBoard(mineCount: number, frequency = 2): Board3D {
  return catalanBoard("disdyakistriaconta", "icosa", "meta", mineCount, frequency);
}
