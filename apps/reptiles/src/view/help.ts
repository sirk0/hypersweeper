// How to play (?help): opened by the ? on home (beside the gear) and the
// sidebar's "How to play" row. It is drawn as the settings are, sections of
// `.settings-list` rows, so it gets their look and the desktop pane's header.
//
// Everything here is a statement about the code, so keep it true: the rules
// and the stars are `src/puzzle.ts` (`won`, `stars`, undo and redo), a board
// kept `src/saved.ts`, the best time `src/progress.ts`, the gestures
// `src/input/drag.ts`, the keys `onKey` in `src/main.ts`, and the header
// `index.html`. Its first button opens the tutorial (`src/tutorial.ts`).

interface Section {
  heading: string;
  rows: [label: string, body: string][];
}

/** The text, with each key a `[K]` that is drawn as a key cap. */
const SECTIONS: Section[] = [
  {
    heading: "The puzzle",
    rows: [
      [
        "Cover the board with the tray's tiles",
        "Fill the outlined region exactly — no gaps, no overlaps, nothing over " +
          "its edge. Any way of covering it wins: the board was cut from one " +
          "tiling, but six triangles where a hexagon was are just as good.",
      ],
      [
        "Corners you cannot finish",
        "A tile can be laid where the rest of the board can no longer be " +
          "covered. When a corner will not close, take tiles back off and try " +
          "another way.",
      ],
    ],
  },
  {
    heading: "Laying tiles",
    rows: [
      [
        "Drag a tile onto the board",
        "Pick one up from the tray and drop it near where it goes. It sticks to " +
          "a corner of what is still uncovered: while it would, a ✓ shows where " +
          "it will land and a dot marks each of its corners that meets the edge.",
      ],
      [
        "Turn the tiles",
        "The round arrows at the end of the tray turn every tray tile, and the " +
          "one in your hand, by the step in their middle — [R] clockwise, " +
          "[Shift]+[R] or [E] anticlockwise. A tile lands only as it is held.",
      ],
      [
        "Flip them over",
        "On a board that uses a tile both ways round, the flip control — or " +
          "[F] — mirrors every tray tile. A tile lands only on its own side.",
      ],
      [
        "Take tiles off",
        "Drag a placed tile back over the tray (it turns red on the way), or " +
          "turn on ✕ remove — or [X] — and tap tiles. [Esc], the control again " +
          "or picking up a tray tile ends it.",
      ],
      [
        "Undo and redo",
        "The hooked arrows in the header — [Z], and [Shift]+[Z] or [Y] — take " +
          "back the last move (a tile laid, moved or taken off) and make it again.",
      ],
      [
        "Matching rules and colourings",
        "Some boards mark each tile's edges with lines, arrows or colours. A " +
          "tile lands only where its marks meet its neighbours' as they should, " +
          "making one shape across the edge; the board's rim takes any.",
      ],
      [
        "Jigsaws",
        "A jigsaw board is a colouring in one colour: each edge's knob or " +
          "socket fits only its match, as the colours would. Its rim is cut too, " +
          "so the tiles along it show where they go.",
      ],
    ],
  },
  {
    heading: "Stars",
    rows: [
      ["★", "Cover the board."],
      ["★★", "…with no more tiles than the board was cut from."],
      ["★★★", "…and without a hint."],
      [
        "Hint",
        "The light bulb — or [H] — shows a tile to lay and where, or one to " +
          "take off. Using it costs the third star.",
      ],
      [
        "Time",
        "The win card tells the time from the first tile down to the last, and " +
          "your best on that board. The best shows on Play, on its tiling's page.",
      ],
    ],
  },
  {
    heading: "Around the board",
    rows: [
      [
        "Zoom and pan",
        "Pinch, or scroll the wheel, to zoom about the pointer; once zoomed in, " +
          "drag the bare board to pan. Over the tray the wheel scrolls it along.",
      ],
      [
        "The header",
        "Restart starts the level again; the die deals another level of the " +
          "same difficulty. Finished, you get Play again and Next level.",
      ],
      [
        "Leave and come back",
        "A board left half-covered is kept as it was — its tiles, the time " +
          "spent on it and the hints shown — and opens that way again: on its " +
          "tiling's page, Play reads Resume. Restart, Play again or finishing " +
          "it starts it afresh.",
      ],
      [
        "Picking a level",
        "Quick start deals one by difficulty. Tilings lists every tiling: open " +
          "one to pick its board and its tiles — plain, or with a matching rule " +
          "or a colouring.",
      ],
    ],
  },
];

/** Draw How to play into `host` — and, given `tutorial`, a button that
 * plays the first-run tutorial again. */
export function renderHelp(host: HTMLElement, tutorial?: () => void): void {
  host.replaceChildren();
  if (tutorial) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "primary help-tutorial";
    button.dataset["action"] = "tutorial";
    button.textContent = "Play the tutorial";
    button.addEventListener("click", tutorial);
    host.append(button);
  }
  for (const section of SECTIONS) {
    const heading = document.createElement("h2");
    heading.textContent = section.heading;
    const list = document.createElement("ul");
    list.className = "settings-list help-list";
    for (const [label, body] of section.rows) {
      const li = document.createElement("li");
      const row = document.createElement("div");
      row.className = "settings-row";
      const block = document.createElement("span");
      block.className = "settings-text";
      const name = document.createElement("span");
      name.className = "help-label";
      name.textContent = label;
      const text = document.createElement("span");
      text.className = "settings-hint";
      text.append(...withKeys(body));
      block.append(name, text);
      row.append(block);
      li.append(row);
      list.append(li);
    }
    host.append(heading, list);
  }
}

/** `body` as text, each `[K]` in it a `<kbd>`. */
export function withKeys(body: string): (string | HTMLElement)[] {
  return body.split(/\[([^\]]+)\]/).map((part, i) => {
    if (i % 2 === 0) return part;
    const key = document.createElement("kbd");
    key.textContent = part;
    return key;
  });
}
