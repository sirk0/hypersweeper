import UIKit
import Capacitor

/// The App Clip's application delegate. The app's own `AppDelegate` is left
/// out of this target because most of it is the Mac menu bar, and a clip runs
/// on an iPhone or an iPad only; what remains is Capacitor's URL forwarding.
/// The scene is `ClipSceneDelegate` (Info.plist's scene manifest).
@main
class ClipAppDelegate: UIResponder, UIApplicationDelegate {
    func application(_ application: UIApplication,
                     didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?) -> Bool {
        return true
    }

    func application(_ app: UIApplication, open url: URL,
                     options: [UIApplication.OpenURLOptionsKey: Any] = [:]) -> Bool {
        return ApplicationDelegateProxy.shared.application(app, open: url, options: options)
    }

    func application(_ application: UIApplication, continue userActivity: NSUserActivity,
                     restorationHandler: @escaping ([UIUserActivityRestoring]?) -> Void) -> Bool {
        return ApplicationDelegateProxy.shared.application(
            application, continue: userActivity, restorationHandler: restorationHandler)
    }
}
