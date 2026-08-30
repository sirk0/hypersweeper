import { defineConfig, devices } from "@playwright/test";

// M0 e2e/visual proof. Runs against the production build via `vite preview`.
// Visual comparisons are only authoritative under deterministic software WebGL
// (SwiftShader) — the same launch args are used in CI so baselines match.
const PORT = 4173;

// In Claude cloud sessions Chromium is preinstalled; honour PLAYWRIGHT path env
// if set, otherwise let Playwright resolve its managed browser.
const executablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE || undefined;

/** A millisecond budget, overridable from the environment.
 *
 * The three below are Playwright's own defaults, written out so one place can
 * raise them. `docker-compose.e2e.yml` raises all three: it runs x86-64
 * Chromium under emulation on an Apple Silicon Mac, where everything costs
 * roughly twice the wall clock of a native runner — and the Realistic gallery
 * shots are full-frame turbulence under SwiftShader, the slowest thing here.
 * The expect budget is the one that bites first: it is what `toHaveScreenshot`
 * has to capture, settle and compare a 700 KB shot inside, and 5 s is already
 * only about twice what that costs natively. */
const budget = (name: string, fallback: number) =>
  Number(process.env[name]) || fallback;

export default defineConfig({
  testDir: "tests/e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  timeout: budget("PLAYWRIGHT_TEST_TIMEOUT_MS", 30_000),
  // On CI: inline annotations on the run, plus the HTML report the workflow
  // uploads as an artifact. Without the html reporter nothing writes
  // `playwright-report/`, and the upload step warned "No files were found with
  // the provided path" on every green run — so a failure had no report either.
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : "list",
  expect: {
    // The whole assertion's budget: `toHaveScreenshot` has no timeout of its
    // own, and this is what it captures, settles and compares inside.
    timeout: budget("PLAYWRIGHT_EXPECT_TIMEOUT_MS", 5_000),
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
    timeout: budget("PLAYWRIGHT_WEBSERVER_TIMEOUT_MS", 120_000),
  },
});
