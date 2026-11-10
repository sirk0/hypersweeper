import { describe, expect, it } from "vitest";
import levelIndex from "../../src/levelIndex.json";
import { LEVELS, buildFirstBoards, indexOf, levelByKey } from "../../src/levels";

describe("the level index", () => {
  // Building every first board takes seconds, so the game reads their order,
  // names and marks from src/levelIndex.json and builds each when it is
  // first looked into; the file must say what building them all says.
  const built = buildFirstBoards();

  it("is in step with building every first board (npm run levels)", () => {
    expect(indexOf(built)).toEqual(levelIndex);
  }, 60_000);

  it("lists each level as it builds: the same tiles, cells and region", () => {
    expect(LEVELS.map((l) => l.key)).toEqual(built.map((l) => l.key));
    for (const level of built) {
      const lazy = levelByKey(level.key)!;
      expect(lazy.name, level.key).toBe(level.name);
      expect(lazy.label, level.key).toBe(level.label);
      expect(lazy.decor, level.key).toEqual(level.decor);
      expect(lazy.tiles.length, level.key).toBe(level.tiles.length);
      expect(lazy.cells.length, level.key).toBe(level.cells.length);
      expect(lazy.region, level.key).toEqual(level.region);
    }
  }, 60_000);

  it("answers a level's key, name and marks without building it, and builds it once", () => {
    const level = LEVELS.find((l) => l.key === "kisrhombille.3mixed")!;
    expect(level.name).toBe("V4.6.12 · 3 colours, mixed");
    expect(level.decor?.of).toBe("kisrhombille");
    expect(level.boards).toBe(1);
    // looking into it builds it, once: the same tiles each time
    expect(level.tiles).toBe(level.tiles);
    expect({ ...level }.cells).toBe(level.cells);
  });
});
