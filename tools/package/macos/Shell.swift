// The Asteria Technology desktop shell for macOS. One small native window around a web app that lives in the bundle
// (Contents/Resources/app). It serves the app from app://local/, gives it native open and save dialogs through
// window.csNative (see brand/host/as-host.js), asks before closing unsaved work, and opens links in the browser.
// The app's name, size and file types come from Info.plist, so Asteria Sprite and Asteria Box share this file.
import Cocoa
import UniformTypeIdentifiers
import WebKit

let info = Bundle.main.infoDictionary ?? [:]
let appName = info["CFBundleName"] as? String ?? "Asteria Technology"
let appRoot = Bundle.main.resourceURL!.appendingPathComponent("app", isDirectory: true)

// ---------------------------------------------------------------- the app's files, served from the bundle
final class Files: NSObject, WKURLSchemeHandler {
    static let types = ["html": "text/html; charset=utf-8", "js": "text/javascript; charset=utf-8", "css": "text/css; charset=utf-8",
                        "json": "application/json", "webmanifest": "application/manifest+json", "png": "image/png", "svg": "image/svg+xml",
                        "ico": "image/x-icon", "woff": "font/woff", "ttf": "font/ttf", "mp3": "audio/mpeg", "wav": "audio/wav", "txt": "text/plain; charset=utf-8"]
    func webView(_ webView: WKWebView, start task: WKURLSchemeTask) {
        guard let url = task.request.url else { return }
        let rel = url.path == "/" || url.path.isEmpty ? "index.html" : String(url.path.dropFirst())
        let file = appRoot.appendingPathComponent(rel).standardizedFileURL
        guard file.path.hasPrefix(appRoot.standardizedFileURL.path), let data = try? Data(contentsOf: file) else {
            task.didFailWithError(NSError(domain: NSURLErrorDomain, code: NSURLErrorFileDoesNotExist)); return
        }
        let type = Files.types[file.pathExtension.lowercased()] ?? "application/octet-stream"
        task.didReceive(HTTPURLResponse(url: url, statusCode: 200, httpVersion: "HTTP/1.1", headerFields: ["Content-Type": type, "Content-Length": String(data.count), "Cache-Control": "no-cache"])!)
        task.didReceive(data)
        task.didFinish()
    }
    func webView(_ webView: WKWebView, stop task: WKURLSchemeTask) {}
}

// What the page sees as window.csNative. Bytes cross as base64; every call returns a promise.
let bridgeJS = """
window.csNative = (function () {
  function b64(u8) { var s = '', k = 0x8000; for (var i = 0; i < u8.length; i += k) s += String.fromCharCode.apply(null, u8.subarray(i, i + k)); return btoa(s); }
  function prep(o) {
    o = Object.assign({}, o || {}); delete o.handle;
    if (o.data instanceof ArrayBuffer) o.data = new Uint8Array(o.data);
    if (o.data instanceof Uint8Array) { o.data = b64(o.data); o.encoding = 'base64'; }
    else if (typeof o.data === 'string' && !o.encoding) o.encoding = 'utf8';
    return o;
  }
  function call(op, o) { return window.webkit.messageHandlers.cs.postMessage({ op: op, o: prep(o) }); }
  return { name: 'macOS',
    open: function (o) { return call('open', o); }, save: function (o) { return call('save', o); },
    writeProject: function (p, d, o) { return call('writeProject', Object.assign({}, o || {}, { path: p, data: d })); },
    readFile: function (p, o) { return call('readFile', Object.assign({}, o || {}, { path: p })); },
    setTitle: function (t) { return call('setTitle', { title: t }); }, setDirty: function (d) { return call('setDirty', { dirty: !!d }); },
    close: function () { return call('close', {}); } };
})();
"""

func extensions(_ o: [String: Any]) -> [String] {
    var out: [String] = []
    for f in o["filters"] as? [[String: Any]] ?? [] {
        for p in f["patterns"] as? [String] ?? [] where p.hasPrefix("*.") { out.append(String(p.dropFirst(2))) }
    }
    return out
}
func readOut(_ url: URL, binary: Bool) -> [String: Any]? {
    guard let data = try? Data(contentsOf: url) else { return nil }
    let text = !binary || ["json", "gpl", "hex", "txt", "md", "csv", "pal", "beepbox"].contains(url.pathExtension.lowercased())
    if text, let s = String(data: data, encoding: .utf8) { return ["name": url.lastPathComponent, "path": url.path, "binary": false, "data": s] }
    return ["name": url.lastPathComponent, "path": url.path, "binary": true, "data": data.base64EncodedString()]
}
func bytes(_ o: [String: Any]) -> Data {
    let d = o["data"] as? String ?? ""
    return o["encoding"] as? String == "base64" ? (Data(base64Encoded: d) ?? Data()) : Data(d.utf8)
}

// ---------------------------------------------------------------- the window
final class Shell: NSObject, NSApplicationDelegate, NSWindowDelegate, WKScriptMessageHandlerWithReply, WKUIDelegate, WKNavigationDelegate {
    var window: NSWindow!
    var web: WKWebView!
    var dirty = false
    var project: URL?
    var pending: [URL] = []
    var loaded = false

