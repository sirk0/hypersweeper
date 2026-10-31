// What the dev-only render scripts share: staging a board through the
// `window.__ms` seam so a picture of it is reproducible. Used by
// `make-screenshots.mts` (the README gallery), `make-store-screenshots.mts`
// (the App Store art) and `make-stickers.mts` (the iMessage sticker pack).
//
// A board is started with an explicit, seeded mine layout (so the script knows
// where the mines are and nothing has to be guessed), a central patch is
// opened, a few mines are flagged, and optionally one is set off.
import type { Page } from "@playwright/test";

import type { CellId } from "@tiling/geometry";
import type { MsHook } from "../src/testHook";

declare global {
  interface Window {
    __ms?: MsHook;
  }
}

/** What `stageBoard` needs to know about a shot. */
export interface Staging {
  /** The mode to open. */
  mode?: string;
  /** Mine-layout seed — the shot is reproducible, not random. */
  seed?: number;
  /** Fraction of the board to open. */
  reveal?: number;
  /** How many of the mines to flag. */
  flags?: number;
  /** Detonate a mine at the end (the losing-board shot). */
  explode?: boolean;
  /** Turn a 3D board off its starting tilt, as a drag of (dx, dy) pixels. */
  rotate?: [number, number];
}

/** The seeded RNG the game uses, so a shot's mine layout is reproducible. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function pickMines(cells: CellId[], count: number, seed: number): CellId[] {
  const rng = mulberry32(seed);
  const pool = [...cells];
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [pool[i], pool[j]] = [pool[j]!, pool[i]!];
  }
  return pool.slice(0, count);
}

/** Two animation frames: the board's world transform is applied when it
 * renders, so `cellScreenXY` answers with stale matrices until it has. */
export function settle(page: Page): Promise<void> {
  return page.evaluate(
    () =>
      new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
      ),
  );
}

export async function waitForServer(url: string): Promise<void> {
  for (let i = 0; i < 60; i++) {
    try {
      const res = await fetch(url);
      if (res.ok) return;
    } catch {
      /* not up yet */
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`preview server never answered at ${url}`);
}

/** Open a central patch, flag a few mines, optionally detonate one. */
export async function stageBoard(page: Page, shot: Staging, difficulty: string): Promise<void> {
  const cells = await page.evaluate(() => window.__ms!.cells());
  const mineCount = await page.evaluate(() => window.__ms!.state().minesRemaining);
  const mines = pickMines(cells, mineCount, shot.seed ?? 1);

  await page.evaluate(
    ([mode, diff, layout]) =>
      window.__ms!.startBoard(mode as string, diff as string, {
        mines: layout as CellId[],
      }),
    [shot.mode!, difficulty, mines] as const,
  );
  if (shot.rotate) {
    await page.evaluate(([dx, dy]) => window.__ms!.rotate(dx!, dy!), shot.rotate);
  }
  await settle(page);

  // Nearest the middle of the view first; a cell facing away on a 3D board has
  // no screen position and is skipped, so the patch opens where it is seen.
  const placed = await page.evaluate((ids) => {
    const hook = window.__ms!;
    return ids.map((c) => [c, hook.cellScreenXY(c)] as const);
  }, cells);
  const cx = page.viewportSize()!.width / 2;
  const cy = page.viewportSize()!.height / 2;
  const order = placed
    .filter((entry): entry is readonly [CellId, { x: number; y: number }] => !!entry[1])
    .sort((a, b) => Math.hypot(a[1].x - cx, a[1].y - cy) - Math.hypot(b[1].x - cx, b[1].y - cy))
    .map(([cell]) => cell);

  const mineSet = new Set(mines);
  const safe = order.filter((c) => !mineSet.has(c));
  const target = Math.floor((cells.length - mines.length) * (shot.reveal ?? 0.34));
  await page.evaluate(
    ([toOpen, want]) => {
      const hook = window.__ms!;
      for (const cell of toOpen as CellId[]) {
        if (hook.state().revealed >= (want as number)) break;
        if (hook.cellState(cell) === "hidden") hook.reveal(cell);
      }
    },
    [safe, target] as const,
  );

  // Flag mines sitting in the opened region, and — for the losing shot — set
  // off the most central one that is left. The app reveals the rest on a loss.
  const central = order.filter((c) => mineSet.has(c));
  const detonator = shot.explode ? central.shift() : undefined;
  await page.evaluate(
    ([toFlag, boom]) => {
      const hook = window.__ms!;
      for (const cell of toFlag as CellId[]) hook.flag(cell);
      if (boom != null) hook.reveal(boom as CellId);
    },
    [central.slice(0, shot.flags ?? 4), detonator ?? null] as const,
  );
}
