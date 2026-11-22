import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// The rating prompt's counting and asking (src/review.ts). The count is the
// page's; StoreKit (each game's ReviewPlugin.swift) decides whether a sheet
// shows.

const bridge = vi.hoisted(() => ({
  native: false,
  plugins: new Set<string>(),
  request: vi.fn(() => Promise.resolve()),
}));

vi.mock("@capacitor/core", () => ({
  Capacitor: {
    isNativePlatform: () => bridge.native,
    isPluginAvailable: (name: string) => bridge.plugins.has(name),
  },
  registerPlugin: () => ({ request: () => bridge.request() }),
}));

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
  bridge.native = false;
  bridge.plugins.clear();
  bridge.request.mockClear();
});
afterEach(() => vi.unstubAllGlobals());

const { reviewPrompt, reviewSupported } = await import("../src/review");

describe("reviewPrompt", () => {
  it("is due exactly once, on the Nth win", () => {
    const prompt = reviewPrompt({ key: "game:review", afterWins: 3 });
    const due = Array.from({ length: 6 }, () => prompt.countWin());
    expect(due).toEqual([false, false, true, false, false, false]);
    expect(prompt.wins()).toBe(3);
    expect(JSON.parse(store.getItem("game:review") ?? "null")).toEqual({ wins: 3 });
  });

  it("reads anything unreadable as no wins", () => {
    const prompt = reviewPrompt({ key: "game:review", afterWins: 3 });
    for (const raw of ["{not json", "[2]", '{"wins":-1}', '{"wins":1.5}', '{"wins":"2"}']) {
      store.setItem("game:review", raw);
      expect(prompt.wins()).toBe(0);
    }
  });

  it("keeps each game's count apart", () => {
    const a = reviewPrompt({ key: "a:review", afterWins: 2 });
    const b = reviewPrompt({ key: "b:review", afterWins: 2 });
    a.countWin();
    expect(b.wins()).toBe(0);
  });

  it("counts nothing and asks nothing outside an App Store app", () => {
    const prompt = reviewPrompt({ key: "game:review", afterWins: 1 });
    expect(reviewSupported()).toBe(false);
    prompt.noteWin();
    expect(store.getItem("game:review")).toBeNull();
    expect(bridge.request).not.toHaveBeenCalled();
  });

  it("asks StoreKit on the Nth win inside the app", () => {
    bridge.native = true;
    bridge.plugins.add("Review");
    const prompt = reviewPrompt({ key: "game:review", afterWins: 2 });
    prompt.noteWin();
    expect(bridge.request).not.toHaveBeenCalled();
    prompt.noteWin();
    expect(bridge.request).toHaveBeenCalledTimes(1);
    prompt.noteWin();
    expect(bridge.request).toHaveBeenCalledTimes(1);
  });
});
