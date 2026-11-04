import { Capacitor, registerPlugin } from "@capacitor/core";
import { readObject, storage } from "@tiling/platform";

// The App Store's rating prompt, asked once: after the player's third win.
//
// Only the App Store app asks. What decides it is the shell, as for Game
// Center (gameCenter.ts): the app registers a native `Review` plugin
// (apps/hypersweeper/ios/App/App/ReviewPlugin.swift) and the page checks for
// it. The App Clip does not register it — it is not on the store to be rated —
// and the website, the PWA and the Electron app have no plugin at all, so
// nothing here counts or calls there.
//
// The page keeps the count; StoreKit decides whether a sheet actually shows.
// It shows one at most three times a year and never in TestFlight, so asking
// once, at a natural pause — a win just landed — is all the page has to do.
// The count stops at the threshold, so the ask is made once per install.

/** The win the prompt follows. */
export const REVIEW_AFTER_WINS = 3;

const KEY = "ms:review";

interface ReviewPlugin {
  request(): Promise<void>;
}

const Native = registerPlugin<ReviewPlugin>("Review");

/** Whether this shell can ask for a rating — the App Store app, not the clip. */
export function reviewSupported(): boolean {
  try {
    return Capacitor.isNativePlatform() && Capacitor.isPluginAvailable("Review");
  } catch {
    return false;
  }
}

/** The wins counted so far. Anything unreadable counts as none. */
export function reviewWins(): number {
  const wins = readObject(KEY)?.wins;
  return typeof wins === "number" && Number.isInteger(wins) && wins >= 0 ? wins : 0;
}

/** Count a win. True exactly on the win that reaches `REVIEW_AFTER_WINS`;
 * past it nothing more is counted, so it is never true again. */
export function countWinForReview(): boolean {
  const wins = reviewWins();
  if (wins >= REVIEW_AFTER_WINS) return false;
  const next = wins + 1;
  try {
    storage()?.setItem(KEY, JSON.stringify({ wins: next }));
  } catch {
    // Storage full or blocked: the next win counts this one again.
  }
  return next === REVIEW_AFTER_WINS;
}

/** A win was filed (main.ts's `countWin`): count it, and on the third ask
 * StoreKit for the rating prompt, `delayMs` later — the beat the win card
 * opens on, after the win has played. A no-op outside the App Store app. */
export function noteWinForReview(delayMs = 0): void {
  if (!reviewSupported() || !countWinForReview()) return;
  const ask = (): void => {
    void Native.request().catch(() => {});
  };
  if (delayMs > 0) window.setTimeout(ask, delayMs);
  else ask();
}
