import catalog from "@tiling/data/catalog.json";
import {
  ammannBeenkerBoard,
  ARCH_TILINGS,
  archimedeanBoard,
  archTemplate,
  chairBoard,
  drafterBoard,
  halfTrapezoidBoard,
  hexBoard,
  kiteDartBoard,
  klaassenBoard,
  ltetrominoBoard,
  penroseBoard,
  pentaSpiral5Board,
  pentaSpiral6Board,
  pentaSpiral7Board,
  phyllotaxisBoard,
  ppentominoBoard,
  rhombicLBoard,
  rightIsoscelesBoard,
  rightTrapezoidBoard,
  spectreBoard,
  sphinxBoard,
  squareBoard,
  stretchedChairBoard,
  templateCells,
  trapezoidBoard,
  triangleGridBoard,
  ttetrominoBoard,
} from "@tiling/geometry";
import type { Board } from "@tiling/geometry";
import { describe, expect, it } from "vitest";
import { aperiodicShrink } from "../../src/geometry/aperiodic";
import { strictlyBetween, type Cyc } from "../../src/geometry/cyclotomic";
import {
  allVerts,
  centroid,
  IN,
  OUT,
  posed,
  sideCount,
  spotKey,
  turnsOnto,
  turnsOntoPieces,
  type Piece,
  type XY,
} from "../../src/geometry/shape";
import { cornersOf, fitsConfig, span, type Corner } from "../../src/geometry/vertexRule";
import { BOARDS, LEVELS, levelByKey, notation, parseNotation, type Level } from "../../src/levels";
import { Puzzle } from "../../src/puzzle";

/** A one-piece tile's or cell's polygon — every level's but the rep-tiles
 * of several pieces. */
function poly(pieces: readonly Piece[]): Cyc[] {
  if (pieces.length !== 1) throw new Error(`${pieces.length} pieces`);
  return pieces[0]!.verts;
}

/** Finish a level; the number of tiles it took. */
function fill(p: Puzzle): number {
  if (!p.solve()) throw new Error("stuck");
  return p.tiles.length;
}

/** Every board of every tiling — each a level of its own. */
const BOARD_LEVELS = BOARDS.map((b) => levelByKey(b.key)!);

