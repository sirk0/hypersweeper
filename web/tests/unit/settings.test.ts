import { afterEach, describe, expect, it, vi } from "vitest";
import {
  animationsEnabled,
  DEFAULT_SETTINGS,
  loadSettings,
  saveSettings,
} from "../../src/settings";
import { DEFAULT_THEME } from "../../src/ui/theme";

// The unit environment is node, with no `window` and no `localStorage` — the
// same conditions haptics.ts is written for. That makes the "storage is not
// available" path the default here, and a fake store is installed where a
// round-trip is what's under test.

const KEY = "ms:settings:v1";

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

function withStorage(storage: Storage): void {
  vi.stubGlobal("localStorage", storage);
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("settings persistence", () => {
  it("returns the defaults when nothing is stored", () => {
    withStorage(fakeStorage());
    expect(loadSettings()).toEqual(DEFAULT_SETTINGS);
    expect(DEFAULT_SETTINGS.theme).toBe(DEFAULT_THEME);
    expect(DEFAULT_SETTINGS.animations).toBeNull();
  });

  it("survives having no storage at all (node, private mode)", () => {
    expect(loadSettings()).toEqual(DEFAULT_SETTINGS);
    expect(() => saveSettings({ theme: "dark", animations: true })).not.toThrow();
  });

  it("round-trips a saved choice", () => {
    withStorage(fakeStorage());
    saveSettings({ theme: "dark", animations: false });
    expect(loadSettings()).toEqual({ theme: "dark", animations: false });
  });

  it("drops a theme that no longer exists", () => {
    withStorage(fakeStorage({ [KEY]: JSON.stringify({ theme: "vaporwave" }) }));
    expect(loadSettings().theme).toBe(DEFAULT_THEME);
  });

  it("falls back on corrupt or non-object JSON", () => {
    withStorage(fakeStorage({ [KEY]: "{not json" }));
    expect(loadSettings()).toEqual(DEFAULT_SETTINGS);
    withStorage(fakeStorage({ [KEY]: "42" }));
    expect(loadSettings()).toEqual(DEFAULT_SETTINGS);
  });

  it("ignores a non-boolean animations value", () => {
    withStorage(fakeStorage({ [KEY]: JSON.stringify({ animations: "yes" }) }));
    expect(loadSettings().animations).toBeNull();
  });

  it("does not throw when the browser refuses to write", () => {
    const store = fakeStorage();
    store.setItem = () => {
      throw new Error("QuotaExceededError");
    };
    withStorage(store);
    expect(() => saveSettings({ theme: "dark", animations: null })).not.toThrow();
  });
});

describe("animationsEnabled", () => {
  it("honours an explicit override either way", () => {
    expect(animationsEnabled(true)).toBe(true);
    expect(animationsEnabled(false)).toBe(false);
  });

  it("follows the OS reduced-motion setting when unset", () => {
    vi.stubGlobal("window", {
      matchMedia: (q: string) => ({ matches: q.includes("reduce") }),
    });
    expect(animationsEnabled(null)).toBe(false);
    vi.stubGlobal("window", { matchMedia: () => ({ matches: false }) });
    expect(animationsEnabled(null)).toBe(true);
  });

  it("defaults to on where there is no window to ask", () => {
    expect(animationsEnabled(null)).toBe(true);
  });
});
