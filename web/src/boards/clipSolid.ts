// The region a self-intersecting immersion encloses, taken from the geometry
// that is actually *drawn* rather than from the smooth surface behind it.
//
// A Klein board's neck passes through itself, and the sheet that ends up inside
// the other one has to come off or it caps the view down the bore. Cutting it
// against the analytic tube — the immersion's own circle at that height — is
// wrong twice over, because the board is drawn as flat tiles and the drawn tube
// is a *polygon* inscribed in that circle, lying inside it everywhere but at
// its corners. Cutting against the circle therefore
//
//   * eats tiles at the bottom of the bottle, where the two sheets converge on
//     one circle and the chords between them cross it, and
//   * leaves a slit along the self-intersection, because the cut edge follows
//     the circle while the tube that is meant to hide it follows the chords.
//
// Both go away if the cut is made against the drawn triangles, which is what
// this module does — exactly, with no sampling and no subdivision:
//
//   * A tube stops somewhere, and across an open rim there is no inside at all,
//     so it is first **closed off** at each of its rims by a lid (see
//     `capOpenRims`). Without that, a horizontal plane through the fold at the
//     bottom of the bottle — where the rim zigzags over a good part of the
//     tube's height — meets the surface in an arc rather than a loop, and
//     neither a parity test nor a decomposition can say what an arc encloses.
//   * The neck's cross-sections are horizontal, so slicing the tube at every
//     height one of its vertices sits at gives **slabs** inside which every
//     triangle either spans the full height or is absent altogether.
//   * Over one slab the tube is a band, and its section at the slab's mid
//     height is a closed **polyline**: every triangle crossing that height
//     crosses it on exactly two of its edges, and an edge two triangles share
//     hands both the same crossing, so the section links up exactly — no
//     tolerance, no ordering guessed at. That polyline is cut into **ears**,
//     one convex piece each: an ear's steps of the loop are walled by the tube
//     triangles' own planes, so the cut still follows the tube as it leans, and
//     its diagonals by vertical planes that both ears sharing one build from
//     the same two points, so the pieces tile the interior with no gap and no
//     overlap.
//   * Triangulating rather than fanning is what makes that last claim true. The
//     section is nowhere near convex — a cell is fanned from its centroid,
//     which on a coarse board sits well inside the ring of its corners, so the
//     tube's section is a star dipping inward between every pair of corners —
//     and on some tilings the dips run deep enough that the star is not even
//     star-shaped about its own centre. A fan from that centre then covers some
//     of the interior twice and some of it not at all: the parts it misses are
//     left uncut, and a piece of the outer sheet stands in the bore.
//   * A polygon minus a convex piece decomposes into convex parts
//     (`P \ ∩Hᵢ = ⋃ᵢ P ∩ H₁ ∩ … ∩ Hᵢ₋₁ ∩ ¬Hᵢ`), so subtracting the union is a
//     run of half-space clips and the cut lands on the exact polyline where
//     the two drawn sheets meet — one polyline per tiling and per size, since
//     that is what the tessellation makes it.
import type { Vec3 } from "./core";

export type Tri = [Vec3, Vec3, Vec3];

/** A half-space. Its inside is where `n·p + d <= 0`; `n` is a unit normal, so
 * the value is a signed distance. */
export interface ClipPlane {
  n: Vec3;
  d: number;
}

/** One convex piece of the enclosed region — one ear of one slab's section.
 * The region is the union of them all. */
export interface ClipPiece {
  planes: ClipPlane[];
  min: Vec3;
  max: Vec3;
}

/** Below this share of a polygon's own area a surviving fragment is rounding
 * rather than geometry, and carrying it on would only fray the mesh. */
const SLIVER = 1e-7;

/** The tallest a slab may be, as a share of the tube's own height — see the
 * note on piece walls in `buildClipSolid`. */
const SLAB_STEP = 1 / 128;

/** A polygon as triangles fanned from a centre point, in polygon winding. */
export function fanTriangles(poly: readonly Vec3[], centre: Vec3): Tri[] {
  const out: Tri[] = [];
  for (let e = 0; e < poly.length; e++) {
    out.push([centre, poly[e]!, poly[(e + 1) % poly.length]!]);
  }
  return out;
}

/** The part of `tris` at or below `y`, re-fanned. The Klein neck runs on past
 * its own tube into the belly, and up there the tube is no longer one loop per
 * height — nor is there anything left to cut, the other sheet ending at the
 * same seam — so the occluder is taken only as far as that seam. */
