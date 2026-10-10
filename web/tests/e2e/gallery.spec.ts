import { expect, test } from "@playwright/test";

// Linux only. Every baseline in gallery.spec.ts-snapshots is a
// `-chromium-linux.png`, shot under SwiftShader on x86-64; on a Mac
// Playwright looks for a `-chromium-darwin.png`, finds none, and writes 41
// new ones on its way to failing. Those pixels are legitimately different —
// Skia rasterises text through CoreText there — so there is nothing to fix by
// regenerating them, and a second committed set could only ever be refreshed
// on a Mac, by hand, and never checked by CI. The other nineteen specs are
// platform independent and still run, which is what makes `npm run e2e` worth
// typing on a Mac at all. The visual half is what the Linux container is for:
// `npm run e2e:docker`, and "Running the visual suite off Linux" in
// ../../docs/testing.md.
test.skip(
  process.platform !== "linux",
  "visual baselines are x86-64 Linux — run `npm run e2e:docker`",
);

// Visual-regression gallery: one screenshot per distinct renderer path — the
// flat tiling shapes, then the M2 solids (curved pentagons, a Goldberg
// hex/pentagon mix, the cube's flat grid, and the two non-convex frame
// paths), each at its fixed per-mode starting rotation. Deterministic under
// software WebGL; only authoritative under the pinned Chromium build.
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
  // ...and the one closed surface that is not a wrapped rectangle: two donuts
  // merged at their outer rims. Its own renderer path is the donut's, but the
  // shape of the join is geometry nothing else in the suite can see.
  "doubletorus",
  // ...and the donut's own lattice on a tube round a trefoil knot: the same
  // renderer path, but the only board whose winding is measured from a curve
  // rather than a circle, and whose strands pass over and under each other.
  "trefoil",
  // M5 aperiodic flat tilings: Penrose rhombi (thick/thin), trimmed to a
  // square patch, and the Spectre (a non-convex 13-gon, the chiral monotile
  // -- no tile in its patch is ever mirrored).
  "penrose",
  // and Penrose's other pair, kites and darts: the same Robinson triangles
  // paired along a leg, so the one aperiodic board with a concave tile whose
  // number is not centred on its vertex mean (see the revealed shot below).
  "kitedart",
  "spectre",
  // and Ammann–Beenker: unit squares and 45° rhombi, the eight-fold one.
  "ammannbeenker",
  // and the phyllotactic spiral: one equilateral hexagon in five arms, whose
  // five-fold rotational symmetry is what forbids a translation.
  "phyllotaxis",
  // and Klaassen's spiral: one equilateral heptagon, a bent chevron in a single
  // arm about a seed. The only tile with no point that sees all of it, so the
  // only shot of the renderer's mitred, triangulated path for such a cell.
  "klaassen",
  // and Klaassen's pentagonal spirals: one convex pentagon in n arms, n = 5,
  // 6, 7 -- the pairs of it are the phyllotactic hexagon at n-fold, cut a third
  // of the way along a side, so the only flat boards whose cells carry a
  // T-vertex on a pentagon.
  "pentaspiral5",
  "pentaspiral6",
  "pentaspiral7",
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
  // the hyperbolic discs: a flat board drawn in the Poincare disc, every edge
  // a geodesic arc through extra points, and cells shrinking toward a rim they
  // never reach -- the shots pin the arcs, the per-cell glyph room and the one
  // shape colour a curved model takes
  "hyperbolic73",
  "hyperbolic54",
  "hyperbolic45",
  // M7 isogonal tilings, which are not edge to edge: the two that put one
  // regular polygon on the board at several sizes, so the shots cover both the
  // T-vertex geometry and the size-lightness axis it needs.
  "pythagorean",
  "threescaletri",
  // and the volume board, which is its own renderer path: a solid drawn as
  // several open, two-sided sheets rather than one closed surface, so it is
  // the only board where the camera frames a hull that has holes in it and
  // nothing is culled at any angle.
  "cube3d",
];

