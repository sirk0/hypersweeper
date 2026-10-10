// Build-time constants substituted by Vite's `define` (see vite.config.ts).
// The version tracks `web/package.json`, which the bump-version workflow keeps
// in lockstep with `pyproject.toml` on every push to master, so it identifies a
// deployed build exactly. The commit is the short SHA when built in CI and an
// empty string locally.
declare const __APP_VERSION__: string;
declare const __APP_COMMIT__: string;
// True in a bundle that ships inside an app — the macOS shell or the iOS app
// (VITE_PACKAGED=1). Such a build has no service worker and no server to update
// from, so the settings page leaves out the update check rather than offering
// one that cannot work.
declare const __APP_PACKAGED__: boolean;
// True in a build that carries the anonymous play counter (VITE_ANALYTICS=1,
// and never in a packaged one). Only the Cloudflare deploy has the Pages
// Function the counter posts to, so every other build leaves it out entirely
// rather than posting into a 404 the browser then logs. See "Analytics" in
// web/README.md.
declare const __APP_ANALYTICS__: boolean;
// Where this build is hosted: "site" (the Cloudflare deploy, the default) or
// "itch" (the itch.io zip, VITE_SOURCE=itch). Reported with every event, so the
// dashboards can tell the two apart.
declare const __APP_SOURCE__: "site" | "itch";
// The collector's absolute URL for a build hosted away from it (the itch.io
// zip), or "" for the ordinary same-origin post.
declare const __APP_TALLY_URL__: string;
