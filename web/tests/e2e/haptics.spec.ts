import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { expect, test, type Page } from "@playwright/test";

// The iPhone app's buzz, tested without an iPhone.
//
// On a device the WKWebView injects Capacitor's `native-bridge.js` before the
// bundle runs, tells it which plugins the binary carries (`PluginHeaders`), and
// a plugin call then ends as one `postMessage` to the native side. All three
// are reproduced here: the *real* bridge script (read from @capacitor/ios, so
// this tests the code the phone runs rather than a mock of it), headers parsed
// out of the Haptics plugin's own Swift source (so a renamed native method
// fails this test rather than shipping), and a fake
// `webkit.messageHandlers.bridge` that records what it is handed.
// @capacitor/core sniffs that same object to decide it is on iOS, so the app
// takes its native branch exactly as it will on the phone. Without the headers
// it would quietly fall back to the plugin's *web* implementation — which is
// the bug this file exists to catch.
//
// What that proves: losing posts a Taptic *error* notification, winning a
// success one, a flag a light impact — and the Settings › Haptics switch stops
// all of it. Everything past the message handler is Apple's, and the physical
// buzz is what a device check is for.

const require_ = createRequire(import.meta.url);

function fromPackage(pkg: string, path: string): string {
  return readFileSync(
    require_.resolve(`${pkg}/package.json`).replace(/package\.json$/, path),
    "utf8",
  );
}

const NATIVE_BRIDGE = fromPackage(
  "@capacitor/ios",
  "Capacitor/Capacitor/assets/native-bridge.js",
);

/** The plugin's method list, read off its `pluginMethods` table in Swift —
 * the same source the native side builds the real headers from. */
