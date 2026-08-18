import { describe, expect, it } from "vitest";
import { patternKey, patternLayer, patternSvg } from "../../src/ui/backgroundPattern";
import {
  APERIODIC_MODES,
  FRACTAL_MODES,
  SOLID_GROUPS,
  modeFor,
  tilingAllows,
  tilingOf,
  SURFACE_SPECS,
  TILING_SPECS,
} from "../../src/boards/catalog";
import { MODES } from "../../src/boards/presets";
import { theme, themeVars, THEME_KEYS } from "../../src/ui/theme";
import { themeSpec } from "../../src/config/screens";

// The page behind a board follows that board's own tiling. What is worth
// pinning here is not how a tile looks — that is a screenshot's job — but the
// three properties a picture would not catch: every mode is classified (so a
// new board cannot ship with a blank page), the periodic tiles really do
// repeat seamlessly, and no line is drawn twice (which at seven percent alpha
// is the difference between an even field and a blotchy one).

/** The pattern key of every mode, and which modes share it. */
const BY_KEY = new Map<string, string[]>();
for (const mode of MODES) {
  const key = patternKey(mode);
  if (key !== null) BY_KEY.set(key, [...(BY_KEY.get(key) ?? []), mode]);
}

/** Every key. All of them are periods: a board's patch may be aperiodic or
 * fractal, but its *tile* tiles the plane periodically on its own — given, for
 * two of them, a couple of other figures to tile with. */
const PERIODIC = [...BY_KEY.keys()];

type Seg = [number, number, number, number];

/** The segments a tile actually draws, read back out of its own path data —
 * `M x,y L x,y`, one subpath per line. Parsing the output rather than exporting
 * the geometry keeps the module's surface to what the app uses, and tests what
 * ships rather than what feeds it. */
function segmentsOf(key: string): Seg[] {
  const segs: Seg[] = [];
  for (const [, d] of patternSvg(key).matchAll(/<path d='([^']*)'\/>/g)) {
    for (const m of d!.matchAll(/M(-?[\d.]+),(-?[\d.]+)L(-?[\d.]+),(-?[\d.]+)/g)) {
      segs.push([+m[1]!, +m[2]!, +m[3]!, +m[4]!]);
    }
  }
  return segs;
}

function tileSize(key: string): [number, number] {
  const m = /width='(\d+)' height='(\d+)'/.exec(patternSvg(key))!;
  return [+m[1]!, +m[2]!];
}

