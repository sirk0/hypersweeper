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
    // Only a held touch drops a flag, so synthesize one — Playwright has no
    // touch-hold API, hence CDP (as in solids.spec.ts).
    const client = await page.context().newCDPSession(page);
    // The drop is over in well under a second, and a screenshot is not free,
    // so give the catch a few tries rather than letting one slow frame decide.
    let caught = false;
    for (let attempt = 0; attempt < 3 && !caught; attempt++) {
      await client.send("Input.dispatchTouchEvent", {
        type: "touchStart",
        touchPoints: [{ x: at.x, y: at.y }],
      });
      await page.waitForTimeout(550); // just past the 450 ms long-press threshold
      caught = !(await page.screenshot({ clip })).equals(before);
      await client.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
      await page.waitForTimeout(600); // outlast the drop
      const after = await page.screenshot({ clip });
      expect(after.equals(before), "the drop left a mark behind").toBe(true);
      if (!caught) await page.evaluate(() => window.__ms!.flag("4,4")); // clear
    }
    expect(caught, "the drop never painted clear of the flagged cell").toBe(true);
    const state = await page.evaluate(() => window.__ms!.state());
    expect(state.minesRemaining).toBe(0); // and the flag itself landed (1 mine)
    expect(state.revealed).toBe(0); // the hold flagged rather than revealing

    // ...and every other way of flagging leaves the cell in plain sight, so it
    // gets no drop. Same cell, same patch, same clock — but placed through the
    // seam, which flags exactly as a right-click or a flag-mode tap does.
    await page.evaluate(() => window.__ms!.flag("4,4")); // clear
    await page.waitForTimeout(100);
    await page.evaluate(() => window.__ms!.flag("4,4")); // place again, unheld
    const unheld = await page.screenshot({ clip });
    expect(unheld.equals(before), "an unheld flag animated anyway").toBe(true);
  });

  // -- the Realistic marker glow ---------------------------------------------
  //
  // The light the pins carry lives entirely in a shader uniform, so — like a
  // synthesised sound — it leaves nothing in the DOM to assert against, and
  // unlike the ripple it is over in about half a second, which is quicker than
  // a screenshot round trip under SwiftShader. `state().glow` is the window on
  // it. The rules themselves are pinned in tests/unit/markerGlow.test.ts; what
  // is worth an e2e is that the wiring reaches the board at all, from the game
  // through the session to the uniforms, and that it comes back down.

  /** A Realistic sphere with `flags` pins on it and its mines known. Realistic
   * has to be stored before the page boots: a cell style is baked into the mesh
   * when a board is built, so picking it afterwards lands on the *next* one. */
  async function realisticSphere(page: import("@playwright/test").Page) {
    await page.addInitScript(() => {
      localStorage.setItem(
        "ms:settings",
        JSON.stringify({ version: 3, theme: "realistic", sound: "off", seenHint: true }),
      );
    });
    await page.goto("/");
    await expect(page.locator("body[data-ready]")).toBeVisible();
    return page.evaluate(() => {
      const ms = window.__ms!;
      ms.animations(true);
      ms.startBoard("sphere", "easy"); // enumerate the cells first
      const cells = ms.cells();
      // Two mines, both far from the opener, so one reveal is a wide flood
      // rather than the single numbered cell an ordinary easy board opens.
      ms.startBoard("sphere", "easy", { mines: cells.slice(0, 2) });
      for (const c of cells.slice(2, 8)) ms.flag(c);
      return { opener: cells[cells.length - 1]!, mine: cells[0]! };
    });
  }

  test("a flood lights the pins and lets them go out again", async ({ page }) => {
    const { opener } = await realisticSphere(page);
    const at = await page.evaluate(async (cell) => {
      const ms = window.__ms!;
      const frame = () => new Promise((r) => requestAnimationFrame(r));
      await frame();
      const rest = ms.state().glow!;
      ms.reveal(cell);
      // Sample across the wave rather than at one instant: the render loop
      // stalls for hundreds of milliseconds under SwiftShader while a flood
      // recolours, so any single moment can miss the crest.
      const t0 = performance.now();
      let peak = 0;
      while (performance.now() - t0 < 700) {
        await frame();
        peak = Math.max(peak, ms.state().glow!.amount);
      }
      return { rest, peak, after: ms.state().glow! };
    }, opener);

    // At rest a pin carries only its ember — a look, not a light show.
    expect(at.rest.amount).toBe(0);
    expect(at.rest.base).toBeGreaterThan(0);
    // The flood lights them...
    expect(at.peak).toBeGreaterThan(0.2);
    // ...and once it has finished opening they are back to the ember. This is
    // the "glow goes back to very low after the click's cells are open" rule,
    // measured on a real board.
    expect(at.after.amount).toBe(0);
    expect(at.after.base).toBe(at.rest.base);
  });

  test("a mine going off flashes white and leaves the markers warm", async ({ page }) => {
    const { mine } = await realisticSphere(page);
    const at = await page.evaluate(async (cell) => {
      const ms = window.__ms!;
      const frame = () => new Promise((r) => requestAnimationFrame(r));
      await frame();
      const rest = ms.state().glow!;
      ms.reveal(cell);
      const t0 = performance.now();
      let peak = 0;
      while (performance.now() - t0 < 1400) {
        await frame();
        peak = Math.max(peak, ms.state().glow!.blast);
      }
      return { rest, peak, after: ms.state().glow!, status: ms.state().status };
    }, mine);

    expect(at.status).toBe("lost");
    expect(at.peak).toBeGreaterThan(0.5); // a detonation is not a flood fill
    expect(at.after.blast).toBe(0);
    // The board is dark again, but warmer than it was: embers for the rest of
    // the loss screen.
    expect(at.after.base).toBeGreaterThan(at.rest.base);
  });

  test("a board with animations off keeps the ember and nothing else", async ({ page }) => {
    // Reduced motion turns off motion. A resting ember does not move, so it is
    // part of what a Realistic marker *is* rather than something it does — and
    // `wantsMarkerGlow` going false with it is what keeps a flood from paying
    // for a walk nothing will use (see tests/e2e/markers.spec.ts).
    const { opener } = await realisticSphere(page);
    const glow = await page.evaluate(async (cell) => {
      const ms = window.__ms!;
      ms.animations(false);
      const frame = () => new Promise((r) => requestAnimationFrame(r));
      ms.reveal(cell);
      let peak = 0;
      for (let i = 0; i < 20; i++) {
        await frame();
        peak = Math.max(peak, ms.state().glow!.amount);
      }
      return { peak, base: ms.state().glow!.base };
    }, opener);
    expect(glow.peak).toBe(0);
    expect(glow.base).toBeGreaterThan(0);
  });

  test("a board without markers has no glow to report", async ({ page }) => {
    // The flat board implements none of it, and neither does a 3D board on a
    // style that draws billboards — `state().glow` is null rather than zero, so
    // the two cases stay tellable apart.
    await page.goto("/");
    await expect(page.locator("body[data-ready]")).toBeVisible();
    const glow = await page.evaluate(() => {
      const ms = window.__ms!;
      ms.startBoard("square", "easy", { mines: ["0,0"] });
      return ms.state().glow;
    });
    expect(glow).toBeNull();
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
