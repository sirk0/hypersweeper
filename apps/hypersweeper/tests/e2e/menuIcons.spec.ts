import { expect, test, type Page } from "@playwright/test";

// Every row of the phone menu shows an icon that draws.
//
// 0.3.44 to 0.4.16 shipped with the hyperbolic Uniform and Closed surfaces rows
// blank on the phone: their icons were SVG paths of `NaN`, which a browser
// draws as nothing and reports no error for (see tests/unit/menuIcons.test.ts
// for how). The desktop hid it, because its cards are redrawn from the real
// board a moment later. So this walks the phone column — every page the
// home page reaches, through Custom and every group, surface and submenu — and
// asks the browser itself how big each row's icon came out.

const phone = (page: Page) => page.setViewportSize({ width: 390, height: 844 });

/** The rows on the current page that open another page. */
const NAV =
  ".menu-body button[data-group], .menu-body button[data-surface], .menu-body button[data-submenu]";

interface Blank {
  page: string;
  row: string;
  why: string;
}

/** The icons on the current page that would not show as a picture. */
async function blankIcons(page: Page, where: string): Promise<Blank[]> {
  const found = await page.locator(".menu-body .menu-entry").evaluateAll((rows) =>
    rows.flatMap((row) => {
      const label = row.querySelector(".menu-entry-label")?.textContent ?? "";
      const icon = row.querySelector(".menu-entry-icon");
      if (!icon) return []; // the back row has none, by design
      const svg = icon.querySelector("svg");
      if (!svg) return [{ row: label, why: "no svg" }];
      if (/NaN|Infinity/.test(svg.innerHTML)) return [{ row: label, why: "NaN in the drawing" }];
      const shapes = [...svg.querySelectorAll("path, polygon, circle, rect, ellipse, line")];
      if (shapes.length === 0) return [{ row: label, why: "no shapes" }];
      // the drawing's own extent, in its viewBox units: a degenerate one is
      // as invisible as a NaN one
      const box = (svg as SVGSVGElement).getBBox();
      const view = (svg as SVGSVGElement).viewBox.baseVal;
      if (!(box.width > view.width * 0.2 && box.height > view.height * 0.2)) {
        return [{ row: label, why: `drawing is ${box.width}x${box.height}` }];
      }
      const shown = icon.getBoundingClientRect();
      if (!(shown.width > 8 && shown.height > 8)) {
        return [{ row: label, why: `icon box is ${shown.width}x${shown.height}` }];
      }
      return [];
    }),
  );
  return found.map((b) => ({ page: where, ...b }));
}

/** Check this page, then each page it opens, depth first, coming back with
 * the page's own back row. */
async function walk(page: Page, where: string, seen: Set<string>, out: Blank[]): Promise<void> {
  out.push(...(await blankIcons(page, where)));
  const targets = await page.locator(NAV).evaluateAll((els) =>
    els.map((el) => {
      const d = (el as HTMLElement).dataset;
      const [attr, value] = d.group
        ? ["group", d.group]
        : d.surface
          ? ["surface", d.surface]
          : ["submenu", d.submenu!];
      return { selector: `.menu-body button[data-${attr}="${value}"]`, name: `${attr}:${value}` };
    }),
  );
  for (const { selector, name } of targets) {
    const path = `${where} › ${name}`;
    if (seen.has(path)) continue;
    seen.add(path);
    await page.locator(selector).first().click();
    await expect(page.locator('.menu-body [data-action="back"]').first()).toBeVisible();
    await walk(page, path, seen, out);
    await page.locator('.menu-body [data-action="back"]').first().click();
  }
}

test.describe("menu icons", () => {
  test("every row on every page of the phone menu shows an icon that draws", async ({ page }) => {
    test.setTimeout(120_000);
    await phone(page);
    await page.goto("/");
    await expect(page.locator("body[data-ready]")).toBeVisible();

    const blank: Blank[] = [];
    const seen = new Set<string>();
    await walk(page, "home", seen, blank);

    // the pages this test was written for were reached at all
    expect([...seen].some((p) => p.endsWith("submenu:hyperbolic-uniform"))).toBe(true);
    expect([...seen].some((p) => p.endsWith("submenu:hyperbolic-closed"))).toBe(true);
    expect(blank).toEqual([]);
  });
});
