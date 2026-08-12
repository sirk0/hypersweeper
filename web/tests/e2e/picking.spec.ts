import { expect, test, type Page } from "@playwright/test";

// Picking a two-sided surface (cylinder / Möbius strip / Klein bottle), which is
// drawn from both faces and culls nothing: a ray that misses the near sheet
// carries on through the board and hits a cell on the *far* one.
//
// It used to miss all the time. A cell's tile is shrunk by the cell style's gap
// and the grout under the gaps was drawn but never picked, so the ~10% of the
// board that is grout line picked either nothing at all or whatever the ray
// found on the other side of the board: a click aimed between two tiles opened,
// or detonated, a cell behind them. The tests below pin the same rule from
// three sides — a pick lands on the cell drawn at that point, never on one
// behind it, and never on nothing.

const TWO_SIDED = ["cylinder", "mobius", "klein"];

interface Seen {
  cell: string;
  x: number;
  y: number;
}

/** The cells whose own centre picks them back — the ones a player can see and
 * aim at. A two-sided surface culls nothing, so `cellScreenXY` reports
 * positions for cells hidden behind the immersion too, and this round trip is
 * what filters them out. */
async function visibleCells(page: Page, mode: string): Promise<Seen[]> {
  await page.evaluate((mode) => window.__ms!.startBoard(mode, "easy"), mode);
  // A board's world transform lands when it renders; measuring in the same
  // round trip as startBoard reads stale matrices.
  await page.evaluate(
    () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))),
  );
  return page.evaluate(() => {
    const ms = window.__ms!;
    const seen: Seen[] = [];
    for (const cell of ms.cells()) {
      const xy = ms.cellScreenXY(cell);
      if (xy && ms.cellAtScreenXY(xy.x, xy.y) === cell) seen.push({ cell, ...xy });
    }
    return seen;
  });
}

/** Visible pairs of cells one step apart in the wrapped tiling's own lattice
 * (cells are keyed `<around>,<along>`), widest on screen first. Steps across
 * the wrap seam are left out: there a lattice step says nothing about where the
 * two land on screen. The segment between such a pair's centres crosses one
 * grout line, which is what these tests aim at. */
function seams(seen: Seen[]): { a: Seen; b: Seen; d: number }[] {
  const at = new Map(seen.map((s) => [s.cell, s]));
  const pairs: { a: Seen; b: Seen; d: number }[] = [];
  for (const a of seen) {
    const [i, j] = a.cell.split(",").map(Number) as [number, number];
    for (const b of [at.get(`${i + 1},${j}`), at.get(`${i},${j + 1}`)]) {
      if (b) pairs.push({ a, b, d: Math.hypot(a.x - b.x, a.y - b.y) });
    }
  }
  return pairs.sort((p, q) => q.d - p.d);
}

/** Points along the segment between two cell centres, a pixel apart. */
function walk(a: Seen, b: Seen): { x: number; y: number }[] {
  const steps = Math.max(2, Math.round(Math.hypot(a.x - b.x, a.y - b.y)));
  return Array.from({ length: steps + 1 }, (_, i) => ({
    x: a.x + ((b.x - a.x) * i) / steps,
    y: a.y + ((b.y - a.y) * i) / steps,
  }));
}

