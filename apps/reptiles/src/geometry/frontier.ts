// The frontier: the boundary of what is still uncovered, as directed edges with
// the uncovered side on their left. It is what "a tile sticks to the points and
// edges already there" means — every snap anchors a tile vertex on a frontier
// vertex — and the whole win condition: the region is tiled exactly when the
// frontier is empty.
//
// Start: the region's own loops (outer counter-clockwise, holes clockwise).
// Covering a polygon adds its edges reversed; an edge a→b and an edge b→a
// cancel. Before they can, both sides are split at every vertex of the other
// that lands inside one of their edges, so a T-junction — a corner in the
// middle of a neighbour's side, as a running bond or an isogonal tiling has —
// cancels piece by piece like any other contact.
//
// Round edges (the Spectre's) are labels on straight ones: each frontier edge
// carries the bulge of whatever left it open — a tile's curve, or the rim's —
// and a tile may lie along a round edge only with the same curve on its own
// edge there, end to end. A curved edge is never cut part-way.
//
// Edge marks (a coloured or lined tile's, marks.ts) ride along the same way:
// a covered tile leaves each of its edges open carrying the mark the tile
// across must have there (its own mark's partner), a tile lies along a marked
// edge only with that very mark, end to end, and the rim carries none, so it
// takes any.
//
// A tile of several pieces (the fish, the kissing squares) fits where each
// of its pieces does, and covering it covers each in turn; it snaps on by any
// corner of any piece.
//
// Every decision is exact (see cyclotomic.ts). Floats only prefilter by
// bounding box, order the split points along an edge, and classify the
// midpoint of a piece already known to lie off every boundary.

import {
  orient,
  properlyCross,
  sameDirection,
  strictlyBetween,
  type Cyc,
  type Ring,
} from "./cyclotomic";
import {
  allVerts,
  centroid,
  centroidOf,
  loopEdges,
  moved,
  posed,
  spotKey,
  winding,
  type Bulge,
  type Piece,
  type Shape,
  type XY,
} from "./shape";
import { NONE, partner } from "./marks";

export interface Edge {
  a: Cyc;
  b: Cyc;
  ak: string;
  bk: string;
  axy: XY;
  bxy: XY;
  /** Which way the edge bulges, seen from a to b (`Bulge`); 0 if straight. */
  bulge: Bulge;
  /** Not a piece cut from a longer edge. */
  whole: boolean;
  /** The mark a tile laid along this edge must have on its own edge there
   * (marks.ts); `NONE` takes any. */
  mark: number;
}

const EPS = 1e-9;

function edge(
  ring: Ring,
  a: Cyc,
  b: Cyc,
  bulge: Bulge = 0,
  whole = true,
  mark: number = NONE,
): Edge {
  return {
    a,
    b,
    ak: ring.key(a),
    bk: ring.key(b),
    axy: ring.toXY(a),
    bxy: ring.toXY(b),
    bulge,
    whole,
    mark,
  };
}

function loopToEdges(
  ring: Ring,
  verts: Cyc[],
  curve?: readonly Bulge[],
  marks?: readonly number[],
): Edge[] {
  return verts.map((v, i) =>
    edge(ring, v, verts[(i + 1) % verts.length]!, curve?.[i] ?? 0, true, marks?.[i] ?? NONE),
  );
}

/** An edge the other way round: the same line, so its bulge is to the other
 * side — and, left open by a tile, the mark the tile across must have. */
function reverse(ring: Ring, e: Edge): Edge {
  return edge(ring, e.b, e.a, -e.bulge as Bulge, e.whole, partner(e.mark));
}