    func applicationDidFinishLaunching(_ n: Notification) {
        let config = WKWebViewConfiguration()
        config.setURLSchemeHandler(Files(), forURLScheme: "app")
        config.userContentController.addScriptMessageHandler(self, contentWorld: .page, name: "cs")
        config.userContentController.addUserScript(WKUserScript(source: bridgeJS, injectionTime: .atDocumentStart, forMainFrameOnly: true))
        config.preferences.setValue(true, forKey: "developerExtrasEnabled")
        web = WKWebView(frame: .zero, configuration: config)
        web.uiDelegate = self
        web.navigationDelegate = self
        web.setValue(false, forKey: "drawsBackground")
        window = NSWindow(contentRect: NSRect(x: 0, y: 0, width: 1280, height: 820), styleMask: [.titled, .closable, .miniaturizable, .resizable, .fullSizeContentView], backing: .buffered, defer: false)
        window.title = appName
        window.minSize = NSSize(width: 760, height: 520)
        window.backgroundColor = NSColor(red: 0.078, green: 0.027, blue: 0.031, alpha: 1)
        window.contentView = web
        window.delegate = self
        window.center()
        window.setFrameAutosaveName(appName)
        window.makeKeyAndOrderFront(nil)
        menus()
        web.load(URLRequest(url: URL(string: "app://local/index.html")!))
        NSApp.activate(ignoringOtherApps: true)
    }
    func applicationShouldTerminateAfterLastWindowClosed(_ s: NSApplication) -> Bool { true }
    func application(_ app: NSApplication, open urls: [URL]) { pending += urls; if loaded { deliver() } }
    func deliver() {
        for u in pending {
            guard let f = readOut(u, binary: false), let json = try? JSONSerialization.data(withJSONObject: f), let s = String(data: json, encoding: .utf8) else { continue }
            web.evaluateJavaScript("window.csHost && window.csHost.onOpen && window.csHost.onOpen(\(s))")
        }
        pending = []
    }
    func webView(_ w: WKWebView, didFinish n: WKNavigation!) { loaded = true; DispatchQueue.main.asyncAfter(deadline: .now() + 1.5) { self.deliver() } }

    // unsaved work
    func windowShouldClose(_ s: NSWindow) -> Bool {
        if !dirty { return true }
        let a = NSAlert()
        a.messageText = "Close without saving?"
        a.informativeText = "Your changes will be lost."
        a.addButton(withTitle: "Cancel")
        a.addButton(withTitle: "Close")
        return a.runModal() == .alertSecondButtonReturn
    }
    func applicationShouldTerminate(_ s: NSApplication) -> NSApplication.TerminateReply { windowShouldClose(window) ? .terminateNow : .terminateCancel }

    // links leave the app; the app itself never navigates away
    func webView(_ w: WKWebView, decidePolicyFor a: WKNavigationAction, decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
        if let u = a.request.url, u.scheme != "app", u.scheme != "about", u.scheme != "blob", u.scheme != "data" { NSWorkspace.shared.open(u); decisionHandler(.cancel); return }
        decisionHandler(.allow)
    }
    func webView(_ w: WKWebView, createWebViewWith c: WKWebViewConfiguration, for a: WKNavigationAction, windowFeatures f: WKWindowFeatures) -> WKWebView? {
        if let u = a.request.url { NSWorkspace.shared.open(u) }
        return nil
    }
    func webView(_ w: WKWebView, runJavaScriptAlertPanelWithMessage m: String, initiatedByFrame f: WKFrameInfo, completionHandler: @escaping () -> Void) {
        let a = NSAlert(); a.messageText = m; a.beginSheetModal(for: window) { _ in completionHandler() }
    }
    func webView(_ w: WKWebView, runJavaScriptConfirmPanelWithMessage m: String, initiatedByFrame f: WKFrameInfo, completionHandler: @escaping (Bool) -> Void) {
        let a = NSAlert(); a.messageText = m; a.addButton(withTitle: "OK"); a.addButton(withTitle: "Cancel")
        a.beginSheetModal(for: window) { r in completionHandler(r == .alertFirstButtonReturn) }
    }
    func webView(_ w: WKWebView, runJavaScriptTextInputPanelWithPrompt p: String, defaultText d: String?, initiatedByFrame f: WKFrameInfo, completionHandler: @escaping (String?) -> Void) {
        let a = NSAlert(); a.messageText = p; a.addButton(withTitle: "OK"); a.addButton(withTitle: "Cancel")
        let field = NSTextField(frame: NSRect(x: 0, y: 0, width: 280, height: 24)); field.stringValue = d ?? ""; a.accessoryView = field
        a.beginSheetModal(for: window) { r in completionHandler(r == .alertFirstButtonReturn ? field.stringValue : nil) }
    }
    func webView(_ w: WKWebView, runOpenPanelWith p: WKOpenPanelParameters, initiatedByFrame f: WKFrameInfo, completionHandler: @escaping ([URL]?) -> Void) {
        let panel = NSOpenPanel(); panel.allowsMultipleSelection = p.allowsMultipleSelection
        panel.beginSheetModal(for: window) { r in completionHandler(r == .OK ? panel.urls : nil) }
    }

