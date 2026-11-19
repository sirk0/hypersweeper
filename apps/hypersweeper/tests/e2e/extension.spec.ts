import { expect, test, type Page } from "@playwright/test";

// A won flat board carries its tiling on past its edge, as outlines to the
// edges of the screen, and may then be zoomed out past the fit to see more of
// it (render/extension.ts, modes/extension.ts).

/** Deal `mode` with its first eighth of cells mined, and finish it — or, with
 * `lose`, step on a mine. */
async function play(page: Page, mode: string, difficulty: string, lose = false): Promise<void> {
  await page.evaluate(
    ([m, d]) => {
      const ms = window.__ms!;
      ms.startBoard(m!, d!, { seed: 0 });
      const cells = ms.cells();
      ms.startBoard(m!, d!, { mines: cells.slice(0, Math.max(1, cells.length >> 3)) });
    },
    [mode, difficulty],
  );
  await page.evaluate((stepOnMine) => {
    const ms = window.__ms!;
    const cells = ms.cells();
    const n = Math.max(1, cells.length >> 3);
    if (stepOnMine) {
      ms.reveal(cells[n]!);
      ms.reveal(cells[0]!);
      return;
    }
    for (const c of cells.slice(n)) if (ms.cellState(c) === "hidden") ms.reveal(c);
  }, lose);
  await expect
    .poll(() => page.evaluate(() => window.__ms!.state().status))
    .toBe(lose ? "lost" : "won");
}

test.describe("the tiling past a won board", () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 420, height: 780 }); // a phone
    await page.goto("/");
    await expect(page.locator("body[data-ready]")).toBeVisible();
  });

  test("a won board shows its tiling and zooms out past the fit, within bounds", async ({
    page,
  }) => {
    await play(page, "square", "easy");
    await expect.poll(() => page.evaluate(() => window.__ms!.extended())).toBe(true);
    await page.evaluate(() => window.__ms!.zoomBy(0.5));
    expect(await page.evaluate(() => window.__ms!.zoom())).toBeCloseTo(0.5, 2);
    // ...but no further than a third of the fit, however hard it is driven
    await page.evaluate(() => {
      for (let i = 0; i < 10; i++) window.__ms!.zoomBy(0.5);
    });
    const floor = await page.evaluate(() => window.__ms!.zoom());
    expect(floor).toBeGreaterThanOrEqual(1 / 3 - 1e-9);
    expect(floor).toBeLessThan(0.5);
    // the next board is framed again, and has nothing round it until it is won
    await page.evaluate(() => window.__ms!.startBoard("square", "easy", { seed: 1 }));
    expect(await page.evaluate(() => window.__ms!.zoom())).toBe(1);
    expect(await page.evaluate(() => window.__ms!.extended())).toBe(false);
  });

  test("a board still in play, or lost, keeps the fit as its floor", async ({ page }) => {
    await page.evaluate(() => window.__ms!.startBoard("square", "easy", { seed: 3 }));
    await page.evaluate(() => window.__ms!.zoomBy(0.5));
    expect(await page.evaluate(() => window.__ms!.zoom())).toBe(1);
    await play(page, "square", "easy", true);
    await page.evaluate(() => window.__ms!.zoomBy(0.5));
    expect(await page.evaluate(() => window.__ms!.zoom())).toBe(1);
    expect(await page.evaluate(() => window.__ms!.extended())).toBe(false);
  });

  test("an aperiodic board's tiling is grown off the main thread", async ({ page }) => {
    await play(page, "hat", "easy");
    await expect
      .poll(() => page.evaluate(() => window.__ms!.extended()), { timeout: 30_000 })
      .toBe(true);
    await page.evaluate(() => window.__ms!.zoomBy(0.5));
    expect(await page.evaluate(() => window.__ms!.zoom())).toBeLessThan(1);
  });

  test("a solid has no tiling round it", async ({ page }) => {
    await play(page, "cube", "easy");
    await page.waitForTimeout(500);
    expect(await page.evaluate(() => window.__ms!.extended())).toBe(false);
  });
});
