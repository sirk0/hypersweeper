// Port of minesweeper/boards/volume.py — the volume boards: a solid block of
// cells rather than a surface of them.
//
// Every other board in the zoo is a *surface*, and two cells are neighbours
// when their polygons share a vertex. A volume board keeps that rule and lifts
// it one dimension: the cells are solids filling a block, and two are
// neighbours when the **solids** share a corner. Three ship — the cube of cubes
// (`cube3d`, **26** neighbours where the densest surface board has 21), the
// rhombic dodecahedra round the face-centred cubic lattice (`fcc3d`, 18) and
// stacked hexagonal prisms (`hexprism3d`, 20). It is integer arithmetic, so the
// rule is exact; nothing rounds two nearby points together to make a neighbour.
//
// A solid shows only its shell, so a volume is drawn taken apart: each k-slice
// is its own sheet, the sheets laid out on a grid and stepped back in depth by
// slice index. Nothing is hidden and nothing occludes anything, which is what a
// neighbourhood that deep needs — a number in slice k of the cube counts mines
// across slices k-1, k and k+1, so all three must be on screen (on the rhombic
// honeycomb, k-2 to k+2). Within a sheet each drawing is exact.
//
// The layout constants are part of the drawing and the conformance oracle
// counts vertices and edges off the drawing, so they match the Python's
// exactly. Change one and change both.
import {
  cid,
  keepSymmetries,
  type Board3D,
  type BoardSymmetry,
  type CellId,
  type SymmetryCandidate,
  type Vec3,
} from "./core";

/** Blank space between two neighbouring sheets, in cells. */
export const GAP = 1.0;
/** How far back each successive slice steps, in cells. This is the only cue
 * that says which sheet is which, so it has to be plainly visible at the
 * board's default orientation while staying small enough that perspective does
 * not shrink the far sheets noticeably. */
export const SPREAD = 1.5;

/** An `n x n x n` solid of cells, drawn as `n` slices laid out on a grid and
 * stepped back in depth. Cells are the unit cubes; neighbours are the (up to)
 * 26 cubes sharing a corner with them.
 *
 * `n` is at least 3, and that is not a taste: at a depth of 2 every cell shares
 * a closed neighbourhood with the cell behind it, so no sequence of numbers can
 * ever tell the two apart and a mine landing in one of the pair forces a coin
 * flip. */
export function solidCubeBoard(n: number, mineCount: number): Board3D {
  if (n < 3) throw new Error("a volume board needs at least 3 cells on a side");

  // Each slice is a sheet of unit squares, cornered on the integers.
  const sheets: Sheet[] = [];
  for (let k = 0; k < n; k++) {
    const sheet: Sheet = new Map();
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) {
        // wound counterclockwise seen from +z
        sheet.set(
          cid(i, j, k),
          (
            [
              [0, 0],
              [1, 0],
              [1, 1],
              [0, 1],
            ] as const
          ).map(([du, dv]) => [cid(i + du, j + dv), [i + du, j + dv]] as const),
        );
      }
    }
    sheets.push(sheet);
  }
  const { polygons, radius } = layOut(sheets, n, n);
  const adjacency = mooreAdjacency(n);
  let kept: BoardSymmetry[] | null = null;
  return {
    mode: "cube3d",
    polygons,
    adjacency,
    mineCount,
    radius,
    // The sheets are open — they have rims — so with front-face culling the
    // whole board would vanish the moment it was turned past ninety degrees.
    twoSided: true,
    clip: null,
    cornerMask: null,
    // Not `solidBoard`, which measures a solid's point group off the polygons:
    // the fanned layout is a *display* of the cube rather than the cube, and
    // pulling the slices apart leaves nothing of the cube's 48 motions in the
    // drawing to find. They are all still there in the cells, though, so the
    // board offers them from the lattice instead — the same trade `surfaces.ts`
    // makes, and for the same reason. `keepSymmetries` still checks every one
    // against the adjacency actually built, so nothing here is asserted.
    get symmetries(): BoardSymmetry[] {
      return (kept ??= keepSymmetries(adjacency, cubeCandidates(n)));
    },
  };
}

