import { Capacitor } from "@capacitor/core";
import { Haptics, ImpactStyle, NotificationType } from "@capacitor/haptics";

// Tactile feedback, the mechanism. A game names its own events and the feel of
// each (Hypersweeper's apps/hypersweeper/src/haptics.ts, Rep-tiles'
// apps/reptiles/src/haptics.ts); this decides whether anything can be felt and
// drives it. The mechanism is chosen at call time by feature detection,
// because the platforms disagree on what is available:
//
//   - A game's iOS app on an iPhone (a Capacitor WKWebView; the same app on an
//     iPad or a Mac has no engine, see `hasTapticEngine`): the Taptic Engine
//     through @capacitor/haptics — a real impact of a chosen weight, or one of
//     the system's own notification patterns. This is the only branch that
//     reaches Core Haptics, and it is the reason the native apps exist: no web
//     API on iOS can ask for a buzz of a chosen weight.
//   - A mobile browser with the Vibration API (Android/Chrome and friends):
//     navigator.vibrate takes a pattern, so each event still gets real,
//     distinct feedback.
//   - Everywhere else — iOS Safari, and every desktop browser — there is
//     nothing to feel, so there is nothing to do. iOS Safari does not implement
//     navigator.vibrate at all; the hidden `<input type="checkbox" switch>`
//     trick that once stood in for it is gone, because in practice it does not
//     buzz. Desktop Chrome *defines* navigator.vibrate on a machine with
//     nothing to shake, so the mechanism check below is not the API's presence
//     alone — a promise the hardware cannot keep is worse than no switch at
//     all, and `hapticsSupported()` is what hides a game's settings row.
//
// All global access is guarded so importing this module under the node unit
// test environment (no window/navigator/document) is safe. The two Capacitor
// imports are safe there and in the browser too: `isNativePlatform()` is false
// outside the native shell, and the Haptics plugin loads its web
// implementation lazily — a browser that never takes the native branch never
// fetches it.

/** How firm a single Taptic tap is. */
export type ImpactWeight = "light" | "medium" | "heavy";

/** One of the system's own notification patterns: `error` is the sharp double
 * buzz iOS plays to say *that went wrong*. */
export type NotificationKind = "success" | "warning" | "error";

/** What one game event feels like: on the Taptic Engine, an impact or a
 * notification; through the Vibration API, a pattern of on/off milliseconds. */
export interface HapticSpec {
  native: { impact: ImpactWeight } | { notification: NotificationKind };
  vibrate: number | number[];
}

const IMPACT_STYLES: Record<ImpactWeight, ImpactStyle> = {
  light: ImpactStyle.Light,
  medium: ImpactStyle.Medium,
  heavy: ImpactStyle.Heavy,
};

const NOTIFICATION_TYPES: Record<NotificationKind, NotificationType> = {
  success: NotificationType.Success,
  warning: NotificationType.Warning,
  error: NotificationType.Error,
};

/** Whether the player wants any of this (a game's Settings › Haptics). Read on
 * every event, like the sound preset, so a change applies to the move already
 * in play. */
let enabled = true;

/** Turn tactile feedback on or off. Validated by the caller — a plain boolean
 * preference. */
export function setHapticsEnabled(on: boolean): void {
  enabled = on;
}

/** Whether the player left it on — what the settings switch shows. */
export function hapticsEnabled(): boolean {
  return enabled;
}

/** Inside a native shell? The bridge is absent under node (and in a plain
 * browser tab), where the shim answers false. */
export function isNative(): boolean {
  try {
    return Capacitor.isNativePlatform();
  } catch {
    return false;
  }
}

function canVibrate(): boolean {
  return typeof navigator !== "undefined" && typeof navigator.vibrate === "function";
}

/** A browser on a phone or tablet — the only kind whose `navigator.vibrate`
 * reaches hardware. Chrome defines the API on a desktop with nothing to shake,
 * so the API's presence alone says nothing; the form factor is what does. The
 * UA-Client-Hints `mobile` flag answers it exactly where it exists (Chromium,
 * which is also where the Vibration API lives), and the user-agent string is
 * the fallback for everything else. */
function isMobileBrowser(): boolean {
  if (typeof navigator === "undefined") return false;
  const hints = (navigator as Navigator & { userAgentData?: { mobile?: boolean } }).userAgentData;
  if (typeof hints?.mobile === "boolean") return hints.mobile;
  return /Android|Mobile|iPhone|iPad|iPod/i.test(navigator.userAgent ?? "");
}

/** Where a game reads what its shell says it runs on: `"phone"`, `"pad"` or
 * `"mac"`. Each game's `BridgeViewController.swift` sets a global of its own
 * before any script runs (`window.hypersweeperDevice`,
 * `window.reptilesDevice`), because the page cannot tell an iPad or the Mac
 * app from the user agent — both report a Mac. */
let readDevice: () => string | undefined = () => undefined;

/** Tell this module where the game's shell names the device. Called once, by
 * the game's own haptics module, when it loads. */
export function setDeviceReader(read: () => string | undefined): void {
  readDevice = read;
}

/** Inside the native shell, whether this device has a Taptic Engine. Only an
 * iPhone does: the same app runs on an iPad and, through Mac Catalyst, on a
 * Mac, where the Haptics plugin resolves and nothing is felt. If the shell
 * does not say, it predates the flag, and the old answer (every native device
 * buzzes) stands. */
function hasTapticEngine(): boolean {
  let device: string | undefined;
  try {
    device = readDevice();
  } catch {
    device = undefined;
  }
  return device === undefined || device === "phone";
}

/** Whether this device has a haptic mechanism that actually buzzes — what
 * decides whether a settings page offers the row at all.
 *
 * Two things qualify: a native shell on an iPhone (the Taptic Engine), and a
 * *mobile* browser with the Vibration API, which in practice means Android.
 * Everything else gets no row: the native app on an iPad or a Mac, which have
 * no engine; a desktop browser, whose `navigator.vibrate` is a no-op; and iOS
 * Safari, where the web platform offers no haptic at all. */
export function hapticsSupported(): boolean {
  return isNative() ? hasTapticEngine() : canVibrate() && isMobileBrowser();
}

/** The Taptic Engine, through the native bridge. Fire and forget: feedback
 * that fails (Low Power Mode, an older device, a simulator with no engine at
 * all) must never break the move that asked for it. */
function nativeHaptic(spec: HapticSpec["native"]): void {
  const call =
    "impact" in spec
      ? Haptics.impact({ style: IMPACT_STYLES[spec.impact] })
      : Haptics.notification({ type: NOTIFICATION_TYPES[spec.notification] });
  void Promise.resolve(call).catch(() => {});
}

/** Play one event's feel, if the player left haptics on and the platform can.
 *
 * The support check gates the *call*, not just the settings row: a player who
 * left the switch on before moving to a device that cannot buzz (or whose
 * stored record came from one) must not drive a mechanism that does nothing. */
export function playHaptic(spec: HapticSpec): void {
  if (!enabled || !hapticsSupported()) return;
  if (isNative()) {
    nativeHaptic(spec.native);
    return;
  }
  navigator.vibrate(spec.vibrate);
}
