// What kind of thing the game is being played on, coarsely enough that the
// answer is not an identifier. Two values, four and two wide, reported with
// every game event — see docs/agents/metrics.md for what they are for and the
// line they must not cross.
//
// Nothing here reads the user-agent *string* except as a last resort, and
// nothing here reports a measurement: no screen size, no pixel ratio, no
// language, no timezone. A phone and a tablet are told apart by the shorter
// screen edge, but only the verdict leaves this file.
import type { DeviceClass, ShellKind } from "./analyticsEvent";

/** CSS px on the shorter screen edge, below which a coarse-pointer device is a
 * phone. 768 is the long-standing tablet floor: an iPad mini is 744, a Galaxy
 * Tab 800, and the widest phone in portrait is around 480. */
const TABLET_FLOOR = 768;

interface Hints {
  mobile?: boolean;
}

function hints(): Hints | undefined {
  if (typeof navigator === "undefined") return undefined;
  return (navigator as Navigator & { userAgentData?: Hints }).userAgentData;
}

function coarsePointer(): boolean {
  if (typeof navigator !== "undefined" && (navigator.maxTouchPoints ?? 0) > 0) {
    return true;
  }
  if (typeof window === "undefined" || !window.matchMedia) return false;
  return window.matchMedia("(pointer: coarse)").matches;
}

/** The shorter edge of the screen in CSS px, or `null` when there is no screen
 * to ask (node, under the unit tests). */
function shortEdge(): number | null {
  if (typeof window === "undefined" || !window.screen) return null;
  const { width, height } = window.screen;
  if (!width || !height) return null;
  return Math.min(width, height);
}

/**
 * Phone, tablet or desktop — the question the dashboard actually asks.
 *
 * The order matters. UA-Client-Hints `mobile` is the only *stated* answer and
 * is trusted where it exists, but it says mobile-or-not, not which: Chrome on
 * an Android tablet reports `mobile: false`, so it cannot be the last word
 * either. So the pointer decides whether this is a touch device at all, and the
 * screen's shorter edge splits touch devices into phones and tablets. A hybrid
 * laptop with a touchscreen lands on `tablet`, which is wrong about the
 * hardware and right about how the board is being played.
 *
 * `unknown` is a real answer, not a failure: a browser with no matchMedia and
 * no screen is not a device class worth guessing at.
 */
export function deviceClass(): DeviceClass {
  if (typeof window === "undefined" || typeof navigator === "undefined") {
    return "unknown";
  }
  // Neither a coarse pointer nor a stated `mobile: true` — nothing here is a
  // touch device, so nothing here is a phone or a tablet.
  if (!coarsePointer() && hints()?.mobile !== true) return "desktop";
  const edge = shortEdge();
  if (edge == null) return "unknown";
  return edge >= TABLET_FLOOR ? "tablet" : "phone";
}

/** A browser tab, or a launch from the home screen / an installed PWA. The
 * macOS and iPhone apps are built without the collector entirely, so there is
 * no native value to report — see the build matrix in web/docs/deploy.md. */
export function shellKind(): ShellKind {
  const standalone =
    (typeof window !== "undefined" &&
      window.matchMedia?.("(display-mode: standalone)").matches === true) ||
    (typeof navigator !== "undefined" &&
      (navigator as unknown as { standalone?: boolean }).standalone === true);
  return standalone ? "standalone" : "browser";
}