/** The 18 lattice steps between neighbouring rhombic dodecahedra: the 12 to
 * the cells across a face, then the 6 to the cells across one of the 4-valent
 * corners — two layers away when the step is along an axis. */
export const FCC_STEPS: readonly (readonly [number, number, number])[] =
  (() => {
    const steps: [number, number, number][] = [];
    for (let di = -2; di <= 2; di++) {
      for (let dj = -2; dj <= 2; dj++) {
        for (let dk = -2; dk <= 2; dk++) {
          const kind = [di, dj, dk]
            .map(Math.abs)
            .sort((a, b) => a - b)
            .join();
          if (kind === "0,1,1" || kind === "0,0,2") steps.push([di, dj, dk]);
        }
      }
    }
    return steps;
  })();

/** A `side x side x depth` block of the face-centred cubic lattice, its cells
 * the rhombic dodecahedra that tile space around those points.
 *
 * The cells sit on the integer points `(i, j, k)` of the box whose coordinates
 * sum to an even number. Two share a rhombic **face** at a step like
 * `(1, 1, 0)` — twelve of those — and only a **corner**, the 4-valent one six
 * cells meet at, at a step like `(2, 0, 0)` — six more: 18 neighbours, all of
 * them exact lattice steps.
 *
 * Sliced along `k`, the cut is an honest picture: the middle of a rhombic
 * dodecahedron is a square standing on its corner, and a layer of them is a
 * checkerboard of those diamonds. Within a sheet the drawing *is* the adjacency
 * — diamonds sharing an edge share a face, diamonds touching at a point share
 * that corner. Across sheets it is the board's twist: slice `k ± 1` holds the
 * four diamonds centred on this one's corners, and slice `k ± 2` the one
 * straight through, so a number counts mines over *five* sheets. */
export function fccBlockBoard(
  side: number,
  depth: number,
  mineCount: number,
): Board3D {
  if (side < 3 || depth < 3)
    throw new Error("a volume board needs at least 3 cells on a side");

  // One frame for every sheet, so a corner of slice k and the centre of a
  // diamond in slice k + 1 land on the same spot of their two sheets. It runs
  // from -1 to `side`: the diamonds' corners overhang the cell centres by one.
  const sheets: Sheet[] = [];
  for (let k = 0; k < depth; k++) {
    const sheet: Sheet = new Map();
    for (let i = 0; i < side; i++) {
      for (let j = 0; j < side; j++) {
        if ((i + j + k) % 2) continue;
        // wound counterclockwise seen from +z: bottom, right, top, left
        sheet.set(
          cid(i, j, k),
          (
            [
              [i, j - 1],
              [i + 1, j],
              [i, j + 1],
              [i - 1, j],
            ] as const
          ).map(([x, y]) => [cid(x, y), [x + 1, y + 1]] as const),
        );
      }
    }
    sheets.push(sheet);
  }
  const { polygons, radius } = layOut(sheets, side + 1, side + 1);
  const adjacency = latticeAdjacency(polygons, FCC_STEPS);
  let kept: BoardSymmetry[] | null = null;
  return {
    mode: "fcc3d",
    polygons,
    adjacency,
    mineCount,
    radius,
    twoSided: true,
    clip: null,
    cornerMask: null,
    get symmetries(): BoardSymmetry[] {
      return (kept ??= keepSymmetries(
        adjacency,
        fccCandidates(side, depth, polygons),
      ));
    },
  };
}

/** A hexagon's six corners, in thirds of the axial lattice: the centroid of
 * the cell and two neighbouring cell centres. Integer keys, so the corners two
 * hexagons share are the same key exactly. Counterclockwise from 30 degrees. */
const HEX_CORNERS = [
  [1, 1],
  [-1, 2],
  [-2, 1],
  [-1, -1],
  [1, -2],
  [2, -1],
] as const;

/** The 20 steps between neighbouring prisms, as `(q, s, k)`: the six cells
 * round a hexagon in its own layer, then the cell straight through and its six
 * in each layer above and below. */
export const HEX_PRISM_STEPS: readonly (readonly [number, number, number])[] =
  (() => {
    const steps: [number, number, number][] = [];
    for (const dk of [0, -1, 1]) {
      for (const [dq, ds] of [
        [0, 0],
        [1, 0],
        [0, 1],
        [-1, 1],
        [-1, 0],
        [0, -1],
        [1, -1],
      ] as const) {
        if (dq !== 0 || ds !== 0 || dk !== 0) steps.push([dq, ds, dk]);
      }
    }
    return steps;
  })();

