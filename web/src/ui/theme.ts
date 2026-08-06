import { hasTheme as hasPalette, themeSpec as paletteSpec, type ThemeSpec } from "../config/screens";
import { cellStyle } from "../render/cellStyle";

// A theme is the app's **one** look setting: the chrome palette, how the
// board's cells are cut, and what the page behind them is made of. Cell style
// used to be a second, independent picker; pairing the two by hand was a job
// nobody wanted, and half the sixteen combinations looked like nothing anyone
// designed. So a theme now names its cell style (render/cellStyle.ts) and the
// picker below Settings is a list of four finished looks.
//
// Runtime theming for the chrome works as it always did: every colour the UI
// paints with is a CSS custom property declared on `:root` in styles.css;
// `applyTheme` overwrites that whole set on the document element, so switching
// a theme re-skins the menu, the header and the page background in one go — the
// CSS counterpart of pygame's `set_theme`, which reassigns the palette globals
// every draw site reads. The styles.css `:root` block still carries the default
// (Light) values so the very first paint, before this runs, looks right.
//
// The **palettes** are still the shared, pygame-ported ones in
// `data/ui/screens.json` (guarded by tests/test_theme_sync.py), and this file
// does not add colours to them — it *composes* them. Three of the four themes
// take a palette straight; Light and Realistic share the `ios` one and differ in
// the board and the page texture. That is what keeps the sync test meaningful
// while the web's theme *list* stops being the pygame one: pygame has no cell
// styles and no textures, so its six presets could never be this list.
//
// The board is themed now, but only as far as the theme's cell style says — the
// shape colour code (`shapePalette.ts`) still owns the actual hues, and only the
// Classic style switches it off (`CellStyle.monochrome`) for the gray board that
// name means. No theme reaches into `shapePalette` or `glyphAtlas`.

/** One finished look. */
export interface Theme {
  key: string;
  label: string;
  /** The picker row's one-line description. */
  hint: string;
  /** Which `data/ui/screens.json` palette paints the chrome. */
  palette: string;
  /** Which `CELL_STYLES` entry the board's cells are cut with. */
  cellStyle: string;
  /** Extra CSS background layers drawn over the palette's page colour — a
   * comma-separated `background-image` list, self-contained (a data URI or a
   * gradient), because a strict CSP and the offline builds both forbid fetching
   * one. Absent on the themes that want a plain field. */
  texture?: string;
}

/** The Realistic theme's page: a fine woven grain over a soft vignette, so the
 * board's translucent opened cells have something to show through and the field
 * around it stops reading as flat #f2f2f7.
 *
 * Built from gradients and one inline-SVG turbulence tile rather than an image
 * file: the artifact of this app is a self-contained bundle (the macOS and iOS
 * builds assert it — scripts/check-offline-assets.mjs), so a texture that is a
 * PNG on a CDN is a texture that does not exist offline. The turbulence is
 * baked once by the browser's SVG filter and tiled at 180px, which is cheap and
 * has no repeat the eye can find at that size. */
const WOVEN = `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='180' height='180'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='3' stitchTiles='stitch'/%3E%3CfeColorMatrix type='saturate' values='0'/%3E%3C/filter%3E%3Crect width='180' height='180' filter='url(%23n)' opacity='0.42'/%3E%3C/svg%3E")`;

const THEMES: Theme[] = [
  {
    key: "light",
    label: "Light",
    hint: "Clean and bright, flat colour tiles",
    palette: "ios",
    cellStyle: "flat",
  },
  {
    key: "dark",
    label: "Dark",
    hint: "The same board on a dark page",
    palette: "dark",
    cellStyle: "flat",
  },
  {
    key: "classic",
    label: "Classic",
    hint: "The 1990s board: gray beveled buttons",
    palette: "classic",
    cellStyle: "classic",
  },
  {
    key: "realistic",
    label: "Realistic",
    hint: "Glass tiles on a textured surface",
    palette: "ios",
    cellStyle: "realistic",
    // Vignette first (under), grain over it, so the grain is even across the
    // page and only the light falls off toward the corners.
    texture: `${WOVEN}, radial-gradient(120% 90% at 50% 0%, #ffffff 0%, #ffffff00 55%), radial-gradient(140% 110% at 50% 100%, #b9bfcf55 0%, #b9bfcf00 60%)`,
  },
];

const BY_KEY = new Map(THEMES.map((t) => [t.key, t]));

/** Theme keys in the order the settings picker lists them. */
export const THEME_KEYS: readonly string[] = THEMES.map((t) => t.key);

/** The look the app boots into. */
export const DEFAULT_THEME = "light";

/** The theme key to actually use for `key` — the default when it names one that
 * no longer exists. That covers the builds before themes and cell styles were
 * merged, whose stored `ios` / `flat` / `neumorph` / `glass` / `paper` land here
 * and fall back to Light; `classic` and `dark` survive the rename because they
 * kept their keys. */
export function resolveTheme(key: string | null | undefined): string {
  return key != null && BY_KEY.has(key) ? key : DEFAULT_THEME;
}

/** The named theme, or the default for an unknown key. */
export function theme(key: string | null | undefined): Theme {
  return BY_KEY.get(resolveTheme(key))!;
}

/** The chrome palette a theme paints with. */
export function themePalette(key: string | null | undefined): ThemeSpec {
  const spec = theme(key);
  // A theme naming a palette this build has not got would be a bug in the table
  // above rather than untrusted input, so it fails loudly at the source instead
  // of silently painting the wrong colours.
  if (!hasPalette(spec.palette)) {
    throw new Error(`theme ${spec.key} names unknown palette ${spec.palette}`);
  }
  return paletteSpec(spec.palette);
}

/** The cell style a theme cuts the board with. */
export function themeCellStyle(key: string | null | undefined): string {
  return cellStyle(theme(key).cellStyle).key;
}

/** The CSS custom properties a theme writes, as a plain map. Kept separate from
 * the DOM write so it can be unit-tested under the node environment. */
export function themeVars(spec: ThemeSpec, texture?: string): Record<string, string> {
  return {
    "--bg": spec.background,
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

/** Paint `key` onto the document. Safe to call under the node unit environment
 * (where there is no `document`), like haptics.ts. */
export function applyTheme(key: string): void {
  if (typeof document === "undefined") return;
  const resolved = resolveTheme(key);
  const spec = theme(resolved);
  const palette = themePalette(resolved);
  const root = document.documentElement;
  for (const [name, value] of Object.entries(themeVars(palette, spec.texture))) {
    root.style.setProperty(name, value);
  }
  root.dataset["theme"] = resolved;
  // The browser paints its own chrome (the mobile URL bar, the PWA status bar)
  // from this; leaving it on the boot value would frame a dark theme in a pale
  // band.
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute("content", palette.background);
}
