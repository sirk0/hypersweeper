import { expect, test, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";

// The deployed build, end to end: it boots under the real security policy, its
// screens open, and a tile dragged onto the board lands. Unit tests cover the
// geometry and the rules; this covers the page.

/** A phone's screen: the home, Tilings and tiling-page tests here are of the
 * phone's layout, which is what a narrow window gets; the desktop's — the
 * sidebar, its groups, the two-column tiling page — is desktop.spec.ts's. */
const PHONE = { width: 390, height: 844 };

/** Collect console errors and CSP violations for the whole test. */
function watchErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on("console", (msg) => {
    if (msg.type() === "error") errors.push(msg.text());
  });
  page.on("pageerror", (err) => errors.push(String(err)));
  return errors;
}

test("boots under the deployed security policy, with no errors", async ({ page }) => {
  const errors = watchErrors(page);
  const response = await page.goto("/");
  expect(response?.headers()["content-security-policy"]).toContain("default-src 'self'");
  await expect(page.locator("#home")).toBeVisible();
  await expect(page.locator("#home-picks button")).toHaveCount(4);
  // The deployed extras the shared preset adds.
  await expect(page.locator('link[rel="manifest"]')).toHaveAttribute(
    "href",
    "/manifest.webmanifest",
  );
  await expect(page.locator('meta[property="og:title"]')).toHaveAttribute("content", "Rep-tiles");
  const stamp = (await (await page.request.get("/version.json")).json()) as { version: string };
  expect(stamp.version).toMatch(/^\d+\.\d+\.\d+$/);
  expect(errors).toEqual([]);
});

test("a pick from home deals a level, and Tilings lists every family", async ({ page }) => {
  await page.setViewportSize(PHONE);
  const errors = watchErrors(page);
  await page.goto("/");
  await page.locator("#home-picks button").first().click();
  await expect(page.locator("#game")).toBeVisible();
  await expect(page.locator("svg.board path.region")).toHaveCount(1);
  await expect(page.locator("svg.board .in-tray").first()).toBeVisible();

  await page.goto("/?tilings");
  await expect(page.locator("#catalog")).toBeVisible();
  await expect(page.locator("#catalog .hud-title")).toHaveText("Tilings");
  await expect(page.locator("#catalog-list button, #catalog-list a").first()).toBeVisible();
  // each card draws its tiles inside its board's outline, in one picture
  await expect(page.locator("#catalog .card-art svg.card-picture").first()).toBeVisible();
  await expect(page.locator('#catalog [data-tiling="trihex"] .card-picture path.tile')).toHaveCount(
    2,
  );
  // the old name's links still open it, and so do the Figures screen's
  for (const old of ["/?catalog", "/?figures", "/?figure=squares"]) {
    await page.goto(old);
    await expect(page.locator("#catalog")).toBeVisible();
  }
  expect(errors).toEqual([]);
});

test("a square dragged into the corner of the squares level lands there", async ({ page }) => {
  const errors = watchErrors(page);
  await page.goto("/?level=squares");
  const count = page.locator("#count");
  await expect(count).toBeVisible();
  const before = await count.textContent();

  const tray = page.locator("svg.board .tile.in-tray").first();
  const t = (await tray.boundingBox())!;
  const r = (await page.locator("svg.board path.region").boundingBox())!;
  // Press the tray square at its centre — the tile then keeps its centre
  // under the pointer — and drop it half a tile in from the board's
  // bottom-left corner, where it snaps.
  await page.mouse.move(t.x + t.width / 2, t.y + t.height / 2);
  await page.mouse.down();
  const target = { x: r.x + t.width / 2, y: r.y + r.height - t.height / 2 };
  await page.mouse.move(target.x, target.y, { steps: 12 });
  await page.mouse.up();

  await expect(page.locator("svg.board [data-tile]")).toHaveCount(1);
  await expect(count).not.toHaveText(before ?? "");
  expect(errors).toEqual([]);
});

test("settings report the version and check for updates", async ({ page }) => {
  await page.setViewportSize(PHONE);
  const errors = watchErrors(page);
  await page.goto("/");
  await page.locator('#home [data-action="settings"]').click();
  await expect(page.locator("#settings")).toBeVisible();
  await expect(page.locator('[data-value="version"]')).toHaveText(/^\d+\.\d+\.\d+/);
  await page.locator('[data-action="check-updates"]').click();
  await expect(page.locator('[data-action="check-updates"] .settings-hint')).toHaveText(
    "You are on the latest build.",
  );
  expect(errors).toEqual([]);
});

