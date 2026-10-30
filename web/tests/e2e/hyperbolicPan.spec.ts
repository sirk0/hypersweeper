import { expect, test, type Page } from "@playwright/test";

// Hyperbolic panning: a drag moves a hyperbolic board by a disc isometry
// (render/disc.ts), so a rim cell — a pixel or two across on a phone at hard —
// can be brought to the centre at the central cell's size, and tapped there.

const MODE = "hyperbolic73";

async function frame(page: Page): Promise<void> {
  await page.evaluate(
    () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))),
  );
}

async function at(page: Page, cell: string): Promise<{ x: number; y: number }> {
  return (await page.evaluate((c) => window.__ms!.cellScreenXY(c), cell))!;
}

/** How far the cell drawn at client point (x, y) runs to the right of it, in
 * CSS pixels — probed with the same raycast a tap uses, so it is the size on
 * screen. */
async function reach(page: Page, x: number, y: number): Promise<number> {
  return page.evaluate(
    ([x0, y0]) => {
      const ms = window.__ms!;
      const cell = ms.cellAtScreenXY(x0!, y0!);
      let d = 0;
      while (d < 400 && ms.cellAtScreenXY(x0! + d + 0.5, y0!) === cell) d += 0.5;
      return d;
    },
    [x, y],
  );
}

/** The cell drawn nearest the point a fraction `f` of the way from the
 * board's centre to its right-hand rim. */
async function cellOut(
  page: Page,
  f: number,
): Promise<{ cell: string; centre: { x: number; y: number } }> {
  return page.evaluate((frac) => {
    const ms = window.__ms!;
    const cells = ms.cells();
    const pts = cells.map((c) => ms.cellScreenXY(c)!);
    const cx = pts.reduce((s, p) => s + p.x, 0) / pts.length;
    const cy = pts.reduce((s, p) => s + p.y, 0) / pts.length;
    const rim = Math.max(...pts.map((p) => p.x)) - cx;
    let best = 0;
    pts.forEach((p, i) => {
      const q = pts[best]!;
      if (Math.hypot(p.x - cx - frac * rim, p.y - cy) < Math.hypot(q.x - cx - frac * rim, q.y - cy))
        best = i;
    });
    return { cell: cells[best]!, centre: { x: cx, y: cy } };
  }, f);
}

/** A mouse drag in `steps` moves, sent as the pointer stream a mouse makes
 * (as zoom.spec.ts sends its pinches): Playwright's own mouse waits for a
 * frame at every move, and a hard board under software WebGL takes long
 * enough to draw that a test stroking it a few times ran out of time. */
async function drag(
  page: Page,
  from: { x: number; y: number },
  to: { x: number; y: number },
  steps = 20,
) {
  await page.evaluate(
    ({ a, b, n }) => {
      const canvas = document.getElementById("board")!;
      const send = (type: string, x: number, y: number, buttons: number) =>
        canvas.dispatchEvent(
          new PointerEvent(type, {
            pointerId: 1,
            pointerType: "mouse",
            clientX: x,
            clientY: y,
            button: 0,
            buttons,
            bubbles: true,
            isPrimary: true,
          }),
        );
      send("pointerdown", a.x, a.y, 1);
      for (let i = 1; i <= n; i++)
        send("pointermove", a.x + ((b.x - a.x) * i) / n, a.y + ((b.y - a.y) * i) / n, 1);
      send("pointerup", b.x, b.y, 0);
    },
    { a: from, b: to, n: steps },
  );
  await frame(page);
}

