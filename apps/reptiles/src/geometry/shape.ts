// Tiles as exact polygons, and the rigid motions that put them on the board.
//
// A Shape is a tile: one or more pieces, each any simple polygon — convex or
// not (the chair, the tromino, the sphinx and the spectre are concave), with
// edges of any length (bricks, kites) — listed counter-clockwise with y up.
// Almost every tile is one piece. A tile of several moves as one: the fish's
// tail and body, which meet at a single point, or the kissing squares, corner
// to corner; nothing here asks the pieces to touch at all. A Pose is a
// Euclidean isometry that keeps the vertices in the shape's ring: a rotation
// by a power of ζ, an optional mirror, then a translation.
//
// A tile can have round edges (the Spectre): `curve` says, edge by edge, which
// way each one bulges. The polygon stays the exact truth — what fits where,
// what a corner is — and a curve is only a label on its straight edge: two
// tiles meet along an edge only where their curves are the same line, so the
// frontier checks the labels as well (see frontier.ts), and the view draws
// them (src/view/curve.ts).

import { orient, type Cyc, type Ring } from "./cyclotomic";

export type XY = [number, number];

/** One polygon of a tile. */
export interface Piece {
  verts: Cyc[];
  /** Round edges, if the tile has them: one entry per edge, edge i running
   * from verts[i] to verts[i + 1] — `IN` where it bulges to its left (into a
   * counter-clockwise tile), `OUT` where it bulges to its right, 0 where it
   * is straight. A round tile lists every point its curves start and end at,
   * a flat corner included (the Spectre's), so each edge is one curve. */
  curve?: Bulge[];
}

export interface Shape {
  ring: Ring;
  /** One or more, never overlapping; moved, turned and mirrored together. */
  pieces: Piece[];
}

/** A piece, its curve left out when it has none. */
export function piece(verts: Cyc[], curve?: Bulge[]): Piece {
  return curve ? { verts, curve } : { verts };
}

/** A one-piece shape: the polygon `verts`. */
export function polygon(ring: Ring, verts: Cyc[], curve?: Bulge[]): Shape {
  return { ring, pieces: [piece(verts, curve)] };
}

/** Every vertex of every piece. */
export function allVerts(pieces: readonly Piece[]): Cyc[] {
  return pieces.flatMap((p) => p.verts);
}

/** The pieces' vertices as one key: which spot a placement is, whatever
 * order its pieces and vertices are listed in. */
export function spotKey(ring: Ring, pieces: readonly Piece[]): string {
  return allVerts(pieces)
    .map((v) => ring.key(v))
    .sort()
    .join("|");
}

/** How many sides a shape has, all its pieces' real corners together. */
export function sides(shape: Shape): number {
  return shape.pieces.reduce((n, p) => n + sideCount(shape.ring, p.verts), 0);
}

/** Which way an edge bulges, seen along it: to its left, to its right, or not
 * at all. Every bulge is the same symmetric arc, so an edge bulging `IN` from
 * a to b is the very line of one bulging `OUT` from b to a — the two edges
 * that meet there. */
export type Bulge = -1 | 0 | 1;
export const IN: Bulge = 1;
export const OUT: Bulge = -1;

/** `curve` for the shape `posed` makes: a mirror keeps a bulge inward or
 * outward, but lists the edges backwards. */
export function posedCurve(curve: Bulge[] | undefined, flip: boolean): Bulge[] | undefined {
  if (!curve || !flip) return curve;
  const m = curve.length;
  return curve.map((_, j) => curve[(((m - 2 - j) % m) + m) % m]!);
}

/** `cell`, a translate of `shape` with its pieces and their vertices listed
 * in any order, as pieces carrying the shape's curves: edge i of each is the
 * shape's edge it lands on. Throws when `cell` is not a translate of it. */
export function curveOnto(shape: Shape, cell: Cyc[][]): Piece[] {
  const { ring, pieces } = shape;
  const fail = (): never => {
    throw new Error("curveOnto: not a translate of the shape");
  };
  const first = cell[0] ?? fail();
  // the translation: the one that carries some vertex onto the cell's first
  for (const own of pieces) {
    for (const v of own.verts) {
      const t = ring.sub(first[0]!, v);
      const out = cell.map((verts) => {
        for (const p of pieces) {
          const m = p.verts.length;
          if (verts.length !== m) continue;
          for (let j = 0; j < m; j++) {
            if (verts.every((u, i) => ring.eq(u, ring.add(p.verts[(i + j) % m]!, t))))
              return piece(verts, p.curve && verts.map((_, i) => p.curve![(i + j) % m]!));
          }
        }
        return null;
      });
      if (out.every((p) => p !== null) && cell.length === pieces.length) return out as Piece[];
    }
  }
  return fail();
}

/** Whether `verts[i]` is a real corner of the polygon — not a flat one, part-way
 * along a side (the Spectre's, kept for its curves). */
