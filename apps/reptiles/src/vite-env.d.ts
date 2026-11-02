/// <reference types="vite/client" />

// Build-time constants the shared preset (packages/vite-preset) defines: this
// game's package.json version, the short commit on a CI build (empty locally),
// and whether this is the bundle packaged inside an app (VITE_PACKAGED=1), which
// has no server to check for updates against.
declare const __APP_VERSION__: string;
declare const __APP_COMMIT__: string;
declare const __APP_PACKAGED__: boolean;
