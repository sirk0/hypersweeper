import { expect, test, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";

// The desktop layout (view/groups.ts, the wide block in styles.css): from
// 900px wide a sidebar — Quick start, the tilings in five groups, How to play,
// Settings — beside every screen but a level's; Quick start's three difficulties as
// cards; a group's tilings in grids; a tiling's page in two columns; a level
// with its name in the header and its tray a card. smoke.spec.ts holds the
// phone's screens.

test.use({ viewport: { width: 1280, height: 720 } });

/** Collect console errors and CSP violations for the whole test. */
function watchErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on("console", (msg) => {
    if (msg.type() === "error") errors.push(msg.text());
  });
  page.on("pageerror", (err) => errors.push(String(err)));
  return errors;
}

/** Every tiling the catalog lists: the first boards, plain. */
const TILINGS = (
  JSON.parse(readFileSync("src/levelIndex.json", "utf8")) as { key: string; group: string }[]
)
  .filter((l) => l.group !== "rules" && l.group !== "colourings")
  .map((l) => l.key);

/** A level's measured score (src/difficulty.json, read here as Node cannot
 * import the game's JSON): medium is from 0.85 up to 1.45 (`MEDIUM`, `HARD`
 * in src/difficulty.ts). */
const SCORES = JSON.parse(readFileSync("src/difficulty.json", "utf8")) as Record<
  string,
  { score: number }
>;

const GROUP_KEYS = ["regular", "irregular", "offset", "self-similar", "aperiodic"];

test("Quick start: the sidebar, and three difficulty cards that deal their own", async ({
  page,
}) => {
  const errors = watchErrors(page);
  await page.goto("/");
  await expect(page.locator("#sidebar")).toBeVisible();
  await expect(page.locator('#sidebar [data-side="home"]')).toHaveClass(/\bactive\b/);
  await expect(page.locator("#side-groups .side-row")).toHaveCount(5);
  await expect(page.locator("#home .pane-title")).toHaveText("Quick start");
  // the three cards, side by side, each a tiling of its difficulty pictured
  const cards = page.locator("#home .home-bands .home-pick");
  await expect(cards).toHaveCount(3);
  await expect(page.locator("#home .catalog-pick")).toBeHidden();
  for (let i = 0; i < 3; i++) {
    await expect(
      cards.nth(i).locator(".home-art svg.card-picture path.tile").first(),
    ).toBeVisible();
  }
  const [a, b] = [await cards.nth(0).boundingBox(), await cards.nth(1).boundingBox()];
  expect(Math.abs(a!.y - b!.y)).toBeLessThan(1);
  expect(b!.x).toBeGreaterThan(a!.x + a!.width);

  await page.locator("#home .band-medium").click();
  await expect(page.locator("#game")).toBeVisible();
  await expect(page.locator("#sidebar")).toBeHidden();
  const key = new URL(page.url()).searchParams.get("level")!;
  const { score } = SCORES[key]!;
  expect(score).toBeGreaterThanOrEqual(0.85);
  expect(score).toBeLessThan(1.45);
  expect(errors).toEqual([]);
});

test("every tiling is on exactly one group's page", async ({ page }) => {
  const errors = watchErrors(page);
  const seen: string[] = [];
  for (const group of GROUP_KEYS) {
    await page.goto("/");
    await page.locator(`#sidebar [data-side="group:${group}"]`).click();
    await expect(page).toHaveURL(new RegExp(`\\?group=${group}$`));
    await expect(page.locator(`#sidebar [data-side="group:${group}"]`)).toHaveClass(/\bactive\b/);
    const cards = page.locator("#catalog-list .card");
    await expect(cards.first()).toBeVisible();
    // the sidebar's count is the page's
    const count = await page
      .locator(`#sidebar [data-side="group:${group}"] .side-count`)
      .textContent();
    await expect(cards).toHaveCount(Number(count));
    seen.push(
      ...(await cards.evaluateAll((els) => els.map((e) => e.getAttribute("data-tiling")!))),
    );
  }
  expect(seen.length).toBe(new Set(seen).size);
  expect([...seen].sort()).toEqual([...TILINGS].sort());
  expect(errors).toEqual([]);
});

test("a group's page: its families in grids, a jump to each", async ({ page }) => {
  // ?tilings, as a phone would link it, opens the first group
  await page.goto("/?tilings");
  await expect(page.locator("#catalog-title")).toHaveText("Regular polygons");
  await expect(page.locator("#catalog-list .family h2")).toHaveText([
    "Regular",
    "Uniform",
    "2-uniform",
  ]);
  await expect(page.locator("#catalog-links .pane-link")).toHaveText([
    "Regular",
    "Uniform",
    "2-uniform",
  ]);
  // a grid that wraps, not a row that scrolls sideways
  const row = page.locator('#catalog-list [data-family="2-uniform"] .family-row');
  const fits = await row.evaluate((el) => el.scrollWidth <= el.clientWidth);
  expect(fits).toBe(true);
  await page.locator("#catalog-links .pane-link", { hasText: "2-uniform" }).click();
  await expect(page.locator('#catalog-list [data-family="2-uniform"] h2')).toBeInViewport();

  // a group of one family: no jump, and no heading repeating the title
  await page.goto("/?group=aperiodic");
  await expect(page.locator("#catalog-title")).toHaveText("Aperiodic");
  await expect(page.locator("#catalog-links .pane-link")).toHaveCount(0);
  await expect(page.locator("#catalog-list .family h2")).toBeHidden();
});

