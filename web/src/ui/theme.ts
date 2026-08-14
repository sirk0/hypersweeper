import { hasTheme as hasPalette, themeSpec as paletteSpec, type ThemeSpec } from "../config/screens";
import { cellStyle } from "../render/cellStyle";
import { patternLayer } from "./backgroundPattern";

// The app's look is **two** settings, on two axes that have nothing to say to
// each other:
//
//   * a **theme** — how the board's cells are cut (render/cellStyle.ts) and what
//     the page behind them is made of. Realistic, Flat, Classic.
//   * a **colour scheme** — which palette the chrome paints with. Auto (the
//     device's own `prefers-color-scheme`), Light, Dark.
//
// They were one setting until now, and the four themes it offered — Light,
// Dark, Classic, Realistic — were the two axes tangled: Light and Dark were the
// *same* look (both cut with the `flat` style, neither textured) on two
// palettes, while Classic and Realistic were two looks with no dark form at
// all. So the glass tiles on a dark page were unreachable, and nothing in the
// app knew what the device preferred. Split, every combination exists: a theme
// names one palette per scheme, and `activeScheme` resolves `auto` at paint
// time.
//
// Runtime theming for the chrome works as it always did: every colour the UI
// paints with is a CSS custom property declared on `:root` in styles.css;
// `applyTheme` overwrites that whole set on the document element, so switching
// either setting re-skins the menu, the header and the page background in one
// go — the CSS counterpart of pygame's `set_theme`, which reassigns the palette
// globals every draw site reads. The styles.css `:root` block still carries the
// default (Realistic, light) values so the very first paint, before this runs,
// looks right — with a `prefers-color-scheme` block beside it for the boot
// frame of an `auto` player on a dark device.
//
// The **palettes** are still the shared, pygame-ported ones in
// `data/ui/screens.json` (guarded by tests/test_theme_sync.py), and this file
// does not add colours to them — it *composes* them, now two at a time. Two of
// the eight are web-only, and they are exactly the dark halves the pygame
// presets could never supply (`dark` beside `ios`, `classicDark` beside
// `classic`). That is what keeps the sync test meaningful while the web's list
// stops being the pygame one: pygame has no cell styles, no textures and no
// dark mode, so its six presets could never be these axes.
//
// The board is themed, but only as far as the theme's cell style says — the
// shape colour code (`shapePalette.ts`) still owns the actual hues, and only the
// Classic style switches it off (`CellStyle.monochrome`) for the gray board that
// name means. No theme reaches into `shapePalette` or `glyphAtlas`. **The scheme
// reaches the board not at all**: the tiles are lit head-on by a fixed rig and
// read the same either way, which is what the old Dark theme already shipped —
// a light-toned board on a dark page. Only the chrome and the page follow it.

/** A resolved colour scheme: what the chrome actually paints as. */
export type Scheme = "light" | "dark";

/** What the player chose. `auto` follows the device and resolves to a `Scheme`
 * at paint time (`activeScheme`), exactly as `animations: null` defers to
 * `prefers-reduced-motion` in settings.ts. */
export type SchemePref = "auto" | Scheme;

/** One finished look. */
export interface Theme {
  key: string;
  label: string;
  /** The picker row's one-line description. */
  hint: string;
  /** Which `CELL_STYLES` entry the board's cells are cut with. Independent of
   * the scheme: a cell style is relief and finish, and the board does not go
   * dark (see the header). */
  cellStyle: string;
  /** Which `data/ui/screens.json` palette paints the chrome, per scheme. */
  palette: Record<Scheme, string>;
  /** Extra CSS background layers drawn over the palette's page colour — a
   * comma-separated `background-image` list, self-contained (a data URI or a
   * gradient), because a strict CSP and the offline builds both forbid fetching
   * one. Per scheme, because a texture is *light*: the light one is a white
   * vignette over a darkening grain, which on a near-black page would blow a
   * bright dome across the top. Absent on the themes that want a plain field. */
  texture?: Record<Scheme, string>;
  /** The page behind a board follows that board's own tiling
   * (ui/backgroundPattern.ts). Only Realistic: the other two want the flat
   * field they were designed as, and only Realistic has translucent opened
   * cells for the pattern to show through. */
  patterned?: boolean;
}

/** The Realistic theme's grain: a fine woven texture so the board's translucent
 * opened cells have something to show through and the field around it stops
 * reading as flat.
 *
 * Built from an inline-SVG turbulence tile rather than an image file: the
 * artifact of this app is a self-contained bundle (the macOS and iOS builds
 * assert it — scripts/check-offline-assets.mjs), so a texture that is a PNG on a
 * CDN is a texture that does not exist offline. The turbulence is baked once by
 * the browser's SVG filter and tiled at 180px, which is cheap and has no repeat
 * the eye can find at that size.
 *
 * `opacity` is the only lever, and it has to differ by scheme. `feTurbulence`
 * *generates* its image — the `<rect>`'s fill never reaches the output, which is
 * why there is no colour to pass — so the tile is grayscale noise around mid
 * gray. Over a near-white page at 0.42 that is a soft tooth; over `#101014` the
 * same tile is bright static, and it has to come most of the way down. */
