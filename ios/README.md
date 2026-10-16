# Hypersweeper for iPhone — the native iOS build

The TypeScript game (`web/`) inside a Capacitor WKWebView, so it installs on a
phone, plays with no internet connection, and **buzzes through the Taptic
Engine** — the one thing no web API on iOS can do.

```sh
make ios-install   # install the Capacitor tooling (it lives in web/)
make ios-app       # build the game, sync it in, open Xcode  (macOS)
make ios-run       # …or build straight onto a connected iPhone
make ios-prepare   # build + sync only; works on any OS (what CI checks)
```

`make ios-app` must run **on a Mac**: signing and installing an iOS app is
Xcode's job and Xcode runs nowhere else. Everything up to that — the web build,
the offline check, the sync — works anywhere.

`scripts/build-ios-app.sh` drives it: build `web/` with `VITE_PACKAGED=1`,
assert the bundle is self-contained (`scripts/check-offline-assets.mjs`), then
`npx cap sync ios`.

## Putting it on your phone

You need Xcode (free, App Store) and CocoaPods (`brew install cocoapods`). The
app targets **iOS 18 or newer** (`IPHONEOS_DEPLOYMENT_TARGET` in the Xcode
project and `platform :ios` in the `Podfile`; the Podfile's `post_install`
raises the pods to match), so the phone has to be on iOS 18.

1. `make ios-app`. It installs whatever `web/package-lock.json` calls for that
   your tree does not have yet (`scripts/ensure-web-deps.sh` — a checkout that
   predates a new dependency is otherwise a `tsc` error about a module it cannot
   resolve), builds the bundle, syncs it into `ios/App`, and opens
   `App.xcworkspace` — **the workspace, never the `.xcodeproj`**, because the
   Capacitor and Haptics pods are linked through it.
2. Plug the iPhone in, unlock it, and pick it in Xcode's device menu.
3. Once, under the **App** target → **Signing & Capabilities**: tick
   *Automatically manage signing* and choose your Team. A free Apple ID is
   enough — add it under Xcode → Settings → Accounts. If Xcode says the bundle
   identifier is taken, change it there to something of your own (it starts as
   `io.github.sirk0.hypersweeper`).
4. **⌘R**.
5. First launch only, on the phone: Settings → General → VPN & Device
   Management → trust your developer certificate.

A **free** Apple ID signs an app for **7 days**; after that it refuses to launch
until you press ⌘R again. A paid Apple Developer account ($99/yr) signs for a
year and unlocks TestFlight. Nothing else about the build differs.

The app's version has one source: `web/package.json`. `make ios-app` writes it
as `MARKETING_VERSION`, with the git commit count as `CURRENT_PROJECT_VERSION`
(the build number, which App Store Connect requires to grow with every upload),
into `ios/App/Version.generated.xcconfig`. `Version.xcconfig` includes that
file. So **run `make ios-app` before archiving**: an Archive started from
Xcode's menu reuses whatever was last stamped. The same version shows under the
game's Settings › About. Don't upload from a shallow clone, where the commit
count is wrong; the script warns about this.

## How it works

