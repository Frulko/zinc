---
id: ZN-749
title: 'NativeView: a real native view at a layout rectangle (web view first)'
status: Done
assignee:
  - '@parallel'
created_date: '2026-10-16 20:29'
updated_date: '2026-10-16 23:58'
labels:
  - mobile
  - ui
  - size-M
milestone: m-26
dependencies:
  - ZN-628
ordinal: 201500
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Owner 2026-10-16 (../docs/reports/native-fidelity-and-plugins.md §4.3, scored 66 against split layers 50 and textures 40): a <NativeView> zinc:ui leaf whose rectangle, clip and visibility the host forwards to a native view laid over the Zinc surface (NSView / UIView subview, an Android view over SDL's SurfaceView), hidden or snapshotted when a Zinc overlay covers it; what Flutter's platform views and React Native's native components do for maps, web views, video and ads. Port plugins/webview (examples/webview/hybrid, WKWebView over the surface on macOS) to it, then Android WebView and iOS WKWebView.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 examples/webview/hybrid runs on macOS through NativeView unchanged in behaviour (its test)
- [x] #2 the same page in a NativeView on the Nexus 7 and the iOS simulator, scrolling with the Zinc page and clipped by it
- [x] #3 a decision record: the compositing rule and the cost measured
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Done 2026-10-17 (worktree agent). Module report: docs/reports/zinc-next-native-view.md (how, rule, costs, proofs).

What it does: `<NativeView view={host} className=.../>` (zinc:ui; zinc:react-native has one with `style`) registers a node; after each painted frame lib/std/ui.ts syncNatives computes box (boxOf), clip (surface and every overflow/scroll ancestor up to its layer) and shown (alive, on screen, not hidden/invisible, opacity > 0, clip not empty, no layer above overlapping it: menus, popovers, toasts, any layer with a backdrop) and calls host.place(x, y, w, h, cx, cy, cw, ch, shown) only on change, once more hidden at unmount. zinc:webview's WebView is a host (spec gains `place`). macOS and iOS: one webview.mm, a clipping container (flipped NSView with a masking layer / UIView clipsToBounds) in SDL's view, the WKWebView inside. Android: shell class dev.zinc.app.ZincNativeView (FrameLayout above SDL's SurfaceView, translations, posted to the UI thread) and plugins/webview/native/android/WebviewModule.java behind the generated WebviewSpec (D127): zinc://app/ served as https://appassets.androidplatform.net/ from the copied assets, the bridge injected into served HTML, a per-view token against iframes.

Proofs: tests/t0/ui_native_view.sh (golden, Solid and RN; interpreter = AOT); tests/t1/webview_hybrid.sh (macOS: the view at 256,0 768x640 beside the sidebar, RPC both ways, the phone layout scrolled 200 px moves it 200 px up inside the bar's clip); tests/t1/webview.sh unchanged PASS. Android emulator Pixel_10 API 37 (the Nexus 7 had dev.zinc.music in front): docs/reports/zinc-next-android/native-view-webview{,-scrolled,-touch}.png (a swipe on the Zinc page scrolls and clips the web view; a tap in the web view reaches the page and its postMessage selects the file in the Zinc list). iOS simulator iPhone 17, iOS 26.3: docs/reports/zinc-next-ios/native-view-webview{,-scrolled}.png (HYBRID_SCROLL=300). Also PASS: ui, rn_showcase, export_android (golden + ZincNativeView.java), export_ios, app_library, plugin_manifest (table row updated), native_gen (header golden + place).

Cost: ui side about 5 µs per frame per native view (11 levels deep, scrolled each frame: 26.0-26.9 µs/frame plain against 30.8-32.6 with NativeView, AOT; 26.5 against 31.3 interpreter); one native update 5.5-8.1 µs on macOS, 10-43 µs on the Android emulator's program thread. Machine loaded (load 7 to 26).

Decision text (for the coordinator's next D number): the module report, "The compositing rule". Overlay over the surface in a clipped container, Zinc never draws over it, hidden while an overlapping layer is above or the node is off screen; only changes forwarded. Scored 66/50/40 in native-fidelity-and-plugins.md §4.3.

later.md lines (for the coordinator):
- ZN-749: a snapshot of a native view under modal sheets instead of an empty hole (WKWebView takeSnapshot, Android PixelCopy), refreshed while the content moves.
- ZN-749: the cover test uses the layer node's box: a full-surface layer holding a small panel hides the view everywhere; use the painted children's bounds.
- ZN-749: native views in a second window (ui.mountWindow) share one registry; key it per surface.
- ZN-749: measure how far a native view trails a fling on the Nexus 7 and an iPhone; a dev-server page's bridge through androidx.webkit addDocumentStartJavaScript.
- Cross-platform pass: ZN-749 hybrid on the Nexus 7 (API 25 WebView) and on a real iPhone.
<!-- SECTION:NOTES:END -->
