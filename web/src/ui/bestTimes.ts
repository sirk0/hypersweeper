import { fullModeLabel } from "../boards/catalog";
import { MODES } from "../boards/presets";
import { screens } from "../config/screens";
import { allBestTimes, boardKey, formatTime, type ScoreEntry } from "../leaderboard";

// The best-times page: everything the win dialog has been quietly collecting,
// one section per board. Reached from the Settings page and built like the
// theme picker — a `Menu` page of the same `.menu-entry` cards, so it inherits
// the back row, the scrolling body and the phone layout.
//
// Order comes from the catalog (`MODES`) and `data/ui/screens.json`
// (difficulties), not from the storage record, so the list reads in the same
// order as the menu however the times were set. A stored board this build does
// not have — a renamed mode, a board dropped from this deploy — has no label to
// show, so it is skipped here; `leaderboard.ts` still keeps its record.

const MEDALS = ["🥇", "🥈", "🥉"];

function heading(text: string): HTMLElement {
  const el = document.createElement("h2");
  el.className = "settings-heading";
  el.textContent = text;
  return el;
}

/** One difficulty's row: its name, then the times fastest first. */
function timesRow(difficultyLabel: string, entries: ScoreEntry[]): HTMLElement {
  const li = document.createElement("li");
  const box = document.createElement("div");
  box.className = "menu-entry settings-static best-row";

  const label = document.createElement("span");
  label.className = "menu-entry-label";
  label.textContent = difficultyLabel;

  const times = document.createElement("span");
  times.className = "best-times";
  entries.forEach((entry, i) => {
    const chip = document.createElement("span");
    chip.className = i === 0 ? "best-time best" : "best-time";
    chip.dataset["rank"] = String(i + 1);
    chip.textContent = `${MEDALS[i] ?? ""} ${formatTime(entry.ms)}s`.trim();
    times.append(chip);
  });

  box.append(label, times);
  li.append(box);
  return li;
}

/** Build the page body. `onClear` forgets every time and is expected to
 * re-render the page. */
export function renderBestTimes(onClear: () => void): DocumentFragment {
  const frag = document.createDocumentFragment();
  const stored = allBestTimes();

  let boards = 0;
  for (const mode of MODES) {
    const rows: HTMLElement[] = [];
    for (const d of screens.difficulties) {
      const entries = stored.get(boardKey(mode, d.key));
      if (entries && entries.length > 0) rows.push(timesRow(d.label, entries));
    }
    if (rows.length === 0) continue;
    boards += 1;
    frag.append(heading(fullModeLabel(mode)));
    const list = document.createElement("ul");
    list.className = "menu-list";
    list.dataset["board"] = mode;
    list.append(...rows);
    frag.append(list);
  }

  if (boards === 0) {
    const empty = document.createElement("p");
    empty.className = "best-empty";
    empty.dataset["empty"] = "best-times";
    empty.textContent =
      "No best times yet. Win a board and your three fastest times on it — one list per difficulty — are kept here.";
    frag.append(empty);
    return frag;
  }

  frag.append(clearRow(onClear));
  return frag;
}

/** The destructive row, which asks first. The confirmation is the row itself
 * rather than `window.confirm`: an installed iOS web app shows that as an alert
 * badged with the site's URL, which reads like a browser warning rather than
 * like this app asking a question. A second tap on a row that has just said
 * what it is about to do is clearer, and reversible by walking away. */
function clearRow(onClear: () => void): HTMLElement {
  const list = document.createElement("ul");
  list.className = "menu-list best-clear-row";
  const li = document.createElement("li");
  const btn = document.createElement("button");
  btn.className = "menu-entry settings-danger";
  btn.dataset["action"] = "clear-best-times";
  btn.textContent = "Clear best times";
  let armed = false;
  btn.addEventListener("click", () => {
    if (!armed) {
      armed = true;
      btn.textContent = "Tap again to clear every time";
      btn.classList.add("armed");
      btn.dataset["armed"] = "1";
      return;
    }
    onClear();
  });
  li.append(btn);
  list.append(li);
  return list;
}