    // window.csNative
    func userContentController(_ u: WKUserContentController, didReceive m: WKScriptMessage, replyHandler reply: @escaping (Any?, String?) -> Void) {
        guard let body = m.body as? [String: Any], let op = body["op"] as? String else { reply(nil, "bad message"); return }
        let o = body["o"] as? [String: Any] ?? [:]
        switch op {
        case "open":
            let panel = NSOpenPanel()
            let ext = extensions(o)
            if !ext.isEmpty { panel.allowedContentTypes = ext.compactMap { UTType(filenameExtension: $0) } }
            panel.beginSheetModal(for: window) { r in
                guard r == .OK, let url = panel.url else { reply(NSNull(), nil); return }
                reply(readOut(url, binary: o["binary"] as? Bool ?? false) ?? NSNull(), nil)
            }
        case "save":
            let panel = NSSavePanel()
            panel.nameFieldStringValue = o["suggestedName"] as? String ?? "Untitled"
            panel.canCreateDirectories = true
            panel.beginSheetModal(for: window) { r in
                guard r == .OK, let url = panel.url else { reply(NSNull(), nil); return }
                do { try bytes(o).write(to: url); reply(["path": url.path, "name": url.lastPathComponent], nil) } catch { reply(nil, error.localizedDescription) }
            }
        case "writeProject":
            let write = { (dir: URL) in
                let rel = (o["path"] as? String ?? "file").split(separator: "/").filter { $0 != ".." }.joined(separator: "/")
                let url = dir.appendingPathComponent(rel)
                do {
                    try FileManager.default.createDirectory(at: url.deletingLastPathComponent(), withIntermediateDirectories: true)
                    try bytes(o).write(to: url); reply(["path": url.path], nil)
                } catch { reply(nil, error.localizedDescription) }
            }
            if let p = project { write(p); return }
            let panel = NSOpenPanel(); panel.canChooseDirectories = true; panel.canChooseFiles = false; panel.canCreateDirectories = true
            panel.message = "Choose a folder for exports"; panel.prompt = "Choose"
            panel.beginSheetModal(for: window) { r in
                guard r == .OK, let url = panel.url else { reply(nil, "no folder chosen"); return }
                self.project = url; write(url)
            }
        case "readFile":
            let url = URL(fileURLWithPath: o["path"] as? String ?? "")
            if let f = readOut(url, binary: o["binary"] as? Bool ?? false) { reply(f, nil) } else { reply(nil, "cannot read " + url.path) }
        case "setTitle":
            window.title = o["title"] as? String ?? appName; reply(NSNull(), nil)
        case "setDirty":
            dirty = o["dirty"] as? Bool ?? false; window.isDocumentEdited = dirty; reply(NSNull(), nil)
        case "close":
            window.performClose(nil); reply(NSNull(), nil)
        default:
            reply(nil, "unknown call " + op)
        }
    }

    // menus: the app, Edit (so copy and paste work in text fields), View and Window
    func menus() {
        let main = NSMenu()
        func item(_ m: NSMenu, _ t: String, _ a: Selector?, _ k: String, _ mods: NSEvent.ModifierFlags = .command) { let i = NSMenuItem(title: t, action: a, keyEquivalent: k); i.keyEquivalentModifierMask = mods; m.addItem(i) }
        let appMenu = NSMenu()
        item(appMenu, "About " + appName, #selector(NSApplication.orderFrontStandardAboutPanel(_:)), "")
        appMenu.addItem(.separator())
        item(appMenu, "Hide " + appName, #selector(NSApplication.hide(_:)), "h")
        item(appMenu, "Quit " + appName, #selector(NSApplication.terminate(_:)), "q")
        let edit = NSMenu(title: "Edit")
        item(edit, "Cut", #selector(NSText.cut(_:)), "x"); item(edit, "Copy", #selector(NSText.copy(_:)), "c")
        item(edit, "Paste", #selector(NSText.paste(_:)), "v"); item(edit, "Select All", #selector(NSText.selectAll(_:)), "a")
        let view = NSMenu(title: "View")
        item(view, "Enter Full Screen", #selector(NSWindow.toggleFullScreen(_:)), "f", [.command, .control])
        let win = NSMenu(title: "Window")
        item(win, "Minimize", #selector(NSWindow.performMiniaturize(_:)), "m"); item(win, "Zoom", #selector(NSWindow.performZoom(_:)), "")
        for (title, menu) in [(appName, appMenu), ("Edit", edit), ("View", view), ("Window", win)] {
            let top = NSMenuItem(title: title, action: nil, keyEquivalent: ""); top.submenu = menu; main.addItem(top)
        }
        NSApp.mainMenu = main
        NSApp.windowsMenu = win
    }
}

let app = NSApplication.shared
let shell = Shell()
app.delegate = shell
app.setActivationPolicy(.regular)
app.run()
