import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { HapticSpec } from "../src/haptics";

// The haptics mechanism picks its route by feature detection at call time. The
// physical buzz can't be observed headless, but the dispatch is pure logic:
// inside the native shell we assert the Taptic call the bridge is handed; on a
// mobile browser with navigator.vibrate, the pattern it's called with;
// anywhere else — a desktop browser whose vibrate is a no-op, iOS Safari,
// which has no mechanism at all — that nothing is driven and no switch is
// offered. Each game's own tests pin what its events feel like
// (apps/hypersweeper/tests/unit/haptics.test.ts, apps/reptiles/tests/unit/haptics.test.ts).
//
// The module reads the ambient `navigator` global, so each test resets the
// module registry and re-imports, and stubs it via vi (node already defines a
// getter-only `navigator`, so plain assignment won't do).

const bridge = vi.hoisted(() => ({
  native: false,
  impact: vi.fn((_options: unknown) => Promise.resolve()),
  notification: vi.fn((_options: unknown) => Promise.resolve()),
}));

vi.mock("@capacitor/core", () => ({
  Capacitor: { isNativePlatform: () => bridge.native },
}));

vi.mock("@capacitor/haptics", () => ({
  Haptics: {
    impact: (options: unknown) => bridge.impact(options),
    notification: (options: unknown) => bridge.notification(options),
  },
  // The real enums, by value — so an assertion here is an assertion about what
  // crosses the bridge.
  ImpactStyle: { Heavy: "HEAVY", Medium: "MEDIUM", Light: "LIGHT" },
  NotificationType: { Success: "SUCCESS", Warning: "WARNING", Error: "ERROR" },
}));

type HapticsModule = typeof import("../src/haptics");

async function loadModule(): Promise<HapticsModule> {
  vi.resetModules();
  return await import("../src/haptics");
}

const TAP: HapticSpec = { native: { impact: "light" }, vibrate: 15 };
const THUD: HapticSpec = { native: { impact: "heavy" }, vibrate: 30 };
const FAIL: HapticSpec = { native: { notification: "error" }, vibrate: [40, 30, 80] };
const DONE: HapticSpec = { native: { notification: "success" }, vibrate: [20, 40, 60] };

