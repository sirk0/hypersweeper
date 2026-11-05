import { describe, expect, it } from "vitest";
import { ACHIEVEMENTS } from "../../src/achievements";
import { MODES } from "../../src/modes/presets";
import { boardGroups, pickerFor, quickPlayEntries } from "../../src/ui/boardTree";
import { menuIcon, previewIcon } from "../../src/ui/icons";

// Every icon the menu can show must be a drawing, not an empty box.
//
// The menu glyphs are generated from the boards' own geometry, so a builder
// called with the wrong arguments does not fail to compile or throw: it
// returns a board whose numbers are wrong, and the icon is written out with
// `NaN` coordinates, which a browser silently draws as nothing. That is how
// the hyperbolic Uniform and Closed surfaces rows lost every icon in 0.3.44:
// the geometry builders lost their mine-count parameter (#236), the one call
// that reached `hyperbolicUniformBoard` through a spread kept passing the old
// `0`, and it landed in the `scale` slot. The type checker saw a number where
// a number goes. These tests look at the SVG itself, for every key the menu
// draws, so any such slip — in any builder, by any route — fails here.

/** Every icon key a menu row (the phone's) or a card (the desktop's) can be
 * drawn from: every board, every row's own icon key, every group, surface and
 * family, the home page's entries. A superset is fine — an unknown key falls
 * back to a plain disc, which is still a valid drawing. */
function menuKeys(): string[] {
  const keys = new Set<string>(Object.keys(MODES));
  const addPicker = (surfaceKey: string): void => {
    const picker = pickerFor(surfaceKey);
    for (const row of picker.tilings) keys.add(row.icon);
    for (const family of picker.families) {
      keys.add(family.key);
      for (const row of family.modes) keys.add(row.icon);
    }
  };
  for (const group of boardGroups()) {
    keys.add(group.key);
    if (group.kind === "picker") addPicker(group.surfaceKey);
    else if (group.kind === "manifolds") {
      for (const surface of group.surfaces) {
        keys.add(surface.key);
        addPicker(surface.key);
      }
    } else if (group.kind === "families") {
      for (const family of group.families) {
        keys.add(family.key);
        for (const row of family.modes) keys.add(row.icon);
      }
    } else for (const mode of group.modes) keys.add(mode);
  }
  for (const entry of quickPlayEntries()) keys.add(entry.icon);
  // the rows menu.ts gives an icon other than their own key (`groupIcon`,
  // `FAMILY_ICONS`, the Custom row)
  for (const key of ["custom", "hex", "spheres", "hyperbolic-home", "hexhex"]) keys.add(key);
  // the achievement badges (the achievements page, and the Game Center images
  // scripts/make-gamecenter.mts renders from the same `menuIcon`)
  for (const achievement of ACHIEVEMENTS) keys.add(achievement.icon);
  return [...keys].sort();
}

const DRAWN = /<(path|polygon|polyline|circle|ellipse|rect|line)\b/g;

/** Why `svg` would not show as a picture, or `null` if it would. */
function brokenDrawing(svg: string): string | null {
  const bad = /NaN|Infinity|undefined/.exec(svg);
  if (bad) return `contains ${bad[0]}`;
  if ((svg.match(DRAWN) ?? []).length === 0) return "draws no shape";
  const box = / viewBox="([^"]*)"/.exec(svg);
  if (!box) return "has no viewBox";
  const [, , w, h] = box[1]!.split(/[\s,]+/).map(Number);
  if (!(w! > 0 && h! > 0)) return `has an empty viewBox (${box[1]})`;
  // A drawing collapsed to a point (every coordinate the same) is just as
  // invisible as one of NaNs: the path data must span part of the box.
  const coords = [...svg.matchAll(/ (?:d|points)="([^"]*)"/g)].flatMap((m) =>
    (m[1]!.match(/-?\d*\.?\d+(?:e-?\d+)?/gi) ?? []).map(Number),
  );
  if (coords.length > 0 && Math.max(...coords) - Math.min(...coords) < Math.min(w!, h!) * 0.05) {
    return "collapses to a point";
  }
  return null;
}

describe("menu icons", () => {
  const keys = menuKeys();

  it("covers the hyperbolic boards, the uniform ones and the closed surfaces", () => {
    // the keys this file exists for, so a change to the tree walk above
    // cannot quietly drop them
    for (const key of ["hyperbolic667", "hyperbolic3474", "quartic", "bolza", "bring", "triplet"]) {
      expect(keys, key).toContain(key);
    }
  });

  it("draws every row's icon with finite, non-degenerate coordinates", () => {
    const broken = keys
      .map((key) => [key, brokenDrawing(menuIcon(key))] as const)
      .filter(([, why]) => why !== null);
    expect(broken).toEqual([]);
  });

  it("draws every card's preview with finite, non-degenerate coordinates", () => {
    const broken = keys
      .map((key) => [key, brokenDrawing(previewIcon(key).svg)] as const)
      .filter(([, why]) => why !== null);
    expect(broken).toEqual([]);
  }, 60_000);

  it("rejects the drawings this guards against", () => {
    // the shape the 0.3.44 icons had
    expect(brokenDrawing('<svg viewBox="0 0 100 100"><path d="MNaN NaNLNaN NaNZ"/></svg>')).toMatch(
      /NaN/,
    );
    expect(
      brokenDrawing('<svg viewBox="0 0 100 100"><path d="M50 50L50 50L50 50Z"/></svg>'),
    ).toMatch(/point/);
    expect(brokenDrawing('<svg viewBox="0 0 100 100"></svg>')).toMatch(/no shape/);
    expect(brokenDrawing(menuIcon("square"))).toBeNull();
  });
});
