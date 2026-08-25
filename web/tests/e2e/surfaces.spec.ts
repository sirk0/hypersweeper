import { expect, test } from "@playwright/test";

// M3: the wrapped surfaces — the Flat-manifolds menu drill-down and the board
// symmetries (view-layer permutations that walk cell contents round the ring or
// round the tube while the game state and the geometry stay put).

test.describe("M3 surfaces", () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 900, height: 700 });
  });

  test("Flat manifolds menu drills surface → tiling and launches a wrap", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator("body[data-ready]")).toBeVisible();
    await page.locator('.menu-entry[data-group="custom"]').click();
    await page.locator('.menu-entry[data-group="manifolds"]').click();
    await page.locator('.menu-entry[data-surface="torus"]').click();
    // back to the surface list, then in again — the breadcrumb works both ways
    await page.locator('.menu-entry[data-action="back"]').click();
    await page.locator('.menu-entry[data-surface="klein"]').click();
    // the regular tilings sit at the top of the picker, not in a submenu
    await page.locator('.menu-entry[data-mode="kleinhex"]').click();
    const state = await page.evaluate(() => window.__ms!.state());
    expect(state.screen).toBe("game");
    expect(state.mode).toBe("kleinhex");
    expect(state.is3d).toBe(true);
  });

  // Reveal a spread of numbered cells on a dense-mine Klein board (each safe
  // cell borders a mine, so nothing cascades and the game stays in progress),
  // and return a currently front-facing revealed cell with its screen position.
  async function revealedTarget(page: import("@playwright/test").Page) {
    return page.evaluate(() => {
      const ms = window.__ms!;
      ms.startBoard("klein", "easy"); // enumerate the cells first
      const cells = ms.cells();
      const n = cells.length;
      const safe = Array.from({ length: 8 }, (_, k) => cells[Math.floor((k * n) / 8)]!);
      const safeSet = new Set(safe);
      const mines = cells.filter((c) => !safeSet.has(c));
      ms.startBoard("klein", "easy", { mines });
      const revealed = safe.slice(0, 6);
      for (const c of revealed) ms.reveal(c);
      const state = ms.state();
      const front = revealed
        .map((c) => ({ cell: c, xy: ms.cellScreenXY(c) }))
        .find((x) => x.xy != null);
      return { target: front ?? null, state };
    });
  }

  test("Klein scroll walks a revealed cell to a new position, game state intact", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator("body[data-ready]")).toBeVisible();
    const { target, state } = await revealedTarget(page);
    expect(state.status).toBe("playing");
    expect(state.revealed).toBe(6);
    expect(target, "no front-facing revealed cell").not.toBeNull();

    const before = target!.xy!;
    const after = await page.evaluate((cell) => {
      const ms = window.__ms!;
      ms.scroll(1);
      return { xy: ms.cellScreenXY(cell), state: ms.state() };
    }, target!.cell);

    // The cell's contents moved to a different face: either it scrolled around
    // to the far side (no screen position) or to a visibly different spot.
    const moved = after.xy == null || Math.hypot(after.xy.x - before.x, after.xy.y - before.y) > 3;
    expect(moved, "the scrolled cell did not move").toBe(true);
    // The scroll is a pure view permutation — the game itself is untouched.
    expect(after.state.revealed).toBe(6);
    expect(after.state.status).toBe("playing");
    expect(after.state.minesRemaining).toBe(state.minesRemaining);
  });

  test("mouse wheel / two-finger scroll drives the Klein cell cycle", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator("body[data-ready]")).toBeVisible();
    const { target } = await revealedTarget(page);
    expect(target, "no front-facing revealed cell").not.toBeNull();
    const before = target!.xy!;

    // A real wheel event over the board should step the ring (deltaY 160 > the
    // per-step threshold), exercising controls → app → session end to end.
    await page.mouse.move(450, 350);
    await page.mouse.wheel(0, 160);
    const after = await page.evaluate((cell) => window.__ms!.cellScreenXY(cell), target!.cell);
    const moved = after == null || Math.hypot(after.x - before.x, after.y - before.y) > 3;
    expect(moved, "wheel scroll did not move the cell").toBe(true);
  });

  test("each surface shows the controls its own gluing leaves it", async ({ page }) => {
    // A donut wraps both ways, so it steps round the ring and round the tube; a
    // cylinder is open across, so it has no tube step at all — but it can still
    // be turned end over end; a Klein bottle's seam reverses the tube, so its
    // tube step is a half turn and its own undo, and it gets one button rather
    // than a pair.
    const shown = async () =>
      page.$$eval(".board-caption .board-bar-btn", (nodes) =>
        nodes
          .filter((n) => !(n as HTMLElement).hidden)
          .map((n) => (n as HTMLElement).dataset["slot"]),
      );

    await page.goto("/?mode=torus&difficulty=easy&seed=1");
    await expect(page.locator("body[data-ready]")).toBeVisible();
    expect(await shown()).toEqual([
      "symmetry-ring-back",
      "symmetry-ring-fwd",
      "symmetry-tube-back",
      "symmetry-tube-fwd",
      "symmetry-turn-fwd",
      "symmetry-mirror-ring-fwd",
      "symmetry-mirror-tube-fwd",
    ]);

    await page.goto("/?mode=cylinder&difficulty=easy&seed=1");
    await expect(page.locator("body[data-ready]")).toBeVisible();
    expect(await shown()).toEqual([
      "symmetry-ring-back",
      "symmetry-ring-fwd",
      "symmetry-turn-fwd",
      "symmetry-mirror-ring-fwd",
      "symmetry-mirror-tube-fwd",
    ]);

    await page.goto("/?mode=klein&difficulty=easy&seed=1");
    await expect(page.locator("body[data-ready]")).toBeVisible();
    expect(await shown()).toEqual([
      "symmetry-ring-back",
      "symmetry-ring-fwd",
      "symmetry-tube-fwd",
      "symmetry-turn-fwd",
      "symmetry-mirror-ring-fwd",
      "symmetry-mirror-tube-fwd",
    ]);

    // A flat board has no translations, but it does have its own turn and its
    // own mirrors — the classic 9x9 grid is square, so a quarter turn lands on
    // it and the pair of arrows is shown.
    await page.goto("/?mode=square&difficulty=easy&seed=1");
    await expect(page.locator("body[data-ready]")).toBeVisible();
    expect(await shown()).toEqual([
      "symmetry-turn-back",
      "symmetry-turn-fwd",
      "symmetry-mirror-ring-fwd",
      "symmetry-mirror-tube-fwd",
    ]);

    // A solid gets its own point group: a cube quarters about three axes and
    // mirrors in two planes, which is what anyone would say about a cube.
    await page.goto("/?mode=cube&difficulty=easy&seed=1");
    await expect(page.locator("body[data-ready]")).toBeVisible();
    expect(await shown()).toEqual([
      "symmetry-ring-back",
      "symmetry-ring-fwd",
      "symmetry-tube-back",
      "symmetry-tube-fwd",
      "symmetry-turn-back",
      "symmetry-turn-fwd",
      "symmetry-mirror-ring-fwd",
      "symmetry-mirror-tube-fwd",
    ]);

    // and a board with no symmetry at all — an aperiodic patch trimmed to its
    // centremost cells is not symmetric about anything — shows none of them
    await page.goto("/?mode=penrose&difficulty=easy&seed=1");
    await expect(page.locator("body[data-ready]")).toBeVisible();
    expect(await shown()).toEqual([]);
  });

  test("a solid's quarter turn moves a cell round its own axis", async ({ page }) => {
    await page.goto("/?mode=cube&difficulty=easy&seed=1");
    await expect(page.locator("body[data-ready]")).toBeVisible();
    const moved = await page.evaluate(() => {
      const ms = window.__ms!;
      const cell = ms.cells().find((c) => ms.cellScreenXY(c) != null)!;
      const before = ms.cellScreenXY(cell)!;
      ms.scroll(1, "ring");
      const after = ms.cellScreenXY(cell);
      return {
        gone: after == null,
        distance: after ? Math.hypot(after.x - before.x, after.y - before.y) : Infinity,
        state: ms.state(),
      };
    });
    // a quarter of the way round is either off the visible faces or a long way
    expect(moved.gone || moved.distance > 20).toBe(true);
    expect(moved.state.status).toBe("playing");
  });

  test("the classic board turns a quarter, and the game is untouched", async ({ page }) => {
    await page.goto("/?mode=square&difficulty=easy&seed=1");
    await expect(page.locator("body[data-ready]")).toBeVisible();
    const moved = await page.evaluate(() => {
      const ms = window.__ms!;
      ms.reveal("0,0");
      const before = ms.cellScreenXY("0,0")!;
      ms.scroll(1, "turn");
      const after = ms.cellScreenXY("0,0")!;
      return { before, after, state: ms.state() };
    });
    // a corner of a 9x9 grid goes to another corner: a long way, and not back
    expect(
      Math.hypot(moved.after.x - moved.before.x, moved.after.y - moved.before.y),
    ).toBeGreaterThan(50);
    expect(moved.state.status).toBe("playing");
    expect(moved.state.revealed).toBeGreaterThan(0);
  });

  test("the tube control moves a cell to the far side of the donut", async ({ page }) => {
    // The reason the pair exists: a donut's inner wall is only ever glimpsed
    // through the hole, and no amount of turning the board brings it round.
    // Rolling the contents round the tube does.
    await page.goto("/?mode=torus&difficulty=easy&seed=1");
    await expect(page.locator("body[data-ready]")).toBeVisible();
    const moved = await page.evaluate(() => {
      const ms = window.__ms!;
      const cell = ms.cells().find((c) => ms.cellScreenXY(c) != null)!;
      const before = ms.cellScreenXY(cell)!;
      ms.scroll(1, "tube");
      const after = ms.cellScreenXY(cell);
      return {
        gone: after == null,
        distance: after ? Math.hypot(after.x - before.x, after.y - before.y) : Infinity,
        state: ms.state(),
      };
    });
    // it either turned to the hidden inside or landed somewhere visibly else
    expect(moved.gone || moved.distance > 3).toBe(true);
    // and, like the ring step, it is a pure view permutation
    expect(moved.state.status).toBe("playing");
    expect(moved.state.revealed).toBe(0);
  });

  // The reported bug: on a scrolled Klein board a tap did nothing, while a flag
  // on the same cell worked. The tap's reveal-or-chord choice was made on the
  // *face's* own id instead of the cell the face shows, so after a scroll it
  // chose a chord for a closed cell (and a reveal for an open one) — moves the
  // rules ignore. Flagging never consulted the state, which is why it worked.
  test("after a scroll, a tap still acts on the cell shown under it", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator("body[data-ready]")).toBeVisible();
    await revealedTarget(page);
    // A board's world transform is applied when it renders, so screen positions
    // are only meaningful after a frame has been drawn.
    await page.evaluate(
      () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))),
    );
    // Aim at a revealed cell drawn on its own face and not hidden behind the
    // neck — i.e. one the raycast really lands on.
    const at = await page.evaluate(() => {
      const ms = window.__ms!;
      for (const c of ms.cells()) {
        if (ms.cellState(c) !== "revealed") continue;
        const xy = ms.cellScreenXY(c);
        if (xy && ms.cellAtScreenXY(xy.x, xy.y) === c) return xy;
      }
      return null;
    });
    expect(at, "no unoccluded revealed cell to aim at").not.toBeNull();

    // Scroll the ring: the geometry stays put, so the same face is still under
    // `at` — but it now shows a different game cell, a closed one.
    const shown = await page.evaluate(({ x, y }) => {
      const ms = window.__ms!;
      ms.scroll(1);
      const cell = ms.cellAtScreenXY(x, y);
      return { cell, state: cell == null ? null : ms.cellState(cell) };
    }, at!);
    expect(shown.cell, "nothing picked where the revealed cell was").not.toBeNull();
    expect(shown.state, "the scroll did not bring a closed cell here").toBe("hidden");

    await page.mouse.click(at!.x, at!.y);
    // Revealed either way: a safe cell opens, a mine opens and ends the game.
    // What must not happen is the tap being swallowed.
    expect(
      await page.evaluate((c) => window.__ms!.cellState(c), shown.cell!),
      "the tap did nothing to the cell under it",
    ).toBe("revealed");
  });
});