export function trianglesBelow(tris: readonly Tri[], y: number): Tri[] {
  // Where the cut crosses an edge two triangles share, both must land on the
  // very same point. Computed twice, once from each end, the two copies come
  // out a rounding apart — and then each reads as a rim of its own, which is
  // exactly where a section stops closing (see `capOpenRims`). So the crossing
  // is taken once, off the edge's own two ends in a fixed order.
  const table = vertexTable();
  const cache = new Map<number, Vec3>();
  const crossing = (a: number, b: number): Vec3 => {
    const key = a < b ? a * BIG + b : b * BIG + a;
    let p = cache.get(key);
    if (!p) {
      const from = table.at(Math.floor(key / BIG));
      const to = table.at(key % BIG);
      const s = (y - from[1]) / (to[1] - from[1]);
      p = [from[0] + (to[0] - from[0]) * s, y, from[2] + (to[2] - from[2]) * s];
      cache.set(key, p);
    }
    return p;
  };
  const out: Tri[] = [];
  for (const t of tris) {
    const id = [table.of(t[0]), table.of(t[1]), table.of(t[2])];
    const poly: Vec3[] = [];
    for (let e = 0; e < 3; e++) {
      const a = id[e]!;
      const b = id[(e + 1) % 3]!;
      const ya = table.at(a)[1];
      const yb = table.at(b)[1];
      if (ya <= y) poly.push(table.at(a));
      if ((ya < y && yb > y) || (ya > y && yb < y)) poly.push(crossing(a, b));
    }
    for (let i = 1; i + 1 < poly.length; i++) out.push([poly[0]!, poly[i]!, poly[i + 1]!]);
  }
  return out;
}

/** Vertex-index stride for packing an edge into one number — and so the most
 * vertices a tube may have. A board's is a few thousand. */
const BIG = 1 << 22;

/** Names each distinct position once, so an edge can be named by the pair of
 * its ends. Two triangles that share an edge share its endpoints *exactly* —
 * the wrap hands every cell the same position object, and a fan's spokes are
 * the same centroid — so the naming needs no tolerance anywhere. */
interface VertexTable {
  of: (p: Vec3) => number;
  at: (i: number) => Vec3;
}

function vertexTable(): VertexTable {
  const verts: Vec3[] = [];
  const index = new Map<string, number>();
  return {
    of: (p: Vec3): number => {
      const key = `${p[0]},${p[1]},${p[2]}`;
      let i = index.get(key);
      if (i === undefined) {
        i = verts.length;
        index.set(key, i);
        verts.push(p);
      }
      return i;
    },
    at: (i: number): Vec3 => verts[i]!,
  };
}

/** The same tube with each of its open rims closed off by a fan from that
 * rim's own centre.
 *
 * A tube stops somewhere — at the fold it shares its rim with the other sheet,
 * and at the seam it runs on into the belly — and across an open rim there is
 * no inside to speak of: a horizontal plane through one meets the surface in an
 * *arc*, not a loop, so a parity test answers by which way the arc happens to
 * face and a decomposition has no boundary to stop at. Both then read the
 * bottom of the bottle, where the rim zigzags over a good part of the tube's
 * height, as something other than what it is. Capping is what makes the region
 * a region: the lid lies in the rim the other sheet leaves from, so the sheet
 * itself stays outside it and nothing is taken from the fold. */
export function capOpenRims(tris: readonly Tri[]): Tri[] {
  const table = vertexTable();
  const seen = new Map<number, number>();
  for (const t of tris) {
    const id = [table.of(t[0]), table.of(t[1]), table.of(t[2])];
    for (let e = 0; e < 3; e++) {
      const i = id[e]!;
      const j = id[(e + 1) % 3]!;
      const key = i < j ? i * BIG + j : j * BIG + i;
      seen.set(key, (seen.get(key) ?? 0) + 1);
    }
  }
  // A rim edge is one no second triangle answers.
  const nbr = new Map<number, number[]>();
  for (const [key, count] of seen) {
    if (count !== 1) continue;
    const i = Math.floor(key / BIG);
    const j = key % BIG;
    for (const [a, b] of [[i, j], [j, i]]) {
      const at = nbr.get(a!);
      if (at) at.push(b!);
      else nbr.set(a!, [b!]);
    }
  }
  const caps: Tri[] = [];
  const walked = new Set<number>();
  for (const start of nbr.keys()) {
    if (walked.has(start) || nbr.get(start)!.length !== 2) continue;
    const loop: number[] = [];
    let prev = -1;
    let at = start;
    for (;;) {
      const next = nbr.get(at);
      if (!next || next.length !== 2 || walked.has(at)) break;
      walked.add(at);
      loop.push(at);
      const step = next[0] === prev ? next[1]! : next[0]!;
      prev = at;
      at = step;
      if (at === start) {
        if (loop.length >= 3) {
          const ring = loop.map((v) => table.at(v));
          caps.push(...fanTriangles(ring, mean(ring)));
        }
        break;
      }
    }
  }
  return [...tris, ...caps];
}

/** The region a tube drawn as `tris` encloses, as convex pieces to be unioned.
 * `tris` must be a tube whose cross-sections are horizontal — every horizontal
 * plane through it meets it in closed loops. */
