import { describe, expect, it, vi } from "vitest";
import { handleTally, type AnalyticsDataset } from "../../functions/api/_tally";

// The collector's request path, driven end to end without Cloudflare. What the
// wrapper in `tally.ts` adds is only the `PagesFunction` signature and the
// binding lookup, so everything worth asserting is reachable from here:
// the method gate, the cross-site gate, the size caps, and — the part that has
// to stay exactly right — which value lands in which blob, since
// scripts/metrics.mjs reads them by number.

function dataset(): AnalyticsDataset & { writeDataPoint: ReturnType<typeof vi.fn> } {
  return { writeDataPoint: vi.fn() };
}

function post(body: unknown, headers: Record<string, string> = {}): Request {
  return new Request("https://hypersweeper.pages.dev/api/tally", {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

const START = {
  v: 2,
  e: "start",
  m: "square",
  d: "easy",
  t: "menu",
  f: "",
  dv: "desktop",
  sh: "browser",
  vr: "0.2.83",
  c: 81,
  n: 10,
};
const END = {
  v: 2,
  e: "end",
  m: "hexhex",
  d: "hard",
  o: "won",
  s: 41,
  t: "again",
  f: "lost",
  dv: "phone",
  sh: "standalone",
  vr: "0.2.83",
  c: 271,
  n: 60,
  op: 211,
  fr: 58,
  fw: 2,
  rv: 40,
  ch: 12,
  fl: 61,
  fm: 2100,
  vm: 1,
};

describe("the collector", () => {
  it("writes a start to the agreed columns", async () => {
    const db = dataset();
    const res = await handleTally(post(START), db);
    expect(res.status).toBe(204);
    expect(await res.text()).toBe("");
    // The whole point of this assertion is the *order*. Every dashboard and
    // scripts/metrics.mjs address these by number, and nothing else in the
    // repo would notice a column moving. Append only.
    expect(db.writeDataPoint).toHaveBeenCalledWith({
      indexes: ["square"],
      blobs: [
        "start",
        "easy",
        "",
        "Squares",
        "square",
        "flat",
        "regular",
        "menu",
        "",
        "desktop",
        "browser",
        "0.2.83",
      ],
      doubles: [0, 81, 10, 0, 0, 0, 0, 0, 0, 0, 0],
    });
  });

  it("writes an end with its outcome and its clock", async () => {
    const db = dataset();
    await handleTally(post(END), db);
    expect(db.writeDataPoint).toHaveBeenCalledWith({
      indexes: ["hexhex"],
      blobs: [
        "end",
        "hard",
        "won",
        "Hexagons - hexagonal board",
        "hex",
        "flat",
        "regular",
        "again",
        "lost",
        "phone",
        "standalone",
        "0.2.83",
      ],
      doubles: [41, 271, 60, 211, 58, 2, 40, 12, 61, 2100, 1],
    });
  });

  it("still writes a v1 body, filling what it can and zeroing the rest", async () => {
    // An older build, still alive in a player's service-worker cache. Its board
    // columns come from the mode it does carry; the fields it predates are
    // empty rather than guessed at.
    const db = dataset();
    await handleTally(post({ v: 1, e: "start", m: "torushex", d: "hard" }), db);
    expect(db.writeDataPoint).toHaveBeenCalledWith({
      indexes: ["torushex"],
      blobs: [
        "start",
        "hard",
        "",
        "Hexagons · Torus",
        "hex",
        "torus",
        "regular",
        "",
        "",
        "",
        "",
        "",
      ],
      doubles: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    });
  });

  it("answers 405 to anything but a POST", async () => {
    for (const method of ["GET", "PUT", "DELETE", "OPTIONS"]) {
      const db = dataset();
      const res = await handleTally(
        new Request("https://hypersweeper.pages.dev/api/tally", { method }),
        db,
      );
      expect(res.status, method).toBe(405);
      expect(res.headers.get("allow"), method).toBe("POST");
      expect(db.writeDataPoint).not.toHaveBeenCalled();
    }
  });

  it("declines a cross-site post but lets a header-less one through", async () => {
    const cross = dataset();
    expect((await handleTally(post(START, { "sec-fetch-site": "cross-site" }), cross)).status).toBe(
      204,
    );
    expect(cross.writeDataPoint).not.toHaveBeenCalled();

    // Same-origin, and the beacon's own "none", both count as ours; a client
    // that sends no such header at all is not punished for it.
    for (const site of ["same-origin", "none"]) {
      const db = dataset();
      await handleTally(post(START, { "sec-fetch-site": site }), db);
      expect(db.writeDataPoint, site).toHaveBeenCalledTimes(1);
    }
    const bare = dataset();
    await handleTally(post(START), bare);
    expect(bare.writeDataPoint).toHaveBeenCalledTimes(1);
  });

  it("drops an oversize body, by its claim and by its measurement", async () => {
    const claimed = dataset();
    await handleTally(post(START, { "content-length": "99999" }), claimed);
    expect(claimed.writeDataPoint).not.toHaveBeenCalled();

    // A body that lies about its length is caught after reading, not before.
    const measured = dataset();
    await handleTally(post({ ...START, pad: "x".repeat(1200) }), measured);
    expect(measured.writeDataPoint).not.toHaveBeenCalled();
  });

  it("drops junk without ever saying so", async () => {
    for (const body of [
      "{not json",
      "null",
      '"a string"',
      "[]",
      JSON.stringify({ ...START, v: 3 }),
      JSON.stringify({ ...START, m: "vaporwave" }),
      JSON.stringify({ ...START, m: "constructor" }),
      JSON.stringify({ ...START, d: "nightmare" }),
      JSON.stringify({ ...END, o: "quit" }),
    ]) {
      const db = dataset();
      const res = await handleTally(post(body), db);
      // Same status and same empty body as a success: the endpoint must not
      // tell a prober which of these the validator disliked.
      expect(res.status, body).toBe(204);
      expect(await res.text(), body).toBe("");
      expect(db.writeDataPoint, body).not.toHaveBeenCalled();
    }
  });

  it("still answers when the binding is missing or throws", async () => {
    expect((await handleTally(post(START), undefined)).status).toBe(204);
    const broken: AnalyticsDataset = {
      writeDataPoint: () => {
        throw new Error("no such binding");
      },
    };
    expect((await handleTally(post(START), broken)).status).toBe(204);
  });

  it("never lets a response be cached", async () => {
    const res = await handleTally(post(START), dataset());
    expect(res.headers.get("cache-control")).toBe("no-store");
  });
});
