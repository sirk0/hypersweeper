import { Capacitor, registerPlugin } from "@capacitor/core";
import { readObject, storage } from "@tiling/platform";

// The App Store's rating prompt, asked once: after the player's Nth win.
//
// Only a game's App Store app asks. What decides it is the shell: the app
// registers a native `Review` plugin (each game's
// `ios/App/App/ReviewPlugin.swift`, StoreKit's `requestReview`) and the page
// checks for it. Hypersweeper's App Clip does not register it — it is not on
// the store to be rated — and the website, the PWA and the Electron app have
// no plugin at all, so nothing here counts or calls there.
//
// The page keeps the count; StoreKit decides whether a sheet actually shows.
// It shows one at most three times a year and never in TestFlight, so asking
// once, at a natural pause — a win just landed — is all the page has to do.
// The count stops at the threshold, so the ask is made once per install.

interface ReviewPlugin {
  request(): Promise<void>;
}

/** The plugin's JS half, registered on first use rather than at import, so a
 * game that imports this package for its haptics alone registers nothing. */
let plugin: ReviewPlugin | undefined;
function native(): ReviewPlugin {
  return (plugin ??= registerPlugin<ReviewPlugin>("Review"));
}

/** Whether this shell can ask for a rating — an App Store app, not a clip. */
export function reviewSupported(): boolean {
  try {
    return Capacitor.isNativePlatform() && Capacitor.isPluginAvailable("Review");
  } catch {
    return false;
  }
}

export interface ReviewPrompt {
  /** The win the prompt follows. */
  readonly afterWins: number;
  /** The wins counted so far. Anything unreadable counts as none. */
  wins(): number;
  /** Count a win. True exactly on the win that reaches `afterWins`; past it
   * nothing more is counted, so it is never true again. */
  countWin(): boolean;
  /** A win was filed: count it, and on the Nth ask StoreKit for the rating
   * prompt, `delayMs` later. A no-op outside an App Store app. */
  noteWin(delayMs?: number): void;
}

/** The prompt for one game: its count is kept at `key` in `localStorage` as
 * `{ wins }`. */
export function reviewPrompt(options: { key: string; afterWins: number }): ReviewPrompt {
  const { key, afterWins } = options;
  const wins = (): number => {
    const n = readObject(key)?.wins;
    return typeof n === "number" && Number.isInteger(n) && n >= 0 ? n : 0;
  };
  const countWin = (): boolean => {
    const before = wins();
    if (before >= afterWins) return false;
    const next = before + 1;
    try {
      storage()?.setItem(key, JSON.stringify({ wins: next }));
    } catch {
      // Storage full or blocked: the next win counts this one again.
    }
    return next === afterWins;
  };
  const noteWin = (delayMs = 0): void => {
    if (!reviewSupported() || !countWin()) return;
    const ask = (): void => {
      void native()
        .request()
        .catch(() => {});
    };
    if (delayMs > 0) window.setTimeout(ask, delayMs);
    else ask();
  };
  return { afterWins, wins, countWin, noteWin };
}
