import { expect, test, type Page } from "@playwright/test";

// Press and hold to flag: how long the hold lasts (Settings › Hold to flag) and
// what the player is shown when it lands.
//
// The gesture has a blind spot by construction — the finger doing the holding is
// on top of the very cell the flag will land on — so the confirmation has to be
// somewhere else on screen. That is the header's own flag, blinking red the
// moment a flag is *planted*.
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

/** Watch the flag button for the blink. The class comes off again when the
 * animation ends (~420 ms), so polling for it is a race under load; a mutation
 * observer armed before the move catches it however briefly it is on. */
async function watchFlash(page: Page): Promise<void> {
  await page.evaluate((sel) => {
    const w = window as unknown as { __flash?: boolean };
    w.__flash = false;
    const btn = document.querySelector(sel)!;
    new MutationObserver(() => {
      if (btn.classList.contains("flag-flash")) w.__flash = true;
    }).observe(btn, { attributes: true, attributeFilter: ["class"] });
  }, FLAG_BTN);
}

/** Whether the blink has run since `watchFlash`. */
async function flashed(page: Page): Promise<boolean> {
  return page.evaluate(
    () => (window as unknown as { __flash?: boolean }).__flash === true,
  );
}

test.describe("holding to flag", () => {
  test("the flag lands after the hold, and the header's flag blinks red", async ({
    page,
  }) => {
    await openBoard(page, 400);
    const { cell, x, y } = await cellPoint(page);
    await watchFlash(page);
    await pointer(page, "pointerdown", x, y);

    // Nothing yet — the press is still being counted, and the header says
    // nothing about a flag that has not been planted.
    await page.waitForTimeout(150);
    expect(await page.evaluate((c) => window.__ms!.cellState(c), cell)).toBe("hidden");
    expect(await flashed(page)).toBe(false);
    await expect(page.locator(FLAG_BTN)).not.toHaveClass(/flag-flash/);

    // ...and when the hold is up, the flag is down and the header blinks.
    await expect(async () => {
      expect(await page.evaluate((c) => window.__ms!.cellState(c), cell)).toBe("flagged");
    }).toPass({ timeout: 3000 });
    expect(await flashed(page)).toBe(true);
    await pointer(page, "pointerup", x, y);

    // One shot: the class comes off when the animation ends, so the next flag
    // can blink again rather than being swallowed by this one.
    await expect(page.locator(FLAG_BTN)).not.toHaveClass(/flag-flash/);
  });

  test("a press let go of early taps instead, and nothing blinks", async ({ page }) => {
    await openBoard(page, 1000);
    const { cell, x, y } = await cellPoint(page);
    await watchFlash(page);

    await pointer(page, "pointerdown", x, y);
    await pointer(page, "pointerup", x, y);

    expect(await page.evaluate((c) => window.__ms!.cellState(c), cell)).toBe("revealed");
    expect(await flashed(page)).toBe(false);
  });

  test("a press that turns into a drag flags nothing", async ({ page }) => {
    await openBoard(page, 1000);
    const { cell, x, y } = await cellPoint(page);
    await watchFlash(page);

    await pointer(page, "pointerdown", x, y);
    await pointer(page, "pointermove", x + 60, y + 60);
    await pointer(page, "pointerup", x + 60, y + 60);

    expect(await page.evaluate((c) => window.__ms!.cellState(c), cell)).toBe("hidden");
    expect(await flashed(page)).toBe(false);
  });

  test("the stored duration is the one the press waits for", async ({ page }) => {
    // A slow hold must still be counting well past the default, or the setting
    // is not reaching `controls.ts` at all.
    await openBoard(page, 1000);
    const { cell, x, y } = await cellPoint(page);
    await pointer(page, "pointerdown", x, y);
    await page.waitForTimeout(600);
    expect(await page.evaluate((c) => window.__ms!.cellState(c), cell)).toBe("hidden");
    await pointer(page, "pointerup", x, y);
  });
});

test.describe("the flag blink", () => {
  test("is red, covers the button, and leaves its icon on top", async ({ page }) => {
    // The class is under test elsewhere; what is under test *here* is what it
    // paints, so put it on directly rather than racing a 420 ms animation with
    // a screenshot round trip.
    await openBoard(page);
    const paint = await page.evaluate((sel) => {
      const btn = document.querySelector<HTMLElement>(sel)!;
      btn.classList.add("flag-flash");
      const layer = getComputedStyle(btn, "::after");
      return {
        animation: layer.animationName,
        background: layer.backgroundColor,
        position: layer.position,
        icon: getComputedStyle(btn.querySelector("svg")!).zIndex,
      };
    }, FLAG_BTN);

    expect(paint.animation).toBe("hud-flag-flash");
    // A layer over the button, in the palette's own red — so the blink is a
    // background change and follows the theme.
    expect(paint.position).toBe("absolute");
    const [r, g, b] = /rgba?\((\d+), (\d+), (\d+)/.exec(paint.background)!.slice(1).map(Number) as [
      number,
      number,
      number,
    ];
    expect(r, paint.background).toBeGreaterThan(150);
    expect(r - g, paint.background).toBeGreaterThan(60);
    expect(r - b, paint.background).toBeGreaterThan(60);
    // ...and the flag icon stays legible on top of it.
    expect(paint.icon).toBe("1");
  });

  test("blinks for a right-click too, but never for a flag taken off", async ({
    page,
  }) => {
    // The blink says "a flag went down", not "a hold finished": every way of
    // planting one gets it, and clearing one gets none.
    await openBoard(page);
    await watchFlash(page);
    await page.evaluate(() => window.__ms!.flag("4,4"));
    expect(await flashed(page)).toBe(true);

    await watchFlash(page);
    await page.evaluate(() => window.__ms!.flag("4,4")); // the same cell, cleared
    expect(await page.evaluate(() => window.__ms!.cellState("4,4"))).toBe("hidden");
    expect(await flashed(page)).toBe(false);
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

    const row = page.locator(".settings-hold");
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
