import { describe, expect, it } from "vitest";
import {
  difficulty,
  hasDifficulty,
  hasTheme,
  screens,
  themeSpec,
} from "../../src/config/screens";
import { DEFAULT_THEME, resolveTheme, themePalette, themeVars } from "../../src/ui/theme";

// Smoke + invariant tests for the shared UI-screen config. These guard the
// single source of truth the Python and TS front-ends share against structural
// drift.
describe("UI screen config", () => {
  it("loads with a version and a default palette", () => {
    expect(screens.version).toBeGreaterThan(0);
    expect(hasTheme(screens.defaultTheme)).toBe(true);
    // The app's default *theme* is no longer this file's `defaultTheme`: a
    // theme carries a cell style too, so the web's theme list lives in
    // ui/theme.ts and only borrows the palettes from here. It must still boot
    // into the palette this file (and pygame) call the default.
    expect(themePalette(DEFAULT_THEME)).toEqual(themeSpec(screens.defaultTheme));
  });

  it("uses the modern iOS palette by default (not the classic gray)", () => {
    // Matches the pygame `ios` theme, the default on both front-ends: an airy
    // light field and the system-blue accent rather than #c0c0c0 / navy.
    const ios = themeSpec(screens.defaultTheme);
    expect(ios.background.toLowerCase()).toBe("#f2f2f7");
    expect(ios.panel.toLowerCase()).toBe("#ffffff");
    expect(ios.accent.toLowerCase()).toBe("#0a84ff");
    expect(ios.background.toLowerCase()).not.toBe("#c0c0c0");
  });

  it("carries the ported pygame palettes plus the web-only dark one", () => {
    for (const key of ["ios", "flat", "neumorph", "glass", "paper", "classic", "dark"]) {
      expect(hasTheme(key)).toBe(true);
    }
  });

  it("every theme declares a complete palette", () => {
    for (const [key, spec] of Object.entries(screens.themes)) {
      expect(spec.label, key).toBeTruthy();
      for (const field of [
        "background",
        "panel",
        "text",
        "muted",
        "accent",
        "onAccent",
        "selected",
        "border",
        "danger",
        "counterBg",
      ] as const) {
        // #rgb hex, optionally with an alpha suffix (the glass theme's
        // translucent cards).
        expect(spec[field], `${key}.${field}`).toMatch(/^#[0-9a-f]{6}([0-9a-f]{2})?$/i);
      }
      expect(typeof spec.radius, key).toBe("number");
      expect(spec.shadow, key).toBeTruthy();
    }
  });

  it("themeVars fills every CSS custom property styles.css declares", () => {
    // The :root block in styles.css is only the boot default; applying a theme
    // must overwrite the whole set, or a switch would leave stale colours.
    for (const spec of Object.values(screens.themes)) {
      const vars = themeVars(spec);
      for (const name of [
        "--bg",
        "--bg2",
        "--panel",
        "--panel-blur",
        "--text",
        "--muted",
        "--accent",
        "--on-accent",
        "--selected",
        "--border",
        "--danger",
        "--counter-bg",
        "--radius",
        "--shadow",
      ]) {
        expect(vars[name], `${spec.label} ${name}`).toBeTruthy();
      }
    }
  });

  it("resolveTheme falls back to the default on an unknown key", () => {
    expect(resolveTheme("dark")).toBe("dark");
    expect(resolveTheme("no-such-theme")).toBe(DEFAULT_THEME);
    expect(resolveTheme(null)).toBe(DEFAULT_THEME);
  });

  it("has difficulties and a valid default", () => {
    expect(screens.difficulties.length).toBeGreaterThan(0);
    expect(() => difficulty(screens.defaultDifficulty)).not.toThrow();
    // settings.ts validates a stored difficulty through this.
    expect(hasDifficulty(screens.defaultDifficulty)).toBe(true);
    expect(hasDifficulty("nightmare")).toBe(false);
  });

  it("every HUD slot declares a slot name", () => {
    const slots = [
      ...screens.hud.left,
      ...screens.hud.center,
      ...screens.hud.right,
    ];
    expect(slots.length).toBeGreaterThan(0);
    for (const s of slots) expect(s.slot).toBeTruthy();
  });

  it("menu root keys are unique and typed", () => {
    const keys = screens.menu.root.map((e) => e.key);
    expect(new Set(keys).size).toBe(keys.length);
    for (const e of screens.menu.root) {
      expect(["mode", "surface", "group"]).toContain(e.kind);
    }
  });

  it("provides all four smiley faces", () => {
    for (const face of ["playing", "won", "lost", "pressed"] as const) {
      expect(screens.smiley[face]).toBeTruthy();
    }
  });
});
