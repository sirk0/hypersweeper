import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test, type Page } from "@playwright/test";

// The iPhone app's native half, tested without an iPhone: the buzz, the rating
// prompt and the stars in iCloud.
//
// Built as Hypersweeper's haptics.spec.ts and cloudRecord.spec.ts are:
// Capacitor's *real* `native-bridge.js` (read from @capacitor/ios, so this
// tests the code the phone runs), each plugin's methods parsed out of its own
// Swift source (so a renamed native method fails here rather than shipping),
// and a fake `webkit.messageHandlers.bridge` that records every call and plays
// iCloud's key-value store and StoreKit. @capacitor/core sniffs that object to
// decide it is on iOS, so the page takes its native branch exactly as on the
// phone. A plugin missing from the headers would quietly fall back to its web
// implementation — the bug this file exists to catch.

const require_ = createRequire(import.meta.url);
const HERE = path.dirname(fileURLToPath(import.meta.url));
const SWIFT = path.resolve(HERE, "../../ios/App/App");

function fromPackage(pkg: string, file: string): string {
  return readFileSync(
    require_.resolve(`${pkg}/package.json`).replace(/package\.json$/, file),
    "utf8",
  );
}

const NATIVE_BRIDGE = fromPackage("@capacitor/ios", "Capacitor/Capacitor/assets/native-bridge.js");

