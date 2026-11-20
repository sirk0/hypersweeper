import { readFileSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";

// The way out to the rest of the games (menu.ts `promoLinks`): the App Store
// banner and the link to the site with every game on it, under the phone home
// page's rows and at the foot of the desktop sidebar; and Safari's own App
// Store banner, the `apple-itunes-app` meta tag. Both links come from the files
// that already hold them — packaging.json's `appStore`, the same link the
// landing page's card carries, and site/site.json's `url` — through the shared
// Vite preset, which leaves them out of a packaged build.

const read = (path: string) => JSON.parse(readFileSync(new URL(path, import.meta.url), "utf8"));
const APP_STORE: string = read("../../packaging.json").appStore;
const GAMES_SITE: string = read("../../../../site/site.json").url;

async function boot(page: Page): Promise<void> {
  await page.goto("/");
  await expect(page.locator("body[data-ready]")).toBeVisible();
}

// The sidebar is built at every width and hidden on a phone, so each page has
// a copy there too: the one on screen is the one that counts.
const promo = (page: Page) => page.locator(".menu-promo:visible");

async function expectLinks(page: Page): Promise<void> {
  await expect(promo(page)).toHaveCount(1);
  const store = promo(page).locator('[data-action="app-store"]');
  await expect(store).toBeVisible();
  await expect(store).toHaveAttribute("href", APP_STORE);
  await expect(store).toHaveAttribute("target", "_blank");
  await expect(store).toContainText("App Store");
  const games = promo(page).locator('[data-action="more-games"]');
  await expect(games).toBeVisible();
  await expect(games).toHaveAttribute("href", GAMES_SITE);
  await expect(games).toHaveAttribute("target", "_blank");
}

test.describe("links to the other games", () => {
  test("the phone home page ends with them, above the difficulty row", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await boot(page);
    await expectLinks(page);
    // Under the home page's last row, and above the difficulty pills — once
    // scrolled to: a phone this short scrolls the page, as it does for the
    // favourites (and Safari's toolbars make it shorter still).
    await promo(page).scrollIntoViewIfNeeded();
    const custom = await page.locator('.menu-entry[data-group="custom"]').boundingBox();
    const links = await promo(page).boundingBox();
    const pills = await page.locator(".menu-difficulty-block").boundingBox();
    expect(links!.y).toBeGreaterThanOrEqual(custom!.y + custom!.height);
    expect(links!.y + links!.height).toBeLessThanOrEqual(pills!.y);
    // Only on the home page: a page it opens has none.
    await page.locator('.menu-entry[data-group="custom"]').click();
    await expect(page.locator('.menu-body [data-action="back"]').first()).toBeVisible();
    await expect(promo(page)).toHaveCount(0);
  });

  test("the desktop sidebar carries them above How to play", async ({ page }) => {
    await boot(page);
    await expectLinks(page);
    const footer = page.locator(".menu-sidebar-footer");
    await expect(footer.locator(".menu-promo")).toBeVisible();
    const links = await footer.locator(".menu-promo").boundingBox();
    const help = await footer.locator('[data-action="help"]').boundingBox();
    expect(links!.y + links!.height).toBeLessThanOrEqual(help!.y);
  });

  test("Safari is told the app's App Store id", async ({ page }) => {
    await boot(page);
    const id = /\/id(\d+)/.exec(APP_STORE)![1];
    await expect(page.locator('meta[name="apple-itunes-app"]')).toHaveAttribute(
      "content",
      `app-id=${id}`,
    );
  });
});
