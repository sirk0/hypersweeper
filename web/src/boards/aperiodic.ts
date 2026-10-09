// Port of minesweeper/boards/aperiodic.py — the aperiodic flat tilings: Penrose
// (P3 rhombi), Ammann–Beenker (squares and 45° rhombi), the Spectre monotile and
// the nonperiodic spirals and rings below them. Penrose builds float vertex
// positions but keeps *exact* integer vertex ids over ℤ[ζ5], so shared-vertex
// adjacency needs no tolerance; the Spectre carries its placements exactly in
// ℤ[ζ12] instead (see the section below). Cell ids and structure mirror the
// Python source so the two stay diffable.

import { type Board, type CellId, cid, finalizeFlat, type Vertex } from "./core";

// -- Penrose tiling (P3, rhombi) ---------------------------------------------
//
// Vertices are exact elements of ℤ[ζ], ζ = exp(iπ/5), stored as 4 integer
// coefficients over the basis (1, z, z², z³) with the reduction
// z⁴ = -1 + z - z² + z³. Robinson-triangle deflation only ever needs addition,
// subtraction and division by φ — and 1/φ = φ - 1 = z² - z³ — so every
// operation stays in integers and vertex keys are exact.

type ZPoint = readonly [number, number, number, number];

function zetaMul(p: ZPoint): ZPoint {
  const [a, b, c, d] = p;
  return [-d, a + d, b - d, c + d];
}

function zAdd(p: ZPoint, q: ZPoint): ZPoint {
  return [p[0] + q[0], p[1] + q[1], p[2] + q[2], p[3] + q[3]];
}

function zSub(p: ZPoint, q: ZPoint): ZPoint {
  return [p[0] - q[0], p[1] - q[1], p[2] - q[2], p[3] - q[3]];
}

function zDivPhi(p: ZPoint): ZPoint {
  const z2 = zetaMul(zetaMul(p));
  return zSub(z2, zetaMul(z2));
}

const ZETA_BASIS: Vertex[] = [0, 1, 2, 3].map((k) => [
  Math.cos((Math.PI * k) / 5),
  Math.sin((Math.PI * k) / 5),
]);

function zToXy(p: ZPoint): Vertex {
  let x = 0;
  let y = 0;
  for (let i = 0; i < 4; i++) {
    x += p[i]! * ZETA_BASIS[i]![0];
    y += p[i]! * ZETA_BASIS[i]![1];
  }
  return [x, y];
}

const zKey = (p: ZPoint): string => p.join(",");

/** Lexicographic order on ℤ[ζ5] coefficient tuples (matches Python tuple sort,
 * used only to canonicalise a rhombus's shared base edge). */
function zCmp(a: ZPoint, b: ZPoint): number {
  for (let i = 0; i < 4; i++) {
    if (a[i]! !== b[i]!) return a[i]! - b[i]!;
  }
  return 0;
}

interface PenroseCell {
  color: number;
  index: number;
  verts: ZPoint[];
}

// -- windowing an aperiodic patch --------------------------------------------
//
// Port of the same section in minesweeper/boards/aperiodic.py; see that file
// for the fuller commentary. What makes a tiling aperiodic is that it repeats
// nowhere, and both boards here grow far more of one than they keep — the
// Penrose wheel is 430 rhombi where the easy board is 81, the Spectre cluster
// 4401 tiles where the hard board is 480. The centred trim is one window onto
// that patch; every other window is a board of the same size made of tiles that
// have never sat together before, which is what a `variant` is: not a
// re-generated tiling, but somewhere else to look at the one the substitution
// already built.
//
// The other nonperiodic boards in this file take no variant, deliberately: the
// phyllotactic spiral and the brick rings are nonperiodic by *symmetry* rather
// than by substitution, so each has one distinguished centre (the five-fold
// rosette, the 2×2 core) and a window elsewhere is a crop of a structured
// picture rather than another board.
//
// A window is *picked*, not sampled: `variant` indexes a pool of candidate
// centre tiles built the same way in both languages, so the same integer names
// the same board in each — pinned by data/conformance.json — and no random
// stream has to be shared across two implementations. Index 0 of that pool is
// the centred trim itself, so the classic patch stays one of the boards dealt.
//
// Not every window in that pool is a board a *difficulty* may deal, though: the
// mine count is fitted to the centred window and does not carry across by
// itself (on the 81-cell Penrose board the solver's win rate runs from 0.76 to
// 0.98 across windows, and on the 480-cell one from 0.25 to 0.66 against a 0.51
// target). scripts/difficulty/windows.py measures them and keeps
// the ones that play like the calibrated board, and `windowFor` in presets.ts
// is what turns a game seed into one of those. This file is the geometry; that
// list is the difficulty.

/** How far in from the rim a window's centre has to sit, as a multiple of the
 * window's own half-width in tiles. Under 1 because the window is a square and
 * the depth is measured to the *nearest* rim. Must match `_WINDOW_MARGIN` in
 * minesweeper/boards/aperiodic.py. */
const WINDOW_MARGIN = 0.75;

/** How far the patch's own edge may cut into a window, in tiles. A window is
 * the `keep` tiles nearest its centre, so where its square runs off the end of
 * the patch it cannot be filled and the board is drawn square with a chunk
 * bitten out of one side. The centred window never faces it — it is the board
 * the game shipped and the one the mine count was fitted to. Must match
 * `_WINDOW_NOTCH` in minesweeper/boards/aperiodic.py, where the calibration is
 * written up. */
const WINDOW_NOTCH = 1.5;

/** Consecutive variants step this far through the candidate pool, so variant 1
 * and variant 2 are different boards rather than the same window moved one
 * tile. Must match `_WINDOW_STRIDE` in minesweeper/boards/aperiodic.py. */
const WINDOW_STRIDE = 65537;

const edgeKey = (a: string, b: string): string => (a < b ? `${a}|${b}` : `${b}|${a}`);

/** Shared-vertex adjacency over an untrimmed patch, by row index — the same
 * relation `finalizeFlat` gives the finished board, but on rows and over the
 * whole patch, which is what the rim walk and the disc test need before any of
 * it has been trimmed into a board. */
function patchAdjacency(cells: readonly string[][]): number[][] {
  const byVertex = new Map<string, number[]>();
  cells.forEach((ids, i) => {
    for (const vertex of ids) {
      const at = byVertex.get(vertex);
      if (at) at.push(i);
      else byVertex.set(vertex, [i]);
    }
  });
  const touching = cells.map(() => new Set<number>());
  for (const group of byVertex.values()) {
    for (const i of group) for (const j of group) touching[i]!.add(j);
  }
  return touching.map((others, i) => {
    others.delete(i);
    return [...others].sort((a, b) => a - b);
  });
}

/** Each cell's distance in tiles from the rim of the patch: the rim is every
 * cell carrying an edge no other cell shares, and the depth is the
 * breadth-first distance inward from it. Exact — every tiling's vertex ids are
 * integer tuples, so an edge is shared or it is not, with nothing to round. */
function rimDepth(cells: readonly string[][], adjacency: readonly number[][]): number[] {
  const shared = new Map<string, number>();
  for (const ids of cells) {
    for (let i = 0; i < ids.length; i++) {
      const key = edgeKey(ids[i]!, ids[(i + 1) % ids.length]!);
      shared.set(key, (shared.get(key) ?? 0) + 1);
    }
  }
  const depth = cells.map(() => -1);
  const queue: number[] = [];
  cells.forEach((ids, i) => {
    for (let j = 0; j < ids.length; j++) {
      if (shared.get(edgeKey(ids[j]!, ids[(j + 1) % ids.length]!)) === 1) {
        depth[i] = 0;
        queue.push(i);
        return;
      }
    }
  });
  for (let head = 0; head < queue.length; head++) {
    const i = queue[head]!;
    for (const neighbor of adjacency[i]!) {
      if (depth[neighbor]! < 0) {
        depth[neighbor] = depth[i]! + 1;
        queue.push(neighbor);
      }
    }
  }
  return depth;
}

/** Whether these cells make a board: one piece, and no hole in it. A window
 * that slides off the ragged rim of the Spectre's cluster comes back as two or
 * three islands — a board with a chunk of it floating unreachable, which is not
 * a board. Connected with Euler characteristic 1 is exactly a disc: an annulus
 * (a hole) has 0, two islands 2. */
function isDisc(
  cells: readonly string[][],
  adjacency: readonly number[][],
  kept: readonly number[],
): boolean {
  const chosen = new Set(kept);
  const seen = new Set([kept[0]!]);
  const queue = [kept[0]!];
  for (let head = 0; head < queue.length; head++) {
    for (const neighbor of adjacency[queue[head]!]!) {
      if (chosen.has(neighbor) && !seen.has(neighbor)) {
        seen.add(neighbor);
        queue.push(neighbor);
      }
    }
  }
  if (seen.size !== chosen.size) return false;
  const vertices = new Set<string>();
  const edges = new Set<string>();
  for (const i of kept) {
    const ids = cells[i]!;
    for (let j = 0; j < ids.length; j++) {
      vertices.add(ids[j]!);
      edges.add(edgeKey(ids[j]!, ids[(j + 1) % ids.length]!));
    }
  }
  return vertices.size - edges.size + kept.length === 1;
}

