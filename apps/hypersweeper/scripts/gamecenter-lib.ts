// The Game Center achievement list, as App Store Connect is told about it.
//
// `src/achievements.ts` derives the achievements from the catalogue, so a new
// tiling adds two of them without anyone typing a line. Game Center cannot work
// that way: its list is registered in App Store Connect, and once an
// achievement is live there its id and points are permanent and it cannot be
// deleted. So the list Game Center knows is a committed file,
// `apps/hypersweeper/ios/GameCenter/achievements.json`, generated from `GAME_CENTER_ACHIEVEMENTS`
// by `scripts/make-gamecenter.mts`, beside one badge image per achievement.
//
// `tests/unit/gameCenterManifest.test.ts` regenerates the JSON and fails on any
// difference, so the catalogue cannot grow an achievement Game Center has not
// been told about: the diff is where somebody decides to register it.
//
// The field names are App Store Connect's own (the API's
// `gameCenterAchievements` and `gameCenterAchievementLocalizations`
// attributes), so the file reads the same as the form it is typed into, and an
// upload script could send it as it stands.
import path from "node:path";
import { fileURLToPath } from "node:url";

import { ACHIEVEMENTS_BY_ID, GAME_CENTER_ACHIEVEMENTS } from "../src/achievements";

const HERE = path.dirname(fileURLToPath(import.meta.url));

export const GAME_CENTER_DIR = path.resolve(HERE, "../ios/GameCenter");
export const MANIFEST_PATH = path.join(GAME_CENTER_DIR, "achievements.json");

/** App Store Connect's achievement image: a square this many pixels, RGB. */
export const IMAGE_PX = 1024;

/** The one localization the game has. */
export const LOCALE = "en-US";

export interface ManifestLocalization {
  name: string;
  beforeEarnedDescription: string;
  afterEarnedDescription: string;
  /** Relative to `GAME_CENTER_DIR`. */
  image: string;
}

/** A ring drawn around an image's badge. A group's badge is its menu icon, the
 * same picture the menu row shows; Game Center shows the images on their own,
 * with no list beside them to say "win all of these". So every "win all of a
 * group" achievement wears a ring, and the whole catalogue a ring of another
 * colour. */
export type Ring = "complete" | "catalogue";

function ringOf(id: string): Ring | null {
  const a = ACHIEVEMENTS_BY_ID.get(id);
  if (!a) return null;
  if (a.group === "grand") return "catalogue";
  return id.startsWith(`${a.group}-all:`) ? "complete" : null;
}

export interface ManifestAchievement {
  /** The Achievement ID. Permanent once created. */
  vendorIdentifier: string;
  /** App Store Connect's internal name. The app's own id: unique, and what
   * the code calls it. */
  referenceName: string;
  /** Permanent once the achievement is live. */
  points: number;
  /** Not hidden: the list is the point of the feature. */
  showBeforeEarned: boolean;
  repeatable: boolean;
  localizations: Record<string, ManifestLocalization>;
  /** The `ui/icons.ts` key the image is drawn from. */
  icon: string;
  /** The ring around it, if any. */
  ring: Ring | null;
}

export interface Manifest {
  count: number;
  points: number;
  achievements: ManifestAchievement[];
}

/** Where an achievement's image lives, relative to `GAME_CENTER_DIR`. */
export function imagePath(vendorIdentifier: string): string {
  return `images/${vendorIdentifier}.png`;
}

export function buildManifest(): Manifest {
  const achievements = GAME_CENTER_ACHIEVEMENTS.map((a): ManifestAchievement => ({
    vendorIdentifier: a.gameCenterId,
    referenceName: a.id,
    points: a.points,
    showBeforeEarned: true,
    repeatable: false,
    localizations: {
      [LOCALE]: {
        name: a.title,
        beforeEarnedDescription: a.brief,
        afterEarnedDescription: a.done,
        image: imagePath(a.gameCenterId),
      },
    },
    icon: a.icon,
    ring: ringOf(a.id),
  }));
  return {
    count: achievements.length,
    points: achievements.reduce((sum, a) => sum + a.points, 0),
    achievements,
  };
}

/** The manifest exactly as it is committed. */
export function manifestJson(): string {
  return `${JSON.stringify(buildManifest(), null, 2)}\n`;
}
