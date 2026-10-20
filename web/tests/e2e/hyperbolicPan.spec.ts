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
async function cellOut(page: Page, f: number): Promise<{ cell: string; centre: { x: number; y: number } }> {
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
      if (Math.hypot(p.x - cx - frac * rim, p.y - cy) < Math.hypot(q.x - cx - frac * rim, q.y - cy)) best = i;
    });
    return { cell: cells[best]!, centre: { x: cx, y: cy } };
  }, f);
}

async function drag(page: Page, from: { x: number; y: number }, to: { x: number; y: number }) {
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  for (let i = 1; i <= 20; i++) {
    await page.mouse.move(from.x + ((to.x - from.x) * i) / 20, from.y + ((to.y - from.y) * i) / 20);
  }
  await page.mouse.up();
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

  test("a drag brings a rim cell to the centre at full size, where a tap opens it", async ({
    page,
  }) => {
    const { cell, centre } = await cellOut(page, 0.9);
    const start = await at(page, cell);
    const small = await reach(page, start.x, start.y);
    const middle = await reach(page, centre.x, centre.y);
    expect(small).toBeLessThan(middle / 4);

    // A drag is a drag: it neither opens nor flags anything on its way.
    for (let stroke = 0; stroke < 4; stroke++) {
      const now = await at(page, cell);
      if (Math.hypot(now.x - centre.x, now.y - centre.y) < 12) break;
      await drag(page, now, centre);
    }
    expect(await page.evaluate(() => window.__ms!.state().revealed)).toBe(0);
    expect(await page.evaluate(() => window.__ms!.zoom())).toBe(1);

    const end = await at(page, cell);
    // Within the tap slop the drag spends before it starts moving the board.
    expect(Math.hypot(end.x - centre.x, end.y - centre.y)).toBeLessThan(12);
    // Every {7,3} tile is congruent, and the pan is an isometry: the rim cell
    // is now drawn as big as the central one was.
    expect(await reach(page, end.x, end.y)).toBeGreaterThan(middle * 0.6);

    await page.mouse.click(end.x, end.y);
    expect(await page.evaluate((c) => window.__ms!.cellState(c), cell)).toBe("revealed");
  });

  test("0 puts the board back where it was built", async ({ page }) => {
    const { cell, centre } = await cellOut(page, 0.6);
    const start = await at(page, cell);
    await drag(page, start, centre);
    expect(Math.hypot((await at(page, cell)).x - start.x, (await at(page, cell)).y - start.y)).toBeGreaterThan(20);
    await page.keyboard.press("0");
    await frame(page);
    const back = await at(page, cell);
    expect(back.x).toBeCloseTo(start.x, 1);
    expect(back.y).toBeCloseTo(start.y, 1);
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
