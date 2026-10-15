import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test, type Page } from "@playwright/test";

// Game Center, tested without an Apple device.
//
// Built the way haptics.spec.ts is: Capacitor's *real* `native-bridge.js`, the
// plugin headers parsed out of the native plugin's own Swift source (so a
// renamed method fails here rather than shipping), and a fake
// `webkit.messageHandlers.bridge` that records each call. This one also
// *answers*: Game Center's sign-in is a promise the page waits on, so the fake
// resolves `authenticate` through `Capacitor.fromNative`, the way the Swift
// bridge does, and can post an `authChange` event later.
//
// What that proves: the app signs in at launch and catches Game Center up with
// the record, quietly; a win reports what it unlocked with banners; the game's
// own unlock list and its link stand aside; and Settings opens Game Center.
// Everything past the message handler — the sheet, the banners, Game Center
// itself — is Apple's, and a device check is what covers it.

const require_ = createRequire(import.meta.url);
const HERE = path.dirname(fileURLToPath(import.meta.url));

const NATIVE_BRIDGE = readFileSync(
  require_.resolve("@capacitor/ios/package.json").replace(
    /package\.json$/,
    "Capacitor/Capacitor/assets/native-bridge.js",
  ),
  "utf8",
);

/** The plugin's header as the Swift bridge builds it (JSExport.swift's
 * `createPluginHeader`): the methods every plugin gets — the listener ones are
 * what `authChange` arrives through — then its own, read off its
 * `pluginMethods` table in Swift. */
