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
});