export function buildClipSolid(tris: readonly Tri[]): ClipPiece[] {
  if (tris.length < 3) return [];
  // Name the tube's vertices, so an edge can be named by the pair of its ends —
  // which is what lets a slab's section be linked into the polyline the tube
  // really cuts, rather than guessed at from an ordering.
  const table = vertexTable();
  const ids = tris.map((t): TriIds => [table.of(t[0]), table.of(t[1]), table.of(t[2])]);
  const levels: number[] = [];
  for (const t of tris) for (const p of t) levels.push(p[1]);
  levels.sort((a, b) => a - b);
  const span = levels[levels.length - 1]! - levels[0]!;
  if (!(span > 0)) return [];
  // Vertex heights, merged: two vertices meant to sit on one rim can arrive
  // apart by a rounding of the wrap's own arithmetic, and a hairline slab
  // between them has no section worth the name.
  const eps = span * 1e-6;
  const rims: number[] = [];
  for (const y of levels) {
    if (!rims.length || y - rims[rims.length - 1]! > eps) rims.push(y);
  }
  // A piece's walls are pinned where its triangles cross the slab's mid
  // height, and the crossings drift as the tube leans, so a piece is only
  // exactly its own sector in the middle of its slab. Splitting a tall
  // slab into steps no deeper than SLAB_STEP shrinks that drift with it — the
  // one place this is an approximation, and the reason a four-domain board (a
  // tube two rows tall) comes out as sharp as a forty-domain one.
  const step = span * SLAB_STEP;
  const cuts: number[] = [];
  for (let i = 0; i < rims.length; i++) {
    cuts.push(rims[i]!);
    if (i + 1 === rims.length) break;
    const parts = Math.ceil((rims[i + 1]! - rims[i]!) / step);
    for (let j = 1; j < parts; j++) {
      cuts.push(rims[i]! + ((rims[i + 1]! - rims[i]!) * j) / parts);
    }
  }
  const pieces: ClipPiece[] = [];
  for (let k = 0; k + 1 < cuts.length; k++) {
    const yMin = cuts[k]!;
    const yMax = cuts[k + 1]!;
    const mid = (yMin + yMax) / 2;
    // Only triangles spanning the whole slab bound it over the whole slab —
    // which, the cuts being every vertex height, is all of the ones that meet
    // its interior at all.
    const spanning: number[] = [];
    for (let ti = 0; ti < tris.length; ti++) {
      const t = tris[ti]!;
      const lo = Math.min(t[0][1], t[1][1], t[2][1]);
      const hi = Math.max(t[0][1], t[1][1], t[2][1]);
      if (lo > yMin + eps || hi < yMax - eps) continue;
      spanning.push(ti);
    }
    if (spanning.length < 3) continue; // fewer than three edges is no section
    const yBounds: ClipPlane[] = [
      { n: [0, -1, 0], d: yMin },
      { n: [0, 1, 0], d: -yMax },
    ];
    const loops = sectionLoops(ids, table, spanning, mid);
    const exact = loops && loopPieces(tris, loops, yBounds, yMin, yMax);
    if (exact) {
      for (const piece of exact) pieces.push(piece);
      continue;
    }
    // A section that will not link up, or will not triangulate, is a slab too
    // degenerate to read exactly; the fan below still covers the star-shaped
    // part of it, which is all the older decomposition ever claimed.
    for (const piece of fanPieces(tris, spanning, mid, yBounds, yMin, yMax)) {
      pieces.push(piece);
    }
  }
  return pieces;
}

/** Three vertex indices into `buildClipSolid`'s vertex table. */
type TriIds = [number, number, number];

/** One closed loop of a slab's cross-section: `points[i]` joins `points[i+1]`
 * along the tube triangle `bounds[i]`, whose own plane is what walls the
 * enclosed region there. */
interface SectionLoop {
  points: Vec3[];
  bounds: number[];
}

/** Where the tube edge named by `key` crosses the plane at `y`. The key packs
 * the lower vertex index first, so both triangles sharing the edge compute the
 * point from the same two ends in the same order and get the same bits — which
 * is what makes the loop close and the pieces meet with no crack. */
function edgePoint(table: VertexTable, key: number, y: number): Vec3 {
  const a = table.at(Math.floor(key / BIG));
  const b = table.at(key % BIG);
  const s = (y - a[1]) / (b[1] - a[1]);
  return [a[0] + (b[0] - a[0]) * s, y, a[2] + (b[2] - a[2]) * s];
}

/** The tube's section at `y`, linked into closed loops. Null when the section
 * is not a set of simple closed loops, none of them inside another — every
 * crossed edge shared by exactly two of the spanning triangles, and every loop
 * closing without revisiting a triangle — which is the caller's cue to fall
 * back on the fan. */
