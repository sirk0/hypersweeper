import { fileURLToPath, URL } from "node:url";
import { defineConfig } from "vite";

// The geometry is Hypersweeper's: `@boards` is apps/hypersweeper/src/boards,
// read in place rather than copied, and `@data` the shared data/*.json some of
// those modules import. Both live outside this package; the dev server may
// serve them because Vite's default `server.fs.allow` is the npm workspace
// root — the repo root, whose package.json lists apps/*.
export const alias = {
  "@boards": fileURLToPath(new URL("../hypersweeper/src/boards", import.meta.url)),
  "@data": fileURLToPath(new URL("../../data", import.meta.url)),
};

export default defineConfig({
  resolve: { alias },
  server: {
    // Hypersweeper's dev server is 5173; this one runs beside it.
    port: 5174,
    strictPort: true,
  },
  preview: { port: 4174, strictPort: true },
});
