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
// Pages path via VITE_BASE (e.g. "/hypersweeper/next/"); locally and
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
        name: "Hypersweeper",
        short_name: "Hypersweeper",
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
    // Three.js is the bulk of the bundle and changes only when the dependency
    // is bumped, so it gets a chunk of its own: an app-code deploy then leaves
    // its hash alone and returning players (and the service worker's precache)
    // re-download only what actually changed.
    rollupOptions: {
      output: {
        manualChunks: { three: ["three"] },
      },
    },
    // Rollup warns over 500 kB per chunk, which the single pre-split bundle
    // tripped (626 kB) — the warning CI carried for every build. The split
    // above is the actual fix (three lands at ~466 kB, the app at ~160 kB), and
    // the raised limit keeps the warning from coming back as the app grows:
    // this is a WebGL game whose renderer is not optional, there is
    // deliberately no size budget here, and a standing warning nobody intends
    // to act on only trains people to ignore the build log.
    chunkSizeWarningLimit: 900,
  },
});
