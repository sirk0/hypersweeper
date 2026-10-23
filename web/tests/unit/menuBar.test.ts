import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { hasMode } from "../../src/boards/presets";
import { menuBarTree, type MenuBarNode } from "../../src/menuBar";
import { boardGroups, pickerFor, quickPlayEntries } from "../../src/ui/boardTree";

// The native menu bar's board items (src/menuBar.ts → MenuBarPlugin.swift →
// AppDelegate.buildMenu). The native half cannot run here, so what it relies
// on is pinned instead: the tree groups the boards as the home menu does, and
// no two items carry the same command — UIKit throws building a menu bar that
// holds two identical commands, which would take the whole menu bar down.

function commands(nodes: readonly MenuBarNode[]): string[] {
  return nodes.flatMap((n) => [...(n.command ? [n.command] : []), ...commands(n.children ?? [])]);
}

function walk(nodes: readonly MenuBarNode[], visit: (n: MenuBarNode) => void): void {
  for (const n of nodes) {
    visit(n);
    walk(n.children ?? [], visit);
  }
}

const tree = menuBarTree();
const [quick, groups] = tree;

describe("menu bar tree", () => {
  it("is the quick-play entries, then the home menu's groups in order", () => {
    expect(tree.map((n) => n.inline)).toEqual([true, true]);
    expect(quick!.children!.map((n) => n.command)).toEqual(
      quickPlayEntries().map((e) => (e.kind === "mode" ? `quick:${e.key}` : `random:${e.key}`)),
    );
    expect(groups!.children!.map((n) => n.title)).toEqual(boardGroups().map((g) => g.label));
  });

  it("never carries the same command twice", () => {
    const all = commands(tree);
    expect(all.length).toBeGreaterThan(50);
    expect(new Set(all).size).toBe(all.length);
  });

  it("names only boards this build has, each item a command or a non-empty submenu", () => {
    walk(tree, (n) => {
      expect(n.title).not.toBe("");
      if (n.command) {
        expect(n.children).toBeUndefined();
        const [verb, arg] = n.command.split(":");
        if (verb === "board" || verb === "quick") expect(hasMode(arg!)).toBe(true);
        else expect(verb).toBe("random");
      } else {
        expect(n.children!.length).toBeGreaterThan(0);
      }
    });
  });

  it("offers every board the home menu's groups do", () => {
    const expected = new Set<string>();
    const addPicker = (surface: string) => {
      const picker = pickerFor(surface);
      for (const t of picker.tilings) expected.add(t.mode);
      for (const f of picker.families) for (const m of f.modes) expected.add(m.mode);
    };
    for (const g of boardGroups()) {
      if (g.kind === "picker") addPicker(g.surfaceKey);
      else if (g.kind === "manifolds") g.surfaces.forEach((s) => addPicker(s.key));
      else if (g.kind === "families") {
        for (const f of g.families) for (const m of f.modes) expected.add(m.mode);
      } else g.modes.forEach((m) => expected.add(m));
    }
    const offered = commands([groups!])
      .filter((c) => c.startsWith("board:"))
      .map((c) => c.slice("board:".length));
    expect(new Set(offered)).toEqual(expected);
  });

  it("gives every quick-start item a shortcut, no two alike, none the native ones", () => {
    expect(quick!.children!.every((n) => n.key)).toBe(true);
    const id = (input: string, modifiers: readonly string[]) =>
      `${[...modifiers].sort().join("+")}+${input}`;
    // AppDelegate.buildMenu's own: New Game, Settings… and the difficulties.
    const native = ["n", ",", "1", "2", "3", "4", "5", "6", "7", "8", "9"].map((k) =>
      id(k, ["command"]),
    );
    const shortcuts: string[] = [];
    walk(tree, (n) => {
      if (n.key) {
        expect(n.command).toBeDefined();
        expect(n.key.input).toHaveLength(1);
        shortcuts.push(id(n.key.input, n.key.modifiers));
      }
    });
    expect(new Set([...shortcuts, ...native]).size).toBe(shortcuts.length + native.length);
  });

  it("is registered in the app's sources and not the App Clip's", () => {
    const pbx = readFileSync(
      resolve(__dirname, "../../../ios/App/App.xcodeproj/project.pbxproj"),
      "utf8",
    );
    const phases = [...pbx.matchAll(/isa = PBXSourcesBuildPhase;[\s\S]*?files = \(([\s\S]*?)\);/g)]
      .map((m) => m[1]!);
    const app = phases.find((p) => p.includes("AppDelegate.swift in Sources"));
    const clip = phases.find((p) => p.includes("ClipAppDelegate.swift in Sources"));
    expect(app).toContain("MenuBarPlugin.swift in Sources");
    expect(clip).not.toContain("MenuBarPlugin.swift");
  });
});
