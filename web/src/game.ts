// Port of minesweeper/game.py — core minesweeper rules over an arbitrary cell
// graph (adjacency map). Knows nothing about geometry or rendering.
import type { CellId } from "./boards/core";
import { mulberry32, sample, type Rng } from "./rng";

export type CellState = "hidden" | "revealed" | "flagged";
export type GameState = "playing" | "won" | "lost";

/** How the player's flags stood when the game ended. */
export interface FlagTally {
  /** Flags on mines. */
  right: number;
  /** Flags on safe cells. */
  wrong: number;
}

export interface GameOptions {
  mineCount?: number;
  minePositions?: Iterable<CellId>;
  rng?: Rng;
}

export class Game {
  readonly mineCount: number;
  state: GameState = "playing";

  private readonly adjacency: Map<CellId, CellId[]>;
  private readonly rng: Rng;
  private mines: Set<CellId>;
  private minesPlaced: boolean;
  private readonly cellStates = new Map<CellId, CellState>();
  private revealedCount = 0;
  private endTally: FlagTally | null = null;

  constructor(
    adjacency: Map<CellId, Iterable<CellId>>,
    options: GameOptions = {},
  ) {
    this.adjacency = new Map();
    for (const [cell, neighbors] of adjacency) {
      this.adjacency.set(cell, [...neighbors]);
    }
    if (this.adjacency.size === 0) throw new Error("board has no cells");
    for (const [cell, neighbors] of this.adjacency) {
      for (const n of neighbors) {
        if (!this.adjacency.has(n)) {
          throw new Error(`neighbor ${n} of ${cell} is not a board cell`);
        }
      }
    }

    let mineCount = options.mineCount;
    const explicit = options.minePositions
      ? new Set(options.minePositions)
      : null;
    if (explicit) {
      for (const m of explicit) {
        if (!this.adjacency.has(m)) {
          throw new Error(`mine position not on the board: ${m}`);
        }
      }
      mineCount = explicit.size;
    }
    if (mineCount == null || mineCount < 1) {
      throw new Error("need at least one mine");
    }
    if (mineCount >= this.adjacency.size) {
      throw new Error("mine count must leave at least one safe cell");
    }

    this.mineCount = mineCount;
    this.rng = options.rng ?? mulberry32((Math.random() * 2 ** 32) >>> 0);
    this.mines = explicit ?? new Set();
    this.minesPlaced = explicit != null;
    for (const cell of this.adjacency.keys()) this.cellStates.set(cell, "hidden");
  }

  // -- queries ---------------------------------------------------------------

  get cells(): CellId[] {
    return [...this.adjacency.keys()];
  }

  neighbors(cell: CellId): CellId[] {
    return this.adjacency.get(cell) ?? [];
  }

  cellState(cell: CellId): CellState {
    return this.cellStates.get(cell)!;
  }

  isMine(cell: CellId): boolean {
    return this.mines.has(cell);
  }

  adjacentMines(cell: CellId): number {
    let n = 0;
    for (const neighbor of this.adjacency.get(cell) ?? []) {
      if (this.mines.has(neighbor)) n++;
    }
    return n;
  }

  get flagsRemaining(): number {
    let flagged = 0;
    for (const s of this.cellStates.values()) if (s === "flagged") flagged++;
    return this.mineCount - flagged;
  }

  get revealed(): number {
    return this.revealedCount;
  }

  get cellCount(): number {
    return this.adjacency.size;
  }

  /** The player's flags as they stood the moment the game ended, or `null`
   * while it is still being played.
   *
   * This has to be a snapshot rather than a count taken afterwards, because a
   * win auto-flags every mine the player never got to (see `reveal`). Read
   * after the fact, *every* win looks like a perfect flagging run. */
  get endFlags(): FlagTally | null {
    return this.endTally;
  }

  // -- moves -----------------------------------------------------------------

