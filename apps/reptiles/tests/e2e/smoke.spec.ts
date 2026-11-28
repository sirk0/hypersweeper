import { expect, test, type Locator, type Page } from "@playwright/test";
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

test("a pick from home deals a level, and Tilings lists the five groups, each a grid", async ({
  page,
}) => {
  await page.setViewportSize(PHONE);
  const errors = watchErrors(page);
  await page.goto("/");
  await page.locator("#home-picks button").first().click();
  await expect(page.locator("#game")).toBeVisible();
  await expect(page.locator("svg.board path.region")).toHaveCount(1);
  await expect(page.locator("svg.board .in-tray").first()).toBeVisible();

  // on a phone, Tilings is the five groups, a card each with its tray drawn
  await page.goto("/?tilings");
  await expect(page.locator("#catalog")).toBeVisible();
  await expect(page.locator("#catalog .hud-title")).toHaveText("Tilings");
  await expect(page.locator("#catalog-list .group-card .group-name")).toHaveText([
    "Regular polygons",
    "Star polygons",
    "Irregular tiles",
    "Offset corners",
    "Non-periodic",
  ]);
  await expect(page.locator("#catalog-list .group-card .group-meta").first()).toHaveText(
    /^\d+ tilings · ★ \d+\/\d+$/,
  );
  await expect(page.locator('[data-group="regular"] .group-icon svg.tray-icon')).toBeVisible();
  await expect(page.locator("#catalog-list .card")).toHaveCount(0);
  // a group's card opens its page: its families, each a grid that wraps —
  // the page scrolls one way only
  await page.locator('[data-group="regular"]').click();
  await expect(page).toHaveURL(/\?group=regular$/);
  await expect(page.locator("#catalog .hud-title")).toHaveText("Regular polygons");
  const rows = page.locator("#catalog-list .family-row");
  await expect(rows.first()).toBeVisible();
  expect(
    await rows.evaluateAll((all) => all.filter((r) => r.scrollWidth > r.clientWidth).length),
  ).toBe(0);
  // each card draws its tiles inside its board's outline, in one picture
  await expect(page.locator("#catalog .card-art svg.card-picture").first()).toBeVisible();
  await expect(page.locator('#catalog [data-tiling="trihex"] .card-picture path.tile')).toHaveCount(
    2,
  );
  // Back goes back to the groups
  await page.locator("#catalog [data-go-back]").click();
  await expect(page).toHaveURL(/\?tilings$/);
  await expect(page.locator("#catalog-list .group-card")).toHaveCount(5);
  // the old name's links still open it, and so do the Figures screen's
  for (const old of ["/?catalog", "/?figures", "/?figure=squares"]) {
    await page.goto(old);
    await expect(page.locator("#catalog")).toBeVisible();
    await expect(page.locator("#catalog-list .group-card")).toHaveCount(5);
  }
  expect(errors).toEqual([]);
});

test("a jigsaw board: one colour, knobs on the edges and the rim, the rim picks the corner tile", async ({
  page,
}) => {
  const errors = watchErrors(page);
  // the squares' checkerboard as a jigsaw: a tile of knobs and a tile of
  // sockets, in the squares' own colour, and the rim cut as its tiles are
  const landed: number[] = [];
  for (const which of [0, 1]) {
    await page.goto("/?level=squares.2apart.jigsaw");
    const trayTiles = page.locator("svg.board .tile.in-tray");
    await expect(trayTiles).toHaveCount(2);
    await expect(page.locator("svg.board .tile.in-tray.paint")).toHaveCount(0);
    await expect(page.locator("svg.board .tray-layer .decor")).toHaveCount(0);
    expect(await trayTiles.nth(which).getAttribute("d")).toContain("C");
    expect(await page.locator("svg.board path.region").getAttribute("d")).toContain("C");
    // each tray tile dropped into the bottom-left corner: only the one whose
    // edges fit the rim there lands there — the other snaps to a corner it
    // does fit, or nowhere
    const t = (await trayTiles.nth(which).boundingBox())!;
    const r = (await page.locator("svg.board path.region").boundingBox())!;
    const side = Math.min(t.width, t.height) * 0.75;
    const drop = {
      x: r.x + side / 2 + r.width * 0.03,
      y: r.y + r.height - side / 2 - r.height * 0.03,
    };
    await page.mouse.move(t.x + t.width / 2, t.y + t.height / 2);
    await page.mouse.down();
    await page.mouse.move(drop.x, drop.y, { steps: 12 });
    await page.mouse.up();
    const placed = page.locator("svg.board [data-tile]");
    const box = (await placed.count()) ? await placed.first().boundingBox() : null;
    const there =
      box !== null &&
      Math.hypot(box.x + box.width / 2 - drop.x, box.y + box.height / 2 - drop.y) < side / 2;
    landed.push(there ? 1 : 0);
    // the board in play is kept: start the next try afresh
    await page.locator("#restart").click();
    await expect(placed).toHaveCount(0);
  }
  expect(landed.sort(), JSON.stringify(landed)).toEqual([0, 1]);
  expect(errors).toEqual([]);
});

