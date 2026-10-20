---
id: ZN-623
title: 'zinc export --target ios: Xcode project generator'
status: Done
assignee:
  - '@parallel'
created_date: '2026-10-10 14:05'
updated_date: '2026-10-16 20:47'
labels:
  - mobile
  - size-M
milestone: m-26
dependencies:
  - ZN-618
  - ZN-620
ordinal: 197000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Writes `dist/<name>-ios/`: an Xcode project (or CMake with the Xcode generator), Info.plist from `zinc.json` (bundle id, `UILaunchScreen`, orientations, usage strings), asset catalog with the icon, the AOT C++, engine sources, SDL3 (From the spike ZN-372, docs/reports/zinc-next-mobile-spike.md, D59.)
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 the generated tree equals a golden for hello
- [x] #2 `--print` lists the `xcodebuild` commands
- [x] #3 no Xcode needed by the test
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
zinc export --target ios writes dist/<name>-ios/: CMakeLists.txt for CMake's Xcode generator (the engine added with add_subdirectory from ZINC_ENGINE, zn_app with SDL3's UIKit backend inside; the program's C++ from ZN_AOT_CPP_ONLY=1 zinc build --profile ios in src/; the program's plugins compiled from their sources, the helper appPluginsCmake shared with the Android export), Info.plist from zinc.json (CFBundleIdentifier app.id or dev.zinc.<name>, display name, CFBundleShortVersionString, CFBundleVersion = versionCode or 1.2.3 -> 10203, UILaunchScreen, UIRequiresFullScreen, orientations for iPhone and iPad from app.orientation, usage strings: camera, microphone, location, net -> NSLocalNetworkUsageDescription), Assets.xcassets (app.icon as one 1024 universal AppIcon), assets/ copied into the bundle, targets.ios fullscreen/kiosk baked as ZN_APP_ENV, dev.perfHud as ZN_APP_DEV_ENV (Debug builds), README-zinc.txt. --print lists cmake -G Xcode, xcodebuild for the simulator, simctl install and launch, and the device archive (-DZINC_TEAM, -allowProvisioningUpdates).

Test: tests/t0/export_ios.sh (golden tests/golden/export-ios/hello.txt; xcodebuild, xcrun, actool, codesign are traps on the PATH; a second project checks icon, orientation, usage strings, escaping, kiosk). export_android unchanged (its golden still matches after the refactor).

Engine CMake: ZN_PLATFORM_NAME ios; hal_cocoa.mm and the OpenGL defines of hal_sdl.cpp only for Darwin (macOS), not APPLE; zn_app.link only for single-config generators (an Xcode project has several configurations: file(GENERATE) failed).

Decision (for the coordinator to number): the iOS project is a CMake project for CMake's Xcode generator, not SDL's Xcode template nor a hand-written .pbxproj. Scores (RULES §4: fit x3, perf x3, size x2, maint x2, supply x2, port x1, effort x1): CMake + Xcode generator 5,5,4,5,4,4,4 = 64; SDL's Xcode project (Xcode/SDL, not in the vendored tree) plus an app project 4,5,4,2,3,2,2 = 49; a .pbxproj written by zinc 4,5,4,1,4,2,2 = 49. Why: SDL documents iOS builds with CMake (docs/README-cmake.md: -DCMAKE_SYSTEM_NAME=iOS, add_subdirectory), the engine is a CMake project that the Android export already builds through AGP's CMake, and a pbxproj would list every engine source and break at each change. Cost: the first configure takes 5 min 35 s (CMake's Xcode generator runs xcodebuild for each try_compile of SDL and the engine; the Mac at load 45 to 94); later builds reuse it. Minimum iOS 16.3: the system libc++ has std::to_chars for doubles from 16.3 (the engine formats numbers with it; 15.0 failed to compile: 'to_chars' is unavailable: introduced in iOS 16.3); iPhone 8 and later. Revisit when Xcode's generator is too slow to configure (a prebuilt libzn_app.a per SDK, spike §4 T3) or for iOS 15 devices (a vendored shortest-double formatter).

later.md lines: (Mobile) ZN-623: the launch screen from zinc.json splash (UILaunchScreen UIColorName from a color set in the asset catalog, UIImageName), today an empty dict (the system background). ZN-623: plugins take their linux entry on iOS until manifests have ios entries (ZN-628). ZN-623: an ExportOptions.plist and xcodebuild -exportArchive for the IPA (the device archive command is printed; signing needs the owner's team).
<!-- SECTION:NOTES:END -->