/**
 * Whether the patch's edge stays out of this window (`WINDOW_NOTCH`).
 *
 * The window is the square its kept tiles fill; where the patch ends inside
 * that square there is nothing to fill it with, and the board is drawn with a
 * bite out of one side. So: measure how far in from the square's boundary the
 * nearest rim tile of the patch sits, in tiles — the tile pitch being the
 * square's own side over the square root of the cell count, since a square
 * block of `keep` tiles is √keep of them across. Quantised before it is
 * compared, like every other distance here, so a window at the threshold is
 * kept or dropped the same way in the Python build.
 */
function notchOk(
  centroids: readonly Vertex[],
  rim: readonly number[],
  kept: readonly number[],
  keep: number,
): boolean {
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (const i of kept) {
    const [x, y] = centroids[i]!;
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  }
  const cx = (minX + maxX) / 2;
  const cy = (minY + maxY) / 2;
  let half = 0;
  for (const i of kept) {
    const [x, y] = centroids[i]!;
    half = Math.max(half, Math.abs(x - cx), Math.abs(y - cy));
  }
  let deepest = 0;
  for (const i of rim) {
    const [x, y] = centroids[i]!;
    deepest = Math.max(deepest, half - Math.max(Math.abs(x - cx), Math.abs(y - cy)));
  }
  const allowed = ((2 * half) / Math.sqrt(keep)) * WINDOW_NOTCH;
  return Math.floor(deepest * 1e6 + 0.5) <= Math.floor(allowed * 1e6 + 0.5);
}

/**
 * The rows of one aperiodic patch that make up board `variant`: `keep` rows
 * nearest a centre by Chebyshev distance — a square block, which packs more
 * tiles onto the screen than the round patch does — in rank order, so the board
 * a caller assembles from them is ordered exactly as the centred trim used to
 * order it. `variant` 0 is that centred trim, unchanged; any other integer
 * picks a window elsewhere in the patch, and is kept only if it is a board to
 * look at as well as to play: a disc (`isDisc`), and not bitten into by the end
 * of the patch (`notchOk`).
 *
 * The distance is quantised, as it always was: these patches are ten-fold
 * symmetric (Penrose) or grown from one cluster (the Spectre), so tiles come in
 * sets at the *same* distance, and a tie at the cut rank compared as a raw
 * float breaks the other way in the Python build, whose last cosine bit need
 * not agree with V8's. Same cells kept, different edge count — which is what
 * the conformance suites catch.
 */
function windowRows(
  cells: readonly string[][],
  centroids: readonly Vertex[],
  tiebreak: (a: number, b: number) => number,
  keep: number | null,
  variant: number,
): number[] {
  const n = cells.length;
  const rows = (): number[] => Array.from({ length: n }, (_, i) => i);
  if (keep === null || keep >= n) return rows();

  const windowAt = (cx: number, cy: number): number[] => {
    const rank = centroids.map(([x, y]) =>
      Math.floor(Math.max(Math.abs(x - cx), Math.abs(y - cy)) * 1e6 + 0.5),
    );
    return rows()
      .sort((a, b) => rank[a]! - rank[b]! || tiebreak(a, b))
      .slice(0, keep);
  };

  let gx = 0;
  let gy = 0;
  for (const [x, y] of centroids) {
    gx += x;
    gy += y;
  }
  gx /= n;
  gy /= n;
  const centred = windowAt(gx, gy);
  if (!variant) return centred;

  // A window's centre has to sit far enough inside the patch that the window is
  // filled by it; the pool is every tile that does, in the order the
  // substitution laid them — the one order both languages agree on without
  // sorting anything.
  const adjacency = patchAdjacency(cells);
  const depth = rimDepth(cells, adjacency);
  const margin = (Math.sqrt(keep) / 2) * WINDOW_MARGIN;
  const pool: number[] = [];
  for (let i = 0; i < n; i++) if (depth[i]! >= margin) pool.push(i);
  const size = pool.length + 1;
  // Positive remainder, as Python's `%` is: the variant is a uint32 in the app,
  // but the builders are callable with anything.
  const rim: number[] = [];
  for (let i = 0; i < n; i++) if (depth[i] === 0) rim.push(i);
  const index = (((variant * WINDOW_STRIDE) % size) + size) % size;
  for (let step = 0; step < size; step++) {
    const at = (index + step) % size;
    if (at === 0) return centred; // the centred trim is index 0
    const centre = centroids[pool[at - 1]!]!;
    const kept = windowAt(centre[0], centre[1]);
    if (notchOk(centroids, rim, kept, keep) && isDisc(cells, adjacency, kept)) return kept;
  }
  return centred; // unreachable: index 0 is always a board
}

/**
 * An aperiodic Penrose tiling (P3): thick and thin rhombi. Starts from a wheel
 * of ten half-rhombus Robinson triangles, deflates `subdivisions` times, then
 * merges mirror-image triangle halves into rhombi (unpaired rim halves are
 * dropped). `scale` is the wheel radius in pixels; `keep` trims to `keep`
 * rhombi by Chebyshev distance (a roughly square block); `null` keeps the whole
 * decagonal patch.
 *
 * `variant` picks *which* `keep` rhombi: 0 is the centremost block, the patch's
 * ten-fold sun in the middle of it, and any other integer a window somewhere
 * else in the same tiling — a different board of the same size, which is the
 * point of an aperiodic one. See `windowRows`.
 */
export function penroseBoard(
  subdivisions: number,
  mineCount: number,
  scale = 300,
  keep: number | null = null,
  variant = 0,
): Board {
  const zero: ZPoint = [0, 0, 0, 0];
  const powers: ZPoint[] = [[1, 0, 0, 0]];
  for (let i = 0; i < 10; i++) powers.push(zetaMul(powers[powers.length - 1]!));

  // (color, apex, base1, base2): color 0 = half-thin, 1 = half-thick.
  let triangles: [number, ZPoint, ZPoint, ZPoint][] = [];
  for (let i = 0; i < 10; i++) {
    let b = powers[i]!;
    let c = powers[i + 1]!;
    if (i % 2) [b, c] = [c, b]; // alternate handedness so mirror halves pair up
    triangles.push([0, zero, b, c]);
  }

  for (let s = 0; s < subdivisions; s++) {
    const deflated: [number, ZPoint, ZPoint, ZPoint][] = [];
    for (const [color, a, b, c] of triangles) {
      if (color === 0) {
        const p = zAdd(a, zDivPhi(zSub(b, a)));
        deflated.push([0, c, p, b], [1, p, c, a]);
      } else {
        const q = zAdd(b, zDivPhi(zSub(a, b)));
        const r = zAdd(b, zDivPhi(zSub(c, b)));
        deflated.push([1, r, c, a], [1, q, r, b], [0, r, q, a]);
      }
    }
    triangles = deflated;
  }

  if (import.meta.env.DEV) {
    for (const [, a, b, c] of triangles) {
      for (const p of [a, b, c]) {
        for (const coeff of p) {
          if (!Number.isSafeInteger(coeff)) {
            throw new Error(`Penrose ℤ[ζ5] coefficient overflow: ${coeff}`);
          }
        }
      }
    }
  }

  // Merge mirror halves: partners share the colour and the base edge.
  const waiting = new Map<string, ZPoint>();
  const cells: PenroseCell[] = [];
  for (const [color, a, b, c] of triangles) {
    const edge = zCmp(b, c) <= 0 ? `${zKey(b)}|${zKey(c)}` : `${zKey(c)}|${zKey(b)}`;
    const key = `${color}|${edge}`;
    const otherApex = waiting.get(key);
    if (otherApex !== undefined) {
      waiting.delete(key);
      cells.push({ color, index: cells.length, verts: [a, b, otherApex, c] });
    } else {
      waiting.set(key, a);
    }
  }

  const vertexIds = cells.map((cell) => cell.verts.map(zKey));
  const centroids: Vertex[] = cells.map((cell) => {
    let cx = 0;
    let cy = 0;
    for (const v of cell.verts) {
      const [x, y] = zToXy(v);
      cx += x;
      cy += y;
    }
    return [cx / 4, cy / 4];
  });
  // The tie-break at the cut rank is the cell id, as it always was: a rhombus's
  // colour, then the order the merge made it.
  const kept = windowRows(
    vertexIds,
    centroids,
    (a, b) => cells[a]!.color - cells[b]!.color || cells[a]!.index - cells[b]!.index,
    keep,
    variant,
  );

  const cellMap = new Map<CellId, string[]>();
  const positions = new Map<string, Vertex>();
  for (const i of kept) {
    const cell = cells[i]!;
    cell.verts.forEach((v, j) => {
      const k = vertexIds[i]![j]!;
      if (!positions.has(k)) positions.set(k, zToXy(v));
    });
    cellMap.set(cid(cell.color, cell.index), vertexIds[i]!);
  }
  return finalizeFlat("penrose", cellMap, positions, mineCount, scale);
}

