# Rep-tiles for iPhone and iPad — the native iOS build

The game (`apps/reptiles/`) inside a Capacitor WKWebView, so it installs on a
phone or an iPad, plays with no internet connection, **buzzes through the
Taptic Engine** as tiles land, and keeps its stars in iCloud. It is built,
signed and uploaded exactly as Hypersweeper's is: the same build script, the
same workflow, the same team. [`apps/hypersweeper/ios/README.md`](../../hypersweeper/ios/README.md)
covers everything the two share in more depth (signing a phone, the free 7-day
Apple ID, versions, Releasing, the API key), and this file is what is Rep-tiles'
own.

```sh
make ios-app GAME=reptiles       # build the game, sync it in, open Xcode  (macOS)
make ios-run GAME=reptiles       # …or build straight onto a connected iPhone
make ios-prepare GAME=reptiles   # build + sync only; works on any OS (what CI checks)
make ios-icon GAME=reptiles      # redraw the icons and the launch image
```

`scripts/build-ios-app.sh --game reptiles` drives it: build `apps/reptiles/`
with `VITE_PACKAGED=1`, assert the bundle is self-contained
(`scripts/check-offline-assets.mjs`), `npx cap sync ios`, and stamp the version
(`apps/reptiles/package.json`'s, which is Hypersweeper's: `sharedVersion`) and
the build number (the git commit count) into `App/Version.generated.xcconfig`.
Open `App/App.xcworkspace`, never the `.xcodeproj`: the pods are linked through
the workspace. The app targets **iOS 18 or newer**, iPhone and iPad
(`TARGETED_DEVICE_FAMILY` 1,2) — no Mac Catalyst build; the Mac has the
Electron app (`make mac-app GAME=reptiles`).

## How it works

| Path | What it is |
|---|---|
| `apps/reptiles/capacitor.config.json` | The native configuration: app id `io.github.sirk0.reptiles`, name, `webDir` (the Vite build), the launch colour. |
| `App/App/public/` | The built game, copied in by `cap sync`. Not committed. |
| `App/App/BridgeViewController.swift` | Capacitor's bridge view controller. Tells the page, before any script runs, whether it is on a `phone` or a `pad` (`window.reptilesDevice`) — only a phone has a Taptic Engine — and registers the two plugins below. `SceneDelegate` makes it the window's root. |
| `App/App/CloudRecordPlugin.swift` | iCloud's key-value store, for the stars (below). The same file as Hypersweeper's: keep the two in step. |
| `App/App/ReviewPlugin.swift` | StoreKit's rating prompt (below). The same file as Hypersweeper's. |
| `App/App/App.entitlements` | iCloud key-value storage, `$(TeamIdentifierPrefix)io.github.sirk0.reptiles`. Automatic signing adds the capability to the App ID on the first archive. |
| `App/App/PrivacyInfo.xcprivacy` | The privacy manifest: no tracking, no data collected. Keep it in step with the App Store Connect label. |
| `App/App/Info.plist` | Capacitor's, plus `ITSAppUsesNonExemptEncryption` false (no export-compliance question), `LSApplicationCategoryType` puzzle games, the version from `$(MARKETING_VERSION)` / `$(CURRENT_PROJECT_VERSION)`. |
| `App/Version.xcconfig` | The project-level base configuration that carries the version numbers. |
| `App/Podfile` | Capacitor's, with the iOS 18 floor and the pods' warnings silenced, as Hypersweeper's. `CapacitorHaptics` is there because `@capacitor/haptics` is in `apps/reptiles/package.json`: `cap sync` reads the plugin list from the game's own dependencies. |
| `App/App/Assets.xcassets` | The app icon (one 1024 px universal image, opaque) and the launch image, both drawn by `npm run icons` (`apps/reptiles/scripts/make-icons.mts`) from the same rep-tile as the web icons. |
| `ExportOptions.plist` | How `app-store.yml` exports an archive, as Hypersweeper's. |
| `AppStore/` | The store listing (below). |

The project was made by `npx cap add ios --packagemanager CocoaPods` (Capacitor 8
otherwise defaults to Swift Package Manager, and the build script and the
upload workflow expect pods), then edited as above. Hypersweeper's README,
"Changing the app", says how to add a plugin or upgrade Capacitor; both apply
here as they are.

### The haptics

`apps/reptiles/src/haptics.ts` names the moments and their feel; the mechanism
is `@tiling/native` (`packages/native/`), shared with Hypersweeper:

| Event | iPhone app | A mobile browser with `navigator.vibrate` |
|-------|------------|-------------------------------------------|
| a tile lands | `impact(Medium)` | one 20 ms vibration |
| the board is finished | `notification(Success)` | a rising pattern |

The tile that finishes a board is felt as the finish alone, not a tap and then
the finish. On an iPad, in Safari and on a desktop there is nothing to feel,
and Settings shows no **Haptics** row; where it shows (an iPhone, an Android
browser) it switches both off. `tests/e2e/native.spec.ts` pins the whole chain
without a device: Capacitor's real `native-bridge.js` over a fake message
handler, the plugin's methods read off its Swift source, and the calls a placed
tile and a finished board post.

### iCloud

