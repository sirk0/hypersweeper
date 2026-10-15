import { describe, expect, it } from "vitest";
import { applyWin, emptyProgress, totalWins, type Stored, type Win } from "../../src/achievements";
import {
  addProgress,
  cloudRecordSupported,
  freshState,
  mergeRecords,
  progressSince,
  type SyncState,
} from "../../src/cloudRecord";
import type { ScoreEntry } from "../../src/leaderboard";

// The iCloud merge, played out between simulated devices sharing one simulated
// key-value store. The native half — the plugin, iCloud itself — needs a
// device; what is pinned here is that the record converges, counts every win
// once, survives a reinstall, and that a clear reaches every device.

const win = (mode: string, over: Partial<Win> = {}): Win => ({
  mode,
  difficulty: "easy",
  ms: 30_000,
  flagless: false,
  sides: [4],
  ...over,
});

/** One install: its localStorage (best times and achievement record) and its
 * side of the sync. */
class Device {
  boards: Record<string, ScoreEntry[]> = {};
  record: Stored = { progress: emptyProgress(), unlocked: {} };
  state: SyncState | null = null;

  constructor(
    readonly id: string,
    readonly cloud: Record<string, string>,
  ) {}

  win(mode: string, ms: number, at: number, over: Partial<Win> = {}): void {
    const key = `${mode}|easy`;
    const entries = [...(this.boards[key] ?? []), { ms, at }].sort((a, b) => a.ms - b.ms);
    this.boards[key] = entries.slice(0, 3);
    this.record = {
      progress: applyWin(this.record.progress, win(mode, { ms, ...over })),
      unlocked: this.record.unlocked,
    };
  }

  clear(kind: "scores" | "achievements", at: number): void {
    const state = this.state ?? freshState(this.id, this.cloud);
    state.reset[kind] = at;
    if (kind === "scores") this.boards = {};
    else {
      this.record = { progress: emptyProgress(), unlocked: {} };
      this.state = { ...state, since: at, own: { progress: emptyProgress(), unlocked: {} }, base: emptyProgress() };
      return;
    }
    this.state = state;
  }

  sync(): Record<string, string> {
    const result = mergeRecords({
      boards: this.boards,
      record: this.record,
      state: this.state ?? freshState(this.id, this.cloud),
      cloud: { ...this.cloud },
    });
    this.boards = result.boards;
    this.record = result.record;
    this.state = result.state;
    Object.assign(this.cloud, result.writes);
    return result.writes;
  }

  wins(): number {
    return totalWins(this.record.progress);
  }
}

