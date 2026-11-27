// Dev-only: record Rep-tiles' promo videos — the App Store app previews and a
// desktop cut for posts — of a board being played through.
//
//   npm run store-videos -- [out-dir]
//   (default out dir: ../../app-store-previews/reptiles, gitignored)
//
//   DEVICES=iphone-6.9,ipad,desktop   which to record (default all three)
//   LEVEL=tile11                      the level (default Tile(1,1))
//   FULL=1                            the whole board from empty, however long
//                                     (default: the board's last part, the
//                                     clip within the App Store's 15–30 s)
//   SOUND=0                           a silent track instead of the game's sounds
//   SCHEME=dark                       the dark scheme (default light)
//
// It serves the game as the iPhone app packages it (`VITE_PACKAGED=1`) from a
// Vite dev server — the dev build is what has the `window.__reptiles` seam:
// `plan()`, the board played through move by move (`src/demoPlan.ts`),
// `layPlan(n)`, `clientAt` and `trayAt` — and plays it with real pointer
// input: touches on the iPhone and iPad, the mouse on the desktop, where a
// drawn pointer shows it (a headless browser draws none).
//
// Every frame is rendered, not filmed: the page's clock is Playwright's fake
// one (`page.clock`: timers, requestAnimationFrame, performance.now), each
// frame steps it a thirtieth of a second, every running CSS and Web Animation
// is set to that time, and the frame is screenshot at the output's pixel size
// and piped to ffmpeg. So the video is a smooth 30 fps whatever the machine.
// Sound is rendered the same way: `AudioContext` is an `OfflineAudioContext`
// whose clock is the page's, so every sound the game plays lands in it on
// its frame, and it is rendered at the end and muxed in.
//
// The sizes are App Store Connect's app preview sizes, and 1080p:
//
//   iphone-6.9  6.9"/6.5" display  886 x 1920   (443 x 960 pt @2, portrait)
//   ipad        13" display        1200 x 1600  (1032 x 1376 pt, portrait)
//   desktop     posts (Reddit…)    1920 x 1080  (1280 x 720 @1.5, a mouse)
//
// An app preview is 15 to 30 seconds, H.264 at up to 30 fps with a stereo AAC
// track; these are all of that. Needs ffmpeg on the PATH (`brew install
// ffmpeg`).

import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium, type Browser, type CDPSession, type Page } from "@playwright/test";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const APP = path.resolve(HERE, "..");
const PORT = 4184;
const BASE = `http://localhost:${PORT}/`;
const FPS = 30;
/** The App Store's longest app preview, with a little to spare. */
const MAX_SECONDS = 29.5;
const SAMPLE_RATE = 48000;

type XY = [number, number];

interface Device {
  key: string;
  viewport: { width: number; height: number };
  scale: number;
  /** The video's size: the viewport at `scale`, to the pixel. */
  out: { width: number; height: number };
  /** Touches (an iPhone or iPad), or a mouse with a drawn pointer. */
  touch: boolean;
  /** What BridgeViewController.swift tells the page it runs on. */
  native?: "phone" | "pad";
  /** The device's safe-area insets, in points (see make-store-screenshots.mts). */
  safe: { top: number; bottom: number };
}

// prettier-ignore
const DEVICES: Device[] = [
  { key: "iphone-6.9", viewport: { width: 443, height: 960 }, scale: 2, out: { width: 886, height: 1920 }, touch: true, native: "phone", safe: { top: 62, bottom: 34 } },
  { key: "ipad", viewport: { width: 1032, height: 1376 }, scale: 1200 / 1032, out: { width: 1200, height: 1600 }, touch: true, native: "pad", safe: { top: 24, bottom: 20 } },
  { key: "desktop", viewport: { width: 1280, height: 720 }, scale: 1.5, out: { width: 1920, height: 1080 }, touch: false, safe: { top: 0, bottom: 0 } },
];

/** A move, as the seam's `plan()` gives it. */
interface Move {
  kind: number;
  flip: boolean;
  turns: number;
  at: XY;
}

