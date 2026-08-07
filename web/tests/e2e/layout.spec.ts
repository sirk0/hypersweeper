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

/** Reproduce an iOS home-screen launch under the `black-translucent` status
 * bar: `navigator.standalone` is set, the top safe-area inset is `inset` CSS px
 * (stubbed through `--safe-top`, which is why main.ts reads the inset from
 * there), and the screen is `screenHeight` tall while the window — what every
 * viewport API reports — is the Playwright viewport. WebKit's bug is the case
 * where the window is short of the screen by exactly the inset. */
async function stubStandalone(
  page: import("@playwright/test").Page,
  { inset, screenHeight }: { inset: number; screenHeight: number },
): Promise<void> {
  await page.addInitScript(
    ({ inset, screenHeight }: { inset: number; screenHeight: number }) => {
      Object.defineProperty(navigator, "standalone", {
        configurable: true,
        get: () => true,
      });
      const real = window.screen;
      Object.defineProperty(window, "screen", {
        configurable: true,
        get: () => ({ ...real, width: window.innerWidth, height: screenHeight }),
      });
      // An inline custom property outranks the `env()` one styles.css declares.
      // The document element may not exist this early; retry once parsing has
      // built it, still before the deferred module script runs.
      const apply = (): boolean => {
        document.documentElement?.style.setProperty("--safe-top", `${inset}px`);
        return document.documentElement != null;
      };
      if (!apply()) document.addEventListener("readystatechange", apply);
    },
    { inset, screenHeight },
  );
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
      // The whole header block the board is framed below: the header row *and*
      // the caption under it naming the board (`App.onResize` reserves both).
      headerBottom: (
        document.querySelector(".board-caption:not([hidden])") ??
        document.querySelector(".hud")!
      ).getBoundingClientRect().bottom,
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
      const { headerBottom, visibleHeight } = c;
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
      expect(band.center).toBeCloseTo((headerBottom + visibleHeight) / 2, 0);
      expect(band.bottom).toBeLessThanOrEqual(visibleHeight);
      expect(band.top).toBeGreaterThanOrEqual(headerBottom);
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
    expect(band.center).toBeCloseTo((c.headerBottom + c.innerHeight) / 2, 0);
  });

  // A home-screen launch draws under the status bar (`black-translucent`), but
  // WebKit measures the viewport as if it started below it: every height API
  // comes back short by exactly the top safe-area inset, so the app used to
  // stop that far above the bottom of the screen and WebKit painted the strip
  // below it white — in every theme, since the WebGL canvas is transparent.
  // 62px of an iPhone 16 Pro's 874 (the reported bug).
  test("a standalone launch fills the screen the status bar is measured out of", async ({
    page,
  }) => {
    await stubStandalone(page, { inset: 62, screenHeight: 874 });
    await page.setViewportSize({ width: 402, height: 874 - 62 });
    await page.goto("/?mode=square&difficulty=hard&seed=1");
    await expect(page.locator("body[data-ready]")).toBeVisible();

    const c = await chrome(page);
    expect(c.innerHeight).toBe(812); // what WebKit reports, short of the screen
    expect(c.canvasHeight).toBeCloseTo(874, 0); // what the app lays out in
    const band = await boardBand(page);
    expect(band.center).toBeCloseTo((c.headerBottom + 874) / 2, 0);
  });

  // Only that exact signature is corrected. An iPad PWA in Split View is
  // standalone and far shorter than the screen too, and there the window really
  // is all the app has.
  test("a standalone window that is short for another reason is left alone", async ({
    page,
  }) => {
    await stubStandalone(page, { inset: 62, screenHeight: 1180 });
    await page.setViewportSize({ width: 402, height: 812 });
    await page.goto("/?mode=square&difficulty=hard&seed=1");
    await expect(page.locator("body[data-ready]")).toBeVisible();

    const c = await chrome(page);
    expect(c.canvasHeight).toBeCloseTo(812, 0);
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