// -- Phyllotactic spiral -----------------------------------------------------
//
// A spiral tiling by a single equilateral convex hexagon, angles 72°, 144°,
// 144°, 72°, 144°, 144°: five tiles meet at the centre and the rest wind out
// from it in five arms. It reads as the sunflower head a Voronoi tessellation
// of a phyllotactic spiral draws, but it is built exactly and from one
// congruent tile rather than sampled from spiral points. Nonperiodic, and not
// by substitution the way Penrose and the Spectre are: the tiling has five-fold
// rotational symmetry about its centre, and by the crystallographic restriction
// no tiling with a five-fold centre has a translation at all. Laying it is
// forced — from the rosette of five tiles at the centre, exactly one placement
// of the tile fits the innermost gap at every step. Line-for-line port of
// minesweeper/boards/aperiodic.py; see that file for the fuller commentary.
//
// In exact ℤ[ζ5] (the ring the Penrose board above already runs in): the tile
// is the zonogon on three consecutive unit directions u0, u1, u2, so opposite
// edges are parallel and equal and it tiles periodically on the lattice
// a = u0+u1, b = u1+u2. Those sit 36° apart, so the lattice quadrant
// {m·a + n·b : m, n ≥ 0} fills a 36° wedge and ten rotated copies fill the
// plane. Odd wedges are pushed one tile out along u1, and that single offset is
// the whole spiral: rotating by ζ² maps wedge j to j+2 and keeps the parity, so
// the tiling has C5 symmetry but neither C10 nor a mirror.

const Z_ZERO: ZPoint = [0, 0, 0, 0];

/** Multiply by ζᵏ, i.e. rotate k·36° about the origin. */
function zRot(p: ZPoint, k: number): ZPoint {
  let out = p;
  for (let i = ((k % 10) + 10) % 10; i > 0; i--) out = zetaMul(out);
  return out;
}

function zScale(p: ZPoint, k: number): ZPoint {
  return [p[0] * k, p[1] * k, p[2] * k, p[3] * k];
}

const Z_POWERS: ZPoint[] = [[1, 0, 0, 0]];
for (let k = 0; k < 9; k++) Z_POWERS.push(zetaMul(Z_POWERS[k]!));

// The tile: the zonogon on u0, u1, u2, walked counterclockwise from its 72°
// corner (the one that meets the centre of the spiral).
const PHYLLO_HEX: ZPoint[] = [
  Z_ZERO,
  Z_POWERS[0]!,
  zAdd(Z_POWERS[0]!, Z_POWERS[1]!),
  zAdd(zAdd(Z_POWERS[0]!, Z_POWERS[1]!), Z_POWERS[2]!),
  zAdd(Z_POWERS[1]!, Z_POWERS[2]!),
  Z_POWERS[2]!,
];

// The tile lattice (a, b) and the half-step that offsets the odd wedges.
const PHYLLO_A = zAdd(Z_POWERS[0]!, Z_POWERS[1]!);
const PHYLLO_B = zAdd(Z_POWERS[1]!, Z_POWERS[2]!);
const PHYLLO_OFFSET = Z_POWERS[1]!;

interface PhyllotaxisTile {
  wedge: number;
  m: number;
  n: number;
  ids: ZPoint[];
}

interface PhyllotaxisRow extends PhyllotaxisTile {
  near: number;
}

/** The ten wedges grown `rings` lattice steps each — the whole tiling, in
 * wedge order. */
function phyllotaxisTiles(rings: number): PhyllotaxisTile[] {
  const tiles: PhyllotaxisTile[] = [];
  for (let wedge = 0; wedge < 10; wedge++) {
    const base = wedge % 2 ? PHYLLO_OFFSET : Z_ZERO;
    for (let m = 0; m < rings; m++) {
      for (let n = 0; n < rings; n++) {
        const shift = zAdd(base, zAdd(zScale(PHYLLO_A, m), zScale(PHYLLO_B, n)));
        tiles.push({ wedge, m, n, ids: PHYLLO_HEX.map((v) => zRot(zAdd(v, shift), wedge)) });
      }
    }
  }
  return tiles;
}

/**
 * The phyllotactic spiral: one equilateral convex hexagon
 * (72°/144°) tiling the plane in five spiral arms. Grows the ten 36° wedges out
 * to `rings` lattice steps each, for 10·rings² tiles, then — like
 * `penroseBoard` and `spectreBoard` — `keep` trims the patch to its `keep`
 * centremost tiles by Chebyshev distance from the spiral's centre, so the board
 * reads as a square block around the five-fold rosette instead of a
 * ten-pointed star. `null` keeps the whole patch; `scale` is pixels per edge.
 */
export function phyllotaxisBoard(
  rings: number,
  mineCount: number,
  keep: number | null = null,
  scale = 44,
): Board {
  const rows: PhyllotaxisRow[] = phyllotaxisTiles(rings).map((tile) => {
    let cx = 0;
    let cy = 0;
    for (const v of tile.ids) {
      const [x, y] = zToXy(v);
      cx += x;
      cy += y;
    }
    cx /= tile.ids.length;
    cy /= tile.ids.length;
    // The patch is centred on the tiling's own five-fold centre, so the trim
    // measures from the origin rather than from a sampled centroid. Quantising
    // the distance keeps the sort order identical to Python's, where the last
    // bit of a cosine need not agree.
    const near = Math.floor(Math.max(Math.abs(cx), Math.abs(cy)) * 1e6 + 0.5);
    return { ...tile, near };
  });

  let kept = rows;
  if (keep !== null && keep < rows.length) {
    kept = [...rows]
      .sort((r1, r2) => r1.near - r2.near || r1.wedge - r2.wedge || r1.m - r2.m || r1.n - r2.n)
      .slice(0, keep);
  }

  const cellMap = new Map<CellId, string[]>();
  const positions = new Map<string, Vertex>();
  for (const row of kept) {
    const keys = row.ids.map((v) => {
      const k = zKey(v);
      if (!positions.has(k)) positions.set(k, zToXy(v));
      return k;
    });
    cellMap.set(cid(row.wedge, row.m, row.n), keys);
  }
  return finalizeFlat("phyllotaxis", cellMap, positions, mineCount, scale);
}

// -- Klaassen's spiral monotile -----------------------------------------------
//
// Bernhard Klaassen's spiral tiling ("Forcing nonperiodic tilings with one tile
// using a seed", 2022): one equilateral heptagon whose seven edges run along the
// seven 7th roots of unity, each once, in the order ζ⁰, ζ¹, ζ², ζ⁶, ζ⁵, ζ⁴, ζ³
// (ζ = exp(2πi/7)) — a mirror-symmetric bent chevron with angles π/7, 9π/7,
// 9π/7, π/7, 5π/7, 5π/7, 5π/7. The tiling is one spiral arm around a seed, so
// like the phyllotactic spiral it is nonperiodic by symmetry and takes no
// variant. Tips meet at hubs chained by unit steps e(d_k); hub i fans
// d_i − d_(i−1) + 2 tiles outward, and those fans' outer tips are the chain's
// next winding (the turn substitution t → 1ᵗ0). Line-for-line port of
// minesweeper/boards/aperiodic.py; see that file for the fuller commentary.
//
// In exact ℤ[ζ7]: 6 integer coefficients over (1, ζ, …, ζ⁵), reduced by
// ζ⁶ = −(1 + ζ + … + ζ⁵); e(2m) = ζᵐ and e(2m+1) = −ζ^(m+4). Every vertex is a
// sum of unit directions, so no multiplication is needed and ids are exact.

type Z7Point = readonly [number, number, number, number, number, number];

const Z7_ZERO: Z7Point = [0, 0, 0, 0, 0, 0];

function z7Power(m: number): Z7Point {
  const k = ((m % 7) + 7) % 7;
  if (k === 6) return [-1, -1, -1, -1, -1, -1];
  return [0, 1, 2, 3, 4, 5].map((i) => (i === k ? 1 : 0)) as unknown as Z7Point;
}

function z7Add(p: Z7Point, q: Z7Point): Z7Point {
  return p.map((x, i) => x + q[i]!) as unknown as Z7Point;
}

/** The unit vector e(n) = exp(i·n·π/7), n in fourteenths of a turn. */
function z7Dir(n: number): Z7Point {
  const k = ((n % 14) + 14) % 14;
  if (k % 2 === 0) return z7Power(k / 2);
  return z7Power((k - 1) / 2 + 4).map((c) => -c) as unknown as Z7Point;
}

