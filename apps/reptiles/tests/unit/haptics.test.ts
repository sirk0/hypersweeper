import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// What Rep-tiles' moves feel like (src/haptics.ts). The mechanism is
// `@tiling/native`'s, pinned in packages/native/tests/haptics.test.ts; this pins
// the game's half: each event's feel across the Capacitor bridge, the device
// flag its shell sets, and the haptics preference.

const bridge = vi.hoisted(() => ({
  native: false,
  impact: vi.fn((_options: unknown) => Promise.resolve()),
  notification: vi.fn((_options: unknown) => Promise.resolve()),
}));

vi.mock("@capacitor/core", () => ({
  Capacitor: { isNativePlatform: () => bridge.native, isPluginAvailable: () => false },
  registerPlugin: () => ({}),
}));

vi.mock("@capacitor/haptics", () => ({
  Haptics: {
    impact: (options: unknown) => bridge.impact(options),
    notification: (options: unknown) => bridge.notification(options),
  },
  ImpactStyle: { Heavy: "HEAVY", Medium: "MEDIUM", Light: "LIGHT" },
  NotificationType: { Success: "SUCCESS", Warning: "WARNING", Error: "ERROR" },
}));

async function load() {
  vi.resetModules();
  return await import("../../src/haptics");
}

beforeEach(() => {
  bridge.native = false;
  bridge.impact.mockClear();
  bridge.notification.mockClear();
});
afterEach(() => vi.unstubAllGlobals());

describe("Rep-tiles' haptics in the iPhone app", () => {
  beforeEach(() => {
    bridge.native = true;
    vi.stubGlobal("window", { reptilesDevice: "phone" });
  });

  it("taps when a tile lands", async () => {
    (await load()).haptic("place");
    expect(bridge.impact).toHaveBeenCalledWith({ style: "MEDIUM" });
  });

  it("plays the success notification when the board is finished", async () => {
    (await load()).haptic("win");
    expect(bridge.notification).toHaveBeenCalledWith({ type: "SUCCESS" });
  });

  it("is offered on a phone, and not on an iPad", async () => {
    expect((await load()).hapticsSupported()).toBe(true);
    vi.stubGlobal("window", { reptilesDevice: "pad" });
    const { haptic, hapticsSupported } = await load();
    expect(hapticsSupported()).toBe(false);
    haptic("win");
    expect(bridge.notification).not.toHaveBeenCalled();
  });

  it("is silenced by the switch", async () => {
    const { haptic, setHapticsEnabled } = await load();
    setHapticsEnabled(false);
    haptic("place");
    haptic("win");
    expect(bridge.impact).not.toHaveBeenCalled();
    expect(bridge.notification).not.toHaveBeenCalled();
  });
});

describe("the haptics preference", () => {
  async function freshPreferences(items: Record<string, string>) {
    vi.stubGlobal("localStorage", {
      getItem: (key: string) => items[key] ?? null,
      setItem: (key: string, value: string) => void (items[key] = value),
    });
    vi.resetModules();
    return await import("../../src/preferences");
  }

  it("is on unless turned off, and kept", async () => {
    const items: Record<string, string> = {};
    let p = await freshPreferences(items);
    expect(p.preferences().haptics).toBe(true);
    p.setPreferences({ haptics: false });
    p = await freshPreferences(items);
    expect(p.preferences().haptics).toBe(false);
  });

  it("reads anything but a boolean as on", async () => {
    const p = await freshPreferences({ "rep-tiles.settings": '{"haptics": "no"}' });
    expect(p.preferences().haptics).toBe(true);
  });
});
