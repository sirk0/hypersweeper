import UIKit
import Capacitor
import StoreKit

/// The App Store's rating prompt, for the page's "ask after the third win"
/// (apps/hypersweeper/src/review.ts).
///
/// The page keeps the count and decides when to ask; this only hands the ask
/// to StoreKit. One call:
///
/// - `request`: `AppStore.requestReview(in:)` on the window's scene, then
///   resolves. Whether a sheet actually shows is StoreKit's call — it shows the
///   prompt at most three times a year, never in TestFlight, and never to a
///   player who has turned it off — so the page is told nothing back.
///
/// Registered by `BridgeViewController.capacitorDidLoad`, in the app only: the
/// App Clip is not on the App Store to be rated, and does not compile this
/// file.
@objc(ReviewPlugin)
public class ReviewPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "ReviewPlugin"
    public let jsName = "Review"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "request", returnType: CAPPluginReturnPromise),
    ]

    @objc func request(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            if let scene = self.bridge?.viewController?.view.window?.windowScene {
                AppStore.requestReview(in: scene)
            }
            call.resolve()
        }
    }
}