describe("which pattern a mode gets", () => {
  it("classifies every mode this build can play", () => {
    // The guard that matters: a mode added to presets.json without a line in
    // backgroundPattern.ts would leave that board on a blank page.
    const missing = MODES.filter((mode) => patternKey(mode) === null);
    expect(missing).toEqual([]);
    expect(MODES.length).toBe(175);
  });

  it("follows the tiling, not the surface", () => {
    // The whole point: a trihexagonal board is trihexagonal on the plane, the
    // torus, the cylinder, the Mobius strip and the Klein bottle alike.
    for (const tiling of TILING_SPECS) {
      const modes = SURFACE_SPECS.filter((s) => tilingAllows(tiling, s)).map((s) =>
        modeFor(tiling.key, s.key),
      );
      expect(new Set(modes.map((m) => patternKey(m))).size).toBe(1);
      expect(patternKey(modes[0]!)).toBe(tilingOf(modes[0]!));
    }
  });

  it("gives a folded flat grid to the polyhedra and circles to the spheres", () => {
    // A cube, its Menger frame and the stepped bipyramid are square grids
    // wrapped round a solid; a tetrahedron and its frame are triangles. A
    // Catalan solid takes the Laves tiling of the same Conway operation — the
    // plane's own face-transitive duals. Only the sphere family, whose
    // geodesic triangles close up because the surface curves, has no flat
    // tiling to follow.
    expect(patternKey("cube")).toBe("square");
    expect(patternKey("cubeframe")).toBe("square");
    expect(patternKey("steppedbipyramid")).toBe("square");
    expect(patternKey("tetrahedron")).toBe("tri");
    expect(patternKey("tetraframe")).toBe("tri");
    const group = (key: string): string[] =>
      SOLID_GROUPS.find((g) => g.key === key)?.modes ?? [];
    for (const mode of group("sphere")) expect(patternKey(mode)).toBe("circles");
    for (const key of ["platonic", "catalan", "polyhedra"]) {
      for (const mode of group(key)) expect(patternKey(mode)).not.toBe("circles");
    }
    // the Laves dual of each Conway operation: rhombille under a rhombic
    // solid, the deltoidal trihexagonal under a kite one, the hexagonal
    // tiling's own barycentric subdivision under a disdyakis one, and a
    // pentagonal Laves tiling under each chiral pentagonal solid
    expect(patternKey("rhombictriaconta")).toBe("rhombille");
    expect(patternKey("deltoidalhexeconta")).toBe("deltoidal");
    expect(patternKey("disdyakisdodeca")).toBe("kisrhombille");
    expect(patternKey("pentagonalicositetra")).toBe("cairo");
    expect(patternKey("sphere")).toBe("floret");
  });

  it("lays the aperiodic boards' own tiles down periodically where it can", () => {
    // A tiling with no repeat cannot be a repeating page, so what the page
    // draws is the *tile*: the phyllotactic hexagon is a parallelohexagon and
    // tiles by translation alone, and Penrose's two rhombs make a plain
    // periodic tiling as alternating courses. The Spectre is the one board that
    // cannot draw its own tile at all — no cell it belongs to has a rectangular
    // lattice — so it takes the tiling the hat continuum is cut from.
    expect(patternKey("penrose")).toBe("penrose");
    expect(patternKey("phyllotaxis")).toBe("phyllotaxis");
    expect(patternKey("spectre")).toBe("deltoidal");
    for (const mode of APERIODIC_MODES) expect(PERIODIC).toContain(patternKey(mode));
  });

  it("lays the fractal boards' own tiles down periodically", () => {
    // Their patches do not repeat, but the tiles they are made of do — plain
    // hexagons for the Gosper island, and the sphinx and the chair as
    // themselves. Regular pentagons famously do not tile the plane, which is
    // why the pentaflake has holes, but pentagons *and* 36° rhombs do — two of
    // the first to one of the second. The Sierpinski carpet is unit squares.
    for (const mode of ["sphinx", "chair", "gosper", "pentaflake"]) {
      expect(patternKey(mode)).toBe(mode);
    }
    expect(patternKey("carpet")).toBe("square");
    for (const mode of FRACTAL_MODES) expect(PERIODIC).toContain(patternKey(mode));
  });

  it("shapes the flat boards after the tiling they are cut from", () => {
    expect(patternKey("triangle")).toBe("tri");
    expect(patternKey("hextri")).toBe("tri");
    expect(patternKey("hexhex")).toBe("hex");
    expect(patternKey("hextriangle")).toBe("hex");
  });

  it("has no pattern for the menu or for a mode it does not know", () => {
    expect(patternKey(null)).toBe(null);
    expect(patternKey(undefined)).toBe(null);
    expect(patternLayer(null)).toBe(null);
    // A link from a newer build: degrade to the plain page, never throw.
    expect(patternLayer("nosuchboard")).toBe(null);
    expect(patternLayer("toString")).toBe(null);
  });
});

