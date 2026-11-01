import { hexBoard, squareBoard } from "@tiling/geometry";
import { describe, expect, it } from "vitest";
import { newGame, press, solved } from "../../src/game";

describe("Lights Out on a shared board", () => {
  it("pressing a cell flips it and its neighbours", () => {
    const board = squareBoard(3, 3);
    const game = { board, lit: new Set<string>(), presses: 0 };
    const centre = [...board.adjacency.keys()].find((c) => board.adjacency.get(c)!.length === 8)!;
    press(game, centre);
    expect(game.lit.size).toBe(9);
    expect(game.presses).toBe(1);
  });

  it("pressing the same cells again undoes them", () => {
    const board = hexBoard(4, 4);
    const game = { board, lit: new Set<string>(), presses: 0 };
    const [a, b] = [...board.adjacency.keys()];
    press(game, a!);
    press(game, b!);
    expect(solved(game)).toBe(false);
    press(game, b!);
    press(game, a!);
    expect(solved(game)).toBe(true);
  });

  it("a new game starts unsolved", () => {
    expect(solved(newGame(hexBoard(4, 4), 6))).toBe(false);
    // Even a scramble that cancels itself out (no presses at all) leaves a light on.
    expect(solved(newGame(hexBoard(4, 4), 0))).toBe(false);
  });

  it("a board with every cell dark is solved", () => {
    const game = { board: hexBoard(2, 2), lit: new Set<string>(), presses: 0 };
    expect(solved(game)).toBe(true);
  });
});
