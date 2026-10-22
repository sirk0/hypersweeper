import { afterEach, describe, expect, it, vi } from "vitest";
import {
  ACHIEVEMENTS,
  ACHIEVEMENTS_BY_ID,
  EXCLUDED_MODES,
  GAME_CENTER_ACHIEVEMENTS,
  GAME_CENTER_LIMITS,
  SCHEMA_VERSION,
  SHAPE_SIDES,
  applyWin,
  clearAchievements,
  earned,
  emptyProgress,
  gameCenterId,
  loadProgress,
  measureOf,
  recordWin,
  totalWins,
  unlockedAt,
  wonModes,
  type Progress,
  type Win,
} from "../../src/achievements";
import {
  SOLID_MODES,
  SURFACE_SPECS,
  familyRows,
  flatMenuModes,
  threeDMenuModes,
} from "../../src/boards/catalog";
import { blockedModes } from "../../src/boards/fairness";
import { buildBoard, hasMode } from "../../src/boards/presets";
import { cellSides } from "../../src/render/shapePalette";
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
  // means this: building all 200+ boards, which is a second. A tiling added with
  // heptagonal tiles has to fail here rather than quietly get no badge.
  it("is exactly the side counts the catalogue's boards have", () => {
    const sides = new Set<number>();
    for (const mode of everyBuiltMode()) {
      const board = buildBoard(mode, "easy");
      for (const n of cellSides(board.polygons, board.cornerMask).values()) sides.add(n);
    }
    expect([...sides].sort((a, b) => a - b)).toEqual(SHAPE_SIDES);
  });

  it("counts a hyperbolic tile by its corners, not the points its arcs are drawn through", () => {
    // Measured with `cellSides`, the one count a win files (`GameSession.
    // sideCounts`). The hyperbolic boards draw each edge as an arc through
    // extra points, and a count that ignored the corner mask filed a {5,4}
    // win as 13 to 15 sides, and a {7,3} one as 17 to 21 — the heptagon badge
    // never, and the Spectre's 13-gon badge for the wrong board.
    for (const [mode, sides] of [
      ["hyperbolic83", 8],
      ["hyperbolic73", 7],
      ["hyperbolic64", 6],
      ["hyperbolic54", 5],
      ["hyperbolic55", 5],
      ["hyperbolic45", 4],
      ["hyperbolic46", [4]],
      ["hyperbolic37", [3]],
      ["hyperbolic38", [3]],
      ["hyperbolic667", [6, 7]],
      ["hyperbolic3737", [3, 7]],
      ["hyperbolic3474", [3, 4, 7]],
      ["hyperbolic4614", [4, 6, 14]],
    ] as const) {
      for (const difficulty of ["easy", "medium", "hard"]) {
        const board = buildBoard(mode, difficulty);
        expect(new Set(cellSides(board.polygons, board.cornerMask).values()), `${mode} ${difficulty}`)
          .toEqual(new Set(typeof sides === "number" ? [sides] : sides));
      }
    }
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

  it("gives each group one achievement, for winning all of it", () => {
    // A "win any one board of this group" half used to sit beside every one of
    // these: a first win handed out three at once, and the list was half again
    // as long for Game Center. Nothing like it is to come back.
    for (const a of ACHIEVEMENTS) {
      if (["tiling", "surface", "solid"].includes(a.group)) {
        expect(a.id, a.id).toMatch(new RegExp(`^${a.group}-all:`));
        expect(a.label, a.id).not.toMatch(/complete/i);
      }
    }
  });

  it("awards neither the Other family nor the easy rung", () => {
    expect(ACHIEVEMENTS_BY_ID.has("tiling-all:other")).toBe(false);
    expect(ACHIEVEMENTS.some((a) => a.label === "Other")).toBe(false);
    expect(ACHIEVEMENTS_BY_ID.has("difficulty:easy")).toBe(false);
    expect(ACHIEVEMENTS_BY_ID.has("difficulty:hard")).toBe(true);
  });
});

