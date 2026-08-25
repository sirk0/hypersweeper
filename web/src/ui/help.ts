// The how-to-play page, opened by the ? in the menu title row. Like settings
// it is one more `Menu` page rather than a modal, built from the same
// `.menu-entry` cards, so it inherits the back row, the scrolling body and the
// theme. The text lives here rather than in data/ui/screens.json: that file is
// the config the pygame build shares, and the pygame build has no help page.
//
// Everything here is a statement about the code, so keep it true: the rules
// are `src/game.ts` (first click opens a zero, chording), the gestures
// `src/input/controls.ts`, the keys `App.onKey` in `src/main.ts`, and the
// header slots `data/ui/screens.json`.

/** The ? that opens this page, drawn in `currentColor` like the gear so it
 * follows the theme's text colour. A ring and a question mark set in the
 * game's own face, matching the gear's 24×24 box and its ~19px span. */
export const HELP_ICON = `<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
  <circle cx="12" cy="12" r="9.4" fill="none" stroke="currentColor" stroke-width="1.9"/>
  <text x="12" y="12.7" text-anchor="middle" dominant-baseline="central"
    font-family="Rubik, system-ui, sans-serif" font-weight="700" font-size="12.5"
    fill="currentColor">?</text>
</svg>`;

interface Section {
  heading: string;
  rows: [label: string, body: string][];
}

const SECTIONS: Section[] = [
  {
    heading: "The game",
    rows: [
      [
        "Open every cell that is not a mine",
        "Clear the board and you win. Open a mine and the game is over — but the " +
          "first cell you open never touches one, so wherever you start you get " +
          "an open area to work from.",
      ],
      [
        "A number counts the mines around a cell",
        "Neighbours are all the cells that share a corner with it. On squares " +
          "that is the eight around it; on a hexagon, a pentagon or a Penrose " +
          "rhomb it is however many happen to touch, which is what makes each " +
          "tiling play differently.",
      ],
    ],
  },
  {
    heading: "Playing",
    rows: [
      ["Open a cell", "Click it, or tap it on a touch screen."],
      [
        "Flag a mine",
        "Right-click, or press and hold on a touch screen. You can also turn on " +
          "flag mode — the flag button at the left of the header — and then every " +
          "tap plants a flag instead. The counter at the top shows how many mines " +
          "are left once your flags are subtracted.",
      ],
      [
        "Open the rest around a number",
        "Click an open number that already has as many flags around it as it " +
          "says, and its remaining neighbours all open at once. It is the fast " +
          "way through a board — and it will detonate a mine if a flag is wrong.",
      ],
      ["Start over", "The smiley in the middle of the header deals a new board."],
    ],
  },
  {
    heading: "Boards in space",
    rows: [
      [
        "Turn a 3D board",
        "Drag it to rotate, or use the arrow keys. Cells on the far side are " +
          "there too — the board wraps, so a run of mines can come back round.",
      ],
      [
        "Zoom",
        "Scroll or pinch to zoom, and drag a zoomed-in flat board to pan. " +
          "The + and − keys zoom too, and 0 puts the view back. On a board " +
          "the wheel slides along instead (below), hold ctrl to zoom.",
      ],
      [
        "Move the cells along",
        "A donut's inner wall and the Klein bottle's neck hide cells that no " +
          "amount of turning brings round. The buttons under the board's name " +
          "slide its contents along the board's own symmetries — round the " +
          "ring (‹‹ ››, or the [ and ] keys), round the tube (⌃ ⌄, or , and " +
          "·), turned (⟲ ⟳, or ; and ’) and mirrored either way. The board " +
          "itself never moves, and neither does the game: every number still " +
          "counts the mines beside it. Each board gets the moves its own shape " +
          "allows — a cylinder has no way round its tube, a Klein bottle can " +
          "only go half way, a cube quarters about three axes, and a flat " +
          "board turns and mirrors like the square it is. The wheel slides a " +
          "wrapped board round the ring, and shift and the wheel round the tube.",
      ],
    ],
  },
  {
    heading: "Choosing a board",
    rows: [
      [
        "Classic, Flat, 3D",
        "Classic is the original square grid. Flat and 3D each deal a random " +
          "board — a flat tiling, or a manifold, sphere or polyhedron.",
      ],
      [
        "Custom",
        "Every board there is, by geometry: the plane, the flat manifolds " +
          "(cylinder, Möbius strip, torus, Klein bottle), the sphere and the " +
          "polyhedra. Each surface lists its tilings.",
      ],
      [
        "Difficulty",
        "The row at the bottom of the menu sets how big the board is and how " +
          "many mines it holds. Your best three times per board are kept under " +
          "the gear, along with themes, cell styles and sound.",
      ],
    ],
  },
];

function heading(text: string): HTMLElement {
  const el = document.createElement("h2");
  el.className = "settings-heading";
  el.textContent = text;
  return el;
}

function helpRow(label: string, body: string): HTMLElement {
  const li = document.createElement("li");
  const el = document.createElement("div");
  el.className = "menu-entry settings-static";
  const box = document.createElement("span");
  box.className = "menu-entry-text";
  const labelEl = document.createElement("span");
  labelEl.className = "menu-entry-label";
  labelEl.textContent = label;
  const bodyEl = document.createElement("span");
  bodyEl.className = "menu-entry-hint";
  bodyEl.textContent = body;
  box.append(labelEl, bodyEl);
  el.append(box);
  li.append(el);
  return li;
}

export function renderHelp(): DocumentFragment {
  const frag = document.createDocumentFragment();
  for (const section of SECTIONS) {
    frag.append(heading(section.heading));
    const list = document.createElement("ul");
    list.className = "menu-list";
    for (const [label, body] of section.rows) list.append(helpRow(label, body));
    frag.append(list);
  }
  return frag;
}
