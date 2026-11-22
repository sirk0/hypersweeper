import UIKit
import WebKit
import Capacitor

/// Capacitor's bridge view controller, plus what the page needs to know before
/// any of it runs, and the app's own plugins.
class BridgeViewController: CAPBridgeViewController {
    override func capacitorDidLoad() {
        // Tell the page what it runs on. The user agent cannot: an iPad reports
        // a Mac.
        //   reptilesDevice: "phone" or "pad". Only a phone has a Taptic Engine,
        //     so it decides whether Settings offers Haptics
        //     (apps/reptiles/src/haptics.ts, through @tiling/native).
        let device = UIDevice.current.userInterfaceIdiom == .phone ? "phone" : "pad"
        webView?.configuration.userContentController.addUserScript(
            WKUserScript(source: "window.reptilesDevice = '\(device)';",
                         injectionTime: .atDocumentStart, forMainFrameOnly: true))
        // iCloud keeps the stars in step across the player's devices and
        // through a reinstall (apps/reptiles/src/cloudStars.ts), and the App
        // Store's rating prompt is asked once, after the third finished board
        // (apps/reptiles/src/review.ts). Their presence is what the page reads.
        bridge?.registerPluginInstance(CloudRecordPlugin())
        bridge?.registerPluginInstance(ReviewPlugin())
    }
}