// The pace, in milliseconds: a person's, a little brisk.
const T = {
  intro: 800,
  /** The pointer travelling to a control or a tray tile (a finger: a pause). */
  travel: 380,
  fingerTravel: 200,
  /** A press of a control held down, and the gap to the next press. */
  press: 70,
  between: 250,
  /** After the last press, before the tile is picked up. */
  settle: 160,
  /** A tile held before it moves, its drag, and held over its spot. */
  lift: 100,
  drag: 560,
  aim: 100,
  /** After a drop. */
  after: 150,
  /** The finished board: the confetti and the win panel. */
  outro: 3200,
};

function moveMs(move: Move, touch: boolean): number {
  const travel = touch ? T.fingerTravel : T.travel;
  const presses = Math.abs(move.turns) + (move.flip ? 1 : 0);
  const pressing = presses === 0 ? 0 : travel + presses * (T.press + T.between) + T.settle;
  return pressing + travel + T.lift + T.drag + T.aim + T.after;
}

function pick<T extends { key: string }>(all: T[], env: string | undefined): T[] {
  if (!env) return all;
  const wanted = new Set(env.split(",").map((s) => s.trim()));
  return all.filter((x) => wanted.has(x.key));
}

async function waitForServer(url: string): Promise<void> {
  for (let i = 0; i < 120; i++) {
    try {
      if ((await fetch(url)).ok) return;
    } catch {
      /* not up yet */
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`dev server never answered at ${url}`);
}

const ease = (t: number): number => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);

/** The page's side of the recording: the sound captured offline, and — on the
 * desktop — a drawn mouse pointer. Runs before the game's own scripts. */
function pageSetup({ sound, cursor }: { sound: boolean; cursor: boolean }): void {
  const w = window as unknown as Record<string, unknown>;
  if (sound) {
    // One OfflineAudioContext for the whole video, its clock the page's
    // (faked) one from the first frame: @tiling/sound schedules each voice at
    // currentTime, so it lands on the frame it was played on.
    let shared: OfflineAudioContext | null = null;
    let proxy: unknown = null;
    const make = (): unknown => {
      if (proxy) return proxy;
      const seconds = (w["__videoSeconds"] as number | undefined) ?? 120;
      shared = new OfflineAudioContext({
        numberOfChannels: 2,
        length: Math.ceil(seconds * 48000),
        sampleRate: 48000,
      });
      w["__videoAudio"] = shared;
      proxy = new Proxy(shared, {
        get(target, prop) {
          if (prop === "currentTime") {
            const t0 = w["__videoT0"] as number | undefined;
            return t0 === undefined ? 0 : Math.max(0, (performance.now() - t0) / 1000);
          }
          if (prop === "state") return "running";
          if (prop === "resume" || prop === "suspend" || prop === "close")
            return () => Promise.resolve();
          const value = Reflect.get(target, prop, target) as unknown;
          return typeof value === "function" ? value.bind(target) : value;
        },
      });
      return proxy;
    };
    const Fake = function (): unknown {
      return make();
    };
    w["AudioContext"] = Fake;
    w["webkitAudioContext"] = Fake;
  }
  if (!cursor) return;
  // A macOS-like arrow, its tip on the pointer; while a button is down, a
  // soft disc under it, and each press sends a ring out.
  const arrow =
    '<svg width="26" height="38" viewBox="0 0 13 19" xmlns="http://www.w3.org/2000/svg">' +
    '<path d="M1 1 L1 15.5 L4.6 12.2 L7.1 18 L9.6 16.9 L7.2 11.3 L12 11.3 Z" ' +
    'fill="#111" stroke="#fff" stroke-width="1.1" stroke-linejoin="round"/></svg>';
  const install = (): void => {
    const style = document.createElement("style");
    style.textContent = `
      #video-cursor { position: fixed; left: 0; top: 0; z-index: 2147483647;
        pointer-events: none; will-change: transform; }
      #video-cursor svg { position: absolute; left: -2px; top: -2px;
        filter: drop-shadow(0 1px 1.5px rgba(0,0,0,.35)); transition: none; }
      #video-cursor .disc { position: absolute; left: -17px; top: -17px; width: 34px;
        height: 34px; border-radius: 50%; background: rgba(40,40,40,.16);
        border: 1.5px solid rgba(40,40,40,.28); opacity: 0; }
      #video-cursor.down .disc { opacity: 1; }
      #video-cursor .ring { position: absolute; left: -17px; top: -17px; width: 34px;
        height: 34px; border-radius: 50%; border: 2.5px solid rgba(40,40,40,.5); }`;
    document.head.append(style);
    const el = document.createElement("div");
    el.id = "video-cursor";
    el.innerHTML = `<div class="disc"></div>${arrow}`;
    el.style.transform = "translate(-100px, -100px)";
    document.documentElement.append(el);
    const at = (e: PointerEvent): void => {
      el.style.transform = `translate(${e.clientX}px, ${e.clientY}px)`;
    };
    window.addEventListener("pointermove", at, { capture: true, passive: true });
    window.addEventListener(
      "pointerdown",
      (e) => {
        at(e);
        el.classList.add("down");
        const ring = document.createElement("div");
        ring.className = "ring";
        el.prepend(ring);
        ring
          .animate(
            [
              { transform: "scale(0.5)", opacity: 0.9 },
              { transform: "scale(1.7)", opacity: 0 },
            ],
            { duration: 420, easing: "ease-out", fill: "forwards" },
          )
          .finished.then(() => ring.remove())
          .catch(() => ring.remove());
      },
      { capture: true, passive: true },
    );
    window.addEventListener("pointerup", () => el.classList.remove("down"), {
      capture: true,
      passive: true,
    });
  };
  if (document.head) install();
  else document.addEventListener("DOMContentLoaded", install);
}

