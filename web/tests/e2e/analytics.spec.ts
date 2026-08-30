import { expect, test, type Page } from "@playwright/test";

// Anonymous play counts, from the click to the wire.
//
// The unit tests pin what an event *is* (analyticsEvent.ts) and which global
// the transport reaches for; this pins the half neither can see — that a real
// board, played by real clicks, posts exactly the events it should and no more.
//
// Three things worth knowing before editing this file:
//
//   - Requests are collected with `page.on("request")`, not `page.route`.
//     Whether a `sendBeacon` is interceptable by a route handler varies; it
//     always surfaces as a request event.
//   - **A beacon's body is not readable here.** Chromium reports it as a `ping`
//     request and CDP hands Playwright no post data at all — `postData()` and
//     `postDataBuffer()` are both null. So the tests that assert *what* was
//     sent take `navigator.sendBeacon` away first, which drops `analytics.ts`
//     onto its documented `keepalive` fetch fallback — real production code,
//     for real browsers that lack the beacon — whose body does come through.
//     One test keeps the beacon and asserts the default path still posts.
//   - Nothing is stubbed *by the test*. The posts are real, and `vite preview`
//     answers them 204 through the `tallyStub` middleware in vite.config.ts,
//     which is there so a local server behaves like the deployed one — the
//     Pages Function also only ever answers 204. So what these tests watch is
//     the actual network traffic of an actual game.

interface Posted {
  v: number;
  e: "start" | "end";
  m: string;
  d: string;
  /** How the board was dealt, and what the board before it was doing. */
  t: string;
  f: string;
  dv: string;
  sh: string;
  vr: string;
  c: number;
  n: number;
  o?: "won" | "lost";
  s?: number;
  op?: number;
  fr?: number;
  fw?: number;
  rv?: number;
  ch?: number;
  fl?: number;
  fm?: number;
  vm?: 0 | 1;
}

/** Take the beacon away, so the transport falls through to fetch and the test
 * can read what it sent. Must run before the bundle, hence addInitScript. */
async function withoutBeacon(page: Page): Promise<void> {
  await page.addInitScript(() => {
    Object.defineProperty(Navigator.prototype, "sendBeacon", {
      value: undefined,
      configurable: true,
    });
  });
}

/** Start recording posts to the collector. Call before opening a board, since
 * opening one is itself an event. `body` is null for a beacon (see above). */
function collect(page: Page): { body: Posted | null }[] {
  const posted: { body: Posted | null }[] = [];
  page.on("request", (request) => {
    if (request.method() !== "POST" || !request.url().includes("/api/tally")) return;
    const raw = request.postData();
    posted.push({ body: raw === null ? null : (JSON.parse(raw) as Posted) });
  });
  return posted;
}

const bodies = (posted: { body: Posted | null }[]): Posted[] =>
  posted.map((p) => p.body).filter((b): b is Posted => b !== null);

/** The fixture boards from play.spec.ts: one mine in a corner, so revealing the
 * far corner floods the board and wins — or clicking the mine loses. */
async function openSquares(page: Page, mine: string): Promise<void> {
  await page.evaluate(
    (cell) => window.__ms?.startBoard("square", "easy", { mines: [cell] }),
    mine,
  );
}

async function click(page: Page, cell: string): Promise<void> {
  const xy = await page.evaluate((c) => window.__ms?.cellScreenXY(c), cell);
  await page.mouse.click(xy!.x, xy!.y);
}

async function ready(page: Page): Promise<void> {
  await page.goto("/");
  await expect(page.locator("body[data-ready]")).toBeVisible();
}

