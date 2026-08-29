import { expect, test, type Page } from "@playwright/test";

// Press and hold to flag: how long the hold lasts (Settings › Hold to flag) and
// what the player is shown while it is being counted.
//
// The gesture has a blind spot by construction — the finger doing the holding
// is on top of the very cell the flag will land on — so the only feedback it
// can have is somewhere else on screen. That is the header's own flag, blinking
// from the moment the press is armed until the flag lands or the gesture turns
// into a drag, a pinch or a plain tap.
//
// The presses below are synthetic `PointerEvent`s with `pointerType: "touch"`,
// which is what `controls.ts` arms the hold for; a mouse never long-presses,
// because it flags by right-click. That means the *gesture* tests need no touch
// context, while the settings-row test does — the row is gated on the device
// having a touch screen at all, exactly as the haptics row is gated on
// something being there to buzz.

const FLAG_BTN = '.hud-btn[data-slot="flag-mode"]';

/** Where a cell of the board on screen is. */
async function cellPoint(page: Page): Promise<{ cell: string; x: number; y: number }> {
  return page.evaluate(() => {
    const ms = window.__ms!;
    for (const cell of ms.cells()) {
      const xy = ms.cellScreenXY(cell);
      if (xy) return { cell: String(cell), ...xy };
    }
    throw new Error("no cell on screen");
  });
}

async function pointer(page: Page, kind: string, x: number, y: number): Promise<void> {
  await page.evaluate(
    ([kind, x, y]) => {
      const canvas = document.querySelector("canvas")!;
      canvas.dispatchEvent(
        new PointerEvent(kind as string, {
          pointerId: 1,
          pointerType: "touch",
          isPrimary: true,
          bubbles: true,
          button: 0,
          buttons: kind === "pointerup" ? 0 : 1,
          clientX: x as number,
          clientY: y as number,
        }),
      );
    },
    [kind, x, y] as const,
  );
}

/** Open a board with the hold set to `holdToFlagMs`, stored the way the app
 * itself stores it — the plumbing under test is settings → `controls.ts`, so
 * seeding the record is the honest way in (there is no test seam for it). */
async function openBoard(page: Page, holdToFlagMs?: number): Promise<void> {
  if (holdToFlagMs !== undefined) {
    await page.addInitScript((ms) => {
      window.localStorage.setItem(
        "ms:settings",
        JSON.stringify({ version: 4, holdToFlagMs: ms }),
      );
    }, holdToFlagMs);
  }
  await page.goto("/");
  await expect(page.locator("body[data-ready]")).toBeVisible();
  await page.evaluate(() => window.__ms!.startBoard("square", "easy"));
  // A board's world transform lands when it renders, and the presses below are
  // picked against it (see picking.spec.ts).
  await page.evaluate(
    () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))),
  );
}

test.describe("holding to flag", () => {
  test("the header's flag blinks while the press is counted, then the flag lands", async ({
    page,
  }) => {
    await openBoard(page, 400);
    const flag = page.locator(FLAG_BTN);
    await expect(flag).not.toHaveClass(/holding/);

    const { cell, x, y } = await cellPoint(page);
    await pointer(page, "pointerdown", x, y);

    // Armed: the icon is blinking, at this hold's own beat, and nothing has
    // been flagged yet.
    await expect(flag).toHaveClass(/holding/);
    expect(
      await flag.evaluate((el) => getComputedStyle(el).getPropertyValue("--hold-duration").trim()),
    ).toBe("400ms");
    expect(await page.evaluate((c) => window.__ms!.cellState(c), cell)).toBe("hidden");

    // ...and when it fires, the flag is down and the blinking stops with it —
    // the icon settles on the move it was counting down to rather than carrying
    // on until the finger lifts.
    await expect(async () => {
      expect(await page.evaluate((c) => window.__ms!.cellState(c), cell)).toBe("flagged");
    }).toPass({ timeout: 3000 });
    await expect(flag).not.toHaveClass(/holding/);

    await pointer(page, "pointerup", x, y);
  });

  test("a press let go of early taps instead, and stops the blinking", async ({ page }) => {
    // The far end of the same gesture: under the hold it is a reveal, and the
    // header must not be left blinking at a press that is over.
    await openBoard(page, 1000);
    const flag = page.locator(FLAG_BTN);
    const { cell, x, y } = await cellPoint(page);

    await pointer(page, "pointerdown", x, y);
    await expect(flag).toHaveClass(/holding/);
    await pointer(page, "pointerup", x, y);

    await expect(flag).not.toHaveClass(/holding/);
    expect(await page.evaluate((c) => window.__ms!.cellState(c), cell)).toBe("revealed");
  });

  test("a press that turns into a drag flags nothing and stops the blinking", async ({
    page,
  }) => {
    await openBoard(page, 1000);
    const flag = page.locator(FLAG_BTN);
    const { cell, x, y } = await cellPoint(page);

    await pointer(page, "pointerdown", x, y);
    await expect(flag).toHaveClass(/holding/);
    await pointer(page, "pointermove", x + 60, y + 60);
    await expect(flag).not.toHaveClass(/holding/);

    await pointer(page, "pointerup", x + 60, y + 60);
    expect(await page.evaluate((c) => window.__ms!.cellState(c), cell)).toBe("hidden");
  });

  test("the stored duration is the one the press waits for", async ({ page }) => {
    // A slow hold must still be counting well past the default, or the setting
    // is not reaching `controls.ts` at all.
    await openBoard(page, 1000);
    const { cell, x, y } = await cellPoint(page);
    await pointer(page, "pointerdown", x, y);
    await page.waitForTimeout(600);
    expect(await page.evaluate((c) => window.__ms!.cellState(c), cell)).toBe("hidden");
    await expect(page.locator(FLAG_BTN)).toHaveClass(/holding/);
    await pointer(page, "pointerup", x, y);
  });
});

