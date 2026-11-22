import {
  hapticsEnabled,
  hapticsSupported,
  playHaptic,
  setDeviceReader,
  setHapticsEnabled,
  type HapticSpec,
} from "@tiling/native";

// What a move feels like. Two moments buzz: a tile landing (a firm tap) and the
// board finished (iOS's own success pattern). Whether anything can be felt, and
// the driving of it — the Taptic Engine in the iOS app on an iPhone,
// `navigator.vibrate` in a mobile browser, nothing anywhere else — is
// `@tiling/native`'s (packages/native/src/haptics.ts), shared with
// Hypersweeper.
//
// The seam, as `sound.ts` is for the voice: the call sites (input/drag.ts as a
// tile lands, main.ts as a board is finished) name events, never patterns.

export { hapticsEnabled, hapticsSupported, setHapticsEnabled };

export type RepHaptic = "place" | "win";

/** A tile landing is a medium tap — the game's one move, felt every time, so
 * firmer than Hypersweeper's flag but a single tap; the finish is the system's
 * success notification, as Hypersweeper's win is, and its vibration the same
 * rising flourish. */
export const FEEL: Record<RepHaptic, HapticSpec> = {
  place: { native: { impact: "medium" }, vibrate: 20 },
  win: { native: { notification: "success" }, vibrate: [20, 40, 20, 40, 60] },
};

// The shell names the device before any script runs
// (apps/reptiles/ios/App/App/BridgeViewController.swift): only a phone has a
// Taptic Engine; an iPad reports a Mac user agent.
setDeviceReader(() =>
  typeof window === "undefined"
    ? undefined
    : (window as { reptilesDevice?: string }).reptilesDevice,
);

/** Feel a move, if the player left haptics on and the device can. */
export function haptic(kind: RepHaptic): void {
  playHaptic(FEEL[kind]);
}
