import { expect, test } from "@playwright/test";

// The deployed build, end to end: it boots under the real security policy with
// no console errors, draws its board, and a press changes the board.
test("boots, draws the board, and a press changes it", async ({ page }) => {
  const errors: string[] = [];
  page.on("console", (msg) => {
    if (msg.type() === "error") errors.push(msg.text());
  });
  page.on("pageerror", (err) => errors.push(String(err)));

  const response = await page.goto("/");
  expect(response?.headers()["content-security-policy"]).toContain("default-src 'self'");
  await expect(page.locator("body")).toHaveAttribute("data-ready", "1");
  const cells = page.locator("svg.board polygon.cell");
  expect(await cells.count()).toBeGreaterThan(10);

  const before = await page.locator("svg.board polygon.lit").count();
  await cells.first().click();
  await expect(page.locator("#status")).toContainText("1 presses");
  expect(await page.locator("svg.board polygon.lit").count()).not.toBe(before);
  expect(errors).toEqual([]);
});
