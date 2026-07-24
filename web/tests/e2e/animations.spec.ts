import { expect, test } from "@playwright/test";

// The rest of the suite runs under prefers-reduced-motion (animations off), so
// this spec flips them back on via the window.__ms.animations seam and drives a
// full flood + a detonation through the live render loop — a guard that the
// reveal ripple / flag pop / lose shake / win wave are purely cosmetic:
// gameplay reaches the same terminal state and the board settles without
// hanging the loop.
test.describe("M6 animations", () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 900, height: 700 });
    await page.goto("/");
    await expect(page.locator("body[data-ready]")).toBeVisible();
  });

  test("a rippling flood still wins with animations enabled", async ({ page }) => {
    await page.evaluate(() => {
      const ms = window.__ms!;
      ms.animations(true);
      ms.startBoard("square", "easy", { mines: ["0,0"] });
      ms.reveal("8,8"); // floods the field, rippling outward, then wins
    });
    // Mid-flight: the win wave is sweeping and the flags are cascading in, but
    // the game is already over — the animation must not gate the outcome.
    await page.waitForTimeout(150);
    expect(await page.evaluate(() => window.__ms!.state().status)).toBe("won");
    // Let the ripple and the win wave play out; both are purely cosmetic.
    await page.waitForTimeout(1200);
    const state = await page.evaluate(() => window.__ms!.state());
    expect(state.status).toBe("won");
    expect(state.revealed).toBe(80);
    expect(state.minesRemaining).toBe(0); // the last mine was auto-flagged
    await expect(page.locator(".hud-smiley")).toHaveText("😎");
  });

  test("a solid board celebrates a win and settles", async ({ page }) => {
    // The 3D SolidBoard runs the same clock over its own buffers, so drive one
    // win there too: a flood on a closed surface sweeps the whole solid.
    await page.evaluate(() => {
      const ms = window.__ms!;
      ms.animations(true);
      // Sphere cell ids are symbolic, so read them off a first build, then
      // restage with one known mine: a single reveal then floods the whole
      // ball past it and wins.
      ms.startBoard("sphere", "easy");
      const cells = ms.cells();
      ms.startBoard("sphere", "easy", { mines: [cells[0]!] });
      ms.reveal(cells[cells.length - 1]!);
    });
    await page.waitForTimeout(1500); // outlast the wave sweeping round the ball
    const state = await page.evaluate(() => window.__ms!.state());
    expect(state.status).toBe("won");
    expect(state.is3d).toBe(true);
    await expect(page.locator(".hud-smiley")).toHaveText("😎");
  });

  test("a detonation shakes and still registers the loss", async ({ page }) => {
    await page.evaluate(() => {
      const ms = window.__ms!;
      ms.animations(true);
      ms.startBoard("square", "easy", { mines: ["4,4"] });
      ms.flag("2,2"); // a flag pop
      ms.reveal("4,4"); // detonate -> lose shake
    });
    await page.waitForTimeout(600); // outlast the shake
    const state = await page.evaluate(() => window.__ms!.state());
    expect(state.status).toBe("lost");
    await expect(page.locator(".hud-smiley")).toHaveText("😵");
  });
});
