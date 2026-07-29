import { expect, test, type Page } from "@playwright/test";

// Best times: the record window a placing win puts up, and the page that lists
// what it has collected. The suite runs under emulated reduced motion, so the
// dialog opens straight away rather than waiting on the win animation.

const KEY = "ms:scores";

/** Start with a board already holding `entries` (milliseconds), so a test can
 * assert against times it chose rather than against however fast the fixture
 * board happened to be won. */
async function seedTimes(page: Page, key: string, entries: { ms: number; at: number }[]) {
  await page.addInitScript(
    ([storageKey, board, rows]) => {
      localStorage.setItem(
        storageKey as string,
        JSON.stringify({ version: 1, boards: { [board as string]: rows } }),
      );
    },
    [KEY, key, entries] as const,
  );
}

/** The fixture win from play.spec.ts: one mine in the corner, so revealing the
 * far corner floods the rest of the board and wins. */
async function winFixtureBoard(page: Page): Promise<void> {
  await page.evaluate(() => window.__ms?.startBoard("square", "easy", { mines: ["0,0"] }));
  const xy = await page.evaluate(() => window.__ms?.cellScreenXY("8,8"));
  await page.mouse.click(xy!.x, xy!.y);
  expect((await page.evaluate(() => window.__ms?.state()))?.status).toBe("won");
}

const dialog = (page: Page) => page.locator('[data-dialog="score"]');

test.describe("record window", () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 900, height: 700 });
  });

  test("a top-three win announces the record and stores it", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator("body[data-ready]")).toBeVisible();
    await winFixtureBoard(page);

    await expect(dialog(page)).toBeVisible();
    await expect(page.locator("#score-dialog-title")).toHaveText("New best time!");
    await expect(page.locator(".dialog-subtitle")).toHaveText("Squares · Easy");
    // One row, and it is the one just set.
    await expect(page.locator(".score-row")).toHaveCount(1);
    await expect(page.locator(".score-row.current")).toHaveAttribute("data-rank", "1");
    await expect(page.locator(".score-row.current .score-when")).toHaveText("just now");

    const stored = await page.evaluate(() => window.__ms?.bestTimes("square", "easy"));
    expect(stored).toHaveLength(1);
  });

  test("a second win joins the list, and the times survive a reload", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator("body[data-ready]")).toBeVisible();
    await winFixtureBoard(page);
    await page.keyboard.press("Escape");
    await winFixtureBoard(page);

    await expect(page.locator(".score-row")).toHaveCount(2);
    expect(await page.evaluate(() => window.__ms?.bestTimes("square", "easy"))).toHaveLength(2);

    await page.reload();
    await expect(page.locator("body[data-ready]")).toBeVisible();
    expect(await page.evaluate(() => window.__ms?.bestTimes("square", "easy"))).toHaveLength(2);
  });

  test("Escape closes it and leaves the finished board", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator("body[data-ready]")).toBeVisible();
    await winFixtureBoard(page);
    await expect(dialog(page)).toBeVisible();

    await page.keyboard.press("Escape");
    await expect(dialog(page)).toHaveCount(0);
    const state = await page.evaluate(() => window.__ms?.state());
    expect(state?.screen).toBe("game");
    expect(state?.status).toBe("won"); // the cleared board is still there
  });

  test("Play again deals a new board; Menu goes home", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator("body[data-ready]")).toBeVisible();
    await winFixtureBoard(page);
    await page.locator('.dialog-btn[data-action="play-again"]').click();
    await expect(dialog(page)).toHaveCount(0);
    let state = await page.evaluate(() => window.__ms?.state());
    expect(state?.status).toBe("playing");
    expect(state?.mode).toBe("square");

    await winFixtureBoard(page);
    await page.locator('.dialog-btn[data-action="menu"]').click();
    await expect(dialog(page)).toHaveCount(0);
    state = await page.evaluate(() => window.__ms?.state());
    expect(state?.screen).toBe("menu");
  });

  test("a time that does not place is not announced", async ({ page }) => {
    // Three unbeatable records: a win can only tie them, and a tie does not
    // take a place.
    await seedTimes(page, "square|easy", [
      { ms: 0, at: 1 },
      { ms: 0, at: 2 },
      { ms: 0, at: 3 },
    ]);
    await page.goto("/");
    await expect(page.locator("body[data-ready]")).toBeVisible();
    await winFixtureBoard(page);

    await expect(dialog(page)).toHaveCount(0);
    const stored = await page.evaluate(() => window.__ms?.bestTimes("square", "easy"));
    expect(stored).toEqual([
      { ms: 0, at: 1 },
      { ms: 0, at: 2 },
      { ms: 0, at: 3 },
    ]);
  });

  test("a loss records nothing", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator("body[data-ready]")).toBeVisible();
    await page.evaluate(() => window.__ms?.startBoard("square", "easy", { mines: ["4,4"] }));
    const xy = await page.evaluate(() => window.__ms?.cellScreenXY("4,4"));
    await page.mouse.click(xy!.x, xy!.y);

    expect((await page.evaluate(() => window.__ms?.state()))?.status).toBe("lost");
    await expect(dialog(page)).toHaveCount(0);
    expect(await page.evaluate(() => window.__ms?.bestTimes("square", "easy"))).toEqual([]);
  });

  test("a click on the field around the card dismisses it", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator("body[data-ready]")).toBeVisible();
    await winFixtureBoard(page);
    await expect(dialog(page)).toBeVisible();

    await dialog(page).click({ position: { x: 8, y: 8 } }); // the backdrop, not the card
    await expect(dialog(page)).toHaveCount(0);
  });

  test("leaving during the win animation cancels the window", async ({ page }) => {
    // With animations on the window waits for the win wave; walking away in
    // that gap must not pop a card over the menu.
    await page.goto("/");
    await expect(page.locator("body[data-ready]")).toBeVisible();
    await page.evaluate(() => window.__ms?.animations(true));
    await winFixtureBoard(page);
    await expect(dialog(page)).toHaveCount(0); // still waiting

    await page.locator('.hud-btn[data-slot="back"]').click();
    await expect(page.locator('.menu-entry[data-group="flat"]')).toBeVisible();
    await page.waitForTimeout(1500); // past the delay the window would have used
    await expect(dialog(page)).toHaveCount(0);
    // The time was still filed — only the announcement was dropped.
    expect(await page.evaluate(() => window.__ms?.bestTimes("square", "easy"))).toHaveLength(1);
  });
});

