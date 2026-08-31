// Port of minesweeper/boards/volume.py — the volume boards: a solid block of
// cells rather than a surface of them.
//
// Every other board in the zoo is a *surface*, and two cells are neighbours
// when their polygons share a vertex. A volume board keeps that rule and lifts
// it one dimension: the cells are the unit cubes of an n x n x n block, and two
// are neighbours when their **cubes** share a corner — the 3x3x3 block around a
// cell minus the cell itself, so **26** neighbours where the densest surface
// board in the catalogue has 21. It is integer arithmetic, so the rule is
// exact; nothing rounds two nearby points together to make a neighbour.
//
// A solid cube shows only its shell, so it is drawn taken apart: each k-slice
// is its own sheet of n x n squares, the sheets laid out on a grid and stepped
// back in depth by slice index. Nothing is hidden and nothing occludes
// anything, which is what the 26-cell neighbourhood needs — a number in slice k
// counts mines across slices k-1, k and k+1, so all three must be on screen.
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

  // The sheets are laid on a grid, not in a row: eight sheets in a row is a
  // 9-to-1 board, which `frameSolid` fits into a sliver of a phone screen. At
  // ceil(sqrt(n)) columns the board comes out 8x8, 18x12 and 26x26 cells at the
  // three sizes — square enough to fill the screen at any of them.
  const cols = Math.ceil(Math.sqrt(n));
  const pitch = n + GAP;

  // Vertex ids are `(k, i, j)` integer corners *within* a slice: the quads of
  // one sheet share their corners exactly, which is what makes each sheet a
  // mesh (every edge used by two tiles, or once along its rim), while two
  // sheets share nothing. The adjacency below does not read these at all — it
  // is the cubes that touch, not the drawn squares.
  const raw = new Map<string, Vec3>();
  const cells = new Map<CellId, string[]>();
  for (let k = 0; k < n; k++) {
    const ox = (k % cols) * pitch;
    const oy = -Math.floor(k / cols) * pitch;
    const oz = -k * SPREAD;
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) {
        const corners: string[] = [];
        // wound counterclockwise seen from +z
        for (const [du, dv] of [
          [0, 0],
          [1, 0],
          [1, 1],
          [0, 1],
        ] as const) {
          const key = cid(k, i + du, j + dv);
          if (!raw.has(key)) raw.set(key, [ox + i + du, oy + j + dv, oz]);
          corners.push(key);
        }
        cells.set(cid(i, j, k), corners);
      }
    }
  }

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
