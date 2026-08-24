// Port of minesweeper/boards/surfaces.py — wrapping the regular flat tilings
// (square / triangle / hexagon) onto 3D surfaces (torus, cylinder, Möbius
// strip, Klein bottle). M3 ports the twelve regular-tiling wraps; the
// Archimedean `arch_*` wraps land with the template engine in M4.
//
// Each wrapped board is built the same way: pick vertex keys on an integer
// grid, glue them at the seam, map each key onto the surface with an immersion
// (torusPoint / cylinderPoint / mobiusPoint / kleinPoint), then hand the cells
// to `assemble`, which shares the adjacency / polygon / Board3D tail and the
// outward-orientation (closed) vs two-sided (open/non-orientable) choice.
//
// Adjacency keys on the *symbolic* (integer) vertex ids, exactly as Python's
// `_shared_vertex_adjacency` does, not on floating-point positions — two cells
// are neighbours iff they share a glued vertex id. Positions are a pure
// function of the canonical (post-glue) vertex id, so a shared id always maps
// to one point and the seam closes.
import {
  cid,
  keepSymmetries,
  orientOutward,
  sharedVertexAdjacency,
  type Board3D,
  type BoardSymmetry,
  type CellId,
  type SurfaceClip,
  type SymmetryCandidate,
  type SymmetryId,
  type Vec3,
} from "./core";
import {
  buildClipSolid,
  fanTriangles,
  pruneSolid,
  reachesSolid,
  trianglesArea,
  trianglesBelow,
  type Tri,
} from "./clipSolid";
import { archTemplate, type ArchTemplate } from "./tilings";

const mod = (a: number, b: number): number => ((a % b) + b) % b;

const TWO_PI = 2 * Math.PI;
const ROOT3 = Math.sqrt(3);

// Pointy-top hex vertex offsets on the integer lattice (shared with tilings).
const HEX_VERTEX_OFFSETS: [number, number][] = [
  [0, -2],
  [1, -1],
  [1, 1],
  [0, 2],
  [-1, 1],
  [-1, -1],
];

/** A unit triangle spanning lattice x..x+2 within lattice row `row` (port of
 * tilings.py `_triangle_vertices`; the x unit is half a side, y the height). */
function triangleVertices(x: number, row: number, up: boolean): [number, number][] {
  return up
    ? [
        [x, row + 1],
        [x + 2, row + 1],
        [x + 1, row],
      ]
    : [
        [x, row],
        [x + 2, row],
        [x + 1, row + 1],
      ];
}

// -- immersions: one point of a surface from its parameters ------------------

/** A donut point at angle `theta` round the ring and `phi` round the tube. */
function torusPoint(theta: number, phi: number, tubeRadius: number): Vec3 {
  const radial = 1 + tubeRadius * Math.cos(phi);
  return [radial * Math.cos(theta), radial * Math.sin(theta), tubeRadius * Math.sin(phi)];
}

/** A unit-radius cylinder point at angle `theta` round the axis, `height` up. */
function cylinderPoint(theta: number, height: number): Vec3 {
  return [Math.cos(theta), height, Math.sin(theta)];
}

/** A Möbius-strip point: `u` the angle round the loop, `v` the signed offset
 * across the half-twisting band. */
function mobiusPoint(u: number, v: number): Vec3 {
  const radial = 1 + v * Math.cos(u / 2);
  return [radial * Math.cos(u), radial * Math.sin(u), v * Math.sin(u / 2)];
}

/** A point on the classic self-intersecting Klein *bottle*. `u` runs the
 * profile round the ring (up the body, over the top, down and through the
 * neck), `v` round the circular cross-section; `tube` scales the thickness.
 * Returned in the parametrization's own frame; the wrap builders recentre it. */
function kleinPoint(u: number, v: number, tube = 1): Vec3 {
  const cu = Math.cos(u);
  const su = Math.sin(u);
  const cv = Math.cos(v);
  const r = tube * (2.5 - 1.5 * cu); // thin at the neck, fat at the belly
  let x: number;
  let y: number;
  if (u < Math.PI) {
    // body: the tube is swept around the profile
    x = 3 * cu * (1 + su) + r * cu * cv;
    y = 8 * su + r * su * cv;
  } else {
    // neck: a straight tube diving through the body
    x = 3 * cu * (1 + su) - r * cv;
    y = 8 * su;
  }
  return [x, y, r * Math.sin(v)];
}

// -- assembly: shared tail for every wrapped board ---------------------------

type Positions = Map<string, Vec3>;
type Cells = Map<CellId, string[]>;

function centroidOf(points: readonly Vec3[]): Vec3 {
  const c: Vec3 = [0, 0, 0];
  for (const p of points) {
    c[0] += p[0];
    c[1] += p[1];
    c[2] += p[2];
  }
  return [c[0] / points.length, c[1] / points.length, c[2] / points.length];
}

/** Wind a polygon outward, away from the ring circle through the tube centre
 * (the outside of a closed torus). */
function orientFromRing(polygon: Vec3[]): Vec3[] {
  const centroid = centroidOf(polygon);
  const ringScale = Math.hypot(centroid[0], centroid[1]) || 1;
  const ringPoint: Vec3 = [centroid[0] / ringScale, centroid[1] / ringScale, 0];
  const outward: Vec3 = [
    centroid[0] - ringPoint[0],
    centroid[1] - ringPoint[1],
    centroid[2] - ringPoint[2],
  ];
  return orientOutward(polygon, outward);
}

function maxRadius(positions: Positions): number {
  let r = 0;
  for (const p of positions.values()) r = Math.max(r, Math.hypot(p[0], p[1], p[2]));
  return r;
}

/** Shift every position so their centroid sits at the origin (the bottle
 * immersion is not origin-centred; the 3D view frames and pivots about the
 * origin). Mutates `positions` and returns the offset that was subtracted, so
 * `kleinClip` can map board space back into the immersion's own frame. */
function kleinRecentre(positions: Positions): Vec3 {
  const c = centroidOf([...positions.values()]);
  for (const [k, p] of positions) positions.set(k, [p[0] - c[0], p[1] - c[1], p[2] - c[2]]);
  return c;
}

// -- the Klein bottle's self-intersection ------------------------------------
//
// The bottle passes through itself in exactly one place, and only the neck
// branch is involved: a body point (u < π) has y = sin u·(8 + r·cos v) > 0 and
// a neck point (u ≥ π) has y = 8·sin u < 0, so those two only ever meet at the
// seams. Two neck cross-sections share a y plane — the fat one at
// u₁ = π − asin(y/8) (r ∈ (2.5, 4]) and the thin one at u₂ = 2π + asin(y/8)
// (r ∈ (1, 2.5]) — and the thin tube dives straight through the fat one.
//
// The patch of the fat sheet that ends up *inside* the thin tube is what caps
// the view down the bore. Seen from outside the bottle the thin tube's own
// wall stands in front of that patch, so cutting it away opens the hole up and
// leaves the rest of the board as it was — the neck is still plainly seen
// plunging through the belly, which is the self-intersection one wants to read.
//
// The two circles above are what the *immersion* does; what the board draws is
// tiles, flat ones, so the drawn tube is the polygon inscribed in its circle.
// Only the classification below (which sheet a cell is on) reads the circles —
// the cut itself is made against the drawn triangles, in `clipSolid.ts`, which
// is what keeps the two sheets meeting edge to edge instead of leaving a slit
// along the self-intersection and eating the tiles at the bottom of the bottle,
// where the two circles converge and the chords between them cross over.

/** Centre of the neck's cross-section circle at `u`, in the x–z plane. */
function neckCentreX(u: number): number {
  return 3 * Math.cos(u) * (1 + Math.sin(u));
}

function kleinTubeRadius(u: number, tubeScale: number): number {
  return tubeScale * (2.5 - 1.5 * Math.cos(u));
}

/** How far outside the *thin* neck tube a point (in the immersion's own frame)
 * lies: negative inside it, positive outside, and +∞ where no thin
 * cross-section reaches (the whole body half of the bottle). */
function thinTubeDepth(p: Vec3, tubeScale: number): number {
  const y = p[1];
  if (y > 0 || y < -8) return Infinity;
  const u = TWO_PI + Math.asin(Math.max(-1, Math.min(1, y / 8)));
  return Math.hypot(p[0] - neckCentreX(u), p[2]) - kleinTubeRadius(u, tubeScale);
}

/** Same, for the fat cross-section that shares the point's y plane. A surface
 * point sits *on* its own circle, so whichever of the two depths is nearer to
 * zero tells which sheet the point belongs to. */
function fatTubeDepth(p: Vec3, tubeScale: number): number {
  const y = p[1];
  if (y > 0 || y < -8) return Infinity;
  const u = Math.PI - Math.asin(Math.max(-1, Math.min(1, y / 8)));
  return Math.hypot(p[0] - neckCentreX(u), p[2]) - kleinTubeRadius(u, tubeScale);
}

/** Which sheet of the neck a cell is part of, or null for the body (where no
 * thin cross-section reaches). Its *vertices* lie exactly on their own
 * cross-section circle, so the sheet whose depths are nearer zero over the
 * whole polygon is the one it belongs to — unlike the centroid, which on a
 * coarse board sits a good way inside its own tube. */
