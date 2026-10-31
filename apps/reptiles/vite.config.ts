import { gameConfig } from "@tiling/vite-preset";
import { defineConfig } from "vite";

// The build every game shares is `@tiling/vite-preset` (packages/vite-preset):
// the VITE_BASE / VITE_PACKAGED / VITE_NO_SW flags, `__APP_VERSION__` and the
// rest, and the version stamp. Rep-tiles is not deployed yet, so it sets no
// `site` (the link-preview tags) and no `pwa` (the service worker); both are
// one option away.
//
// The geometry (`@tiling/geometry`, packages/geometry) and the shared data
// (`@tiling/data`, data/) are npm workspace packages, so nothing here aliases
// them; the dev server may serve their files because Vite's default
// `server.fs.allow` is the workspace root — the repo root.
export default defineConfig(
  gameConfig({
    configUrl: import.meta.url,
    name: "Rep-tiles",
    overrides: {
      server: {
        // Hypersweeper's dev server is 5173; this one runs beside it.
        port: 5174,
        strictPort: true,
      },
      preview: { port: 4174, strictPort: true },
    },
  }),
);