/** Drives one page, frame by frame, into ffmpeg. */
class Recorder {
  private frame = 0;
  private time = 0;
  private pointer: XY;
  private down = false;

  constructor(
    private page: Page,
    private cdp: CDPSession,
    private device: Device,
    private ffmpeg: ChildProcess,
  ) {
    this.pointer = [device.viewport.width * 0.62, device.viewport.height * 0.55];
  }

  /** Show the pointer where it rests before anything happens. */
  async start(): Promise<void> {
    if (!this.device.touch) await this.send("move", this.pointer);
  }

  get seconds(): number {
    return this.frame / FPS;
  }

  /** One frame: the clock a thirtieth of a second on, every animation set to
   * it, and the screen into the video. */
  async step(): Promise<void> {
    const next = Math.round(((this.frame + 1) * 1000) / FPS);
    await this.page.clock.runFor(next - this.time);
    this.time = next;
    this.frame++;
    await this.page.evaluate(() => {
      const w = window as unknown as { __videoAnims?: WeakMap<Animation, number> };
      const seen = (w.__videoAnims ??= new WeakMap());
      const now = performance.now();
      for (const a of document.getAnimations()) {
        if (!seen.has(a)) {
          seen.set(a, now);
          a.pause();
        }
        a.currentTime = now - seen.get(a)!;
      }
    });
    // Straight from the DevTools protocol, PNG compressed for speed: Playwright's
    // own screenshot takes ten times as long here.
    const { data } = (await this.cdp.send("Page.captureScreenshot", {
      format: "png",
      optimizeForSpeed: true,
    } as never)) as { data: string };
    const png = Buffer.from(data, "base64");
    const stdin = this.ffmpeg.stdin!;
    if (!stdin.write(png)) await new Promise((r) => stdin.once("drain", r));
  }

  async wait(ms: number): Promise<void> {
    const until = this.frame + Math.round((ms * FPS) / 1000);
    while (this.frame < until) await this.step();
  }

  private async send(type: "move" | "down" | "up", [x, y]: XY): Promise<void> {
    if (this.device.touch) {
      const kind = type === "down" ? "touchStart" : type === "up" ? "touchEnd" : "touchMove";
      if (type === "move" && !this.down) return;
      await this.cdp.send("Input.dispatchTouchEvent", {
        type: kind,
        touchPoints: type === "up" ? [] : [{ x, y, id: 0, radiusX: 8, radiusY: 8, force: 1 }],
      });
    } else if (type === "move") await this.page.mouse.move(x, y);
    else if (type === "down") await this.page.mouse.down();
    else await this.page.mouse.up();
  }

