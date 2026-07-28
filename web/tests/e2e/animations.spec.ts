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

  test("a held cell drops its flag outside the fingertip", async ({ page }) => {
    // The point of the drop: the finger placing the flag covers the cell, so
    // the flag has to be painted well clear of it — above it, where neither
    // the finger nor the hand behind it reaches. Sample a patch two cells up
    // from the flagged one: untouched by the settled board, painted over while
    // the flag is coming down.
    await page.evaluate(() => {
      const ms = window.__ms!;
      ms.animations(true);
      ms.startBoard("square", "easy", { mines: ["0,0"] });
    });
    await page.evaluate(
      () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))),
    );
    const at = await page.evaluate(() => {
      const p = window.__ms!.cellScreenXY("4,4")!;
      const q = window.__ms!.cellScreenXY("6,4")!; // two cells away, either way
      return { x: p.x, y: p.y, step: Math.hypot(q.x - p.x, q.y - p.y) / 2 };
    });
    // A band of board one to three cells above the flagged cell — clear of
    // that cell's own glyph, and wide enough that the test does not depend on
    // where in the flag's artwork the mast happens to fall.
    const clip = {
      x: at.x - 3 * at.step,
      y: at.y - 3 * at.step,
      width: Math.round(6 * at.step),
      height: Math.round(2 * at.step),
    };
    // Shot first, so the shader compilation the README warns about is paid
    // before the ones that have to land inside the drop. It doubles as the
    // settled baseline: nothing of the flag survives up here.
    const before = await page.screenshot({ clip });
    // The drop is over in well under a second, and a screenshot is not free,
    // so give the catch a few tries rather than letting one slow frame decide.
    let caught = false;
    for (let attempt = 0; attempt < 3 && !caught; attempt++) {
      await page.evaluate(() => window.__ms!.flag("4,4"));
      caught = !(await page.screenshot({ clip })).equals(before);
      await page.waitForTimeout(600); // outlast the drop
      const after = await page.screenshot({ clip });
      expect(after.equals(before), "the drop left a mark behind").toBe(true);
      if (!caught) await page.evaluate(() => window.__ms!.flag("4,4")); // clear
    }
    expect(caught, "the drop never painted clear of the flagged cell").toBe(true);
    const state = await page.evaluate(() => window.__ms!.state());
    expect(state.minesRemaining).toBe(0); // and the flag itself landed (1 mine)
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