describe("iCloud record", () => {
  it("is off outside the native app", () => {
    expect(cloudRecordSupported()).toBe(false);
  });

  it("adds and subtracts progress", () => {
    const a = applyWin(applyWin(emptyProgress(), win("square")), win("hexhex", { flagless: true, sides: [6] }));
    const b = applyWin(emptyProgress(), win("square"));
    const since = progressSince(a, b);
    expect(since.wins).toEqual({ hexhex: { easy: 1 } });
    expect(since.flagless).toBe(1);
    expect(since.shapes).toEqual([6]);
    expect(addProgress(b, since)).toEqual(a);
    // Never negative: a count that went down is not passed on.
    expect(progressSince(b, a)).toEqual({ wins: {}, flagless: 0, shapes: [] });
  });

  it("brings everything back after a reinstall", () => {
    const cloud: Record<string, string> = {};
    const phone = new Device("aa", cloud);
    phone.win("square", 40_000, 1000);
    phone.win("square", 30_000, 2000);
    phone.win("hexhex", 50_000, 3000);
    phone.sync();

    // Deleted and installed again: new storage, a new device id, same iCloud.
    const again = new Device("bb", cloud);
    again.sync();
    expect(again.boards).toEqual(phone.boards);
    expect(again.record.progress).toEqual(phone.record.progress);
    expect(again.wins()).toBe(3);

    // Winning on from there counts once, and the old key still counts.
    again.win("square", 20_000, 4000);
    again.sync();
    expect(again.wins()).toBe(4);
    expect(again.boards["square|easy"]?.map((e) => e.ms)).toEqual([20_000, 30_000, 40_000]);
    expect(again.sync()).toEqual({}); // settled: nothing more to write
  });

  it("adds two devices' wins rather than taking the larger", () => {
    const cloud: Record<string, string> = {};
    const phone = new Device("aa", cloud);
    const mac = new Device("bb", cloud);
    for (let i = 0; i < 3; i++) phone.win("square", 30_000 + i, 100 + i);
    for (let i = 0; i < 2; i++) mac.win("square", 10_000 + i, 200 + i);
    phone.sync();
    mac.sync();
    phone.sync();
    expect(phone.wins()).toBe(5);
    expect(mac.wins()).toBe(5);
    expect(phone.record.progress.wins).toEqual({ square: { easy: 5 } });
    // The fastest three of everyone's.
    expect(phone.boards["square|easy"]?.map((e) => e.ms)).toEqual([10_000, 10_001, 30_000]);
    expect(mac.boards).toEqual(phone.boards);

    // Syncing again, any number of times, changes nothing.
    for (let i = 0; i < 3; i++) {
      phone.sync();
      mac.sync();
    }
    expect(phone.wins()).toBe(5);
    expect(mac.wins()).toBe(5);
  });

  it("counts each win once however often it is merged", () => {
    const cloud: Record<string, string> = {};
    const phone = new Device("aa", cloud);
    const pad = new Device("bb", cloud);
    phone.win("square", 30_000, 100);
    phone.sync();
    pad.sync();
    pad.win("cube", 25_000, 200, { sides: [4] });
    pad.sync();
    phone.sync();
    phone.win("square", 29_000, 300);
    phone.sync();
    pad.sync();
    expect(pad.wins()).toBe(3);
    expect(phone.wins()).toBe(3);
    expect(pad.record.progress).toEqual(phone.record.progress);
  });

  it("recovers a best-times write that crossed another device's", () => {
    const cloud: Record<string, string> = {};
    const phone = new Device("aa", cloud);
    const mac = new Device("bb", cloud);
    phone.win("square", 30_000, 100);
    mac.win("square", 20_000, 200);
    phone.sync();
    mac.sync();
    // Both wrote the shared key at once, and iCloud kept the Mac's version
    // from before it had seen the phone's time: that time is gone from it…
    cloud["scores"] = JSON.stringify({ v: 1, boards: { "square|easy": [{ ms: 20_000, at: 200 }] } });
    // …until the phone hears of the change, merges, and writes it back.
    phone.sync();
    mac.sync();
    expect(mac.boards["square|easy"]?.map((e) => e.ms)).toEqual([20_000, 30_000]);
  });

  it("clears the best times on every device", () => {
    const cloud: Record<string, string> = {};
    const phone = new Device("aa", cloud);
    const mac = new Device("bb", cloud);
    phone.win("square", 30_000, 100);
    phone.sync();
    mac.sync();
    expect(mac.boards["square|easy"]).toHaveLength(1);

    mac.clear("scores", 500);
    mac.sync();
    phone.sync();
    expect(phone.boards).toEqual({});
    expect(mac.boards).toEqual({});

    // A time set after the clear is kept everywhere.
    phone.win("square", 40_000, 600);
    phone.sync();
    mac.sync();
    expect(mac.boards["square|easy"]?.map((e) => e.ms)).toEqual([40_000]);
  });

  it("clears the achievement record on every device", () => {
    const cloud: Record<string, string> = {};
    const phone = new Device("aa", cloud);
    const mac = new Device("bb", cloud);
    phone.win("square", 30_000, 100);
    mac.win("hexhex", 30_000, 100);
    phone.sync();
    mac.sync();
    phone.sync();
    expect(phone.wins()).toBe(2);

    phone.clear("achievements", 500);
    phone.sync();
    mac.sync();
    expect(mac.wins()).toBe(0);
    expect(phone.wins()).toBe(0);

    // Counting starts again from the clear, on both.
    mac.win("square", 30_000, 600);
    mac.sync();
    phone.sync();
    expect(phone.wins()).toBe(1);
    expect(mac.wins()).toBe(1);
  });

  it("keeps the earliest unlock date", () => {
    const cloud: Record<string, string> = {};
    const phone = new Device("aa", cloud);
    const mac = new Device("bb", cloud);
    phone.record.unlocked = { first_win: 300 };
    mac.record.unlocked = { first_win: 100, flagless: 0 };
    phone.sync();
    mac.sync();
    phone.sync();
    expect(phone.record.unlocked).toEqual({ first_win: 100, flagless: 0 });
  });

  it("writes nothing for a device with nothing to say", () => {
    const cloud: Record<string, string> = {};
    expect(new Device("aa", cloud).sync()).toEqual({});
  });
});