function sectionLoops(
  ids: readonly TriIds[],
  table: VertexTable,
  spanning: readonly number[],
  y: number,
): SectionLoop[] | null {
  const edgeA: number[] = [];
  const edgeB: number[] = [];
  const segTri: number[] = [];
  const byEdge = new Map<number, number[]>();
  for (const ti of spanning) {
    const id = ids[ti]!;
    let first = -1;
    let second = -1;
    for (let e = 0; e < 3; e++) {
      const i = id[e]!;
      const j = id[(e + 1) % 3]!;
      const yi = table.at(i)[1];
      const yj = table.at(j)[1];
      if ((yi > y && yj > y) || (yi < y && yj < y) || yi === yj) continue;
      const key = i < j ? i * BIG + j : j * BIG + i;
      if (first < 0) first = key;
      else if (second < 0) second = key;
      else return null; // three crossings: a vertex sits in the plane
    }
    // A triangle spanning the slab crosses its mid height on exactly two of
    // its edges — the slab's own cuts are the vertex heights, so no vertex of
    // it can lie between them.
    if (second < 0 || first === second) return null;
    const s = edgeA.length;
    edgeA.push(first);
    edgeB.push(second);
    segTri.push(ti);
    for (const key of [first, second]) {
      const at = byEdge.get(key);
      if (at) at.push(s);
      else byEdge.set(key, [s]);
    }
  }
  if (edgeA.length < 3) return null;
  for (const at of byEdge.values()) if (at.length !== 2) return null;
  const used = new Array<boolean>(edgeA.length).fill(false);
  const loops: SectionLoop[] = [];
  for (let start = 0; start < edgeA.length; start++) {
    if (used[start]) continue;
    const points: Vec3[] = [];
    const bounds: number[] = [];
    let s = start;
    let from = edgeA[start]!;
    for (;;) {
      used[s] = true;
      const to = edgeA[s] === from ? edgeB[s]! : edgeA[s]!;
      points.push(edgePoint(table, from, y));
      bounds.push(segTri[s]!);
      const pair = byEdge.get(to)!;
      const next = pair[0] === s ? pair[1]! : pair[0]!;
      if (next === start) break;
      if (used[next]) return null; // a figure of eight, not a simple loop
      s = next;
      from = to;
    }
    if (points.length < 3) return null;
    loops.push({ points, bounds });
  }
  // Two loops at one height are two parts of the tube side by side, and each is
  // its own region. One *inside* another is not: that is an annulus, whose
  // inside is what lies between them, and filling both would fill the hole. It
  // takes a lid whose own cone crosses the wall it closes to make one, and no
  // shipped board does — but the fan below is at least honest about not knowing.
  for (const loop of loops) {
    for (const other of loops) {
      if (other !== loop && enclosedBy(other.points, loop.points[0]!)) return null;
    }
  }
  return loops;
}

/** Does a closed loop in the x–z plane enclose a point? Parity of a +x ray. */
function enclosedBy(loop: readonly Vec3[], p: Vec3): boolean {
  let crossings = 0;
  for (let i = 0; i < loop.length; i++) {
    const a = loop[i]!;
    const b = loop[(i + 1) % loop.length]!;
    if (a[2] > p[2] === b[2] > p[2]) continue;
    const t = (p[2] - a[2]) / (b[2] - a[2]);
    if (a[0] + (b[0] - a[0]) * t > p[0]) crossings++;
  }
  return crossings % 2 === 1;
}

/** A slab's enclosed region, exactly: each section loop cut into ears, one
 * convex piece per ear. An ear's outer walls are the tube triangles' own
 * planes — so the cut still follows the tube as it leans through the slab —
 * and its inner walls are vertical planes through two section points, built
 * from the same two points by both ears that share them, so the pieces tile
 * the interior with no gap and no overlap however far from star-shaped it is.
 * Null when a loop will not triangulate. */
function loopPieces(
  tris: readonly Tri[],
  loops: readonly SectionLoop[],
  yBounds: readonly ClipPlane[],
  yMin: number,
  yMax: number,
): ClipPiece[] | null {
  const out: ClipPiece[] = [];
  for (const loop of loops) {
    const { points, bounds } = loop;
    const m = points.length;
    let turn = 0;
    for (let i = 0; i < m; i++) {
      const a = points[i]!;
      const b = points[(i + 1) % m]!;
      turn += a[0] * b[2] - b[0] * a[2];
    }
    if (turn === 0) continue; // a loop with no area encloses nothing
    const sign = turn > 0 ? 1 : -1;
    const live = points.map((_, i) => i);
    // Which tube triangle walls the step leaving each vertex still in play.
    // Null once that step is a chord of the loop rather than a step of it: a
    // diagonal an ear cut across, or a straight run merged into one.
    const wall = new Map<number, number | null>(points.map((_, i) => [i, bounds[i]!]));
    const wallOf = (i: number, j: number): number | null =>
      live[(live.indexOf(i) + 1) % live.length] === j ? wall.get(i)! : null;
    while (live.length > 3) {
      let cut = -1;
      for (let i = 0; i < live.length && cut < 0; i++) {
        const a = live[(i - 1 + live.length) % live.length]!;
        const b = live[i]!;
        const c = live[(i + 1) % live.length]!;
        if (sign * cross2(points[a]!, points[b]!, points[c]!) <= 0) continue;
        let clean = true;
        for (const o of live) {
          if (o === a || o === b || o === c) continue;
          if (inTriangle2(points[o]!, points[a]!, points[b]!, points[c]!, sign)) {
            clean = false;
            break;
          }
        }
        if (clean) cut = i;
      }
      if (cut < 0) {
        // No ear anywhere. A section runs dead straight wherever two of the
        // tube's triangles meet edge on — down the plane a bottle is symmetric
        // about, above all — and a vertex in the middle of a straight run is an
        // ear of no area, which no clipping can take. It bounds nothing either,
        // so it goes, and the run it was in becomes one step walled by the
        // vertical plane through its ends: the very line all of them lay on.
        const flat = flattest(points, live, sign);
        if (flat < 0) return null; // not a simple polygon, then
        wall.set(live[(flat - 1 + live.length) % live.length]!, null);
        live.splice(flat, 1);
        continue;
      }
      const a = live[(cut - 1 + live.length) % live.length]!;
      const b = live[cut]!;
      const c = live[(cut + 1) % live.length]!;
      const piece = earPiece(tris, points, wallOf, sign, a, b, c, yBounds, yMin, yMax);
      if (!piece) return null;
      out.push(piece);
      wall.set(a, null); // the chord the ear left behind
      live.splice(cut, 1);
    }
    // The last three need no ear test, and so are the one place a degenerate
    // triangle can turn up: three section points in a line enclose nothing, and
    // dropping that piece leaves no gap behind it.
    const turn3 = cross2(points[live[0]!]!, points[live[1]!]!, points[live[2]!]!);
    if (turn3 === 0) continue;
    const last = earPiece(
      tris, points, wallOf, turn3 > 0 ? 1 : -1, live[0]!, live[1]!, live[2]!, yBounds, yMin, yMax,
    );
    if (!last) return null;
    out.push(last);
  }
  return out;
}