The stars live in `localStorage` (`src/progress.ts`). In the app, the
`CloudRecord` plugin hands the page iCloud's key-value store, and
`src/cloudStars.ts` keeps one key, `stars`, in step with it: each level's most
stars, merged at launch, after a finish, when iCloud says another device wrote,
and when the app comes back to the foreground. The merge takes the larger count
per level, so it is idempotent and each device writes the whole map. Stars are
never taken away, so nothing needs Hypersweeper's reset dates. A screen that
counts stars (home, Tilings, a tiling's page) is drawn again when another
device's arrive. A second key, `times`, keeps each level's fastest finish
(milliseconds) the same way, the merge taking the least; it is written only
when iCloud is missing some of it. A board left half-covered (`src/saved.ts`)
stays on the device: it is not synced.

### The rating prompt

`src/review.ts` asks StoreKit once, after the third finished board, a beat after
the finish (`reviewPrompt` in `@tiling/native`). StoreKit decides whether a
sheet shows, and never shows one in TestFlight.

## The App Store

**Privacy.** The privacy policy URL is
<https://tiling-games.pages.dev/rep-tiles/privacy> (`apps/reptiles/public/privacy.html`).
Under **App Privacy**, answer *No, we do not collect data from this app*: the
label reads **Data Not Collected**, which `PrivacyInfo.xcprivacy` says too.
Rep-tiles has no analytics at all. The stars and best times go to the
player's own iCloud key-value store, which we cannot read, so that is not collection.

### The store listing

`AppStore/` holds the text App Store Connect asks for, one plain-text file per
field, to paste as is:

| File | Field | Limit |
|---|---|---|
| `subtitle.txt` | Subtitle (words in it, as in the name, are searched: keep them out of the keywords) | 30 |
| `promotional-text.txt` | Promotional Text | 170 |
| `description.txt` | Description | 4000 |
| `keywords.txt` | Keywords (comma-separated, no spaces needed) | 100 |
| `review-notes.txt` | App Review Information → Notes | 4000 |

Every claim in them is the code's. `apps/reptiles/tests/unit/storeListing.test.ts`
checks each file against its limit, that "more than N levels" stays below the
levels the game has (every board of every tiling, plain and marked) but within
a tenth of it, that "N tilings" is what it has and "fourteen families" as many
as Tilings lists — so the listing neither promises more than the game nor
sells it short.

### Screenshots

`npm run store-screenshots` in `apps/reptiles/` renders nine scenes per slot into
`app-store-screenshots/reptiles/<slot>/` (git-ignored): the Penrose rhombi, the
hat and Ammann–Beenker's colouring part-covered, 3.4.6.4's jigsaw and the
Cairo pentagonal tiling's lines part-covered, the Tilings catalog, the
Irregular tiles group, 3.6.3.6's page, and home. It serves the packaged build from a Vite dev server, whose
`window.__reptiles` seam lays part of a board (`lay(n)`) or all of it (`fill()`),
in the light scheme, with Chromium emulating the device's safe-area insets so
the header clears the Dynamic Island. `DEVICES=` and `SHOTS=` render a subset.

| Folder | Slot | Pixels |
|---|---|---|
| `iphone-6.9` | iPhone 6.9" display | 1320 × 2868 |
| `iphone-6.3` | iPhone 6.1" / 6.3" display | 1206 × 2622 |
| `ipad` | iPad 13" display | 2064 × 2752 |

### App previews and promo videos

`npm run store-videos` in `apps/reptiles/` records Tile(1,1) (`?level=tile11`)
being played to the finish — rotate presses, drags, the confetti and the win
panel — into `app-store-previews/reptiles/<device>/tile11.mp4` (git-ignored),
in about three minutes for all three:

| Folder | For | Pixels |
|---|---|---|
| `iphone-6.9` | the iPhone 6.9" / 6.5" app preview | 886 × 1920 |
| `ipad` | the iPad 13" app preview | 1200 × 1600 |
| `desktop` | posts (Reddit and the like), with a drawn mouse pointer | 1920 × 1080 |

Each is H.264 (High, yuv420p) at 30 fps with a 48 kHz stereo AAC track of the
game's own sounds: what App Store Connect asks of an app preview. Without
`FULL=1` the clip is the board's last part, laid off-camera up to where the
rest fits in 15–30 s, the preview's limits; `FULL=1` plays it from empty (past
30 s: for posts only). `DEVICES=`, `LEVEL=<key>`, `SOUND=0` (a silent track) and
`SCHEME=dark` change the rest. It needs `ffmpeg` on the `PATH` (`brew install
ffmpeg`).

It plays the board as `src/demoPlan.ts` lays it (`plan()` and `layPlan(n)` on
the dev seam), with real input — touches on the iPhone and iPad, the mouse on
the desktop — and renders every frame rather than filming: the page runs on
Playwright's paused fake clock, stepped a thirtieth of a second a frame, every
running animation set to that time, and each frame screenshot at the output's
size. The sound is rendered the same way, through an `OfflineAudioContext` in
the place of `AudioContext`. So a clip comes out smooth however slow the
machine is, and the same every run.

## Releasing

The first time:

1. **Create the app** in App Store Connect (Apps → + → New App): iOS, name
   Rep-tiles, bundle ID `io.github.sirk0.reptiles` (register it first under
   Certificates, Identifiers & Profiles if it is not offered — the first
   archive's automatic signing registers it otherwise), SKU of your choice.
2. Fill in the **privacy** answers and URL above, the category (Games →
   Puzzle), the age rating, and paste `AppStore/*.txt`.
3. Upload the screenshots.

Then each build, as Hypersweeper's: Actions → **App Store upload** → *Run
workflow* on `master`, with **game: reptiles** (`platforms` is iOS whatever is
picked: there is no Mac build). The `app-store` environment's API key serves
both apps. Every upload needs a commit that has not been uploaded before, as
the build number is the commit count. The build appears in TestFlight; add it
to the version and submit it for review there.

Before the first submission, feel the haptics on a real iPhone
(`make ios-run GAME=reptiles`): the simulator has no Taptic Engine. Once the
app is live, put its App Store URL in `apps/reptiles/packaging.json` as
`appStore`, which adds the Smart App Banner to the website and Apple's badge to
the landing page's card.