function neckSheet(poly: readonly Vec3[], tubeScale: number): "fat" | "thin" | null {
  // The body sits at y >= 0 and touches y = 0 only along the two seams, so a
  // cell is on the neck exactly when some vertex of it hangs below. Without
  // that a body cell whose seam corner reads as depth 0 would join the tube
  // and bound an enclosed region where there is nothing but the belly.
  if (!poly.some((p) => p[1] < 0)) return null;
  let score = 0;
  for (const p of poly) {
    const thin = thinTubeDepth(p, tubeScale);
    if (!Number.isFinite(thin)) continue; // the body half: no thin section here
    score += Math.abs(thin) - Math.abs(fatTubeDepth(p, tubeScale));
  }
  return score > 0 ? "fat" : "thin";
}

/** The clip for a Klein board: the enclosed region the renderer cuts its cells
 * against, plus the handful of cells the cut reaches. The region is built from
 * the *drawn* triangles of the thin tube — the same centroid fan the renderer
 * lays its opaque base layer down as — so a cell comes off exactly where the
 * tube that is meant to hide it begins, on every tiling and at every size.
 * `offset` is what `kleinRecentre` subtracted, so the sheet classification can
 * read the immersion's own frame while the region stays in board space. */
function kleinClip(
  cells: Cells,
  positions: Positions,
  offset: Vec3,
  tubeScale: number,
): SurfaceClip {
  const raw = (p: Vec3): Vec3 => [p[0] + offset[0], p[1] + offset[1], p[2] + offset[2]];
  const seam = -offset[1]; // board-space height of the immersion's own y = 0
  const fat: [CellId, Vec3[]][] = [];
  const tube: Tri[] = [];
  for (const [cell, keys] of cells) {
    const poly = keys.map((k) => positions.get(k)!);
    const sheet = neckSheet(poly.map(raw), tubeScale);
    // Only the fat sheet is ever cut, so the thin tube the player looks down
    // stays whole — cutting that one instead would empty the hole out.
    if (sheet === "fat") fat.push([cell, poly]);
    else if (sheet === "thin") tube.push(...fanTriangles(poly, centroidOf(poly)));
  }
  const occluder = trianglesBelow(tube, seam);
  const whole = buildClipSolid(occluder);
  const clipped = new Set<CellId>();
  const reached: Vec3[][] = [];
  for (const [cell, poly] of fat) {
    const tris = fanTriangles(poly, centroidOf(poly));
    // Exact rather than sampled: the enclosed patch can sit wholly inside one
    // big cell, and a sliver off one corner is still a sliver that has to go.
    if (reachesSolid(tris, whole, CLIP_MIN_AREA * trianglesArea(tris))) {
      clipped.add(cell);
      reached.push(poly);
    }
  }
  // The whole tube's interior is decomposed to find those cells; only the part
  // of it near them is ever subtracted from anything, and the rest is a few
  // thousand pieces a phone would carry around for the length of the game.
  return { cells: clipped, solid: pruneSolid(whole, reached), occluder };
}

/** Below this share of its own area a cell is not worth cutting. All round the
 * bottom of the bottle the tube's rim *is* the other sheet's rim — they share
 * their vertices — so the two meet in slivers that are rounding rather than
 * geometry, and re-cutting a cell to drop a ten-thousandth of it buys nothing
 * but triangles. What is left uncut is inside the tube, where it cannot be
 * seen; leaving a hair too much is the safe way to be wrong. */
const CLIP_MIN_AREA = 1e-4;

interface AssembleOpts {
  twoSided: boolean;
  radius: number | ((positions: Positions) => number);
  /** Symmetries this builder *offers*; `assemble` keeps the ones that really
   * are automorphisms of the adjacency it builds. Several may share an id (two
   * candidate mirror axes, a translation and the glide that stands in for it
   * when the plain one misses the lattice) — the first that survives wins. */
  symmetries?: SymmetryCandidate[];
  clip?: SurfaceClip | null;
  // Per-cell "is this polygon vertex a real corner" mask, in polygon order —
  // see Board3D.cornerMask. Only the Archimedean/Laves wraps (surfaces built
  // from an ArchTemplate) pass one; reversed in lockstep with the polygon
  // whenever this cell's orientation gets flipped below.
  cornerMask?: Map<CellId, boolean[]> | null;
}

/** Build adjacency and polygons and wrap them in a Board3D. Closed surfaces
 * (`twoSided` false) orient each face outward from the ring; open or
 * non-orientable ones keep both sides. */
function assemble(
  mode: string,
  cells: Cells,
  positions: Positions,
  mineCount: number,
  { twoSided, radius, symmetries = [], clip = null, cornerMask = null }: AssembleOpts,
): Board3D {
  const adjacency = sharedVertexAdjacency(cells);
  const polygons = new Map<CellId, Vec3[]>();
  const masks = cornerMask ? new Map<CellId, boolean[]>() : null;
  for (const [cell, keys] of cells) {
    const poly = keys.map((k) => positions.get(k)!);
    const oriented = twoSided ? poly : orientFromRing(poly);
    polygons.set(cell, oriented);
    if (masks) {
      const mask = cornerMask!.get(cell);
      if (mask) masks.set(cell, oriented[0] === poly[0] ? mask : [...mask].reverse());
    }
  }
  const r = typeof radius === "function" ? radius(positions) : radius;
  // Deferred, as a flat board's are (core.ts `flatBoard`): a board's symmetries
  // are wanted once, when it goes on screen, and the conformance suite builds
  // every board in the catalogue at every difficulty without ever asking.
  let kept: BoardSymmetry[] | null = null;
  return {
    mode,
    polygons,
    adjacency,
    mineCount,
    radius: r,
    twoSided,
    get symmetries(): BoardSymmetry[] {
      return (kept ??= keepSymmetries(adjacency, symmetries));
    },
    clip,
    cornerMask: masks,
  };
}

// -- board symmetries --------------------------------------------------------
//
// A wrapped board is a flat tiling glued to itself, so the motions of the plane
// that survive the gluing permute its cells. Those that do are what the UI
// offers as controls: they move the *contents* along the surface while the
// geometry stays put, which is how a cell hidden behind the Klein bottle's neck
// or down the inside of a donut is brought out where it can be played.
//
// Which motions survive is a question about the gluing, not about the tiling,
// and the answers are not the obvious ones. A donut keeps both translations and
// (where the tiling is not chiral) both mirrors. A Klein bottle keeps the ring
// translation and the mirrors, but *not* the tube translation: crossing the ring
// seam reverses the tube, so conjugating a tube step by it gives that step back
// inverted, and only the half-tube step -- which is its own inverse -- descends.
// An open surface has no translation across it at all, and only the reflection
// in its own centre line, since any other would take the band off itself -- but
// it can still be turned end over end, a half turn about a horizontal axis
// through its middle, which reverses *both* directions at once and is a
// symmetry of the tube whether or not either mirror is (a chiral tiling has no
// mirror anywhere and still has this).
//
// So a builder offers candidates and the board measures them: `keepSymmetries`
// throws out anything that is not an automorphism of the adjacency it just
// built. Nothing here is asserted from the algebra above -- the algebra only
// says which candidates are worth offering.

/** Sorted, joined vertex-key set -- a frozenset stand-in for matching a cell to
 * its moved image. */
function vertexSetKey(keys: string[]): string {
  return [...keys].sort().join(";");
}

/** The cell permutation a permutation of the *vertex keys* induces, or null
 * when it induces none: a cell whose moved vertex set is no cell of this board,
 * or two cells landing on one. Adjacency here is "these two cells share a
 * vertex key", so a vertex map that carries every cell onto a cell is an
 * automorphism -- but the vertex map itself need not be one, which is why
 * `keepSymmetries` measures the result rather than trusting it. */
function cellsUnderVertexMap(
  cells: Cells,
  vertexMap: (key: string) => string,
): Map<CellId, CellId> | null {
  const byVertexSet = new Map<string, CellId>();
  for (const [cell, keys] of cells) byVertexSet.set(vertexSetKey(keys), cell);
  const moved = new Map<CellId, CellId>();
  for (const [cell, keys] of cells) {
    const target = byVertexSet.get(vertexSetKey(keys.map(vertexMap)));
    if (target === undefined) return null;
    moved.set(cell, target);
  }
  return moved;
}

/** A motion of a two-coordinate lattice (the regular wraps' vertex keys are
 * `"a,b"`), or of the domain grid the Archimedean wraps key by. */
type LatticeMotion = (a: number, b: number) => [number, number];
type DomainMotion = (m: number, n: number, tag: string) => [number, number, string];

/** Candidates for a board whose vertex keys are `"a,b"` lattice pairs: apply
 * the motion, then the board's own seam canonicalization. */
function latticeCandidates(
  cells: Cells,
  canonical: LatticeMotion,
  motions: readonly (readonly [SymmetryId, LatticeMotion])[],
): SymmetryCandidate[] {
  return motions.map(([id, motion]) => ({
    id,
    build: () =>
      cellsUnderVertexMap(cells, (key) => {
        const cut = key.indexOf(",");
        const [a, b] = motion(Number(key.slice(0, cut)), Number(key.slice(cut + 1)));
        const [ca, cb] = canonical(a, b);
        return `${ca},${cb}`;
      }),
  }));
}

/** The same for the Archimedean wraps, whose vertex keys are
 * `"domainColumn,domainRow,tag"` and whose tag is itself an `"x,y"` pair. */