interface Box {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

function boxOf(pts: XY[]): Box {
  const box = { x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity };
  for (const [x, y] of pts) {
    box.x0 = Math.min(box.x0, x);
    box.y0 = Math.min(box.y0, y);
    box.x1 = Math.max(box.x1, x);
    box.y1 = Math.max(box.y1, y);
  }
  return box;
}

function overlaps(a: Box, b: Box): boolean {
  return a.x0 <= b.x1 + EPS && b.x0 <= a.x1 + EPS && a.y0 <= b.y1 + EPS && b.y0 <= a.y1 + EPS;
}

/** Whether two edges' bounding boxes meet (to a margin past rounding): a
 * float pass before an exact test that needs them to. */
function meet(e: Edge, f: Edge): boolean {
  return (
    Math.min(e.axy[0], e.bxy[0]) <= Math.max(f.axy[0], f.bxy[0]) + EPS &&
    Math.min(f.axy[0], f.bxy[0]) <= Math.max(e.axy[0], e.bxy[0]) + EPS &&
    Math.min(e.axy[1], e.bxy[1]) <= Math.max(f.axy[1], f.bxy[1]) + EPS &&
    Math.min(f.axy[1], f.bxy[1]) <= Math.max(e.axy[1], e.bxy[1]) + EPS
  );
}

function edgeBox(e: Edge): Box {
  return boxOf([e.axy, e.bxy]);
}

/** Cut every edge at each of `points` that lies strictly inside it. */
function splitAt(ring: Ring, edges: Edge[], points: Map<string, Cyc>): Edge[] {
  const pts = [...points.values()].map((p) => ({ p, xy: ring.toXY(p) }));
  const out: Edge[] = [];
  for (const e of edges) {
    const box = edgeBox(e);
    const cuts = pts.filter(
      ({ p, xy }) =>
        xy[0] >= box.x0 - EPS &&
        xy[0] <= box.x1 + EPS &&
        xy[1] >= box.y0 - EPS &&
        xy[1] <= box.y1 + EPS &&
        strictlyBetween(ring, e.a, e.b, p),
    );
    if (cuts.length === 0) {
      out.push(e);
      continue;
    }
    const dist = (xy: XY): number => Math.hypot(xy[0] - e.axy[0], xy[1] - e.axy[1]);
    cuts.sort((u, v) => dist(u.xy) - dist(v.xy));
    let from = e.a;
    for (const { p } of cuts) {
      out.push(edge(ring, from, p, e.bulge, false, e.mark));
      from = p;
    }
    out.push(edge(ring, from, e.b, e.bulge, false, e.mark));
  }
  return out;
}

function vertexMap(edges: Iterable<Edge>): Map<string, Cyc> {
  const m = new Map<string, Cyc>();
  for (const e of edges) {
    m.set(e.ak, e.a);
    m.set(e.bk, e.b);
  }
  return m;
}

/** The piece lies along `e` (collinear and inside it, ends included). */
function onEdge(ring: Ring, piece: Edge, e: Edge): boolean {
  const inside = (p: Cyc, pk: string): boolean =>
    pk === e.ak || pk === e.bk || strictlyBetween(ring, e.a, e.b, p);
  return (
    orient(ring, e.a, e.b, piece.a) === 0 &&
    orient(ring, e.a, e.b, piece.b) === 0 &&
    inside(piece.a, piece.ak) &&
    inside(piece.b, piece.bk)
  );
}

/** A point inside the polygon `xy` (counter-clockwise) and well clear of
 * its sides — its centroid if that is, else one just inside the middle of
 * its longest side that is — or null if neither is. Floats: for a quick
 * test, never an identity. */
function interiorPoint(xy: XY[]): XY | null {
  const edges = loopEdges(xy);
  const size = Math.max(...edges.map(([a, b]) => Math.hypot(b[0] - a[0], b[1] - a[1])));
  const clear = (p: XY, margin: number): boolean =>
    winding(edges, p) === 1 && edges.every(([a, b]) => distToSegment(p, a, b) > margin);
  const c = centroid(xy);
  if (clear(c, size * 1e-3)) return c;
  for (const [a, b] of [...edges].sort(
    ([a1, b1], [a2, b2]) =>
      Math.hypot(b2[0] - a2[0], b2[1] - a2[1]) - Math.hypot(b1[0] - a1[0], b1[1] - a1[1]),
  )) {
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    // a hundredth of the side in from its middle, to its left: inside
    const p: XY = [
      (a[0] + b[0]) / 2 - ((b[1] - a[1]) / len) * len * 0.01,
      (a[1] + b[1]) / 2 + ((b[0] - a[0]) / len) * len * 0.01,
    ];
    if (clear(p, len * 0.005)) return p;
  }
  return null;
}

function distToSegment(p: XY, a: XY, b: XY): number {
  const [dx, dy] = [b[0] - a[0], b[1] - a[1]];
  const t = Math.max(
    0,
    Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / (dx * dx + dy * dy)),
  );
  return Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dy);
}

function midpoint(e: Edge): XY {
  return [(e.axy[0] + e.bxy[0]) / 2, (e.axy[1] + e.bxy[1]) / 2];
}

/** A shape, one way up, as `placements` reads it: its pieces resting as they
 * are, every vertex with the sides leaving and entering it (and their float
 * angles) and the way from it to the centroid, and a point well inside each
 * piece. Kept per shape object: a puzzle asks about the same few shapes at
 * every corner. */