test.describe("hyperbolic panning", () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 420, height: 780 }); // a phone
    await page.goto("/");
    await expect(page.locator("body[data-ready]")).toBeVisible();
    await page.evaluate((mode) => window.__ms?.startBoard(mode, "hard", { seed: 7 }), MODE);
    await frame(page);
  });

  test("a drag brings a cell from the rim to the centre at full size, where a tap opens it", async ({
    page,
  }) => {
    const { cell, centre } = await cellOut(page, 0.7);
    const start = await at(page, cell);
    const small = await reach(page, start.x, start.y);
    const middle = await reach(page, centre.x, centre.y);
    expect(small).toBeLessThan(middle / 2);

    // A drag is a drag: it neither opens nor flags anything on its way.
    for (let stroke = 0; stroke < 3; stroke++) {
      const now = await at(page, cell);
      if (Math.hypot(now.x - centre.x, now.y - centre.y) < 12) break;
      await drag(page, now, centre, 10);
    }
    expect(await page.evaluate(() => window.__ms!.state().revealed)).toBe(0);
    expect(await page.evaluate(() => window.__ms!.zoom())).toBe(1);

    const end = await at(page, cell);
    // Within the tap slop the drag spends before it starts moving the board.
    expect(Math.hypot(end.x - centre.x, end.y - centre.y)).toBeLessThan(12);
    // Every {7,3} tile is congruent, and the pan is an isometry: the cell is
    // now drawn as big as the central one was.
    expect(await reach(page, end.x, end.y)).toBeGreaterThan(middle * 0.6);

    await page.mouse.click(end.x, end.y);
    expect(await page.evaluate((c) => window.__ms!.cellState(c), cell)).toBe("revealed");
  });

  test("the outermost cell comes in as far as the board allows, big enough to tap", async ({
    page,
  }) => {
    const { cell, centre } = await cellOut(page, 1);
    const start = await at(page, cell);
    const middle = await reach(page, centre.x, centre.y);
    const small = await reach(page, start.x, start.y);
    expect(small).toBeLessThan(middle / 8);
    for (let stroke = 0; stroke < 3; stroke++) await drag(page, await at(page, cell), centre, 10);
    // The board's rim is held most of the way out (EDGE_HOLD), so its last
    // cells stop short of the middle -- but many times the size they were.
    const end = await at(page, cell);
    const grown = await reach(page, end.x, end.y);
    expect(grown).toBeGreaterThan(4 * small);
    expect(grown).toBeGreaterThan(middle / 5);
    await page.mouse.click(end.x, end.y);
    expect(await page.evaluate((c) => window.__ms!.cellState(c), cell)).toBe("revealed");
  });

  test("the board stops with its rim most of the way out, never at the centre", async ({
    page,
  }) => {
    const { centre } = await cellOut(page, 0);
    const rim = await page.evaluate(() => {
      const ms = window.__ms!;
      return Math.max(...ms.cells().map((c) => ms.cellScreenXY(c)!.x));
    });
    const radius = rim - centre.x;
    // Throw the board left, further than it can go (each stroke carries it
    // about 2.8 of hyperbolic distance; the hold stops it at about 3.4).
    for (let k = 0; k < 4; k++) {
      await drag(
        page,
        { x: centre.x + radius * 0.6, y: centre.y },
        { x: centre.x - radius * 0.6, y: centre.y },
        10,
      );
    }
    // Still board under the middle of the view, and most of the way out on
    // the side it was thrown from: no half screen of nothing. (A probe can
    // land in the gap between two tiles, so each looks a few pixels round.)
    const board = (x: number, y: number) =>
      page.evaluate(
        ([px, py]) =>
          [
            [0, 0],
            [4, 0],
            [-4, 0],
            [0, 4],
            [0, -4],
          ].some(([dx, dy]) => window.__ms!.cellAtScreenXY(px! + dx!, py! + dy!) !== null),
        [x, y],
      );
    expect(await board(centre.x, centre.y)).toBe(true);
    expect(await board(centre.x + radius * 0.6, centre.y)).toBe(true);
  });

  test("a drag along the rim moves the board along with it", async ({ page }) => {
    // Up the right-hand rim, a finger's width outside the board: the board
    // goes up, not off sideways, and not by a screenful.
    const { cell, centre } = await cellOut(page, 0);
    const rim = await page.evaluate(() => {
      const ms = window.__ms!;
      return Math.max(...ms.cells().map((c) => ms.cellScreenXY(c)!.x));
    });
    const start = await at(page, cell);
    await drag(page, { x: rim + 8, y: centre.y + 30 }, { x: rim + 8, y: centre.y - 30 });
    const end = await at(page, cell);
    const up = start.y - end.y;
    expect(up).toBeGreaterThan(10);
    expect(up).toBeLessThan(2 * 60);
    expect(Math.abs(end.x - start.x)).toBeLessThan(up / 2);
  });

  test("0 puts the board back where it was built", async ({ page }) => {
    const { cell, centre } = await cellOut(page, 0.6);
    const start = await at(page, cell);
    await drag(page, start, centre);
    expect(
      Math.hypot((await at(page, cell)).x - start.x, (await at(page, cell)).y - start.y),
    ).toBeGreaterThan(20);
    await page.keyboard.press("0");
    await frame(page);
    const back = await at(page, cell);
    expect(back.x).toBeCloseTo(start.x, 1);
    expect(back.y).toBeCloseTo(start.y, 1);
  });

  test("pan arrows sit on the board bar, on with the extra controls off", async ({ page }) => {
    // They are what says this board can be dragged at all, so the setting
    // that hides the extra controls (off out of the box) keeps them.
    const shown = () =>
      page.$$eval(".board-caption-controls .board-bar-btn", (nodes) =>
        nodes
          .filter((n) => !(n as HTMLElement).hidden)
          .map((n) => (n as HTMLElement).dataset["slot"]),
      );
    expect(await shown()).toEqual(["pan-left", "pan-right", "pan-up", "pan-down"]);

    const { cell } = await cellOut(page, 0);
    const moves = {
      "pan-left": [-1, 0],
      "pan-right": [1, 0],
      "pan-up": [0, -1],
      "pan-down": [0, 1],
    };
    for (const [slot, [dx, dy]] of Object.entries(moves)) {
      const start = await at(page, cell);
      await page.locator(`.board-bar-btn[data-slot="${slot}"]`).click();
      await frame(page);
      const end = await at(page, cell);
      // the board goes the way the arrow points, and only that way
      expect((end.x - start.x) * dx! + (end.y - start.y) * dy!, slot).toBeGreaterThan(20);
      expect(Math.abs((end.x - start.x) * dy! - (end.y - start.y) * dx!), slot).toBeLessThan(2);
    }
    // a press is a move of the view, never of the game
    expect(await page.evaluate(() => window.__ms!.state().revealed)).toBe(0);

    // ...and no other flat board has them
    await page.evaluate(() => window.__ms!.startBoard("square", "easy"));
    expect(await shown()).toEqual([]);
  });

  test("the arrow keys carry the board the way they point", async ({ page }) => {
    const { cell } = await cellOut(page, 0);
    const start = await at(page, cell);
    await page.keyboard.press("ArrowRight");
    await frame(page);
    const moved = await at(page, cell);
    expect(moved.x).toBeGreaterThan(start.x + 20);
    expect(moved.y).toBeCloseTo(start.y, 0);
  });

  test("a one-finger touch drag pans too, at the fitted zoom", async ({ page }) => {
    const { cell, centre } = await cellOut(page, 0.6);
    const start = await at(page, cell);
    const mines = await page.evaluate(() => window.__ms!.state().minesRemaining);
    await page.evaluate(
      ([a, b]) => {
        const canvas = document.getElementById("board")!;
        const send = (type: string, x: number, y: number) =>
          canvas.dispatchEvent(
            new PointerEvent(type, {
              pointerId: 1,
              pointerType: "touch",
              clientX: x,
              clientY: y,
              bubbles: true,
              isPrimary: true,
            }),
          );
        send("pointerdown", a!.x, a!.y);
        for (let i = 1; i <= 12; i++) {
          send("pointermove", a!.x + ((b!.x - a!.x) * i) / 12, a!.y + ((b!.y - a!.y) * i) / 12);
        }
        send("pointerup", b!.x, b!.y);
      },
      [start, centre],
    );
    await frame(page);
    const end = await at(page, cell);
    expect(Math.hypot(end.x - centre.x, end.y - centre.y)).toBeLessThan(12);
    // Neither a reveal nor, however long it took, a long-press flag.
    expect(await page.evaluate(() => window.__ms!.state().revealed)).toBe(0);
    expect(await page.evaluate(() => window.__ms!.state().minesRemaining)).toBe(mines);
  });
});