const GAME_CENTER_METHODS: { name: string; rtype?: string }[] = [
  { name: "addListener" },
  { name: "removeListener" },
  { name: "removeAllListeners", rtype: "promise" },
  { name: "checkPermissions", rtype: "promise" },
  { name: "requestPermissions", rtype: "promise" },
  ...[...readFileSync(
    path.resolve(HERE, "../../../ios/App/App/GameCenterPlugin.swift"),
    "utf8",
  ).matchAll(/CAPPluginMethod\(name: "(\w+)"/g)].map((m) => ({
    name: m[1] as string,
    rtype: "promise",
  })),
];

interface BridgeCall {
  callbackId: string;
  pluginId: string;
  methodName: string;
  options: Record<string, unknown>;
}

interface Report {
  achievements: { id: string; percent: number }[];
  banner: boolean;
}

declare global {
  interface Window {
    __gc?: BridgeCall[];
    __gcSignedIn?: boolean;
  }
}

/** Boot as the app does, with Game Center answering `signedIn`. */
async function asNativeApp(page: Page, signedIn = true): Promise<void> {
  await page.addInitScript((signed: boolean) => {
    window.__gc = [];
    window.__gcSignedIn = signed;
    (window as unknown as { webkit: unknown }).webkit = {
      messageHandlers: {
        bridge: {
          postMessage: (msg: BridgeCall) => {
            if (msg.pluginId !== "GameCenter") return;
            window.__gc?.push(msg);
            // Answer like the native side: asynchronously, through fromNative.
            const cap = (window as unknown as {
              Capacitor: { fromNative(result: unknown): void };
            }).Capacitor;
            const reply = (data: unknown) =>
              setTimeout(() =>
                cap.fromNative({
                  callbackId: msg.callbackId,
                  pluginId: msg.pluginId,
                  methodName: msg.methodName,
                  success: true,
                  data,
                }),
              );
            if (msg.methodName === "authenticate") {
              reply({ authenticated: window.__gcSignedIn });
            } else if (msg.methodName !== "addListener") {
              reply({});
            }
          },
        },
      },
    };
  }, signedIn);
  await page.addInitScript({ content: NATIVE_BRIDGE });
  await page.addInitScript((methods: { name: string; rtype?: string }[]) => {
    const cap = (window as unknown as { Capacitor: { PluginHeaders?: unknown } }).Capacitor;
    cap.PluginHeaders = [{ name: "GameCenter", methods }];
  }, GAME_CENTER_METHODS);
}

function calls(page: Page, method: string): Promise<BridgeCall[]> {
  return page.evaluate(
    (name) => (window.__gc ?? []).filter((c) => c.methodName === name),
    method,
  );
}

async function reports(page: Page): Promise<Report[]> {
  return (await calls(page, "report")).map((c) => c.options as unknown as Report);
}

/** Every id sent in reports with `banner` set as given. */
async function reportedIds(page: Page, banner: boolean): Promise<string[]> {
  return (await reports(page))
    .filter((r) => r.banner === banner)
    .flatMap((r) => r.achievements.map((a) => a.id));
}

/** Boot with history: one win on the fixture board, already filed. */
async function seedOneWin(page: Page): Promise<void> {
  await page.addInitScript(() =>
    localStorage.setItem(
      "ms:achievements",
      JSON.stringify({
        version: 1,
        wins: { square: { easy: 1 } },
        shapes: [4],
        flagless: 0,
        unlocked: {},
      }),
    ),
  );
}

/** Boot with three fast times on the fixture board, so a win there places
 * nowhere and the record window has no time to announce. */
async function seedUnbeatableTimes(page: Page): Promise<void> {
  await page.addInitScript(() =>
    localStorage.setItem(
      "ms:scores",
      JSON.stringify({
        version: 1,
        boards: { "square|easy": [1, 2, 3].map((ms) => ({ ms, at: 1 })) },
      }),
    ),
  );
}

async function boot(page: Page): Promise<void> {
  await page.setViewportSize({ width: 900, height: 700 });
  await page.goto("/");
  await expect(page.locator("body[data-ready]")).toBeVisible();
}

/** The fixture win: one mine in the corner, so the far corner floods the rest.
 * A first win on a fresh device unlocks several achievements at once. */
async function winFixtureBoard(page: Page): Promise<void> {
  await page.evaluate(() => window.__ms?.startBoard("square", "easy", { mines: ["0,0"] }));
  const xy = await page.evaluate(() => window.__ms?.cellScreenXY("8,8"));
  await page.mouse.click(xy!.x, xy!.y);
  expect(await page.evaluate(() => window.__ms?.state().status)).toBe("won");
}

const scoreDialog = (page: Page) => page.locator('[data-dialog="score"]');

test.describe("Game Center through the Capacitor bridge", () => {
  test("signs in at launch and catches Game Center up, without banners", async ({ page }) => {
    await asNativeApp(page);
    await seedOneWin(page);
    await boot(page);
    expect(await calls(page, "authenticate")).toHaveLength(1);
    await expect.poll(() => reportedIds(page, false)).toContain("hs.first_win");
    const quiet = (await reports(page)).flatMap((r) => r.achievements);
    expect(quiet).toContainEqual({ id: "hs.wins.10", percent: 10 });
    expect(await reportedIds(page, true)).toEqual([]);
  });

  test("a win reports what it unlocked, with banners", async ({ page }) => {
    await asNativeApp(page);
    await boot(page);
    await winFixtureBoard(page);
    await expect.poll(() => reportedIds(page, true)).toContain("hs.first_win");
    const banners = await reportedIds(page, true);
    expect(banners).toEqual(
      expect.arrayContaining(["hs.difficulty.easy", "hs.shape.4", "hs.tiling.regular"]),
    );
    // Progress that is not an unlock goes along quietly.
    expect(await reportedIds(page, false)).toContain("hs.wins.10");
    expect(banners).not.toContain("hs.wins.10");
  });

  test("the record window keeps the time and leaves the unlocks out", async ({ page }) => {
    await asNativeApp(page);
    await boot(page);
    await winFixtureBoard(page);
    // A first time on the board places, so the card still opens for that.
    await expect(scoreDialog(page)).toBeVisible();
    await expect(page.locator("#score-dialog-title")).toHaveText("New best time!");
    await expect(page.locator(".dialog-unlock")).toHaveCount(0);
    await expect(page.locator('[data-action="show-achievements"]')).toHaveCount(0);
  });

  test("a win that places nowhere opens no card at all", async ({ page }) => {
    await asNativeApp(page);
    await seedUnbeatableTimes(page);
    await boot(page);
    await winFixtureBoard(page);
    // The unlocks still went to Game Center — that is where they are said now.
    // (Not the first win: the record seeded itself from those best times, so
    // this win's unlocks are the ones a time cannot carry — its shape.)
    await expect.poll(() => reportedIds(page, true)).toContain("hs.shape.4");
    await expect(scoreDialog(page)).toHaveCount(0);
  });

  test("signed out, nothing is sent until Game Center says the player signed in", async ({
    page,
  }) => {
    await asNativeApp(page, false);
    await seedOneWin(page);
    await boot(page);
    await winFixtureBoard(page);
    // Give the page every chance to have sent something.
    await page.waitForTimeout(200);
    expect(await reports(page)).toEqual([]);

    // The player signs in from the system's settings: the native side posts
    // `authChange` to the listener the page registered at launch.
    await page.evaluate(() => {
      const listener = (window.__gc ?? []).find((c) => c.methodName === "addListener");
      const cap = (window as unknown as { Capacitor: { fromNative(result: unknown): void } })
        .Capacitor;
      cap.fromNative({
        callbackId: listener!.callbackId,
        pluginId: "GameCenter",
        methodName: "addListener",
        success: true,
        save: true,
        data: { authenticated: true },
      });
    });
    // The catch-up carries both wins, the seeded one and the one just played,
    // and announces neither.
    await expect.poll(() => reportedIds(page, false)).toContain("hs.first_win");
    const quiet = (await reports(page)).flatMap((r) => r.achievements);
    expect(quiet).toContainEqual({ id: "hs.wins.10", percent: 20 });
    expect(await reportedIds(page, true)).toEqual([]);
  });

  test("Settings opens Game Center instead of the game's own list", async ({ page }) => {
    await asNativeApp(page);
    await boot(page);
    await page.locator('.menu-header-btn[data-action="settings"]').click();
    await expect(page.locator('[data-settings-group="achievements"]')).toHaveCount(0);
    const row = page.locator('[data-settings-group="game-center"]');
    await expect(row).toContainText("Game Center");
    await row.click();
    await expect.poll(async () => (await calls(page, "showAchievements")).length).toBe(1);
    // Still on the settings page: Game Center opens over the app.
    await expect(page.locator('[data-settings-group="game-center"]')).toBeVisible();
  });
});

test.describe("without the Game Center plugin", () => {
  test("the game's own achievements are where they were", async ({ page }) => {
    await boot(page);
    await page.locator('.menu-header-btn[data-action="settings"]').click();
    await expect(page.locator('[data-settings-group="achievements"]')).toContainText(
      "Achievements",
    );
    await expect(page.locator('[data-settings-group="game-center"]')).toHaveCount(0);
    await winFixtureBoard(page);
    await expect(page.locator(".dialog-unlock").first()).toBeVisible();
  });
});
