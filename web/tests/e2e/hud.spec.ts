import { expect, test } from "@playwright/test";

// Header layout parity with the pygame game (see `draw_header` in gui.py): the
// smiley sits on the exact horizontal centre of the screen with the two LED
// counters symmetric either side of it, every control in the row is the same
// height, and the whole row fits the viewport on a phone.
//
// The header carries **two slots a side** — back and flag-mode at the left,
// a random board and about-this-board at the right — around that centred block.
// How-to-play moved down to the right-hand end of the caption row when the die
// took its slot, and `tests` for it look for it there. Seven
// controls is what one row holds at 320px, so the Klein bottle's two scroll
// chevrons are *not* here: they belong to the board rather than to the game and
// are drawn on the caption row under the header (`ui/boardInfo.ts`). Putting
// them back in this row would wrap it on exactly the board that has the most to
// fit, which is what this file exists to prevent.

// Widths worth pinning: the narrowest iPhone still in circulation (320, SE 1st
// gen), the SE 2/3 and the 12/13/14 class, the Pro Max class, and a desktop
// window. The Klein bottle is still the case to check — it is the board that
// carries extra controls, now on the row below.
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

  test("help opened from a game leaves the menu intact behind it", async ({ page }) => {
    // Classic -> ? -> Back -> Back. How-to-play hides the difficulty block
    // (those pages select no board), and that used to be cleared only when the
    // menu *navigated* — so coming back from the board re-rendered the home
    // page with the block still hidden and no way to change difficulty.
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/");
    await expect(page.locator("body[data-ready]")).toBeVisible();
    await expect(page.locator(".menu-difficulty")).toBeVisible();

    await page.locator('.menu-entry[data-mode="square"]').click();
    await page.locator('.board-caption [data-slot="help"]').click();
    await expect(page.locator(".menu-difficulty")).toBeHidden();

    // Back to the board: the game is still the one that was running.
    await page.locator(".menu-back").click();
    await expect(page.locator(".hud-smiley")).toBeVisible();
    expect((await page.evaluate(() => window.__ms?.state()))?.screen).toBe("game");

    // ...and back to the menu, which is whole.
    await page.locator('.hud-btn[data-slot="back"]').click();
    await expect(page.locator(".menu-difficulty")).toBeVisible();
    await expect(page.locator('.difficulty-btn[data-key="hard"]')).toBeVisible();
    await expect(page.locator('.menu-entry[data-mode="square"]')).toBeVisible();
  });

  test("help over a game keeps the board and the page it was launched from", async ({
    page,
  }) => {
    // Reached through a picker rather than Classic: leaving the board must
    // still land on that picker, so opening help must not overwrite the stored
    // page the way an ordinary navigation would.
    await page.goto("/");
    await expect(page.locator("body[data-ready]")).toBeVisible();
    await page.locator('.menu-entry[data-group="custom"]').click();
    await page.locator('.menu-entry[data-group="manifolds"]').click();
    await page.locator('.menu-entry[data-surface="klein"]').click();
    await page.locator('.menu-entry[data-mode="klein"]').click();

    const before = await page.evaluate(() => window.__ms!.state());
    await page.locator('.board-caption [data-slot="help"]').click();
    await page.locator(".menu-back").click();
    // The same game, not a new one: the board is hidden, never torn down.
    expect(await page.evaluate(() => window.__ms!.state())).toEqual(before);

    await page.locator('.hud-btn[data-slot="back"]').click();
    await expect(page.locator('.menu-entry[data-mode="klein"]')).toBeVisible();
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
    await expect(
      page.locator(".board-caption-controls .board-bar-btn:not([hidden])"),
    ).toHaveCount(0);
    // The strip is still there for how-to-play, which every board carries.
    await expect(page.locator('.board-caption [data-slot="help"]')).toBeVisible();
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
    // Every row carries the colour the board paints that shape in.
    await expect(dialog.locator(".info-shape .info-swatch")).toHaveCount(shapes.length);

    // Escape closes it, and the board is still there to go back to.
    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
    await expect(page.locator(".board-name")).toContainText("Cairo pentagonal");
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

  test("how-to-play sits at the right of the row under the header", async ({ page }) => {
    // It moved off the header when the die took its slot. The board's own
    // controls stay on the screen's centre line beside it.
    await page.setViewportSize({ width: 320, height: 568 });
    await page.goto("/?mode=klein&difficulty=easy&seed=1");
    await expect(page.locator("body[data-ready]")).toBeVisible();

    const box = await page.evaluate(() => {
      const help = document.querySelector('.board-caption [data-slot="help"]')!;
      const controls = [
        ...document.querySelectorAll<HTMLElement>(
          ".board-caption-controls .board-bar-btn:not([hidden])",
        ),
      ].map((b) => b.getBoundingClientRect());
      const h = help.getBoundingClientRect();
      return {
        helpRight: h.right,
        helpLeft: h.left,
        controlsRight: Math.max(...controls.map((c) => c.right)),
        controlsCentre:
          (Math.min(...controls.map((c) => c.left)) + Math.max(...controls.map((c) => c.right))) / 2,
        width: window.innerWidth,
      };
    });
    // Right of every board control, and hard against the right edge.
    expect(box.helpLeft).toBeGreaterThanOrEqual(box.controlsRight);
    expect(box.width - box.helpRight).toBeLessThan(24);
    // ...and the controls are still centred on the screen.
    expect(box.controlsCentre).toBeCloseTo(box.width / 2, 0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(320);
  });

  test("the game header no longer offers a share button", async ({ page }) => {
    // Sharing is the win window's, where the link goes with a time worth
    // sending; the header slot it used to have is the info button now.
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/?mode=square&difficulty=easy&seed=1");
    await expect(page.locator("body[data-ready]")).toBeVisible();
    await expect(page.locator('.hud [data-slot="share"]')).toHaveCount(0);
  });
});