beforeEach(() => {
  vi.resetModules();
  bridge.native = false;
  bridge.impact.mockClear();
  bridge.notification.mockClear();
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

/** What an Android phone reports: the Vibration API on a mobile form factor —
 * the one browser combination that actually buzzes. */
function androidNavigator(vibrate: () => void): { vibrate: () => void } & Record<string, unknown> {
  return {
    vibrate,
    userAgent:
      "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Mobile Safari/537.36",
    userAgentData: { mobile: true },
  };
}

describe("playHaptic() in the native iOS shell", () => {
  beforeEach(() => {
    bridge.native = true;
    // The Taptic Engine wins even where the Vibration API exists: a pattern of
    // on/off milliseconds is not what an iPhone can play.
    vi.stubGlobal("navigator", androidNavigator(vi.fn()));
  });

  it("plays an impact at the weight asked for", async () => {
    const { playHaptic } = await loadModule();
    playHaptic(TAP);
    playHaptic(THUD);
    expect(bridge.impact.mock.calls).toEqual([[{ style: "LIGHT" }], [{ style: "HEAVY" }]]);
    expect(bridge.notification).not.toHaveBeenCalled();
  });

  it("plays the system's notification patterns", async () => {
    const { playHaptic } = await loadModule();
    playHaptic(FAIL);
    playHaptic(DONE);
    expect(bridge.notification.mock.calls).toEqual([[{ type: "ERROR" }], [{ type: "SUCCESS" }]]);
  });

  it("takes the native branch instead of vibrating", async () => {
    const vibrate = vi.fn();
    vi.stubGlobal("navigator", androidNavigator(vibrate));
    const { playHaptic } = await loadModule();
    playHaptic(FAIL);
    expect(vibrate).not.toHaveBeenCalled();
  });

  it("swallows a rejected haptic — a buzz must never break a move", async () => {
    bridge.notification.mockImplementationOnce(() => Promise.reject(new Error("no engine")));
    const { playHaptic } = await loadModule();
    expect(() => playHaptic(FAIL)).not.toThrow();
    await Promise.resolve();
  });
});

describe("the haptics switch", () => {
  it("is on by default", async () => {
    const { hapticsEnabled } = await loadModule();
    expect(hapticsEnabled()).toBe(true);
  });

  it("silences every mechanism when turned off, and buzzes again when back on", async () => {
    bridge.native = true;
    const { playHaptic, setHapticsEnabled, hapticsEnabled } = await loadModule();
    setHapticsEnabled(false);
    expect(hapticsEnabled()).toBe(false);
    playHaptic(TAP);
    playHaptic(FAIL);
    expect(bridge.impact).not.toHaveBeenCalled();
    expect(bridge.notification).not.toHaveBeenCalled();
    setHapticsEnabled(true);
    playHaptic(TAP);
    expect(bridge.impact).toHaveBeenCalledTimes(1);
  });
});

describe("hapticsSupported()", () => {
  // The shell names the device (each game's BridgeViewController.swift),
  // through the reader the game installs; only an iPhone has a Taptic Engine.
  // A shell that does not say keeps the old answer.
  it.each([
    ["phone", true],
    ["pad", false],
    ["mac", false],
    [undefined, true],
  ])("in the native shell on device %s: %s", async (device, expected) => {
    bridge.native = true;
    vi.stubGlobal("navigator", {});
    const { hapticsSupported, setDeviceReader } = await loadModule();
    setDeviceReader(() => device);
    expect(hapticsSupported()).toBe(expected);
  });

  it("drives nothing on an iPad, even with the switch left on", async () => {
    bridge.native = true;
    const { playHaptic, setDeviceReader } = await loadModule();
    setDeviceReader(() => "pad");
    playHaptic(DONE);
    expect(bridge.notification).not.toHaveBeenCalled();
  });

  it("treats a reader that throws as a shell that does not say", async () => {
    bridge.native = true;
    const { hapticsSupported, setDeviceReader } = await loadModule();
    setDeviceReader(() => {
      throw new Error("no window");
    });
    expect(hapticsSupported()).toBe(true);
  });

  it("is true on a mobile browser with the Vibration API — an Android phone", async () => {
    vi.stubGlobal("navigator", androidNavigator(vi.fn()));
    const { hapticsSupported } = await loadModule();
    expect(hapticsSupported()).toBe(true);
  });

  it("falls back to the user-agent string where client hints are missing", async () => {
    vi.stubGlobal("navigator", {
      vibrate: vi.fn(),
      userAgent: "Mozilla/5.0 (Android 14; Mobile; rv:127.0) Gecko/127.0 Firefox/127.0",
    });
    const { hapticsSupported } = await loadModule();
    expect(hapticsSupported()).toBe(true);
  });

  it("is false on a desktop browser, whose vibrate() shakes nothing", async () => {
    vi.stubGlobal("navigator", {
      vibrate: vi.fn(),
      userAgent: "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/126 Safari/537.36",
      userAgentData: { mobile: false },
    });
    const { hapticsSupported } = await loadModule();
    expect(hapticsSupported()).toBe(false);
  });

  it("is false in iOS Safari, which has no web haptic at all", async () => {
    vi.stubGlobal("navigator", {
      userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15",
    });
    const { hapticsSupported } = await loadModule();
    expect(hapticsSupported()).toBe(false);
  });
});

describe("playHaptic() through the Vibration API", () => {
  it("vibrates the spec's pattern on an Android phone", async () => {
    const vibrate = vi.fn();
    vi.stubGlobal("navigator", androidNavigator(vibrate));
    const { playHaptic } = await loadModule();
    playHaptic(TAP);
    playHaptic(DONE);
    expect(vibrate.mock.calls).toEqual([[15], [[20, 40, 60]]]);
  });

  it("does not vibrate on a desktop browser", async () => {
    const vibrate = vi.fn();
    vi.stubGlobal("navigator", {
      vibrate,
      userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Chrome/126 Safari/537.36",
      userAgentData: { mobile: false },
    });
    const { playHaptic } = await loadModule();
    playHaptic(FAIL);
    expect(vibrate).not.toHaveBeenCalled();
  });
});
