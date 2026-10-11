import UIKit
import WebKit
import Capacitor

/// Capacitor's bridge view controller, plus one thing it lacks on Mac Catalyst:
/// the trackpad pinch and swipe.
///
/// The game's viewport is `user-scalable=no`, and WebKit only builds the page's
/// `gesture*` events from touches, so a two-finger pinch on a Mac trackpad never
/// reaches the page at all — neither as `gesturechange` nor as `ctrl`+wheel
/// (Chromium's route). UIKit does recognise it, so catch it here and hand it to
/// the page as a `hypersweeper:pinch` event, which `attachControls` turns into a
/// board zoom (and, as the fingers travel, a pan), and so is the two-finger
/// swipe (`hypersweeper:pan`). Only on Catalyst: on a phone the page already gets the pinch
/// from its own two-finger touch points.
class BridgeViewController: CAPBridgeViewController, UIGestureRecognizerDelegate {
    override func capacitorDidLoad() {
        // Tell the page what it runs on before any of it runs. The user agent
        // cannot: an iPad and the Mac app both report a Mac.
        //   hypersweeperDevice: "phone", "pad" or "mac". Only a phone has a
        //     Taptic Engine, so it decides whether Settings offers Haptics
        //     (web/src/haptics.ts).
        //   hypersweeperShell: "catalyst" on the Mac, where the plain wheel is a
        //     two-finger trackpad swipe that pans a zoomed board instead of
        //     zooming it (onWheel in controls.ts).
        #if targetEnvironment(macCatalyst)
        // Not the idiom: a Catalyst app scaled to match iPad reports `.pad`.
        let device = "mac"
        let flags = "window.hypersweeperShell = 'catalyst';"
        #else
        let device = UIDevice.current.userInterfaceIdiom == .phone ? "phone" : "pad"
        let flags = ""
        #endif
        webView?.configuration.userContentController.addUserScript(
            WKUserScript(source: "window.hypersweeperDevice = '\(device)'; \(flags)",
                         injectionTime: .atDocumentStart, forMainFrameOnly: true))

        #if targetEnvironment(macCatalyst)
        let pinch = UIPinchGestureRecognizer(target: self, action: #selector(onPinch(_:)))
        pinch.delegate = self
        pinch.cancelsTouchesInView = false
        webView?.addGestureRecognizer(pinch)

        // A two-finger trackpad swipe is a *scroll*, not a touch. With no touches
        // allowed this recogniser answers scroll events only, so a click-drag
        // stays the page's own pointer drag.
        let scroll = UIPanGestureRecognizer(target: self, action: #selector(onScroll(_:)))
        scroll.allowedScrollTypesMask = .all
        scroll.minimumNumberOfTouches = 0
        scroll.maximumNumberOfTouches = 0
        scroll.delegate = self
        scroll.cancelsTouchesInView = false
        webView?.addGestureRecognizer(scroll)
        #endif
    }

    #if targetEnvironment(macCatalyst)
    @objc private func onPinch(_ pinch: UIPinchGestureRecognizer) {
        guard let webView = webView else { return }
        let phase: String
        switch pinch.state {
        case .began: phase = "start"
        case .changed: phase = "change"
        case .ended, .cancelled, .failed: phase = "end"
        default: return
        }
        let at = pinch.location(in: webView)
        // `scale` is cumulative since the gesture began, like Safari's own.
        let detail = "{phase:'\(phase)',scale:\(pinch.scale),x:\(at.x),y:\(at.y)}"
        webView.evaluateJavaScript(
            "window.dispatchEvent(new CustomEvent('hypersweeper:pinch',{detail:\(detail)}))")
    }

    @objc private func onScroll(_ scroll: UIPanGestureRecognizer) {
        guard let webView = webView else { return }
        let phase: String
        switch scroll.state {
        case .began: phase = "start"
        case .changed: phase = "change"
        case .ended, .cancelled, .failed: phase = "end"
        default: return
        }
        // Deltas, so the page just moves the board by what the fingers moved.
        let t = scroll.translation(in: webView)
        scroll.setTranslation(.zero, in: webView)
        webView.evaluateJavaScript(
            "window.dispatchEvent(new CustomEvent('hypersweeper:pan',{detail:{phase:'\(phase)',dx:\(t.x),dy:\(t.y)}}))")
    }

    func gestureRecognizer(_ gestureRecognizer: UIGestureRecognizer,
                           shouldRecognizeSimultaneouslyWith other: UIGestureRecognizer) -> Bool {
        return true
    }
    #endif
}