test.describe("picking a two-sided surface", () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 900, height: 700 });
    await page.goto("/");
    await expect(page.locator("body[data-ready]")).toBeVisible();
  });

  for (const mode of TWO_SIDED) {
    // The grout only *looks* like a groove: the surface is drawn opaque from
    // tile to tile, so every point between two tiles belongs to one of them —
    // it is not a hole to aim through, and not a window onto the far sheet.
    //
    // Measured on the widest seams: those are the tiles facing the camera most
    // squarely, so nothing else is folded in front of them (on a Möbius strip
    // or a Klein bottle another part of the sheet legitimately crosses over a
    // seam near the silhouette, and the Klein's neck is cut away where it
    // passes through the body, which is a real hole). They are also where the
    // grout line is widest on screen, and where the far sheet lies directly
    // behind it — the worst of the bug.
    test(`${mode}: a seam facing the camera belongs to its two tiles`, async ({ page }) => {
      const seen = await visibleCells(page, mode);
      expect(seen.length, `${mode}: nothing is visible`).toBeGreaterThan(4);
      const pairs = seams(seen).slice(0, 5);
      expect(pairs.length, `${mode}: no two visible cells are neighbours`).toBe(5);

      const strays = await page.evaluate(
        (seams: { a: string; b: string; points: { x: number; y: number }[] }[]) => {
          const ms = window.__ms!;
          const out: string[] = [];
          for (const { a, b, points } of seams) {
            for (const p of points) {
              const cell = ms.cellAtScreenXY(p.x, p.y);
              if (cell !== a && cell !== b) {
                out.push(`${a}..${b} at (${p.x.toFixed(1)}, ${p.y.toFixed(1)}): ${cell}`);
              }
            }
          }
          return out;
        },
        pairs.map(({ a, b }) => ({ a: a.cell, b: b.cell, points: walk(a, b) })),
      );
      expect(strays.slice(0, 8), `${mode}: a seam picked neither of its tiles`).toEqual([]);
    });
  }

  // The cylinder's cells are keyed `<around>,<along>`, so "the other side of the
  // board" is a ring index that jumps — and a step of one screen pixel can only
  // ever move to a neighbouring cell of the sheet being looked at.
  test("cylinder: a line across the tube walks one cell at a time", async ({ page }) => {
    const seen = await visibleCells(page, "cylinder");
    const ring = await page.evaluate(
      () => Math.max(...window.__ms!.cells().map((c) => Number(c.split(",")[0]))) + 1,
    );
    // Scan at the height of a visible cell of the middle row: there the tube is
    // opaque from silhouette to silhouette (no looking in through an open end),
    // so every point of the scan between its ends is a cell of the near sheet.
    const rows = Math.max(...seen.map((s) => Number(s.cell.split(",")[1]))) + 1;
    const middle = seen.filter((s) => Number(s.cell.split(",")[1]) === Math.floor(rows / 2));
    expect(middle.length, "no visible cell in the middle row").toBeGreaterThan(0);
    const y = middle.map((s) => s.y).sort((p, q) => p - q)[Math.floor(middle.length / 2)]!;

    const line = await page.evaluate(
      ({ y, width }) => {
        const ms = window.__ms!;
        const out: (string | null)[] = [];
        for (let x = 0; x < width; x++) out.push(ms.cellAtScreenXY(x, y));
        return out;
      },
      { y, width: 900 },
    );

    const first = line.findIndex((c) => c != null);
    const last = line.length - 1 - [...line].reverse().findIndex((c) => c != null);
    expect(last - first, "the tube is barely on screen").toBeGreaterThan(100);

    const holes: number[] = [];
    const jumps: string[] = [];
    let previous: string | null = null;
    for (let x = first; x <= last; x++) {
      const cell = line[x]!;
      if (cell == null) {
        holes.push(x);
        continue;
      }
      if (previous && previous !== cell) {
        const [pi, pj] = previous.split(",").map(Number) as [number, number];
        const [i, j] = cell.split(",").map(Number) as [number, number];
        const di = Math.min((i - pi + ring) % ring, (pi - i + ring) % ring);
        if (di > 1 || Math.abs(j - pj) > 1) jumps.push(`${previous} -> ${cell} at x=${x}`);
      }
      previous = cell;
    }
    expect(holes, "gaps in the tube picked no cell").toEqual([]);
    expect(jumps, "a pixel step jumped to another part of the board").toEqual([]);
  });

  // What the bug cost a player: the far sheet is the half of the board they
  // cannot see, so a click aimed at a safe tile in front lost the game on a
  // mine behind it.
  test("cylinder: clicking along a grout line cannot detonate the far sheet", async ({
    page,
  }) => {
    const seen = await visibleCells(page, "cylinder");
    // The widest seam on screen: the two tiles squarely facing the camera, so
    // the grout line between them is at its widest and the far sheet is
    // directly behind it.
    const { a, b } = seams(seen)[0]!;

    // Mine every cell the player cannot see, so any pick that reaches through
    // the tube detonates. The two tiles under the gesture stay safe, and one
    // mine beside them keeps their reveal a number rather than a flood that
    // would clear the whole visible sheet and win the game before the walk is
    // over.
    const mines = await page.evaluate(
      ({ visible, safe }) => {
        const ms = window.__ms!;
        const shown = new Set(visible);
        const beside = visible.find((c) => {
          if (safe.includes(c)) return false;
          const [i, j] = c.split(",").map(Number) as [number, number];
          return safe.some((s) => {
            const [si, sj] = s.split(",").map(Number) as [number, number];
            return Math.abs(i - si) <= 1 && Math.abs(j - sj) <= 1;
          });
        })!;
        const mines = ms.cells().filter((c) => !shown.has(c) || c === beside);
        ms.startBoard("cylinder", "easy", { mines });
        return mines.length;
      },
      { visible: seen.map((s) => s.cell), safe: [a.cell, b.cell] },
    );
    expect(mines).toBeGreaterThan(0);
    await page.evaluate(
      () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))),
    );

    // Real clicks, one per pixel across the seam between the two tiles.
    const points = walk(a, b);
    for (const [i, p] of points.entries()) {
      await page.mouse.click(p.x, p.y);
      const status = await page.evaluate(() => window.__ms!.state().status);
      expect(status, `click ${i + 1} of ${points.length} hit a cell behind the tube`).toBe(
        "playing",
      );
    }

    // ...and the clicks did land: both tiles the gesture crossed are open.
    const states = await page.evaluate(
      (cells) => cells.map((c) => window.__ms!.cellState(c)),
      [a.cell, b.cell],
    );
    expect(states).toEqual(["revealed", "revealed"]);
  });
});