test("How to play opens from home's ?, and by its own link", async ({ page }) => {
  await page.setViewportSize(PHONE);
  const errors = watchErrors(page);
  await page.goto("/");
  await page.locator('#home [data-action="help"]').click();
  await expect(page).toHaveURL(/\?help$/);
  await expect(page.locator("#help")).toBeVisible();
  await expect(page.locator("#help .hud-title")).toHaveText("How to play");
  // the keys the level screen answers to, as key caps
  const keys = await page.locator("#help-body kbd").allTextContents();
  for (const key of ["R", "E", "F", "X", "H", "Esc"]) expect(keys).toContain(key);
  await page.goBack();
  await expect(page.locator("#home")).toBeVisible();
  await page.goto("/?help");
  await expect(page.locator("#help")).toBeVisible();
  await page.locator("#help [data-go-home]").click();
  await expect(page.locator("#home")).toBeVisible();
  expect(errors).toEqual([]);
});

test("the colour scheme: Auto follows the device, Light and Dark override it, and stay", async ({
  page,
}) => {
  await page.setViewportSize(PHONE);
  const errors = watchErrors(page);
  const page_ = () =>
    page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue("--page"));
  const scheme = page.locator('[role="radiogroup"][aria-label="Colour scheme"]');

  await page.emulateMedia({ colorScheme: "light" });
  await page.goto("/?settings");
  await expect(scheme.locator('[data-scheme="auto"]')).toHaveAttribute("aria-checked", "true");
  await expect(scheme.locator("..").locator(".settings-hint")).toHaveText(
    "Following your device (light)",
  );
  await expect(page.locator("html")).not.toHaveAttribute("data-scheme");
  expect((await page_()).trim()).toBe("#f5ead8");

  // Dark on a light device: the dark page, and the browser's bar with it
  await scheme.locator('[data-scheme="dark"]').click();
  await expect(scheme.locator('[data-scheme="dark"]')).toHaveAttribute("aria-checked", "true");
  await expect(page.locator("html")).toHaveAttribute("data-scheme", "dark");
  expect((await page_()).trim()).toBe("#191712");
  for (const meta of await page.locator('meta[name="theme-color"]').all())
    await expect(meta).toHaveAttribute("content", "#191712");

  // kept: a fresh page — a level, even — opens dark
  await page.goto("/?level=squares");
  await expect(page.locator("html")).toHaveAttribute("data-scheme", "dark");
  expect((await page_()).trim()).toBe("#191712");

  // Light on a dark device
  await page.emulateMedia({ colorScheme: "dark" });
  await page.goto("/?settings");
  await scheme.locator('[data-scheme="light"]').click();
  await expect(page.locator("html")).toHaveAttribute("data-scheme", "light");
  expect((await page_()).trim()).toBe("#f5ead8");

  // and Auto again follows the device, dark
  await scheme.locator('[data-scheme="auto"]').click();
  await expect(page.locator("html")).not.toHaveAttribute("data-scheme");
  expect((await page_()).trim()).toBe("#191712");
  await expect(page.locator('meta[name="theme-color"][media*="light"]')).toHaveAttribute(
    "content",
    "#f5ead8",
  );
  expect(errors).toEqual([]);
});

test("the privacy policy: linked from Settings, served at /privacy under the site's policy", async ({
  page,
}) => {
  await page.setViewportSize(PHONE);
  const errors = watchErrors(page);
  await page.goto("/?settings");
  const link = page.locator('[data-action="privacy-policy"]');
  await expect(link).toHaveAttribute("href", "/privacy");
  await expect(link).toHaveAttribute("target", "_blank");

  const response = await page.goto("/privacy");
  expect(response?.status()).toBe(200);
  expect(response?.headers()["content-type"]).toContain("text/html");
  expect(response?.headers()["content-security-policy"]).toContain("default-src 'self'");
  await expect(page.locator("h1")).toHaveText("Privacy policy");
  await expect(page).toHaveTitle("Privacy policy — Rep-tiles");
  // the page, not the game: no app screens, and no boot marker
  await expect(page.locator("#home")).toHaveCount(0);
  await expect(page.locator("body[data-ready]")).toHaveCount(0);
  await page.evaluate(() => document.fonts.ready);
  expect(await page.evaluate(() => document.fonts.check('16px "Space Grotesk"'))).toBe(true);
  // and back to the game
  await page.locator("footer a.play").click();
  await expect(page.locator("#home")).toBeVisible();
  expect(errors).toEqual([]);
});

test("the level screen: one header row, no level list, a random level of the same band", async ({
  page,
}) => {
  const errors = watchErrors(page);
  await page.goto("/?level=cairo");
  // home, back, the hint, restart and the die — and no clock: the time
  // taken shows only once the board is finished
  await expect(page.locator("#game .hud .hud-btn:visible")).toHaveCount(5);
  await expect(page.locator("#clock")).toHaveCount(0);
  await expect(page.locator("#game nav, #levels")).toHaveCount(0);
  await expect(page.locator("#level")).toHaveText(/V3²\.4\.3\.4/);
  // Cairo is hard; the die deals another hard level.
  // every level measured hard: from `HARD` (1.0, src/difficulty.ts) up
  const measured = JSON.parse(
    readFileSync(new URL("../../src/difficulty.json", import.meta.url), "utf8"),
  ) as Record<string, { score: number }>;
  const hard = Object.entries(measured)
    .filter(([, m]) => m.score >= 1.0)
    .map(([key]) => key);
  expect(hard).toContain("cairo");
  await page.locator("#random").click();
  await expect(page).not.toHaveURL(/level=cairo/);
  const key = new URL(page.url()).searchParams.get("level");
  expect(hard).toContain(key);
  expect(errors).toEqual([]);
});