export function realCorners(ring: Ring, verts: Cyc[]): boolean[] {
  const m = verts.length;
  return verts.map((v, i) => orient(ring, verts[(i - 1 + m) % m]!, v, verts[(i + 1) % m]!) !== 0);
}

/** How many sides the polygon `verts` has: its real corners. */
export function sideCount(ring: Ring, verts: Cyc[]): number {
  return realCorners(ring, verts).filter(Boolean).length;
}

export interface Pose {
  /** Rotate by ζ^rot. */
  rot: number;
  /** Mirror in the x axis (complex conjugation) before rotating. */
  flip: boolean;
  /** Then translate. */
  t: Cyc;
}

/** The shape's pieces under `pose`, still counter-clockwise: a mirror
 * reverses the winding, so its vertex order is reversed back — and its
 * curves with it. */
export function posed(shape: Shape, pose: Pose): Piece[] {
  const { ring } = shape;
  const z = ring.zeta(pose.rot);
  return shape.pieces.map((p) => {
    const out = p.verts.map((v) => ring.add(ring.mul(z, pose.flip ? ring.conj(v) : v), pose.t));
    if (pose.flip) out.reverse();
    return piece(out, posedCurve(p.curve, pose.flip));
  });
}

/** `pieces` turned by ζ^rot and then moved by `t` — curves kept, as a turn
 * keeps them. */
export function moved(ring: Ring, pieces: readonly Piece[], rot: number, t: Cyc): Piece[] {
  const z = ring.zeta(rot);
  return pieces.map((p) =>
    piece(
      p.verts.map((v) => ring.add(ring.mul(z, v), t)),
      p.curve,
    ),
  );
}

/** A regular polygon with unit sides, its first edge along the x axis from the
 * origin. Needs `sides` to divide the ring's order, so each turn is a power of
 * ζ. */
export function regular(ring: Ring, sides: number): Shape {
  if (ring.n % sides !== 0) throw new Error(`a ${sides}-gon does not fit ℤ[ζ${ring.n}]`);
  const step = ring.n / sides;
  const verts: Cyc[] = [ring.zero];
  for (let i = 1; i < sides; i++) verts.push(ring.add(verts[i - 1]!, ring.zeta((i - 1) * step)));
  return polygon(ring, verts);
}

/** A closed path walked from the origin: each step is `len` unit edges in
 * direction ζ^dir. How a region outline is written exactly. */
export function walk(ring: Ring, steps: [dir: number, len: number][]): Cyc[] {
  const verts: Cyc[] = [];
  let at = ring.zero;
  for (const [dir, len] of steps) {
    for (let i = 0; i < len; i++) {
      verts.push(at);
      at = ring.add(at, ring.zeta(dir));
    }
  }
  if (!ring.isZero(at)) throw new Error("walk: path does not close");
  return verts;
}

// -- float measures, for drawing and for picking the nearest snap ------------

export function signedArea(pts: XY[]): number {
  let a = 0;
  for (let i = 0; i < pts.length; i++) {
    const [x0, y0] = pts[i]!;
    const [x1, y1] = pts[(i + 1) % pts.length]!;
    a += x0 * y1 - x1 * y0;
  }
  return a / 2;
}

/** The area centroid of a tile's pieces together. */
export function centroidOf(loops: XY[][]): XY {
  let a = 0;
  let cx = 0;
  let cy = 0;
  for (const loop of loops) {
    const w = signedArea(loop);
    const [x, y] = centroid(loop);
    a += w;
    cx += w * x;
    cy += w * y;
  }
  return [cx / a, cy / a];
}

/** The area centroid of a simple polygon. */
export function centroid(pts: XY[]): XY {
  let a = 0;
  let cx = 0;
  let cy = 0;
  for (let i = 0; i < pts.length; i++) {
    const [x0, y0] = pts[i]!;
    const [x1, y1] = pts[(i + 1) % pts.length]!;
    const c = x0 * y1 - x1 * y0;
    a += c;
    cx += (x0 + x1) * c;
    cy += (y0 + y1) * c;
  }
  return [cx / (3 * a), cy / (3 * a)];
}

/** Winding number of a closed loop of edges about p (float; p is assumed off
 * every edge — callers only ask about points well clear of them). */
export function winding(edges: Iterable<[XY, XY]>, p: XY): number {
  let w = 0;
  for (const [[ax, ay], [bx, by]] of edges) {
    const cross = (bx - ax) * (p[1] - ay) - (p[0] - ax) * (by - ay);
    if (ay <= p[1]) {
      if (by > p[1] && cross > 0) w++;
    } else if (by <= p[1] && cross < 0) w--;
  }
  return w;
}

export function loopEdges(pts: XY[]): [XY, XY][] {
  return pts.map((p, i) => [p, pts[(i + 1) % pts.length]!]);
}

/** The turns k (0..n-1) for which ζᵏ·`shape` is a translate of `cell` —
 * pieces in any order, each listed from any vertex: how a tile of that shape
 * sits in a given cell. Empty when the cell is not that shape at all. */