const ZETA7_BASIS: Vertex[] = [0, 1, 2, 3, 4, 5].map((k) => [
  Math.cos((2 * Math.PI * k) / 7),
  Math.sin((2 * Math.PI * k) / 7),
]);

export function z7ToXy(p: Z7Point): Vertex {
  let x = 0;
  let y = 0;
  for (let i = 0; i < 6; i++) {
    x += p[i]! * ZETA7_BASIS[i]![0];
    y += p[i]! * ZETA7_BASIS[i]![1];
  }
  return [x, y];
}

const z7Key = (p: Z7Point): string => p.join(",");

/** The tile's edges, in fourteenths of a turn from its first tip. */
const KLAASSEN_EDGES = [0, 2, 4, 12, 10, 8];

/** The seed: the chain's first twelve steps. */
const KLAASSEN_SEED = [8, 10, 12, 14, 15, 16, 17, 18, 19, 20, 21, 22];

interface KlaassenTile {
  hub: number;
  k: number;
  ids: Z7Point[];
}

/** The spiral grown `turns` windings out, in hub order. */
export function klaassenTiles(turns: number): KlaassenTile[] {
  const steps = [...KLAASSEN_SEED];
  const fans: [number, number, number][] = [[0, 11, 19]];
  let source = 1;
  let hub = 1;
  for (;;) {
    while (steps.length <= hub) {
      for (let d = steps[source - 1]!; d <= steps[source]!; d++) steps.push(d + 14);
      source++;
    }
    if (steps[hub]! >= 8 + 14 * turns) break;
    fans.push([hub, steps[hub - 1]! - 4, steps[hub]! - 3]);
    hub++;
  }

  const at: Z7Point[] = [Z7_ZERO];
  for (let i = 0; i < hub; i++) at.push(z7Add(at[i]!, z7Dir(steps[i]!)));

  const tiles: KlaassenTile[] = [];
  for (const [h, first, last] of fans) {
    for (let phi = first; phi <= last; phi++) {
      let vertex = at[h]!;
      const ids = [vertex];
      for (const edge of KLAASSEN_EDGES) {
        vertex = z7Add(vertex, z7Dir(phi - 2 + edge));
        ids.push(vertex);
      }
      tiles.push({ hub: h, k: phi - first, ids });
    }
  }
  return tiles;
}

/**
 * Klaassen's spiral monotile: one equilateral heptagon tiling the plane in a
 * single spiral arm around a seed. Grows the spiral `turns` windings out, then
 * keeps `keep` tiles grown out from the seed: taken in order of Chebyshev
 * distance from it, as `phyllotaxisBoard` trims, but each joining only once it
 * shares two edges with the tiles already kept (one, when none shares two), so
 * the rim follows the spiral's windings instead of leaving chevrons hanging off
 * it by one edge. `null` keeps the whole patch; `scale` is pixels per edge.
 */
export function klaassenBoard(
  turns: number,
  mineCount: number,
  keep: number | null = null,
  scale = 30,
): Board {
  const rows = klaassenTiles(turns).map((tile) => {
    let cx = 0;
    let cy = 0;
    for (const v of tile.ids) {
      const [x, y] = z7ToXy(v);
      cx += x;
      cy += y;
    }
    cx /= tile.ids.length;
    cy /= tile.ids.length;
    // Quantised exactly as in Python, so the two sort identically.
    const near = Math.floor(Math.max(Math.abs(cx), Math.abs(cy)) * 1e6 + 0.5);
    return { ...tile, near };
  });
  rows.sort((r1, r2) => r1.near - r2.near || r1.hub - r2.hub || r1.k - r2.k);
  const kept = keep !== null && keep < rows.length ? klaassenGrow(rows, keep) : rows;

  const cellMap = new Map<CellId, string[]>();
  const positions = new Map<string, Vertex>();
  for (const row of kept) {
    const keys = row.ids.map((v) => {
      const key = z7Key(v);
      if (!positions.has(key)) positions.set(key, z7ToXy(v));
      return key;
    });
    cellMap.set(cid(row.hub, row.k), keys);
  }
  return finalizeFlat("klaassen", cellMap, positions, mineCount, scale);
}

/** The first `keep` of `rows` (in order) that can join edge to edge: each step
 * takes the earliest row sharing at least two edges with those already taken,
 * else the earliest sharing one, else (the first step) the earliest of all. */
function klaassenGrow<T extends KlaassenTile>(rows: T[], keep: number): T[] {
  const edge = (ids: Z7Point[], k: number): string => {
    const [a, b] = [z7Key(ids[k]!), z7Key(ids[(k + 1) % ids.length]!)];
    return a < b ? `${a}|${b}` : `${b}|${a}`;
  };
  const byEdge = new Map<string, number[]>();
  rows.forEach((row, i) => {
    for (let k = 0; k < row.ids.length; k++) {
      const e = edge(row.ids, k);
      const list = byEdge.get(e);
      if (list) list.push(i);
      else byEdge.set(e, [i]);
    }
  });
  const shared = new Array<number>(rows.length).fill(0);
  const taken = new Array<boolean>(rows.length).fill(false);
  const kept: T[] = [];
  while (kept.length < keep) {
    let pick = -1;
    for (const need of [2, 1, 0]) {
      pick = rows.findIndex((_, i) => !taken[i] && shared[i]! >= need);
      if (pick >= 0) break;
    }
    taken[pick] = true;
    const row = rows[pick]!;
    kept.push(row);
    for (let k = 0; k < row.ids.length; k++) {
      for (const j of byEdge.get(edge(row.ids, k))!) shared[j]!++;
    }
  }
  return kept;
}

// -- The Spectre: a chiral aperiodic monotile --------------------------------
//
// Tile(1,1) (Smith–Myers–Kaplan–Goodman-Strauss, 2023): a 13-gon that is also an
// equilateral 14-gon, two of whose edges are collinear. Forbid reflections and
// it tiles the plane only aperiodically, and this board is that reflection-free
// tiling, grown by the paper's substitution over nine collared cluster types
// (Γ, the Mystic, plus the eight collared Spectres Δ Θ Λ Ξ Π Σ Φ Ψ). Transforms
// ported from Craig S. Kaplan's "spectre" reference
// (cs.uwaterloo.ca/~csk/spectre/spectre.js, © 2023 Craig S. Kaplan).
//
// There is no floating point anywhere: every edge direction is a multiple of
// 30° and every placement is z ↦ ζᵏz + t with ζ = exp(iπ/6), so all of it runs
// in ℤ[ζ12] with integer arithmetic — unlike the Hat (this game's original
// aperiodic monotile board, since removed as a menu entry: no gameplay
// difference, and Spectre's construction is the stricter of the two), whose
// Eisenstein-lattice vertices did need floats. That matters here in a way it
// did not there — ℤ[ζ12] is *dense* in the plane, not discrete, so there is
// no lattice to snap a float vertex back to. Line-for-line port of
// minesweeper/boards/aperiodic.py; see that file for the fuller commentary.

/** A point of ℤ[ζ12] as 4 integer coefficients over the basis (1, ζ, ζ², ζ³),
 * reduced by ζ⁴ = ζ² − 1. Vertex ids are these tuples, so shared-vertex
 * adjacency is exact. */
type Z12Point = readonly [number, number, number, number];

const Z12_ZERO: Z12Point = [0, 0, 0, 0];

/** Multiply by ζ, i.e. rotate 30°. */
function zeta12Mul(p: Z12Point): Z12Point {
  const [a, b, c, d] = p;
  return [-d, a, b + d, c];
}

function z12Add(p: Z12Point, q: Z12Point): Z12Point {
  return [p[0] + q[0], p[1] + q[1], p[2] + q[2], p[3] + q[3]];
}

function z12Sub(p: Z12Point, q: Z12Point): Z12Point {
  return [p[0] - q[0], p[1] - q[1], p[2] - q[2], p[3] - q[3]];
}

/** Multiply by ζᵏ, i.e. rotate k·30° about the origin. */
function z12Rot(p: Z12Point, k: number): Z12Point {
  let out = p;
  for (let i = ((k % 12) + 12) % 12; i > 0; i--) out = zeta12Mul(out);
  return out;
}

/** Complex conjugation, which stays in the ring (ζ¹¹ = ζ − ζ³, ζ¹⁰ = 1 − ζ²,
 * ζ⁹ = −ζ³). */
function z12Conj(p: Z12Point): Z12Point {
  const [a, b, c, d] = p;
  return [a + c, b, -c, -b - d];
}

const ZETA12_BASIS: Vertex[] = [0, 1, 2, 3].map((k) => [
  Math.cos((Math.PI * k) / 6),
  Math.sin((Math.PI * k) / 6),
]);

