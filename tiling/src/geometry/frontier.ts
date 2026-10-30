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
import { centroid, loopEdges, posed, winding, type Shape, type XY } from "./shape";

export interface Edge {
  a: Cyc;
  b: Cyc;
  ak: string;
  bk: string;
  axy: XY;
  bxy: XY;
}

const EPS = 1e-9;

function edge(ring: Ring, a: Cyc, b: Cyc): Edge {
  return { a, b, ak: ring.key(a), bk: ring.key(b), axy: ring.toXY(a), bxy: ring.toXY(b) };
}

function loopToEdges(ring: Ring, verts: Cyc[]): Edge[] {
  return verts.map((v, i) => edge(ring, v, verts[(i + 1) % verts.length]!));
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
      out.push(edge(ring, from, p));
      from = p;
    }
    out.push(edge(ring, from, e.b));
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

function midpoint(e: Edge): XY {
  return [(e.axy[0] + e.bxy[0]) / 2, (e.axy[1] + e.bxy[1]) / 2];
}

/** Rotation k, by float angle, that most nearly turns `from` onto `to`. A
 * guess only: the caller confirms it exactly. */
function guessTurn(ring: Ring, from: Cyc, to: Cyc): number {
  const [fx, fy] = ring.toXY(from);
  const [tx, ty] = ring.toXY(to);
  const turn = Math.atan2(ty, tx) - Math.atan2(fy, fx);
  return Math.round((turn * ring.n) / (2 * Math.PI));
}

export class Frontier {
  private constructor(
    readonly ring: Ring,
    readonly edges: readonly Edge[],
  ) {}

  /** The frontier of an untouched region: its loops, interior on the left. */
  static ofRegion(ring: Ring, loops: Cyc[][]): Frontier {
    return new Frontier(
      ring,
      loops.flatMap((loop) => loopToEdges(ring, loop)),
    );
  }

  get empty(): boolean {
    return this.edges.length === 0;
  }

  private cornerCache: Map<string, Cyc> | null = null;

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

