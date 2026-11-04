import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  countWinForReview,
  noteWinForReview,
  REVIEW_AFTER_WINS,
  reviewSupported,
  reviewWins,
} from "../../src/review";

// The App Store rating prompt (src/review.ts): the page counts wins and asks
// once, on the third; StoreKit (ReviewPlugin.swift) decides whether a sheet
// shows, and caps it at three a year on its own.

const KEY = "ms:review";
const IOS = resolve(__dirname, "../../ios/App");

class MemoryStorage {
  private data = new Map<string, string>();
  getItem(k: string): string | null {
    return this.data.get(k) ?? null;
  }
  setItem(k: string, v: string): void {
    this.data.set(k, v);
  }
  removeItem(k: string): void {
    this.data.delete(k);
  }
}

let store: MemoryStorage;
beforeEach(() => {
  store = new MemoryStorage();
  vi.stubGlobal("localStorage", store);
});
afterEach(() => vi.unstubAllGlobals());

describe("the rating prompt", () => {
  it("follows the third win", () => {
    expect(REVIEW_AFTER_WINS).toBe(3);
  });

  it("is due exactly once, on that win", () => {
    const due = Array.from({ length: 6 }, () => countWinForReview());
    expect(due).toEqual([false, false, true, false, false, false]);
    // Counting stops at the threshold.
    expect(reviewWins()).toBe(REVIEW_AFTER_WINS);
  });

  it("reads anything unreadable as no wins", () => {
    for (const raw of ["{not json", "[2]", '{"wins":-1}', '{"wins":1.5}', '{"wins":"2"}']) {
      store.setItem(KEY, raw);
      expect(reviewWins()).toBe(0);
    }
    store.setItem(KEY, JSON.stringify({ wins: 2 }));
    expect(countWinForReview()).toBe(true);
  });

  it("counts nothing outside the App Store app", () => {
    expect(reviewSupported()).toBe(false);
    for (let i = 0; i < REVIEW_AFTER_WINS; i++) noteWinForReview();
    expect(store.getItem(KEY)).toBeNull();
  });
});

describe("the native plugin", () => {
  it("is named the way the page registers it", () => {
    const swift = readFileSync(resolve(IOS, "App/ReviewPlugin.swift"), "utf8");
    expect(swift).toMatch(/jsName = "Review"/);
    expect(swift).toMatch(/CAPPluginMethod\(name: "request"/);
  });

  it("is registered by the app's bridge, and not the App Clip's", () => {
    const bridge = readFileSync(resolve(IOS, "App/BridgeViewController.swift"), "utf8");
    const appOnly = bridge.match(/#if !APP_CLIP([\s\S]*?)#endif/)?.[1] ?? "";
    expect(appOnly).toContain("registerPluginInstance(ReviewPlugin())");
  });

  it("is compiled into the app's sources and not the App Clip's", () => {
    const pbx = readFileSync(resolve(IOS, "App.xcodeproj/project.pbxproj"), "utf8");
    const phases = [
      ...pbx.matchAll(/isa = PBXSourcesBuildPhase;[\s\S]*?files = \(([\s\S]*?)\);/g),
    ].map((m) => m[1]!);
    const app = phases.find((p) => p.includes("AppDelegate.swift in Sources"));
    const clip = phases.find((p) => p.includes("ClipAppDelegate.swift in Sources"));
    expect(app).toContain("ReviewPlugin.swift in Sources");
    expect(clip).not.toContain("ReviewPlugin.swift");
  });
});
