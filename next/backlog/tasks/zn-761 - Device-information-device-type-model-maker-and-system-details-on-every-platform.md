---
id: ZN-761
title: >-
  Device information: device type, model, maker and system details on every
  platform
status: Backlog
assignee:
  - '@parallel'
created_date: '2026-10-18 10:55'
updated_date: '2026-10-18 11:12'
labels:
  - mobile
  - platform
  - size-M
milestone: m-26
dependencies: []
ordinal: 1000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Owner, 2026-10-18 (after rn-showcase ran on an iPad Pro): a real platform layer that reports the kind of device and its details, on iOS and Android first, then every other platform. Today Platform.isPad and Platform.isTV are false constants (lib/std/react-native.tsx) and zinc:sys device('device') is uname's machine and release (src/host/sys_host.cpp). Model on expo-device (deviceType PHONE/TABLET/DESKTOP/TV/UNKNOWN, brand, manufacturer, modelName, modelId, designName, osName, osVersion, osBuildId, totalMemory, supportedCpuArchitectures, isDevice, deviceYearClass) and React Native's Platform (isPad, isTV, Platform.constants: interfaceIdiom, systemName, Brand, Manufacturer, Model, Release). Sources: iOS UIDevice (userInterfaceIdiom, systemName, systemVersion), sysctl hw.machine (iPad6,7) mapped to a marketing name by a table; Android Build.* (MANUFACTURER, BRAND, MODEL, DEVICE, ID) and the smallest screen width / UI_MODE_TYPE_TELEVISION for tablet and TV; macOS sysctl hw.model and IOKit's product name; Linux /sys/firmware/devicetree/base/model (Raspberry Pi), /sys/class/dmi/id/product_name; web navigator.userAgentData. ZINC_PLATFORM=ios|android on the desktop answers a simulated phone.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 One query (zinc:sys device('device'), JSON) answers type, brand, manufacturer, modelName, modelId, osName, osVersion, osBuildId, totalMemory, cpuArchitectures, isDevice on macOS, iOS, Android and Linux; fields a platform cannot know are empty, never invented
- [x] #2 A std module zinc:device exposes them as expo-device does (DeviceType enum, getDeviceTypeAsync is a plain function), documented in docs/react-native.md and a guide page
- [x] #3 Platform.isPad, Platform.isTV and Platform.constants come from it; Platform.isPad is true on an iPad and false on an iPhone
- [ ] #4 Tablet versus phone on Android follows the smallest screen width (600 dp), TV follows UI_MODE_TYPE_TELEVISION
- [ ] #5 A T0 test checks the JSON on the development Mac and with ZINC_PLATFORM=ios|android; iOS (simulator) and Android (emulator) proven by an app that prints the record
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
2026-10-18 (worktree agent): done on the Mac, proofs on the simulator and the emulator left.
- device('device') (src/host/sys_host.cpp deviceRecord) answers {type, brand, manufacturer, modelName, modelId, designName, osName, osVersion, osBuildId, totalMemory, cpuArchitectures, isDevice} plus model/os (navigator.deviceInfo's two old fields; model is now the model name, not uname's machine). iOS: hw.machine (SIMULATOR_MODEL_IDENTIFIER in the simulator) named by src/host/apple_models.inc (iPhone 8 to iPhone 17/Air, iPad Pro 9.7/12.9 1st gen (iPad6,7) to the M4 iPads; an unknown id keeps its modelId and an empty name), type from UIDevice.userInterfaceIdiom (ios_glue.mm answers the "idiom" query synchronously), osName iPadOS on a tablet, kern.osversion, hw.memsize. Android: ro.product.brand/manufacturer/model/device, ro.build.version.release, ro.build.id, ro.product.cpu.abilist, emulator from ro.kernel.qemu/ro.boot.qemu/goldfish/ranchu; type from ZincActivity.idiom (UI_MODE_TYPE_TELEVISION -> tv, smallestScreenWidthDp >= 600 -> tablet, else phone). macOS: hw.model + family name, kern.osversion, hw.memsize, hw.optional.arm64. Linux: device tree model/compatible, else DMI product_name/sys_vendor/chassis_type, /etc/os-release, uname. webOS TouchPad record gets type/brand/modelName/osName.
- Simulated phone on the desktop: ZINC_PLATFORM=ios|android, ZINC_DEVICE_MODEL (iPad6,7 or an Android model name), ZINC_DEVICE_TYPE=phone|tablet|tv; isDevice false.
- Module: zinc:device-info (lib/std/device-info.ts), not zinc:device: that name is taken by plugins/device (board services: backlight, memory, frame stats) and a plugin wins the resolution; renaming it would break the board demos. DeviceType enum, deviceType, getDeviceTypeAsync (async, already settled: Zinc refuses `await` on a non-promise), brand ... isDevice; '' / 0 for unknown, never null. Platform.isPad (ios && TABLET), isTV, Platform.constants (PlatformConstants: interfaceIdiom, systemName, osVersion, Release, Model, Brand, Manufacturer, uiMode, isTesting) from it. Docs: docs/react-native.md (Platform, Device rows), docs/guide/03-ui-apps.md "The device".
- Proofs: tests/t0/device_info.sh PASS (Mac record vs sysctl hw.model, sw_vers, hw.memsize: MacBookPro18,3, macOS 15.7.4 24G517; ios phone, ios iPad6,7 -> TABLET 'iPad Pro (12.9-inch) (1st generation)' iPadOS isPad=true also on --engine quickjs, iPhone18,3 -> 'iPhone 17', unknown iPad99,1 -> empty name, android phone/tablet/tv); --native run of the iPad case gives the same lines. platform_identity, system_signals, modules, rn_idle, qjs_demos PASS. Syntax-only checks: sys_host.cpp against the iOS and iOS-simulator SDKs, the NDK (android26) clean with -Wall -Wextra; the Linux branch with bionic headers fails only on an unrelated getloadavg; ios_glue.mm against the simulator SDK; ZincActivity.java with javac + android-36.jar (only the pre-existing ZincEdit symbol is missing).
- Open: #1 and #4 on a real run of iOS/Android (Linux is the cross-platform pass), #5 the simulator and emulator apps. Commands: copy tests/golden/device-info/main.tsx into a project (zinc new, replace src), then `zinc export <dir> --target ios -o dist/dev-ios` and the cmake -G Xcode / xcodebuild -sdk iphonesimulator / `xcrun simctl boot "iPad Pro 13-inch (M4)"` / simctl install / `xcrun simctl launch --console-pty booted <bundle id>` of docs/reports/zinc-next-ios.md (expect type tablet, modelId iPad16,5, isPad=true; then "iPhone 17": phone, isPad=false); Android: `zinc export <dir> --target android`, install on the AVD Pixel_10 (adb install), `adb logcat -s zinc` for the record (phone; a Pixel Tablet AVD: tablet; an Android TV AVD: tv).
<!-- SECTION:NOTES:END -->
