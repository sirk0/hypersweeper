import { defineConfig, devices } from "@playwright/test";

// Rep-tiles' end-to-end smoke test: the production bundle (`vite build`) served
// by `vite preview`, which is what is deployed — service worker, manifest,
// link-preview tags and, through the shared preset's securityHeaders plugin,
// the real public/_headers policy. One Chromium project; the version is
// @playwright/test's exact pin, shared with Hypersweeper (see "Cloud sessions"
// in the root CLAUDE.md for why it is pinned).
const PORT = 4174;

export default defineConfig({
  testDir: "tests/e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL: `http://localhost:${PORT}/`,
    trace: "retain-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: `npx vite build && npx vite preview --port ${PORT} --strictPort`,
    url: `http://localhost:${PORT}/`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
