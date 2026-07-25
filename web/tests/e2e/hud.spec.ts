import { expect, test } from "@playwright/test";

// Header layout parity with the pygame game (see `draw_header` in gui.py): the
// smiley sits on the exact horizontal centre of the screen with the two LED
// counters symmetric either side of it, every control in the row is the same
// height, and the Klein bottle's two scroll chevrons live in that same row at
// the right edge — including on a phone, where the whole row still has to fit
// the viewport.

// Widths worth pinning: the narrowest iPhone still in circulation (320, SE 1st
// gen), the SE 2/3 and the 12/13/14 class, the Pro Max class, and a desktop
// window. The Klein bottle is the worst case — it is the only board that adds
// the two scroll chevrons.
const VIEWPORTS = [
  { name: "iPhone SE (1st gen)", width: 320, height: 568 },
  { name: "iPhone SE (2nd/3rd gen)", width: 375, height: 667 },
  { name: "iPhone 14", width: 390, height: 844 },
  { name: "iPhone 14 Pro Max", width: 430, height: 932 },
  { name: "desktop", width: 1280, height: 800 },
];

interface Box {
  slot: string;
  left: number;
  right: number;
  top: number;
  bottom: number;
  height: number;
}

async function headerBoxes(page: import("@playwright/test").Page): Promise<Box[]> {
  return page.evaluate(() =>
    [...document.querySelectorAll<HTMLElement>(".hud [data-slot]")]
      .filter((el) => el.style.display !== "none")
      .map((el) => {
        const r = el.getBoundingClientRect();
        return {
          slot: el.dataset.slot!,
          left: r.left,
          right: r.right,
          top: r.top,
          bottom: r.bottom,
          height: r.height,
        };
      })
      .sort((a, b) => a.left - b.left),
  );
}

test.describe("game header", () => {
  for (const vp of VIEWPORTS) {
    test(`Klein header fits and stays centred on ${vp.name}`, async ({ page }) => {
      await page.setViewportSize({ width: vp.width, height: vp.height });
      await page.goto("/?mode=klein&difficulty=easy&seed=1");
      await expect(page.locator("body[data-ready]")).toBeVisible();

      const boxes = await headerBoxes(page);
      expect(boxes.map((b) => b.slot)).toEqual([
        "back",
        "flag-mode",
        "mine-counter",
        "smiley",
        "timer",
        "klein-scroll-back",
        "klein-scroll-fwd",
      ]);

      // One row: every control overlaps the others vertically, and nothing is
      // pushed onto a second line (the chevrons used to stack on a phone).
      const [first, ...rest] = boxes;
      for (const b of rest) {
        expect(b.top).toBeLessThan(first!.bottom);
        expect(b.bottom).toBeGreaterThan(first!.top);
      }

      // Counters are exactly as tall as the icon buttons and the smiley.
      for (const b of boxes) expect(b.height).toBeCloseTo(first!.height, 1);

      // Nothing overlaps, nothing overflows the viewport.
      for (let i = 1; i < boxes.length; i++) {
        expect(boxes[i]!.left).toBeGreaterThanOrEqual(boxes[i - 1]!.right);
      }
      expect(boxes[0]!.left).toBeGreaterThanOrEqual(0);
      expect(boxes.at(-1)!.right).toBeLessThanOrEqual(vp.width);
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(vp.width);

      // The smiley is centred on the screen, with the counters symmetric
      // around it — the pygame `face_rect` / `draw_counter` arrangement.
      const by = (slot: string) => boxes.find((b) => b.slot === slot)!;
      const smiley = by("smiley");
      expect((smiley.left + smiley.right) / 2).toBeCloseTo(vp.width / 2, 1);
      expect(smiley.left - by("mine-counter").right).toBeCloseTo(
        by("timer").left - smiley.right,
        1,
      );
    });
  }

  test("a board without a cell cycle centres the smiley too", async ({ page }) => {
    // The side clusters are lopsided here (back + flag on the left, nothing on
    // the right), which must not shift the centre group off the middle.
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/?mode=square&difficulty=easy&seed=1");
    await expect(page.locator("body[data-ready]")).toBeVisible();

    const boxes = await headerBoxes(page);
    expect(boxes.map((b) => b.slot)).toEqual([
      "back",
      "flag-mode",
      "mine-counter",
      "smiley",
      "timer",
    ]);
    const smiley = boxes.find((b) => b.slot === "smiley")!;
    expect((smiley.left + smiley.right) / 2).toBeCloseTo(390 / 2, 1);
  });
});
