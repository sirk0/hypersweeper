import { expect, test, type Page } from "@playwright/test";

// Best times: the record window a placing win puts up, and the page that lists
// what it has collected. The suite runs under emulated reduced motion, so the
// dialog opens straight away rather than waiting on the win animation.

const KEY = "ms:scores";

/** Start with a board already holding `entries` (milliseconds), so a test can
 * assert against times it chose rather than against however fast the fixture
 * board happened to be won. */
async function seedTimes(page: Page, key: string, entries: { ms: number; at: number }[]) {
  await page.addInitScript(
    ([storageKey, board, rows]) => {
      localStorage.setItem(
        storageKey as string,
        JSON.stringify({ version: 1, boards: { [board as string]: rows } }),
      );
    },
    [KEY, key, entries] as const,
  );
}

/** Boot with the fixture board's achievements already unlocked, so a win on it
 * has nothing to announce. The record it writes also stops `achievements.ts`
 * seeding itself from the best times this file plants. */
async function seedNoAchievementsLeft(page: Page): Promise<void> {
  await page.addInitScript(() =>
    localStorage.setItem(
      "ms:achievements",
      JSON.stringify({
        version: 1,
        wins: { square: { easy: 1 } },
        shapes: [4],
        flagless: 1,
        unlocked: {
          "first-win": 1,
          "difficulty:easy": 1,
          flagless: 1,
          "shape:4": 1,
          "tiling:regular": 1,
          "surface:flat": 1,
        },
      }),
    ),
  );
}

/** The fixture win from play.spec.ts: one mine in the corner, so revealing the
 * far corner floods the rest of the board and wins.
 *
 * `dealt` marks the board as one the game dealt rather than one the player
 * picked, which the win window highlights a different action for. The paths
 * that really deal one choose the mode themselves, so a test that has to *win*
 * the board cannot use them — it would not know what was under it. */
async function winFixtureBoard(page: Page, dealt = false): Promise<void> {
  await page.evaluate(
    (dealtAtRandom) =>
      window.__ms?.startBoard("square", "easy", { mines: ["0,0"], dealtAtRandom }),
    dealt,
  );
  const xy = await page.evaluate(() => window.__ms?.cellScreenXY("8,8"));
  await page.mouse.click(xy!.x, xy!.y);
  expect((await page.evaluate(() => window.__ms?.state()))?.status).toBe("won");
}

/** Win a board dealt from `seed` — the one kind that carries a link, since a
 * board built from an explicit mine layout is not reproducible from one.
 *
 * The layout is a function of the seed and the first cell clicked (mines are
 * placed on the first reveal, around it), so replaying the same seed and always
 * opening at `cells()[0]` — which the first-click guarantee makes safe — gives
 * the same board every pass. Each pass reveals in order until it hits a mine,
 * notes it, and starts over skipping the ones already found; easy has ten, so
 * it converges in a few dozen in-page milliseconds. */
async function winSeededBoard(page: Page, seed: number): Promise<void> {
  await page.evaluate((s) => {
    const hook = window.__ms!;
    const mines = new Set<string>();
    for (let pass = 0; pass < 64; pass++) {
      hook.startBoard("square", "easy", { seed: s });
      for (const cell of hook.cells()) {
        if (mines.has(String(cell)) || hook.cellState(cell) !== "hidden") continue;
        hook.reveal(cell);
        const status = hook.state().status;
        // The cell it died on is a mine: note it and try again without it.
        if (status === "lost") mines.add(String(cell));
        if (status !== "playing") break;
      }
      if (hook.state().status === "won") return;
    }
    throw new Error("could not win the seeded board");
  }, seed);
}

const dialog = (page: Page) => page.locator('[data-dialog="score"]');