function domainCandidates(
  cells: Cells,
  canonical: DomainMotion,
  motions: readonly (readonly [SymmetryId, DomainMotion | null])[],
): SymmetryCandidate[] {
  return motions.map(([id, motion]) => ({
    id,
    build: () =>
      motion === null
        ? null
        : cellsUnderVertexMap(cells, (key) => {
            const parts = key.split(",");
            const [m, n, tag] = motion(
              Number(parts[0]),
              Number(parts[1]),
              parts.slice(2).join(","),
            );
            const c = canonical(m, n, tag);
            return `${c[0]},${c[1]},${c[2]}`;
          }),
  }));
}

/** How far apart two template vertices may be and still be the same one. Tags
 * are rounded to 1e-6 and a Laves dual's vertices are computed centroids of
 * those, so a tiling is only symmetric to about that; the closest two genuinely
 * different vertices in any template here are orders of magnitude further
 * apart. Matches tilings.ts FLIP_TOL. */
const MIRROR_TOL = 1e-4;

/** Find `(x, y)` among the template's own vertices, as the tag it lands on and
 * the domain copy it lands in. Null when it is no vertex of the tiling. */
function tagAt(
  t: ArchTemplate,
  x: number,
  y: number,
): { tag: string; dm: number; dn: number } | null {
  const dm = Math.floor(x / t.width + 1e-5);
  const dn = Math.floor(y / t.height + 1e-5);
  const rx = x - dm * t.width;
  const ry = y - dn * t.height;
  for (const [tag, v] of t.verts) {
    if (Math.abs(v[0] - rx) < MIRROR_TOL && Math.abs(v[1] - ry) < MIRROR_TOL) {
      return { tag, dm, dn };
    }
  }
  return null;
}

/** The coordinates a reflection of the vertex set can be centred on. Any such
 * reflection sends the first vertex to *some* vertex, which fixes it, so this
 * short list is all there is to try -- and reflecting about `axis` and about
 * `axis + width` are the same motion once the board is wrapped, so no more are
 * wanted. `coordinate` picks the axis: 0 for a vertical mirror line, 1 for a
 * horizontal one. */
function mirrorAxes(t: ArchTemplate, coordinate: 0 | 1): number[] {
  const first = [...t.verts.values()][0];
  if (first === undefined) return [];
  return [...t.verts.values()].map((v) => first[coordinate] + v[coordinate]);
}

/** Which of `levels` a candidate centred at `raw` can be slid onto by whole
 * domain rows -- the tiling repeats every `height`, so a level is reachable
 * exactly when it agrees with the candidate's own modulo that. `null` means the
 * surface leaves the line free, which is what a closed direction allows, and
 * the candidate keeps its own. */
function levelsFor(t: ArchTemplate, raw: number, levels: readonly number[] | null): number[] {
  if (levels === null) return [raw];
  return levels.filter((level) => {
    const gap = ((level - raw) % t.height + t.height) % t.height;
    return Math.min(gap, t.height - gap) < MIRROR_TOL;
  });
}

/** The template's own tag table for a motion of the plane, or null when the
 * motion is no symmetry of the vertex set. `image` says where the motion sends
 * a vertex at (x, y) within one domain. */
function tagTable(
  t: ArchTemplate,
  image: (x: number, y: number) => [number, number],
): Map<string, { tag: string; dm: number; dn: number }> | null {
  const table = new Map<string, { tag: string; dm: number; dn: number }>();
  for (const [tag, v] of t.verts) {
    const [x, y] = image(v[0], v[1]);
    const at = tagAt(t, x, y);
    if (at === null) return null;
    table.set(tag, at);
  }
  return table;
}

function tableSignature(table: Map<string, { tag: string; dm: number; dn: number }>): string {
  return [...table].map(([k, v]) => `${k}>${v.tag}@${v.dm},${v.dn}`).join("|");
}

/** Half turns of a template, as motions of the domain grid: `(x, y) -> (across
 * - x, level - y)`, which reverses both directions at once.
 *
 * This is the motion an open surface keeps when neither mirror survives -- a
 * cylinder or a Möbius band turned end over end -- and a **chiral** tiling,
 * which has no mirror anywhere, still has it. That is the same fact that lets
 * the snubs wrap a cylinder with two matching rims (see THE CUT in tilings.ts).
 *
 * A half turn sends the first vertex to *some* vertex, and that one pairing
 * fixes both coordinates of its centre, so there is one candidate per vertex.
 * `levels` restricts the horizontal line the centre may lie on: an open band
 * can only be turned about its own centre line, and a Klein bottle only about
 * the two the ring seam leaves standing. Null leaves it free, which is what a
 * donut allows. */
function templateHalfTurns(t: ArchTemplate, levels: readonly number[] | null): DomainMotion[] {
  const found: DomainMotion[] = [];
  const seen = new Set<string>();
  const across = mirrorAxes(t, 0);
  const down = mirrorAxes(t, 1);
  for (let i = 0; i < across.length; i++) {
    for (const level of levelsFor(t, down[i]!, levels)) {
      const table = tagTable(t, (x, y) => [across[i]! - x, level - y]);
      if (table === null) continue;
      const signature = tableSignature(table);
      if (seen.has(signature)) continue;
      seen.add(signature);
      found.push((m, n, tag) => {
        const image = table.get(tag)!;
        return [-m + image.dm, -n + image.dn, image.tag];
      });
    }
  }
  return found;
}

/** Reflections of a template in a *horizontal* line, `y -> level - y`.
 *
 * The x coordinate is untouched, so a **glide** -- p4g's mirror, which carries
 * half a domain along the ring with it -- matches nothing here and is never
 * offered, which is what `keepSymmetries` would do with it anyway. `levels` as
 * for `templateHalfTurns`. */
function templateYMirrors(t: ArchTemplate, levels: readonly number[] | null): DomainMotion[] {
  const found: DomainMotion[] = [];
  const seen = new Set<string>();
  for (const raw of mirrorAxes(t, 1)) {
    for (const level of levelsFor(t, raw, levels)) {
      const table = tagTable(t, (x, y) => [x, level - y]);
      if (table === null) continue;
      const signature = tableSignature(table);
      if (seen.has(signature)) continue;
      seen.add(signature);
      found.push((m, n, tag) => {
        const image = table.get(tag)!;
        return [m + image.dm, -n + image.dn, image.tag];
      });
    }
  }
  return found;
}

/** Reflections of a template in a *vertical* line, `x -> axis - x`. The
 * template records only the horizontal mirror, the one the Möbius and Klein
 * seams are glued through, so this one is looked for. */
function templateXMirrors(t: ArchTemplate): DomainMotion[] {
  const found: DomainMotion[] = [];
  const seen = new Set<string>();
  for (const axis of mirrorAxes(t, 0)) {
    const table = tagTable(t, (x, y) => [axis - x, y]);
    if (table === null) continue;
    const signature = tableSignature(table);
    if (seen.has(signature)) continue;
    seen.add(signature);
    found.push((m, n, tag) => {
      const image = table.get(tag)!;
      return [-m + image.dm, n + image.dn, image.tag];
    });
  }
  return found;
}

// -- the donut ---------------------------------------------------------------

/** A donut tiled with `ring * tube` quadrilaterals, wrapping in both
 * directions, so every cell has exactly 8 neighbours. */
export function torusBoard(
  ring: number,
  tube: number,
  mineCount: number,
  tubeRadius = 0.45,
): Board3D {
  const cells: Cells = new Map();
  const positions: Positions = new Map();
  const put = (i: number, j: number): string => {
    const k = `${i},${j}`;
    if (!positions.has(k)) {
      positions.set(k, torusPoint(TWO_PI * i / ring, TWO_PI * j / tube, tubeRadius));
    }
    return k;
  };
  for (let i = 0; i < ring; i++) {
    for (let j = 0; j < tube; j++) {
      cells.set(cid(i, j), [
        put(i, j),
        put((i + 1) % ring, j),
        put((i + 1) % ring, (j + 1) % tube),
        put(i, (j + 1) % tube),
      ]);
    }
  }
  // A donut keeps every motion of the square lattice that its two periods do:
  // both translations, and the two mirrors in the axes through the seams.
  const symmetries = latticeCandidates(
    cells,
    (i, j) => [mod(i, ring), mod(j, tube)],
    [
      ["ring", (i, j) => [i + 1, j]],
      ["tube", (i, j) => [i, j + 1]],
      ["turn", (i, j) => [-i, -j]],
      ["mirror-ring", (i, j) => [-i, j]],
      ["mirror-tube", (i, j) => [i, -j]],
    ],
  );
  return assemble("torus", cells, positions, mineCount, {
    twoSided: false,
    radius: 1 + tubeRadius,
    symmetries,
  });
}

/** A donut tiled with the regular triangular tiling, exactly as the cylinder
 * is: `ring` triangles around the ring in every row (must be even, so up/down
 * triangles alternate across the seam) and `tube` rows around the tube (must
 * be even, so the offset rows meet cleanly where the tube closes). */
