# Zinc Next on iOS: first run on the simulator

2026-10-16, ZN-623 and ZN-624 (D59, `zinc-next-mobile-spike.md`, `zinc-next-mobile-core.md` §7 step 6, the Android chain in
`zinc-next-android.md` as the model). The machine: the development Mac, now Apple Silicon (arm64, 10 cores, macOS 15.7), Xcode 26.3 (17C529),
the iOS 26.3 simulator runtime; the device: an iPhone 17 simulator (402 x 874 points, 1206 x 2622 pixels, density 3). Nothing ran on a phone.

## How an app is made

```sh
zinc export examples/rn-showcase --target ios -o dist/rn-showcase-ios      # a CMake project for CMake's Xcode generator (--print lists what follows)
cd dist/rn-showcase-ios
cmake -S . -B build -G Xcode -DCMAKE_SYSTEM_NAME=iOS -DCMAKE_OSX_ARCHITECTURES=arm64     # writes build/rn-showcase.xcodeproj
xcodebuild -project build/rn-showcase.xcodeproj -scheme rn-showcase -configuration Debug -sdk iphonesimulator -arch arm64 \
  -derivedDataPath build/dd CODE_SIGNING_ALLOWED=NO build
xcrun simctl boot "iPhone 17"                                              # no Simulator.app window is needed
xcrun simctl install booted build/Debug-iphonesimulator/rn-showcase.app
SIMCTL_CHILD_ZINC_PERF_HUD=1 xcrun simctl launch --console-pty booted dev.zinc.rn-showcase   # the app's environment: SIMCTL_CHILD_*
xcrun simctl io booted screenshot shot.png
```

A device build (not done: it needs the owner's Apple team; the command is in `--print` and README-zinc.txt):

```sh
cmake -S . -B build -DZINC_TEAM=<team id>
xcodebuild -project build/rn-showcase.xcodeproj -scheme rn-showcase -configuration Release -sdk iphoneos -derivedDataPath build/dd \
  -allowProvisioningUpdates archive -archivePath build/rn-showcase.xcarchive
xcodebuild -exportArchive -archivePath build/rn-showcase.xcarchive -exportPath build/ipa -exportOptionsPlist <ExportOptions.plist>   # method app-store-connect or release-testing
```

### The project (ZN-623)

- `CMakeLists.txt`: the engine added with `add_subdirectory(${ZINC_ENGINE})` (next/ of a checkout, compiled from its sources as on Android),
  the target `zn_app` with SDL3 and its UIKit backend inside; the program's C++ (`ZN_AOT_CPP_ONLY=1 zinc build --profile ios`) in `src/`; the
  program's plugins as static libraries compiled from their sources (no dlopen, D120; they take their linux entry until the manifests have
  ios entries, ZN-628); the shell `src/app/shell_sdl.cpp`; `-dead_strip`; iOS 16.3 and later.
- `Info.plist` from zinc.json: `CFBundleIdentifier` (app.id, else dev.zinc.<name>), the display name, `CFBundleShortVersionString` and
  `CFBundleVersion` (app.versionCode, else 1.2.3 -> 10203), `UILaunchScreen` (an empty dict: the system background, no storyboard),
  `UIRequiresFullScreen`, the orientations of app.orientation for iPhone and iPad, `UIApplicationSupportsIndirectInputEvents` (an iPad's
  trackpad as a mouse; SDL asks for it), and a usage string per permission iOS asks the user for: camera, microphone, location, and `net`
  as `NSLocalNetworkUsageDescription` (only the LAN asks; the internet needs no key).
- `Assets.xcassets` with app.icon as one 1024 x 1024 universal AppIcon (Xcode 14 and later make every size from it); `assets/` of the project
  copied into the bundle; zinc.json `targets.ios` `fullscreen` and `kiosk` baked as `ZN_APP_ENV`, `dev.perfHud` as `ZN_APP_DEV_ENV` (Debug builds).