/** A block of hexagonal prisms: `depth` layers, each a hexagon of hexagons
 * `radius` rings out from a centre cell. Cells are `(q, s, k)`, axial
 * coordinates within the layer and the layer itself; prisms sharing a corner
 * are the six round a cell in its own layer and, above and below, the cell
 * straight through and its six — **20** neighbours, all within one layer.
 *
 * `depth` is at least 3 for the cube's reason: two layers deep, every prism
 * shares its closed neighbourhood with the one behind it. */
export function hexPrismBoard(
  radius: number,
  depth: number,
  mineCount: number,
): Board3D {
  if (radius < 1)
    throw new Error("a hexagonal prism block needs at least one ring");
  if (depth < 3) throw new Error("a volume board needs at least 3 layers");

  const root3 = Math.sqrt(3);
  const hexagon: [number, number][] = [];
  for (let q = -radius; q <= radius; q++) {
    for (let s = -radius; s <= radius; s++) {
      if (Math.abs(q + s) <= radius) hexagon.push([q, s]);
    }
  }
  const sheets: Sheet[] = [];
  for (let k = 0; k < depth; k++) {
    const sheet: Sheet = new Map();
    for (const [q, s] of hexagon) {
      sheet.set(
        cid(q, s, k),
        HEX_CORNERS.map(([du, dv]) => {
          const [u, v] = [3 * q + du, 3 * s + dv];
          return [cid(u, v), [(u + v / 2) / 3, (v * root3) / 6]] as const;
        }),
      );
    }
    sheets.push(sheet);
  }
  const width = 2 * radius + 1;
  const height = radius * root3 + 2 / root3;
  const laid = layOut(sheets, width, height);
  const adjacency = latticeAdjacency(laid.polygons, HEX_PRISM_STEPS);
  let kept: BoardSymmetry[] | null = null;
  return {
    mode: "hexprism3d",
    polygons: laid.polygons,
    adjacency,
    mineCount,
    radius: laid.radius,
    twoSided: true,
    clip: null,
    cornerMask: null,
    get symmetries(): BoardSymmetry[] {
      return (kept ??= keepSymmetries(
        adjacency,
        hexPrismCandidates(depth, laid.polygons),
      ));
    },
  };
}

/** One slice of a volume: each cell's corners, as a vertex key within the
 * slice and an `(x, y)` on the sheet. */
type Sheet = Map<
  CellId,
  readonly (readonly [string, readonly [number, number]])[]
>;

/** Draw a volume's slices as sheets on a grid, stepped back in depth.
 *
 * Vertex ids become `k` plus the key within the slice: the polygons of one
 * sheet share their corners exactly, which is what makes each sheet a mesh
 * (every edge used by two tiles, or once along its rim), while two sheets
 * share nothing. No volume reads these to find its neighbours — it is the
 * solids that touch, not the drawn polygons.
 *
 * The sheets are laid on a grid, not in a row: eight sheets in a row is a
 * 9-to-1 board, which `frameSolid` fits into a sliver of a phone screen. At
 * ceil(sqrt(n)) columns the cube comes out 8x8, 18x12 and 26x26 cells at the
 * three sizes — square enough to fill the screen at any of them. */