/** The vertex of `live` that bulges least — the flattest corner of what is
 * left, and a corner of no area at all wherever the section runs straight.
 * Measured against the corner's own two edges, so it is a shape and not a
 * size. Never a corner that turns the wrong way: dropping one of those would
 * fill in a bite the section really takes out of itself. */
function flattest(points: readonly Vec3[], live: readonly number[], sign: number): number {
  let at = -1;
  let flattest = Infinity;
  for (let i = 0; i < live.length; i++) {
    const a = points[live[(i - 1 + live.length) % live.length]!]!;
    const b = points[live[i]!]!;
    const c = points[live[(i + 1) % live.length]!]!;
    const turn = sign * cross2(a, b, c);
    if (turn < 0) continue;
    const scale = Math.hypot(b[0] - a[0], b[2] - a[2]) * Math.hypot(c[0] - b[0], c[2] - b[2]);
    const bulge = scale > 0 ? turn / scale : 0;
    if (bulge < flattest) {
      flattest = bulge;
      at = i;
    }
  }
  return flattest < 1e-9 ? at : -1;
}

/** One ear of a section loop, as a convex piece. Each of its three sides is
 * either a step of the loop — walled by the tube triangle that drew it — or a
 * diagonal, walled by the vertical plane through its two ends, taken in loop
 * order so the ear on the other side of it builds the very same plane. */
function earPiece(
  tris: readonly Tri[],
  points: readonly Vec3[],
  wallOf: (i: number, j: number) => number | null,
  sign: number,
  a: number,
  b: number,
  c: number,
  yBounds: readonly ClipPlane[],
  yMin: number,
  yMax: number,
): ClipPiece | null {
  const planes: ClipPlane[] = [];
  const min: Vec3 = [Infinity, yMin, Infinity];
  const max: Vec3 = [-Infinity, yMax, -Infinity];
  const stretch = (p: Vec3): void => {
    for (const axis of [0, 2]) {
      min[axis] = Math.min(min[axis]!, p[axis]!);
      max[axis] = Math.max(max[axis]!, p[axis]!);
    }
  };
  const corners = [a, b, c];
  for (let e = 0; e < 3; e++) {
    const i = corners[e]!;
    const j = corners[(e + 1) % 3]!;
    // Lower index first, so both ears sharing a diagonal name it the same way
    // and their half-spaces come out exact complements.
    const lo = Math.min(i, j);
    const hi = Math.max(i, j);
    // Which side is in comes from the ear's own winding, not from measuring the
    // corner again: an ear is wound `sign` by construction, and re-deriving it
    // as a signed area in a different order rounds a thin one down to nothing.
    const wall = wallPlane(points[lo]!, points[hi]!, lo === i ? sign : -sign);
    if (!wall) return null;
    planes.push(wall);
    const step = wallOf(i, j);
    if (step === null) continue;
    // A step of the loop: the tube's own triangle walls the region there too,
    // and that is what keeps the cut on the tube as it leans through the slab.
    // The vertical wall stays alongside it, holding the piece inside the
    // section as measured at the mid height — exactly as the fan's radial walls
    // held a wedge inside its own sector — because a plane that leans is no
    // bound at all sideways, and an ear with two of them and nothing else
    // reaches clean across a section's own concavity.
    const t = tris[step]!;
    const face = facePlane(t, wall);
    if (!face) return null;
    planes.push(face);
    for (const p of t) stretch(p);
  }
  for (const i of [a, b, c]) stretch(points[i]!);
  return { planes: [...planes, ...yBounds], min, max };
}

/** Twice the signed area of a triangle in the x–z plane. */
function cross2(a: Vec3, b: Vec3, c: Vec3): number {
  return (b[0] - a[0]) * (c[2] - a[2]) - (b[2] - a[2]) * (c[0] - a[0]);
}

/** The vertical plane through two points, facing so that the side `side` names
 * — the sign `cross2` gives a point there — is the inside. Taking the side as
 * a signed area computed once, rather than re-measuring the point against the
 * plane, is what keeps a thin ear from losing its own orientation to rounding.
 */
function wallPlane(from: Vec3, to: Vec3, side: number): ClipPlane | null {
  const dx = to[0] - from[0];
  const dz = to[2] - from[2];
  const len = Math.hypot(dx, dz);
  if (!(len > 0)) return null;
  const n: Vec3 = [-dz / len, 0, dx / len];
  const d = -(n[0] * from[0] + n[2] * from[2]);
  // n·(p − from) is cross2(from, to, p) / len, so the two agree in sign.
  return side < 0 ? { n, d } : { n: [-n[0], 0, -n[2]], d: -d };
}

