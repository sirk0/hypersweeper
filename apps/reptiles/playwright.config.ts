import { defineConfig, devices } from "@playwright/test";

// Rep-tiles' end-to-end smoke test: the production bundle (`vite build`) served
// by `vite preview`, which is what is deployed — service worker, manifest,
// link-preview tags and, through the shared preset's securityHeaders plugin,
// the real public/_headers policy. A Chromium project; the version is
// @playwright/test's exact pin, shared with Hypersweeper (see "Cloud sessions"
// in the root CLAUDE.md for why it is pinned).
const PORT = 4174;

// Chromium only. CI splits the suite over four runners (packaging.json `ci`,
// game-e2e's `--shard`), each running E2E_WORKERS browsers at once: three on
// a runner's four vCPUs, as Hypersweeper's web-e2e does. Unset, Playwright
// picks its default (half the cores).
const workers = Number(process.env.E2E_WORKERS) || 0;

export default defineConfig({
  testDir: "tests/e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  // Spread rather than assigned: under exactOptionalPropertyTypes an explicit
  // `undefined` is not the same as absent, and absent is what asks for the default.
  ...(workers ? { workers } : {}),
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL: `http://localhost:${PORT}/`,
    trace: "retain-on-failure",
    // The first-run tutorial (src/tutorial.ts) opens in place of home for a
    // player with nothing yet, which every fresh test context is: each starts
    // with it seen, so `/` is home. Its own tests clear this
    // (`test.use({ storageState: … })` in smoke.spec.ts).
    storageState: {
      cookies: [],
      origins: [
        {
          origin: `http://localhost:${PORT}`,
          localStorage: [{ name: "rep-tiles.tutorial", value: '{"seen":true}' }],
        },
      ],
    },
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: `npx vite build && npx vite preview --port ${PORT} --strictPort`,
    url: `http://localhost:${PORT}/`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
