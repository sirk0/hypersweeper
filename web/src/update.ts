// Is a newer build deployed, and how to get onto it.
//
// The question looks like one for the service worker — it is the thing that
// holds the cached copy of the app — and asking it was the bug. With
// `registerType: "autoUpdate"` the generated worker calls `skipWaiting()` and
// `clientsClaim()`, so a new build goes installing → installed → activated on
// its own, with no pause anywhere. Reading `registration.installing ??
// registration.waiting` right after `update()` therefore samples a race: catch
// it a moment late (or arrive after the worker had already updated itself
// quietly on page load, which is the *common* case — registerSW.js checks on
// every launch) and both are null, which the old code read as "you are on the
// latest build". The page it was reporting for was still the old one, and the
// build the worker had just cached only appeared on the next cold start. That
// is exactly the report: check says up to date, reopen the app and the new
// version is there.
//
// So the check does not ask the worker at all. Every deployed build writes a
// `version.json` naming itself (vite.config.ts), and the check fetches it from
// the *network* and compares it with the constants compiled into this bundle.
// That is a fact about the server, not about a cache's state machine, and it is
// true whatever the worker happens to be doing. The worker is then only
// machinery for *getting* the new build, and only after the answer is known.
//
// Fetching it: a cache-busting query and `cache: "no-store"`. The query is what
// keeps the request off the precache — Workbox matches a precached URL exactly
// (bar the `utm_`/`fbclid` parameters it is told to ignore), so `?t=…` misses
// every route and falls through to the network. An offline app therefore fails
// the fetch rather than being told by its own cache that it is up to date,
// which is the honest answer offline.

/** What a build calls itself: the package version, and the short commit on a
 * CI build (empty locally, and on the deploy for a version bump alone). Both,
 * because a PR preview publishes many builds under one version number. */
export interface BuildStamp {
  readonly version: string;
  readonly commit: string;
}

/** The file every non-packaged build emits at its own root. */
export const STAMP_FILE = "version.json";

/** How long to wait for the worker to finish installing the new build before
 * telling the player it will be there next time they open the app. Generous:
 * this is a whole bundle over a phone connection. */
export const SETTLE_TIMEOUT_MS = 20_000;

/** The outcome of asking the server what it is serving. */
export type UpdateCheck =
  | { readonly state: "current" }
  | { readonly state: "found"; readonly build: BuildStamp }
  | { readonly state: "unreachable" };

/** What this bundle is — the same pair the settings page prints. */
export function runningBuild(): BuildStamp {
  return { version: __APP_VERSION__, commit: __APP_COMMIT__ };
}

export function sameBuild(a: BuildStamp, b: BuildStamp): boolean {
  return a.version === b.version && a.commit === b.commit;
}

/** Read a stamp out of whatever the server sent. Untrusted input, like a share
 * link: a body that is not the shape we asked for is no answer at all, and
 * `null` here becomes "could not check" rather than a false "up to date". */
export function parseStamp(body: unknown): BuildStamp | null {
  if (typeof body !== "object" || body === null) return null;
  const record = body as Record<string, unknown>;
  const version = record["version"];
  const commit = record["commit"];
  if (typeof version !== "string" || version === "") return null;
  return { version, commit: typeof commit === "string" ? commit : "" };
}

/** Ask the server which build it is serving right now. `null` if it could not
 * be asked (offline, or a host with no stamp). */
export async function deployedBuild(
  fetchFn?: typeof fetch,
  base: string = import.meta.env.BASE_URL,
): Promise<BuildStamp | null> {
  // Called through the global rather than defaulted to `globalThis.fetch`: a
  // detached `fetch` is a WebIDL operation with no `this`, which some engines
  // refuse outright.
  const send = fetchFn ?? ((url: string, init: RequestInit) => globalThis.fetch(url, init));
  try {
    const res = await send(`${base}${STAMP_FILE}?t=${Date.now()}`, {
      cache: "no-store",
    });
    if (!res.ok) return null;
    return parseStamp(await res.json());
  } catch {
    return null;
  }
}

/** The check itself: what the server has, against what is running here. */
export async function checkForUpdate(
  fetchFn?: typeof fetch,
  base?: string,
): Promise<UpdateCheck> {
  const deployed = await deployedBuild(fetchFn, base);
  if (!deployed) return { state: "unreachable" };
  if (sameBuild(deployed, runningBuild())) return { state: "current" };
  return { state: "found", build: deployed };
}

