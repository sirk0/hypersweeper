import { Capacitor, registerPlugin, type PluginListenerHandle } from "@capacitor/core";
import { ACHIEVEMENTS, gameCenterId, loadProgress, measureOf, wonModes, type Progress } from "./achievements";

// Game Center, where the App Store builds show achievements.
//
// On an iPhone, an iPad and the Mac App Store app, the achievements are Game
// Center's: its banners announce an unlock and its pages list them, and the
// game's own list, and the unlocks on the win card, are not shown. Everywhere
// else — the website, the PWA, Android, the Electron Mac app — nothing here
// runs and the game's own list is all there is.
//
// What decides it is the shell, not a build flag: the app registers a native
// `GameCenter` plugin (ios/App/App/GameCenterPlugin.swift) and the page checks
// for it. The App Clip does not register it, and earns nothing anyway.
//
// **The record stays the game's.** `achievements.ts` still files every win and
// works out what it earns; Game Center is told the result. That is what lets
// it catch up: at launch, and whenever the player signs in, the whole record is
// sent again, quietly. So a win while offline or signed out, or one from
// before this existed, reaches Game Center without anyone having to replay it,
// and sending something it already has changes nothing — it keeps the highest
// percentage it has been told.
//
// **Banners only for what a win just unlocked.** A catch-up sends dozens of
// achievements a returning player earned long ago, and a banner for each would
// bury the game under them. So a sync asks for none, and a win asks for one
// per achievement it unlocked, at the beat the win card used to say so.
//
// Every call is fire-and-forget: Game Center being slow, offline or signed out
// must never get in the way of the move that reported to it.

interface GameCenterReport {
  /** The Game Center id (`gameCenterId`). */
  id: string;
  /** 0–100. */
  percent: number;
}

interface GameCenterPlugin {
  authenticate(): Promise<{ authenticated: boolean }>;
  report(options: { achievements: GameCenterReport[]; banner: boolean }): Promise<void>;
  showAchievements(): Promise<void>;
  addListener(
    event: "authChange",
    listener: (state: { authenticated: boolean }) => void,
  ): Promise<PluginListenerHandle>;
}

const Native = registerPlugin<GameCenterPlugin>("GameCenter");

/** Whether this shell reports achievements to Game Center — and so whether the
 * game's own list and unlock card stand aside for it. */
export function gameCenterSupported(): boolean {
  try {
    return Capacitor.isNativePlatform() && Capacitor.isPluginAvailable("GameCenter");
  } catch {
    return false;
  }
}

/** Whether Game Center last said the player is signed in. Nothing is sent
 * until it has. */
let signedIn = false;
let started = false;

/** Every achievement the record has any progress on, as Game Center
 * percentages. One the record has not started is left out rather than sent as
 * 0: there is nothing to say about it. */
export function gameCenterProgress(progress: Progress = loadProgress()): GameCenterReport[] {
  const won = wonModes(progress);
  const out: GameCenterReport[] = [];
  for (const a of ACHIEVEMENTS) {
    const { have, need } = measureOf(a, progress, won);
    if (have <= 0 || need <= 0) continue;
    out.push({ id: gameCenterId(a.id), percent: Math.min(100, (100 * have) / need) });
  }
  return out;
}

function send(achievements: GameCenterReport[], banner: boolean): void {
  if (achievements.length === 0) return;
  void Native.report({ achievements, banner }).catch(() => {});
}

/** Game Center answered about the player. Signing in — at launch, or later
 * from the system's settings — is the moment to catch it up. */
function onAuth(authenticated: boolean): void {
  const was = signedIn;
  signedIn = authenticated;
  if (authenticated && !was) send(gameCenterProgress(), false);
}

/** Sign in to Game Center, and send it the record once it says yes. Called
 * once, at launch; a no-op outside the app. */
export function startGameCenter(): void {
  if (started || !gameCenterSupported()) return;
  started = true;
  void Native.addListener("authChange", ({ authenticated }) => onAuth(authenticated)).catch(
    () => {},
  );
  void Native.authenticate()
    .then(({ authenticated }) => onAuth(authenticated))
    .catch(() => {});
}

/** Tell Game Center about a win: a banner for each achievement it unlocked
 * (`unlocked`, the game's own ids from `recordWin`), and the rest of the
 * record's progress quietly beside them. Signed out, it sends nothing — the
 * next sign-in's catch-up carries it, without the banners. */
export function reportUnlocks(unlocked: readonly string[]): void {
  if (!signedIn || !gameCenterSupported()) return;
  const fresh = new Set(unlocked.map(gameCenterId));
  const progress = gameCenterProgress();
  send(
    progress.filter((p) => fresh.has(p.id)),
    true,
  );
  send(
    progress.filter((p) => !fresh.has(p.id)),
    false,
  );
}

/** Send Game Center the whole record again, quietly — after iCloud brought in
 * wins from another device (`cloudRecord.ts`). Signed out, the next sign-in
 * does it. */
export function catchUpGameCenter(): void {
  if (!signedIn || !gameCenterSupported()) return;
  send(gameCenterProgress(), false);
}

/** Open Game Center on its achievements page — Settings' Game Center row. */
export function showGameCenterAchievements(): void {
  void Native.showAchievements().catch(() => {});
}