function layOut(
  sheets: readonly Sheet[],
  width: number,
  height: number,
): { polygons: Map<CellId, Vec3[]>; radius: number } {
  const cols = Math.ceil(Math.sqrt(sheets.length));
  const raw = new Map<string, Vec3>();
  const cells = new Map<CellId, string[]>();
  sheets.forEach((sheet, k) => {
    const ox = (k % cols) * (width + GAP);
    const oy = -Math.floor(k / cols) * (height + GAP);
    const oz = -k * SPREAD;
    for (const [cell, corners] of sheet) {
      const keys: string[] = [];
      for (const [local, [x, y]] of corners) {
        const key = `${k},${local}`;
        if (!raw.has(key)) raw.set(key, [ox + x, oy + y, oz]);
        keys.push(key);
      }
      cells.set(cell, keys);
    }
  });

  const lo: Vec3 = [Infinity, Infinity, Infinity];
  const hi: Vec3 = [-Infinity, -Infinity, -Infinity];
  for (const p of raw.values()) {
    for (let a = 0; a < 3; a++) {
      if (p[a]! < lo[a]!) lo[a] = p[a]!;
      if (p[a]! > hi[a]!) hi[a] = p[a]!;
    }
  }
  const center: Vec3 = [
    (lo[0] + hi[0]) / 2,
    (lo[1] + hi[1]) / 2,
    (lo[2] + hi[2]) / 2,
  ];
  const extent = Math.max(hi[0] - lo[0], hi[1] - lo[1], hi[2] - lo[2]);
  const scale = 2 / extent;
  const positions = new Map<string, Vec3>();
  let radius = 0;
  for (const [key, p] of raw) {
    const q: Vec3 = [
      (p[0] - center[0]) * scale,
      (p[1] - center[1]) * scale,
      (p[2] - center[2]) * scale,
    ];
    positions.set(key, q);
    radius = Math.max(radius, Math.hypot(q[0], q[1], q[2]));
  }

  const polygons = new Map<CellId, Vec3[]>();
  for (const [cell, keys] of cells) {
    polygons.set(
      cell,
      keys.map((key) => positions.get(key)!),
    );
  }
  return { polygons, radius };
}

/** Each cell's neighbours: the cells of the block one of `steps` away. Exact
 * integer arithmetic, so the shared-vertex rule needs no tolerance here any
 * more than it does in 2D. */
function latticeAdjacency(
  cells: Map<CellId, unknown>,
  steps: readonly (readonly [number, number, number])[],
): Map<CellId, CellId[]> {
  const adjacency = new Map<CellId, CellId[]>();
  for (const cell of cells.keys()) {
    const [i, j, k] = cell.split(",").map(Number) as [number, number, number];
    const neighbors: CellId[] = [];
    for (const [di, dj, dk] of steps) {
      const other = cid(i + di, j + dj, k + dk);
      if (cells.has(other)) neighbors.push(other);
    }
    adjacency.set(cell, neighbors.sort());
  }
  return adjacency;
}

/** Candidates from a coordinate map, built only where it carries every cell
 * of the board onto another — a mirror across an even-sided box swaps the
 * checkerboard's two colours, and the half of the lattice it lands on is not
 * the board's. `keepSymmetries` drops a null. */
function permutation(
  cells: Map<CellId, unknown>,
  map: (a: number, b: number, c: number) => [number, number, number],
): Map<CellId, CellId> | null {
  const cycle = new Map<CellId, CellId>();
  for (const cell of cells.keys()) {
    const [a, b, c] = cell.split(",").map(Number) as [number, number, number];
    const image = cid(...map(a, b, c));
    if (!cells.has(image)) return null;
    cycle.set(cell, image);
  }
  return cycle;
}

/** The FCC block's motions, as signed permutations of `(i, j, k)` — every one
 * an automorphism of the lattice wherever it keeps the even-sum sites even.
 * Offered the way the cube's are, with a half turn behind each quarter turn
 * for the boxes where the quarter turn is not there (the block is not a cube,
 * or the turn changes the colour of the checkerboard), and `keepSymmetries`
 * takes the first of each id that survives. */
function fccCandidates(
  side: number,
  depth: number,
  cells: Map<CellId, unknown>,
): SymmetryCandidate[] {
  const s = side - 1;
  const d = depth - 1;
  const of =
    (map: (i: number, j: number, k: number) => [number, number, number]) =>
    () =>
      permutation(cells, map);
  return [
    { id: "turn", build: of((i, j, k) => [j, s - i, k]) },
    { id: "turn", build: of((i, j, k) => [s - i, s - j, k]) },
    ...(side === depth
      ? [
          { id: "ring" as const, build: of((i, j, k) => [k, j, s - i]) },
          { id: "tube" as const, build: of((i, j, k) => [i, k, s - j]) },
        ]
      : []),
    { id: "ring", build: of((i, j, k) => [s - i, j, d - k]) },
    { id: "tube", build: of((i, j, k) => [i, s - j, d - k]) },
    { id: "mirror-ring", build: of((i, j, k) => [s - i, j, k]) },
    { id: "mirror-ring", build: of((i, j, k) => [j, i, k]) },
    { id: "mirror-tube", build: of((i, j, k) => [i, j, d - k]) },
    { id: "mirror-tube", build: of((i, j, k) => [i, s - j, k]) },
  ];
}