function z12ToXy(p: Z12Point): Vertex {
  let x = 0;
  let y = 0;
  for (let i = 0; i < 4; i++) {
    x += p[i]! * ZETA12_BASIS[i]![0];
    y += p[i]! * ZETA12_BASIS[i]![1];
  }
  return [x, y];
}

const z12Key = (p: Z12Point): string => p.join(",");

/** Lexicographic order on ℤ[ζ12] coefficient tuples (matches Python tuple sort;
 * used only as the `keep` trim's tie-break). */
function z12Cmp(a: Z12Point, b: Z12Point): number {
  for (let i = 0; i < 4; i++) {
    if (a[i]! !== b[i]!) return a[i]! - b[i]!;
  }
  return 0;
}

const Z12_POWERS: Z12Point[] = [[1, 0, 0, 0]];
for (let k = 0; k < 11; k++) Z12_POWERS.push(zeta12Mul(Z12_POWERS[k]!));

// The 14 edge directions of Tile(1,1) in units of 30°, read off Kaplan's
// `spectre` polygon (its frame, since the substitution transforms are stated in
// it). Every edge is a unit step; the repeated 6 is the collinear pair, whose
// shared endpoint is the flat 180° vertex.
const SPECTRE_DIRS = [0, 10, 1, 3, 0, 2, 5, 7, 4, 6, 6, 8, 11, 9];

// The tile's 14 corners, as the closed walk along SPECTRE_DIRS. The flat vertex
// (index 10) stays in the polygon: the tiling is edge to edge with every edge a
// unit step, so a neighbour really does plant a corner there and it must be a
// vertex id for shared-vertex adjacency to find it. Being collinear it does not
// change the drawn tile, and `corners`/`shapeMetrics` drop it before measuring,
// so the tile still reads as the 13-gon it is.
const SPECTRE_OUTLINE: Z12Point[] = (() => {
  const points: Z12Point[] = [];
  let at: Z12Point = Z12_ZERO;
  for (const direction of SPECTRE_DIRS) {
    points.push(at);
    at = z12Add(at, Z12_POWERS[direction]!);
  }
  return points;
})();

/** The four "key" corners Kaplan's rules place clusters by (his spectre_keys). */
const SPECTRE_QUAD: Z12Point[] = [3, 5, 7, 11].map((i) => SPECTRE_OUTLINE[i]!);

/** The rigid motion z ↦ ζ^rot·(mirrored ? conj z : z) + trans. */
type Placement = readonly [number, number, Z12Point];

const PLACE_IDENT: Placement = [0, 0, Z12_ZERO];

/** Kaplan's R = [-1,0,0,0,1,0], the reflection (x, y) ↦ (−x, y): as a complex
 * map z ↦ −conj(z) = ζ⁶·conj(z). Every inflation composes one. */
const SPECTRE_REFLECT: Placement = [6, 1, Z12_ZERO];

function placePoint(at: Placement, p: Z12Point): Z12Point {
  const [rot, mirrored, trans] = at;
  return z12Add(z12Rot(mirrored ? z12Conj(p) : p, rot), trans);
}

/** `a` after `b`. Conjugation negates the inner rotation and conjugates the
 * inner translation, which is all the mirror flag costs. */
function placeCompose(a: Placement, b: Placement): Placement {
  const [aRot, aMirror, aTrans] = a;
  const [bRot, bMirror, bTrans] = b;
  const inner = aMirror ? z12Conj(bTrans) : bTrans;
  return [
    (((aMirror ? aRot - bRot : aRot + bRot) % 12) + 12) % 12,
    aMirror ^ bMirror,
    z12Add(aTrans, z12Rot(inner, aRot)),
  ];
}

// Kaplan's t_rules: (turn in degrees, key corner of the tile just placed, key
// corner of the tile being placed).
const SPECTRE_T_RULES: [number, number, number][] = [
  [60, 3, 1], [0, 2, 0], [60, 3, 1], [60, 3, 1],
  [0, 2, 0], [60, 3, 1], [-120, 3, 3],
];

// Kaplan's super_rules: which cluster type each of the eight child slots takes,
// per parent cluster type. Slot 2 is empty for the Mystic (Gamma), which is why
// it expands to six Spectres where the others expand to seven.
const SPECTRE_RULES: Record<string, (string | null)[]> = {
  Gamma:  ["Pi",  "Delta", null,  "Theta", "Sigma", "Xi",  "Phi",    "Gamma"],
  Delta:  ["Xi",  "Delta", "Xi",  "Phi",   "Sigma", "Pi",  "Phi",    "Gamma"],
  Theta:  ["Psi", "Delta", "Pi",  "Phi",   "Sigma", "Pi",  "Phi",    "Gamma"],
  Lambda: ["Psi", "Delta", "Xi",  "Phi",   "Sigma", "Pi",  "Phi",    "Gamma"],
  Xi:     ["Psi", "Delta", "Pi",  "Phi",   "Sigma", "Psi", "Phi",    "Gamma"],
  Pi:     ["Psi", "Delta", "Xi",  "Phi",   "Sigma", "Psi", "Phi",    "Gamma"],
  Sigma:  ["Xi",  "Delta", "Xi",  "Phi",   "Sigma", "Pi",  "Lambda", "Gamma"],
  Phi:    ["Psi", "Delta", "Psi", "Phi",   "Sigma", "Pi",  "Phi",    "Gamma"],
  Psi:    ["Psi", "Delta", "Psi", "Phi",   "Sigma", "Psi", "Phi",    "Gamma"],
};

/** The Mystic's two tiles: one at rest and one rotated 30° about the tile's
 * corner 8 (Kaplan's Gamma1/Gamma2). */
const SPECTRE_MYSTIC: [string, Placement][] = [
  ["Gamma1", PLACE_IDENT],
  ["Gamma2", [1, 0, SPECTRE_OUTLINE[8]!]],
];

/**
 * One inflation step, from a cluster's key quad to the next: the eight child
 * placements (in SPECTRE_RULES slot order) and the inflated quad, exactly as
 * Kaplan's buildSupertiles does — the placements depend on the quad, so they are
 * recomputed at every level.
 */
function spectreSupertiles(quad: Z12Point[]): [Placement[], Z12Point[]] {
  let placements: Placement[] = [PLACE_IDENT];
  let turned: Placement = PLACE_IDENT;
  let corners = [...quad];
  let total = 0;
  for (const [turn, fromCorner, toCorner] of SPECTRE_T_RULES) {
    total += turn;
    if (turn) {
      turned = [((Math.trunc(total / 30) % 12) + 12) % 12, 0, Z12_ZERO];
      corners = quad.map((p) => placePoint(turned, p));
    }
    const target = placePoint(placements[placements.length - 1]!, quad[fromCorner]!);
    const shift: Placement = [0, 0, z12Sub(target, corners[toCorner]!)];
    placements.push(placeCompose(shift, turned));
  }
  placements = placements.map((at) => placeCompose(SPECTRE_REFLECT, at));
  const inflated = [
    placePoint(placements[6]!, quad[2]!),
    placePoint(placements[5]!, quad[1]!),
    placePoint(placements[3]!, quad[2]!),
    placePoint(placements[0]!, quad[1]!),
  ];
  return [placements, inflated];
}

/** Every tile of a level-`levels` Spectre cluster, as [label, placement]. */
function spectreLeaves(levels: number): [string, Placement][] {
  let quad = SPECTRE_QUAD;
  const tables: Placement[][] = [];
  for (let i = 0; i < levels; i++) {
    const [placements, inflated] = spectreSupertiles(quad);
    quad = inflated;
    tables.push(placements);
  }

  // Every inflation composes one reflection, so a patch grown an odd number of
  // levels comes out mirrored as a whole. Seeding the descent with that same
  // reflection cancels it, and every tile is then unmirrored at any level — the
  // reflection-free tiling this board is.
  let clusters: [string, Placement][] = [
    ["Delta", levels % 2 ? SPECTRE_REFLECT : PLACE_IDENT],
  ];
  for (let i = tables.length - 1; i >= 0; i--) {
    const placements = tables[i]!;
    const next: [string, Placement][] = [];
    for (const [label, at] of clusters) {
      SPECTRE_RULES[label]!.forEach((child, slot) => {
        if (child !== null) next.push([child, placeCompose(at, placements[slot]!)]);
      });
    }
    clusters = next;
  }

  const tiles: [string, Placement][] = [];
  for (const [label, at] of clusters) {
    if (label === "Gamma") {
      // a Mystic is a cluster of two tiles, not one
      for (const [sub, subAt] of SPECTRE_MYSTIC) tiles.push([sub, placeCompose(at, subAt)]);
    } else {
      tiles.push([label, at]);
    }
  }
  return tiles;
}

interface SpectreRow {
  label: string;
  ids: Z12Point[];
  sortedIds: Z12Point[];
  cx: number;
  cy: number;
}

