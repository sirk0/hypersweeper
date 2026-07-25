import { expect, test, type Page } from "@playwright/test";

// The 3D camera fit: a solid is framed by its real silhouette (see
// BoardRenderer.frameSolid), so it fills the phone screen rather than floating
// inside its bounding sphere — and stays inside the screen as it is rotated.

/** Screen-space box of every cell facing the camera, as a fraction of the
 * region below the header. */
async function frontCellBox(page: Page): Promise<{
  spanX: number;
  spanY: number;
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
  width: number;
  top: number;
  height: number;
}> {
  return page.evaluate(() => {
    const ms = window.__ms!;
    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;
    for (const cell of ms.cells()) {
      const xy = ms.cellScreenXY(cell);
      if (!xy) continue; // facing away
      minX = Math.min(minX, xy.x);
      maxX = Math.max(maxX, xy.x);
      minY = Math.min(minY, xy.y);
      maxY = Math.max(maxY, xy.y);
    }
    const header = document.querySelector(".hud")!.getBoundingClientRect();
    const width = window.innerWidth;
    const height = window.innerHeight - header.bottom;
    return {
      spanX: (maxX - minX) / width,
      spanY: (maxY - minY) / height,
      minX,
      maxX,
      minY,
      maxY,
      width,
      top: header.bottom,
      height,
    };
  });
}

test.describe("3D framing", () => {
  test.beforeEach(async ({ page }) => {
    // A portrait phone: the case the sphere fit wasted the most room on.
    await page.setViewportSize({ width: 402, height: 745 });
  });

  // A ball fills its bounding sphere, so the sphere is the control; the flat
  // ones are what the silhouette fit rescues (the cylinder used to reach half
  // the screen width, the Klein bottle half of both axes).
  for (const mode of ["sphere", "torus", "cylinder", "klein", "mobius", "cube"]) {
    test(`${mode} fills the screen`, async ({ page }) => {
      await page.goto(`/?mode=${mode}&difficulty=medium&seed=7`);
      await expect(page.locator("body[data-ready]")).toBeVisible();
      const box = await frontCellBox(page);
      // Cell *centres*, so the drawn silhouette runs wider than this box.
      expect(Math.max(box.spanX, box.spanY)).toBeGreaterThan(0.7);
    });
  }

  test("rotating never pushes cells off the screen", async ({ page }) => {
    await page.goto("/?mode=cylinder&difficulty=medium&seed=7");
    await expect(page.locator("body[data-ready]")).toBeVisible();
    for (let turn = 0; turn < 8; turn++) {
      const box = await frontCellBox(page);
      expect(box.minX, `turn ${turn}`).toBeGreaterThan(0);
      expect(box.maxX, `turn ${turn}`).toBeLessThan(box.width);
      expect(box.minY, `turn ${turn}`).toBeGreaterThan(box.top);
      expect(box.maxY, `turn ${turn}`).toBeLessThan(box.top + box.height);
      await page.evaluate(() => window.__ms!.rotate(55, 30));
    }
  });
});
