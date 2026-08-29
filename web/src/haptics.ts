import { Capacitor } from "@capacitor/core";
import { Haptics, ImpactStyle, NotificationType } from "@capacitor/haptics";

// Tactile feedback for game events. Three moments buzz: placing a flag (a light
// tick), losing (a stronger pattern) and winning (a rising flourish). The
// mechanism is chosen at call time by feature detection, because the platforms
// disagree on what's available:
//
//   - The iOS app (`ios/`, a Capacitor WKWebView): the Taptic Engine through
//     @capacitor/haptics — a real light impact for a flag, and the system's own
//     error/success notification patterns for a loss and a win. This is the
//     only branch that reaches Core Haptics, and it is the reason the native
//     app exists: no web API on iOS can ask for a buzz of a chosen weight.
//   - A mobile browser with the Vibration API (Android/Chrome and friends):
//     navigator.vibrate takes a pattern, so we get real, distinct feedback per
//     event.
//   - Everywhere else — iOS Safari, and every desktop browser — there is
//     nothing to feel, so there is nothing to do. iOS Safari does not implement
//     navigator.vibrate at all; the hidden `<input type="checkbox" switch>`
//     trick that once stood in for it is gone, because in practice it does not
//     buzz. Desktop Chrome *defines* navigator.vibrate on a machine with
//     nothing to shake, so the mechanism check below is not the API's presence
//     alone — a promise the hardware cannot keep is worse than no switch at
//     all, and `hapticsSupported()` is what hides the settings row.
//
// All global access is guarded so importing this module under the node unit
// test environment (no window/navigator/document) is safe.
// The two Capacitor imports are safe there and in the browser too:
// `isNativePlatform()` is false outside the native shell, and the Haptics
// plugin loads its web implementation lazily — a browser that never takes the
// native branch never fetches it.
//
// This is the single seam for haptics, as `sound.ts` is for the game's voice:
// the call sites (session.ts for the moves, main.ts for an achievement) name
// events, never patterns.

export type HapticKind = "flag" | "lose" | "win" | "unlock";

// Vibration patterns (ms). A single short pulse for a flag; a heavier
// buzz-buzz-BUZZ for a loss; a lighter, rising flourish for a win; and a short
// rising triple for an achievement, which lands *beside* the win's flourish and
// has to be distinguishable from it rather than merely different.
const PATTERNS: Record<HapticKind, number | number[]> = {
  flag: 15,
  lose: [40, 30, 40, 30, 80],
  win: [20, 40, 20, 40, 60],
  unlock: [15, 30, 45],
};

/** The kinds the Taptic Engine answers with a single tap rather than one of its
 * notification patterns, and how firm each is. Everything not here is a
 * notification (see `nativeHaptic`). */
const IMPACTS: Partial<Record<HapticKind, ImpactStyle>> = {
  flag: ImpactStyle.Light,
  unlock: ImpactStyle.Medium,
};

/** Whether the player wants any of this (Settings › Haptics). Read on every
 * event, like the sound preset, so a change applies to the board already in
 * play rather than to the next one. */
let enabled = true;

/** Turn tactile feedback on or off. Validated by the caller — this is a plain
 * boolean preference, unlike the sound preset's key. */
export function setHapticsEnabled(on: boolean): void {
  enabled = on;
}

/** Whether anything would be felt — what the settings switch shows. */
export function hapticsEnabled(): boolean {
  return enabled;
}

/** Inside the native shell? The bridge is absent under node (and in a plain
 * browser tab), where the shim answers false. */
function isNative(): boolean {
  try {
    return Capacitor.isNativePlatform();
  } catch {
    return false;
  }
}

function canVibrate(): boolean {
  return (
    typeof navigator !== "undefined" && typeof navigator.vibrate === "function"
  );
}

/** A browser on a phone or tablet — the only kind whose `navigator.vibrate`
 * reaches hardware. Chrome defines the API on a desktop with nothing to shake,
 * so the API's presence alone says nothing; the form factor is what does. The
 * UA-Client-Hints `mobile` flag answers it exactly where it exists (Chromium,
 * which is also where the Vibration API lives), and the user-agent string is
 * the fallback for everything else. */
function isMobileBrowser(): boolean {
  if (typeof navigator === "undefined") return false;
  const hints = (navigator as Navigator & { userAgentData?: { mobile?: boolean } })
    .userAgentData;
  if (typeof hints?.mobile === "boolean") return hints.mobile;
  return /Android|Mobile|iPhone|iPad|iPod/i.test(navigator.userAgent ?? "");
}

/** Whether this device has a haptic mechanism that actually buzzes — what
 * decides whether the settings page offers the row at all, since a switch for
 * feedback the hardware cannot give is a promise the app can't keep.
 *
 * Two things qualify: the native shell (the Taptic Engine), and a *mobile*
 * browser with the Vibration API, which in practice means Android. Everything
 * else gets no row — a desktop browser because its `navigator.vibrate` is a
 * no-op, and iOS Safari because the web platform offers it no haptic at all. */
export function hapticsSupported(): boolean {
  return isNative() || (canVibrate() && isMobileBrowser());
}

/** The Taptic Engine, through the native bridge. The two *impacts* are single
 * taps — a flag light, an unlock firmer, since an unlock is the bigger of the
 * two events and arrives alongside the win's own buzz. The two endings are the
 * system's own notification patterns: `Error` is the sharp double buzz iOS
 * plays to say *that went wrong*, which is what stepping on a mine is.
 *
 * A table rather than a chain of ternaries — with four kinds and two APIs the
 * chain stopped saying which was which. Fire and forget: feedback that fails
 * (Low Power Mode, an older device, a simulator with no engine at all) must
 * never break the move that asked for it. */
function nativeHaptic(kind: HapticKind): void {
  const style = IMPACTS[kind];
  const call =
    style !== undefined
      ? Haptics.impact({ style })
      : Haptics.notification({
          type: kind === "lose" ? NotificationType.Error : NotificationType.Success,
        });
  void Promise.resolve(call).catch(() => {});
}

/** Fire tactile feedback for a game event, if the player left it on and the
 * platform supports it. */
export function haptic(kind: HapticKind): void {
  // The support check gates the *call*, not just the settings row: a player who
  // left the switch on before moving to a device that cannot buzz (or whose
  // stored record came from one) must not drive a mechanism that does nothing.
  if (!enabled || !hapticsSupported()) return;
  if (isNative()) {
    nativeHaptic(kind);
    return;
  }
  navigator.vibrate(PATTERNS[kind]);
}