  /** The frontier once `poly` (counter-clockwise) is covered too. The caller
   * has checked `fits`. */
  cover(poly: Cyc[]): Frontier {
    const { ring } = this;
    const reversed = loopToEdges(ring, poly).map((e) => edge(ring, e.b, e.a));
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
        if (x < box.x0 - EPS || x > box.x1 + EPS || y < box.y0 - EPS || y > box.y1 + EPS) return false;
        return strictlyBetween(ring, e.a, e.b, v);
      });
    });
  }

  /** `verts` meets the frontier edge to edge: none of its corners part-way
   * along a frontier edge, and no frontier vertex part-way along one of its
   * sides. */
  edgeToEdge(verts: Cyc[]): boolean {
    const { ring } = this;
    const sides = loopToEdges(ring, verts);
    const box = boxOf(verts.map((v) => ring.toXY(v)));
    const near = this.edges.filter((e) => overlaps(edgeBox(e), box));
    for (const e of near) {
      for (const v of verts) if (strictlyBetween(ring, e.a, e.b, v)) return false;
      for (const s of sides) if (strictlyBetween(ring, s.a, s.b, e.a)) return false;
    }
    return true;
  }

  /** `poly` (counter-clockwise) lies inside the uncovered area: it overlaps no
   * covered tile and does not leave the region. Touching along edges and at
   * points is fine. */
  fits(poly: Cyc[]): boolean {
    const { ring } = this;
    const tile = loopToEdges(ring, poly);
    const tileXY = poly.map((v) => ring.toXY(v));
    const box = boxOf(tileXY);
    const near = this.edges.filter((e) => overlaps(edgeBox(e), box));

    for (const f of near) for (const t of tile) if (properlyCross(ring, f.a, f.b, t.a, t.b)) return false;

    // Frontier pieces: none may run through the tile's interior, and one lying
    // along a tile edge must face the same way (the uncovered side is the
    // tile's inside), or the tile sits on covered ground there.
    const tileLoop = loopEdges(tileXY);
    for (const piece of splitAt(ring, near, vertexMap(tile))) {
      const along = tile.find((t) => onEdge(ring, piece, t));
      if (along) {
        if (!sameDirection(ring, ring.sub(along.b, along.a), ring.sub(piece.b, piece.a))) return false;
      } else if (winding(tileLoop, midpoint(piece)) !== 0) {
        return false;
      }
    }
    // Tile pieces off the frontier must be in the uncovered area.
    const all = this.edges.map((e): [XY, XY] => [e.axy, e.bxy]);
    for (const piece of splitAt(ring, tile, vertexMap(near))) {
      if (near.some((f) => onEdge(ring, piece, f))) continue; // judged above
      if (winding(all, midpoint(piece)) !== 1) return false;
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
   * reached from one of the tile's other vertices. Placements are returned as
   * posed vertex lists, each once.
   *
   * `turns`, when given, are the only rotations ζᵏ the shape may be turned by
   * (k mod n) — the player has already turned it, so it lands as it is held or
   * not at all; pass `selfTurns(shape)` for that. Unset, any rotation goes.
   * `accept`, when given, is asked about each fitting placement as well — a
   * level's own rule.
   */
  placements(
    shape: Shape,
    near: XY,
    reach: number,
    mirror: boolean,
    turns?: readonly number[],
    accept?: (verts: Cyc[]) => boolean,
  ): Cyc[][] {
    const { ring } = this;
    const found = new Map<string, Cyc[]>();
    const tryPose = (verts: Cyc[]): void => {
      const k = verts.map((v) => ring.key(v)).sort().join("|");
      if (found.has(k)) return;
      found.set(k, this.fits(verts) && (!accept || accept(verts)) ? verts : []);
    };
    const flips = mirror ? [false, true] : [false];
    const r2 = reach * reach;
    const corners = this.corners;
    for (const f of this.edges) {
      for (const [v, vxy, d, leaving] of [
        [f.a, f.axy, ring.sub(f.b, f.a), true],
        [f.b, f.bxy, ring.sub(f.b, f.a), false],
      ] as const) {
        if ((vxy[0] - near[0]) ** 2 + (vxy[1] - near[1]) ** 2 > r2) continue;
        if (!corners.has(ring.key(v))) continue;
        for (const flip of flips) {
          const base = posed(shape, { rot: 0, flip, t: ring.zero });
          const m = base.length;
          for (let i = 0; i < m; i++) {
            const along = leaving
              ? ring.sub(base[(i + 1) % m]!, base[i]!)
              : ring.sub(base[i]!, base[(i - 1 + m) % m]!);
            const k = guessTurn(ring, along, d);
            if (turns && !turns.includes(((k % ring.n) + ring.n) % ring.n)) continue;
            const z = ring.zeta(k);
            if (!sameDirection(ring, d, ring.mul(z, along))) continue;
            const t = ring.sub(v, ring.mul(z, base[i]!));
            tryPose(base.map((p) => ring.add(ring.mul(z, p), t)));
          }
        }
      }
    }
    return [...found.values()].filter((verts) => verts.length > 0);
  }

  /** The fitting placement whose centroid is nearest `centre`, if one is
   * within `reach` of it. `turns` and `accept` as for `placements`. */
  nearest(
    shape: Shape,
    centre: XY,
    reach: number,
    mirror: boolean,
    turns?: readonly number[],
    accept?: (verts: Cyc[]) => boolean,
  ): Cyc[] | null {
    const { ring } = this;
    const xy = shape.verts.map((v) => ring.toXY(v));
    const radius = Math.max(...xy.map((p) => Math.hypot(p[0] - xy[0]![0], p[1] - xy[0]![1])));
    let best: Cyc[] | null = null;
    let bestD = reach;
    for (const verts of this.placements(shape, centre, radius + reach, mirror, turns, accept)) {
      const c = centroid(verts.map((v) => ring.toXY(v)));
      const d = Math.hypot(c[0] - centre[0], c[1] - centre[1]);
      if (d < bestD) {
        bestD = d;
        best = verts;
      }
    }
    return best;
  }
}
