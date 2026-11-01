import { Capacitor, registerPlugin } from "@capacitor/core";
import { MODE_LABELS } from "./modes/catalog";
import { screens } from "./config/screens";
import { boardGroups, pickerFor, quickPlayEntries, type Group } from "./ui/boardTree";

// The board and difficulty items of the native menu bar: the File menu of the
// Mac App Store app, and the ⌘ shortcuts and menu bar an iPad shows.
//
// The page owns the tree and the native side only draws it. The grouping is
// the home menu's own (ui/boardTree.ts), so the two cannot disagree about
// which boards there are or where they sit, and nothing about the catalogue
// is written twice. At boot the page hands the tree to the `MenuBar` plugin
// (apps/hypersweeper/ios/App/App/MenuBarPlugin.swift), which rebuilds the menu bar from it
// (AppDelegate.buildMenu). Each item carries a command string that comes back
// as a `hypersweeper:command` event, like New Game and Settings… do, and
// `App.onCommand` (main.ts) acts on it:
//
//   board:<mode>      start that board
//   quick:<mode>      the same, for a quick-play entry. A command of its own
//                     because UIKit throws on two identical commands in one
//                     menu bar, and Classic also sits in its group.
//   random:<kind>     deal a board from that half of the catalogue
//   difficulty:<key>  play at that difficulty (⌘1, ⌘2, ⌘3, checkmarked)
//
// Only the app registers the plugin. In a browser, the Electron app and the
// App Clip nothing here runs.

/** One item of the tree: a submenu (`children`) or a command. An `inline`
 * submenu is drawn as a section of its parent, between separators. */
export interface MenuBarNode {
  title: string;
  command?: string;
  /** The command's keyboard shortcut, if it has one. */
  key?: MenuBarKey;
  children?: MenuBarNode[];
  inline?: boolean;
}

export interface MenuBarKey {
  input: string;
  modifiers: ("command" | "shift" | "option" | "control")[];
}

/** The quick-play entries' shortcuts, by entry key: ⇧⌘ and the item's
 * initial. ⌘N, ⌘, and ⌘1–⌘3 are New Game, Settings and the difficulties, which
 * the native side adds; what the system's Edit, Find and Window menus keep
 * (⇧⌘Z, ⇧⌘G, ⌥⇧⌘V, ⌘M, ⌘W) none of these touch. */
const QUICK_KEYS: Record<string, string> = {
  square: "c", // Classic
  flat: "f",
  "3d": "d",
  hyperbolic: "h",
};

interface MenuBarPlugin {
  setMenu(options: {
    items: MenuBarNode[];
    difficulties: { key: string; label: string }[];
    difficulty: string;
  }): Promise<void>;
  setDifficulty(options: { key: string }): Promise<void>;
}

const Native = registerPlugin<MenuBarPlugin>("MenuBar");

function available(): boolean {
  try {
    return Capacitor.isNativePlatform() && Capacitor.isPluginAvailable("MenuBar");
  } catch {
    return false;
  }
}

function board(mode: string, title: string): MenuBarNode {
  return { title, command: `board:${mode}` };
}

/** A surface's tiling picker: its regular tilings, then a submenu per family —
 * the same page the home menu opens for it. */
function pickerItems(surfaceKey: string): MenuBarNode[] {
  const picker = pickerFor(surfaceKey);
  return [
    ...picker.tilings.map((t) => board(t.mode, t.label)),
    ...picker.families.map((f) => ({
      title: f.label,
      children: f.modes.map((m) => board(m.mode, m.label)),
    })),
  ];
}

function groupItems(group: Group): MenuBarNode[] {
  if (group.kind === "picker") return pickerItems(group.surfaceKey);
  if (group.kind === "manifolds") {
    return group.surfaces.map((s) => ({ title: s.label, children: pickerItems(s.key) }));
  }
  if (group.kind === "families") {
    return group.families.map((f) => ({
      title: f.label,
      children: f.modes.map((m) => board(m.mode, m.label)),
    }));
  }
  return group.modes.map((m) => board(m, MODE_LABELS[m] ?? m));
}

/** The menu bar's board items: the quick-play entries as one section, then
 * a submenu per geometry group. */
export function menuBarTree(): MenuBarNode[] {
  const quick: MenuBarNode[] = quickPlayEntries().map((e) => {
    const input = QUICK_KEYS[e.key];
    return {
      ...(e.kind === "mode"
        ? { title: e.label, command: `quick:${e.key}` }
        : { title: `Random ${e.label} Board`, command: `random:${e.key}` }),
      ...(input ? { key: { input, modifiers: ["command", "shift"] } } : {}),
    } satisfies MenuBarNode;
  });
  const groups: MenuBarNode[] = boardGroups().map((g) => ({
    title: g.label,
    children: groupItems(g),
  }));
  return [
    ...(quick.length > 0 ? [{ title: "Quick start", inline: true, children: quick }] : []),
    ...(groups.length > 0 ? [{ title: "Boards", inline: true, children: groups }] : []),
  ];
}

/** Hand the tree and the difficulty in play to the native menu bar. Once, at
 * boot; the tree does not change while the app runs. */
export function startMenuBar(difficulty: string): void {
  if (!available()) return;
  Native.setMenu({
    items: menuBarTree(),
    difficulties: screens.difficulties.map((d) => ({ key: d.key, label: d.label })),
    difficulty,
  }).catch(() => {});
}

/** Move the menu bar's difficulty checkmark — after any change, the home
 * page's pills included. */
export function setMenuBarDifficulty(key: string): void {
  if (!available()) return;
  Native.setDifficulty({ key }).catch(() => {});
}