  /** The pointer to `to` over `ms`, eased, bowed a little off the straight
   * line as a hand moves; a finger off the glass just goes there. */
  async moveTo(to: XY, ms: number, bow = 0.08): Promise<void> {
    const from = this.pointer;
    if (this.device.touch && !this.down) {
      this.pointer = to;
      await this.wait(ms);
      return;
    }
    const frames = Math.max(1, Math.round((ms * FPS) / 1000));
    const [dx, dy] = [to[0] - from[0], to[1] - from[1]];
    for (let i = 1; i <= frames; i++) {
      const t = ease(i / frames);
      const off = Math.sin(Math.PI * t) * bow;
      const p: XY = [from[0] + dx * t - dy * off, from[1] + dy * t + dx * off];
      await this.send("move", p);
      this.pointer = p;
      await this.step();
    }
    this.pointer = to;
  }

  async press(): Promise<void> {
    if (this.device.touch) {
      this.down = true;
      await this.send("down", this.pointer);
    } else {
      await this.send("move", this.pointer);
      await this.send("down", this.pointer);
      this.down = true;
    }
  }

  async release(): Promise<void> {
    await this.send("up", this.pointer);
    this.down = false;
  }

  async tap(at: XY, travel: number): Promise<void> {
    await this.moveTo(at, travel);
    await this.press();
    await this.wait(T.press);
    await this.release();
  }
}

/** The middle of a control on screen: `[data-turn="1"]`, `[data-flip]`. */
async function controlAt(page: Page, selector: string): Promise<XY> {
  const box = await page.locator(`svg.board ${selector} .knob-face`).boundingBox();
  if (!box) throw new Error(`no control ${selector} on screen`);
  return [box.x + box.width / 2, box.y + box.height / 2];
}

function encoder(file: string, device: Device): ChildProcess {
  const { width, height } = device.out;
  // prettier-ignore
  return spawn("ffmpeg", [
    "-y", "-loglevel", "error",
    "-f", "image2pipe", "-framerate", String(FPS), "-c:v", "png", "-i", "-",
    "-vf", `scale=${width}:${height}:flags=lanczos,format=yuv420p`,
    "-c:v", "libx264", "-preset", "slow", "-crf", "16", "-profile:v", "high",
    "-r", String(FPS), "-movflags", "+faststart",
    file,
  ], { stdio: ["pipe", "inherit", "inherit"] });
}

function finished(child: ChildProcess): Promise<void> {
  return new Promise((resolve, reject) => {
    child.on("error", reject);
    child.on("close", (code) =>
      code === 0 ? resolve() : reject(new Error(`ffmpeg exited with ${code}`)),
    );
  });
}

function wav(pcm: Int16Array, channels: number): Buffer {
  const data = Buffer.from(pcm.buffer, pcm.byteOffset, pcm.byteLength);
  const head = Buffer.alloc(44);
  head.write("RIFF", 0);
  head.writeUInt32LE(36 + data.length, 4);
  head.write("WAVEfmt ", 8);
  head.writeUInt32LE(16, 16);
  head.writeUInt16LE(1, 20);
  head.writeUInt16LE(channels, 22);
  head.writeUInt32LE(SAMPLE_RATE, 24);
  head.writeUInt32LE(SAMPLE_RATE * channels * 2, 28);
  head.writeUInt16LE(channels * 2, 32);
  head.writeUInt16LE(16, 34);
  head.write("data", 36);
  head.writeUInt32LE(data.length, 40);
  return Buffer.concat([head, data]);
}

/** The sound the page played, rendered: 16-bit stereo PCM, or null where
 * nothing made an AudioContext (no sound was played). */
