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
//   - Android/Chrome (and anything else with the Vibration API): navigator
//     .vibrate takes a pattern, so we get real, distinct feedback per event.
//   - iOS Safari — including a standalone/home-screen PWA — does NOT implement
//     navigator.vibrate at all (it's undefined). The only web haptic that
//     reaches iOS 17.4+ is the "switch" trick: toggling a hidden
//     <input type="checkbox" switch> plays a light system tick. It's one fixed
//     intensity, so the heavier events just repeat it to feel stronger.
//   - Desktop and headless test browsers: navigator.vibrate is typically a
//     no-op function, so they take the vibration branch and do nothing visible
//     — harmless, and it keeps the test seam (window.__ms) side-effect-free.
//
// All global access is guarded so importing this module under the node unit
// test environment (no window/navigator/document) is safe, and the hidden
// switch element is created lazily on first use rather than at import time.
// The two Capacitor imports are safe there and in the browser too:
// `isNativePlatform()` is false outside the native shell, and the Haptics
// plugin loads its web implementation lazily — a browser that never takes the
// native branch never fetches it.
//
// This is the single seam for haptics, as `sound.ts` is for the game's voice:
// the call sites (session.ts) name events, never patterns.

export type HapticKind = "flag" | "lose" | "win";

// Vibration patterns (ms). A single short pulse for a flag; a heavier
// buzz-buzz-BUZZ for a loss; a lighter, rising flourish for a win.
const PATTERNS: Record<HapticKind, number | number[]> = {
  flag: 15,
  lose: [40, 30, 40, 30, 80],
  win: [20, 40, 20, 40, 60],
};

// How many iOS ticks stand in for each pattern (see iosTick below) — the
// single fixed-intensity tick can only convey weight by repetition.
const IOS_TICKS: Record<HapticKind, number> = { flag: 1, lose: 3, win: 3 };

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

/** Whether this device has *any* haptic mechanism — what decides whether the
 * settings page offers the row at all, since a switch for feedback the hardware
 * cannot give is a promise the app can't keep. Chrome defines
 * `navigator.vibrate` even on a desktop with nothing to shake and nothing in
 * the web platform distinguishes that, so it counts as supported here; what the
 * check really rules out is a browser with no mechanism at all. */
export function hapticsSupported(): boolean {
  if (isNative() || canVibrate()) return true;
  // iOS Safari's hidden switch is the one remaining mechanism, and iOS the one
  // place it does anything.
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent ?? "";
  if (/iPhone|iPad|iPod/.test(ua)) return true;
  // iPadOS reports itself as a Mac; a touch-capable "Mac" is an iPad.
  return /Macintosh/.test(ua) && (navigator.maxTouchPoints ?? 0) > 1;
}

let iosSwitch: HTMLLabelElement | null = null;

// Lazily build the hidden <label><input type="checkbox" switch></label>. iOS
// plays a haptic tick when a switch-styled checkbox is toggled by a click, so
// clicking the label is how we ask for feedback on iOS.
function iosSwitchElement(): HTMLLabelElement | null {
  if (typeof document === "undefined") return null;
  if (iosSwitch) return iosSwitch;
  const label = document.createElement("label");
  label.setAttribute("aria-hidden", "true");
  Object.assign(label.style, {
    position: "absolute",
    width: "1px",
    height: "1px",
    overflow: "hidden",
    opacity: "0",
    pointerEvents: "none",
  });
  const input = document.createElement("input");
  input.type = "checkbox";
  input.setAttribute("switch", ""); // Safari-only switch appearance -> haptic
  label.appendChild(input);
  document.body.appendChild(label);
  iosSwitch = label;
  return label;
}

function iosTick(): void {
  iosSwitchElement()?.click();
}

/** The Taptic Engine, through the native bridge. A flag is a light impact; the
 * two endings are the system's own notification patterns — `Error` is the sharp
 * double buzz iOS plays to say *that went wrong*, which is what stepping on a
 * mine is. Fire and forget: feedback that fails (Low Power Mode, an older
 * device, a simulator with no engine at all) must never break the move that
 * asked for it. */
function nativeHaptic(kind: HapticKind): void {
  const call =
    kind === "flag"
      ? Haptics.impact({ style: ImpactStyle.Light })
      : Haptics.notification({
          type: kind === "lose" ? NotificationType.Error : NotificationType.Success,
        });
  void Promise.resolve(call).catch(() => {});
}

/** Fire tactile feedback for a game event, if the player left it on and the
 * platform supports it. */
export function haptic(kind: HapticKind): void {
  if (!enabled) return;
  if (isNative()) {
    nativeHaptic(kind);
    return;
  }
  if (canVibrate()) {
    navigator.vibrate(PATTERNS[kind]);
    return;
  }
  // iOS fallback: one fixed light tick, repeated for the heavier events so a
  // win or a loss reads as more than a flag placement.
  iosTick();
  if (typeof setTimeout !== "function") return;
  for (let i = 1; i < IOS_TICKS[kind]; i++) setTimeout(iosTick, i * 90);
}