| Path | What it is |
|------|------------|
| `web/capacitor.config.json` | The whole native configuration: app id, name, `webDir` (the Vite build), and `ios.path` pointing here. It lives in `web/` because that is the npm project Capacitor's CLI and pods resolve from — one `node_modules`, so the JS `@capacitor/haptics` and the pod that answers it can never drift apart. |
| `ios/App/App.xcworkspace` | What Xcode opens: the app target plus the pods. |
| `ios/App/App/public/` | The built game, copied in by `cap sync`. Not committed — it is a build artifact, like `desktop/app`. |
| `ios/App/App/AppIcon.icon`, `AppIconHexagon.icon`, `AppIconOctagon.icon` | The app icons, as Icon Composer documents: the primary (pentagon) and the two alternates the App icon setting switches to. One document serves iPhone, iPad and the Mac app alike. See "The app icons" below. |
| `ios/App/App/AppIconPlugin.swift` | The native half of the App icon setting: `setAlternateIconName`, as the Capacitor plugin `AppIcon`. Registered by `BridgeViewController`, which also tells the page whether the device can switch icons and which one it wears. |
| `ios/App/App/Assets.xcassets` | The launch image, exported from the primary icon by `make ios-icon` (`web/scripts/make-icons.mts`). |
| `ios/App/App/App.entitlements` | **Mac only** (`CODE_SIGN_ENTITLEMENTS[sdk=macosx*]`). The App Sandbox, which the Mac App Store requires, plus `network.client`, and `game-center`. The game itself makes no network requests (Game Center's traffic is GameKit's); WKWebView's helper processes need `network.client` inside the sandbox anyway. Without it the web content process crash-loops and the game never appears. The file's comment has the measurement. |
| `ios/App/App/PrivacyInfo.xcprivacy` | The app's privacy manifest: no tracking, no data collected. That holds because analytics is compiled out of packaged builds. Keep it in step with the App Store Connect privacy label ("Data Not Collected"). |
| `ios/App/Version.xcconfig` | The project-level base configuration that carries the version numbers (above). |
| `ios/App/Podfile` | Generated by Capacitor. Lists the pods for `@capacitor/ios` and each plugin, resolved out of `web/node_modules`. |
| `ios/App/App/AppDelegate.swift`, `ios/App/App/SceneDelegate.swift` | The UIScene lifecycle, which Capacitor 8 uses and recent iOS releases expect. `AppDelegate` hands each new scene the `SceneDelegate`; that creates the window with Capacitor's `CAPBridgeViewController`. The scene manifest (`UIApplicationSceneManifest`) in `Info.plist` names it. |
| `ios/App/AppClip/` | The App Clip target: its own delegates, `ClipBridgeViewController`, `Info.plist` and entitlements. Everything else — the game, the icon, the launch screen, the privacy manifest, `BridgeViewController.swift` — it takes from `App/`. See "The App Clip" below. |
| `ios/App/App/App-iOS.entitlements` | **iPhone and iPad only** (`CODE_SIGN_ENTITLEMENTS[sdk=iphone*]`): names the App Clip as this app's (`associated-appclip-app-identifiers`), and turns on Game Center and iCloud key-value storage. |
| `ios/App/App/GameCenterPlugin.swift` | The `GameCenter` plugin: sign-in, reporting achievements, opening Game Center. App target only; see "Game Center" below. |
| `ios/App/App/CloudRecordPlugin.swift` | The `CloudRecord` plugin: iCloud's key-value store, where the best times and the achievement record are kept in step across devices and through a reinstall. App target only; see "iCloud" below. |
| `ios/GameCenter/` | The Game Center achievement list (`achievements.json`) and one badge image per achievement, written by `web/scripts/make-gamecenter.mts`. Not part of the Xcode project: it is what App Store Connect is told. See "Game Center" below. |
| `ios/App/Stickers/` | The iMessage sticker pack: an app extension with no code, just `Info.plist` and `Stickers.xcassets` (the stickers and the drawer icon), all written by `web/scripts/make-stickers.mts`. See "The sticker pack" below. |

Nothing in `web/` is written for iOS beyond the haptics branch below, the
native plugins it feature-detects (the app icon, Game Center, iCloud), and one build
flag, `VITE_PACKAGED=1`, which it shares with the macOS app: a bundle
inside an app has no server to update from, so the build drops the service
worker and the settings page drops its "Check for updates" row.

### The haptics, which are the point

`web/src/haptics.ts` is the single seam, and it picks its mechanism at call
time. Inside this app `Capacitor.isNativePlatform()` is true and, **on an
iPhone**, the game events become real Taptic calls. The same app on an iPad or
a Mac has no Taptic Engine. The page can't tell those apart from the user agent
(both report a Mac), so `BridgeViewController.swift` sets
`window.hypersweeperDevice` (`phone`, `pad` or `mac`) before any script runs.
On a `pad` or `mac` there is no Haptics row and nothing is driven:

| Event | Native | A mobile browser with `navigator.vibrate` |
|-------|--------|-------------------------------------------|
| flag placed or cleared | `impact(Light)` | one 15 ms vibration |
| **mine** | `notification(Error)` | a heavy 5-pulse pattern |
| board cleared | `notification(Success)` | a lighter rising pattern |

`Error` is the sharp double buzz iOS itself plays to say *that went wrong* —
which is exactly what stepping on a mine is, and what a browser on iOS cannot
ask for at any weight. It cannot ask for one at *any* weight, in fact: Safari
(including a home-screen PWA) does not implement the Vibration API, and the
hidden `<input type="checkbox" switch>` tick that once stood in for it does not
actually buzz, so it is gone. Only this app on an iPhone and a mobile browser
with a working `navigator.vibrate` (Android) have a mechanism at all; everywhere else
`hapticsSupported()` is false, `haptic()` does nothing and Settings ›
**Haptics** shows no row. Where it does show, it switches all of it off
(stored like the sound preset, read on every event) — and because `haptic()`
is gated on the same check, a stored `haptics: true` carried over from a
phone is inert everywhere else.

