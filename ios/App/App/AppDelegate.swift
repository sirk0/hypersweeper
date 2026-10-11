import UIKit
import Capacitor

@UIApplicationMain
class AppDelegate: UIResponder, UIApplicationDelegate {

    var window: UIWindow?

    func application(_ application: UIApplication, didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?) -> Bool {
        // Override point for customization after application launch.
        return true
    }

    func applicationWillResignActive(_ application: UIApplication) {
        // Sent when the application is about to move from active to inactive state. This can occur for certain types of temporary interruptions (such as an incoming phone call or SMS message) or when the user quits the application and it begins the transition to the background state.
        // Use this method to pause ongoing tasks, disable timers, and invalidate graphics rendering callbacks. Games should use this method to pause the game.
    }

    func applicationDidEnterBackground(_ application: UIApplication) {
        // Use this method to release shared resources, save user data, invalidate timers, and store enough application state information to restore your application to its current state in case it is terminated later.
        // If your application supports background execution, this method is called instead of applicationWillTerminate: when the user quits.
    }

    func applicationWillEnterForeground(_ application: UIApplication) {
        // Called as part of the transition from the background to the active state; here you can undo many of the changes made on entering the background.
    }

    func applicationDidBecomeActive(_ application: UIApplication) {
        // Restart any tasks that were paused (or not yet started) while the application was inactive. If the application was previously in the background, optionally refresh the user interface.
    }

    func applicationWillTerminate(_ application: UIApplication) {
        // Called when the application is about to terminate. Save data if appropriate. See also applicationDidEnterBackground:.
    }

    func application(_ app: UIApplication, open url: URL, options: [UIApplication.OpenURLOptionsKey: Any] = [:]) -> Bool {
        // Called when the app was launched with a url. Feel free to add additional processing here,
        // but if you want the App API to support tracking app url opens, make sure to keep this call
        return ApplicationDelegateProxy.shared.application(app, open: url, options: options)
    }

    func application(_ application: UIApplication, continue userActivity: NSUserActivity, restorationHandler: @escaping ([UIUserActivityRestoring]?) -> Void) -> Bool {
        // Called when the app was launched with an activity, including Universal Links.
        // Feel free to add additional processing here, but if you want the App API to support
        // tracking app url opens, make sure to keep this call
        return ApplicationDelegateProxy.shared.application(application, continue: userActivity, restorationHandler: restorationHandler)
    }

    /// The menu bar on the Mac, and the ⌘ shortcuts iPadOS shows for a hardware
    /// keyboard. Each command goes to the page through `BridgeViewController`,
    /// which sits in the responder chain. Menus that have nothing to act on in
    /// a game drawn on a canvas (Format, the text-editing submenus) are removed,
    /// so the bar doesn't offer items that do nothing.
    override func buildMenu(with builder: UIMenuBuilder) {
        super.buildMenu(with: builder)
        guard builder.system == .main else { return }

        for menu: UIMenu.Identifier in [.format, .toolbar, .newScene, .spelling,
                                        .substitutions, .transformations, .speech] {
            builder.remove(menu: menu)
        }

        let newGame = UIKeyCommand(title: "New Game", action: #selector(BridgeViewController.newGame(_:)),
                                   input: "n", modifierFlags: .command)
        builder.insertChild(UIMenu(options: .displayInline, children: [newGame]), atStartOfMenu: .file)

        let settings = UIKeyCommand(title: "Settings…", action: #selector(BridgeViewController.openSettings(_:)),
                                    input: ",", modifierFlags: .command)
        let settingsMenu = UIMenu(options: .displayInline, children: [settings])
        if builder.menu(for: .about) != nil {
            builder.insertSibling(settingsMenu, afterMenu: .about)
        } else {
            builder.insertChild(settingsMenu, atStartOfMenu: .application)
        }

        // The default Help item only says that help isn't available.
        let help = UICommand(title: "How to Play", action: #selector(BridgeViewController.openHelp(_:)))
        builder.replaceChildren(ofMenu: .help) { _ in [help] }
    }

    func application(_ application: UIApplication,
                     configurationForConnecting connectingSceneSession: UISceneSession,
                     options: UIScene.ConnectionOptions) -> UISceneConfiguration {

        let config = UISceneConfiguration(name: "Default Configuration", sessionRole: connectingSceneSession.role)
        config.delegateClass = SceneDelegate.self
        return config
    }

}
