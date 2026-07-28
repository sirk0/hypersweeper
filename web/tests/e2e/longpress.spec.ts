import { expect, test, type Page } from "@playwright/test";

// Hold-to-flag, through the real canvas, renderer and picking. The state
// machine itself is unit-tested in tests/unit/controls.test.ts; what this adds
// is the round trip — a touch stream on #board landing a flag on the cell the
// finger is actually over.
//
// Playwright's mouse cannot produce a touch pointer, so the stream is
// synthesized the way tests/e2e/zoom.spec.ts does it. That also buys the one
// event no real driver will emit on demand: pointercancel, which is how iOS
// takes a held touch away and used to take the flag with it.

const HOLD_MS = 500; // comfortably past the 350ms long-press delay

async function send(
  page: Page,
  type: string,
  x: number,
  y: number,
): Promise<void> {
  await page.evaluate(
    ({ type, x, y }: { type: string; x: number; y: number }) => {
      document.getElementById("board")!.dispatchEvent(
        new PointerEvent(type, {
          pointerId: 1,
          pointerType: "touch",
          clientX: x,
          clientY: y,
          buttons: type === "pointerup" ? 0 : 1,
          bubbles: true,
          isPrimary: true,
        }),
      );
    },
    { type, x, y },
  );
}

/** Start a square board with one known mine and return a cell's screen point.
 * The board's world transform is applied when it renders, so the position has
 * to be read on a later round-trip than the one that built the board. */
async function setup(page: Page, cell: string): Promise<{ x: number; y: number }> {
  await page.setViewportSize({ width: 900, height: 700 });
  await page.goto("/");
  await expect(page.locator("body[data-ready]")).toBeVisible();
  await page.evaluate(() =>
    window.__ms!.startBoard("square", "medium", { mines: ["0,0"] }),
  );
  await page.evaluate(
    () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))),
  );
  const xy = await page.evaluate((c) => window.__ms!.cellScreenXY(c), cell);
  expect(xy, `no screen coords for ${cell}`).not.toBeNull();
  return xy!;
}

test.describe("hold to flag", () => {
  test("a held touch flags the cell and does not reveal it", async ({ page }) => {
    const cell = "4,4";
    const { x, y } = await setup(page, cell);

    await send(page, "pointerdown", x, y);
    await page.waitForTimeout(HOLD_MS);
    await send(page, "pointerup", x, y);

    expect(await page.evaluate((c) => window.__ms!.cellState(c), cell)).toBe("flagged");
    expect((await page.evaluate(() => window.__ms!.state())).revealed).toBe(0);
  });

  // The iOS bug: WebKit fires pointercancel as soon as a platform gesture
  // recogniser claims the touch, which used to abandon the pending flag. The
  // hold now outlives it — the browser withdrawing the gesture is not the
  // player letting go.
  test("a pointercancel mid-hold does not lose the flag", async ({ page }) => {
    const cell = "4,4";
    const { x, y } = await setup(page, cell);

    await send(page, "pointerdown", x, y);
    await page.waitForTimeout(100);
    await send(page, "pointercancel", x, y);
    await page.waitForTimeout(HOLD_MS);

    expect(await page.evaluate((c) => window.__ms!.cellState(c), cell)).toBe("flagged");
    expect((await page.evaluate(() => window.__ms!.state())).revealed).toBe(0);
  });

  test("holding a flagged cell clears the flag", async ({ page }) => {
    const cell = "4,4";
    const { x, y } = await setup(page, cell);
    await page.evaluate((c) => window.__ms!.flag(c), cell);

    await send(page, "pointerdown", x, y);
    await page.waitForTimeout(HOLD_MS);
    await send(page, "pointerup", x, y);

    expect(await page.evaluate((c) => window.__ms!.cellState(c), cell)).toBe("hidden");
  });

  // Drift under the touch slop is what a finger resting on glass actually
  // does; it used to cancel the hold at 8px and leave the press doing nothing
  // at all, since the tap was cancelled at the same threshold.
  test("drift within the touch slop still flags", async ({ page }) => {
    const cell = "4,4";
    const { x, y } = await setup(page, cell);

    await send(page, "pointerdown", x, y);
    await send(page, "pointermove", x + 5, y + 4);
    await send(page, "pointermove", x + 9, y + 3);
    await page.waitForTimeout(HOLD_MS);
    await send(page, "pointerup", x + 9, y + 3);

    expect(await page.evaluate((c) => window.__ms!.cellState(c), cell)).toBe("flagged");
  });
});
