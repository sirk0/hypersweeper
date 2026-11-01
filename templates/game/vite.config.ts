import { gameConfig, STAMP_FILE } from "@tiling/vite-preset";
import { defineConfig } from "vite";

// The build every game shares is `@tiling/vite-preset` (packages/vite-preset):
// the VITE_BASE / VITE_PACKAGED / VITE_NO_SW flags, `__APP_VERSION__` and the
// rest, the version stamp, the link-preview tags, public/_headers on the dev
// and preview servers, and the PWA. What follows is __TITLE__'s own: where it
// is deployed (wrangler.toml names the Pages project) and its web manifest.

const DESCRIPTION = "__TITLE__: a game on the shared tilings.";

export default defineConfig(
  gameConfig({
    configUrl: import.meta.url,
    name: "__TITLE__",
    // A text-only link card until there is a public/og.png (then add imageAlt).
    site: { url: "https://__KEY__.pages.dev/", description: DESCRIPTION },
    pwa: {
      registerType: "autoUpdate",
      includeAssets: ["favicon.svg", "apple-touch-icon.png"],
      manifest: {
        name: "__TITLE__",
        short_name: "__TITLE__",
        description: DESCRIPTION,
        theme_color: "#f4f2ee",
        background_color: "#f4f2ee",
        display: "standalone",
        orientation: "any",
        icons: [
          { src: "icons/icon-192.png", sizes: "192x192", type: "image/png" },
          { src: "icons/icon-512.png", sizes: "512x512", type: "image/png" },
          {
            src: "icons/maskable-512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "maskable",
          },
        ],
      },
      workbox: {
        globPatterns: ["**/*.{js,css,html,svg,png,json}"],
        // The version stamp names the build the *server* is on; a precached
        // copy could only ever name the build that installed the worker.
        globIgnores: ["**/node_modules/**/*", STAMP_FILE],
      },
    },
    overrides: {
      build: { target: "es2022", sourcemap: false },
      // A port of its own, so its smoke test can run beside the other games'.
      preview: { port: __PORT__, strictPort: true },
    },
  }),
);
