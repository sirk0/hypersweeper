import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

// The App Store listing, apps/hypersweeper/ios/AppStore/*.txt, is pasted into App Store Connect by
// hand. App Store Connect rejects text over its limits only at the moment of
// pasting, and nothing there notices when the catalogue shrinks under the
// "more than N boards" the listing promises. Both are checked here.

const ROOT = path.resolve(__dirname, "../../../..");
const read = (file: string): string =>
  readFileSync(path.join(ROOT, "apps/hypersweeper/ios/AppStore", file), "utf8").trim();

/** App Store Connect's limits, in characters. */
const LIMITS: Record<string, number> = {
  "promotional-text.txt": 170,
  "description.txt": 4000,
  "review-notes.txt": 4000,
};

/** Boards the menu offers that can actually be played: every mode, less those
 * the difficulty calibration blocks at every difficulty. */
function playableBoards(): number {
  const json = (file: string): Record<string, unknown> =>
    JSON.parse(readFileSync(path.join(ROOT, "data", file), "utf8")) as Record<string, unknown>;
  const modes = Object.keys(json("catalog.json")["modeInfo"] as Record<string, unknown>);
  const difficulties = json("catalog.json")["difficulties"] as string[];
  const unfair = json("difficulty.json")["unfair"] as Record<
    string,
    Record<string, { level: string }>
  >;
  const blocked = (mode: string): boolean =>
    difficulties.every((d) => unfair[mode]?.[d]?.level === "blocked");
  return modes.filter((m) => !blocked(m)).length;
}

describe("the App Store listing", () => {
  for (const [file, limit] of Object.entries(LIMITS)) {
    it(`${file} fits App Store Connect's ${limit} characters`, () => {
      const text = read(file);
      expect(text.length).toBeGreaterThan(0);
      expect([...text].length, file).toBeLessThanOrEqual(limit);
    });
  }

  it("promises no more boards than the game has", () => {
    const playable = playableBoards();
    for (const file of ["promotional-text.txt", "description.txt"]) {
      const claims = [...read(file).matchAll(/more than (\d+) boards/gi)].map((m) => Number(m[1]));
      expect(claims.length, file).toBeGreaterThan(0);
      for (const n of claims)
        expect(n, `${file}: ${playable} playable boards`).toBeLessThan(playable);
    }
  });
});