/** A plugin's method list, read off its `pluginMethods` table in Swift. */
function methodsOf(swift: string): { name: string; rtype?: string }[] {
  return [...swift.matchAll(/CAPPluginMethod\(name: "(\w+)"/g)].map((m) => ({
    name: m[1] as string,
    rtype: "promise",
  }));
}

/** Every plugin listens the Capacitor way too. */
const LISTENING = [
  { name: "addListener" },
  { name: "removeListener" },
  { name: "removeAllListeners", rtype: "promise" },
];

const HEADERS = [
  {
    name: "Haptics",
    methods: methodsOf(
      fromPackage("@capacitor/haptics", "ios/Sources/HapticsPlugin/HapticsPlugin.swift"),
    ),
  },
  {
    name: "CloudRecord",
    methods: [
      ...LISTENING,
      ...methodsOf(readFileSync(path.join(SWIFT, "CloudRecordPlugin.swift"), "utf8")),
    ],
  },
  {
    name: "Review",
    methods: methodsOf(readFileSync(path.join(SWIFT, "ReviewPlugin.swift"), "utf8")),
  },
];

interface BridgeCall {
  callbackId: string;
  pluginId: string;
  methodName: string;
  options: Record<string, unknown>;
}

declare global {
  interface Window {
    __native?: BridgeCall[];
    __icloud?: Record<string, string>;
  }
}

/** Boot the page as the iPhone app does, iCloud holding `store`. Must run
 * before the bundle, hence addInitScript. */
async function asIPhoneApp(
  page: Page,
  store: Record<string, string> = {},
  device = "phone",
): Promise<void> {
  await page.addInitScript(
    ({ initial, device }) => {
      window.__native = [];
      window.__icloud = { ...initial };
      // What BridgeViewController.swift tells the page before any script runs.
      (window as unknown as { reptilesDevice: string }).reptilesDevice = device;
      (window as unknown as { webkit: unknown }).webkit = {
        messageHandlers: {
          bridge: {
            postMessage: (msg: BridgeCall) => {
              window.__native?.push(msg);
              const cap = (
                window as unknown as { Capacitor: { fromNative(result: unknown): void } }
              ).Capacitor;
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
              if (msg.pluginId === "CloudRecord" && msg.methodName === "read") {
                reply({ values: { ...window.__icloud } });
              } else if (msg.pluginId === "CloudRecord" && msg.methodName === "write") {
                const values = msg.options["values"] as Record<string, string | null>;
                for (const [key, value] of Object.entries(values)) {
                  if (value === null) delete window.__icloud![key];
                  else window.__icloud![key] = value;
                }
                reply({});
              } else if (msg.methodName !== "addListener") {
                reply({});
              }
            },
          },
        },
      };
    },
    { initial: store, device },
  );
  await page.addInitScript({ content: NATIVE_BRIDGE });
  await page.addInitScript((headers: unknown) => {
    (window as unknown as { Capacitor: { PluginHeaders?: unknown } }).Capacitor.PluginHeaders =
      headers;
  }, HEADERS);
}

/** The calls made to one plugin, without their callback ids. */
function callsTo(page: Page, plugin: string): Promise<Omit<BridgeCall, "callbackId">[]> {
  return page.evaluate(
    (id) =>
      (window.__native ?? [])
        .filter((c) => c.pluginId === id)
        .map((c) => ({ pluginId: c.pluginId, methodName: c.methodName, options: c.options })),
    plugin,
  );
}

const taptic = (page: Page) => callsTo(page, "Haptics");

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

/** Cover the squares level, 4 × 4, one tile at a time. */
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

test.describe("haptics through the Capacitor bridge", () => {
  test("the app knows it is running natively", async ({ page }) => {
    await asIPhoneApp(page);
    await page.goto("/");
    expect(
      await page.evaluate(() =>
        (window as unknown as { Capacitor?: { getPlatform(): string } }).Capacitor?.getPlatform(),
      ),
    ).toBe("ios");
  });

  test("a tile landing taps, and only taps", async ({ page }) => {
    await asIPhoneApp(page);
    await page.goto("/?level=squares");
    await dropOneSquare(page);
    expect(await taptic(page)).toEqual([
      { pluginId: "Haptics", methodName: "impact", options: { style: "MEDIUM" } },
    ]);
  });

  test("a finished board asks for the success buzz, in place of the last tap", async ({ page }) => {
    await asIPhoneApp(page);
    await page.goto("/?level=squares");
    await finishSquares(page);
    const calls = await taptic(page);
    expect(calls.filter((c) => c.methodName === "impact")).toHaveLength(15);
    expect(calls.filter((c) => c.methodName === "notification")).toEqual([
      { pluginId: "Haptics", methodName: "notification", options: { type: "SUCCESS" } },
    ]);
    expect(calls.at(-1)?.methodName).toBe("notification");
  });

  test("the Haptics switch silences the bridge, and is kept", async ({ page }) => {
    await asIPhoneApp(page);
    await page.goto("/?settings");
    const toggle = page.locator('[data-setting="haptics"]');
    await expect(toggle).toHaveAttribute("aria-checked", "true");
    await toggle.click();
    await expect(toggle).toHaveAttribute("aria-checked", "false");

    await page.goto("/?level=squares");
    await dropOneSquare(page);
    expect(await taptic(page)).toEqual([]);

    await page.goto("/?settings");
    await expect(page.locator('[data-setting="haptics"]')).toHaveAttribute("aria-checked", "false");
  });

  test("an iPad, which has no Taptic Engine, gets no row and no buzz", async ({ page }) => {
    await asIPhoneApp(page, {}, "pad");
    await page.goto("/?settings");
    await expect(page.locator("#settings")).toBeVisible();
    await expect(page.locator('[data-setting="haptics"]')).toHaveCount(0);
    await page.goto("/?level=squares");
    await dropOneSquare(page);
    expect(await taptic(page)).toEqual([]);
  });
});

test.describe("in a plain browser tab", () => {
  test("no haptics row is offered on a desktop", async ({ page }) => {
    // Chromium *defines* navigator.vibrate on this desktop runner, and it
    // shakes nothing — why the row is gated on the form factor, not the API.
    await page.goto("/?settings");
    await expect(page.locator("#settings")).toBeVisible();
    await expect(page.locator('[data-setting="haptics"]')).toHaveCount(0);
  });

  test("an Android phone gets the row", async ({ browser }) => {
    const context = await browser.newContext({
      userAgent:
        "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Mobile Safari/537.36",
      hasTouch: true,
      isMobile: true,
      viewport: { width: 412, height: 915 },
    });
    const page = await context.newPage();
    await page.goto("/?settings");
    await expect(page.locator('[data-setting="haptics"]')).toContainText("Haptics");
    await context.close();
  });
});

test.describe("the rating prompt", () => {
  test("is asked for once, after the third finished board", async ({ page }) => {
    await asIPhoneApp(page);
    for (let i = 0; i < 2; i++) {
      await page.goto("/?level=squares");
      await finishSquares(page);
    }
    await page.waitForTimeout(1800);
    expect(await callsTo(page, "Review")).toEqual([]);
    await page.goto("/?level=squares");
    await finishSquares(page);
    await expect.poll(() => callsTo(page, "Review")).toHaveLength(1);
    // a fourth asks nothing (each page load starts the record of calls afresh)
    await page.goto("/?level=squares");
    await finishSquares(page);
    await page.waitForTimeout(1800);
    expect(await callsTo(page, "Review")).toEqual([]);
  });
});

test.describe("the stars in iCloud", () => {
  test("another device's stars arrive at launch, and this one's go up", async ({ page }) => {
    await asIPhoneApp(page, { stars: JSON.stringify({ cairo: 3, squares: 1 }) });
    await page.goto("/?level=squares");
    await expect
      .poll(() => page.evaluate(() => localStorage.getItem("rep-tiles.stars")))
      .toContain('"cairo":3');

    await finishSquares(page);
    await expect
      .poll(() => page.evaluate(() => JSON.parse(window.__icloud?.["stars"] ?? "{}")))
      .toEqual({ cairo: 3, squares: 3 });
  });

  test("nothing reaches for iCloud in a plain browser tab", async ({ page }) => {
    await page.goto("/?level=squares");
    await finishSquares(page);
    expect(await page.evaluate(() => window.__native)).toBeUndefined();
  });
});