test.describe("play counts", () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 900, height: 700 });
  });

  test("the default transport posts without being asked twice", async ({ page }) => {
    // The one case that keeps `navigator.sendBeacon`, so the path a real
    // browser takes is exercised end to end. Its body is invisible to
    // Playwright; that it goes out at all is the assertion.
    await ready(page);
    const posted = collect(page);
    await openSquares(page, "4,4");
    await expect.poll(() => posted.length).toBe(1);
  });

  test("opening a board reports the board, and nothing else", async ({ page }) => {
    await withoutBeacon(page);
    await ready(page);
    const posted = collect(page);

    await openSquares(page, "4,4");
    await expect.poll(() => posted.length).toBe(1);
    const start = bodies(posted)[0];
    expect(start).toMatchObject({
      v: 2,
      e: "start",
      m: "square",
      d: "easy",
      t: "menu",
      f: "", // the first board of the visit replaced nothing
      // A desktop headless Chromium: no touch points, a fine pointer.
      dv: "desktop",
      sh: "browser",
      c: 81,
      n: 1, // the fixture board's single mine
    });
    // "and nothing else": the exact key set, so a field added without a
    // thought about the privacy copy shows up here.
    expect(Object.keys(start ?? {}).sort()).toEqual([
      "c",
      "d",
      "dv",
      "e",
      "f",
      "m",
      "n",
      "sh",
      "t",
      "v",
      "vr",
    ]);
    // No board name on the wire — the collector derives it (analyticsEvent.ts).
    expect(Object.values(start ?? {})).not.toContain("Squares");
  });

  test("stepping on a mine reports the loss", async ({ page }) => {
    await withoutBeacon(page);
    await ready(page);
    const posted = collect(page);

    await openSquares(page, "4,4");
    await click(page, "4,4");
    expect(await page.evaluate(() => window.__ms?.state().status)).toBe("lost");

    await expect.poll(() => posted.length).toBe(2);
    const end = bodies(posted)[1];
    expect(end).toMatchObject({ v: 2, e: "end", m: "square", d: "easy", o: "lost" });
    expect(typeof end?.s).toBe("number");
    // How far it got: one click, straight onto the mine — which is revealed
    // but is not an *opened* cell, so nothing was opened at all.
    expect(end).toMatchObject({ c: 81, n: 1, op: 0, fr: 0, fw: 0, rv: 1, ch: 0, fl: 0 });
    expect(typeof end?.fm).toBe("number");
  });

  test("clearing the board reports the win", async ({ page }) => {
    await withoutBeacon(page);
    await ready(page);
    const posted = collect(page);

    await openSquares(page, "0,0");
    await page.evaluate(() => window.__ms?.flag("0,0")); // the mine, correctly
    await click(page, "8,8");
    expect(await page.evaluate(() => window.__ms?.state().status)).toBe("won");

    await expect.poll(() => posted.length).toBe(2);
    // The whole board bar the mine, and the one flag the *player* planted —
    // not the auto-flag the win itself lays down (game.ts).
    expect(bodies(posted)[1]).toMatchObject({
      e: "end",
      o: "won",
      op: 80,
      fr: 1,
      fw: 0,
      fl: 1,
    });
  });

  test("a finished board is reported once, however much it is clicked", async ({
    page,
  }) => {
    // The guard that matters: `afterMove` runs on every move and the HUD timer
    // ticks four times a second, so a game that has ended gets plenty of
    // chances to be counted twice.
    await withoutBeacon(page);
    await ready(page);
    const posted = collect(page);

    await openSquares(page, "4,4");
    await click(page, "4,4");
    expect(await page.evaluate(() => window.__ms?.state().status)).toBe("lost");
    for (const cell of ["0,0", "1,1", "2,2"]) await click(page, cell);
    await page.waitForTimeout(700); // two timer ticks

    expect(bodies(posted).filter((p) => p.e === "end")).toHaveLength(1);
    expect(posted).toHaveLength(2);
  });

  test("a restart is a new board, and reports as one", async ({ page }) => {
    await withoutBeacon(page);
    await ready(page);
    const posted = collect(page);

    await openSquares(page, "4,4");
    await click(page, "4,4");
    await expect.poll(() => posted.length).toBe(2);
    await page.locator(".hud-smiley").click(); // the smiley restarts the board

    await expect.poll(() => bodies(posted).filter((p) => p.e === "start").length).toBe(2);
    // …and says so: the same board again, after a loss.
    const restart = bodies(posted).filter((p) => p.e === "start")[1];
    expect(restart).toMatchObject({ m: "square", t: "again", f: "lost" });
  });

  test("a mid-game re-roll says it abandoned a board in play", async ({ page }) => {
    // The other half of the start-reason pair: the HUD die deals a different
    // board, and the game it replaced was still going. `trigger` x `from` is
    // what makes these tellable apart in the dataset.
    await withoutBeacon(page);
    await ready(page);
    const posted = collect(page);

    await openSquares(page, "4,4");
    // A flag, not a reveal: the fixture board has one mine, so opening any
    // safe cell floods the whole board and wins it — and the win card would
    // then be over the die.
    await page.evaluate(() => window.__ms?.flag("0,0"));
    await expect.poll(() => posted.length).toBe(1);
    await page.locator('.hud-btn[data-slot="random"]').click();

    await expect.poll(() => bodies(posted).filter((p) => p.e === "start").length).toBe(2);
    const rerolled = bodies(posted).filter((p) => p.e === "start")[1];
    expect(rerolled).toMatchObject({ t: "random", f: "playing" });
    // The board it abandoned files no end event — an abandon is `starts - ends`
    // (docs/agents/metrics.md), which is why there is no third event here.
    expect(bodies(posted).filter((p) => p.e === "end")).toHaveLength(0);
  });

  test("the Analytics switch stops every post, and the choice sticks", async ({
    page,
  }) => {
    await ready(page);

    await page.locator('.menu-header-btn[data-action="settings"]').click();
    const toggle = page.locator('.menu-entry[data-setting="analytics"]');
    await expect(toggle).toHaveAttribute("aria-checked", "true");
    await toggle.click();
    await expect(toggle).toHaveAttribute("aria-checked", "false");

    // Only now start listening, so the events from before the switch cannot
    // account for an empty list.
    const posted = collect(page);
    await openSquares(page, "0,0");
    await page.evaluate(() => window.__ms?.flag("0,0"));
    await click(page, "8,8");
    expect(await page.evaluate(() => window.__ms?.state().status)).toBe("won");
    await page.waitForTimeout(300);
    expect(posted).toEqual([]);

    // And the choice survives a reload, like every other setting.
    await page.reload();
    await expect(page.locator("body[data-ready]")).toBeVisible();
    await page.locator('.menu-header-btn[data-action="settings"]').click();
    await expect(page.locator('.menu-entry[data-setting="analytics"]')).toHaveAttribute(
      "aria-checked",
      "false",
    );
  });
});
