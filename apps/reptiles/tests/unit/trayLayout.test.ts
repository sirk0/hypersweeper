import { describe, expect, it } from "vitest";
import { orient, strictlyBetween, type Cyc } from "../../src/geometry/cyclotomic";
import { NONE, colours, partner } from "../../src/geometry/marks";
import { posed, spotKey, type Piece, type XY } from "../../src/geometry/shape";
import { LEVELS, levelByKey, type Level } from "../../src/levels";
import { groupsPlaced, trayGroups, type LaidTile } from "../../src/view/trayLayout";
import { part } from "./shard";

// A marking's card and a tiling's card draw the tray's tiles joined edge to
// edge (src/view/trayLayout.ts): each tile a pose the level lets it take,
// overlapping none of the others, and every edge two of them share whole a
// pair the board would let meet — the marks partners, the curves opposite —
// so the picture never shows two tiles meeting as the board forbids.

interface Side {
  a: Cyc;
  b: Cyc;
  mark: number;
  curve: number;
}

const sidesOf = (tile: LaidTile): Side[] =>
  tile.pieces.flatMap((p) =>
    p.verts.map((a, i) => ({
      a,
      b: p.verts[(i + 1) % p.verts.length]!,
      mark: p.marks?.[i] ?? NONE,
      curve: p.curve?.[i] ?? 0,
    })),
  );

/** Whether two sides lie along each other for a stretch, exactly. */
function along(level: Level, f: Side, g: Side): boolean {
  const { ring } = level;
  if (orient(ring, g.a, g.b, f.a) !== 0 || orient(ring, g.a, g.b, f.b) !== 0) return false;
  return (
    strictlyBetween(ring, g.a, g.b, f.a) ||
    strictlyBetween(ring, g.a, g.b, f.b) ||
    strictlyBetween(ring, f.a, f.b, g.a) ||
    strictlyBetween(ring, f.a, f.b, g.b) ||
    (ring.eq(f.a, g.b) && ring.eq(f.b, g.a))
  );
}

const shared = (level: Level, f: Side, g: Side): boolean =>
  level.ring.eq(f.a, g.b) && level.ring.eq(f.b, g.a);

/** Whether `tile` is the level's tray tile of its kind, turned by its rotate
 * step (mirrored only where the level flips) and moved. */
function isPose(level: Level, tile: LaidTile): boolean {
  const { ring } = level;
  const shape = level.tiles[tile.kind]!;
  const key = spotKey(ring, tile.pieces);
  const turns = level.turn > 0 ? Math.ceil(ring.n / level.turn) : 1;
  for (const flip of level.mirror ? [false, true] : [false])
    for (let k = 0; k < turns; k++) {
      const at = posed(shape, { rot: k * level.turn, flip, t: ring.zero });
      for (const v of at[0]!.verts) {
        const t = ring.sub(tile.pieces[0]!.verts[0]!, v);
        const moved: Piece[] = at.map((p) => ({ ...p, verts: p.verts.map((u) => ring.add(u, t)) }));
        if (spotKey(ring, moved) === key) return true;
      }
    }
  return false;
}

function insidePoly(poly: readonly XY[], [px, py]: XY): boolean {
  let odd = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [ax, ay] = poly[j]!;
    const [bx, by] = poly[i]!;
    if (ay > py !== by > py && px < ax + ((py - ay) * (bx - ax)) / (by - ay)) odd = !odd;
  }
  return odd;
}

function gap(poly: readonly XY[], [px, py]: XY): number {
  let best = Infinity;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [ax, ay] = poly[j]!;
    const [bx, by] = poly[i]!;
    const dx = bx - ax;
    const dy = by - ay;
    const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy)));
    best = Math.min(best, Math.hypot(px - ax - t * dx, py - ay - t * dy));
  }
  return best;
}

/** Whether two tiles' insides share any point of a fine grid over where
 * their boxes meet — read apart from the layout's own overlap test. */
function overlapping(level: Level, p: LaidTile, q: LaidTile): boolean {
  const polys = (t: LaidTile): XY[][] =>
    t.pieces.map((piece) => piece.verts.map((v) => level.ring.toXY(v)));
  const [pp, qq] = [polys(p), polys(q)];
  const box = (ps: XY[][]): number[] => {
    const all = ps.flat();
    return [
      Math.min(...all.map(([x]) => x)),
      Math.min(...all.map(([, y]) => y)),
      Math.max(...all.map(([x]) => x)),
      Math.max(...all.map(([, y]) => y)),
    ];
  };
  const [a, b] = [box(pp), box(qq)];
  const x0 = Math.max(a[0]!, b[0]!);
  const y0 = Math.max(a[1]!, b[1]!);
  const x1 = Math.min(a[2]!, b[2]!);
  const y1 = Math.min(a[3]!, b[3]!);
  if (x0 >= x1 || y0 >= y1) return false;
  const eps = 1e-6 * Math.max(a[2]! - a[0]!, a[3]! - a[1]!);
  const deep = (ps: XY[][], pt: XY): boolean =>
    ps.some((poly) => insidePoly(poly, pt) && gap(poly, pt) > eps);
  const N = 48;
  for (let i = 0; i <= N; i++)
    for (let j = 0; j <= N; j++) {
      const pt: XY = [x0 + ((x1 - x0) * i) / N, y0 + ((y1 - y0) * j) / N];
      if (deep(pp, pt) && deep(qq, pt)) return true;
    }
  return false;
}

