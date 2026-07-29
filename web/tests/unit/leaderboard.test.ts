import { afterEach, describe, expect, it, vi } from "vitest";
import {
  allBestTimes,
  bestTimes,
  boardKey,
  clearBestTimes,
  formatTime,
  rankFor,
  recordTime,
  SCHEMA_VERSION,
  TOP_N,
  type ScoreEntry,
} from "../../src/leaderboard";

// Same conditions as settings.test.ts: the unit environment is node, with no
// `localStorage`, so "storage is not available" is the default here and a fake
// store is installed wherever a round-trip is under test.

const KEY = "ms:scores";

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

/** A store already holding `boards`, as a build with records would leave it. */
function seeded(boards: Record<string, ScoreEntry[]>, extra: Record<string, unknown> = {}): Storage {
  return withStorage(
    fakeStorage({ [KEY]: JSON.stringify({ version: SCHEMA_VERSION, boards, ...extra }) }),
  );
}

function stored(store: Storage): Record<string, unknown> {
  return JSON.parse(store.getItem(KEY) ?? "{}") as Record<string, unknown>;
}

function boards(store: Storage): Record<string, ScoreEntry[]> {
  return (stored(store)["boards"] ?? {}) as Record<string, ScoreEntry[]>;
}

const ms = (n: number): number => n * 1000;

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("recording times", () => {
  it("keeps the fastest three, fastest first", () => {
    const store = withStorage(fakeStorage());
    for (const seconds of [50, 20, 90, 35, 70]) {
      recordTime("square", "easy", ms(seconds));
    }
    expect(bestTimes("square", "easy").map((e) => e.ms)).toEqual([ms(20), ms(35), ms(50)]);
    expect(boards(store)[boardKey("square", "easy")]).toHaveLength(TOP_N);
  });

  it("reports the rank it took, and null for a time that did not place", () => {
    withStorage(fakeStorage());
    expect(recordTime("square", "easy", ms(50))?.rank).toBe(1);
    expect(recordTime("square", "easy", ms(20))?.rank).toBe(1);
    expect(recordTime("square", "easy", ms(90))?.rank).toBe(3);
    expect(recordTime("square", "easy", ms(95))).toBeNull();
  });

  it("writes nothing when the time does not place", () => {
    const store = seeded({ [boardKey("square", "easy")]: [10, 20, 30].map((s) => ({ ms: ms(s), at: 1 })) });
    const before = store.getItem(KEY);
    expect(recordTime("square", "easy", ms(40))).toBeNull();
    expect(store.getItem(KEY)).toBe(before);
  });

  it("stamps when the time was set", () => {
    withStorage(fakeStorage());
    recordTime("square", "easy", ms(30), 1_700_000_000_000);
    expect(bestTimes("square", "easy")[0]).toEqual({ ms: ms(30), at: 1_700_000_000_000 });
  });

  it("ranks an equal time below the record it matched", () => {
    // You have to beat a record to take its place; the earlier run keeps the
    // position it earned. Routine on a tiny board, where a first click that
    // floods the field wins in ~0 ms.
    seeded({ [boardKey("square", "easy")]: [{ ms: ms(30), at: 1 }] });
    const placed = recordTime("square", "easy", ms(30), 2);
    expect(placed?.rank).toBe(2);
    expect(placed?.entries.map((e) => e.at)).toEqual([1, 2]);
  });

  it("ranks on milliseconds, not on the seconds the HUD showed", () => {
    withStorage(fakeStorage());
    recordTime("square", "easy", 41_800);
    const placed = recordTime("square", "easy", 41_200);
    expect(placed?.rank).toBe(1); // both read "41" on the counter
    expect(formatTime(41_200)).toBe("41");
    expect(formatTime(41_800)).toBe("41");
  });

  it("keeps a separate list per board and per difficulty", () => {
    withStorage(fakeStorage());
    recordTime("square", "easy", ms(10));
    recordTime("square", "hard", ms(99));
    recordTime("hexhex", "easy", ms(60));
    expect(bestTimes("square", "easy").map((e) => e.ms)).toEqual([ms(10)]);
    expect(bestTimes("square", "hard").map((e) => e.ms)).toEqual([ms(99)]);
    expect(bestTimes("hexhex", "easy").map((e) => e.ms)).toEqual([ms(60)]);
    expect(bestTimes("hexhex", "hard")).toEqual([]);
  });

  it("rejects a time that is not a usable duration", () => {
    withStorage(fakeStorage());
    for (const bad of [NaN, Infinity, -1]) {
      expect(recordTime("square", "easy", bad), String(bad)).toBeNull();
    }
    expect(bestTimes("square", "easy")).toEqual([]);
  });
});

