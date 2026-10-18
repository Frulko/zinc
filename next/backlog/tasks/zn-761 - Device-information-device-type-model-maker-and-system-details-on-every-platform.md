---
id: ZN-761
title: >-
  Device information: device type, model, maker and system details on every
  platform
status: Backlog
assignee:
  - '@parallel'
created_date: '2026-10-18 10:55'
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
- [ ] #2 A std module zinc:device exposes them as expo-device does (DeviceType enum, getDeviceTypeAsync is a plain function), documented in docs/react-native.md and a guide page
- [ ] #3 Platform.isPad, Platform.isTV and Platform.constants come from it; Platform.isPad is true on an iPad and false on an iPhone
- [ ] #4 Tablet versus phone on Android follows the smallest screen width (600 dp), TV follows UI_MODE_TYPE_TELEVISION
- [ ] #5 A T0 test checks the JSON on the development Mac and with ZINC_PLATFORM=ios|android; iOS (simulator) and Android (emulator) proven by an app that prints the record
<!-- AC:END -->
