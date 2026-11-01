import { expect, test, type Page } from "@playwright/test";

// The deployed build, end to end: it boots under the real security policy, its
// screens open, and a tile dragged onto the board lands. Unit tests cover the
// geometry and the rules; this covers the page.

/** Collect console errors and CSP violations for the whole test. */
function watchErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on("console", (msg) => {
    if (msg.type() === "error") errors.push(msg.text());
  });
  page.on("pageerror", (err) => errors.push(String(err)));
  return errors;
}

test("boots under the deployed security policy, with no errors", async ({ page }) => {
  const errors = watchErrors(page);
  const response = await page.goto("/");
  expect(response?.headers()["content-security-policy"]).toContain("default-src 'self'");
  await expect(page.locator("#home")).toBeVisible();
  await expect(page.locator("#home-picks > *")).toHaveCount(4);
  // The deployed extras the shared preset adds.
  await expect(page.locator('link[rel="manifest"]')).toHaveAttribute(
    "href",
    "/manifest.webmanifest",
  );
  await expect(page.locator('meta[property="og:title"]')).toHaveAttribute("content", "Rep-tiles");
  const stamp = (await (await page.request.get("/version.json")).json()) as { version: string };
  expect(stamp.version).toMatch(/^\d+\.\d+\.\d+$/);
  expect(errors).toEqual([]);
});

test("a pick from home deals a level, and the catalog lists every family", async ({ page }) => {
  const errors = watchErrors(page);
  await page.goto("/");
  await page.locator("#home-picks > *").first().click();
  await expect(page.locator("#game")).toBeVisible();
  await expect(page.locator("svg.board path.region")).toHaveCount(1);
  await expect(page.locator("svg.board .in-tray").first()).toBeVisible();

  await page.goto("/?catalog");
  await expect(page.locator("#catalog")).toBeVisible();
  await expect(page.locator("#catalog-list button, #catalog-list a").first()).toBeVisible();
  expect(errors).toEqual([]);
});

test("a square dragged into the corner of the squares level lands there", async ({ page }) => {
  const errors = watchErrors(page);
  await page.goto("/?level=squares");
  const count = page.locator("#count");
  await expect(count).toBeVisible();
  const before = await count.textContent();

  const tray = page.locator("svg.board polygon.in-tray").first();
  const t = (await tray.boundingBox())!;
  const r = (await page.locator("svg.board path.region").boundingBox())!;
  // Press the tray square at its centre — the tile then keeps its centre
  // under the pointer — and drop it half a tile in from the board's
  // bottom-left corner, where it snaps.
  await page.mouse.move(t.x + t.width / 2, t.y + t.height / 2);
  await page.mouse.down();
  const target = { x: r.x + t.width / 2, y: r.y + r.height - t.height / 2 };
  await page.mouse.move(target.x, target.y, { steps: 12 });
  await page.mouse.up();

  await expect(page.locator("svg.board [data-tile]")).toHaveCount(1);
  await expect(count).not.toHaveText(before ?? "");
  expect(errors).toEqual([]);
});
