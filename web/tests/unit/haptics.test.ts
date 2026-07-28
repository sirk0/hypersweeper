import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { HapticKind } from "../../src/haptics";

interface HapticsModule {
  haptic(kind: HapticKind): void;
  primeHaptics(): void;
}

// haptics dispatch picks its mechanism by feature detection at call time. The
// physical buzz can't be observed headless, but the dispatch is pure logic:
// with navigator.vibrate present we assert the pattern it's called with; with
// it absent we assert the iOS <input switch> fallback is created and clicked.
// The module reads ambient `navigator` / `document` globals and caches the
// switch element in a module-level singleton, so each test resets the module
// registry and re-imports, and stubs the globals via vi (node already defines a
// getter-only `navigator`, so plain assignment won't do).

async function loadModule(): Promise<HapticsModule> {
  vi.resetModules();
  return await import("../../src/haptics");
}

async function loadHaptic(): Promise<(kind: HapticKind) => void> {
  return (await loadModule()).haptic;
}

beforeEach(() => {
  vi.resetModules();
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  vi.useRealTimers();
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
    const input = { type: "", setAttribute: vi.fn(), click: vi.fn() };
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
    const { input } = fakeDom();
    const haptic = await loadHaptic();
    haptic("flag");
    expect(input.setAttribute).toHaveBeenCalledWith("switch", "");
    expect(input.click).toHaveBeenCalledTimes(1);
  });

  // The tick is the switch control's own activation behaviour, so the click
  // has to land on the input; a synthetic click on the wrapping <label> is not
  // reliably forwarded in WebKit, which is the engine this whole path exists
  // for. The label must also stay clickable — no pointer-events: none.
  it("clicks the input itself, never the wrapping label", async () => {
    const { input, label } = fakeDom();
    const haptic = await loadHaptic();
    haptic("flag");
    expect(input.click).toHaveBeenCalled();
    expect(label.click).not.toHaveBeenCalled();
    expect(label.style.pointerEvents).toBeUndefined();
  });

  it("clicks repeatedly for a loss to feel stronger", async () => {
    vi.useFakeTimers();
    const { input } = fakeDom();
    const haptic = await loadHaptic();
    haptic("lose");
    expect(input.click).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(200);
    expect(input.click).toHaveBeenCalledTimes(3);
  });

  it("clicks repeatedly for a win too", async () => {
    vi.useFakeTimers();
    const { input } = fakeDom();
    const haptic = await loadHaptic();
    haptic("win");
    expect(input.click).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(200);
    expect(input.click).toHaveBeenCalledTimes(3);
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

// An element inserted and activated in the same task has not been laid out and
// plays no haptic, so the switch is built in advance from a user gesture.
describe("primeHaptics()", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("builds the switch without ticking, and the first flag reuses it", async () => {
    const input = { type: "", setAttribute: vi.fn(), click: vi.fn() };
    const label = {
      style: {} as Record<string, string>,
      setAttribute: vi.fn(),
      appendChild: vi.fn(),
    };
    const createElement = vi.fn((tag: string) => (tag === "input" ? input : label));
    vi.stubGlobal("navigator", {}); // no vibrate
    vi.stubGlobal("document", { createElement, body: { appendChild: vi.fn() } });

    const { haptic, primeHaptics } = await loadModule();
    primeHaptics();
    expect(createElement).toHaveBeenCalledTimes(2); // label + input
    expect(input.click).not.toHaveBeenCalled();

    haptic("flag");
    expect(createElement).toHaveBeenCalledTimes(2); // reused, not rebuilt
    expect(input.click).toHaveBeenCalledTimes(1);
  });

  it("builds nothing where the Vibration API exists", async () => {
    const createElement = vi.fn();
    vi.stubGlobal("navigator", { vibrate: vi.fn() });
    vi.stubGlobal("document", { createElement, body: { appendChild: vi.fn() } });
    const { primeHaptics } = await loadModule();
    primeHaptics();
    expect(createElement).not.toHaveBeenCalled();
  });
});
