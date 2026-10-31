import { fileURLToPath, URL } from "node:url";
import { defineConfig } from "vite";

// The geometry is Hypersweeper's: `@boards` is web/src/boards, read in place
// rather than copied, and `@data` the shared data/*.json some of those modules
// import. Both live outside this package, so the dev server has to be allowed
// to serve them.
export const alias = {
  "@boards": fileURLToPath(new URL("../web/src/boards", import.meta.url)),
  "@data": fileURLToPath(new URL("../data", import.meta.url)),
};

export default defineConfig({
  resolve: { alias },
  server: {
    // Hypersweeper's dev server is 5173; this one runs beside it.
    port: 5174,
    strictPort: true,
    fs: { allow: [".", alias["@boards"], alias["@data"]] },
  },
  preview: { port: 4174, strictPort: true },
});
