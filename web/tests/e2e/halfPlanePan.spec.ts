import { expect, test, type Page } from "@playwright/test";

// Half-plane panning: the binary tiling is drawn in the upper half-plane, and
// a drag moves it by z -> a z + b, an isometry (render/halfPlane.ts) — a zoom
// about the ideal line under the board and a slide along it. So a bottom-row
// cell, under two pixels across on a phone at hard, is dragged up into a cell
// a finger can tap.

const MODE = "hyperbolicbinary";
/** A bottom-row cell near the middle of the hard board (row 7 is 256 across). */
const BOTTOM = "7,130";

async function frame(page: Page): Promise<void> {
  await page.evaluate(
    () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))),
  );
}

async function at(page: Page, cell: string): Promise<{ x: number; y: number }> {
  return (await page.evaluate((c) => window.__ms!.cellScreenXY(c), cell))!;
}

/** How wide the cell drawn at client point (x, y) is, in CSS pixels — probed
 * both ways with the same raycast a tap uses. */
async function width(page: Page, x: number, y: number): Promise<number> {
  return page.evaluate(
    ([x0, y0]) => {
      const ms = window.__ms!;
      const cell = ms.cellAtScreenXY(x0!, y0!);
      let r = 0;
      while (r < 800 && ms.cellAtScreenXY(x0! + r + 0.25, y0!) === cell) r += 0.25;
      let l = 0;
      while (l < 800 && ms.cellAtScreenXY(x0! - l - 0.25, y0!) === cell) l += 0.25;
      return l + r;
    },
    [x, y],
  );
}

/** A mouse drag in `steps` moves, sent as the pointer stream a mouse makes (as
 * hyperbolicPan.spec.ts sends its drags, for the same reason). */
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
      for (let i = 1; i <= n; i++) send("pointermove", a.x + ((b.x - a.x) * i) / n, a.y + ((b.y - a.y) * i) / n, 1);
      send("pointerup", b.x, b.y, 0);
    },
    { a: from, b: to, n: steps },
  );
  await frame(page);
}

test.describe("half-plane panning", () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 420, height: 780 }); // a phone
    await page.goto("/");
    await expect(page.locator("body[data-ready]")).toBeVisible();
    await page.evaluate((mode) => window.__ms?.startBoard(mode, "hard", { seed: 7 }), MODE);
    await frame(page);
  });

  test("a drag up brings a bottom-row cell in big enough to tap, where a tap opens it", async ({
    page,
  }) => {
    const start = await at(page, BOTTOM);
    const small = await width(page, start.x, start.y);
    expect(small).toBeLessThan(3);

    // a one-finger drag at zoom 1 moves the board (it would not on a plain
    // flat board), and opens nothing on its way
    await drag(page, start, { x: start.x, y: 300 });
    expect(await page.evaluate(() => window.__ms!.state().revealed)).toBe(0);
    expect(await page.evaluate(() => window.__ms!.zoom())).toBeGreaterThan(10);

    // The magnification is about the ideal line, so the cell stays over the
    // bottom of the board -- and is now many times the size it was.
    const end = await at(page, BOTTOM);
    expect(Math.abs(end.x - start.x)).toBeLessThan(2);
    const grown = await width(page, end.x, end.y);
    expect(grown).toBeGreaterThan(10 * small);
    expect(grown).toBeGreaterThan(24);

    await page.mouse.click(end.x, end.y);
    expect(await page.evaluate((c) => window.__ms!.cellState(c), BOTTOM)).toBe("revealed");
  });

  test("a sideways drag slides the board along the line, at its own scale", async ({ page }) => {
    const start = await at(page, BOTTOM);
    await drag(page, start, { x: start.x, y: 300 });
    const before = await at(page, BOTTOM);
    const zoom = await page.evaluate(() => window.__ms!.zoom());
    await drag(page, { x: 300, y: before.y }, { x: 200, y: before.y });
    const after = await at(page, BOTTOM);
    // the finger's 100px, less the tap slop the drag spends before it starts
    // moving the board
    expect(after.x - before.x).toBeLessThan(-88);
    expect(after.x - before.x).toBeGreaterThan(-101);
    expect(after.y).toBeCloseTo(before.y, 0);
    expect(await page.evaluate(() => window.__ms!.zoom())).toBeCloseTo(zoom, 6);
  });

  test("a drag down at the fitted size does not shrink the board", async ({ page }) => {
    const start = await at(page, BOTTOM);
    await drag(page, { x: 200, y: 400 }, { x: 200, y: 600 });
    expect(await page.evaluate(() => window.__ms!.zoom())).toBe(1);
    const end = await at(page, BOTTOM);
    expect(end.y).toBeCloseTo(start.y, 1);
  });

  test("the up arrow magnifies about the ideal line, and 0 puts the board back", async ({ page }) => {
    const start = await at(page, BOTTOM);
    await page.keyboard.press("ArrowUp");
    await frame(page);
    expect(await page.evaluate(() => window.__ms!.zoom())).toBeGreaterThan(1);
    await page.keyboard.press("0");
    await frame(page);
    expect(await page.evaluate(() => window.__ms!.zoom())).toBe(1);
    const back = await at(page, BOTTOM);
    expect(back.x).toBeCloseTo(start.x, 1);
    expect(back.y).toBeCloseTo(start.y, 1);
  });
});
