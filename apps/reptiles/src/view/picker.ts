// Picking a level on a tiling's page (`?tiling=<key>`) or a figure set's
// (`?figure=<key>`): a board, then its tiles, then Play.
//
// A level is a board of a tiling and a way of marking its tiles — plain,
// a matching rule or a colouring — every board by every marking its marks
// make the same tray on (`boardKeys`). So the page picks the two apart: the
// boards on top, as their outlines in a grid (a figure set's grouped under
// each of its tilings), one dealt at random; under them a row of the
// tiling's markings, each card its tray's tiles drawn big — never the
// board's outline, which is already up top — Plain first and picked; then a
// Play button naming the level. A board a marking is not laid on is greyed
// out, and so is a marking on a board it is not laid on — picking one picks
// what goes with it.

import { BARS, bandOf, type Band } from "../difficulty";
import { boardKeys, levelByKey, markedOf, type Level } from "../levels";
import { barsIcon, outlineIcon, starRow, trayIcon } from "./icons";

/** The level a board and a marking make: `<marking>` on the first board,
 * `<marking>-<n>` on the n-th. */
const keyOf = (marking: string, board: number): string =>
  board === 1 ? marking : `${marking}-${board}`;

/** The boards `marking` (a plain or marked first board's key) is laid on. */
function boardsOf(marking: string): Set<number> {
  return new Set(
    boardKeys(marking).map((k) => (k === marking ? 1 : Number(k.slice(marking.length + 1)))),
  );
}

/** The pictures already drawn, by what they are of: a board's outline or a
 * marking's tray. Drawing one builds its level, so each is drawn once, after
 * the page is up, and cloned from then on. */
const DRAWN = new Map<string, SVGSVGElement>();

/** Draw a picture into its slot later, one a turn of the event loop — the
 * page shows at once, and each level is built only as its picture is drawn. */
let queued: { slot: HTMLElement; id: string; draw: () => SVGSVGElement }[] = [];
let running = false;

function drawLater(slot: HTMLElement, id: string, draw: () => SVGSVGElement): void {
  const known = DRAWN.get(id);
  if (known) {
    slot.replaceChildren(known.cloneNode(true));
    return;
  }
  queued.push({ slot, id, draw });
  if (running) return;
  running = true;
  const step = (): void => {
    const job = queued.shift();
    if (!job) {
      running = false;
      return;
    }
    if (job.slot.isConnected) {
      let svg = DRAWN.get(job.id);
      if (!svg) {
        svg = job.draw();
        DRAWN.set(job.id, svg);
      }
      job.slot.replaceChildren(svg.cloneNode(true));
    }
    setTimeout(step, 0);
  };
  setTimeout(step, 0);
}

export interface PickerOptions {
  /** The tilings to pick from, by their first boards — one on a tiling's
   * page, a figure set's on its page — easiest first. */
  tilings: Level[];
  /** Stars earned on a level, by key. */
  stars: (key: string) => number;
  play: (level: Level) => void;
  /** The level picked when the page was last left (`?…&pick=<key>`), or
   * none: a random board then, plain. */
  initial?: string | null;
  /** Called with each new pick's key, to keep in the URL. */
  remember: (key: string) => void;
  /** Hints under the two headings. */
  hint?: string;
}

interface State {
  tiling: Level;
  board: number;
  marking: string;
}

const random = <T>(items: readonly T[]): T => items[Math.floor(Math.random() * items.length)]!;

/** The pick a level key names, if it is one of `tilings`'. */
function stateOf(key: string | null | undefined, tilings: readonly Level[]): State | null {
  const level = key ? levelByKey(key) : undefined;
  if (!level) return null;
  const tiling = tilings.find((t) => t.key === (level.decor?.of ?? level.base));
  return tiling ? { tiling, board: level.board, marking: level.base } : null;
}

