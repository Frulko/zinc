# Zinc Next: native views (NativeView, ZN-749)

A real OS view laid over the Zinc surface at a zinc:ui node's box: what Flutter calls platform views and React Native native components.
First user: `zinc:webview` (WKWebView on macOS and iOS, android.webkit.WebView on Android). User docs: `docs/ui.md` "Native views",
`docs/plugins.md` "Native views", `docs/plugins/webview.md`.

## How it works

| Piece | Where | What |
|---|---|---|
| `<NativeView view={host} className=.../>`, `ui.nativeView(node, host)` | `lib/std/ui.ts` | registers the node; after each painted frame `syncNatives` computes the box (`boxOf`), the clip (the surface and every `overflow`/scroll ancestor up to the node's layer), and `shown` (alive, on screen, not `hidden`/`invisible`, opacity > 0, clip not empty, no layer above overlapping it); calls `host.place(x, y, w, h, cx, cy, cw, ch, shown)` only when one of the nine values changed, once more with `shown` false when the node dies |
| `NativeView` with React Native styles | `lib/std/react-native.tsx` | the same over `<View style>` |
| a host | `plugins/webview/index.ts` | `WebView.place` forwards box and clip to the native `place`, and `shown && show()` to `setVisible` |
| macOS, iOS | `plugins/webview/src/webview.mm` (one file, `TARGET_OS_IPHONE` branches) | a clipping container (`ZincClip`, flipped NSView with a masking layer; a UIView with `clipsToBounds` on iOS) added to SDL's view, the WKWebView inside it; logical px mapped by the renderer's zoom and letterbox (`hal_surface_size` against the view's bounds) |
| Android | `src/app/android/java/dev/zinc/app/ZincNativeView.java` (shell), `plugins/webview/native/android/WebviewModule.java` | a FrameLayout added to SDL's layout after its SurfaceView (drawn above it), moved with translations and resized only when the clip's size changes; px = logical x `ZincActivity.zoom()`; every call posted to the UI thread in order |

Touches: the native view is a sibling above SDL's view, so the OS's hit testing gives it the touches inside the clip; zinc:ui's gestures do not
see them. Outside the clip they reach SDL as before.

## The compositing rule (decision text for the coordinator)

**Native views are laid over the surface, never composited into it: the view (in a container clipped to the rectangle of its scroll areas)
takes its node's box after each painted frame, and Zinc draws nothing over it. While a zinc:ui layer painted above it overlaps it (a menu, a
popover, a toast; any layer with a backdrop) or its node is off screen, hidden, transparent or clipped away, the view is hidden. zinc:ui tells
the host only what changed (`place` with box, clip and `shown`); the platform side maps logical pixels to the view's units. A rectangle clip
only: no Zinc content, shadows, blur, rounded clips or transforms over or on the view.** Scored in docs/reports/native-fidelity-and-plugins.md
§4.3 (Decision B): overlay 66, split layers (hybrid composition) 50, texture 40. Hiding rather than a snapshot under overlays: a snapshot is
asynchronous on WebKit (`takeSnapshot`) and on Android (`PixelCopy` or `draw` into a bitmap) and must be refreshed while the content moves;
the kits' overlays are short-lived. Revisit for a snapshot under modal sheets (a frozen picture instead of an empty hole), for rounded corners
on iOS (`layer.cornerRadius` is cheap there), or when a view must sit inside a fast-scrolling list (then measure the trailing frame on a
modest device).

## Cost measured (2026-10-17, development Mac under the other agents' load: load average 7 to 26)

- zinc:ui side, per frame, one native view 11 levels deep in a scroll area scrolled by 1 px every frame (2000 frames, headless, the host does
  nothing; `/tmp` bench, method below): 26.0 to 26.9 µs per frame with a plain `<View>`, 30.8 to 32.6 µs with a `<NativeView>` (AOT);
  26.5 / 31.3 µs (interpreter): **about 5 µs per frame per native view**, a host call each frame. At rest nothing runs (the frame is kept).
- Native side, one update (`WebView.place`, the zinc:native call and two frames set): macOS 5.5 to 8.1 µs (interpreter, 2000 updates);
  Android emulator (API 37, arm64 image translated on the Intel Mac) 10 to 43 µs on the program's thread (JNI call and the post to the UI thread;
  the UI thread then sets two translations, and a layout when the clip's size changes).
- Method: a page with a 40 px bar and a ScrollView holding the view under 8 nested Views, `ui.scrollTo` every frame, mean of `performance.now()`
  over frames 50 to 2050 with `ZINC_HEADLESS=1`; the native loop calls `place` 2000 times with a new box and clip.

## Proofs

- `tests/t0/ui_native_view.sh`: what a host is told frame by frame (scrolled and clipped under the bar, hidden under a menu and a dialog's scrim,
  under a hidden parent, at unmount), Solid and React Native; interpreter and AOT give the same golden.
- `tests/t1/webview_hybrid.sh`: examples/webview/hybrid on macOS through NativeView: the WKWebView at 256,0 768x640 beside the sidebar, the
  invoke and postMessage round trips; the phone layout scrolled by 200 px moves the view 200 logical px up inside a container cut at the bar.
  `tests/t1/webview.sh` (bundle, RPC, moved .app) unchanged.
- Android emulator (Pixel_10, API 37): `docs/reports/zinc-next-android/native-view-webview.png` (the page served from the APK's assets, invoke
  and the rejected command, live ticks), `-scrolled.png` (a swipe on the Zinc page: the web view moved with it and is cut at the bar),
  `-touch.png` (a tap inside the web view selected a file in the page, whose postMessage selected it in the Zinc list).
- iOS simulator (iPhone 17, iOS 26.3, `zinc export --target ios --ipa --simulator`, the same `webview.mm` built for UIKit at the first try):
  `docs/reports/zinc-next-ios/native-view-webview.png` (the page from the bundle's assets through `zinc://`, invoke, the rejected command,
  live ticks at 60 fps) and `-scrolled.png` (`HYBRID_SCROLL=300`: the container cut at the bar, 12,106 378x244 points, the web view at -176
  inside it). simctl has no touch input, so the touch was proved on Android only.
- Not proved: the Nexus 7 (another app was in front: the emulator was used, as the task allows), a real iPhone, a scroll fling on a slow
  device (how far the view trails), Android's onPageStarted bridge for a local dev server page.
