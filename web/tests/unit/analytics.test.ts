import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  MAX_SECONDS,
  boardInfo,
  parseEvent,
  payloadFor,
  type EventPayload,
  type GameEvent,
  type GameFacts,
  type GameStats,
} from "../../src/analyticsEvent";

// Two halves, tested the way sound.ts is: the pure one directly, the transport
// one against stubbed globals.
//
// `analyticsEvent.ts` is the contract between the app and the Pages Function
// that collects the events — the browser shapes with `payloadFor`, the Function
// validates with `parseEvent` — so the round-trip case below is the single
// assertion that keeps a deployed collector and a deployed app talking. The
// rest of the validation cases exist because `parseEvent` reads whatever the
// open internet posts at it. See docs/agents/metrics.md.
//
// The unit environment is node: no window, no navigator, no fetch by default,
// which is exactly the shape `analytics.ts` has to survive being imported into.

/** The client facts `analytics.ts` adds; named here so the pure tests can shape
 * a whole event without a browser. */
const CONTEXT = { device: "phone", shell: "browser", version: "1.2.3" } as const;

const START_FACTS: GameFacts = {
  kind: "start",
  mode: "square",
  difficulty: "easy",
  trigger: "menu",
  from: "",
  cells: 81,
  mines: 10,
};

const STATS: GameStats = {
  opened: 40,
  flagsRight: 8,
  flagsWrong: 1,
  reveals: 22,
  chords: 3,
  flagMoves: 9,
  firstMoveMs: 2_100,
  viewMoved: true,
};

const END_FACTS: GameFacts = {
  kind: "end",
  mode: "hexhex",
  difficulty: "hard",
  trigger: "again",
  from: "lost",
  cells: 271,
  mines: 60,
  outcome: "won",
  ms: 41_400,
  stats: STATS,
};

const START: GameEvent = { ...START_FACTS, ...CONTEXT };
const END: GameEvent = { ...END_FACTS, ...CONTEXT };

describe("event shaping", () => {
  it("shapes a start with no outcome, no clock and no stats", () => {
    const payload = payloadFor(START);
    expect(payload).toEqual({
      v: 2,
      e: "start",
      m: "square",
      d: "easy",
      t: "menu",
      f: "",
      dv: "phone",
      sh: "browser",
      vr: "1.2.3",
      c: 81,
      n: 10,
    });
    // Absent, not present-and-undefined: `exactOptionalPropertyTypes` makes the
    // difference real, and the collector's validator reads the keys.
    expect(Object.keys(payload as EventPayload).sort()).toEqual([
      "c",
      "d",
      "dv",
      "e",
      "f",
      "m",
      "n",
      "sh",
      "t",
      "v",
      "vr",
    ]);
  });

  it("carries the whole of an end", () => {
    expect(payloadFor(END)).toEqual({
      v: 2,
      e: "end",
      m: "hexhex",
      d: "hard",
      t: "again",
      f: "lost",
      dv: "phone",
      sh: "browser",
      vr: "1.2.3",
      c: 271,
      n: 60,
      o: "won",
      s: 41,
      op: 40,
      fr: 8,
      fw: 1,
      rv: 22,
      ch: 3,
      fl: 9,
      fm: 2_100,
      vm: 1,
    });
  });

  it("rounds the clock to whole seconds", () => {
    expect(payloadFor(END)?.s).toBe(41);
    expect(payloadFor({ ...END, ms: 41_600 })?.s).toBe(42);
  });

  it("clamps a clock that cannot be true", () => {
    expect(payloadFor({ ...END, ms: -5 })?.s).toBe(0);
    expect(payloadFor({ ...END, ms: 1e12 })?.s).toBe(MAX_SECONDS);
  });

  it("drops a version that is not a plain x.y.z", () => {
    // A pre-release stamp ("0.0.0-test", which is what the unit build calls
    // itself) reports as empty rather than as a value no dashboard can group.
    expect(payloadFor({ ...START, version: "0.0.0-test" })?.vr).toBe("");
    expect(payloadFor({ ...START, version: "" })?.vr).toBe("");
  });

  it("rounds and clamps the counts rather than dropping the game", () => {
    const wild: GameStats = { ...STATS, opened: -3, reveals: 1e9, firstMoveMs: 2.6 };
    const payload = payloadFor({ ...END, stats: wild });
    expect(payload?.op).toBe(0);
    expect(payload?.rv).toBe(100_000);
    expect(payload?.fm).toBe(3);
  });

  it("sends nothing for a board or difficulty this build does not have", () => {
    expect(payloadFor({ ...START, mode: "vaporwave" })).toBeNull();
    expect(payloadFor({ ...START, difficulty: "nightmare" })).toBeNull();
  });

  it("sends nothing for an end with no outcome or no clock", () => {
    // Genuinely absent, not present-and-undefined: `exactOptionalPropertyTypes`
    // will not let the second one be written at all.
    const { outcome: _outcome, ...outcomeless } = END;
    expect(payloadFor(outcomeless)).toBeNull();
    expect(payloadFor({ ...END, ms: Number.NaN })).toBeNull();
    expect(payloadFor({ ...END, ms: Number.POSITIVE_INFINITY })).toBeNull();
  });
});

