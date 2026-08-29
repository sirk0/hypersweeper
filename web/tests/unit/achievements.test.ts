import { afterEach, describe, expect, it, vi } from "vitest";
import {
  ACHIEVEMENTS,
  ACHIEVEMENTS_BY_ID,
  EXCLUDED_MODES,
  SCHEMA_VERSION,
  SHAPE_SIDES,
  applyWin,
  clearAchievements,
  earned,
  emptyProgress,
  loadProgress,
  measureOf,
  recordWin,
  totalWins,
  unlockedAt,
  wonModes,
  type Progress,
  type Win,
} from "../../src/achievements";
import { SOLID_MODES, flatMenuModes, threeDMenuModes } from "../../src/boards/catalog";
import { isBoard3D } from "../../src/boards/core";
import { blockedModes } from "../../src/boards/fairness";
import { buildBoard, hasMode } from "../../src/boards/presets";
import { classifyShapes } from "../../src/render/shapePalette";
import { menuIcon } from "../../src/ui/icons";

// What a screenshot of the achievements page could never tell you: that the
// list is the catalogue's own shape rather than a list somebody typed out.
//
// Three properties carry the feature. The declared side counts are the ones the
// boards actually have (nothing else in the app measures this, and getting it
// wrong means a tiling with no badge and a badge no board can earn); the group
// memberships partition the playable catalogue, so every board counts towards
// exactly one family and one geometry target and the totals add up; and the
// stored record behaves like the leaderboard's — total reads, a refused write
// that still tells the truth about the game just played.
//
// Same conditions as leaderboard.test.ts: the unit environment is node with no
// `localStorage`, so "storage is not available" is the default and a fake store
// is installed wherever a round-trip is under test.

const KEY = "ms:achievements";

function fakeStorage(seed: Record<string, string> = {}): Storage {
  const map = new Map(Object.entries(seed));
  return {
    get length() {
      return map.size;
    },
    clear: () => map.clear(),
    getItem: (k: string) => map.get(k) ?? null,
    key: (i: number) => [...map.keys()][i] ?? null,
    removeItem: (k: string) => void map.delete(k),
    setItem: (k: string, v: string) => void map.set(k, v),
  } as Storage;
}

function withStorage(storage: Storage): Storage {
  vi.stubGlobal("localStorage", storage);
  return storage;
}

function stored(store: Storage): Record<string, unknown> {
  return JSON.parse(store.getItem(KEY) ?? "{}") as Record<string, unknown>;
}

const win = (mode: string, over: Partial<Win> = {}): Win => ({
  mode,
  difficulty: "easy",
  ms: 30_000,
  flagless: false,
  sides: [],
  ...over,
});

/** Every board the two random pools reach — the whole catalogue, as the menu
 * sees it. */
function everyBuiltMode(): string[] {
  return [...new Set([...flatMenuModes(), ...threeDMenuModes()])].filter(hasMode);
}

