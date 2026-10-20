---
id: ZN-628
title: 'Plugins on ios and android: static linking, manifest targets, permissions'
status: Done
assignee:
  - '@parallel'
created_date: '2026-10-10 14:07'
updated_date: '2026-10-17 00:45'
labels:
  - mobile
  - size-L
milestone: m-26
dependencies:
  - ZN-622
  - ZN-624
ordinal: 204000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
`ios` and `android` entries in `plugin.json`; the generators link the archives and merge permissions and frameworks; sqlite and video first; `webview` on WKWebView for iOS and the Android WebView; `system` reduced to what exists (clipboard, opener, deep links, notifications) (From the spike ZN-372, docs/reports/zinc-next-mobile-spike.md, D59.)
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 a program using `zinc:sqlite` runs on both
- [x] #2 a plugin without an entry for the target is refused at export with a message
- [x] #3 the generated manifests list exactly the declared permissions
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
2026-10-16 (owner, native fidelity, ../docs/reports/native-fidelity-and-plugins.md §4.4, scored 65): the mobile plugin model: plugin.json android/ios entries (sources, gradle dependencies, manifest and Info.plist fragments, entitlements) merged by zinc export into the generated projects (as Expo config plugins and CNG); zinc native-gen --android/--ios writes Java-interface and ObjC-protocol glue from the plugin's spec.ts, authors write Kotlin or Swift behind it; lifecycle subscribers in the generated activity and app delegate; zinc:system gets ios and android backends (notifications, share sheet, pickers, haptics, opener, deep links) on its op table (tools/system-ops emits their dispatch stubs).

