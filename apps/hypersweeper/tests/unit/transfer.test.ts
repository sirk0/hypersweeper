import { afterEach, describe, expect, it, vi } from "vitest";
import { emptyProgress, type Stored } from "../../src/achievements";
import { DEFAULT_SETTINGS, loadSettings, SCHEMA_VERSION } from "../../src/settings";
import {
  currentRecord,
  decodeTransfer,
  encodeTransfer,
  findToken,
  importRecord,
  maxProgress,
  mergeTransfer,
  packRecord,
  parseTransfer,
  transferUrlFor,
  type LocalRecord,
  type TransferRecord,
} from "../../src/transfer";

// Transfer links (src/transfer.ts): the token survives a round trip in both
// forms, a payload is validated part by part, and an import merges — so the
// same link opened twice changes nothing the second time.

function fakeStorage(seed: Record<string, string> = {}): Storage & { map: Map<string, string> } {
  const map = new Map(Object.entries(seed));
  return {
    map,
    get length() {
      return map.size;
    },
    clear: () => map.clear(),
    getItem: (k: string) => map.get(k) ?? null,
    key: (i: number) => [...map.keys()][i] ?? null,
    removeItem: (k: string) => void map.delete(k),
    setItem: (k: string, v: string) => void map.set(k, v),
  } as Storage & { map: Map<string, string> };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

const emptyRecord = (): Stored => ({ progress: emptyProgress(), unlocked: {} });

function local(over: Partial<LocalRecord> = {}): LocalRecord {
  return { boards: {}, record: emptyRecord(), stars: {}, hasSettings: true, ...over };
}

function incoming(over: Partial<TransferRecord> = {}): TransferRecord {
  return { boards: {}, record: emptyRecord(), stars: {}, settings: null, ...over };
}

describe("the token", () => {
  const payload = packRecord({
    scores: { version: 1, boards: { "square|easy": [{ ms: 4100, at: 7 }] } },
    achievements: null,
    favourites: { version: 1, modes: { hexagon: { on: true, at: 3 } } },
    settings: null,
  });

  it("round-trips deflated", async () => {
    const token = await encodeTransfer(payload);
    expect(token[0]).toBe("z");
    expect(token).toMatch(/^z[A-Za-z0-9_-]+$/);
    expect(await decodeTransfer(token)).toEqual(payload);
  });

  it("round-trips uncompressed where the browser cannot deflate", async () => {
    vi.stubGlobal("CompressionStream", undefined);
    const token = await encodeTransfer(payload);
    expect(token[0]).toBe("j");
    vi.unstubAllGlobals();
    expect(await decodeTransfer(token)).toEqual(payload);
  });

  it("reads nothing from a token that is not one", async () => {
    for (const bad of ["", "z", "x123", "z!!!", "zAAAA", "j" + btoa("not json")]) {
      expect(await decodeTransfer(bad)).toBeNull();
    }
  });

  it("is found in a link, a fragment, or a pasted message", () => {
    const url = transferUrlFor({ origin: "https://example.test", pathname: "/game/" }, "zAbC_-1");
    expect(url).toBe("https://example.test/game/#transfer=zAbC_-1");
    expect(findToken(url)).toBe("zAbC_-1");
    expect(findToken("#transfer=jXYZ")).toBe("jXYZ");
    expect(findToken(`My progress:\n${url}\n`)).toBe("zAbC_-1");
    // A chat client that wrapped the link mid-token.
    expect(findToken("https://example.test/#transfer=zAb\nC_-1")).toBe("zAbC_-1");
    expect(findToken("https://example.test/?mode=square")).toBeNull();
    expect(findToken("#notransfer=zAAA")).toBeNull();
  });
});

describe("parseTransfer", () => {
  it("refuses anything that is not a version-1 payload", () => {
    expect(parseTransfer(null)).toBeNull();
    expect(parseTransfer([])).toBeNull();
    expect(parseTransfer({ v: 2 })).toBeNull();
  });

  it("validates each part on its own", () => {
    const rec = parseTransfer({
      v: 1,
      scores: { boards: { "square|easy": [{ ms: 900, at: 1 }, { ms: "fast" }], bad: "x" } },
      achievements: "nonsense",
      favourites: { modes: { hexagon: { on: true, at: 5 }, junk: 3 } },
      settings: { version: SCHEMA_VERSION, theme: "no-such-theme", haptics: false },
    });
    expect(rec).not.toBeNull();
    expect(rec!.boards).toEqual({ "square|easy": [{ ms: 900, at: 1 }] });
    expect(rec!.record).toBeNull();
    expect(rec!.stars).toEqual({ hexagon: { on: true, at: 5 } });
    expect(rec!.settings?.theme).toBe(DEFAULT_SETTINGS.theme);
    expect(rec!.settings?.haptics).toBe(false);
  });

  it("migrates a settings record from an older version", () => {
    // A version-1 record with no shape: migrated, not read as today's.
    const rec = parseTransfer({ v: 1, settings: { theme: "classic" } });
    expect(rec!.settings).not.toBeNull();
    expect(rec!.settings!.shape).toBeTypeOf("string");
  });
});

describe("maxProgress", () => {
  it("takes the larger count, so merging twice is merging once", () => {
    const a = { wins: { square: { easy: 3 } }, flagless: 1, shapes: [4] };
    const b = { wins: { square: { easy: 2, hard: 1 } }, flagless: 4, shapes: [6, 4] };
    const once = maxProgress(a, b);
    expect(once).toEqual({ wins: { square: { easy: 3, hard: 1 } }, flagless: 4, shapes: [4, 6] });
    expect(maxProgress(once, b)).toEqual(once);
  });
});

describe("mergeTransfer", () => {
  it("keeps the fastest three of both, and counts the boards that changed", () => {
    const merged = mergeTransfer(
      local({ boards: { "square|easy": [{ ms: 5000, at: 1 }] } }),
      incoming({
        boards: {
          "square|easy": [{ ms: 4000, at: 2 }],
          "hexagon|easy": [{ ms: 9000, at: 3 }],
        },
      }),
    );
    expect(merged.boards["square|easy"]).toEqual([
      { ms: 4000, at: 2 },
      { ms: 5000, at: 1 },
    ]);
    expect(merged.boards["hexagon|easy"]).toEqual([{ ms: 9000, at: 3 }]);
    expect(merged.summary.times).toBe(2);
    expect(merged.changed.boards).toBe(true);
  });

  it("is idempotent: the same link a second time brings nothing", () => {
    const link = incoming({
      boards: { "square|easy": [{ ms: 4000, at: 2 }] },
      record: {
        progress: { wins: { square: { easy: 1 } }, flagless: 0, shapes: [4] },
        unlocked: { "first-win": 10 },
      },
      stars: { hexagon: { on: true, at: 3 } },
    });
    const first = mergeTransfer(local(), link, 100);
    const second = mergeTransfer(
      local({ boards: first.boards, record: first.record, stars: first.stars }),
      link,
      200,
    );
    expect(second.changed).toEqual({ boards: false, record: false, stars: false });
    expect(second.summary).toEqual({ times: 0, achievements: 0, stars: 0, settings: false });
  });

  it("keeps the earliest unlock date and dates newly earned ones now", () => {
    const merged = mergeTransfer(
      local({ record: { progress: emptyProgress(), unlocked: { "first-win": 50 } } }),
      incoming({
        record: {
          progress: { wins: { square: { easy: 1 } }, flagless: 0, shapes: [] },
          unlocked: { "first-win": 20 },
        },
      }),
      999,
    );
    expect(merged.record.unlocked["first-win"]).toBe(20);
    expect(merged.summary.achievements).toBe(0);
  });

  it("seeds achievements from the link's times when it carries no record", () => {
    const merged = mergeTransfer(
      local(),
      incoming({ boards: { "square|easy": [{ ms: 4000, at: 2 }] }, record: null }),
      500,
    );
    expect(merged.record.progress.wins).toEqual({ square: { easy: 1 } });
    expect(merged.record.unlocked["first-win"]).toBe(500);
    expect(merged.summary.achievements).toBeGreaterThan(0);
  });

  it("adopts settings only where this browser has none", () => {
    const settings = { ...DEFAULT_SETTINGS, haptics: false };
    expect(mergeTransfer(local({ hasSettings: true }), incoming({ settings })).settings).toBeNull();
    const fresh = mergeTransfer(local({ hasSettings: false }), incoming({ settings }));
    expect(fresh.settings).toEqual(settings);
    expect(fresh.summary.settings).toBe(true);
  });

  it("lets the later change to a star win", () => {
    const merged = mergeTransfer(
      local({ stars: { hexagon: { on: false, at: 9 }, square: { on: true, at: 1 } } }),
      incoming({ stars: { hexagon: { on: true, at: 5 }, triangle: { on: true, at: 2 } } }),
    );
    expect(merged.stars).toEqual({
      hexagon: { on: false, at: 9 },
      square: { on: true, at: 1 },
      triangle: { on: true, at: 2 },
    });
    expect(merged.summary.stars).toBe(1);
  });
});

describe("a round trip through storage", () => {
  it("carries one browser's record into another and merges it there", async () => {
    // The sending browser.
    vi.stubGlobal(
      "localStorage",
      fakeStorage({
        "ms:scores": JSON.stringify({
          version: 1,
          boards: { "square|easy": [{ ms: 3000, at: 4 }] },
        }),
        "ms:favourites": JSON.stringify({ version: 1, modes: { hexagon: { on: true, at: 2 } } }),
        "ms:settings": JSON.stringify({
          ...DEFAULT_SETTINGS,
          version: SCHEMA_VERSION,
          haptics: false,
        }),
      }),
    );
    const token = await encodeTransfer(currentRecord());

    // The receiving one, with a slower time of its own and no settings.
    const there = fakeStorage({
      "ms:scores": JSON.stringify({ version: 1, boards: { "square|easy": [{ ms: 8000, at: 9 }] } }),
    });
    vi.stubGlobal("localStorage", there);
    const rec = parseTransfer(await decodeTransfer(token));
    expect(rec).not.toBeNull();
    const summary = importRecord(rec!, 1000);
    expect(summary.times).toBe(1);
    expect(summary.stars).toBe(1);
    expect(summary.settings).toBe(true);
    expect(JSON.parse(there.map.get("ms:scores")!).boards["square|easy"]).toEqual([
      { ms: 3000, at: 4 },
      { ms: 8000, at: 9 },
    ]);
    expect(JSON.parse(there.map.get("ms:favourites")!).modes.hexagon.on).toBe(true);
    expect(loadSettings().haptics).toBe(false);
    // Each browser's record holds one win on this board; the merge takes the
    // larger count rather than the sum (see transfer.ts), so a link opened
    // twice can never double it.
    expect(JSON.parse(there.map.get("ms:achievements")!).wins).toEqual({ square: { easy: 1 } });

    // Opened again: nothing new.
    expect(importRecord(rec!, 2000)).toEqual({
      times: 0,
      achievements: 0,
      stars: 0,
      settings: false,
    });
  });
});