/** The look every shot below is taken in unless it is a shot *of* a look.
 *
 * Deliberately **not** the app's default: these shots are of the *boards*, so
 * the quietest board is the one a geometry regression shows up against most
 * clearly. Bright's full-strength shape colours (so a tiling's classes are
 * legible) cut flat (plain plates — no relief, no gradient, no translucency
 * between the board and the page), on light. */
const BASE_LOOK = { theme: "bright", shape: "flat", scheme: "light" };

/** ...and **every** shot here is taken on a flat field, whatever its theme's
 * page is really made of.
 *
 * Every theme carries a grain now — the axis split (v5) left no untextured
 * palette, since the one theme that had a plain field was folded into Bright —
 * and full-frame turbulence is the one thing a PNG cannot compress: measured, it
 * takes a board baseline from 30 KB to 650 KB, which is 21 MB over this gallery
 * in a repo whose whole history is 17 MB. So the page's own layers are turned
 * off here and asserted where they cost nothing:
 * `tests/e2e/settings.spec.ts` reads `--bg-texture` per theme, and
 * `tests/unit/backgroundPattern.test.ts` pins the tiling drawn over it.
 *
 * `!important` in an author stylesheet beats the *inline* property `applyTheme`
 * writes on the document element, which is the only way to reach it from
 * outside the app. `--bg` and `--bg2` are left alone, so the field is still the
 * theme's own colour — what goes is the noise. */
const FLAT_PAGE = ":root { --bg-texture: none !important; --bg-pattern: none !important; }";

/** Finished looks: one shot per theme per colour scheme, at the *default* cut,
 * plus the two other cuts on the default theme. The full product is
 * three-by-three-by-two and most of it would be a picture of a picture — a cut
 * is the same cut whichever palette paints it, and a palette the same palette
 * whichever cut wears it — so this is the cross rather than the cube. A second
 * baseline of the same pixels under a second name is one that can drift apart
 * from its twin, which is why `BASE_LOOK` is not repeated here. */
const LOOKS: [string, string, string][] = [
  ["bright", "soft", "light"],
  ["bright", "soft", "dark"],
  ["classic", "soft", "light"],
  ["classic", "soft", "dark"],
  ["sand", "soft", "light"],
  ["sand", "soft", "dark"],
  ["sand", "classic", "light"],
  ["sand", "realistic", "light"],
  ["sand", "flat", "light"],
];

/** The looks worth a second baseline on a **solid**, where a cut shows what a
 * head-on plane cannot: its specular sheen, and what `albedo` pays back under
 * real shading. So: every cut on the default theme, and the two other themes at
 * the cut whose sheen is the loudest — in particular Classic, whose `albedo` is
 * the theme's rather than the cut's and only reads on a curved surface. */
