import { expect, test, type Page } from "@playwright/test";

// The privacy policy, public/privacy.html — the page App Store Connect links to
// as https://hypersweeper.pages.dev/privacy. What matters is that the bare
// /privacy is that page and never the game, wherever it is asked for:
//
//   - from a fresh visitor (no service worker), which is App Review and anyone
//     following the store's link — `vite preview` rewrites /privacy to
//     privacy.html the way Cloudflare Pages serves it;
//   - from a visitor who has played, whose root-scoped service worker answers
//     every navigation it can. The precache matches /privacy to privacy.html
//     (Workbox `cleanURLs`), and vite.config.ts keeps the path off the app
//     shell fallback, so either way the policy is what comes back.
//
// It is also served under the site's real Content-Security-Policy (the
// `securityHeaders` plugin applies public/_headers to `vite preview`), which is
// what proves the page needs no script and nothing remote.

async function collectViolations(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const seen: string[] = [];
    (window as unknown as { __csp: string[] }).__csp = seen;
    document.addEventListener("securitypolicyviolation", (e) => {
      seen.push(`${e.violatedDirective} blocked ${e.blockedURI || "(inline)"}`);
    });
  });
}

const violations = (page: Page): Promise<string[]> =>
  page.evaluate(() => (window as unknown as { __csp?: string[] }).__csp ?? []);

async function expectPolicy(page: Page): Promise<void> {
  await expect(page.locator("h1")).toHaveText("Privacy policy");
  // Not the app: the game's boot marker never appears on this page.
  await expect(page.locator("body[data-ready]")).toHaveCount(0);
  await expect(page.locator("canvas")).toHaveCount(0);
}

test.describe("privacy policy", () => {
  test("/privacy is the policy, served clean under the site's headers", async ({ page }) => {
    await collectViolations(page);
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(String(e)));
    page.on("console", (m) => {
      if (m.type() === "error") errors.push(m.text());
    });

    const response = await page.goto("/privacy");
    expect(response?.status()).toBe(200);
    expect(response?.headers()["content-type"]).toContain("text/html");
    expect(response?.headers()["content-security-policy"]).toContain("default-src 'self'");
    await expectPolicy(page);
    await expect(
      page.locator("a[href='https://github.com/sirk0/hypersweeper/issues']"),
    ).toBeVisible();
    // The page's own fonts are the site's, loaded from this origin.
    await page.evaluate(() => document.fonts.ready);
    expect(await page.evaluate(() => document.fonts.check('16px "Space Grotesk"'))).toBe(true);

    expect(await violations(page)).toEqual([]);
    expect(errors).toEqual([]);
  });

  test("it reads on a phone: no sideways scroll at 320px", async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 640 });
    await page.goto("/privacy");
    await expectPolicy(page);
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBe(0);
  });

  test("an installed visitor still gets the policy, not the game", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator("body[data-ready]")).toBeVisible();
    // Wait until the root-scoped worker is installed *and* controls the page,
    // which is the state in which its navigation fallback would otherwise
    // answer /privacy with the app shell.
    await page.evaluate(async () => {
      await navigator.serviceWorker.ready;
      if (!navigator.serviceWorker.controller) {
        await new Promise<void>((resolve) =>
          navigator.serviceWorker.addEventListener("controllerchange", () => resolve(), {
            once: true,
          }),
        );
      }
    });

    await page.goto("/privacy");
    await expectPolicy(page);
    expect(await page.evaluate(() => navigator.serviceWorker.controller !== null)).toBe(true);
  });

  test("Settings › Privacy links to it in a new tab", async ({ page, context }) => {
    await page.setViewportSize({ width: 900, height: 700 });
    await page.goto("/");
    await expect(page.locator("body[data-ready]")).toBeVisible();
    await page.locator('.menu-header-btn[data-action="settings"]').click();

    const link = page.locator('a[data-action="privacy-policy"]');
    await expect(link).toHaveAttribute("href", "/privacy");
    await expect(link).toHaveAttribute("target", "_blank");
    const [popup] = await Promise.all([context.waitForEvent("page"), link.click()]);
    await popup.waitForLoadState();
    expect(new URL(popup.url()).pathname).toBe("/privacy");
    await expectPolicy(popup);
    // The game is still on settings in the tab it was left in.
    await expect(page.locator(".settings-heading").first()).toBeVisible();
  });
});