const SEVERAL = LEVELS.filter((l) => l.tiles.length > 1);

describe("the tray's tiles joined for a picture", () => {
  it.each(part(SEVERAL.map((l) => [l.key, l] as const)))(
    "%s: one group, every tile a pose it may take, overlapping none, every shared edge a pair that may meet",
    (_, level) => {
      const groups = trayGroups(level);
      // every tile of every level joins into one group today; the fallback
      // (groups drawn apart) is for a tray that cannot
      expect(groups).toHaveLength(1);
      const tiles = groups.flat();
      expect(tiles.map((t) => t.kind).sort((p, q) => p - q)).toEqual(level.tiles.map((_, k) => k));
      const marked = level.tiles.some((s) =>
        s.pieces.some(
          (p) => (p.marks ?? []).some((m) => m !== NONE) || (p.curve ?? []).some((c) => c !== 0),
        ),
      );
      // joined: tiles that touch along a stretch of edge, one component
      const root = tiles.map((_, i) => i);
      const find = (i: number): number => (root[i] === i ? i : (root[i] = find(root[i]!)));
      tiles.forEach((p, i) => {
        expect(isPose(level, p), `${level.key}: kind ${p.kind}`).toBe(true);
        tiles.forEach((q, j) => {
          if (j <= i) return;
          expect(overlapping(level, p, q), `${level.key}: ${p.kind} over ${q.kind}`).toBe(false);
          for (const f of sidesOf(p))
            for (const g of sidesOf(q)) {
              if (!along(level, f, g)) continue;
              root[find(i)] = find(j);
              if (shared(level, f, g)) {
                expect(f.mark, `${level.key}: marks across ${p.kind}|${q.kind}`).toBe(
                  partner(g.mark),
                );
                // a straight edge is 0 either way round: compare, not Object.is
                expect(
                  f.curve === -g.curve,
                  `${level.key}: curves across ${p.kind}|${q.kind}`,
                ).toBe(true);
              } else {
                // part-way along each other: only plain tiles may
                expect(marked, `${level.key}: ${p.kind} part-way along ${q.kind}`).toBe(false);
              }
            }
        });
      });
      expect(new Set(tiles.map((_, i) => find(i))).size, level.key).toBe(1);
    },
  );

  it("lays 3.6.3.6's triangle along a side of its hexagon", () => {
    const level = levelByKey("trihex")!;
    const [tri, hex] = trayGroups(level)[0]!.sort((p, q) => p.kind - q.kind);
    expect(sidesOf(tri!).some((f) => sidesOf(hex!).some((g) => shared(level, f, g)))).toBe(true);
  });

  it("lays a checkerboard's two squares side by side, red against blue", () => {
    const level = levelByKey("squares.2apart")!;
    const [p, q] = trayGroups(level)[0]!;
    const across = sidesOf(p!).flatMap((f) => sidesOf(q!).filter((g) => shared(level, f, g)));
    expect(across).toHaveLength(1);
    const pair = colours(across[0]!.mark)!;
    expect(pair.own).not.toBe(pair.other);
  });

  it("draws groups apart, side by side, where a tray cannot be joined", () => {
    const level = levelByKey("ammannbeenker.3apart")!;
    const apart = trayGroups(level)[0]!.map((t) => [t]);
    const placed = groupsPlaced(level, apart);
    expect(placed).toHaveLength(level.tiles.length);
    const boxes = placed.map((t) => {
      const [a, b, c, d, e, f] = t.matrix;
      const pts = t.loops
        .flatMap((l) => l.xy)
        .map(([x, y]) => [a * x + c * y + e, b * x + d * y + f]);
      return {
        x0: Math.min(...pts.map(([x]) => x!)),
        x1: Math.max(...pts.map(([x]) => x!)),
        y0: Math.min(...pts.map(([, y]) => y!)),
        y1: Math.max(...pts.map(([, y]) => y!)),
      };
    });
    // no two boxes meet: each group stands on its own
    for (let i = 0; i < boxes.length; i++)
      for (let j = i + 1; j < boxes.length; j++) {
        const [p, q] = [boxes[i]!, boxes[j]!];
        const meet = p.x0 < q.x1 && q.x0 < p.x1 && p.y0 < q.y1 && q.y0 < p.y1;
        expect(meet, `${i} and ${j}`).toBe(false);
      }
  });
});
