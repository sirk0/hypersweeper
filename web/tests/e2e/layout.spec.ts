import { expect, test } from "@playwright/test";

// The app lays out in the *visible* viewport, not in `100vh`. A mobile browser
// keeps its toolbars over the bottom of the layout viewport: iOS Safari's
// `100vh` is the large viewport (toolbars retracted), so sizing the canvas by
// it hides its bottom strip behind the toolbar and pushes a board centred in
// that canvas down — all the slack ends up above the board.
//
// Headless Chromium has no toolbar, so the mobile case is reproduced by
// stubbing `visualViewport` to report a shorter height than the window, which
// is exactly what a mobile browser does with its toolbar shown.

/** CSS px of browser chrome overlapping the bottom of the layout viewport, in
 * the two sizes seen on an iPhone: Safari's floating bottom bar and Chrome
 * iOS's taller toolbar. The bug scaled with this — the board sat half the
 * hidden strip too low — so both are pinned. */
const TOOLBARS = [45, 90];

async function stubToolbar(
  page: import("@playwright/test").Page,
  height: number,
): Promise<void> {
  await page.addInitScript((toolbar: number) => {
    const real = window.visualViewport;
    const fake = {
      get width() {
        return window.innerWidth;
      },
      get height() {
        return window.innerHeight - toolbar;
      },
      offsetLeft: 0,
      offsetTop: 0,
      scale: 1,
      addEventListener: (...args: unknown[]) =>
        (real as unknown as HTMLElement | null)?.addEventListener?.(
          ...(args as Parameters<HTMLElement["addEventListener"]>),
        ),
      removeEventListener: (...args: unknown[]) =>
        (real as unknown as HTMLElement | null)?.removeEventListener?.(
          ...(args as Parameters<HTMLElement["removeEventListener"]>),
        ),
    };
    Object.defineProperty(window, "visualViewport", {
      configurable: true,
      get: () => fake,
    });
  }, height);
}

/** Vertical span of the board on screen, from the cell centres the seam
 * reports (a flat board is symmetric, so their midpoint is its centre). */
async function boardBand(
  page: import("@playwright/test").Page,
): Promise<{ top: number; bottom: number; center: number }> {
  return page.evaluate(() => {
    const ys = window
      .__ms!.cells()
      .map((c) => window.__ms!.cellScreenXY(c)?.y)
      .filter((y): y is number => y != null);
    const top = Math.min(...ys);
    const bottom = Math.max(...ys);
    return { top, bottom, center: (top + bottom) / 2 };
  });
}

async function chrome(page: import("@playwright/test").Page) {
  return page.evaluate(() => {
    const canvas = document.getElementById("board")!.getBoundingClientRect();
    return {
      canvasLeft: canvas.left,
      canvasWidth: canvas.width,
      canvasHeight: canvas.height,
      hudBottom: document.querySelector(".hud")!.getBoundingClientRect().bottom,
      visibleHeight: window.visualViewport?.height ?? window.innerHeight,
      innerHeight: window.innerHeight,
      innerWidth: window.innerWidth,
    };
  });
}

test.describe("viewport layout", () => {
  for (const toolbar of TOOLBARS) {
    test(`a flat board centres in the visible viewport under ${toolbar}px of browser chrome`, async ({
      page,
    }) => {
      await stubToolbar(page, toolbar);
      await page.setViewportSize({ width: 390, height: 844 });
      await page.goto("/?mode=square&difficulty=hard&seed=1");
      await expect(page.locator("body[data-ready]")).toBeVisible();

      const c = await chrome(page);
      const { hudBottom, visibleHeight } = c;
      expect(visibleHeight).toBe(c.innerHeight - toolbar);
      // The canvas stops where the browser chrome starts, not at 100vh — and
      // still spans the window edge to edge (a canvas is a replaced element: an
      // auto width would silently fall back to its drawing-buffer size).
      expect(c.canvasHeight).toBeCloseTo(visibleHeight, 0);
      expect(c.canvasLeft).toBe(0);
      expect(c.canvasWidth).toBeCloseTo(c.innerWidth, 0);

      // Equal air above and below: the board is centred between the header and
      // the bottom of what the user can see.
      const band = await boardBand(page);
      expect(band.center).toBeCloseTo((hudBottom + visibleHeight) / 2, 0);
      expect(band.bottom).toBeLessThanOrEqual(visibleHeight);
      expect(band.top).toBeGreaterThanOrEqual(hudBottom);
    });
  }

  test("with no browser chrome the board centres in the whole window", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/?mode=square&difficulty=hard&seed=1");
    await expect(page.locator("body[data-ready]")).toBeVisible();

    const c = await chrome(page);
    expect(c.canvasHeight).toBeCloseTo(c.innerHeight, 0);
    expect(c.canvasWidth).toBeCloseTo(c.innerWidth, 0);
    const band = await boardBand(page);
    expect(band.center).toBeCloseTo((c.hudBottom + c.innerHeight) / 2, 0);
  });

  test("the menu keeps its difficulty row above the browser chrome", async ({
    page,
  }) => {
    await stubToolbar(page, TOOLBARS.at(-1)!);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/");
    await expect(page.locator("body[data-ready]")).toBeVisible();

    const bottom = await page
      .locator(".menu-difficulty")
      .evaluate((el) => el.getBoundingClientRect().bottom);
    const { visibleHeight } = await chrome(page);
    expect(bottom).toBeLessThanOrEqual(visibleHeight);
  });
});
