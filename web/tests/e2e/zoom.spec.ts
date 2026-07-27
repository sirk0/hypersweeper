import { expect, test, type Page } from "@playwright/test";

// Board zoom: the pinch / wheel / keyboard gesture, its bounds, and the
// property the iPhone bug broke — a tap must always land on the cell the
// player aimed at, zoomed or not.

/** Drive a two-finger pinch on the canvas with synthetic pointer events (the
 * same stream a touchscreen produces; Playwright's API has no multi-touch). */
async function pinch(
  page: Page,
  opts: { cx: number; cy: number; from: number; to: number; steps?: number },
): Promise<void> {
  await page.evaluate(
    ({ cx, cy, from, to, steps }: {
      cx: number;
      cy: number;
      from: number;
      to: number;
      steps: number;
    }) => {
      const canvas = document.getElementById("board")!;
      const send = (type: string, id: number, x: number, y: number) =>
        canvas.dispatchEvent(
          new PointerEvent(type, {
            pointerId: id,
            pointerType: "touch",
            clientX: x,
            clientY: y,
            bubbles: true,
            isPrimary: id === 1,
          }),
        );
      let span = from;
      send("pointerdown", 1, cx - span / 2, cy);
      send("pointerdown", 2, cx + span / 2, cy);
      for (let i = 1; i <= steps; i++) {
        span = from + ((to - from) * i) / steps;
        send("pointermove", 1, cx - span / 2, cy);
        send("pointermove", 2, cx + span / 2, cy);
      }
      send("pointerup", 1, cx - span / 2, cy);
      send("pointerup", 2, cx + span / 2, cy);
    },
    { ...opts, steps: opts.steps ?? 8 },
  );
}

/** Distance on screen between two cells — how magnified the board reads. */
async function spread(page: Page, a: string, b: string): Promise<number> {
  return page.evaluate(
    ([p, q]) => {
      const u = window.__ms!.cellScreenXY(p as string)!;
      const v = window.__ms!.cellScreenXY(q as string)!;
      return Math.hypot(u.x - v.x, u.y - v.y);
    },
    [a, b],
  );
}