test.describe("best times page", () => {
  test.beforeEach(async ({ page }) => {
    await seedTimes(page, "square|easy", [
      { ms: 41_200, at: 1_700_000_000_000 },
      { ms: 58_000, at: 1_700_000_100_000 },
    ]);
    await page.goto("/");
    await expect(page.locator("body[data-ready]")).toBeVisible();
  });

  test("settings lists the stored times per board and difficulty", async ({ page }) => {
    await page.locator(".menu-settings-btn").click();
    const row = page.locator('.menu-entry[data-settings-group="best-times"]');
    await expect(row).toContainText("Best times");
    await expect(row).toContainText("1 board");

    await row.click();
    await expect(page.locator('.menu-entry[data-action="back"]')).toContainText("Best times");
    await expect(page.locator(".settings-heading")).toHaveText("Squares");
    const board = page.locator('.menu-list[data-board="square"]');
    await expect(board.locator(".menu-entry-label")).toHaveText("Easy");
    // Whole seconds, as the header counter showed them.
    await expect(board.locator(".best-time")).toHaveText(["🥇 41s", "🥈 58s"]);
  });

  test("clearing asks first, then empties the list", async ({ page }) => {
    await page.locator(".menu-settings-btn").click();
    await page.locator('.menu-entry[data-settings-group="best-times"]').click();

    const clear = page.locator('[data-action="clear-best-times"]');
    await clear.click();
    await expect(clear).toHaveAttribute("data-armed", "1"); // armed, nothing cleared yet
    expect(await page.evaluate(() => window.__ms?.bestTimes("square", "easy"))).toHaveLength(2);

    await clear.click();
    await expect(page.locator('[data-empty="best-times"]')).toBeVisible();
    expect(await page.evaluate(() => window.__ms?.bestTimes("square", "easy"))).toEqual([]);

    // ...and the settings row follows.
    await page.locator('.menu-entry[data-action="back"]').click();
    await expect(page.locator('.menu-entry[data-settings-group="best-times"]')).toContainText(
      "No times yet",
    );
  });

});

test.describe("best times page, fresh install", () => {
  test("is reachable and says so when there is nothing to show", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator("body[data-ready]")).toBeVisible();
    await page.locator(".menu-settings-btn").click();
    await expect(page.locator('.menu-entry[data-settings-group="best-times"]')).toContainText(
      "No times yet",
    );
    await page.locator('.menu-entry[data-settings-group="best-times"]').click();
    await expect(page.locator('[data-empty="best-times"]')).toBeVisible();
    // Nothing to clear, so no destructive row.
    await expect(page.locator('[data-action="clear-best-times"]')).toHaveCount(0);
  });
});
