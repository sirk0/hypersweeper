// The macOS (and, incidentally, Linux/Windows) desktop shell for the games in
// apps/ — one game per build.
//
// It is a thin wrapper: the game is a TypeScript app in apps/<game>/, built to
// static files that scripts/stage-desktop.sh copies into `app/` next to this
// file, with the game's packaging.json beside them as `app.json` (config.mjs
// reads both), and served to a single window over the `app://` scheme
// registered below. Nothing here knows about boards or tiles — the window's
// title and colour, and how the smoke run tells the page has painted, come
// from that config — and nothing here talks to the network: a packaged build
// contains every asset it needs, which is the whole point of the bundle: it
// plays on a plane with the wifi off.
//
// Two rules keep it that way, and both are enforced rather than assumed:
//   * the renderer gets no Node (`contextIsolation`, `sandbox`, no preload) —
//     it is the same untrusted web app that runs in a browser tab, so it is
//     treated like one;
//   * every navigation away from `app://` is blocked, and the two external
//     links on the settings page are handed to the system browser instead of
//     being allowed to replace the game with a web page.
import { app, BrowserWindow, Menu, protocol, session, shell } from "electron";
import { readFile, writeFile } from "node:fs/promises";
import { dirname, extname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { loadGame } from "./config.mjs";
import { APP_ORIGIN, APP_SCHEME, resolveAssetPath } from "./serve.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));

/** The built game and its packaging config. `app/` and `app.json` in a
 * packaged build and in a staged local run; apps/<GAME>/dist (GAME defaulting
 * to hypersweeper) is the convenience fallback for `npm start` straight after a
 * plain `VITE_PACKAGED=1 npm run build` in that game's folder. */
const { dist: DIST, packaging: PACKAGING } = loadGame(HERE);

// A game with its own `userDataName` keeps its saved data (localStorage, under
// the same app:// origin every game is served from) in a folder of its own, so
// two games' records never mix. Hypersweeper names none: its folder is where it
// has always been, and moving it would lose its players' best times.
if (PACKAGING.desktop.userDataName) {
  app.setName(PACKAGING.productName);
  app.setPath("userData", join(app.getPath("appData"), PACKAGING.desktop.userDataName));
}

/** `--smoke=<file.png>`: load the app, wait for it to report itself ready,
 * screenshot it and quit. This is how the packaging is verified on a machine
 * that cannot run the .app (CI, or a Linux dev box) — it proves the bundle
 * loads over app:// with no network, which is the property that matters. */
const smokeArg = process.argv.find((a) => a.startsWith("--smoke="));
const SMOKE = smokeArg ? smokeArg.slice("--smoke=".length) : null;
/** `--route=?mode=hexhex&difficulty=easy` — what to open, so a smoke run can
 * shoot a real board (and its renderer) rather than the first screen. A smoke
 * run with no `--route` takes the game's own `desktop.smokeRoute`. */
const routeArg = process.argv.find((a) => a.startsWith("--route="));
const ROUTE = routeArg
  ? routeArg.slice("--route=".length)
  : SMOKE
    ? PACKAGING.desktop.smokeRoute
    : "";

// A privileged scheme, declared before the app is ready: `standard` gives it an
// origin (so localStorage, history.replaceState and root-absolute URLs like
// /fonts/Rubik-Bold.ttf work), `secure` puts it in a secure context, and
// `supportFetchAPI` lets the bundle fetch its own JSON.
protocol.registerSchemesAsPrivileged([
  {
    scheme: APP_SCHEME,
    privileges: { standard: true, secure: true, supportFetchAPI: true },
  },
]);

if (SMOKE) {
  // Headless CI and Xvfb have no GPU; SwiftShader renders the WebGL board in
  // software. The same two switches the Playwright suite launches Chromium
  // with (apps/hypersweeper/playwright.config.ts), so the smoke shot matches its baselines.
  // Only ever set for the smoke run — a real app uses the real GPU.
  app.commandLine.appendSwitch("use-angle", "swiftshader");
  app.commandLine.appendSwitch("enable-unsafe-swiftshader");
  app.commandLine.appendSwitch("disable-gpu-sandbox");
}

/** Content types for everything the build emits. Written out rather than
 * delegating to `net.fetch("file://…")`: in a packaged app the files live
 * inside `app.asar`, which Electron's patched `fs` can read but Chromium's
 * file:// loader cannot — so the bundle is read through `fs` and handed back
 * as a response. A missing type here is a silently unstyled or unparsed
 * asset, so it covers every extension in apps/hypersweeper/dist. */
const MIME = new Map(
  Object.entries({
    ".html": "text/html; charset=utf-8",
    ".js": "text/javascript; charset=utf-8",
    ".mjs": "text/javascript; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".json": "application/json; charset=utf-8",
    ".webmanifest": "application/manifest+json; charset=utf-8",
    ".txt": "text/plain; charset=utf-8",
    ".svg": "image/svg+xml",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".webp": "image/webp",
    ".ico": "image/x-icon",
    ".ttf": "font/ttf",
    ".otf": "font/otf",
    ".woff": "font/woff",
    ".woff2": "font/woff2",
    ".wasm": "application/wasm",
    ".map": "application/json; charset=utf-8",
  }),
);

/** Serve the built app out of `DIST`. */
function registerProtocol() {
  protocol.handle(APP_SCHEME, async (request) => {
    const file = DIST ? resolveAssetPath(request.url, DIST) : null;
    if (!file) return notFound();
    try {
      const body = await readFile(file);
      return new Response(body, {
        headers: {
          "content-type": MIME.get(extname(file).toLowerCase()) ?? "application/octet-stream",
          // Nothing here is fetched twice from anywhere but the disk it is
          // already on, and a stale cache across builds is a real debugging
          // trap, so responses are not cached.
          "cache-control": "no-store",
        },
      });
    } catch {
      return notFound();
    }
  });
}

function notFound() {
  return new Response("Not found", {
    status: 404,
    headers: { "content-type": "text/plain; charset=utf-8" },
  });
}

/** Keep the window on the packaged app; send real links to the real browser. */
function lockDownNavigation(contents) {
  contents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith("https://") || url.startsWith("http://")) {
      void shell.openExternal(url);
    }
    return { action: "deny" };
  });
  contents.on("will-navigate", (event, url) => {
    if (url.startsWith(APP_ORIGIN)) return;
    event.preventDefault();
    if (url.startsWith("https://") || url.startsWith("http://")) {
      void shell.openExternal(url);
    }
  });
  contents.on("will-attach-webview", (event) => event.preventDefault());
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1100,
    height: 820,
    minWidth: 420,
    minHeight: 420,
    title: PACKAGING.productName,
    show: false,
    // The game's boot page colour (its packaging.json), so the window opens in
    // it instead of flashing white before the first frame.
    backgroundColor: PACKAGING.desktop.backgroundColor,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: false,
      // A minesweeper timer must keep time while the window is behind another.
      backgroundThrottling: false,
    },
  });

  lockDownNavigation(win.webContents);
  // Attached before the load starts, so an error thrown during boot — the
  // interesting kind — is not missed.
  if (SMOKE) watchConsole(win.webContents, smokeFailures);
  win.once("ready-to-show", () => win.show());
  void win.loadURL(`${APP_ORIGIN}/index.html${ROUTE}`);
  return win;
}

