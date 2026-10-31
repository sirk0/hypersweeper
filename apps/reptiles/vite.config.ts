import { defineConfig } from "vite";

// The geometry (`@tiling/geometry`, packages/geometry) and the shared data
// (`@tiling/data`, data/) are npm workspace packages, so nothing here aliases
// them; the dev server may serve their files because Vite's default
// `server.fs.allow` is the workspace root — the repo root.
export default defineConfig({
  server: {
    // Hypersweeper's dev server is 5173; this one runs beside it.
    port: 5174,
    strictPort: true,
  },
  preview: { port: 4174, strictPort: true },
});
