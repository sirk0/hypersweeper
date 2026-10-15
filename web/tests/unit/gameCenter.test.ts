import { describe, expect, it } from "vitest";
import { applyWin, emptyProgress, type Win } from "../../src/achievements";
import { gameCenterProgress, gameCenterSupported } from "../../src/gameCenter";

// What Game Center is sent is the record's progress, recomputed: a percentage
// per achievement the record has started. The native half — signing in, the
// bridge — is pinned by tests/e2e/gameCenter.spec.ts.

const win = (mode: string, over: Partial<Win> = {}): Win => ({
  mode,
  difficulty: "easy",
  ms: 30_000,
  flagless: false,
  sides: [4],
  ...over,
});

describe("Game Center progress", () => {
  it("is off outside the native app", () => {
    expect(gameCenterSupported()).toBe(false);
  });

  it("says nothing about a record with no wins", () => {
    expect(gameCenterProgress(emptyProgress())).toEqual([]);
  });

  it("sends a finished achievement at 100 and a counted one partway", () => {
    const progress = applyWin(emptyProgress(), win("square"));
    const sent = new Map(gameCenterProgress(progress).map((r) => [r.id, r.percent]));
    expect(sent.get("hs.first_win")).toBe(100);
    expect(sent.get("hs.shape.4")).toBe(100);
    // One win of ten.
    expect(sent.get("hs.wins.10")).toBe(10);
    // Not started: medium has never been won, and is not sent as 0.
    expect(sent.has("hs.difficulty.medium")).toBe(false);
    for (const percent of sent.values()) {
      expect(percent).toBeGreaterThan(0);
      expect(percent).toBeLessThanOrEqual(100);
    }
  });

  it("never sends more than 100", () => {
    let progress = emptyProgress();
    for (let i = 0; i < 12; i++) progress = applyWin(progress, win("square"));
    const sent = new Map(gameCenterProgress(progress).map((r) => [r.id, r.percent]));
    expect(sent.get("hs.wins.10")).toBe(100);
  });
});
