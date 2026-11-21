import { readFileSync } from "node:fs";
import { expect, test, type Locator, type Page } from "@playwright/test";

// The way out to the rest of the games (menu.ts `appStoreBadge`,
// `moreGamesLink`): Apple's App Store badge and the link to the site with every
// game on it — under the phone home page's rows, and in the desktop sidebar's
// footer, More games above How to play and the badge under Settings — and
// Safari's own App Store banner, the `apple-itunes-app` meta tag. Both links
// come from the files that already hold them — packaging.json's `appStore`,
// the same link the landing page's card carries, and site/site.json's `url` —
// through the shared Vite preset, which leaves them out of a packaged build.

const read = (path: string) => JSON.parse(readFileSync(new URL(path, import.meta.url), "utf8"));
const APP_STORE: string = read("../../packaging.json").appStore;
const GAMES_SITE: string = read("../../../../site/site.json").url;

async function boot(page: Page): Promise<void> {
  await page.goto("/");
  await expect(page.locator("body[data-ready]")).toBeVisible();
}

// The sidebar is built at every width and hidden on a phone, so each link has
// a copy there too: the one on screen is the one that counts.
const badge = (page: Page) => page.locator('[data-action="app-store"]:visible');
const games = (page: Page) => page.locator('[data-action="more-games"]:visible');

const box = async (locator: Locator) => (await locator.boundingBox())!;

async function expectLinks(page: Page): Promise<void> {
  await expect(badge(page)).toHaveCount(1);
  await expect(badge(page)).toHaveAttribute("href", APP_STORE);
  await expect(badge(page)).toHaveAttribute("target", "_blank");
  // Apple's badge, from this origin, drawn at Apple's 40px minimum.
  const img = badge(page).locator("img");
  await expect(img).toHaveAttribute("alt", "Download on the App Store");
  const drawn = await img.evaluate((el: HTMLImageElement) => ({
    src: new URL(el.src).origin,
    loaded: el.complete && el.naturalWidth > 0,
    height: el.getBoundingClientRect().height,
  }));
  expect(drawn).toEqual({ src: new URL(page.url()).origin, loaded: true, height: 40 });

  await expect(games(page)).toHaveCount(1);
  await expect(games(page)).toHaveAttribute("href", GAMES_SITE);
  await expect(games(page)).toHaveAttribute("target", "_blank");
}

test.describe("links to the other games", () => {
  test("the phone home page ends in one row: More games left, the badge right", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await boot(page);
    await expectLinks(page);
    // Under the home page's last row, and above the difficulty pills — once
    // scrolled to: a phone this short scrolls the page, as it does for the
    // favourites (and Safari's toolbars make it shorter still).
    const promo = page.locator(".menu-promo:visible");
    await promo.scrollIntoViewIfNeeded();
    const custom = await box(page.locator('.menu-entry[data-group="custom"]'));
    const store = await box(badge(page));
    const more = await box(games(page));
    const pills = await box(page.locator(".menu-difficulty-block"));
    expect(store.y).toBeGreaterThanOrEqual(custom.y + custom.height);
    expect(more.y).toBeGreaterThanOrEqual(custom.y + custom.height);
    expect(Math.max(store.y + store.height, more.y + more.height)).toBeLessThanOrEqual(pills.y);
    // One row: centred on one line, More games first, the badge's edge on the
    // rows' right edge.
    expect(Math.abs(more.y + more.height / 2 - (store.y + store.height / 2))).toBeLessThan(2);
    expect(more.x + more.width).toBeLessThanOrEqual(store.x);
    expect(Math.abs(store.x + store.width - (custom.x + custom.width))).toBeLessThan(1);
    // Only on the home page: a page it opens has neither.
    await page.locator('.menu-entry[data-group="custom"]').click();
    await expect(page.locator('.menu-body [data-action="back"]').first()).toBeVisible();
    await expect(badge(page)).toHaveCount(0);
    await expect(games(page)).toHaveCount(0);
  });

  test("the desktop sidebar: More games above How to play, the badge under Settings", async ({
    page,
  }) => {
    await boot(page);
    await expectLinks(page);
    const footer = page.locator(".menu-sidebar-footer");
    await expect(footer.locator('[data-action="app-store"]')).toBeVisible();
    await expect(footer.locator('[data-action="more-games"]')).toBeVisible();
    const order = async () => {
      const more = await box(footer.locator('[data-action="more-games"]'));
      const help = await box(footer.locator('[data-action="help"]'));
      const settings = await box(footer.locator('[data-action="settings"]'));
      const store = await box(footer.locator('[data-action="app-store"]'));
      expect(more.y + more.height).toBeLessThanOrEqual(help.y);
      expect(store.y).toBeGreaterThanOrEqual(settings.y + settings.height);
    };
    await order();
    // Crossing to a phone and back moves How to play and Settings out of the
    // footer and in again, appended; the badge stays under them.
    await page.setViewportSize({ width: 390, height: 844 });
    await expect(page.locator(".menu-sidebar")).toBeHidden();
    await page.setViewportSize({ width: 1280, height: 720 });
    await expect(footer.locator('[data-action="settings"]')).toBeVisible();
    await order();
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
