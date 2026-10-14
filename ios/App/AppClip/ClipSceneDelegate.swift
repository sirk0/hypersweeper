import UIKit
import Capacitor

/// The App Clip's scene: the app's `SceneDelegate` with the clip's bridge in
/// place of the app's. An App Clip is launched by an invocation (the App Store
/// card, an App Clip link), which arrives as a user activity on the scene —
/// handed on to Capacitor like the app's own, though the clip has nothing to
/// read from it yet: it always plays one board.
class ClipSceneDelegate: UIResponder, UIWindowSceneDelegate {
    var window: UIWindow?

    func scene(_ scene: UIScene, willConnectTo session: UISceneSession,
               options connectionOptions: UIScene.ConnectionOptions) {
        guard let windowScene = scene as? UIWindowScene else { return }
        // The same floor as the app (SceneDelegate.swift), for a resizable
        // iPad window.
        windowScene.sizeRestrictions?.minimumSize = CGSize(width: 375, height: 560)

        window = UIWindow(windowScene: windowScene)
        window?.rootViewController = ClipBridgeViewController()
        window?.makeKeyAndVisible()

        SceneDelegateProxy.shared.scene(scene, willConnectTo: session, options: connectionOptions)
    }

    func scene(_ scene: UIScene, openURLContexts URLContexts: Set<UIOpenURLContext>) {
        SceneDelegateProxy.shared.scene(scene, openURLContexts: URLContexts)
    }

    func scene(_ scene: UIScene, continue userActivity: NSUserActivity) {
        SceneDelegateProxy.shared.scene(scene, continue: userActivity)
    }
}