export function torusTriangleBoard(
  ring: number,
  tube: number,
  mineCount: number,
  tubeRadius = 0.45,
): Board3D {
  if (ring % 2) throw new Error("ring must be even for the triangle strip to wrap");
  if (tube % 2) throw new Error("tube must be even so the offset rows wrap");
  const cells: Cells = new Map();
  const positions: Positions = new Map();
  const put = (kx: number, ky: number): string => {
    const i = mod(kx, ring);
    const j = mod(ky, tube);
    const k = `${i},${j}`;
    if (!positions.has(k)) {
      positions.set(k, torusPoint(TWO_PI * i / ring, TWO_PI * j / tube, tubeRadius));
    }
    return k;
  };
  for (let r = 0; r < tube; r++) {
    for (let i = 0; i < ring; i++) {
      cells.set(
        cid(r, i),
        triangleVertices(i, r, (r + i) % 2 === 0).map(([kx, ky]) => put(kx, ky)),
      );
    }
  }
  // Up and down triangles alternate along a row and up the rows alike, so the
  // tiling's own translations are two lattice columns and two rows -- one of
  // either takes an up triangle to a down one, which is no cell of the board.
  const symmetries = latticeCandidates(
    cells,
    (kx, ky) => [mod(kx, ring), mod(ky, tube)],
    [
      ["ring", (kx, ky) => [kx + 2, ky]],
      ["tube", (kx, ky) => [kx, ky + 2]],
      // a half turn about the lattice origin, or about the point half a cell
      // over: up and down triangles alternate, so which one lands on a cell
      // depends on the parity of the row count
      ["turn", (kx, ky) => [-kx, -ky]],
      ["turn", (kx, ky) => [1 - kx, -ky]],
      ["mirror-ring", (kx, ky) => [-kx, ky]],
      ["mirror-tube", (kx, ky) => [kx, -ky]],
    ],
  );
  return assemble("torustri", cells, positions, mineCount, {
    twoSided: false,
    radius: 1 + tubeRadius,
    symmetries,
  });
}

/** A donut tiled entirely with hexagons (the torus has Euler characteristic
 * 0). The lattice wraps round the tube (`rows`, must be even) and the ring
 * (`cols`); every cell has 6 neighbours. */
export function torusHexBoard(
  rows: number,
  cols: number,
  mineCount: number,
  tubeRadius = 0.45,
): Board3D {
  if (rows % 2) throw new Error("rows must be even so the offset lattice wraps");
  const kxPeriod = 2 * cols;
  const kyPeriod = 3 * rows;
  const cells: Cells = new Map();
  const positions: Positions = new Map();
  const put = (kx: number, ky: number): string => {
    const k = `${kx},${ky}`;
    if (!positions.has(k)) {
      positions.set(k, torusPoint(TWO_PI * kx / kxPeriod, TWO_PI * ky / kyPeriod, tubeRadius));
    }
    return k;
  };
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const kx = 2 * c + (r % 2) + 1;
      const ky = 3 * r + 2;
      cells.set(
        cid(r, c),
        HEX_VERTEX_OFFSETS.map(([ox, oy]) =>
          put((kx + ox + kxPeriod) % kxPeriod, (ky + oy + kyPeriod) % kyPeriod),
        ),
      );
    }
  }
  // Alternate rows of hexagons are offset half a column, so the tube
  // translation is two rows (ky += 6) and the tube mirror is the one whose axis
  // runs through a row of cell centres (ky = 2), not through ky = 0.
  const symmetries = latticeCandidates(
    cells,
    (kx, ky) => [mod(kx, kxPeriod), mod(ky, kyPeriod)],
    [
      ["ring", (kx, ky) => [kx + 2, ky]],
      ["tube", (kx, ky) => [kx, ky + 6]],
      ["turn", (kx, ky) => [-kx, 4 - ky]],
      ["turn", (kx, ky) => [1 - kx, 4 - ky]],
      ["mirror-ring", (kx, ky) => [-kx, ky]],
      ["mirror-tube", (kx, ky) => [kx, 4 - ky]],
    ],
  );
  return assemble("torushex", cells, positions, mineCount, {
    twoSided: false,
    radius: 1 + tubeRadius,
    symmetries,
  });
}

// -- the Möbius strip --------------------------------------------------------

/** A Möbius strip tiled with quadrilaterals: `ring` segments around,
 * `widthCells` across. After a full loop the strip flips, so column `ring`
 * glues to column 0 upside down. */
export function mobiusBoard(ring: number, widthCells: number, mineCount: number): Board3D {
  const halfWidth = Math.min(0.7, (Math.PI * widthCells) / ring / 2);
  const cells: Cells = new Map();
  const positions: Positions = new Map();
  const key = (i: number, j: number): [number, number] =>
    i >= ring ? [i - ring, widthCells - j] : [i, j];
  const put = (i: number, j: number): string => {
    const [ci, cj] = key(i, j);
    const k = `${ci},${cj}`;
    if (!positions.has(k)) {
      positions.set(k, mobiusPoint(TWO_PI * ci / ring, halfWidth * (2 * cj / widthCells - 1)));
    }
    return k;
  };
  for (let i = 0; i < ring; i++) {
    for (let j = 0; j < widthCells; j++) {
      cells.set(cid(i, j), [put(i, j), put(i + 1, j), put(i + 1, j + 1), put(i, j + 1)]);
    }
  }
  // The band is open across, so nothing translates that way; the one
  // reflection it has across itself is in its own centre line. Along the loop
  // both a translation and a reflection survive the flipped seam.
  const symmetries = latticeCandidates(
    cells,
    (i, j) => (mod(Math.floor(i / ring), 2) ? [mod(i, ring), widthCells - j] : [mod(i, ring), j]),
    [
      ["ring", (i, j) => [i + 1, j]],
      // end over end: the one motion across the band that needs no mirror
      ["turn", (i, j) => [-i, widthCells - j]],
      ["mirror-ring", (i, j) => [-i, j]],
      ["mirror-tube", (i, j) => [i, widthCells - j]],
    ],
  );
  return assemble("mobius", cells, positions, mineCount, {
    twoSided: true,
    radius: 1 + halfWidth,
    symmetries,
  });
}

/** A Möbius strip tiled with the regular triangular tiling, exactly as the
 * cylinder is: `ring` triangles around the loop in every row, `rows` rows
 * across the strip. After a full loop the strip flips, so the seam glues row
 * `r` to row `rows - 1 - r`; the mirror lands on the offset lattice only when
 * `ring` and `rows` share a parity. */
export function mobiusTriangleBoard(
  ring: number,
  rows: number,
  mineCount: number,
): Board3D {
  if ((ring - rows) % 2) {
    throw new Error("ring and rows must share a parity for the flipped seam");
  }
  // lattice x unit is half a triangle side; row height matches the cylinder's
  const halfWidth = Math.min(0.7, (rows * ROOT3 * 0.9 * Math.PI) / ring);
  const cells: Cells = new Map();
  const positions: Positions = new Map();
  // crossing the seam flips the strip across its centre line
  const key = (kx: number, ky: number): [number, number] =>
    kx >= ring ? [kx - ring, rows - ky] : [kx, ky];
  const put = (kx: number, ky: number): string => {
    const [ci, cj] = key(kx, ky);
    const k = `${ci},${cj}`;
    if (!positions.has(k)) {
      positions.set(k, mobiusPoint(TWO_PI * ci / ring, halfWidth * (2 * cj / rows - 1)));
    }
    return k;
  };
  for (let r = 0; r < rows; r++) {
    for (let i = 0; i < ring; i++) {
      cells.set(
        cid(r, i),
        triangleVertices(i, r, (r + i) % 2 === 0).map(([kx, ky]) => put(kx, ky)),
      );
    }
  }
  const symmetries = latticeCandidates(
    cells,
    (kx, ky) => (mod(Math.floor(kx / ring), 2) ? [mod(kx, ring), rows - ky] : [mod(kx, ring), ky]),
    [
      ["ring", (kx, ky) => [kx + 2, ky]],
      ["turn", (kx, ky) => [-kx, rows - ky]],
      ["turn", (kx, ky) => [1 - kx, rows - ky]],
      ["mirror-ring", (kx, ky) => [-kx, ky]],
      // reversing y turns an up triangle into a down one, so the centre-line
      // mirror lands on the board's own cells only for an even row count
      ["mirror-tube", (kx, ky) => [kx, rows - ky]],
    ],
  );
  return assemble("mobiustri", cells, positions, mineCount, {
    twoSided: true,
    radius: 1 + halfWidth,
    symmetries,
  });
}

/** A Möbius strip tiled with hexagons: `ring` columns of `rows` hexagons
 * glued end-to-start with a vertical flip. `rows` must be odd. */
