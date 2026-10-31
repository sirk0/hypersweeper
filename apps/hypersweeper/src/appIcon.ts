import { Capacitor, registerPlugin } from "@capacitor/core";
import { shellKind } from "./device";

// Which app icon this copy of the game wears: a pentagon, a hexagon or an
// octagon cell with the mine on it. Three, so a player with the game twice on
// one phone — the web app on the Home Screen beside the App Store one — can
// tell which is which at a glance (Settings › Appearance › App icon).
//
// `APP_ICONS` is the one list. `scripts/make-icons.mts` draws every icon from
// it (the side count, and the Sand colour that side count is painted in), and
// the iOS project's alternate icons are its `bundle` names, which a unit test
// holds the Xcode project to. So a fourth icon is a row here and a re-run of
// the script, plus the name in the project's alternate-icon list.
//
// What picking one does depends on where the game is running, and the row is
// only offered where it does something (`appIconSupported`):
//
//   - The iOS app: `UIApplication.setAlternateIconName`, through the small
//     native plugin in ios/App/App/AppIconPlugin.swift. iOS confirms the
//     change with its own alert. The shell says, before the page runs, whether
//     the device can switch at all and which icon it wears now
//     (`window.hypersweeperAppIcon`, BridgeViewController.swift) — the OS is
//     the record of that, not this page's storage, which a reinstall clears.
//     Mac Catalyst cannot switch, so the Mac app has no row.
//   - A browser tab: the favicon, and the `apple-touch-icon` that Safari's
//     Add to Home Screen reads at the moment it adds the icon. So the choice
//     is made *before* adding; an icon already on the Home Screen is a copy
//     and never changes. Which is also why an installed web app (standalone)
//     has no row: nothing it could change is still listening.
//   - The Electron app: no row. A dock icon could be swapped while the app
//     runs, but Finder would go on showing the pentagon.

export type AppIconKey = "pentagon" | "hexagon" | "octagon";

export interface AppIconSpec {
  key: AppIconKey;
  /** The cell's side count — what the icon is a drawing of, and the hue the
   * Sand palette gives it. */
  sides: number;
  label: string;
  /** The Icon Composer document in ios/App/App (`<bundle>.icon`). The default
   * icon's is the project's primary `AppIcon`; the others are the names
   * `setAlternateIconName` takes. */
  bundle: string;
}

export const APP_ICONS: readonly AppIconSpec[] = [
  { key: "pentagon", sides: 5, label: "Pentagon", bundle: "AppIcon" },
  { key: "hexagon", sides: 6, label: "Hexagon", bundle: "AppIconHexagon" },
  { key: "octagon", sides: 8, label: "Octagon", bundle: "AppIconOctagon" },
];

export const DEFAULT_APP_ICON: AppIconKey = "pentagon";

/** A stored key this build knows, or the default. */
export function resolveAppIcon(key: string | null): AppIconKey {
  return APP_ICONS.find((icon) => icon.key === key)?.key ?? DEFAULT_APP_ICON;
}

export function appIcon(key: string): AppIconSpec {
  return APP_ICONS.find((icon) => icon.key === key) ?? APP_ICONS[0]!;
}

/** The icon as the web serves it: the favicon a tab shows, and the full-bleed
 * PNG iOS masks for the Home Screen (also the picker's thumbnail). Both are
 * written by make-icons; relative, so they resolve under any `VITE_BASE`. */
export function appIconUrls(key: string): { favicon: string; touch: string } {
  const { key: k } = appIcon(key);
  return { favicon: `icons/favicon-${k}.svg`, touch: `icons/apple-touch-${k}.png` };
}

interface ShellIcon {
  hypersweeperAltIcons?: boolean;
  hypersweeperAppIcon?: string | null;
}

function shell(): ShellIcon | undefined {
  return typeof window === "undefined" ? undefined : (window as ShellIcon);
}

function native(): boolean {
  return Capacitor.isNativePlatform();
}

/** Whether Settings offers the picker here — see the header for each case. */
export function appIconSupported(): boolean {
  if (typeof document === "undefined") return false;
  if (native()) return shell()?.hypersweeperAltIcons === true;
  return !__APP_PACKAGED__ && shellKind() === "browser";
}

/** The icon the iOS app wears right now, as the shell reported it at launch —
 * or `null` anywhere else, where the stored setting is the only record. */
export function nativeAppIcon(): AppIconKey | null {
  if (!native()) return null;
  const name = shell()?.hypersweeperAppIcon ?? null;
  return APP_ICONS.find((icon) => icon.bundle === name)?.key ?? DEFAULT_APP_ICON;
}

interface AppIconPlugin {
  /** `name` is an alternate icon's name, or `null` for the primary one. */
  set(options: { name: string | null }): Promise<void>;
}

const AppIconNative = registerPlugin<AppIconPlugin>("AppIcon");

/** Point the page's icon links at `key`. Runs at startup too, so a tab that
 * picked the hexagon is still a hexagon after a reload — and so is the icon
 * Add to Home Screen takes. */
export function applyWebAppIcon(key: string): void {
  if (typeof document === "undefined" || native()) return;
  const { favicon, touch } = appIconUrls(key);
  document.querySelector<HTMLLinkElement>('link[rel="icon"]')?.setAttribute("href", favicon);
  document
    .querySelector<HTMLLinkElement>('link[rel="apple-touch-icon"]')
    ?.setAttribute("href", touch);
}

/** Switch the icon. Resolves `false` when the OS refused (the iOS app can be
 * told "not now" while it is not in the foreground), so the caller can leave
 * the setting where it was. */
export async function setAppIcon(key: string): Promise<boolean> {
  const spec = appIcon(key);
  if (!native()) {
    applyWebAppIcon(spec.key);
    return true;
  }
  try {
    await AppIconNative.set({ name: spec.key === DEFAULT_APP_ICON ? null : spec.bundle });
    const win = shell();
    if (win) win.hypersweeperAppIcon = spec.key === DEFAULT_APP_ICON ? null : spec.bundle;
    return true;
  } catch {
    return false;
  }
}