2026-10-17 (worktree agent): done, steps 1 to 3 of the brief; step 4 (zinc:video) is a plan below.
- Step 1, plugin.json phone entries (src/frontend/plugin_manifest.*, src/tc/plugin_build.*, src/cli_core.cpp appPluginsCmake): `targets.android` / `targets.ios` take sources (.java/.kt to Gradle in their package's directory, Kotlin adds its Gradle plugin 2.2.20; .m/.mm/.swift to Xcode, Swift in its own static library), gradle, manifest {permissions, manifest, application}, minSdk, plist, entitlements, lifecycle, class; wrong types are errors. A plugin without the entry is refused: "plugin 'x' is not made for android: its plugin.json has no "targets"."android" entry (it has ...)". The manifest lists exactly zinc.json's permissions, the plugins' and SDL's VIBRATE (kept: navigator.vibrate, zinc:haptics, install-time). Plugin libraries are `zn_app_plugin_<name>` (the engine already defines zn_plugin_sqlite); a project's own plugin is referenced by its absolute path (was ${ZINC_PLUGINS}, wrong for project plugins). `android.useAndroidX=true`. zinc.json app.urlSchemes -> intent filters / CFBundleURLTypes. Listed android+ios: sqlite, svg, lottie, socket, webos, gsap, async-storage, sonos, spotify, osc (camera had them).
- Step 2, glue (src/frontend/native_gen.cpp, src/app/mobile_bridge.h, android_glue.cpp, ios_glue.mm, shell_sdl.cpp, ZincCallback/ZincLifecycle.java, src/app/ios/ZincLifecycle.h): `zinc native-gen --android|--ios <spec> [dir]`; the export regenerates them when an entry names `class` (ZN_NATIVE_CLASS). Carries i32/u32/f64/boolean/string and void callbacks; a ZincCallback call is queued and made on the program's thread (Drain poller; iOS dispatch to main). Lifecycle: ZincActivity forwards onCreate/onNewIntent/onPause/onResume/onLowMemory/onActivityResult/onRequestPermissionsResult to ZincPlugins.java (written by the export); iOS calls zincPause/zincResume/zincLowMemory/zincOpenURL: (ZN_APP_LIFECYCLE), resume at start when already active. iOS simulator configure needs -DCMAKE_OSX_SYSROOT=iphonesimulator when Swift is linked (README/--print changed; device builds use build-device).
- Step 3, zinc:system on phones: live hooks renamed zn_sys_live_* behind ZN_SYSTEM_LIVE (macOS keeps them); system.ios.mm and system.android.cpp + android/SystemBackend.java: notification.notify/requestPermission/cancel/backend, opener.open, new op share.share (permission "share", zinc:system/share), dialog.open pickers (answer later: {pending} + event dialog-result, dialog.ts waits), deep-link.getCurrent and open-url. Haptics were zinc-f5's (zinc:haptics). Fix on the way: the opener scope check now runs before the live backend (macOS opened URLs outside scopes.opener.allow).
- Proof: T0 export_android, export_ios, native_gen, plugin_manifest, system_ops, new system_phone (also compiles the backends with the NDK and the iOS simulator SDK), mobile_profiles, app_library, lint; T1 system_sim, system_manifest: all pass. iPhone 17 simulator (iOS 26.3): tests/data/mobile-sqlite prints "sqlite 3.53.4: 1 runs" then "2 runs"; tests/data/mobile-plugin: "beep 42", "HELLO ZINC FROM SWIFT", "watch 1/2 swift", lifecycle resume; tests/data/mobile-services: share sheet, photo picker and the notification prompt (screenshots). Android emulator (API 37 arm64, AVD Pixel_10): sqlite "2 runs" after two starts; beep fixture in Kotlin: "beep 42", "HELLO ZINC FROM KOTLIN", watch from another thread, "beep lifecycle resume"; services: share sheet, Chrome opened, notification prompt then a posted notification (dumpsys), tap intent -> "notification tapped", document picker -> a copied path, deep link warm ("deep link zincdemo://hello/world") and cold (getCurrent). Nexus 7 not used: dev.zinc.music was in front all session.
- Not verified: iOS deep-link delivery and a notification's tap (the simulator needs a tap), a picked document on iOS, arm32 Kotlin build on the Nexus 7.
- Decision text (for the coordinator's decision record): "Phone plugin model: declarative plugin.json android/ios entries merged by zinc export (Expo config plugins without code), generated Java/ObjC glue from spec.ts (Decision C, scored 65 in native-fidelity-and-plugins.md 4.4); zinc:system keeps one op table with the C++ gate and simulator and a thin live backend per OS (Java over JNI, ObjC), rather than moving the module to Java, so the permission gate and the simulator stay one code. Revisit if a plugin needs imperative project edits or Promises/arrays across the glue."
- later.md lines: "- ZN-628: the glue carries no Promise, array or record: add them (Promise via a ZincPromise / completion block) when a plugin needs one"; "- ZN-628: the Android software frame shows red and blue swapped on the API 37 emulator (sky-600 draws brown): anw_present assumes BGRA, check the window buffer's format (hal_sdl.cpp)"; "- ZN-628: iOS: a deep link at launch arrives as an open-url event, not deep-link.getCurrent (SDL delivers it after the program's first lines); set the notification delegate before launch ends for a tap that starts the app"; "- ZN-628: Cross-platform pass: the services and beep fixtures on the Nexus 7 (armeabi-v7a Kotlin build) and an iPhone; zinc.json targets.android/ios raw manifest and plist fragments for apps (only plugins have them)"; "- ZN-628: zinc:video on phones (plan below)"; "- ZN-628: zinc:webview on WKWebView and the Android WebView, on the <NativeView> overlay of native-fidelity-and-plugins.md 4.3 (step 5 there): the description named it, the ACs did not".
- Step 4 plan (zinc:video on Android and iOS, so examples/hero exports): plugins/video/native/player.h already separates the backend (FFmpeg in video.host.cpp, GStreamer by dlopen in video.webos.cpp). Add video.android.cpp: AMediaExtractor (file or asset path) + AMediaCodec to ByteBuffer output (YUV420 flexible / NV12), converted to 0x00RRGGBB at the player's size as the webOS backend converts NV12, libs mediandk+log, minSdk 24 already; audio through AAudio later. Add video.ios.mm: AVAssetReader + AVAssetReaderTrackOutput with kCVPixelFormatType_32BGRA (no conversion), frameworks AVFoundation, CoreMedia, CoreVideo. plugin.json android/ios entries with native.impl; prove with `zinc export examples/hero --target android|ios` on the emulator and the simulator. About one session per backend. Next command: `zinc export ../examples/hero --target android` (refused today: video has no android entry).
<!-- SECTION:NOTES:END -->
