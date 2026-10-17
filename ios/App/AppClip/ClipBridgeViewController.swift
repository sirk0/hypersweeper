import UIKit
import WebKit
import StoreKit

/// The App Clip's bridge: the app's own `BridgeViewController` (the device
/// flag, and on an iPad the menu commands), plus the two things that make the
/// same game bundle a clip.
///
/// - It names the one board the clip plays, `window.hypersweeperClip`, before
///   any script runs. The page reads it in `web/src/appClip.ts`: it opens that
///   board straight away, hides the header's back and random buttons, records
///   no achievements or best times, and puts no card up on a win.
///   The board is `HypersweeperClipBoard` in the clip's Info.plist.
/// - It offers the full game. The page posts `won` to the `hypersweeperClip`
///   message handler when a board is won, and this puts up the App Clip
///   `SKOverlay`, Apple's banner for getting the full app; `started` (the next
///   board) takes it down again.
class ClipBridgeViewController: BridgeViewController, WKScriptMessageHandler {
    /// The board the clip plays: a mode key from `data/catalog.json`. A key
    /// the bundle does not know opens the menu instead (appClip.ts), so the
    /// fallback is only for an Info.plist that lost the entry.
    private static let board =
        Bundle.main.object(forInfoDictionaryKey: "HypersweeperClipBoard") as? String ?? "c180"

    override func capacitorDidLoad() {
        super.capacitorDidLoad()
        guard let controller = webView?.configuration.userContentController else { return }
        // A mode key is [a-z0-9]; anything else would not be a board anyway,
        // and must not be able to break out of the string literal.
        let board = Self.board.filter { $0.isASCII && ($0.isLetter || $0.isNumber) }
        controller.addUserScript(
            WKUserScript(source: "window.hypersweeperClip = '\(board)';",
                         injectionTime: .atDocumentStart, forMainFrameOnly: true))
        // Through a weak proxy: the content controller retains its handlers,
        // and the web view (which owns it) is retained by this controller.
        controller.add(WeakMessageHandler(self), name: "hypersweeperClip")
    }

    func userContentController(_ userContentController: WKUserContentController,
                               didReceive message: WKScriptMessage) {
        guard let scene = view.window?.windowScene else { return }
        switch message.body as? String {
        case "won":
            let overlay = SKOverlay(configuration: SKOverlay.AppClipConfiguration(position: .bottom))
            overlay.present(in: scene)
        case "started":
            SKOverlay.dismiss(in: scene)
        default:
            break
        }
    }
}

/// Hands script messages on to a handler without retaining it.
private final class WeakMessageHandler: NSObject, WKScriptMessageHandler {
    private weak var target: WKScriptMessageHandler?

    init(_ target: WKScriptMessageHandler) {
        self.target = target
    }

    func userContentController(_ userContentController: WKUserContentController,
                               didReceive message: WKScriptMessage) {
        target?.userContentController(userContentController, didReceive: message)
    }
}
