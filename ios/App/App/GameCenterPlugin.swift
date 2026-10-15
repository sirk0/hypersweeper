import UIKit
import Capacitor
import GameKit

/// Game Center, for the page's achievements (web/src/gameCenter.ts).
///
/// The page keeps the record of what was won and works out what that earns
/// (web/src/achievements.ts); this only signs the player in and passes the
/// result on. Three calls:
///
/// - `authenticate`: sets `GKLocalPlayer`'s handler and resolves with
///   `{ authenticated }` once Game Center has answered, presenting Apple's
///   sign-in sheet if it asks to. The handler fires again whenever the player
///   signs in or out later (from Settings, say), and each time this posts an
///   `authChange` event, so the page can catch Game Center up then.
/// - `report`: `{ achievements: [{ id, percent }], banner }`. `banner` is
///   whether Game Center shows its completion banner: the page asks for one
///   only for achievements a win just unlocked, never for a catch-up sync.
/// - `showAchievements`: opens Game Center on the achievements page.
///
/// Registered by `BridgeViewController.capacitorDidLoad`, in the app only: the
/// App Clip earns no achievements, and does not compile this file.
@objc(GameCenterPlugin)
public class GameCenterPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "GameCenterPlugin"
    public let jsName = "GameCenter"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "authenticate", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "report", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "showAchievements", returnType: CAPPluginReturnPromise),
    ]

    /// `authenticate` calls waiting for Game Center's first answer.
    private var waiting: [CAPPluginCall] = []
    /// Game Center wants its handler set once; later calls just wait on it.
    private var handlerSet = false

    @objc func authenticate(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            let player = GKLocalPlayer.local
            if player.isAuthenticated {
                call.resolve(["authenticated": true])
                return
            }
            self.waiting.append(call)
            guard !self.handlerSet else { return }
            self.handlerSet = true
            player.authenticateHandler = { [weak self] signIn, _ in
                guard let self = self else { return }
                if let signIn = signIn {
                    // Game Center wants the player to sign in. Its sheet is
                    // the answer; the handler runs again once it is dismissed.
                    self.bridge?.viewController?.present(signIn, animated: true)
                    return
                }
                let authenticated = player.isAuthenticated
                let calls = self.waiting
                self.waiting = []
                for waiting in calls { waiting.resolve(["authenticated": authenticated]) }
                self.notifyListeners("authChange", data: ["authenticated": authenticated])
            }
        }
    }

    @objc func report(_ call: CAPPluginCall) {
        let entries = call.getArray("achievements", JSObject.self) ?? []
        let banner = call.getBool("banner") ?? false
        let achievements: [GKAchievement] = entries.compactMap { entry in
            guard let id = entry["id"] as? String,
                  let percent = (entry["percent"] as? NSNumber)?.doubleValue else { return nil }
            let achievement = GKAchievement(identifier: id)
            achievement.percentComplete = min(100, max(0, percent))
            achievement.showsCompletionBanner = banner
            return achievement
        }
        guard !achievements.isEmpty else {
            call.resolve()
            return
        }
        guard GKLocalPlayer.local.isAuthenticated else {
            call.reject("Not signed in to Game Center")
            return
        }
        // Game Center keeps the highest percentage it has been sent, so
        // reporting progress it already has changes nothing.
        GKAchievement.report(achievements) { error in
            if let error = error {
                call.reject(error.localizedDescription)
            } else {
                call.resolve()
            }
        }
    }

    @objc func showAchievements(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            GKAccessPoint.shared.trigger(state: .achievements) {}
            call.resolve()
        }
    }
}
