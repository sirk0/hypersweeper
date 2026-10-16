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
        //   hypersweeperAltIcons / hypersweeperAppIcon: whether this device can
        //     switch the Home Screen icon, and the alternate one it wears now
        //     (null for the primary) — what Settings' App icon row is drawn
        //     from (web/src/appIcon.ts). The OS is the record of the icon, not
        //     the page's storage.
        #if targetEnvironment(macCatalyst)
        // Not the idiom: a Catalyst app scaled to match iPad reports `.pad`.
        let device = "mac"
        let flags = "window.hypersweeperShell = 'catalyst';"
        #else
        let device = UIDevice.current.userInterfaceIdiom == .phone ? "phone" : "pad"
        let flags = ""
        #endif
        let app = UIApplication.shared
        let icon = app.alternateIconName.map { "'\($0)'" } ?? "null"
        let icons = "window.hypersweeperAltIcons = \(app.supportsAlternateIcons);"
            + " window.hypersweeperAppIcon = \(icon);"
        webView?.configuration.userContentController.addUserScript(
            WKUserScript(source: "window.hypersweeperDevice = '\(device)'; \(flags) \(icons)",
                         injectionTime: .atDocumentStart, forMainFrameOnly: true))
        bridge?.registerPluginInstance(AppIconPlugin())
        // Game Center reports achievements, and the App Clip earns none (its
        // target sets APP_CLIP and leaves the plugin out), so only the app
        // registers it. Its presence is what the page reads to hand the
        // achievements to Game Center (web/src/gameCenter.ts).
        // iCloud keeps the best times and the achievement record in step
        // across the player's devices and through a reinstall
        // (web/src/cloudRecord.ts). The clip keeps no record, so it too is
        // the app's alone.
        #if !APP_CLIP
        bridge?.registerPluginInstance(GameCenterPlugin())
        bridge?.registerPluginInstance(CloudRecordPlugin())
        // The File menu's boards and difficulties: the clip leads nowhere but
        // its one board.
        bridge?.registerPluginInstance(MenuBarPlugin())
        #endif

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
    // Ctrl+. and ⌘. are AppKit's Cancel key. If one reaches the web view and
    // the page leaves it unhandled, WebKit returns it to UIKit, UIKit hands it
    // to AppKit's Cancel handling, and Catalyst's bridge throws rebuilding the
    // event ("Non-Unicode event without Carbon EventRef"), which kills the app.
    // UIKit matches key commands along the responder chain before it delivers a
    // key to the focused view, so these two never reach WebKit. The game has no
    // use for either key. Not in the menu bar: there is nothing to show.
    // (A page-side preventDefault does not help: the crash comes after WebKit
    // reports the key, and a real Ctrl+. still crashed with one in place.)
    override var keyCommands: [UIKeyCommand]? {
        let swallow = #selector(swallowCancelKey(_:))
        return [UIKeyModifierFlags.control, .command].map { flags in
            let command = UIKeyCommand(input: ".", modifierFlags: flags, action: swallow)
            command.wantsPriorityOverSystemBehavior = true
            return command
        }
    }

    @objc private func swallowCancelKey(_ sender: UIKeyCommand) {}
    #endif

    // The menu bar's commands (AppDelegate.buildMenu), handed to the page as a
    // `hypersweeper:command` event, which main.ts acts on.
    @objc func newGame(_ sender: Any?) { sendCommand("new-game") }
    @objc func openSettings(_ sender: Any?) { sendCommand("settings") }
    @objc func openHelp(_ sender: Any?) { sendCommand("help") }

    #if !APP_CLIP
    /// The File menu's boards and difficulties, each carrying the command the
    /// page gave it (MenuBarPlugin.swift, web/src/menuBar.ts). The app's alone,
    /// like the plugin that sends them.
    @objc func menuCommand(_ sender: UICommand) {
        if let name = sender.propertyList as? String { sendCommand(name) }
    }

    /// Checkmarks the difficulty in play.
    override func validate(_ command: UICommand) {
        super.validate(command)
        guard command.action == #selector(menuCommand(_:)),
              let name = command.propertyList as? String,
              name.hasPrefix("difficulty:") else { return }
        command.state = name == "difficulty:\(MenuBarModel.difficulty)" ? .on : .off
    }
    #endif

    private func sendCommand(_ name: String) {
        // Quoted as JSON: the board commands' strings come from the page.
        guard let data = try? JSONSerialization.data(withJSONObject: name, options: .fragmentsAllowed),
              let detail = String(data: data, encoding: .utf8) else { return }
        webView?.evaluateJavaScript(
            "window.dispatchEvent(new CustomEvent('hypersweeper:command',{detail:\(detail)}))")
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
