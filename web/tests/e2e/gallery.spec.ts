import { expect, test } from "@playwright/test";

// Visual-regression gallery: one screenshot per distinct renderer path — the
// flat tiling shapes, then the M2 solids (curved pentagons, a Goldberg
// hex/pentagon mix, the cube's flat grid, and the two non-convex frame
// paths), each at its fixed per-mode starting rotation. Deterministic under
// software WebGL; only authoritative in the pinned CI environment.
const MODES = [
  "square",
  "trigrid",
  "hex",
  "triangle",
  "hexhex",
  "sphere",
  "c80",
  "cube",
  "tetraframe",
  "steppedbipyramid",
  // M3 wraps: the closed donut, the open two-sided cylinder, and the
  // non-orientable Möbius strip / Klein bottle (both drawn two-sided with the
  // back dimmed), each at its SurfaceSpec starting tilt.
  "torus",
  "cylinder",
  "mobius",
  "klein",
  // M5 aperiodic flat tilings: Penrose rhombi (thick/thin), trimmed to a
  // square patch, and the Spectre (a non-convex 13-gon, the chiral monotile
  // -- no tile in its patch is ever mirrored).
  "penrose",
  "spectre",
  // and the phyllotactic spiral: one equilateral hexagon in five arms, whose
  // five-fold rotational symmetry is what forbids a translation.
  "phyllotaxis",
  // and the brick rings, nonperiodic by symmetry rather than by substitution:
  // 2x1 bricks in concentric square rings about a 2x2 core. It is the flat
  // board whose tiles are rectangles rather than regular polygons.
  "brickrings",
  // the fractal boards: the two rep-4 ones -- the sphinx, whose patch is the
  // sphinx again scaled (and whose tiles are mirrored in three of every four),
  // and the chair, the L-shaped one -- plus the two with holes in them, the
  // Sierpinski carpet and the pentaflake (whose lattice is the only
  // non-integer one here) -- and the Gosper island, whose fractal is its
  // ragged outline rather than any hole. None is a rectangular window.
  "sphinx",
  "chair",
  "carpet",
  "pentaflake",
  "gosper",
  // M7 isogonal tilings, which are not edge to edge: the two that put one
  // regular polygon on the board at several sizes, so the shots cover both the
  // T-vertex geometry and the size-lightness axis it needs.
  "pythagorean",
  "threescaletri",
];

/** The look every shot below is taken in unless it is a shot *of* a look.
 *
 * Deliberately **not** the app's default, which is Realistic: that page is
 * full-frame turbulence, which no PNG can compress, and it took a board
 * baseline from 30 KB to 650 KB — 21 MB over the gallery, in a repo whose whole
 * history is 17 MB. These shots are of the *boards*, so the cheapest, quietest
 * page is also the one a geometry regression shows up against most clearly.
 * Flat on light is that page. */
const BASE_LOOK = { theme: "flat", scheme: "light" };

/** Every other finished look: the three themes crossed with the two colour
 * schemes, less `BASE_LOOK`, which is already shot as `square-revealed.png`
 * and the `board-*.png` set. A second baseline of the same pixels under a
 * second name is one that can drift apart from its twin. */
const LOOKS: [string, string][] = [
  ["realistic", "light"],
  ["realistic", "dark"],
  ["flat", "dark"],
  ["classic", "light"],
  ["classic", "dark"],
];

