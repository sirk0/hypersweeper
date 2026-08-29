import { describe, expect, it, vi } from "vitest";
import {
  ARRIVAL_GRACE_MS,
  checkForUpdate,
  deployedBuild,
  loadDeployedBuild,
  parseStamp,
  runningBuild,
  sameBuild,
  STAMP_FILE,
} from "../../src/update";

// The update check's whole point is that it answers from the *server's* stamp
// rather than from the service worker's state machine — the worker updates
// itself quietly on launch, so "nothing is installing" was being read as "you
// are on the latest build" on a page that was not. These tests pin both halves:
// the answer (which build is deployed) and the getting of it (what has to be
// true before a reload serves the new build rather than the old one again).
//
// vitest.config.ts compiles this bundle as version 0.0.0-test, commit
// "testing"; every stamp below is the other side of that comparison.

/** A fetch that answers the stamp request with `body`, and nothing else. */
function stubFetch(body: unknown, ok = true): typeof fetch {
  return vi.fn(async (input: RequestInfo | URL) => {
    expect(String(input)).toContain(STAMP_FILE);
    return {
      ok,
      json: async () => body,
    } as Response;
  }) as unknown as typeof fetch;
}

/** Let the update path get as far as its own listeners before the test moves
 * the worker on — several awaits deep, so a single microtask will not do. */
