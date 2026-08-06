import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { HapticKind } from "../../src/haptics";

// haptics dispatch picks its mechanism by feature detection at call time. The
// physical buzz can't be observed headless, but the dispatch is pure logic:
// inside the native shell we assert the Taptic call the bridge is handed; with
// navigator.vibrate present, the pattern it's called with; with neither, that
// the iOS <input switch> fallback is created and clicked.
// The module reads ambient `navigator` / `document` globals and caches the
// switch element in a module-level singleton, so each test resets the module
// registry and re-imports, and stubs the globals via vi (node already defines a
// getter-only `navigator`, so plain assignment won't do).
//
// The Capacitor bridge is mocked for the whole file — `native` defaults to
// false, which is what a browser (and node) reports, so the web branches below
// are unaffected by its presence.

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

type HapticsModule = typeof import("../../src/haptics");

async function loadModule(): Promise<HapticsModule> {
  vi.resetModules();
  return await import("../../src/haptics");
}

async function loadHaptic(): Promise<(kind: HapticKind) => void> {
  return (await loadModule()).haptic;
}

beforeEach(() => {
  vi.resetModules();
  bridge.native = false;
  bridge.impact.mockClear();
  bridge.notification.mockClear();
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe("haptic() in the native iOS shell", () => {
  beforeEach(() => {
    bridge.native = true;
    // The Taptic Engine wins even where the Vibration API exists: a pattern of
    // on/off milliseconds is not what an iPhone can play.
    vi.stubGlobal("navigator", { vibrate: vi.fn() });
  });

  it("plays a light impact for a flag", async () => {
    const haptic = await loadHaptic();
    haptic("flag");
    expect(bridge.impact).toHaveBeenCalledWith({ style: "LIGHT" });
    expect(bridge.notification).not.toHaveBeenCalled();
  });

  it("plays the system error notification on a loss — the buzz on failure", async () => {
    const haptic = await loadHaptic();
    haptic("lose");
    expect(bridge.notification).toHaveBeenCalledWith({ type: "ERROR" });
  });

  it("plays the system success notification on a win", async () => {
    const haptic = await loadHaptic();
    haptic("win");
    expect(bridge.notification).toHaveBeenCalledWith({ type: "SUCCESS" });
  });

  it("takes the native branch instead of vibrating", async () => {
    const vibrate = vi.fn();
    vi.stubGlobal("navigator", { vibrate });
    const haptic = await loadHaptic();
    haptic("lose");
    expect(vibrate).not.toHaveBeenCalled();
  });

  it("swallows a rejected haptic — a buzz must never break a move", async () => {
    bridge.notification.mockImplementationOnce(() =>
      Promise.reject(new Error("no engine")),
    );
    const haptic = await loadHaptic();
    expect(() => haptic("lose")).not.toThrow();
    // Let the rejection settle; an unhandled one would fail the run.
    await Promise.resolve();
  });
});

describe("the haptics switch", () => {
  it("is on by default", async () => {
    const { hapticsEnabled } = await loadModule();
    expect(hapticsEnabled()).toBe(true);
  });

  it("silences every mechanism when turned off", async () => {
    bridge.native = true;
    const vibrate = vi.fn();
    vi.stubGlobal("navigator", { vibrate });
    const { haptic, setHapticsEnabled, hapticsEnabled } = await loadModule();
    setHapticsEnabled(false);
    expect(hapticsEnabled()).toBe(false);
    haptic("lose");
    haptic("flag");
    expect(bridge.notification).not.toHaveBeenCalled();
    expect(bridge.impact).not.toHaveBeenCalled();
    expect(vibrate).not.toHaveBeenCalled();
  });

  it("buzzes again when turned back on", async () => {
    const vibrate = vi.fn();
    vi.stubGlobal("navigator", { vibrate });
    const { haptic, setHapticsEnabled } = await loadModule();
    setHapticsEnabled(false);
    haptic("flag");
    setHapticsEnabled(true);
    haptic("flag");
    expect(vibrate).toHaveBeenCalledTimes(1);
  });
});

describe("hapticsSupported()", () => {
  it("is true in the native shell", async () => {
    bridge.native = true;
    vi.stubGlobal("navigator", {}); // no vibrate
    const { hapticsSupported } = await loadModule();
    expect(hapticsSupported()).toBe(true);
  });

  it("is true wherever the Vibration API exists", async () => {
    vi.stubGlobal("navigator", { vibrate: vi.fn() });
    const { hapticsSupported } = await loadModule();
    expect(hapticsSupported()).toBe(true);
  });

  it("is true on iOS Safari, which has the switch tick and nothing else", async () => {
    vi.stubGlobal("navigator", {
      userAgent:
        "Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15",
    });
    const { hapticsSupported } = await loadModule();
    expect(hapticsSupported()).toBe(true);
  });

  it("is true on an iPad, which reports itself as a Mac", async () => {
    vi.stubGlobal("navigator", {
      userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15",
      maxTouchPoints: 5,
    });
    const { hapticsSupported } = await loadModule();
    expect(hapticsSupported()).toBe(true);
  });

  it("is false on a desktop browser with no mechanism at all", async () => {
    vi.stubGlobal("navigator", {
      userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Safari/605.1.15",
      maxTouchPoints: 0,
    });
    const { hapticsSupported } = await loadModule();
    expect(hapticsSupported()).toBe(false);
  });
});

describe("haptic() with the Vibration API", () => {
  it("fires a short single pulse for a placed flag", async () => {
    const vibrate = vi.fn();
    vi.stubGlobal("navigator", { vibrate });
    const haptic = await loadHaptic();
    haptic("flag");
    expect(vibrate).toHaveBeenCalledWith(15);
  });

  it("fires a heavier multi-pulse pattern on a loss", async () => {
    const vibrate = vi.fn();
    vi.stubGlobal("navigator", { vibrate });
    const haptic = await loadHaptic();
    haptic("lose");
    expect(vibrate).toHaveBeenCalledWith([40, 30, 40, 30, 80]);
  });

  it("fires a lighter rising flourish on a win", async () => {
    const vibrate = vi.fn();
    vi.stubGlobal("navigator", { vibrate });
    const haptic = await loadHaptic();
    haptic("win");
    expect(vibrate).toHaveBeenCalledWith([20, 40, 20, 40, 60]);
  });
});

describe("haptic() iOS fallback (no Vibration API)", () => {
  function fakeDom() {
    const input = { type: "", setAttribute: vi.fn() };
    const label = {
      style: {} as Record<string, string>,
      setAttribute: vi.fn(),
      appendChild: vi.fn(),
      click: vi.fn(),
    };
    const createElement = vi.fn((tag: string) => (tag === "input" ? input : label));
    vi.stubGlobal("navigator", {}); // no vibrate
    vi.stubGlobal("document", { createElement, body: { appendChild: vi.fn() } });
    return { label, input, createElement };
  }

  it("builds a hidden switch and clicks it once for a flag", async () => {
    const { input, label } = fakeDom();
    const haptic = await loadHaptic();
    haptic("flag");
    expect(input.setAttribute).toHaveBeenCalledWith("switch", "");
    expect(label.click).toHaveBeenCalledTimes(1);
  });

  it("clicks repeatedly for a loss to feel stronger", async () => {
    vi.useFakeTimers();
    const { label } = fakeDom();
    const haptic = await loadHaptic();
    haptic("lose");
    expect(label.click).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(200);
    expect(label.click).toHaveBeenCalledTimes(3);
  });

  it("clicks repeatedly for a win too", async () => {
    vi.useFakeTimers();
    const { label } = fakeDom();
    const haptic = await loadHaptic();
    haptic("win");
    expect(label.click).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(200);
    expect(label.click).toHaveBeenCalledTimes(3);
  });

  it("reuses the same switch element across calls", async () => {
    const { createElement } = fakeDom();
    const haptic = await loadHaptic();
    haptic("flag");
    haptic("flag");
    // Built once (label + input on the first call), then reused.
    expect(createElement).toHaveBeenCalledTimes(2);
  });
});