/** A tube triangle's own plane, facing the same way as the wall standing along
 * it. The two meet the slab's mid height in the very same line — the wall is
 * the vertical plane through the section's two ends, and those ends are where
 * the triangle crosses that height — so the wall's own normal is what says
 * which side is in, and no point need be measured against the plane at all.
 * Measuring one is what a nearly flat ear cannot survive: its third corner sits
 * on the line to the last bit, and the answer rounds to nothing. */
function facePlane(t: Tri, along: ClipPlane): ClipPlane | null {
  const n = normalOf(t[0], t[1], t[2]);
  if (!n) return null;
  const d = -dot(n, t[0]);
  const s = n[0] * along.n[0] + n[2] * along.n[2];
  if (s === 0) return null; // a triangle lying flat walls nothing sideways
  return s > 0 ? { n, d } : { n: [-n[0], -n[1], -n[2]], d: -d };
}

/** Is `p` strictly inside triangle a–b–c, wound `sign`, in the x–z plane? */
function inTriangle2(p: Vec3, a: Vec3, b: Vec3, c: Vec3, sign: number): boolean {
  return (
    sign * cross2(a, b, p) > 0 && sign * cross2(b, c, p) > 0 && sign * cross2(c, a, p) > 0
  );
}

/** The older decomposition: one wedge per triangle, between the section's own
 * mean and that triangle. It covers the part of the section that is star
 * shaped about that mean, which is everything a well behaved tube has. */
function fanPieces(
  tris: readonly Tri[],
  spanning: readonly number[],
  mid: number,
  yBounds: readonly ClipPlane[],
  yMin: number,
  yMax: number,
): ClipPiece[] {
  const kept: Tri[] = [];
  const rim: Vec3[] = [];
  for (const ti of spanning) {
    const t = tris[ti]!;
    const seg = sliceTriangle(t, mid);
    if (!seg) continue;
    kept.push(t);
    rim.push(seg[0], seg[1]);
  }
  if (rim.length < 6) return [];
  const axis = mean(rim);
  const out: ClipPiece[] = [];
  for (let i = 0; i < kept.length; i++) {
    const piece = wedge(axis, kept[i]!, rim[2 * i]!, rim[2 * i + 1]!, yBounds, yMin, yMax);
    if (piece) out.push(piece);
  }
  return out;
}

/** The wedge between the slab's axis and one triangle of the tube: the
 * triangle's own plane, the two vertical planes through the axis and the
 * points where the triangle crosses the slab's mid height, and the slab's own
 * floor and ceiling. The two crossing points are on the edges the triangle
 * shares with its neighbours, and both neighbours build their wall from the
 * same point and the same axis — which is what makes the wedges meet exactly.
 * Null where the triangle stands on the axis and the wedge is flat. */
function wedge(
  axis: Vec3,
  t: Tri,
  left: Vec3,
  right: Vec3,
  yBounds: readonly ClipPlane[],
  yMin: number,
  yMax: number,
): ClipPiece | null {
  const face = planeThrough(t[0], t[1], t[2], axis);
  if (!face) return null;
  const a = radialWall(axis, left, right);
  const b = radialWall(axis, right, left);
  if (!a || !b) return null;
  const min: Vec3 = [Infinity, yMin, Infinity];
  const max: Vec3 = [-Infinity, yMax, -Infinity];
  for (const p of [axis, t[0], t[1], t[2]]) {
    for (const c of [0, 2]) {
      min[c] = Math.min(min[c]!, p[c]!);
      max[c] = Math.max(max[c]!, p[c]!);
    }
  }
  return { planes: [face, a, b, ...yBounds], min, max };
}

/** The vertical plane through two points, facing so that `inside` is on its
 * inner side. Null where the two share a place in the x–z plane, or `inside`
 * lies on the plane itself. */
function radialWall(from: Vec3, through: Vec3, inside: Vec3): ClipPlane | null {
  const axis = from;
  const dx = through[0] - axis[0];
  const dz = through[2] - axis[2];
  const len = Math.hypot(dx, dz);
  if (!(len > 0)) return null;
  const n: Vec3 = [-dz / len, 0, dx / len];
  const d = -(n[0] * axis[0] + n[2] * axis[2]);
  const s = n[0] * inside[0] + n[2] * inside[2] + d;
  if (s === 0) return null;
  return s < 0 ? { n, d } : { n: [-n[0], 0, -n[2]], d: -d };
}

/** The plane through three points, oriented so `inside` is on its `<= 0` side.
 * Null when the three are collinear or `inside` lies on the plane. */
function planeThrough(a: Vec3, b: Vec3, c: Vec3, inside: Vec3): ClipPlane | null {
  const n = normalOf(a, b, c);
  if (!n) return null;
  const d = -dot(n, a);
  const s = dot(n, inside) + d;
  if (s === 0) return null;
  return s < 0 ? { n, d } : { n: [-n[0], -n[1], -n[2]], d: -d };
}

/** Cut `tris` down to the part of them outside `solid`, exactly. Passes the
 * geometry through untouched when there is nothing to subtract. */