test.describe("record window", () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 900, height: 700 });
  });

  test("a top-three win announces the record and stores it", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator("body[data-ready]")).toBeVisible();
    await winFixtureBoard(page);

    await expect(dialog(page)).toBeVisible();
    await expect(page.locator("#score-dialog-title")).toHaveText("New best time!");
    await expect(page.locator(".dialog-subtitle")).toHaveText("Squares · Easy");
    // One row, and it is the one just set.
    await expect(page.locator(".score-row")).toHaveCount(1);
    await expect(page.locator(".score-row.current")).toHaveAttribute("data-rank", "1");
    await expect(page.locator(".score-row.current .score-when")).toHaveText("just now");

    const stored = await page.evaluate(() => window.__ms?.bestTimes("square", "easy"));
    expect(stored).toHaveLength(1);
  });

  test("a second win joins the list, and the times survive a reload", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator("body[data-ready]")).toBeVisible();
    await winFixtureBoard(page);
    await page.keyboard.press("Escape");
    await winFixtureBoard(page);

    await expect(page.locator(".score-row")).toHaveCount(2);
    expect(await page.evaluate(() => window.__ms?.bestTimes("square", "easy"))).toHaveLength(2);

    await page.reload();
    await expect(page.locator("body[data-ready]")).toBeVisible();
    expect(await page.evaluate(() => window.__ms?.bestTimes("square", "easy"))).toHaveLength(2);
  });

  test("Escape closes it and leaves the finished board", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator("body[data-ready]")).toBeVisible();
    await winFixtureBoard(page);
    await expect(dialog(page)).toBeVisible();

    await page.keyboard.press("Escape");
    await expect(dialog(page)).toHaveCount(0);
    const state = await page.evaluate(() => window.__ms?.state());
    expect(state?.screen).toBe("game");
    expect(state?.status).toBe("won"); // the cleared board is still there
  });

  test("Play again deals the same board again", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator("body[data-ready]")).toBeVisible();
    await winFixtureBoard(page);
    await page.locator('.dialog-btn[data-action="play-again"]').click();
    await expect(dialog(page)).toHaveCount(0);
    const state = await page.evaluate(() => window.__ms?.state());
    expect(state?.status).toBe("playing");
    expect(state?.mode).toBe("square");
  });

  test("the card asks one question: this board again, or another", async ({ page }) => {
    // It offered four things — Play again, New board, Share and Menu — where
    // there are two real choices. Menu went (the × and Escape go back to the
    // cleared board, the header's back button goes home) and Share is the
    // corner icon now, so the row is the decision and nothing else.
    await page.goto("/");
    await expect(page.locator("body[data-ready]")).toBeVisible();
    await winFixtureBoard(page);

    await expect(page.locator(".dialog-actions .dialog-btn")).toHaveCount(2);
    await expect(page.locator('.dialog-actions[data-buttons="2"]')).toBeVisible();
    await expect(page.locator('[data-action="menu"]')).toHaveCount(0);
  });

  test("the highlight follows how the board was come by", async ({ page }) => {
    // A board the player picked out of the catalogue is one they came for, so
    // playing it again is the obvious next move; one the game dealt them is a
    // step in a wander, and the next step is another board.
    await page.goto("/");
    await expect(page.locator("body[data-ready]")).toBeVisible();

    await winFixtureBoard(page);
    await expect(page.locator('[data-action="play-again"]')).toHaveClass(/dialog-primary/);
    await expect(page.locator('[data-action="new-board"]')).not.toHaveClass(/dialog-primary/);
    // Focus lands on it, so Enter takes the card's own answer.
    expect(await page.evaluate(() => document.activeElement?.getAttribute("data-action"))).toBe(
      "play-again",
    );

    await winFixtureBoard(page, true);
    await expect(page.locator('[data-action="new-board"]')).toHaveClass(/dialog-primary/);
    await expect(page.locator('[data-action="play-again"]')).not.toHaveClass(/dialog-primary/);
    expect(await page.evaluate(() => document.activeElement?.getAttribute("data-action"))).toBe(
      "new-board",
    );
  });

  test("the link is the corner icon, and it does not dismiss the card", async ({ page }) => {
    // It was a fourth button among the actions, where it was not an answer to
    // the question that row asks. As an icon it is chrome, opposite the ×.
    // Headless Chromium refuses a clipboard write without it, and the refusal
    // is what the icon would report — this is testing the copy, not the veto.
    await page.context().grantPermissions(["clipboard-write"]);
    await page.goto("/");
    await expect(page.locator("body[data-ready]")).toBeVisible();
    await winSeededBoard(page, 4242);
    await expect(dialog(page)).toBeVisible();

    const share = page.locator('.dialog-share[data-action="share"]');
    await expect(share).toBeVisible();
    await expect(page.locator(".dialog-actions .dialog-share")).toHaveCount(0);
    await expect(page.locator(".dialog-share-note")).toHaveText("");

    await share.click();
    // A clipboard write is invisible, so the icon says what happened — and the
    // card stays up, because the player is still looking at their time.
    await expect(share).toHaveAttribute("data-state", "copied");
    await expect(page.locator(".dialog-share-note")).toHaveText("Link copied");
    await expect(dialog(page)).toBeVisible();
  });

  test("a share that goes through clears what the last one said", async ({ page }) => {
    // A *cancelled* share sheet falls through to the clipboard, so the icon can
    // be showing "Link copied" when the next press opens the sheet again — and
    // a sheet is its own feedback, so that press says nothing itself. It has to
    // clear the tick on the way in, or the note it leaves standing is a lie
    // about a share that did go through.
    await page.context().grantPermissions(["clipboard-write"]);
    await page.addInitScript(() => {
      let calls = 0;
      Object.defineProperty(navigator, "share", {
        configurable: true,
        // First press: the player dismisses the sheet (share.ts falls through
        // to the clipboard). Second: they go through with it.
        value: () => (++calls === 1 ? Promise.reject(new Error("cancelled")) : Promise.resolve()),
      });
    });
    await page.goto("/");
    await expect(page.locator("body[data-ready]")).toBeVisible();
    await winSeededBoard(page, 99);

    const share = page.locator(".dialog-share");
    await share.click();
    await expect(share).toHaveAttribute("data-state", "copied");

    await share.click();
    await expect(share).not.toHaveAttribute("data-state", /.*/);
    await expect(page.locator(".dialog-share-note")).toHaveText("");
  });

  test("a board with no link offers no share icon", async ({ page }) => {
    // The fixture board is built from an explicit mine layout, so it has no
    // seed and cannot be handed to anyone.
    await page.goto("/");
    await expect(page.locator("body[data-ready]")).toBeVisible();
    await winFixtureBoard(page);
    await expect(dialog(page)).toBeVisible();
    await expect(page.locator(".dialog-share")).toHaveCount(0);
  });

  test("a dealt board stays dealt when it is replayed", async ({ page }) => {
    // The origin sticks to the board: replaying a dealt one does not turn it
    // into a chosen one, or the highlight would move between two wins on the
    // same board.
    await page.goto("/");
    await expect(page.locator("body[data-ready]")).toBeVisible();
    await winFixtureBoard(page, true);

    await page.locator('.dialog-btn[data-action="play-again"]').click();
    expect((await page.evaluate(() => window.__ms?.state()))?.dealtAtRandom).toBe(true);
    // ...and so does the smiley, which is the same re-deal.
    await page.locator(".hud-smiley").click();
    expect((await page.evaluate(() => window.__ms?.state()))?.dealtAtRandom).toBe(true);
  });

  test("the ways a board is dealt mark it, and picking one does not", async ({ page }) => {
    // The other end of the same wire, on the real paths: the home page's Flat
    // row and the header's die deal a board; a row that names one does not.
    await page.goto("/");
    await expect(page.locator("body[data-ready]")).toBeVisible();
    await page.locator('.menu-entry[data-random="flat"]').click();
    expect((await page.evaluate(() => window.__ms?.state()))?.dealtAtRandom).toBe(true);

    await page.goto("/");
    await expect(page.locator("body[data-ready]")).toBeVisible();
    await page.locator('.menu-entry[data-mode="square"]').click();
    expect((await page.evaluate(() => window.__ms?.state()))?.dealtAtRandom).toBe(false);

    await page.locator('.hud-btn[data-slot="random"]').click();
    expect((await page.evaluate(() => window.__ms?.state()))?.dealtAtRandom).toBe(true);
  });

  test("New board deals another board of the same kind", async ({ page }) => {
    // A win is where a player decides what to play next, and the window can now
    // answer that without a trip back to the menu. Flat board in, flat board
    // out — the home page's Flat pool, dealt on the same fairness weighting.
    await page.goto("/");
    await expect(page.locator("body[data-ready]")).toBeVisible();
    await winFixtureBoard(page);

    await page.locator('.dialog-btn[data-action="new-board"]').click();
    await expect(dialog(page)).toHaveCount(0);
    const state = await page.evaluate(() => window.__ms?.state());
    expect(state?.screen).toBe("game");
    expect(state?.status).toBe("playing");
    expect(state?.is3d).toBe(false);
  });

  test("a time that does not place is not announced", async ({ page }) => {
    // Three unbeatable records: a win can only tie them, and a tie does not
    // take a place.
    await seedTimes(page, "square|easy", [
      { ms: 0, at: 1 },
      { ms: 0, at: 2 },
      { ms: 0, at: 3 },
    ]);
    // The card also opens for an achievement, which this win would otherwise
    // earn six of (see achievements.spec.ts, which pins that half). This test
    // is about the leaderboard's own rule, so the achievements are settled
    // first: with nothing left to unlock, a non-placing time is silent.
    await seedNoAchievementsLeft(page);
    await page.goto("/");
    await expect(page.locator("body[data-ready]")).toBeVisible();
    await winFixtureBoard(page);

    await expect(dialog(page)).toHaveCount(0);
    const stored = await page.evaluate(() => window.__ms?.bestTimes("square", "easy"));
    expect(stored).toEqual([
      { ms: 0, at: 1 },
      { ms: 0, at: 2 },
      { ms: 0, at: 3 },
    ]);
  });

  test("a loss records nothing", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator("body[data-ready]")).toBeVisible();
    await page.evaluate(() => window.__ms?.startBoard("square", "easy", { mines: ["4,4"] }));
    const xy = await page.evaluate(() => window.__ms?.cellScreenXY("4,4"));
    await page.mouse.click(xy!.x, xy!.y);

    expect((await page.evaluate(() => window.__ms?.state()))?.status).toBe("lost");
    await expect(dialog(page)).toHaveCount(0);
    expect(await page.evaluate(() => window.__ms?.bestTimes("square", "easy"))).toEqual([]);
  });

  test("a click on the field around the card dismisses it", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator("body[data-ready]")).toBeVisible();
    await winFixtureBoard(page);
    await expect(dialog(page)).toBeVisible();

    await dialog(page).click({ position: { x: 8, y: 8 } }); // the backdrop, not the card
    await expect(dialog(page)).toHaveCount(0);
  });

  test("leaving during the win animation cancels the window", async ({ page }) => {
    // With animations on the window waits for the win wave; walking away in
    // that gap must not pop a card over the menu.
    await page.goto("/");
    await expect(page.locator("body[data-ready]")).toBeVisible();
    await page.evaluate(() => window.__ms?.animations(true));
    await winFixtureBoard(page);
    await expect(dialog(page)).toHaveCount(0); // still waiting

    await page.locator('.hud-btn[data-slot="back"]').click();
    await expect(page.locator('.menu-entry[data-group="custom"]')).toBeVisible();
    await page.waitForTimeout(1500); // past the delay the window would have used
    await expect(dialog(page)).toHaveCount(0);
    // The time was still filed — only the announcement was dropped.
    expect(await page.evaluate(() => window.__ms?.bestTimes("square", "easy"))).toHaveLength(1);
  });
});