export function turnsOnto(shape: Shape, cell: Cyc[][]): number[] {
  const { ring, pieces } = shape;
  const lengths = (ps: Cyc[][]): string =>
    ps
      .map((p) => p.length)
      .sort((a, b) => a - b)
      .join();
  if (lengths(cell) !== lengths(pieces.map((p) => p.verts))) return [];
  const keys = new Set(cell.flat().map((v) => ring.key(v)));
  const pieceKey = (verts: Cyc[]): string =>
    verts
      .map((v) => ring.key(v))
      .sort()
      .join("|");
  const own = new Set(cell.map(pieceKey));
  const anchor = cell[0]![0]!;
  const turns: number[] = [];
  for (let k = 0; k < ring.n; k++) {
    const turned = pieces.map((p) => p.verts.map((v) => ring.mul(ring.zeta(k), v)));
    // a translate maps some turned vertex onto the cell's first; try each —
    // every vertex lands on one of the cell's, and each piece on a piece
    const fits = turned.flat().some((p) => {
      const t = ring.sub(anchor, p);
      const at = turned.map((q) => q.map((v) => ring.add(v, t)));
      return (
        at.every((q) => q.every((v) => keys.has(ring.key(v)))) &&
        (at.length === 1 || at.every((q) => own.has(pieceKey(q))))
      );
    });
    if (fits) turns.push(k);
  }
  return turns;
}

/** The turns that carry `shape` onto a translate of itself — k = 0 always;
 * 0, 4, 8 for a triangle in ℤ[ζ12]; every 2 for a hexagon there. Two
 * orientations of a tile that differ by one of these are the same
 * orientation. */
export function selfTurns(shape: Shape): number[] {
  return turnsOnto(
    shape,
    shape.pieces.map((p) => p.verts),
  );
}

/** The tile `cell` (each piece counter-clockwise) moved to rest on its
 * longest side: that side along the x axis from the origin, the rest of the
 * tile above it — how the tray holds a tile. A side can rest only if the
 * whole tile lies on its left (not across a concave tile's dent: Klaassen's
 * heptagon; nor a piece below another's side) and it runs along one of the
 * ring's directions; where the longest cannot (the cut across a pentagonal
 * spiral's pentagon), the longest that can. The piece it rests on comes
 * first, listed from that side. A tile with no side to rest on — every side
 * of each piece has some other piece across it — is held as it is. */
export function restFlat(ring: Ring, cell: Cyc[][]): Shape {
  const sides: { p: number; i: number; from: Cyc; to: Cyc; length: number }[] = [];
  cell.forEach((verts, p) => {
    const xy = verts.map((v) => ring.toXY(v));
    const m = verts.length;
    // a side runs from one real corner to the next: a flat corner (kept for a
    // round tile's curves) is part-way along one
    const real = realCorners(ring, verts);
    const end = (i: number): number => {
      let j = (i + 1) % m;
      while (!real[j]) j = (j + 1) % m;
      return j;
    };
    for (let i = 0; i < m; i++) {
      if (!real[i]) continue;
      const [ax, ay] = xy[i]!;
      const [bx, by] = xy[end(i)]!;
      sides.push({
        p,
        i,
        from: verts[i]!,
        to: verts[end(i)]!,
        length: Math.hypot(bx - ax, by - ay),
      });
    }
  });
  // which side to stand on is a choice among sides, not an identity: the
  // first of the longest, by a margin well past rounding
  sides.sort((a, b) => {
    const d = b.length - a.length;
    return Math.abs(d) > 1e-9 ? d : a.p - b.p || a.i - b.i;
  });
  const all = cell.flat();
  for (const { p, i, from, to } of sides) {
    if (all.some((v) => orient(ring, from, to, v) < 0)) continue;
    const along = ring.sub(to, from);
    for (let k = 0; k < ring.n; k++) {
      const turned = ring.mul(ring.zeta(k), along);
      const [x, y] = ring.toXY(turned);
      // ζ^k turns the side onto the positive x axis: its imaginary part is 0,
      // exactly, and it points right
      if (ring.isZero(ring.sub(turned, ring.conj(turned))) && x > 0 && Math.abs(y) < 1e-9) {
        // listed from the side it rests on, so its first side is the flat one
        const verts = cell[p]!;
        const order = [
          [...verts.slice(i), ...verts.slice(0, i)],
          ...cell.filter((_, q) => q !== p),
        ];
        return {
          ring,
          pieces: order.map((vs) =>
            piece(vs.map((v) => ring.mul(ring.zeta(k), ring.sub(v, from)))),
          ),
        };
      }
    }
  }
  if (cell.length > 1) {
    const from = cell[0]![0]!;
    return { ring, pieces: cell.map((vs) => piece(vs.map((v) => ring.sub(v, from)))) };
  }
  throw new Error("restFlat: no side runs along a ring direction");
}
