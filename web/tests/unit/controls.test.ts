import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CellId } from "../../src/boards/core";
import { attachControls, type ControlHandlers } from "../../src/input/controls";

// The gesture state machine is pure logic over an event stream, so it is
// testable without a DOM: the canvas is faked down to the four things
// attachControls touches (add/removeEventListener, setPointerCapture,
// getBoundingClientRect) and events are plain literals. `window` is aliased to
// globalThis so the module's window.setTimeout is the one vitest fakes.
//
// Timings are written as literals rather than imported so a change to
// LONG_PRESS_MS has to be made here too, deliberately: 350ms has to stay
// comfortably under the ~500ms at which iOS claims a held touch.

type Handler = (e: unknown) => void;

function fakeCanvas() {
  const listeners = new Map<string, Handler>();
  const canvas = {
    addEventListener: (type: string, fn: Handler) => listeners.set(type, fn),
    removeEventListener: (type: string) => listeners.delete(type),
    setPointerCapture: vi.fn(),
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 200, height: 200 }),
  };
  return {
    canvas: canvas as unknown as HTMLCanvasElement,
    fire(type: string, event: Record<string, unknown>): void {
      listeners.get(type)?.({
        button: 0,
        buttons: 1,
        pointerId: 1,
        pointerType: "touch",
        preventDefault: () => {},
        ...event,
      });
    },
  };
}