/** Lexicographic order on two tiles' sorted vertex-id lists (equal length). */
function cmpSortedZ12(A: Z12Point[], B: Z12Point[]): number {
  const n = Math.min(A.length, B.length);
  for (let i = 0; i < n; i++) {
    const c = z12Cmp(A[i]!, B[i]!);
    if (c) return c;
  }
  return A.length - B.length;
}

/**
 * The Spectre (Tile(1,1)), the chiral aperiodic monotile, grown by `levels` of
 * the paper's reflection-free substitution from a single Spectre (Delta)
 * cluster: 1, 9, 71, 559, 4401 tiles. `keep` trims the patch to `keep` tiles by
 * Chebyshev distance (a roughly square board with an exact cell count); `null`
 * keeps the whole (ragged) cluster. No tile is ever mirrored.
 *
 * `variant` picks which `keep` tiles: 0 is the centremost block and any other
 * integer a window elsewhere in the same cluster, which is a different board of
 * the same size. See `windowRows`.
 */
export function spectreBoard(
  levels: number,
  mineCount: number,
  keep: number | null = null,
  scale = 21,
  variant = 0,
): Board {
  const rows: SpectreRow[] = [];
  const seen = new Set<string>();
  for (const [label, at] of spectreLeaves(levels)) {
    const ids = SPECTRE_OUTLINE.map((p) => placePoint(at, p));
    const sortedIds = [...ids].sort(z12Cmp);
    const fs = sortedIds.map(z12Key).join(";");
    if (seen.has(fs)) continue; // defensive: a single cluster produces no dups
    seen.add(fs);
    let cx = 0;
    let cy = 0;
    for (const v of ids) {
      const [x, y] = z12ToXy(v);
      cx += x;
      cy += y;
    }
    rows.push({ label, ids, sortedIds, cx: cx / ids.length, cy: cy / ids.length });
  }

  if (import.meta.env.DEV) {
    for (const row of rows) {
      for (const v of row.ids) {
        for (const coeff of v) {
          if (!Number.isSafeInteger(coeff)) {
            throw new Error(`Spectre ℤ[ζ12] coefficient overflow: ${coeff}`);
          }
        }
      }
    }
  }

  // Chebyshev distance from the window's centre, as `penroseBoard` does. The
  // tie-break at the cut rank is the tile's own sorted vertex ids — cell ids do
  // not exist yet here, the trim being what puts the tiles in the order they
  // are numbered in.
  const vertexIds = rows.map((row) => row.ids.map(z12Key));
  const kept = windowRows(
    vertexIds,
    rows.map((row): Vertex => [row.cx, row.cy]),
    (a, b) => cmpSortedZ12(rows[a]!.sortedIds, rows[b]!.sortedIds),
    keep,
    variant,
  );

  const cellMap = new Map<CellId, string[]>();
  const positions = new Map<string, Vertex>();
  kept.forEach((row, i) => {
    rows[row]!.ids.forEach((v, j) => {
      const k = vertexIds[row]![j]!;
      if (!positions.has(k)) positions.set(k, z12ToXy(v));
    });
    cellMap.set(cid(rows[row]!.label, i), vertexIds[row]!);
  });
  return finalizeFlat("spectre", cellMap, positions, mineCount, scale);
}

// -- Ammann–Beenker: squares and 45° rhombi -----------------------------------
//
// The eight-fold aperiodic tiling, by unit squares and unit rhombi with a 45°
// corner, grown by the substitution that inflates it by the silver ratio
// δ = 1 + √2. Every edge runs along one of the eight unit directions ζᵏ
// (ζ = exp(iπ/4)), so every vertex is a point of ℤ[ζ8] — and δ is in that ring
// too (√2 = ζ − ζ³), so inflating is integer arithmetic with nothing rounded.
//
// The substitution runs on rhombi and *half-squares*, as Penrose's runs on
// Robinson triangles: inflated by δ, each edge is one unit edge and one square's
// diagonal (δ = 1 + √2), so the squares along a supertile's rim are cut in half
// by it. A rhombus refills with 3 rhombi + 4 half-squares, a half-square with
// 2 + 3, and the halves are paired back into squares at the end, the unpaired
// ones on the patch's rim dropped. A half-square is marked: (O, P, Q), right
// angle at O and P the end of the diagonal its square's own inflation is
// mirror-symmetric about. The rules were read off the cut-and-project tiling,
// and the Python tests check the board against that definition vertex by
// vertex. Line-for-line port of minesweeper/boards/aperiodic.py; see that file
// for the fuller commentary.

/** A point of ℤ[ζ8] as 4 integer coefficients over (1, ζ, ζ², ζ³), reduced by
 * ζ⁴ = −1. Vertex ids are these tuples, so shared-vertex adjacency is exact. */
type Z8Point = readonly [number, number, number, number];

const Z8_ZERO: Z8Point = [0, 0, 0, 0];

/** Multiply by ζ, i.e. rotate 45°. */
function zeta8Mul(p: Z8Point): Z8Point {
  const [a, b, c, d] = p;
  return [-d, a, b, c];
}

function z8Add(p: Z8Point, q: Z8Point): Z8Point {
  return [p[0] + q[0], p[1] + q[1], p[2] + q[2], p[3] + q[3]];
}

function z8Sub(p: Z8Point, q: Z8Point): Z8Point {
  return [p[0] - q[0], p[1] - q[1], p[2] - q[2], p[3] - q[3]];
}

/** Multiply by ζᵏ, i.e. rotate k·45° about the origin. */
function z8Rot(p: Z8Point, k: number): Z8Point {
  let out = p;
  for (let i = ((k % 8) + 8) % 8; i > 0; i--) out = zeta8Mul(out);
  return out;
}

/** Complex conjugation: ζ⁻¹ = −ζ³, ζ⁻² = −ζ², ζ⁻³ = −ζ. */
function z8Conj(p: Z8Point): Z8Point {
  const [a, b, c, d] = p;
  return [a, -d, -c, -b];
}

/** Multiply by the silver ratio δ = 1 + √2, √2 being ζ − ζ³. */
function z8Silver(p: Z8Point): Z8Point {
  return z8Add(p, z8Sub(zeta8Mul(p), z8Rot(p, 3)));
}

const ZETA8_BASIS: Vertex[] = [0, 1, 2, 3].map((k) => [
  Math.cos((Math.PI * k) / 4),
  Math.sin((Math.PI * k) / 4),
]);

function z8ToXy(p: Z8Point): Vertex {
  let x = 0;
  let y = 0;
  for (let i = 0; i < 4; i++) {
    x += p[i]! * ZETA8_BASIS[i]![0];
    y += p[i]! * ZETA8_BASIS[i]![1];
  }
  return [x, y];
}

const z8Key = (p: Z8Point): string => p.join(",");

/** The unit prototiles, counterclockwise: the rhombus on 1 and ζ, and the
 * half-square (O, P, Q) with its right angle at O and its marked diagonal P→Q. */
const AB_RHOMB: Z8Point[] = [[0, 0, 0, 0], [1, 0, 0, 0], [1, 1, 0, 0], [0, 1, 0, 0]];
const AB_HALF: Z8Point[] = [[0, 0, 0, 0], [1, 0, 0, 0], [0, 0, 1, 0]];

/** z ↦ ζ^rot·(mirrored ? conj z : z) + trans, as the Spectre's, over ℤ[ζ8]. */
type AbPlacement = readonly [number, number, Z8Point];

function abPlace(at: AbPlacement, p: Z8Point): Z8Point {
  const [rot, mirrored, trans] = at;
  return z8Add(z8Rot(mirrored ? z8Conj(p) : p, rot), trans);
}

/** `a` after `b`. */
function abCompose(a: AbPlacement, b: AbPlacement): AbPlacement {
  const [aRot, aMirror] = a;
  const [bRot, bMirror, bTrans] = b;
  return [
    (((aMirror ? aRot - bRot : aRot + bRot) % 8) + 8) % 8,
    aMirror ^ bMirror,
    abPlace(a, bTrans),
  ];
}

type AbKind = "R" | "H";

/** The substitution: each prototile inflated by δ, as the unit tiles that refill
 * it — [kind ("R" rhombus | "H" half-square), placement] in the inflated tile's
 * frame. Must match `_AB_RULES` in minesweeper/boards/aperiodic.py. */
const AB_RULES: Record<AbKind, [AbKind, AbPlacement][]> = {
  R: [
    ["R", [0, 0, [0, 0, 0, 0]]], // at the acute corner A…
    ["R", [0, 0, [1, 1, 1, -1]]], // …and at C
    ["R", [2, 0, [1, 1, 0, -1]]], // across the middle, B to D
    ["H", [2, 0, [1, 1, 0, 0]]], // and a half-square on every edge
    ["H", [3, 1, [1, 1, 1, -1]]],
    ["H", [6, 0, [1, 1, 1, -1]]],
    ["H", [7, 1, [1, 1, 0, 0]]],
  ],
  H: [
    ["R", [0, 1, [0, 1, 0, 0]]], // a rhombus in the P corner
    ["R", [1, 0, [0, 0, 0, 0]]], // and one in the right angle
    ["H", [2, 1, [0, 1, 0, 0]]], // half the middle square, on P→Q
    ["H", [3, 0, [0, 1, 1, 0]]], // and one on each leg
    ["H", [5, 0, [0, 1, 0, 0]]],
  ],
};