test.describe("board gallery", () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 900, height: 700 });
    // Every test gets a fresh browser context, so without this every board here
    // is a *first* board and carries the one-time gesture hint — chrome rather
    // than the render these shots are of, and worse, chrome on a seven-second
    // timer that a slow shot would race. The look is pinned rather than left at
    // the app's default; see BASE_LOOK. The per-look tests below write their own
    // settings record, so this only fills in where none is set.
    await page.addInitScript((look: { theme: string; scheme: string }) => {
      if (!localStorage.getItem("ms:settings")) {
        localStorage.setItem(
          "ms:settings",
          JSON.stringify({ version: 4, ...look, seenHint: true }),
        );
      }
    }, BASE_LOOK);
  });

  for (const mode of MODES) {
    test(`${mode} board`, async ({ page }) => {
      await page.goto(`/?mode=${mode}&difficulty=easy&seed=1`);
      await expect(page.locator("body[data-ready]")).toBeVisible();
      await page.waitForTimeout(150);
      // No mask needed: with no interaction the timer never starts (reads 000).
      await expect(page).toHaveScreenshot(`board-${mode}.png`);
    });
  }

  test("revealed square with numbers, flag and exploded mine", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator("body[data-ready]")).toBeVisible();
    await page.evaluate(() => {
      const ms = window.__ms!;
      // A wall of mines across row 4 keeps the top from flooding into a win.
      const mines = Array.from({ length: 9 }, (_, c) => `4,${c}`);
      ms.startBoard("square", "easy", { mines });
      ms.reveal("0,0"); // floods rows 0-3, exposing numbers along row 3
      ms.flag("4,4"); // a correct flag on a mine
      ms.reveal("4,2"); // detonate a mine -> exploded + revealed mines
    });
    await page.waitForTimeout(150);
    // The game ends in a loss, which freezes the timer at 0s (reads 000), so
    // the shot is deterministic without masking.
    await expect(page).toHaveScreenshot("square-revealed.png");
  });

  // The same fixture in each look, so they are directly comparable with
  // `square-revealed.png` above (which is `BASE_LOOK`, Flat on the light
  // scheme) — and so a change to one shows up as exactly one changed baseline.
  //
  // A look is two settings now, so this is a *product*: every theme on the light
  // scheme, and every theme on dark. A theme's cell style is read when a board's
  // mesh is built, so both are stored *before* the app boots rather than
  // switched afterwards.
  for (const [style, scheme] of LOOKS) {
    test(`revealed square in the ${style} theme, ${scheme}`, async ({ page }) => {
      await page.addInitScript((look: string[]) => {
        localStorage.setItem(
          "ms:settings",
          JSON.stringify({ version: 4, theme: look[0], scheme: look[1], seenHint: true }),
        );
      }, [style, scheme]);
      await page.goto("/");
      await expect(page.locator("body[data-ready]")).toBeVisible();
      await page.evaluate(() => {
        const ms = window.__ms!;
        const mines = Array.from({ length: 9 }, (_, c) => `4,${c}`);
        ms.startBoard("square", "easy", { mines });
        ms.reveal("0,0");
        ms.flag("4,4");
        ms.reveal("4,2");
      });
      await page.waitForTimeout(150);
      await expect(page).toHaveScreenshot(`square-revealed-${style}-${scheme}.png`);
    });
  }

  // ...and on a solid, where a theme's cells show something else entirely: the
  // plane is lit head-on, so a 3D board is the only place the finish
  // (Realistic's specular sheen) and the paid-back albedo actually read.
  for (const [style, scheme] of LOOKS) {
    test(`sphere in the ${style} theme, ${scheme}`, async ({ page }) => {
      await page.addInitScript((look: string[]) => {
        localStorage.setItem(
          "ms:settings",
          JSON.stringify({ version: 4, theme: look[0], scheme: look[1], seenHint: true }),
        );
      }, [style, scheme]);
      await page.goto("/?mode=sphere&difficulty=easy&seed=1");
      await expect(page.locator("body[data-ready]")).toBeVisible();
      await page.waitForTimeout(150);
      await expect(page).toHaveScreenshot(`sphere-${style}-${scheme}.png`);
    });
  }

  test("revealed cube with numbers, a flag and an exploded mine", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator("body[data-ready]")).toBeVisible();
    await page.evaluate(() => {
      const ms = window.__ms!;
      // Mines along the top row of the front (+z) face; cells are
      // (axis, sign, i, j) with axis 2, sign 1 the front face.
      const mines = [0, 1, 2, 3].map((i) => `2,1,${i},3`);
      ms.startBoard("cube", "easy", { mines });
      // Reveal the numbered row under the mines one by one (each touches a
      // mine, so nothing floods), flag one mine, then detonate another.
      for (const i of [0, 1, 2, 3]) ms.reveal(`2,1,${i},2`);
      ms.flag("2,1,1,3"); // a correct flag on a mine
      ms.reveal("2,1,2,3"); // detonate -> exploded + revealed mines
    });
    await page.waitForTimeout(150);
    await expect(page).toHaveScreenshot("cube-revealed.png");
  });

  test("klein cell contents shift under scroll (offset 0 vs scrolled)", async ({ page }) => {
    // Reveal a spread of numbered cells on a dense-mine Klein board (each safe
    // cell borders a mine, so nothing cascades), then compare the board before
    // and after a scroll: the same numbers appear on different faces, while the
    // geometry never moves. The timer is masked (revealing starts it).
    await page.goto("/");
    await expect(page.locator("body[data-ready]")).toBeVisible();
    await page.evaluate(() => {
      const ms = window.__ms!;
      ms.startBoard("klein", "easy");
      const cells = ms.cells();
      const n = cells.length;
      const safe = Array.from({ length: 8 }, (_, k) => cells[Math.floor((k * n) / 8)]!);
      const safeSet = new Set(safe);
      ms.startBoard("klein", "easy", { mines: cells.filter((c) => !safeSet.has(c)) });
      for (const c of safe.slice(0, 6)) ms.reveal(c);
    });
    const timer = page.locator('.hud-counter[data-slot="timer"]');
    await page.waitForTimeout(150);
    await expect(page).toHaveScreenshot("klein-revealed.png", { mask: [timer] });
    await page.evaluate(() => window.__ms!.scroll(1));
    await page.waitForTimeout(150);
    await expect(page).toHaveScreenshot("klein-scrolled.png", { mask: [timer] });
  });

  test("a Realistic sphere's pins carry their resting ember", async ({ page }) => {
    // The markers' own baseline: the standing pins, lit by nothing but the
    // glow's resting level. That ember is a *look* rather than a motion, so
    // unlike the wave it survives this suite's reduced-motion setting and is
    // exactly what a settled frame should show — which makes this the one shot
    // that would catch it drifting. The wave and the blast are measured instead
    // (tests/e2e/animations.spec.ts): both are over inside a second, which is
    // quicker than a screenshot round trip here.
    await page.addInitScript(() => {
      localStorage.setItem(
        "ms:settings",
        JSON.stringify({ version: 4, theme: "realistic", scheme: "light", seenHint: true }),
      );
    });
    await page.goto("/");
    await expect(page.locator("body[data-ready]")).toBeVisible();
    await page.evaluate(() => window.__ms!.startBoard("sphere", "easy"));
    // `cellScreenXY` needs a drawn frame before it can answer, and answering
    // null is what marks a cell on the far side — so the pins go on the face in
    // shot rather than behind the ball.
    await page.waitForTimeout(150);
    await page.evaluate(() => {
      const ms = window.__ms!;
      const visible = ms.cells().filter((c) => ms.cellScreenXY(c) !== null);
      const step = Math.max(1, Math.floor(visible.length / 8));
      const mines = Array.from({ length: 7 }, (_, i) => visible[i * step]!);
      ms.startBoard("sphere", "easy", { mines });
      for (const c of mines) ms.flag(c);
    });
    await page.waitForTimeout(150);
    await expect(page).toHaveScreenshot("sphere-realistic-pins.png");
  });

  test("sphere glyphs stay on the visible hemisphere", async ({ page }) => {
    // Flagging every cell makes any glyph that leaks past the silhouette onto
    // the back surface plainly visible — the regression guard for the
    // perspective-correct glyph cull.
    await page.goto("/");
    await expect(page.locator("body[data-ready]")).toBeVisible();
    await page.evaluate(() => {
      const ms = window.__ms!;
      ms.startBoard("sphere", "easy"); // build it first to enumerate cells
      const cells = ms.cells();
      ms.startBoard("sphere", "easy", { mines: cells.slice(0, 7) });
      for (const c of cells) ms.flag(c);
    });
    await page.waitForTimeout(150);
    await expect(page).toHaveScreenshot("sphere-flagged.png");
  });
});