/** A progress record that has won each of `modes` once. */
function havingWon(modes: Iterable<string>): Progress {
  let progress = emptyProgress();
  for (const mode of modes) progress = applyWin(progress, win(mode));
  return progress;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("the declared shape list", () => {
  // The one table in achievements.ts that is not derived, because deriving it
  // means this: building all 179 boards, which is a second. A tiling added with
  // heptagonal tiles has to fail here rather than quietly get no badge.
  it("is exactly the side counts the catalogue's boards have", () => {
    const sides = new Set<number>();
    for (const mode of everyBuiltMode()) {
      const board = buildBoard(mode, "easy");
      const tones = classifyShapes(board.polygons, isBoard3D(board) ? board.cornerMask : null);
      for (const tone of tones.values()) sides.add(tone.sides);
    }
    expect([...sides].sort((a, b) => a - b)).toEqual(SHAPE_SIDES);
  });
});

describe("the list", () => {
  it("gives every achievement its own id", () => {
    expect(ACHIEVEMENTS_BY_ID.size).toBe(ACHIEVEMENTS.length);
  });

  it("draws an icon for every one of them", () => {
    // `menuIcon` answers a key it does not know with a bare circle rather than
    // failing, so "it returned an SVG" proves nothing. Every badge here has to
    // be a real drawing, which means: not that one.
    const fallback = menuIcon("no-such-icon-key");
    for (const achievement of ACHIEVEMENTS) {
      const svg = menuIcon(achievement.icon);
      expect(svg.startsWith("<svg"), achievement.id).toBe(true);
      expect(svg, achievement.id).not.toBe(fallback);
    }
  });

  it("earns nothing at all from an empty record", () => {
    expect(earned(emptyProgress())).toEqual([]);
  });
});

describe("group membership", () => {
  const built = new Set(everyBuiltMode());
  const blocked = new Set(blockedModes());
  const playable = [...built].filter((m) => !blocked.has(m));

  /** The modes one "all of these" achievement is measured over, recovered by
   * asking it: a record that has won everything scores `need`, and adding a
   * board moves `have` only if that board is a member. */
  const membersOf = (id: string): string[] =>
    playable.filter((mode) => {
      const achievement = ACHIEVEMENTS_BY_ID.get(id);
      if (!achievement) throw new Error(`no achievement ${id}`);
      const progress = havingWon([mode]);
      return measureOf(achievement, progress).have === 1;
    });

  const allIds = (prefix: string): string[] =>
    ACHIEVEMENTS.filter((a) => a.id.startsWith(prefix)).map((a) => a.id);

  // A tiling family holds the boards made of a tiling, which is every board
  // off the solids: a Catalan solid is not a tiling of the plane wrapped onto
  // something, it is a solid whose faces were cut up. So the tiling families
  // partition the catalogue minus the solid groups, and the geometry groups
  // partition the whole of it — between them every board is counted twice, once
  // each way, and never twice the same way.
  const solids = new Set(SOLID_MODES);
  const tiled = playable.filter((mode) => !solids.has(mode));

  it("puts every tiling board in exactly one tiling family", () => {
    const seen = new Map<string, number>();
    for (const id of allIds("tiling-all:")) {
      for (const mode of membersOf(id)) seen.set(mode, (seen.get(mode) ?? 0) + 1);
    }
    expect([...seen.keys()].sort()).toEqual([...tiled].sort());
    expect([...seen.values()].filter((n) => n !== 1)).toEqual([]);
  });

  it("puts every playable board in exactly one geometry group", () => {
    const seen = new Map<string, number>();
    for (const id of [...allIds("surface-all:"), ...allIds("solid-all:")]) {
      for (const mode of membersOf(id)) seen.set(mode, (seen.get(mode) ?? 0) + 1);
    }
    expect([...seen.keys()].sort()).toEqual([...playable].sort());
    expect([...seen.values()].filter((n) => n !== 1)).toEqual([]);
  });

  it("leaves the unplayable boards out of every target", () => {
    // The triakis boards' menu row opens an explanation instead of a game, so a
    // set containing one could never be finished (boards/fairness.ts).
    expect(EXCLUDED_MODES.length).toBeGreaterThan(0);
    const everything = ACHIEVEMENTS_BY_ID.get("all-boards")!;
    const finished = measureOf(everything, havingWon(playable));
    expect(finished.have).toBe(finished.need);
    for (const mode of EXCLUDED_MODES) {
      for (const id of [...allIds("tiling-all:"), ...allIds("surface-all:"), ...allIds("solid-all:")]) {
        expect(membersOf(id), id).not.toContain(mode);
      }
    }
  });

  it("counts the same boards for the 'win one' and 'win all' halves of a pair", () => {
    for (const id of [...allIds("tiling-all:"), ...allIds("surface-all:"), ...allIds("solid-all:")]) {
      const one = ACHIEVEMENTS_BY_ID.get(id.replace("-all:", ":"));
      expect(one, id).toBeDefined();
      const members = membersOf(id);
      expect(members.length, id).toBeGreaterThan(0);
      expect(measureOf(ACHIEVEMENTS_BY_ID.get(id)!, emptyProgress()).need).toBe(members.length);
      // Any one member earns the "win one" half.
      expect(measureOf(one!, havingWon([members[0]!])).have).toBe(1);
    }
  });

  it("finishes the whole catalogue when every playable board is won", () => {
    const progress = havingWon(playable);
    const ids = new Set(earned(progress));
    expect(ids.has("all-boards")).toBe(true);
    for (const id of [...allIds("tiling-all:"), ...allIds("surface-all:"), ...allIds("solid-all:")]) {
      expect(ids.has(id), id).toBe(true);
    }
  });
});

describe("folding a win in", () => {
  it("does not touch the record it was given", () => {
    const before = emptyProgress();
    const after = applyWin(before, win("square", { flagless: true, sides: [4] }));
    expect(before).toEqual(emptyProgress());
    expect(after.flagless).toBe(1);
    expect(after.shapes).toEqual([4]);
  });

  it("counts a board once for completion however often it is won", () => {
    let progress = havingWon(["square"]);
    progress = applyWin(progress, win("square", { difficulty: "hard" }));
    expect(totalWins(progress)).toBe(2);
    expect([...wonModes(progress)]).toEqual(["square"]);
  });

  it("never un-earns an achievement as more wins come in", () => {
    let progress = emptyProgress();
    let held = new Set<string>();
    for (const mode of ["square", "hex", "torustri", "penrose", "sphinx", "cube"]) {
      if (!hasMode(mode)) continue;
      progress = applyWin(progress, win(mode, { sides: [4] }));
      const now = new Set(earned(progress));
      for (const id of held) expect(now.has(id), id).toBe(true);
      held = now;
    }
    expect(held.has("first-win")).toBe(true);
    expect(held.has("shape:4")).toBe(true);
  });

  it("earns the milestones off the record alone", () => {
    const flagless = applyWin(emptyProgress(), win("square", { flagless: true }));
    expect(earned(flagless)).toContain("flagless");
    // rhombille is `warn` at easy in data/difficulty.json.
    const graded = applyWin(emptyProgress(), win("rhombille", { difficulty: "easy" }));
    expect(earned(graded)).toContain("unfair");
  });
});

describe("the stored record", () => {
  it("reports what a win unlocked and writes it", () => {
    const store = withStorage(fakeStorage());
    const ids = recordWin(win("square", { sides: [4] }), 1_700_000_000_000);
    expect(ids).toContain("first-win");
    expect(ids).toContain("shape:4");
    expect(stored(store)["version"]).toBe(SCHEMA_VERSION);
    expect(unlockedAt()["first-win"]).toBe(1_700_000_000_000);
    // ...and does not report it a second time.
    expect(recordWin(win("square", { sides: [4] }))).not.toContain("first-win");
  });

  it("still reports the unlock when the write is refused", () => {
    const store = fakeStorage();
    withStorage({
      ...store,
      setItem: () => {
        throw new Error("quota");
      },
    } as Storage);
    // The player did just earn it, and the card saying so is the truth about
    // the game they played — the bargain recordTime makes.
    expect(recordWin(win("square"))).toContain("first-win");
  });

  it("degrades to an empty record rather than throwing on nonsense", () => {
    withStorage(fakeStorage({ [KEY]: "{not json" }));
    expect(loadProgress().wins).toEqual({});
    withStorage(fakeStorage({ [KEY]: JSON.stringify({ wins: 7, shapes: "hexagons" }) }));
    expect(loadProgress()).toEqual(emptyProgress());
  });

  it("stamps what the record already earns, so no card announces it later", () => {
    // A record whose history earns something its `unlocked` map does not list
    // (a build that added an achievement, or the seeding below). It is unlocked
    // the moment it is read, not the next time a board is won — the page would
    // otherwise show it unlocked and the card announce it afterwards.
    withStorage(
      fakeStorage({
        [KEY]: JSON.stringify({ version: SCHEMA_VERSION, wins: { square: { easy: 1 } } }),
      }),
    );
    expect(unlockedAt()["first-win"]).toBeGreaterThan(0);
    expect(recordWin(win("square"))).not.toContain("first-win");
  });

  it("carries a field it does not know through a write", () => {
    const store = withStorage(
      fakeStorage({ [KEY]: JSON.stringify({ version: SCHEMA_VERSION, streak: 4 }) }),
    );
    recordWin(win("square"));
    expect(stored(store)["streak"]).toBe(4);
  });

  it("seeds itself from the best times, once", () => {
    const store = withStorage(
      fakeStorage({
        "ms:scores": JSON.stringify({
          version: 1,
          boards: { "square|easy": [{ ms: 9_000, at: 1 }], "hex|hard": [{ ms: 50_000, at: 2 }] },
        }),
      }),
    );
    // Those wins did happen, so the feature does not meet an old player at zero.
    const progress = loadProgress();
    expect([...wonModes(progress)].sort()).toEqual(["hex", "square"]);
    // It cannot know about flags or shapes, and claims neither.
    expect(progress.flagless).toBe(0);
    expect(progress.shapes).toEqual([]);
    // The seeded history is already accounted for, so the next win does not
    // fire a card for every one of them.
    expect(earned(progress)).toContain("first-win");
    expect(recordWin(win("torustri"))).not.toContain("first-win");
    // And the seeding does not run again over the record it just wrote.
    store.setItem("ms:scores", JSON.stringify({ version: 1, boards: {} }));
    expect([...wonModes(loadProgress())].sort()).toEqual(["hex", "square", "torustri"].sort());
  });

  it("forgets everything when cleared", () => {
    const store = withStorage(fakeStorage());
    recordWin(win("square"));
    clearAchievements();
    expect(store.getItem(KEY)).toBe(null);
    expect(loadProgress()).toEqual(emptyProgress());
  });
});