test.describe("board zoom", () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 420, height: 780 }); // a phone
    await page.goto("/");
    await expect(page.locator("body[data-ready]")).toBeVisible();
    await page.evaluate(() => window.__ms?.startBoard("square", "medium", { seed: 7 }));
  });

  test("a pinch magnifies the board, and pinching back restores the fit", async ({
    page,
  }) => {
    const fitted = await spread(page, "0,0", "8,8");
    await pinch(page, { cx: 210, cy: 500, from: 80, to: 240 });
    const zoom = await page.evaluate(() => window.__ms!.zoom());
    expect(zoom).toBeCloseTo(3, 1);
    // The board on screen grows by the same factor the fingers spread.
    expect(await spread(page, "0,0", "8,8")).toBeCloseTo(fitted * zoom, 0);

    await pinch(page, { cx: 210, cy: 500, from: 240, to: 80 });
    expect(await page.evaluate(() => window.__ms!.zoom())).toBeCloseTo(1, 2);
    expect(await spread(page, "0,0", "8,8")).toBeCloseTo(fitted, 0);
  });

  test("zoom is bounded: never below the fit, never past the cap", async ({
    page,
  }) => {
    // Pinching in on a fitted board cannot shrink it away.
    await pinch(page, { cx: 210, cy: 500, from: 240, to: 20 });
    expect(await page.evaluate(() => window.__ms!.zoom())).toBe(1);

    // And magnification stops at the cap however hard it is driven.
    await page.evaluate(() => {
      for (let i = 0; i < 20; i++) window.__ms!.zoomBy(2);
    });
    const capped = await page.evaluate(() => window.__ms!.zoom());
    expect(capped).toBeGreaterThan(1);
    expect(capped).toBeLessThanOrEqual(8);
    await page.evaluate(() => window.__ms!.zoomBy(2));
    expect(await page.evaluate(() => window.__ms!.zoom())).toBe(capped);
  });

  test("a pinch reveals nothing, and taps still hit the cell aimed at", async ({
    page,
  }) => {
    // A single mine next to the target, so revealing the target shows a number
    // and floods nothing: exactly one cell can come up, and it must be that one.
    const target = "4,5";
    await page.evaluate(() =>
      window.__ms!.startBoard("square", "medium", { mines: ["4,4"] }),
    );
    const before = await page.evaluate((c) => window.__ms!.cellScreenXY(c)!, target);
    await pinch(page, { cx: before.x, cy: before.y, from: 80, to: 200 });
    // Two fingers are a zoom, never a tap.
    expect(await page.evaluate(() => window.__ms!.state().revealed)).toBe(0);

    // The bug on the phone: after a zoom, taps landed on other cells.
    const after = await page.evaluate((c) => window.__ms!.cellScreenXY(c)!, target);
    // Pinching about the cell holds it under the fingers, as far as the board
    // has slack to give: horizontally the magnified board overhangs the phone
    // by plenty, vertically it barely does, so there the clamp that keeps the
    // board on screen wins over the anchor.
    expect(after.x).toBeCloseTo(before.x, 0);
    const size = page.viewportSize()!;
    expect(after.y).toBeGreaterThan(0);
    expect(after.y).toBeLessThan(size.height);
    await page.mouse.click(after.x, after.y);
    expect(await page.evaluate((c) => window.__ms!.cellState(c), target)).toBe(
      "revealed",
    );
    expect(await page.evaluate(() => window.__ms!.state().revealed)).toBe(1);
  });

  test("a zoomed board can be dragged, and cannot be dragged off screen", async ({
    page,
  }) => {
    await page.evaluate(() => window.__ms!.zoomBy(3));
    const before = await page.evaluate(() => window.__ms!.cellScreenXY("4,4")!);
    // One finger drags the board while it is zoomed in.
    await page.mouse.move(210, 500);
    await page.mouse.down();
    await page.mouse.move(260, 560, { steps: 5 });
    await page.mouse.up();
    const after = await page.evaluate(() => window.__ms!.cellScreenXY("4,4")!);
    expect(Math.hypot(after.x - before.x, after.y - before.y)).toBeGreaterThan(20);

    // Dragged hard against the edge, the board stops with content on screen.
    await page.mouse.move(210, 500);
    await page.mouse.down();
    await page.mouse.move(2000, 2000, { steps: 10 });
    await page.mouse.up();
    const corner = await page.evaluate(() => window.__ms!.cellScreenXY("0,0")!);
    const size = page.viewportSize()!;
    expect(corner.x).toBeLessThan(size.width);
    expect(corner.y).toBeLessThan(size.height);
  });

  test("the wheel zooms a board with no ring to scroll", async ({ page }) => {
    await page.mouse.move(210, 500);
    await page.mouse.wheel(0, -300); // scroll up = zoom in
    const zoomed = await page.evaluate(() => window.__ms!.zoom());
    expect(zoomed).toBeGreaterThan(1);
    await page.mouse.wheel(0, 300);
    expect(await page.evaluate(() => window.__ms!.zoom())).toBeCloseTo(1, 2);
  });

  test("a new board starts framed", async ({ page }) => {
    await page.evaluate(() => window.__ms!.zoomBy(3));
    await page.evaluate(() => window.__ms!.startBoard("hexhex", "easy", { seed: 1 }));
    expect(await page.evaluate(() => window.__ms!.zoom())).toBe(1);
  });
});

test.describe("browser zoom is blocked", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await expect(page.locator("body[data-ready]")).toBeVisible();
  });

  // The iPhone bug: iOS ignores `user-scalable=no`, so without these the page
  // itself zooms on a double tap and the board is left offset under the
  // player's fingers, with no way to zoom back out.
  test("the chrome opts out of double-tap zoom, the canvas out of everything", async ({
    page,
  }) => {
    const touchAction = (sel: string) =>
      page.locator(sel).evaluate((el) => getComputedStyle(el).touchAction);
    expect(await touchAction("body")).toBe("manipulation");
    expect(await touchAction("#board")).toBe("none");
    await page.evaluate(() => window.__ms?.startBoard("square", "easy", { seed: 1 }));
    expect(await touchAction(".hud-smiley")).toBe("manipulation");
  });

  test("page-zoom gestures are cancelled", async ({ page }) => {
    const prevented = await page.evaluate(() =>
      ["gesturestart", "gesturechange", "dblclick"].map((type) => {
        const e = new Event(type, { bubbles: true, cancelable: true });
        document.body.dispatchEvent(e);
        return e.defaultPrevented;
      }),
    );
    expect(prevented).toEqual([true, true, true]);
  });
});
