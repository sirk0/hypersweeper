// The colour scheme the player picked in Settings (src/preferences.ts): Auto,
// which follows the device's `prefers-color-scheme`, Light or Dark.
//
// The colours themselves are all CSS custom properties in styles.css: `:root`
// carries the light ones, and the dark ones are laid over them twice, with the
// same declarations — inside `@media (prefers-color-scheme: dark)` on
// `:root:not([data-scheme="light"])` (Auto on a dark device, and the first
// frame before this runs), and on `:root[data-scheme="dark"]` (Dark on any
// device). Plain CSS cannot join a media query and a selector in one rule, so
// the list is written twice; tests/unit/scheme.test.ts holds the two copies
// equal. So all this does is set or clear `data-scheme` on <html>, and point
// the browser's own chrome (the `theme-color` metas) at the page colour.

export type SchemePref = "auto" | "light" | "dark";

export const SCHEMES: readonly SchemePref[] = ["auto", "light", "dark"];

export const SCHEME_LABELS: Record<SchemePref, string> = {
  auto: "Auto",
  light: "Light",
  dark: "Dark",
};

/** The page colour of each scheme: styles.css's `--page`, and index.html's
 * two `theme-color` metas. */
const PAGE: Record<"light" | "dark", string> = { light: "#f5ead8", dark: "#191712" };

/** Whether a stored value is a scheme. */
export function isScheme(value: unknown): value is SchemePref {
  return value === "auto" || value === "light" || value === "dark";
}

/** What the device asks for, where `pref` is Auto: light where it says
 * nothing (or there is no `matchMedia`). */
export function deviceScheme(): "light" | "dark" {
  if (typeof window === "undefined") return "light";
  return window.matchMedia?.("(prefers-color-scheme: dark)")?.matches ? "dark" : "light";
}

/** Paint the page in `pref`. */
export function applyScheme(pref: SchemePref): void {
  const root = document.documentElement;
  if (pref === "auto") delete root.dataset["scheme"];
  else root.dataset["scheme"] = pref;
  // index.html has one meta per scheme, each under its media query. Auto
  // leaves them so; a forced scheme gives both its own colour, so a dark page
  // on a light device is not framed in a pale browser bar (and back).
  const metas = document.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]');
  for (const meta of metas) {
    const own = meta.media.includes("dark") ? "dark" : "light";
    meta.content = PAGE[pref === "auto" ? own : pref];
  }
}
