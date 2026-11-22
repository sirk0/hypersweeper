// `@tiling/native`: what a game asks of the native shell it may be running in
// — the Capacitor iPhone app — guarded so each piece is simply absent
// everywhere else. Haptics (haptics.ts), the App Store's rating prompt
// (review.ts) and iCloud's key-value store (cloudStore.ts). Games import this
// index alone; each keeps its own events, its own feel per event and its own
// merge rules (Hypersweeper's src/haptics.ts, review.ts and cloudRecord.ts;
// Rep-tiles' src/haptics.ts, review.ts and cloudStars.ts).
//
// It is a package of its own, not part of `@tiling/platform`, so a game that
// never ships natively takes on no Capacitor dependency.

export {
  hapticsEnabled,
  hapticsSupported,
  isNative,
  playHaptic,
  setDeviceReader,
  setHapticsEnabled,
  type HapticSpec,
  type ImpactWeight,
  type NotificationKind,
} from "./haptics";
export { reviewPrompt, reviewSupported, type ReviewPrompt } from "./review";
export { cloudRead, cloudStoreSupported, cloudWrite, onCloudChange } from "./cloudStore";
