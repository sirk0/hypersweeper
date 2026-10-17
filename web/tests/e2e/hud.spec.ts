import { expect, test } from "@playwright/test";

// Header layout parity with the pygame game (see `draw_header` in gui.py): the
// smiley sits on the exact horizontal centre of the screen with the two LED
// counters symmetric either side of it, every control in the row is the same
// height, and the whole row fits the viewport on a phone.
//
// The header carries **two slots a side** — back and flag-mode at the left,
// a random board and about-this-board at the right — around that centred block.
// How-to-play is not on this screen at all: it is a page, it lives behind the
// menu's ?, and a game screen already carries a header, a control row and the
// board. Seven
// controls is what one row holds at 320px, so the Klein bottle's two scroll
// chevrons are *not* here: they belong to the board rather than to the game and
// are drawn on the caption row under the header (`ui/boardInfo.ts`). Putting
// them back in this row would wrap it on exactly the board that has the most to
// fit, which is what this file exists to prevent.

// Widths worth pinning: the narrowest iPhone still in circulation (320, SE 1st
// gen), the SE 2/3 and the 12/13/14 class, the 16 Pro, the Pro Max class, the
// iPhone Duo's inner screen, and a desktop window. The Klein bottle is still
// the case to check — it is the board that carries extra controls, now on the
// row below.
const VIEWPORTS = [
  { name: "iPhone SE (1st gen)", width: 320, height: 568 },
  { name: "iPhone SE (2nd/3rd gen)", width: 375, height: 667 },
  { name: "iPhone 14", width: 390, height: 844 },
  { name: "iPhone 16 Pro", width: 402, height: 874 },
  { name: "iPhone 14 Pro Max", width: 430, height: 932 },
  { name: "iPhone Duo", width: 669, height: 951 },
  { name: "desktop", width: 1280, height: 800 },
];

/** Apple's standard touch target, in points. */
const TOUCH = 44;
/** `--hud-btn-max` in styles.css. */
const MAX_BUTTON = 52;

/** The header button side styles.css solves for at this width with no safe
 * areas: the row is 8.6 buttons wide (`--hud-fit`) between two `--hud-pad`s,
 * clamped to `--hud-btn-max`. */
function expectedButton(width: number): number {
  const pad = Math.min(14, Math.max(5, width * 0.02));
  return Math.min(MAX_BUTTON, (width - 2 * pad) / 8.6);
}

/** Stand in a device's top safe-area inset, as the store-screenshot script
 * does: through `--safe-top`, before the bundle runs. */