export function mobiusHexBoard(ring: number, rows: number, mineCount: number): Board3D {
  if (rows % 2 === 0) throw new Error("rows must be odd so the lattice survives the flip");
  const kxPeriod = 2 * ring;
  const kyTop = 3 * rows + 1;
  const halfWidth = Math.min(0.7, (Math.PI * rows) / ring);
  const cells: Cells = new Map();
  const positions: Positions = new Map();
  const key = (kx: number, ky: number): [number, number] =>
    kx >= kxPeriod ? [kx - kxPeriod, kyTop - ky] : [kx, ky];
  const put = (kx: number, ky: number): string => {
    const [ckx, cky] = key(kx, ky);
    const k = `${ckx},${cky}`;
    if (!positions.has(k)) {
      positions.set(k, mobiusPoint(TWO_PI * ckx / kxPeriod, halfWidth * (2 * cky / kyTop - 1)));
    }
    return k;
  };
  for (let c = 0; c < ring; c++) {
    for (let r = 0; r < rows; r++) {
      const kx = 2 * c + (r % 2) + 1;
      const ky = 3 * r + 2;
      cells.set(
        cid(r, c),
        HEX_VERTEX_OFFSETS.map(([ox, oy]) => put(kx + ox, ky + oy)),
      );
    }
  }
  const symmetries = latticeCandidates(
    cells,
    (kx, ky) =>
      mod(Math.floor(kx / kxPeriod), 2)
        ? [mod(kx, kxPeriod), kyTop - ky]
        : [mod(kx, kxPeriod), ky],
    [
      ["ring", (kx, ky) => [kx + 2, ky]],
      ["turn", (kx, ky) => [-kx, kyTop - ky]],
      ["turn", (kx, ky) => [1 - kx, kyTop - ky]],
      ["mirror-ring", (kx, ky) => [-kx, ky]],
      ["mirror-tube", (kx, ky) => [kx, kyTop - ky]],
    ],
  );
  return assemble("mobiushex", cells, positions, mineCount, {
    twoSided: true,
    radius: 1 + halfWidth,
    symmetries,
  });
}

// -- the Klein bottle --------------------------------------------------------

/** A Klein bottle tiled with `ring * tube` quadrilaterals, shaped as the
 * classic self-intersecting bottle. The cross-section (`tube`, must be even)
 * wraps straight; after a full loop round the ring the tube seam glues flipped
 * (`j -> tube/2 - j - 1`), so the surface is closed yet non-orientable. Carries
 * the ring translation, so the UI can move cell contents past the
 * self-intersection, and the half-tube step, which brings the sheet inside the
 * neck out. A whole-tube step is *not* among them: the seam reverses the tube,
 * so conjugating one by the seam gives it back inverted (see the symmetry note
 * above `keepSymmetries`). */
export function kleinBoard(
  ring: number,
  tube: number,
  mineCount: number,
  tubeScale = 1,
): Board3D {
  if (tube % 2) throw new Error("tube must be even so the seam reflection lands on cells");
  const half = tube / 2;
  const key = (i: number, j: number): [number, number] =>
    i >= ring
      ? [i - ring, ((half - j - 1) % tube + tube) % tube]
      : [i, ((j % tube) + tube) % tube];
  const cells: Cells = new Map();
  const positions: Positions = new Map();
  const put = (i: number, j: number): string => {
    const [ci, cj] = key(i, j);
    const k = `${ci},${cj}`;
    if (!positions.has(k)) {
      // half-cell offset in v keeps every vertex off the self-intersection
      // circle (v = 0, π), so no two distinct vertices coincide
      positions.set(k, kleinPoint(TWO_PI * ci / ring, (TWO_PI * (cj + 0.5)) / tube, tubeScale));
    }
    return k;
  };
  for (let i = 0; i < ring; i++) {
    for (let j = 0; j < tube; j++) {
      cells.set(cid(i, j), [put(i, j), put(i + 1, j), put(i + 1, j + 1), put(i, j + 1)]);
    }
  }
  const clip = kleinClip(cells, positions, kleinRecentre(positions), tubeScale);

  // `key` only glues one loop; a motion may cross the seam any number of times,
  // and the flip is an involution, so it is the parity of the loops that counts.
  const canonical = (i: number, j: number): [number, number] =>
    mod(Math.floor(i / ring), 2)
      ? [mod(i, ring), mod(half - j - 1, tube)]
      : [mod(i, ring), mod(j, tube)];
  const symmetries = latticeCandidates(cells, canonical, [
    ["ring", (i, j) => [i + 1, j]],
    ["tube", (i, j) => [i, j + half]],
    ["turn", (i, j) => [-i, half - 1 - j]],
    ["turn", (i, j) => [-i, tube - 1 - j]],
    ["mirror-ring", (i, j) => [-i, j]],
    // a tube mirror survives only in the two axes the seam's own flip fixes
    ["mirror-tube", (i, j) => [i, half - 1 - j]],
    ["mirror-tube", (i, j) => [i, tube - 1 - j]],
  ]);
  return assemble("klein", cells, positions, mineCount, {
    twoSided: true,
    radius: maxRadius,
    symmetries,
    clip,
  });
}

/** A Klein bottle tiled with the regular triangular tiling, exactly as the
 * cylinder is: `ring` triangles around the ring in every row, `tube` rows
 * around the cross-section (must be even, so the offset rows meet where the
 * tube closes). The tube wraps straight; the ring seam glues it flipped
 * (`ky -> tube/2 - 1 - ky`, the reflection the bottle immersion makes there),
 * which lands on the offset lattice only when `ring` and `tube / 2 - 1` share
 * a parity. The board scrolls by *two* lattice columns: one column moves the
 * offset rows onto each other and is no symmetry of the triangular lattice,
 * while two columns is the tiling's own ring translation. */
export function kleinTriangleBoard(
  ring: number,
  tube: number,
  mineCount: number,
  tubeScale = 1,
): Board3D {
  if (tube % 2) throw new Error("tube must be even so the seam reflection lands on cells");
  const flip = tube / 2 - 1;
  if ((ring - flip) % 2) {
    throw new Error("ring and tube / 2 - 1 must share a parity for the seam");
  }
  // crossing the ring seam flips the tube
  const key = (kx: number, ky: number): [number, number] =>
    kx >= ring ? [kx - ring, mod(flip - ky, tube)] : [mod(kx, ring), mod(ky, tube)];
  const cells: Cells = new Map();
  const positions: Positions = new Map();
  const put = (kx: number, ky: number): string => {
    const canon = key(kx, ky);
    const k = `${canon[0]},${canon[1]}`;
    if (!positions.has(k)) {
      // half-cell offset in v keeps every vertex off the self-intersection
      // circle (v = 0, π), so no two distinct vertices coincide
      positions.set(
        k,
        kleinPoint(TWO_PI * canon[0] / ring, (TWO_PI * (canon[1] + 0.5)) / tube, tubeScale),
      );
    }
    return k;
  };
  for (let r = 0; r < tube; r++) {
    for (let i = 0; i < ring; i++) {
      cells.set(
        cid(r, i),
        triangleVertices(i, r, (r + i) % 2 === 0).map(([kx, ky]) => put(kx, ky)),
      );
    }
  }
  const clip = kleinClip(cells, positions, kleinRecentre(positions), tubeScale);

  const canonical = (kx: number, ky: number): [number, number] =>
    mod(Math.floor(kx / ring), 2)
      ? [mod(kx, ring), mod(flip - ky, tube)]
      : [mod(kx, ring), mod(ky, tube)];
  const symmetries = latticeCandidates(cells, canonical, [
    // one lattice column moves the offset rows onto each other and is no
    // symmetry of the triangular lattice; two columns is its ring translation
    ["ring", (kx, ky) => [kx + 2, ky]],
    // half the tube, and -- where that lands an up triangle on a down one --
    // the glide that carries a column along with it
    ["tube", (kx, ky) => [kx, ky + tube / 2]],
    ["tube", (kx, ky) => [kx + 1, ky + tube / 2]],
    ["turn", (kx, ky) => [-kx, flip - ky]],
    ["turn", (kx, ky) => [1 - kx, flip - ky]],
    ["turn", (kx, ky) => [-kx, flip + tube / 2 - ky]],
    ["turn", (kx, ky) => [1 - kx, flip + tube / 2 - ky]],
    ["mirror-ring", (kx, ky) => [-kx, ky]],
    ["mirror-tube", (kx, ky) => [kx, flip - ky]],
    ["mirror-tube", (kx, ky) => [kx, flip + tube / 2 - ky]],
  ]);
  return assemble("kleintri", cells, positions, mineCount, {
    twoSided: true,
    radius: maxRadius,
    symmetries,
    clip,
  });
}

/** A Klein bottle tiled entirely with hexagons: `ring` columns around the
 * loop, `rows` (must be even) hexagons around the tube. The tube wraps
 * straight; the ring seam glues the tube reflected (`ky -> 4 - ky`). */
