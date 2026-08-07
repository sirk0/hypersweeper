import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { HapticKind } from "../../src/haptics";

// haptics dispatch picks its mechanism by feature detection at call time. The
// physical buzz can't be observed headless, but the dispatch is pure logic:
// inside the native shell we assert the Taptic call the bridge is handed; on a
// mobile browser with navigator.vibrate, the pattern it's called with; anywhere
// else — a desktop browser whose vibrate is a no-op, iOS Safari, which has no
// mechanism at all — that nothing is driven and no switch is offered.
// The module reads the ambient `navigator` global, so each test resets the
// module registry and re-imports, and stubs it via vi (node already defines a
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

describe("haptic() in the native iOS shell", () => {
  beforeEach(() => {
    bridge.native = true;
    // The Taptic Engine wins even where the Vibration API exists: a pattern of
    // on/off milliseconds is not what an iPhone can play.
    vi.stubGlobal("navigator", androidNavigator(vi.fn()));
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
    vi.stubGlobal("navigator", androidNavigator(vibrate));
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
    vi.stubGlobal("navigator", androidNavigator(vibrate));
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
    vi.stubGlobal("navigator", androidNavigator(vibrate));
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
      userAgent:
        "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36",
      userAgentData: { mobile: false },
    });
    const { hapticsSupported } = await loadModule();
    expect(hapticsSupported()).toBe(false);
  });

  it("is false in iOS Safari, which has no web haptic at all", async () => {
    // No `vibrate`: WebKit does not implement the Vibration API, and the
    // hidden-switch tick that used to stand in for it does not buzz.
    vi.stubGlobal("navigator", {
      userAgent:
        "Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15",
      maxTouchPoints: 5,
    });
    const { hapticsSupported } = await loadModule();
    expect(hapticsSupported()).toBe(false);
  });

  it("is false on an iPad, which reports itself as a touch-capable Mac", async () => {
    vi.stubGlobal("navigator", {
      userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15",
      maxTouchPoints: 5,
    });
    const { hapticsSupported } = await loadModule();
    expect(hapticsSupported()).toBe(false);
  });
});

describe("haptic() on a mobile browser with the Vibration API", () => {
  beforeEach(() => {
    vi.stubGlobal("navigator", androidNavigator(vi.fn()));
  });

  function vibrateSpy(): ReturnType<typeof vi.fn> {
    return navigator.vibrate as unknown as ReturnType<typeof vi.fn>;
  }

  it("fires a short single pulse for a placed flag", async () => {
    const haptic = await loadHaptic();
    haptic("flag");
    expect(vibrateSpy()).toHaveBeenCalledWith(15);
  });

  it("fires a heavier multi-pulse pattern on a loss", async () => {
    const haptic = await loadHaptic();
    haptic("lose");
    expect(vibrateSpy()).toHaveBeenCalledWith([40, 30, 40, 30, 80]);
  });

  it("fires a lighter rising flourish on a win", async () => {
    const haptic = await loadHaptic();
    haptic("win");
    expect(vibrateSpy()).toHaveBeenCalledWith([20, 40, 20, 40, 60]);
  });
});

// Where nothing can buzz, nothing is driven — the settings row is hidden there,
// but a record carrying `haptics: true` from a phone must be inert too.
describe("haptic() where there is no mechanism", () => {
  it("does not vibrate on a desktop browser, whose vibrate() is a no-op", async () => {
    const vibrate = vi.fn();
    vi.stubGlobal("navigator", {
      vibrate,
      userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Chrome/126 Safari/537.36",
      userAgentData: { mobile: false },
    });
    const haptic = await loadHaptic();
    haptic("lose");
    expect(vibrate).not.toHaveBeenCalled();
  });

  it("does nothing in iOS Safari, and touches no DOM doing it", async () => {
    const createElement = vi.fn();
    vi.stubGlobal("navigator", {
      userAgent:
        "Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15",
    });
    vi.stubGlobal("document", { createElement, body: { appendChild: vi.fn() } });
    const haptic = await loadHaptic();
    for (const kind of ["flag", "lose", "win"] as const) haptic(kind);
    expect(createElement).not.toHaveBeenCalled();
  });
});
