import { createRequire } from "node:module";
import { expect, test, type Page } from "@playwright/test";

// The settings page: the gear on the menu, the theme picker, the animations
// toggle and the About block. Themes are asserted through the computed CSS
// custom properties rather than by screenshot — they are the thing the theme
// actually sets, and they survive the anti-aliasing noise a software-WebGL
// screenshot carries.

const pkg = createRequire(import.meta.url)("../../package.json") as { version: string };

function cssVar(page: Page, name: string): Promise<string> {
  return page.evaluate(
    (n) => getComputedStyle(document.documentElement).getPropertyValue(n).trim(),
    name,
  );
}

test.describe("settings", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await expect(page.locator("body[data-ready]")).toBeVisible();
  });

  test("the gear opens settings and back returns to the menu", async ({ page }) => {
    await expect(page.locator('.menu-entry[data-group="flat"]')).toBeVisible();
    await page.locator('.menu-settings-btn[data-action="settings"]').click();

    await expect(page.locator(".settings-heading").first()).toHaveText("Appearance");
    // The difficulty row is meaningless on this page.
    await expect(page.locator(".menu-difficulty")).toBeHidden();
    await expect(page.locator('.menu-entry[data-group="flat"]')).toHaveCount(0);

    await page.locator('.menu-entry[data-action="back"]').click();
    await expect(page.locator('.menu-entry[data-group="flat"]')).toBeVisible();
    await expect(page.locator(".menu-difficulty")).toBeVisible();
  });

  test("reports the build version from package.json", async ({ page }) => {
    await page.locator(".menu-settings-btn").click();
    const version = page.locator('[data-value="version"]');
    // Locally the commit is empty, so the text is the bare version; in CI it
    // reads "0.2.25 (abc1234)".
    await expect(version).toContainText(pkg.version);
  });

  test("the theme row reports the current theme and opens the picker", async ({ page }) => {
    await page.locator(".menu-settings-btn").click();
    const row = page.locator('.menu-entry[data-settings-group="theme"]');
    await expect(row).toContainText("Theme");
    await expect(row).toContainText("Minimal iOS"); // the current one, as a subtitle
    // The seven palettes are a page of their own, not spelled out here.
    await expect(page.locator(".menu-entry[data-theme]")).toHaveCount(0);

    await row.click();
    await expect(page.locator(".menu-entry[data-theme]")).toHaveCount(7);
    await expect(page.locator('.menu-entry[data-action="back"]')).toContainText("Theme");

    // Back lands on settings, not the root menu, and the row has followed.
    await page.locator('.menu-entry[data-theme="paper"]').click();
    await page.locator('.menu-entry[data-action="back"]').click();
    await expect(page.locator('.menu-entry[data-settings-group="theme"]')).toContainText(
      "Warm Paper",
    );
  });

  test("picking a theme re-skins the chrome and survives a reload", async ({ page }) => {
    await page.locator(".menu-settings-btn").click();
    expect(await cssVar(page, "--bg")).toBe("#f2f2f7"); // the ios default

    await page.locator('.menu-entry[data-settings-group="theme"]').click();
    await page.locator('.menu-entry[data-theme="dark"]').click();
    expect(await cssVar(page, "--bg")).toBe("#101014");
    expect(await cssVar(page, "--panel")).toBe("#1c1c22");
    await expect(page.locator('.menu-entry[data-theme="dark"]')).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    await expect(page.locator('html')).toHaveAttribute("data-theme", "dark");
    // The browser chrome follows too.
    await expect(page.locator('meta[name="theme-color"]')).toHaveAttribute(
      "content",
      "#101014",
    );

    await page.reload();
    await expect(page.locator("body[data-ready]")).toBeVisible();
    expect(await cssVar(page, "--bg")).toBe("#101014");
  });

  test("every theme applies a complete palette", async ({ page }) => {
    await page.locator(".menu-settings-btn").click();
    await page.locator('.menu-entry[data-settings-group="theme"]').click();
    const keys = await page
      .locator(".menu-entry[data-theme]")
      .evaluateAll((els) => els.map((e) => (e as HTMLElement).dataset["theme"] ?? ""));
    expect(keys.length).toBeGreaterThanOrEqual(7);
    for (const key of keys) {
      await page.locator(`.menu-entry[data-theme="${key}"]`).click();
      for (const name of ["--bg", "--panel", "--text", "--accent", "--counter-bg"]) {
        expect(await cssVar(page, name), `${key} ${name}`).not.toBe("");
      }
    }
  });

  test("the animations toggle persists across a reload", async ({ page }) => {
    await page.locator(".menu-settings-btn").click();
    const toggle = page.locator('.menu-entry[data-setting="animations"]');
    // The suite runs under emulated reduced motion, so the OS default is off.
    await expect(toggle).toHaveAttribute("aria-checked", "false");

    await toggle.click();
    await expect(toggle).toHaveAttribute("aria-checked", "true");

    await page.reload();
    await expect(page.locator("body[data-ready]")).toBeVisible();
    await page.locator(".menu-settings-btn").click();
    await expect(page.locator('.menu-entry[data-setting="animations"]')).toHaveAttribute(
      "aria-checked",
      "true",
    );
  });

  test("the update check reports a result", async ({ page }) => {
    await page.locator(".menu-settings-btn").click();
    await page.locator('.menu-entry[data-action="check-updates"]').click();
    // Whatever the outcome (no service worker under `vite preview`, or an
    // up-to-date one), the button must say something rather than hang.
    await expect(page.locator(".settings-status")).not.toBeEmpty();
  });

  test("a theme survives launching a board", async ({ page }) => {
    await page.locator(".menu-settings-btn").click();
    await page.locator('.menu-entry[data-settings-group="theme"]').click();
    await page.locator('.menu-entry[data-theme="classic"]').click();
    await page.locator('.menu-entry[data-action="back"]').click(); // to settings
    await page.locator('.menu-entry[data-action="back"]').click(); // to the root
    await page.locator('.menu-entry[data-mode="square"]').click();

    const state = await page.evaluate(() => window.__ms?.state());
    expect(state?.screen).toBe("game");
    // The header counters read the theme's LED box colour.
    expect(await cssVar(page, "--counter-bg")).toBe("#18181a");
  });
});

