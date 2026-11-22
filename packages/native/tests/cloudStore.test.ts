import { beforeEach, describe, expect, it, vi } from "vitest";

// The bridge to iCloud's key-value store (src/cloudStore.ts): it only moves
// strings, so what is pinned here is the shape of each call across the bridge,
// and that the store is absent outside an App Store app.

const bridge = vi.hoisted(() => ({
  native: false,
  plugins: new Set<string>(),
  read: vi.fn(() => Promise.resolve({ values: { stars: "{}" } as Record<string, string> })),
  write: vi.fn((_options: unknown) => Promise.resolve()),
  listeners: [] as ((change: { keys: string[] }) => void)[],
}));

vi.mock("@capacitor/core", () => ({
  Capacitor: {
    isNativePlatform: () => bridge.native,
    isPluginAvailable: (name: string) => bridge.plugins.has(name),
  },
  registerPlugin: () => ({
    read: () => bridge.read(),
    write: (options: unknown) => bridge.write(options),
    addListener: (_event: string, listener: (change: { keys: string[] }) => void) => {
      bridge.listeners.push(listener);
      return Promise.resolve({ remove: () => Promise.resolve() });
    },
  }),
}));

const { cloudRead, cloudStoreSupported, cloudWrite, onCloudChange } =
  await import("../src/cloudStore");

beforeEach(() => {
  bridge.native = false;
  bridge.plugins.clear();
  bridge.listeners.length = 0;
});

describe("the iCloud key-value bridge", () => {
  it("is absent outside an App Store app", () => {
    expect(cloudStoreSupported()).toBe(false);
    bridge.native = true;
    expect(cloudStoreSupported()).toBe(false); // no plugin registered by the shell
    bridge.plugins.add("CloudRecord");
    expect(cloudStoreSupported()).toBe(true);
  });

  it("reads every value", async () => {
    expect(await cloudRead()).toEqual({ stars: "{}" });
  });

  it("reads a store that answers no values as empty", async () => {
    bridge.read.mockImplementationOnce(() => Promise.resolve({} as never));
    expect(await cloudRead()).toEqual({});
  });

  it("writes and removes keys", async () => {
    await cloudWrite({ stars: '{"a":2}', old: null });
    expect(bridge.write).toHaveBeenCalledWith({ values: { stars: '{"a":2}', old: null } });
  });

  it("passes another device's change on, by key", () => {
    const heard: string[][] = [];
    onCloudChange((keys) => heard.push(keys));
    bridge.listeners[0]?.({ keys: ["stars"] });
    expect(heard).toEqual([["stars"]]);
  });
});
