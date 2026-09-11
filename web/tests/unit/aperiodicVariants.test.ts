import { describe, expect, it } from "vitest";
import { penroseBoard, spectreBoard } from "../../src/boards/aperiodic";
import {
  boundaryComponents,
  eulerCharacteristic,
  type Board,
  type CellId,
} from "../../src/boards/core";
import { buildBoard, windowFor } from "../../src/boards/presets";
import windowsData from "@data/windows.json";

// The two aperiodic substitution boards are a *family* per preset: `variant`
// picks which window onto the grown patch the board is, so a finished game
// followed by another is played somewhere else in the tiling. What the
// conformance oracle pins is that a given variant is the same board in both
// languages; what this file pins is that every variant is a board at all — the
// promised size, one connected piece, no hole — and that different variants are
// different boards. Mirrors TestAperiodicVariants in tests/test_boards.py.

/** The preset arguments, so these cases exercise the boards the game deals
 * rather than a size nothing plays at. Kept in step with data/presets.json. */
const CASES: [string, (variant: number) => Board, number][] = [
  ["penrose easy", (v) => penroseBoard(5, 6, 437.727, 81, v), 81],
  ["penrose medium", (v) => penroseBoard(6, 17, 500.0, 256, v), 256],
  ["penrose hard", (v) => penroseBoard(7, 48, 769.119, 480, v), 480],
  ["spectre easy", (v) => spectreBoard(3, 11, 81, 14.361, v), 81],
  ["spectre medium", (v) => spectreBoard(4, 37, 256, 9.437, v), 256],
  ["spectre hard", (v) => spectreBoard(4, 89, 480, 8.512, v), 480],
];

const cells = (board: Board): string => [...board.polygons.keys()].sort().join(" ");

/** Every cell reachable from any one of them, over the board's own adjacency —
 * a window that slid off the patch would leave part of the board unplayable. */
function isConnected(board: Board): boolean {
  const start = board.adjacency.keys().next().value as CellId;
  const seen = new Set([start]);
  const queue = [start];
  for (let head = 0; head < queue.length; head++) {
    for (const neighbor of board.adjacency.get(queue[head]!) ?? []) {
      if (!seen.has(neighbor)) {
        seen.add(neighbor);
        queue.push(neighbor);
      }
    }
  }
  return seen.size === board.adjacency.size;
}

describe("aperiodic patch variants", () => {
  for (const [name, build, keep] of CASES) {
    it(`${name} is a board of ${keep} cells at every variant`, () => {
      const seen = new Set<string>();
      for (let variant = 0; variant < 8; variant++) {
        const board = build(variant);
        expect(board.polygons.size).toBe(keep);
        expect(isConnected(board)).toBe(true);
        // A disc: an island would be 2, a hole 0.
        expect(eulerCharacteristic(board)).toBe(1);
        expect(boundaryComponents(board)).toBe(1);
        seen.add(cells(board));
      }
      expect(seen.size).toBe(8); // …and eight different boards, not one board
    });

    it(`${name} builds the same board twice for the same variant`, () => {
      expect(cells(build(3))).toBe(cells(build(3)));
    });
  }

  it("variant 0 is the centred patch the game shipped with", () => {
    // The default argument and an explicit 0 are the same board, so a caller
    // that knows nothing about variants (the exporters, the pygame menu icons)
    // keeps the classic patch.
    expect(cells(penroseBoard(5, 6, 437.727, 81))).toBe(cells(penroseBoard(5, 6, 437.727, 81, 0)));
    expect(cells(spectreBoard(3, 11, 81, 14.361))).toBe(cells(spectreBoard(3, 11, 81, 14.361, 0)));
  });

  it("takes any integer, wrapping into the pool of windows", () => {
    // The builder's own argument is the raw window selector, and the app hands
    // it a number derived from a uint32 seed rather than a small index — a
    // negative one must not fall off the end of the pool either (JS `%` keeps
    // the sign; Python's does not).
    for (const variant of [2 ** 32 - 1, 2 ** 31, -7]) {
      const board = penroseBoard(5, 6, 437.727, 81, variant);
      expect(board.polygons.size).toBe(81);
      expect(eulerCharacteristic(board)).toBe(1);
    }
  });

  it("deals only windows the solver measured", () => {
    // A window is a board of its own, so which ones a difficulty may deal is
    // measured (scripts/difficulty/windows.py) rather than taken from the whole
    // pool. Every seed has to land in that list, and the centred window — the
    // one the mine count was fitted on — has to be the first of them.
    for (const [mode, byDifficulty] of Object.entries(windowsData.modes)) {
      for (const [difficulty, row] of Object.entries(byDifficulty)) {
        const windows = row.windows as number[];
        expect(windows[0]).toBe(0);
        expect(new Set(windows).size).toBe(windows.length);
        expect(windows.length).toBeGreaterThanOrEqual(8);
        const dealt = new Set(
          Array.from({ length: 500 }, (_, seed) => windowFor(mode, difficulty, seed)),
        );
        expect([...dealt].sort((a, b) => a - b)).toEqual([...windows].sort((a, b) => a - b));
      }
    }
  });

  it("leaves every other board alone", () => {
    // Only the two substitution tilings vary. The spiral and the brick rings
    // are nonperiodic by symmetry — one distinguished centre, no second window
    // — and everything else is periodic, so a variant must change nothing.
    for (const mode of ["phyllotaxis", "brickrings", "square", "hexhex", "sphinx"]) {
      expect(cells(buildBoard(mode, "easy", 12345) as Board)).toBe(
        cells(buildBoard(mode, "easy") as Board),
      );
    }
  });

  it("deals a different patch per seed through buildBoard", () => {
    // The seam the app actually uses: GameSession passes the game's seed as the
    // variant, so a re-deal is a new patch rather than new mines on the old one.
    const patches = new Set(
      [1, 2, 3, 4, 5].map((seed) => cells(buildBoard("spectre", "easy", seed) as Board)),
    );
    expect(patches.size).toBe(5);
  });
});
