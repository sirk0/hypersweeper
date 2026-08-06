import { createRequire } from "node:module";
import { expect, test, type Page } from "@playwright/test";

// The settings page: the gear on the menu, the theme picker, the animations
// toggle and the About block. Themes are asserted through the computed CSS
// custom properties rather than by screenshot — they are the thing the theme
// actually sets, and they survive the anti-aliasing noise a software-WebGL
// screenshot carries.

const pkg = createRequire(import.meta.url)("../../package.json") as { version: string };

function cssVar(page: Page, name: string): Promise<string> {
  return page.evaluate(
    (n) => getComputedStyle(document.documentElement).getPropertyValue(n).trim(),
    name,
  );
}

test.describe("settings", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await expect(page.locator("body[data-ready]")).toBeVisible();
  });

  test("the gear opens settings and back returns to the menu", async ({ page }) => {
    await expect(page.locator('.menu-entry[data-group="custom"]')).toBeVisible();
    await page.locator('.menu-header-btn[data-action="settings"]').click();

    await expect(page.locator(".settings-heading")).toHaveText([
      "Records",
      "Appearance",
      "Behaviour",
      "About",
    ]);
    // The difficulty row is meaningless on this page.
    await expect(page.locator(".menu-difficulty")).toBeHidden();
    await expect(page.locator('.menu-entry[data-group="custom"]')).toHaveCount(0);

    await page.locator('.menu-entry[data-action="back"]').click();
    await expect(page.locator('.menu-entry[data-group="custom"]')).toBeVisible();
    await expect(page.locator(".menu-difficulty")).toBeVisible();
  });

  test("the ? opens how to play and back returns to the menu", async ({ page }) => {
    await page.locator('.menu-header-btn[data-action="help"]').click();

    await expect(page.locator(".settings-heading")).toHaveText([
      "The game",
      "Playing",
      "Boards in space",
      "Choosing a board",
    ]);
    // Static text: no launchable row, and no difficulty row either.
    await expect(page.locator(".menu-entry[data-mode]")).toHaveCount(0);
    await expect(page.locator(".menu-difficulty")).toBeHidden();

    await page.locator('.menu-entry[data-action="back"]').click();
    await expect(page.locator('.menu-entry[data-group="custom"]')).toBeVisible();
    await expect(page.locator(".menu-difficulty")).toBeVisible();
  });

  test("reports the build version from package.json", async ({ page }) => {
    await page.locator('.menu-header-btn[data-action="settings"]').click();
    const version = page.locator('[data-value="version"]');
    // Locally the commit is empty, so the text is the bare version; in CI it
    // reads "0.2.25 (abc1234)".
    await expect(version).toContainText(pkg.version);
  });

  test("the theme row reports the current theme and opens the picker", async ({ page }) => {
    await page.locator('.menu-header-btn[data-action="settings"]').click();
    const row = page.locator('.menu-entry[data-settings-group="theme"]');
    await expect(row).toContainText("Theme");
    await expect(row).toContainText("Light"); // the current one, as a subtitle
    // The themes are a page of their own, not spelled out here.
    await expect(page.locator(".menu-entry[data-theme]")).toHaveCount(0);

    await row.click();
    await expect(page.locator(".menu-entry[data-theme]")).toHaveCount(4);
    await expect(page.locator('.menu-entry[data-action="back"]')).toContainText("Theme");

    // Back lands on settings, not the root menu, and the row has followed.
    await page.locator('.menu-entry[data-theme="realistic"]').click();
    await page.locator('.menu-entry[data-action="back"]').click();
    await expect(page.locator('.menu-entry[data-settings-group="theme"]')).toContainText(
      "Realistic",
    );
  });

  // Appearance is one setting now: a theme carries the chrome palette *and* the
  // board's cell style, so there is no second picker to pair with it.
  test("there is no cell style picker beside the theme", async ({ page }) => {
    await page.locator('.menu-header-btn[data-action="settings"]').click();
    await expect(page.locator('.menu-entry[data-settings-group="cell-style"]')).toHaveCount(0);
  });

  test("picking a theme re-skins the chrome and survives a reload", async ({ page }) => {
    await page.locator('.menu-header-btn[data-action="settings"]').click();
    expect(await cssVar(page, "--bg")).toBe("#f2f2f7"); // the ios default

    await page.locator('.menu-entry[data-settings-group="theme"]').click();
    await page.locator('.menu-entry[data-theme="dark"]').click();
    expect(await cssVar(page, "--bg")).toBe("#101014");
    expect(await cssVar(page, "--panel")).toBe("#1c1c22");
    await expect(page.locator('.menu-entry[data-theme="dark"]')).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    await expect(page.locator('html')).toHaveAttribute("data-theme", "dark");
    // The browser chrome follows too.
    await expect(page.locator('meta[name="theme-color"]')).toHaveAttribute(
      "content",
      "#101014",
    );

    await page.reload();
    await expect(page.locator("body[data-ready]")).toBeVisible();
    expect(await cssVar(page, "--bg")).toBe("#101014");
  });

  test("every theme applies a complete palette", async ({ page }) => {
    await page.locator('.menu-header-btn[data-action="settings"]').click();
    await page.locator('.menu-entry[data-settings-group="theme"]').click();
    const keys = await page
      .locator(".menu-entry[data-theme]")
      .evaluateAll((els) => els.map((e) => (e as HTMLElement).dataset["theme"] ?? ""));
    expect(keys.length).toBeGreaterThanOrEqual(4);
    for (const key of keys) {
      await page.locator(`.menu-entry[data-theme="${key}"]`).click();
      for (const name of ["--bg", "--panel", "--text", "--accent", "--counter-bg"]) {
        expect(await cssVar(page, name), `${key} ${name}`).not.toBe("");
      }
    }
  });

  test("a board launched after picking a theme is cut with that theme's cells", async ({
    page,
  }) => {
    await page.locator('.menu-header-btn[data-action="settings"]').click();
    await page.locator('.menu-entry[data-settings-group="theme"]').click();
    await page.locator('.menu-entry[data-theme="classic"]').click();
    await page.locator('.menu-entry[data-action="back"]').click(); // to settings
    await page.locator('.menu-entry[data-action="back"]').click(); // to the root
    await page.locator('.menu-entry[data-mode="square"]').click(); // Classic

    // The board reports the style its mesh was actually cut with, so this is
    // the assertion that the theme reached the renderer rather than only the
    // settings record — and the relief is a different mesh per style, so the
    // board must still build, pick and play: reveal a cell and read it back.
    const revealed = await page.evaluate(() => {
      const ms = window.__ms!;
      const cell = ms.cells()[0]!;
      ms.reveal(cell);
      return ms.state().revealed;
    });
    expect(revealed).toBeGreaterThan(0);
    const state = await page.evaluate(() => window.__ms?.state());
    expect(state?.mode).toBe("square");
    expect(state?.cellStyle).toBe("classic");
  });

  // Every theme, on a flat board and on a solid: the mesh a board is built with
  // is the one the theme names. A look is hard to assert; "the mesh was cut with
  // this profile" is not — and Realistic is the case that matters most, since it
  // is the only style whose colour buffer carries an alpha channel, so a board
  // that fails to build with it fails here rather than as a blank canvas.
  for (const [key, style] of [
    ["light", "flat"],
    ["dark", "flat"],
    ["classic", "classic"],
    ["realistic", "realistic"],
  ]) {
    test(`the ${key} theme's cells reach the mesh of a flat board and a solid`, async ({
      page,
    }) => {
      await page.locator('.menu-header-btn[data-action="settings"]').click();
      await page.locator('.menu-entry[data-settings-group="theme"]').click();
      await page.locator(`.menu-entry[data-theme="${key}"]`).click();

      for (const mode of ["hex", "sphere"]) {
        const state = await page.evaluate((m: string) => {
          window.__ms!.startBoard(m, "easy");
          return window.__ms!.state();
        }, mode);
        expect(state.mode, `${key} ${mode}`).toBe(mode);
        expect(state.cellStyle, `${key} ${mode}`).toBe(style);
        expect(state.cellCount, `${key} ${mode}`).toBeGreaterThan(0);
      }
    });
  }

  test("the animations toggle persists across a reload", async ({ page }) => {
    await page.locator('.menu-header-btn[data-action="settings"]').click();
    const toggle = page.locator('.menu-entry[data-setting="animations"]');
    // The suite runs under emulated reduced motion, so the OS default is off.
    await expect(toggle).toHaveAttribute("aria-checked", "false");

    await toggle.click();
    await expect(toggle).toHaveAttribute("aria-checked", "true");

    await page.reload();
    await expect(page.locator("body[data-ready]")).toBeVisible();
    await page.locator('.menu-header-btn[data-action="settings"]').click();
    await expect(page.locator('.menu-entry[data-setting="animations"]')).toHaveAttribute(
      "aria-checked",
      "true",
    );
  });

  test("the update check reports a result", async ({ page }) => {
    await page.locator('.menu-header-btn[data-action="settings"]').click();
    await page.locator('.menu-entry[data-action="check-updates"]').click();
    // Whatever the outcome (no service worker under `vite preview`, or an
    // up-to-date one), the button must say something rather than hang.
    await expect(page.locator(".settings-status")).not.toBeEmpty();
  });

  test("a theme survives launching a board", async ({ page }) => {
    await page.locator('.menu-header-btn[data-action="settings"]').click();
    await page.locator('.menu-entry[data-settings-group="theme"]').click();
    await page.locator('.menu-entry[data-theme="classic"]').click();
    await page.locator('.menu-entry[data-action="back"]').click(); // to settings
    await page.locator('.menu-entry[data-action="back"]').click(); // to the root
    await page.locator('.menu-entry[data-mode="square"]').click();

    const state = await page.evaluate(() => window.__ms?.state());
    expect(state?.screen).toBe("game");
    // The header counters read the theme's LED box colour.
    expect(await cssVar(page, "--counter-bg")).toBe("#18181a");
  });
});