function harness(over: Partial<ControlHandlers> = {}) {
  const spies = {
    onTap: vi.fn(),
    onLongPress: vi.fn(),
    onSecondary: vi.fn(),
    onHover: vi.fn(),
    onRotate: vi.fn(),
    onPan: vi.fn(),
    onZoom: vi.fn(),
    onScroll: vi.fn(),
  };
  const handlers: ControlHandlers = {
    pick: (): CellId | null => "cell-a",
    rotates: () => false,
    pans: () => false,
    scrolls: () => false,
    ...spies,
    ...over,
  };
  const { canvas, fire } = fakeCanvas();
  const detach = attachControls(canvas, handlers);
  return { ...spies, fire, detach, canvas };
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal("window", globalThis);
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("long press to flag", () => {
  it("fires on a held touch and suppresses the tap on release", () => {
    const { fire, onLongPress, onTap } = harness();
    fire("pointerdown", { clientX: 50, clientY: 50 });
    expect(onLongPress).not.toHaveBeenCalled();

    vi.advanceTimersByTime(400);
    expect(onLongPress).toHaveBeenCalledWith("cell-a");

    fire("pointerup", { clientX: 50, clientY: 50 });
    expect(onTap).not.toHaveBeenCalled();
  });

  it("does not arm for a mouse press — desktop flags by right click", () => {
    const { fire, onLongPress, onTap } = harness();
    fire("pointerdown", { clientX: 50, clientY: 50, pointerType: "mouse" });
    vi.advanceTimersByTime(1000);
    expect(onLongPress).not.toHaveBeenCalled();

    fire("pointerup", { clientX: 50, clientY: 50, pointerType: "mouse" });
    expect(onTap).toHaveBeenCalledWith("cell-a");
  });

  it("does not arm where the press picked no cell", () => {
    const { fire, onLongPress } = harness({ pick: () => null });
    fire("pointerdown", { clientX: 50, clientY: 50 });
    vi.advanceTimersByTime(400);
    expect(onLongPress).not.toHaveBeenCalled();
  });

  // The iOS bug this whole change is about: WebKit fires pointercancel the
  // moment a platform gesture recogniser claims the touch, which used to take
  // the pending flag with it. A cancel is the browser withdrawing the gesture,
  // not the player changing their mind.
  it("survives a pointercancel mid-hold", () => {
    const { fire, onLongPress, onTap } = harness();
    fire("pointerdown", { clientX: 50, clientY: 50 });
    vi.advanceTimersByTime(100);
    fire("pointercancel", {});
    vi.advanceTimersByTime(400);
    expect(onLongPress).toHaveBeenCalledWith("cell-a");
    expect(onTap).not.toHaveBeenCalled();
  });

  it("does not leave a cancelled hold pending into the next press", () => {
    const { fire, onLongPress } = harness();
    fire("pointerdown", { clientX: 50, clientY: 50 });
    vi.advanceTimersByTime(100);
    fire("pointercancel", {});
    // A fresh press within the old timer's window must not inherit it.
    fire("pointerdown", { clientX: 90, clientY: 90 });
    vi.advanceTimersByTime(400);
    expect(onLongPress).toHaveBeenCalledTimes(1);
  });

  it("tolerates drift inside the touch slop", () => {
    const { fire, onLongPress } = harness();
    fire("pointerdown", { clientX: 50, clientY: 50 });
    // Past MOVE_THRESHOLD (so no tap) but inside TOUCH_SLOP: on a flat board
    // that drift starts no other gesture, so the hold stands.
    fire("pointermove", { clientX: 60, clientY: 50 });
    vi.advanceTimersByTime(400);
    expect(onLongPress).toHaveBeenCalledWith("cell-a");
  });

  it("is abandoned once the drift leaves the touch slop", () => {
    const { fire, onLongPress, onTap } = harness();
    fire("pointerdown", { clientX: 50, clientY: 50 });
    fire("pointermove", { clientX: 90, clientY: 50 });
    vi.advanceTimersByTime(400);
    expect(onLongPress).not.toHaveBeenCalled();
    fire("pointerup", { clientX: 90, clientY: 50 });
    expect(onTap).not.toHaveBeenCalled();
  });

  it("is abandoned the moment a rotation drag starts", () => {
    const { fire, onLongPress, onRotate } = harness({ rotates: () => true });
    fire("pointerdown", { clientX: 50, clientY: 50 });
    fire("pointermove", { clientX: 60, clientY: 50 }); // inside the slop
    vi.advanceTimersByTime(400);
    expect(onLongPress).not.toHaveBeenCalled();
    expect(onRotate).toHaveBeenCalled();
  });

  it("is abandoned by a second finger starting a pinch", () => {
    const { fire, onLongPress } = harness();
    fire("pointerdown", { clientX: 50, clientY: 50, pointerId: 1 });
    fire("pointerdown", { clientX: 90, clientY: 90, pointerId: 2 });
    vi.advanceTimersByTime(400);
    expect(onLongPress).not.toHaveBeenCalled();
  });

  it("is dropped on teardown", () => {
    const { fire, detach, onLongPress } = harness();
    fire("pointerdown", { clientX: 50, clientY: 50 });
    detach();
    vi.advanceTimersByTime(400);
    expect(onLongPress).not.toHaveBeenCalled();
  });
});

describe("claiming the touch", () => {
  // Second layer under `touch-action: none`: it is what keeps WebKit's own
  // selection/callout recognisers from engaging mid-hold.
  it("preventDefaults a touch press but leaves a mouse press alone", () => {
    const { fire } = harness();
    const touch = vi.fn();
    fire("pointerdown", { clientX: 50, clientY: 50, preventDefault: touch });
    expect(touch).toHaveBeenCalled();

    const mouse = vi.fn();
    fire("pointerup", { clientX: 50, clientY: 50 });
    fire("pointerdown", {
      clientX: 50,
      clientY: 50,
      pointerType: "mouse",
      preventDefault: mouse,
    });
    expect(mouse).not.toHaveBeenCalled();
  });
});

describe("tap", () => {
  it("fires on a still press released before the hold threshold", () => {
    const { fire, onTap } = harness();
    fire("pointerdown", { clientX: 50, clientY: 50 });
    vi.advanceTimersByTime(100);
    fire("pointerup", { clientX: 50, clientY: 50 });
    expect(onTap).toHaveBeenCalledWith("cell-a");
  });

  it("acts on the cell pressed, not the one under the release point", () => {
    let picked = "cell-a";
    const { fire, onTap } = harness({ pick: () => picked });
    fire("pointerdown", { clientX: 50, clientY: 50 });
    picked = "cell-b";
    fire("pointerup", { clientX: 52, clientY: 51 });
    expect(onTap).toHaveBeenCalledWith("cell-a");
  });
});
