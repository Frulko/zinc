# Native fidelity and native plugins on iOS, macOS and Android

Date: 2026-10-16. Asked by the owner: "some things already run in another demo, but we must see, the way Flutter or React Native
do it, how to exploit a maximum of native in the UI and the behaviour, how this is maintained over time, and how we make it easy
for iOS, macOS and Android." Research only: no code changed. Read in main at `bc0c360d`.

This report adds to `mobile-native-feel.md` (written the same day: the audit of the phone feel and a 13-item plan). That report covers
*what feels wrong on a phone*. This one covers the *architecture*: what Zinc imitates in its own drawing, what it hands to real native
components and how it composites them, and the plugin model that keeps native code maintainable for years. Items that report already
plans are named "MNF #n" and not repeated.

## 1. Verdict

Keep Flutter's split, which Zinc already half follows: **draw the content, imitate each platform's behaviour, delegate to the OS
what the OS owns** (system chrome, privacy-mediated pickers, the text input client, accessibility, web content). Three
pieces are missing, and they are the work:

1. **A platform profile in zinc:ui** that the kits read by default (adaptive by default, unlike Flutter where the developer must ask).
2. **A `<NativeView>` host element**: a leaf of the zinc:ui tree whose laid-out rect the host gives to a native view placed above the
   surface. It generalises what `plugins/webview` already does by hand on macOS.
3. **A mobile half for the plugin model**: Zinc already has a typed spec with generated C++ glue (`*.spec.ts` + `zinc native-gen`,
   our Codegen/Pigeon), per-target files, a recording simulator, and `zinc export` that regenerates the Android project from SDL's
   template (our CNG). It lacks the Java/ObjC side of the glue, a way for a plugin to add to the generated project (manifest,
   Gradle, Info.plist, entitlements), and lifecycle hooks into the activity and the app delegate.

The demo the owner means is most likely `examples/system/desktop` (native menu bar, dock badge, bounce, notifications, native context
menu on macOS) together with `examples/webview/hybrid` (a real WKWebView over the Zinc surface) and the `desktop-app` template.

## 2. Inventory: what Zinc already does natively

"Native" = the OS does it; "drawn" = Zinc draws an imitation; "sim" = recording simulator only. `ui.ts` is `lib/std/ui.ts`.