interface Sides {
  flip: boolean;
  base: Piece[];
  at: {
    u: Cyc;
    leaving: Cyc;
    entering: Cyc;
    leavingAngle: number;
    enteringAngle: number;
    off: XY;
  }[];
  inner: (XY | null)[];
}
const SIDES = new WeakMap<Shape, Map<boolean, Sides>>();

function sidesOf(shape: Shape, flip: boolean): Sides {
  const cached = SIDES.get(shape)?.get(flip);
  if (cached) return cached;
  const { ring } = shape;
  const base = posed(shape, { rot: 0, flip, t: ring.zero });
  const c = centroidOf(base.map((p) => p.verts.map((u) => ring.toXY(u))));
  const angle = (v: Cyc): number => {
    const [x, y] = ring.toXY(v);
    return Math.atan2(y, x);
  };
  const at = base.flatMap(({ verts: own }) =>
    own.map((u, i) => {
      const m = own.length;
      const leaving = ring.sub(own[(i + 1) % m]!, u);
      const entering = ring.sub(u, own[(i - 1 + m) % m]!);
      const [ox, oy] = ring.toXY(u);
      return {
        u,
        leaving,
        entering,
        leavingAngle: angle(leaving),
        enteringAngle: angle(entering),
        off: [c[0] - ox, c[1] - oy] as XY,
      };
    }),
  );
  const inner = base.map((p) => interiorPoint(p.verts.map((u) => ring.toXY(u))));
  const sides = { flip, base, at, inner };
  const byFlip = SIDES.get(shape) ?? new Map<boolean, Sides>();
  byFlip.set(flip, sides);
  SIDES.set(shape, byFlip);
  return sides;
}

export class Frontier {
  private constructor(
    readonly ring: Ring,
    readonly edges: readonly Edge[],
  ) {}

  /** The frontier of an untouched region: its loops, interior on the left,
   * with each loop's round edges, if it has any. */
  static ofRegion(ring: Ring, loops: Cyc[][], curves?: readonly (readonly Bulge[])[]): Frontier {
    return new Frontier(
      ring,
      loops.flatMap((loop, i) => loopToEdges(ring, loop, curves?.[i])),
    );
  }

  get empty(): boolean {
    return this.edges.length === 0;
  }

  private cornerCache: Map<string, Cyc> | null = null;

  /** The edges by height: a band of the frontier's y range per bucket, each
   * listing (by index, in order) the edges whose y span meets it — so a tile
   * asks only about the edges near it, and a winding number only about the
   * edges level with its point. Built the first time it is needed. */
  private bandCache: { y0: number; h: number; bands: number[][]; boxes: Box[] } | null = null;

  private get byHeight(): { y0: number; h: number; bands: number[][]; boxes: Box[] } {
    if (this.bandCache) return this.bandCache;
    const boxes = this.edges.map(edgeBox);
    // (no edges: one empty band)
    const y0 = boxes.length ? Math.min(...boxes.map((b) => b.y0)) : 0;
    const y1 = boxes.length ? Math.max(...boxes.map((b) => b.y1)) : 0;
    const count = Math.max(1, Math.ceil(Math.sqrt(this.edges.length)));
    const h = (y1 - y0) / count || 1;
    const bands: number[][] = Array.from({ length: count }, () => []);
    boxes.forEach((b, i) => {
      for (
        let k = this.band(b.y0 - EPS, y0, h, count);
        k <= this.band(b.y1 + EPS, y0, h, count);
        k++
      )
        bands[k]!.push(i);
    });
    this.bandCache = { y0, h, bands, boxes };
    return this.bandCache;
  }

  private band(y: number, y0: number, h: number, count: number): number {
    return Math.min(count - 1, Math.max(0, Math.floor((y - y0) / h)));
  }

  /** The edges whose bounding box meets `box`, in frontier order. */
  private edgesNear(box: Box): Edge[] {
    const { y0, h, bands, boxes } = this.byHeight;
    const lo = this.band(box.y0 - EPS, y0, h, bands.length);
    const hi = this.band(box.y1 + EPS, y0, h, bands.length);
    const seen = new Set<number>();
    for (let k = lo; k <= hi; k++) for (const i of bands[k]!) seen.add(i);
    return [...seen]
      .sort((a, b) => a - b)
      .filter((i) => overlaps(boxes[i]!, box))
      .map((i) => this.edges[i]!);
  }

