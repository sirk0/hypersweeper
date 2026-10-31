import { afterEach, describe, expect, it, vi } from "vitest";
import { readObject, storage } from "../src/index";

// A Storage stand-in: enough of the interface for the guard to use.
function fakeStorage(items: Record<string, string>): Storage {
  return {
    getItem: (key: string) => items[key] ?? null,
    setItem: (key: string, value: string) => void (items[key] = value),
    removeItem: (key: string) => void delete items[key],
    clear: () => undefined,
    key: () => null,
    length: Object.keys(items).length,
  };
}

afterEach(() => vi.unstubAllGlobals());

describe("storage()", () => {
  it("is null where there is no localStorage (node, here)", () => {
    expect(storage()).toBeNull();
  });

  it("is the localStorage when there is one", () => {
    const store = fakeStorage({});
    vi.stubGlobal("localStorage", store);
    expect(storage()).toBe(store);
  });

  it("is null when merely touching localStorage throws (storage blocked by policy)", () => {
    Object.defineProperty(globalThis, "localStorage", {
      configurable: true,
      get() {
        throw new DOMException("blocked", "SecurityError");
      },
    });
    try {
      expect(storage()).toBeNull();
    } finally {
      delete (globalThis as { localStorage?: Storage }).localStorage;
    }
  });
});

describe("readObject()", () => {
  it("reads a stored JSON object", () => {
    vi.stubGlobal("localStorage", fakeStorage({ k: '{"a":1,"b":[2]}' }));
    expect(readObject("k")).toEqual({ a: 1, b: [2] });
  });

  it.each([
    ["nothing stored", {}],
    ["truncated JSON", { k: '{"a":' }],
    ["an array", { k: "[1,2]" }],
    ["null", { k: "null" }],
    ["a number", { k: "3" }],
    ["a string", { k: '"x"' }],
  ])("is null for %s", (_, items: Record<string, string>) => {
    vi.stubGlobal("localStorage", fakeStorage(items));
    expect(readObject("k")).toBeNull();
  });

  it("is null when reading throws", () => {
    vi.stubGlobal("localStorage", {
      ...fakeStorage({}),
      getItem: () => {
        throw new Error("read failed");
      },
    });
    expect(readObject("k")).toBeNull();
  });

  it("is null with no localStorage at all", () => {
    expect(readObject("k")).toBeNull();
  });
});