export function kleinHexBoard(
  ring: number,
  rows: number,
  mineCount: number,
  tubeScale = 1,
): Board3D {
  if (rows % 2) throw new Error("rows must be even so the tube lattice wraps");
  const kxPeriod = 2 * ring;
  const kyPeriod = 3 * rows;
  const key = (kx: number, ky: number): [number, number] =>
    kx >= kxPeriod
      ? [((kx - kxPeriod) % kxPeriod + kxPeriod) % kxPeriod, ((4 - ky) % kyPeriod + kyPeriod) % kyPeriod]
      : [((kx % kxPeriod) + kxPeriod) % kxPeriod, ((ky % kyPeriod) + kyPeriod) % kyPeriod];
  const cells: Cells = new Map();
  const positions: Positions = new Map();
  const put = (kx: number, ky: number): string => {
    const canon = key(kx, ky);
    const k = `${canon[0]},${canon[1]}`;
    if (!positions.has(k)) {
      // centre v on ky = 2 (the seam mirror axis) and offset by π/2 so the
      // immersion's seam reflection matches the ky -> 4 - ky lattice flip
      positions.set(
        k,
        kleinPoint(
          TWO_PI * canon[0] / kxPeriod,
          (TWO_PI * (canon[1] - 2)) / kyPeriod + Math.PI / 2,
          tubeScale,
        ),
      );
    }
    return k;
  };
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < ring; c++) {
      const kx = 2 * c + (r % 2) + 1;
      const ky = 3 * r + 2;
      cells.set(
        cid(r, c),
        HEX_VERTEX_OFFSETS.map(([ox, oy]) => put(kx + ox, ky + oy)),
      );
    }
  }
  const clip = kleinClip(cells, positions, kleinRecentre(positions), tubeScale);

  const canonical = (kx: number, ky: number): [number, number] =>
    mod(Math.floor(kx / kxPeriod), 2)
      ? [mod(kx, kxPeriod), mod(4 - ky, kyPeriod)]
      : [mod(kx, kxPeriod), mod(ky, kyPeriod)];
  const symmetries = latticeCandidates(cells, canonical, [
    ["ring", (kx, ky) => [kx + 2, ky]],
    // half the tube is rows/2 rows of hexagons, and alternate rows are offset
    // half a column, so an odd half needs the glide
    ["tube", (kx, ky) => [kx, ky + kyPeriod / 2]],
    ["tube", (kx, ky) => [kx + 1, ky + kyPeriod / 2]],
    ["turn", (kx, ky) => [-kx, 4 - ky]],
    ["turn", (kx, ky) => [1 - kx, 4 - ky]],
    ["turn", (kx, ky) => [-kx, 4 + kyPeriod / 2 - ky]],
    ["turn", (kx, ky) => [1 - kx, 4 + kyPeriod / 2 - ky]],
    ["mirror-ring", (kx, ky) => [-kx, ky]],
    ["mirror-tube", (kx, ky) => [kx, 4 - ky]],
    ["mirror-tube", (kx, ky) => [kx, 4 + kyPeriod / 2 - ky]],
  ]);
  return assemble("kleinhex", cells, positions, mineCount, {
    twoSided: true,
    radius: maxRadius,
    symmetries,
    clip,
  });
}

// -- the cylinder ------------------------------------------------------------

/** The side surface of a cylinder tiled with quadrilaterals: `ring` segments
 * around, `rows` up the axis. Open ends, so the inside is visible. */
export function cylinderBoard(ring: number, rows: number, mineCount: number): Board3D {
  const rowHeight = (TWO_PI / ring) * 0.9; // near-square tiles
  const height = rows * rowHeight;
  const cells: Cells = new Map();
  const positions: Positions = new Map();
  const put = (i: number, j: number): string => {
    const k = `${i},${j}`;
    if (!positions.has(k)) {
      positions.set(k, cylinderPoint(TWO_PI * i / ring, j * rowHeight - height / 2));
    }
    return k;
  };
  for (let i = 0; i < ring; i++) {
    for (let j = 0; j < rows; j++) {
      cells.set(cid(i, j), [put(i, j), put((i + 1) % ring, j), put((i + 1) % ring, j + 1), put(i, j + 1)]);
    }
  }
  // Open at both ends: a turn about the axis and the two mirrors, but no
  // translation along it.
  const symmetries = latticeCandidates(
    cells,
    (i, j) => [mod(i, ring), j],
    [
      ["ring", (i, j) => [i + 1, j]],
      // end over end about a horizontal axis: an open tube still has this
      ["turn", (i, j) => [-i, rows - j]],
      ["mirror-ring", (i, j) => [-i, j]],
      ["mirror-tube", (i, j) => [i, rows - j]],
    ],
  );
  return assemble("cylinder", cells, positions, mineCount, {
    twoSided: true,
    radius: Math.hypot(1, height / 2),
    symmetries,
  });
}

/** The side of a cylinder tiled with triangles: `ring` triangles around (must
 * be even so up/down triangles alternate across the seam), `rows` up. */
export function cylinderTriangleBoard(ring: number, rows: number, mineCount: number): Board3D {
  if (ring % 2) throw new Error("ring must be even for the triangle strip to wrap");
  const rowHeight = (TWO_PI / ring) * ROOT3 * 0.9;
  const height = rows * rowHeight;
  const cells: Cells = new Map();
  const positions: Positions = new Map();
  const put = (kx: number, ky: number): string => {
    const wx = ((kx % ring) + ring) % ring;
    const k = `${wx},${ky}`;
    if (!positions.has(k)) {
      positions.set(k, cylinderPoint(TWO_PI * wx / ring, ky * rowHeight - height / 2));
    }
    return k;
  };
  for (let r = 0; r < rows; r++) {
    for (let i = 0; i < ring; i++) {
      cells.set(
        cid(r, i),
        triangleVertices(i, r, (r + i) % 2 === 0).map(([kx, ky]) => put(kx, ky)),
      );
    }
  }
  const symmetries = latticeCandidates(
    cells,
    (kx, ky) => [mod(kx, ring), ky],
    [
      ["ring", (kx, ky) => [kx + 2, ky]],
      ["turn", (kx, ky) => [-kx, rows - ky]],
      ["turn", (kx, ky) => [1 - kx, rows - ky]],
      ["mirror-ring", (kx, ky) => [-kx, ky]],
      ["mirror-tube", (kx, ky) => [kx, rows - ky]],
    ],
  );
  return assemble("cyltri", cells, positions, mineCount, {
    twoSided: true,
    radius: Math.hypot(1, height / 2),
    symmetries,
  });
}

/** The side of a cylinder tiled with hexagons: `ring` columns around, `rows`
 * up the axis. */
export function cylinderHexBoard(ring: number, rows: number, mineCount: number): Board3D {
  const kxPeriod = 2 * ring;
  const kyUnit = TWO_PI / kxPeriod / ROOT3;
  const height = (3 * rows + 1) * kyUnit;
  const cells: Cells = new Map();
  const positions: Positions = new Map();
  const put = (kx: number, ky: number): string => {
    const wx = ((kx % kxPeriod) + kxPeriod) % kxPeriod;
    const k = `${wx},${ky}`;
    if (!positions.has(k)) {
      positions.set(k, cylinderPoint(TWO_PI * wx / kxPeriod, ky * kyUnit - height / 2));
    }
    return k;
  };
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < ring; c++) {
      const kx = 2 * c + (r % 2) + 1;
      const ky = 3 * r + 2;
      cells.set(
        cid(r, c),
        HEX_VERTEX_OFFSETS.map(([ox, oy]) => put(kx + ox, ky + oy)),
      );
    }
  }
  const symmetries = latticeCandidates(
    cells,
    (kx, ky) => [mod(kx, kxPeriod), ky],
    [
      ["ring", (kx, ky) => [kx + 2, ky]],
      ["turn", (kx, ky) => [-kx, 3 * rows + 1 - ky]],
      ["turn", (kx, ky) => [1 - kx, 3 * rows + 1 - ky]],
      ["mirror-ring", (kx, ky) => [-kx, ky]],
      // the band runs ky = 0 .. 3*rows + 1, so its centre line is that top
      ["mirror-tube", (kx, ky) => [kx, 3 * rows + 1 - ky]],
    ],
  );
  return assemble("cylhex", cells, positions, mineCount, {
    twoSided: true,
    radius: Math.hypot(1, height / 2),
    symmetries,
  });
}

// -- Archimedean tilings wrapped onto the same surfaces ----------------------
//
// Port of the arch_* wrap builders in surfaces.py. Each takes an nx x ny grid
// of the tiling's fundamental-domain copies (an `archTemplate`) and glues the
// seams with the same modular arithmetic the regular wraps use, mapping each
// canonical (domain-column, domain-row, tag) vertex key onto the surface.

/** An Archimedean tiling wrapped around a donut: `nx` domain copies around the
 * ring, `ny` around the tube. */
/** Move every vertex the tiling runs *through* back onto its chord.
 *
 * A tiling that is not edge to edge carries vertices a neighbour's corner sits
 * inside the edge of. In the plane the point lies on the line whether it is
 * placed there or computed from its own coordinates. On a curved surface the
 * line has become a chord, and a point placed on the *surface* stands off it:
 * the tile whose edge it splits kinks outward, and where a run of them crosses
 * one tile — the three-brick basket weave lays three bricks across one square
 * block — the block breaks into strips each cutting its own chord, which is
 * what read as gaps and slivers.
 *
 * `template.straight` says which vertices those are and which chord each
 * belongs on; here they are moved back onto it, in 3D, after the rest of the
 * surface is placed. `anchor` is the builder's own key for a vertex offset
 * from another, which is where the seam glue lives: on a Möbius strip or a
 * Klein bottle it is `canonical`, so a chord crossing the seam is the chord of
 * the two ends as *that* board glues them. Port of `_wrapped_positions` in
 * boards/surfaces.py. */