const woven = (opacity: number): string =>
  `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='180' height='180'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='3' stitchTiles='stitch'/%3E%3CfeColorMatrix type='saturate' values='0'/%3E%3C/filter%3E%3Crect width='180' height='180' filter='url(%23n)' opacity='${opacity}'/%3E%3C/svg%3E")`;

/** The Realistic page: the vignette first (under), the grain over it, so the
 * grain is even across the page and only the light falls off toward the
 * corners. Light throws the light in from the top and cools the bottom; dark
 * inverts that — a cool wash where the light would be, and a deepening toward
 * the bottom, since on a dark page a *highlight* is what the eye reads as the
 * near edge. */
const REALISTIC_PAGE: Record<Scheme, string> = {
  light: `${woven(0.42)}, radial-gradient(120% 90% at 50% 0%, #ffffff 0%, #ffffff00 55%), radial-gradient(140% 110% at 50% 100%, #b9bfcf55 0%, #b9bfcf00 60%)`,
  dark: `${woven(0.16)}, radial-gradient(120% 90% at 50% 0%, #2a2f3d 0%, #2a2f3d00 55%), radial-gradient(140% 110% at 50% 100%, #00000088 0%, #00000000 60%)`,
};

const THEMES: Theme[] = [
  {
    key: "realistic",
    label: "Realistic",
    hint: "Glass tiles, and real flags on a board you can turn",
    cellStyle: "realistic",
    palette: { light: "ios", dark: "dark" },
    texture: REALISTIC_PAGE,
    patterned: true,
  },
  {
    key: "flat",
    label: "Flat",
    hint: "Clean and simple, flat colour tiles",
    cellStyle: "flat",
    palette: { light: "ios", dark: "dark" },
  },
  {
    key: "classic",
    label: "Classic",
    hint: "The 1990s board: gray beveled buttons",
    cellStyle: "classic",
    palette: { light: "classic", dark: "classicDark" },
  },
];

const BY_KEY = new Map(THEMES.map((t) => [t.key, t]));

/** Theme keys in the order the settings picker lists them. */
export const THEME_KEYS: readonly string[] = THEMES.map((t) => t.key);

/** The look the app boots into. */
export const DEFAULT_THEME = "realistic";

/** Scheme choices in the order the settings picker lists them. */
export const SCHEME_KEYS: readonly SchemePref[] = ["auto", "light", "dark"];

/** What the picker calls each one. */
export const SCHEME_LABELS: Record<SchemePref, string> = {
  auto: "Auto",
  light: "Light",
  dark: "Dark",
};

/** Follow the device unless told otherwise. */
export const DEFAULT_SCHEME: SchemePref = "auto";

/** Keys that named a theme this build has folded away, and what they became.
 *
 * `light` and `dark` were themes when a theme was also the colour scheme; both
 * cut their cells with the `flat` style, so that is where a record naming one
 * belongs — the scheme half is a separate setting now, and a reader that gets
 * here (rather than through settings.ts's v3 -> v4 migration) has none to
 * recover. `realistic1/2/3` were the three flag markers offered side by side
 * while the shape was being chosen; the pin won and Realistic *is* it now. */
const ALIASES: Record<string, string> = {
  light: "flat",
  dark: "flat",
  realistic1: "realistic",
  realistic2: "realistic",
  realistic3: "realistic",
};

/** The theme key to actually use for `key` — the default when it names one that
 * no longer exists. That covers the builds before themes and cell styles were
 * merged, whose stored `ios` / `neumorph` / `glass` / `paper` land here and fall
 * back to the default. `Object.hasOwn`, never `in`, for the alias lookup: the
 * key comes out of a stored record, and `"toString"` is not a theme. */
export function resolveTheme(key: string | null | undefined): string {
  if (key == null) return DEFAULT_THEME;
  const aliased = Object.hasOwn(ALIASES, key) ? ALIASES[key]! : key;
  return BY_KEY.has(aliased) ? aliased : DEFAULT_THEME;
}

/** The scheme preference to actually use for `pref` — `auto` for anything this
 * build does not recognise, which is also what a record from before the split
 * has (no key at all). */
export function resolveScheme(pref: string | null | undefined): SchemePref {
  return pref === "light" || pref === "dark" || pref === "auto" ? pref : DEFAULT_SCHEME;
}

/** What `pref` actually paints as. `auto` asks the device, exactly as
 * `animationsEnabled` asks it about reduced motion — and guards `window` the
 * same way, since this is reachable from the node unit environment. A device
 * with no preference (or no `matchMedia`) is light, which is what every browser
 * defaults `prefers-color-scheme` to. */
export function activeScheme(pref: SchemePref): Scheme {
  if (pref !== "auto") return pref;
  if (typeof window === "undefined") return "light";
  return window.matchMedia?.("(prefers-color-scheme: dark)")?.matches ? "dark" : "light";
}