describe("storage safety", () => {
  it("survives having no storage at all (node, private mode)", () => {
    expect(bestTimes("square", "easy")).toEqual([]);
    expect(allBestTimes().size).toBe(0);
    expect(() => clearBestTimes()).not.toThrow();
    // The rank is still reported: the player did set that time, it just will
    // not be there next launch.
    expect(recordTime("square", "easy", ms(30))?.rank).toBe(1);
  });

  it("does not throw when the browser refuses to write", () => {
    const store = fakeStorage();
    store.setItem = () => {
      throw new Error("QuotaExceededError");
    };
    withStorage(store);
    expect(recordTime("square", "easy", ms(30))?.rank).toBe(1);
  });

  it("survives a storage that throws on read", () => {
    const store = fakeStorage();
    store.getItem = () => {
      throw new Error("SecurityError");
    };
    withStorage(store);
    expect(bestTimes("square", "easy")).toEqual([]);
  });

  it("falls back on corrupt, non-object or array JSON", () => {
    for (const raw of ["{not json", "42", '"a string"', "null", "[1,2]"]) {
      withStorage(fakeStorage({ [KEY]: raw }));
      expect(bestTimes("square", "easy"), raw).toEqual([]);
    }
  });

  it("costs one board its records, not the whole leaderboard", () => {
    seeded({
      [boardKey("square", "easy")]: "not a list" as unknown as ScoreEntry[],
      [boardKey("hexhex", "easy")]: [{ ms: ms(12), at: 5 }],
    });
    expect(bestTimes("square", "easy")).toEqual([]);
    expect(bestTimes("hexhex", "easy")).toEqual([{ ms: ms(12), at: 5 }]);
  });

  it("drops junk entries but keeps the usable ones", () => {
    seeded({
      [boardKey("square", "easy")]: [
        { ms: ms(20), at: 5 },
        { ms: "fast" },
        null,
        { ms: -3, at: 5 },
        { ms: ms(10) }, // no timestamp
      ] as unknown as ScoreEntry[],
    });
    expect(bestTimes("square", "easy")).toEqual([
      { ms: ms(10), at: 0 },
      { ms: ms(20), at: 5 },
    ]);
  });

  it("sorts a record whose stored order is wrong", () => {
    seeded({
      [boardKey("square", "easy")]: [
        { ms: ms(90), at: 1 },
        { ms: ms(30), at: 2 },
      ],
    });
    expect(bestTimes("square", "easy").map((e) => e.ms)).toEqual([ms(30), ms(90)]);
  });
});

describe("records this build cannot interpret", () => {
  it("keeps other boards and unknown top-level fields when writing", () => {
    const store = seeded(
      { "kleinfloret|easy": [{ ms: ms(42), at: 7 }] },
      { version: 99, sound: "loud" },
    );
    recordTime("square", "easy", ms(30));
    expect(boards(store)["kleinfloret|easy"]).toEqual([{ ms: ms(42), at: 7 }]);
    expect(stored(store)["sound"]).toBe("loud");
    expect(stored(store)["version"]).toBe(SCHEMA_VERSION);
  });

  it("lists every board with a time, and skips malformed keys", () => {
    seeded({
      [boardKey("square", "easy")]: [{ ms: ms(30), at: 1 }],
      [boardKey("square", "hard")]: [{ ms: ms(80), at: 1 }],
      "no-separator": [{ ms: ms(9), at: 1 }],
      [boardKey("hexhex", "easy")]: [],
    });
    expect([...allBestTimes().keys()].sort()).toEqual(["square|easy", "square|hard"]);
  });

  it("clears everything, and only its own key", () => {
    const store = seeded({ [boardKey("square", "easy")]: [{ ms: ms(30), at: 1 }] });
    store.setItem("ms:settings", '{"theme":"dark"}');
    clearBestTimes();
    expect(bestTimes("square", "easy")).toEqual([]);
    expect(store.getItem("ms:settings")).toBe('{"theme":"dark"}');
  });
});

describe("rankFor", () => {
  const entries: ScoreEntry[] = [ms(10), ms(20), ms(30)].map((m) => ({ ms: m, at: 1 }));

  it("places a time against a full list", () => {
    expect(rankFor(ms(5), entries)).toBe(1);
    expect(rankFor(ms(25), entries)).toBe(3);
    expect(rankFor(ms(30), entries)).toBeNull(); // ties the last, so does not place
    expect(rankFor(ms(31), entries)).toBeNull();
  });

  it("places any time on a list with room", () => {
    expect(rankFor(ms(999), [])).toBe(1);
    expect(rankFor(ms(999), entries.slice(0, 2))).toBe(3);
  });
});
