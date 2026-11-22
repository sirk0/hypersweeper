import { reviewPrompt, reviewSupported } from "@tiling/native";

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
// The counting and the asking are `@tiling/native`'s (packages/native/src/review.ts),
// shared with Rep-tiles; this is Hypersweeper's key and threshold.

/** The win the prompt follows. */
export const REVIEW_AFTER_WINS = 3;

const prompt = reviewPrompt({ key: "ms:review", afterWins: REVIEW_AFTER_WINS });

/** Whether this shell can ask for a rating — the App Store app, not the clip. */
export { reviewSupported };

/** The wins counted so far. Anything unreadable counts as none. */
export function reviewWins(): number {
  return prompt.wins();
}

/** Count a win. True exactly on the win that reaches `REVIEW_AFTER_WINS`;
 * past it nothing more is counted, so it is never true again. */
export function countWinForReview(): boolean {
  return prompt.countWin();
}

/** A win was filed (main.ts's `countWin`): count it, and on the third ask
 * StoreKit for the rating prompt, `delayMs` later — the beat the win card
 * opens on, after the win has played. A no-op outside the App Store app. */
export function noteWinForReview(delayMs = 0): void {
  prompt.noteWin(delayMs);
}