export function subtractSolid(
  tris: readonly Tri[],
  solid: readonly ClipPiece[] | null,
): Tri[] {
  if (!solid || !solid.length) return tris as Tri[];
  const out: Tri[] = [];
  for (const tri of tris) {
    const keep = triangleArea(tri) * SLIVER;
    const lo = Math.min(tri[0][1], tri[1][1], tri[2][1]);
    const hi = Math.max(tri[0][1], tri[1][1], tri[2][1]);
    let polys: Vec3[][] = [[tri[0], tri[1], tri[2]]];
    for (let i = firstPiece(solid, lo); i < solid.length && solid[i]!.min[1] <= hi; i++) {
      if (!polys.length) break;
      const piece = solid[i]!;
      const next: Vec3[][] = [];
      for (const poly of polys) {
        if (outsideBox(poly, piece)) {
          next.push(poly);
          continue;
        }
        for (const part of subtractConvex(poly, piece.planes)) {
          if (polygonArea(part) > keep) next.push(part);
        }
      }
      polys = next;
    }
    for (const poly of polys) {
      for (let i = 1; i + 1 < poly.length; i++) out.push([poly[0]!, poly[i]!, poly[i + 1]!]);
    }
  }
  return out;
}

/** Total area of a triangle set. */
export function trianglesArea(tris: readonly Tri[]): number {
  let total = 0;
  for (const t of tris) total += triangleArea(t);
  return total;
}

/** Does the solid swallow any part of `tris` worth more than `minArea`? What
 * picks out the handful of cells the cut reaches, and exact where sampling
 * the polygon would miss a patch that sits wholly inside one big cell. */
export function reachesSolid(
  tris: readonly Tri[],
  solid: readonly ClipPiece[],
  minArea: number,
): boolean {
  let area = 0;
  for (const tri of tris) {
    const lo = Math.min(tri[0][1], tri[1][1], tri[2][1]);
    const hi = Math.max(tri[0][1], tri[1][1], tri[2][1]);
    for (let i = firstPiece(solid, lo); i < solid.length && solid[i]!.min[1] <= hi; i++) {
      const piece = solid[i]!;
      let poly: Vec3[] = [tri[0], tri[1], tri[2]];
      if (outsideBox(poly, piece)) continue;
      for (const h of piece.planes) {
        poly = clipHalf(poly, h, -1);
        if (poly.length < 3) break;
      }
      area += polygonArea(poly);
      if (area > minArea) return true;
    }
  }
  return false;
}

/** The pieces that can reach any of `polys`, in the same order — the rest of
 * the decomposition has nothing left to subtract from and need not be kept. */
export function pruneSolid(
  solid: readonly ClipPiece[],
  polys: readonly (readonly Vec3[])[],
): ClipPiece[] {
  const boxes = polys.map((poly) => {
    const min: Vec3 = [Infinity, Infinity, Infinity];
    const max: Vec3 = [-Infinity, -Infinity, -Infinity];
    for (const p of poly) {
      for (let a = 0; a < 3; a++) {
        min[a] = Math.min(min[a]!, p[a]!);
        max[a] = Math.max(max[a]!, p[a]!);
      }
    }
    return { min, max };
  });
  // Touching counts as reaching, exactly as `outsideBox` has it.
  return solid.filter((piece) =>
    boxes.some((box) => {
      for (let a = 0; a < 3; a++) {
        if (box.max[a]! < piece.min[a]! || box.min[a]! > piece.max[a]!) return false;
      }
      return true;
    }),
  );
}

/** The first piece that can reach up to `lo`. Pieces come out slab by slab
 * from the bottom, so their heights are sorted and this is a bisection. The
 * bound is inclusive: a flat cell can lie in a slab's own floor, and it is that
 * slab that has to cut it. */
function firstPiece(solid: readonly ClipPiece[], lo: number): number {
  let a = 0;
  let b = solid.length;
  while (a < b) {
    const m = (a + b) >> 1;
    if (solid[m]!.max[1] < lo) a = m + 1;
    else b = m;
  }
  return a;
}

/** Whether a point is inside the tube the occluder draws, by parity of a ray
 * cast through its own horizontal cross-section. Exact, and independent of the
 * decomposition above — which is what makes it worth testing against. */
export function insideOccluder(occluder: readonly Tri[], p: Vec3): boolean {
  let crossings = 0;
  for (const t of occluder) {
    const seg = sliceTriangle(t, p[1]);
    if (!seg) continue;
    if (raySplits(p, seg[0], seg[1])) crossings++;
  }
  return crossings % 2 === 1;
}

/** Does the +x ray from `p` cross the segment a–b, in the x–z plane? */
function raySplits(p: Vec3, a: Vec3, b: Vec3): boolean {
  if (a[2] > p[2] === b[2] > p[2]) return false;
  const t = (p[2] - a[2]) / (b[2] - a[2]);
  return a[0] + (b[0] - a[0]) * t > p[0];
}

/** Signed depth of a point: negative inside the solid, positive outside, and
 * how far in each direction. Zero on any internal face of the decomposition,
 * so read the sign, not the size. */
export function solidDepth(solid: readonly ClipPiece[], p: Vec3): number {
  let best = Infinity;
  for (let i = firstPiece(solid, p[1]); i < solid.length && solid[i]!.min[1] <= p[1]; i++) {
    const piece = solid[i]!;
    if (
      p[0] < piece.min[0] || p[0] > piece.max[0] ||
      p[1] < piece.min[1] || p[1] > piece.max[1] ||
      p[2] < piece.min[2] || p[2] > piece.max[2]
    ) {
      continue;
    }
    let worst = -Infinity;
    for (const h of piece.planes) worst = Math.max(worst, dot(h.n, p) + h.d);
    best = Math.min(best, worst);
  }
  return best;
}