describe("the client/server contract", () => {
  it("round-trips both kinds through JSON", () => {
    for (const event of [START, END]) {
      const wire = JSON.parse(JSON.stringify(payloadFor(event))) as unknown;
      const board = boardInfo(event.mode);
      const end = event.kind === "end";
      expect(parseEvent(wire), event.kind).toEqual({
        kind: event.kind,
        mode: event.mode,
        difficulty: event.difficulty,
        outcome: end ? event.outcome : null,
        seconds: end ? 41 : 0,
        board: board?.label,
        tiling: board?.tiling,
        surface: board?.surface,
        family: board?.family,
        trigger: event.trigger,
        from: event.from,
        device: event.device,
        shell: event.shell,
        version: event.version,
        cells: event.cells,
        mines: event.mines,
        opened: end ? STATS.opened : 0,
        flagsRight: end ? STATS.flagsRight : 0,
        flagsWrong: end ? STATS.flagsWrong : 0,
        reveals: end ? STATS.reveals : 0,
        chords: end ? STATS.chords : 0,
        flagMoves: end ? STATS.flagMoves : 0,
        firstMoveMs: end ? STATS.firstMoveMs : 0,
        viewMoved: end ? 1 : 0,
      });
    }
  });

  it("names the board from the mode, rather than being told it", () => {
    // The wire carries no name at all: `blob4` is derived here, which is what
    // keeps the collector unable to store a string it did not choose.
    const wire = JSON.parse(JSON.stringify(payloadFor(START))) as Record<string, unknown>;
    expect(Object.values(wire)).not.toContain("Squares");
    expect(parseEvent(wire)?.board).toBe("Squares");
    expect(parseEvent({ ...wire, m: "torushex" })?.board).toBe("Hexagons · Torus");
  });
});

describe("event validation", () => {
  const valid = {
    v: 2,
    e: "start",
    m: "square",
    d: "easy",
    t: "menu",
    f: "",
    dv: "phone",
    sh: "browser",
    vr: "1.2.3",
    c: 81,
    n: 10,
  };

  it("accepts a well-formed start and end", () => {
    expect(parseEvent(valid)).not.toBeNull();
    expect(parseEvent({ ...valid, e: "end", o: "lost", s: 12 })).toMatchObject({
      kind: "end",
      mode: "square",
      difficulty: "easy",
      outcome: "lost",
      seconds: 12,
    });
  });

  it("still accepts a v1 body, with the fields it predates left empty", () => {
    // The service worker keeps older builds alive in players' caches for days
    // after a deploy. Rejecting their posts would silently drop real games.
    expect(parseEvent({ v: 1, e: "end", m: "torushex", d: "hard", o: "won", s: 12 })).toEqual({
      kind: "end",
      mode: "torushex",
      difficulty: "hard",
      outcome: "won",
      seconds: 12,
      // derived from the mode, which v1 does carry
      board: "Hexagons · Torus",
      tiling: "hex",
      surface: "torus",
      family: "regular",
      trigger: "",
      from: "",
      device: "",
      shell: "",
      version: "",
      cells: 0,
      mines: 0,
      opened: 0,
      flagsRight: 0,
      flagsWrong: 0,
      reveals: 0,
      chords: 0,
      flagMoves: 0,
      firstMoveMs: 0,
      viewMoved: 0,
    });
  });

  it("tells a v1 silence apart from a v2 'unknown'", () => {
    expect(parseEvent({ v: 1, e: "start", m: "square", d: "easy" })?.device).toBe("");
    expect(parseEvent({ ...valid, dv: "unknown" })?.device).toBe("unknown");
  });

  it("rejects anything that is not a plain object", () => {
    for (const junk of [null, undefined, 42, "start", [valid], true]) {
      expect(parseEvent(junk), String(junk)).toBeNull();
    }
  });

  it("rejects a version it does not speak", () => {
    expect(parseEvent({ ...valid, v: 3 })).toBeNull();
    expect(parseEvent({ ...valid, v: "2" })).toBeNull();
  });

  it("rejects an unknown kind, board or difficulty", () => {
    expect(parseEvent({ ...valid, e: "abandon" })).toBeNull();
    expect(parseEvent({ ...valid, m: "vaporwave" })).toBeNull();
    expect(parseEvent({ ...valid, d: "nightmare" })).toBeNull();
    expect(parseEvent({ ...valid, m: "x".repeat(200) })).toBeNull();
  });

  it("rejects a prototype-chain name posing as a board", () => {
    // link.ts already carries this scar: `in` and a plain-object lookup both
    // say yes to `constructor`. A Set built from Object.keys cannot.
    for (const name of ["constructor", "toString", "valueOf", "__proto__", "hasOwnProperty"]) {
      expect(parseEvent({ ...valid, m: name }), name).toBeNull();
    }
  });

  it("drops an unrecognised enum value rather than storing it", () => {
    // Every one of these arrives over the open internet. None of them can put
    // a string of its own into the dataset.
    expect(parseEvent({ ...valid, t: "cheated" })?.trigger).toBe("");
    expect(parseEvent({ ...valid, f: "abandoned" })?.from).toBe("");
    expect(parseEvent({ ...valid, dv: "toaster" })?.device).toBe("");
    expect(parseEvent({ ...valid, sh: "kiosk" })?.shell).toBe("");
    expect(parseEvent({ ...valid, vr: "<script>" })?.version).toBe("");
    expect(parseEvent({ ...valid, vr: "1.2.3.4" })?.version).toBe("");
    expect(parseEvent({ ...valid, vr: `${"9".repeat(30)}.1.1` })?.version).toBe("");
    expect(parseEvent({ ...valid, t: { toString: () => "menu" } })?.trigger).toBe("");
  });

  it("rejects an end missing its outcome or its clock", () => {
    const end = { ...valid, e: "end", o: "won", s: 3 };
    expect(parseEvent({ ...end, o: undefined })).toBeNull();
    expect(parseEvent({ ...end, o: "quit" })).toBeNull();
    expect(parseEvent({ ...end, s: "3" })).toBeNull();
    expect(parseEvent({ ...end, s: Number.NaN })).toBeNull();
  });

  it("clamps a hand-posted clock and hand-posted counts", () => {
    const end = { ...valid, e: "end", o: "won" };
    expect(parseEvent({ ...end, s: -10 })?.seconds).toBe(0);
    expect(parseEvent({ ...end, s: 1e9 })?.seconds).toBe(MAX_SECONDS);
    expect(parseEvent({ ...end, s: 3, op: 1e9 })?.opened).toBe(100_000);
    expect(parseEvent({ ...end, s: 3, fr: -4 })?.flagsRight).toBe(0);
    expect(parseEvent({ ...end, s: 3, rv: "many" })?.reveals).toBe(0);
    expect(parseEvent({ ...end, s: 3, vm: 7 })?.viewMoved).toBe(0);
  });

  it("ignores an outcome, a clock and stats posted alongside a start", () => {
    expect(parseEvent({ ...valid, o: "won", s: 999, op: 50, vm: 1 })).toMatchObject({
      kind: "start",
      outcome: null,
      seconds: 0,
      opened: 0,
      viewMoved: 0,
    });
  });
});