test("a level names its board, and the game screen has no board button", async ({ page }) => {
  const errors = watchErrors(page);
  // a tiling cut the same wherever it is cut has one board, and says nothing
  await page.goto("/?level=squares");
  await expect(page.locator("#board-of")).toBeHidden();
  // the board is picked on the tiling's page, not in the game
  await page.goto("/?level=rhombitrihex-2");
  await expect(page.locator("#board")).toHaveCount(0);
  await expect(page.locator("#board-of")).toHaveText(/^board 2\/\d+$/);
  await expect(page.locator("svg.board path.region")).toHaveCount(1);
  // a marked level's boards are its tiling's, marked as it is
  await page.goto("/?level=trihex.lines-2");
  await expect(page.locator("#board-of")).toHaveText(/^board 2\/\d+$/);
  await expect(page.locator("#level")).toHaveText("3.6.3.6 · lines");
  // Tilings lists the tiling once, with how many levels it is: every board
  // plain and marked
  await page.goto("/?tilings");
  const card = page
    .locator("#catalog .card")
    .filter({ has: page.locator(".card-name", { hasText: /^3\.4\.6\.4$/ }) });
  await expect(card).toHaveCount(1);
  await expect(card.locator(".card-boards")).toHaveText(/^\d+ boards$/);
  await expect(card.locator(".card-sets")).toHaveText(/^\d+ tile sets$/);
  expect(errors).toEqual([]);
});

test("rotate turns the tray either way", async ({ page }) => {
  await page.goto("/?level=cairo");
  const tile = page.locator("svg.board .tile.in-tray").first();
  const start = await tile.getAttribute("d");
  await page.locator('[data-turn="1"]').click();
  const turned = await tile.getAttribute("d");
  expect(turned).not.toEqual(start);
  await page.locator('[data-turn="-1"]').click();
  await expect(tile).toHaveAttribute("d", start!);
});

test("the wheel zooms the board in, and the tray tiles grow with it", async ({ page }) => {
  await page.goto("/?level=rhombille");
  const tray = page.locator("svg.board .tile.in-tray").first();
  const before = (await tray.boundingBox())!;
  const r = (await page.locator("svg.board path.region").boundingBox())!;
  await page.mouse.move(r.x + r.width / 2, r.y + r.height / 2);
  await page.mouse.wheel(0, -400);
  const after = (await page.locator("svg.board path.region").boundingBox())!;
  expect(after.width).toBeGreaterThan(r.width * 1.5);
  expect((await tray.boundingBox())!.width).toBeGreaterThan(before.width);
});

