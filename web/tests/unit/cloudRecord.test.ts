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

// -- offline -----------------------------------------------------------------
//
// The tests above share one store between devices, as if every device were
// always online. Here each device has its own cached copy of iCloud, which is
// what the native store is: a sync made offline reads and writes that cache,
// and the writes reach iCloud when the device is back online — where, per key,
// the latest write wins, and every other device's cache picks up the result
// (with a change event, which syncs again). A fresh install drops its writes
// until its first download from iCloud has arrived, as iOS does.

/** iCloud's side: per key, the value and when it was written. */
class ICloud {
  values = new Map<string, { value: string; t: number }>();
  clock = 0;
  readonly devices: OfflineDevice[] = [];

  tick(): number {
    return ++this.clock;
  }
}

class OfflineDevice extends Device {
  /** This device's cached copy of iCloud. */
  readonly cache: Record<string, string> = {};
  /** Keys written to the cache and not yet pushed, with when. */
  private readonly dirty = new Map<string, { value: string; t: number }>();
  online = true;
  /** Whether the first download from iCloud has happened. */
  downloaded: boolean;

  constructor(
    id: string,
    readonly icloud: ICloud,
    { fresh = false } = {},
  ) {
    super(id, {});
    this.downloaded = !fresh;
    icloud.devices.push(this);
  }

  override sync(): Record<string, string> {
    const result = mergeRecords({
      boards: this.boards,
      record: this.record,
      state: this.state ?? freshState(this.id, this.cache),
      cloud: { ...this.cache },
    });
    this.boards = result.boards;
    this.record = result.record;
    this.state = result.state;
    // Before the first download, iOS discards the write.
    if (this.downloaded) {
      for (const [key, value] of Object.entries(result.writes)) {
        this.cache[key] = value;
        this.dirty.set(key, { value, t: this.icloud.tick() });
      }
    }
    if (this.online && this.dirty.size > 0) this.connect();
    return result.writes;
  }

  /** Back online: push what was written, then every device downloads. */
  connect(): void {
    this.online = true;
    for (const [key, write] of this.dirty) {
      const have = this.icloud.values.get(key);
      if (!have || write.t > have.t) this.icloud.values.set(key, write);
    }
    this.dirty.clear();
    for (const device of this.icloud.devices) if (device.online) device.download();
  }

  /** Take iCloud's values into the cache; a change event if any differed. */
  download(): void {
    let changed = !this.downloaded && this.icloud.values.size > 0;
    this.downloaded = true;
    for (const [key, { value }] of this.icloud.values) {
      if (this.dirty.has(key)) continue; // not pushed yet: the cache keeps it
      if (this.cache[key] !== value) {
        this.cache[key] = value;
        changed = true;
      }
    }
    if (changed) this.sync();
  }
}

describe("iCloud record, offline", () => {
  it("merges what an offline device won once it is back", () => {
    const icloud = new ICloud();
    const phone = new OfflineDevice("aa", icloud);
    const mac = new OfflineDevice("bb", icloud);
    phone.win("square", 30_000, 100);
    phone.sync();
    expect(mac.wins()).toBe(1);

    // On a plane: the phone keeps playing and syncing against its own cache.
    phone.online = false;
    phone.win("square", 25_000, 200);
    phone.sync();
    phone.win("hexhex", 40_000, 300);
    phone.sync();
    // Meanwhile the Mac plays too.
    mac.win("square", 20_000, 250);
    mac.sync();
    expect(mac.wins()).toBe(2); // it has not heard of the phone's
    expect(phone.wins()).toBe(3); // nor the phone of the Mac's

    phone.connect();
    expect(phone.wins()).toBe(4);
    expect(mac.wins()).toBe(4);
    expect(phone.boards["square|easy"]?.map((e) => e.ms)).toEqual([20_000, 25_000, 30_000]);
    expect(mac.boards).toEqual(phone.boards);
    expect(mac.record.progress).toEqual(phone.record.progress);
  });

  it("loses no time when two offline devices wrote the shared list", () => {
    const icloud = new ICloud();
    const phone = new OfflineDevice("aa", icloud);
    const pad = new OfflineDevice("bb", icloud);
    phone.online = false;
    pad.online = false;
    phone.win("square", 30_000, 100);
    phone.sync();
    pad.win("square", 31_000, 110);
    pad.sync();
    // Both pushed `scores`; the pad's is later and wins in iCloud, without the
    // phone's time. The phone hears of it, merges, and writes the union back.
    phone.connect();
    pad.connect();
    expect(icloud.values.get("scores")?.value).toContain("30000");
    expect(icloud.values.get("scores")?.value).toContain("31000");
    expect(phone.boards).toEqual(pad.boards);
    expect(phone.wins()).toBe(2);
    expect(pad.wins()).toBe(2);
  });

  it("keeps what a fresh install won before its first download", () => {
    const icloud = new ICloud();
    const phone = new OfflineDevice("aa", icloud);
    phone.win("square", 30_000, 100);
    phone.win("cube", 40_000, 200);
    phone.sync();

    // Reinstalled, and opened offline: iCloud's record has not arrived, and
    // what the install writes is dropped.
    const again = new OfflineDevice("bb", icloud, { fresh: true });
    again.online = false;
    again.win("square", 35_000, 300);
    expect(again.sync()).not.toEqual({}); // tried…
    expect(again.cache).toEqual({}); // …and iOS dropped it
    expect(again.wins()).toBe(1);
    // Nothing it did reached iCloud, so the record there is whole.
    expect(phone.wins()).toBe(2);

    // Online: the download arrives, and the merge it sets off writes this
    // install's win again, now that iOS lets it.
    again.connect();
    expect(again.wins()).toBe(3);
    expect(phone.wins()).toBe(3);
    expect(again.boards["square|easy"]?.map((e) => e.ms)).toEqual([30_000, 35_000]);
    expect(phone.boards).toEqual(again.boards);
  });

  it("writes again after a download that changed nothing", () => {
    // The very first install, offline: iCloud is empty, so its first download
    // changes nothing and sends no change event. The next sync — the app
    // coming back to the foreground — is what writes.
    const icloud = new ICloud();
    const phone = new OfflineDevice("aa", icloud, { fresh: true });
    phone.online = false;
    phone.win("square", 30_000, 100);
    phone.sync();
    phone.connect();
    expect(icloud.values.size).toBe(0);
    phone.sync(); // foreground
    expect([...icloud.values.keys()].sort()).toEqual(["scores", "wins.aa"]);
    const mac = new OfflineDevice("bb", icloud, { fresh: true });
    mac.connect();
    expect(mac.wins()).toBe(1);
  });

  it("clears what an offline device won once it hears of a clear", () => {
    // A clear is a date. A device that was offline cannot tell which of its
    // wins came before the clear and which after, so it clears all it counted;
    // its *times* carry their own dates, and the ones after the clear stay.
    const icloud = new ICloud();
    const phone = new OfflineDevice("aa", icloud);
    const mac = new OfflineDevice("bb", icloud);
    phone.win("square", 30_000, 100);
    phone.sync();
    phone.online = false;
    mac.clear("achievements", 400);
    mac.clear("scores", 400);
    mac.sync();
    phone.win("hexhex", 40_000, 500);
    phone.sync();

    phone.connect();
    expect(phone.wins()).toBe(0);
    expect(mac.wins()).toBe(0);
    expect(phone.boards).toEqual({ "hexhex|easy": [{ ms: 40_000, at: 500 }] });
    expect(mac.boards).toEqual(phone.boards);
  });
});
