import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { BOARDS, LEVELS } from "../../src/levels";

// The App Store listing, apps/reptiles/ios/AppStore/*.txt, is pasted into App
// Store Connect by hand. App Store Connect rejects text over its limits only at
// the moment of pasting, and nothing there notices when the game shrinks under
// the "more than N levels" the listing promises. Both are checked here, as
// Hypersweeper's tests/unit/storeListing.test.ts checks its own.

const read = (file: string): string =>
  readFileSync(path.resolve(__dirname, "../../ios/AppStore", file), "utf8").trim();

/** App Store Connect's limits, in characters. */
const LIMITS: Record<string, number> = {
  "promotional-text.txt": 170,
  "description.txt": 4000,
  "review-notes.txt": 4000,
  "keywords.txt": 100,
};

describe("the App Store listing", () => {
  for (const [file, limit] of Object.entries(LIMITS)) {
    it(`${file} fits App Store Connect's ${limit} characters`, () => {
      const text = read(file);
      expect(text.length).toBeGreaterThan(0);
      expect([...text].length, file).toBeLessThanOrEqual(limit);
    });
  }

  it("promises no more levels or tilings than the game has", () => {
    // every board of every tiling, plain and marked, is a level of its own
    const levels = BOARDS.length;
    const tilings = LEVELS.filter((l) => !l.decor).length;
    for (const file of ["promotional-text.txt", "description.txt"]) {
      const text = read(file).replaceAll(",", "");
      const levelClaims = [...text.matchAll(/more than (\d+) levels/gi)].map((m) => Number(m[1]));
      expect(levelClaims.length, file).toBeGreaterThan(0);
      for (const n of levelClaims) expect(n, `${file}: ${levels} levels`).toBeLessThan(levels);
      for (const m of text.matchAll(/(\d+) tilings/gi))
        expect(Number(m[1]), `${file}: ${tilings} tilings`).toBeLessThanOrEqual(tilings);
    }
  });
});
