import { expect, test, type Page } from "@playwright/test";

// The App Clip (ios/App/AppClip): the same bundle, told by its native side
// which one board to play (`window.hypersweeperClip`) and listening for wins on
// a `hypersweeperClip` message handler (src/appClip.ts). Both are faked here
// before the bundle runs, as ClipBridgeViewController.swift does on a device;
// what the native side does with a message (the full-game SKOverlay) is
// Apple's and needs a device to see.

const BOARD = "c80";

declare global {
  interface Window {
    __clipPosts?: unknown[];
  }
}

/** Boot as the clip does, recording what the page tells the native side. */
async function bootClip(page: Page, board: string = BOARD): Promise<void> {
  await page.addInitScript((name) => {
    const w = window as unknown as Record<string, unknown>;
    w["hypersweeperClip"] = name;
    window.__clipPosts = [];
    w["webkit"] = {
      messageHandlers: {
        hypersweeperClip: { postMessage: (m: unknown) => window.__clipPosts!.push(m) },
      },
    };
  }, board);
  await page.goto("/");
  await expect(page.locator("body[data-ready]")).toBeVisible();
}

/** Win the clip's board: one mine, and every other cell opened in turn. */
async function winClipBoard(page: Page): Promise<void> {
  await page.evaluate((board) => {
    const hook = window.__ms!;
    const cells = hook.cells();
    hook.startBoard(board, "easy", { mines: [cells[0]!] });
    for (const cell of cells.slice(1)) {
      if (hook.cellState(cell) === "hidden") hook.reveal(cell);
      if (hook.state().status !== "playing") break;
    }
  }, BOARD);
  expect((await page.evaluate(() => window.__ms!.state())).status).toBe("won");
}

const dialog = (page: Page) => page.locator('[data-dialog="score"]');
const posts = (page: Page) => page.evaluate(() => window.__clipPosts);

test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.addInitScript(() =>
    localStorage.setItem("ms:settings", JSON.stringify({ version: 5, seenHint: true })),
  );
});

test("opens its board straight away, at the default difficulty", async ({ page }) => {
  await bootClip(page);
  const state = await page.evaluate(() => window.__ms!.state());
  expect(state.screen).toBe("game");
  expect(state.mode).toBe(BOARD);
  expect(state.difficulty).toBe("easy");
  await expect(page.locator(".menu")).toBeHidden();
});

test("the header has no way home and no other board, and the smiley stays centred", async ({
  page,
}) => {
  await bootClip(page);
  await expect(page.locator('.hud [data-slot="back"]')).toBeHidden();
  await expect(page.locator('.hud [data-slot="random"]')).toBeHidden();
  await expect(page.locator('.hud [data-slot="flag-mode"]')).toBeVisible();
  await expect(page.locator('.hud [data-slot="info"]')).toBeVisible();
  const box = await page.locator(".hud-smiley").boundingBox();
  expect(Math.abs(box!.x + box!.width / 2 - 390 / 2)).toBeLessThanOrEqual(1);
  // What is left sits in the corners, mirroring each other: the flag as far
  // from the left edge as the ⓘ is from the right.
  const flag = (await page.locator('.hud [data-slot="flag-mode"]').boundingBox())!;
  const info = (await page.locator('.hud [data-slot="info"]').boundingBox())!;
  expect(Math.abs(flag.x - (390 - info.x - info.width))).toBeLessThanOrEqual(1);
  // Held as space, so neither can be reached from the keyboard either.
  await expect(page.locator('.hud [data-slot="back"]')).toBeDisabled();
  await expect(page.locator('.hud [data-slot="random"]')).toBeDisabled();
});

test("the header's buttons are the app's size, a standard touch target", async ({ page }) => {
  // The clip is the same header with two slots held empty, so it sizes the
  // same way (tests/e2e/hud.spec.ts): 44pt or more on a 16 Pro.
  await page.setViewportSize({ width: 402, height: 874 });
  await bootClip(page);
  for (const slot of ["flag-mode", "smiley", "info"]) {
    const box = (await page.locator(`.hud [data-slot="${slot}"]`).boundingBox())!;
    expect(box.width).toBeGreaterThanOrEqual(44);
    expect(box.height).toBeGreaterThanOrEqual(44);
  }
});

test("menu-bar commands that lead home do nothing", async ({ page }) => {
  await bootClip(page);
  for (const name of ["settings", "help"]) {
    await page.evaluate(
      (detail) => window.dispatchEvent(new CustomEvent("hypersweeper:command", { detail })),
      name,
    );
  }
  expect((await page.evaluate(() => window.__ms!.state())).screen).toBe("game");
});

test("a win puts no card up, records nothing, and offers the full game", async ({ page }) => {
  await bootClip(page);
  await winClipBoard(page);
  // The win is what the native side offers the full game on.
  await expect.poll(() => posts(page)).toContain("won");
  await expect(dialog(page)).toHaveCount(0);
  expect(await page.evaluate(() => localStorage.getItem("ms:achievements"))).toBeNull();
  expect(await page.evaluate(() => localStorage.getItem("ms:scores"))).toBeNull();

  // The smiley is the way to go again, and the next board takes the offer down.
  await page.locator(".hud-smiley").click();
  const state = await page.evaluate(() => window.__ms!.state());
  expect(state.mode).toBe(BOARD);
  expect(state.status).toBe("playing");
  expect((await posts(page))!.at(-1)).toBe("started");
});

test("a board this build does not have opens the menu instead", async ({ page }) => {
  await bootClip(page, "no-such-board");
  expect((await page.evaluate(() => window.__ms!.state())).screen).toBe("menu");
});

test("outside a clip the app opens on the menu, header intact", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator("body[data-ready]")).toBeVisible();
  await expect(page.locator('.hud [data-slot="back"]')).toHaveCount(1);
  expect((await page.evaluate(() => window.__ms!.state())).screen).toBe("menu");
});
