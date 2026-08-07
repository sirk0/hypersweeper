import { expect, test, type Page } from "@playwright/test";

// The sound setting, and the proof that a chosen preset actually reaches the
// audio engine when a board is played.
//
// A synthesised sound leaves nothing in the DOM and nothing on disk, so there
// are two ways in: `window.__ms.state().sound` reports what the engine is set
// to, and the init script below counts the oscillators the page builds. That
// second one is what makes "clicking a cell plays something, and a flood fill
// plays more" assertable at all — it needs no audio output device and no
// autoplay policy, since it counts nodes being *scheduled*, which happens
// whether or not the context has been resumed.

declare global {
  interface Window {
    __oscillators?: number;
  }
}

/** Count every oscillator the page creates, on whichever AudioContext it uses. */
async function countOscillators(page: Page): Promise<void> {
  await page.addInitScript(() => {
    window.__oscillators = 0;
    const Ctor =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext })
        .webkitAudioContext;
    if (!Ctor) return;
    const original = Ctor.prototype.createOscillator;
    Ctor.prototype.createOscillator = function (this: AudioContext) {
      window.__oscillators = (window.__oscillators ?? 0) + 1;
      return original.call(this);
    };
  });
}

function oscillators(page: Page): Promise<number> {
  return page.evaluate(() => window.__oscillators ?? 0);
}

test.describe("sound settings", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await expect(page.locator("body[data-ready]")).toBeVisible();
  });

  test("the Sound row opens a picker of three presets and Off", async ({ page }) => {
    await page.locator('.menu-header-btn[data-action="settings"]').click();
    const row = page.locator('.menu-entry[data-settings-group="sound"]');
    await expect(row).toContainText("Sound");
    await expect(row).toContainText("Chime"); // the default, as a subtitle
    await expect(page.locator(".menu-entry[data-sound]")).toHaveCount(0);

    await row.click();
    await expect(page.locator('.menu-entry[data-action="back"]')).toContainText("Sound");
    const keys = await page
      .locator(".menu-entry[data-sound]")
      .evaluateAll((els) => els.map((e) => (e as HTMLElement).dataset["sound"] ?? ""));
    expect(keys).toEqual(["chime", "arcade", "blocks", "off"]);
    await expect(page.locator('.menu-entry[data-sound="chime"]')).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });

  test("picking a preset reaches the engine and survives a reload", async ({ page }) => {
    await page.locator('.menu-header-btn[data-action="settings"]').click();
    await page.locator('.menu-entry[data-settings-group="sound"]').click();
    await page.locator('.menu-entry[data-sound="arcade"]').click();
    await expect(page.locator('.menu-entry[data-sound="arcade"]')).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(await page.evaluate(() => window.__ms?.state().sound)).toBe("arcade");

    // Back lands on settings, with the row reporting the new preset.
    await page.locator('.menu-entry[data-action="back"]').click();
    await expect(page.locator('.menu-entry[data-settings-group="sound"]')).toContainText(
      "Arcade",
    );

    await page.reload();
    await expect(page.locator("body[data-ready]")).toBeVisible();
    expect(await page.evaluate(() => window.__ms?.state().sound)).toBe("arcade");
    await page.locator('.menu-header-btn[data-action="settings"]').click();
    await expect(page.locator('.menu-entry[data-settings-group="sound"]')).toContainText(
      "Arcade",
    );
  });

  test("the volume slider caps the engine and survives a reload", async ({ page }) => {
    await page.locator('.menu-header-btn[data-action="settings"]').click();
    await page.locator('.menu-entry[data-settings-group="sound"]').click();
    const slider = page.locator('.settings-range[data-setting="volume"]');
    await expect(slider).toHaveValue("50"); // the default, half volume

    // `fill` sets the value and fires input+change, which is what a drag and a
    // release do — the first feeds the engine live, the second persists.
    await slider.fill("40");
    expect(await page.evaluate(() => window.__ms?.state().volume)).toBeCloseTo(0.4, 5);
    await expect(page.locator('.menu-entry.settings-volume')).toContainText("40%");

    // The settings row above reports both halves of the setting.
    await page.locator('.menu-entry[data-action="back"]').click();
    await expect(page.locator('.menu-entry[data-settings-group="sound"]')).toContainText(
      "Chime · 40%",
    );

    await page.reload();
    await expect(page.locator("body[data-ready]")).toBeVisible();
    expect(await page.evaluate(() => window.__ms?.state().volume)).toBeCloseTo(0.4, 5);
    await page.locator('.menu-header-btn[data-action="settings"]').click();
    await page.locator('.menu-entry[data-settings-group="sound"]').click();
    await expect(page.locator('.settings-range[data-setting="volume"]')).toHaveValue("40");
  });

  test("Off has no volume to set, and picking a preset brings the slider back", async ({
    page,
  }) => {
    await page.locator('.menu-header-btn[data-action="settings"]').click();
    await page.locator('.menu-entry[data-settings-group="sound"]').click();
    await page.locator('.menu-entry[data-sound="off"]').click();
    await expect(page.locator('.settings-range[data-setting="volume"]')).toHaveCount(0);

    await page.locator('.menu-entry[data-sound="blocks"]').click();
    await expect(page.locator('.settings-range[data-setting="volume"]')).toHaveCount(1);
  });

  test("Off is a choice that sticks, not a missing value", async ({ page }) => {
    await page.locator('.menu-header-btn[data-action="settings"]').click();
    await page.locator('.menu-entry[data-settings-group="sound"]').click();
    await page.locator('.menu-entry[data-sound="off"]').click();
    await page.locator('.menu-entry[data-action="back"]').click();
    await expect(page.locator('.menu-entry[data-settings-group="sound"]')).toContainText(
      "Off",
    );

    await page.reload();
    await expect(page.locator("body[data-ready]")).toBeVisible();
    expect(await page.evaluate(() => window.__ms?.state().sound)).toBe("off");
  });
});