test.describe("best times page", () => {
  test.beforeEach(async ({ page }) => {
    await seedTimes(page, "square|easy", [
      { ms: 41_200, at: 1_700_000_000_000 },
      { ms: 58_000, at: 1_700_000_100_000 },
    ]);
    await page.goto("/");
    await expect(page.locator("body[data-ready]")).toBeVisible();
  });

  test("settings lists the stored times per board and difficulty", async ({ page }) => {
    await page.locator('.menu-header-btn[data-action="settings"]').click();
    const row = page.locator('.menu-entry[data-settings-group="best-times"]');
    await expect(row).toContainText("Best times");
    await expect(row).toContainText("1 board");

    await row.click();
    await expect(page.locator('.menu-entry[data-action="back"]')).toContainText("Best times");
    await expect(page.locator(".settings-heading")).toHaveText("Squares");
    const board = page.locator('.menu-list[data-board="square"]');
    await expect(board.locator(".menu-entry-label")).toHaveText("Easy");
    // Whole seconds, as the header counter showed them.
    await expect(board.locator(".best-time")).toHaveText(["🥇 41s", "🥈 58s"]);
  });

  test("clearing asks first, then empties the list", async ({ page }) => {
    await page.locator('.menu-header-btn[data-action="settings"]').click();
    await page.locator('.menu-entry[data-settings-group="best-times"]').click();

    const clear = page.locator('[data-action="clear-best-times"]');
    await clear.click();
    await expect(clear).toHaveAttribute("data-armed", "1"); // armed, nothing cleared yet
    expect(await page.evaluate(() => window.__ms?.bestTimes("square", "easy"))).toHaveLength(2);

    await clear.click();
    await expect(page.locator('[data-empty="best-times"]')).toBeVisible();
    expect(await page.evaluate(() => window.__ms?.bestTimes("square", "easy"))).toEqual([]);

    // ...and the settings row follows.
    await page.locator('.menu-entry[data-action="back"]').click();
    await expect(page.locator('.menu-entry[data-settings-group="best-times"]')).toContainText(
      "No times yet",
    );
  });

});

test.describe("best times page, fresh install", () => {
  test("is reachable and says so when there is nothing to show", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator("body[data-ready]")).toBeVisible();
    await page.locator('.menu-header-btn[data-action="settings"]').click();
    await expect(page.locator('.menu-entry[data-settings-group="best-times"]')).toContainText(
      "No times yet",
    );
    await page.locator('.menu-entry[data-settings-group="best-times"]').click();
    await expect(page.locator('[data-empty="best-times"]')).toBeVisible();
    // Nothing to clear, so no destructive row.
    await expect(page.locator('[data-action="clear-best-times"]')).toHaveCount(0);
  });
});
