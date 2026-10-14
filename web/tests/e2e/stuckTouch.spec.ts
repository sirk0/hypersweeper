import { expect, test, type CDPSession, type Page } from "@playwright/test";

// The iPhone bug where the board stopped answering mid-game: a one-finger
// drag zoomed instead of panning, taps did nothing, a new game from the smiley
// did not help — only restarting the app did. The controls track every finger
// that is down, and a finger counts as down until its `pointerup` (or
// `pointercancel`) arrives. WebKit on iOS does not always send one — a lift at
// the end of a pinch, a system gesture or the app leaving the foreground can
// swallow it — and the finger it lost stayed "down" for the life of the app.
// From then on every real touch was its second finger: a pinch, anchored on a
// point nobody was touching.
//
// The lost lift is simulated by dispatching a `pointerdown` that is never
// followed by its `pointerup`, which is exactly the stream the controls saw.
// What comes after it is driven as *real* touches through the DevTools
// protocol, so the browser builds the pointer and touch events — and their
// `isPrimary` and `touches` — the way a touchscreen does.

test.use({ hasTouch: true });

/** A pointerdown with no pointerup ever to follow: the finger WebKit lost. */
async function loseALift(page: Page, x: number, y: number): Promise<void> {
  await page.evaluate(
    ({ x, y }) => {
      const canvas = document.getElementById("board")!;
      const send = (type: string, id: number) =>
        canvas.dispatchEvent(
          new PointerEvent(type, {
            pointerId: id,
            pointerType: "touch",
            clientX: x + (id - 9001) * 60,
            clientY: y,
            bubbles: true,
            isPrimary: id === 9001,
          }),
        );
      // A two-finger pinch whose second lift never arrives.
      send("pointerdown", 9001);
      send("pointerdown", 9002);
      send("pointerup", 9001);
    },
    { x, y },
  );
}

/** One real finger dragged from (x0, y0) to (x1, y1). */
async function drag(
  cdp: CDPSession,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  steps = 8,
): Promise<void> {
  await cdp.send("Input.dispatchTouchEvent", {
    type: "touchStart",
    touchPoints: [{ x: x0, y: y0 }],
  });
  for (let i = 1; i <= steps; i++) {
    await cdp.send("Input.dispatchTouchEvent", {
      type: "touchMove",
      touchPoints: [{ x: x0 + ((x1 - x0) * i) / steps, y: y0 + ((y1 - y0) * i) / steps }],
    });
  }
  await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
}

/** One real finger tapping (x, y). */
async function tap(cdp: CDPSession, x: number, y: number): Promise<void> {
  await cdp.send("Input.dispatchTouchEvent", {
    type: "touchStart",
    touchPoints: [{ x, y }],
  });
  await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
}

test.describe("a lost touch lift", () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 420, height: 780 }); // a phone
    await page.goto("/");
    await expect(page.locator("body[data-ready]")).toBeVisible();
    // A single mine, so a tap on the cell beside it opens exactly that cell.
    await page.evaluate(() =>
      window.__ms!.startBoard("square", "medium", { mines: ["4,4"] }),
    );
  });

  test("does not turn the next one-finger drag into a pinch", async ({ page }) => {
    const cdp = await page.context().newCDPSession(page);
    await page.evaluate(() => window.__ms!.zoomBy(3));
    const zoom = await page.evaluate(() => window.__ms!.zoom());
    await loseALift(page, 150, 400);

    const before = await page.evaluate(() => window.__ms!.cellScreenXY("4,5")!);
    await drag(cdp, 210, 500, 250, 540);
    // A drag pans the zoomed board along with the finger; it does not zoom.
    // (By a little less than the finger's 40px: travel under the drag
    // threshold is not a drag yet.)
    expect(await page.evaluate(() => window.__ms!.zoom())).toBeCloseTo(zoom, 5);
    const after = await page.evaluate(() => window.__ms!.cellScreenXY("4,5")!);
    for (const moved of [after.x - before.x, after.y - before.y]) {
      expect(moved).toBeGreaterThan(30);
      expect(moved).toBeLessThanOrEqual(40.5);
    }

    // And a tap still opens the cell under it.
    await tap(cdp, after.x, after.y);
    expect(await page.evaluate(() => window.__ms!.cellState("4,5"))).toBe("revealed");
  });

  test("is forgotten once no finger is left on the screen", async ({ page }) => {
    // The same lost lift, then the last real finger leaving the glass. Even
    // where the browser's next press does not say it is the only one
    // (`isPrimary`), a touch list that has emptied says no finger is down.
    await loseALift(page, 150, 400);
    await page.evaluate(() => {
      const canvas = document.getElementById("board")!;
      canvas.dispatchEvent(new TouchEvent("touchend", { bubbles: true }));
    });
    const cell = await page.evaluate(() => window.__ms!.cellScreenXY("4,5")!);
    await page.evaluate(({ x, y }) => {
      const canvas = document.getElementById("board")!;
      for (const type of ["pointerdown", "pointerup"]) {
        canvas.dispatchEvent(
          new PointerEvent(type, {
            pointerId: 9100,
            pointerType: "touch",
            clientX: x,
            clientY: y,
            bubbles: true,
            isPrimary: false,
          }),
        );
      }
    }, cell);
    expect(await page.evaluate(() => window.__ms!.cellState("4,5"))).toBe("revealed");
  });

  test("is forgotten when the app leaves the foreground", async ({ page }) => {
    await loseALift(page, 150, 400);
    // Switching away from the app is one way iOS swallows a lift. Coming back
    // must find no finger down.
    await page.evaluate(() => {
      Object.defineProperty(document, "visibilityState", {
        configurable: true,
        get: () => "hidden",
      });
      document.dispatchEvent(new Event("visibilitychange"));
      Object.defineProperty(document, "visibilityState", {
        configurable: true,
        get: () => "visible",
      });
      document.dispatchEvent(new Event("visibilitychange"));
    });
    const cell = await page.evaluate(() => window.__ms!.cellScreenXY("4,5")!);
    await page.evaluate(({ x, y }) => {
      const canvas = document.getElementById("board")!;
      for (const type of ["pointerdown", "pointerup"]) {
        canvas.dispatchEvent(
          new PointerEvent(type, {
            pointerId: 9200,
            pointerType: "touch",
            clientX: x,
            clientY: y,
            bubbles: true,
            isPrimary: false,
          }),
        );
      }
    }, cell);
    expect(await page.evaluate(() => window.__ms!.cellState("4,5"))).toBe("revealed");
  });
});