- Why CMake with the Xcode generator rather than SDL's Xcode template or a `.pbxproj` written by zinc: SDL documents iOS builds with CMake
  (`docs/README-cmake.md`: `-DCMAKE_SYSTEM_NAME=iOS`, SDL added with `add_subdirectory`; its own test apps build as .app bundles that way),
  the engine is a CMake project that the Android export already builds through AGP's CMake, and a `.pbxproj` would list every engine source
  and break at each change of them (SDL's `Xcode/` project is not in the vendored tree either). Scores in the ZN-623 notes.
- iOS 16.3 is the minimum: the system libc++ has `std::to_chars` for doubles from 16.3 (the engine formats numbers with it; with 15.0 the
  build stops on "'to_chars' is unavailable: introduced in iOS 16.3"). iPhone 8 and later.
- `tests/t0/export_ios.sh`: the tree for hello equals `tests/golden/export-ios/hello.txt`; `--print` lists the commands; xcodebuild, xcrun,
  actool and codesign are traps on the PATH (no Apple tool runs); a second project checks the icon, an orientation, usage strings, escaping
  and `kiosk`. `tests/t2/ios_sim.sh` does the whole chain for hello on a simulator (5 minutes, skipped without Xcode).

## What changed in hal_sdl.cpp (criterion 3 of ZN-372, iOS half)

| Change | Why |
|---|---|
| The window is the screen on iOS as on Android (`fill`, `SDL_PLATFORM_IOS`) | The program follows the screen and its rotation |
| The zoom is the display scale divided by the window's pixel density | iOS gives sizes in points (density 3, display scale 3: zoom 1, the raster at the pixel size); Android gives pixels (density 1: the zoom is the display scale, as before). Without the division rn-showcase was laid out on a third of the screen, three times too big |

Nothing else: on iOS the HAL is the desktop's SDL_Renderer path (no `ZN_HAL_GL`: no OpenGL.framework, OpenGL ES is deprecated there), the
software raster uploaded to a texture each frame; SDL picks its Metal render driver (the first of its list that the iOS build has).

Outside the HAL:

- `CMakeLists.txt`: `ZN_PLATFORM_NAME` ios; the Cocoa piece (`hal_cocoa.mm`) and the desktop OpenGL defines only for `Darwin` (macOS), not
  `APPLE`, which is true on iOS too; `zn_app.link` only for single-configuration generators (Xcode's has several: `file(GENERATE)` failed).
- `src/app/shell_sdl.cpp`: what Android and iOS share (the environment words, the screen saver hint, the heap) in one `phone_setup`; on iOS
  the program's output goes to os_log when there is no terminal (Console.app, `log stream`, Xcode; `--console-pty` keeps it on the
  terminal); the lines still in the pipe reach the log before the process ends (`log_drain`: a console program on iOS ends at once, and
  hello lost 21 of its 29 lines without it; the same fix applies to Android).
- Files: the bundle is read-only (SDL makes it the working directory); the shell moves the working directory to
  `Library/Application Support/zinc` (`SDL_GetPrefPath`), where zinc.storage and the program's relative writes go, with `assets` there a
  link to the bundle's `assets/` (made again at each start: an install moves the bundle) and `ZINC_ASSETS` pointing at it.
- `src/host/sys_host.cpp`: `platform()` is `ios` in an iOS app, so React Native's `Platform.OS` and `Platform.select({ ios })` work
  (`lib/std/react-native.tsx`); Android still answers `linux` (later.md).
- A bug of the checker found on the way (its own commit): `Promise.reject(e)` returned as a `Promise<void>` was refused (Z0103), so
  rn-showcase's `links.ts`, the file of every profile but macOS and Linux, compiled for neither android nor ios.

## The heap (D121 on iOS)

The `ios` profile's heap (256 MiB, `src/frontend/profile.cpp`, baked as `ZN_APP_HEAP_MB`), capped at a quarter of `SDL_GetSystemRAM()`, as on
Android; `ZINC_HEAP` from the launch overrides it. iOS ends an app that grows past its share (jetsam), which a phone's quarter keeps clear of
(an iPhone 8 has 2 GB: 512 MiB cap). On the simulator `SDL_GetSystemRAM()` is the Mac's memory, so the cap is not exercised there.

## Measured on the iPhone 17 simulator

| | hello | rn-showcase |
|---|---|---|
| App (Debug, simulator, arm64) | 1.8 MB | 9.0 MB (executable 9.5 MB) |
| App (Release, simulator) | | 8.2 MB (executable 8.5 MB, text 7.4 MB, not stripped) |
| First configure (`cmake -G Xcode`) | 5 min 36 s | 5 min 57 s |
| Build after it (Debug; a fresh derived data) | | 41 s; Release 37 s |
| Start: `simctl launch` to the end of the first frame (`dist` script, `ZINC_TRACE`, 5 runs) | | 530 to 680 ms, median 539 ms |
| Frames, at rest and during ten scripted flings (`ZINC_INPUT`, 801 frames) | | 60 fps: interval p50 16.65, p99 18.4 to 25.3 ms; work p50 0.26, p99 3.11 ms |
| The present, per step (`ZINC_PRESENT_STATS`, p50 / p99 per 120 frames) | | raster 1.2 to 2.1 / 4.6 to 6.9 ms; texture upload 5.6 to 6.8 / 11.3 to 13.4 ms; swap 0.25 / 0.5 to 1.4 ms |
| Output | `--console-pty` and os_log equal the prototype's output (`node compiler/bin/zinc.mjs run examples/hello`), 29 lines | |

- The simulator runs on the Mac's CPU and GPU: these numbers say the chain works and where the time goes, not what an iPhone does. The
  upload of the whole 1206 x 2622 frame (12.6 MB) to a texture is the largest cost; the damage-aware present of Android (`anw_present`,
  ZN-743) has no iOS counterpart yet (a `CAMetalLayer` or `IOSurface` path, or the GPU replay: the Metal decision of D59).
- Start time includes `simctl`'s own launch (a tap on the icon goes through the same SpringBoard path).

Screenshots: `zinc-next-ios/rn-showcase-home.png` (the first screen), `zinc-next-ios/rn-showcase-perf-panel.png` (after the flings, with
the performance panel). hello is a console program and draws no window: its output is `zinc-next-ios/hello-console.txt`
(`--console-pty`) and `zinc-next-ios/hello-oslog.txt` (os_log, launched without a terminal).

## Can the Intel Mac run the simulator (criterion 4 of ZN-372, iOS half)

The question changed: the development Mac is Apple Silicon now, and it runs the iOS 26.3 simulator (everything above). The runtime
installed here is arm64 only (`lipo -archs` of its `dyld_sim`: arm64). An Intel Mac needs an x86_64 or universal runtime: Apple listed the
iOS 26.0 universal runtime with x86_64, and forum reports say the later iOS 26 runtimes are arm64 only
(https://developer.apple.com/forums/thread/796224); not verified on an Intel machine. The export builds an Intel simulator app with
`-arch x86_64` (README-zinc.txt).

## Not done here

Safe areas (the content and the panel scroll under the status bar and the Dynamic Island; ZN-625), lifecycle events to the program, the
keyboard and IME (ZN-626), the device build and its upload (they need the owner's Apple team; ZN-629 below), HTTPS certificates on a device
(`src/host/tls.cpp` reads root stores from Linux and macOS files such as `/etc/ssl/cert.pem`; a phone has none; not tried on the simulator), a launch screen from zinc.json's splash, the Metal decision.

## Plugins on iOS (ZN-628, 2026-10-17)

A plugin reaches an app through its `targets.ios` entry of plugin.json (docs/plugins.md "Phones"): C++, Objective-C and Swift sources
(Swift in a static library of its own, `-ObjC` for the classes found by name), frameworks, Info.plist keys, entitlements, a lifecycle
subscriber (`zincPause`, `zincResume`, `zincLowMemory`, `zincOpenURL:`), and `class`: an Objective-C or Swift class behind the plugin's
spec through the bridge `zinc native-gen --ios` writes. A simulator build is configured with `-DCMAKE_OSX_SYSROOT=iphonesimulator` (the
`--print` commands; a device build uses `build-device`): CMake links Swift with the libraries of the SDK it was configured for. zinc:system
has an iOS backend (notifications, the share sheet, opening URLs, the document and photo pickers, deep links through SDL's dropped URLs).
Proven on the iPhone 17 simulator: zinc:sqlite, the Swift fixture (`tests/data/mobile-plugin`: calls, callbacks from another queue, the
lifecycle subscriber), the share sheet, the photo picker and the notification prompt (`tests/data/mobile-services`). Not verified: a deep
link's delivery (the simulator asks "Open in ...?", which needs a tap), a notification's tap, a picked document's copy.

## Packages and signing (ZN-629, 2026-10-17)

```sh
zinc export examples/hello --target ios -o /tmp/hello-ios --ipa --simulator     # the Debug .app for the simulator, zipped: hello-simulator.zip
zinc export examples/hello --target ios --ipa                                   # archive + exportArchive: build-device/ipa/hello.ipa (needs the team)
zinc export examples/hello --target ios --ipa --dry-run                         # every command, none run
```

- `ExportOptions.plist` comes from zinc.json `signing.ios`: `method` (`app-store-connect` by default, `release-testing`, `debugging`,
  `enterprise`; Xcode 15.3 renamed `app-store`, `ad-hoc` and `development`, which are mapped), `teamID` (`team` or `ZINC_IOS_TEAM`),
  `signingStyle` automatic, or manual with `provisioningProfiles` when `profile` names one (the archive is then signed with it too:
  `-DZINC_PROFILE`, set on the app target only, with "Apple Distribution", or "Apple Development" for `debugging`). The key names are those
  of `xcodebuild -help` in Xcode 26.3. A device IPA without a team stops before any tool, with what to set.
- `PrivacyInfo.xcprivacy` is in every iOS project and bundle: no tracking, no collected data, and the required-reason APIs. The engine's,
  from `nm -u` of the simulator build: the hello executable calls `stat`, `fstat` and `mach_absolute_time`; the engine's archives before
  dead stripping add `lstat` and `statfs` (libuv's `uv_fs_statfs`). So: file timestamps C617.1 (files of the app's container), system boot
  time 35F9.1 (elapsed time in the app), disk space E174.1 (the space before a write). `NSUserDefaults` appears only in SDL code compiled out
  (`#if 0`, SDL_uikitevents.m). A plugin adds its own with `targets.ios.privacy` (docs/plugins.md).

Proven on an iOS 26.3 simulator (an iPhone 17 Pro created for the run and deleted after, no Simulator.app): `--ipa --simulator` for hello
in 259 s (most of it the first configure of the Xcode generator); the zip unpacked with `ditto -x -k`, installed, launched with
`--console-pty`: its output equals `zinc run` (29 lines); `PrivacyInfo.xcprivacy` is in the bundle and passes `plutil -lint`. The device
archive, the export and the upload need the owner's Apple Developer account (the commands are in the ZN-629 notes).

## Video (ZN-751, 2026-10-17)

zinc:video has an iOS backend (`plugins/video/native/video.ios.mm`, docs/plugins/video.md "Phones"): `AVAssetReader` with a track output
in `32BGRA` (VideoToolbox decodes and converts), each picture scaled to the player's box. `examples/hero` exports unchanged; its clip goes
into the app's data container:

```sh
zinc export examples/hero --target ios -o /tmp/hero-ios --ipa --simulator
xcrun simctl install booted /tmp/hero-ios/build/Debug-iphonesimulator/hero.app
d="$(xcrun simctl get_app_container booted dev.zinc.hero data)/Library/Application Support/zinc/media"
mkdir -p "$d" && cp examples/hero/media/bbb.mp4 "$d/"
SIMCTL_CHILD_ZINC_DEMO=video SIMCTL_CHILD_ZINC_VIDEO_LOG=1 xcrun simctl launch --console-pty booted dev.zinc.hero
```

On an iPhone 17 simulator (iOS 26.3, created for the run and deleted after): `player.decoder` reads `avc1 (avfoundation)`, a 640 x 360
picture is copied into the player's image in 0.1 to 0.4 ms; 231 pictures in 9.5 s (24 a second), none dropped; the program's 600 frames:
work p50 0.27 / p99 7.2 ms, raster p99 6.7 ms (`zinc-next-ios/hero-video.png`). `tests/data/mobile-video` (two clips of `assets/` as a
playlist, a jump and a step back) prints the same lines as on the Mac and on Android.