function straightenPositions(
  t: ArchTemplate,
  cells: Cells,
  positions: Positions,
  anchor: (m: number, n: number, tag: string) => string,
): void {
  if (t.straight.size === 0) return;
  // a vertex on a rim stays where it is: a cylinder's rims and a Möbius band's
  // edge run along a horizontal line of the tiling wherever one is available,
  // which draws them as clean circles, and pulling their through vertices in
  // onto chords scallops that circle
  const used = new Map<string, number>();
  for (const keys of cells.values()) {
    for (let i = 0; i < keys.length; i++) {
      const a = keys[i]!;
      const b = keys[(i + 1) % keys.length]!;
      const edge = a < b ? `${a}|${b}` : `${b}|${a}`;
      used.set(edge, (used.get(edge) ?? 0) + 1);
    }
  }
  const rim = new Set<string>();
  for (const [edge, count] of used) {
    if (count === 1) for (const key of edge.split("|")) rim.add(key);
  }
  const placed: [string, Vec3][] = [];
  for (const key of positions.keys()) {
    if (rim.has(key)) continue;
    // a position key is `${m},${n},${tag}` and a tag is itself `${x},${y}`
    const parts = key.split(",");
    const tag = parts.slice(2).join(",");
    const rule = t.straight.get(tag);
    if (rule === undefined) continue;
    const m = Number(parts[0]);
    const n = Number(parts[1]);
    const a = positions.get(anchor(m + rule.a.dm, n + rule.a.dn, rule.a.tag));
    const b = positions.get(anchor(m + rule.b.dm, n + rule.b.dn, rule.b.tag));
    if (a === undefined || b === undefined) continue; // an end off the window
    placed.push([key, [
      a[0] + (b[0] - a[0]) * rule.t,
      a[1] + (b[1] - a[1]) * rule.t,
      a[2] + (b[2] - a[2]) * rule.t,
    ]]);
  }
  for (const [key, p] of placed) positions.set(key, p);
}

export function archTorusBoard(
  tiling: string,
  nx: number,
  ny: number,
  mineCount: number,
  tubeRadius = 0.45,
): Board3D {
  const t = archTemplate(tiling);
  const W = t.width;
  const H = t.height;
  const ring = nx * W;
  const tube = ny * H;
  const cells = new Map<CellId, string[]>();
  const positions = new Map<string, Vec3>();
  const cornerMask = new Map<CellId, boolean[]>();
  for (let m = 0; m < nx; m++) {
    for (let n = 0; n < ny; n++) {
      for (const { name, refs, real } of t.cells) {
        const keys = refs.map((r) => {
          const M = mod(m + r.dm, nx);
          const N = mod(n + r.dn, ny);
          const ks = `${M},${N},${r.tag}`;
          if (!positions.has(ks)) {
            const v = t.verts.get(r.tag)!;
            positions.set(
              ks,
              torusPoint(TWO_PI * (M * W + v[0]) / ring, TWO_PI * (N * H + v[1]) / tube, tubeRadius),
            );
          }
          return ks;
        });
        if (new Set(keys).size < keys.length) {
          throw new Error(`${nx}x${ny} is too small for ${tiling}`);
        }
        const key = cid(m, n, name);
        cells.set(key, keys);
        cornerMask.set(key, real);
      }
    }
  }
  straightenPositions(t, cells, positions, (m, n, tag) => `${mod(m, nx)},${mod(n, ny)},${tag}`);
  // Both domain translations, and every rotation and mirror the tiling itself
  // has: a donut is closed both ways, so no motion of the plane is ruled out by
  // the gluing and the horizontal line a mirror or a half turn is centred on is
  // free (`null` below).
  const symmetries = domainCandidates(
    cells,
    (m, n, tag) => [mod(m, nx), mod(n, ny), tag],
    [
      ["ring", (m, n, tag) => [m + 1, n, tag]],
      ["tube", (m, n, tag) => [m, n + 1, tag]],
      ...templateHalfTurns(t, null).map((m) => ["turn", m] as const),
      ...templateYMirrors(t, null).map((m) => ["mirror-tube", m] as const),
      ...templateXMirrors(t).map((m) => ["mirror-ring", m] as const),
    ],
  );
  return assemble("torus" + tiling, cells, positions, mineCount, {
    twoSided: false,
    radius: 1 + tubeRadius,
    symmetries,
    cornerMask,
  });
}

/** An Archimedean tiling around the side of a cylinder: `ring` domain copies
 * around, `rows` (may be fractional) up the axis, open ends. The strip runs
 * from `template.cut` to `cut + rows*height`.
 *
 * A cylinder's two rims must be the same curve, or the tube reads as cut off
 * square at one end and ragged at the other. That asks the strip to be
 * symmetric about its own centre line, `cut + rows*height/2`, under an isometry
 * the cylinder itself has: a mirror in that plane, or a half turn about a
 * horizontal axis in it (which a chiral tiling with no mirror still offers, and
 * which is why the snubs wrap a cylinder but no Möbius strip). `template.flips`
 * holds the heights where the tiling does one or the other, so the centre line
 * has to land on one of them, and `rows` is what puts it there. See THE CUT in
 * tilings.ts. */
export function archCylinderBoard(
  tiling: string,
  ring: number,
  rows: number,
  mineCount: number,
): Board3D {
  const t = archTemplate(tiling);
  const W = t.width;
  const H = t.height;
  const cut = t.cut;
  const unit = TWO_PI / (ring * W); // arc length of one edge unit
  const middle = (rows * H) / 2 + cut;
  if (!t.flips.length) {
    throw new Error(
      `${tiling} never reverses y (p3 has no mirror and no half turn), ` +
        "so no strip of it has two matching rims",
    );
  }
  // whole half periods between the strip's centre line and a flip level; the
  // slack is the float noise in a level measured off tile centroids, orders of
  // magnitude under the gap between one row of centres and the next
  const periods = t.flips.map((flip) => (middle - flip) / (H / 2));
  if (Math.min(...periods.map((p) => Math.abs(p - Math.round(p)))) > 1e-5) {
    throw new Error(
      `rows ${rows} leaves the ${tiling} rims different curves: the strip's ` +
        `centre line is ${(((middle % (H / 2)) + H / 2) % (H / 2)).toFixed(4)} into the rows ` +
        `and the tiling only reverses y at ${t.flips.map((f) => f.toFixed(4)).join(", ")} ` +
        `(mod ${(H / 2).toFixed(4)})`,
    );
  }
  const centroids = new Map<string, number>();
  for (const { name, refs } of t.cells) {
    let s = 0;
    for (const r of refs) s += r.dn * H + t.verts.get(r.tag)![1];
    centroids.set(name, s / refs.length);
  }
  const cells = new Map<CellId, string[]>();
  const positions = new Map<string, Vec3>();
  const cornerMask = new Map<CellId, boolean[]>();
  const nMax = Math.ceil(rows) + 1;
  for (let m = 0; m < ring; m++) {
    for (let n = 0; n < nMax; n++) {
      for (const { name, refs, real } of t.cells) {
        const c = centroids.get(name)! + n * H;
        if (!(cut - 1e-9 <= c && c < rows * H + cut - 1e-9)) continue;
        const keys = refs.map((r) => {
          const M = mod(m + r.dm, ring);
          const N = n + r.dn;
          const ks = `${M},${N},${r.tag}`;
          if (!positions.has(ks)) {
            const v = t.verts.get(r.tag)!;
            positions.set(ks, cylinderPoint((M * W + v[0]) * unit, (N * H + v[1] - middle) * unit));
          }
          return ks;
        });
        if (new Set(keys).size < keys.length) {
          throw new Error(`ring ${ring} is too small for ${tiling}`);
        }
        const key = cid(m, n, name);
        cells.set(key, keys);
        cornerMask.set(key, real);
      }
    }
  }
  straightenPositions(t, cells, positions, (m, n, tag) => `${mod(m, ring)},${n},${tag}`);
  // The strip's own centre line is the only horizontal line it can be flipped
  // about: any other would carry the band off itself. It is guaranteed to be
  // one the tiling reverses y at -- that is what `flips` was checked for above,
  // and it is what makes the two rims the same curve -- but a mirror and a half
  // turn are two different ways of doing it and a chiral tiling has only the
  // second, which is how the snubs wrap a cylinder at all.
  const centreLine = [2 * middle];
  const symmetries = domainCandidates(
    cells,
    (m, n, tag) => [mod(m, ring), n, tag],
    [
      ["ring", (m, n, tag) => [m + 1, n, tag]],
      ...templateHalfTurns(t, centreLine).map((m) => ["turn", m] as const),
      ...templateYMirrors(t, centreLine).map((m) => ["mirror-tube", m] as const),
      ...templateXMirrors(t).map((m) => ["mirror-ring", m] as const),
    ],
  );
  return assemble("cyl" + tiling, cells, positions, mineCount, {
    twoSided: true,
    radius: maxRadius,
    symmetries,
    cornerMask,
  });
}

/** An Archimedean tiling on a Möbius strip: `ring` domain copies around, `rows`
 * across; after a full loop the strip glues to its start flipped through
 * `template.mirror`. Chiral tilings are refused; p4g (glide-only) counts
 * half-domains, so `ring` must be odd there.
 *
 * The band runs from `template.cut` to `cut + rows*height`, and `rows`
 * may be fractional exactly as on the cylinder. What is *not* free is its
 * fractional part: a Möbius strip has one edge, so the seam glues the band's
 * bottom rim to its top, and the flip y -> 2*cut + strip - y is a symmetry of
 * the tiling only when `rows + 2*cut/height` is a whole number of periods.
 * See THE MOBIUS CUT in tilings.ts. */