/** Is the polygon clear of the piece's box? Touching does not count as clear:
 * a flat cell can lie in a slab's own floor, and that slab still has to cut
 * it — the bottom of the Klein bottle is exactly such a cell. */
function outsideBox(poly: readonly Vec3[], piece: ClipPiece): boolean {
  for (let a = 0; a < 3; a++) {
    let lo = Infinity;
    let hi = -Infinity;
    for (const p of poly) {
      lo = Math.min(lo, p[a]!);
      hi = Math.max(hi, p[a]!);
    }
    if (hi < piece.min[a]! || lo > piece.max[a]!) return true;
  }
  return false;
}

/** `poly` minus the convex intersection of `planes`, as convex parts: peel off
 * what lies outside each half-space in turn and keep narrowing the rest, which
 * is exactly what the intersection swallows.
 *
 * A plane the polygon only *touches* is settled before it is cut, and settled
 * as a plane that takes nothing: a flat cell lying in a slab's own floor would
 * otherwise come out both peeled off and kept, and be drawn twice. The Klein
 * bottle has such cells — the fold at the bottom is horizontal, and the slabs
 * are cut at exactly the heights its vertices sit at. */
function subtractConvex(poly: Vec3[], planes: readonly ClipPlane[]): Vec3[][] {
  const out: Vec3[][] = [];
  let rest = poly;
  for (const h of planes) {
    if (rest.length < 3) return out;
    let lo = Infinity;
    let hi = -Infinity;
    for (const p of rest) {
      const d = dot(h.n, p) + h.d;
      lo = Math.min(lo, d);
      hi = Math.max(hi, d);
    }
    if (hi <= 0) continue; // nothing of `rest` lies outside this half-space
    if (lo >= 0) {
      out.push(rest); // none of it lies inside: the whole of it survives
      return out;
    }
    const outside = clipHalf(rest, h, 1);
    if (outside.length >= 3) out.push(outside);
    rest = clipHalf(rest, h, -1);
  }
  return out;
}

/** Sutherland–Hodgman: the part of a convex polygon where
 * `side * (n·p + d) >= 0`. */
function clipHalf(poly: readonly Vec3[], h: ClipPlane, side: 1 | -1): Vec3[] {
  const n = poly.length;
  const dist = poly.map((p) => side * (dot(h.n, p) + h.d));
  const out: Vec3[] = [];
  for (let i = 0; i < n; i++) {
    const a = poly[i]!;
    const b = poly[(i + 1) % n]!;
    const da = dist[i]!;
    const db = dist[(i + 1) % n]!;
    if (da >= 0) out.push(a);
    if ((da > 0 && db < 0) || (da < 0 && db > 0)) {
      const t = da / (da - db);
      out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]);
    }
  }
  return out;
}

/** Where a triangle meets the horizontal plane at `y`, as a segment. */
function sliceTriangle(t: Tri, y: number): [Vec3, Vec3] | null {
  const hits: Vec3[] = [];
  for (let i = 0; i < 3; i++) {
    const a = t[i]!;
    const b = t[(i + 1) % 3]!;
    const da = a[1] - y;
    const db = b[1] - y;
    if ((da > 0 && db > 0) || (da < 0 && db < 0)) continue;
    if (da === db) continue; // an edge lying in the plane: the other two carry
    const s = da / (da - db); // its ends
    if (s < 0 || s > 1) continue;
    hits.push([a[0] + (b[0] - a[0]) * s, y, a[2] + (b[2] - a[2]) * s]);
  }
  if (hits.length < 2) return null;
  return [hits[0]!, hits[hits.length - 1]!];
}

function normalOf(a: Vec3, b: Vec3, c: Vec3): Vec3 | null {
  const u: Vec3 = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
  const v: Vec3 = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
  const n: Vec3 = [
    u[1] * v[2] - u[2] * v[1],
    u[2] * v[0] - u[0] * v[2],
    u[0] * v[1] - u[1] * v[0],
  ];
  const len = Math.hypot(n[0], n[1], n[2]);
  if (!(len > 0)) return null;
  return [n[0] / len, n[1] / len, n[2] / len];
}

function triangleArea(t: Tri): number {
  const n = normalOf(t[0], t[1], t[2]);
  if (!n) return 0;
  return polygonArea([t[0], t[1], t[2]]);
}

function polygonArea(poly: readonly Vec3[]): number {
  if (poly.length < 3) return 0;
  const n: Vec3 = [0, 0, 0];
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i]!;
    const b = poly[(i + 1) % poly.length]!;
    n[0] += a[1] * b[2] - a[2] * b[1];
    n[1] += a[2] * b[0] - a[0] * b[2];
    n[2] += a[0] * b[1] - a[1] * b[0];
  }
  return Math.hypot(n[0], n[1], n[2]) / 2;
}

function dot(a: Vec3, b: Vec3): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

function mean(points: readonly Vec3[]): Vec3 {
  const c: Vec3 = [0, 0, 0];
  for (const p of points) {
    c[0] += p[0];
    c[1] += p[1];
    c[2] += p[2];
  }
  return [c[0] / points.length, c[1] / points.length, c[2] / points.length];
}
