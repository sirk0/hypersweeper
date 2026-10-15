import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test, type Page } from "@playwright/test";

// The iCloud record, tested without an Apple device.
//
// Built the way gameCenter.spec.ts is: Capacitor's *real* `native-bridge.js`,
// the plugin's methods parsed out of its own Swift source, and a fake
// `webkit.messageHandlers.bridge` that plays iCloud's key-value store — `read`
// answers with what the fake store holds, `write` changes it — so the page's
// whole round trip runs. The merge itself is unit tested
// (tests/unit/cloudRecord.test.ts); what this proves is that the page reaches
// the plugin at launch, after a win and on a change from iCloud, and that what
// it reads lands in the best times.

const require_ = createRequire(import.meta.url);
const HERE = path.dirname(fileURLToPath(import.meta.url));

const NATIVE_BRIDGE = readFileSync(
  require_.resolve("@capacitor/ios/package.json").replace(
    /package\.json$/,
    "Capacitor/Capacitor/assets/native-bridge.js",
  ),
  "utf8",
);

const CLOUD_METHODS: { name: string; rtype?: string }[] = [
  { name: "addListener" },
  { name: "removeListener" },
  { name: "removeAllListeners", rtype: "promise" },
  { name: "checkPermissions", rtype: "promise" },
  { name: "requestPermissions", rtype: "promise" },
  ...[...readFileSync(
    path.resolve(HERE, "../../../ios/App/App/CloudRecordPlugin.swift"),
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

declare global {
  interface Window {
    __icloud?: Record<string, string>;
    __icloudCalls?: BridgeCall[];
    /** iCloud unreachable: every call fails. */
    __icloudDown?: boolean;
  }
}

/** Boot as the app does, with iCloud holding `store`. */
async function asNativeApp(page: Page, store: Record<string, string> = {}): Promise<void> {
  await page.addInitScript((initial: Record<string, string>) => {
    window.__icloud = { ...initial };
    window.__icloudCalls = [];
    (window as unknown as { webkit: unknown }).webkit = {
      messageHandlers: {
        bridge: {
          postMessage: (msg: BridgeCall) => {
            if (msg.pluginId !== "CloudRecord") return;
            window.__icloudCalls?.push(msg);
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
            if (window.__icloudDown && msg.methodName !== "addListener") {
              setTimeout(() =>
                cap.fromNative({
                  callbackId: msg.callbackId,
                  pluginId: msg.pluginId,
                  methodName: msg.methodName,
                  success: false,
                  error: { message: "iCloud unavailable" },
                }),
              );
            } else if (msg.methodName === "read") {
              reply({ values: { ...window.__icloud } });
            } else if (msg.methodName === "write") {
              const values = msg.options["values"] as Record<string, string | null>;
              for (const [key, value] of Object.entries(values)) {
                if (value === null) delete window.__icloud![key];
                else window.__icloud![key] = value;
              }
              reply({});
            }
          },
        },
      },
    };
  }, store);
  await page.addInitScript({ content: NATIVE_BRIDGE });
  await page.addInitScript((methods: { name: string; rtype?: string }[]) => {
    const cap = (window as unknown as { Capacitor: { PluginHeaders?: unknown } }).Capacitor;
    cap.PluginHeaders = [{ name: "CloudRecord", methods }];
  }, CLOUD_METHODS);
}

async function boot(page: Page): Promise<void> {
  await page.setViewportSize({ width: 900, height: 700 });
  await page.goto("/");
  await expect(page.locator("body[data-ready]")).toBeVisible();
}

function calls(page: Page, method: string): Promise<BridgeCall[]> {
  return page.evaluate(
    (name) => (window.__icloudCalls ?? []).filter((c) => c.methodName === name),
    method,
  );
}

async function winFixtureBoard(page: Page): Promise<void> {
  await page.evaluate(() => window.__ms?.startBoard("square", "easy", { mines: ["0,0"] }));
  const xy = await page.evaluate(() => window.__ms?.cellScreenXY("8,8"));
  await page.mouse.click(xy!.x, xy!.y);
  expect(await page.evaluate(() => window.__ms?.state().status)).toBe("won");
}

/** The app coming back to the foreground. */
async function resume(page: Page): Promise<void> {
  await page.evaluate(() => document.dispatchEvent(new Event("visibilitychange")));
}

const cloudKeys = (page: Page) => page.evaluate(() => Object.keys(window.__icloud ?? {}).sort());

function localTimes(page: Page, key: string): Promise<number[]> {
  return page.evaluate((board) => {
    const rec = JSON.parse(localStorage.getItem("ms:scores") ?? "{}") as {
      boards?: Record<string, { ms: number }[]>;
    };
    return (rec.boards?.[board] ?? []).map((e) => e.ms);
  }, key);
}

/** What another install left in iCloud: two times on the square board and
 * the two wins they came from. */
const ANOTHER_DEVICE: Record<string, string> = {
  scores: JSON.stringify({
    v: 1,
    boards: { "square|easy": [{ ms: 21_000, at: 1000 }, { ms: 34_000, at: 900 }] },
  }),
  "wins.0123456789abcdef": JSON.stringify({
    v: 1,
    since: 0,
    wins: { square: { easy: 2 } },
    flagless: 0,
    shapes: [4],
    unlocked: { first_win: 900 },
  }),
};

test.describe("the iCloud record through the Capacitor bridge", () => {
  test("a fresh install takes the record iCloud holds", async ({ page }) => {
    await asNativeApp(page, ANOTHER_DEVICE);
    await boot(page);
    await expect.poll(() => localTimes(page, "square|easy")).toEqual([21_000, 34_000]);
    const record = await page.evaluate(
      () => JSON.parse(localStorage.getItem("ms:achievements") ?? "{}") as Record<string, unknown>,
    );
    expect(record["wins"]).toEqual({ square: { easy: 2 } });
    // Nothing of its own yet, so nothing written.
    expect(await calls(page, "write")).toEqual([]);

    // …and the best-times page shows them.
    await page.locator('.menu-header-btn[data-action="settings"]').click();
    await page.locator('[data-settings-group="best-times"]').click();
    await expect(page.locator(".best-times")).toContainText("21");
  });

  test("a win is written to iCloud", async ({ page }) => {
    await asNativeApp(page);
    await boot(page);
    await expect.poll(async () => (await calls(page, "read")).length).toBe(1);
    await winFixtureBoard(page);
    await expect.poll(() => cloudKeys(page)).toEqual([
      "scores",
      expect.stringMatching(/^wins\.[0-9a-f]{16}$/),
    ]);
    const own = await page.evaluate(() => {
      const key = Object.keys(window.__icloud!).find((k) => k.startsWith("wins."))!;
      return JSON.parse(window.__icloud![key]!) as { wins: unknown };
    });
    expect(own.wins).toEqual({ square: { easy: 1 } });
  });

  test("a change from another device is merged in", async ({ page }) => {
    await asNativeApp(page);
    await boot(page);
    await expect.poll(async () => (await calls(page, "read")).length).toBe(1);
    expect(await localTimes(page, "square|easy")).toEqual([]);

    // iCloud delivers another device's write: the native side posts `change`
    // to the listener the page registered at launch.
    await page.evaluate((store) => {
      Object.assign(window.__icloud!, store);
      const listener = (window.__icloudCalls ?? []).find((c) => c.methodName === "addListener");
      const cap = (window as unknown as { Capacitor: { fromNative(result: unknown): void } })
        .Capacitor;
      cap.fromNative({
        callbackId: listener!.callbackId,
        pluginId: "CloudRecord",
        methodName: "addListener",
        success: true,
        save: true,
        data: { keys: Object.keys(store) },
      });
    }, ANOTHER_DEVICE);
    await expect.poll(() => localTimes(page, "square|easy")).toEqual([21_000, 34_000]);
  });
});

test.describe("the iCloud record, with iCloud out of reach", () => {
  test("the game plays and records as before, and syncs once iCloud is back", async ({
    page,
  }) => {
    await asNativeApp(page);
    await page.addInitScript(() => {
      window.__icloudDown = true;
    });
    await boot(page);
    await expect.poll(async () => (await calls(page, "read")).length).toBe(1);

    // A win with iCloud failing every call: filed locally, card and all.
    await winFixtureBoard(page);
    await expect(page.locator('[data-dialog="score"]')).toBeVisible();
    expect(await localTimes(page, "square|easy")).toHaveLength(1);
    await expect.poll(async () => (await calls(page, "read")).length).toBe(2);
    expect(await page.evaluate(() => window.__icloud)).toEqual({});

    // Back online, and back to the app: the record goes up.
    await page.evaluate(() => {
      window.__icloudDown = false;
    });
    await resume(page);
    await expect.poll(() => cloudKeys(page)).toEqual([
      "scores",
      expect.stringMatching(/^wins\.[0-9a-f]{16}$/),
    ]);
  });

  test("coming back to the app picks up what arrived meanwhile", async ({ page }) => {
    await asNativeApp(page);
    await boot(page);
    await expect.poll(async () => (await calls(page, "read")).length).toBe(1);
    // iCloud's cache filled while the app was away, with no change event.
    await page.evaluate((store) => Object.assign(window.__icloud!, store), ANOTHER_DEVICE);
    await resume(page);
    await expect.poll(() => localTimes(page, "square|easy")).toEqual([21_000, 34_000]);
  });
});

test.describe("without the iCloud plugin", () => {
  test("nothing is synced and nothing is stored for it", async ({ page }) => {
    await boot(page);
    expect(await page.evaluate(() => localStorage.getItem("ms:cloud"))).toBeNull();
  });
});