test.describe("on a touchscreen", () => {
  test.use({ hasTouch: true, viewport: { width: 390, height: 844 } });

  test("the tray is two rows: the tiles, then the controls", async ({ page }) => {
    await page.goto("/?level=kisrhombille");
    const tile = (await page.locator("svg.board .tile.in-tray").first().boundingBox())!;
    const knobs = page.locator("svg.board .knob > circle:first-child");
    await expect(knobs).toHaveCount(4);
    const ys = new Set<number>();
    for (const knob of await knobs.all()) {
      const k = (await knob.boundingBox())!;
      expect(k.y).toBeGreaterThan(tile.y + tile.height);
      ys.add(Math.round(k.y));
    }
    expect(ys.size).toBe(1);
    // One kind fits: no scroll bar.
    await expect(page.locator("svg.board g.tray-scroll")).toBeHidden();
  });

  test("every tray tile is on screen at first, the board shrunk to make room", async ({ page }) => {
    // [3.4.6.4; 4.6.12]: a triangle, a square, a hexagon and a dodecagon at
    // the board's own size; and Ammann–Beenker's five coloured tiles.
    for (const level of ["dodecarhombitrihex", "ammannbeenker.3apart"]) {
      await page.goto(`/?level=${level}`);
      const tiles = page.locator("svg.board .tile.in-tray");
      await expect(tiles.first()).toBeVisible();
      for (const tile of await tiles.all()) {
        const t = (await tile.boundingBox())!;
        expect(t.x).toBeGreaterThanOrEqual(0);
        expect(t.x + t.width).toBeLessThanOrEqual(390);
      }
      await expect(page.locator("svg.board g.tray-scroll")).toBeHidden();
    }
    // Ammann–Beenker's five take two rows: a phone is not wide enough for one
    // without shrinking the board further than two rows do.
    const ys = new Set<number>();
    for (const tile of await page.locator("svg.board .tile.in-tray").all()) {
      const t = (await tile.boundingBox())!;
      ys.add(Math.round(t.y + t.height / 2));
    }
    expect(ys.size).toBe(2);
  });

  test("zoomed in, the tray scrolls, by the scroll bar or the strip's background", async ({
    page,
    context,
  }) => {
    // 4.8²'s square and octagon fit at first; zoomed in they grow with the
    // board and run longer than a phone is wide.
    await page.goto("/?level=truncsquare");
    const thumb = page.locator("svg.board .tray-scroll-thumb");
    await expect(page.locator("svg.board g.tray-scroll")).toBeHidden();
    const r = (await page.locator("svg.board path.region").boundingBox())!;
    await page.mouse.move(r.x + r.width / 2, r.y + r.height / 2);
    for (let i = 0; i < 4; i++) await page.mouse.wheel(0, -400);
    await expect(thumb).toBeVisible();
    const tile = page.locator("svg.board .tile.in-tray").first();
    const knob = page.locator('[data-turn="1"]');
    const start = (await tile.boundingBox())!.x;
    const knobAt = (await knob.boundingBox())!.x;
    const cdp = await context.newCDPSession(page);
    const drag = async (x: number, y: number, dx: number): Promise<void> => {
      await cdp.send("Input.dispatchTouchEvent", {
        type: "touchStart",
        touchPoints: [{ x, y, id: 0 }],
      });
      for (let i = 1; i <= 8; i++)
        await cdp.send("Input.dispatchTouchEvent", {
          type: "touchMove",
          touchPoints: [{ x: x + (i * dx) / 8, y, id: 0 }],
        });
      await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
    };
    // The thumb, dragged to the end, scrolls the tiles left.
    const t = (await thumb.boundingBox())!;
    await drag(t.x + t.width / 2, t.y + t.height / 2, 300);
    const scrolled = (await tile.boundingBox())!.x;
    expect(scrolled).toBeLessThan(start - 1);
    // The strip's background, dragged right, scrolls them back.
    const zone = (await page.locator("svg.board rect.tray-zone").boundingBox())!;
    await drag(zone.x + zone.width / 2, zone.y + 4, 200);
    expect((await tile.boundingBox())!.x).toBeGreaterThan(scrolled);
    // The controls never move.
    expect((await knob.boundingBox())!.x).toBeCloseTo(knobAt, 0);
  });

  test("two fingers pinch the board in", async ({ page, context }) => {
    await page.goto("/?level=rhombille");
    const r = (await page.locator("svg.board path.region").boundingBox())!;
    const cx = r.x + r.width / 2;
    const cy = r.y + r.height / 2;
    const cdp = await context.newCDPSession(page);
    const touch = (type: "touchStart" | "touchMove" | "touchEnd", pts: [number, number][]) =>
      cdp.send("Input.dispatchTouchEvent", {
        type,
        touchPoints: pts.map(([x, y], id) => ({ x, y, id })),
      });
    await touch("touchStart", [
      [cx - 30, cy],
      [cx + 30, cy],
    ]);
    for (let i = 1; i <= 8; i++)
      await touch("touchMove", [
        [cx - 30 - i * 6, cy],
        [cx + 30 + i * 6, cy],
      ]);
    await touch("touchEnd", []);
    const after = (await page.locator("svg.board path.region").boundingBox())!;
    expect(after.width).toBeGreaterThan(r.width * 1.5);
  });
});

/** Finish the 4×4 squares, row by row from the bottom-left: each square
 * dropped on its own cell snaps to the corner the cells before it left open. */
async function finishSquares(page: Page): Promise<void> {
  const tray = page.locator("svg.board .tile.in-tray").first();
  for (let row = 0; row < 4; row++) {
    for (let col = 0; col < 4; col++) {
      const t = (await tray.boundingBox())!;
      const r = (await page.locator("svg.board path.region").boundingBox())!;
      await page.mouse.move(t.x + t.width / 2, t.y + t.height / 2);
      await page.mouse.down();
      await page.mouse.move(
        r.x + ((col + 0.5) * r.width) / 4,
        r.y + r.height - ((row + 0.5) * r.height) / 4,
        { steps: 4 },
      );
      await page.mouse.up();
    }
  }
  await expect(page.locator("svg.board [data-tile]")).toHaveCount(16);
  await expect(page.locator("#won")).toBeVisible();
}

