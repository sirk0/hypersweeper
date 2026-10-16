import { expect, test, type Page } from "@playwright/test";

// Achievements: what a win unlocks, where it is said, and the page that lists
// the rest. The suite runs under emulated reduced motion, so the win card opens
// straight away rather than waiting on the win animation.
//
// The case worth pinning is the second one. A win that beats no record used to
// end in silence; unlocking something is now reason enough for the card to
// open, and nothing in the unit tests can see that — it is a decision made in
// `App.checkRecord`, about a modal.

const KEY = "ms:achievements";
const SCORES = "ms:scores";

/** Boot with an achievements record already in place. Passing an explicit one
 * (even an empty one) is also what stops the module seeding itself from the
 * best times, which would otherwise pre-unlock the fixture board. */
async function seedAchievements(page: Page, record: Record<string, unknown>): Promise<void> {
  await page.addInitScript(
    ([key, value]) => localStorage.setItem(key as string, value as string),
    [KEY, JSON.stringify({ version: 1, ...record })] as const,
  );
}

/** Boot with times already on a board, so a win there sets no record. `0` ms is
 * unbeatable: a time equal to a stored one ranks below it. */
async function seedUnbeatableTimes(page: Page, board: string): Promise<void> {
  await page.addInitScript(
    ([key, name]) =>
      localStorage.setItem(
        key as string,
        JSON.stringify({
          version: 1,
          boards: { [name as string]: [0, 0, 0].map((ms) => ({ ms, at: 1 })) },
        }),
      ),
    [SCORES, board] as const,
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

/** One achievement as the test seam reports it. */
async function state(page: Page, id: string) {
  return page.evaluate(
    (wanted) => window.__ms?.achievements().find((a) => a.id === wanted),
    id,
  );
}

test.describe("achievements", () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 900, height: 700 });
  });

  test("a first win unlocks, says so on the record card, and stores it", async ({ page }) => {
    await seedAchievements(page, {});
    await page.goto("/");
    await expect(page.locator("body[data-ready]")).toBeVisible();
    await winFixtureBoard(page);

    // The card is up for the record, and carries the unlocks under the times.
    await expect(dialog(page)).toBeVisible();
    await expect(page.locator("#score-dialog-title")).toHaveText("New best time!");
    // A square board is four-sided tiles, and one click on an empty field
    // plants no flag: three at once, listed in the list's own order. Its
    // surface and family earn nothing yet — a group is only ever won whole.
    const unlocks = page.locator(".dialog-unlock[data-achievement]");
    await expect(unlocks).toHaveCount(3);
    for (const id of ["first-win", "flagless", "shape:4"]) {
      await expect(page.locator(`.dialog-unlock[data-achievement="${id}"]`)).toBeVisible();
    }
    // Nothing was left out, so the link names the page rather than a count.
    await expect(page.locator('[data-action="show-achievements"]')).toHaveText("All achievements");

    expect((await state(page, "first-win"))?.unlockedAt).toBeGreaterThan(0);
    // ...and the completion counts moved by exactly the one board.
    expect(await state(page, "surface-all:flat")).toMatchObject({ have: 1 });
    expect(await state(page, "tiling-all:regular")).toMatchObject({ have: 1 });
  });

  test("a win that unlocks more than the card holds counts the rest", async ({ page }) => {
    // torusrhombille is graded `warn` at medium (data/difficulty.json), so a
    // first, flagless win there is first clear, medium, no flags, against the
    // odds and four-sided tiles: five, one past what the card lists.
    await seedAchievements(page, {});
    await page.goto("/");
    await expect(page.locator("body[data-ready]")).toBeVisible();
    await page.evaluate(() => {
      const ms = window.__ms!;
      ms.startBoard("torusrhombille", "medium", { seed: 1 });
      const [mine, ...rest] = ms.cells();
      ms.startBoard("torusrhombille", "medium", { mines: [mine!] });
      for (const cell of rest) if (ms.state().status !== "won") ms.reveal(cell);
    });
    expect((await page.evaluate(() => window.__ms?.state()))?.status).toBe("won");

    await expect(dialog(page)).toBeVisible();
    await expect(page.locator(".dialog-unlock[data-achievement]")).toHaveCount(4);
    // The rest are counted rather than listed, so "Play again" stays on a
    // phone's screen. That count is the link to the whole list.
    await expect(page.locator('[data-action="show-achievements"]')).toHaveText("and 1 more");
    // Unlocked all the same — the card is a summary, not the record.
    for (const id of ["first-win", "difficulty:medium", "flagless", "unfair", "shape:4"]) {
      expect((await state(page, id))?.unlockedAt, id).toBeGreaterThan(0);
    }
  });

  test("a win that beats no record still opens the card for an unlock", async ({ page }) => {
    await seedAchievements(page, {});
    await seedUnbeatableTimes(page, "square|easy");
    await page.goto("/");
    await expect(page.locator("body[data-ready]")).toBeVisible();
    await winFixtureBoard(page);

    // No rank: the card is about the unlock, and shows no list of times.
    await expect(dialog(page)).toBeVisible();
    await expect(page.locator("#score-dialog-title")).not.toHaveText("New best time!");
    await expect(page.locator(".score-row")).toHaveCount(0);
    await expect(page.locator('.dialog-unlock[data-achievement="first-win"]')).toBeVisible();
  });

  test("a win that unlocks nothing new says nothing at all", async ({ page }) => {
    // Everything this board could earn is already unlocked, and its times are
    // unbeatable: the win is real, and the app is right to stay quiet.
    await seedAchievements(page, {
      wins: { square: { easy: 1 } },
      shapes: [4],
      flagless: 1,
      unlocked: {
        "first-win": 1,
        "shape:4": 1,
        // The fixture win is one click on an empty field, so it plants no flag
        // and earns this too — which is the flagless rule working, and has to
        // be seeded here or the card has something to say after all.
        flagless: 1,
      },
    });
    await seedUnbeatableTimes(page, "square|easy");
    await page.goto("/");
    await expect(page.locator("body[data-ready]")).toBeVisible();
    await winFixtureBoard(page);

    await expect(dialog(page)).toHaveCount(0);
  });

  test("the card's last row is the way to the whole list", async ({ page }) => {
    // Reached from the card rather than from Settings: the card is where a
    // player is thinking about achievements. Seeded so the win unlocks exactly
    // one thing, which is the case where the row names the page instead of
    // counting what it left out.
    // A hexagonal board already won: that is a first win, a flagless one and
    // six-sided tiles. All of it is stamped when
    // the record is read, so the square board below unlocks exactly one thing —
    // its four-sided tiles — and the row names the page rather than a count.
    await seedAchievements(page, { wins: { hex: { easy: 1 } }, shapes: [6], flagless: 1 });
    await page.goto("/");
    await expect(page.locator("body[data-ready]")).toBeVisible();
    await winFixtureBoard(page);

    const link = page.locator('[data-action="show-achievements"]');
    await expect(link).toHaveText("All achievements");
    await link.click();

    // The card is gone, the board is gone, and the page is the one it named.
    await expect(dialog(page)).toHaveCount(0);
    expect(await page.evaluate(() => window.__ms?.state().screen)).toBe("menu");
    await expect(page.locator('.achievement-row[data-achievement="first-win"]')).toBeVisible();
  });

  test("the page lists what is unlocked and what is left", async ({ page }) => {
    await seedAchievements(page, {});
    await page.goto("/");
    await expect(page.locator("body[data-ready]")).toBeVisible();
    await winFixtureBoard(page);
    await page.locator('.dialog-close[data-action="close"]').click();
    await page.locator('.hud-btn[data-slot="back"]').click();

    await page.locator('.menu-header-btn[data-action="settings"]').click();
    const row = page.locator('.menu-entry[data-settings-group="achievements"]');
    await expect(row).toContainText("unlocked");
    await row.click();

    const first = page.locator('.achievement-row[data-achievement="first-win"]');
    await expect(first).toBeVisible();
    await expect(first).not.toHaveAttribute("data-locked", "1");
    // A locked completion row shows how far along it is rather than a date.
    const flat = page.locator('.achievement-row[data-achievement="surface-all:flat"]');
    await expect(flat).toHaveAttribute("data-locked", "1");
    await expect(flat.locator(".achievement-progress")).toContainText("/");
    // Every group has a section, and nothing built a board to say so.
    await expect(page.locator("[data-achievement-group]")).toHaveCount(6);
  });

  test("clearing arms on the first tap", async ({ page }) => {
    await seedAchievements(page, {});
    await page.goto("/");
    await expect(page.locator("body[data-ready]")).toBeVisible();
    await winFixtureBoard(page);
    await page.locator('.dialog-close[data-action="close"]').click();
    await page.locator('.hud-btn[data-slot="back"]').click();
    await page.locator('.menu-header-btn[data-action="settings"]').click();
    await page.locator('.menu-entry[data-settings-group="achievements"]').click();

    const clear = page.locator('[data-action="clear-achievements"]');
    await clear.click();
    await expect(clear).toHaveAttribute("data-armed", "1");
    await clear.click();
    // Cleared — but the best time that win also set is still there, so the
    // record re-seeds itself from it. That is the honest answer: the win did
    // happen. What is gone is everything the times cannot vouch for.
    const shape = await state(page, "shape:4");
    expect(shape?.unlockedAt).toBe(null);
  });
});
