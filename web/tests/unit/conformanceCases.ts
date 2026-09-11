import { describe, expect, it } from "vitest";
import conformance from "@data/conformance.json";
import { DIFFICULTIES } from "../../src/boards/catalog";
import {
  boundaryComponents,
  edgeCount,
  eulerCharacteristic,
  symmetryOf,
  vertexCount,
  type AnyBoard,
} from "../../src/boards/core";
import { buildBoard, MODES } from "../../src/boards/presets";
import { MAX_DIGIT_GLYPH } from "../../src/render/glyphAtlas";

// The board conformance oracle: every ported mode × difficulty must reproduce
// the statistics the Python implementation exported into data/conformance.json,
// so the two implementations cannot drift. Also checks structural invariants
// the oracle does not encode (adjacency symmetry, no self-loops, closure).
//
// The cases live here rather than in a single `conformance.test.ts` because
// Vitest parallelises across *files*: 187 modes × 3 difficulties in one file
// held one worker for 48 s of a 60 s suite while the others sat idle. One thin
// `conformance.<difficulty>.test.ts` per difficulty runs the same cases three
// ways at once. Adding a difficulty means adding a file — which is what
// `describeConformance` asserts below, so it cannot be forgotten silently.
interface BoardStats {
  cellCount: number;
  mineCount: number;
  euler: number;
  boundaryComponents: number;
  edgeCount: number;
  vertexCount: number;
  hasCellCycle: boolean;
}

const MODE_STATS = conformance.modes as Record<string, Record<string, BoardStats>>;

/** The difficulties that have a file of their own. Kept beside the files rather
 * than derived from DIFFICULTIES: a difficulty added to data/catalog.json needs
 * a new file here to be checked at all, and the assertion below is what says so
 * rather than letting it go quietly unchecked. */
const SPLIT_ACROSS_FILES = ["easy", "medium", "hard"];

function checkInvariants(board: AnyBoard): void {
  const cells = new Set(board.adjacency.keys());
  for (const [cell, neighbors] of board.adjacency) {
    expect(neighbors).not.toContain(cell); // no self-loops
    for (const n of neighbors) {
      expect(cells.has(n)).toBe(true); // neighbours are on the board
      expect(board.adjacency.get(n)).toContain(cell); // symmetric
    }
    // A cell can be asked to draw its whole neighbourhood, so no board may
    // out-count the glyph atlas. `glyphFor` clamps rather than blanks, so a
    // board that did would draw the *wrong* number and nothing would say so.
    expect(neighbors.length).toBeLessThanOrEqual(MAX_DIGIT_GLYPH);
  }
}

/** The aperiodic modes at fixed game seeds. One preset is a family of boards
 * there — the seed picks which measured window onto the grown patch is dealt —
 * and a window that lands on a different tile in one language is a silently
 * different board, which the `modes` rows above (all seed 0) would never see.
 * Pinning seeds rather than raw variants covers the shared window list in
 * data/windows.json as well as the builders' own arithmetic. */
const SEED_STATS = conformance.seeds as Record<
  string,
  Record<string, Record<string, BoardStats>>
>;

/** Every mode at one difficulty, as its own `describe` block. */
export function describeConformance(difficulty: string): void {
  describe(`board conformance oracle (${difficulty})`, () => {
    it("is one of the difficulties a file covers, and the set is complete", () => {
      expect(SPLIT_ACROSS_FILES).toContain(difficulty);
      // A new difficulty in data/catalog.json needs its own
      // conformance.<name>.test.ts, or it would never reach the oracle.
      expect([...DIFFICULTIES].sort()).toEqual([...SPLIT_ACROSS_FILES].sort());
    });

    it("ported modes match the exported set", () => {
      expect(new Set(MODES)).toEqual(new Set(Object.keys(MODE_STATS)));
    });

    for (const mode of Object.keys(MODE_STATS)) {
      it(`${mode}/${difficulty} matches the oracle`, () => {
        const board = buildBoard(mode, difficulty);
        const want = MODE_STATS[mode]![difficulty]!;
        expect(board.polygons.size).toBe(want.cellCount);
        expect(board.mineCount).toBe(want.mineCount);
        expect(eulerCharacteristic(board)).toBe(want.euler);
        expect(boundaryComponents(board)).toBe(want.boundaryComponents);
        expect(edgeCount(board)).toBe(want.edgeCount);
        expect(vertexCount(board)).toBe(want.vertexCount);
        // One-directional on purpose. `hasCellCycle` is what the pygame
        // reference builds — the Klein bottle's ring translation, and nothing
        // else — while this app derives the whole symmetry group of every
        // wrapped surface and offers it as controls (see boards/core.ts
        // BoardSymmetry). So the oracle pins that a board the reference can
        // scroll is one this app can scroll too; the boards that gained a ring
        // step here are pinned in tests/unit/surfaces.test.ts instead.
        if (want.hasCellCycle) expect(symmetryOf(board, "ring")).not.toBeNull();
        checkInvariants(board);
      });
    }

    for (const [mode, byDifficulty] of Object.entries(SEED_STATS)) {
      const wanted = byDifficulty[difficulty]!;
      it(`${mode}/${difficulty} matches the oracle at every pinned seed`, () => {
        const seen = new Set<string>();
        for (const [seed, want] of Object.entries(wanted)) {
          const board = buildBoard(mode, difficulty, Number(seed));
          expect(board.polygons.size).toBe(want.cellCount);
          expect(board.mineCount).toBe(want.mineCount);
          expect(eulerCharacteristic(board)).toBe(want.euler);
          expect(boundaryComponents(board)).toBe(want.boundaryComponents);
          expect(edgeCount(board)).toBe(want.edgeCount);
          expect(vertexCount(board)).toBe(want.vertexCount);
          checkInvariants(board);
          // …and every seed deals a board of its own rather than the same
          // window under another number, which the counts alone could not say.
          seen.add([...board.polygons.keys()].sort().join(" "));
        }
        expect(seen.size).toBe(Object.keys(wanted).length);
      });
    }
  });
}
