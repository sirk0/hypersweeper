import { reviewPrompt } from "@tiling/native";

// The App Store's rating prompt, asked once: after the third finished board.
// Only the App Store app asks — its shell registers the `Review` plugin
// (ios/App/App/ReviewPlugin.swift); everywhere else nothing is counted. The
// counting and the asking are `@tiling/native`'s, shared with Hypersweeper;
// StoreKit decides whether a sheet actually shows.

/** The finish the prompt follows. */
export const REVIEW_AFTER_WINS = 3;

const prompt = reviewPrompt({ key: "rep-tiles.review", afterWins: REVIEW_AFTER_WINS });

/** How long after the finish to ask: the flourish plays and the win panel is
 * read first. */
const ASK_AFTER_MS = 1500;

/** A board was finished: count it, and on the third ask for a rating. */
export function noteFinishForReview(): void {
  prompt.noteWin(ASK_AFTER_MS);
}
