import { expect, test, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";

// The deployed build, end to end: it boots under the real security policy, its
// screens open, and a tile dragged onto the board lands. Unit tests cover the
// geometry and the rules; this covers the page.

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
  await expect(page.locator("#home-picks > *")).toHaveCount(5);
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
  const errors = watchErrors(page);
  await page.goto("/");
  await page.locator("#home-picks > *").first().click();
  await expect(page.locator("#game")).toBeVisible();
  await expect(page.locator("svg.board path.region")).toHaveCount(1);
  await expect(page.locator("svg.board .in-tray").first()).toBeVisible();

  await page.goto("/?tilings");
  await expect(page.locator("#catalog")).toBeVisible();
  await expect(page.locator("#catalog .hud-title")).toHaveText("Tilings");
  await expect(page.locator("#catalog-list button, #catalog-list a").first()).toBeVisible();
  // the old name's links still open it
  await page.goto("/?catalog");
  await expect(page.locator("#catalog")).toBeVisible();
  expect(errors).toEqual([]);
});

test("Figures lists the tile sets, and a set its tilings by difficulty", async ({ page }) => {
  const errors = watchErrors(page);
  await page.goto("/");
  await page.locator(".figures-pick").click();
  await expect(page).toHaveURL(/\?figures$/);
  await expect(page.locator("#figures .family h2")).toHaveText([
    "Triangles",
    "Quadrilaterals",
    "Pentagons",
    "Hexagons",
    "7+-gons",
    "Several pieces",
    "Regular pairs",
    "Irregular pairs",
    "Packs of 3+",
  ]);
  await expect(page.locator("#figures-list .figure-card .card-name").first()).toHaveText(
    "Triangle",
  );
  await page.locator('#figures-list [data-figure="squares"]').click();
  await expect(page).toHaveURL(/\?figure=squares$/);
  await expect(page.locator("#figure-title")).toHaveText("Square");
  await expect(page.locator("#figure-list .band-heading").first()).toContainText("Easy");
  const card = page.locator("#figure-list .card", { hasText: "4⁴" });
  await expect(card.locator(".bars")).toHaveAttribute("aria-label", "easy");
  await card.click();
  await expect(page.locator("#game")).toBeVisible();
  await expect(page).toHaveURL(/\?level=squares$/);
  await page.goBack();
  await expect(page.locator("#figure")).toBeVisible();
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

test("the level screen: one header row, no level list, a random level of the same band", async ({
  page,
}) => {
  const errors = watchErrors(page);
  await page.goto("/?level=cairo");
  await expect(page.locator("#game .hud .hud-btn")).toHaveCount(3);
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

  test("four kinds of tile scroll, by the scroll bar or the strip's background", async ({
    page,
    context,
  }) => {
    // [3.4.6.4; 4.6.12]: a triangle, a square, a hexagon and a dodecagon at
    // the board's own size run longer than a phone is wide.
    await page.goto("/?level=dodecarhombitrihex");
    const thumb = page.locator("svg.board .tray-scroll-thumb");
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

test("the win card's Exit closes it, leaving the finished board", async ({ page }) => {
  const errors = watchErrors(page);
  await page.goto("/?level=squares");
  // Lay the 4×4 squares row by row from the bottom-left: each dropped on its
  // own cell snaps to the corner the cells before it left open.
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
  await page.locator("#exit").click();
  await expect(page.locator("#won")).toBeHidden();
  await expect(page.locator("#count")).toHaveText("100%");
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

test("the Spectres' edges are round or wavy, Tile(1,1)'s straight", async ({ page }) => {
  await page.goto("/?level=spectre");
  // a round edge is a cubic arc in the path; a straight one a line
  await expect(page.locator("svg.board .tile.in-tray").first()).toHaveAttribute("d", /C/);
  await expect(page.locator("svg.board path.region")).toHaveAttribute("d", /C/);
  await page.goto("/?level=tile11");
  await expect(page.locator("svg.board .tile.in-tray").first()).not.toHaveAttribute("d", /C/);
  await expect(page.locator("svg.board path.region")).not.toHaveAttribute("d", /C/);
  // the wavy Spectre, and the Spectres and Mystics: round too, the Mystic a
  // tray tile of its own
  await page.goto("/?level=spectrewave");
  await expect(page.locator("svg.board .tile.in-tray")).toHaveCount(1);
  await expect(page.locator("svg.board .tile.in-tray").first()).toHaveAttribute("d", /C/);
  for (const key of ["mystic", "mysticwave"]) {
    await page.goto(`/?level=${key}`);
    await expect(page.locator("svg.board .tile.in-tray")).toHaveCount(2);
    await expect(page.locator("svg.board .tile.in-tray.sides-18")).toHaveAttribute("d", /C/);
    await expect(page.locator("svg.board path.region")).toHaveAttribute("d", /C/);
  }
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
