// One level in play: the tiles placed so far and the frontier they leave.
// Pure state — no DOM — so the unit tests drive it directly.

import type { Cyc } from "./geometry/cyclotomic";
import { Frontier } from "./geometry/frontier";
import { signedArea, type XY } from "./geometry/shape";
import type { Level } from "./levels";

export interface Placed {
  id: number;
  /** Which of the level's tile kinds. */
  kind: number;
  verts: Cyc[];
}

export class Puzzle {
  private placed = new Map<number, Placed>();
  private frontier: Frontier;
  private nextId = 1;

  constructor(readonly level: Level) {
    this.frontier = Frontier.ofRegion(level.ring, level.region);
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
  get corners(): ReadonlyMap<string, Cyc> {
    return this.frontier.corners;
  }

  /** How many tiles fill the region — exact for a one-kind tray, which is
   * every level so far (the float areas are of whole tiles). */
  get needed(): number {
    const { ring } = this.level;
    const area = (verts: Cyc[]): number => signedArea(verts.map((v) => ring.toXY(v)));
    const region = this.level.region.reduce((sum, loop) => sum + area(loop), 0);
    return Math.round(region / area(this.level.tiles[0]!.verts));
  }

  /** Where a tile of `kind` dragged to `centre` would land, if anywhere within
   * `reach` of it. */
  snap(kind: number, centre: XY, reach: number): Cyc[] | null {
    return this.frontier.nearest(this.level.tiles[kind]!, centre, reach, this.level.mirror);
  }

  place(kind: number, verts: Cyc[]): Placed {
    if (!this.frontier.fits(verts)) throw new Error("place: the tile does not fit there");
    const tile = { id: this.nextId++, kind, verts };
    this.placed.set(tile.id, tile);
    this.frontier = this.frontier.cover(verts);
    return tile;
  }

  /** Take a placed tile back off the board. */
  lift(id: number): Placed | undefined {
    const tile = this.placed.get(id);
    if (!tile) return undefined;
    this.placed.delete(id);
    let f = Frontier.ofRegion(this.level.ring, this.level.region);
    for (const t of this.placed.values()) f = f.cover(t.verts);
    this.frontier = f;
    return tile;
  }

  reset(): void {
    this.placed.clear();
    this.frontier = Frontier.ofRegion(this.level.ring, this.level.region);
  }
}
