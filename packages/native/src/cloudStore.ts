import { Capacitor, registerPlugin, type PluginListenerHandle } from "@capacitor/core";

// iCloud's key-value store, as a game's App Store app hands it to the page.
//
// The native `CloudRecord` plugin (each game's
// `ios/App/App/CloudRecordPlugin.swift`, `NSUbiquitousKeyValueStore`) is the
// same few string keys on every device signed in to the player's iCloud
// account, kept through a reinstall. It only moves strings: what is kept there
// and how two devices' records merge is the game's own (Hypersweeper's
// `src/cloudRecord.ts`, Rep-tiles' `src/cloudStars.ts`). Everywhere else — the
// website, the PWA, Android, the Electron app, Hypersweeper's App Clip — the
// plugin is not there, `cloudStoreSupported()` is false, and a game's sync
// never starts.
//
// iCloud gives an app 1 MB and 1024 keys.

interface CloudRecordPlugin {
  read(): Promise<{ values: Record<string, string> }>;
  write(options: { values: Record<string, string | null> }): Promise<void>;
  addListener(
    event: "change",
    listener: (change: { keys: string[] }) => void,
  ): Promise<PluginListenerHandle>;
}

/** The plugin's JS half, registered on first use rather than at import, so a
 * game that imports this package for its haptics alone registers nothing. */
let plugin: CloudRecordPlugin | undefined;
function native(): CloudRecordPlugin {
  return (plugin ??= registerPlugin<CloudRecordPlugin>("CloudRecord"));
}

/** Whether this shell keeps anything in iCloud. */
export function cloudStoreSupported(): boolean {
  try {
    return Capacitor.isNativePlatform() && Capacitor.isPluginAvailable("CloudRecord");
  } catch {
    return false;
  }
}

/** Every string the store holds. Reading also asks iCloud for anything newer;
 * what arrives comes later, as a change. */
export async function cloudRead(): Promise<Record<string, string>> {
  const { values } = await native().read();
  return values ?? {};
}

/** Set these keys; a `null` removes one. */
export async function cloudWrite(values: Record<string, string | null>): Promise<void> {
  await native().write({ values });
}

/** Call `listener` whenever iCloud delivers another device's write (or the
 * account changes). Fire and forget: a listener that cannot be added leaves
 * the foreground and launch syncs to do the work. */
export function onCloudChange(listener: (keys: string[]) => void): void {
  void native()
    .addListener("change", (change) => listener(change.keys ?? []))
    .catch(() => {});
}