export function renderPicker(host: HTMLElement, options: PickerOptions): void {
  const { tilings, stars, play, remember } = options;
  const first = random(tilings);
  let state: State = stateOf(options.initial, tilings) ?? {
    tiling: first,
    board: random([...boardsOf(first.key)]),
    marking: first.key,
  };

  host.classList.add("picker");
  const render = (): void => {
    const { tiling, board, marking } = state;
    const level = levelByKey(keyOf(marking, board))!;
    remember(level.key);
    // a pick redraws the page: where it was scrolled to stays put
    const scroller = host.closest<HTMLElement>(".catalog-list") ?? host;
    const top = scroller.scrollTop;
    const across = host.querySelector(".marking-row")?.scrollLeft;
    host.replaceChildren();

    // the boards, grouped under each tiling where there are several
    const boards = section("pick-boards", "Boards", options.hint ?? "Where the tiles go");
    const laid = boardsOf(marking);
    // several tilings flow side by side, each its name over its boards
    const groups = document.createElement("div");
    groups.className = tilings.length > 1 ? "tiling-groups" : "tiling-one";
    boards.append(groups);
    for (const t of tilings) {
      const group = document.createElement("div");
      group.className = "tiling-group";
      group.dataset["tiling"] = t.key;
      const grid = document.createElement("div");
      grid.className = "board-grid";
      if (tilings.length > 1) {
        const head = document.createElement("h3");
        head.className = "pick-tiling";
        head.append(barsIcon(BARS[bandOf(t.key)]), t.name);
        head.title = t.label;
        group.append(head);
      }
      for (const n of boardsOf(t.key)) {
        const on = t === tiling;
        const key = keyOf(on ? marking : t.key, n);
        const button = document.createElement("button");
        button.type = "button";
        button.className = "board-card";
        button.dataset["board"] = keyOf(t.key, n);
        const picked = on && n === board;
        button.setAttribute("aria-pressed", String(picked));
        const offMarking = on && !laid.has(n);
        if (offMarking) button.classList.add("off");
        const slot = document.createElement("span");
        slot.className = "outline-slot";
        drawLater(slot, `outline:${keyOf(t.key, n)}`, () =>
          outlineIcon(levelByKey(keyOf(t.key, n))!),
        );
        const label = document.createElement("span");
        label.className = "board-n";
        label.textContent = String(n);
        button.append(slot, label, starRow(offMarking ? 0 : stars(key)));
        button.title = `Board ${n} of ${t.name}`;
        button.addEventListener("click", () => {
          // a board this marking is not laid on: its plain tiles
          const keep = on && laid.has(n);
          state = { tiling: t, board: n, marking: keep ? marking : t.key };
          render();
        });
        grid.append(button);
      }
      group.append(grid);
      groups.append(group);
    }

    // the tiling's markings: plain, its matching rules, its colourings
    const tiles = section("pick-tiles", "Tiles", "Plain, or marked: edges that must match");
    const row = document.createElement("div");
    row.className = "family-row marking-row";
    for (const m of [tiling, ...markedOf(tiling.key)]) {
      const on = boardsOf(m.key);
      const here = on.has(board);
      const key = keyOf(m.key, here ? board : 1);
      const button = document.createElement("button");
      button.type = "button";
      button.className = "card marking-card";
      button.dataset["marking"] = m.key;
      button.setAttribute("aria-pressed", String(m.key === marking));
      if (!here) button.classList.add("off");
      button.title = m.label;
      const slot = document.createElement("span");
      slot.className = "tray-slot";
      drawLater(slot, `tray:${m.key}`, () => trayIcon(levelByKey(m.key)!));
      const kind = document.createElement("span");
      kind.className = "marking-kind";
      kind.textContent = m.decor ? (m.decor.rules ? "Matching rule" : "Colouring") : "Plain";
      const name = document.createElement("span");
      name.className = "card-name";
      name.textContent = m.decor ? m.decor.label : "Plain tiles";
      const meta = document.createElement("span");
      meta.className = "card-meta";
      meta.append(bandIcon(bandOf(key)), starRow(here ? stars(key) : 0));
      button.append(slot, kind, name, meta);
      button.addEventListener("click", () => {
        // a marking not laid on this board: a board it is laid on
        state = { tiling, board: here ? board : random([...on]), marking: m.key };
        render();
      });
      row.append(button);
    }
    tiles.append(row);

    const bar = document.createElement("div");
    bar.className = "pick-play";
    const go = document.createElement("button");
    go.type = "button";
    go.className = "primary play";
    go.dataset["level"] = level.key;
    const band = bandOf(level.key);
    const what = document.createElement("span");
    what.className = "play-what";
    what.textContent = [
      tilings.length > 1 ? tiling.name : null,
      tiling.boards > 1 ? `board ${board}` : null,
      level.decor ? level.decor.label : "plain",
    ]
      .filter(Boolean)
      .join(" · ");
    go.append("Play", bandIcon(band), what);
    go.addEventListener("click", () => play(level));
    bar.append(go);

    host.append(boards, tiles, bar);
    scroller.scrollTop = top;
    // the row where it was — or, first time, with the picked tiles in sight
    const picked = row.querySelector<HTMLElement>('[aria-pressed="true"]');
    if (across !== undefined) row.scrollLeft = across;
    if (picked) {
      const left = picked.offsetLeft - row.offsetLeft;
      const pad = 16;
      if (left - pad < row.scrollLeft) row.scrollLeft = left - pad;
      else if (left + picked.offsetWidth + pad > row.scrollLeft + row.clientWidth)
        row.scrollLeft = left + picked.offsetWidth + pad - row.clientWidth;
    }
  };
  render();
}

/** A difficulty as the three bars, read out as its band's name. */
function bandIcon(band: Band): SVGSVGElement {
  const bars = barsIcon(BARS[band]);
  bars.setAttribute("aria-hidden", "false");
  bars.setAttribute("role", "img");
  bars.setAttribute("aria-label", band);
  return bars;
}

function section(className: string, title: string, about: string): HTMLElement {
  const el = document.createElement("section");
  el.className = `family ${className}`;
  const heading = document.createElement("h2");
  heading.textContent = title;
  const hint = document.createElement("p");
  hint.className = "family-hint";
  hint.textContent = about;
  el.append(heading, hint);
  return el;
}

// the queue is per page: a page left drops what it had not drawn yet
export function dropQueued(): void {
  queued = [];
}
