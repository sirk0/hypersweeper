import Foundation
import Capacitor

/// iCloud's key-value store, for the page's record (web/src/cloudRecord.ts).
///
/// The best times and the achievement record live in the page's
/// `localStorage`, which is one device's and goes with the app when it is
/// deleted. `NSUbiquitousKeyValueStore` is the same few keys on every device
/// signed in to the player's iCloud account, and survives a reinstall, so the
/// page mirrors its record here and merges back whatever the other devices
/// wrote. The merging is all the page's; this only moves strings. Three calls:
///
/// - `read`: `{ values: { key: string } }`, every string the store holds.
/// - `write`: `{ values: { key: string | null } }`; `null` removes the key.
/// - a `change` event, `{ keys: [string] }`, whenever iCloud delivers another
///   device's write (or the account changes), so the page can merge it.
///
/// iCloud signed out, or the capability missing, is not an error: the store
/// then simply never syncs, and `read` returns what this device wrote.
///
/// Registered by `BridgeViewController.capacitorDidLoad`, in the app only: the
/// App Clip keeps no record, and does not compile this file.
@objc(CloudRecordPlugin)
public class CloudRecordPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "CloudRecordPlugin"
    public let jsName = "CloudRecord"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "read", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "write", returnType: CAPPluginReturnPromise),
    ]

    private let store = NSUbiquitousKeyValueStore.default

    override public func load() {
        NotificationCenter.default.addObserver(
            self,
            selector: #selector(changedExternally(_:)),
            name: NSUbiquitousKeyValueStore.didChangeExternallyNotification,
            object: store)
        // Asks iCloud for anything newer than what is cached on the device;
        // what arrives comes in as a change notification.
        store.synchronize()
    }

    deinit {
        NotificationCenter.default.removeObserver(self)
    }

    @objc func read(_ call: CAPPluginCall) {
        // The page reads at launch, after a win and on coming back to the
        // foreground: each is a good moment to ask iCloud for anything newer.
        // It does not wait for it — what arrives comes as a change event.
        store.synchronize()
        var values: [String: String] = [:]
        for (key, value) in store.dictionaryRepresentation {
            if let text = value as? String { values[key] = text }
        }
        call.resolve(["values": values])
    }

    @objc func write(_ call: CAPPluginCall) {
        guard let values = call.getObject("values") else {
            call.resolve()
            return
        }
        for (key, value) in values {
            if let text = value as? String {
                store.set(text, forKey: key)
            } else {
                store.removeObject(forKey: key)
            }
        }
        store.synchronize()
        call.resolve()
    }

    @objc private func changedExternally(_ note: Notification) {
        let keys = note.userInfo?[NSUbiquitousKeyValueStoreChangedKeysKey] as? [String] ?? []
        notifyListeners("change", data: ["keys": keys])
    }
}
