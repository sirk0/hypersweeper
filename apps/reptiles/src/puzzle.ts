// One level in play: the tiles placed so far and the frontier they leave.
// Pure state — no DOM — so the unit tests drive it directly.

import type { Cyc } from "./geometry/cyclotomic";
import { Frontier } from "./geometry/frontier";
import { posed, selfTurns, signedArea, type Shape, type XY } from "./geometry/shape";
import { cornersOf, fitsConfig, type Corner } from "./geometry/vertexRule";
import type { Level } from "./levels";

export interface Placed {
  id: number;
  /** Which of the level's tile kinds. */
  kind: number;
  /** How it was laid: the kind's shape, mirrored if `flip`, turned by ζ^rot. */
  rot: number;
  flip: boolean;
  verts: Cyc[];
}

export class Puzzle {
  private placed = new Map<number, Placed>();
  private frontier: Frontier;
  /** The corners round each vertex, for the vertex rule. */
  private corners = new Map<string, Corner[]>();
  private nextId = 1;
  /** Per kind, the turns that leave its shape looking the same. */
  private same: number[][];

  constructor(readonly level: Level) {
    this.frontier = Frontier.ofRegion(level.ring, level.region);
    this.same = level.tiles.map(selfTurns);
  }

  get tiles(): Placed[] {
    return [...this.placed.values()];
  }

  get won(): boolean {
    return this.frontier.empty;
  }

  /** The open edges, for drawing where the next tile can go. */
  get openEdges(): readonly { axy: XY; bxy: XY }[] {
    return this.frontier.edges;
  }

  /** The frontier's corners — the only points a tile sticks to. */
  get openCorners(): ReadonlyMap<string, Cyc> {
    return this.frontier.corners;
  }

  /** Which corners of a placement meet what is already down, or the rim. */
  touching(verts: Cyc[]): Cyc[] {
    return this.frontier.touching(verts);
  }

  /** How much of the region is covered, 0 to 1. Not a tile count: the
   * region can be finished more than one way, with more or fewer tiles. */
  get coverage(): number {
    const { ring } = this.level;
    const area = (verts: Cyc[]): number => signedArea(verts.map((v) => ring.toXY(v)));
    const region = this.level.region.reduce((sum, loop) => sum + area(loop), 0);
    const covered = this.tiles.reduce((sum, t) => sum + area(t.verts), 0);
    return this.won ? 1 : Math.min(covered / region, 0.999);
  }

  /** A kind's shape, mirrored if `flip`, turned by ζ^rot. */
  shapeAt(kind: number, rot: number, flip = false): Shape {
    const shape = this.level.tiles[kind]!;
    return { ring: shape.ring, verts: posed(shape, { rot, flip, t: shape.ring.zero }) };
  }

  /** Whether the level has a rotate control at all — not where every tile of
   * every kind sits one way (squares among squares, hexagons among hexagons). */
  canTurn(): boolean {
    return this.level.turn > 0;
  }

  /** Every way the board turns a kind — the turns worth trying for it. */
  orientations(kind: number): number[] {
    const step = this.level.turns[kind]!;
    if (step === 0) return [0];
    const period = this.same[kind]!.find((k) => k > 0) ?? this.level.ring.n;
    const out: number[] = [];
    for (let k = 0; k < period; k += step) out.push(k);
    return out;
  }

  /** How many tiles of a kind are down. */
  used(kind: number): number {
    return this.tiles.filter((t) => t.kind === kind).length;
  }

  /** The stars a finished board earns, `seconds` after the first tile went
   * down: one for finishing at all, two for doing it with no more tiles than
   * the board was cut from, three for that within the level's time limit. */
  stars(seconds: number): 0 | 1 | 2 | 3 {
    if (!this.won) return 0;
    const need = this.level.need.reduce((a, b) => a + b, 0);
    if (this.tiles.length > need) return 1;
    return seconds <= this.level.seconds ? 3 : 2;
  }

  /**
   * Whether the level's vertex rule lets a tile land on `verts` (which already
   * fits): it meets its neighbours edge to edge — no corner part-way along a
   * side, either way — and every vertex it touches, with the new corner added,
   * can still be completed to the rule. Always true on a level without one.
   */
  allows(verts: Cyc[]): boolean {
    const { rule, ring } = this.level;
    if (!rule) return true;
    if (!this.frontier.edgeToEdge(verts)) return false;
    return cornersOf(ring, verts).every(([key, corner]) =>
      fitsConfig(ring.n, rule, [...(this.corners.get(key) ?? []), corner]),
    );
  }