/** The eight-rhombus star inflated `levels` times and refilled with unit tiles,
 * as [kind, placement] in the order the substitution lays them. A supertile `n`
 * levels up has edge δⁿ, so its children's translations are the rule's,
 * inflated `n − 1` times. */
function abTiles(levels: number): [AbKind, AbPlacement][] {
  let tiles: [AbKind, AbPlacement][] = [];
  for (let k = 0; k < 8; k++) tiles.push(["R", [k, 0, Z8_ZERO]]);
  for (let depth = levels - 1; depth >= 0; depth--) {
    const rules = {} as Record<AbKind, [AbKind, AbPlacement][]>;
    for (const kind of ["R", "H"] as const) {
      rules[kind] = AB_RULES[kind].map(([child, [rot, mirrored, trans]]) => {
        let t = trans;
        for (let i = 0; i < depth; i++) t = z8Silver(t);
        return [child, [rot, mirrored, t]];
      });
    }
    const next: [AbKind, AbPlacement][] = [];
    for (const [kind, at] of tiles) {
      for (const [child, sub] of rules[kind]) next.push([child, abCompose(at, sub)]);
    }
    tiles = next;
  }
  return tiles;
}

interface AbCell {
  kind: number; // 0 a rhombus, 1 a square
  index: number;
  verts: Z8Point[];
}

/** The patch's rhombi and squares, vertex ids counterclockwise. Half-squares
 * pair into squares on their directed diagonal (P, Q): the two halves of a
 * square are mirror images sharing it. One left waiting at the end is half a
 * square the patch's rim cut, and is dropped, as Penrose drops an unpaired
 * Robinson triangle. */
function abCells(levels: number): AbCell[] {
  const cells: AbCell[] = [];
  const waiting = new Map<string, [Z8Point, number]>();
  const ccw = (ids: Z8Point[], mirrored: number): Z8Point[] =>
    mirrored ? [ids[0]!, ...ids.slice(1).reverse()] : ids;
  for (const [kind, at] of abTiles(levels)) {
    const mirrored = at[1];
    if (kind === "R") {
      const ids = AB_RHOMB.map((p) => abPlace(at, p));
      cells.push({ kind: 0, index: cells.length, verts: ccw(ids, mirrored) });
      continue;
    }
    const [o, p, q] = AB_HALF.map((v) => abPlace(at, v)) as [Z8Point, Z8Point, Z8Point];
    const key = `${z8Key(p)}|${z8Key(q)}`;
    const partner = waiting.get(key);
    if (partner === undefined) {
      waiting.set(key, [o, mirrored]);
      continue;
    }
    waiting.delete(key);
    const [first, firstMirrored] = partner;
    cells.push({ kind: 1, index: cells.length, verts: ccw([first, p, o, q], firstMirrored) });
  }
  return cells;
}

/**
 * The Ammann–Beenker tiling: unit squares and 45° rhombi, eight-fold and
 * aperiodic, grown by `levels` silver-ratio substitutions of the eight-rhombus
 * star (216, 1312, 7784 tiles at levels 2, 3, 4).
 *
 * `keep` trims to that many tiles by Chebyshev distance and `variant` picks
 * which window, exactly as for `penroseBoard`: 0 is the centred block around
 * the eight-fold star, any other integer a window elsewhere in the same patch.
 * See `windowRows`. `scale` is pixels per edge.
 */
export function ammannBeenkerBoard(
  levels: number,
  mineCount: number,
  scale = 30,
  keep: number | null = null,
  variant = 0,
): Board {
  const cells = abCells(levels);

  if (import.meta.env.DEV) {
    for (const cell of cells) {
      for (const v of cell.verts) {
        for (const coeff of v) {
          if (!Number.isSafeInteger(coeff)) {
            throw new Error(`Ammann–Beenker ℤ[ζ8] coefficient overflow: ${coeff}`);
          }
        }
      }
    }
  }

  const vertexIds = cells.map((cell) => cell.verts.map(z8Key));
  const centroids: Vertex[] = cells.map((cell) => {
    let cx = 0;
    let cy = 0;
    for (const v of cell.verts) {
      const [x, y] = z8ToXy(v);
      cx += x;
      cy += y;
    }
    return [cx / 4, cy / 4];
  });
  // The tie-break at the cut rank is the cell id: rhombus or square, then the
  // order the substitution made it.
  const kept = windowRows(
    vertexIds,
    centroids,
    (a, b) => cells[a]!.kind - cells[b]!.kind || cells[a]!.index - cells[b]!.index,
    keep,
    variant,
  );

  const cellMap = new Map<CellId, string[]>();
  const positions = new Map<string, Vertex>();
  for (const i of kept) {
    const cell = cells[i]!;
    cell.verts.forEach((v, j) => {
      const k = vertexIds[i]![j]!;
      if (!positions.has(k)) positions.set(k, z8ToXy(v));
    });
    cellMap.set(cid(cell.kind, cell.index), vertexIds[i]!);
  }
  return finalizeFlat("ammannbeenker", cellMap, positions, mineCount, scale);
}

// -- the brick rings ---------------------------------------------------------
//
// Port of the same section in minesweeper/boards/aperiodic.py. One nonperiodic
// board on the plain integer square lattice, tiled by 2×1 bricks in concentric
// square rings about a 2×2 core — nonperiodic by *symmetry* rather than by a
// substitution, as the phyllotactic spiral above is. Cell ids are the tile's
// lower-left corner and size, so unlike the three tilings above there is no
// trim, no distance to quantise and no sort whose tie-break has to match
// Python's.

/** Lower-left corner, then width and height. */
type Brick = readonly [number, number, number, number];

const brickKey = (x: number, y: number): string => `${x},${y}`;

/**
 * The rectangle walked counterclockwise, split at every lattice point inside
 * one of its edges that is some tile's corner — a T-vertex. Port of
 * `_brick_outline`; the test is conditional on purpose (see the Python
 * docstring: splitting unconditionally would leave half-edges unmatched and
 * drop the Euler characteristic below the 1 a disc must have).
 */
function brickOutline(brick: Brick, corners: ReadonlySet<string>): Vertex[] {
  const [x, y, w, h] = brick;
  const walk: Vertex[] = [
    [x, y],
    [x + w, y],
    [x + w, y + h],
    [x, y + h],
  ];
  const ring: Vertex[] = [];
  for (let i = 0; i < walk.length; i += 1) {
    const a = walk[i]!;
    const b = walk[(i + 1) % walk.length]!;
    const steps = Math.max(Math.abs(b[0] - a[0]), Math.abs(b[1] - a[1]));
    const ux = (b[0] - a[0]) / steps;
    const uy = (b[1] - a[1]) / steps;
    ring.push(a);
    for (let s = 1; s < steps; s += 1) {
      const point: Vertex = [a[0] + ux * s, a[1] + uy * s];
      if (corners.has(brickKey(point[0], point[1]))) ring.push(point);
    }
  }
  return ring;
}

/** Finish a list of axis-aligned bricks into a flat board. */
function brickBoard(
  mode: string,
  bricks: readonly Brick[],
  mineCount: number,
  scale: number,
): Board {
  const corners = new Set<string>();
  for (const [x, y, w, h] of bricks) {
    corners.add(brickKey(x, y));
    corners.add(brickKey(x + w, y));
    corners.add(brickKey(x + w, y + h));
    corners.add(brickKey(x, y + h));
  }
  const cellMap = new Map<CellId, string[]>();
  const positions = new Map<string, Vertex>();
  for (const brick of bricks) {
    const keys = brickOutline(brick, corners).map((p) => {
      const k = brickKey(p[0], p[1]);
      if (!positions.has(k)) positions.set(k, p);
      return k;
    });
    cellMap.set(cid(brick[0], brick[1], brick[2], brick[3]), keys);
  }
  if (cellMap.size !== bricks.length) throw new Error("two bricks share a place");
  return finalizeFlat(mode, cellMap, positions, mineCount, scale);
}

/**
 * The board's bricks, ring by ring outwards from the 2×2 core (port of
 * `_brick_rings_tiles`). Ring k is the boundary of the 2k × 2k square about
 * the origin: `k` horizontal bricks along its top row and `k` along its
 * bottom, then `k - 1` vertical ones up each side. That is `4k - 2` bricks a
 * ring and `2 * rings²` in all — and every run is even, so nothing is ever
 * left over.
 */
