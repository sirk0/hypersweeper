import {
  ACHIEVEMENTS,
  EXCLUDED_MODES,
  GROUP_LABELS,
  loadProgress,
  measureOf,
  unlockedAt,
  wonModes,
  type Achievement,
  type AchievementGroup,
} from "../achievements";
import { fullModeLabel } from "../boards/catalog";
import { menuIcon } from "./icons";

// The achievements page: what the catalogue has given up so far, and what is
// left of it. Reached from Settings and built like the best-times page — a
// `Menu` page of the same `.menu-entry` cards, so it inherits the back row, the
// scrolling body and the phone layout.
//
// Order comes from `ACHIEVEMENTS`, which is the catalogue's own order, not from
// the storage record — so the list reads the same however they were earned, and
// a locked row sits where it will sit once it is not.
//
// Nothing here builds a board. Every count on the page is a set membership test
// against the modes the player has won, and the group memberships were computed
// once, from strings, when `achievements.ts` loaded.

function heading(text: string): HTMLElement {
  const el = document.createElement("h2");
  el.className = "settings-heading";
  el.textContent = text;
  return el;
}

/** The date an achievement was unlocked, short enough to sit at the end of its
 * row. `0` is a record written without one, which shows nothing rather than
 * "1 Jan 1970" — the same rule the best-times rows follow. */
function whenLabel(at: number): string {
  if (at <= 0) return "";
  try {
    return new Date(at).toLocaleDateString(undefined, { month: "short", day: "numeric" });
  } catch {
    return "";
  }
}

/** One achievement. Unlocked rows say when; locked ones say how far along, and
 * only where there is something to count — "0 / 1" on a yes/no would be noise
 * dressed up as progress. */
function achievementRow(
  achievement: Achievement,
  have: number,
  need: number,
  at: number | undefined,
): HTMLElement {
  const li = document.createElement("li");
  const box = document.createElement("div");
  box.className = "menu-entry settings-static achievement-row";
  box.dataset["achievement"] = achievement.id;
  const unlocked = have >= need;
  if (!unlocked) box.dataset["locked"] = "1";

  const icon = document.createElement("span");
  icon.className = "achievement-icon";
  icon.innerHTML = menuIcon(achievement.icon);

  const text = document.createElement("span");
  text.className = "achievement-text";
  const label = document.createElement("span");
  label.className = "menu-entry-label";
  label.textContent = achievement.label;
  const hint = document.createElement("span");
  hint.className = "menu-entry-hint";
  hint.textContent = achievement.hint;
  text.append(label, hint);

  const state = document.createElement("span");
  if (unlocked) {
    state.className = "achievement-when";
    state.textContent = at === undefined ? "✓" : whenLabel(at) || "✓";
  } else {
    state.className = "achievement-progress";
    state.textContent = need > 1 ? `${have} / ${need}` : "";
  }

  box.append(icon, text, state);
  li.append(box);
  return li;
}

/** Build the page body. `onClear` forgets everything and is expected to
 * re-render the page. */
export function renderAchievements(onClear: () => void): DocumentFragment {
  const frag = document.createDocumentFragment();
  const progress = loadProgress();
  const won = wonModes(progress);
  const stamps = unlockedAt();

  let earnedCount = 0;
  let group: AchievementGroup | null = null;
  let list: HTMLElement | null = null;
  for (const achievement of ACHIEVEMENTS) {
    if (achievement.group !== group) {
      group = achievement.group;
      frag.append(heading(GROUP_LABELS[group]));
      list = document.createElement("ul");
      list.className = "menu-list";
      list.dataset["achievementGroup"] = group;
      frag.append(list);
    }
    const { have, need } = measureOf(achievement, progress, won);
    if (have >= need) earnedCount++;
    list?.append(achievementRow(achievement, have, need, stamps[achievement.id]));
  }

  frag.insertBefore(summary(earnedCount, ACHIEVEMENTS.length), frag.firstChild);
  if (EXCLUDED_MODES.length > 0) frag.append(exclusionNote());
  frag.append(clearRow(onClear));
  return frag;
}

/** The count at the top. There is no empty state below it: a locked list is
 * the point of the page, and a player who has won nothing should still see
 * what there is to win. */
function summary(earned: number, total: number): HTMLElement {
  const p = document.createElement("p");
  p.className = "best-empty achievement-summary";
  p.dataset["earned"] = String(earned);
  p.textContent =
    earned === 0
      ? `Nothing unlocked yet — ${total} to go. Win a board and this fills in.`
      : `${earned} of ${total} unlocked.`;
  return p;
}

/** Why the completion counts stop short of the whole catalogue. The five
 * triakis boards cannot be played at all — their menu row opens an explanation
 * instead of a game (`boards/fairness.ts`) — so a set containing one could
 * never be finished, and they are left out rather than left unreachable. */
function exclusionNote(): HTMLElement {
  const p = document.createElement("p");
  p.className = "best-empty achievement-note";
  p.dataset["excluded"] = String(EXCLUDED_MODES.length);
  const names = EXCLUDED_MODES.map(fullModeLabel).join(", ");
  p.textContent =
    `${EXCLUDED_MODES.length} boards are left out of these counts, because they cannot be ` +
    `played: every cell has a look-alike twin, so their mines can only be guessed at ` +
    `(${names}).`;
  return p;
}

/** The destructive row, which asks first — the same two-tap arming the
 * best-times page uses, and for the same reason: an installed iOS web app draws
 * `window.confirm` as an alert badged with the site's URL, which reads like a
 * browser warning rather than like this app asking a question. */
function clearRow(onClear: () => void): HTMLElement {
  const list = document.createElement("ul");
  list.className = "menu-list best-clear-row";
  const li = document.createElement("li");
  const btn = document.createElement("button");
  btn.className = "menu-entry settings-danger";
  btn.dataset["action"] = "clear-achievements";
  btn.textContent = "Clear achievements";
  let armed = false;
  btn.addEventListener("click", () => {
    if (!armed) {
      armed = true;
      btn.textContent = "Tap again to clear every achievement";
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