const HAPTICS_METHODS = [
  ...fromPackage(
    "@capacitor/haptics",
    "ios/Sources/HapticsPlugin/HapticsPlugin.swift",
  ).matchAll(/CAPPluginMethod\(name: "(\w+)"/g),
].map((m) => ({ name: m[1] as string, rtype: "promise" }));

interface BridgeCall {
  pluginId: string;
  methodName: string;
  options: Record<string, unknown>;
}

declare global {
  interface Window {
    __taptic?: BridgeCall[];
  }
}

/** Boot the page as the native shell does: the real bridge over a recording
 * message handler. Must run before the app bundle, hence addInitScript. */
async function asNativeApp(page: Page): Promise<void> {
  await page.addInitScript(() => {
    window.__taptic = [];
    // What a WKWebView exposes. Capacitor reads `webkit.messageHandlers.bridge`
    // both to detect iOS and to reach the native side.
    (window as unknown as { webkit: unknown }).webkit = {
      messageHandlers: {
        bridge: {
          postMessage: (msg: BridgeCall) => window.__taptic?.push(msg),
        },
      },
    };
  });
  await page.addInitScript({ content: NATIVE_BRIDGE });
  // What the Swift bridge posts into the page once the plugins are registered.
  // `registerPlugin` consults this list: a plugin missing from it is served by
  // its *web* implementation instead, native platform or not.
  await page.addInitScript((methods: { name: string; rtype: string }[]) => {
    const cap = (window as unknown as { Capacitor: { PluginHeaders?: unknown } })
      .Capacitor;
    cap.PluginHeaders = [{ name: "Haptics", methods }];
  }, HAPTICS_METHODS);
}

function taptic(page: Page): Promise<BridgeCall[]> {
  return page.evaluate(() =>
    (window.__taptic ?? [])
      .filter((c) => c.pluginId === "Haptics")
      .map((c) => ({
        pluginId: c.pluginId,
        methodName: c.methodName,
        options: c.options,
      })),
  );
}

test.describe("iOS haptics through the Capacitor bridge", () => {
  test.beforeEach(async ({ page }) => {
    await asNativeApp(page);
    await page.setViewportSize({ width: 900, height: 700 });
    await page.goto("/");
    await expect(page.locator("body[data-ready]")).toBeVisible();
  });

  test("the app knows it is running natively", async ({ page }) => {
    expect(
      await page.evaluate(
        () =>
          (window as unknown as { Capacitor?: { getPlatform(): string } }).Capacitor?.getPlatform(),
      ),
    ).toBe("ios");
  });

  test("stepping on a mine asks for the error buzz", async ({ page }) => {
    await page.evaluate(() => window.__ms?.startBoard("square", "easy", { mines: ["4,4"] }));
    const xy = await page.evaluate(() => window.__ms?.cellScreenXY("4,4"));
    await page.mouse.click(xy!.x, xy!.y);
    expect(await page.evaluate(() => window.__ms?.state().status)).toBe("lost");
    // The whole point of the native app: a *weighted* buzz, which the web has
    // no way to ask an iPhone for.
    expect(await taptic(page)).toContainEqual({
      pluginId: "Haptics",
      methodName: "notification",
      options: { type: "ERROR" },
    });
  });

  test("clearing the board asks for the success buzz", async ({ page }) => {
    await page.evaluate(() => window.__ms?.startBoard("square", "easy", { mines: ["0,0"] }));
    const xy = await page.evaluate(() => window.__ms?.cellScreenXY("8,8"));
    await page.mouse.click(xy!.x, xy!.y);
    expect(await page.evaluate(() => window.__ms?.state().status)).toBe("won");
    expect(await taptic(page)).toContainEqual({
      pluginId: "Haptics",
      methodName: "notification",
      options: { type: "SUCCESS" },
    });
  });

  test("an achievement asks for its own tap, beside the win's buzz", async ({ page }) => {
    // A first win unlocks several things at once, so the same board that posts
    // the success notification posts the unlock impact too — two calls for one
    // move, which is the whole reason the unlock is an *impact* rather than a
    // second notification: they have to be told apart through a fingertip.
    await page.evaluate(() => window.__ms?.startBoard("square", "easy", { mines: ["0,0"] }));
    const xy = await page.evaluate(() => window.__ms?.cellScreenXY("8,8"));
    await page.mouse.click(xy!.x, xy!.y);
    expect(await page.evaluate(() => window.__ms?.state().status)).toBe("won");
    const calls = await taptic(page);
    expect(calls).toContainEqual({
      pluginId: "Haptics",
      methodName: "notification",
      options: { type: "SUCCESS" },
    });
    expect(calls).toContainEqual({
      pluginId: "Haptics",
      methodName: "impact",
      options: { style: "MEDIUM" },
    });
  });

  test("planting a flag ticks, and only ticks", async ({ page }) => {
    await page.evaluate(() => window.__ms?.startBoard("square", "easy", { mines: ["4,4"] }));
    await page.evaluate(() => window.__ms?.flag("4,4"));
    const calls = await taptic(page);
    expect(calls).toEqual([
      { pluginId: "Haptics", methodName: "impact", options: { style: "LIGHT" } },
    ]);
  });

  test("the Haptics switch silences the bridge", async ({ page }) => {
    await page.locator('.menu-header-btn[data-action="settings"]').click();
    const toggle = page.locator('.menu-entry[data-setting="haptics"]');
    await expect(toggle).toHaveAttribute("aria-checked", "true");
    await toggle.click();
    await expect(toggle).toHaveAttribute("aria-checked", "false");

    await page.evaluate(() => window.__ms?.startBoard("square", "easy", { mines: ["4,4"] }));
    await page.evaluate(() => window.__ms?.flag("0,0"));
    const xy = await page.evaluate(() => window.__ms?.cellScreenXY("4,4"));
    await page.mouse.click(xy!.x, xy!.y);
    expect(await page.evaluate(() => window.__ms?.state().status)).toBe("lost");
    expect(await taptic(page)).toEqual([]);

    // And the choice survives a reload, like every other setting.
    await page.reload();
    await expect(page.locator("body[data-ready]")).toBeVisible();
    await page.locator('.menu-header-btn[data-action="settings"]').click();
    await expect(page.locator('.menu-entry[data-setting="haptics"]')).toHaveAttribute(
      "aria-checked",
      "false",
    );
  });
});

test.describe("in a plain browser tab", () => {
  test("the platform is plain web, and no haptics row is offered", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator("body[data-ready]")).toBeVisible();
    expect(
      await page.evaluate(
        () =>
          (window as unknown as { Capacitor?: { getPlatform(): string } }).Capacitor?.getPlatform(),
      ),
    ).toBe("web");
    // Chromium *defines* navigator.vibrate on this desktop runner, and it
    // shakes nothing — which is the whole reason the row is gated on the form
    // factor and not on the API. A desktop browser, and iOS Safari (which has
    // no web haptic at all), get no switch; an Android phone still does.
    await page.locator('.menu-header-btn[data-action="settings"]').click();
    await expect(page.locator('.menu-entry[data-setting="haptics"]')).toHaveCount(0);
  });

  test("an Android phone still gets the row", async ({ browser }) => {
    const context = await browser.newContext({
      userAgent:
        "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Mobile Safari/537.36",
      hasTouch: true,
      isMobile: true,
      viewport: { width: 412, height: 915 },
    });
    const page = await context.newPage();
    await page.goto("/");
    await expect(page.locator("body[data-ready]")).toBeVisible();
    await page.locator('.menu-header-btn[data-action="settings"]').click();
    await expect(page.locator('.menu-entry[data-setting="haptics"]')).toContainText(
      "Haptics",
    );
    await context.close();
  });
});