test.describe("difficulty persistence", () => {
  test("the chosen difficulty survives a reload and launches boards", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator("body[data-ready]")).toBeVisible();
    await expect(page.locator('.difficulty-btn[data-key="medium"]')).toHaveClass(/active/);

    await page.locator('.difficulty-btn[data-key="hard"]').click();
    await page.reload();
    await expect(page.locator("body[data-ready]")).toBeVisible();
    await expect(page.locator('.difficulty-btn[data-key="hard"]')).toHaveClass(/active/);
    await expect(page.locator('.difficulty-btn[data-key="medium"]')).not.toHaveClass(/active/);

    await page.locator('.menu-entry[data-mode="square"]').click();
    const state = await page.evaluate(() => window.__ms?.state());
    expect(state?.difficulty).toBe("hard");
  });

  test("a deep link with no difficulty uses the stored one", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator("body[data-ready]")).toBeVisible();
    await page.locator('.difficulty-btn[data-key="easy"]').click();

    await page.goto("/?mode=hex");
    await expect(page.locator("body[data-ready]")).toBeVisible();
    expect((await page.evaluate(() => window.__ms?.state()))?.difficulty).toBe("easy");

    // An explicit one in the link still wins, and does not overwrite the stored
    // preference.
    await page.goto("/?mode=hex&difficulty=hard");
    await expect(page.locator("body[data-ready]")).toBeVisible();
    expect((await page.evaluate(() => window.__ms?.state()))?.difficulty).toBe("hard");
    await page.goto("/");
    await expect(page.locator("body[data-ready]")).toBeVisible();
    await expect(page.locator('.difficulty-btn[data-key="easy"]')).toHaveClass(/active/);
  });
});
