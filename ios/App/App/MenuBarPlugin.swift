import UIKit
import Capacitor

/// What the menu bar's File menu offers besides New Game: the difficulties and
/// every board, grouped as the home menu groups them. The page sends it
/// (web/src/menuBar.ts) because the page owns the catalogue. Nothing about the
/// boards is written down here. `AppDelegate.buildMenu` draws it, and
/// `BridgeViewController` checkmarks the difficulty in play.
enum MenuBarModel {
    /// A submenu (`children`) or a command, whose string goes back to the page
    /// as a `hypersweeper:command` event when it is picked.
    struct Node {
        let title: String
        let command: String?
        let children: [Node]
        let inline: Bool

        init?(_ object: JSObject) {
            guard let title = object["title"] as? String else { return nil }
            self.title = title
            command = object["command"] as? String
            children = (object["children"] as? [JSObject] ?? []).compactMap(Node.init)
            inline = object["inline"] as? Bool ?? false
        }
    }

    static var items: [Node] = []
    static var difficulties: [(key: String, label: String)] = []
    static var difficulty = ""
}

/// Registered by `BridgeViewController.capacitorDidLoad` in the app only: the
/// App Clip opens one board and its menu bar (`ClipAppDelegate`) leads nowhere
/// else.
@objc(MenuBarPlugin)
public class MenuBarPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "MenuBarPlugin"
    public let jsName = "MenuBar"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "setMenu", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "setDifficulty", returnType: CAPPluginReturnPromise),
    ]

    @objc func setMenu(_ call: CAPPluginCall) {
        let items = (call.getArray("items") as? [JSObject] ?? []).compactMap(MenuBarModel.Node.init)
        let difficulties = (call.getArray("difficulties") as? [JSObject] ?? []).compactMap {
            (d: JSObject) -> (key: String, label: String)? in
            guard let key = d["key"] as? String, let label = d["label"] as? String else { return nil }
            return (key, label)
        }
        let difficulty = call.getString("difficulty") ?? ""
        DispatchQueue.main.async {
            MenuBarModel.items = items
            MenuBarModel.difficulties = difficulties
            MenuBarModel.difficulty = difficulty
            UIMenuSystem.main.setNeedsRebuild()
            call.resolve()
        }
    }

    @objc func setDifficulty(_ call: CAPPluginCall) {
        let key = call.getString("key") ?? ""
        DispatchQueue.main.async {
            MenuBarModel.difficulty = key
            // Only the checkmark moves, which `validate` re-reads.
            UIMenuSystem.main.setNeedsRevalidate()
            call.resolve()
        }
    }
}
