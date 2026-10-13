import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  APP_ICONS,
  DEFAULT_APP_ICON,
  appIconUrls,
  resolveAppIcon,
} from "../../src/appIcon";

// The app icon list is stated once (src/appIcon.ts) and three other places have
// to agree with it, none of which the type checker can see: the Icon Composer
// documents in the iOS project, the project's alternate-icon list (the names
// `setAlternateIconName` accepts — a name missing there fails on the phone, and
// only there), and the PNG and SVG the web serves for each icon.

const ROOT = resolve(__dirname, "../../..");
const IOS_APP = resolve(ROOT, "ios/App/App");
const PBXPROJ = readFileSync(resolve(ROOT, "ios/App/App.xcodeproj/project.pbxproj"), "utf8");

describe("app icons", () => {
  it("has unique keys and bundle names, the default first", () => {
    expect(APP_ICONS[0]!.key).toBe(DEFAULT_APP_ICON);
    expect(new Set(APP_ICONS.map((i) => i.key)).size).toBe(APP_ICONS.length);
    expect(new Set(APP_ICONS.map((i) => i.bundle)).size).toBe(APP_ICONS.length);
  });

  it("resolves unknown keys to the default", () => {
    expect(resolveAppIcon(null)).toBe(DEFAULT_APP_ICON);
    expect(resolveAppIcon("heptagon")).toBe(DEFAULT_APP_ICON);
    expect(resolveAppIcon("octagon")).toBe("octagon");
  });

  it("ships an Icon Composer document per icon, with both layers", () => {
    for (const { bundle } of APP_ICONS) {
      const doc = resolve(IOS_APP, `${bundle}.icon`);
      expect(existsSync(resolve(doc, "icon.json")), bundle).toBe(true);
      expect(existsSync(resolve(doc, "Assets/cell.svg")), bundle).toBe(true);
      expect(existsSync(resolve(doc, "Assets/mine.svg")), bundle).toBe(true);
    }
  });

  it("builds every document into the app, the default as the primary icon", () => {
    for (const { bundle } of APP_ICONS) {
      expect(PBXPROJ, bundle).toContain(`/* ${bundle}.icon in Resources */,`);
    }
    const primary = APP_ICONS.find((i) => i.key === DEFAULT_APP_ICON)!.bundle;
    const settings = (key: string): string[] =>
      [...PBXPROJ.matchAll(new RegExp(`${key} = "?([^";]*)"?;`, "g"))].map((m) => m[1]!);
    // Debug and Release, and both must say the same.
    expect(settings("ASSETCATALOG_COMPILER_APPICON_NAME")).toEqual([primary, primary]);
    const alternates = APP_ICONS.filter((i) => i.key !== DEFAULT_APP_ICON)
      .map((i) => i.bundle)
      .join(" ");
    expect(settings("ASSETCATALOG_COMPILER_ALTERNATE_APPICON_NAMES")).toEqual([
      alternates,
      alternates,
    ]);
  });

  it("serves a favicon and a Home Screen icon per icon", () => {
    for (const { key } of APP_ICONS) {
      const { favicon, touch } = appIconUrls(key);
      expect(existsSync(resolve(ROOT, "web/public", favicon)), favicon).toBe(true);
      expect(existsSync(resolve(ROOT, "web/public", touch)), touch).toBe(true);
    }
  });
});
