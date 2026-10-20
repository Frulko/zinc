# Zinc Next: screen reader bridges on iOS and Android (ZN-630)

zinc:ui draws every pixel itself, so VoiceOver and TalkBack see nothing unless the app describes its screen to them. The accessibility tree
of ZN-276 (`ui.inspect()`: roles, labels, `aria-hidden`, disabled) now reaches them, the way Flutter's semantics bridge does
(`SemanticsObject.mm` on iOS, `AccessibilityBridge.java` on Android). User docs: `docs/ui.md` "Screen readers".

## How it works

| Piece | Where | What |
|---|---|---|
| the tree, its changes | `lib/std/ui.ts` (`syncA11y`) | while a reader listens, after each painted frame: the nodes `inspect()` lists, less the hidden ones, open layers after the tree (a modal one hides it); one line per node that changed, `n ID PARENT FLAGS X Y W H\tROLE\tLABEL\tVALUE\tHINT` (box on the surface in logical pixels, cut by its scroll areas; an off-screen node has no box), `d ID` for a node gone, `o ID...` for the reading order; sent through zinc:sys `device('a11y', lines)` |
| the reader's actions | `lib/std/ui.ts` (`systemSignal`) | `a11y 0\|1` (one listens), `a11yactivate ID` (a field takes the focus, a button is pressed, with the pressed feedback), `a11yfocus ID` (the node is scrolled into view), `a11yscroll ID 1\|-1` (a page); `addSignalListener` sees them |
| Android | `src/app/android/java/dev/zinc/app/ZincAccessibility.java` | an `AccessibilityNodeProvider` on SDL's `SDLSurface` (`View.AccessibilityDelegate`): one virtual view per node with its parent and children, widget class per role (Button, TextView, EditText, CheckBox, Switch, ScrollView...), `contentDescription` or `text`, hint, checked, selected, enabled, visible to user, bounds on screen; ACTION_CLICK, ACTION_(CLEAR_)ACCESSIBILITY_FOCUS, ACTION_SCROLL_FORWARD/BACKWARD come back as signals; touch exploration (a finger over a node) through the surface's hover listener; one `TYPE_WINDOW_CONTENT_CHANGED` per update |
| iOS | `src/app/ios_a11y.mm` (called from `ios_glue.mm`) | a container view over SDL's view (`hitTest` returns nil: touches go through) whose `accessibilityElements` are `UIAccessibilityElement`s in reading order; a node that takes clicks holds its descendants (their text is its label), as a `UIButton` holds its label; traits from role and flags (button, link, header, image, static text, search field, tab bar, not enabled, selected, toggle button on iOS 17); `accessibilityActivate`, `accessibilityElementDidBecomeFocused` and `accessibilityScroll:` come back as signals; `UIAccessibilityLayoutChangedNotification` when the structure changes |
| when to send | both hosts | `a11y 1` when VoiceOver or Switch Control runs (`UIAccessibilityIsVoiceOverRunning`, `...SwitchControlRunning` and their notifications), when `AccessibilityManager.isEnabled()` (and its listener), or when a client reads the tree the host did not announce (XCUITest, Voice Control, an instrumentation's UiAutomation): Flutter's `isAccessibilityElement` trick |
| tools | `tools/a11y-tree` | the tree from `inspect()`, from the log of what was sent (`ZINC_DEVICE_LOG`), from `uiautomator dump` and from XCUITest's `debugDescription`, in one form to diff; `ZINC_INSPECT=N` prints `inspect()` at frame N |

`inspect()` changed with it: a plain box that takes clicks (React Native's `Pressable`) is listed as `button` (it was `node` or absent), and
open layers are listed after the tree, a modal one alone. `tests/t1/ui_a11y.sh` is unchanged.

## The bridge decision (text for the coordinator's decision record)

**Question.** How does zinc:ui's tree reach VoiceOver and TalkBack? **Choice: our own bridge per phone, fed by a text diff zinc:ui sends
through zinc:sys `device('a11y')` only while a reader listens, Flutter's model: virtual views of SDL's surface through an
`AccessibilityNodeProvider` on Android, `UIAccessibilityElement`s of a container over SDL's view on iOS; focus, activate and scroll come back
as system signals. A node that takes clicks folds its descendants on iOS (UIKit's convention); TalkBack does it itself on Android.**
Scored (RULES §4, max 70): own bridges over a text diff 63 (fit 5, perf 4, size 5, maintainability 4, licence 5, portability 4, effort 4);
AccessKit 41 (Rust: the C bindings need a Rust toolchain or prebuilt libraries per target, no iOS adapter, its Android adapter is young;
it remains the candidate for macOS, Windows and Linux); one hidden native view per node 38 (thousands of UIViews/Views, layout twice, the
cost the bridge avoids). Evidence below. Revisit when AccessKit gains an iOS adapter, or for macOS (NSAccessibility) and the desktops.

## Proofs (2026-10-17)

- `tests/t0/ui_a11y_bridge.sh` (tests/golden/ui-a11y-bridge): what the host is told frame by frame (the whole tree, a press by the reader
  that changes a label and a checkbox, the cursor on the last row scrolling it in, a page back, a modal dialog hiding the tree and giving it
  back, nothing after `a11y 0`); interpreter and AOT give the same output; the tree rebuilt from the log equals `inspect()`.
- **AC1, Android** (emulator AVD Pixel_10, API 37; the screen set to 1080x6000 so every node is on screen, since `uiautomator dump` skips the
  ones that are not visible to the user): `uiautomator dump` of rn-showcase under SDL's SurfaceView, through `a11y-tree uiautomator`, equals
  `inspect()` of the same app on the Mac (`ZINC_PLATFORM=android SHOWCASE_LANG=en`, 360x2000, fresh storage, `SHOWCASE_NET=mock` on both):
  Home 49 nodes, Forms 71 nodes, same roles, labels and nesting (empty diff).
- **AC1, iOS** (simulator iPhone 17, iOS 26.3, `xcodebuild test`, Simulator.app never opened): XCUITest's element tree of rn-showcase,
  through `a11y-tree ios`, equals `inspect()` on the Mac (`ZINC_PLATFORM=ios`, 402x874) flattened and folded as iOS lists it
  (`a11y-tree inspect --ios`): Home 27 elements, Forms 40 elements (empty diff). XCUITest saw the tree with no VoiceOver: the container's
  first query turned the program on.
- **AC2, Android**: `tests/data/a11y-probe/A11yProbe.java`, an instrumentation whose `UiAutomation` finds the node labelled "Forms" in
  the window's tree and calls `AccessibilityNodeInfo.performAction(ACTION_CLICK)` (the system's accessibility path, no touch):
  `PASS performAction(ACTION_CLICK) on 'Forms' answered true, 'CREATE YOUR ACCOUNT' shown`. TalkBack (enabled through `settings`) bound
  to the app and the program sent its tree at once (`ZINC_DEVICE_LOG` on the device); `adb shell input tap` does not go through TalkBack's
  touch exploration (the taps reached the app as plain touches), so TalkBack's own double tap was not driven from the command line.
- **AC2, iOS**: `tests/data/a11y-probe/A11yProbeUITests.m`, XCUITest: `app.buttons["Forms"].firstMatch` found by its label and tapped at
  the element's frame, the Forms screen shows (`TEST SUCCEEDED`). XCUITest taps by touch at the frame the bridge gave; VoiceOver's
  double tap calls `accessibilityActivate`, which sends the same `a11yactivate` signal Android's ACTION_CLICK does (proved there and in the
  T0 test); VoiceOver itself does not run on the simulator.
- Commands. Android: `zinc export examples/rn-showcase --target android -o /tmp/p`, then in `/tmp/p` copy `A11yProbe.java` to
  `app/src/androidTest/java/dev/zinc/probe/`, add `testInstrumentationRunner "dev.zinc.probe.A11yProbe"` to `defaultConfig`,
  `./gradlew -Pzinc.abis=arm64-v8a assembleDebug assembleDebugAndroidTest` (JAVA_HOME: Android Studio's JDK), install both APKs, and
  `adb shell am instrument -w -r -e activity dev.zinc.rn_showcase.Rn_showcaseActivity -e env SHOWCASE_NET=mock -e press Forms -e expect "'CREATE YOUR ACCOUNT'" dev.zinc.rn_showcase.test/dev.zinc.probe.A11yProbe`.
  iOS: `zinc export ... --target ios -o /tmp/i`, append to its CMakeLists.txt

  ```cmake
  set(CMAKE_XCODE_GENERATE_SCHEME ON)
  find_package(XCTest REQUIRED)
  xctest_add_bundle(a11yprobe rn-showcase A11yProbeUITests.m)
  set_target_properties(a11yprobe PROPERTIES XCODE_PRODUCT_TYPE com.apple.product-type.bundle.ui-testing
    XCODE_ATTRIBUTE_TEST_TARGET_NAME rn-showcase XCODE_ATTRIBUTE_TEST_HOST "" XCODE_ATTRIBUTE_BUNDLE_LOADER ""
    XCODE_ATTRIBUTE_PRODUCT_BUNDLE_IDENTIFIER dev.zinc.a11yprobe XCODE_ATTRIBUTE_CLANG_ENABLE_OBJC_ARC YES)
  ```

  generate with `cmake -S . -B build -G Xcode -DCMAKE_SYSTEM_NAME=iOS -DCMAKE_OSX_ARCHITECTURES=arm64 -DCMAKE_OSX_SYSROOT=iphonesimulator`, add
  the bundle to the `a11yprobe` scheme's `<Testables>` (CMake leaves it empty), then
  `TEST_RUNNER_PROBE_APP=dev.zinc.rn-showcase TEST_RUNNER_PROBE_PRESS=Forms TEST_RUNNER_PROBE_EXPECT="CREATE YOUR ACCOUNT" TEST_RUNNER_PROBE_ENV="SHOWCASE_NET=mock SHOWCASE_LANG=en" xcodebuild test -project build/rn-showcase.xcodeproj -scheme a11yprobe -destination 'platform=iOS Simulator,name=iPhone 17' -derivedDataPath build/dd CODE_SIGNING_ALLOWED=NO`.

## Cost (development Mac, loaded by other builds: load 14)

- **No reader**: one boolean per painted frame; nothing is built or sent. Checked on the emulator: with TalkBack off, rn-showcase made no
  `device()` call at all (`ZINC_DEVICE_LOG` stayed empty).
- **A reader listening**, 150 rows (a button and its text each: 300 exposed nodes) in a scroll area scrolled 1 px every frame, mean of 1000
  frames, headless: AOT 54-60 µs a frame without, 217-219 µs with (about 160 µs: the walk with `boxOf` per node, and the lines of the
  rows on screen, whose boxes move every frame); before off-screen nodes lost their box and the line was built only for a changed node, it
  was 460 µs. At rest nothing runs (the frame is kept). The platform side applies the lines on the UI thread (not measured on a device).

## Not proved, open

- VoiceOver and TalkBack themselves speaking and moving (no VoiceOver on the simulator; TalkBack gestures cannot be injected from adb);
  a device run belongs to the cross-platform pass (`backlog/later.md`).
- iOS lists off-screen nodes with an empty frame: VoiceOver reaches them through `accessibilityElementDidBecomeFocused` (which scrolls them
  in) and three-finger scrolls; whether it skips empty frames when swiping is to see on a device.
- No macOS (NSAccessibility) or desktop bridge yet; text fields on iOS have no public "text field" trait (they read as label, value, hint).
