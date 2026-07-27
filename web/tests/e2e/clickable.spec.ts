import { expect, test } from "@playwright/test";

// Regression guard: every flat board must be playable via real clicks. This
// catches renderer/picking regressions like the one where large cells (triangle
// / trigrid) had bevels beyond the camera near plane, so the raycast could not
// reach them and clicks did nothing. Driving a real mouse click through
// cellScreenXY exercises the full project -> pick round-trip per board.
const MODES = ["square", "triangle", "trigrid", "hex", "hexhex"];

test.describe("every flat board is clickable", () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 900, height: 700 });
  });

  for (const mode of MODES) {
    test(`${mode} reveals on a real click`, async ({ page }) => {
      await page.goto("/");
      await expect(page.locator("body[data-ready]")).toBeVisible();

      // Build the board once to enumerate cells, then restart with a single
      // mine on the first cell and click a cell far from it.
      const target = await page.evaluate((mode) => {
        const ms = window.__ms!;
        ms.startBoard(mode, "easy");
        const cells = ms.cells();
        const mine = cells[0]!;
        const clickCell = cells[Math.floor(cells.length / 2)]!;
        ms.startBoard(mode, "easy", { mines: [mine] });
        return { xy: ms.cellScreenXY(clickCell), clickCell };
      }, mode);

      expect(target.xy, `${mode}: no screen coords for ${target.clickCell}`).not.toBeNull();
      await page.mouse.click(target.xy!.x, target.xy!.y);

      const state = await page.evaluate(() => window.__ms!.state());
      expect(state.revealed, `${mode}: click revealed nothing`).toBeGreaterThan(0);
    });
  }
});

// A press that stays under the drag threshold is a tap, and it belongs to the
// cell it started on. It used to be thrown away unless the release point picked
// that same cell again — so a tap that wandered a pixel or two over a cell edge
// (routine on a touch screen) did nothing at all, while a long-press on the
// same spot, which fires from the press, flagged it happily.
test.describe("a tap that wanders within the threshold", () => {
  test("reveals the cell it started on", async ({ page }) => {
    await page.setViewportSize({ width: 900, height: 700 });
    await page.goto("/");
    await expect(page.locator("body[data-ready]")).toBeVisible();
    await page.evaluate(() =>
      window.__ms!.startBoard("square", "medium", { mines: ["4,4"] }),
    );

    // A point 3px inside "4,5", and one 3px past the edge it shares with its
    // neighbour: 6px apart, under the 8px threshold, but different cells.
    const span = await page.evaluate(() => {
      const ms = window.__ms!;
      const a = ms.cellScreenXY("4,5")!;
      const b = ms.cellScreenXY("5,5")!;
      // The cells share an edge, so it runs through the midpoint of their
      // centres; step 3px either side of it.
      const dx = Math.sign(b.x - a.x) * 3;
      const dy = Math.sign(b.y - a.y) * 3;
      const mx = (a.x + b.x) / 2;
      const my = (a.y + b.y) / 2;
      const from = { x: mx - dx, y: my - dy };
      const to = { x: mx + dx, y: my + dy };
      return {
        from,
        to,
        fromCell: ms.cellAtScreenXY(from.x, from.y),
        toCell: ms.cellAtScreenXY(to.x, to.y),
      };
    });
    // The gesture only tests what it is meant to if the two ends really do sit
    // in different cells.
    expect(span.fromCell).toBe("4,5");
    expect(span.toCell).toBe("5,5");

    await page.mouse.move(span.from.x, span.from.y);
    await page.mouse.down();
    await page.mouse.move(span.to.x, span.to.y);
    await page.mouse.up();

    expect(await page.evaluate(() => window.__ms!.cellState("4,5"))).toBe("revealed");
    expect(await page.evaluate(() => window.__ms!.cellState("5,5"))).toBe("hidden");
  });
});
