import UIKit
import Capacitor

/// Switches the Home Screen icon: the page's App icon setting
/// (apps/hypersweeper/src/appIcon.ts) calls `set` with an alternate icon's name — one of the
/// Icon Composer documents beside this file, listed in the target's
/// `ASSETCATALOG_COMPILER_ALTERNATE_APPICON_NAMES` — or `null` for the primary
/// `AppIcon`. iOS shows its own "You have changed the icon" alert; that is the
/// system's, and not something an app may suppress.
///
/// Registered by `BridgeViewController.capacitorDidLoad`, which also tells the
/// page, before it runs, whether this device can switch at all and which icon
/// it wears now — so the settings row is drawn right without a round trip.
@objc(AppIconPlugin)
public class AppIconPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "AppIconPlugin"
    public let jsName = "AppIcon"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "set", returnType: CAPPluginReturnPromise),
    ]

    @objc func set(_ call: CAPPluginCall) {
        let name = call.getString("name")
        DispatchQueue.main.async {
            let app = UIApplication.shared
            guard app.supportsAlternateIcons else {
                call.reject("Alternate icons are not supported here")
                return
            }
            // Asking for the icon already on would still raise the alert.
            if app.alternateIconName == name {
                call.resolve()
                return
            }
            app.setAlternateIconName(name) { error in
                if let error = error {
                    call.reject(error.localizedDescription)
                } else {
                    call.resolve()
                }
            }
        }
    }
}