test.describe("a closed surface's pan", () => {
  // quartic is a closed surface drawn as a patch of the disc that covers
  // it: the pan steps across the cover and relabels as it goes
  // (`discRecentre`), so unlike a disc board it never runs out of board.
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 420, height: 780 });
    await page.goto("/");
    await expect(page.locator("body[data-ready]")).toBeVisible();
    await page.evaluate(() => window.__ms?.startBoard("quartic", "medium", { seed: 7 }));
    await frame(page);
  });

  test("goes on as far as it is thrown, board all round the view, and a tap still opens", async ({
    page,
  }) => {
    const centre = (await at(page, "0"))!;
    const radius =
      (await page.evaluate(() => {
        const ms = window.__ms!;
        return Math.max(...ms.cells().map((c) => ms.cellScreenXY(c)!.x));
      })) - centre.x;
    const board = (x: number, y: number) =>
      page.evaluate(
        ([px, py]) =>
          [
            [0, 0],
            [4, 0],
            [-4, 0],
            [0, 4],
            [0, -4],
          ].some(([dx, dy]) => window.__ms!.cellAtScreenXY(px! + dx!, py! + dy!) !== null),
        [x, y],
      );
    // Twice as far as a disc board's hold lets one go, and round a corner.
    for (let k = 0; k < 8; k++) {
      const [dx, dy] = k < 5 ? [1, 0] : [0, 1];
      await drag(
        page,
        { x: centre.x + dx * radius * 0.6, y: centre.y + dy * radius * 0.6 },
        { x: centre.x - dx * radius * 0.6, y: centre.y - dy * radius * 0.6 },
        10,
      );
      for (const [px, py] of [
        [0, 0],
        [0.6, 0],
        [-0.6, 0],
        [0, 0.6],
        [0, -0.6],
      ]) {
        expect(await board(centre.x + px! * radius, centre.y + py! * radius), `stroke ${k}`).toBe(
          true,
        );
      }
    }
    expect(await page.evaluate(() => window.__ms!.state().revealed)).toBe(0);
    const cell = await page.evaluate(
      ([x, y]) => window.__ms!.cellAtScreenXY(x!, y!),
      [centre.x, centre.y],
    );
    expect(cell).not.toBeNull();
    await page.mouse.click(centre.x, centre.y);
    const after = await page.evaluate((c) => {
      const ms = window.__ms!;
      return { state: ms.cellState(c), status: ms.state().status };
    }, cell!);
    expect(after.state === "revealed" || after.status === "lost").toBe(true);
  });
});
