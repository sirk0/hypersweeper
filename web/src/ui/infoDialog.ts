import { iconHex } from "../render/shapePalette";
import type { BoardFacts } from "./boardFacts";
import { closeButton, openModal, type ModalHandle } from "./modal";

// The window the header's ⓘ opens: what this board actually is.
//
// The facts come from ui/boardFacts.ts, measured off the board being played;
// this only lays them out. Two halves — a short list of what the board *is*
// (its family, its surface, how big it is) and one row per kind of tile, with
// the count and, where the board is shape-coloured, the colour it is painted
// in. The swatch is the point of that second half: it turns the window into a
// key for the board behind it, so "Irregular pentagons · 78" is something the
// player can then go and see.

export interface InfoDialogOptions {
  facts: BoardFacts;
  /** Whether the board is drawn in the shape colours. The Classic theme's is
   * gray whatever the tile (`CellStyle.monochrome`), and a coloured swatch
   * beside a gray board would be a lie about it. */
  coloured: boolean;
  /** Whether the open transition runs (the app's animations preference). */
  animate: boolean;
  onClose(): void;
}

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  cls: string,
  text?: string,
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  node.className = cls;
  if (text !== undefined) node.textContent = text;
  return node;
}

/** The "what it is" list: only the rows this board has something to say for. */
function factList(facts: BoardFacts): HTMLElement {
  const list = el("dl", "info-facts");
  const rows: [string, string][] = [];
  if (facts.family) rows.push(["Family", facts.family]);
  if (facts.tiling) rows.push(["Tiling", facts.tiling]);
  if (facts.surface) rows.push(["Surface", facts.surface]);
  rows.push(["Cells", String(facts.cells)]);
  rows.push(["Mines", String(facts.mines)]);
  for (const [label, value] of rows) {
    const row = el("div", "info-fact");
    row.append(el("dt", "info-fact-label", label), el("dd", "info-fact-value", value));
    list.append(row);
  }
  return list;
}

/** One row per kind of tile, in the board's own colours. */
function shapeList(facts: BoardFacts, coloured: boolean): HTMLElement {
  const list = el("ul", "info-shapes");
  for (const shape of facts.shapes) {
    const row = el("li", "info-shape");
    row.dataset["sides"] = String(shape.tone.sides);
    if (coloured) {
      const swatch = el("span", "info-swatch");
      // The menu icons' saturation rather than the board's: the board's own
      // chroma is faint by design (it is read through numbers), and a 20px chip
      // of it beside text reads as off-white.
      swatch.style.background = iconHex(shape.tone, "base");
      row.append(swatch);
    }
    row.append(
      el("span", "info-shape-name", shape.label),
      el("span", "info-shape-count", String(shape.count)),
    );
    list.append(row);
  }
  return list;
}

/** Build the window and add it to `host`. The caller keeps the handle and
 * closes it when the board goes away. */
export function openInfoDialog(
  host: HTMLElement,
  opts: InfoDialogOptions,
): ModalHandle {
  const { facts } = opts;
  const card = el("div", "dialog info-dialog");

  const title = el("h2", "dialog-title", facts.name);
  title.id = "info-dialog-title";

  const done = el("button", "dialog-btn dialog-primary", "Done");
  done.dataset["action"] = "done";

  const dismiss = closeButton(() => handle.close());
  done.addEventListener("click", () => handle.close());

  const actions = el("div", "dialog-actions");
  actions.dataset["buttons"] = "1";
  actions.append(done);

  card.append(
    dismiss,
    title,
    el("p", "dialog-subtitle", facts.difficulty),
    factList(facts),
    el("h3", "info-heading", facts.shapes.length === 1 ? "Tile" : "Tiles"),
    shapeList(facts, opts.coloured),
  );
  // The ⚠ the board's name carries: a warned board is one whose tiling forces
  // guesses, and the name can only mark it — this is where it is explained. On
  // a phone there is no hover to read the mark's tooltip with, so without this
  // the mark says nothing at all.
  if (facts.warning) card.append(el("p", "info-warning", `⚠ ${facts.warning}`));
  card.append(actions);

  const handle = openModal(host, card, {
    name: "info",
    labelledBy: title.id,
    animate: opts.animate,
    focusRing: () => [dismiss, done],
    initialFocus: () => done,
    onClose: opts.onClose,
  });
  return handle;
}
