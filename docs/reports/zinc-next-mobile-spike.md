# Zinc Next on iOS and Android: viability and plan (ZN-372)

Spike of 2026-10-10. Status: research only. Nothing was built or run for iOS or Android (owner rule of 2026-10-10: the development Mac only, no
cross-target builds), so every statement about a phone is read from code and from documentation, never measured. What could not be verified is
listed in section 10. Sources are numbered `[S1]`... and listed at the end; `[code]` means a file of this repository.

Related: `docs/reports/ios-core-runtime.md` (2026-09-28, the prototype's design of an Expo-like iOS runtime; its App Store analysis still holds and
is not repeated), `docs/reports/hardware/handhelds-psp-vita-3ds-iphone4s.md` (the iPhone 4S, iOS 9, `ios-legacy`: another target with another
toolchain, tasks ZN-453 to ZN-497).

## 1. Verdict

| Platform | Verdict | In two lines |
|---|---|---|
| **Android** | **Viable, low risk. Do it first.** | The engine already is what Android wants: portable C++20, a static SDL3 HAL, an AOT that writes C++, plugins as static archives. Missing: the SDL3 Android backend in the vendored copy, a Gradle project generator, lifecycle, touch density, IME, safe areas, an accessibility bridge. No store rule constrains the engine. |
| **iOS** | **Viable with three conditions.** | Same engine, same HAL file through SDL3's UIKit backend. Conditions: (1) store builds are AOT plus bundled bytecode and JavaScript only (no JIT exists, no downloaded native code); (2) a Mac with Xcode 26 and a paid Apple account do the build, signing and upload, the pinned zig cannot; (3) the GPU path needs a decision because OpenGL ES is deprecated on iOS (the software raster through SDL's Metal renderer works from day one). |

Nothing blocks. What costs most is not the engine but the platform shell around it: packaging and signing, the text-input and accessibility
bridges, and the per-platform native code of the plugins.

The task's criterion "hello and rn-showcase run on the iOS simulator and an Android emulator" is **not met** and is moved to follow-up tasks
(MOB-05, MOB-07): the owner's rule forbids cross-target builds now, and this Mac has neither Xcode (`xcodebuild` reports the Command Line Tools
only) nor an Android SDK (`~/Library/Android/sdk` is absent, no `adb`).

## 2. How the engine is hosted today

What matters for a phone, read from the code:

| Piece | Today | Consequence for mobile |
|---|---|---|
| Window HAL | `targets/macos/hal_sdl.cpp` (761 lines), SDL3 3.4.16 vendored and linked statically; the same file serves macOS and Linux, its 16 `hal_*` functions renamed at compile time and picked by `next/src/host/hal_dispatch.cpp` [code: `next/CMakeLists.txt` lines 144-193] | The file is the mobile HAL too: SDL3 has UIKit and Android video backends behind the same API. No second HAL. |
| Pixels | Two paths in that file: software raster uploaded to an `SDL_Renderer` streaming texture (`ren`), or the GL replay of the command lists (`runtime/gl_replay.cpp`, `ZN_HAL_GL`), which already has a GLES 2 code path (no instancing) used by `plugins/display-gl` on the Pi | The `SDL_Renderer` path needs no GL of ours: SDL draws it with Metal on iOS and GLES on Android. The GL replay needs a GLES context instead of the desktop 3.2 core profile requested at lines 110-113. |
| Input | Mouse, wheel, pinch, pen, keys, typed text, clipboard; `SDL_EVENT_FINGER_*` are handled; text input uses `SDL_StartTextInput` | Touch arrives already. Missing in the file: lifecycle events, safe areas, orientation, the Android back button (grep finds none of `SDL_EVENT_*_BACKGROUND`, `SDL_GetWindowSafeArea`). |
| Safe areas, accessibility in the UI | `lib/std/ui.ts` has `setSafeArea(t, r, b, l)` and an accessibility tree (role, label, hidden: ZN-276); `lib/std/react-native.tsx` has `SafeAreaView` | The UI side is ready; only the host has to feed it (insets) and mirror it (screen readers). |
| Execution | Typed interpreter over ZBC, AOT to C++ (`next/src/aot`), QuickJS-ng 0.17 (`next/src/qjs`). No JIT (D36: no-go; D44: no QuickJS JIT) | Nothing to remove for iOS. AOT is the store mode; the interpreter and QuickJS are legal with bundled code (section 5). |
| Compiler | `zinc build`: the machine's `c++`; `--target`: the pinned zig 0.15.2 for `aarch64-linux`, `armhf-linux`, `x86_64-linux`, `aarch64-macos`, `x86_64-macos` [code: `next/src/tc/tc.cpp` lines 69-73]. `ensureCrossLibs` builds the graphics host for a target with CMake and zig | The target table and the cache layout carry over; the compiler does not (section 4). |
| Plugins | `next/src/tc/plugin_build.h`: "The desktop interpreter dlopens the shared library; an AOT program links the static archives". Manifests list native sources per target (`macos`, `linux`, `rpi1`, `rmpp`) | Static archives are exactly what both stores accept. Each plugin needs an `ios` and an `android` entry, and those written in Objective-C against Cocoa (`plugins/webview/src/webview.mm`, parts of `plugins/system`) need a UIKit or Java version. |
| Dynamic loading | `libzn_webgl` is loaded with `dlopen` on the first QuickJS context (`next/src/gl`); plugins in the interpreter | Link statically in a mobile build (iOS allows `dlopen` only of signed code inside the bundle; simpler not to depend on it). |
| Processes and tools | `fork`/`pipe`/`waitpid` in `next/src/host/sys_host.cpp` (`zinc:process`); `src/tc` shells out to `curl`, `tar`, `sh` | iOS has no child processes: capability `process: false`, as on ESP32. `src/tc` and the CLI are not part of an app. |
| Packaging | `zinc export` (linux, rpi, rpi1, rmpp, macos, wasm, esp32: a directory per target, `.deb`, `.dmg`), `zinc pack` (.zapp: a signed-manifest ustar with the compiled program and assets), `zinc fuse` (zapp appended to the engine), `tools/sign-macos` (dry-run tested, never run against Apple) | `export --target ios|android` is the natural home. `.zapp` is the right payload for bundled bytecode. `fuse` (an appended executable) does not apply to store packages. |
| Capabilities | `targets/capabilities.json`: one row per profile (`macos`, `linux`, `rpi1`, `rmpp`, `esp32`, `ps1`, `ps2`, `wasm`, `sim`) with `touch`, `process`, `dynlib`, `desktop`, `tray`... | Two new rows, `ios` and `android`: `touch: true`, `pointer: "optional"`, `keyboard: "optional"`, `process: false` (iOS), `dynlib: false`, every desktop key false. |
| Size | `zinc` (engine and CLI, TLS on) is 5.3 MB on macOS arm64, 4.8 MB stripped (`docs/reports/zinc-next-packaging.md`) | An app is smaller than `zinc` (no frontend, no CLI, no toolchain manager) plus SDL3. Expect a few MB per ABI; to be measured (MOB-15). |

