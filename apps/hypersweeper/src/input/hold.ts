// How long a press has to be held before it plants a flag — the one gesture
// timing the player can set (Settings › Behaviour › Hold to flag).
//
// It is a setting rather than a constant because the right number is a fact
// about the hand, not about the game: a player who flags a lot wants the flag
// the moment they commit, and one who scrolls and rotates a lot wants room to
// start a drag before the press turns into something else. The shipped default
// is deliberately brisk — 300 ms, against the 450 ms this was fixed at — since
// the gesture is *held*, so the time is dead time and it is felt on every flag
// of every board.
//
// The number is also how long the flag then takes to *land*: a flag placed by
// holding is the one the player cannot see (their finger is over the cell), so
// it drops in from outside the fingertip (`render/animations.ts`), and a drop
// that outlasts the press it answers reads as lag. So the whole gesture — press,
// hold, flag — is over in twice the setting, at every point on the slider.
//
// The rules live here rather than in `controls.ts` so that `settings.ts` (which
// validates the stored value) and `ui/settings.ts` (which draws the slider) can
// read them without importing the pointer machinery, which pulls in three.
//
// Global access is guarded so importing this under the node unit environment
// (no window, no navigator) is safe, as in `haptics.ts`.

/** The fastest hold the slider offers — a hair-trigger, and deliberately
 * reachable: a deliberate tap on a phone runs to about this long, so down here
 * the two gestures very nearly meet and an unhurried tap flags rather than
 * opens, which is exactly what a player who flags far more than they open may
 * want. */
export const HOLD_MS_MIN = 100;
/** The slowest. Past half a second the gesture stops reading as a press and
 * starts reading as one that did not work. */
export const HOLD_MS_MAX = 500;
/** The slider's step, and the granularity a stored value is snapped to. */
export const HOLD_MS_STEP = 50;
/** What a player who has never touched the setting gets. */
export const DEFAULT_HOLD_MS = 300;

/** A stored or typed-in duration brought onto the slider's own grid. Total, in
 * the way every reader in `settings.ts` is: anything that is not a finite
 * number (a string, a NaN, a record from a build without the field) comes back
 * as the default rather than arming a timer that never fires. */
export function clampHoldMs(ms: number): number {
  if (!Number.isFinite(ms)) return DEFAULT_HOLD_MS;
  const snapped = Math.round(ms / HOLD_MS_STEP) * HOLD_MS_STEP;
  return Math.min(HOLD_MS_MAX, Math.max(HOLD_MS_MIN, snapped));
}

/** The duration as the settings row reports it. Milliseconds rather than
 * seconds: every value on the slider is a two- or three-digit whole number
 * there, where in seconds they are all "0.something". */
export function holdLabel(ms: number): string {
  return `${clampHoldMs(ms)} ms`;
}

/** Whether a long press can happen on this device at all — the same principle
 * as `hapticsSupported()`, and what hides the settings row.
 *
 * `controls.ts` arms the hold timer for every pointer type *except* the mouse,
 * which flags by right-click instead, so the setting means something exactly
 * where there is a touch screen or a pen. `maxTouchPoints` is the direct
 * question; a coarse pointer is the fallback for the browsers that under-report
 * it. A hybrid laptop answers yes to one of them and gets the row, which is
 * right — it can long-press.
 */
export function longPressSupported(): boolean {
  if (typeof navigator !== "undefined" && (navigator.maxTouchPoints ?? 0) > 0) return true;
  if (typeof window === "undefined" || !window.matchMedia) return false;
  return window.matchMedia("(pointer: coarse)").matches;
}