| Feature | Where | macOS | Android | iOS | Others |
|---|---|---|---|---|---|
| App menu bar, roles (About, Quit, Edit...) | `plugins/system/menu.ts`, `native/system.macos.mm`; kit fallback `lib/std/kit/menubar.tsx` (`native` prop renders nothing) | native NSMenu | none | none | kit-drawn (Linux, Pi, sim) |
| Context menu | `menu.popup` (zinc:system); kit `ContextMenu` (`menubar.tsx:136`) | native via `menu.popup` (`examples/system/desktop/main.tsx:44`); the kit's `ContextMenu` is always drawn | drawn | drawn | drawn |
| Tray, dock badge/bounce/menu | `plugins/system/tray.ts`, `dock.ts` | native NSStatusItem, dockTile | n/a | n/a | Linux: SNI over D-Bus (planned, `system-integration.md` §3) |
| Notifications | `plugins/system/notification.ts` | native UNUserNotificationCenter (dev bundle `next/src/tc/bundle.cpp`) | none (`capabilities.json`: `notifications: false`) | none | sim |
| File dialogs, message boxes | `plugins/system/dialog.ts`, `system.macos.mm:393` | native NSOpenPanel/NSSavePanel/NSAlert | none (`dialogs: false`) | none | sim |
| Global shortcuts, single instance, autostart, deep links, opener, power, rich clipboard | `plugins/system/*.ts`, one op table `plugins/system/ops.json` | native (Carbon, SMAppService, CFBundleURLTypes, IOKit, NSPasteboard) | none | none | sim |
| Dark mode | `ui.setScheme('auto')` + `setSystemScheme` (`ui.ts:1764`); zinc:system `onAppearance` (`plugins/system/power.ts:25`) | native signal, but the **app** must wire it; RN `Appearance` reads only `ZINC_COLOR_SCHEME` | not read | not read | env var |
| Accent colour | none | not read (`NSColor.controlAccentColor`) | not read (Material You) | not read (tint) | - |
| Safe areas | `env(safe-area-inset-*)`, `ui.setSafeArea` (`ui.ts:1769`); RN `SafeAreaView` is a View | n/a | hook ready, not fed (MNF #3) | not fed | - |
| Status bar, back button | RN `StatusBar` renders nothing; `shell_sdl.cpp` handles only background/foreground | n/a | kiosk/fullscreen in `zinc.json` (D123); back key unmapped | n/a | - |
| Keyboard, IME | `hal_text_input` -> `SDL_StartTextInput` (`targets/macos/hal_sdl.cpp:1339`); no `SDL_EVENT_TEXT_EDITING` | committed text only (no marked text) | SDL's hidden InputConnection (MNF 2.3) | SDL's hidden UITextField [unverified] | in-app kit keyboard (`kit/keyboard.tsx`) |
| Scroll physics | `ui.ts:4302` | iOS rubber band on every platform | iOS physics (wrong) | iOS physics | same |
| Press feedback | dim to 0.6 while pressed (commit `9b4290a3`) | iOS-like | no ripple | iOS-like | - |
| Fonts | Inter built in, `ui.setFontSans` | not the system font | not Roboto | not SF | - |
| Haptics, vibration | `navigator.vibrate` (`lib/std/web.ts:1666`) -> device query `vibrate` (`next/src/host/sys_host.cpp:234`) | n/a | none | none | webOS: real (`PDL_Vibrate`, `plugins/display-gl/src/webos_device.cpp:98`); sim panel |
| Wake lock, brightness | zinc:sys device queries (D122) | - | native (SDL screensaver hint, window brightness) | - | webOS: native |
| Web view | `plugins/webview` (`src/webview.mm`, `index.ts`) | native WKWebView added as a subview over the SDL surface, placed by hand in logical px | none (`plugin.json` targets macOS only) | none | - |
| Video | `plugins/video` | decoded with VideoToolbox, drawn by Zinc | not ported | not ported | V4L2, GStreamer on webOS |
| Camera | `plugins/camera` | native AVFoundation capture, drawn by Zinc | none | none | V4L2 |
| Maps | `plugins/map` | drawn by Zinc (MVT tiles) | same code | same code | same |
| Platform identity | `Platform.OS` = `platform()` (`lib/std/react-native.tsx:118`) | `macos` | answers `linux` (bug, MNF #1) | would answer `macos` | - |
| Platform-specific files | ZN-745 (Backlog): `x.android.tsx`, `x.ios.tsx`, `x.native.tsx` | - | - | - | - |
| Permissions to manifests | `zinc.json` `permissions` -> `<uses-permission>` (`next/src/cli_core.cpp:1020`) | bundle Info.plist (`bundle.cpp:55`) | INTERNET, CAMERA, RECORD_AUDIO, location | ZN-623 (usage strings planned) | - |
| Native projects | `zinc export --target android` regenerates the Gradle project from SDL's `android-project` each time (`cli_core.cpp:941-1080`) | `.app` dev bundle, `.dmg` | regenerated | ZN-623 tonight | - |

Reading: macOS is well served for desktop chrome (one plugin, 14 modules, a typed op table, a simulator). The phones have the
engine and the shell, but no native service yet: no plugin lists an `android` or `ios` target (`plugins/*/plugin.json`), and Android
export builds a plugin's `linux` sources in its place (`cli_core.cpp:981`, a `ponytail` note pointing at ZN-628).

## 3. How the references do it

### Flutter (own renderer, the closest model)

- **Automatic per-platform behaviour** keyed on `TargetPlatform`: page transitions (zoom on Android, slide with parallax and
  edge swipe-back on iOS), back (Android key pops the route), scroll physics (Clamping + glow vs Bouncing), scrollbars, stacked
  flings and status-bar tap on iOS, Roboto vs San Francisco, adaptive icons, haptics (long-press selection vibrates on Android, picker
  ticks on iOS), text editing gestures (tap, long press, double tap, handles) and the selection toolbar. **Not automatic:** the widget
  look. Material does not turn Cupertino on iOS; the developer picks Cupertino widgets or `.adaptive()` constructors (`Switch`,
  `Slider`, `Checkbox`, `Radio`, `AlertDialog`, `CircularProgressIndicator`, `RefreshIndicator`), and app bars, bottom navigation and
  text fields need manual branching.
  https://docs.flutter.dev/ui/adaptive-responsive/platform-adaptations
- **Keeping the looks current is the expensive part.** On 2026-09-09 Flutter moved Material and Cupertino out of the framework into
  `material_ui` and `cupertino_ui` (1.0.0, semver, weekly releases), because design changes were tied to the three-month SDK release
  (up to 16 weeks late) and upgrades for fixes dragged UI changes along. Liquid Glass (iOS 26) and Material 3 Expressive were "work
  underway", not shipped. https://flutter.dev/blog/decoupling-material-cupertino
- **Platform views**, the native views inside Flutter UI. Android: Texture Layer (default; good performance, but jank in fast
  scrolling web views, SurfaceView loses accessibility), Hybrid Composition (full fidelity, but merges the raster and platform
  threads and lowers Flutter's frame rate; before Android 10 a GPU copy per frame), HCPP (experimental since 3.44, API 34+ and
  Vulkan only), Virtual Display (extra buffers, jank).
  https://docs.flutter.dev/platform-integration/android/platform-views. iOS: hybrid composition, the UIView is appended to the
  hierarchy; `ShaderMask` and `ColorFiltered` unsupported over it; mitigation: a screenshot texture during animations.
  https://docs.flutter.dev/platform-integration/ios/platform-views. macOS `AppKitView`: hybrid composition, "isn't fully
  functional", no gestures yet; the raster thread waits for the platform thread.
  https://docs.flutter.dev/platform-integration/macos/platform-views
- **Plugins.** Federated: an app-facing package, a platform-interface package (the contract), one implementation package per
  platform; "endorsed" implementations come with the app-facing package, others can be added by the app; an implementation may be
  pure Dart over FFI (`dartPluginClass`). https://docs.flutter.dev/packages-and-plugins/developing-packages. **Pigeon** generates
  both sides of the channel (Dart + Kotlin, Java, Swift, ObjC, C++, GObject) from one Dart declaration file (`@HostApi`,
  `@FlutterApi`, async, event channels), to "remove the necessity to manage strings across multiple platforms"; generated code is an
  internal detail. https://pub.dev/packages/pigeon
- **Text input and accessibility** are native bridges: a `TextInputConnection` to a hidden native client mirroring text, selection
  and composing range, and a semantics tree sent to the platform's accessibility API.
  https://api.flutter.dev/flutter/services/TextInputConnection-class.html,
  https://docs.flutter.dev/ui/accessibility-and-internationalization/accessibility

### React Native, new architecture, and Expo

- Every host component is a real `UIView` / `android.view.View`, mounted by Fabric (C++ shadow tree, Yoga). Fidelity comes from the
  OS for free and changes with it. https://reactnative.dev/docs/fabric-native-components-introduction
- **Codegen**: from typed TypeScript or Flow specs, generates C++ glue then Java (Android) and Objective-C++ (iOS) for TurboModules
  and Fabric components, automatically at each app build. https://reactnative.dev/docs/the-new-architecture/what-is-codegen
- **Expo Modules API**: one module = a Swift class and a Kotlin class written in the same DSL (`Name`, `Function`, `AsyncFunction`,
  `Events`, `Constant`, `OnCreate`, `View` with `Prop` and view events), with lifecycle hooks per platform
  (`OnAppEntersBackground`, `OnActivityEntersBackground`). https://docs.expo.dev/modules/module-api/. Autolinking finds modules in
  the dependencies. https://docs.expo.dev/modules/autolinking/
- **Continuous Native Generation**: `expo prebuild` writes `android/` and `ios/` from a template matched to the SDK, the app config,
  the autolinked modules, and **config plugins** (functions that add Info.plist strings, manifest entries, Xcode targets,
  gradle.properties), plus "native subscribers" (lifecycle listeners, AppDelegate subscribers) so modules need no edits to
  MainApplication or AppDelegate. Upgrading = bump versions, `prebuild --clean`; hand edits are lost by design.
  https://docs.expo.dev/workflow/continuous-native-generation/, https://docs.expo.dev/config-plugins/introduction/
- **Keeping up with OS releases**: Expo ships a major SDK three times a year, each pinned to one React Native version and to a
  table of compile/target SDK, minimum iOS and minimum Xcode (SDK 57: compile/target 36, iOS 16.4+, Xcode 26.4+).
  https://docs.expo.dev/versions/latest/

### Others, briefly

- **Compose Multiplatform**: draws its own UI; Material looks Material on iOS too; the behaviour is adapted (iOS scroll feel,
  system default font, native Copy/Translate popups, Dynamic Type), and native views come in through `UIKitView` /
  `UIKitViewController` (MKMapView, camera, WKWebView in the docs' own examples). In 1.11 (May 2026) JetBrains added an opt-in text
  input built on a UIView for native caret, handles and the system edit menu [secondary source; the release post returned 403].
  https://kotlinlang.org/docs/multiplatform/compose-platform-specifics.html,
  https://kotlinlang.org/docs/multiplatform/compose-uikit-integration.html
- **.NET MAUI**: every control is a "virtual view" mapped by a handler to a native view per platform (`Button` -> `UIButton` /
  `MaterialButton`); property and command mappers can be appended without subclassing. Native look, three platforms' bugs.
  https://learn.microsoft.com/en-us/dotnet/maui/user-interface/handlers/
- **Tauri 2**: a plugin is Rust core + a Kotlin class (`@TauriPlugin`, `@Command`) + a Swift package (`Plugin`, `Invoke`);
  Rust calls `run_mobile_plugin(name, payload)` with serialised arguments; permissions declared in the annotation, events with
  `trigger`; Android commands run on the main thread. https://v2.tauri.app/develop/plugins/develop-mobile/
- **Lynx**: native views per element; a custom element is a `LynxUI` subclass on each platform with `createView`, prop setters
  (`LYNX_PROP_SETTER`, `@LynxProp`) and custom events, registered by name. https://lynxjs.org/guide/custom-native-component.html

**The lesson across all of them**: the self-drawing engines (Flutter, Compose) converged on the same three native bridges (text
input, accessibility, platform views for leaves) and adapt *behaviour* automatically while the *look* is a library that must be
updated after each OS redesign. The native-view engines (RN, MAUI, Lynx) get fidelity for free but pay per platform in bugs and
never run where those toolkits do not exist. Everyone generates the native glue from one typed spec and, the mature ones, the native
project too.

## 4. Recommended architecture

### 4.1 Decision A: where fidelity comes from (RULES §4, max 70)

| Option | Fit x3 | Perf x3 | Size x2 | Maint x2 | Licence x2 | Port x1 | Effort x1 | Total |
|---|---|---|---|---|---|---|---|---|
| **Own drawing + platform profile (behaviour, tokens) + native leaves and bridges** | 5 | 5 | 4 | 4 | 5 | 5 | 3 | **64** |
| Own drawing, one look and one behaviour everywhere | 2 | 5 | 5 | 5 | 5 | 5 | 5 | 61 |
| Native widgets for host components (RN/MAUI) | 2 | 3 | 3 | 2 | 5 | 1 | 1 | 37 |

Native widgets would break the Pi, ESP32, webOS and pixel goldens (RULES §1); "one look" ignores the owner's question.

### 4.2 (a) What Zinc imitates in its own drawing: the platform profile

One value, `ui.platformStyle()`: `ios` | `android` | `macos` | `desktop`, defaulted from `platform()`, set by `zinc.json`
`"platformStyle"` or `ZINC_PLATFORM_STYLE` (tests). MNF #2 defines it; what this report adds:

- **Two layers, versioned separately in `lib/std/platform/`**: *behaviour* (scroll physics, fling stacking, overscroll, page and modal
  transitions, back and swipe-back, long-press and selection gestures, press feedback, haptic cues, keyboard return and Tab
  behaviour, scrollbars) is automatic and not themeable; *look* (radii, shadows, control sizes, font family, motion durations) is
  tokens the kits read and an app may override. Flutter's decoupling shows the look is what changes each WWDC; tokens make that a
  data change in lib, not an engine change.
- **Adaptive by default** in the kits and zinc:react-native (`Switch`, `Button`, `ActivityIndicator`, `RefreshControl`, `Alert`,
  checkboxes, sliders, menus): Flutter makes the developer opt in; Zinc's users (education, makers) should not have to know.
  `variant="neutral"` keeps today's look for apps with their own design. Nuxt UI and shadcn kits keep their brand look and take
  only the behaviour layer and the system font.
- **macOS counts as a platform**: system font (SF through CoreText at run time), accent colour, native context menus by default,
  Cmd shortcuts, overlay scrollbars, no rubber band on non-trackpad wheels [unverified: SDL's precise-scroll flag].
- **Proof without a device**: goldens per profile under `ZINC_PLATFORM_STYLE`, a scripted fling with the virtual clock against the
  published curves (MNF #6), as Flutter's `debugDefaultTargetPlatformOverride`.

### 4.3 (b) What Zinc delegates to real native components

The rule: **delegate what the OS owns or mediates; draw what lives inside the app's content.**

| Delegate (native) | Why | Draw (Zinc) | Why |
|---|---|---|---|
| Menu bar, dock, tray, notifications, status bar style, share sheet | system chrome, outside the window | buttons, switches, lists, tabs, navigation, sheets, dialogs inside the app | one renderer, goldens, every target |
| Photo, document, contact pickers; permission prompts; paste prompt | privacy: the OS grants access only through its own UI (PHPicker, SAF) | date/time pickers (drawn per profile; native as an option, MNF #12) | they live in the content |
| Text input client (IME, autocorrect, dictation, autofill) | only the OS has the IME | the text, caret, selection, handles, magnifier | Flutter and Compose draw these too |
| Accessibility tree to VoiceOver/TalkBack | screen readers read only native APIs | the focus ring, the visual state | - |
| Web content, ads, payment sheets, platform map SDKs when required by licence | a browser engine or a vendor SDK | video, camera preview, MVT maps, 3D | already decoded into Zinc images, so they clip, scroll and composite for free |

**Decision B: compositing native views with Zinc's frame**

| Option | Fit | Perf | Size | Maint | Licence | Port | Effort | Total |
|---|---|---|---|---|---|---|---|---|
| **Overlay: native view above the surface at its node's laid-out rect; Zinc content never drawn over it (hidden or snapshotted while a Zinc overlay covers it)** | 4 | 5 | 5 | 5 | 5 | 4 | 5 | **66** |
| Hybrid: split the Zinc frame into layers below and above each native view (several surfaces) | 5 | 3 | 4 | 2 | 5 | 3 | 1 | 50 |
| Texture: native view drawn into a texture Zinc composites (Android TextureView/VirtualDisplay) | 3 | 2 | 4 | 2 | 5 | 1 | 2 | 40 |

The texture route has no general iOS equivalent; hybrid is what costs Flutter frame rate (merged threads) and needs API 34 + Vulkan
for its fast form, beyond a Nexus 7. The overlay is what `plugins/webview` does on macOS today; it must become a layout element:

- `<NativeView kind="webview" props={...} />` is a zinc:ui leaf. After layout, the host sends the plugin the node's rect in
  logical px, its clip (the intersection of scroll ancestors), visibility and opacity, **only when they change**. macOS: an NSView
  subview of the SDL content view (done); iOS: a UIView subview of SDL's view controller's view; Android: a child of SDLActivity's
  `mLayout` (a RelativeLayout holding the SDLSurface, `SDLActivity.java:460` in the vendored SDL3), above the SurfaceView.
- Known costs, accepted and documented: the native view moves one frame late during a scroll (so no native views inside scrolling
  lists); no Zinc popover over it (the layer system hides it, or swaps in a snapshot as Flutter suggests); no shaders, blur or
  rounded clips applied to it beyond a rectangle (iOS: `layer.cornerRadius` is cheap and can be offered).
- Gestures: a touch inside the rect goes to the native view; zinc:ui's gesture arena does not see it.

### 4.4 (c) The plugin model that stays maintainable

What Zinc has, mapped to the references:

| Reference piece | Zinc today |
|---|---|
| Federated app-facing package | the plugin's `index.ts` (`plugins/webview/index.ts`) |
| Platform interface / Codegen spec | `native/<x>.spec.ts` (`plugins/webview/native/webview.spec.ts`), checked at call time by signature letters (`docs/reports/zinc-next-native-abi.md`) |
| Pigeon / Codegen output | `zinc native-gen` -> `zinc_native_<x>.h` + thunk (C++ only) |
| Per-platform implementations | `<x>.host.cpp`, `<x>.<target>.cpp`, `src/*.mm`, selected by `plugin.json` `targets` |
| Op table for wide APIs | `plugins/system/ops.json` -> `ops.d.ts`, `ops.gen.h`, permission ids, simulator results (`tools/system-ops`, `tests/t0/system_ops.sh`) |
| Mock / test implementation | `<x>.sim.ts`, recording simulator, deterministic runs |
| Permissions | `zinc.json` `permissions`, checked at compile time and natively |
| CNG | `zinc export --target android` regenerates from SDL's template each time |

What to add, in order:

1. **Mobile targets in `plugin.json`**, declarative, merged by `zinc export` (Expo's config plugins without code):
   `"android": { "sources": ["native/android/WebviewPlugin.java"], "gradle": ["androidx.webkit:webkit:1.x"], "manifest": { "permissions": [...], "queries": [...], "application": "<xml fragment>" }, "minSdk": 24 }`,
   `"ios": { "sources": ["native/webview.ios.mm"], "frameworks": ["WebKit"], "plist": { "NSCameraUsageDescription": "..." }, "entitlements": {...}, "spm": [...] }`.
   An app adds raw fragments the same way under `zinc.json` `targets.android` / `targets.ios` (Expo's `ios.infoPlist`). No
   imperative hooks until a real plugin cannot be expressed this way.
2. **Generated glue for Java and Objective-C (Decision C)**, from the same `spec.ts`: `zinc native-gen --android` writes a Java
   interface and the JNI thunk; `--ios` an Objective-C protocol and the thunk. The author implements the interface in Java or
   Kotlin and the protocol in ObjC or Swift (`@objc`). Callbacks and promises keep the native ABI's `cb_post` / `promise_resolve`,
   so threads stay safe (Tauri's note: Android commands land on the main thread; long work must move off it).

   | Option (Decision C) | Fit | Perf | Size | Maint | Licence | Port | Effort | Total |
   |---|---|---|---|---|---|---|---|---|
   | **Generated Java + ObjC glue; author writes Java/Kotlin and ObjC/Swift** | 5 | 5 | 5 | 4 | 5 | 4 | 3 | **65** |
   | Generated Kotlin + Swift glue (Expo DSL) | 5 | 4 | 3 | 4 | 5 | 3 | 2 | 56 |
   | C++ only, JNI and `objc_msgSend` by hand (webview.mm style) | 3 | 5 | 5 | 2 | 5 | 4 | 4 | 56 |

   Java and ObjC need no extra compiler or runtime (SDL's glue is already Java and ObjC); Kotlin and Swift remain the author's choice.
3. **Lifecycle subscribers**: the generated `ZincActivity` and app delegate forward `onNewIntent`, `onActivityResult`,
   permission results, `openURL`, push tokens and background events to every plugin that declares them (Expo's native subscribers),
   so no plugin edits the shell.
4. **One plugin per domain with backends per platform**, as `zinc:system` (one op table, `sim`/`macos`/`linux` backends, D-record in
   `system-integration.md` §3): add `ios` and `android` backends to `zinc:system` for what exists there (notifications, share,
   pickers, clipboard, opener, deep links, haptics) instead of new plugins. The op table already generates typings, the permission
   gate and the simulator; extend `tools/system-ops` to emit the Java/ObjC dispatch stubs.
5. **Tests per platform without a device**: every plugin keeps its `sim.ts`; the generated project tree is a golden (ZN-623 #1);
   the same TS test runs on the Android emulator and the iOS simulator in the cross-platform pass.
6. **Keeping up with OS releases**: one pins table (NDK, AGP, Gradle, compile/target SDK, min API, Xcode, min iOS: the constants
   `kNdk`, `kAgp`, `kGradle`, `kMinSdk` already in `cli_core.cpp`) shown by `zinc doctor`, bumped once a year after WWDC and the Android
   release (Expo's SDK table); SDL3 updates absorb most shell changes; looks are tokens (4.2). A bump shows as a golden diff of the
   generated projects.

### 4.5 (d) Making it easy

- **One command**: `zinc run --target android|ios` = export, Gradle or xcodebuild, install (adb, simctl), launch, logs; and the
  player app (ZN-631, "Zinc Go") so a beginner sees a phone run without Android Studio or Xcode.
- **Defaults**: adaptive profile on, system font, dark mode `auto` wired by the host (not by the app), safe areas and back handled by
  the kits' screens, permissions inferred from imported modules and named by `zinc check`.
- **Escape hatches, narrowest first**: `Platform.select` and `Platform.OS` (fixed, MNF #1); platform files `x.ios.tsx` /
  `x.android.tsx` / `x.native.tsx` (ZN-745); `ui.platformStyle` forced per subtree; a plugin's per-target native file; raw manifest
  and plist fragments in `zinc.json`. Never "eject and edit the generated project".

## 5. Next steps, ranked

Sizes: S (a day), M (days), L (a week+). Backlog frozen: existing tasks are named; the rest are `later.md` lines.

| # | Step | Size | Files | Task |
|---|---|---|---|---|
| 1 | Platform identity: `platform()` = `ios`/`android`, `Platform.select` branches, `Version`, coarse pointer at start | S | `next/src/host/sys_host.cpp:570`, `lib/std/react-native.tsx:115-130` | MNF #1 (ZN-625 area) |
| 2 | Platform profile with behaviour and look layers, adaptive kits by default, goldens per profile | M | `lib/std/ui.ts`, new `lib/std/platform/{ios,android,macos}.ts`, `lib/std/kit/*.tsx`, `lib/std/react-native.tsx` | MNF #2, #11 |
| 3 | System signals fed by the host on all three: theme (`SDL_GetSystemTheme`, default `auto`), accent colour, safe area, font scale, locale, reduce motion, back | M | `targets/macos/hal_sdl.cpp`, `next/src/app/shell_sdl.cpp`, `ui.ts:1764-1769`, RN `Appearance` | ZN-625 |
| 4 | Mobile plugin model: `android`/`ios` in `plugin.json` (sources, gradle, manifest, plist, entitlements), `native-gen --android/--ios`, lifecycle subscribers, refuse a plugin without the target | L | `next/src/tc/plugin_build.*`, `next/src/cli_core.cpp:975-1080` (move Android export to its own file), ZN-623 generator, `next/src/frontend` manifest parser | ZN-628 |
| 5 | `<NativeView>` element + webview ported to it, then Android WebView and iOS WKWebView | M | `lib/std/ui.ts`, `next/src/host/gfx_host.cpp`, `plugins/webview/{index.ts,native/,src/}` | ZN-628 (webview), MNF #12 |
| 6 | Text input connection: macOS marked text first (`SDL_EVENT_TEXT_EDITING`), then Android InputConnection, iOS UITextInput | L | `targets/macos/hal_sdl.cpp`, `ui.ts` text fields, shell Java/ObjC | ZN-626, MNF #4 |
| 7 | `zinc:system` backends for phones: notifications (UNUserNotificationCenter shared with macOS), share sheet, photo/document pickers, haptics, opener, deep links; flip `capabilities.json` | M | `plugins/system/ops.json`, `native/system.ios.mm`, `native/android/*.java`, `targets/capabilities.json` | ZN-628 |
| 8 | Kit `ContextMenu` uses `menu.popup` when `menu.native` (as `MenuBar` does) | S | `lib/std/kit/menubar.tsx:136`, nuxt `ContextMenu` | later.md |
| 9 | System UI font at run time (CoreText on macOS/iOS, Android system fonts) as the profile's default `font-sans` | S | `next/src/text/`, `ui.ts:2508` | MNF #10 |
| 10 | Accessibility: tree ids and actions, macOS NSAccessibility first, AccessKit checked before the phone bridges | L | `ui.ts`, host | ZN-630, MNF #8 |
| 11 | Pins table + `zinc doctor` row + yearly bump checklist + generated-project goldens | S | `next/src/cli_core.cpp` constants, `docs/targets/` | later.md |
| 12 | `zinc run --target android|ios` in one command; the player | M | `next/src/cli_core.cpp`, `next/src/dev` | ZN-631 |

Top five by value per effort: **1, 3, 2, 4, 5**. Step 1 is a day and unblocks every per-platform rule; 3 makes the first run look
right (dark mode, notch, back); 2 makes the feel right on Android and iOS; 4 and 5 are what lets anyone add native features without
touching the engine.

## 6. What NOT to do

- **No native widgets for host components** (RN, MAUI): it breaks the one renderer that runs on the Pi, ESP32, webOS and the goldens.
- **No pixel-perfect Cupertino or Material clones** chasing each redesign: Flutter needed a whole decoupling to keep pace and still
  had no Liquid Glass after a year. Copy behaviour; keep the look as tokens.
- **No hybrid composition** (Zinc layers above and below native views): Flutter's most expensive mode; out of reach of GLES 2 devices.
- **No native views inside scrolling lists**, and no video, camera or maps as native views where Zinc already decodes or draws them.
- **No hand-written string channels**: every native call goes through a generated spec (spec.ts or an op table).
- **No hand-maintained or committed `android/` and `ios/` trees**, no imperative project-editing hooks; regenerate (CNG).
- **No second HAL per platform** while SDL3 does the job (D59), no `dlopen` on phones, no new plugin per small feature when a
  domain plugin with backends exists (`zinc:system`, `system-integration.md` §3).
- **No native text field drawn over Zinc's** to get the IME: mirror the state into a hidden native client and keep drawing the text.

## 7. Not verified

- Nothing was built or run for this report; no phone, emulator or simulator.
- SDL3's iOS view controller as the place to add subviews, and how a view over the Android SurfaceView behaves on API 25.
- Compose Multiplatform 1.11's UIView text input: from a secondary source (the JetBrains post returned HTTP 403).
- Whether SDL reports precise (trackpad) versus wheel scrolling on macOS well enough for per-device physics.
- The Expo autolinking and config-plugin pages were cited, not re-read; the CNG page was.

## 8. Lines for `next/backlog/later.md` (the coordinator adds them)

- Native fidelity: a platform profile in two layers, behaviour (automatic) and look (tokens in `lib/std/platform/`), adaptive by default in the kits and zinc:react-native; macOS is a profile too (system font, accent, native context menus) (docs/reports/native-fidelity-and-plugins.md 4.2).
- ZN-628: a `<NativeView>` zinc:ui leaf whose rect, clip and visibility the host forwards to a native view above the surface (NSView/UIView subview, Android view over SDL's SurfaceView), hidden or snapshotted under Zinc overlays; port `plugins/webview` to it (4.3).
- ZN-628: `plugin.json` `android`/`ios` entries with sources, gradle deps, manifest and plist fragments, entitlements, merged by `zinc export`; `zinc native-gen --android/--ios` writes Java-interface and ObjC-protocol glue from the spec; lifecycle subscribers in the generated activity and app delegate (4.4).
- ZN-628: `zinc:system` gets `ios` and `android` backends (notifications, share, pickers, haptics, opener, deep links) on the same op table; `tools/system-ops` emits their dispatch stubs (4.4).
- Native fidelity: the kit `ContextMenu` uses `menu.popup` when `menu.native`, as `MenuBar` does (lib/std/kit/menubar.tsx:136) (5 #8).
- Native fidelity: one pins table (NDK, AGP, Gradle, SDK levels, Xcode, min iOS) shown by `zinc doctor`, bumped yearly after WWDC and the Android release, with goldens of the generated projects (4.4 #6).
