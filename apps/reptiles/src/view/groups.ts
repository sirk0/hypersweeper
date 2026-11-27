// The desktop's sidebar: the catalog's fourteen families (`GROUPS` in
// levels.ts) put together into five groups, so the sidebar is as short as
// Hypersweeper's and every group's page is a grid worth a wide screen. Each
// family is in exactly one group (`tests/unit/groups.test.ts`), and a group's
// page lists its families in `GROUPS`' order, one section each. The phone
// has the same groups: its Tilings is their index, a card each
// (`renderGroupIndex` in view/catalog.ts), and a group's page the same
// sections, their cards smaller.

import { GROUPS } from "../levels";

type FamilyKey = (typeof GROUPS)[number]["key"];

export interface MenuGroup {
  key: string;
  name: string;
  hint: string;
  families: readonly FamilyKey[];
  /** The tiling whose tray is the sidebar row's icon. */
  icon: string;
}

export const MENU_GROUPS: readonly MenuGroup[] = [
  {
    key: "regular",
    name: "Regular polygons",
    hint: "Triangles, squares, hexagons, octagons and dodecagons, corner to corner",
    families: ["regular", "uniform", "2-uniform"],
    icon: "trihex",
  },
  {
    key: "star",
    name: "Star polygons",
    hint: "Regular polygons and stars, every corner alike",
    families: ["star-angle", "star"],
    icon: "star36a60",
  },
  {
    key: "irregular",
    name: "Irregular tiles",
    hint: "Shapes that are not all regular: the duals, the pentagons and the girih tiles",
    families: ["laves", "2-isohedral", "pentagonal", "girih"],
    icon: "cairo",
  },
  {
    key: "offset",
    name: "Offset corners",
    hint: "Corners that meet part-way along a side: isogonal tilings and bonds",
    families: ["isogonal", "rectangle"],
    icon: "pythagorean",
  },
  {
    key: "nonperiodic",
    name: "Non-periodic",
    hint: "Rep-tiles, spirals and tilings that repeat nowhere",
    families: ["reptile", "spiral", "aperiodic"],
    icon: "spectre",
  },
];

/** Groups since merged, by their old keys, so an old `?group=` link opens. */
const MOVED: Readonly<Record<string, string>> = {
  "self-similar": "nonperiodic",
  aperiodic: "nonperiodic",
};

/** The group a family is in. */
export function groupOfFamily(family: string): MenuGroup | undefined {
  return MENU_GROUPS.find((g) => (g.families as readonly string[]).includes(family));
}

/** The group by its key. */
export function menuGroup(key: string | null | undefined): MenuGroup | undefined {
  const moved = key ? (MOVED[key] ?? key) : key;
  return MENU_GROUPS.find((g) => g.key === moved);
}

/** The desktop layout's query — Hypersweeper's (`Menu.wideQuery` and the
 * matching `@media` block in its styles.css): from 900px wide and 501px tall,
 * or a tablet held upright (720 × 800). `styles.css` repeats it; the two must
 * match. */
export const WIDE_QUERY =
  "(min-width: 900px) and (min-height: 501px), (min-width: 720px) and (min-height: 800px)";

/** A phone held sideways: under 501px tall, so never the desktop. Home's
 * picks and Tilings' groups go two to a row, and a level's name moves into
 * the header, as on a desktop, so the board takes its line too.
 * `styles.css` repeats it; the two must match. */
export const SIDEWAYS_QUERY = "(orientation: landscape) and (max-height: 500px)";

/** Where a tiling's page is two columns, the level picked beside the picks:
 * a desktop of 1100px and more. Narrower, the pane is too narrow for both,
 * and the page is the phone's one column (styles.css says the same). */
export const TWO_COLUMNS = "(min-width: 1100px) and (min-height: 501px)";
