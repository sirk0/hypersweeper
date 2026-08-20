// Port of minesweeper/boards/aperiodic.py — the two aperiodic flat tilings,
// Penrose (P3 rhombi) and the Spectre monotile. Penrose builds float vertex
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

/**
 * An aperiodic Penrose tiling (P3): thick and thin rhombi. Starts from a wheel
 * of ten half-rhombus Robinson triangles, deflates `subdivisions` times, then
 * merges mirror-image triangle halves into rhombi (unpaired rim halves are
 * dropped). `scale` is the wheel radius in pixels; `keep` trims to the `keep`
 * centremost rhombi by Chebyshev distance (a roughly square block); `null`
 * keeps the whole decagonal patch.
 */
export function penroseBoard(
  subdivisions: number,
  mineCount: number,
  scale = 300,
  keep: number | null = null,
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

  let kept = cells;
  if (keep !== null && keep < cells.length) {
    const centroid = new Map<PenroseCell, Vertex>();
    for (const cell of cells) {
      let cx = 0;
      let cy = 0;
      for (const v of cell.verts) {
        const [x, y] = zToXy(v);
        cx += x;
        cy += y;
      }
      centroid.set(cell, [cx / 4, cy / 4]);
    }
    let gx = 0;
    let gy = 0;
    for (const c of centroid.values()) {
      gx += c[0];
      gy += c[1];
    }
    gx /= cells.length;
    gy /= cells.length;
    // Quantised, like the spiral's trim: the patch is ten-fold symmetric, so
    // tiles come in sets at the *same* distance, and the raw float is a cosine
    // whose last bit need not agree with Python's. Compared exactly, a tie at
    // the cut rank is broken the other way in one of the two builds and they
    // keep different tiles -- same cell count, different edge count. Must
    // match `penrose_board` in `minesweeper/boards/aperiodic.py`.
    const cheb = (cell: PenroseCell): number => {
      const c = centroid.get(cell)!;
      const distance = Math.max(Math.abs(c[0] - gx), Math.abs(c[1] - gy));
      return Math.floor(distance * 1e6 + 0.5);
    };
    kept = [...cells].sort(
      (m, n) => cheb(m) - cheb(n) || m.color - n.color || m.index - n.index,
    );
    kept = kept.slice(0, keep);
  }

  const cellMap = new Map<CellId, string[]>();
  const positions = new Map<string, Vertex>();
  for (const cell of kept) {
    const keys = cell.verts.map((v) => {
      const k = zKey(v);
      if (!positions.has(k)) positions.set(k, zToXy(v));
      return k;
    });
    cellMap.set(cid(cell.color, cell.index), keys);
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
 * cluster: 1, 9, 71, 559, 4401 tiles. `keep` trims the patch to its `keep`
 * centremost tiles by Chebyshev distance (a roughly square board with an exact
 * cell count); `null` keeps the whole (ragged) cluster. No tile is ever
 * mirrored.
 */
export function spectreBoard(
  levels: number,
  mineCount: number,
  keep: number | null = null,
  scale = 21,
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

  let kept = rows;
  if (keep !== null && keep < rows.length) {
    let gx = 0;
    let gy = 0;
    for (const r of rows) {
      gx += r.cx;
      gy += r.cy;
    }
    gx /= rows.length;
    gy /= rows.length;
    // Quantised for the same reason as the Penrose trim above: a tie at the
    // cut rank has to break the same way in both builds.
    const cheb = (r: SpectreRow): number =>
      Math.floor(Math.max(Math.abs(r.cx - gx), Math.abs(r.cy - gy)) * 1e6 + 0.5);
    kept = [...rows]
      .sort((r1, r2) => cheb(r1) - cheb(r2) || cmpSortedZ12(r1.sortedIds, r2.sortedIds))
      .slice(0, keep);
  }

  const cellMap = new Map<CellId, string[]>();
  const positions = new Map<string, Vertex>();
  kept.forEach((row, i) => {
    const keys = row.ids.map((v) => {
      const k = z12Key(v);
      if (!positions.has(k)) positions.set(k, z12ToXy(v));
      return k;
    });
    cellMap.set(cid(row.label, i), keys);
  });
  return finalizeFlat("spectre", cellMap, positions, mineCount, scale);
}

// -- brick spiral and brick pinwheel -----------------------------------------
//
// Port of the same section in minesweeper/boards/aperiodic.py. Two nonperiodic
// boards on the plain integer square lattice, tiled by 2×1 bricks wound around
// a centre tile — nonperiodic by how they are *wound* rather than by a
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

/** The brick covering two cells that share an edge. */
function lay(a: readonly [number, number], b: readonly [number, number]): Brick {
  const x = Math.min(a[0], b[0]);
  const y = Math.min(a[1], b[1]);
  return a[1] === b[1] ? [x, y, 2, 1] : [x, y, 1, 2];
}

/**
 * The spiral's bricks, in the order the arm lays them (port of
 * `_brick_spiral_tiles`). `side - 2` shells, each adding one row and one
 * column on two adjacent sides, the corner walking NE, NW, SW, SE and round
 * again; which arm takes the corner cell follows from the rectangle's height,
 * and taking it there is what leaves both arms an even number of cells long.
 */
export function brickSpiralTiles(side: number): Brick[] {
  if (side < 2) throw new Error("side must be >= 2");
  let x0 = 0;
  let y0 = 0;
  let x1 = 2;
  let y1 = 1;
  const bricks: Brick[] = [[0, 0, 2, 1]];
  for (let step = 0; step < side - 2; step += 1) {
    const height = y1 - y0;
    const phase = step % 4;
    const columnX = phase === 0 || phase === 3 ? x1 : x0 - 1;
    const rowY = phase === 0 || phase === 1 ? y1 : y0 - 1;
    if (phase === 0 || phase === 3) x1 += 1;
    else x0 -= 1;
    if (phase === 0 || phase === 1) y1 += 1;
    else y0 -= 1;
    const column: [number, number][] = [];
    const row: [number, number][] = [];
    for (let y = y0; y < y1; y += 1) {
      if (height % 2 !== 0 || y !== rowY) column.push([columnX, y]);
    }
    for (let x = x0; x < x1; x += 1) {
      if (height % 2 === 0 || x !== columnX) row.push([x, rowY]);
    }
    for (const arm of [column, row]) {
      for (let i = 0; i < arm.length; i += 2) bricks.push(lay(arm[i]!, arm[i + 1]!));
    }
  }
  // One last row caps the w × (w - 1) rectangle to a square, on the side the
  // next shell would have grown so the arm carries on rather than doubling
  // back. It is the only run whose length is not forced even: on an odd side
  // the far end is left over, and that lone cell is the board's one 1×1.
  const phase = (side - 2) % 4;
  const rowY = phase === 0 || phase === 1 ? y1 : y0 - 1;
  const strip: [number, number][] = [];
  for (let x = x0; x < x1; x += 1) strip.push([x, rowY]);
  for (let i = 0; i < strip.length - 1; i += 2) bricks.push(lay(strip[i]!, strip[i + 1]!));
  if (strip.length % 2 !== 0) bricks.push([strip[strip.length - 1]![0], rowY, 1, 1]);
  return bricks;
}

/**
 * The pinwheel's bricks, ring by ring outwards from the centre square (port of
 * `_brick_pinwheel_tiles`). Ring k holds 8k cells: four arms of k bricks, the
 * first along the ring's bottom edge and the other three its images under the
 * quarter turn (x, y) → (-y, x). Each arm stops one cell short of the corner,
 * which the next arm round takes — that offset is the pinwheel.
 */
export function brickPinwheelTiles(side: number): Brick[] {
  if (side < 1) throw new Error("side must be >= 1");
  const rings = Math.floor((side - 1) / 2);
  const bricks: Brick[] = [[0, 0, 1, 1]];
  for (let k = 1; k <= rings; k += 1) {
    for (let j = 0; j < k; j += 1) {
      let a: [number, number] = [-k + 2 * j, -k];
      let b: [number, number] = [-k + 2 * j + 1, -k];
      for (let t = 0; t < 4; t += 1) {
        bricks.push(lay(a, b));
        a = [-a[1], a[0]];
        b = [-b[1], b[0]];
      }
    }
  }
  if (side % 2 === 0) {
    // An even side cannot be rings alone (they only ever make an odd square),
    // so one width-1 L shell finishes it: a whole top row, then the right
    // column, whose odd cell count leaves the second 1×1 in the corner.
    const edge = rings + 1;
    for (let x = -rings; x < edge; x += 2) bricks.push([x, edge, 2, 1]);
    for (let y = edge - 1; y > -rings; y -= 2) bricks.push([edge, y - 1, 1, 2]);
    bricks.push([edge, -rings, 1, 1]);
  }
  return bricks;
}

/**
 * A single arm of 2×1 bricks winding out from a central brick, filling a
 * `side` × `side` square. An odd side ends on one 1×1, in a corner.
 */
export function brickSpiralBoard(side: number, mineCount: number, scale = 30): Board {
  return brickBoard("brickspiral", brickSpiralTiles(side), mineCount, scale);
}

/**
 * Square rings of 2×1 bricks pinwheeling about a central 1×1 square, filling a
 * `side` × `side` square. An odd side is four-fold symmetric; an even one adds
 * an L shell and a second 1×1 in a corner.
 */
export function brickPinwheelBoard(side: number, mineCount: number, scale = 30): Board {
  return brickBoard("brickpinwheel", brickPinwheelTiles(side), mineCount, scale);
}
