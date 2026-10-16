---
id: ZN-624
title: 'iOS: hello and rn-showcase on the simulator'
status: Done
assignee:
  - '@parallel'
created_date: '2026-10-10 14:05'
updated_date: '2026-10-16 20:59'
labels:
  - mobile
  - size-M
milestone: m-26
dependencies:
  - ZN-623
ordinal: 198000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
With Xcode 26, build the generated project for `ios-sim` and run both programs (`xcrun simctl`), software raster through `SDL_Renderer` (From the spike ZN-372, docs/reports/zinc-next-mobile-spike.md, D59.)
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 screenshots of both in the report
- [x] #2 hello's output equals its golden
- [x] #3 the changes to `hal_sdl.cpp` are listed
- [x] #4 states whether the Intel Mac can run the simulator (criterion 1 of ZN-372, iOS half)
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Report: docs/reports/zinc-next-ios.md (screenshots and hello's output in docs/reports/zinc-next-ios/). On the iPhone 17 simulator (iOS 26.3, Xcode 26.3, this Mac is Apple Silicon now): hello's output (--console-pty and os_log) equals the prototype's (node compiler/bin/zinc.mjs run examples/hello, 29 lines); rn-showcase draws, scrolls (scripted flings) and runs at 60 fps with the software raster through SDL_Renderer (Metal driver). Numbers: start 539 ms median (simctl launch to the end of the first frame, 5 runs, 530 to 680); interval p50 16.65 p99 18.4 to 25.3 ms, work p50 0.26 p99 3.11 ms, raster p50 1.2 to 2.1 ms, texture upload p50 5.6 to 6.8 p99 11 to 13 ms (the whole 1206 x 2622 frame each present), swap 0.25 ms. Sizes: hello 1.8 MB, rn-showcase 9.0 MB Debug, 8.2 MB Release (text 7.4 MB). First configure of cmake -G Xcode 5 min 36 s (machine at load 45 to 94), the build after it 41 s (Release 37 s).

hal_sdl.cpp (criterion 3): the window is the screen on iOS (SDL_PLATFORM_IOS, as Android), and the zoom is the display scale divided by the window's pixel density (iOS: points, density 3, zoom 1; Android unchanged, density 1). Also: shell_sdl.cpp phone_setup shared by Android and iOS, os_log when there is no terminal, log_drain at quit (hello lost 21 of 29 lines to os_log without it; Android gets the same drain), the working directory Library/Application Support/zinc with assets linked from the bundle; sys_host platform() = ios and Platform.select({ ios }) in lib/std/react-native.tsx; Info.plist UIApplicationSupportsIndirectInputEvents. A prior checker bug fixed in its own commit: Promise.reject as Promise<void> (rn-showcase's links.ts did not compile for android or ios).

Criterion 4: the development Mac is Apple Silicon now and runs the simulator. The installed iOS 26.3 runtime is arm64 only (lipo -archs dyld_sim); an Intel Mac would need an x86_64 or universal runtime (iOS 26.0 universal listed x86_64; reports say later 26.x are arm64 only); not verified on Intel.

Tests: tests/t2/ios_sim.sh (export, configure, xcodebuild, simctl run of hello vs zinc run: PASS, 4 min 57 s); export_ios, export_android, mobile_profiles pass. app_library fails on main already: rn-showcase's recorded frame hash 8d0f6db84a710770 against b483bead3ce65f7a, which zinc run on the desktop gives too (UI commits 0701fdf4 and 9b4290a3 changed the frame after the hash was recorded); the coordinator updates tests/golden/rn-showcase/hashes.txt.

Device build (owner's step, needs the Apple team): cmake -S . -B build -DZINC_TEAM=<team id> && xcodebuild -project build/<name>.xcodeproj -scheme <name> -configuration Release -sdk iphoneos -derivedDataPath build/dd -allowProvisioningUpdates archive -archivePath build/<name>.xcarchive, then xcodebuild -exportArchive -archivePath build/<name>.xcarchive -exportPath build/ipa -exportOptionsPlist <ExportOptions.plist>.

later.md lines: (Mobile) ZN-624: safe areas on iOS, content and the perf panel scroll under the status bar and the Dynamic Island (ZN-625). ZN-624: a damage-aware present on iOS (the texture upload of the whole frame is 6 ms p50 on the simulator: a CAMetalLayer / IOSurface path or the GPU replay, the Metal decision). ZN-624: HTTPS root certificates on an iOS device (tls.cpp reads Linux and macOS files; SecTrust or a cacert.pem in the bundle). ZN-624: Android platform() answers linux; React Native's Platform.OS wants android (programs that test linux on Android need a look first). (Cross-platform pass) ZN-624: run the export on a real iPhone (signing with the owner's team) and on an Intel Mac's simulator (x86_64 runtime).
<!-- SECTION:NOTES:END -->