test("a vertex rule: its card on the tiling page is the configuration, drawn beside the name too", async ({
  page,
}) => {
  const errors = watchErrors(page);
  await page.goto("/?tiling=rhombitrihex");
  // last of the tiling's markings: the vertex figure, not a tray
  const card = page.locator('.marking-card[data-marking="rhombitrihex.vertex"]');
  await expect(card).toHaveCount(1);
  await expect(page.locator(".marking-card").last()).toHaveAttribute(
    "data-marking",
    "rhombitrihex.vertex",
  );
  await expect(card.locator("svg.vertex-figure")).toBeVisible();
  // 3.4.6.4: a triangle, two squares and a hexagon round the point
  await expect(card.locator("svg.vertex-figure path.tile")).toHaveCount(4);
  await expect(card).toHaveAttribute("title", "Vertex rule: every point is 3.4.6.4");
  await card.click();
  await page.locator(".pick-play .play").click();
  await expect(page).toHaveURL(/level=rhombitrihex\.vertex/);
  await expect(page.locator("#level")).toHaveText("3.4.6.4 · every point");
  await expect(page.locator("#level-rule svg.vertex-figure")).toBeVisible();
  // a plain board has no sign
  await page.goto("/?level=rhombitrihex");
  await expect(page.locator("#level-rule")).toBeHidden();
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

test("More games links to the shared site: under Tilings on a phone, in the sidebar on a desktop", async ({
  page,
}) => {
  // The shared site's own address, as the shared Vite preset reads it.
  const site = JSON.parse(
    readFileSync(new URL("../../../../site/site.json", import.meta.url), "utf8"),
  ).url as string;
  const games = page.locator('[data-action="more-games"]:visible');
  await page.setViewportSize(PHONE);
  await page.goto("/");
  await expect(games).toHaveCount(1);
  await expect(games).toHaveAttribute("href", site);
  await expect(games).toHaveAttribute("target", "_blank");
  // under the Tilings row, on the home screen
  const tilings = await page.locator(".catalog-pick").boundingBox();
  expect((await games.boundingBox())!.y).toBeGreaterThan(tilings!.y + tilings!.height);

  await page.setViewportSize({ width: 1280, height: 720 });
  await expect(games).toHaveCount(1);
  await expect(page.locator('.side-footer [data-action="more-games"]')).toBeVisible();
  await expect(games).toHaveAttribute("href", site);
  // no App Store page yet, so nothing tells Safari of one
  await expect(page.locator('meta[name="apple-itunes-app"]')).toHaveCount(0);
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
  // home, back, the hint, restart and the die — no undo or redo, and no
  // clock: the time taken shows only once the board is finished
  await expect(page.locator("#game .hud .hud-btn:visible")).toHaveCount(5);
  await expect(page.locator("#undo, #redo, #clock")).toHaveCount(0);
  await expect(page.locator("#game nav, #levels")).toHaveCount(0);
  await expect(page.locator("#level")).toHaveText(/V3²\.4\.3\.4/);
  // its difficulty before its name: hard, three bars of three
  const band = page.locator("#level-band");
  await expect(band).toBeVisible();
  await expect(band).toHaveAttribute("aria-label", "hard");
  await expect(band.locator(".bar.on")).toHaveCount(3);
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

// What a turn's animation runs on: the tray tiles' groups, the control
// pressed, its arrow and its face (`SvgBoard.animateTurn`).
const turnAnimations = (page: Page): Promise<string[]> =>
  page.evaluate(() =>
    document
      .getAnimations()
      .filter((a) => a.playState === "running")
      .map((a) => {
        const target = (a.effect as KeyframeEffect | null)?.target as Element | null;
        return target?.getAttribute("class") ?? "";
      }),
  );

test("a turn swings the tray tiles round, and the control pressed pops", async ({ page }) => {
  await page.goto("/?level=tile11");
  await expect(page.locator("svg.board .tile.in-tray")).toBeVisible();
  expect(await turnAnimations(page)).toEqual([]);
  await page.locator('[data-turn="-1"]').click();
  const running = await turnAnimations(page);
  expect(running).toContain("tray-spin");
  expect(running.some((c) => c.includes("knob-rotate-cw"))).toBe(true);
  expect(running).toContain("knob-arc");
  expect(running.some((c) => c.includes("knob-face pressed"))).toBe(true);
  // the R key turns them the same way
  await expect.poll(() => turnAnimations(page)).toEqual([]);
  await page.keyboard.press("r");
  expect(await turnAnimations(page)).toContain("tray-spin");
  // and it settles: each tile ends exactly where the turn put it
  await expect.poll(() => turnAnimations(page)).toEqual([]);
  expect(
    await page
      .locator("svg.board .tray-spin")
      .evaluateAll((gs) => gs.map((g) => getComputedStyle(g).transform)),
  ).toEqual(["none"]);
});

test.describe("asking for reduced motion", () => {
  test.use({ reducedMotion: "reduce" });

  test("a turn moves nothing but the tiles' new way round", async ({ page }) => {
    await page.goto("/?level=tile11");
    const tile = page.locator("svg.board .tile.in-tray");
    const start = await tile.getAttribute("d");
    await page.locator('[data-turn="1"]').click();
    expect(await tile.getAttribute("d")).not.toEqual(start);
    expect(await turnAnimations(page)).toEqual([]);
  });
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

test("the win panel, in the tray card: three stars, the time, no ✕", async ({ page }) => {
  const errors = watchErrors(page);
  await page.goto("/?level=squares");
  await finishSquares(page);
  // no hint, every pile at 0: three stars, each with its word
  await expect(page.locator("#won-stars")).toHaveAttribute("aria-label", "3 of 3 stars");
  await expect(page.locator("#won-stars li")).toHaveText(["★Covered", "★No hints", "★Piles at 0"]);
  await expect(page.locator("#won-time")).toHaveText(/^\d+:\d\d$/);
  // nothing closes it — it covers nothing: no ✕, and Escape leaves it
  await expect(page.locator("#won button")).toHaveText(["Play again", "Next level"]);
  await page.keyboard.press("Escape");
  await expect(page.locator("#won")).toBeVisible();
  // the label behind the board says it is finished, with its stars
  await expect(page.locator("#count")).toHaveText("Tiled ★★★");
  // The tiling past the board is a setting, off by default: no outlines, and
  // the board stays fitted.
  const fitted = (await page.locator("svg.board path.region").boundingBox())!;
  await page.waitForTimeout(1500);
  await expect(page.locator(".board-backdrop path.beyond")).toHaveCount(0);
  expect(await wheelOut(page, 6)).toBeCloseTo(fitted.width, 0);
  expect(errors).toEqual([]);
});

test("a finished board is locked, its win panel staying, until a restart", async ({ page }) => {
  const errors = watchErrors(page);
  await page.goto("/?level=squares");
  await finishSquares(page);
  await expect(page.locator("svg.board")).toHaveClass(/finished/);
  // the panel has the card: the tray's tiles and controls are gone from it
  await expect(page.locator("svg.board .tile.in-tray")).toBeHidden();
  await expect(page.locator("svg.board .tray-controls")).toBeHidden();
  const tiles = page.locator("svg.board [data-tile]");
  const first = tiles.first();
  const at = (await first.boundingBox())!;
  // a placed tile dragged a little and let go: nothing moves
  await page.mouse.move(at.x + at.width / 2, at.y + at.height / 2);
  await page.mouse.down();
  await page.mouse.move(at.x + at.width, at.y + at.height / 2, { steps: 6 });
  await page.mouse.up();
  await page.waitForTimeout(300);
  await expect(tiles).toHaveCount(16);
  expect(await first.boundingBox()).toEqual(at);
  // …nor dragged off over the tray, nor taken off in ✕ mode
  // (to the card's corner, clear of the panel's buttons)
  const t = (await page.locator("svg.board .tray-zone").boundingBox())!;
  await page.mouse.move(at.x + at.width / 2, at.y + at.height / 2);
  await page.mouse.down();
  await page.mouse.move(t.x + 6, t.y + 6, { steps: 6 });
  await page.mouse.up();
  await page.keyboard.press("x");
  await expect(page.locator("svg.board")).not.toHaveClass(/removing/);
  await first.click();
  await expect(tiles).toHaveCount(16);
  await expect(page.locator("#won")).toBeVisible();
  await expect(page.locator("#count")).toHaveText("Tiled ★★★");
  // Z is no undo: the board stays finished
  await page.keyboard.press("Control+z");
  await page.keyboard.press("z");
  await expect(tiles).toHaveCount(16);
  await expect(page.locator("svg.board")).toHaveClass(/finished/);
  // a restart clears and unlocks it, the tray back in its card; finished
  // again, the panel is back
  await page.locator("#restart").click();
  await expect(tiles).toHaveCount(0);
  await expect(page.locator("svg.board")).not.toHaveClass(/finished/);
  await expect(page.locator("#won")).toBeHidden();
  await expect(page.locator("svg.board .tile.in-tray")).toBeVisible();
  await expect(page.locator("#count")).toHaveText("0%");
  await finishSquares(page);
  await expect(page.locator("#won")).toBeVisible();
  expect(errors).toEqual([]);
});

/** An element's box on screen, rounded to the pixel. */
async function boxOf(page: Page, selector: string): Promise<[number, number, number, number]> {
  const b = (await page.locator(selector).boundingBox())!;
  return [Math.round(b.x), Math.round(b.y), Math.round(b.width), Math.round(b.height)];
}

test("a finish moves nothing: the tray card was sized for the win panel from the start", async ({
  page,
}) => {
  const errors = watchErrors(page);
  // upright on a small phone, sideways, and a desktop
  for (const size of [
    { width: 375, height: 667 },
    { width: 844, height: 390 },
    { width: 1280, height: 800 },
  ]) {
    await page.setViewportSize(size);
    await page.goto("/?level=squares");
    const region = await boxOf(page, "svg.board path.region");
    const card = await boxOf(page, "svg.board .tray-zone");
    await finishSquares(page);
    await page.waitForTimeout(200);
    // the board and the card stay just as they were
    expect(await boxOf(page, "svg.board path.region")).toEqual(region);
    expect(await boxOf(page, "svg.board .tray-zone")).toEqual(card);
    // and the panel lies inside the card, clear of the board
    const [px, py, pw, ph] = await boxOf(page, "#won .won-card");
    const [cx, cy, cw, ch] = card;
    expect(px).toBeGreaterThanOrEqual(cx);
    expect(py).toBeGreaterThanOrEqual(cy);
    expect(px + pw).toBeLessThanOrEqual(cx + cw);
    expect(py + ph).toBeLessThanOrEqual(cy + ch);
    const [rx, ry, rw, rh] = region;
    expect(px >= rx + rw || py >= ry + rh).toBe(true);
    // its buttons work: Play again is a fresh board, the tray back
    await page.locator("#again").click();
    await expect(page.locator("#won")).toBeHidden();
    await expect(page.locator("svg.board [data-tile]")).toHaveCount(0);
    expect(await boxOf(page, "svg.board .tray-zone")).toEqual(card);
  }
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
  // The finished board's tiling, carried on past its edge as outlines
  // (src/extension.ts, worked out in a worker), and with it zoom out past the
  // fit — to a third of it, and no further.
  await expect(page.locator(".board-backdrop path.beyond")).toHaveCount(1);
  expect(
    (await page.locator(".board-backdrop path.beyond").getAttribute("d"))!.length,
  ).toBeGreaterThan(1000);
  // …out to every edge of the screen, past the header and the tray too — not
  // only the board's own room under the header.
  const reach = await page.evaluate(() => {
    const r = document.querySelector(".board-backdrop path.beyond")!.getBoundingClientRect();
    return {
      top: r.top,
      left: r.left,
      bottom: r.bottom,
      right: r.right,
      w: innerWidth,
      h: innerHeight,
    };
  });
  expect(reach.top).toBeLessThanOrEqual(0);
  expect(reach.left).toBeLessThanOrEqual(0);
  expect(reach.bottom).toBeGreaterThanOrEqual(reach.h);
  expect(reach.right).toBeGreaterThanOrEqual(reach.w);
  const out = await wheelOut(page, 12);
  expect(out).toBeLessThan(fitted.width * 0.4);
  expect(out).toBeGreaterThan(fitted.width / 3 - 1);
  // A restart un-finishes it (the finished board is locked, nothing taken off
  // by hand): the outlines go, and the board is fitted again.
  await page.locator("#restart").click();
  await expect(page.locator(".board-backdrop path.beyond")).toHaveCount(0);
  const back = (await page.locator("svg.board path.region").boundingBox())!;
  expect(back.width).toBeCloseTo(fitted.width, 0);
  expect(errors).toEqual([]);
});

test("the hint shows a tile to lay, goes with the next move, and costs a star", async ({
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
  // board — with two stars, not three, and the win panel counts the hints:
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
  await expect(page.locator("#won-stars")).toHaveAttribute("aria-label", "2 of 3 stars");
  await expect(page.locator("#won-stars li.lost")).toHaveText("☆16 hints");
  await expect(page.locator("#won-stars li.lost")).toHaveAttribute("title", "16 hints used.");
  await expect(page.locator("#won-time")).toHaveText(/^\d+:\d\d/);
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

test("Tilings' families are named as Hypersweeper names them (and the stars and girih, which it has not)", async ({
  page,
}) => {
  await page.setViewportSize(PHONE);
  // each group's page, its families in order
  const families: [string, string[]][] = [
    ["regular", ["Regular", "Uniform", "2-uniform"]],
    ["star", ["Adjustable angle", "Fixed angle"]],
    ["irregular", ["Laves", "2-isohedral", "Pentagonal", "Girih"]],
    ["offset", ["Isogonal", "Congruent rectangles"]],
    ["nonperiodic", ["Rep-tiles", "Spirals", "Aperiodic"]],
  ];
  for (const [group, names] of families) {
    await page.goto(`/?group=${group}`);
    await expect(page.locator(".family h2")).toHaveText(names);
  }
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
  await page.goto("/?group=regular");
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
  await page.goto("/?group=offset");
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
  await page.goto("/?group=nonperiodic");
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

// -- sound ---------------------------------------------------------------------
// A synthesised sound leaves nothing in the DOM, so the init script counts the
// oscillators the page builds — nodes being *scheduled*, which needs no output
// device and no autoplay policy (as Hypersweeper's tests/e2e/sound.spec.ts).

declare global {
  interface Window {
    __oscillators?: number;
  }
}

async function countOscillators(page: Page): Promise<void> {
  await page.addInitScript(() => {
    window.__oscillators = 0;
    const Ctor =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return;
    const original = Ctor.prototype.createOscillator;
    Ctor.prototype.createOscillator = function (this: AudioContext) {
      window.__oscillators = (window.__oscillators ?? 0) + 1;
      return original.call(this);
    };
  });
}

const oscillators = (page: Page): Promise<number> => page.evaluate(() => window.__oscillators ?? 0);

/** Drop the tray square into the squares level's bottom-left corner. */
async function dropOneSquare(page: Page): Promise<void> {
  const t = (await page.locator("svg.board .tile.in-tray").first().boundingBox())!;
  const r = (await page.locator("svg.board path.region").boundingBox())!;
  await page.mouse.move(t.x + t.width / 2, t.y + t.height / 2);
  await page.mouse.down();
  await page.mouse.move(r.x + t.width / 2, r.y + r.height - t.height / 2, { steps: 8 });
  await page.mouse.up();
  await expect(page.locator("svg.board [data-tile]")).toHaveCount(1);
}

test("a tile landing clicks, a turn beeps, and a finished board plays its flourish", async ({
  page,
}) => {
  await countOscillators(page);
  await page.goto("/?level=squares");
  await dropOneSquare(page);
  expect(await oscillators(page)).toBe(1);

  // the rest of the board, from empty (the one tile is kept: Restart): a
  // click a tile, then the flourish
  await page.goto("/?level=squares");
  await page.locator("#restart").click();
  await expect(page.locator("svg.board [data-tile]")).toHaveCount(0);
  const before = await oscillators(page);
  await finishSquares(page);
  expect((await oscillators(page)) - before).toBeGreaterThan(16);

  await page.goto("/?level=cairo");
  await page.locator('[data-turn="1"]').click();
  expect(await oscillators(page)).toBe(1);
  await page.keyboard.press("r");
  expect(await oscillators(page)).toBe(2);
});

test("Settings › Sound: Blocks by default, a theme plays when picked, Off silences and stays", async ({
  page,
}) => {
  await countOscillators(page);
  await page.goto("/?settings");
  const theme = (key: string) => page.locator(`[data-sound="${key}"][role="radio"]`);
  await expect(theme("blocks")).toHaveAttribute("aria-checked", "true");
  for (const key of ["chime", "arcade", "off"])
    await expect(theme(key)).toHaveAttribute("aria-checked", "false");
  await expect(page.locator('[data-setting="volume"]')).toBeVisible();

  // picking a theme plays its sample
  await theme("chime").click();
  await expect(theme("chime")).toHaveAttribute("aria-checked", "true");
  await expect(theme("blocks")).toHaveAttribute("aria-checked", "false");
  expect(await oscillators(page)).toBeGreaterThan(0);

  // Off: no volume to set, and it stays off
  await theme("off").click();
  await expect(page.locator('[data-setting="volume"]')).toBeHidden();
  await page.reload();
  await expect(theme("off")).toHaveAttribute("aria-checked", "true");

  await page.goto("/?level=squares");
  await dropOneSquare(page);
  await page.goto("/?level=cairo");
  await page.locator('[data-turn="1"]').click();
  expect(await oscillators(page)).toBe(0);
});

declare global {
  interface Window {
    __pans?: number[];
  }
}

test("a tile is heard from the side of the screen it lands on", async ({ page }) => {
  // A phone, where the board is centred: the pan is where the tile is across
  // the whole screen, so beside a desktop's tray the board sits left of it.
  await page.setViewportSize(PHONE);
  // Every stereo panner's opening position, in the order they are made.
  await page.addInitScript(() => {
    window.__pans = [];
    const Ctor = window.AudioContext;
    if (!Ctor) return;
    const original = Ctor.prototype.createStereoPanner;
    Ctor.prototype.createStereoPanner = function (this: AudioContext) {
      const node = original.call(this);
      const set = node.pan.setValueAtTime.bind(node.pan);
      node.pan.setValueAtTime = (value: number, time: number) => {
        window.__pans!.push(value);
        return set(value, time);
      };
      return node;
    };
  });
  const lastPan = (): Promise<number> => page.evaluate(() => window.__pans!.at(-1)!);
  const dropAt = async (corner: "left" | "right"): Promise<void> => {
    await page.goto("/?level=squares");
    // from empty: a tile laid before is kept
    await page.locator("#restart").click();
    const t = (await page.locator("svg.board .tile.in-tray").first().boundingBox())!;
    const r = (await page.locator("svg.board path.region").boundingBox())!;
    const x = corner === "left" ? r.x + t.width / 2 : r.x + r.width - t.width / 2;
    await page.mouse.move(t.x + t.width / 2, t.y + t.height / 2);
    await page.mouse.down();
    await page.mouse.move(x, r.y + r.height - t.height / 2, { steps: 8 });
    await page.mouse.up();
    await expect(page.locator("svg.board [data-tile]")).toHaveCount(1);
  };
  await dropAt("left");
  expect(await lastPan()).toBeLessThan(-0.4);
  await dropAt("right");
  expect(await lastPan()).toBeGreaterThan(0.4);
});

/** Drop the tray square on the squares level's cell in column `col` of the
 * bottom row. */
async function dropSquareAt(page: Page, col: number): Promise<void> {
  const t = (await page.locator("svg.board .tile.in-tray").first().boundingBox())!;
  const r = (await page.locator("svg.board path.region").boundingBox())!;
  await page.mouse.move(t.x + t.width / 2, t.y + t.height / 2);
  await page.mouse.down();
  await page.mouse.move(r.x + ((col + 0.5) * r.width) / 4, r.y + r.height - r.height / 8, {
    steps: 6,
  });
  await page.mouse.up();
}

test("Back goes one level up, however the screen was reached", async ({ page }) => {
  const errors = watchErrors(page);
  await page.setViewportSize(PHONE);
  // a level opened straight from a link: up to its tiling's page, it picked
  await page.goto("/?level=trihex-2");
  await page.locator("#back").click();
  await expect(page).toHaveURL(/\?tiling=trihex&pick=trihex-2$/);
  await expect(page.locator('.board-card[data-board="trihex-2"]')).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  // …then its group's page, Tilings' groups and home
  await page.locator("#tiling [data-go-back]").click();
  await expect(page).toHaveURL(/\?group=regular$/);
  await page.locator("#catalog [data-go-back]").click();
  await expect(page).toHaveURL(/\?tilings$/);
  await expect(page.locator("#catalog-list .group-card")).toHaveCount(5);
  await page.locator("#catalog [data-go-back]").click();
  await expect(page.locator("#home")).toBeVisible();
  // a level dealt from home goes up to its tiling's page too, not home
  await page.locator("#home .home-pick").first().click();
  await expect(page.locator("#game")).toBeVisible();
  await page.locator("#back").click();
  await expect(page.locator("#tiling")).toBeVisible();
  // a tiling of one level has no page: up from it is its group's
  await page.goto("/?level=ppentomino");
  await page.locator("#back").click();
  await expect(page).toHaveURL(/\?group=nonperiodic$/);
  expect(errors).toEqual([]);
});

test("a board left half-covered opens as it was, and Restart starts it afresh", async ({
  page,
}) => {
  const errors = watchErrors(page);
  await page.goto("/?level=squares");
  await dropSquareAt(page, 0);
  await dropSquareAt(page, 3);
  const tiles = page.locator("svg.board [data-tile]");
  await expect(tiles).toHaveCount(2);
  const coverage = await page.locator("#count").textContent();

  // a reload: the same tiles
  await page.reload();
  await expect(tiles).toHaveCount(2);
  await expect(page.locator("#count")).toHaveText(coverage ?? "");

  // its tiling's page offers to resume it, and does
  await page.goto("/?tiling=squares&pick=squares");
  await expect(page.locator(".pick-play .play")).toContainText("Resume");
  // …and washes its cards green: the board's and the plain tiles', not
  // another tile set's — nor the colour of a card at rest
  const board = page.locator('.board-card[data-board="squares"]');
  const plain = page.locator('.marking-card[data-marking="squares"]');
  const lined = page.locator('.marking-card[data-marking="squares.lines"]');
  await expect(board).toHaveClass(/\bin-play\b/);
  await expect(plain).toHaveClass(/\bin-play\b/);
  await expect(lined).not.toHaveClass(/\bin-play\b/);
  const bg = (el: Locator) => el.evaluate((e) => getComputedStyle(e).backgroundColor);
  expect(await bg(plain)).not.toBe(await bg(lined));
  // the tiling's card in Tilings too
  await page.goto("/?group=regular");
  const card = page.locator('#catalog-list .card[data-tiling="squares"]');
  await expect(card).toHaveClass(/\bin-play\b/);
  await expect(page.locator('#catalog-list .card[data-tiling="hexagons"]')).not.toHaveClass(
    /\bin-play\b/,
  );
  await page.goto("/?tiling=squares&pick=squares");
  await page.locator(".pick-play .play").click();
  await expect(tiles).toHaveCount(2);

  // Restart forgets it
  await page.locator("#restart").click();
  await expect(tiles).toHaveCount(0);
  await page.reload();
  await expect(page.locator("svg.board .tile.in-tray")).not.toHaveCount(0);
  await expect(tiles).toHaveCount(0);
  await page.goto("/?tiling=squares&pick=squares");
  await expect(page.locator(".pick-play .play")).toContainText("Play");
  await expect(page.locator(".pick-play .play")).not.toContainText("Resume");
  await expect(board).not.toHaveClass(/\bin-play\b/);
  await expect(plain).not.toHaveClass(/\bin-play\b/);
  await page.goto("/?group=regular");
  await expect(card).not.toHaveClass(/\bin-play\b/);
  expect(errors).toEqual([]);
});

test("a tiling's stars are its boards' and its tile sets' bests, the cards tinted by them", async ({
  page,
}) => {
  const errors = watchErrors(page);
  await page.addInitScript(() => {
    // three plain on board 1, two plain on board 2, one lined on board 1
    localStorage.setItem(
      "rep-tiles.stars",
      JSON.stringify({ trihex: 3, "trihex-2": 2, "trihex.lines": 1 }),
    );
  });
  await page.goto("/?tiling=trihex&pick=trihex");
  // a board's card: its best with any tiles; a tile set's: its best on any board
  await expect(page.locator('.board-card[data-board="trihex"]')).toHaveAttribute("data-stars", "3");
  await expect(page.locator('.board-card[data-board="trihex-2"]')).toHaveAttribute(
    "data-stars",
    "2",
  );
  await expect(page.locator('.board-card[data-board="trihex-2"] .star.done')).toHaveCount(2);
  await expect(page.locator('.marking-card[data-marking="trihex"]')).toHaveAttribute(
    "data-stars",
    "3",
  );
  await expect(page.locator('.marking-card[data-marking="trihex.lines"]')).toHaveAttribute(
    "data-stars",
    "1",
  );
  // tinted: a card with stars is not the colour of one without
  const bg = (sel: string) =>
    page
      .locator(sel)
      .first()
      .evaluate((el) => getComputedStyle(el).backgroundColor);
  const none = await bg('.marking-card[data-stars="0"]');
  const one = await bg('.marking-card[data-stars="1"]');
  expect(one).not.toBe(none);
  // the picked board with the picked tiles: its own stars — on a desktop
  // beside its picture, on a phone on Play
  await expect(page.locator(".pick-facts .star.done")).toHaveCount(3);
  await expect(page.locator(".pick-play .play .stars")).toHaveCount(0);
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.locator(".pick-play .play .star.done")).toHaveCount(3);

  // the tiling's card in Tilings: 3 + 2 (boards) + 3 + 1 (tile sets), of
  // three a board and three a tile set — not three a board by tile set
  await page.goto("/?group=regular");
  const card = page.locator('#catalog-list .card[data-tiling="trihex"]');
  const [, earned, max] = /★ (\d+)\/(\d+)/.exec(
    (await card.locator(".card-stars").textContent())!,
  )!;
  expect(Number(earned)).toBe(9);
  expect(Number(max) % 3).toBe(0);
  await expect(card).toHaveAttribute("data-stars", "1");
  expect(errors).toEqual([]);
});

test("a hint shown is kept with the board: leaving does not win back the no-hint star", async ({
  page,
}) => {
  await page.goto("/?level=squares");
  await page.locator("#hint").click();
  await expect(page.locator('svg.board [data-hint="place"]')).toHaveCount(1);
  await page.reload();
  await finishSquares(page);
  await expect(page.locator("#won-stars")).toHaveAttribute("aria-label", "2 of 3 stars");
  await expect(page.locator("#won-stars li.lost")).toHaveText("☆1 hint");
});

test("the best time: on the win panel, beaten or not, and on Play", async ({ page }) => {
  const errors = watchErrors(page);
  await page.goto("/?level=squares");
  await finishSquares(page);
  // a first finish is only its time
  await expect(page.locator("#won-time")).toHaveText(/^\d+:\d\d$/);
  const best = await page.evaluate(
    () => JSON.parse(localStorage.getItem("rep-tiles.times") ?? "{}") as Record<string, number>,
  );
  expect(best["squares"]).toBeGreaterThan(0);
  // a finished board is not kept: it opens afresh
  expect(await page.evaluate(() => localStorage.getItem("rep-tiles.boards"))).toBeNull();

  // a slower finish names the best; a faster one says so
  await page.evaluate((ms) => {
    localStorage.setItem("rep-tiles.times", JSON.stringify({ squares: ms }));
  }, 1);
  await page.reload();
  await finishSquares(page);
  await expect(page.locator("#won-time")).toHaveText(/^\d+:\d\d · best 0:00$/);
  await page.evaluate(() => {
    localStorage.setItem("rep-tiles.times", JSON.stringify({ squares: 3_600_000 }));
  });
  await page.reload();
  await finishSquares(page);
  await expect(page.locator("#won-time")).toHaveText(/^\d+:\d\d · new best!$/);

  await page.goto("/?tiling=squares&pick=squares");
  await expect(page.locator(".pick-play .play-best")).toHaveText(/^best \d+:\d\d$/);
  expect(errors).toEqual([]);
});

/** Drop the tray's first tile with its middle at a share of the region's box:
 * `fx` across from its left, `fy` down from its top. */
async function dropInRegion(page: Page, fx: number, fy: number): Promise<void> {
  // the board is drawn anew after a move or a Next: a box read mid-redraw is
  // null, so read each until it is there
  const boxOf = async (l: Locator) => {
    let box: Awaited<ReturnType<Locator["boundingBox"]>> = null;
    await expect.poll(async () => (box = await l.boundingBox()) !== null).toBe(true);
    return box!;
  };
  const t = await boxOf(page.locator("svg.board .tile.in-tray").first());
  const r = await boxOf(page.locator("svg.board path.region"));
  await page.mouse.move(t.x + t.width / 2, t.y + t.height / 2);
  await page.mouse.down();
  await page.mouse.move(r.x + fx * r.width, r.y + fy * r.height, { steps: 6 });
  await page.mouse.up();
}

test.describe("the first-run tutorial", () => {
  // a newcomer: nothing in storage, not even the tutorial seen
  test.use({ storageState: { cookies: [], origins: [] } });

  test("opens once in place of home, teaches its four boards, then deals a level", async ({
    page,
  }) => {
    await page.setViewportSize(PHONE);
    const errors = watchErrors(page);
    await page.goto("/");
    await expect(page).toHaveURL(/\?tutorial$/);
    const coach = page.locator("#coach");
    const next = page.locator("#coach-next");
    const tiles = page.locator("svg.board [data-tile]");
    await expect(coach).toBeVisible();
    await expect(page.locator("#coach-step")).toHaveText("1 of 4 · Drag");
    // no hint and no die in the tutorial
    await expect(page.locator("#hint")).toBeHidden();
    await expect(page.locator("#random")).toBeHidden();
    await expect(next).toBeHidden();

    // Drag: a 2×2 of squares, bottom row first
    for (const [fx, fy] of [
      [0.25, 0.75],
      [0.75, 0.75],
      [0.25, 0.25],
      [0.75, 0.25],
    ] as const)
      await dropInRegion(page, fx, fy);
    await expect(tiles).toHaveCount(4);
    await expect(next).toBeVisible();
    // finishing a step is no level finished: no win panel, nothing starred
    await expect(page.locator("#won")).toBeHidden();
    await next.click();

    // Turn: three triangles up as held, then two down, turned
    await expect(page.locator("#coach-step")).toHaveText("2 of 4 · Turn");
    await expect(page.locator("#coach-body kbd").first()).toHaveText("R");
    for (const fx of [1 / 6, 3 / 6, 5 / 6]) await dropInRegion(page, fx, 0.62);
    await expect(tiles).toHaveCount(3);
    await page.keyboard.press("r");
    for (const fx of [1 / 3, 2 / 3]) await dropInRegion(page, fx, 0.38);
    await expect(tiles).toHaveCount(5);
    await next.click();

    // Flip: the S as held on the left, flipped into the Z on the right
    await expect(page.locator("#coach-step")).toHaveText("3 of 4 · Flip");
    await dropInRegion(page, 0.25, 0.5);
    await expect(tiles).toHaveCount(1);
    await dropInRegion(page, 0.75, 0.5);
    await expect(tiles).toHaveCount(1); // not flipped: it does not land
    await page.keyboard.press("f");
    await dropInRegion(page, 0.75, 0.5);
    await expect(tiles).toHaveCount(2);
    await next.click();

    // Take off: the domino laid wrong comes off, then two cover the L
    await expect(page.locator("#coach-step")).toHaveText("4 of 4 · Take off");
    await expect(tiles).toHaveCount(1);
    await page.keyboard.press("x");
    await tiles.first().click();
    await expect(tiles).toHaveCount(0);
    await page.keyboard.press("Escape");
    // Restart puts the step back as it opened
    await page.locator("#restart").click();
    await expect(tiles).toHaveCount(1);
    await page.keyboard.press("x");
    await tiles.first().click();
    await page.keyboard.press("Escape");
    await dropInRegion(page, 2 / 3, 0.75);
    await page.keyboard.press("r");
    await dropInRegion(page, 1 / 6, 0.5);
    await expect(tiles).toHaveCount(2);
    await expect(page.locator("#coach-body")).toContainText("That's all you need");
    await expect(next).toHaveText("Play a level");
    await next.click();
    await expect(page).toHaveURL(/\?level=/);
    await expect(coach).toBeHidden();
    await expect(page.locator("#hint")).toBeVisible();
    // nothing of the tutorial is kept as stars, times or boards
    expect(
      await page.evaluate(() => [
        localStorage.getItem("rep-tiles.stars"),
        localStorage.getItem("rep-tiles.times"),
        localStorage.getItem("rep-tiles.boards"),
      ]),
    ).toEqual([null, null, null]);

    // once only: home is home from now on
    await page.goto("/");
    await expect(page.locator("#home")).toBeVisible();
    await expect(page).not.toHaveURL(/tutorial/);
    expect(errors).toEqual([]);
  });

  test("Skip leaves it for good; a player with stars never sees it; How to play has it", async ({
    page,
  }) => {
    const errors = watchErrors(page);
    await page.goto("/");
    await expect(page.locator("#coach")).toBeVisible();
    await page.locator("#coach-skip").click();
    await expect(page.locator("#home")).toBeVisible();
    await page.reload();
    await expect(page.locator("#home")).toBeVisible();

    // a player who has finished a level is no newcomer
    await page.evaluate(() => {
      localStorage.clear();
      localStorage.setItem("rep-tiles.stars", JSON.stringify({ squares: 2 }));
    });
    await page.goto("/");
    await expect(page.locator("#home")).toBeVisible();

    await page.goto("/?help");
    await page.locator('#help [data-action="tutorial"]').click();
    await expect(page).toHaveURL(/\?tutorial$/);
    await expect(page.locator("#coach-step")).toHaveText("1 of 4 · Drag");
    expect(errors).toEqual([]);
  });
});

/** A small phone held sideways: under 501px tall (`SIDEWAYS_QUERY`). */
const SIDEWAYS = { width: 667, height: 375 };

/** Whether the element is wholly inside the viewport. */
async function onScreen(page: Page, l: Locator): Promise<boolean> {
  const b = (await l.boundingBox())!;
  const v = page.viewportSize()!;
  return b.x >= 0 && b.y >= 0 && b.x + b.width <= v.width && b.y + b.height <= v.height;
}

test("a phone held sideways: home's picks and Tilings' groups two to a row, all on screen", async ({
  page,
}) => {
  const errors = watchErrors(page);
  await page.setViewportSize(SIDEWAYS);
  await page.goto("/");
  const picks = page.locator(".home-pick");
  await expect(picks).toHaveCount(4);
  for (let i = 0; i < 4; i++) expect(await onScreen(page, picks.nth(i))).toBe(true);
  // Easy and Medium side by side, Hard and Tilings under them
  const [easy, medium, hard, tilings] = await Promise.all(
    [0, 1, 2, 3].map(async (i) => (await picks.nth(i).boundingBox())!),
  );
  expect(medium!.y).toBeCloseTo(easy!.y, 0);
  expect(medium!.x).toBeGreaterThan(easy!.x + easy!.width);
  expect(hard!.y).toBeGreaterThan(easy!.y + easy!.height);
  expect(tilings!.y).toBeCloseTo(hard!.y, 0);
  await expect(page.locator(".catalog-pick")).toHaveText(/Tilings/);

  await page.locator(".catalog-pick").click();
  const groups = page.locator(".group-card");
  await expect(groups).toHaveCount(5);
  for (let i = 0; i < 5; i++) expect(await onScreen(page, groups.nth(i))).toBe(true);
  const [a, b] = await Promise.all([0, 1].map(async (i) => (await groups.nth(i).boundingBox())!));
  expect(b!.y).toBeCloseTo(a!.y, 0);
  expect(errors).toEqual([]);
});

test("a phone held sideways: a level's name in the header, the board taking its line", async ({
  page,
}) => {
  const errors = watchErrors(page);
  await page.setViewportSize(SIDEWAYS);
  await page.goto("/?level=squares");
  const name = page.locator(".board-name");
  await expect(page.locator("#game .hud .board-name")).toHaveCount(1);
  // between Back and the hint
  const back = (await page.locator("#back").boundingBox())!;
  const hint = (await page.locator("#hint").boundingBox())!;
  const n = (await name.boundingBox())!;
  expect(n.x).toBeGreaterThanOrEqual(back.x + back.width);
  expect(n.x + n.width).toBeLessThanOrEqual(hint.x);
  const sideways = (await page.locator("svg.board path.region").boundingBox())!.height;
  // held upright again, the name goes back over the board, which gives up
  // its line for it
  await page.setViewportSize({ width: 375, height: 667 });
  await expect(page.locator("#stage > .board-name")).toHaveCount(1);
  await page.setViewportSize(SIDEWAYS);
  await expect(page.locator("#game .hud .board-name")).toHaveCount(1);
  await expect
    .poll(async () => (await page.locator("svg.board path.region").boundingBox())!.height)
    .toBeCloseTo(sideways, 0);
  expect(errors).toEqual([]);
});

test("a finish throws Hypersweeper's confetti — but not where motion is reduced", async ({
  page,
}) => {
  const errors = watchErrors(page);
  await page.goto("/?level=squares");
  await finishSquares(page);
  const confetti = page.locator("canvas.confetti");
  await expect(confetti).toHaveCount(1);
  // it takes no taps: the win panel's buttons under it still work
  await expect(confetti).toHaveCSS("pointer-events", "none");
  // and is gone once the last strip has fallen
  await expect(confetti).toHaveCount(0, { timeout: 5000 });

  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/?level=squares");
  await finishSquares(page);
  await page.waitForTimeout(100);
  await expect(confetti).toHaveCount(0);
  expect(errors).toEqual([]);
});
