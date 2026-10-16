import { expect, test, type Page } from "@playwright/test";

// The native menu bar (the Mac app, and an iPad's ⌘ shortcuts) reaches the
// page as `hypersweeper:command` events (ios/App/App/AppDelegate.swift →
// BridgeViewController.swift → App.onCommand). The native half cannot run
// here; the page's half is what these pin. The File menu's boards and
// difficulties carry the commands the page handed it (src/menuBar.ts; the tree
// itself is pinned by tests/unit/menuBar.test.ts).

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

test("a board picked from the menu bar starts at the difficulty in play, from anywhere", async ({
  page,
}) => {
  await send(page, "board:hex");
  let state = await page.evaluate(() => window.__ms!.state());
  expect(state.screen).toBe("game");
  expect(state.mode).toBe("hex");
  expect(state.difficulty).toBe("easy");
  expect(state.dealtAtRandom).toBe(false);

  // ...and from a game in progress, which it abandons without asking.
  await page.evaluate(() => window.__ms!.reveal(window.__ms!.cells()[0]!));
  await send(page, "quick:cube3d");
  state = await page.evaluate(() => window.__ms!.state());
  expect(state.mode).toBe("cube3d");
  expect(state.revealed).toBe(0);
});

test("Random 3D Board deals a board off the plane", async ({ page }) => {
  await send(page, "random:3d");
  const state = await page.evaluate(() => window.__ms!.state());
  expect(state.screen).toBe("game");
  expect(state.is3d).toBe(true);
  expect(state.dealtAtRandom).toBe(true);
});

test("a difficulty picked on the home screen moves the pills", async ({ page }) => {
  await send(page, "difficulty:hard");
  await expect(page.locator(".difficulty-btn.active")).toHaveAttribute("data-key", "hard");
  expect((await page.evaluate(() => window.__ms!.state())).screen).toBe("menu");
  // ...and is the setting, which the next board is dealt at.
  await send(page, "board:square");
  expect((await page.evaluate(() => window.__ms!.state())).difficulty).toBe("hard");
});

test("a difficulty picked mid-game re-deals the board on screen at it", async ({ page }) => {
  await page.evaluate(() => window.__ms!.startBoard("hex", "easy", { seed: 7 }));
  await page.evaluate(() => window.__ms!.reveal(window.__ms!.cells()[0]!));
  await send(page, "difficulty:medium");
  const state = await page.evaluate(() => window.__ms!.state());
  expect(state.screen).toBe("game");
  expect(state.mode).toBe("hex");
  expect(state.difficulty).toBe("medium");
  expect(state.revealed).toBe(0);
  // Picking the level already in play leaves the game alone.
  await page.evaluate(() => window.__ms!.reveal(window.__ms!.cells()[0]!));
  await send(page, "difficulty:medium");
  expect((await page.evaluate(() => window.__ms!.state())).revealed).toBeGreaterThan(0);
});

test("a blocked board picked from the menu bar opens its explanation", async ({ page }) => {
  // As its home-menu row does (app.spec.ts): triakis cannot be played fairly.
  await page.evaluate(() => window.__ms!.startBoard("square", "easy", { seed: 7 }));
  await send(page, "board:triakis");
  expect((await page.evaluate(() => window.__ms!.state())).screen).toBe("menu");
  await expect(page.locator(".menu-blocked")).toHaveAttribute("data-mode", "triakis");
});

test("malformed board and difficulty commands are ignored", async ({ page }) => {
  for (const name of ["board:", "board:nosuchboard", "random:4d", "difficulty:insane", "quick"]) {
    await send(page, name);
  }
  const state = await page.evaluate(() => window.__ms!.state());
  expect(state.screen).toBe("menu");
  await expect(page.locator(".difficulty-btn.active")).toHaveAttribute("data-key", "easy");
});