test.describe("sound in play", () => {
  test.beforeEach(async ({ page }) => {
    await countOscillators(page);
    await page.setViewportSize({ width: 900, height: 700 });
    await page.goto("/");
    await expect(page.locator("body[data-ready]")).toBeVisible();
  });

  test("a click sounds, and a flood fill sounds as a longer cascade", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(String(e)));
    page.on("console", (m) => {
      if (m.type() === "error") errors.push(m.text());
    });

    // One mine in a corner: "1,1" touches it, so revealing it opens exactly one
    // cell, while the far corner floods most of the board.
    await page.evaluate(() => window.__ms?.startBoard("square", "easy", { mines: ["0,0"] }));
    const single = await page.evaluate(() => window.__ms?.cellScreenXY("1,1"));
    await page.mouse.click(single!.x, single!.y);
    const afterClick = await oscillators(page);
    expect(afterClick).toBeGreaterThan(0);

    const flood = await page.evaluate(() => window.__ms?.cellScreenXY("8,8"));
    await page.mouse.click(flood!.x, flood!.y);
    const afterFlood = await oscillators(page);
    // A recursive opening is a cascade of grains, not one note — and the win
    // that ends it adds its flourish on top.
    expect(afterFlood - afterClick).toBeGreaterThan(afterClick);
    expect(await page.evaluate(() => window.__ms?.state().status)).toBe("won");
    expect(errors).toEqual([]);
  });

  test("Off plays nothing at all", async ({ page }) => {
    await page.locator('.menu-header-btn[data-action="settings"]').click();
    await page.locator('.menu-entry[data-settings-group="sound"]').click();
    await page.locator('.menu-entry[data-sound="off"]').click();
    await page.locator('.menu-entry[data-action="back"]').click();
    await page.locator('.menu-entry[data-action="back"]').click();

    const before = await oscillators(page);
    await page.evaluate(() => window.__ms?.startBoard("square", "easy", { mines: ["0,0"] }));
    const xy = await page.evaluate(() => window.__ms?.cellScreenXY("8,8"));
    await page.mouse.click(xy!.x, xy!.y);
    expect(await page.evaluate(() => window.__ms?.state().status)).toBe("won");
    expect(await oscillators(page)).toBe(before);
  });

  test("the Klein scroll arrows sound, in both directions", async ({ page }) => {
    await page.evaluate(() => window.__ms?.startBoard("klein", "easy"));
    const back = page.locator('[data-slot="klein-scroll-back"]');
    const fwd = page.locator('[data-slot="klein-scroll-fwd"]');
    await expect(fwd).toBeVisible();

    const before = await oscillators(page);
    await fwd.click();
    const afterFwd = await oscillators(page);
    expect(afterFwd).toBeGreaterThan(before);
    await back.click();
    expect(await oscillators(page)).toBeGreaterThan(afterFwd);
  });
});