test("a tiling's page: the level picked beside the picks, Play in view", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  const errors = watchErrors(page);
  await page.goto("/?group=offset");
  await page.locator('#catalog-list [data-tiling="runningbond"]').click();
  await expect(page).toHaveURL(/\?tiling=runningbond&pick=/);
  await expect(page.locator('#sidebar [data-side="group:offset"]')).toHaveClass(/\bactive\b/);
  const side = page.locator("#tiling-list .pick-side");
  const main = page.locator("#tiling-list .pick-main");
  await expect(side.locator(".pick-art svg")).toBeVisible();
  const [s, m] = [(await side.boundingBox())!, (await main.boundingBox())!];
  expect(m.x).toBeGreaterThan(s.x + s.width);
  // Play is on screen without scrolling
  await expect(page.locator("#tiling-list .play")).toBeInViewport({ ratio: 1 });

  await page.locator('#tiling-list [data-board="runningbond-2"]').click();
  await page.locator('#tiling-list [data-marking="runningbond.lines"]').click();
  await expect(page.locator("#tiling-list .play-what")).toHaveText("board 2 · lines");
  await expect(page.locator("#tiling-list .pick-name")).toHaveText(/Running bond · lines/);
  await page.locator("#tiling-list .play").click();
  await expect(page).toHaveURL(/\?level=runningbond\.lines-2$/);
  expect(errors).toEqual([]);
});

test("a level: its name in the header, its tray a card", async ({ page }) => {
  await page.goto("/?level=rhombitrihex");
  await expect(page.locator("#game .hud .board-name #level")).toHaveText("3.4.6.4");
  await expect(page.locator("#board-of")).toHaveText("board 1/6");
  const zone = page.locator("svg.board .tray-zone");
  await expect(zone).toHaveAttribute("rx", /^[1-9]/);
  // the card stands clear of the screen's edges, and every tray tile is on it
  const z = (await zone.boundingBox())!;
  expect(z.x + z.width).toBeLessThan(1280 - 4);
  expect(z.y).toBeGreaterThan(80);
  for (const tile of await page.locator("svg.board .tile.in-tray").all()) {
    const t = (await tile.boundingBox())!;
    expect(t.x).toBeGreaterThanOrEqual(z.x);
    expect(t.y).toBeGreaterThanOrEqual(z.y);
    expect(t.x + t.width).toBeLessThanOrEqual(z.x + z.width);
    expect(t.y + t.height).toBeLessThanOrEqual(z.y + z.height);
  }
});

test("crossing the desktop's width redraws the screen, and keeps a level's tiles", async ({
  page,
}) => {
  const errors = watchErrors(page);
  await page.goto("/?group=aperiodic");
  await expect(page.locator("#catalog-list .family")).toHaveCount(1);
  // narrowed to a phone: every family, a row each, and no sidebar
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.locator("#sidebar")).toBeHidden();
  await expect(page.locator("#catalog-title")).toHaveText("Tilings");
  await expect(page.locator("#catalog-list .family")).toHaveCount(11);
  await page.setViewportSize({ width: 1280, height: 720 });
  await expect(page.locator("#catalog-title")).toHaveText("Aperiodic");

  // a level keeps its tiles: only the name moves, and the board refits
  await page.goto("/?level=squares");
  const tray = page.locator("svg.board .tile.in-tray").first();
  const t = (await tray.boundingBox())!;
  const r = (await page.locator("svg.board path.region").boundingBox())!;
  await page.mouse.move(t.x + t.width / 2, t.y + t.height / 2);
  await page.mouse.down();
  await page.mouse.move(r.x + t.width / 2, r.y + r.height - t.height / 2, { steps: 12 });
  await page.mouse.up();
  await expect(page.locator("svg.board [data-tile]")).toHaveCount(1);
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.locator("#stage > .board-name")).toHaveCount(1);
  await expect(page.locator("svg.board [data-tile]")).toHaveCount(1);
  await page.setViewportSize({ width: 1280, height: 720 });
  await expect(page.locator("#game .hud .board-name")).toHaveCount(1);
  await expect(page.locator("svg.board [data-tile]")).toHaveCount(1);
  expect(errors).toEqual([]);
});

test("the sidebar's How to play: its page in the pane, the row lit", async ({ page }) => {
  const errors = watchErrors(page);
  await page.goto("/");
  await page.locator('#sidebar [data-side="help"]').click();
  await expect(page.locator("#help")).toBeVisible();
  await expect(page.locator('#sidebar [data-side="help"]')).toHaveClass(/\bactive\b/);
  // the pane's own header: the title, and no Home button (the sidebar goes home)
  await expect(page.locator("#help .hud-title")).toBeVisible();
  await expect(page.locator("#help [data-go-home]")).toBeHidden();
  // home's own ? is the phone's; the sidebar has it here
  await page.locator('#sidebar [data-side="home"]').click();
  await expect(page.locator('#home [data-action="help"]')).toBeHidden();
  expect(errors).toEqual([]);
});
