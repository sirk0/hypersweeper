import { defineConfig, devices } from "@playwright/test";

// M0 e2e/visual proof. Runs against the production build via `vite preview`.
// Visual comparisons are only authoritative under deterministic software WebGL
// (SwiftShader) — the same launch args are used in CI so baselines match.
const PORT = 4173;

// In Claude cloud sessions Chromium is preinstalled; honour PLAYWRIGHT path env
// if set, otherwise let Playwright resolve its managed browser.
const executablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE || undefined;

export default defineConfig({
  testDir: "tests/e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  // On CI: inline annotations on the run, plus the HTML report the workflow
  // uploads as an artifact. Without the html reporter nothing writes
  // `playwright-report/`, and the upload step warned "No files were found with
  // the provided path" on every green run — so a failure had no report either.
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : "list",
  expect: {
    toHaveScreenshot: { maxDiffPixelRatio: 0.05 },
  },
  use: {
    baseURL: `http://localhost:${PORT}/`,
    trace: "on-first-retry",
    // Board animations honour prefers-reduced-motion, so emulating it disables
    // reveal ripples / flag pops / lose shakes across the whole suite —
    // screenshots capture the settled frame and gameplay assertions stay timing
    // independent. Individual specs can still flip them via window.__ms.animations.
    contextOptions: { reducedMotion: "reduce" },
  },
  projects: [
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
        deviceScaleFactor: 1,
        launchOptions: {
          ...(executablePath ? { executablePath } : {}),
          args: [
            "--use-angle=swiftshader",
            "--enable-unsafe-swiftshader",
            "--ignore-gpu-blocklist",
          ],
        },
      },
    },
  ],
  webServer: {
    command: "npm run build && npm run preview -- --port " + PORT + " --strictPort",
    // The anonymous play counter is opt-in per build (see vite.config.ts), and
    // analytics.spec.ts is the suite that drives it. `vite preview` serves no
    // Pages Function, so those posts really 404 — which is deliberate: it is
    // the same thing a host without the Function does, and the spec asserts
    // the game is unaffected by it.
    env: { VITE_ANALYTICS: "1" },
    port: PORT,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
