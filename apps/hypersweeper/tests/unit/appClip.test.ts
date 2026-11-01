import { afterEach, describe, expect, it, vi } from "vitest";
import { clipBoard, tellClip } from "../../src/appClip";

// The App Clip's native side names its board on `window.hypersweeperClip`
// (apps/hypersweeper/ios/App/AppClip/ClipBridgeViewController.swift), and the page tells it about
// wins through a `hypersweeperClip` message handler. Both halves are read off
// the ambient `window`, stubbed here.

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("clipBoard", () => {
  it("is null outside a clip", () => {
    vi.stubGlobal("window", {});
    expect(clipBoard()).toBeNull();
  });

  it("names the board the clip was built for", () => {
    vi.stubGlobal("window", { hypersweeperClip: "c180" });
    expect(clipBoard()).toBe("c180");
  });

  it("ignores a board this build does not have, or a value that is not one", () => {
    for (const value of ["no-such-board", "toString", "", 42, null, {}]) {
      vi.stubGlobal("window", { hypersweeperClip: value });
      expect(clipBoard()).toBeNull();
    }
  });
});

describe("tellClip", () => {
  it("posts to the clip's message handler", () => {
    const postMessage = vi.fn();
    vi.stubGlobal("window", { webkit: { messageHandlers: { hypersweeperClip: { postMessage } } } });
    tellClip("won");
    tellClip("started");
    expect(postMessage.mock.calls).toEqual([["won"], ["started"]]);
  });

  it("does nothing, and never throws, without one", () => {
    vi.stubGlobal("window", {});
    expect(() => tellClip("won")).not.toThrow();
    const postMessage = vi.fn(() => {
      throw new Error("gone");
    });
    vi.stubGlobal("window", { webkit: { messageHandlers: { hypersweeperClip: { postMessage } } } });
    expect(() => tellClip("won")).not.toThrow();
  });
});