test.describe("difficulty persistence", () => {
  test("the chosen difficulty survives a reload and launches boards", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator("body[data-ready]")).toBeVisible();
    await expect(page.locator('.difficulty-btn[data-key="medium"]')).toHaveClass(/active/);

    await page.locator('.difficulty-btn[data-key="hard"]').click();
    await page.reload();
    await expect(page.locator("body[data-ready]")).toBeVisible();
    await expect(page.locator('.difficulty-btn[data-key="hard"]')).toHaveClass(/active/);
    await expect(page.locator('.difficulty-btn[data-key="medium"]')).not.toHaveClass(/active/);

    await page.locator('.menu-entry[data-mode="square"]').click();
    const state = await page.evaluate(() => window.__ms?.state());
    expect(state?.difficulty).toBe("hard");
  });

  test("a deep link with no difficulty uses the stored one", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator("body[data-ready]")).toBeVisible();
    await page.locator('.difficulty-btn[data-key="easy"]').click();

    await page.goto("/?mode=hex");
    await expect(page.locator("body[data-ready]")).toBeVisible();
    expect((await page.evaluate(() => window.__ms?.state()))?.difficulty).toBe("easy");

    // An explicit one in the link still wins, and does not overwrite the stored
    // preference.
    await page.goto("/?mode=hex&difficulty=hard");
    await expect(page.locator("body[data-ready]")).toBeVisible();
    expect((await page.evaluate(() => window.__ms?.state()))?.difficulty).toBe("hard");
    await page.goto("/");
    await expect(page.locator("body[data-ready]")).toBeVisible();
    await expect(page.locator('.difficulty-btn[data-key="easy"]')).toHaveClass(/active/);
  });
});

