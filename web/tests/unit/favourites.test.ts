import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  favourites,
  isFavourite,
  mergeStars,
  parseStars,
  setFavourite,
  storedStars,
  toggleFavourite,
} from "../../src/favourites";

// The favourites store (src/favourites.ts): a dated switch per board, read
// totally, written with what it does not know carried through, and merged
// between devices by the later change.

const KEY = "ms:favourites";

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

describe("reading", () => {
  it("is empty with nothing stored, or with something unreadable", () => {
    expect(favourites()).toEqual([]);
    store.setItem(KEY, "{not json");
    expect(favourites()).toEqual([]);
    store.setItem(KEY, JSON.stringify({ version: 1, modes: [1, 2] }));
    expect(favourites()).toEqual([]);
  });

  it("drops a corrupt entry and keeps the rest", () => {
    expect(
      parseStars({ hex: { on: true, at: 5 }, cube: { on: "yes" }, torus: 3, tri: { on: false } }),
    ).toEqual({ hex: { on: true, at: 5 }, tri: { on: false, at: 0 } });
  });

  it("lists the starred boards in the order they were starred", () => {
    store.setItem(
      KEY,
      JSON.stringify({
        version: 1,
        modes: { cube: { on: true, at: 30 }, hex: { on: true, at: 10 }, tri: { on: false, at: 20 } },
      }),
    );
    expect(favourites()).toEqual(["hex", "cube"]);
  });
});

describe("writing", () => {
  it("toggles a board on and off, keeping the unstar with its date", () => {
    expect(toggleFavourite("hex", 100)).toBe(true);
    expect(isFavourite("hex")).toBe(true);
    expect(toggleFavourite("hex", 200)).toBe(false);
    expect(isFavourite("hex")).toBe(false);
    expect(storedStars()).toEqual({ hex: { on: false, at: 200 } });
  });

  it("carries through boards and fields it does not know", () => {
    store.setItem(
      KEY,
      JSON.stringify({ version: 1, later: "x", modes: { "renamed-mode": { on: true, at: 1 } } }),
    );
    setFavourite("hex", true, 2);
    const rec = JSON.parse(store.getItem(KEY)!);
    expect(rec.later).toBe("x");
    expect(Object.keys(rec.modes).sort()).toEqual(["hex", "renamed-mode"]);
  });
});

describe("merging two devices", () => {
  it("takes the later change to each board", () => {
    const phone = { hex: { on: true, at: 10 }, cube: { on: true, at: 10 } };
    const mac = { hex: { on: false, at: 20 }, cube: { on: false, at: 5 }, tri: { on: true, at: 1 } };
    const merged = mergeStars(phone, mac);
    expect(merged).toEqual({
      hex: { on: false, at: 20 }, // unstarred later on the Mac
      cube: { on: true, at: 10 }, // starred later on the phone
      tri: { on: true, at: 1 },
    });
    // Either way round, and again: the same answer.
    expect(mergeStars(mac, phone)).toEqual(merged);
    expect(mergeStars(merged, phone)).toEqual(merged);
  });

  it("settles an exact tie as starred, whichever side holds it", () => {
    const on = { hex: { on: true, at: 7 } };
    const off = { hex: { on: false, at: 7 } };
    expect(mergeStars(on, off)).toEqual(on);
    expect(mergeStars(off, on)).toEqual(on);
  });
});