// The rest of the suite runs under `prefers-reduced-motion: reduce` (see
// playwright.config.ts), where the blink is deliberately a steady dim instead —
// so the animation itself has to be asserted with motion allowed.
test.describe("the blink itself", () => {
  test.use({ contextOptions: { reducedMotion: "no-preference" } });

  test("runs at half the hold, so two blinks and the flag lands", async ({ page }) => {
    await openBoard(page, 400);
    const { x, y } = await cellPoint(page);
    await pointer(page, "pointerdown", x, y);

    const icon = page.locator(`${FLAG_BTN} svg`);
    expect(await icon.evaluate((el) => getComputedStyle(el).animationName)).toBe(
      "hud-flag-blink",
    );
    expect(await icon.evaluate((el) => getComputedStyle(el).animationDuration)).toBe("0.2s");
    await pointer(page, "pointerup", x, y);
    // ...and it is only ever on while the press is being counted.
    expect(await icon.evaluate((el) => getComputedStyle(el).animationName)).toBe("none");
  });

  test("floors the beat, so the fastest hold does not strobe", async ({ page }) => {
    await openBoard(page, 200);
    const { x, y } = await cellPoint(page);
    await pointer(page, "pointerdown", x, y);
    const icon = page.locator(`${FLAG_BTN} svg`);
    expect(await icon.evaluate((el) => getComputedStyle(el).animationDuration)).toBe("0.14s");
    await pointer(page, "pointerup", x, y);
  });
});

test.describe("the hold-to-flag setting", () => {
  test("a desktop browser with no touch screen gets no row", async ({ page }) => {
    // Nothing can long-press here — a mouse flags by right-click — so a slider
    // would promise a change it could never make. Same principle as the haptics
    // row on a machine with nothing to buzz.
    await page.goto("/");
    await expect(page.locator("body[data-ready]")).toBeVisible();
    await page.locator('.menu-header-btn[data-action="settings"]').click();
    await expect(page.locator('input[data-setting="hold-to-flag"]')).toHaveCount(0);
  });

  test("a touch screen gets the row, and the slider persists what it sets", async ({
    browser,
  }) => {
    const context = await browser.newContext({
      hasTouch: true,
      isMobile: true,
      viewport: { width: 412, height: 915 },
    });
    const page = await context.newPage();
    await page.goto("/");
    await expect(page.locator("body[data-ready]")).toBeVisible();
    await page.locator('.menu-header-btn[data-action="settings"]').click();

    const row = page.locator(".settings-volume", { has: page.locator("input[data-setting='hold-to-flag']") });
    await expect(row).toContainText("Hold to flag");
    await expect(row).toContainText("300 ms"); // the shipped default

    const slider = page.locator('input[data-setting="hold-to-flag"]');
    await slider.fill("600");
    await slider.dispatchEvent("change");
    // The label follows the drag, and the value is written to the one settings
    // record — the page is deliberately *not* re-rendered under the finger.
    await expect(row).toContainText("600 ms");
    expect(
      await page.evaluate(
        () =>
          (JSON.parse(window.localStorage.getItem("ms:settings") ?? "{}") as {
            holdToFlagMs?: number;
          }).holdToFlagMs,
      ),
    ).toBe(600);

    await context.close();
  });
});