export function archMobiusBoard(
  tiling: string,
  ring: number,
  rows: number,
  mineCount: number,
): Board3D {
  const t = archTemplate(tiling);
  const mirror = t.mirror;
  if (mirror === null) throw new Error(`${tiling} is chiral and cannot wrap a Möbius strip`);
  let halves: number;
  if (t.glide) {
    if (ring % 2 === 0) throw new Error("ring counts half-domains and must be odd");
    halves = ring;
  } else {
    halves = 2 * ring;
  }
  const W = t.width;
  const H = t.height;
  const cut = t.cut;
  const q = Math.floor(halves / 2);
  const odd = halves % 2;
  const length = (halves * W) / 2;
  const strip = rows * H;
  // whole periods between the band's two rims, counted from the cut
  const seamRaw = rows + (2 * cut) / H;
  if (Math.abs(seamRaw - Math.round(seamRaw)) > 1e-6) {
    throw new Error(
      `rows ${rows} does not close the ${tiling} seam: rows + 2*cut/height = ` +
        `${seamRaw}, which must be a whole number`,
    );
  }
  const seam = Math.round(seamRaw);
  const halfWidth = Math.min(0.7, (Math.PI * strip) / length / 2);

  const flipped = (mi: number, ni: number, tag: string): [number, number, string] => {
    const im = mirror.get(tag)!;
    return [mi + im.dm - odd, seam - 1 - ni + im.dn, im.tag];
  };
  const canonical = (mi: number, ni: number, tag: string): [number, number, string] => {
    while (2 * mi + (2 * t.verts.get(tag)![0]) / W >= halves - 1e-5) {
      [mi, ni, tag] = flipped(mi - q, ni, tag);
    }
    while (2 * mi + (2 * t.verts.get(tag)![0]) / W < -1e-5) {
      [mi, ni, tag] = flipped(mi + q + odd, ni, tag);
    }
    return [mi, ni, tag];
  };
  const point = (mi: number, ni: number, tag: string): Vec3 => {
    const v = t.verts.get(tag)!;
    const u = TWO_PI * (mi * W + v[0]) / length;
    const vv = halfWidth * ((2 * (ni * H + v[1] - cut)) / strip - 1);
    return mobiusPoint(u, vv);
  };

  const centroids = new Map<string, number>();
  const heights = new Map<string, number>();
  for (const { name, refs } of t.cells) {
    let sx = 0;
    let sy = 0;
    for (const r of refs) {
      sx += r.dm * W + t.verts.get(r.tag)![0];
      sy += r.dn * H + t.verts.get(r.tag)![1];
    }
    centroids.set(name, sx / refs.length);
    heights.set(name, sy / refs.length);
  }
  const cells = new Map<CellId, string[]>();
  const positions = new Map<string, Vec3>();
  const cornerMask = new Map<CellId, boolean[]>();
  for (let m = 0; m < q + 1; m++) {
    // every row copy that can reach into the band: a cell's centroid sits
    // in [0, height), so copy n spans [n*H, (n+1)*H)
    for (let n = Math.floor(cut / H); n <= Math.floor((cut + strip) / H); n++) {
      for (const { name, refs, real } of t.cells) {
        const c = centroids.get(name)! + m * W;
        if (!(-1e-9 <= c && c < length - 1e-9)) continue;
        const y = heights.get(name)! + n * H;
        if (!(cut - 1e-9 <= y && y < cut + strip - 1e-9)) continue;
        const keys = refs.map((r) => {
          const [mi, ni, tag] = canonical(m + r.dm, n + r.dn, r.tag);
          const ks = `${mi},${ni},${tag}`;
          if (!positions.has(ks)) positions.set(ks, point(mi, ni, tag));
          return ks;
        });
        if (new Set(keys).size < keys.length) {
          throw new Error(`ring ${ring} is too small for ${tiling}`);
        }
        const key = cid(m, n, name);
        cells.set(key, keys);
        cornerMask.set(key, real);
      }
    }
  }
  straightenPositions(t, cells, positions, (m, n, tag) => {
    const c = canonical(m, n, tag);
    return `${c[0]},${c[1]},${c[2]}`;
  });
  // The band's own centre line, as on the cylinder -- `flipped` is that same
  // reflection with the seam's half-loop x-shift on top.
  const centreLine = [seam * H];
  const symmetries = domainCandidates(cells, canonical, [
    ["ring", (m, n, tag) => [m + 1, n, tag]],
    ...templateHalfTurns(t, centreLine).map((m) => ["turn", m] as const),
    ...templateYMirrors(t, centreLine).map((m) => ["mirror-tube", m] as const),
    ...templateXMirrors(t).map((m) => ["mirror-ring", m] as const),
  ]);
  return assemble("mobius" + tiling, cells, positions, mineCount, {
    twoSided: true,
    radius: maxRadius,
    symmetries,
    cornerMask,
  });
}

/** An Archimedean tiling wrapped onto the Klein bottle: `nx` domain copies
 * around the ring, `ny` around the tube. The tube wraps straight; the ring seam
 * glues the tube flipped through `template.mirror`, so the surface is closed yet
 * non-orientable. Carries one domain forward along the ring, the half-tube step
 * (the whole one does not survive the seam) and the tube mirror. */
export function archKleinBoard(
  tiling: string,
  nx: number,
  ny: number,
  mineCount: number,
  tubeScale = 1,
): Board3D {
  const t = archTemplate(tiling);
  const mirror = t.mirror;
  if (mirror === null) throw new Error(`${tiling} is chiral and cannot wrap a Klein bottle`);
  const W = t.width;
  const H = t.height;
  let halves: number;
  if (t.glide) {
    if (nx % 2 === 0) throw new Error("nx counts half-domains and must be odd");
    halves = nx;
  } else {
    halves = 2 * nx;
  }
  const q = Math.floor(halves / 2);
  const odd = halves % 2;
  const length = (halves * W) / 2; // ring circumference in edge units
  const tubeTotal = ny * H; // tube circumference in edge units

  const flipped = (mi: number, ni: number, tag: string): [number, number, string] => {
    const im = mirror.get(tag)!;
    return [mi + im.dm - odd, mod(-1 - ni + im.dn, ny), im.tag];
  };
  const canonical = (mi: number, ni: number, tag: string): [number, number, string] => {
    while (2 * mi + (2 * t.verts.get(tag)![0]) / W >= halves - 1e-5) {
      [mi, ni, tag] = flipped(mi - q, ni, tag);
    }
    while (2 * mi + (2 * t.verts.get(tag)![0]) / W < -1e-5) {
      [mi, ni, tag] = flipped(mi + q + odd, ni, tag);
    }
    return [mi, mod(ni, ny), tag];
  };
  const point = (mi: number, ni: number, tag: string): Vec3 => {
    const v = t.verts.get(tag)!;
    const u = TWO_PI * (mi * W + v[0]) / length;
    // +π/2 aligns the immersion's seam reflection (v -> π - v) with the tiling's
    // tube mirror (y -> tubeTotal - y) that flipped() applies
    const vv = TWO_PI * (ni * H + v[1]) / tubeTotal + Math.PI / 2;
    return kleinPoint(u, vv, tubeScale);
  };

  const centroidsX = new Map<string, number>();
  for (const { name, refs } of t.cells) {
    let s = 0;
    for (const r of refs) s += r.dm * W + t.verts.get(r.tag)![0];
    centroidsX.set(name, s / refs.length);
  }
  const cells = new Map<CellId, string[]>();
  const positions = new Map<string, Vec3>();
  const cornerMask = new Map<CellId, boolean[]>();
  for (let m = 0; m < q + 1; m++) {
    for (let n = 0; n < ny; n++) {
      for (const { name, refs, real } of t.cells) {
        const c = centroidsX.get(name)! + m * W;
        if (!(-1e-9 <= c && c < length - 1e-9)) continue;
        const keys = refs.map((r) => {
          const cc = canonical(m + r.dm, n + r.dn, r.tag);
          const ks = `${cc[0]},${cc[1]},${cc[2]}`;
          if (!positions.has(ks)) positions.set(ks, point(cc[0], cc[1], cc[2]));
          return ks;
        });
        if (new Set(keys).size < keys.length) {
          throw new Error(`${nx}x${ny} is too small for ${tiling}`);
        }
        const key = cid(m, n, name);
        cells.set(key, keys);
        cornerMask.set(key, real);
      }
    }
  }
  straightenPositions(t, cells, positions, (m, n, tag) => {
    const c = canonical(m, n, tag);
    return `${c[0]},${c[1]},${c[2]}`;
  });
  const clip = kleinClip(cells, positions, kleinRecentre(positions), tubeScale);

  const seamLines = [0, tubeTotal / 2];
  const symmetries = domainCandidates(cells, canonical, [
    // one domain forward along the ring: the seam flip carries the cells it
    // crosses to their mirror partners
    ["ring", (m, n, tag) => [m + 1, n, tag]],
    ["tube", (m, n, tag) => [m, n + ny / 2, tag]],
    // the ring seam reverses the tube, so only the two lines it fixes are left
    // for a flip: the one it reflects in and the one half a tube away
    ...templateHalfTurns(t, seamLines).map((m) => ["turn", m] as const),
    ...templateYMirrors(t, seamLines).map((m) => ["mirror-tube", m] as const),
    ...templateXMirrors(t).map((m) => ["mirror-ring", m] as const),
  ]);
  const ring = symmetries.find((c) => c.id === "ring");
  if (!ring?.build()) throw new Error(`klein ring translation incomplete for ${tiling}`);
  return assemble("klein" + tiling, cells, positions, mineCount, {
    twoSided: true,
    radius: maxRadius,
    symmetries,
    clip,
    cornerMask,
  });
}