describe("the tile", () => {
  it("is a self-contained data URI", () => {
    for (const [key, modes] of BY_KEY) {
      const layer = patternLayer(modes[0]!)!;
      expect(layer, key).toMatch(/^url\("data:image\/svg\+xml,[^<>#"]*"\)$/);
      const doc = decodeURIComponent(layer.slice('url("data:image/svg+xml,'.length, -2));
      expect(doc.startsWith("<svg "), key).toBe(true);
      // The offline builds allow exactly one host in a bundled asset, and it is
      // the SVG namespace (scripts/check-offline-assets.mjs). Anything else here
      // would be a page that does not render without a network.
      expect(doc.match(/https?:\/\/[^'"]*/g), key).toEqual(["http://www.w3.org/2000/svg"]);
    }
  });

  it("declares its own size, so it repeats at the size it was drawn", () => {
    // Without width/height a background SVG has no intrinsic size: Chrome falls
    // back to 300x150 and Firefox stretches it to the page, and there is no
    // `background-size` here to correct either.
    for (const key of BY_KEY.keys()) {
      const [w, h] = tileSize(key);
      expect(w, key).toBeGreaterThanOrEqual(36);
      expect(h, key).toBeGreaterThanOrEqual(36);
      expect(patternSvg(key), key).toContain(`viewBox='0 0 ${w} ${h}'`);
    }
  });

  it("stays small enough to live in a style property", () => {
    for (const [key, modes] of BY_KEY) {
      // Every tile is one repeat of a period, so none of them is large.
      expect(patternLayer(modes[0]!)!.length, key).toBeLessThan(12_000);
    }
  });

  it("is built once per geometry, not once per mode", () => {
    expect(patternLayer("trihex")).toBe(patternLayer("torustrihex"));
    expect(patternLayer("torus")).toBe(patternLayer("cube"));
    expect(patternLayer("spheretri")).toBe(patternLayer("c80"));
    expect(patternLayer("sphere")).toBe(patternLayer("floret"));
    expect(patternLayer("penrose")).toBe(patternLayer("penrose"));
  });
});

describe("the geometry", () => {
  it("repeats every tile seamlessly — there are no crops left", () => {
    // *Every* page is a period now: a board's patch may be aperiodic or
    // fractal, but its tile tiles the plane on its own (given, for the
    // pentaflake, a couple of other figures to tile with), and the Spectre —
    // the one tile that cannot — borrows a relative's tiling rather than a
    // cropped patch of itself. So this runs over the whole catalogue.
    expect(PERIODIC.length).toBe(BY_KEY.size);
    // The tile is drawn from a block of domain copies around the viewBox and
    // clipped, so a cell straddling the edge arrives whole from the tile next
    // door. Stated as the property that makes that true: every segment shifted
    // by one tile is either drawn too, or falls outside the clip.
    for (const key of PERIODIC) {
      const [w, h] = tileSize(key);
      const segs = segmentsOf(key);
      const seen = new Set(segs.map((s) => s.map((v) => Math.round(v * 10)).join(",")));
      const clipped = ([x1, y1, x2, y2]: Seg): boolean =>
        Math.min(x1, x2) > w + 1 ||
        Math.max(x1, x2) < -1 ||
        Math.min(y1, y2) > h + 1 ||
        Math.max(y1, y2) < -1;
      for (const [dx, dy] of [
        [w, 0],
        [-w, 0],
        [0, h],
        [0, -h],
      ]) {
        for (const [x1, y1, x2, y2] of segs) {
          const moved: Seg = [x1 + dx!, y1 + dy!, x2 + dx!, y2 + dy!];
          if (clipped(moved)) continue;
          const key1 = moved.map((v) => Math.round(v * 10)).join(",");
          const key2 = [moved[2], moved[3], moved[0], moved[1]]
            .map((v) => Math.round(v * 10))
            .join(",");
          expect(seen.has(key1) || seen.has(key2), `${key} +(${dx},${dy})`).toBe(true);
        }
      }
    }
  });

  it("draws every line exactly once", () => {
    // Two cells share an edge, so stroking each cell as a closed path paints
    // every interior line twice — and at this alpha a doubled line is plainly
    // darker than a single one, which turns the most regular tilings blotchy.
    // De-duplication only works if neighbours agree on where an edge *ends*,
    // which is why the hand-written tiles carry a vertex at every lattice step;
    // an overlap here is that agreement breaking.
    for (const key of PERIODIC) {
      const lines = new Map<string, [number, number][]>();
      for (const [x1, y1, x2, y2] of segmentsOf(key)) {
        let [dx, dy] = [x2 - x1, y2 - y1];
        const len = Math.hypot(dx, dy);
        if (len < 1e-6) continue;
        // Canonical line id: direction with a fixed sign, and the perpendicular
        // offset from the origin. Rounded coarsely enough to absorb the tile's
        // whole-pixel rounding, finely enough to keep distinct lines apart.
        if (dx < 0 || (Math.abs(dx) < 1e-9 && dy < 0)) [dx, dy] = [-dx, -dy];
        const [ux, uy] = [dx / len, dy / len];
        const id = `${Math.round(ux * 100)},${Math.round(uy * 100)},${Math.round(
          (x1 * uy - y1 * ux) * 4,
        )}`;
        // Position along the line, so two segments of it are intervals.
        const [t1, t2] = [x1 * ux + y1 * uy, x2 * ux + y2 * uy];
        lines.set(id, [...(lines.get(id) ?? []), [Math.min(t1, t2), Math.max(t1, t2)]]);
      }
      for (const [id, spans] of lines) {
        spans.sort((a, b) => a[0] - b[0]);
        for (let i = 1; i < spans.length; i++) {
          // Measured as a share of the shorter segment, not in pixels: a line
          // drawn twice overlaps itself entirely, while the fractions of a
          // pixel seen here are two edges at a shallow angle that the bucketing
          // above has lumped onto one line (the triakis tilings are full of
          // them). A quarter is far above the one and far below the other.
          const overlap = Math.min(spans[i]![1], spans[i - 1]![1]) - spans[i]![0];
          const shorter = Math.min(
            spans[i]![1] - spans[i]![0],
            spans[i - 1]![1] - spans[i - 1]![0],
          );
          expect(overlap / shorter, `${key} overlap on ${id}`).toBeLessThan(0.25);
        }
      }
    }
  });
});

describe("only Realistic is patterned", () => {
  it("marks one theme, and gives the rest a flat page", () => {
    expect(THEME_KEYS.filter((k) => theme(k).patterned)).toEqual(["realistic"]);
  });

  it("leaves --bg-pattern off unless it is given one", () => {
    // ui/settings.ts draws the pickers' swatches by calling themeVars with the
    // texture and no pattern, so a swatch shows the theme rather than whatever
    // board was last open. That is this default, and nothing else.
    for (const key of THEME_KEYS) {
      const spec = theme(key);
      for (const scheme of ["light", "dark"] as const) {
        expect(
          themeVars(themeSpec(spec.palette[scheme]), spec.texture?.[scheme])["--bg-pattern"],
          `${key}/${scheme}`,
        ).toBe("none");
      }
    }
    const vars = themeVars(themeSpec("ios"), undefined, patternLayer("trihex")!);
    expect(vars["--bg-pattern"]).toContain("data:image/svg+xml");
  });
});

describe("the ink follows the colour scheme", () => {
  // A hairline works by moving the page toward its opposite, so the light
  // scheme's dark slate over a near-black page is not faint, it is absent: it
  // shifts a pixel by about four values in 255. The dark scheme therefore gets
  // a *lighter* ink than its page, and the two tiles have to be two tiles.
  const strokeOf = (svg: string): string =>
    /stroke='(#[0-9a-f]{6})'/.exec(svg)?.[1] ?? "";
  const alphaOf = (svg: string): number =>
    Number(/stroke-opacity='([\d.]+)'/.exec(svg)?.[1] ?? "0");
  const luma = (hex: string): number =>
    [1, 3, 5]
      .map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
      .reduce((sum, c, i) => sum + [0.2126, 0.7152, 0.0722][i]! * c, 0);

  it("inks light on a dark page and dark on a light one", () => {
    const light = patternSvg("trihex", "light");
    const dark = patternSvg("trihex", "dark");
    // Against their own pages: #f2f2f7 and #101014 (data/ui/screens.json).
    expect(luma(strokeOf(light))).toBeLessThan(luma("#f2f2f7"));
    expect(luma(strokeOf(dark))).toBeGreaterThan(luma("#101014"));
    // Both stay a hairline rather than a hatch.
    expect(alphaOf(light)).toBeGreaterThan(0);
    expect(alphaOf(light)).toBeLessThan(0.15);
    expect(alphaOf(dark)).toBeGreaterThan(0);
    expect(alphaOf(dark)).toBeLessThan(0.15);
  });

  it("draws the same geometry either way", () => {
    // The scheme is a colour, not a shape: strip the stroke attributes and the
    // two documents must be identical, or a page would shift when the sun goes
    // down.
    const bare = (svg: string): string =>
      svg.replace(/stroke='[^']*'/, "").replace(/stroke-opacity='[^']*'/, "");
    expect(bare(patternSvg("trihex", "dark"))).toBe(bare(patternSvg("trihex", "light")));
  });

  it("memoises per scheme, not per tiling alone", () => {
    // The ink is baked into the data URI, so a cache keyed on geometry alone
    // would hand the first scheme to open a tiling back to the second — and one
    // of the two would get a hairline the colour of its own page. Asked in both
    // orders, since the bug is order-dependent by construction.
    const darkFirst = patternLayer("torushex", "dark");
    const lightAfter = patternLayer("torushex", "light");
    expect(darkFirst).not.toBe(lightAfter);
    expect(patternLayer("torushex", "dark")).toBe(darkFirst);
    expect(patternLayer("torushex", "light")).toBe(lightAfter);
    // ...and the menu still has no pattern at all, on either scheme.
    expect(patternLayer(null, "dark")).toBeNull();
  });
});
