// One level in play: the tiles placed so far and the frontier they leave.
// Pure state — no DOM — so the unit tests drive it directly.

import type { Cyc } from "./geometry/cyclotomic";
import { Frontier } from "./geometry/frontier";
import { posed, selfTurns, type Shape, type XY } from "./geometry/shape";
import { cornersOf, fitsConfig, type Corner } from "./geometry/vertexRule";
import type { Level } from "./levels";

export interface Placed {
  id: number;
  /** Which of the level's tile kinds. */
  kind: number;
  /** The turn it was laid at: the kind's shape rotated by ζ^rot. */
  rot: number;
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

  /** How many tiles fill the region. */
  get needed(): number {
    return this.level.count;
  }

  /** A kind's shape turned by ζ^rot. */
  shapeAt(kind: number, rot: number): Shape {
    const shape = this.level.tiles[kind]!;
    return { ring: shape.ring, verts: posed(shape, { rot, flip: false, t: shape.ring.zero }) };
  }

  /** Whether turning a kind ever matters on this board — not for squares among
   * squares, nor hexagons among hexagons. */
  canTurn(kind: number): boolean {
    return this.level.turns[kind]! > 0;
  }

  /** Every way the rotate control can hold a kind. */
  orientations(kind: number): number[] {
    const step = this.level.turns[kind]!;
    const start = this.level.starts[kind]!;
    if (step === 0) return [start];
    const period = this.same[kind]!.find((k) => k > 0) ?? this.level.ring.n;
    const out: number[] = [];
    for (let k = 0; k < period; k += step) out.push(start + k);
    return out;
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

  /** Where a tile of `kind`, held turned by ζ^rot and dragged to `centre`,
   * would land, if anywhere within `reach` of it: only in that orientation,
   * and only where the vertex rule allows. */
  snap(kind: number, centre: XY, reach: number, rot: number): Cyc[] | null {
    return this.frontier.nearest(this.shapeAt(kind, rot), centre, reach, this.level.mirror, this.same[kind], (v) =>
      this.allows(v),
    );
  }

  place(kind: number, verts: Cyc[], rot: number): Placed {
    if (!this.frontier.fits(verts)) throw new Error("place: the tile does not fit there");
    const tile = { id: this.nextId++, kind, rot, verts };
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
    for (const [key, corner] of cornersOf(this.level.ring, verts)) {
      const list = this.corners.get(key);
      if (list) list.push(corner);
      else this.corners.set(key, [corner]);
    }
  }

  /** Fill what is left — a test and dev aid: at the first open corner, try
   * every kind at every turn the rule allows, backtracking out of dead ends.
   * False if the board cannot be finished from here. */
  solve(): boolean {
    if (this.won) return true;
    const { ring, mirror } = this.level;
    const corner = ring.toXY(this.openCorners.values().next().value!);
    for (let kind = 0; kind < this.level.tiles.length; kind++) {
      for (const rot of this.orientations(kind)) {
        const spots = this.frontier.placements(this.shapeAt(kind, rot), corner, 1e-6, mirror, this.same[kind], (v) =>
          this.allows(v),
        );
        for (const spot of spots) {
          const tile = this.place(kind, spot, rot);
          if (this.solve()) return true;
          this.lift(tile.id);
        }
      }
    }
    return false;
  }

  reset(): void {
    this.placed.clear();
    this.corners.clear();
    this.frontier = Frontier.ofRegion(this.level.ring, this.level.region);
  }
}
