import {
  hapticsEnabled,
  hapticsSupported,
  playHaptic,
  setDeviceReader,
  setHapticsEnabled,
  type HapticSpec,
} from "@tiling/native";

// Tactile feedback for game events: what each one feels like. Four moments
// buzz: placing a flag (a light tick), losing (a stronger pattern), winning (a
// rising flourish) and unlocking an achievement. Whether anything can be felt,
// and the driving of it — the Taptic Engine in the iOS app on an iPhone,
// `navigator.vibrate` in a mobile browser, nothing anywhere else — is
// `@tiling/native`'s (packages/native/src/haptics.ts), shared with Rep-tiles.
//
// This is the single seam for haptics, as `audio/sound.ts` is for the game's
// voice: the call sites (session.ts for the moves, main.ts for an
// achievement) name events, never patterns.

export { hapticsEnabled, hapticsSupported, setHapticsEnabled };

export type HapticKind = "flag" | "lose" | "win" | "unlock";

// On an iPhone the two *impacts* are single taps — a flag light, an unlock
// firmer, since an unlock is the bigger of the two events and arrives alongside
// the win's own buzz. The two endings are the system's own notification
// patterns: `error` is the sharp double buzz iOS plays to say *that went
// wrong*, which is what stepping on a mine is.
//
// Through the Vibration API (ms): a single short pulse for a flag; a heavier
// buzz-buzz-BUZZ for a loss; a lighter, rising flourish for a win; and a short
// rising triple for an achievement, which lands *beside* the win's flourish and
// has to be distinguishable from it rather than merely different.
const FEEL: Record<HapticKind, HapticSpec> = {
  flag: { native: { impact: "light" }, vibrate: 15 },
  lose: { native: { notification: "error" }, vibrate: [40, 30, 40, 30, 80] },
  win: { native: { notification: "success" }, vibrate: [20, 40, 20, 40, 60] },
  unlock: { native: { impact: "medium" }, vibrate: [15, 30, 45] },
};

// The shell names the device before any script runs
// (apps/hypersweeper/ios/App/App/BridgeViewController.swift): only a phone has
// a Taptic Engine; an iPad and the Mac app both report a Mac user agent.
setDeviceReader(() =>
  typeof window === "undefined"
    ? undefined
    : (window as { hypersweeperDevice?: string }).hypersweeperDevice,
);

/** Fire tactile feedback for a game event, if the player left it on and the
 * platform supports it. */
export function haptic(kind: HapticKind): void {
  playHaptic(FEEL[kind]);
}
