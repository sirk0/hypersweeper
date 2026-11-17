import { readFileSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";

// Every level opens, and every tiling's page — in Chromium and, in CI, in
// WebKit as an iPhone (playwright.config.ts): a level that throws as it is
// built shows nothing at all (a tiling's card that "does nothing" when
// tapped), and a level can throw in one browser and not another (Safari's
// sin and cos are not Chrome's; tests/unit/engines.test.ts). So each is
// opened, in the page, and must show with no error.

interface Entry {
  key: string;
  decor?: { of: string; rules: boolean };
}
const INDEX = JSON.parse(
  readFileSync(new URL("../../src/levelIndex.json", import.meta.url), "utf8"),
) as Entry[];
const PLAIN = INDEX.filter((e) => !e.decor);
const markedOf = (key: string): Entry[] => INDEX.filter((e) => e.decor?.of === key);
// …and every marked level on the boards past the first it is laid on
// (src/markedBoards.json): its painting carried onto another board, or its
// rule read off another window of its patch
const MARKED_BOARDS = (
  JSON.parse(readFileSync(new URL("../../src/markedBoards.json", import.meta.url), "utf8")) as {
    boards: Record<string, number[]>;
  }
).boards;
const EVERY: { key: string }[] = [
  ...INDEX,
  ...Object.entries(MARKED_BOARDS).flatMap(([key, ns]) => ns.map((n) => ({ key: `${key}-${n}` }))),
];

/** Every error the page reports, as it happens. */
function watchErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on("console", (msg) => {
    if (msg.type() === "error") errors.push(msg.text());
  });
  page.on("pageerror", (err) => errors.push(String(err)));
  return errors;
}

/** Move the page to `query` as a link inside it would — no reload, so a
 * hundred levels open in seconds. */
async function go(page: Page, query: string): Promise<void> {
  await page.evaluate((q) => {
    history.pushState(null, "", q);
    dispatchEvent(new PopStateEvent("popstate"));
  }, query);
}

/** `items` in runs of `size`, so the sweep spreads over the workers. */
const runs = <T>(items: T[], size: number): T[][] =>
  Array.from({ length: Math.ceil(items.length / size) }, (_, i) =>
    items.slice(i * size, (i + 1) * size),
  );

test("tapping a tiling with marked levels opens its page: V4.6.12", async ({ page }) => {
  const errors = watchErrors(page);
  // its group: on a desktop that group's page (V4.6.12 is a Laves tiling),
  // on a phone every family, scrolled to it
  await page.goto("/?group=irregular");
  await page
    .locator("#catalog .card")
    .filter({ has: page.locator(".card-name", { hasText: /^V4\.6\.12$/ }) })
    .click();
  await expect(page).toHaveURL(/\?tiling=kisrhombille&pick=/);
  await expect(page.locator("#tiling")).toBeVisible();
  await expect(page.locator('#tiling-list [data-marking^="kisrhombille."]').first()).toBeVisible();
  expect(errors).toEqual([]);
});

for (const [n, run] of runs(EVERY, 25).entries()) {
  test(`every level opens with no error (${n + 1}: ${run[0]!.key} to ${run.at(-1)!.key})`, async ({
    page,
  }) => {
    const errors = watchErrors(page);
    await page.goto("/");
    for (const { key } of run) {
      await go(page, `?level=${key}`);
      await expect(page.locator("#game"), key).toBeVisible();
      await expect(page.locator("svg.board .tray-layer path").first(), key).toBeAttached();
      expect(errors, key).toEqual([]);
    }
  });
}

// WebKit allows 100 history.pushState calls per 10 seconds a page, so the
// tilings are spread over several tests, each its own page.
const WITH_MARKED = PLAIN.filter((e) => markedOf(e.key).length > 0);
for (const [n, run] of runs(WITH_MARKED, 20).entries()) {
  test(`every tiling with marked levels opens its page, every marked level on it (${n + 1}: ${run[0]!.key} to ${run.at(-1)!.key})`, async ({
    page,
  }) => {
    const errors = watchErrors(page);
    await page.goto("/");
    for (const { key } of run) {
      const marked = markedOf(key);
      await go(page, `?tiling=${key}`);
      await expect(page.locator("#tiling"), key).toBeVisible();
      await expect(page.locator("#tiling-list .marking-card"), key).toHaveCount(1 + marked.length);
      // every tray drawn (each marked level built), with no error
      await expect(page.locator("#tiling-list .marking-card .tray-icon"), key).toHaveCount(
        1 + marked.length,
      );
      expect(errors, key).toEqual([]);
    }
  });
}
