import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  MAX_SECONDS,
  parseEvent,
  payloadFor,
  type EventPayload,
  type GameEvent,
} from "../../src/analyticsEvent";

// Two halves, tested the way sound.ts is: the pure one directly, the transport
// one against stubbed globals.
//
// `analyticsEvent.ts` is the contract between the app and the Pages Function
// that collects the events — the browser shapes with `payloadFor`, the Function
// validates with `parseEvent` — so the round-trip case below is the single
// assertion that keeps a deployed collector and a deployed app talking. The
// rest of the validation cases exist because `parseEvent` reads whatever the
// open internet posts at it.
//
// The unit environment is node: no window, no navigator, no fetch by default,
// which is exactly the shape `analytics.ts` has to survive being imported into.

const START: GameEvent = { kind: "start", mode: "square", difficulty: "easy" };
const END: GameEvent = {
  kind: "end",
  mode: "hexhex",
  difficulty: "hard",
  outcome: "won",
  ms: 41_400,
};

describe("event shaping", () => {
  it("shapes a start with no outcome and no clock", () => {
    const payload = payloadFor(START);
    expect(payload).toEqual({ v: 1, e: "start", m: "square", d: "easy" });
    // Absent, not present-and-undefined: `exactOptionalPropertyTypes` makes the
    // difference real, and the collector's validator reads the keys.
    expect(Object.keys(payload as EventPayload).sort()).toEqual(["d", "e", "m", "v"]);
  });

  it("rounds the clock to whole seconds", () => {
    expect(payloadFor(END)?.s).toBe(41);
    expect(payloadFor({ ...END, ms: 41_600 })?.s).toBe(42);
  });

  it("clamps a clock that cannot be true", () => {
    expect(payloadFor({ ...END, ms: -5 })?.s).toBe(0);
    expect(payloadFor({ ...END, ms: 1e12 })?.s).toBe(MAX_SECONDS);
  });

  it("sends nothing for a board or difficulty this build does not have", () => {
    expect(payloadFor({ ...START, mode: "vaporwave" })).toBeNull();
    expect(payloadFor({ ...START, difficulty: "nightmare" })).toBeNull();
  });

  it("sends nothing for an end with no outcome or no clock", () => {
    expect(payloadFor({ kind: "end", mode: "square", difficulty: "easy" })).toBeNull();
    expect(payloadFor({ ...END, ms: Number.NaN })).toBeNull();
    expect(payloadFor({ ...END, ms: Number.POSITIVE_INFINITY })).toBeNull();
  });
});

describe("the client/server contract", () => {
  it("round-trips both kinds through JSON", () => {
    for (const event of [START, END]) {
      const wire = JSON.parse(JSON.stringify(payloadFor(event))) as unknown;
      expect(parseEvent(wire), event.kind).toEqual({
        kind: event.kind,
        mode: event.mode,
        difficulty: event.difficulty,
        outcome: event.kind === "end" ? event.outcome : null,
        seconds: event.kind === "end" ? 41 : 0,
      });
    }
  });
});

describe("event validation", () => {
  const valid = { v: 1, e: "start", m: "square", d: "easy" };

  it("accepts a well-formed start and end", () => {
    expect(parseEvent(valid)).not.toBeNull();
    expect(parseEvent({ v: 1, e: "end", m: "square", d: "easy", o: "lost", s: 12 })).toEqual({
      kind: "end",
      mode: "square",
      difficulty: "easy",
      outcome: "lost",
      seconds: 12,
    });
  });

  it("rejects anything that is not a plain object", () => {
    for (const junk of [null, undefined, 42, "start", [valid], true]) {
      expect(parseEvent(junk), String(junk)).toBeNull();
    }
  });

  it("rejects a version it does not speak", () => {
    expect(parseEvent({ ...valid, v: 2 })).toBeNull();
    expect(parseEvent({ ...valid, v: "1" })).toBeNull();
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

  it("rejects an end missing its outcome or its clock", () => {
    const end = { v: 1, e: "end", m: "square", d: "easy", o: "won", s: 3 };
    expect(parseEvent({ ...end, o: undefined })).toBeNull();
    expect(parseEvent({ ...end, o: "quit" })).toBeNull();
    expect(parseEvent({ ...end, s: "3" })).toBeNull();
    expect(parseEvent({ ...end, s: Number.NaN })).toBeNull();
  });

  it("clamps a hand-posted clock rather than trusting it", () => {
    const end = { v: 1, e: "end", m: "square", d: "easy", o: "won" };
    expect(parseEvent({ ...end, s: -10 })?.seconds).toBe(0);
    expect(parseEvent({ ...end, s: 1e9 })?.seconds).toBe(MAX_SECONDS);
  });

  it("ignores an outcome and a clock posted alongside a start", () => {
    expect(parseEvent({ ...valid, o: "won", s: 999 })).toEqual({
      kind: "start",
      mode: "square",
      difficulty: "easy",
      outcome: null,
      seconds: 0,
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
    trackGame(START);
    expect(beacon).toHaveBeenCalledTimes(1);
    expect(fetchMock).not.toHaveBeenCalled();
    const [url, blob] = beacon.mock.calls[0] as [string, Blob];
    expect(url.endsWith("/api/tally")).toBe(true);
    expect(JSON.parse(await blob.text())).toEqual(payloadFor(START));
  });

  it("sends nothing at all once it is switched off", async () => {
    const { setAnalyticsEnabled, analyticsEnabled, trackGame } = await load();
    setAnalyticsEnabled(false);
    expect(analyticsEnabled()).toBe(false);
    trackGame(START);
    trackGame(END);
    expect(beacon).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("sends nothing for an event that shapes to nothing", async () => {
    const { trackGame } = await load();
    trackGame({ ...START, mode: "vaporwave" });
    expect(beacon).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("falls back to keepalive fetch when the beacon is missing or refuses", async () => {
    vi.stubGlobal("navigator", {});
    let { trackGame } = await load();
    trackGame(START);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({
      method: "POST",
      keepalive: true,
    });

    // A full beacon queue answers false; the event must not be lost to it.
    fetchMock.mockClear();
    vi.stubGlobal("navigator", { sendBeacon: vi.fn(() => false) });
    ({ trackGame } = await load());
    trackGame(START);
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
    expect(() => trackGame(START)).not.toThrow();

    // And with nothing to post with at all (node, a locked-down page).
    vi.unstubAllGlobals();
    const again = await load();
    expect(() => again.trackGame(START)).not.toThrow();
  });
});
