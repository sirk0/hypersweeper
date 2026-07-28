import { DEFAULT_THEME, resolveTheme } from "./ui/theme";

// Persisted user preferences — the app's only stored state. Everything else
// (difficulty, flag mode, zoom, the menu page you are on) stays in memory and
// resets on reload, as it always has.
//
// One versioned key holds the whole record, so a future schema change is a new
// key rather than a migration; an unreadable or outdated blob falls back to the
// defaults instead of throwing. Storage access is wrapped because it is not
// always available: Safari in private mode throws on `localStorage.setItem`,
// and the unit tests run under vitest's node environment with no `window` at
// all (the same reason haptics.ts guards every global).

const KEY = "ms:settings:v1";

export interface Settings {
  theme: string;
  /** `null` follows the OS `prefers-reduced-motion` setting; a boolean is an
   * explicit override from the settings screen. */
  animations: boolean | null;
}

export const DEFAULT_SETTINGS: Settings = {
  theme: DEFAULT_THEME,
  animations: null,
};

function storage(): Storage | null {
  try {
    return typeof localStorage === "undefined" ? null : localStorage;
  } catch {
    return null; // storage disabled by policy
  }
}

/** The stored settings, with every field validated — a hand-edited or stale
 * blob can never crash the boot path. */
export function loadSettings(): Settings {
  const raw = (() => {
    try {
      return storage()?.getItem(KEY) ?? null;
    } catch {
      return null;
    }
  })();
  if (raw === null) return { ...DEFAULT_SETTINGS };
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
  if (typeof parsed !== "object" || parsed === null) return { ...DEFAULT_SETTINGS };
  const rec = parsed as Record<string, unknown>;
  return {
    // resolveTheme drops a theme key that no longer exists.
    theme: resolveTheme(typeof rec["theme"] === "string" ? rec["theme"] : null),
    animations: typeof rec["animations"] === "boolean" ? rec["animations"] : null,
  };
}

/** Persist `settings`; a write that the browser refuses is not worth failing a
 * click over, so it is silently dropped and the choice stays in memory. */
export function saveSettings(settings: Settings): void {
  try {
    storage()?.setItem(KEY, JSON.stringify(settings));
  } catch {
    /* storage full or disabled — the setting still applies for this session */
  }
}

/** Whether animations should run, given a stored preference and the OS
 * setting. `null` (the default) defers to the OS. */
export function animationsEnabled(pref: boolean | null): boolean {
  if (pref !== null) return pref;
  if (typeof window === "undefined") return true;
  return !(window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches ?? false);
}
