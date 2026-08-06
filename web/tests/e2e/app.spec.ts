import { expect, test } from "@playwright/test";

// Boot + menu navigation + the test seam.
test.describe("M1 app", () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 900, height: 700 });
    await page.goto("/");
    await expect(page.locator("body[data-ready]")).toBeVisible();
  });

  test("starts on the menu with the HUD hidden", async ({ page }) => {
    await expect(page.locator(".menu-title")).toBeVisible();
    await expect(page.locator(".hud")).toBeHidden();
    const state = await page.evaluate(() => window.__ms?.state());
    expect(state?.screen).toBe("menu");
  });

  test("menu launches a flat board at the chosen difficulty", async ({ page }) => {
    await page.locator('.difficulty-btn[data-key="easy"]').click();
    await page.locator('.menu-entry[data-group="custom"]').click();
    await page.locator('.menu-entry[data-group="flat"]').click();
    // the regular tilings sit at the top of the picker, not in a submenu
    await page.locator('.menu-entry[data-mode="square"]').click();
    const state = await page.evaluate(() => window.__ms?.state());
    expect(state?.screen).toBe("game");
    expect(state?.mode).toBe("square");
    expect(state?.difficulty).toBe("easy");
    expect(state?.cellCount).toBe(81); // 9x9 easy
    await expect(page.locator(".hud-smiley")).toBeVisible();
  });

  test("menu drills into the aperiodic family to launch Penrose", async ({ page }) => {
    await page.locator('.difficulty-btn[data-key="easy"]').click();
    await page.locator('.menu-entry[data-group="custom"]').click();
    await page.locator('.menu-entry[data-group="flat"]').click();
    await page.locator('.menu-entry[data-submenu="aperiodic"]').click();
    await page.locator('.menu-entry[data-mode="penrose"]').click();
    const state = await page.evaluate(() => window.__ms?.state());
    expect(state?.screen).toBe("game");
    expect(state?.mode).toBe("penrose");
    expect(state?.cellCount).toBe(60); // easy Penrose keeps 60 rhombi
  });

  // The home page's two one-tap entries. Which board they deal is random, so
  // what is pinned is that a board opens and that it came from the right half
  // of the catalogue: the Flat pool builds flat boards, the 3D pool solids.
  test("the home Flat row deals a random flat board", async ({ page }) => {
    await page.locator('.difficulty-btn[data-key="easy"]').click();
    await page.locator('.menu-entry[data-random="flat"]').click();
    const state = await page.evaluate(() => window.__ms?.state());
    expect(state?.screen).toBe("game");
    expect(state?.difficulty).toBe("easy");
    expect(state?.is3d).toBe(false);
    await expect(page).toHaveURL(new RegExp(`\\?mode=${state?.mode}&difficulty=easy$`));
    await expect(page.locator(".hud-smiley")).toBeVisible();
  });

  test("the home 3D row deals a random board off the plane", async ({ page }) => {
    await page.locator('.difficulty-btn[data-key="easy"]').click();
    await page.locator('.menu-entry[data-random="3d"]').click();
    const state = await page.evaluate(() => window.__ms?.state());
    expect(state?.screen).toBe("game");
    expect(state?.is3d).toBe(true);
    await expect(page).toHaveURL(new RegExp(`\\?mode=${state?.mode}&difficulty=easy$`));
  });

  // The app was deployed under /next/ while the pygame build held the site
  // root; that page (web/public/next/index.html) is now a redirect, and a
  // shared link from back then must still open its board.
  test("the legacy /next/ path redirects to the app, parameters and all", async ({
    page,
  }) => {
    await page.goto("/next/?mode=hex&difficulty=easy&seed=7");
    await expect(page.locator("body[data-ready]")).toBeVisible();
    expect(new URL(page.url()).pathname).toBe("/");
    const state = await page.evaluate(() => window.__ms?.state());
    expect(state?.mode).toBe("hex");
    expect(state?.difficulty).toBe("easy");
  });

  test("deep link starts a specific board", async ({ page }) => {
    await page.goto("/?mode=hex&difficulty=easy&seed=7");
    await expect(page.locator("body[data-ready]")).toBeVisible();
    const state = await page.evaluate(() => window.__ms?.state());
    expect(state?.mode).toBe("hex");
    expect(state?.difficulty).toBe("easy");
    expect(state?.cellCount).toBe(99);
  });
});