  /** The frontier's winding number about `p` (float; `p` off every edge):
   * 1 where it is uncovered, inside the region. Only the edges level with it
   * can cross the ray it is counted along. */
  private windingAt(p: XY): number {
    const { y0, h, bands } = this.byHeight;
    const band = bands[this.band(p[1], y0, h, bands.length)]!;
    return winding(
      band.map((i): [XY, XY] => [this.edges[i]!.axy, this.edges[i]!.bxy]),
      p,
    );
  }

  /**
   * The frontier's corners, by key: the vertices where it turns. A point part-way
   * along a straight run — a step of the region's outline, or where a tile's
   * side ends against a longer edge — is a vertex but not a corner. Where the
   * frontier pinches (two runs through one point) the point is a corner too.
   */
  get corners(): ReadonlyMap<string, Cyc> {
    if (this.cornerCache) return this.cornerCache;
    const { ring } = this;
    const into = new Map<string, Edge[]>();
    const outOf = new Map<string, Edge[]>();
    for (const e of this.edges) {
      (into.get(e.bk) ?? into.set(e.bk, []).get(e.bk)!).push(e);
      (outOf.get(e.ak) ?? outOf.set(e.ak, []).get(e.ak)!).push(e);
    }
    const corners = new Map<string, Cyc>();
    for (const [k, ins] of into) {
      const outs = outOf.get(k) ?? [];
      const straight =
        ins.length === 1 &&
        outs.length === 1 &&
        sameDirection(ring, ring.sub(ins[0]!.b, ins[0]!.a), ring.sub(outs[0]!.b, outs[0]!.a));
      if (!straight) corners.set(k, ins[0]!.b);
    }
    this.cornerCache = corners;
    return corners;
  }

  /** The frontier once `pieces` (each counter-clockwise, with its round
   * edges' `curve`) are covered too. The caller has checked `fits`. */
  cover(pieces: readonly Piece[]): Frontier {
    let f: Frontier = this;
    for (const p of pieces) f = f.coverOne(p.verts, p.curve, p.marks);
    return f;
  }

  private coverOne(poly: Cyc[], curve?: readonly Bulge[], marks?: readonly number[]): Frontier {
    const { ring } = this;
    const reversed = loopToEdges(ring, poly, curve, marks).map((e) => reverse(ring, e));
    const mine = splitAt(ring, [...this.edges], vertexMap(reversed));
    const theirs = splitAt(ring, reversed, vertexMap(this.edges));
    const open = new Map<string, Edge[]>();
    for (const e of mine) {
      const k = `${e.ak}>${e.bk}`;
      const list = open.get(k);
      if (list) list.push(e);
      else open.set(k, [e]);
    }
    const added: Edge[] = [];
    for (const e of theirs) {
      const twin = open.get(`${e.bk}>${e.ak}`);
      if (twin && twin.length > 0) twin.pop();
      else added.push(e);
    }
    return new Frontier(ring, [...[...open.values()].flat(), ...added]);
  }

  /** Which of `verts` lie on the frontier — on one of its vertices or
   * part-way along one of its edges: every point where a tile placed there
   * meets what is already down or the region's rim. */
  touching(verts: Cyc[]): Cyc[] {
    const { ring } = this;
    return verts.filter((v) => {
      const k = ring.key(v);
      const [x, y] = ring.toXY(v);
      return this.edges.some((e) => {
        if (e.ak === k || e.bk === k) return true;
        const box = edgeBox(e);
        if (x < box.x0 - EPS || x > box.x1 + EPS || y < box.y0 - EPS || y > box.y1 + EPS)
          return false;
        return strictlyBetween(ring, e.a, e.b, v);
      });
    });
  }

  /** Every piece meets the frontier edge to edge: none of its corners
   * part-way along a frontier edge, and no frontier vertex part-way along one
   * of its sides. */
  edgeToEdge(pieces: readonly Piece[]): boolean {
    return pieces.every((p) => this.edgeToEdgeOne(p.verts));
  }

  private edgeToEdgeOne(verts: Cyc[]): boolean {
    const { ring } = this;
    const sides = loopToEdges(ring, verts);
    const box = boxOf(verts.map((v) => ring.toXY(v)));
    const near = this.edgesNear(box);
    for (const e of near) {
      for (const v of verts) if (strictlyBetween(ring, e.a, e.b, v)) return false;
      for (const s of sides) if (strictlyBetween(ring, s.a, s.b, e.a)) return false;
    }
    return true;
  }

