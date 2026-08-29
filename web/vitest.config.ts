import { fileURLToPath, URL } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  // The build-time constants vite.config.ts defines. Only the two below reach a
  // unit-testable module: analytics.ts folds its whole transport away when
  // `__APP_ANALYTICS__` is false, so the tests run with the collecting build's
  // values — that is the branch with behaviour to test. The *absence* of the
  // collector from a non-collecting build is asserted by the build instead, in
  // scripts/check-offline-assets.mjs.
  define: {
    __APP_PACKAGED__: false,
    __APP_ANALYTICS__: true,
    // What `update.ts` calls this build when it compares itself with the
    // deployed stamp. Any pair will do — the tests supply the other side.
    __APP_VERSION__: '"0.0.0-test"',
    __APP_COMMIT__: '"testing"',
  },
  resolve: {
    alias: {
      "@data": fileURLToPath(new URL("../data", import.meta.url)),
    },
  },
  test: {
    environment: "node",
    include: ["tests/unit/**/*.test.ts"],
    globals: false,
  },
});
