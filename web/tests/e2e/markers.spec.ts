import { expect, test } from "@playwright/test";

// The Realistic theme stands real models — pins and bombs — on a 3D board's
// flagged and mined cells, and those are the most expensive thing the app
// builds. They are rebuilt for the whole board at once, so the rule is that a
// batch of cell changes costs **one** rebuild, not one each.
//
// It used to cost one each, and every path that changes many cells at once went
// quadratic with it: a Klein scroll rewrites every cell's contents (476 of them
// on `hard`), a loss turns over every mine, and each flag placed rebuilt every
// pin already standing. On `klein`/`hard` one press of a scroll arrow took over
// half a minute.
//
// These are timing assertions, which is unusual here and deliberate: the
// property under test *is* how long a batch takes, and the thresholds sit three
// orders of magnitude above the fixed cost and two below the broken one, so
// there is no machine slow enough to fail them for the wrong reason.

/** A `klein`/`hard` board whose mines are known, with `flags` of them pinned. */
async function kleinHard(page: import("@playwright/test").Page, flags: number) {
  return page.evaluate((n) => {
    const ms = window.__ms!;
    ms.startBoard("klein", "hard"); // enumerate the cells first
    const cells = ms.cells();
    const mines = cells.slice(0, ms.state().minesRemaining);
    ms.startBoard("klein", "hard", { mines });
    const t = performance.now();
    for (const c of mines.slice(0, n)) ms.flag(c);
    return { mines, cells: cells.length, flagMs: performance.now() - t };
  }, flags);
}

test.describe("3D markers stay cheap in bulk", () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem(
        "ms:settings",
        JSON.stringify({ version: 4, theme: "realistic", animations: false, sound: "off" }),
      );
    });
    await page.goto("/");
    await expect(page.locator("body[data-ready]")).toBeVisible();
  });

  test("the theme under test is the one that builds models", async ({ page }) => {
    await page.evaluate(() => window.__ms!.startBoard("klein", "easy"));
    expect(await page.evaluate(() => window.__ms!.state().cellStyle)).toBe("realistic");
  });

  test("planting a hundred pins does not get slower as they pile up", async ({ page }) => {
    const { flagMs, cells } = await kleinHard(page, 100);
    expect(cells).toBeGreaterThan(400);
    expect(flagMs).toBeLessThan(1000); // was ~4,300 ms
  });

  test("scrolling a Klein board full of pins is one rebuild, not one per cell", async ({
    page,
  }) => {
    await kleinHard(page, 100);
    await page.evaluate(
      () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))),
    );
    const ms = await page.evaluate(() => {
      const t = performance.now();
      window.__ms!.scroll(1);
      return performance.now() - t;
    });
    expect(ms).toBeLessThan(1000); // was ~36,600 ms
  });

  test("losing reveals every bomb in one rebuild", async ({ page }) => {
    const { mines } = await kleinHard(page, 0); // no flags: every mine turns over
    const ms = await page.evaluate((mine) => {
      const t = performance.now();
      window.__ms!.reveal(mine);
      return performance.now() - t;
    }, mines[0]!);
    expect(await page.evaluate(() => window.__ms!.state().status)).toBe("lost");
    expect(ms).toBeLessThan(1000); // was ~6,100 ms
  });

  test("a flood fill touches no marker at all", async ({ page }) => {
    // Opening cells changes no cell's *model* — a revealed cell carries none —
    // so the marker buffer must not be rebuilt for one however wide it spreads.
    const { mines } = await kleinHard(page, 0);
    const ms = await page.evaluate((mineList) => {
      const safe = window.__ms!.cells().filter((c) => !mineList.includes(c));
      const t = performance.now();
      window.__ms!.reveal(safe[0]!);
      return performance.now() - t;
    }, mines);
    expect(ms).toBeLessThan(500);
    expect(await page.evaluate(() => window.__ms!.state().revealed)).toBeGreaterThan(0);
  });

  test("the models still reach the screen after a batch of changes", async ({ page }) => {
    // The rebuild is deferred to the next frame now, so the thing worth
    // asserting beyond timing is that it happens at all. A deferral that never
    // flushed would pass every timing test above and draw an empty board.
    const settle = () =>
      page.evaluate(
        () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))),
      );
    await page.evaluate(() => {
      const ms = window.__ms!;
      ms.startBoard("klein", "medium");
      const cells = ms.cells();
      ms.startBoard("klein", "medium", { mines: cells.slice(0, ms.state().minesRemaining) });
      ms.animations(false);
    });
    await settle();
    const bare = await page.locator("canvas").screenshot();

    // Pins go down in one batch — the path that used to rebuild per flag.
    await page.evaluate(() => {
      const ms = window.__ms!;
      for (const c of ms.cells().slice(0, 40)) ms.flag(c);
    });
    await settle();
    const pinned = await page.locator("canvas").screenshot();
    expect(pinned.equals(bare), "flagging 40 cells changed nothing on screen").toBe(false);

    // ...and the scroll, which permutes what every cell shows, moves them.
    await page.evaluate(() => window.__ms!.scroll(1));
    await settle();
    const scrolled = await page.locator("canvas").screenshot();
    expect(scrolled.equals(pinned), "the scroll changed nothing on screen").toBe(false);
  });
});