/** The menu bar. Electron's default is close to this, but its Help menu links
 * to electronjs.org — a web page, in an app whose selling point is that it
 * needs no web. So the menu is spelled out: the standard macOS app/edit/window
 * items, plus the view items a game window actually uses. */
function buildMenu() {
  const isMac = process.platform === "darwin";
  const template = [
    ...(isMac
      ? [
          {
            label: app.name,
            submenu: [
              { role: "about" },
              { type: "separator" },
              { role: "services" },
              { type: "separator" },
              { role: "hide" },
              { role: "hideOthers" },
              { role: "unhide" },
              { type: "separator" },
              { role: "quit" },
            ],
          },
        ]
      : []),
    {
      label: "Edit",
      submenu: [
        { role: "undo" },
        { role: "redo" },
        { type: "separator" },
        { role: "cut" },
        { role: "copy" },
        { role: "paste" },
        { role: "selectAll" },
      ],
    },
    {
      label: "View",
      submenu: [
        { role: "reload" },
        { role: "toggleDevTools" },
        { type: "separator" },
        { role: "resetZoom" },
        { role: "zoomIn" },
        { role: "zoomOut" },
        { type: "separator" },
        { role: "togglefullscreen" },
      ],
    },
    {
      label: "Window",
      submenu: isMac
        ? [
            { role: "minimize" },
            { role: "zoom" },
            { type: "separator" },
            { role: "front" },
          ]
        : [{ role: "minimize" }, { role: "close" }],
    },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

/** Wait for the app to say it has painted a board or the menu — `main.ts` sets
 * `body[data-ready]`, the same signal the Playwright suite waits on. */
async function waitForReady(win, timeoutMs = 30_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const ready = await win.webContents.executeJavaScript(
      "!!document.body && document.body.hasAttribute('data-ready')",
    );
    if (ready) return true;
    await new Promise((r) => setTimeout(r, 200));
  }
  return false;
}

/** The smoke run's proof that the app is self-contained: every request the
 * renderer makes is cancelled unless it is one the bundle serves itself, and
 * anything cancelled is reported. If a font, a script or a texture ever starts
 * coming from a URL, this is what says so — on a build machine that has an
 * internet connection and would otherwise never notice. */
function installOfflineGuard(blocked) {
  // The bundle serves itself over app://; the protocol handler reads the files
  // through fs, so no file:// request ever reaches this session.
  const local = (url) =>
    url.startsWith(APP_ORIGIN) ||
    url.startsWith("blob:") ||
    url.startsWith("data:") ||
    url.startsWith("devtools:");
  session.defaultSession.webRequest.onBeforeRequest((details, callback) => {
    if (local(details.url)) return callback({});
    blocked.push(details.url);
    callback({ cancel: true });
  });
}

/** Console errors seen during a smoke run. */
const smokeFailures = [];

/** Record the renderer's console errors. Electron 35 replaced this event's
 * positional arguments with one details object (and a string level in place of
 * the old numeric one); both shapes are read, so the smoke run is not silently
 * blind on either. */
function watchConsole(contents, failures) {
  contents.on("console-message", (...args) => {
    const details =
      args[0] && typeof args[0] === "object" && "message" in args[0]
        ? args[0]
        : { level: args[1], message: args[2] };
    if (details.level === "error" || details.level >= 2) {
      failures.push(String(details.message));
    }
  });
}

async function runSmoke(win, blocked) {
  const failures = smokeFailures;
  const ready = await waitForReady(win);
  if (!ready) {
    console.error("smoke: app never reported ready");
    app.exit(1);
    return;
  }
  // `data-ready` says the app has booted, not that the compositor has drawn
  // it; capturing on that alone shoots an empty page in the app's background
  // colour. Two frames plus a settle, and then the DOM is asked what is
  // actually on screen — a screenshot that turned out blank would otherwise
  // pass unnoticed on a machine where nobody looks at it.
  await win.webContents.executeJavaScript(
    `new Promise((done) => requestAnimationFrame(() =>
       requestAnimationFrame(() => setTimeout(done, 300))))`,
  );
  // The game says what "painted" means for it (packaging.json's
  // desktop.smokePainted: an expression counting what is on screen — menu
  // entries and board cells for Hypersweeper, level cards or a board outline
  // for Rep-tiles). Zero is a blank screen.
  const painted = await win.webContents.executeJavaScript(
    `Number(${PACKAGING.desktop.smokePainted}) || 0`,
  );
  if (painted === 0) {
    failures.push(`nothing rendered: ${PACKAGING.desktop.smokePainted} is 0`);
  }

  const image = await win.webContents.capturePage();
  await writeFile(SMOKE, image.toPNG());
  if (blocked.length) {
    console.error(
      `smoke: the app asked for ${blocked.length} off-bundle URL(s):\n  ` +
        [...new Set(blocked)].join("\n  "),
    );
    app.exit(1);
    return;
  }
  if (failures.length) {
    console.error(`smoke: console errors:\n  ${failures.join("\n  ")}`);
    app.exit(1);
    return;
  }
  console.log(`smoke: ok — no network, ready, screenshot at ${SMOKE}`);
  app.exit(0);
}

app.whenReady().then(async () => {
  if (!DIST) {
    console.error(
      `No built ${PACKAGING.productName} found. Run \`make desktop-build GAME=<game>\` ` +
        "(or scripts/stage-desktop.sh <game>) before starting the shell.",
    );
    app.exit(1);
    return;
  }
  registerProtocol();
  buildMenu();
  const blocked = [];
  if (SMOKE) installOfflineGuard(blocked);
  const win = createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });

  if (SMOKE) await runSmoke(win, blocked);
});

app.on("window-all-closed", () => {
  // macOS apps stay running with no window until ⌘Q; everywhere else, quit.
  if (process.platform !== "darwin") app.quit();
});

// Belt and braces: any renderer that somehow appears is locked down too.
app.on("web-contents-created", (_event, contents) => lockDownNavigation(contents));