  /** Every one of `pieces` (each counter-clockwise, with its round edges'
   * `curve`) lies inside the uncovered area: it overlaps no covered tile and
   * does not leave the region. Touching along edges and at points is fine —
   * along a round edge, only where both sides are the one curve, end to end.
   * A tile's own pieces never overlap one another, so each is judged alone. */
  fits(pieces: readonly Piece[]): boolean {
    return pieces.every((p) => this.fitsOne(p.verts, p.curve, p.marks));
  }

  private fitsOne(poly: Cyc[], curve?: readonly Bulge[], marks?: readonly number[]): boolean {
    const { ring } = this;
    const tile = loopToEdges(ring, poly, curve, marks);
    const tileXY = poly.map((v) => ring.toXY(v));
    const box = boxOf(tileXY);
    const near = this.edgesNear(box);

    for (const f of near)
      for (const t of tile) if (meet(f, t) && properlyCross(ring, f.a, f.b, t.a, t.b)) return false;

    // Frontier pieces: none may run through the tile's interior, and one lying
    // along a tile edge must face the same way (the uncovered side is the
    // tile's inside), or the tile sits on covered ground there.
    const tileLoop = loopEdges(tileXY);
    for (const piece of splitAt(ring, near, vertexMap(tile))) {
      // a tile corner part-way along a round or marked edge: it would cut it
      if ((piece.bulge || piece.mark) && !piece.whole) return false;
      const along = tile.find((t) => meet(piece, t) && onEdge(ring, piece, t));
      if (along) {
        if (!sameDirection(ring, ring.sub(along.b, along.a), ring.sub(piece.b, piece.a)))
          return false;
        // a round edge on either side: the same curve, the whole edge; a
        // marked one (but the rim, which takes any): the mark it asks for
        const marked = piece.mark !== NONE && along.mark !== NONE;
        if (
          (along.bulge || piece.bulge || marked) &&
          !(
            piece.whole &&
            piece.ak === along.ak &&
            piece.bk === along.bk &&
            piece.bulge === along.bulge &&
            (!marked || piece.mark === along.mark)
          )
        )
          return false;
      } else if (winding(tileLoop, midpoint(piece)) !== 0) {
        return false;
      }
    }
    // Tile pieces off the frontier must be in the uncovered area.
    for (const piece of splitAt(ring, tile, vertexMap(near))) {
      // a corner part-way along a round or marked side
      if ((piece.bulge || piece.mark) && !piece.whole) return false;
      if (near.some((f) => meet(piece, f) && onEdge(ring, piece, f))) continue; // judged above
      if (this.windingAt(midpoint(piece)) !== 1) return false;
    }
    return true;
  }

