import { describe, expect, it, vi } from "vitest";
import {
  difficulty,
  hasDifficulty,
  hasTheme,
  screens,
  themeSpec,
} from "../../src/config/screens";
import {
  activeScheme,
  DEFAULT_SCHEME,
  DEFAULT_THEME,
  onSchemeChange,
  resolveScheme,
  resolveTheme,
  THEME_KEYS,
  themePalette,
  themeVars,
} from "../../src/ui/theme";

// Smoke + invariant tests for the shared UI-screen config. These guard the
// single source of truth the Python and TS front-ends share against structural
// drift.
describe("UI screen config", () => {
  it("loads with a version and a default palette", () => {
    expect(screens.version).toBeGreaterThan(0);
    expect(hasTheme(screens.defaultTheme)).toBe(true);
    // The app's default *theme* is no longer this file's `defaultTheme`: a
    // theme carries a cell style and a palette per colour scheme, so the web's
    // theme list lives in ui/theme.ts and only borrows the palettes from here.
    // It must still boot into the palette this file (and pygame) call the
    // default — on the light scheme, the only one pygame has.
    expect(themePalette(DEFAULT_THEME, "light")).toEqual(themeSpec(screens.defaultTheme));
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

  it("carries the ported pygame palettes plus the two web-only dark ones", () => {
    // `dark` and `classicDark` are the dark halves of the two pairs the themes
    // compose (ios/dark, classic/classicDark); pygame has neither, since all
    // six of its presets are light.
    for (const key of [
      "ios",
      "flat",
      "neumorph",
      "glass",
      "paper",
      "classic",
      "dark",
      "classicDark",
    ]) {
      expect(hasTheme(key)).toBe(true);
    }
  });

  it("every theme names a palette this build has, on both schemes", () => {
    // themePalette throws on a theme naming a palette that is not here — a bug
    // in the table rather than untrusted input — so this is the sweep that
    // catches a typo in either half of a pair.
    for (const key of THEME_KEYS) {
      for (const scheme of ["light", "dark"] as const) {
        expect(() => themePalette(key, scheme), `${key}/${scheme}`).not.toThrow();
      }
    }
  });

  it("a theme's two palettes are actually light and dark", () => {
    // Not a tautology: the pairing is written by hand in ui/theme.ts, and
    // getting it backwards on one theme is exactly the kind of thing that only
    // shows up on the one device set to dark. Measured as relative luminance of
    // the page colour, which is the whole of what a scheme changes.
    const luma = (hex: string): number =>
      [1, 3, 5]
        .map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
        .reduce((sum, c, i) => sum + [0.2126, 0.7152, 0.0722][i]! * c, 0);
    for (const key of THEME_KEYS) {
      const light = luma(themePalette(key, "light").background);
      const dark = luma(themePalette(key, "dark").background);
      expect(light, `${key} light page`).toBeGreaterThan(0.5);
      expect(dark, `${key} dark page`).toBeLessThan(0.1);
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
    expect(resolveTheme("classic")).toBe("classic");
    // The two v3 themes that were a look *and* a scheme: both cut their cells
    // with the flat style, so both alias to Flat rather than to the default.
    expect(resolveTheme("light")).toBe("flat");
    expect(resolveTheme("dark")).toBe("flat");
    expect(resolveTheme("no-such-theme")).toBe(DEFAULT_THEME);
    expect(resolveTheme(null)).toBe(DEFAULT_THEME);
    // Never walk the prototype chain: the key comes out of a stored record.
    expect(resolveTheme("toString")).toBe(DEFAULT_THEME);
  });

  it("resolveScheme keeps the three it knows and defaults the rest", () => {
    expect(resolveScheme("auto")).toBe("auto");
    expect(resolveScheme("light")).toBe("light");
    expect(resolveScheme("dark")).toBe("dark");
    expect(resolveScheme("sepia")).toBe(DEFAULT_SCHEME);
    expect(resolveScheme(null)).toBe(DEFAULT_SCHEME);
    expect(resolveScheme("toString")).toBe(DEFAULT_SCHEME);
  });

  it("activeScheme resolves auto against the device and nothing else", () => {
    // The unit environment is node, with no `window` at all — the same
    // conditions haptics.ts is written for, and the reason activeScheme guards
    // it. A stub is installed where the device's answer is what's under test.
    const withPrefersDark = (matches: boolean): void => {
      vi.stubGlobal("window", { matchMedia: () => ({ matches }) });
    };

    // No window: light, which is what every browser defaults
    // `prefers-color-scheme` to.
    expect(activeScheme("auto")).toBe("light");

    withPrefersDark(true);
    expect(activeScheme("auto")).toBe("dark");
    // An explicit choice never asks the device.
    expect(activeScheme("light")).toBe("light");

    withPrefersDark(false);
    expect(activeScheme("auto")).toBe("light");
    expect(activeScheme("dark")).toBe("dark");

    // A window with no `matchMedia` (an old engine, a stubbed one) must not
    // throw — the optional call is what keeps that true.
    vi.stubGlobal("window", {});
    expect(activeScheme("auto")).toBe("light");
    vi.unstubAllGlobals();
  });

  it("onSchemeChange subscribes and unsubscribes, and survives no window", () => {
    expect(onSchemeChange(() => {})).toBeTypeOf("function");
    const listeners = new Set<() => void>();
    vi.stubGlobal("window", {
      matchMedia: () => ({
        matches: false,
        addEventListener: (_: string, fn: () => void) => void listeners.add(fn),
        removeEventListener: (_: string, fn: () => void) => void listeners.delete(fn),
      }),
    });
    const cb = vi.fn();
    const off = onSchemeChange(cb);
    expect(listeners.size).toBe(1);
    for (const fn of listeners) fn();
    expect(cb).toHaveBeenCalledTimes(1);
    off();
    expect(listeners.size).toBe(0);
    vi.unstubAllGlobals();
  });

  it("has difficulties and a valid default", () => {
    expect(screens.difficulties.length).toBeGreaterThan(0);
    expect(() => difficulty(screens.defaultDifficulty)).not.toThrow();
    // settings.ts validates a stored difficulty through this.
    expect(hasDifficulty(screens.defaultDifficulty)).toBe(true);
    expect(hasDifficulty("nightmare")).toBe(false);
  });

  it("every HUD slot declares a slot name", () => {
    // Every cluster the two rows are built from: the header's three, the board
    // controls centred on the row below, and that row's right-hand end.
    const slots = [
      ...screens.hud.left,
      ...screens.hud.center,
      ...screens.hud.right,
      ...screens.hud.boardBar,
      ...screens.hud.boardRight,
    ];
    expect(slots.length).toBeGreaterThan(0);
    for (const s of slots) expect(s.slot).toBeTruthy();
    // Slot names are what the app and its tests address a control by, so no two
    // controls may share one wherever they are drawn.
    expect(new Set(slots.map((s) => s.slot)).size).toBe(slots.length);
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