  /** Reveal a cell; changed cells are returned for ranged rendering updates. */
  reveal(cell: CellId): CellId[] {
    if (this.state !== "playing" || !this.adjacency.has(cell)) return [];
    if (this.cellStates.get(cell) !== "hidden") return [];

    if (!this.minesPlaced) this.placeMines(cell);

    if (this.mines.has(cell)) {
      this.cellStates.set(cell, "revealed");
      // Deliberately not counted as opened: `revealedCount` stays the number of
      // *safe* cells uncovered, which is the honest measure of how far a lost
      // game got.
      this.state = "lost";
      this.endTally = this.tallyFlags();
      return [cell];
    }

    const changed = this.floodReveal(cell);
    if (this.revealedCount === this.adjacency.size - this.mineCount) {
      this.state = "won";
      // Before the auto-flag below, and it has to stay before it.
      this.endTally = this.tallyFlags();
      for (const mine of this.mines) {
        if (this.cellStates.get(mine) === "hidden") {
          this.cellStates.set(mine, "flagged");
          changed.push(mine);
        }
      }
    }
    return changed;
  }

  toggleFlag(cell: CellId): CellId[] {
    if (this.state !== "playing" || !this.adjacency.has(cell)) return [];
    const current = this.cellStates.get(cell);
    if (current === "hidden") {
      this.cellStates.set(cell, "flagged");
      return [cell];
    }
    if (current === "flagged") {
      this.cellStates.set(cell, "hidden");
      return [cell];
    }
    return [];
  }

  /** Reveal all unflagged neighbours of a revealed cell whose flag count
   * matches its adjacent-mine count. */
  chord(cell: CellId): CellId[] {
    if (this.state !== "playing" || !this.adjacency.has(cell)) return [];
    if (this.cellStates.get(cell) !== "revealed") return [];
    const neighbors = this.adjacency.get(cell)!;
    let flagged = 0;
    for (const n of neighbors) if (this.cellStates.get(n) === "flagged") flagged++;
    if (flagged !== this.adjacentMines(cell)) return [];
    const changed: CellId[] = [];
    for (const n of neighbors) {
      if (this.cellStates.get(n) === "hidden") {
        changed.push(...this.reveal(n));
        if (this.state !== "playing") return changed;
      }
    }
    return changed;
  }

  // -- internals -------------------------------------------------------------

  /**
   * Place the mines, keeping the first reveal a zero so it floods.
   *
   * The clicked cell *and its neighbours* are held back, so the first reveal
   * always opens an area rather than a lone number. Small dense boards may not
   * have room for that -- a cell plus its neighbours is already 22 of a
   * 42-cell degree-21 board -- so when the free cells would not hold every
   * mine we fall back to keeping only the clicked cell safe, which is the
   * weaker guarantee the game shipped with. Mirrors `_place_mines` in
   * minesweeper/game.py; the rule matches, the layouts need not (the two rngs
   * differ and nothing depends on them agreeing).
   */
  private placeMines(safe: CellId): void {
    const forbidden = new Set<CellId>([safe, ...(this.adjacency.get(safe) ?? [])]);
    let candidates = this.cells.filter((c) => !forbidden.has(c));
    if (candidates.length < this.mineCount) {
      candidates = this.cells.filter((c) => c !== safe);
    }
    this.mines = new Set(sample(candidates, this.mineCount, this.rng));
    this.minesPlaced = true;
  }

  /** One walk of the board, counting the flags that are down. A running pair
   * of counters in `toggleFlag` would be cheaper and wrong: mines are not
   * placed until the first reveal, so a flag planted before it has nothing to
   * be right or wrong about yet. */
  private tallyFlags(): FlagTally {
    let right = 0;
    let wrong = 0;
    for (const [cell, state] of this.cellStates) {
      if (state !== "flagged") continue;
      if (this.mines.has(cell)) right++;
      else wrong++;
    }
    return { right, wrong };
  }

  private floodReveal(cell: CellId): CellId[] {
    const changed: CellId[] = [];
    const stack = [cell];
    while (stack.length) {
      const current = stack.pop()!;
      if (this.cellStates.get(current) !== "hidden") continue;
      this.cellStates.set(current, "revealed");
      this.revealedCount++;
      changed.push(current);
      if (this.adjacentMines(current) === 0) {
        stack.push(...(this.adjacency.get(current) ?? []));
      }
    }
    return changed;
  }
}