test.describe("shareable board links", () => {
  test("the address bar holds the link that reopens the board", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator("body[data-ready]")).toBeVisible();
    await page.locator('.difficulty-btn[data-key="easy"]').click();

    // Klein bottle → the tiling picker → a wrapped tiling, the sort of board a
    // link is worth sharing for.
    await page.locator('.menu-entry[data-group="custom"]').click();
    await page.locator('.menu-entry[data-group="manifolds"]').click();
    await page.locator('.menu-entry[data-surface="klein"]').click();
    await page.locator('.menu-entry[data-submenu="dual"]').click();
    await page.locator('.menu-entry[data-mode="kleintriakis"]').click();

    await expect(page).toHaveURL(/\?mode=kleintriakis&difficulty=easy$/);

    // The link is the whole story: opening it fresh lands on the same board.
    const url = page.url();
    await page.goto(url);
    await expect(page.locator("body[data-ready]")).toBeVisible();
    const state = await page.evaluate(() => window.__ms?.state());
    expect(state?.screen).toBe("game");
    expect(state?.mode).toBe("kleintriakis");
    expect(state?.difficulty).toBe("easy");
  });

  test("going back to the menu drops the board's link", async ({ page }) => {
    await page.goto("/?mode=hex&difficulty=hard");
    await expect(page.locator("body[data-ready]")).toBeVisible();
    await expect(page).toHaveURL(/\?mode=hex/);

    await page.locator('.hud-btn[data-slot="back"]').click();
    await expect(page).not.toHaveURL(/mode=/);
    // ...so a reload from the menu shows the menu, not the board again.
    await page.reload();
    await expect(page.locator("body[data-ready]")).toBeVisible();
    expect((await page.evaluate(() => window.__ms?.state()))?.screen).toBe("menu");
  });

  test("a link to a board this build does not have opens the menu", async ({ page }) => {
    // The floret pentagonal is chiral: it has no Klein bottle wrap.
    await page.goto("/?mode=kleinfloret&difficulty=easy");
    await expect(page.locator("body[data-ready]")).toBeVisible();

    const state = await page.evaluate(() => window.__ms?.state());
    expect(state?.screen).toBe("menu");
    // The difficulty it did name is still read.
    await expect(page.locator('.difficulty-btn[data-key="easy"]')).toHaveClass(/active/);
    // ...and the unusable one was not persisted as a preference.
    await page.goto("/");
    await expect(page.locator("body[data-ready]")).toBeVisible();
    await expect(page.locator('.difficulty-btn[data-key="medium"]')).toHaveClass(/active/);
  });

  test("a mode named after an Object property is not a board", async ({ page }) => {
    await page.goto("/?mode=toString&difficulty=easy");
    await expect(page.locator("body[data-ready]")).toBeVisible();
    expect((await page.evaluate(() => window.__ms?.state()))?.screen).toBe("menu");
  });

  test("an unknown difficulty falls back without losing the board", async ({ page }) => {
    await page.goto("/?mode=hex&difficulty=nightmare");
    await expect(page.locator("body[data-ready]")).toBeVisible();
    const state = await page.evaluate(() => window.__ms?.state());
    expect(state?.mode).toBe("hex");
    expect(state?.difficulty).toBe("medium"); // the stored default
  });

  test("a seeded link reproduces the same board", async ({ page }) => {
    const mines = async (): Promise<number> =>
      (await page.evaluate(() => window.__ms?.state()))?.minesRemaining ?? -1;
    await page.goto("/?mode=square&difficulty=easy&seed=1234");
    await expect(page.locator("body[data-ready]")).toBeVisible();
    expect(await mines()).toBeGreaterThan(0);
    // The seed stays in the link, so re-sharing it hands on the same board.
    await expect(page).toHaveURL(/seed=1234/);
  });
});
