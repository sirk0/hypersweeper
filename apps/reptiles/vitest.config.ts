import { defineConfig } from "vitest/config";
import { alias } from "./vite.config";

export default defineConfig({
  resolve: { alias },
  test: {
    environment: "node",
    include: ["tests/unit/**/*.test.ts"],
    globals: false,
  },
});