Three structural facts make the port cheap: the engine has no JIT to lose; AOT output is plain C++ that includes `include/zn` and links `src/rt`
(any clang compiles it); and plugins already have a static-archive form.

Two facts make it not free: the vendored SDL3 was stripped of its Android backend (`next/third_party/README.md`: "without the Windows, WinRT,
GDK, Android, Emscripten... backends"; `src/video/uikit` is still there, 28 files; no `android-project/`), and the HAL has never met a platform
that suspends the app, loses its GL context or covers the window with a keyboard.

## 3. What SDL3 gives on each platform

| Topic | iOS | Android |
|---|---|---|
| Requirements | Xcode 12.2 and the iOS 14.2 SDK or newer; deploys to iOS 11.0 and newer [S1] | Android SDK 35 or later, NDK r28c or later, minimum API level 21 [S2] |
| Shape of the app | `SDL3.xcframework` (recommended) or the embedded Xcode project; `SDL_main.h` supplies the entry that calls `SDL_RunApp()` [S1] | A Java activity (`SDLActivity`, to be subclassed) loads SDL and the app, which must be a shared library named `main`; Gradle builds it, CMake supported (`buildWithCMake`), or the SDL AAR with prefab [S2] |
| Main loop | A blocking loop works; main callbacks (`SDL_AppIterate`) or `SDL_SetiOSAnimationCallback` are needed only where the system must get control back (Game Center) [S1] | The native `main` runs beside the Java UI thread; by default the event loop blocks while paused (`SDL_HINT_ANDROID_BLOCK_ON_PAUSE`); never call `exit()` [S2] |
| Lifecycle | `SDL_EVENT_DID_ENTER_BACKGROUND` (5 seconds to save state), `WILL_ENTER_FOREGROUND`, `LOW_MEMORY`, to be handled in an event filter because the OS may give no time afterwards [S1] | The same events; no GL call while in the background; the context may be lost on return (`SDL_EVENT_RENDER_DEVICE_RESET`) [S2] |
| Density | Window sizes are in points, `SDL_GetWindowSizeInPixels` gives pixels [S1] | Same API |
| Text input | `SDL_StartTextInput` shows the on-screen keyboard, `SDL_StopTextInput` hides it [S1] | Same API; IME behaviour on Android is not described in the README (to verify, section 10) |
| Safe areas | `SDL_GetWindowSafeArea`, `SDL_EVENT_WINDOW_SAFE_AREA_CHANGED` (SDL 3.2.0) [S3] | Same; a report of wrong insets on one Oppo device [S4] |
| Assets | In the app bundle (`SDL_GetBasePath`) | `assets://` paths inside the APK through `SDL_IOFromFile` [S2]: file access by plain `fopen` does not see them |
| Store notes | Asset catalog with the icon, `UILaunchScreen` in Info.plist, `PrivacyInfo.xcprivacy` when required-reason APIs are used [S1] | none in the README |
| Missing | No accessibility bridge. OpenGL ES works but is deprecated by Apple since 2018 | No accessibility bridge. "The emulator is incredibly slow" in SDL's own words [S2] |

`hal_sdl.cpp` already uses `SDL_AddEventWatch`, which is the mechanism both READMEs ask for.

## 4. Toolchain: why not the pinned zig

The task says it: "the pinned zig cannot sign or package". The research confirms it and adds two reasons.

- **Apple.** Since 2026-04-28 an upload to App Store Connect must be built with Xcode 26 or later and the iOS 26 SDK [S5]. zig does not ship the
  iOS SDK; it needs the SDK of an installed Xcode as a sysroot [S6]. So Xcode is required whatever compiles the objects, and `xcodebuild` also does
  the signing, the asset catalog, the archive and the export of the IPA.
- **Android.** zig 0.15 does not ship bionic; linking for Android needs the NDK's libraries through a `libc.txt` or a workaround [S6]. Google Play
  asks for 16 KB page alignment of native code since 2025-11-01 [S7] and for target API 36 since 2026-08-31 [S8]; the NDK and the Android Gradle
  Plugin are where those defaults are maintained. The AAB that Play requires for new apps, with Play App Signing [S9], is produced by Gradle.
- **Reference products all do the same**: React Native and Expo (`expo prebuild` generates `ios/` and `android/`), Flutter (`flutter create` writes
  them, `flutter build ipa|appbundle` drives Xcode and Gradle), Tauri 2 (`tauri ios init`, `tauri android init` generate the projects in `gen/`).
  None brings its own linker for mobile.

Options scored as `next/RULES.md` §4 (fit x3, performance x3, size x2, maintainability x2, licence and supply x2, portability x1, effort x1; max 70):

| Option | Fit | Perf | Size | Maint | Supply | Port | Effort | Total |
|---|---|---|---|---|---|---|---|---|
| **T1. `zinc export --target ios|android` writes a platform project (Xcode, Gradle + CMake) with the AOT C++ and the engine sources; the platform's clang builds it** | 5 | 5 | 4 | 4 | 3 | 4 | 4 | **60** |
| T2. The pinned zig compiles with the Xcode SDK and the NDK sysroot; platform tools only package and sign | 3 | 5 | 4 | 2 | 3 | 3 | 2 | 47 |
| T3. Prebuilt engine libraries (xcframework, AAR) and bytecode only: no C++ compiler for the user | 3 | 2 | 4 | 3 | 3 | 4 | 3 | 42 |

T1 is chosen. T3 is worth keeping as a later speed-up of T1 (a prebuilt engine library so an app build compiles only its own C++), and it is the
shape of a development client (section 5). The supply score is 3 everywhere: Xcode needs a Mac and an Apple ID, the NDK a 1 GB download with its
own licence; neither can be pinned and fetched by `src/tc` the way zig is (the NDK could be, Xcode cannot).

The target ids proposed: `ios` (arm64 device), `ios-sim` (arm64 and x86_64 simulator), `android` (arm64-v8a, plus x86_64 for the emulator;
armeabi-v7a only if a device asks for it). `ios-legacy` stays what the handheld report defined.

## 5. Store rules that shape the engine

**Apple.** `docs/reports/ios-core-runtime.md` has the analysis (Guideline 2.5.2, the interpreted-code clause of the licence agreement, Guideline
4.7, no `MAP_JIT` for third parties). What 2026 adds: Apple enforced 2.5.2 against apps that run code generated after review (Anythng removed in
March 2026, updates of Replit and Vibecode blocked, per press reports) [S10]. For Zinc:

| Mode | In a store build | Why |
|---|---|---|
| AOT (C++ compiled into the app) | yes, the default | ordinary native code, reviewed with the app |
| Typed interpreter, bytecode bundled in the app | yes | interpreted code inside the reviewed binary |
| QuickJS (`--engine quickjs`), JavaScript bundled | yes | same; QuickJS has no JIT |
| Over-the-air update of a `.zapp` (bytecode, assets) | allowed within the reviewed purpose; off by default on iOS | the Expo and CodePush precedent; a change of features is the 2.5.2 trigger |
| Over-the-air native code, downloaded plugins, `dlopen` of anything outside the bundle | never | signing |
| A public container app running other people's programs ("Zinc Go") | TestFlight only | Guideline 4.7; see the earlier report |
| `zinc dev` live reload from the LAN | debug builds only | it is downloaded code by definition |

**Google.** No rule on interpreters comparable to Apple's for this use. The constraints are mechanical: target API 36 [S8], 16 KB pages [S7], AAB
and Play App Signing for new apps [S9], and developer verification, announced in 2025 for certified devices with a first enforcement in four
countries in September 2026 [S11] (status not verified).

**Both.** Permissions are fixed in the package (Info.plist usage strings, AndroidManifest): `zinc.json` and the plugin manifests must generate them,
and the engine's permission model (`next/src/host/permissions.cpp`) can only narrow them.

## 6. What the reference products do

| Product | Execution on iOS | Rendering | Build | Lesson for Zinc |
|---|---|---|---|---|
| React Native, Expo | Hermes bytecode compiled at build time, interpreted; no JIT | Native widgets (UIKit, Android views) through the New Architecture, default since 0.76 [S12] | Generated `ios/` and `android/`; EAS Build in the cloud for those without a Mac | Bundled bytecode is accepted by Apple at scale. Zinc does not map to native widgets (see option D). |
| Flutter | Dart AOT in release, JIT only in debug | Own renderer (Impeller) on Metal and Vulkan/GLES; own widgets; a semantics tree mirrored to the platform accessibility APIs | `flutter build ipa`, `appbundle` drive Xcode and Gradle | The closest model: own pixels, AOT, an accessibility mirror. Flutter left OpenGL ES on iOS for Metal. |
| Tauri 2 | Rust compiled ahead of time | The system web view (WKWebView, Android WebView) | `tauri ios|android init` generate projects, plugins carry Swift and Kotlin code | Plugin manifests with per-platform native code and generated permissions. |
| SDL3 games | C or C++ | GLES, Metal, Vulkan or `SDL_Renderer` | Xcode project, Gradle with `SDLActivity` | The exact shape of option A. |

(The Flutter and Tauri rows are from general knowledge of those products; the searches of this session returned only secondary sources for
them, see section 10.)

## 7. How to host the engine on a phone: options

| Option | What it is |
|---|---|
| **A. SDL3 shell** | The engine as a static library, the existing `hal_sdl.cpp` on SDL3's UIKit and Android backends, the AOT program linked in; one generated platform project |
| B. Our own HALs | `targets/ios` (UIKit, CAMetalLayer, UITextInput) and `targets/android` (GameActivity, EGL, JNI), no SDL |
| C. Web view shell | The existing WASI build of the interpreter (`tools/build-wasm`, `targets/wasm`) inside WKWebView and Android WebView, as Tauri and Capacitor do |
| D. Native widgets | `zinc:ui` mapped to UIKit and Android views, as React Native does |

| Option | Fit | Perf | Size | Maint | Supply | Port | Effort | Total |
|---|---|---|---|---|---|---|---|---|
| **A. SDL3 shell** | 5 | 4 | 4 | 5 | 4 | 5 | 4 | **62** |
| B. Our own HALs | 4 | 5 | 5 | 2 | 4 | 2 | 2 | 53 |
| C. Web view shell | 2 | 2 | 4 | 3 | 4 | 4 | 4 | 42 |
| D. Native widgets | 1 | 4 | 3 | 1 | 4 | 1 | 1 | 33 |

- **A** keeps one HAL for five systems, the same pixels as the desktop (the goal of `next/RULES.md` §1: every demo unchanged) and the plugins as
  static archives. It loses a point of performance because the GPU path on iOS is not settled, and a point of size for SDL3.
- **B** would be the best result per platform (Metal directly, the platform's text input with no intermediary) and is the fallback for whatever
  SDL3 does badly; it means two new HALs in two new languages to keep equal to the desktop one. The accessibility and IME bridges of A are small
  pieces of B that will be written anyway.
- **C** runs today's `wasm` profile, which has no threads, no network, no files and no native plugins (`targets/capabilities.json`), at interpreter
  speed inside a browser engine.
- **D** changes every pixel and most of `lib/std/ui.ts`: the demos would not run unchanged.

**A is chosen.**

### The GPU path inside A

| Stage | Android | iOS |
|---|---|---|
| First | Software raster into an `SDL_Renderer` texture (SDL draws with GLES) | The same (SDL draws with Metal): no deprecated API |
| Then | `gl_replay` on a GLES 3 context (its GLES 2 path exists) | To decide with numbers: `gl_replay` on GLES through EAGL (works, deprecated since 2018), GLES over Metal through ANGLE (a large dependency), or a Metal back end of the replay |

The software raster at phone densities (a 1179 x 2556 screen is 3 million pixels) is the known risk, already named in the earlier report; the HAL
already has `ZINC_SCALE` and rasterizes at the window's pixel size, so a density cap is one line. It decides nothing about viability.

## 8. Gaps, by cost

| Gap | Where | Size |
|---|---|---|
| Vendored SDL3 lacks the Android backend and the Java glue | `next/third_party/SDL3` | S |
| An entry point without the CLI: program (AOT or bundled `.zapp`) + runtime + host, no `src/tc`, no `src/frontend`, plugins registered statically | `next/src`, CMake | M (provable on the Mac) |
| `ios` and `android` profiles, target ids, `zinc.json` keys (bundle id, version code, orientation, permissions, icons) | `targets/capabilities.json`, `next/src/tc`, checker | S (provable on the Mac) |
| Project generators | `zinc export` in `next/src/cli_core.cpp` | M each (the tree is provable on the Mac, the build is not) |
| Lifecycle, context loss, density, safe areas, orientation, back button | `targets/macos/hal_sdl.cpp` | M |
| On-screen keyboard, IME composition, keyboard avoidance | HAL + `lib/std/ui.ts` | M |
| Assets on Android (`assets://`, not `fopen`) | `next/src/host/resources.cpp`, `sys_host.cpp` | S |
| `zinc:process` and friends absent on iOS | capability row, clear error | S |
| Plugins: `ios` and `android` entries, UIKit and Java ports of the Cocoa ones (webview, system), permissions | `plugins/*` | L |
| GPU path | `runtime/gl_replay.cpp`, HAL | M |
| Packaging and signing | `zinc export`, a `tools/sign-*` pair | M; uploads need paid accounts |
| Accessibility bridges (VoiceOver, TalkBack) from the tree of ZN-276 | new Objective-C and Java, about a file each | L |
| Development client | interpreter build + `zinc dev` over the LAN | M |

Costs outside the code: an Apple Developer Program membership and a Google Play developer account (paid, the owner's step), Xcode 26 (needs macOS
Sequoia 15.6 or later; Xcode 26.4 and later need macOS Tahoe 26.2 [S13]), the Android SDK and NDK r28c or later.

## 9. Staged plan

Every stage that needs Xcode, the NDK, a simulator or a device belongs to the deferred cross-platform phase (owner, 2026-10-10). Stage 0 can be
done on the Mac now.

| Stage | Content | Proof | Tasks |
|---|---|---|---|
| 0. Mobile-shaped on the desktop | Profiles and target ids; the app entry without CLI, with static plugins and no `dlopen`, no `fork`; project generators whose output tree is a golden | T0 tests on macOS | MOB-01, MOB-03, MOB-04 and MOB-06 (generation only) |
| 1. Android hello | SDL3 Android backend vendored; `zinc export --target android`; hello and rn-showcase on the emulator, software raster | screenshots (criterion 1 of ZN-372) | MOB-02, MOB-05 |
| 2. iOS hello | `zinc export --target ios`; the same two programs on the simulator | screenshots | MOB-07 |
| 3. A usable app | Lifecycle, density, safe areas, orientation, back; keyboard and IME; assets | scripted input on the emulator, goldens at a phone size on the desktop | MOB-08, MOB-09 |
| 4. Speed | GLES on Android; the iOS renderer decision, measured | frame times in `docs/reports/zinc-next-perf.md` | MOB-10, MOB-15 |
| 5. Plugins | Static plugins, `ios`/`android` manifest entries, sqlite and video first, webview and system ported, permissions generated | plugin tests on the emulator | MOB-11 |
| 6. Shipping | IPA and AAB, signing, 16 KB check, privacy manifest; dry-run printing the commands; the uploads are the owner's | dry-run tests; a TestFlight and an internal-track upload by the owner | MOB-12 |
| 7. Everyone | VoiceOver and TalkBack bridges | accessibility inspector dumps equal to the tree of ZN-276 | MOB-13 |
| 8. Developer loop | Development client: interpreter + `zinc dev` over the LAN, debug builds only; QuickJS on mobile | reload on the emulator | MOB-14 |

Android goes first: it has no review rule on the engine, its emulator has x86_64 images for an Intel Mac, and SDL's Android port is the one that
needs a change in our vendored tree, so its surprises come early.

## 10. Not verified

- **Nothing ran.** No build for iOS or Android, no simulator, no emulator, no screenshot. Criterion 1 of the task is open.
- Whether `hal_sdl.cpp` compiles unchanged for either platform (it includes desktop GL headers under `ZN_HAL_GL`, which must be off or switched to
  GLES; the `__APPLE__` branches assume Cocoa and need `TARGET_OS_IPHONE` guards).
- Whether libuv, mimalloc, mbedTLS, HarfBuzz, Yoga and QuickJS-ng build for both with our CMake: all are known to support the two platforms
  upstream; not built here.
- The Intel Mac: Xcode 26 lists macOS Sequoia 15.6 as its minimum [S13] and this machine runs 15.8.1, but whether the iOS 26 simulator runtime
  installs and runs on Intel is disputed in Apple's forums [S14]; whether the Android emulator still ships an x86_64 image for API 36 was not found
  in a primary source. If the iOS simulator does not run here, stage 2 needs an Apple Silicon Mac or a device.
- The clause number of the interpreted-code allowance in Apple's licence agreement (3.3.1(B) in the earlier report, 3.3.2 in older texts): the
  secondary sources disagree; the agreement itself is behind a login.
- The current enforcement state of Google's developer verification [S11], and the exact dates of the 16 KB enforcement beyond Google's page [S7].
- SDL3's Android IME behaviour (composition events), which its README does not describe, and the safe-area report on one device [S4].
- The Flutter and Tauri rows of section 6 and "OpenGL ES still runs on iOS 26" (one forum report about iPadOS 26.1 [S15]) rest on general
  knowledge or secondary sources.
- App size and frame time on a device: no number exists; the 5.3 MB of section 2 is the desktop `zinc` binary.
- The European Accessibility Act (in force since June 2025 for some consumer services) may make stage 7 a legal requirement for some apps; not
  researched.

## 11. Decision record (number to be assigned by the coordinator)

**Question.** Is Zinc viable as a native iOS and Android target, how is the engine hosted there, and with which toolchain? (ZN-372, owner's
question of 2026-10-08.)

**Context.** The engine is portable C++20 with a static SDL3 HAL shared by macOS and Linux, an AOT that writes C++, a typed interpreter, QuickJS
without a JIT, and plugins that already build as static archives. The pinned zig ships neither the iOS SDK nor bionic and cannot sign or package.
Apple requires Xcode 26 and the iOS 26 SDK for uploads (2026-04-28) and forbids executable memory and downloaded native code; Google Play requires
target API 36, 16 KB pages and AAB with Play App Signing.

**Options and scores** (`next/RULES.md` §4: fit x3, performance x3, size x2, maintainability x2, licence and supply x2, portability x1, effort x1):

| Hosting | Fit | Perf | Size | Maint | Supply | Port | Effort | Total |
|---|---|---|---|---|---|---|---|---|
| A. SDL3 shell: static engine, `hal_sdl.cpp` on SDL3's UIKit and Android backends | 5 | 4 | 4 | 5 | 4 | 5 | 4 | **62** |
| B. Our own UIKit and Android HALs | 4 | 5 | 5 | 2 | 4 | 2 | 2 | 53 |
| C. Web view shell around the wasm build | 2 | 2 | 4 | 3 | 4 | 4 | 4 | 42 |
| D. `zinc:ui` on native widgets | 1 | 4 | 3 | 1 | 4 | 1 | 1 | 33 |

| Toolchain | Fit | Perf | Size | Maint | Supply | Port | Effort | Total |
|---|---|---|---|---|---|---|---|---|
| T1. `zinc export --target ios|android` generates an Xcode or Gradle project; Xcode's clang and the NDK build, sign and package | 5 | 5 | 4 | 4 | 3 | 4 | 4 | **60** |
| T2. The pinned zig with the platform sysroots | 3 | 5 | 4 | 2 | 3 | 3 | 2 | 47 |
| T3. Prebuilt engine libraries and bytecode only | 3 | 2 | 4 | 3 | 3 | 4 | 3 | 42 |

**Choice.**

1. Both platforms are viable; **go**, Android first, in the deferred cross-platform phase. Nothing blocks.
2. Hosting: **A**, the SDL3 shell. The mobile HAL is `targets/macos/hal_sdl.cpp`; platform code of our own is limited to what SDL3 lacks
   (accessibility, and text input if SDL's proves insufficient).
3. Toolchain: **T1**. Target ids `ios`, `ios-sim`, `android`. The pinned zig is not used for mobile.
4. Execution in store builds: AOT by default; the interpreter and QuickJS only with code bundled in the package; plugins linked statically; no
   `dlopen`, no `zinc:process` on iOS; over-the-air `.zapp` updates off by default on iOS; `zinc dev` reload in debug builds only.
5. Pixels: the software raster through `SDL_Renderer` first on both; GLES 3 replay on Android next; the iOS GPU back end (GLES through EAGL, ANGLE,
   or Metal) is a separate measured decision (MOB-10).

**Why.** A reuses the one HAL and keeps the pixels and the demos unchanged, which is the goal every task serves; B costs two HALs to maintain for a
performance gain that is not needed to start; C and D fail the goal. T1 is what every reference product does and the only option that satisfies
Apple's Xcode requirement without a second toolchain to keep working.

**Evidence.** Sections 2 to 7 of `docs/reports/zinc-next-mobile-spike.md` and its sources; `next/src/tc/plugin_build.h`, `next/CMakeLists.txt`
lines 144-193, `targets/macos/hal_sdl.cpp`, `targets/capabilities.json`. No measurement: nothing was built for a phone.

**What blocks.** Nothing in the engine. Outside it: no Xcode and no Android SDK on the development Mac, paid store accounts for uploads, and the
owner's rule that cross-target work comes last. Criterion 1 of ZN-372 (the two programs running on a simulator and an emulator) is carried by
MOB-05 and MOB-07.

**Revisit when.** SDL3's text input or lifecycle proves inadequate on a device (then B for that platform); the software raster misses 60 Hz on a
mid-range phone and GLES is unavailable or removed on iOS (then a Metal back end, MOB-10); Apple changes the interpreted-code rule; zig ships
bionic and an iOS SDK story that makes T2 one toolchain for everything.

## 12. Proposed follow-up tasks

To be filed by the coordinator in a new milestone, "Mobile targets (iOS, Android)". Keys `MOB-nn` are placeholders. All but MOB-01, MOB-03 and the
generation halves of MOB-04 and MOB-06 need a cross target and belong to the deferred group; their titles name the target.

| Key | Title | Description | Acceptance criteria | Size | Depends on |
|---|---|---|---|---|---|
| MOB-01 | Mobile targets: ids, profiles and capabilities for ios and android | Rows `ios` and `android` in `targets/capabilities.json` (touch, no desktop keys, `process` and `dynlib` false on iOS); target ids `ios`, `ios-sim`, `android` known to the CLI; `zinc.json` keys `app.id`, version code, orientation, permissions, icon | `zinc check --profile ios` and `--profile android` refuse a program that requires `process` or `tray` with the capability message; `zinc toolchain targets` lists the ids with "needs Xcode" / "needs the Android NDK"; a T0 test | S | - |
| MOB-02 | Android: vendor the SDL3 Android backend and Java glue | Restore `src/video/android`, `src/core/android`, the Android audio-free subset and `android-project/app/src/main/java/org/libsdl/app` of SDL 3.4.16 in `next/third_party/SDL3`; README row updated | the files match the release archive (checksums in the README); the desktop build is unchanged (same `libSDL3.a` object list on macOS) | S | - |
| MOB-03 | App entry without the CLI: static engine library for embedders | A library target with one entry (`zn_app_main`): AOT program or bundled `.zapp`, runtime, host, plugins registered statically; no `src/tc`, no `src/frontend`, no `dlopen`, no `fork` | on macOS, hello and `examples/rn-showcase` linked against it print and draw what `zinc run` does (existing goldens); `nm` shows no `dlopen`, `fork` or `execv` reference; a T0 test | M | - |
| MOB-04 | zinc export --target android: Gradle project generator | Writes `dist/<name>-android/`: Gradle and CMake files, an `SDLActivity` subclass, AndroidManifest from `zinc.json` (id, version, orientation, permissions), the AOT C++, the engine sources, assets; target API 36, min API 21, 16 KB alignment flags | the generated tree equals a golden for hello; `--print` lists the commands (`./gradlew assembleDebug`, `bundleRelease`); no Android tool is run by the test | M | MOB-01, MOB-03 |
| MOB-05 | Android: hello and rn-showcase on the emulator | With the SDK 35+ and NDK r28c+, build the generated project (arm64-v8a and x86_64) and run both programs on an emulator, software raster through `SDL_Renderer` | screenshots of both in the report; the hello output in logcat equals its golden; what had to change in `hal_sdl.cpp` is listed (criterion 1 of ZN-372, Android half) | M | MOB-02, MOB-04 |
| MOB-06 | zinc export --target ios: Xcode project generator | Writes `dist/<name>-ios/`: an Xcode project (or CMake with the Xcode generator), Info.plist from `zinc.json` (bundle id, `UILaunchScreen`, orientations, usage strings), asset catalog with the icon, the AOT C++, engine sources, SDL3 | the generated tree equals a golden for hello; `--print` lists the `xcodebuild` commands; no Xcode needed by the test | M | MOB-01, MOB-03 |
| MOB-07 | iOS: hello and rn-showcase on the simulator | With Xcode 26, build the generated project for `ios-sim` and run both programs (`xcrun simctl`), software raster through `SDL_Renderer` | screenshots of both in the report; hello's output equals its golden; the changes to `hal_sdl.cpp` are listed; states whether the Intel Mac can run the simulator (criterion 1 of ZN-372, iOS half) | M | MOB-06 |
| MOB-08 | Mobile HAL on ios and android: lifecycle, density, safe areas, orientation, back | Background and foreground events in the event watch (stop drawing, save state through an app event), GL context loss, pixel density with a cap, `SDL_GetWindowSafeArea` into `ui.setSafeArea`, rotation as a resize, the Android back button as a key | a headless test on the desktop drives the new events through `ZINC_INPUT` (`background`, `foreground`, `safe-area t r b l`, `rotate`) with a golden; on the emulator and simulator rn-showcase survives home and return, and rotation | M | MOB-05, MOB-07 |
| MOB-09 | Mobile text input on ios and android: keyboard, IME, avoidance | The on-screen keyboard opens and closes with focus; composition text (CJK) reaches the field; the focused field scrolls above the keyboard; keyboard type hints (email, number) | `tests/golden/ui/type.tsx` passes on the emulator and the simulator; a composition script on the desktop (`ZINC_INPUT` `compose`) has a golden; the keyboard never covers the focused field in rn-showcase | M | MOB-08 |
| MOB-10 | Mobile GPU path: GLES 3 replay on android, renderer decision for ios | `gl_replay` on a GLES 3 context on Android; on iOS measure the software raster through Metal, GLES through EAGL and (if needed) ANGLE, and decide | frame times of rn-showcase and hero on both in `docs/reports/zinc-next-perf.md`; pixels equal to the desktop GL goldens within the existing tolerance; a decision record for iOS | M | MOB-05, MOB-07 |
| MOB-11 | Plugins on ios and android: static linking, manifest targets, permissions | `ios` and `android` entries in `plugin.json`; the generators link the archives and merge permissions and frameworks; sqlite and video first; `webview` on WKWebView for iOS and the Android WebView; `system` reduced to what exists (clipboard, opener, deep links, notifications) | a program using `zinc:sqlite` runs on both; a plugin without an entry for the target is refused at export with a message; the generated manifests list exactly the declared permissions | L | MOB-05, MOB-07 |
| MOB-12 | Packaging and signing for ios and android: IPA, AAB, dry-run | `zinc export --target ios --ipa` (archive, exportArchive with a provisioning profile), `--target android --aab` (bundleRelease, upload key), the 16 KB alignment check, `PrivacyInfo.xcprivacy`; `--dry-run` prints every command as `tools/sign-macos` does | the dry-run output is tested on the desktop; a debug IPA installs on the simulator and a debug APK on the emulator; the upload commands are in the task notes for the owner (paid accounts: that step is parked) | M | MOB-05, MOB-07 |
| MOB-13 | Accessibility bridges on ios and android from the zinc:ui tree | Mirror the tree of ZN-276 (role, label, hidden, disabled, bounds, actions) as `UIAccessibilityElement`s and through an `AccessibilityNodeProvider`; focus and activate come back as UI events | the platform dumps (Accessibility Inspector, `uiautomator dump`) list the same nodes as `ui.inspect()` (the tree of ZN-276 as text) for rn-showcase; activating a button by the screen reader presses it | L | MOB-08 |
| MOB-14 | Development client on ios and android: interpreter and zinc dev over the LAN | A debug build of the app entry with the interpreter that loads bytecode from `zinc dev`; refused in release builds; QuickJS engine linked statically (WebGL module included, no `dlopen`) | a save on the desktop reloads the app on the emulator; a release export contains no reload code (`nm`); the store policy of each mode is in `docs/guide` | M | MOB-08 |
| MOB-15 | Mobile budgets on a device: size and frame time (needs a phone) | Measure the app size per ABI (hello, rn-showcase) and frame times on one mid-range Android phone and one iPhone | numbers in `docs/reports/zinc-next-perf.md`; a size budget set in the packaging report | S, parked (`needs-board`) | MOB-10 |

## Sources

- [S1] SDL3, README-ios: <https://wiki.libsdl.org/SDL3/README-ios>
- [S2] SDL3, README-android: <https://wiki.libsdl.org/SDL3/README-android>
- [S3] SDL3, `SDL_GetWindowSafeArea`: <https://wiki.libsdl.org/SDL3/SDL_GetWindowSafeArea>
- [S4] SDL forum, safe area on some Android devices: <https://discourse.libsdl.org/t/safe-area-not-reported-correctly-on-some-android-devices/60038>
- [S5] Apple, upcoming requirements (SDK minimum): <https://developer.apple.com/news/upcoming-requirements/>; summary: <https://capawesome.io/blog/xcode-26-requirement-for-capacitor-apps/>
- [S6] zig and Android or iOS (community, not official): <https://ziggit.dev/t/native-android-bionic-build-on-termux-with-zig-0-15-2/14897>, <https://ziggit.dev/t/targeting-android/4101>
- [S7] Android, support 16 KB page sizes: <https://developer.android.com/guide/practices/page-sizes>
- [S8] Google Play, target API level requirements: <https://developer.android.com/google/play/requirements/target-sdk>, <https://support.google.com/googleplay/android-developer/answer/11926878>
- [S9] Android App Bundle requirement and Play App Signing (secondary): <https://ionic.io/blog/google-play-android-app-bundle-requirement-for-new-apps>
- [S10] Guideline 2.5.2 enforcement in 2026 (press): <https://www.medianama.com/2026/04/223-apple-vibe-coding-app-ban-anythng/>, <https://stora.sh/blog/2026-04-30-apple-2-5-2-vibe-coding-crackdown>
- [S11] Android developer verification (2025 announcement): <https://9to5google.com/2025/08/25/android-apps-developer-verification/>
- [S12] React Native and Flutter architecture in 2026 (secondary): <https://shorebird.dev/blog/flutter-vs-react-native>
- [S13] Apple, Xcode support matrix: <https://developer.apple.com/support/xcode/>
- [S14] Apple forums, iOS 26 simulator on Intel Macs: <https://developer.apple.com/forums/thread/796224>
- [S15] Apple forums, OpenGL ES tag: <https://developer.apple.com/forums/tags/opengl-es>
