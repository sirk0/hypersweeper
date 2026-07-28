import { createRequire } from "node:module";
import { fileURLToPath, URL } from "node:url";
import { defineConfig } from "vite";
import { VitePWA } from "vite-plugin-pwa";

// The settings screen reports which build is running. The version comes from
// package.json — the bump-version workflow rewrites it (and pyproject.toml) on
// every push to master, so it names a deployed build exactly; the short commit
// pins it further on CI builds and is empty locally.
const pkg = createRequire(import.meta.url)("./package.json") as { version: string };

// The TypeScript build mounts under `/next/` on GitHub Pages during the
// transition (the pygbag build keeps the site root). CI passes the full
// Pages path via VITE_BASE (e.g. "/minesweeper-tiles/next/"); locally and
// under Playwright preview the default "/" keeps deep links simple.
const base = process.env.VITE_BASE ?? "/";

export default defineConfig({
  base,
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
    __APP_COMMIT__: JSON.stringify((process.env.GITHUB_SHA ?? "").slice(0, 7)),
  },
  // Allow importing the repo-root `data/` directory (shared JSON that both
  // the Python and TypeScript apps read — see docs/plans). `@data` resolves
  // there so imports read `@data/ui/screens.json`.
  resolve: {
    alias: {
      "@data": fileURLToPath(new URL("../data", import.meta.url)),
    },
  },
  server: {
    fs: { allow: [".", fileURLToPath(new URL("../data", import.meta.url))] },
  },
  plugins: [
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["favicon.svg", "apple-touch-icon.png"],
      manifest: {
        name: "Minesweeper Tiles",
        short_name: "Minesweeper",
        description:
          "Minesweeper over exotic boards — flat tilings and 3D surfaces.",
        theme_color: "#f2f2f7",
        background_color: "#f2f2f7",
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
        globPatterns: ["**/*.{js,css,html,svg,png,woff2,json}"],
      },
    }),
  ],
  build: {
    target: "es2022",
    sourcemap: false,
  },
});