async function stubSafeTop(page: import("@playwright/test").Page, inset: number): Promise<void> {
  await page.addInitScript((px) => {
    const apply = (): boolean => {
      document.documentElement?.style.setProperty("--safe-top", `${px}px`);
      return document.documentElement != null;
    };
    if (!apply()) document.addEventListener("readystatechange", apply);
  }, inset);
}

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
        "random",
        "info",
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

      // The buttons are as big as the row lets them be: the size that fills the
      // line, up to the cap. That is Apple's 44pt from the 16 Pro's width up,
      // and smaller only where seven controls would not otherwise fit.
      const side = first!.right - first!.left;
      expect(side).toBeCloseTo(expectedButton(vp.width), 0);
      if (vp.width >= 400) expect(side).toBeGreaterThanOrEqual(TOUCH);

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

  test("a status bar with no sensor housing moves the end controls in from the corners", async ({
    page,
  }) => {
    // The iPhone Duo (and an iPad): a 24pt status bar is all the top inset
    // there is, which leaves the header up in the display's rounded corners.
    await stubSafeTop(page, 24);
    await page.setViewportSize({ width: 669, height: 951 });
    await page.goto("/?mode=klein&difficulty=easy&seed=1");
    await expect(page.locator("body[data-ready]")).toBeVisible();
    const boxes = await headerBoxes(page);
    const by = (slot: string) => boxes.find((b) => b.slot === slot)!;
    expect(by("back").top).toBeCloseTo(24, 0);
    // `--corner-reach` (48px) less the 24px inset: each end sits 24px in.
    expect(by("back").left).toBeCloseTo(24, 0);
    expect(669 - by("info").right).toBeCloseTo(24, 0);
    const smiley = by("smiley");
    expect((smiley.left + smiley.right) / 2).toBeCloseTo(669 / 2, 1);
  });

  test("a Dynamic Island inset clears the corners by itself", async ({ page }) => {
    // 62pt puts the header below the corner's curve, so the row keeps its
    // ordinary side padding — and its size.
    await stubSafeTop(page, 62);
    await page.setViewportSize({ width: 402, height: 874 });
    await page.goto("/?mode=klein&difficulty=easy&seed=1");
    await expect(page.locator("body[data-ready]")).toBeVisible();
    const boxes = await headerBoxes(page);
    expect(boxes[0]!.top).toBeCloseTo(62, 0);
    expect(boxes[0]!.left).toBeCloseTo(402 * 0.02, 0);
    expect(boxes[0]!.right - boxes[0]!.left).toBeGreaterThanOrEqual(TOUCH);
  });

  test("a board without a cell cycle carries the same header", async ({ page }) => {
    // Every board gets the same seven controls — the two sides are equal, which
    // is what keeps the centre group on the middle of the screen.
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
      "random",
      "info",
    ]);
    const smiley = boxes.find((b) => b.slot === "smiley")!;
    expect((smiley.left + smiley.right) / 2).toBeCloseTo(390 / 2, 1);
  });

  test("the symmetry controls sit on the board bar, not in the header", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 320, height: 568 });
    // Every control this board has, which is what the row has to hold at its
    // worst — out of the box it shows the Klein bottle's two alone
    // (settings.ts `extraControls`, pinned in tests/e2e/surfaces.spec.ts).
    await page.addInitScript(() => {
      localStorage.setItem(
        "ms:settings",
        JSON.stringify({ version: 5, extraControls: true, seenHint: true }),
      );
    });
    await page.goto("/?mode=klein&difficulty=easy&seed=1");
    await expect(page.locator("body[data-ready]")).toBeVisible();

    // Below the header, beside the board's name — and below every header
    // control, so the two rows really are two rows.
    const header = await headerBoxes(page);
    const headerBottom = Math.max(...header.map((b) => b.bottom));
    for (const slot of ["symmetry-ring-back", "symmetry-ring-fwd", "symmetry-tube-fwd"]) {
      const btn = page.locator(`.board-caption [data-slot="${slot}"]`);
      await expect(btn).toBeVisible();
      expect((await btn.boundingBox())!.y).toBeGreaterThanOrEqual(headerBottom);
    }
    await expect(page.locator(`.hud [data-slot="symmetry-ring-back"]`)).toHaveCount(0);

    // The caption names the board, and nothing overflows the phone. Matched
    // by prefix, not exactly: a board the calibration grades as harder than
    // its difficulty carries a warning mark after the name, and which boards
    // those are moves whenever the calibration is re-run. The mark itself is
    // pinned in tests/unit/fairness.test.ts, where it does not depend on one
    // board's mine count.
    await expect(page.locator(".board-name")).toContainText(
      "Squares · Klein bottle",
    );
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(320);
  });

  test("the gesture hint shows on the first board ever, and never again", async ({
    page,
  }) => {
    // The app's only first-run affordance: long-press-to-flag is otherwise
    // documented on the how-to-play page and nowhere a new player will look.
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/");
    await expect(page.locator("body[data-ready]")).toBeVisible();
    await page.locator('.menu-entry[data-mode="square"]').click();

    const hint = page.locator(".board-hint");
    await expect(hint).toBeVisible();
    await expect(hint).toContainText("to flag");

    // It has done its job the moment a move is made.
    await page.evaluate(() => window.__ms!.reveal(window.__ms!.cells()[0]!));
    await expect(hint).toBeHidden();

    // And it is spent: a second board, and a reload, get nothing.
    await page.locator('.hud-btn[data-slot="back"]').click();
    await page.locator('.menu-entry[data-mode="square"]').click();
    await expect(page.locator(".board-name")).toHaveText("Squares");
    await expect(hint).toBeHidden();

    await page.reload();
    await expect(page.locator("body[data-ready]")).toBeVisible();
    await expect(hint).toBeHidden();
  });

  test("a board with no symmetries shows its name and no board-bar controls", async ({
    page,
  }) => {
    // An aperiodic patch, trimmed to its centremost cells, is symmetric about
    // nothing — one of the few boards in the catalogue with no control at all.
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/?mode=penrose&difficulty=easy&seed=1");
    await expect(page.locator("body[data-ready]")).toBeVisible();

    await expect(page.locator(".board-name")).toContainText("Penrose");
    await expect(page.locator(".board-caption .board-bar-btn:not([hidden])")).toHaveCount(0);
    // Nothing left in the strip, so it reserves no height at all.
    await expect(page.locator(".board-caption")).toBeHidden();
  });

  test("the board's name is drawn behind the board, not above it", async ({ page }) => {
    // The name is a label on the page rather than chrome: it costs the board no
    // height (the board is framed below the header alone) and a board zoomed
    // over it covers it, which is what puts it behind the transparent canvas.
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/?mode=square&difficulty=easy&seed=1");
    await expect(page.locator("body[data-ready]")).toBeVisible();

    const placed = await page.evaluate(() => {
      const name = document.querySelector<HTMLElement>(".board-name-layer")!;
      const canvas = document.getElementById("board")!;
      return {
        beforeCanvas:
          name.compareDocumentPosition(canvas) === Node.DOCUMENT_POSITION_FOLLOWING,
        inUi: document.getElementById("ui")!.contains(name),
        events: getComputedStyle(name).pointerEvents,
        top: name.getBoundingClientRect().top,
        headerBottom: document.querySelector(".hud")!.getBoundingClientRect().bottom,
      };
    });
    expect(placed.beforeCanvas).toBe(true);
    expect(placed.inUi).toBe(false);
    expect(placed.events).toBe("none");
    // It sits on the line the board is framed from, under the header.
    expect(placed.top).toBeGreaterThanOrEqual(placed.headerBottom - 1);
  });

  test("the info button says what the board is", async ({ page }) => {
    // The one place the app explains a board: dealt one at random by Flat or
    // 3D, or handed one by a link, this is how a player finds out what they are
    // looking at.
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/?mode=kleincairo&difficulty=easy&seed=1");
    await expect(page.locator("body[data-ready]")).toBeVisible();

    await page.locator('.hud-btn[data-slot="info"]').click();
    const dialog = page.locator('.dialog-backdrop[data-dialog="info"]');
    await expect(dialog).toBeVisible();
    await expect(dialog.locator("#info-dialog-title")).toHaveText("Cairo pentagonal · Klein bottle");

    // The family it comes from, the surface it is wrapped on, and its size.
    const facts = await dialog
      .locator(".info-fact")
      .evaluateAll((rows) =>
        rows.map((r) => [
          r.querySelector(".info-fact-label")!.textContent,
          r.querySelector(".info-fact-value")!.textContent,
        ]),
      );
    expect(facts).toContainEqual(["Family", "Laves"]);
    expect(facts).toContainEqual(["Surface", "Klein bottle"]);
    const cells = await page.evaluate(() => window.__ms!.state().cellCount);
    expect(facts).toContainEqual(["Cells", String(cells)]);

    // And what its tiles are, counted — the pentagons of a Cairo tiling, bent
    // by the immersion but pentagons still.
    const shapes = await dialog
      .locator(".info-shape")
      .evaluateAll((rows) =>
        rows.map((r) => [
          r.querySelector(".info-shape-name")!.textContent,
          r.querySelector(".info-shape-count")!.textContent,
        ]),
      );
    expect(shapes).toEqual([["Irregular pentagons", String(cells)]]);
    // An irregular tile has no ideal shape to bend, so nothing is projected
    // and there is no word to explain.
    await expect(dialog.locator(".info-note")).toHaveCount(0);
    // Every row carries the colour the board paints that shape in.
    await expect(dialog.locator(".info-shape .info-swatch")).toHaveCount(shapes.length);

    // Escape closes it, and the board is still there to go back to.
    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
    await expect(page.locator(".board-name")).toContainText("Cairo pentagonal");
  });

  test("the info window names a sphere's bent hexagons projected, and says what that means", async ({
    page,
  }) => {
    // The App Clip's board. Its hexagons cannot all be regular on any sphere,
    // its pentagons are, and the word for the difference is explained in place.
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/?mode=c80&difficulty=easy&seed=1");
    await expect(page.locator("body[data-ready]")).toBeVisible();
    await page.locator('.hud-btn[data-slot="info"]').click();
    const dialog = page.locator('.dialog-backdrop[data-dialog="info"]');
    await expect(dialog.locator(".info-shape-name")).toHaveText([
      "Regular pentagons",
      "Projected regular hexagons",
    ]);
    await expect(dialog.locator(".info-note")).toContainText("ideal tiling");
  });

  test("the die deals another board of the same kind, mid-game", async ({ page }) => {
    // The record window's "New board" without having to win first: the point of
    // a 179-board catalogue is wandering through it. Flat board in, flat board
    // out — and a 3D one deals another manifold, sphere or polyhedron.
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/?mode=hex&difficulty=easy&seed=1");
    await expect(page.locator("body[data-ready]")).toBeVisible();
    await page.evaluate(() => window.__ms!.reveal(window.__ms!.cells()[0]!));

    await page.locator('.hud-btn[data-slot="random"]').click();
    let state = await page.evaluate(() => window.__ms!.state());
    expect(state.screen).toBe("game");
    expect(state.status).toBe("playing"); // a fresh board, not the one played
    expect(state.revealed).toBe(0);
    expect(state.difficulty).toBe("easy"); // the difficulty being played
    expect(state.is3d).toBe(false);

    await page.goto("/?mode=torus&difficulty=easy&seed=1");
    await expect(page.locator("body[data-ready]")).toBeVisible();
    await page.locator('.hud-btn[data-slot="random"]').click();
    state = await page.evaluate(() => window.__ms!.state());
    expect(state.is3d).toBe(true);
  });

  test("the game screen offers neither share nor how-to-play", async ({ page }) => {
    // Both were header slots and both left. Sharing is the win window's, where
    // the link goes with a time worth sending; how-to-play is a page, and it
    // belongs behind the menu's ? rather than on top of a live board. What
    // their slots carry now is the die and the ⓘ.
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/?mode=klein&difficulty=easy&seed=1");
    await expect(page.locator("body[data-ready]")).toBeVisible();
    for (const slot of ["share", "help"]) {
      await expect(page.locator(`[data-slot="${slot}"]`)).toHaveCount(0);
    }
    await expect(page.locator('.hud-btn[data-slot="random"]')).toBeVisible();
    await expect(page.locator('.hud-btn[data-slot="info"]')).toBeVisible();
  });
});