const SOLID_LOOKS: [string, string, string][] = [
  ["sand", "soft", "light"],
  ["sand", "classic", "light"],
  ["sand", "realistic", "light"],
  ["sand", "flat", "light"],
  ["classic", "realistic", "light"],
  ["bright", "realistic", "dark"],
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
          JSON.stringify({ version: 5, ...look, seenHint: true }),
        );
      }
    }, BASE_LOOK);
    await page.addInitScript((css: string) => {
      // At `DOMContentLoaded`, so `<head>` exists — an init script runs before
      // the document does.
      document.addEventListener("DOMContentLoaded", () => {
        const style = document.createElement("style");
        style.textContent = css;
        document.head.append(style);
      });
    }, FLAT_PAGE);
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

  // A dart's vertex mean sits a hair from its reflex corner, so a number centred
  // there came out a quarter of the size the tile holds. The board anchors each
  // glyph in the biggest circle the tile holds instead (`kiteDartGlyphAnchor`),
  // and this pins it: 17 darts carry a number here, in the default Soft cut,
  // and every one has to sit inside its arrowhead at a readable size. Mines
  // picked so the flood from the centre stops on darts; the last reveal
  // detonates one, which freezes the timer at 000.
  test("revealed kite-and-dart: the numbers fit inside the darts", async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem(
        "ms:settings",
        JSON.stringify({ version: 5, theme: "bright", shape: "soft", scheme: "light", seenHint: true }),
      );
    });
    await page.goto("/");
    await expect(page.locator("body[data-ready]")).toBeVisible();
    await page.evaluate(() => {
      const ms = window.__ms!;
      const mines = ["0,26", "0,36", "0,50", "0,54", "0,129", "0,182", "0,209", "0,223", "1,222"];
      ms.startBoard("kitedart", "easy", { mines });
      ms.reveal("0,130"); // the centre: floods out to the numbered rim
      ms.reveal("0,26");
    });
    await page.waitForTimeout(150);
    await expect(page).toHaveScreenshot("kitedart-revealed.png");
  });

  // The same fixture in each look, so they are directly comparable with
  // `square-revealed.png` above (which is `BASE_LOOK`) — and so a change to one
  // shows up as exactly one changed baseline. A cut and a theme's board colours
  // are both read when a board's mesh is built, so the whole record is stored
  // *before* the app boots rather than switched afterwards.
  for (const [theme, shape, scheme] of LOOKS) {
    test(`revealed square: ${theme} theme, ${shape} cells, ${scheme}`, async ({ page }) => {
      await page.addInitScript((look: string[]) => {
        localStorage.setItem(
          "ms:settings",
          JSON.stringify({
            version: 5,
            theme: look[0],
            shape: look[1],
            scheme: look[2],
            seenHint: true,
          }),
        );
      }, [theme, shape, scheme]);
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
      await expect(page).toHaveScreenshot(`square-revealed-${theme}-${shape}-${scheme}.png`);
    });
  }

  // The Soft cut rounds corners off, and this is a geometry game: the shapes
  // must stay legible. A square board shows little of that, so the hexagon
  // board and a mixed tiling (triangles, squares and hexagons at once) are shot
  // in it too — the boards a too-generous rounding turned into circles.
  for (const mode of ["hexhex", "rhombitrihex"]) {
    test(`${mode} board in soft cells`, async ({ page }) => {
      await page.addInitScript(() => {
        localStorage.setItem(
          "ms:settings",
          JSON.stringify({ version: 5, theme: "bright", shape: "soft", scheme: "light", seenHint: true }),
        );
      });
      await page.goto(`/?mode=${mode}&difficulty=easy&seed=1`);
      await expect(page.locator("body[data-ready]")).toBeVisible();
      await page.waitForTimeout(150);
      await expect(page).toHaveScreenshot(`board-${mode}-soft.png`);
    });
  }

  // ...and on a solid, where the same cells show something else entirely: the
  // plane is lit head-on, so a 3D board is the only place the finish (the domed
  // cut's specular sheen) and the paid-back albedo actually read. That argument
  // is about the *cut* and about `albedo`, not about the palette — so this is
  // `SOLID_LOOKS` rather than the whole cross again.
  for (const [theme, shape, scheme] of SOLID_LOOKS) {
    test(`sphere: ${theme} theme, ${shape} cells, ${scheme}`, async ({ page }) => {
      await page.addInitScript((look: string[]) => {
        localStorage.setItem(
          "ms:settings",
          JSON.stringify({
            version: 5,
            theme: look[0],
            shape: look[1],
            scheme: look[2],
            seenHint: true,
          }),
        );
      }, [theme, shape, scheme]);
      await page.goto("/?mode=sphere&difficulty=easy&seed=1");
      await expect(page.locator("body[data-ready]")).toBeVisible();
      await page.waitForTimeout(150);
      await expect(page).toHaveScreenshot(`sphere-${theme}-${shape}-${scheme}.png`);
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

  test("a domed sphere's pins carry their resting ember", async ({ page }) => {
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
        JSON.stringify({
          version: 5,
          theme: "bright",
          shape: "realistic",
          scheme: "light",
          seenHint: true,
        }),
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
    await expect(page).toHaveScreenshot("sphere-domed-pins.png");
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
