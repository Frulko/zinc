---
id: ZN-811
title: 'Cross-platform pass: Android and iOS on real phones'
status: Backlog
assignee: []
created_date: '2026-10-24 23:56'
labels:
  - size-L
  - cross
milestone: m-26
dependencies: []
ordinal: 54600
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
From backlog/later.md, promoted by the review of 2026-10-25 (docs/reports/backlog-review-2026-10-25.md). The lines it carries:

- zinc:camera: build and run the Android backend (plugins/camera/native/camera.android.cpp, camera2 NDK + SDL_RequestAndroidPermission) on the Nexus 7 and a recent phone: the permission dialog, front/back/USB cameras, frames upright by ACAMERA_SENSOR_ORIENTATION, the export's manifest (CAMERA, camera feature optional), the webcam demo in portrait.
- zinc:camera: build the iOS backend (camera.ios.mm, the macOS file under TARGET_OS_IPHONE) once the iOS export exists, with iosInfoPlist's NSCameraUsageDescription; check the portrait orientation and the mirrored front camera.
- zinc:camera: Android backend on Camera2 (an ImageReader in YUV_420_888 through the NDK's ACameraManager) with android.permission.CAMERA asked at run time; iOS shares camera.macos.mm but has no output scaling (pick the format, scale ourselves) and needs the usage string in its Info.plist.
- ZN-622: build arm64-v8a and x86_64 and do an emulator smoke run; only armeabi-v7a was built and run (Nexus 7).
- Mobile feel: done on the desktop (`ZINC_PLATFORM`, tests/t0/platform_identity.sh): check on a phone that an AOT app reports `android` / `ios`, `Platform.Version` the API level (`ro.build.version.sdk`) and the iOS version (`kern.osproductversion`), and that `zinc build --profile ios` takes the `x.ios.ts` files (item 1).
- Mobile feel: `ui.platformStyle()` (android, ios, desktop, from `platform()`) drives scroll physics, navigation transitions and selection handles; still to key on it: press feedback (ripple), RN `Button` / `Switch` / `ActivityIndicator` looks, the platform font, motion and shape tokens in the kits (item 2).
- ZN-625: the system signals are fed and tested on the desktop (tests/t0/system_signals.sh); on a phone check: real insets and a cutout from SDL (none below API 30 on Android), the theme change event, `ZincActivity`'s font scale and animator scale, the keyboard height from the IME insets (API 30+) and from the visible frame (the Nexus 7, API 25), the back key trapped and `exitapp` moving the task back, the status bar style and hiding, and the iOS glue's Dynamic Type, Reduce Motion and keyboard frame (item 3).
- ZN-626: `ZincEdit` (Android InputConnection over a mirror of the field) and `ZincTextInput` (iOS UITextInput) are written and compile (javac android-36, iOS simulator SDK) but never ran: try Gboard (suggestions, autocorrect, swipe typing), a Japanese IME, dictation and a password manager, the traits (number pad, email, return key, autofill), and SDL's own text field still taking first responder on iOS after `becomeFirstResponder` (item 4).
- ZN-626: touch selection (handles, magnifier, edit menu) is drawn by zinc:ui (tests/t1/text_touch.sh); still to do: the system edit menu (`UIEditMenuInteraction`, Android's floating `ActionMode`), so iOS does not ask before a paste, and the menu's labels in the user's language (item 5).
- Mobile feel: Android's spline fling, stretch and glow run on the desktop (tests/t1/scroll_platform.sh): compare side by side with a native RecyclerView on a phone (the stretch is drawn by moving children, its curve fitted by eye); still missing: `bounces` / `overScrollMode` / `decelerationRate` on ScrollView, nested scroll hand-off, iOS's tap on the status bar to scroll to top, text areas (they keep iOS's physics) (item 6).
- Mobile feel: `zinc:ui/navigation` (tests/t1/navigation.sh): check predictive back on Android 14 (`OnBackAnimationCallback` progress through `ZincActivity`), the edge swipe's feel on an iPhone, sheet detents (only full height now), the header's title cross-fade during a push, and move rn-showcase's hand-rolled stack (`src/nav.ts`) onto it (item 7).
- ZN-630: the tree needs stable ids, bounds, values, actions and per-frame diffs before any bridge; do the macOS NSAccessibility bridge first (provable on the Mac), check AccessKit before writing the phone bridges (item 8).
- Mobile feel: zinc:haptics and RN `Vibration` reach `View.performHapticFeedback` / `UIFeedbackGenerator` (`ZINC_DEVICE_LOG` on the desktop): feel them on both phones; the kit's switch and pickers do not fire them yet (item 9).
- Mobile feel: use the platform UI font at run time (Android `/system/fonts` via `fonts.xml`, CoreText's UI font on iOS and macOS) and the platform emoji font; today Inter, and the emoji fallback reads macOS paths only (item 10).
- Mobile feel: zinc:react-native `Button`, `Switch`, `ActivityIndicator`, `RefreshControl` draw iOS on every OS; add the Android looks and `TouchableNativeFeedback`, and a short press delay in scroll views so rows do not flash when a scroll starts (item 11).
- ZN-628: a `NativeView` host element generalising the webview overlay, then the web view, date/time picker, photo and document pickers, share sheet and an optional native alert on both phones (item 12).
- zinc:microphone: Windows (WASAPI through the same miniaudio), Android (AAudio through miniaudio, RECORD_AUDIO asked at run time), iOS (an AVAudioSession category for recording).
- zinc:webrtc: Windows (Media Foundation H.264, NVENC/QSV where present) and Android (MediaCodec) video backends; iOS reuses videotoolbox.cpp.
- zinc:webrtc: Windows (libjuice and usrsctp build there; Winsock defines), the Android export (the app's CMake must pass vendorFlags: -frtti -fexceptions -fthreadsafe-statics), iOS.
- ZN-624: run on a real iPhone, signed with the owner's team (`cmake -DZINC_TEAM=<team>`, xcodebuild archive and -exportArchive), and on an Intel Mac's simulator.
- Mobile feel: the font scale picks the nearest *baked* size (`setFontScale`): a size the program never names is drawn at a nearby one; bake the scaled text sizes for the android and ios profiles (x1.15, x1.3) or rasterize the TrueType files at any size there.
- ZN-628: the services and Swift/Kotlin fixtures on the Nexus 7 (armeabi-v7a Kotlin build) and a real iPhone; zinc.json targets.android/targets.ios raw manifest and plist fragments for apps.
- ZN-750: check BGRA_8888 against RGBX on a real API 26-36 device and move the API line if it honours format 5.
- ZN-748: the platform looks on the Nexus 7 and the iOS simulator, screenshots in docs/reports/zinc-next-android and zinc-next-ios.
- ZN-751: zinc:video on the Nexus 7 (Tegra 3 MediaCodec: which path, which colour format) and on an iPhone.
- ZN-749: the hybrid web view on the Nexus 7 (API 25 WebView) and a real iPhone; how far a native view trails a fling there.
- ZN-627: the Metal present on a real iPhone (raster p50/p99 at 60 Hz and at ProMotion 120 Hz, an iPhone 8 as the floor).
- ZN-630: VoiceOver on a real iPhone and TalkBack on a phone: speech, swipe order, double tap, off-screen rows in a scroll area, touch exploration through the surface's hover listener.
- ZN-625: below API 35, the edge-to-edge bars and the safe area on a real older phone; ZN-626: adjustPan vs adjustNothing plus our own avoidance on an API 25-34 device.
- ZN-626: a real CJK IME's composition, swipe typing, dictation and password managers on phones.
- ZN-631: scan the QR code with Zinc Go on a real phone or tablet over Wi-Fi (the Nexus 7: zinc export examples/zinc-go --target android --apk --abis armeabi-v7a, adb install -r, zinc dev examples/rn-showcase --lan, scan, save a .tsx); the iOS player export needs NSLocalNetworkUsageDescription on a real iPhone.
- D142: the GPU-layer switching and the ANativeWindow disconnect on API 26+ and API 29+ devices and other GPUs (Mali, Adreno).
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Android (Nexus 7, recent phone) and iPhone: insets, theme, IME, haptics, predictive back, fling feel, font, video, accessibility
- [ ] #2 arm64-v8a/x86_64 emulator smoke run; --aab/--apk on Linux; IPA with the owner team
- [ ] #3 Camera and microphone backends run on both
<!-- AC:END -->
