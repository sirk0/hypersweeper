import type { TransferOutcome, TransferSummary } from "../transfer";
import { closeButton, openModal, type ModalHandle } from "./modal";

// The window a transfer link opens on (transfer.ts): what came across.
//
// It says what *changed* rather than what the link held, because the import
// merges — a link opened in a browser that already had those times brings
// nothing, and "nothing new" is the true and useful answer then.

export interface TransferDialogOptions {
  outcome: TransferOutcome;
  /** Whether the open transition runs (the app's animations preference). */
  animate: boolean;
  onClose?(): void;
}

function count(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`;
}

/** The lines of a summary, one per kind of thing that changed. */
export function summaryLines(summary: TransferSummary): string[] {
  const lines: string[] = [];
  if (summary.times > 0) lines.push(`Best times on ${count(summary.times, "board", "boards")}`);
  if (summary.achievements > 0) {
    lines.push(count(summary.achievements, "achievement", "achievements"));
  }
  if (summary.stars > 0) lines.push(count(summary.stars, "starred board", "starred boards"));
  if (summary.settings) lines.push("Your settings");
  return lines;
}

/** The title and the sentence under it. */
export function transferText(outcome: TransferOutcome): { title: string; subtitle: string } {
  if (outcome.state === "unsupported") {
    return {
      title: "Synced through iCloud",
      subtitle: "This app keeps your record in iCloud, so a transfer link is not needed here.",
    };
  }
  if (outcome.state === "unreadable") {
    return {
      title: "Link not recognised",
      subtitle:
        "That transfer link could not be read — it may have been cut short. Nothing was changed.",
    };
  }
  return summaryLines(outcome.summary).length > 0
    ? { title: "Progress transferred", subtitle: "Added to the record on this device:" }
    : { title: "Already up to date", subtitle: "This device already had everything in that link." };
}

export function openTransferDialog(host: HTMLElement, opts: TransferDialogOptions): ModalHandle {
  const card = document.createElement("div");
  card.className = "dialog";
  const { title, subtitle } = transferText(opts.outcome);

  const heading = document.createElement("h2");
  heading.className = "dialog-title";
  heading.id = "transfer-dialog-title";
  heading.textContent = title;
  const sub = document.createElement("p");
  sub.className = "dialog-subtitle";
  sub.textContent = subtitle;
  card.append(heading, sub);

  if (opts.outcome.state === "imported") {
    const lines = summaryLines(opts.outcome.summary);
    if (lines.length > 0) {
      const list = document.createElement("ul");
      list.className = "dialog-transfer-list";
      for (const line of lines) {
        const li = document.createElement("li");
        li.textContent = line;
        list.append(li);
      }
      card.append(list);
    }
  }

  const actions = document.createElement("div");
  actions.className = "dialog-actions";
  actions.dataset["buttons"] = "1";
  const done = document.createElement("button");
  done.className = "dialog-btn dialog-primary";
  done.dataset["action"] = "done";
  done.textContent = "Done";
  actions.append(done);
  const close = closeButton(() => handle.close());
  card.append(actions, close);

  const handle = openModal(host, card, {
    name: "transfer",
    labelledBy: heading.id,
    animate: opts.animate,
    focusRing: () => [done, close],
    ...(opts.onClose ? { onClose: opts.onClose } : {}),
  });
  done.addEventListener("click", () => handle.close());
  return handle;
}
