// Dev-only: dump every menu icon into one HTML sheet for visual review.
// Run: npx vite-node scripts/icon-gallery.mts -- <out.html>
import { writeFileSync } from "node:fs";
import { menuIcon } from "../src/ui/icons";
import {
  DUAL_ARCH,
  ISOGONAL_ARCH,
  MENU,
  MODE_LABELS,
  POLYHEDRA_MODES,
  SHAPED_MODES,
  SPHERE_MODES,
  TILINGS_BY_KEY,
  UNIFORM_ARCH,
} from "../src/boards/catalog";

const groups: [string, string[]][] = [
  ["Home page", ["classic", "flat", "manifolds", "sphere", "polyhedra"]],
  ["Surfaces", ["flat", "cylinder", "mobius", "klein", "torus"]],
  ["Regular tilings", MENU.pickerRegular as string[]],
  ["Families / random", ["regular", "uniform", "dual", "isogonal", "aperiodic", "random"]],
  ["Uniform tilings", UNIFORM_ARCH],
  ["Dual-uniform tilings", DUAL_ARCH],
  ["Isogonal tilings", ISOGONAL_ARCH],
  ["Aperiodic", MENU.aperiodic as string[]],
  ["Sphere", [...SPHERE_MODES]],
  ["Polyhedra", [...POLYHEDRA_MODES]],
  ["Shaped boards", Object.values(SHAPED_MODES).flat()],
];

const only = process.argv[3];
const shown = only ? groups.filter(([t]) => t.toLowerCase().includes(only)) : groups;

const label = (k: string): string =>
  TILINGS_BY_KEY.get(k)?.label ?? MODE_LABELS[k] ?? k;

const sections = shown
  .map(
    ([title, keys]) => `<h2>${title}</h2><div class="row">${keys
      .map(
        (k) =>
          `<figure><div class="icon">${menuIcon(k)}</div><figcaption>${label(
            k,
          )}<br><code>${k}</code></figcaption></figure>`,
      )
      .join("")}</div>`,
  )
  .join("\n");

const out = process.argv[2] ?? "icon-gallery.html";
writeFileSync(
  out,
  `<!doctype html><meta charset="utf-8"><title>Menu icons</title>
<style>
  body { font: 13px/1.4 system-ui, sans-serif; background:#f6f6fa; color:#222; margin:24px; }
  h2 { margin:28px 0 8px; font-size:15px; color:#555; }
  .row { display:flex; flex-wrap:wrap; gap:12px; }
  figure { margin:0; width:104px; text-align:center; background:#fff;
           border:1px solid #e2e2ee; border-radius:10px; padding:8px 4px; }
  .icon { width:72px; height:72px; margin:0 auto 6px; }
  .icon svg { width:100%; height:100%; display:block; }
  figcaption { font-size:10px; color:#666; }
  code { color:#999; font-size:9px; }
</style>
${sections}
`,
);
console.log(`wrote ${out}`);
