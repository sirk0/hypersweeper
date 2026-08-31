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
    // An easy board is about the size of the classic easy board (81 cells) --
    // the calibrated convention, so the exact count moves when a board is
    // retuned and pinning it here would only rot.
    expect(state?.cellCount).toBeGreaterThan(60);
    expect(state?.cellCount).toBeLessThan(105);
  });

  // The home page's two *launch* rows open one particular board with no
  // drilling. Classic is covered by the flat-board test above, which reaches
  // `square` the long way through Custom; this pins the short way, and that
  // the board it opens is the volume one rather than the Volumes group page.
  test("the home Volumetric row opens the cube of cubes outright", async ({ page }) => {
    await page.locator('.difficulty-btn[data-key="easy"]').click();
    await page.locator('.menu-entry[data-mode="cube3d"]').click();
    const state = await page.evaluate(() => window.__ms?.state());
    expect(state?.screen).toBe("game");
    expect(state?.mode).toBe("cube3d");
    expect(state?.difficulty).toBe("easy");
    expect(state?.is3d).toBe(true);
    expect(state?.cellCount).toBe(64); // 4x4x4 easy
    await expect(page.locator(".hud-smiley")).toBeVisible();
  });

  // ...and the two *random* ones. Which board they deal is random, so
  // what is pinned is that a board opens and that it came from the right half
  // of the catalogue: the Flat pool builds flat boards, the 3D pool solids.
  test("the home Flat row deals a random flat board", async ({ page }) => {
    await page.locator('.difficulty-btn[data-key="easy"]').click();
    await page.locator('.menu-entry[data-random="flat"]').click();
    const state = await page.evaluate(() => window.__ms?.state());
    expect(state?.screen).toBe("game");
    expect(state?.difficulty).toBe("easy");
    expect(state?.is3d).toBe(false);
    await expect(page).toHaveURL(new RegExp(`\\?mode=${state?.mode}&difficulty=easy&seed=\\d+$`));
    await expect(page.locator(".hud-smiley")).toBeVisible();
  });

  test("the home 3D row deals a random board off the plane", async ({ page }) => {
    await page.locator('.difficulty-btn[data-key="easy"]').click();
    await page.locator('.menu-entry[data-random="3d"]').click();
    const state = await page.evaluate(() => window.__ms?.state());
    expect(state?.screen).toBe("game");
    expect(state?.is3d).toBe(true);
    await expect(page).toHaveURL(new RegExp(`\\?mode=${state?.mode}&difficulty=easy&seed=\\d+$`));
  });

  test("deep link starts a specific board", async ({ page }) => {
    await page.goto("/?mode=hex&difficulty=easy&seed=7");
    await expect(page.locator("body[data-ready]")).toBeVisible();
    const state = await page.evaluate(() => window.__ms?.state());
    expect(state?.mode).toBe("hex");
    expect(state?.difficulty).toBe("easy");
    // as above: an easy board is sized against the classic easy board
    expect(state?.cellCount).toBeGreaterThan(60);
    expect(state?.cellCount).toBeLessThan(105);
  });

  test("a board that cannot be won opens an explanation, not a game", async ({
    page,
  }) => {
    // The triakis tilings put every cell in a look-alike pair, so no number can
    // ever separate one: measured, they are won under one time in a hundred at
    // every difficulty. Their rows stay in the menu -- the catalogue should not
    // lie about which tilings are built -- but they are marked, dimmed, and say
    // why instead of dealing a board (src/boards/fairness.ts).
    await page.locator('.menu-entry[data-group="custom"]').click();
    await page.locator('.menu-entry[data-group="flat"]').click();
    await page.locator('.menu-entry[data-submenu="dual"]').click();
    const row = page.locator('.menu-entry[data-mode="triakis"]');
    await expect(row).toHaveAttribute("data-fairness", "blocked");
    await row.click();

    await expect(page.locator(".menu-blocked")).toBeVisible();
    await expect(page.locator(".menu-blocked-body")).toContainText("look-alike");
    expect((await page.evaluate(() => window.__ms?.state()))?.screen).toBe("menu");
  });

  test("a link to a board that cannot be won lands on the menu", async ({ page }) => {
    // Nothing stops someone pasting one, and opening a board that cannot be
    // finished is worse than showing the menu.
    await page.goto("/?mode=triakis&difficulty=easy&seed=1");
    await expect(page.locator("body[data-ready]")).toBeVisible();
    expect((await page.evaluate(() => window.__ms?.state()))?.screen).toBe("menu");
  });
});

// Deliberately outside the describe above, which is what makes this test
// deterministic: its beforeEach loads the app at "/", and that registers the
// root-scoped service worker, whose navigation fallback then answers *every*
// navigation — /next/ included — from the precache with index.html. The app
// would boot at the /next/ URL and the redirect under test would never run.
// Which of the two happens is a race between the worker installing and the
// test navigating, so it passes on a fast machine and fails on a slow one
// (it is how `npm run e2e:docker` fails, where emulation slows the first
// render far more than it slows precaching over loopback). A fresh context has
// no worker at all, which is also the visitor this test is about.
test.describe("M1 legacy paths", () => {
  // The app was deployed under /next/ while the pygame build held the site
  // root; that page (web/public/next/index.html) is now a redirect, and a
  // shared link from back then must still open its board.
  test("the legacy /next/ path redirects to the app, parameters and all", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 900, height: 700 });
    await page.goto("/next/?mode=hex&difficulty=easy&seed=7");
    await expect(page.locator("body[data-ready]")).toBeVisible();
    expect(new URL(page.url()).pathname).toBe("/");
    const state = await page.evaluate(() => window.__ms?.state());
    expect(state?.mode).toBe("hex");
    expect(state?.difficulty).toBe("easy");
  });
});