/** The region's on-screen width after wheeling out hard over the board. */
async function wheelOut(page: Page, steps: number): Promise<number> {
  const r = (await page.locator("svg.board path.region").boundingBox())!;
  await page.mouse.move(r.x + r.width / 2, r.y + r.height / 2);
  for (let i = 0; i < steps; i++) await page.mouse.wheel(0, 200);
  await page.waitForTimeout(200);
  return (await page.locator("svg.board path.region").boundingBox())!.width;
}

test("the win card's Exit closes it, leaving the finished board", async ({ page }) => {
  const errors = watchErrors(page);
  await page.goto("/?level=squares");
  await finishSquares(page);
  // no hint, no more tiles than needed: three stars
  await expect(page.locator("#won-stars")).toHaveText("★★★");
  await expect(page.locator("#won-detail")).toContainText("No hints.");
  await expect(page.locator("#won-detail")).toContainText(/Time: \d+:\d\d/);
  await page.locator("#exit").click();
  await expect(page.locator("#won")).toBeHidden();
  await expect(page.locator("#count")).toHaveText("100%");
  // The tiling past the board is a setting, off by default: no outlines, and
  // the board stays fitted.
  const fitted = (await page.locator("svg.board path.region").boundingBox())!;
  await page.waitForTimeout(1500);
  await expect(page.locator("svg.board path.beyond")).toHaveCount(0);
  expect(await wheelOut(page, 6)).toBeCloseTo(fitted.width, 0);
  expect(errors).toEqual([]);
});

test("with its setting on, a finished board shows the tiling past it and zooms out", async ({
  page,
}) => {
  const errors = watchErrors(page);
  await page.goto("/?settings");
  const toggle = page.locator('[data-setting="tiling-past-board"]');
  await expect(toggle).toHaveAttribute("aria-checked", "false");
  await toggle.click();
  await expect(toggle).toHaveAttribute("aria-checked", "true");
  // kept: a fresh page reads it back on
  await page.reload();
  await expect(page.locator('[data-setting="tiling-past-board"]')).toHaveAttribute(
    "aria-checked",
    "true",
  );
  await page.goto("/?level=squares");
  // An unfinished board does not zoom out past the fit, setting or not.
  const fitted = (await page.locator("svg.board path.region").boundingBox())!;
  expect(await wheelOut(page, 6)).toBeCloseTo(fitted.width, 0);
  await finishSquares(page);
  await page.locator("#exit").click();
  // The finished board's tiling, carried on past its edge as outlines
  // (src/extension.ts, worked out in a worker), and with it zoom out past the
  // fit — to a third of it, and no further.
  await expect(page.locator("svg.board path.beyond")).toHaveCount(1);
  expect((await page.locator("svg.board path.beyond").getAttribute("d"))!.length).toBeGreaterThan(
    1000,
  );
  const out = await wheelOut(page, 12);
  expect(out).toBeLessThan(fitted.width * 0.4);
  expect(out).toBeGreaterThan(fitted.width / 3 - 1);
  // Taking a tile off un-finishes it: the outlines go, and the board is fitted
  // again.
  await page.keyboard.press("x"); // ✕ remove mode
  await page.locator("svg.board [data-tile]").first().click();
  await expect(page.locator("svg.board path.beyond")).toHaveCount(0);
  const back = (await page.locator("svg.board path.region").boundingBox())!;
  expect(back.width).toBeCloseTo(fitted.width, 0);
  expect(errors).toEqual([]);
});

test("the hint shows a tile to lay, goes with the next move, and costs the third star", async ({
  page,
}) => {
  const errors = watchErrors(page);
  await page.goto("/?level=squares");
  await page.locator("#hint").click();
  // worked out in the background (hint.worker.ts): drawn where it lands, its
  // tray tile ringed
  const ghost = page.locator('svg.board [data-hint="place"]');
  await expect(ghost).toHaveCount(1);
  await expect(page.locator("svg.board .tray.hinted")).toHaveCount(1);
  await expect(page.locator("#hint")).not.toHaveClass(/thinking/);
  // asking again while that hint is on show is not another hint
  await page.keyboard.press("h");
  await expect(ghost).toHaveCount(1);

  // laying a tile where the hint says puts it away
  const tray = page.locator("svg.board .tile.in-tray").first();
  const t = (await tray.boundingBox())!;
  const g = (await ghost.boundingBox())!;
  await page.mouse.move(t.x + t.width / 2, t.y + t.height / 2);
  await page.mouse.down();
  await page.mouse.move(g.x + g.width / 2, g.y + g.height / 2, { steps: 6 });
  await page.mouse.up();
  await expect(page.locator("svg.board [data-tile]")).toHaveCount(1);
  await expect(ghost).toHaveCount(0);

  // the H key asks again; following the hint to the end finishes the
  // board — with two stars, not three, and the win card counts the hints:
  // one for each of the 16 tiles
  for (let laid = 1; laid < 16; laid++) {
    await page.keyboard.press("h");
    await expect(ghost).toHaveCount(1);
    const at = (await tray.boundingBox())!;
    const to = (await ghost.boundingBox())!;
    await page.mouse.move(at.x + at.width / 2, at.y + at.height / 2);
    await page.mouse.down();
    await page.mouse.move(to.x + to.width / 2, to.y + to.height / 2, { steps: 4 });
    await page.mouse.up();
    await expect(page.locator("svg.board [data-tile]")).toHaveCount(laid + 1);
  }
  await expect(page.locator("#won")).toBeVisible();
  await expect(page.locator("#won-stars")).toHaveText("★★☆");
  await expect(page.locator("#won-detail")).toContainText("16 hints used.");
  await expect(page.locator("#won-detail")).toContainText(/Time: \d+:\d\d/);
  await expect(page.locator("#hint")).toBeDisabled();
  expect(errors).toEqual([]);
});

