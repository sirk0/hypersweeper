import { expect, test, type Page } from "@playwright/test";

// The native menu bar (the Mac app, and an iPad's ⌘ shortcuts) reaches the
// page as `hypersweeper:command` events (ios/App/App/AppDelegate.swift →
// BridgeViewController.swift → App.onCommand). The native half cannot run
// here; the page's half is what these pin.

const send = (page: Page, name: string) =>
  page.evaluate(
    (detail) => window.dispatchEvent(new CustomEvent("hypersweeper:command", { detail })),
    name,
  );

test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 900, height: 700 });
  await page.goto("/");
  await expect(page.locator("body[data-ready]")).toBeVisible();
});

test("Settings and How to Play open their pages from the home screen", async ({ page }) => {
  await send(page, "settings");
  await expect(page.locator(".settings-open")).toHaveCount(1);
  await expect(page.getByText("Appearance", { exact: false }).first()).toBeVisible();
  await send(page, "help");
  await expect(page.locator(".settings-open")).toHaveCount(1);
});

test("New Game re-deals the board in play", async ({ page }) => {
  await page.evaluate(() => window.__ms!.startBoard("square", "easy", { seed: 7 }));
  await page.evaluate(() => window.__ms!.reveal(window.__ms!.cells()[0]!));
  expect((await page.evaluate(() => window.__ms!.state())).revealed).toBeGreaterThan(0);
  await send(page, "new-game");
  const after = await page.evaluate(() => window.__ms!.state());
  expect(after.screen).toBe("game");
  expect(after.mode).toBe("square");
  expect(after.revealed).toBe(0);
});

// From a game they go home first, the way the header's back arrow does.
for (const name of ["settings", "help"]) {
  test(`${name} from a game goes home and opens the page`, async ({ page }) => {
    await page.evaluate(() => window.__ms!.startBoard("square", "easy", { seed: 7 }));
    await page.evaluate(() => window.__ms!.reveal(window.__ms!.cells()[0]!));
    await send(page, name);
    expect((await page.evaluate(() => window.__ms!.state())).screen).toBe("menu");
    await expect(page.locator(".settings-open")).toHaveCount(1);
    await expect(page.locator("#hud, .hud").first()).toBeHidden();
  });
}

test("New Game does nothing on the home screen, and unknown commands are ignored", async ({
  page,
}) => {
  await send(page, "new-game");
  await send(page, "format-disk");
  expect((await page.evaluate(() => window.__ms!.state())).screen).toBe("menu");
});
