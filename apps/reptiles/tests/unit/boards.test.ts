import { describe, expect, it } from "vitest";
import data from "../../src/boards.json";
import { congruenceKey } from "../../src/geometry/congruent";
import { posed, turnsOnto } from "../../src/geometry/shape";
import { BOARD_SOURCES, BOARDS, LEVELS, boardKeys, levelByKey, type Level } from "../../src/levels";

// A tiling's boards: windows cut from it in different places, each a level of
// its own. scripts/find-boards.mts picks them (`npm run boards`) and writes
// boards.json; these hold what it promises of each, so a change to a level's
// window that leaves boards.json behind fails here.

const listed = data.boards as Record<string, unknown[]>;
const many = LEVELS.filter((l) => l.boards > 1).map((l) => l.key);
const boardsOf = (base: string): Level[] => boardKeys(base).map((k) => levelByKey(k)!);

describe("boards", () => {
  it("lists more boards only for a tiling that can be cut elsewhere", () => {
    for (const key of Object.keys(listed)) expect(BOARD_SOURCES.has(key), key).toBe(true);
    expect(many.length).toBeGreaterThan(40);
  });

  it("lists each tiling's boards in turn, first board first, numbered from 1", () => {
    expect(BOARDS.map((b) => b.key)).toEqual(LEVELS.flatMap((l) => boardKeys(l.key)));
    for (const level of LEVELS) {
      boardsOf(level.key).forEach((board, i) => {
        expect(board.key).toBe(i === 0 ? level.key : `${level.key}-${i + 1}`);
        expect([board.base, board.board, board.boards]).toEqual([level.key, i + 1, level.boards]);
      });
    }
    expect(levelByKey("squares-2")).toBeUndefined();
  });

  it("builds a board past the first once, when it is asked for", () => {
    const key = `${many[0]}-2`;
    expect(levelByKey(key)).toBe(levelByKey(key));
  });

  it.each(many)("%s: no two of its boards are the same board", (base) => {
    const keys = boardsOf(base).map((l) =>
      congruenceKey(
        l.ring,
        l.cells.flatMap((c) => c.map((p) => p.verts)),
      ),
    );
    expect(new Set(keys).size).toBe(keys.length);
  });

  it.each(many)("%s: every board about the first's size, one outline, its tray", (base) => {
    const [first, ...rest] = boardsOf(base);
    const n0 = first!.cells.length;
    for (const level of rest) {
      expect(Math.abs(level.cells.length - n0), level.key).toBeLessThanOrEqual(
        Math.max(1, Math.round(0.1 * n0)),
      );
      expect(level.region, level.key).toHaveLength(1);
      expect(level.name).toBe(first!.name);
      expect(level.tiles).toHaveLength(first!.tiles.length);
      first!.tiles.forEach((t, i) => {
        const cell = level.tiles[i]!.pieces.map((p) => p.verts);
        const same = [false, true].some(
          (flip) =>
            turnsOnto({ ring: t.ring, pieces: posed(t, { rot: 0, flip, t: t.ring.zero }) }, cell)
              .length > 0,
        );
        expect(same, `${level.key}: tile ${i}`).toBe(true);
      });
    }
  });

  it("gives a tiling that looks the same wherever it is cut one board: the regular ones", () => {
    for (const key of ["squares", "triangles", "hexagons"]) expect(levelByKey(key)!.boards).toBe(1);
  });

  it("gives the uniform tilings several boards each", () => {
    for (const level of LEVELS.filter((l) => l.group === "uniform"))
      expect(level.boards, level.key).toBeGreaterThanOrEqual(2);
  });

  it("gives every aperiodic window five to ten boards, the Spectre's two alike", () => {
    const windows = LEVELS.filter((l) => l.aperiodic || l.hat);
    expect(windows.map((l) => l.key)).toEqual([
      "penrose",
      "kitedart",
      "ammannbeenker",
      "tile11",
      "spectre",
      "hat",
      "turtle",
      "hatmetatiles",
    ]);
    for (const level of windows) {
      expect(level.boards, level.key).toBeGreaterThanOrEqual(5);
      expect(level.boards, level.key).toBeLessThanOrEqual(10);
    }
    expect(listed["spectre"]).toEqual(listed["tile11"]);
  });
});
