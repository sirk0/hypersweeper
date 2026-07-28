import { afterEach, describe, expect, it, vi } from "vitest";
import {
  animationsEnabled,
  DEFAULT_SETTINGS,
  loadSettings,
  saveSettings,
  SCHEMA_VERSION,
  subscribeSettings,
  type Settings,
} from "../../src/settings";
import { DEFAULT_THEME } from "../../src/ui/theme";

// The unit environment is node, with no `window` and no `localStorage` — the
// same conditions haptics.ts is written for. That makes "storage is not
// available" the default here, and a fake store is installed where a round-trip
// is what's under test.

const KEY = "ms:settings";
const LEGACY = "ms:settings:v1";

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

function stored(store: Storage, key = KEY): Record<string, unknown> {
  return JSON.parse(store.getItem(key) ?? "{}") as Record<string, unknown>;
}

const SETTINGS: Settings = { theme: "dark", difficulty: "hard", animations: false };

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
    expect(() => saveSettings(SETTINGS)).not.toThrow();
  });

  it("round-trips every field", () => {
    withStorage(fakeStorage());
    saveSettings(SETTINGS);
    expect(loadSettings()).toEqual(SETTINGS);
  });

  it("stamps the record with the schema version", () => {
    const store = withStorage(fakeStorage());
    saveSettings(SETTINGS);
    expect(stored(store)["version"]).toBe(SCHEMA_VERSION);
  });

  it("does not throw when the browser refuses to write", () => {
    const store = fakeStorage();
    store.setItem = () => {
      throw new Error("QuotaExceededError");
    };
    withStorage(store);
    expect(() => saveSettings(SETTINGS)).not.toThrow();
  });
});

describe("settings validation", () => {
  it("drops a theme that no longer exists", () => {
    withStorage(fakeStorage({ [KEY]: JSON.stringify({ theme: "vaporwave" }) }));
    expect(loadSettings().theme).toBe(DEFAULT_THEME);
  });

  it("drops a difficulty that no longer exists", () => {
    withStorage(fakeStorage({ [KEY]: JSON.stringify({ difficulty: "nightmare" }) }));
    expect(loadSettings().difficulty).toBe(DEFAULT_SETTINGS.difficulty);
  });

  it("keeps the valid fields of a partly invalid record", () => {
    // One bad field must not cost the user the others.
    withStorage(
      fakeStorage({ [KEY]: JSON.stringify({ theme: "dark", difficulty: 7, animations: "yes" }) }),
    );
    expect(loadSettings()).toEqual({
      theme: "dark",
      difficulty: DEFAULT_SETTINGS.difficulty,
      animations: null,
    });
  });

  it("falls back on corrupt, non-object or array JSON", () => {
    for (const raw of ["{not json", "42", '"a string"', "null", '["dark"]']) {
      withStorage(fakeStorage({ [KEY]: raw }));
      expect(loadSettings(), raw).toEqual(DEFAULT_SETTINGS);
    }
  });

  it("survives a storage that throws on read", () => {
    const store = fakeStorage();
    store.getItem = () => {
      throw new Error("SecurityError");
    };
    withStorage(store);
    expect(loadSettings()).toEqual(DEFAULT_SETTINGS);
  });
});

describe("settings upgrades", () => {
  it("reads a v1 record from the legacy key and keeps its values", () => {
    // v1 had no `difficulty`; the missing field takes the default and the rest
    // must survive the move.
    const store = withStorage(
      fakeStorage({ [LEGACY]: JSON.stringify({ theme: "paper", animations: true }) }),
    );
    expect(loadSettings()).toEqual({
      theme: "paper",
      difficulty: DEFAULT_SETTINGS.difficulty,
      animations: true,
    });
    // Migration completes on the next write, and only then is the old key
    // dropped — an interrupted migration must not lose the record.
    expect(store.getItem(LEGACY)).not.toBeNull();
    saveSettings(loadSettings());
    expect(store.getItem(LEGACY)).toBeNull();
    expect(stored(store)["theme"]).toBe("paper");
  });

  it("prefers the current key over a stale legacy one", () => {
    withStorage(
      fakeStorage({
        [KEY]: JSON.stringify({ theme: "dark", version: SCHEMA_VERSION }),
        [LEGACY]: JSON.stringify({ theme: "paper" }),
      }),
    );
    expect(loadSettings().theme).toBe("dark");
  });

  it("reads what it understands from a record written by a newer build", () => {
    withStorage(
      fakeStorage({
        [KEY]: JSON.stringify({ version: 99, theme: "dark", difficulty: "easy", sound: "loud" }),
      }),
    );
    expect(loadSettings()).toEqual({ theme: "dark", difficulty: "easy", animations: null });
  });

  it("preserves fields it does not recognise when writing", () => {
    // Downgrading (an older tab, a rolled-back deploy) must not throw away a
    // newer build's preferences.
    const store = withStorage(
      fakeStorage({ [KEY]: JSON.stringify({ version: 99, sound: "loud" }) }),
    );
    saveSettings(SETTINGS);
    expect(stored(store)["sound"]).toBe("loud");
    expect(stored(store)["theme"]).toBe("dark");
    expect(stored(store)["version"]).toBe(SCHEMA_VERSION);
  });
});

describe("cross-tab sync", () => {
  function withWindow(): { fire: (e: Partial<StorageEvent>) => void } {
    const listeners: ((e: StorageEvent) => void)[] = [];
    vi.stubGlobal("window", {
      addEventListener: (type: string, fn: (e: StorageEvent) => void) => {
        if (type === "storage") listeners.push(fn);
      },
      removeEventListener: (_type: string, fn: (e: StorageEvent) => void) => {
        const i = listeners.indexOf(fn);
        if (i >= 0) listeners.splice(i, 1);
      },
    });
    return { fire: (e) => listeners.forEach((fn) => fn(e as StorageEvent)) };
  }

  it("reports settings another tab wrote", () => {
    const store = withStorage(fakeStorage());
    const { fire } = withWindow();
    const seen: Settings[] = [];
    subscribeSettings((s) => seen.push(s));

    store.setItem(KEY, JSON.stringify({ theme: "dark", difficulty: "easy" }));
    fire({ key: KEY });
    expect(seen).toEqual([{ theme: "dark", difficulty: "easy", animations: null }]);
  });

  it("ignores other keys but honours a whole-store clear", () => {
    withStorage(fakeStorage({ [KEY]: JSON.stringify({ theme: "dark" }) }));
    const { fire } = withWindow();
    const seen: Settings[] = [];
    subscribeSettings((s) => seen.push(s));

    fire({ key: "unrelated-app-key" });
    expect(seen).toHaveLength(0);
    fire({ key: null }); // localStorage.clear() elsewhere
    expect(seen).toHaveLength(1);
  });

  it("unsubscribes", () => {
    withStorage(fakeStorage());
    const { fire } = withWindow();
    let calls = 0;
    const off = subscribeSettings(() => calls++);
    off();
    fire({ key: KEY });
    expect(calls).toBe(0);
  });

  it("is a no-op where there is no window", () => {
    expect(() => subscribeSettings(() => {})()).not.toThrow();
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
