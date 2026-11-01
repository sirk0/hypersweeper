// The rules, with no DOM: Lights Out on any board. Each cell is lit or dark;
// pressing a cell flips it and every neighbour, and the board is solved when
// every cell is dark. It reads only a board's adjacency, so it plays the same
// on squares, hexagons or a Penrose tiling — swap the board in main.ts.
//
// This is the template game scripts/new-game.mjs writes: replace it with your
// own rules, keeping them pure like this so the unit tests can drive them.
import type { Board, CellId } from "@tiling/geometry";

export interface Game {
  readonly board: Board;
  readonly lit: Set<CellId>;
  presses: number;
}

/** A solvable start: dark everywhere, then `scramble` random presses. */
export function newGame(board: Board, scramble: number, random = Math.random): Game {
  const game: Game = { board, lit: new Set(), presses: 0 };
  const cells = [...board.adjacency.keys()];
  for (let i = 0; i < scramble; i++) flip(game, cells[Math.floor(random() * cells.length)]!);
  if (game.lit.size === 0 && cells.length > 0) flip(game, cells[0]!);
  return game;
}

/** Press a cell: it and its neighbours change state. */
export function press(game: Game, cell: CellId): void {
  flip(game, cell);
  game.presses += 1;
}

export function solved(game: Game): boolean {
  return game.lit.size === 0;
}

function flip(game: Game, cell: CellId): void {
  for (const c of [cell, ...(game.board.adjacency.get(cell) ?? [])]) {
    if (game.lit.has(c)) game.lit.delete(c);
    else game.lit.add(c);
  }
}