  /** Whether the level has a flip control: its board uses some kind both ways
   * round (the kisrhombille's triangles). */
  canFlip(): boolean {
    return this.level.mirror;
  }

  /** Where a tile of `kind`, held turned by ζ^rot (and mirrored, if `flip`)
   * and dragged to `centre`,
   * would land, if anywhere within `reach` of it: only in that orientation,
   * and only where the vertex rule allows. */
  snap(kind: number, centre: XY, reach: number, rot: number, flip = false): Cyc[] | null {
    return this.frontier.nearest(
      this.shapeAt(kind, rot, flip),
      centre,
      reach,
      false,
      this.same[kind],
      (v) => this.allows(v),
    );
  }

  place(kind: number, verts: Cyc[], rot: number, flip = false): Placed {
    if (!this.frontier.fits(verts)) throw new Error("place: the tile does not fit there");
    const tile = { id: this.nextId++, kind, rot, flip, verts };
    this.placed.set(tile.id, tile);
    this.frontier = this.frontier.cover(verts);
    this.addCorners(verts);
    return tile;
  }

  /** Take a placed tile back off the board. */
  lift(id: number): Placed | undefined {
    const tile = this.placed.get(id);
    if (!tile) return undefined;
    this.placed.delete(id);
    let f = Frontier.ofRegion(this.level.ring, this.level.region);
    this.corners.clear();
    for (const t of this.placed.values()) {
      f = f.cover(t.verts);
      this.addCorners(t.verts);
    }
    this.frontier = f;
    return tile;
  }

  private addCorners(verts: Cyc[]): void {
    // only a level with a rule reads them, and only its regular polygons have
    // the unit sides they are measured off
    if (!this.level.rule) return;
    for (const [key, corner] of cornersOf(this.level.ring, verts)) {
      const list = this.corners.get(key);
      if (list) list.push(corner);
      else this.corners.set(key, [corner]);
    }
  }

  /** Every placement that lands with a corner on frontier corner `at`. */
  private spotsAt(at: XY): { kind: number; rot: number; flip: boolean; spot: Cyc[] }[] {
    const out: { kind: number; rot: number; flip: boolean; spot: Cyc[] }[] = [];
    const flips = this.canFlip() ? [false, true] : [false];
    // biggest first: one big tile settles more than several small ones
    for (let kind = this.level.tiles.length - 1; kind >= 0; kind--) {
      for (const flip of flips) {
        for (const rot of this.orientations(kind)) {
          const spots = this.frontier.placements(
            this.shapeAt(kind, rot, flip),
            at,
            1e-6,
            false,
            this.same[kind],
            (v) => this.allows(v),
          );
          for (const spot of spots) out.push({ kind, rot, flip, spot });
        }
      }
    }
    return out;
  }

  /** Fill what is left — a test and dev aid. Each step works the open corner
   * with the fewest ways to fill it, so a corner nothing fits is found at once
   * and a forced one is taken without a guess, and backtracks out of dead
   * ends. False if the board cannot be finished from here, or not within
   * `budget` placements. */
  solve(budget = 20000): boolean {
    const left = { budget };
    return this.search(left);
  }

  private search(left: { budget: number }): boolean {
    if (this.won) return true;
    if (left.budget-- <= 0) return false;
    const { ring } = this.level;
    let best: { kind: number; rot: number; flip: boolean; spot: Cyc[] }[] | null = null;
    for (const corner of this.openCorners.values()) {
      const here = this.spotsAt(ring.toXY(corner));
      if (!best || here.length < best.length) best = here;
      if (best.length <= 1) break;
    }
    for (const { kind, rot, flip, spot } of best ?? []) {
      const tile = this.place(kind, spot, rot, flip);
      if (this.search(left)) return true;
      this.lift(tile.id);
    }
    return false;
  }

  reset(): void {
    this.placed.clear();
    this.corners.clear();
    this.frontier = Frontier.ofRegion(this.level.ring, this.level.region);
  }
}
