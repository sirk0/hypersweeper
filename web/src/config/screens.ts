// Typed accessor for the shared UI-screen configuration
// (`data/ui/screens.json` at the repo root). The JSON is the single source
// of truth for screen chrome so the Python and TypeScript front-ends stay in
// sync; this module gives the TS app compile-time types over it.
import raw from "@data/ui/screens.json";

export type DifficultyKey = string;

export interface Difficulty {
  key: DifficultyKey;
  label: string;
}

/** A chrome palette, ported from the pygame `THEMES` registry (gui.py). Field
 * names follow the CSS custom properties they drive, which do not map
 * one-to-one onto the pygame keys: `panel` is the card fill (pygame `button`)
 * and `counterBg` is the dark LED box (pygame `panel`). Board tiles are never
 * themed — here as in pygame, only the chrome is. */
export interface ThemeSpec {
  label: string;
  background: string;
  /** Second gradient stop behind the page (glassmorphism only). */
  background2?: string;
  panel: string;
  text: string;
  muted: string;
  accent: string;
  onAccent: string;
  selected: string;
  border: string;
  danger: string;
  counterBg: string;
  /** Corner radius in CSS pixels. */
  radius: number;
  /** A complete CSS `box-shadow` value, or "none". */
  shadow: string;
  /** A CSS `backdrop-filter` for the cards (glassmorphism only). */
  panelBlur?: string;
}

export interface HudSlot {
  slot: string;
  kind?: string;
  label?: string;
  icon?: string;
  action?: string;
  toggle?: boolean;
  source?: string;
  digits?: number;
  visibleWhen?: string;
}

export interface Hud {
  left: HudSlot[];
  center: HudSlot[];
  right: HudSlot[];
  /** Controls that belong to the board rather than to the game, drawn on the
   * caption row under the header (see ui/boardInfo.ts). Kept out of the header
   * because they appear only on the boards that have them, and the header row
   * is already full at phone widths. */
  boardBar: HudSlot[];
}

export interface SmileyFaces {
  playing: string;
  won: string;
  lost: string;
  pressed: string;
}

export interface MenuEntry {
  key: string;
  label: string;
  kind: "mode" | "surface" | "group";
  hint?: string;
  mode?: string;
  surface?: string;
  children?: string[];
}

export interface Menu {
  title: string;
  root: MenuEntry[];
}

export interface ScreenConfig {
  version: number;
  themes: Record<string, ThemeSpec>;
  defaultTheme: string;
  difficulties: Difficulty[];
  defaultDifficulty: DifficultyKey;
  hud: Hud;
  smiley: SmileyFaces;
  menu: Menu;
}

export const screens = raw as unknown as ScreenConfig;

export function difficulty(key: DifficultyKey): Difficulty {
  const found = screens.difficulties.find((d) => d.key === key);
  if (!found) throw new Error(`unknown difficulty: ${key}`);
  return found;
}

/** The palette for a theme key; throws on an unknown one (callers that take a
 * key from storage or a URL should check `hasTheme` first). */
export function themeSpec(key: string): ThemeSpec {
  const found = screens.themes[key];
  if (!found) throw new Error(`unknown theme: ${key}`);
  return found;
}

export function hasTheme(key: string): boolean {
  return Object.hasOwn(screens.themes, key);
}

export function hasDifficulty(key: string): boolean {
  return screens.difficulties.some((d) => d.key === key);
}