/** The x scale of a group's transform: pixels per board unit. */
async function scaleOf(page: Page, selector: string): Promise<number> {
  const transform = (await page.locator(selector).getAttribute("transform")) ?? "";
  return Number(/matrix\(([^,]+),/.exec(transform)?.[1]);
}

test("tray tiles are the size they land at, zoomed in or not", async ({ page }) => {
  await page.goto("/?level=cairo");
  expect(await scaleOf(page, "svg.board g.tray-layer")).toBeCloseTo(
    await scaleOf(page, "svg.board g.world"),
    6,
  );
  const r = (await page.locator("svg.board path.region").boundingBox())!;
  await page.mouse.move(r.x + r.width / 2, r.y + r.height / 3);
  await page.mouse.wheel(0, -200);
  expect(await scaleOf(page, "svg.board g.world")).toBeGreaterThan(0);
  expect(await scaleOf(page, "svg.board g.tray-layer")).toBeCloseTo(
    await scaleOf(page, "svg.board g.world"),
    6,
  );
});

test("Tilings' families are named as Hypersweeper names them", async ({ page }) => {
  await page.setViewportSize(PHONE);
  await page.goto("/?tilings");
  await expect(page.locator(".family h2")).toHaveText([
    "Regular",
    "Uniform",
    "2-uniform",
    "Laves",
    "2-isohedral",
    "Pentagonal",
    "Isogonal",
    "Congruent rectangles",
    "Rep-tiles",
    "Spirals",
    "Aperiodic",
  ]);
});

test("marked boards: colours as half discs, lines edge to edge, Penrose's arrows as arcs", async ({
  page,
}) => {
  const errors = watchErrors(page);
  // the hexagons in two colours, a third of them blue: two tiles, half
  // discs where the colours meet, and no line — a coloured board never
  // draws one
  await page.goto("/?level=hexagons.2oneinthree2");
  await expect(page.locator("svg.board .tile.in-tray")).toHaveCount(2);
  await expect(page.locator("svg.board .tray-layer .decor.band")).toHaveCount(2);
  await expect(page.locator("svg.board .tray-layer .decor.line")).toHaveCount(0);

  // a lined board's lines are its rule; its first square goes into the
  // corner either way round (the rim takes any)
  await page.goto("/?level=squares.lines");
  await expect(page.locator("svg.board .tray-layer .decor.line")).toHaveCount(1);
  const tray = page.locator("svg.board .tile.in-tray").first();
  const t = (await tray.boundingBox())!;
  const r = (await page.locator("svg.board path.region").boundingBox())!;
  await page.mouse.move(t.x + t.width / 2, t.y + t.height / 2);
  await page.mouse.down();
  await page.mouse.move(r.x + t.width / 2, r.y + r.height - t.height / 2, { steps: 12 });
  await page.mouse.up();
  await expect(page.locator("svg.board [data-tile]")).toHaveCount(1);
  await expect(page.locator("svg.board .world .decor.line")).toHaveCount(1);

  // the other uniform tilings: one tray tile per colour and shape — 3.6.3.6
  // in three colours by shape, its hexagons one colour and its triangles
  // the two others — and 4.6.12's lines, one tray tile per shape
  await page.goto("/?level=trihex.3byshape");
  await expect(page.locator("svg.board .tile.in-tray")).toHaveCount(3);
  await expect(page.locator("svg.board .tray-layer .decor.band")).not.toHaveCount(0);
  await expect(page.locator("svg.board .tray-layer .decor.line")).toHaveCount(0);
  await page.goto("/?level=trunctrihex.lines");
  await expect(page.locator("svg.board .tile.in-tray")).toHaveCount(3);
  await expect(page.locator("svg.board .tray-layer .decor.line")).not.toHaveCount(0);

  // Penrose's rhombi and his kites and darts with their arrows: two arcs
  // on each tile, one of each kind
  for (const key of ["penrose.rules", "kitedart.rules"]) {
    await page.goto(`/?level=${key}`);
    await expect(page.locator("svg.board .tile.in-tray")).toHaveCount(2);
    await expect(page.locator("svg.board .tray-layer .decor.arc.double")).toHaveCount(2);
    await expect(page.locator("svg.board .tray-layer .decor.arc:not(.double)")).toHaveCount(2);
  }

  // an aperiodic tiling's rule read off its patch: Ammann–Beenker's arrows,
  // a point on every edge of its rhombus and its square, joined by a line —
  // and its colouring, no two tiles of a colour touching: more tray tiles
  // than shapes
  await page.goto("/?level=ammannbeenker.rules");
  await expect(page.locator("svg.board .tile.in-tray")).toHaveCount(2);
  await expect(page.locator("svg.board .tray-layer .decor.label-line")).toHaveCount(2);
  await expect(page.locator("svg.board .tray-layer .decor.label")).toHaveCount(0);
  // a spiral's: the pentagons' lines, and a half disc for the class with one
  // point on the tile
  await page.goto("/?level=pentaspiral7.rules");
  await expect(page.locator("svg.board .tile.in-tray")).toHaveCount(1);
  await expect(page.locator("svg.board .tray-layer .decor.label-line")).toHaveCount(2);
  await expect(page.locator("svg.board .tray-layer .decor.label")).toHaveCount(1);
  await page.goto("/?level=ammannbeenker.3apart");
  await expect(page.locator("svg.board .tile.in-tray")).toHaveCount(5);
  await expect(page.locator("svg.board .tray-layer .decor.band")).not.toHaveCount(0);
  // a rep-tile's, read off its own board: the sphinx's two classes as
  // lines; a tile of several pieces, the right-angled fish, keeps half discs;
  // and the trapezoid's colouring, its rim edges facing colours past the board
  await page.goto("/?level=sphinx.rules");
  await expect(page.locator("svg.board .tile.in-tray")).toHaveCount(1);
  await expect(page.locator("svg.board .tray-layer .decor.label-line")).toHaveCount(2);
  await page.goto("/?level=fish.rules");
  await expect(page.locator("svg.board .tray-layer .decor.label-line")).toHaveCount(0);
  await expect(page.locator("svg.board .tray-layer .decor.label")).not.toHaveCount(0);
  await page.goto("/?level=trapezoid.3apart");
  await expect(page.locator("svg.board .tile.in-tray")).toHaveCount(4);
  await expect(page.locator("svg.board .tray-layer .decor.band")).not.toHaveCount(0);

  // no setting for lines any more
  await page.goto("/?settings");
  await expect(page.locator('[data-action="toggle-lines"]')).toHaveCount(0);
  expect(errors).toEqual([]);
});

test("a tiling's page: its boards on top, its tiles under them, then Play", async ({ page }) => {
  await page.setViewportSize(PHONE);
  const errors = watchErrors(page);
  // Tilings has no section of its own for matching rules and colourings:
  // the hexagons' card opens a page of the tiling's boards and its tiles
  await page.goto("/?tilings");
  await expect(page.locator("#catalog .family h2", { hasText: "Colourings" })).toHaveCount(0);
  const hexagons = page
    .locator("#catalog .card")
    .filter({ has: page.locator(".card-name", { hasText: /^6³$/ }) });
  await expect(hexagons.locator(".card-sets")).toHaveText(/^\d+ tile sets$/);
  await hexagons.click();
  await expect(page).toHaveURL(/\?tiling=hexagons&pick=hexagons$/);
  await expect(page.locator("#tiling .hud-title")).toHaveText("6³");
  await expect(page.locator("#tiling-list .family h2")).toHaveText(["Boards", "Tiles"]);
  // one board; plain tiles first and picked, then its rules and colourings,
  // each card its tray drawn big — no outline
  await expect(page.locator("#tiling-list .board-card")).toHaveCount(1);
  const markings = page.locator("#tiling-list .marking-card");
  await expect(markings.first()).toHaveAttribute("data-marking", "hexagons");
  await expect(markings.first()).toHaveAttribute("aria-pressed", "true");
  await expect(markings.locator(".level-outline")).toHaveCount(0);
  await expect(markings.first().locator(".tray-icon")).toBeVisible();
  await page.locator('#tiling-list [data-marking="hexagons.3apart"]').click();
  await expect(page.locator('#tiling-list [data-marking="hexagons.3apart"]')).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await expect(page.locator("#tiling-list .play-what")).toHaveText("3 colours, apart");
  await page.locator("#tiling-list .play").click();
  await expect(page).toHaveURL(/\?level=hexagons\.3apart$/);
  await page.goBack();
  await expect(page.locator("#tiling")).toBeVisible();
  await expect(page.locator('#tiling-list [data-marking="hexagons.3apart"]')).toHaveAttribute(
    "aria-pressed",
    "true",
  );

  // a board by a marking: the running bond's second board, lined
  await page.goto("/?tilings");
  await page
    .locator("#catalog .card")
    .filter({ has: page.locator(".card-name", { hasText: /^Running bond$/ }) })
    .click();
  await expect(page).toHaveURL(/\?tiling=runningbond&pick=runningbond(-\d)?$/);
  await expect(page.locator("#tiling-list .board-card")).toHaveCount(3);
  await page.locator('#tiling-list [data-board="runningbond-2"]').click();
  await page.locator('#tiling-list [data-marking="runningbond.lines"]').click();
  await expect(page.locator("#tiling-list .play-what")).toHaveText("board 2 · lines");
  await page.locator("#tiling-list .play").click();
  await expect(page).toHaveURL(/\?level=runningbond\.lines-2$/);
  await expect(page.locator("#board-of")).toHaveText("board 2/3");

  // a marking not laid on the picked board is greyed out, and picking it
  // picks a board it is: Ammann–Beenker's colouring is on its first only
  await page.goto("/?tiling=ammannbeenker&pick=ammannbeenker-2");
  const coloured = page.locator('#tiling-list [data-marking="ammannbeenker.3apart"]');
  await expect(coloured).toHaveClass(/\boff\b/);
  await coloured.click();
  await expect(coloured).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator('#tiling-list [data-board="ammannbeenker"]')).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await expect(page.locator('#tiling-list [data-board="ammannbeenker-2"]')).toHaveClass(/\boff\b/);
  // …and a board it is not laid on picks the plain tiles with it
  await page.locator('#tiling-list [data-board="ammannbeenker-2"]').click();
  await expect(page.locator('#tiling-list [data-marking="ammannbeenker"]')).toHaveAttribute(
    "aria-pressed",
    "true",
  );

  // a tiling of one level opens it straight away: the P-pentomino, one board
  // and no marks a level can have
  await page.goto("/?tilings");
  await page
    .locator("#catalog .card")
    .filter({ has: page.locator(".card-name", { hasText: /^P-pentomino$/ }) })
    .click();
  await expect(page).toHaveURL(/\?level=ppentomino$/);
  expect(errors).toEqual([]);
});