describe("puzzle", () => {
  it.each(BOARDS.map((b) => b.key))("%s: the board it was cut from fills it exactly", (key) => {
    const p = new Puzzle(levelByKey(key)!);
    const { ring, tiles } = p.level;
    // a cell's kind: the tray tile it is a turn of, or a turn of mirrored —
    // and which turn, which way round
    const sitOf = (cell: Piece[]): [kind: number, rot: number, flip: boolean] => {
      for (const [kind, t] of tiles.entries()) {
        for (const flip of [false, true]) {
          const pieces = posed(t, { rot: 0, flip, t: ring.zero });
          const [rot] = turnsOntoPieces({ ring, pieces }, cell);
          if (rot !== undefined) return [kind, rot, flip];
        }
      }
      return [-1, 0, false];
    };
    for (const cell of p.level.cells) {
      expect(p.coverage).toBeLessThan(1);
      const [kind, rot, flip] = sitOf(cell);
      expect(kind).toBeGreaterThanOrEqual(0);
      p.place(kind, cell, rot, flip);
    }
    expect(p.won).toBe(true);
    expect(p.coverage).toBe(1);
    expect(p.level.tiles.map((_, k) => p.used(k))).toEqual(p.level.need);
  });

  // (but the Socolar–Taylor tile's: nineteen pieces tried at every one of its
  // board's five hundred corners, step after step, take a quarter of a
  // minute — the board's own tiles filling it exactly, above, show it can be
  // finished)
  const searchable = BOARD_LEVELS.filter((l) => !l.socolarTaylor).map((l) => l.key);
  it.each(searchable)("%s can be finished by search from empty", (key) => {
    const p = new Puzzle(levelByKey(key)!);
    expect(p.solve()).toBe(true);
  });

  // Each level against the Hypersweeper builder it mirrors, at unit edge.
  // Both sides are moved to start at the origin (the builder draws y down,
  // these levels y up) and compared by tile centroids.
  const BUILDERS: Record<string, () => Board> = {
    squares: () => squareBoard(4, 4, 1),
    triangles: () => triangleGridBoard(4, 6, 1),
    hexagons: () => hexBoard(5, 4, 1),
  };
  /** Hypersweeper's rep-tile builders, by mode: (levels, scale) → Board. */
  const REPTILE_BUILDERS: Record<string, (levels: number, scale: number) => Board> = {
    sphinx: sphinxBoard,
    chair: chairBoard,
    ltetromino: ltetrominoBoard,
    ppentomino: ppentominoBoard,
    trapezoid: trapezoidBoard,
    righttrapezoid: rightTrapezoidBoard,
    halftrapezoid: halfTrapezoidBoard,
    stretchedchair: stretchedChairBoard,
    rhombicl: rhombicLBoard,
    rightisosceles: rightIsoscelesBoard,
    drafter: drafterBoard,
    ttetromino: ttetrominoBoard,
  };
  /** Hypersweeper's spiral builders, by mode: (rings, keep, scale) → Board. */
  const SPIRAL_BUILDERS: Record<string, (rings: number, keep: number, scale: number) => Board> = {
    phyllotaxis: phyllotaxisBoard,
    klaassen: klaassenBoard,
    pentaspiral5: pentaSpiral5Board,
    pentaspiral6: pentaSpiral6Board,
    pentaspiral7: pentaSpiral7Board,
  };
  /** Hypersweeper's aperiodic builders, by mode: (depth, keep, scale,
   * variant) → the window (variant 0 the centred one). `scale` draws the
   * builder's edge one unit long: the Penrose patches deflate, so theirs is
   * φ^depth. */
  const APERIODIC_BUILDERS: Record<
    string,
    (depth: number, keep: number, scale: number, variant: number) => Board
  > = {
    penrose: (depth, keep, scale, variant) => penroseBoard(depth, scale, keep, variant),
    kitedart: (depth, keep, scale, variant) => kiteDartBoard(depth, scale, keep, variant),
    ammannbeenker: (depth, keep, scale, variant) => ammannBeenkerBoard(depth, scale, keep, variant),
    spectre: (depth, keep, scale, variant) => spectreBoard(depth, keep, scale, variant),
  };
  const builderFor = (key: string): Board => {
    const { window, inflations, spiral, aperiodic } = levelByKey(key)!;
    if (window) return archimedeanBoard(window.tiling, window.nx, window.ny, 1);
    if (inflations !== undefined) return REPTILE_BUILDERS[key]!(inflations, 1);
    if (spiral) return SPIRAL_BUILDERS[key]!(spiral.rings, spiral.keep, 1);
    if (aperiodic) {
      const { mode, depth, keep, variant } = aperiodic;
      return APERIODIC_BUILDERS[mode]!(depth, keep, 1 / aperiodicShrink(mode, depth), variant);
    }
    return BUILDERS[key]!();
  };
  const centroids = (polys: XY[][]): XY[] => {
    const all = polys.flat();
    const x0 = Math.min(...all.map((p) => p[0]));
    const y0 = Math.min(...all.map((p) => p[1]));
    return polys.map((poly) => centroid(poly.map(([x, y]): XY => [x - x0, y - y0])));
  };
  /** The same tiles: one for one, each centroid within 1e-4 of its partner —
   * Hypersweeper's tiling templates store positions rounded to six decimals,
   * so a centroid there can be a few millionths off the exact one. */
  const sameTiles = (ours: XY[], theirs: XY[]): void => {
    expect(ours).toHaveLength(theirs.length);
    const left = theirs.slice();
    for (const [x, y] of ours) {
      const i = left.findIndex(([u, v]) => Math.hypot(u - x, v - y) < 1e-4);
      expect(
        i,
        `no tile of Hypersweeper's at ${x.toFixed(4)},${y.toFixed(4)}`,
      ).toBeGreaterThanOrEqual(0);
      left.splice(i, 1);
    }
  };

  // A tiling turned to lay its edges on the ring (the snub hexagonal) is cut
  // in its own frame, not Hypersweeper's; the vertex test below covers it.
  const isDual = (group: string): boolean => group === "laves" || group === "2-isohedral";
  // (a tile of several pieces — the fish, the Socolar–Taylor tile — has no
  // Hypersweeper board to match, nor has the hat's family:
  // tests/unit/hat.test.ts is its oracle)
  const unturned = BOARD_LEVELS.filter(
    (l) =>
      !l.window?.turned &&
      !isDual(l.group) &&
      !l.pieceTile &&
      !l.socolarTaylor &&
      !l.hat &&
      !l.decor,
  ).map((l) => l.key);
  /** A board past a tiling's first, cut from Hypersweeper's template as
   * `archimedeanBoard` cuts it — every tile that fits whole in the square, a
   * tile its real corners — but at the square's own centre: the builder grows
   * half a domain round the copy of its centre nearest its middle, enough for
   * the template's centre and not for a square moved off it. */
  const movedWindow = (key: string): XY[][] => {
    const { tiling, nx, centre } = levelByKey(key)!.window!;
    const t = archTemplate(tiling);
    const half = (nx * t.width) / 2;
    const slack = 1e-6 * Math.max(1, t.width, t.height);
    const reach = Math.ceil(half / Math.min(t.width, t.height)) + 2;
    const m0 = Math.floor(centre![0] / t.width);
    const n0 = Math.floor(centre![1] / t.height);
    const out: XY[][] = [];
    for (let m = m0 - reach; m <= m0 + reach; m++) {
      for (let n = n0 - reach; n <= n0 + reach; n++) {
        templateCells(t, m, n).forEach(({ pts }, i) => {
          const fits = pts.every(
            ([x, y]) =>
              Math.abs(x - centre![0]) <= half + slack && Math.abs(y - centre![1]) <= half + slack,
          );
          if (fits) out.push(pts.filter((_, j) => t.cells[i]!.real[j]).map(([x, y]) => [x, -y]));
        });
      }
    }
    return out;
  };
  it.each(unturned)("%s is Hypersweeper's board, tile for tile", (key) => {
    const p = new Puzzle(levelByKey(key)!);
    const ours = p.level.cells.map((c) => poly(c).map((v) => p.level.ring.toXY(v)));
    const theirs = p.level.window?.centre
      ? movedWindow(key)
      : [...builderFor(key).polygons.values()].map((poly) => poly.map(([x, y]): XY => [x, -y]));
    sameTiles(centroids(ours), centroids(theirs));
  });

  // (a bond, a pentagonal tiling, a rep-tile, a spiral or an aperiodic tiling
  // has no one vertex configuration, and an isogonal one is not edge to edge)
  // (a marked level goes by the board it marks)
  const familyOf = (l: Level): string => (l.decor ? levelByKey(l.decor.of)!.group : l.group);
  const ofPolygons = BOARD_LEVELS.filter(
    (l) =>
      !isDual(familyOf(l)) &&
      !["rectangle", "isogonal", "pentagonal", "reptile", "spiral", "aperiodic"].includes(
        familyOf(l),
      ),
  ).map((l) => l.key);
  it.each(ofPolygons)("%s is one outline, every inner point its vertex configuration", (key) => {
    const level = levelByKey(key)!;
    const { ring, configs } = level;
    expect(level.region).toHaveLength(1); // one outline, no holes
    const round = new Map<string, Corner[]>();
    for (const cell of level.cells) {
      for (const [k, corner] of cornersOf(ring, poly(cell)))
        round.set(k, [...(round.get(k) ?? []), corner]);
    }
    // a point is inner when its corners go all the way round
    const inner = [...round.values()].filter(
      (cs) => cs.reduce((sum, c) => sum + span(ring.n, c.sides), 0) === ring.n,
    );
    expect(inner.length).toBeGreaterThan(0);
    // each inner point is one of the configurations, and each of them occurs
    const seen = new Set<number>();
    for (const corners of inner) {
      const which = configs.findIndex(
        (c) => c.length === corners.length && fitsConfig(ring.n, c, corners),
      );
      expect(which).toBeGreaterThanOrEqual(0);
      seen.add(which);
    }
    expect(seen.size).toBe(configs.length);
  });

  // The congruent-rectangle bonds: one brick, and at every point inside the
  // board either four brick corners (the stacked bond) or two against the
  // middle of a third brick's side — the T-junction the other bonds have.
  const bonds = LEVELS.filter((l) => l.group === "rectangle");
  it("has the five congruent-rectangle bonds", () => {
    expect(bonds.map((l) => l.key)).toEqual([
      "stackedbond",
      "runningbond",
      "basketweave",
      "basketweave3",
      "herringbone",
    ]);
    expect(bonds.map((l) => l.name)).toEqual([
      "Stacked bond",
      "Running bond",
      "Basket weave",
      "Basket weave 3x3",
      "Herringbone",
    ]);
  });
  it.each(bonds.map((l) => l.key))("%s: one brick, laid in a bond", (key) => {
    const level = levelByKey(key)!;
    const { ring } = level;
    expect(level.region).toHaveLength(1);
    // one tile kind, a rectangle lying on its long side: 1 by ½, or by ⅓
    expect(level.tiles).toHaveLength(1);
    const brick = poly(level.tiles[0]!.pieces).map((v) => ring.toXY(v));
    expect(brick).toHaveLength(4);
    const [w, h] = [brick[1]![0] - brick[0]![0], brick[2]![1] - brick[1]![1]];
    expect(w).toBeCloseTo(1, 12);
    expect(h).toBeCloseTo(key === "basketweave3" ? 1 / 3 : 1 / 2, 12);
    expect(level.mirror).toBe(false);
    // round each point: the corners there, and the sides it lies inside
    const tiles = level.cells.map(poly);
    const round = new Map<string, { corners: number; sides: number; spanned: number }>();
    // (every corner of a brick is a right angle, a quarter of the turn)
    for (const tile of tiles) {
      for (const v of tile) {
        const at = round.get(ring.key(v)) ?? { corners: 0, sides: 0, spanned: 0 };
        at.corners++;
        at.spanned += ring.n / 4;
        round.set(ring.key(v), at);
      }
    }
    const points = new Map(tiles.flat().map((v) => [ring.key(v), v]));
    for (const tile of tiles) {
      tile.forEach((a, i) => {
        const b = tile[(i + 1) % tile.length]!;
        for (const [k, p] of points) {
          if (!strictlyBetween(ring, a, b, p)) continue;
          const at = round.get(k)!;
          at.sides++;
          at.spanned += ring.n / 2;
        }
      });
    }
    const inner = [...round.values()].filter((r) => r.spanned === ring.n);
    expect(inner.length).toBeGreaterThan(0);
    for (const r of inner) {
      expect([
        [4, 0],
        [2, 1],
      ]).toContainEqual([r.corners, r.sides]);
    }
    const junctions = inner.filter((r) => r.sides > 0).length;
    if (key === "stackedbond") expect(junctions).toBe(0);
    else expect(junctions).toBeGreaterThan(0);
  });

  // The isogonal tilings: regular polygons, not edge to edge, and every point
  // inside the board alike — some tiles' corners there and one tile's side
  // running straight through, the tiles Hypersweeper's config counts.
  const isogonal = LEVELS.filter((l) => l.group === "isogonal");
  it("has Hypersweeper's isogonal tilings, in its order", () => {
    const theirs = ARCH_TILINGS.filter((t) => t.family === "isogonal");
    expect(isogonal.map((l) => l.key)).toEqual(theirs.map((t) => t.key));
    expect(isogonal.map((l) => l.name)).toEqual(theirs.map((t) => t.label));
  });
  const ISOGONAL_KINDS: Record<string, number> = {
    offsetsquare: 1,
    staggeredtri: 1,
    pythagorean: 2,
    rotatedhex: 2,
    rotatedtri: 2,
    threescaletri: 3,
  };
  it.each(isogonal.map((l) => l.key))("%s: every inner point alike, a side through it", (key) => {
    const level = levelByKey(key)!;
    const { ring } = level;
    const config = ARCH_TILINGS.find((t) => t.key === key)!.config;
    expect(level.region).toHaveLength(1);
    expect(level.tiles).toHaveLength(ISOGONAL_KINDS[key]!);
    expect(level.mirror).toBe(false);
    // round each point: the polygons whose corner is there, and those whose
    // side runs through it, and how much of the turn they fill between them
    const tiles = level.cells.map(poly);
    const round = new Map<string, { corners: number[]; sides: number[]; spanned: number }>();
    for (const tile of tiles) {
      // (every tile is regular, so each corner spans what its side count says)
      for (const v of tile) {
        const k = ring.key(v);
        const at = round.get(k) ?? { corners: [], sides: [], spanned: 0 };
        at.corners.push(tile.length);
        at.spanned += span(ring.n, tile.length);
        round.set(k, at);
      }
    }
    const points = new Map(tiles.flat().map((v) => [ring.key(v), v]));
    for (const tile of tiles) {
      tile.forEach((a, i) => {
        const b = tile[(i + 1) % tile.length]!;
        for (const [k, p] of points) {
          if (!strictlyBetween(ring, a, b, p)) continue;
          const at = round.get(k)!;
          at.sides.push(tile.length);
          at.spanned += ring.n / 2;
        }
      });
    }
    const inner = [...round.values()].filter((r) => r.spanned === ring.n);
    expect(inner.length).toBeGreaterThan(0);
    const sorted = (xs: number[]): number[] => xs.slice().sort((x, y) => x - y);
    for (const r of inner) {
      expect(r.sides).toHaveLength(1);
      expect(sorted([...r.corners, ...r.sides])).toEqual(sorted(config));
    }
  });

  // The rep-tiles: every one of Hypersweeper's but the five-triangle (the
  // pinwheel, whose turns are no power of ζ), each a big copy of its one tile.
  const reptiles = LEVELS.filter((l) => l.group === "reptile" && !l.pieceTile);
  it("has Hypersweeper's rep-tiles, in its order", () => {
    const theirs = (catalog.menu.reptile as string[]).filter((m) => m !== "fivetriangle");
    expect(reptiles.map((l) => l.key)).toEqual(theirs);
    expect(reptiles.map((l) => l.name)).toEqual(
      theirs.map((m) => (catalog.modeInfo as Record<string, { label: string }>)[m]!.label),
    );
  });
  it.each(reptiles.map((l) => l.key))("%s: one tile, filling a bigger copy of itself", (key) => {
    const level = levelByKey(key)!;
    const { ring } = level;
    expect(level.tiles).toHaveLength(1);
    expect(level.need).toEqual([level.cells.length]);
    expect(level.cells.length).toBeGreaterThanOrEqual(16);
    expect(level.cells.length).toBeLessThanOrEqual(32);
    expect(level.region).toHaveLength(1);
    // the region, its corners only, is the tile scaled by √(cells) — the same
    // side lengths in the same turning order, from some corner, either way round
    const xy = (verts: Cyc[]): XY[] => verts.map((v) => ring.toXY(v));
    const turning = (pts: XY[]): XY[] =>
      pts.filter((p, i) => {
        const a = pts[(i - 1 + pts.length) % pts.length]!;
        const b = pts[(i + 1) % pts.length]!;
        return Math.abs((p[0] - a[0]) * (b[1] - p[1]) - (p[1] - a[1]) * (b[0] - p[0])) > 1e-9;
      });
    const sides = (pts: XY[]): number[] =>
      pts.map((p, i) =>
        Math.hypot(pts[(i + 1) % pts.length]![0] - p[0], pts[(i + 1) % pts.length]![1] - p[1]),
      );
    const big = sides(turning(xy(level.region[0]!)));
    const small = sides(xy(poly(level.tiles[0]!.pieces))).map(
      (s) => s * Math.sqrt(level.cells.length),
    );
    expect(big).toHaveLength(small.length);
    const rotations = (a: number[]): number[][] =>
      a.map((_, i) => [...a.slice(i), ...a.slice(0, i)]);
    const mirrored = [...small].reverse();
    const matches = [...rotations(small), ...rotations(mirrored)].some((r) =>
      r.every((s, i) => Math.abs(s - big[i]!) < 1e-9),
    );
    expect(matches, `region sides ${big.map((s) => s.toFixed(3))}`).toBe(true);
  });

  // The Laves and 2-isohedral levels: each tile is one of Hypersweeper's dual
  // tiles, and at each of a tile's corners inside the board the right number
  // of tiles meet, in order round it — the V in V3.4.6.4.
  const duals = BOARD_LEVELS.filter((l) => isDual(l.group)).map((l) => l.key);
  /** A polygon's interior angles and its sides over its longest, in order,
   * counter-clockwise. */
  const signature = (raw: XY[]): { angles: number[]; sides: number[] } => {
    const area = raw.reduce(
      (sum, p, i) =>
        sum + p[0] * raw[(i + 1) % raw.length]![1] - raw[(i + 1) % raw.length]![0] * p[1],
      0,
    );
    const pts = area < 0 ? [...raw].reverse() : raw;
    const m = pts.length;
    const sides = pts.map((p, i) =>
      Math.hypot(pts[(i + 1) % m]![0] - p[0], pts[(i + 1) % m]![1] - p[1]),
    );
    const longest = Math.max(...sides);
    const angles = pts.map((p, i) => {
      const prev = pts[(i + m - 1) % m]!;
      const next = pts[(i + 1) % m]!;
      const a =
        Math.atan2(prev[1] - p[1], prev[0] - p[0]) - Math.atan2(next[1] - p[1], next[0] - p[0]);
      return ((a % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
    });
    return { angles, sides: sides.map((x) => x / longest) };
  };
  /** The same polygon up to a similarity — turned, moved, scaled, or
   * mirrored. */
  const similar = (a: XY[], b: XY[]): boolean => {
    if (a.length !== b.length) return false;
    const m = a.length;
    const sa = signature(a);
    for (const pts of [b, b.map(([x, y]): XY => [-x, y])]) {
      const sb = signature(pts);
      for (let k = 0; k < m; k++) {
        const ok = sa.angles.every(
          (x, i) =>
            Math.abs(x - sb.angles[(i + k) % m]!) < 1e-4 &&
            Math.abs(sa.sides[i]! - sb.sides[(i + k) % m]!) < 1e-4,
        );
        if (ok) return true;
      }
    }
    return false;
  };

  it.each(duals)("%s: every tile is one of Hypersweeper's dual tiles", (key) => {
    const level = levelByKey(key)!;
    const theirs = templateCells(archTemplate(level.base), 0, 0).map(({ pts }) =>
      pts.map(([x, y]): XY => [x, y]),
    );
    // each kind matches some tile of the template, and each tile of it some kind
    const kinds = level.tiles.map((t) => poly(t.pieces).map((v) => level.ring.toXY(v)));
    for (const cell of level.cells) {
      const ours = poly(cell).map((v) => level.ring.toXY(v));
      expect(theirs.some((t) => similar(ours, t))).toBe(true);
    }
    for (const t of theirs) expect(kinds.some((k) => similar(k, t))).toBe(true);
    expect(level.tiles).toHaveLength(level.configs.length);
  });

  it.each(duals)("%s: one outline, and round each tile its configuration", (key) => {
    const level = levelByKey(key)!;
    const { ring } = level;
    expect(level.region).toHaveLength(1);
    // how many tiles meet at each corner, and how much angle they fill
    const meet = new Map<string, { count: number; angle: number }>();
    const tiles = level.cells.map(poly);
    for (const tile of tiles) {
      const { angles } = signature(tile.map((v) => ring.toXY(v)));
      tile.forEach((v, i) => {
        const at = meet.get(ring.key(v)) ?? { count: 0, angle: 0 };
        meet.set(ring.key(v), { count: at.count + 1, angle: at.angle + angles[i]! });
      });
    }
    // a tile follows one configuration, the one of its own corner count —
    // the 2-isohedral levels' two have different counts, but for those with
    // two quadrilaterals or two pentagons, where it may follow either
    let checked = 0;
    for (const tile of tiles) {
      // a corner on the rim has tiles missing; it reads as anything
      const degrees = tile.map((v) => {
        const r = meet.get(ring.key(v))!;
        return Math.abs(r.angle - 2 * Math.PI) < 1e-6 ? r.count : null;
      });
      const inner = degrees.filter((d) => d !== null).length;
      if (inner === 0) continue;
      const fits = level.configs.some(
        (config) =>
          config.length === tile.length &&
          [config, [...config].reverse()].some((seq) =>
            seq.some((_, k) =>
              degrees.every((d, i) => d === null || d === seq[(i + k) % config.length]),
            ),
          ),
      );
      expect(fits, `degrees ${degrees.join(",")} against ${level.name}`).toBe(true);
      checked += inner;
    }
    expect(checked).toBeGreaterThan(0);
  });

  // The pentagonal tilings: Hypersweeper's, in its order, each one convex
  // pentagon — its own tile, at its own size — turned and, but for type 10,
  // mirrored.
  // The spirals: every one of Hypersweeper's but the brick rings (a square of
  // bricks, as easily laid in stacked rows), one tile each, wound round a
  // centre the board keeps.
  const spirals = LEVELS.filter((l) => l.group === "spiral");
  it("has Hypersweeper's spirals, in its order", () => {
    const theirs = (catalog.menu.spiral as string[]).filter((m) => m !== "brickrings");
    expect(spirals.map((l) => l.key)).toEqual(theirs);
    expect(spirals.map((l) => l.name)).toEqual(
      theirs.map((m) => (catalog.modeInfo as Record<string, { label: string }>)[m]!.label),
    );
  });
  it.each(spirals.map((l) => l.key))("%s: one tile, two or three dozen, one outline", (key) => {
    const level = levelByKey(key)!;
    expect(level.tiles).toHaveLength(1);
    expect(level.need).toEqual([level.cells.length]);
    expect(level.cells.length).toBeGreaterThanOrEqual(24);
    expect(level.cells.length).toBeLessThanOrEqual(36);
    expect(level.region).toHaveLength(1);
    expect(level.mirror).toBe(false); // a spiral turns its tile, never flips it
    // the tile sits every way the ring turns it, up to its own symmetry:
    // 36° on ℤ[ζ10], 30° on ℤ[ζ12], 180/7° on ℤ[ζ14]
    expect(level.turn).toBe(1);
    const sides = { phyllotaxis: 6, klaassen: 7 }[key] ?? 5;
    expect(poly(level.tiles[0]!.pieces)).toHaveLength(sides);
  });

  // The aperiodic tilings: every one of Hypersweeper's, each the centred
  // window of its builder's patch.
  // (and then the Socolar–Taylor tile, which Hypersweeper has no board for —
  // tests/unit/socolarTaylor.test.ts)
  const aperiodic = LEVELS.filter((l) => l.group === "aperiodic" && l.aperiodic);
  it("has Hypersweeper's aperiodic tilings, in its order — the Spectre's twice", () => {
    // the hat's family follows the Spectre in both, but Rep-tiles cuts those
    // levels from the patch itself (`hatLevel`), not a builder's window
    const HAT_FAMILY = ["hat", "turtle", "hatmetatiles"];
    const theirs = (catalog.menu.aperiodic as string[]).filter((m) => !HAT_FAMILY.includes(m));
    expect((catalog.menu.aperiodic as string[]).slice(-3)).toEqual(HAT_FAMILY);
    expect(theirs.at(-1)).toBe("spectre");
    // the Spectre's board is Tile(1,1) with straight edges, then round
    expect(aperiodic.map((l) => l.key)).toEqual([...theirs.slice(0, -1), "tile11", "spectre"]);
    expect(aperiodic.map((l) => l.aperiodic!.mode)).toEqual([...theirs, "spectre"]);
    const label = (m: string): string =>
      (catalog.modeInfo as Record<string, { label: string }>)[m]!.label;
    expect(aperiodic.map((l) => l.name)).toEqual([
      ...theirs.slice(0, -1).map(label),
      "Tile(1,1)",
      label("spectre"),
    ]);
  });
  /** Each tiling's tiles, by side count, and its rotate step in degrees: 36°
   * on ℤ[ζ10] (a thin rhombus sits at every tenth of a turn), 45° on ℤ[ζ8],
   * 30° on ℤ[ζ12]. */
  const APERIODIC_TILES: Record<string, [number[], number]> = {
    penrose: [[4, 4], 36],
    kitedart: [[4, 4], 36],
    ammannbeenker: [[4, 4], 45],
    tile11: [[13], 30],
    spectre: [[13], 30],
  };
  it.each(aperiodic.map((l) => l.key))("%s: its tiles, two or three dozen, one outline", (key) => {
    const level = levelByKey(key)!;
    const [sides, degrees] = APERIODIC_TILES[key]!;
    expect(level.tiles.map((t) => sideCount(level.ring, poly(t.pieces)))).toEqual(sides);
    expect(level.need.reduce((a, b) => a + b)).toBe(level.cells.length);
    expect(level.cells.length).toBeGreaterThanOrEqual(24);
    expect(level.cells.length).toBeLessThanOrEqual(36);
    expect(level.region).toHaveLength(1);
    // every tile here is mirror-symmetric, but for Tile(1,1) and the
    // Spectre, which the tiling never turns over
    expect(level.mirror).toBe(false);
    expect((level.turn * 360) / level.ring.n).toBe(degrees);
  });

  // The Spectre: Tile(1,1) with its fourteen unit edges bulging out and in by
  // turns, its flat corner kept as the point where two curves meet.
  describe("the Spectre's round edges", () => {
    const spectre = levelByKey("spectre")!;
    const straight = levelByKey("tile11")!;
    const { ring } = spectre;
    const tile = spectre.tiles[0]!.pieces[0]!;
    const key = (a: Cyc, b: Cyc): string => `${ring.key(a)}>${ring.key(b)}`;

    it("is Tile(1,1) with its flat corner kept, its edges out and in by turns", () => {
      expect(tile.verts).toHaveLength(14);
      expect(sideCount(ring, tile.verts)).toBe(13);
      expect(straight.tiles[0]!.pieces[0]!.curve).toBeUndefined();
      // the same tile, the same board: only the edges differ
      expect(spectre.colours).toEqual(straight.colours);
      expect(spectre.turn).toBe(straight.turn);
      expect(spectre.need).toEqual(straight.need);
      expect(tile.curve).toEqual(tile.verts.map((_, i) => (i % 2 ? IN : OUT)));
      // every edge is one unit long: one curve each
      for (const [i, v] of tile.verts.entries()) {
        const d = ring.sub(tile.verts[(i + 1) % 14]!, v);
        expect(ring.eq(ring.mul(d, ring.conj(d)), ring.one)).toBe(true);
      }
    });

    it("meets itself out to in along every edge the board's tiles share", () => {
      const p = new Puzzle(spectre);
      expect(p.solve()).toBe(true);
      const bulge = new Map<string, number>();
      for (const t of p.tiles) {
        const { verts, curve } = t.pieces[0]!;
        verts.forEach((a, i) => bulge.set(key(a, verts[(i + 1) % 14]!), curve![i]!));
      }
      let shared = 0;
      for (const [k, b] of bulge) {
        const [ak, bk] = k.split(">");
        const twin = bulge.get(`${bk}>${ak}`);
        if (twin === undefined) continue;
        expect(twin).toBe(-b); // the same line: in from one side, out from the other
        shared++;
      }
      expect(shared).toBeGreaterThan(2 * spectre.cells.length);
      // and the rim is round wherever a tile lies along it
      expect(spectre.regionCurves!.flat().every((b) => b !== 0)).toBe(true);
    });

    it("refuses a tile whose curves do not match the rim", () => {
      // the board's own first tile, but its curves the other way out
      const p = new Puzzle({
        ...spectre,
        tiles: [{ ring, pieces: [{ ...tile, curve: tile.curve!.map((b) => -b as typeof OUT) }] }],
      });
      expect(p.solve(200)).toBe(false);
    });
  });

  const pentagonal = LEVELS.filter((l) => l.group === "pentagonal");
  it("has Hypersweeper's pentagonal tilings, in its order", () => {
    const theirs = ARCH_TILINGS.filter((t) => t.family === "pentagonal");
    expect(pentagonal.map((l) => l.key)).toEqual(theirs.map((t) => t.key));
    expect(pentagonal.map((l) => l.name)).toEqual(theirs.map((t) => t.label));
  });
  it.each(pentagonal.map((l) => l.key))("%s: one convex pentagon, Hypersweeper's", (key) => {
    const level = levelByKey(key)!;
    const { ring } = level;
    expect(level.region).toHaveLength(1);
    expect(level.tiles).toHaveLength(1);
    expect(level.need).toEqual([level.cells.length]);
    const tile = poly(level.tiles[0]!.pieces).map((v) => ring.toXY(v));
    expect(tile).toHaveLength(5);
    expect(signature(tile).angles.every((a) => a < Math.PI)).toBe(true);
    const [theirs] = templateCells(archTemplate(key), 0, 0).map(({ pts }) =>
      pts.map(([x, y]): XY => [x, y]),
    );
    expect(similar(tile, theirs!)).toBe(true);
    const area = (pts: XY[]): number =>
      Math.abs(
        pts.reduce(
          (sum, p, i) => sum + p[0] * pts[(i + 1) % 5]![1] - pts[(i + 1) % 5]![0] * p[1],
          0,
        ),
      ) / 2;
    expect(area(tile)).toBeCloseTo(area(theirs!), 5);
  });

  it("colours a second kind with as many sides as another apart", () => {
    expect(levelByKey("trihex")!.colours).toEqual(["sides-3", "sides-6"]);
    expect(levelByKey("hexrowsdual")!.colours).toEqual(["sides-4", "sides-4 twin"]);
    const twins = LEVELS.filter((l) => l.colours.some((c) => c.includes("twin")));
    // and the aperiodic tilings of two quadrilaterals: Penrose's two rhombi,
    // his kite and dart, Ammann–Beenker's square and rhombus; and the isogonal
    // tilings of one polygon in two or three sizes — each with its lined
    // boards, which keep the plain board's classes (a coloured one is in its
    // paints)
    expect(twins.map((l) => l.key).sort()).toEqual([
      "ammannbeenker",
      "ammannbeenker.rules",
      "hexringsdual",
      "hexringsdual.lines",
      "hexringsdual.lines2",
      "hexrowsdual",
      "hexrowsdual.lines",
      "hexrowsdual.lines2",
      "kitedart",
      "kitedart.rules",
      "penrose",
      "penrose.rules",
      "pythagorean",
      "pythagorean.lines",
      "pythagorean.lines2",
      "snubelongated2dual",
      "snubelongated2dual.lines",
      "snubelongated2dual.lines2",
      "snubelongateddual",
      "snubelongateddual.lines",
      "snubelongateddual.lines2",
      "squaretrihex2dual",
      "squaretrihex2dual.lines",
      "squaretrihex2dual.lines2",
      "squaretrihexdual",
      "squaretrihexdual.lines",
      "squaretrihexdual.lines2",
      "threescaletri",
      "threescaletri.lines",
      "threescaletri.lines2",
    ]);
  });

  it("flips only where the board uses a tile both ways round", () => {
    // the kisrhombille's triangles, the 2-isohedral tilings whose tiles
    // come in mirror pairs, the pentagonal tilings but type 10, the
    // rep-tiles whose dissection reflects a child, and the Socolar–Taylor
    // tile, which tiles only with its mirror image
    expect(
      LEVELS.filter((l) => l.mirror && !l.decor)
        .map((l) => l.key)
        .sort(),
    ).toEqual([
      "dodecarhombitrihexdual",
      "drafter",
      "fish",
      "halftrapezoid",
      "hat",
      "hexringsdual",
      "kisrhombille",
      "kissingtriangles",
      "pentagon13",
      "pentagon15",
      "ppentomino",
      "rhombicl",
      "righttrapezoid",
      "socolartaylor",
      "sphinx",
      "squaretrihex2dual",
      "squaretrihexdual",
      "stretchedchair",
      "tritrunctrihexdual",
      "turtle",
    ]);
    const p = new Puzzle(levelByKey("kisrhombille")!);
    const { ring, tiles } = p.level;
    // lay the board, then take out one triangle that is the tray's mirror image
    const placed = p.level.cells.map((c) => p.place(0, c, 0));
    const flipped = placed.find((t) => turnsOnto(tiles[0]!, [poly(t.pieces)]).length === 0)!;
    p.lift(flipped.id);
    const centre = centroid(poly(flipped.pieces).map((v) => ring.toXY(v)));
    for (const rot of p.orientations(0)) expect(p.snap(0, centre, 0.2, rot, false)).toBeNull();
    expect(p.orientations(0).some((rot) => p.snap(0, centre, 0.2, rot, true))).toBe(true);
  });

  // (not a rep-tile, nor one marked: its board is the shape of its tile)
  const windows = BOARD_LEVELS.filter(
    (l) => levelByKey(l.decor?.of ?? l.key)!.group !== "reptile",
  ).map((l) => l.key);
  it.each(windows)("%s is about as wide as it is tall", (key) => {
    const { ring, region } = levelByKey(key)!;
    const xy = region.flat().map((v) => ring.toXY(v));
    const span = (i: 0 | 1): number =>
      Math.max(...xy.map((p) => p[i])) - Math.min(...xy.map((p) => p[i]));
    // the hexagonal Laves tilings come no nearer than 0.87 at this size
    expect(span(0) / span(1)).toBeGreaterThan(0.85);
    expect(span(0) / span(1)).toBeLessThan(1.12);
  });

  it("lifting a tile reopens exactly its spot", () => {
    const p = new Puzzle(levelByKey("squares")!);
    fill(p);
    const tile = p.tiles[5]!;
    p.lift(tile.id);
    expect(p.won).toBe(false);
    const c = centroid(poly(tile.pieces).map((v) => p.level.ring.toXY(v)));
    const spot = p.snap(0, c, 0.5, tile.rot)!;
    expect(spotKey(p.level.ring, spot)).toEqual(spotKey(p.level.ring, tile.pieces));
    p.place(0, spot, tile.rot);
    expect(p.won).toBe(true);
  });

  it("a tile lands only as it is held", () => {
    const p = new Puzzle(levelByKey("triangles")!);
    const { ring } = p.level;
    const turn = p.level.turns[0]!;
    // The second triangle of the top row points down: its top side runs
    // from the outline's start (0) to 1, its centroid is (0.5, −√3/6). Held
    // as the tray has it, pointing up, a triangle cannot land there; turned
    // 60° it can.
    const spotFor = (rot: number) => p.snap(0, [0.5, -0.29], 0.3, rot);
    expect(spotFor(0)).toBeNull();
    expect(spotFor(turn)).not.toBeNull();
    // a triangle is the same after 120°, so two steps is the tray's way again
    expect(spotFor(2 * turn)).toBeNull();
    expect(spotKey(ring, spotFor(3 * turn)!)).toEqual(spotKey(ring, spotFor(turn)!));
  });

  it("offers the rotate control only where a turn changes some tile", () => {
    const can = (key: string): boolean => new Puzzle(levelByKey(key)!).canTurn();
    expect(can("squares")).toBe(false);
    expect(can("triangles")).toBe(true);
    // the tray holds a hexagon flat, the board has them pointy-top
    expect(can("hexagons")).toBe(true);
    expect(can("trihex")).toBe(true);
    expect(can("rhombitrihex")).toBe(true);
  });

  it("turns every tile by one step: the largest that reaches every kind's turns", () => {
    const degrees = (key: string): number => {
      const level = levelByKey(key)!;
      return (level.turn * 360) / level.ring.n;
    };
    expect(degrees("squares")).toBe(0);
    expect(degrees("triangles")).toBe(60);
    expect(degrees("hexagons")).toBe(30);
    expect(degrees("trihex")).toBe(60);
    // the squares need 30°, so the triangles and hexagons go round in 30°
    // steps too, through turns where they fit nowhere
    expect(degrees("rhombitrihex")).toBe(30);
  });

  it("reads the tray and the turns off the board", () => {
    const tri = levelByKey("trihex")!;
    expect(tri.tiles.map((t) => poly(t.pieces).length)).toEqual([3, 6]);
    expect(tri.turns.map((k) => (k * 360) / tri.ring.n)).toEqual([60, 0]);
    const rhombi = levelByKey("rhombitrihex")!;
    expect(rhombi.tiles.map((t) => poly(t.pieces).length)).toEqual([3, 4, 6]);
    // its squares sit three ways, 30° apart; triangles two ways; hexagons
    // one way, but pointy-top — 30° from the tray's flat one
    expect(rhombi.turns.map((k) => (k * 360) / rhombi.ring.n)).toEqual([60, 30, 30]);
  });

  it("names each level by its vertex configuration", () => {
    const named = (group: string): string[] =>
      LEVELS.filter((l) => l.group === group).map((l) => l.name);
    expect(named("regular")).toEqual(["4⁴", "3⁶", "6³"]);
    expect(named("uniform")).toEqual([
      "3.6.3.6",
      "4.8²",
      "3.12²",
      "3³.4²",
      "3².4.3.4",
      "3⁴.6",
      "3.4.6.4",
      "4.6.12",
    ]);
    expect(named("2-uniform")).toHaveLength(20);
    expect(named("laves")).toEqual([
      "V4.8²",
      "V3.6.3.6",
      "V3.12²",
      "V3².4.3.4",
      "V3³.4²",
      "V3⁴.6",
      "V3.4.6.4",
      "V4.6.12",
    ]);
    expect(new Set(named("2-uniform")).size).toBe(20); // the subscripts keep them apart
    // not vertex-transitive, so named as Hypersweeper labels them
    expect(named("pentagonal")).toEqual([
      "Type 10 (James, 1975)",
      "Type 13 (Rice, 1977)",
      "Type 15 (Mann et al., 2015)",
    ]);
    // the 2-isohedral levels: V and their primal's name, its pair their configs
    expect(named("2-isohedral")).toHaveLength(20);
    expect(new Set(named("2-isohedral")).size).toBe(20);
    for (const level of LEVELS.filter((l) => l.group === "2-isohedral")) {
      const primal = levelByKey(level.dualOf!)!;
      expect(level.name).toBe(`V${primal.name}`);
      expect(level.configs).toEqual(primal.configs);
    }
    for (const level of LEVELS) {
      if (level.group === "regular" || level.group === "uniform")
        expect(level.name).toBe(notation(level.configs[0]!));
    }
    expect(notation([3, 3, 3, 4, 4])).toBe("3³.4²");
    expect(parseNotation("[3⁶; 3².4.12]")).toEqual([
      [3, 3, 3, 3, 3, 3],
      [3, 3, 4, 12],
    ]);
    expect(parseNotation("[3.4².6; 3.6.3.6]₂")).toEqual([
      [3, 4, 4, 6],
      [3, 6, 3, 6],
    ]);
  });

  it("starts every tray tile resting on a flat side", () => {
    for (const level of LEVELS) {
      for (const shape of level.tiles) {
        // the first piece's first edge horizontal, and every piece above it
        const [a, b] = shape.pieces[0]!.verts.map((v) => level.ring.toXY(v));
        expect(a![1]).toBeCloseTo(b![1], 12);
        for (const v of allVerts(shape.pieces))
          expect(level.ring.toXY(v)[1]).toBeGreaterThanOrEqual(-1e-12);
      }
    }
  });

  it("counts each pile from the board it was cut from", () => {
    const rhombi = levelByKey("rhombitrihex")!;
    expect(rhombi.need).toEqual([10, 16, 5]); // triangles, squares, hexagons
    expect(rhombi.need.reduce((a, b) => a + b)).toBe(rhombi.cells.length);
  });

  it("gives one star for finishing, two for the tiles needed, three in time", () => {
    const p = new Puzzle(levelByKey("trihex")!);
    const kindOf = (sides: number): number =>
      p.level.tiles.findIndex((t) => poly(t.pieces).length === sides);
    for (const cell of p.level.cells) p.place(kindOf(poly(cell).length), cell, 0);
    expect(p.stars(p.level.seconds)).toBe(3);
    expect(p.stars(p.level.seconds + 1)).toBe(2);
    // one tile short of finished: nothing yet (the one-star case, more tiles
    // than needed, is in the six-triangles test below)
    p.lift(p.tiles[0]!.id);
    expect(p.stars(0)).toBe(0);
  });

  /** A finished trihexagonal board with its innermost hexagon lifted out. */
  function trihexWithHole(rule?: number[]): { p: Puzzle; hex: Cyc[] } {
    const level = levelByKey("trihex")!;
    const p = new Puzzle(rule ? { ...level, rule } : level);
    const kindOf = (sides: number): number =>
      p.level.tiles.findIndex((t) => poly(t.pieces).length === sides);
    for (const cell of level.cells) p.place(kindOf(poly(cell).length), cell, 0);
    // the hexagon furthest in: fewest corners on the rim
    const rim = new Set(level.region.flat().map((v) => level.ring.key(v)));
    const onRim = (t: { pieces: Piece[] }): number =>
      poly(t.pieces).filter((v) => rim.has(level.ring.key(v))).length;
    const hex = p.tiles
      .filter((t) => poly(t.pieces).length === 6)
      .sort((a, b) => onRim(a) - onRim(b))[0]!;
    p.lift(hex.id);
    return { p, hex: poly(hex.pieces) };
  }

  it("wins however it is covered: six triangles in a hexagon's place", () => {
    const { p, hex } = trihexWithHole();
    const { ring } = p.level;
    const centre = ring.toXY(hex[0]!).map((x, i) => x + (ring.toXY(hex[3]!)[i]! - x) / 2) as XY;
    // fan the hole from its corners: each triangle has its apex at the centre
    for (let i = 0; i < 6 && !p.won; i++) {
      const spot = p
        .orientations(0)
        .map((rot) =>
          p.snap(0, centroid([centre, ring.toXY(hex[i]!), ring.toXY(hex[(i + 1) % 6]!)]), 0.3, rot),
        )
        .find((s) => s);
      expect(spot).toBeTruthy();
      p.place(0, spot!, 0);
    }
    expect(p.won).toBe(true);
    expect(p.tiles.length).toBe(p.level.cells.length + 5);
    // finished, but with more tiles than needed: one star, however fast
    expect(p.stars(0)).toBe(1);
  });

  it("can hold a level to a vertex rule: then no six triangles in a hexagon's place", () => {
    const { p, hex } = trihexWithHole([3, 6, 3, 6]);
    // the hole is a unit hexagon; a triangle in it would leave a vertex with
    // three triangles running, which 3.6.3.6 never has
    const { ring } = p.level;
    const centre = centroid(hex.map((v) => ring.toXY(v)));
    for (const rot of p.orientations(0)) expect(p.snap(0, centre, 1, rot)).toBeNull();
    expect(p.snap(1, centre, 0.5, p.orientations(1)[0]!)).not.toBeNull();
  });
});
