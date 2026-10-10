import { expect, test } from "@playwright/test";

// The rest of the suite runs under prefers-reduced-motion (animations off), so
// this spec flips them back on via the window.__ms.animations seam and drives a
// full flood + a detonation through the live render loop — a guard that the
// reveal ripple / flag pop / lose shake / win wave are purely cosmetic:
// gameplay reaches the same terminal state and the board settles without
// hanging the loop.
/** The hold-to-flag duration the drop test pins for itself (see there). */
const HELD_FLAG_HOLD_MS = 400;

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
    await expect(page.locator(".hud-smiley")).toHaveAttribute("data-face", "won");
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
    await expect(page.locator(".hud-smiley")).toHaveAttribute("data-face", "won");
  });

  test("a held cell drops its flag outside the fingertip", async ({ page }) => {
    // The point of the drop: the finger placing the flag covers the cell, so
    // the flag has to be painted well clear of it — above it, where neither
    // the finger nor the hand behind it reaches. Sample a patch two cells up
    // from the flagged one: untouched by the settled board, painted over while
    // the flag is coming down.
    //
    // How long the press has to be held is the player's now (Settings › Hold to
    // flag), so pin it rather than sampling at a fixed time past whatever the
    // default happens to be — this test has to land *inside* the drop, and a
    // default that moves would slide the sample along it.
    await page.addInitScript((ms) => {
      window.localStorage.setItem(
        "ms:settings",
        // Classic, the lightest cut to draw: under SwiftShader every frame of
        // the drop is paid for on the CPU, and the catch below has to land a
        // screenshot inside it. The drop is the same on every cut.
        JSON.stringify({ version: 5, holdToFlagMs: ms, shape: "classic" }),
      );
    }, HELD_FLAG_HOLD_MS);
    await page.reload();
    await expect(page.locator("body[data-ready]")).toBeVisible();
    await page.evaluate(() => {
      const ms = window.__ms!;
      ms.animations(true);
      ms.startBoard("square", "easy", { mines: ["0,0"] });
    });
    // A new board assembles from its middle out; let it land before the
    // settled baseline is shot.
    await page.waitForTimeout(800);
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
      // Just past the hold pinned above, which puts the sample in the drop's
      // opening hold, where the flag is at its largest.
      await page.waitForTimeout(HELD_FLAG_HOLD_MS + 100);
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
        JSON.stringify({ version: 5, theme: "bright", shape: "realistic", sound: "off", seenHint: true }),
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
    }).then(async (cells) => {
      // Let the board finish assembling, so its frames are not what a glow
      // measurement is racing.
      await page.waitForTimeout(800);
      return cells;
    });
  }

  /** Whether a run of frames read `late` ms after a click could show an
   * envelope `span` ms long at all, and if so whether one of them did.
   *
   * A frame's value is what the board wrote on that frame or the one before,
   * so the first read after the click may still be the frame before it; from
   * the second read on, a frame read inside the envelope was drawn inside it.
   * Under SwiftShader with a shard's other browsers on the same cores, the
   * renderer can go longer than the whole envelope without drawing anything
   * -- and then there is nothing on screen to measure, whatever the board did.
   * That run checks what can be seen (the settled state) and says it starved.
   * Otherwise a lit frame has to be at least as bright as `floor` allows at
   * the moment it was read. */
  function litAsEnvelopeAllows(
    seen: { late: number; value: number }[],
    span: number,
    floor: (late: number) => number,
  ): boolean | "starved" {
    if (seen.slice(1).filter((s) => s.late < span).length === 0) {
      test.info().annotations.push({
        type: "starved",
        description: `no frame drawn inside the ${span} ms envelope`,
      });
      return "starved";
    }
    return seen.some((s) => s.value > 0 && s.value >= floor(s.late) - 1e-6);
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
      //
      // Bounded by a frame count as well as by the clock. CI shards this suite
      // three browsers to a runner, and a starved rAF can deliver only a
      // handful of frames inside a wall-clock window — few enough that they all
      // land past the crest. Sampling on past the deadline never lowers a peak,
      // and `after` below still reads a finished animation.
      const t0 = performance.now();
      const seen: { late: number; value: number }[] = [];
      while (performance.now() - t0 < 700 || seen.length < 40) {
        await frame();
        seen.push({ late: performance.now() - t0, value: ms.state().glow!.amount });
      }
      return { rest, seen, after: ms.state().glow! };
    }, opener);

    // At rest a pin carries only its ember — a look, not a light show.
    expect(at.rest.amount).toBe(0);
    expect(at.rest.base).toBeGreaterThan(0);
    // The flood lights them, and as brightly as the swell's envelope says for
    // the moment the frame was read -- measured against the envelope rather
    // than a fixed bar for the reason the blast below is: under SwiftShader a
    // frame can come long after the crest it should have shown. The weakest
    // swell there is (src/render/markerGlow.ts: PEAK_MIN high, up over RISE,
    // no hold, down over FALL) is the floor, which any flood clears; how high
    // a given flood goes is tests/unit/markerGlow.test.ts's to pin.
    const PEAK_MIN = 0.14;
    const RISE = 80;
    const FALL = 320;
    const floor = (late: number) =>
      PEAK_MIN * Math.max(0, 1 - Math.max(0, late - RISE) / FALL);
    expect(litAsEnvelopeAllows(at.seen, RISE + FALL, floor)).not.toBe(false);
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
      const t0 = performance.now();
      ms.reveal(cell);
      // Every frame's flash, and how long after the click it was read. Frame-
      // bounded as well as clock-bounded; see the flood's loop above.
      const seen: { late: number; value: number }[] = [];
      while (performance.now() - t0 < 1400 || seen.length < 80) {
        await frame();
        seen.push({ late: performance.now() - t0, value: ms.state().glow!.blast });
      }
      return { rest, seen, after: ms.state().glow!, status: ms.state().status };
    }, mine);

    expect(at.status).toBe("lost");
    // A detonation is not a flood fill: it goes up white in 40 ms and takes
    // 700 to come down (BLAST_RISE and BLAST_FALL in src/render/markerGlow.ts).
    // What a frame shows of it depends on *when* the frame came, and under
    // SwiftShader the first one after a loss can come 400 ms late -- a bar of
    // "over half" read 0.497 on CI, from a board whose blast was fine. So the
    // bar is the envelope itself: a frame read `late` ms after the click was
    // drawn at most that long after the blast began, and past the rise the
    // flash only fades, so a lit frame is at least as bright as the envelope
    // is at `late`. One lit frame meeting that says the blast reached the
    // markers at full strength, whenever the renderer got round to drawing it.
    const RISE = 40;
    const FALL = 700;
    const floor = (late: number) => Math.max(0, 1 - Math.max(0, late - RISE) / FALL);
    expect(litAsEnvelopeAllows(at.seen, RISE + FALL, floor)).not.toBe(false);
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
    await expect(page.locator(".hud-smiley")).toHaveAttribute("data-face", "lost");
  });
});