The plugin is reached through Capacitor's normal bridge, so it needs three
things to line up: the JS package (`@capacitor/haptics` in `web/package.json`),
the pod (`CapacitorHaptics`, which `cap sync` writes into the Podfile), and the
native side telling the page which plugins the binary carries. That last one is
the trap — a plugin missing from Capacitor's `PluginHeaders` is silently served
by its *web* implementation, so a build can look fine and quietly do nothing on
the phone. `web/tests/e2e/haptics.spec.ts` pins the whole chain without a
device: it boots the page with Capacitor's real `native-bridge.js` over a fake
`webkit.messageHandlers.bridge`, then plays a board and asserts what gets posted
to the native side. If a `pod install` were ever missed, that spec is what says
so.

## Changing the app

- **The game changed** → `make ios-app` again (or `npx cap sync ios` from `web/`
  if the bundle is already built). Xcode does not need restarting.
- **The icons or launch image** → see "The app icons" below.
- **A new Capacitor plugin** → `npm install` it in `web/`, then `cap sync ios`
  (a Mac, so the pod installs). Nothing here is hand-maintained.
- **Regenerating the project from scratch** → `rm -rf ios` and, from `web/`,
  `npx cap add ios`. Everything in `ios/` is Capacitor's own template plus a
  few edits worth knowing about: the icon/launch assets,
  `ITSAppUsesNonExemptEncryption` in `Info.plist` (the game uses no encryption
  of its own, and saying so is what stops the export-compliance question),
  the iOS 18 deployment target in the `Podfile` and the Xcode project (the
  template's is lower), and the App Store setup above: Mac Catalyst, the
  entitlements, the privacy manifest, `LSApplicationCategoryType` in
  `Info.plist`, the Mac icons, and `Version.xcconfig` — plus the whole App
  Clip target (below), and its `target 'AppClip'` block in the `Podfile`. The category has to be
  in `Info.plist`: `INFOPLIST_KEY_*` build settings only apply when Xcode
  generates the plist, and this project ships its own.
- **Upgrading Capacitor** → bump `@capacitor/core`, `/cli`, `/ios` and the
  plugins together in `web/`, then `cap sync ios`. `cap sync` does not touch
  the hand-owned native files (`AppDelegate.swift`, `SceneDelegate.swift`,
  `Info.plist`, the `.pbxproj`), so diff them against the new template
  (`web/node_modules/@capacitor/cli/assets/ios-pods-template.tar.gz`) — that is
  how the scene setup arrived with Capacitor 8.

## The app icons

Three icons — a pentagon (the primary `AppIcon`), a hexagon and an octagon —
so the App Store app and the web app on the same Home Screen can be told apart
(Settings › Appearance › App icon). Each is an **Icon Composer document**
(`.icon`, Xcode 26+), which Xcode compiles for every platform the target
builds: there is no separate Mac Catalyst art any more, and the system draws
the rounded square, the Liquid Glass edge and the dark, tinted and clear
renditions itself. The list of icons lives in `web/src/appIcon.ts`;
`tests/unit/appIcon.test.ts` holds the project to it.

- **Redrawing the art** → `make ios-icon` (macOS, needs Xcode). The script
  (`web/scripts/make-icons.mts`) writes each document's two layers,
  `Assets/cell.svg` and `Assets/mine.svg`, then exports every non-Apple icon
  (the web's PNGs, the Electron icon, the launch image) from the documents with
  `ictool`, so all of them match. Commit what it writes.
- **Tuning the look** — glass, translucency, shadows, a dark-mode fill — →
  open the `.icon` in Icon Composer (Xcode › Open Developer Tool), save, and
  re-run `make ios-icon` so the exported PNGs pick it up. The script writes a
  document's `icon.json` only when it is missing, so a re-run keeps the
  tuning; delete the file to get the seed back.
- **Adding an icon** → a row in `APP_ICONS`, `make ios-icon`, then add the new
  `.icon` to the App target (Resources) and its name to
  `ASSETCATALOG_COMPILER_ALTERNATE_APPICON_NAMES` in both configurations. Xcode
  writes the `CFBundleAlternateIcons` entries into the built `Info.plist`
  itself; nothing goes in ours.
- **Switching** is `UIApplication.setAlternateIconName`, and iOS confirms it
  with an alert of its own that an app cannot suppress. Mac Catalyst does not
  support alternate icons, so the Mac app offers no row.
- **The launch image** is the primary icon on a transparent square, so the
  storyboard's `systemBackgroundColor` shows through and it is correct in both
  light and dark mode.

## The App Store

One app for iPhone, iPad and Mac (Mac Catalyst, `TARGETED_DEVICE_FAMILY` 1,2,6)
under one bundle ID. `DERIVE_MACCATALYST_PRODUCT_BUNDLE_IDENTIFIER = NO` keeps
the Mac build from getting a `maccatalyst.` prefix, which is what lets the
store sell all three as one purchase. The project carries what an upload checks
for: the sandbox, the privacy manifest, the category, Mac icon sizes, a version
that tracks `package.json`, and a build number that grows.

**The Mac and iPad specifics** live in a few native files:

- `AppDelegate.buildMenu` builds the menu bar, which iPadOS also uses for its
  ⌘-key overlay. It adds **New Game ⌘N**, which re-deals the board in play like
  the smiley; **Settings… ⌘,**; and **How to Play** under Help. It also removes
  menus that would do nothing in a canvas game (Format and the text-editing
  submenus). Each command reaches the page as a `hypersweeper:command` event
  (`App.onCommand` in `web/src/main.ts`, pinned by `tests/e2e/commands.spec.ts`).
  Settings and How to Play are home-screen pages, so from a game they go home
  first, leaving the board as the header's back arrow does (without asking).
- **The File menu picks the difficulty and the board.** Under New Game come
  Easy ⌘1 / Medium ⌘2 / Hard ⌘3, with a checkmark on the one in play, then the
  quick-play entries (Classic ⇧⌘C, Volumetric ⇧⌘V, Random Flat Board ⇧⌘F,
  Random 3D Board ⇧⌘D),
  then a submenu for each group of the home menu: Flat, Flat manifolds (a
  submenu per surface), Sphere, the solid pages and Volumes. Each one holds
  the same tilings and families its home-menu page does. The page owns the
  tree: `web/src/menuBar.ts` builds it from the home menu's own grouping
  (`web/src/ui/boardTree.ts`) and hands it to `MenuBarPlugin.swift` at boot.
  The plugin stores it and asks UIKit to rebuild the menu bar, so nothing
  about the catalogue is written in Swift. Each item's command string comes
  back through `BridgeViewController.menuCommand` as a `hypersweeper:command`
  event. A board starts from anywhere and abandons the one in progress, as the
  smiley does. A blocked board opens its explanation. A difficulty picked
  mid-game re-deals the board on screen at that difficulty. The home page's
  pills and the checkmark follow each other (`setMenuBarDifficulty`). UIKit
  throws on two identical commands or shortcuts in a menu bar, so
  `tests/unit/menuBar.test.ts` holds every command and shortcut to being
  unique. The
  plugin is in the app target only. `BridgeViewController` is shared with the
  App Clip, so its menu code sits behind `#if !APP_CLIP`.
- **The Mac app's name.** The Xcode target is `App` (Capacitor's template), and
  `CFBundleName` follows the product name, which is what the Mac menu bar and
  the `.app` file in `/Applications` show. `PRODUCT_NAME[sdk=macosx*] =
  Hypersweeper` renames the Mac build only. The iOS product has to stay
  `App.app`, because `npx cap run ios` (`make ios-run`) looks for it by the
  scheme's name. An iPhone shows `CFBundleDisplayName` anyway.
- `SceneDelegate` sets the **minimum window size** to 375×560: an iPhone SE's
  width and the shortest height the layout is tested at. This applies to a Mac
  window and a resizable iPad window.
- `BridgeViewController` handles the trackpad pinch and swipe, and tells the
  page its device (see the haptics section above).
- **Ctrl+. and ⌘. crash a Catalyst web view** if the page leaves them
  unhandled. AppKit reads them as the Cancel key and hands them back through
  Catalyst's bridge, which throws `Non-Unicode event without Carbon EventRef`.
  `BridgeViewController` registers both as key commands that do nothing, and
  UIKit matches key commands before it delivers a key to the web view. So the
  page never sees the key, and WebKit never hands it back. A page-side
  `preventDefault` does not help: the crash comes after WebKit reports the key.

**Privacy.** The privacy policy URL for App Store Connect (App Information →
Privacy Policy URL) is <https://hypersweeper.pages.dev/privacy>, served from
`web/public/privacy.html`. Under **App Privacy**, answer *No, we do not collect
data from this app*, so the label reads **Data Not Collected**. That matches
`PrivacyInfo.xcprivacy` and the policy page. All three rest on analytics being
compiled out of packaged builds (`VITE_PACKAGED=1`), so if that ever changes,
change all three together. The page also covers the website, which does count
plays.

Game Center does not change the label. The app sends Game Center achievement
ids and percentages, through GameKit, once the player is signed in, and reads
back nothing but whether they are. That data goes to Apple, and Apple's App
Privacy Details guidance says "You are not responsible for disclosing data
collected by Apple." The policy page says what is sent and that Apple handles
it ("Game Center", under the apps). If the app ever reads data back from Game
Center (the player's name, say, or their friends), that is collection by the
app, and the label and the page have to change with it.

## The App Clip

An App Clip lets someone play from the App Store, or from an App Clip link,
without installing the app. Hypersweeper's plays one board: the **chamfered
dodecahedron** (`c80`) at the default difficulty, Easy. Twelve pentagons
and sixty hexagons on a ball are unmistakably not the usual minesweeper, and a
first game is over in a minute or two.

It is a second target, `AppClip` (product type `on-demand-install-capable`,
bundle ID `io.github.sirk0.hypersweeper.Clip`, iPhone and iPad), running **the
same game bundle** in the same Capacitor bridge — its resources are the App
target's `public/`, config, icon, launch screen and privacy manifest, and it
links the same pods. The App target embeds it in `App.app/AppClips` through an
"Embed App Clips" phase and a target dependency, both filtered to iOS, so the
Mac build never builds or carries it. Its version and build number come from
the same `Version.xcconfig`, which App Store Connect requires to match the
app's. The two name each other in their entitlements: the clip's
`parent-application-identifiers`, the app's `App-iOS.entitlements`.

What makes the game a clip is the shell, not the build. `ClipBridgeViewController`
(a `BridgeViewController`, so the device flag and haptics work as in the app):

- sets `window.hypersweeperClip` to the board, read from `HypersweeperClipBoard`
  in `AppClip/Info.plist` — **that key is the one place to change the board**.
  The page then opens it at once, hides the header's back and random buttons,
  records no achievements or best times, and puts no card up on a win ("The
  App Clip" in [`web/docs/ui.md`](../web/docs/ui.md));
- offers the full game: the page posts `won` to the `hypersweeperClip` message
  handler when a board is won, and the clip shows Apple's App Clip
  `SKOverlay`; the next board posts `started`, which dismisses it.

`ClipAppDelegate` replaces the app's delegate, most of which is the Mac menu
bar. To try it, build the `AppClip` scheme onto a simulator or a phone; a
build of `App` carries it too, under `App.app/AppClips/`. It is about 4.5 MB,
well inside the 15 MB an App Clip may be.

### In App Store Connect

The clip is not uploaded on its own: it arrives inside the iOS build, and App
Store Connect lists it on that build. Once per app:

1. Upload an iOS build (below). Xcode's cloud signing registers the clip's
   bundle ID and its App Clip capability as it signs, as it does the app's.
2. On the iOS version page, under **App Clip**, pick the build's clip and fill
   in the **default App Clip experience**: the card image (`app-clip` under
   "Screenshots" below, 1800 × 1200), a subtitle of up to 56 characters, and
   the action **Play**.
3. Submit the version as usual; the clip is reviewed with it.

The default experience needs no web setup: the App Store's card and the App
Clip link App Store Connect generates both open it. Opening shared board links
(`hypersweeper.pages.dev/?mode=…`) in the clip would need an advanced
experience — an `appclips:` associated domain and an
`apple-app-site-association` file on the site — and the clip reading the board
from the invocation URL; none of that exists yet.

## The sticker pack

The app carries an iMessage sticker pack: in Messages, the app drawer (or the
emoji keyboard's sticker tab) offers the game's boards as stickers to send or
peel onto a bubble. They show the Klein bottle, trefoil knot, Möbius strip,
double torus, torus, projective plane, chamfered dodecahedron, cube,
tetrahedron, hyperbolic disc, Penrose tiling, and a Klein bottle with a mine
gone off.

It is a third target, `Stickers` (product type
`app-extension.messages-sticker-pack`, bundle ID
`io.github.sirk0.hypersweeper.Stickers`, iPhone and iPad). It has **no code**:
Messages' own `StickerBrowserViewController` shows whatever
`Stickers/Stickers.xcassets` holds. The App target embeds it in
`App.app/PlugIns` through an "Embed Foundation Extensions" phase and a target
dependency, both filtered to iOS like the App Clip's, so the Mac build never
carries it. It takes its version from the project-level `Version.xcconfig`, as
App Store Connect requires an extension's version to match its app's.

Everything in the catalog is rendered, not drawn:

```sh
make ios-stickers                  # cd web && npm run stickers
SWIFTSHADER=1 make ios-stickers    # on a machine with no GPU (a cloud session)
```

`web/scripts/make-stickers.mts` boots the packaged bundle in Chromium, stages
each board the way the App Store art is staged (`scripts/shots-lib.ts`: a
seeded mine layout, a central patch opened, a few flags), and shoots it on a
transparent page with the chrome hidden. Then it trims the board to its
silhouette, adds a white die-cut edge and a soft shadow so it reads on a light
or a dark bubble, and fits it to Apple's **Large** sticker size: 618 px square,
two to a row. The script fails if a sticker goes over Apple's **500 KB** limit.
It also writes every `Contents.json`, so **`STICKERS` in that script is the one
place to add, drop or reorder a sticker**. Each sticker's VoiceOver label is
its board's name in `data/catalog.json`. `SHOTS=klein,trefoil` re-renders a
subset.

The drawer icon (`iMessage App Icon.stickersiconset`, Messages' 4:3 sizes plus
the 1024 × 768 and 1024 × 1024 store icons) is the app icon's art, drawn from
the primary `AppIcon.icon` document's layers onto its own ground. It is written
as opaque RGB because the App Store refuses an icon with an alpha channel.
`ICON_ONLY=1 npm run stickers` redraws just the icon, for example after
`make ios-icon` changes the art.

To try the pack, build the `App` scheme onto a simulator, open Messages, start
a conversation and pick Hypersweeper in the app drawer. Xcode's cloud signing
registers the new bundle ID at the first archive, as it did the clip's, and
`app-store.yml` fails an iOS archive that does not carry `Stickers.appex`.

## Game Center

In the App Store app (iPhone, iPad and Mac) the achievements are Game
Center's: its banners announce an unlock, Settings' **Game Center** row opens
its achievements page, and the game's own Achievements page and the unlock
list on the win card are not shown. The website, the PWA, Android and the
Electron Mac app keep the game's own list. "Where an unlock is said" in
`web/docs/ui.md` has the page's side.

### How it works

- **`GameCenterPlugin.swift`** is a local Capacitor plugin, like
  `AppIconPlugin.swift`, with three calls: `authenticate` (sets
  `GKLocalPlayer`'s handler and shows Apple's sign-in sheet when Game Center
  asks for it), `report` (`GKAchievement.report`, with or without the
  completion banner) and `showAchievements` (`GKAccessPoint`). Every later
  sign-in or sign-out reaches the page as an `authChange` event.
- **Only the app registers it.** `BridgeViewController.capacitorDidLoad` does,
  under `#if !APP_CLIP`: the App Clip compiles `BridgeViewController.swift`
  too, earns no achievements, and its target sets `APP_CLIP` and leaves the
  plugin file out. The page tells the two apart by whether the plugin is there
  (`Capacitor.isPluginAvailable("GameCenter")`), not by a build flag.
- **The entitlement** `com.apple.developer.game-center` is in both
  `App-iOS.entitlements` and the Mac `App.entitlements`. The App ID needs the
  Game Center capability; Xcode's automatic signing adds it.
- **The record stays the game's** (`web/src/gameCenter.ts`). Every win is filed
  in the game's own record as before, and Game Center is told what that record
  earns. At launch, and again whenever the player signs in, the whole record is
  sent with no banners: that catches up wins from before this existed, or from
  while offline or signed out, and Game Center keeps the highest percentage it
  has been sent, so sending it again changes nothing. A win sends a banner for
  each achievement it just unlocked, at the beat the win card used to list
  them, with the unlock sound and buzz (banners are silent).
- **Signed out**, nothing is sent; the next sign-in's catch-up carries it,
  without banners.
- **Testing without a device.** `web/tests/e2e/gameCenter.spec.ts` boots the page
  over Capacitor's real `native-bridge.js` with the plugin's header read from
  the Swift source, and checks what the page sends: the sign-in and quiet
  catch-up at launch, banners on a win, the card without unlocks, the
  `authChange` catch-up, and the Settings row. What happens past the bridge (the
  sheet, the banners, Game Center itself) needs a device signed in to a sandbox
  Game Center account, after the achievements are registered (below).

### The achievement list

`ios/GameCenter/` holds the list App Store Connect is told about, and nothing in
it is typed by hand:

- `achievements.json`: every achievement, in App Store Connect's own terms.
  `vendorIdentifier` is the Achievement ID; `referenceName` is the game's own
  id; then the points, and per locale the display name, the pre-earned and
  earned descriptions, and the image. The ids, points and text come from
  `GAME_CENTER_ACHIEVEMENTS` in `web/src/achievements.ts` (see "What Game
  Center is told" in `web/docs/ui.md` for how they are chosen).
- `images/<Achievement ID>.png`: 1024 px squares, RGB with no alpha, which is
  what App Store Connect accepts. Each is the achievement's in-game badge in the
  default theme, on the app icon's cream ground, kept inside the inscribed
  circle so a round crop loses nothing. In the game an achievement and its
  "complete" partner share a badge; Game Center shows the images alone, so
  every "win all of a group" image adds a sage ring (the theme's icon ink), and
  the whole catalogue's ring is the theme's terracotta accent. The manifest's
  `ring` field says which each one has.

Regenerate both with `npm run gamecenter` in `web/` (headless Chromium draws
the images; `MANIFEST_ONLY=1` writes just the list, with no browser). A unit
test, `web/tests/unit/gameCenterManifest.test.ts`, regenerates the list and
fails on any difference, and checks every image is there at the right size.
So when the catalogue grows an achievement, CI says so, and the regenerated
file is where it gets noticed.

**What App Store Connect makes permanent.** Once an achievement is live in any
app version, its Achievement ID and its points can never change and it cannot
be deleted (only archived). So an id or points change to an achievement already registered is never a
plain regeneration: register a new achievement instead. Game Center allows 100
points per achievement and 1000 across the game; today's list spends 770.

**Registering a new achievement.** In App Store Connect → the app → Services
→ Game Center → Achievements, add one per new entry in `achievements.json`,
copying its fields and uploading its image. Do it before the build that
reports it ships: an achievement Game Center does not know is reported to
nobody.

## iCloud

The best times and the achievement record are kept in iCloud, so the iPhone,
the iPad and the Mac share one record, and deleting and reinstalling the app
loses nothing. It uses iCloud's **key-value store**
(`NSUbiquitousKeyValueStore`): 1 MB and 1024 keys per app, which the record is
far inside (a few kilobytes per device, at most ~60 KB of best times).

- **`CloudRecordPlugin.swift`** is a local Capacitor plugin, like the Game
  Center one, and only moves strings: `read` returns every key, `write` sets or
  removes keys, and a `change` event fires when iCloud delivers another
  device's write. All of the merging is the page's (`web/src/cloudRecord.ts`;
  "The record in iCloud" in [`web/docs/ui.md`](../web/docs/ui.md) has the
  rules).
- **Only the app registers it** (`BridgeViewController.capacitorDidLoad`, under
  `#if !APP_CLIP`): the clip keeps no record.
- **The entitlement** `com.apple.developer.ubiquity-kvstore-identifier` is in
  both `App-iOS.entitlements` and the Mac `App.entitlements`, naming the store
  outright as `$(TeamIdentifierPrefix)io.github.sirk0.hypersweeper` so the two
  builds share it. The App ID needs the **iCloud** capability (key-value storage
  needs no container); Xcode's automatic signing adds it from the entitlement.
- **Signed out of iCloud**, iCloud off for the app, or simply **offline**, the
  store keeps working from its copy on the device; offline writes go up when
  the network returns. The page also reads the store (and `read` calls
  `synchronize`) whenever the app comes back to the foreground. A fresh install's first writes are held
  back by iOS until its first download from iCloud has arrived, so a new
  install can never overwrite the record with an empty one.
- **Testing.** `web/tests/unit/cloudRecord.test.ts` plays several devices
  against one simulated store (reinstall, two devices, crossed writes, clears,
  and devices going offline);
  `web/tests/e2e/cloudRecord.spec.ts` checks the bridge round trip. iCloud
  itself needs real devices signed in to one Apple ID (simulators sync too, but
  slowly; *Debug → Trigger iCloud Sync* nudges one).

## Releasing

Builds reach App Store Connect through one workflow,
`.github/workflows/app-store.yml` (**App Store upload**), which you start by
hand. It never runs on a push or a pull request, and PR CI builds no iOS app.
On a `macos-26` GitHub-hosted runner, with the newest stable Xcode, it:

1. checks out `master` with full history (the build number is the commit
   count, so a shallow clone is refused);
2. runs `make ios-prepare` (`scripts/build-ios-app.sh --prepare-only`), which
   builds the web bundle, checks it is offline-safe, syncs it into `ios/`
   and stamps the version, then runs `pod install`;
3. archives the `App` scheme for iOS, Mac Catalyst or both — the iOS archive
   carrying the App Clip, which the job checks before exporting — and exports
   each archive straight to App Store Connect with `ios/ExportOptions.plist`
   (`app-store-connect`, `upload`, automatic signing). Signing is Xcode's
   cloud signing with an App Store Connect API key, so no certificates or
   profiles are stored anywhere. The team is read from the project's
   `DEVELOPMENT_TEAM`.

The upload job is titled with the version it uploads (`Upload 0.2.133 (both)`),
read from `web/package.json` by a few-second job before it: a run's own title is
fixed before anything is checked out, so the job's is the one that can say it.
The job summary is headed with the version and build number, and lists what was
uploaded (`ios+clip`, `mac`). If the job fails, the xcodebuild logs and result
bundles are attached as an artifact.

### One-time setup

1. **The API key.** In App Store Connect → Users and Access → Integrations →
   App Store Connect API → **Team Keys**, generate a key with the **Admin**
   role. Admin is what cloud signing needs to create distribution
   certificates and profiles. Note the **Key ID** and the **Issuer ID** shown
   above the list, and download the `.p8`. Apple lets you download it only once.
2. **The environment.** In GitHub, go to Settings → Environments → New
   environment, and name it `app-store`. Under *Deployment branches and tags*,
   choose *Selected branches* and add `master`. Optionally add yourself as a
   required reviewer, so every upload waits for a click.
3. **The secrets**, in that environment (not as repository secrets):
   - `ASC_KEY_ID`: the key ID;
   - `ASC_ISSUER_ID`: the issuer ID;
   - `ASC_KEY_P8`: the whole contents of the `.p8` file, including the
     `BEGIN`/`END PRIVATE KEY` lines.

   Environment secrets reach only a job that names the environment, and
   GitHub never gives secrets to fork pull requests.

### Uploading a build

Go to Actions → **App Store upload** → *Run workflow*, keep the branch on
`master`, and pick `both`, `ios` or `mac` (`ios` includes the App Clip, which
cannot be uploaded apart from it). A run started from any other branch
fails at its first step. Two runs never overlap: a second one waits for the
first to finish.

Every upload needs a **new build number**, and the build number is the commit
count of `master`. Merging a PR to `master` provides one (and
`bump-version.yml` then adds its own commit). Running the workflow again on
the same commit uploads a build number App Store Connect already has, and
the upload is rejected. To retry a failed upload, merge something first.
The iOS and Mac builds of one run share a build number. That is allowed,
because App Store Connect numbers each platform separately.

The build appears in **App Store Connect → TestFlight** once Apple has
processed it, which takes from a few minutes to an hour. Processing problems
come by email. To release, open the app's iOS or macOS version page in App
Store Connect, select the build, and **Add for Review**.

### Screenshots

The version page also asks for screenshots. `npm run store-screenshots` in
`web/` renders ten of them for each slot into `app-store-screenshots/<slot>/`
(git-ignored), at sizes App Store Connect accepts:

| Folder | Slot | Pixels |
|---|---|---|
| `iphone-6.9` | iPhone 6.9" display | 1320 × 2868 |
| `iphone-6.3` | iPhone 6.1" / 6.3" display | 1206 × 2622 |
| `iphone-duo` | iPhone Duo | 2007 × 2853 |
| `ipad` | iPad 13" display | 2064 × 2752 |
| `mac` | Mac | 2880 × 1800 |
| `header` | iOS product page header | 5244 × 2950, 3840 × 1646 |
| `search-results` | iOS search results | 5244 × 2950, 3840 × 2560, 1920 × 1280 |
| `app-clip` | App Clip card image | 1800 × 1200 (JPEG) |

The last two are artwork, not device screenshots, and follow Apple's
[asset best practices](https://developer.apple.com/app-store/asset-best-practices/):
one clear idea, the focal point centred so no device crops it, and any text a
short phrase. The header is a row of real boards with no words. The search
card is three of the iPhone shots under one line, `SEARCH_HEADLINE` in the
script. It is English, so it needs translating if the app is ever localised.
Both are composed on the app's own Sand page with its chrome hidden. The App
Clip card is the clip's own board in play, on that page, with no words — the
card prints its title and subtitle under the image — and is a JPEG because the
card takes no transparency.

Every shot uses the look a new player first sees: the Sand theme, the light
scheme, and no patterned page. The script builds the packaged bundle
(`VITE_PACKAGED=1`) and stages each board through the `window.__ms` seam, as
the README gallery does. Each device runs the layout it really gets, so the
iPad and the Mac show the two-pane menu. The scenes are listed at the top of
`web/scripts/make-store-screenshots.mts`. `DEVICES=iphone-6.3` or
`SHOTS=01-sphere` renders a subset.
