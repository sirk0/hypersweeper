# `@tiling/native` (`packages/native/`)

What a game asks of the native shell it may be running in — its Capacitor
iPhone app — guarded so each piece is simply absent everywhere else (the
website, the PWA, Android, the Electron Mac app). Games import the index
(`@tiling/native`) alone. It is a package of its own rather than part of
`@tiling/platform` so that a game which never ships natively takes on no
Capacitor dependency.

- `src/haptics.ts` — the mechanism: `hapticsSupported()` (an iPhone in the
  app, or a mobile browser with a working `navigator.vibrate`), the
  Settings switch (`setHapticsEnabled` / `hapticsEnabled`) and
  `playHaptic(spec)`, which drives the Taptic Engine through
  `@capacitor/haptics` or vibrates the spec's pattern. A game installs where
  its shell names the device with `setDeviceReader` — only an iPhone has a
  Taptic Engine, and the page cannot tell an iPad or the Mac app from the user
  agent.
- `src/review.ts` — `reviewPrompt({ key, afterWins })`: counts wins in
  `localStorage` and asks StoreKit for the rating prompt once, on the Nth,
  when the shell registers a `Review` plugin.
- `src/cloudStore.ts` — the bridge to the shell's `CloudRecord` plugin,
  iCloud's key-value store: `cloudRead`, `cloudWrite`, `onCloudChange`.

Each game keeps its own events, its own feel per event and its own merge
rules: Hypersweeper's `src/haptics.ts`, `review.ts` and `cloudRecord.ts`;
Rep-tiles' `src/haptics.ts`, `review.ts` and `cloudStars.ts`. The native half
— the `Review` and `CloudRecord` plugins and the device flag — is Swift in each
game's `ios/App/App/` (see `apps/hypersweeper/ios/README.md` and
`apps/reptiles/ios/README.md`). A plugin's JS name here and its `jsName` in
Swift must match, and a game's app must list `@capacitor/haptics` in its own
`package.json` too, because that is where `cap sync` looks for the pods to
link.

Users: Hypersweeper (a flag, a mine, a win, an achievement; its best times,
achievements and favourites in iCloud; the prompt after the third win);
Rep-tiles (a tile landing and a finished board; its stars in iCloud; the
prompt after the third finished board).

```sh
cd packages/native && npm run typecheck && npm run test
```
