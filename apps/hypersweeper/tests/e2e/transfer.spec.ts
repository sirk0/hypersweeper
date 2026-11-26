import { expect, test, type Browser, type Page } from "@playwright/test";

// Transfer links (src/transfer.ts, ui/settings.ts, ui/transferDialog.ts): the
// settings page hands this browser's record over as a link, and opening that
// link — or pasting it — in a browser with storage of its own brings the record
// across, merged, and says what came. Each "browser" here is a fresh context,
// which is exactly a fresh origin's storage.

const SCORES = {
  version: 1,
  boards: { "square|easy": [{ ms: 4100, at: 1_700_000_000_000 }] },
};
const STARS = { version: 1, modes: { square: { on: true, at: 1_700_000_000_000 } } };

async function seed(page: Page): Promise<void> {
  await page.addInitScript(
    ([scores, stars]) => {
      // Only on the first load: the import writes these keys, and a reload
      // must see what it wrote.
      if (localStorage.getItem("ms:scores")) return;
      localStorage.setItem("ms:scores", JSON.stringify(scores));
      localStorage.setItem("ms:favourites", JSON.stringify(stars));
    },
    [SCORES, STARS] as const,
  );
}

async function openSettings(page: Page): Promise<void> {
  await page.goto("/");
  await expect(page.locator("body[data-ready]")).toBeVisible();
  await page.locator('.menu-header-btn[data-action="settings"]').click();
}

/** The link the settings page copies, from a browser holding the seed. */
async function copiedLink(browser: Browser): Promise<string> {
  const context = await browser.newContext({ permissions: ["clipboard-read", "clipboard-write"] });
  const page = await context.newPage();
  // No share sheet, so the row goes to the clipboard as a desktop browser does.
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "share", { value: undefined, configurable: true });
  });
  await seed(page);
  await openSettings(page);
  await page.locator('[data-action="transfer-copy"]').click();
  await expect(page.locator('[data-action="transfer-copy"] .settings-status')).toHaveText(
    /Link copied/,
  );
  const link = await page.evaluate(() => navigator.clipboard.readText());
  await context.close();
  expect(link).toMatch(/#transfer=[jz][A-Za-z0-9_-]+$/);
  return link;
}

async function stored(page: Page, key: string): Promise<unknown> {
  return page.evaluate((k) => JSON.parse(localStorage.getItem(k) ?? "null") as unknown, key);
}

test.describe("transfer links", () => {
  test("a copied link brings the record into another browser", async ({ browser, page }) => {
    const link = await copiedLink(browser);
    const path = new URL(link).pathname + new URL(link).hash;

    await page.goto(path);
    const dialog = page.locator('[data-dialog="transfer"]');
    await expect(dialog.locator(".dialog-title")).toHaveText("Progress transferred");
    await expect(dialog.locator(".dialog-transfer-list li")).toContainText([
      "Best times on 1 board",
      "1 achievement",
      "1 starred board",
    ]);
    // The token is out of the address, so a reload does not import again.
    expect(new URL(page.url()).hash).toBe("");
    expect(await stored(page, "ms:scores")).toMatchObject({ boards: SCORES.boards });
    expect(await stored(page, "ms:favourites")).toMatchObject({ modes: STARS.modes });

    await dialog.locator('[data-action="done"]').click();
    await expect(dialog).toHaveCount(0);

    // The same link again: merged, so nothing new.
    await page.goto(path);
    await expect(page.locator('[data-dialog="transfer"] .dialog-title')).toHaveText(
      "Already up to date",
    );
  });

  test("a pasted link imports into this browser", async ({ browser, page }) => {
    const link = await copiedLink(browser);
    await openSettings(page);
    await page.locator('[data-action="transfer-paste"]').click();
    const field = page.locator(".settings-transfer-form input");
    await expect(field).toBeFocused();
    await field.fill(`Here is my progress: ${link}`);
    await page.locator('[data-action="transfer-import"]').click();

    await expect(page.locator('[data-dialog="transfer"] .dialog-title')).toHaveText(
      "Progress transferred",
    );
    expect(new URL(page.url()).hash).toBe("");
    expect(await stored(page, "ms:scores")).toMatchObject({ boards: SCORES.boards });
  });

  test("a pasted line that is not a link is answered on the row", async ({ page }) => {
    await openSettings(page);
    await page.locator('[data-action="transfer-paste"]').click();
    await page.locator(".settings-transfer-form input").fill("https://example.com/#transfer=zAAAA");
    await page.locator('[data-action="transfer-import"]').click();
    await expect(page.locator('[data-action="transfer-paste"] .settings-status')).toHaveText(
      /not a transfer link/,
    );
    await expect(page.locator('[data-dialog="transfer"]')).toHaveCount(0);
  });

  test("a damaged link changes nothing and says so", async ({ page }) => {
    await page.goto("/#transfer=zNotARealToken");
    await expect(page.locator('[data-dialog="transfer"] .dialog-title')).toHaveText(
      "Link not recognised",
    );
    expect(new URL(page.url()).hash).toBe("");
    expect(await stored(page, "ms:scores")).toBeNull();
  });
});