/** Call `cb` when the device's own light/dark preference changes, so an app
 * sitting on `auto` repaints without a reload. Returns an unsubscribe function.
 * Fires for every change, whatever the stored preference — the caller decides
 * whether it is on `auto` and cares, which keeps this a plain media-query seam.
 */
export function onSchemeChange(cb: () => void): () => void {
  if (typeof window === "undefined" || !window.matchMedia) return () => {};
  const query = window.matchMedia("(prefers-color-scheme: dark)");
  const handler = (): void => cb();
  // `addEventListener` on a MediaQueryList is the modern form; Safari carried
  // the old `addListener` well past the versions this app supports, but the
  // optional call keeps a stub in a test environment from throwing.
  query.addEventListener?.("change", handler);
  return () => query.removeEventListener?.("change", handler);
}

/** The named theme, or the default for an unknown key. */
export function theme(key: string | null | undefined): Theme {
  return BY_KEY.get(resolveTheme(key))!;
}

/** The chrome palette a theme paints with under `scheme`. */
export function themePalette(key: string | null | undefined, scheme: Scheme): ThemeSpec {
  const spec = theme(key);
  const name = spec.palette[scheme];
  // A theme naming a palette this build has not got would be a bug in the table
  // above rather than untrusted input, so it fails loudly at the source instead
  // of silently painting the wrong colours.
  if (!hasPalette(name)) {
    throw new Error(`theme ${spec.key} names unknown ${scheme} palette ${name}`);
  }
  return paletteSpec(name);
}

/** The cell style a theme cuts the board with. */
export function themeCellStyle(key: string | null | undefined): string {
  return cellStyle(theme(key).cellStyle).key;
}

/** The CSS custom properties a theme writes, as a plain map. Kept separate from
 * the DOM write so it can be unit-tested under the node environment.
 *
 * `pattern` is the board's tiling drawn behind the page, and it is a *third*
 * argument rather than something folded into `texture` for one reason:
 * `themeSwatch` (ui/settings.ts) writes this whole set onto a 44px box to draw
 * the picker's rows, and calls it with two. A swatch is a picture of the
 * theme, not of a board you are not playing, so it wants the plain page — and
 * it gets it by default, with nothing to remember. */
export function themeVars(
  spec: ThemeSpec,
  texture?: string,
  pattern?: string,
): Record<string, string> {
  return {
    "--bg": spec.background,
    // The tiling layer, above the texture (see styles.css). `none` rather than
    // an empty string, as with --bg-texture: an empty value would invalidate
    // the whole `background` shorthand it lands in.
    "--bg-pattern": pattern ?? "none",
    // Only the glass palette has a second stop; the rest paint flat, which the
    // `body` rule expresses as a gradient between two identical colours.
    "--bg2": spec.background2 ?? spec.background,
    // Layers drawn over that field. `none` rather than an empty string: the
    // property is consumed by a `background-image` list, and an empty value
    // there invalidates the whole declaration.
    "--bg-texture": texture ?? "none",
    "--panel": spec.panel,
    "--panel-blur": spec.panelBlur ?? "none",
    "--text": spec.text,
    "--muted": spec.muted,
    "--accent": spec.accent,
    "--on-accent": spec.onAccent,
    "--selected": spec.selected,
    "--border": spec.border,
    "--danger": spec.danger,
    "--counter-bg": spec.counterBg,
    "--radius": `${spec.radius}px`,
    "--shadow": spec.shadow,
  };
}

/** Paint `key` under `pref` onto the document, for the board `mode` if one is
 * open. Safe to call under the node unit environment (where there is no
 * `document`), like haptics.ts.
 *
 * `mode` is what makes the page follow the board. Pass null on the menu; every
 * caller goes through `App.paintTheme` (main.ts), which reads it off the
 * session so a change mid-board keeps that board's pattern. */
export function applyTheme(key: string, pref: SchemePref, mode?: string | null): void {
  if (typeof document === "undefined") return;
  const resolved = resolveTheme(key);
  const scheme = activeScheme(resolveScheme(pref));
  const spec = theme(resolved);
  const palette = themePalette(resolved, scheme);
  // The ink follows the scheme too, or the hairline is dark on a dark page and
  // may as well not be drawn (ui/backgroundPattern.ts).
  const pattern = spec.patterned ? (patternLayer(mode, scheme) ?? undefined) : undefined;
  const root = document.documentElement;
  for (const [name, value] of Object.entries(
    themeVars(palette, spec.texture?.[scheme], pattern),
  )) {
    root.style.setProperty(name, value);
  }
  root.dataset["theme"] = resolved;
  root.dataset["scheme"] = scheme;
  // What the browser paints the things this app does not: the scrollbar, a form
  // control, the flash between documents. Without it a dark page keeps a white
  // scrollbar down its side.
  root.style.colorScheme = scheme;
  // The browser paints its own chrome (the mobile URL bar, the PWA status bar)
  // from this; leaving it on the boot value would frame a dark theme in a pale
  // band.
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute("content", palette.background);
}
