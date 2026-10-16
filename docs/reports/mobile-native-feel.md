# A native feel on Android and iOS: what Zinc fakes today, and the plan

Date: 2026-10-16. Asked by the owner: "how can the Android and iOS ports get the most native feel, like React Native or Flutter? I feel we
fake a lot of things." Research and audit only: no code changed. Builds on `zinc-next-mobile-spike.md` (D59), `zinc-next-mobile-core.md`
and `zinc-next-android.md` (the Nexus 7 runs). Every "today" below was read in the code of main at `0920d25b`; nothing was run on a device.

## 1. Verdict

The owner is right, and the fakes fall into three kinds:

1. **The app does not know it is on a phone.** `platform()` answers `linux` on Android and would answer `macos` on iOS
   (`next/src/host/sys_host.cpp:570`, only `__APPLE__` is tested). `Platform.select` has no `ios` or `android` branch
   (`lib/std/react-native.tsx:119`). So every per-platform rule anyone writes today is dead code on the phones.
2. **One behaviour for every platform, and it is iOS's.** The scroll physics are iOS's (rubber band, 0.998/ms deceleration), the React
   Native `Button`, `Switch` and `ActivityIndicator` draw iOS on Android too, the `Modal` slides like iOS. An Android user feels it at the
   first fling.
3. **The OS hooks exist in zinc:ui, but nothing feeds them.** `env(safe-area-inset-*)`, `ui.setSafeArea`, `ui.setKeyboardInset`,
   `ui.setScheme('auto')`/`setSystemScheme` and `ui.setRootFontSize` are all there (`lib/std/ui.ts:1696-1767`). On a phone none of them
   receives the system's value. SDL3 already reports most of these values (safe area, theme, on-screen keyboard, locale); the HAL ignores them.

Two things are missing outright and cannot be faked: a **text input connection** that keeps the IME in sync with the field, and an
**accessibility bridge**. Both are what Flutter spent years on. They are the large items of the plan.

What is good already: gesture arbitration (Qt-style, `docs/ui.md` "Gestures"), the release-velocity estimator (least squares over 100 ms),
the 44 px finger reach for small targets (`ui.ts:4566`), the 8 px slop, the precise-scroll resampling, rotation as a resize, the
in-app keyboard reveal logic, and the accessibility tree as text (`ui.inspect()`).

## 2. Audit against the fidelity checklist

Status: **Done**, **Partial** (what is faked), **Missing**. "Device" means the claim needs a phone to settle.

### 2.1 Platform identity

| Item | Status | Today |
|---|---|---|
| `platform()` on the phones | Missing (bug) | `sys_host.cpp:570`: `macos` under `__APPLE__`, else `linux`. Android gets `linux`; an iOS build would get `macos` |
| `Platform.OS`, `select`, `Version` | Partial | `react-native.tsx:112-126`: `select` knows `macos`, `web`, `native`, `default`; `ios`/`android` are never chosen; `Version` is `''` |
| Coarse pointer on a phone | Partial | `ui.ts:1722` decides `coarse` from `platform()`; on Android it turns true only at the first touch (`ui.ts:4966`), so the first frames lay out for a mouse |

### 2.2 Scroll physics

