/// <reference types="vite/client" />

// Build-time constants the shared preset (packages/vite-preset) defines: this
// game's package.json version, the short commit on a CI build (empty locally),
// and whether this is the bundle packaged inside an app (VITE_PACKAGED=1), which
// has no server to check for updates against.
declare const __APP_VERSION__: string;
declare const __APP_COMMIT__: string;
declare const __APP_PACKAGED__: boolean;
// Where a player can go for more (packages/vite-preset, `outwardLinks`): the
// shared site with every game on it (site/site.json), and this game's App Store
// page (packaging.json `appStore` — none yet). Null in a packaged build, which
// links out to nothing, so the home screen and the sidebar leave them out.
declare const __GAMES_SITE_URL__: string | null;
declare const __APP_STORE_URL__: string | null;
