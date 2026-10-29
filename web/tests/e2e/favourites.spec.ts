import { expect, test, type Page } from "@playwright/test";

// Favourites and completion marks on the menu: the star on a board row, the
// Favourites section of the home page (phone) and Quick start (desktop), and
// the three bars that say which difficulties a board has been won at. The default viewport is the desktop's; `phone` drops below the
// two-pane breakpoint.

const phone = async (page: Page) => page.setViewportSize({ width: 390, height: 844 });

async function boot(page: Page): Promise<void> {
  await page.goto("/");
  await expect(page.locator("body[data-ready]")).toBeVisible();
}

function seedStars(page: Page, modes: Record<string, { on: boolean; at: number }>) {
  return page.addInitScript(
    (m) => localStorage.setItem("ms:favourites", JSON.stringify({ version: 1, modes: m })),
    modes,
  );
}

const favSection = (page: Page) => page.locator(".menu-fav-list");

test.describe("favourites", () => {
  test("a star on a board page adds the board to the phone home page", async ({ page }) => {
    await phone(page);
    await boot(page);
    // Nothing starred: no section.
    await expect(page.locator(".menu-section-heading")).toHaveCount(0);

    await page.locator('[data-group="custom"]').click();
    await page.locator('.menu-body [data-group="flat"]').click();
    const star = page.locator('.menu-fav[data-fav="hex"]');
    await expect(star).toHaveAttribute("aria-pressed", "false");
    // On a phone row the star sits at the right edge, centred on the row's height.
    const rowBox = await page.locator('.menu-entry[data-mode="hex"]').boundingBox();
    const starBox = await star.boundingBox();
    expect(Math.abs(starBox!.y + starBox!.height / 2 - (rowBox!.y + rowBox!.height / 2))).toBeLessThan(1);
    expect(starBox!.x + starBox!.width).toBeGreaterThan(rowBox!.x + rowBox!.width - 8);
    await star.click();
    await expect(star).toHaveAttribute("aria-pressed", "true");
    // The star only stars: the row's own button is what launches the board.
    expect(await page.evaluate(() => window.__ms?.state().screen)).toBe("menu");

    await page.reload();
    await expect(page.locator("body[data-ready]")).toBeVisible();
    // Back on the home page (a reload opens the menu at its root).
    await expect(page.locator(".menu-section-heading")).toHaveText("Favourites");
    await expect(favSection(page).locator('.menu-entry[data-mode="hex"]')).toBeVisible();

    // Its row launches the board like any other.
    await favSection(page).locator('.menu-entry[data-mode="hex"]').click();
    expect(await page.evaluate(() => window.__ms?.state().mode)).toBe("hex");
  });

  test("unstarring a favourite on the home page takes it off the list", async ({ page }) => {
    await phone(page);
    await seedStars(page, { hex: { on: true, at: 1 }, torus: { on: true, at: 2 } });
    await boot(page);
    const rows = favSection(page).locator(".menu-entry");
    await expect(rows).toHaveCount(2);
    // In the order starred, and named with their surface.
    await expect(rows.nth(1)).toContainText("Torus");

    await favSection(page).locator('.menu-fav[data-fav="hex"]').click();
    await expect(rows).toHaveCount(1);
    await favSection(page).locator('.menu-fav[data-fav="torus"]').click();
    await expect(page.locator(".menu-section-heading")).toHaveCount(0);
    const stored = await page.evaluate(() => localStorage.getItem("ms:favourites"));
    // An unstar is kept as one, dated, so iCloud can tell it from no change.
    expect(JSON.parse(stored!).modes.torus.on).toBe(false);
  });

  test("desktop Quick start lists the favourites as cards", async ({ page }) => {
    await seedStars(page, { trigrid: { on: true, at: 1 }, triakis: { on: true, at: 2 } });
    await boot(page);
    const cards = favSection(page).locator(".menu-board-card");
    // A blocked board cannot be played, so it is left out even when stored.
    await expect(cards).toHaveCount(1);
    await expect(cards.first()).toHaveAttribute("data-mode", "trigrid");
    await expect(favSection(page).locator('.menu-fav[data-fav="trigrid"]')).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });

  test("a blocked board has no star", async ({ page }) => {
    await phone(page);
    await boot(page);
    await page.locator('[data-group="custom"]').click();
    await page.locator('.menu-body [data-group="flat"]').click();
    await page.locator('[data-submenu="dual"]').click();
    await expect(page.locator('.menu-entry[data-mode="triakis"]')).toBeVisible();
    await expect(page.locator('.menu-fav[data-fav="triakis"]')).toHaveCount(0);
  });
});

test.describe("completion marks", () => {
  test("a board shows the difficulties it has been won at", async ({ page }) => {
    await page.addInitScript(() =>
      localStorage.setItem(
        "ms:achievements",
        JSON.stringify({ version: 1, wins: { hex: { easy: 2, hard: 1 } }, shapes: [], flagless: 0 }),
      ),
    );
    await phone(page);
    await boot(page);
    await page.locator('[data-group="custom"]').click();
    await page.locator('.menu-body [data-group="flat"]').click();
    const mark = page.locator('.menu-entry[data-mode="hex"] .menu-done');
    await expect(mark).toHaveAttribute("data-won", "easy hard");
    await expect(mark).toHaveAttribute("aria-label", "Won on Easy and Hard");
    await expect(mark.locator(".menu-done-bar.won")).toHaveCount(2);
    // A board never won carries no mark at all.
    await expect(page.locator('.menu-entry[data-mode="trigrid"] .menu-done')).toHaveCount(0);
  });

  test("a win marks the board it was won on", async ({ page }) => {
    await boot(page);
    await page.evaluate(() => window.__ms?.startBoard("square", "easy", { mines: ["0,0"] }));
    const xy = await page.evaluate(() => window.__ms?.cellScreenXY("8,8"));
    await page.mouse.click(xy!.x, xy!.y);
    expect((await page.evaluate(() => window.__ms?.state()))?.status).toBe("won");
    await page.locator('.dialog-close[data-action="close"]').click();
    await page.locator('.hud-btn[data-slot="back"]').click();

    // Classic is the plane's squares: its Quick start card says so.
    await expect(
      page.locator('.menu-board-card[data-mode="square"] .menu-done'),
    ).toHaveAttribute("data-won", "easy");
  });
});