describe("the transport", () => {
  /** Re-import per test: the enabled flag is module state, as haptics.ts's is. */
  async function load() {
    vi.resetModules();
    return import("../../src/analytics");
  }

  let beacon: ReturnType<typeof vi.fn>;
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    beacon = vi.fn(() => true);
    fetchMock = vi.fn(() => Promise.resolve(new Response(null, { status: 204 })));
    vi.stubGlobal("navigator", { sendBeacon: beacon });
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("posts one beacon per event, to the app's own origin", async () => {
    const { trackGame } = await load();
    trackGame(START_FACTS);
    expect(beacon).toHaveBeenCalledTimes(1);
    expect(fetchMock).not.toHaveBeenCalled();
    const [url, blob] = beacon.mock.calls[0] as [string, Blob];
    expect(url.endsWith("/api/tally")).toBe(true);
    // Node has no window and no screen, so the device class is `unknown`; the
    // point is that the caller never named one.
    expect(JSON.parse(await blob.text())).toMatchObject({
      v: 2,
      e: "start",
      m: "square",
      dv: "unknown",
      sh: "browser",
    });
  });

  it("sends nothing at all once it is switched off", async () => {
    const { setAnalyticsEnabled, analyticsEnabled, trackGame } = await load();
    setAnalyticsEnabled(false);
    expect(analyticsEnabled()).toBe(false);
    trackGame(START_FACTS);
    trackGame(END_FACTS);
    expect(beacon).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("sends nothing for an event that shapes to nothing", async () => {
    const { trackGame } = await load();
    trackGame({ ...START_FACTS, mode: "vaporwave" });
    expect(beacon).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("falls back to keepalive fetch when the beacon is missing or refuses", async () => {
    vi.stubGlobal("navigator", {});
    let { trackGame } = await load();
    trackGame(START_FACTS);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({
      method: "POST",
      keepalive: true,
    });

    // A full beacon queue answers false; the event must not be lost to it.
    fetchMock.mockClear();
    vi.stubGlobal("navigator", { sendBeacon: vi.fn(() => false) });
    ({ trackGame } = await load());
    trackGame(START_FACTS);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("never lets a failing transport reach the caller", async () => {
    vi.stubGlobal("navigator", {
      sendBeacon: () => {
        throw new Error("blocked by an extension");
      },
    });
    vi.stubGlobal("fetch", () => Promise.reject(new Error("offline")));
    const { trackGame } = await load();
    expect(() => trackGame(START_FACTS)).not.toThrow();

    // And with nothing to post with at all (node, a locked-down page).
    vi.unstubAllGlobals();
    const again = await load();
    expect(() => again.trackGame(START_FACTS)).not.toThrow();
  });
});
