import { hasMode } from "./boards/presets";

// The App Clip (ios/App/AppClip): the same bundle, run by a second native
// target that opens one board and nothing else. The page cannot tell it is in
// a clip — the clip's `ClipBridgeViewController` says so, the way the app says
// which device it is on (`hypersweeperDevice`), by setting
// `window.hypersweeperClip` to the board to open before any script runs. That
// keeps `VITE_PACKAGED` the only build flag: the shell provides the
// difference, and one bundle serves the app and the clip.
//
// In a clip the game is that board and only it: no menu, no way home, no die
// for another board, no achievements, no best times and no win card — the
// smiley plays it again. Finishing is the moment the clip offers the full game,
// which the native side does (an `SKOverlay`) when the page tells it a board
// was won.

interface ClipWindow {
  hypersweeperClip?: unknown;
  webkit?: {
    messageHandlers?: Record<string, { postMessage(message: unknown): void } | undefined>;
  };
}

/** The board this App Clip plays, or `null` outside a clip. A value naming a
 * board this build does not have is treated as no clip at all, so a stale
 * native target opens the menu rather than a broken game. */
export function clipBoard(): string | null {
  const value = (window as ClipWindow).hypersweeperClip;
  return typeof value === "string" && hasMode(value) ? value : null;
}

/** Tell the clip's native side what just happened to the board, so it can
 * offer the full game when one is won and put the offer away when the next one
 * starts (ClipBridgeViewController.swift). A no-op anywhere but the clip. */
export function tellClip(event: "won" | "started"): void {
  try {
    (window as ClipWindow).webkit?.messageHandlers?.["hypersweeperClip"]?.postMessage(event);
  } catch {
    /* the native side is a convenience; the game never depends on it */
  }
}