/** The prism block's motions: the hexagon's own sixfold turn and mirror, and
 * the flip end over end that carries each layer onto the one opposite. */
function hexPrismCandidates(
  depth: number,
  cells: Map<CellId, unknown>,
): SymmetryCandidate[] {
  const d = depth - 1;
  const of =
    (map: (q: number, s: number, k: number) => [number, number, number]) =>
    () =>
      permutation(cells, map);
  return [
    // a sixth of a turn about the prisms' axis: every cell keeps its layer
    { id: "turn", build: of((q, s, k) => [-s, q + s, k]) },
    // a half turn about an axis across the layers: the stack comes over end
    // to end, so the contents move from one sheet to another
    { id: "ring", build: of((q, s, k) => [s, q, d - k]) },
    { id: "mirror-ring", build: of((q, s, k) => [s, q, k]) },
    { id: "mirror-tube", build: of((q, s, k) => [q, s, d - k]) },
  ];
}

/** The cube's own motions, as permutations of `(i, j, k)`.
 *
 * Any signed permutation of the coordinates carries Chebyshev-distance-1 pairs
 * to Chebyshev-distance-1 pairs, so every one of the 48 is an automorphism of
 * the 26-neighbourhood; these five generate the lot. Which is which is chosen
 * for what the player sees in the layout: `turn` spins each sheet where it lies
 * (it fixes the slice), while `ring` and `tube` turn the solid about the other
 * two axes and so carry cells from one sheet to another — the one move the
 * board cannot be given by dragging it, since dragging turns the *drawing* and
 * the drawing is not the cube. */
function cubeCandidates(n: number): SymmetryCandidate[] {
  const last = n - 1;
  const permute = (
    map: (i: number, j: number, k: number) => [number, number, number],
  ): Map<CellId, CellId> => {
    const cycle = new Map<CellId, CellId>();
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) {
        for (let k = 0; k < n; k++) {
          cycle.set(cid(i, j, k), cid(...map(i, j, k)));
        }
      }
    }
    return cycle;
  };
  return [
    // quarter turns about the three axes; the z one keeps every cell in its
    // own slice, the other two step the contents through the stack
    { id: "turn", build: () => permute((i, j, k) => [j, last - i, k]) },
    { id: "ring", build: () => permute((i, j, k) => [k, j, last - i]) },
    { id: "tube", build: () => permute((i, j, k) => [i, k, last - j]) },
    // and the two mirrors across the faces of the block
    { id: "mirror-ring", build: () => permute((i, j, k) => [last - i, j, k]) },
    { id: "mirror-tube", build: () => permute((i, j, k) => [i, last - j, k]) },
  ];
}

/** The 26-neighbourhood of every cell of an `n**3` block: the cells whose unit
 * cubes share a corner with this one. Exact integer arithmetic, so the
 * shared-vertex rule needs no tolerance here any more than it does in 2D. */
function mooreAdjacency(n: number): Map<CellId, CellId[]> {
  const steps: [number, number, number][] = [];
  for (const di of [-1, 0, 1]) {
    for (const dj of [-1, 0, 1]) {
      for (const dk of [-1, 0, 1]) {
        if (di !== 0 || dj !== 0 || dk !== 0) steps.push([di, dj, dk]);
      }
    }
  }
  const adjacency = new Map<CellId, CellId[]>();
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      for (let k = 0; k < n; k++) {
        const neighbors: CellId[] = [];
        for (const [di, dj, dk] of steps) {
          const [a, b, c] = [i + di, j + dj, k + dk];
          if (a >= 0 && a < n && b >= 0 && b < n && c >= 0 && c < n) {
            neighbors.push(cid(a, b, c));
          }
        }
        adjacency.set(cid(i, j, k), neighbors.sort());
      }
    }
  }
  return adjacency;
}