function flush(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

/** A ServiceWorker whose state the test drives by hand. */
function fakeWorker(state: ServiceWorkerState): ServiceWorker & {
  to(next: ServiceWorkerState): void;
} {
  const listeners = new Set<() => void>();
  const worker = {
    state,
    postMessage: vi.fn(),
    addEventListener: (_type: string, fn: () => void) => void listeners.add(fn),
    removeEventListener: (_type: string, fn: () => void) => void listeners.delete(fn),
    to(next: ServiceWorkerState) {
      worker.state = next;
      for (const fn of [...listeners]) fn();
    },
  };
  return worker as unknown as ServiceWorker & { to(next: ServiceWorkerState): void };
}

function fakeRegistration(parts: {
  installing?: ServiceWorker | null;
  waiting?: ServiceWorker | null;
  update?: () => Promise<void>;
}): ServiceWorkerRegistration & { arrive(worker: ServiceWorker): void } {
  const listeners = new Set<() => void>();
  const reg = {
    installing: parts.installing ?? null,
    waiting: parts.waiting ?? null,
    update: parts.update ?? ((): Promise<void> => Promise.resolve()),
    addEventListener: (_type: string, fn: () => void) => void listeners.add(fn),
    removeEventListener: (_type: string, fn: () => void) => void listeners.delete(fn),
    /** A worker turning up after `update()` has already resolved. */
    arrive(worker: ServiceWorker) {
      reg.installing = worker;
      for (const fn of [...listeners]) fn();
    },
  };
  return reg as unknown as ServiceWorkerRegistration & { arrive(worker: ServiceWorker): void };
}

describe("reading a build stamp", () => {
  it("takes a well-formed stamp", () => {
    expect(parseStamp({ version: "1.2.3", commit: "abc1234" })).toEqual({
      version: "1.2.3",
      commit: "abc1234",
    });
  });

  it("takes a stamp with no commit — a local build has none", () => {
    expect(parseStamp({ version: "1.2.3" })).toEqual({ version: "1.2.3", commit: "" });
  });

  // Untrusted input, as a share link is: an answer that is not the shape we
  // asked for has to become "could not check", never a false "up to date".
  it.each([
    ["not an object", "0.1.0"],
    ["null", null],
    ["no version", { commit: "abc1234" }],
    ["an empty version", { version: "" }],
    ["a numeric version", { version: 3 }],
    // What a host with no stamp serves instead: the app shell, as JSON it is
    // not — or, on a SPA fallback, some other object entirely.
    ["someone else's JSON", { name: "Hypersweeper" }],
  ])("refuses %s", (_label, body) => {
    expect(parseStamp(body)).toBeNull();
  });
});

describe("comparing builds", () => {
  it("is the version and the commit together", () => {
    const build = { version: "1.0.0", commit: "aaaaaaa" };
    expect(sameBuild(build, { ...build })).toBe(true);
    expect(sameBuild(build, { version: "1.0.1", commit: "aaaaaaa" })).toBe(false);
    // A PR preview publishes many builds under one version number, so the
    // commit alone has to be able to say "newer".
    expect(sameBuild(build, { version: "1.0.0", commit: "bbbbbbb" })).toBe(false);
  });
});

describe("checking for an update", () => {
  it("reports the running build as current", async () => {
    const check = await checkForUpdate(stubFetch(runningBuild()), "/");
    expect(check).toEqual({ state: "current" });
  });

  it("reports a different deployed build as found", async () => {
    const deployed = { version: "9.9.9", commit: "deadbee" };
    expect(await checkForUpdate(stubFetch(deployed), "/")).toEqual({
      state: "found",
      build: deployed,
    });
  });

  // The failures that must not be mistaken for "up to date": offline (which is
  // every check made by an installed app with no signal), and a host that has
  // no stamp to serve.
  it("reports an unreachable server rather than guessing", async () => {
    const offline = vi.fn(() => Promise.reject(new Error("offline")));
    expect(await checkForUpdate(offline as unknown as typeof fetch, "/")).toEqual({
      state: "unreachable",
    });
    expect(await checkForUpdate(stubFetch("", false), "/")).toEqual({
      state: "unreachable",
    });
  });

  it("asks for the stamp off the cache", async () => {
    const fetchFn = vi.fn(async () => ({ ok: true, json: async () => runningBuild() }) as Response);
    await deployedBuild(fetchFn as unknown as typeof fetch, "/");
    const [url, init] = fetchFn.mock.calls[0] as unknown as [string, RequestInit];
    // `no-store` keeps the browser's own cache out of it, and the query keeps
    // the request off the service worker's precache — Workbox matches a
    // precached URL exactly, so a parameter it is not told to ignore misses
    // every route and falls through to the network.
    expect(init.cache).toBe("no-store");
    expect(url).toMatch(/^\/version\.json\?t=\d+$/);
  });

  it("honours a base path", async () => {
    const fetchFn = vi.fn(async () => ({ ok: true, json: async () => runningBuild() }) as Response);
    await deployedBuild(fetchFn as unknown as typeof fetch, "/next/");
    expect(String((fetchFn.mock.calls[0] as unknown as [string])[0])).toMatch(
      /^\/next\/version\.json\?/,
    );
  });
});

describe("loading the deployed build", () => {
  // The case the bug was: the worker had already fetched and activated the new
  // build quietly, so there is nothing installing and nothing waiting. That is
  // not "you are up to date" — it is a page that only has to be reloaded.
  it("reloads when the worker has already updated itself", async () => {
    vi.useFakeTimers();
    try {
      const reload = vi.fn();
      const update = vi.fn(() => Promise.resolve());
      const done = loadDeployedBuild({
        registration: () => Promise.resolve(fakeRegistration({ update })),
        reload,
      });
      // Nothing installing and nothing waiting — but only after the grace
      // period below is that an answer rather than a guess.
      await vi.advanceTimersByTimeAsync(ARRIVAL_GRACE_MS + 1);
      expect(await done).toBe(true);
      expect(update).toHaveBeenCalled();
      expect(reload).toHaveBeenCalledOnce();
    } finally {
      vi.useRealTimers();
    }
  });

  it("waits for an installing worker to activate before reloading", async () => {
    const worker = fakeWorker("installing");
    const reload = vi.fn();
    const done = loadDeployedBuild({
      registration: () => Promise.resolve(fakeRegistration({ installing: worker })),
      reload,
      timeoutMs: 1000,
    });
    await flush();
    // Reloading here would serve the old precache — the very failure the check
    // is meant to end.
    expect(reload).not.toHaveBeenCalled();
    worker.to("installed");
    expect(reload).not.toHaveBeenCalled();
    worker.to("activated");
    expect(await done).toBe(true);
    expect(reload).toHaveBeenCalledOnce();
  });

  // The old bug in the other direction: `update()` resolves as the install
  // *begins*, so an engine that sets `installing` a tick later looks exactly
  // like the quiet-update case above — and reloading then serves the same old
  // build. `updatefound` is subscribed to before the fetch, and given a moment
  // after it.
  it("waits for a worker that turns up after update() resolves", async () => {
    const worker = fakeWorker("installing");
    const reload = vi.fn();
    const reg = fakeRegistration({});
    const done = loadDeployedBuild({
      registration: () => Promise.resolve(reg),
      reload,
      timeoutMs: 2000,
    });
    await flush();
    expect(reload).not.toHaveBeenCalled();
    reg.arrive(worker);
    await flush();
    expect(reload).not.toHaveBeenCalled();
    worker.to("activated");
    expect(await done).toBe(true);
    expect(reload).toHaveBeenCalledOnce();
  });

  it("does not reload when the install is thrown away", async () => {
    const worker = fakeWorker("installing");
    const reload = vi.fn();
    const done = loadDeployedBuild({
      registration: () => Promise.resolve(fakeRegistration({ installing: worker })),
      reload,
      timeoutMs: 1000,
    });
    await flush();
    worker.to("redundant");
    expect(await done).toBe(false);
    expect(reload).not.toHaveBeenCalled();
  });

  it("gives up rather than reloading into the same old build", async () => {
    vi.useFakeTimers();
    try {
      const reload = vi.fn();
      const done = loadDeployedBuild({
        registration: () => Promise.resolve(fakeRegistration({ installing: fakeWorker("installing") })),
        reload,
        timeoutMs: 1000,
      });
      await vi.advanceTimersByTimeAsync(1001);
      expect(await done).toBe(false);
      expect(reload).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  // A build with no worker at all (a dev server, a PR preview, VITE_NO_SW=1)
  // has no cache between the page and the server, so the reload is the update.
  it("reloads straight away with no worker registered", async () => {
    const reload = vi.fn();
    expect(
      await loadDeployedBuild({ registration: () => Promise.resolve(undefined), reload }),
    ).toBe(true);
    expect(reload).toHaveBeenCalledOnce();
  });

  it("nudges a worker that is sitting in waiting", async () => {
    const worker = fakeWorker("installed");
    const reload = vi.fn();
    const done = loadDeployedBuild({
      registration: () => Promise.resolve(fakeRegistration({ waiting: worker })),
      reload,
      timeoutMs: 1000,
    });
    await flush();
    expect(worker.postMessage).toHaveBeenCalledWith({ type: "SKIP_WAITING" });
    worker.to("activated");
    expect(await done).toBe(true);
  });

  it("survives an update() that throws", async () => {
    const reload = vi.fn();
    const ok = await loadDeployedBuild({
      registration: () =>
        Promise.resolve(fakeRegistration({ update: () => Promise.reject(new Error("no")) })),
      reload,
      timeoutMs: 1000,
    });
    expect(ok).toBe(false);
    expect(reload).not.toHaveBeenCalled();
  });
});
