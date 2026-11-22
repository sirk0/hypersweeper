import { afterEach, describe, expect, it, vi } from "vitest";

// progress.ts reads its record once, when it is first imported, so each test
// stubs localStorage and imports a fresh copy.
async function freshProgress(items: Record<string, string>) {
  vi.stubGlobal("localStorage", {
    getItem: (key: string) => items[key] ?? null,
    setItem: (key: string, value: string) => void (items[key] = value),
  });
  vi.resetModules();
  return await import("../../src/progress");
}

afterEach(() => vi.unstubAllGlobals());

describe("progress", () => {
  it("reads the current record, the renamed one and the old finished list", async () => {
    const p = await freshProgress({
      "tiling-simulator.solved": '["a", "b", 7]',
      "tiling-simulator.stars": '{"b": 2, "c": 3}',
      "rep-tiles.stars": '{"c": 1, "d": 9, "e": 2.7}',
    });
    expect(["a", "b", "c", "d", "e", "f"].map(p.starsFor)).toEqual([1, 2, 3, 0, 2, 0]);
  });

  it("keeps only an improvement, and writes the record under the current key", async () => {
    const items: Record<string, string> = { "rep-tiles.stars": '{"a": 2}' };
    const p = await freshProgress(items);
    p.recordStars("a", 1);
    expect(p.starsFor("a")).toBe(2);
    p.recordStars("a", 3);
    p.recordStars("b", 1);
    expect(JSON.parse(items["rep-tiles.stars"]!)).toEqual({ a: 3, b: 1 });
  });

  it("works with no storage at all, keeping stars in memory", async () => {
    vi.resetModules();
    const p = await import("../../src/progress");
    expect(p.starsFor("a")).toBe(0);
    p.recordStars("a", 2);
    expect(p.starsFor("a")).toBe(2);
  });

  it("ignores unreadable records", async () => {
    const p = await freshProgress({
      "tiling-simulator.solved": "{not json",
      "rep-tiles.stars": '[["a", 3]]',
    });
    expect(p.starsFor("a")).toBe(0);
  });

  it("merges another record's stars in, keeping each level's most, and says so", async () => {
    const items: Record<string, string> = { "rep-tiles.stars": '{"a": 2, "b": 3}' };
    const p = await freshProgress(items);
    let heard = 0;
    p.onStarsMerged(() => heard++);
    p.mergeStars(
      new Map([
        ["a", 1],
        ["b", 3],
      ]),
    );
    expect(heard).toBe(0); // nothing rose
    p.mergeStars(
      new Map([
        ["a", 3],
        ["c", 1],
        ["d", 7],
      ]),
    );
    expect(heard).toBe(1);
    expect(JSON.parse(items["rep-tiles.stars"]!)).toEqual({ a: 3, b: 3, c: 1 });
    expect([...p.allStars()]).toEqual([
      ["a", 3],
      ["b", 3],
      ["c", 1],
    ]);
  });

  it("keeps each level's fastest finish under its own key, and merges the least in", async () => {
    const items: Record<string, string> = {
      "rep-tiles.times": '{"a": 90000, "b": -4, "c": "fast", "d": 61234.6}',
    };
    const p = await freshProgress(items);
    expect(["a", "b", "c", "d", "e"].map(p.bestTimeFor)).toEqual([90000, null, null, 61235, null]);
    expect(p.recordTime("a", 95000)).toBe(false);
    expect(p.recordTime("a", 80000)).toBe(true);
    expect(p.recordTime("e", 12000)).toBe(true);
    expect(p.recordTime("f", Number.NaN)).toBe(false);
    expect(JSON.parse(items["rep-tiles.times"]!)).toEqual({ a: 80000, d: 61235, e: 12000 });
    // the stars are untouched
    expect(items["rep-tiles.stars"]).toBeUndefined();

    let heard = 0;
    p.onStarsMerged(() => heard++);
    p.mergeTimes(new Map([["a", 85000]]));
    expect(heard).toBe(0); // nothing fell
    p.mergeTimes(
      new Map([
        ["a", 70000],
        ["g", 5000],
        ["h", 0],
      ]),
    );
    expect(heard).toBe(1);
    expect(Object.fromEntries(p.allTimes())).toEqual({ a: 70000, d: 61235, e: 12000, g: 5000 });
  });

  it("formats a time as minutes and seconds", async () => {
    const p = await freshProgress({});
    expect([0, 999, 5000, 65_400, 600_000, 3_725_000].map(p.formatTime)).toEqual([
      "0:00",
      "0:00",
      "0:05",
      "1:05",
      "10:00",
      "62:05",
    ]);
  });
});
