# Audit: zinc:webview (plugins/webview)

## What it is
Put real web content (HTML/CSS/JS shipped in the app) inside the window as a native view, and let the page and the program talk (Tauri style): postMessage, `zinc.invoke` commands, `zinc://` assets.

## Targets and status
plugin.json: macos (WKWebView), ios, android (android.webkit.WebView, INTERNET). Sim = fake handles. Linux (WebKitGTK), Windows (WebView2), wasm (iframe), rpi1: not supported (Z5003). QuickJS rejects the native callbacks. Tests: `tests/t1/webview.sh`, `webview_hybrid.sh`. later.md ZN-718: "zinc:webview does not compile on macOS" in one tree, and has no prebuilt in the archive (needs SDL3).

## What the docs have
- [x] docs/plugins/webview.md (96 lines): overview, targets table, example, full API table, page-side API, assets, security, notes and limits
- [x] Example: `examples/webview/hybrid` (+ phone mode, apk/ipa commands)
- [x] Test; [x] platform quirks (Android origin, ZINC_SHOT limitation, 16 views)
- [ ] Screenshot/GIF (docs say `screencapture -l` is needed; no image committed)
- [ ] Step-by-step tutorial; [ ] Linux/Windows alternatives; [ ] troubleshooting list

## What is missing
1. A screenshot of examples/webview/hybrid (window capture with `screencapture -l`, since ZINC_SHOT misses the view) and a phone-mode one.
2. 6-step tutorial: web UI in `assets/`, create view in `<NativeView>`, a `handle` command, `postMessage` back, ship in the single binary.
3. Typed API stub for page side (`window.zinc` d.ts) so the web code gets completion.
4. Troubleshooting: blank view (hidden under a layer), `zinc://` path with `..`, remote page IPC refused, QuickJS error message.
5. State of Linux/Windows with the planned dates; today only "not supported yet".
6. Safari inspector how-to (macOS 13.3+), Chrome inspect for Android with exact commands.
7. Verify hot reload under `zinc dev` and update the note (see below).
8. (hardware) iOS device and Android phone captures.

## Wrong or stale
- "Hot reload (`zinc dev`): not verified, `zinc dev` does not link on this branch" reads as a stale branch note; check it.
- Doc table lists a "sim" row that is not a plugin.json target.
- `follow()` described as the "older way" but `lib/std/react-native.tsx` also imports this plugin; check it still uses current API.

## Suggested pages
WebView overview; API reference (generated); Tutorial: a web UI inside a Zinc app; The zinc:// scheme and assets; Page-to-program RPC and security; Example: hybrid; Platform notes (macOS, iOS, Android); Troubleshooting.