| Item | Status | Today |
|---|---|---|
| iOS rubber band and deceleration | Done | `ui.ts:4302-4311`: rubber band `(1 - 1/(x*0.55/dim + 1))*dim`, `v(t) = v0*0.998^ms`, critically damped bounce (omega 10/s), fling 100..8000 px/s. Text areas share it (`ui.ts:4123-4171`) |
| Android physics | Missing | No clamping mode, no spline fling (Android's `OverScroller`), no stretch overscroll (Android 12+) or glow (older); Android gets the iOS bounce |
| Per-scroller control | Missing | No `bounces`, `overScrollMode`, `decelerationRate` on `ScrollView` (`docs/react-native.md:31`); snap exists (`snap-*` classes) |
| iOS tap on the status bar scrolls to top | Missing | No status bar event |

### 2.3 Text input

| Item | Status | Today |
|---|---|---|
| Soft keyboard opens with focus | Partial | `hal_text_input` calls `SDL_StartTextInput` with the field's rect (`targets/macos/hal_sdl.cpp:1332`). Not proven on a device (ZN-626 open) |
| Keyboard type, return key, capitalisation, autocorrect | Missing | `keyboardType` only picks the layout of the in-app kit keyboard (`react-native.tsx:206-215`); `SDL_StartTextInputWithProperties` (type, capitalisation, autocorrect, multiline) is never called |
| IME composition (CJK, Gboard suggestions, swipe typing) | Missing | No `SDL_EVENT_TEXT_EDITING` handling anywhere. On Android SDL's `SDLInputConnection` keeps its own hidden buffer, turns composing text into committed text and backspace into scancodes (`third_party/SDL3/android-project/.../SDLInputConnection.java:58-70`): the IME never sees the field's real text or selection, so suggestions, autocorrect and composition degrade. iOS (SDL's hidden `UITextField`) not checked |
| Keyboard avoidance | Partial | `ui.setKeyboardInset` reveals the focused field and pads scroll areas (`ui.ts:1764`, `4487`), and RN `Keyboard`/`KeyboardAvoidingView` watch it, but only the in-app `kit/keyboard.tsx:139` sets it. SDL gives shown/hidden without a height, and only from API 30 (`SDLSurface.java:205-226`); the Nexus 7 is API 25 |
| Touch selection: handles, magnifier, system edit menu | Missing | Selection by mouse drag and keyboard shortcuts only (`ui.ts:4029-4041`); no long-press word selection, no handles, no magnifier, no Copy/Paste menu |
| Autofill, spellcheck | Missing | Nothing reaches the OS; both need the connection above |
| Secure fields | Partial | `password` masks and blocks copy (`ui.ts:4038`); the OS is not told (no secure keyboard, screenshots not blocked) |

### 2.4 Accessibility

| Item | Status | Today |
|---|---|---|
| Semantic tree | Partial | role, label, `aria-hidden`, disabled, as text (`ui.inspect()`, `ui.ts:1707`); no stable ids, bounds, actions, values, focus order or live regions |
| Bridge to VoiceOver / TalkBack | Missing | No bridge on any platform, the Mac included (no NSAccessibility code in the repo). ZN-630 (Backlog) covers the phones |
| Font scale (Dynamic Type, Android font size) | Missing | `ui.setRootFontSize` works, but no OS value reaches it; `PixelRatio.getFontScale()` returns 1 (`react-native.tsx:163`) |
| Reduce motion, bold text, increased contrast | Missing | Not read; no `prefers-reduced-motion` |

### 2.5 Navigation

| Item | Status | Today |
|---|---|---|
| Stack navigator | Missing | None in `lib/`; `examples/rn-showcase/src/nav.ts` hand-rolls tabs and a stack |
| Android back | Missing | `SDL_SCANCODE_AC_BACK` is not mapped to anything; without `kiosk` SDL lets the system finish the activity, whatever screen is shown (`next/src/app/shell_sdl.cpp:137-142`) |
| iOS edge swipe-back, Android predictive back | Missing | No interactive transition |
| Screen and modal transitions | Partial | RN `Modal` slide/fade, 300 ms ease-out cubic, same on both (`react-native.tsx:426`); nuxt `Slideover`; no bottom sheet with detents |

### 2.6 System integration

| Item | Status | Today |
|---|---|---|
| Safe areas, notch, cutouts | Partial | The CSS side is done (`env(safe-area-inset-*)`, `ui.setSafeArea`, `ui.ts:1767`); nothing calls it. `SafeAreaView` is a plain `View` (`react-native.tsx:103`). SDL3 has `SDL_GetWindowSafeArea` + `SDL_EVENT_WINDOW_SAFE_AREA_CHANGED` |
| Status and navigation bars | Missing | `StatusBar` renders nothing (`react-native.tsx:106`). Android: bars shown, or immersive with `fullscreen`/`kiosk`; no style, no colour, no edge-to-edge (Android 15 forces edge-to-edge on apps that target SDK 35) |
| System fonts | Partial | Inter by default; an app may ship Roboto (`docs/react-native.md:29`); "San Francisco cannot be shipped" is true, but it can be *used* from the system at run time, as every iOS app does; the emoji fallback reads macOS paths only (`next/src/text/shaped_gfx.cpp:38`) |
| Dark mode | Partial | `ui.setScheme('auto')` follows `setSystemScheme` (`ui.ts:1757-1762`); on macOS the app wires zinc:system `onAppearance` itself; RN `Appearance` reads only `ZINC_COLOR_SCHEME` (`react-native.tsx:167`). `SDL_GetSystemTheme` and `SDL_EVENT_SYSTEM_THEME_CHANGED` are unused |
| Accent colour | Missing | Not read (iOS tint, Android 12 dynamic colour) |
| Haptics | Missing on phones | `navigator.vibrate` reaches only the simulated device's panel (`sys_host.cpp:234`); no impact/selection/notification feedback |
| Orientation | Partial | `zinc.json` orientation goes to the manifest (`next/src/cli_core.cpp:1033`), rotation works as a resize on the Nexus 7; `screen.orientation.lock` acts only in the simulator |
| Touch slop, 44 pt targets | Done | 8 px slop, Qt-like arbitration, 44 px finger reach (`ui.ts:77`, `4566`) |
| Press feedback | Partial | `Pressable` highlights at once on pointer down (`react-native.tsx:40-48`): inside a list, the row flashes before the scroll takes the press (iOS waits about 100 ms in scroll views); no Android ripple; RN `Button`, `Switch`, `ActivityIndicator` are drawn iOS-style everywhere (`react-native.tsx:51-100`) |

### 2.7 Native components (platform views)

| Item | Status | Today |
|---|---|---|
| WebView | Partial (macOS only) | A real `WKWebView` placed over the surface (`plugins/webview/index.ts`, `src/webview.mm`): the pattern is right; its `plugin.json` targets macOS only |
| Pickers (date, time), menus, action sheets | Partial (drawn) | kit/nuxt `Select`, `DropdownMenu`, `ContextMenu` are drawn by Zinc; no date picker; nothing native |
| Alerts | Partial (drawn) | RN `Alert.alert` is an in-app dialog (`react-native.tsx:441`); zinc:system dialogs are macOS only |
| Share sheet, photo picker, document picker | Missing | No plugin; `capabilities.json` marks `dialogs: false` for `android` and `ios` |
| Maps, video, camera | Partial | Map and video are drawn by Zinc (correct for a Flutter-style engine); camera has no Android or iOS backend (`later.md`, zinc:camera lines). No plugin lists an `android` or `ios` target (ZN-628) |

### 2.8 Latency and theming

| Item | Status | Today |
|---|---|---|
| Touch-to-pixel latency | Not measured | Nexus 7: worst frame at a tap 42 to 52 ms (input 11, layout 10 ms), measured inside the engine (`zinc-next-android.md`); touch to photon never measured; touch events are not resampled at vsync (only the wheel is, `hal_sdl.cpp:539`) |
| Platform theming profiles | Missing | The kit theme is colours only (`lib/std/kit/theme.ts`); the `react-native` preset changes text size and colour (`ui.ts:20`, `2935`); no per-platform springs, durations, radii, fonts, shadows, transitions |

## 3. How Flutter and React Native get their feel

**Flutter** (own renderer, the model Zinc follows):

- *Behaviour keyed on `TargetPlatform`*: `ThemeData.platform` picks the scroll physics (`BouncingScrollPhysics` on iOS,
  `ClampingScrollPhysics` with a port of Android's spline fling and the stretch overscroll on Android), the page transitions
  (Cupertino slide with edge swipe-back; zoom or predictive back on Android), the text selection controls, the typography (system font
  on each), and haptics. Tests set `debugDefaultTargetPlatformOverride`: **both platforms are tested on any desktop**.
- *Two widget sets*: Material and Cupertino, plus `.adaptive` constructors (`Switch.adaptive`). Keeping Cupertino in step with each iOS
  redesign has been a known cost.
- *Text input*: the engine draws the text, but a **TextInputPlugin** holds a hidden native client (Android `InputConnection`, iOS
  `UITextInput`) that mirrors the editing state (text, selection, composing range) both ways. That is why IMEs, autocorrect, dictation,
  autofill (`AutofillGroup`) and spellcheck work. Handles and the magnifier are drawn per platform; on iOS the edit menu became the system
  one, partly because iOS asks the user before an app reads the clipboard unless the paste comes from system UI.
- *Semantics*: a `SemanticsNode` tree (rect, actions, flags, label, value, stable id) sent as updates to an accessibility bridge
  (`AccessibilityNodeProvider` on Android, `UIAccessibilityElement`s on iOS).
- *Platform views*: native views composited with Flutter's frame (Android hybrid composition and texture layer, iOS hybrid composition),
  used for web views, maps, ads. They cost frame time and complexity, so they are kept to leaves.

**React Native** (real native views):

- Every host component is a `UIView` or `android.view.View`; Fabric (a C++ shadow tree, Yoga, synchronous layout) mounts them. Scroll
  physics, text input, selection, autofill, accessibility, the back gesture (with react-native-screens' native stack) come from the OS for
  free and change with it.
- The costs: two looks to test, animations that must cross to the UI thread (Reanimated), views that differ by OS version, and it runs
  only where UIKit or Android views exist.

**What Zinc should copy**: Flutter's `TargetPlatform` (one behaviour profile, switchable on the desktop for tests); its text input
plugin (a native client that mirrors the field); its semantics tree and bridge; platform views for leaves only (web view, pickers,
share, photo picker); React Native's API shape (`Platform.select`, `BackHandler`, `Appearance`, native-stack options) so RN code ports
unchanged.

**What it should not copy**: React Native's native views for everything (it breaks the one renderer that runs on a Pi, an ESP32, webOS
and the pixel goldens); a pixel-perfect Cupertino clone that chases every iOS redesign (copy the *behaviour* and the tokens, keep the
look themeable); Flutter's general compositing of platform views under drawn content (an overlay above the surface, as the webview does
now, is enough for leaves).

## 4. Recommendation

Keep the own renderer. Add three layers, in this order:

1. **Identity and system signals**: the phones say who they are, and every value the OS gives (safe area, theme, font scale, keyboard
   height, back, locale, reduce motion) reaches the hooks zinc:ui already has.
2. **A per-platform behaviour layer** (`ui.platformStyle`: `ios` | `android` | `desktop`, defaulted from `platform()`, forced by
   `ZINC_PLATFORM_STYLE` for tests): scroll physics, transitions, press feedback, selection controls, fonts, haptics and the
   motion/shape tokens. The kit, the nuxt kit and zinc:react-native read it; the look stays the app's theme.
3. **Native where it cannot be drawn**: a text input connection, an accessibility bridge, and a small set of platform services and
   views (web view, date/photo/document pickers, share sheet, native alert as an option).

This is Flutter's split. It keeps one renderer, one layout and the pixel goldens, and every behaviour can be tested on the Mac.

## 5. Ordered plan

Sizes: S (a day or less), M (a few days), L (a week or more). "Desktop proof" runs on the dev Mac now; "device" waits for the
cross-platform pass. Existing tasks are named; everything else is a line for `later.md` (backlog frozen).

| # | Item | Size | Depends | Desktop proof | Needs a device |
|---|---|---|---|---|---|
| 1 | **Platform identity**: `platform()` returns `android` / `ios` (`__ANDROID__`, `TARGET_OS_IPHONE`); `Platform.select` `ios`/`android`; `Platform.Version` (API level, iOS version); `coarse` true from the start on phones | S | none | T0: a program prints `Platform.OS` and a `select` under the new override | that the AOT app reports it |
| 2 | **Behaviour profile** `ui.platformStyle` + `ZINC_PLATFORM_STYLE`, tokens per profile (springs, durations, radii, shadows, font family, press style) | M | 1 | headless phone-size `ZINC_SHOT` goldens, one per profile | no |
| 3 | **System signals** (widens ZN-625): safe area, system theme + `Appearance` + default `auto`, font scale (JNI `Configuration.fontScale`, `UIContentSizeCategory`) into `setRootFontSize`, reduce motion, locale change, `AC_BACK` into a `BackHandler` chain, status bar style | M | 1 | `ZINC_INPUT` events `safe-area`, `theme`, `font-scale`, `back` with goldens; `devices/iphone.json` and `devices/android-phone.json` for `zinc run --simulate` with insets and a cutout | real insets, API < 30 (no insets from SDL), rotation |
| 4 | **Text input connection** (widens ZN-626): our own Android `InputConnection` and iOS `UITextInput` client mirroring text, selection and composing range; keyboard traits from props (type, return key, capitalisation, autocorrect, secure, autofill hints); keyboard height and its animation into `setKeyboardInset`; composing underline drawn by zinc:ui | L | 1 | `SDL_EVENT_TEXT_EDITING` on macOS + a `ZINC_INPUT compose` golden (ZN-626 #2); a unit test of the state sync against a fake client | Gboard, swipe typing, a Japanese IME, dictation, a password manager |
| 5 | **Touch selection**: long press selects a word, handles, magnifier per profile; the system edit menu (`UIEditMenuInteraction`, Android floating `ActionMode`) for Copy/Paste | M | 2, 4 | scripted long press + drag, goldens of handles and magnifier | the system menu, iOS paste prompt |
| 6 | **Android scroll physics**: spline fling (Android's `OverScroller` / Flutter's `ClampingScrollSimulation`), stretch overscroll (12+) or glow; `bounces`, `overScrollMode`, `decelerationRate`; iOS status-bar tap to top | M | 2 | a scripted fling under `ZINC_CLOCK=virtual`: offsets per frame against reference curves computed from the published formulas, a golden per profile | side by side with a native list |
| 7 | **Navigation stack**: push/pop with per-profile transitions, interactive iOS edge swipe-back, Android predictive back (`OnBackAnimationCallback`, API 34+) and the plain back key, modal and bottom sheets with detents; a native-stack-shaped API for RN ports | M | 2, 3 | scripted edge swipe, goldens mid-gesture and at rest; `back` event pops | predictive back animation |
| 8 | **Accessibility** (ZN-630, needs more first): tree with stable ids, bounds, values, actions, focus; diffs per frame; the macOS NSAccessibility bridge first (testable here), then Android `AccessibilityNodeProvider` and iOS `UIAccessibilityElement` | L | 2 | T0 tree-diff golden; on the Mac an AX dump (Accessibility Inspector or a script) equals `ui.inspect()` | TalkBack, VoiceOver, `uiautomator dump` |
| 9 | **Haptics**: `impact(light/medium/heavy)`, `selection`, `notification`, RN `Vibration`; Android `View.performHapticFeedback`, iOS `UIFeedbackGenerator`; the kit fires them per profile (switch, long press) | S | 2 | the simulated device's panel records each call (`sys_host.cpp:234` pattern), golden of the log | the feel |
| 10 | **System fonts**: load the platform UI font at run time (Android `/system/fonts` through `fonts.xml`; iOS and macOS through CoreText's UI font), emoji fallback per platform | S | 2 | the CoreText path on macOS, golden of a text sample | Android font paths |
| 11 | **RN components per profile**: Android looks for `Button`, `Switch`, `ActivityIndicator`, `RefreshControl`, `TouchableNativeFeedback` (ripple); a short press delay inside scroll views | S | 2 | goldens per profile | no |
| 12 | **Platform services and views** (with ZN-628): a `NativeView` host element generalising the webview overlay; web view on both phones; date/time picker, photo picker (`PHPickerViewController`, Android Photo Picker), document picker, share sheet, native alert as an option | L | 1 | sim stubs that answer scripted results (the `webview.sim.ts` pattern) | all of the real ones |
| 13 | **Latency**: an engine trace from the touch timestamp to the present; touch resampling at vsync (as the wheel); then the GPU path (ZN-627) | S + device | 3 | the resampler as a unit test on recorded touches | touch-to-photon numbers (a 240 fps camera) |

Top five, by what the owner will feel first: **1** (cheap, and every other item keys on it), **3** (safe areas, dark mode, back: the
first-run look), **4** (typing is where a self-drawn UI is found out at once), **6** (the first fling on Android), **7** (back and
swipe-back are muscle memory). Then 8 (accessibility, a legal requirement for some apps under the European Accessibility Act),
2/11 underpin all of it and are done along the way.

## 6. Testing without a device

- **Behaviour**: `ZINC_PLATFORM_STYLE=ios|android` on the desktop runs the other platform's behaviour; every profile gets its goldens,
  as Flutter's `debugDefaultTargetPlatformOverride` does.
- **Input**: `ZINC_INPUT` (touch, touchup, keys, text: `next/src/host/hal_dispatch.cpp:53`) extended with `safe-area`, `theme`,
  `font-scale`, `back`, `keyboard <height>`, `compose`; headless, deterministic, with a virtual clock for physics.
- **Devices**: `devices/phone.json` exists for `zinc run --simulate` (390 x 844, no insets); add an iPhone-like and an Android-like file
  with insets, a cutout, a home indicator and their profile.
- **Real IME and accessibility** cannot be simulated honestly: they need the Android emulator (x86_64 images run on this Mac) and the
  iOS simulator (uncertain on Intel, spike §10), then a device for the feel and the latency.

## 7. Not verified

- Nothing ran on a phone, emulator or simulator for this report; the Nexus 7 facts come from `zinc-next-android.md`.
- SDL's iOS text input (hidden `UITextField`, marked text) was not read; SDL's Android `SDLInputConnection` was read in the vendored tree.
- The Flutter and React Native descriptions are from general knowledge of their architecture, not re-checked against today's docs (the
  platform view modes and the Cupertino maintenance plans change between releases).
- Whether AccessKit (a Rust accessibility library with macOS, Windows and Linux adapters) covers Android and iOS well enough to vendor,
  rather than writing the two bridges: to check before item 8 (proven-library rule).
- Android's spline fling and stretch constants were not copied here; item 6 takes them from AOSP's `OverScroller` and Flutter's
  `ClampingScrollSimulation`, with their licences.

## 8. Lines added to `next/backlog/later.md`, "Cross-platform pass"

- Mobile feel: `platform()` answers `linux` on Android and `macos` on iOS (sys_host.cpp), `Platform.select` has no `ios`/`android` branch and `Platform.Version` is empty: every per-platform rule is dead on phones; return the real ids (docs/reports/mobile-native-feel.md item 1).
- Mobile feel: a behaviour profile `ui.platformStyle` (ios, android, desktop) with `ZINC_PLATFORM_STYLE` to force it in tests: scroll physics, transitions, press feedback, selection controls, font, haptics, motion and shape tokens; the kits and zinc:react-native read it (item 2).
- ZN-625: feed the hooks zinc:ui already has: `SDL_GetWindowSafeArea` into `ui.setSafeArea`, `SDL_GetSystemTheme` into `setSystemScheme` and RN `Appearance` (default `auto`), the OS font scale into `setRootFontSize` and `PixelRatio.getFontScale`, reduce motion, `AC_BACK` into a `BackHandler` chain, status bar style; Android below API 30 gets no insets from SDL (item 3).
- ZN-625: `devices/iphone.json` and `devices/android-phone.json` for `zinc run --simulate`, with safe-area insets, a cutout and their behaviour profile, so phone layouts are proven on the Mac (item 3).
- ZN-626: SDL's Android `SDLInputConnection` hides the field's text from the IME (composing text committed as diffs, backspace as scancodes): write our own `InputConnection` and iOS `UITextInput` client mirroring text, selection and composing range, with keyboard traits from the props and the keyboard height into `setKeyboardInset` (item 4).
- ZN-626: touch text selection: long press selects a word, handles and magnifier per profile, the system edit menu for Copy/Paste (iOS asks before a paste that does not come from system UI) (item 5).
- Mobile feel: Android scroll physics (spline fling of `OverScroller`, stretch overscroll on 12+, glow before), `bounces`/`overScrollMode`/`decelerationRate` on ScrollView, iOS status-bar tap to top; today every platform gets the iOS rubber band (item 6).
- Mobile feel: a navigation stack in lib with per-profile transitions, interactive iOS edge swipe-back, Android predictive back (API 34+) and the back key, bottom sheets with detents; rn-showcase hand-rolls its stack in `src/nav.ts` (item 7).
- ZN-630: the tree needs stable ids, bounds, values, actions and per-frame diffs before any bridge; do the macOS NSAccessibility bridge first (provable on the Mac), check AccessKit before writing the phone bridges (item 8).
- Mobile feel: haptics (`impact`, `selection`, `notification`, RN `Vibration`) on `View.performHapticFeedback` and `UIFeedbackGenerator`, fired by the kit per profile; today `navigator.vibrate` reaches only the simulator's panel (item 9).
- Mobile feel: use the platform UI font at run time (Android `/system/fonts` via `fonts.xml`, CoreText's UI font on iOS and macOS) and the platform emoji font; today Inter, and the emoji fallback reads macOS paths only (item 10).
- Mobile feel: zinc:react-native `Button`, `Switch`, `ActivityIndicator`, `RefreshControl` draw iOS on every OS; add the Android looks and `TouchableNativeFeedback`, and a short press delay in scroll views so rows do not flash when a scroll starts (item 11).
- ZN-628: a `NativeView` host element generalising the webview overlay, then the web view, date/time picker, photo and document pickers, share sheet and an optional native alert on both phones (item 12).
- ZN-632: measure touch-to-photon on a phone (engine trace from the touch timestamp to the present, then a 240 fps camera) and resample touches at vsync as the wheel is (item 13).