describe("Game Center", () => {
  // Game Center's list is registered once in App Store Connect, and a live
  // achievement's id and points can never change. These are the properties
  // that keep a later build from breaking that promise or being refused.

  it("rewrites an app id into a Game Center id", () => {
    expect(gameCenterId("first-win")).toBe("hs.first_win");
    expect(gameCenterId("tiling-all:2-uniform")).toBe("hs.tiling_all.2_uniform");
    expect(gameCenterId("difficulty:hard")).toBe("hs.difficulty.hard");
  });

  it("only ever sees app ids the rewrite keeps apart", () => {
    // `:` and `-` become `.` and `_`, so an app id that already had either of
    // those could land on another achievement's Game Center id.
    for (const a of ACHIEVEMENTS) expect(a.id, a.id).toMatch(/^[a-z0-9:-]+$/);
  });

  it("gives every achievement a distinct, valid Game Center id", () => {
    const ids = GAME_CENTER_ACHIEVEMENTS.map((a) => a.gameCenterId);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) {
      expect(id).toMatch(/^[A-Za-z0-9._]+$/);
      expect(id.length, id).toBeLessThanOrEqual(GAME_CENTER_LIMITS.idLength);
    }
  });

  it("stays inside Game Center's caps", () => {
    expect(GAME_CENTER_ACHIEVEMENTS.length).toBeLessThanOrEqual(GAME_CENTER_LIMITS.achievements);
    let total = 0;
    for (const a of GAME_CENTER_ACHIEVEMENTS) {
      expect(Number.isInteger(a.points), a.id).toBe(true);
      expect(a.points, a.id).toBeGreaterThan(0);
      expect(a.points, a.id).toBeLessThanOrEqual(GAME_CENTER_LIMITS.pointsEach);
      total += a.points;
    }
    expect(total).toBeLessThanOrEqual(GAME_CENTER_LIMITS.pointsTotal);
  });

  it("prices a group by its kind, not by how many boards it has", () => {
    // Points are fixed once live and groups grow, so two groups of different
    // sizes have to be worth the same.
    for (const prefix of ["tiling-all:", "surface-all:", "solid-all:"]) {
      const points = new Set(
        ACHIEVEMENTS.filter((a) => a.id.startsWith(prefix)).map((a) => a.points),
      );
      expect(points.size, prefix).toBe(1);
    }
  });

  it("writes text that no new board can make wrong", () => {
    // The page's hints quote group sizes ("Win all 33 of them"); Game Center's
    // text is registered once, so a number in it would go stale the day a
    // board is added. The fixed numbers — sides, tiers — are in the other
    // groups.
    for (const a of ACHIEVEMENTS) {
      expect(a.brief, a.id).not.toBe("");
      expect(a.done, a.id).not.toBe("");
      expect(a.done, a.id).not.toBe(a.brief);
      if (["tiling", "surface", "solid", "grand"].includes(a.group)) {
        expect(a.brief, a.id).not.toMatch(/\d/);
        expect(a.done, a.id).not.toMatch(/\d/);
      }
    }
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
  // partition the catalogue minus the solid groups — minus, too, the "Other"
  // family, which has no achievement of its own — and the geometry groups
  // partition the whole of it. Between them every board is counted at most
  // twice, once each way, and never twice the same way.
  const solids = new Set(SOLID_MODES);
  const unawarded = new Set(SURFACE_SPECS.flatMap((s) => familyRows("other", s.key).map((r) => r.mode)));
  const tiled = playable.filter((mode) => !solids.has(mode) && !unawarded.has(mode));

  it("leaves the Other family's boards out of every tiling family", () => {
    const other = playable.filter((mode) => unawarded.has(mode));
    expect(other.length).toBeGreaterThan(0);
    for (const id of allIds("tiling-all:")) {
      for (const mode of other) expect(membersOf(id), id).not.toContain(mode);
    }
  });

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

  it("asks a group for exactly its own boards, and never for none", () => {
    for (const id of [...allIds("tiling-all:"), ...allIds("surface-all:"), ...allIds("solid-all:")]) {
      const members = membersOf(id);
      expect(members.length, id).toBeGreaterThan(0);
      expect(measureOf(ACHIEVEMENTS_BY_ID.get(id)!, emptyProgress()).need).toBe(members.length);
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