test("the Spectre's edges are round, Tile(1,1)'s straight", async ({ page }) => {
  await page.goto("/?level=spectre");
  // a round edge is a cubic arc in the path; a straight one a line
  await expect(page.locator("svg.board .tile.in-tray").first()).toHaveAttribute("d", /C/);
  await expect(page.locator("svg.board path.region")).toHaveAttribute("d", /C/);
  await page.goto("/?level=tile11");
  await expect(page.locator("svg.board .tile.in-tray").first()).not.toHaveAttribute("d", /C/);
  await expect(page.locator("svg.board path.region")).not.toHaveAttribute("d", /C/);
});

test("the hat and the turtle flip and turn by 60°, the hat's metatiles only turn", async ({
  page,
}) => {
  const errors = watchErrors(page);
  for (const [key, kinds, flips] of [
    ["hat", 1, true],
    ["turtle", 1, true],
    ["hatmetatiles", 4, false],
  ] as const) {
    await page.goto(`/?level=${key}`);
    await expect(page.locator("svg.board .tile.in-tray")).toHaveCount(kinds);
    await expect(page.locator('[data-turn="1"] title')).toHaveText(/60° anticlockwise/);
    await expect(page.locator("[data-flip]")).toHaveCount(flips ? 1 : 0);
  }
  // a flip mirrors the tray's hat
  await page.goto("/?level=hat");
  const tile = page.locator("svg.board .tile.in-tray").first();
  const start = await tile.getAttribute("d");
  await page.locator("[data-flip]").click();
  await expect(tile).not.toHaveAttribute("d", start!);
  expect(errors).toEqual([]);
});

test("a tile of several pieces moves as one: the kissing squares", async ({ page }) => {
  const errors = watchErrors(page);
  await page.goto("/?level=kissingsquares");
  // one path, a closed sub-path per piece
  const tray = page.locator("svg.board .tile.in-tray").first();
  await expect(tray).toHaveAttribute("d", /^M[^M]*Z\s*M[^M]*Z$/);
  await expect(tray).toHaveClass(/pieces/);
  // dropped by the board's bottom-left corner, both squares land
  const t = (await tray.boundingBox())!;
  const r = (await page.locator("svg.board path.region").boundingBox())!;
  await page.mouse.move(t.x + t.width / 2, t.y + t.height / 2);
  await page.mouse.down();
  await page.mouse.move(r.x + t.width / 2, r.y + r.height - t.height / 2, { steps: 12 });
  await page.mouse.up();
  const placed = page.locator("svg.board [data-tile]");
  await expect(placed).toHaveCount(1);
  await expect(placed).toHaveAttribute("d", /^M[^M]*Z\s*M[^M]*Z$/);
  expect(errors).toEqual([]);
});