  /**
   * Every fitting placement of `shape` that puts one of its vertices on a
   * frontier *corner* within `reach` of `near`, with the edge leaving (or
   * entering) that corner laid along the frontier edge leaving (or entering)
   * it. A tile never sticks part-way along a straight run: the first square
   * goes into a corner of the region, the next into a corner the first one
   * made. Every tiling can still be laid that way — whatever is left uncovered
   * always has a convex corner, and some tile of the tiling fills it. A tile
   * corner meeting a side part-way (a T-junction) still fits; it just has to be
   * reached from one of the tile's other vertices. A tile of several pieces
   * may snap by any corner of any of them. Placements are returned as posed
   * pieces, each once.
   *
   * `turns`, when given, are the only rotations ζᵏ the shape may be turned by
   * (k mod n) — the player has already turned it, so it lands as it is held or
   * not at all; pass `selfTurns(shape)` for that. Unset, any rotation goes.
   * `accept`, when given, is asked about each fitting placement as well — a
   * level's own rule. `aim`, when given, keeps only placements whose centroid
   * is within `aim.reach` of `aim.centre` — judged in floats before a
   * placement is built, let alone fitted, so a big tile of many corners
   * (the Socolar–Taylor tile's 114) is not fitted at every corner it could
   * reach from the pointer.
   */
  placements(
    shape: Shape,
    near: XY,
    reach: number,
    mirror: boolean,
    turns?: readonly number[],
    accept?: (pieces: Piece[]) => boolean,
    aim?: { centre: XY; reach: number },
  ): Piece[][] {
    const { ring } = this;
    const found = new Map<string, Piece[] | null>();
    const poses = new Set<string>();
    const tryPose = (pieces: Piece[]): void => {
      const k = spotKey(ring, pieces);
      if (found.has(k)) return;
      found.set(k, this.fits(pieces) && (!accept || accept(pieces)) ? pieces : null);
    };
    const flips = mirror ? [false, true] : [false];
    const r2 = reach * reach;
    const corners = this.corners;
    const tau = 2 * Math.PI;
    const sides = flips.map((flip) => sidesOf(shape, flip));
    // only edges with an end within reach: those whose box meets its square
    const square = {
      x0: near[0] - reach,
      y0: near[1] - reach,
      x1: near[0] + reach,
      y1: near[1] + reach,
    };
    for (const f of this.edgesNear(square)) {
      const d = ring.sub(f.b, f.a);
      const [dx0, dy0] = ring.toXY(d);
      const dAngle = Math.atan2(dy0, dx0);
      for (const [v, vxy, leaving] of [
        [f.a, f.axy, true],
        [f.b, f.bxy, false],
      ] as const) {
        if ((vxy[0] - near[0]) ** 2 + (vxy[1] - near[1]) ** 2 > r2) continue;
        if (!corners.has(ring.key(v))) continue;
        for (const { flip, base, at, inner } of sides) {
          for (const o of at) {
            const along = leaving ? o.leaving : o.entering;
            // the turn, by float angle — a guess, confirmed exactly below
            const turn = dAngle - (leaving ? o.leavingAngle : o.enteringAngle);
            const k = Math.round((turn * ring.n) / tau);
            if (turns && !turns.includes(((k % ring.n) + ring.n) % ring.n)) continue;
            if (aim) {
              // the centroid, this vertex laid on v: v + ζᵏ·(centroid − vertex)
              const a = (tau * k) / ring.n;
              const [dx, dy] = o.off;
              const x = vxy[0] + dx * Math.cos(a) - dy * Math.sin(a);
              const y = vxy[1] + dx * Math.sin(a) + dy * Math.cos(a);
              // a margin past rounding: `nearest` measures it again
              if (Math.hypot(x - aim.centre[0], y - aim.centre[1]) > aim.reach + 1e-6) continue;
            }
            const z = ring.zeta(k);
            if (!sameDirection(ring, d, ring.mul(z, along))) continue;
            // a placement is its way up, turn and move: one reached already
            // from another of its corners is not built again
            const t = ring.sub(v, ring.mul(z, o.u));
            const pose = `${flip}|${((k % ring.n) + ring.n) % ring.n}|${ring.key(t)}`;
            if (poses.has(pose)) continue;
            poses.add(pose);
            // a quick no: some piece's inner point lands on covered ground (or
            // off the region) — where a tile fits, each lies in the open
            // uncovered area, well clear of the frontier
            {
              const a = (tau * k) / ring.n;
              const [cos, sin] = [Math.cos(a), Math.sin(a)];
              const [ox, oy] = ring.toXY(o.u);
              const tx = vxy[0] - (ox * cos - oy * sin);
              const ty = vxy[1] - (ox * sin + oy * cos);
              if (
                inner.some(
                  (q) =>
                    q !== null &&
                    this.windingAt([q[0] * cos - q[1] * sin + tx, q[0] * sin + q[1] * cos + ty]) !==
                      1,
                )
              )
                continue;
            }
            tryPose(moved(ring, base, k, t));
          }
        }
      }
    }
    return [...found.values()].filter((pieces) => pieces !== null);
  }

  /** The fitting placement whose centroid is nearest `centre`, if one is
   * within `reach` of it. `turns` and `accept` as for `placements`. */
  nearest(
    shape: Shape,
    centre: XY,
    reach: number,
    mirror: boolean,
    turns?: readonly number[],
    accept?: (pieces: Piece[]) => boolean,
  ): Piece[] | null {
    const { ring } = this;
    // a corner the tile could land on is no farther from its centroid than
    // its farthest vertex
    const xy = allVerts(shape.pieces).map((v) => ring.toXY(v));
    const c = centroidOf(shape.pieces.map((p) => p.verts.map((v) => ring.toXY(v))));
    const radius = Math.max(...xy.map((p) => Math.hypot(p[0] - c[0], p[1] - c[1])));
    let best: Piece[] | null = null;
    let bestD = reach;
    for (const pieces of this.placements(shape, centre, radius + reach, mirror, turns, accept, {
      centre,
      reach,
    })) {
      const c = centroidOf(pieces.map((p) => p.verts.map((v) => ring.toXY(v))));
      const d = Math.hypot(c[0] - centre[0], c[1] - centre[1]);
      if (d < bestD) {
        bestD = d;
        best = pieces;
      }
    }
    return best;
  }
}