async function renderSound(page: Page, seconds: number): Promise<Int16Array | null> {
  const base64 = await page.evaluate(async (seconds) => {
    const ctx = (window as unknown as { __videoAudio?: OfflineAudioContext }).__videoAudio;
    if (!ctx) return null;
    const buffer = await ctx.startRendering();
    const frames = Math.min(buffer.length, Math.ceil(seconds * buffer.sampleRate));
    const left = buffer.getChannelData(0);
    const right = buffer.numberOfChannels > 1 ? buffer.getChannelData(1) : left;
    const out = new Int16Array(frames * 2);
    for (let i = 0; i < frames; i++) {
      out[2 * i] = Math.max(-1, Math.min(1, left[i]!)) * 32767;
      out[2 * i + 1] = Math.max(-1, Math.min(1, right[i]!)) * 32767;
    }
    let s = "";
    const bytes = new Uint8Array(out.buffer);
    for (let i = 0; i < bytes.length; i += 0x8000)
      s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    return btoa(s);
  }, seconds);
  if (!base64) return null;
  const bytes = Buffer.from(base64, "base64");
  return new Int16Array(bytes.buffer, bytes.byteOffset, bytes.byteLength / 2);
}

async function record(
  browser: Browser,
  device: Device,
  level: string,
  out: string,
  opts: { full: boolean; sound: boolean; scheme: string },
): Promise<void> {
  const context = await browser.newContext({
    viewport: device.viewport,
    deviceScaleFactor: device.scale,
    hasTouch: device.touch,
    isMobile: device.native === "phone",
    reducedMotion: "no-preference",
  });
  await context.addInitScript(
    ({ native, scheme }) => {
      window.localStorage.setItem("rep-tiles.settings", JSON.stringify({ scheme }));
      window.localStorage.setItem("rep-tiles.tutorial", JSON.stringify({ seen: true }));
      if (native) (window as { reptilesDevice?: string }).reptilesDevice = native;
    },
    { native: device.native ?? null, scheme: opts.scheme },
  );
  await context.addInitScript(pageSetup, { sound: opts.sound, cursor: !device.touch });
  const page = await context.newPage();
  const cdp = await context.newCDPSession(page);
  if (device.safe.top || device.safe.bottom)
    await cdp.send(
      "Emulation.setSafeAreaInsetsOverride" as never,
      {
        insets: { top: device.safe.top, bottom: device.safe.bottom, left: 0, right: 0 },
      } as never,
    );
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  // Installed and paused: from here on the page's time moves only by runFor.
  await page.clock.install({ time: new Date("2026-01-01T12:00:00Z") });
  await page.clock.pauseAt(new Date("2026-01-01T12:00:01Z"));
  await page.goto(`${BASE}?level=${level}`);
  // The fake clock runs only when told: step it until the board is up.
  for (let i = 0; i < 200; i++) {
    await page.clock.runFor(100);
    if (await page.locator("body[data-ready] svg.board path.region").count()) break;
    await new Promise((r) => setTimeout(r, 50));
  }
  await page.clock.runFor(500);

  const moves = await page.evaluate(() => (window as any).__reptiles.plan() as Move[]);
  if (moves.length === 0) throw new Error(`${level}: no plan (is the level's board up?)`);
  // Lay as much off-camera as keeps the clip within the App Store's limit.
  let skip = 0;
  if (!opts.full) {
    const budget = (MAX_SECONDS * 1000 - T.intro - T.outro) * 0.98;
    let total = moves.reduce((sum, m) => sum + moveMs(m, device.touch), 0);
    while (total > budget && skip < moves.length - 1) total -= moveMs(moves[skip++]!, device.touch);
  }
  const played = moves.slice(skip);
  const seconds =
    (T.intro + played.reduce((sum, m) => sum + moveMs(m, device.touch), 0) + T.outro) / 1000 + 1;
  await page.evaluate(
    ({ skip, seconds }) => {
      const w = window as any;
      w.__videoSeconds = seconds;
      if (skip > 0) w.__reptiles.layPlan(skip);
    },
    { skip, seconds },
  );
  await page.clock.runFor(1000);
  await page.evaluate(() => ((window as any).__videoT0 = performance.now()));

  const file = path.join(out, device.key, `${level}.mp4`);
  mkdirSync(path.dirname(file), { recursive: true });
  const silent = `${file}.video.mp4`;
  const ffmpeg = encoder(silent, device);
  const done = finished(ffmpeg);
  const rec = new Recorder(page, cdp, device, ffmpeg);
  const travel = device.touch ? T.fingerTravel : T.travel;

  await rec.start();
  await rec.wait(T.intro);
  for (const move of played) {
    if (move.flip || move.turns !== 0) {
      let first = true;
      if (move.flip) {
        await rec.tap(await controlAt(page, "[data-flip]"), travel);
        await rec.wait(T.between);
        first = false;
      }
      const dir = Math.sign(move.turns);
      for (let i = 0; i < Math.abs(move.turns); i++) {
        await rec.tap(await controlAt(page, `[data-turn="${dir}"]`), first ? travel : 0);
        await rec.wait(T.between);
        first = false;
      }
      await rec.wait(T.settle);
    }
    const from = await page.evaluate((k) => (window as any).__reptiles.trayAt(k) as XY, move.kind);
    const to = await page.evaluate((p) => (window as any).__reptiles.clientAt(p) as XY, move.at);
    await rec.moveTo(from, travel);
    await rec.press();
    await rec.wait(T.lift);
    await rec.moveTo(to, T.drag, 0.06);
    await rec.wait(T.aim);
    await rec.release();
    await rec.wait(T.after);
  }
  await rec.wait(T.outro);
  ffmpeg.stdin!.end();
  await done;

  const won = await page.evaluate(() => (window as any).__reptiles.puzzle.won as boolean);
  if (!won) throw new Error(`${level} on ${device.key}: the board was not finished`);
  if (errors.length > 0) throw new Error(`${level} on ${device.key}: ${errors.join("; ")}`);

  // The sound, or silence: an app preview wants an audio track either way.
  const pcm = opts.sound ? await renderSound(page, rec.seconds) : null;
  const audio = `${file}.wav`;
  writeFileSync(audio, wav(pcm ?? new Int16Array(Math.ceil(rec.seconds * SAMPLE_RATE) * 2), 2));
  // prettier-ignore
  const mux = spawnSync("ffmpeg", [
    "-y", "-loglevel", "error", "-i", silent, "-i", audio,
    "-map", "0:v", "-map", "1:a", "-c:v", "copy",
    "-c:a", "aac", "-b:a", "256k", "-ar", String(SAMPLE_RATE), "-ac", "2",
    "-shortest", "-movflags", "+faststart", file,
  ], { stdio: "inherit" });
  if (mux.status !== 0) throw new Error(`ffmpeg could not mux ${file}`);
  rmSync(silent);
  rmSync(audio);
  console.log(
    `  ${path.relative(process.cwd(), file)}  ${rec.seconds.toFixed(1)} s, ` +
      `${played.length} of ${moves.length} tiles played${pcm ? "" : ", silent"}`,
  );
  await context.close();
}

if (spawnSync("ffmpeg", ["-version"]).status !== 0) {
  console.error("store-videos needs ffmpeg on the PATH (macOS: brew install ffmpeg)");
  process.exit(1);
}
const out = path.resolve(process.argv[2] ?? path.join(APP, "../../app-store-previews/reptiles"));
const devices = pick(DEVICES, process.env.DEVICES);
const level = process.env.LEVEL ?? "tile11";
const opts = {
  full: process.env.FULL === "1",
  sound: process.env.SOUND !== "0",
  scheme: process.env.SCHEME === "dark" ? "dark" : "light",
};

const server = spawn("npx", ["vite", "--port", String(PORT), "--strictPort"], {
  cwd: APP,
  stdio: "ignore",
  env: { ...process.env, VITE_PACKAGED: "1" },
});
try {
  await waitForServer(BASE);
  const browser = await chromium.launch();
  try {
    for (const device of devices) {
      console.log(device.key);
      await record(browser, device, level, out, opts);
    }
  } finally {
    await browser.close();
  }
} finally {
  server.kill();
}
console.log(`wrote ${devices.length} videos to ${out}`);