export function brickRingsTiles(rings: number): Brick[] {
  if (rings < 1) throw new Error("rings must be >= 1");
  const bricks: Brick[] = [];
  for (let k = 1; k <= rings; k += 1) {
    const lo = -k;
    const hi = k - 1; // the 2k × 2k square, centred on the origin
    for (let x = lo; x < hi; x += 2) {
      // its top and bottom rows...
      bricks.push([x, lo, 2, 1], [x, hi, 2, 1]);
    }
    for (let y = lo + 1; y < hi - 1; y += 2) {
      // ...and its two sides
      bricks.push([lo, y, 1, 2], [hi, y, 1, 2]);
    }
  }
  return bricks;
}

/**
 * 2×1 bricks in `rings` concentric square rings about a 2×2 core, filling the
 * 2`rings` × 2`rings` square. Every tile is a whole brick.
 */
export function brickRingsBoard(rings: number, mineCount: number, scale = 30): Board {
  return brickBoard("brickrings", brickRingsTiles(rings), mineCount, scale);
}

// -- Klaassen's pentagonal spirals ---------------------------------------------
//
// Nonperiodic monohedral tilings by one convex pentagon with n-fold rotational
// symmetry, n = 5, 6, 7 (Klaassen, "Rotationally symmetric tilings with convex
// pentagons and hexagons", Elem. Math. 71, 2016): angles A = C = 180 − 180/n,
// B = 360/n and D + E = 180, sides b = c = 3, a = 1, d = 2. Two copies glued
// along e make the phyllotactic spiral's hexagon at n-fold, scaled by 3, so the
// tiling is that construction — 2n wedges of 180/n°, the odd ones pushed out
// one side along u1 — with every hexagon cut the same way. Vertex ids live in
// ℤ[ζ10], ℤ[ζ12] and ℤ[ζ7] (as ℤ[ζ14]) for n = 5, 6, 7; every vertex is a sum
// of unit directions, so one componentwise add serves all three. Not edge to
// edge: each run of unit steps is split at the points on it that are some
// tile's corner, as `brickOutline` does. Line-for-line port of
// minesweeper/boards/aperiodic.py; see that file for the fuller commentary.

type PentaPoint = readonly number[];

/** Per fold, the unit vector at k·180/n° and the map to the plane. */
const PENTA_RINGS: Record<number, [(k: number) => PentaPoint, (p: PentaPoint) => Vertex]> = {
  5: [(k) => Z_POWERS[((k % 10) + 10) % 10]!, (p) => zToXy(p as ZPoint)],
  6: [(k) => Z12_POWERS[((k % 12) + 12) % 12]!, (p) => z12ToXy(p as Z12Point)],
  7: [(k) => z7Dir(k), (p) => z7ToXy(p as Z7Point)],
};

const vecAdd = (p: PentaPoint, q: PentaPoint): PentaPoint => p.map((x, i) => x + q[i]!);
const vecScale = (p: PentaPoint, k: number): PentaPoint => p.map((x) => x * k);
const pentaKey = (p: PentaPoint): string => p.join(",");

/** One corner of a pentagon and the edge that leaves it: `count` unit steps
 * along u_k (backwards when count < 0), or count 0 for the cut e. */
type PentaCorner = readonly [PentaPoint, number, number];

export interface PentaSpiralTile {
  wedge: number;
  m: number;
  n: number;
  half: number;
  corners: PentaCorner[];
}

/** The 2·`fold` wedges grown `rings` hexagons each way, in wedge order. Half 0
 * is the pentagon with the hexagon's 360/n corner, half 1 its partner. */
export function pentaSpiralTiles(fold: number, rings: number): PentaSpiralTile[] {
  const ring = PENTA_RINGS[fold];
  if (!ring) throw new Error(`no pentagonal spiral with ${fold}-fold symmetry`);
  const [unit] = ring;
  const tiles: PentaSpiralTile[] = [];
  for (let wedge = 0; wedge < 2 * fold; wedge++) {
    const [w0, w1, w2] = [wedge, wedge + 1, wedge + 2];
    const u0 = vecScale(unit(w0), 3);
    const u1 = vecScale(unit(w1), 3);
    const u2 = vecScale(unit(w2), 3);
    const a = vecAdd(u0, u1);
    const b = vecAdd(u1, u2);
    const base = wedge % 2 ? u1 : vecScale(u0, 0);
    for (let m = 0; m < rings; m++) {
      for (let n = 0; n < rings; n++) {
        const v0 = vecAdd(base, vecAdd(vecScale(a, m), vecScale(b, n)));
        const v1 = vecAdd(v0, u0);
        const v2 = vecAdd(v1, u1);
        const v3 = vecAdd(v2, u2);
        const v4 = vecAdd(v0, b);
        const v5 = vecAdd(v0, u2);
        const near = vecAdd(v1, unit(w1)); // the cut, 1 along v1–v2
        const far = vecAdd(v4, vecScale(unit(w1), -1)); // …to 1 short of v4
        tiles.push({
          wedge, m, n, half: 0,
          corners: [[v0, w0, 3], [v1, w1, 1], [near, 0, 0], [far, w1, -2], [v5, w2, -3]],
        });
        tiles.push({
          wedge, m, n, half: 1,
          corners: [[near, w1, 2], [v2, w2, 3], [v3, w0, -3], [v4, w1, -1], [far, 0, 0]],
        });
      }
    }
  }
  return tiles;
}

/** The pentagon's vertices, split at every point inside one of its runs that
 * is a corner in `taken` — a T-vertex. */
function pentaOutline(
  fold: number,
  corners: readonly PentaCorner[],
  taken: ReadonlySet<string>,
): PentaPoint[] {
  const [unit] = PENTA_RINGS[fold]!;
  const ring: PentaPoint[] = [];
  for (const [corner, k, count] of corners) {
    ring.push(corner);
    const step = vecScale(unit(k), count > 0 ? 1 : -1);
    let point = corner;
    for (let s = 1; s < Math.abs(count); s++) {
      point = vecAdd(point, step);
      if (taken.has(pentaKey(point))) ring.push(point);
    }
  }
  return ring;
}

/**
 * Klaassen's pentagonal spiral with `fold`-fold symmetry (5, 6 or 7). Grows the
 * 2n wedges out to `rings` hexagons each way, for 4n·rings² pentagons, then
 * trims to the `keep` centremost by Chebyshev distance exactly as
 * `phyllotaxisBoard` does. `null` keeps the whole patch; `scale` is pixels per
 * unit step (a third of the long side).
 */
export function pentaSpiralBoard(
  fold: number,
  rings: number,
  mineCount: number,
  keep: number | null = null,
  scale = 18,
): Board {
  const ring = PENTA_RINGS[fold];
  if (!ring) throw new Error(`no pentagonal spiral with ${fold}-fold symmetry`);
  const [, toXy] = ring;
  const rows = pentaSpiralTiles(fold, rings).map((tile) => {
    let cx = 0;
    let cy = 0;
    for (const [p] of tile.corners) {
      const [x, y] = toXy(p);
      cx += x;
      cy += y;
    }
    cx /= tile.corners.length;
    cy /= tile.corners.length;
    // Quantised, as for the phyllotactic spiral, so the sort matches Python's.
    const near = Math.floor(Math.max(Math.abs(cx), Math.abs(cy)) * 1e6 + 0.5);
    return { ...tile, near };
  });

  let kept = rows;
  if (keep !== null && keep < rows.length) {
    kept = [...rows]
      .sort(
        (r1, r2) =>
          r1.near - r2.near ||
          r1.wedge - r2.wedge ||
          r1.m - r2.m ||
          r1.n - r2.n ||
          r1.half - r2.half,
      )
      .slice(0, keep);
  }

  const taken = new Set<string>();
  for (const row of kept) for (const [p] of row.corners) taken.add(pentaKey(p));
  const cellMap = new Map<CellId, string[]>();
  const positions = new Map<string, Vertex>();
  for (const row of kept) {
    const keys = pentaOutline(fold, row.corners, taken).map((p) => {
      const k = pentaKey(p);
      if (!positions.has(k)) positions.set(k, toXy(p));
      return k;
    });
    cellMap.set(cid(row.wedge, row.m, row.n, row.half), keys);
  }
  return finalizeFlat(`pentaspiral${fold}`, cellMap, positions, mineCount, scale);
}

export const pentaSpiral5Board = (
  rings: number,
  mineCount: number,
  keep: number | null = null,
  scale = 18,
): Board => pentaSpiralBoard(5, rings, mineCount, keep, scale);

export const pentaSpiral6Board = (
  rings: number,
  mineCount: number,
  keep: number | null = null,
  scale = 18,
): Board => pentaSpiralBoard(6, rings, mineCount, keep, scale);

export const pentaSpiral7Board = (
  rings: number,
  mineCount: number,
  keep: number | null = null,
  scale = 18,
): Board => pentaSpiralBoard(7, rings, mineCount, keep, scale);