/** The seams the two functions below reach the browser through, so a test can
 * drive the whole update path without a service worker or a page to reload. */
export interface UpdateDeps {
  registration?: () => Promise<ServiceWorkerRegistration | undefined>;
  reload?: () => void;
  timeoutMs?: number;
}

function defaultRegistration(): Promise<ServiceWorkerRegistration | undefined> {
  const sw = globalThis.navigator?.serviceWorker;
  if (!sw) return Promise.resolve(undefined);
  return sw.getRegistration().catch(() => undefined);
}

/** How long to keep watching for an incoming worker after `update()` has
 * resolved. Reading the registration's state at one instant is what the old
 * check got wrong; the grace period is so this one does not get it wrong in the
 * other direction, by reloading a tick before the new worker appears. */
export const ARRIVAL_GRACE_MS = 1_000;

/** Wait until a reload would actually serve the new build.
 *
 * `update()` starts the fetch; what matters afterwards is the incoming worker
 * reaching `activated`, because only then has its precache replaced the old
 * one. `updatefound` is subscribed to *before* the fetch and given a moment
 * after it, rather than reading `installing`/`waiting` once when the promise
 * resolves: the spec resolves it as the install begins, and an engine that sets
 * the property a tick later would otherwise look exactly like the case below.
 *
 * No incoming worker at all is that case, and it is the ordinary one: the
 * worker updated itself quietly at launch, the active one is already the newest
 * this device has, and a reload alone gets the page onto it.
 *
 * Returns false when the install did not finish in time or was thrown away
 * (`redundant`), which is a real answer rather than a reason to reload: a
 * reload before the worker is ready serves the same old build again, and the
 * player would have learnt nothing. */
async function settle(
  reg: ServiceWorkerRegistration,
  timeoutMs: number,
): Promise<boolean> {
  let incoming: ServiceWorker | null = reg.installing ?? reg.waiting;
  let arrived: (() => void) | null = null;
  const onFound = (): void => {
    incoming = reg.installing ?? reg.waiting;
    if (incoming) arrived?.();
  };
  reg.addEventListener("updatefound", onFound);
  try {
    await reg.update();
    if (!incoming) {
      await new Promise<void>((resolve) => {
        arrived = resolve;
        setTimeout(resolve, ARRIVAL_GRACE_MS);
      });
    }
    if (!incoming) return true;
    return await activation(incoming, timeoutMs);
  } finally {
    reg.removeEventListener("updatefound", onFound);
  }
}

/** Resolve true when `worker` reaches `activated`, false if it is thrown away
 * or takes longer than `timeoutMs`. */
function activation(worker: ServiceWorker, timeoutMs: number): Promise<boolean> {
  return new Promise<boolean>((resolve) => {
    const finish = (ok: boolean): void => {
      clearTimeout(timer);
      worker.removeEventListener("statechange", onState);
      resolve(ok);
    };
    const onState = (): void => {
      if (worker.state === "activated") finish(true);
      else if (worker.state === "redundant") finish(false);
      // Harmless where the worker skips waiting by itself (which this one
      // does); the one thing that would otherwise sit in `installed` until the
      // timeout is a build configured to prompt instead.
      else if (worker.state === "installed") worker.postMessage({ type: "SKIP_WAITING" });
    };
    const timer = setTimeout(() => finish(false), timeoutMs);
    worker.addEventListener("statechange", onState);
    // It may have moved on between the read above and the listener going on.
    onState();
  });
}

/** Get onto the build the check found. Resolves true having reloaded the page,
 * or false if the new build is still downloading — in which case the next
 * launch will pick it up, which is what the caller says.
 *
 * With no worker registered (a dev server, a PR preview, `VITE_NO_SW=1`) there
 * is no cache between the page and the server, so the reload *is* the update. */
export async function loadDeployedBuild(deps: UpdateDeps = {}): Promise<boolean> {
  const registration = deps.registration ?? defaultRegistration;
  const reload = deps.reload ?? ((): void => globalThis.location.reload());
  const timeoutMs = deps.timeoutMs ?? SETTLE_TIMEOUT_MS;
  let reg: ServiceWorkerRegistration | undefined;
  try {
    reg = await registration();
  } catch {
    reg = undefined;
  }
  if (reg) {
    let ready = false;
    try {
      ready = await settle(reg, timeoutMs);
    } catch {
      ready = false;
    }
    if (!ready) return false;
  }
  reload();
  return true;
}
