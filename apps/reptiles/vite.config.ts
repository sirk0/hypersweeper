import { gameConfig, STAMP_FILE } from "@tiling/vite-preset";
import { defineConfig } from "vite";

// The build every game shares is `@tiling/vite-preset` (packages/vite-preset):
// the VITE_BASE / VITE_PACKAGED / VITE_NO_SW flags, `__APP_VERSION__` and the
// rest, the version stamp, the link-preview tags, public/_headers on the dev
// and preview servers, and the PWA. What follows is Rep-tiles' own: where it is
// deployed (the `rep-tiles` Cloudflare Pages project, see wrangler.toml) and its
// web manifest.
//
// The geometry (`@tiling/geometry`, packages/geometry) and the shared data
// (`@tiling/data`, data/) are npm workspace packages, so nothing here aliases
// them; the dev server may serve their files because Vite's default
// `server.fs.allow` is the workspace root — the repo root.

const DESCRIPTION =
  "Cover the board, tile by tile: a drag-and-drop puzzle on the uniform and Laves tilings.";

export default defineConfig(
  gameConfig({
    configUrl: import.meta.url,
    name: "Rep-tiles",
    // A text-only link card: there is no public/og.png (yet), so no imageAlt.
    site: { url: "https://rep-tiles.pages.dev/", description: DESCRIPTION },
    pwa: {
      registerType: "autoUpdate",
      includeAssets: ["favicon.svg", "apple-touch-icon.png"],
      manifest: {
        name: "Rep-tiles",
        short_name: "Rep-tiles",
        description: DESCRIPTION,
        theme_color: "#f4f1ea",
        background_color: "#f4f1ea",
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
        // The version stamp names the build the *server* is on; a copy in the
        // precache could only ever name the build that installed the worker.
        // Keeping workbox's own default beside it.
        globIgnores: ["**/node_modules/**/*", STAMP_FILE],
      },
    },
    overrides: {
      build: { target: "es2022", sourcemap: false },
      server: {
        // Hypersweeper's dev server is 5173; this one runs beside it.
        port: 5174,
        strictPort: true,
      },
      preview: { port: 4174, strictPort: true },
    },
  }),
);
