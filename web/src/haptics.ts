// Tactile feedback for game events. Three moments buzz: placing a flag (a light
// tick), losing (a stronger pattern) and winning (a rising flourish). The
// mechanism is chosen at call time by feature detection, because the platforms
// disagree on what's available:
//
//   - Android/Chrome (and anything else with the Vibration API): navigator
//     .vibrate takes a pattern, so we get real, distinct feedback per event.
//   - iOS 17.4 - 26.4: every browser there is WKWebView, so this is Safari,
//     Chrome and the standalone/home-screen PWA alike, and none of them
//     implement navigator.vibrate (WebKit has never shipped the Vibration API
//     and opposes it). The only web haptic that ever reached them is the
//     "switch" trick: activating a hidden <input type="checkbox" switch> plays
//     a light system tick. It's one fixed intensity, so the heavier events
//     just repeat it to feel stronger. Two things it is fussy about, both
//     learned the hard way: the tick comes from the *switch's* activation
//     behaviour, so click the input rather than relying on a <label> to
//     forward a synthetic click; and an element created and clicked in the
//     same task has not been laid out yet and plays nothing, so
//     primeHaptics() builds it in advance.
//   - iOS 26.5 and later: nothing. The trick was never an API — it was an
//     undocumented side effect, and Apple closed it in 26.5. A *script*-driven
//     activation of the switch no longer ticks; only a real finger landing
//     directly on a real switch control does. That leaves no path to haptics
//     for this app on current iOS, because every event that buzzes here is a
//     consequence of game state rather than a tap on a control: the flag
//     lands mid-hold with the finger still down and nothing lifted, and lose
//     and win are decided after the fact by the board. The overlay workaround
//     going around (an invisible switch stretched over a button, so the tap
//     hits the control itself) cannot express any of those — the board is one
//     WebGL canvas with no per-cell DOM, and a tick on every tap regardless
//     of what the move did would be worse than silence.
//     The code below is left in place for 17.4-26.4, which is still a large
//     installed base. Do not spend another afternoon on the 26.5+ case: the
//     answer there is a native shell (see the seam note at the bottom).
//   - Desktop and headless test browsers: navigator.vibrate is typically a
//     no-op function, so they take the first branch and do nothing visible —
//     harmless, and it keeps the test seam (window.__ms) side-effect-free.
//
// All global access is guarded so importing this module under the node unit
// test environment (no window/navigator/document) is safe, and the hidden
// switch element is created lazily on first use rather than at import time.
//
// This is the single seam for haptics: if the app is later packaged natively
// (e.g. a Capacitor WKWebView with @capacitor/haptics, or Core Haptics), swap
// the implementation here and the call sites in session.ts stay unchanged.

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

function canVibrate(): boolean {
  return (
    typeof navigator !== "undefined" && typeof navigator.vibrate === "function"
  );
}

let iosSwitch: HTMLInputElement | null = null;

// Build the hidden <label><input type="checkbox" switch></label> and return the
// input — iOS plays a haptic tick when a switch-styled checkbox is toggled, and
// toggling it is how we ask for feedback there. Kept rendered (transparent and
// 1px, never display:none) and clicked directly rather than through the label.
function iosSwitchElement(): HTMLInputElement | null {
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
  });
  const input = document.createElement("input");
  input.type = "checkbox";
  input.setAttribute("switch", ""); // Safari-only switch appearance -> haptic
  label.appendChild(input);
  document.body.appendChild(label);
  iosSwitch = input;
  return input;
}

function iosTick(): void {
  iosSwitchElement()?.click();
}

/** Build the iOS tick element ahead of the first time it is needed, without
 * firing it. An element inserted and activated in the same task has not been
 * laid out and plays no haptic, which is why the first buzz of a session used
 * to be the one that went missing. Call once from a real user gesture. */
export function primeHaptics(): void {
  if (canVibrate()) return;
  iosSwitchElement();
}

/** Fire tactile feedback for a game event, if the platform supports it. */
export function haptic(kind: HapticKind): void {
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
