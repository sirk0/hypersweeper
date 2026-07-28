import { hasTheme, screens, themeSpec, type ThemeSpec } from "../config/screens";

// Runtime theming for the chrome. Every colour the UI paints with is a CSS
// custom property declared on `:root` in styles.css; `applyTheme` overwrites
// that whole set on the document element, so switching a theme re-skins the
// menu, the header and the page background in one go — the CSS counterpart of
// pygame's `set_theme`, which reassigns the palette globals every draw site
// reads. The styles.css `:root` block still carries the default (`ios`) values
// so the very first paint, before this runs, looks right.
//
// The board is deliberately NOT themed: pygame keeps the tiles' beveled look
// whatever the theme, and doing the same here keeps `shapePalette` /
// `glyphAtlas` out of it (and the board screenshot baselines valid). The field
// *behind* the board is themed, and needs nothing extra to be: the WebGL canvas
// is transparent (renderer.ts), so what shows around the board is the page
// background these properties set.

/** Theme keys in the order the settings picker lists them: the app default
 * first, then the remaining pygame presets, then the web-only dark one. */
export const THEME_KEYS: readonly string[] = Object.keys(screens.themes);

export const DEFAULT_THEME = screens.defaultTheme;

/** The theme key to actually use for `key` — the default when it names a theme
 * that no longer exists (a stale value in localStorage or a URL). */
export function resolveTheme(key: string | null | undefined): string {
  return key && hasTheme(key) ? key : DEFAULT_THEME;
}

/** The CSS custom properties a theme writes, as a plain map. Kept separate
 * from the DOM write so it can be unit-tested under the node environment. */
export function themeVars(spec: ThemeSpec): Record<string, string> {
  return {
    "--bg": spec.background,
    // Only the glass theme has a second stop; the rest paint flat, which the
    // `body` rule expresses as a gradient between two identical colours.
    "--bg2": spec.background2 ?? spec.background,
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

/** Paint `key` onto the document. Safe to call under the node unit
 * environment (where there is no `document`), like haptics.ts. */
export function applyTheme(key: string): void {
  if (typeof document === "undefined") return;
  const resolved = resolveTheme(key);
  const spec = themeSpec(resolved);
  const root = document.documentElement;
  for (const [name, value] of Object.entries(themeVars(spec))) {
    root.style.setProperty(name, value);
  }
  root.dataset["theme"] = resolved;
  // The browser paints its own chrome (the mobile URL bar, the PWA status bar)
  // from this; leaving it on the boot value would frame a dark theme in a pale
  // band.
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute("content", spec.background);
}
