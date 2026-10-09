---
id: ZN-332
title: 'Plugins build with the pinned zig by default, the system compiler on request'
status: Done
assignee: []
created_date: '2026-10-08 14:34'
updated_date: '2026-10-09 03:40'
labels:
  - distribution
  - toolchain
  - size-S
milestone: m-19
dependencies:
  - ZN-331
ordinal: 55230
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
compilers() in src/tc/plugin_build.cpp prefers $CXX/$CC, then the system c++, then the pinned zig; the plugin cache key hashes the compiler command, so two machines compute different keys and a prebuilt binary can never match. Make the pinned zig the default (ZINC_PLUGIN_CC=system or zinc.json opts back in to the system compiler) so the key depends only on sources, flags, ABI headers and target.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 the same plugin computes the same cache key on macOS and in a Linux container
- [x] #2 ZINC_PLUGIN_CC=system still builds with the system compiler and gets a different key
- [x] #3 the plugin tests of tests/t1 pass with zig as the compiler
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
compilers() builds plugins with the pinned zig by default (Linux: -target <the cross triple of this host>, aarch64-linux-gnu); ZINC_PLUGIN_CC=system or zinc.json "pluginCompiler": "system" uses $CXX/$CC or c++/cc. The key hashes the compiler as 'zig 0.15.2' (system: its --version line), sources by relative path and content, sorted headers, flags as written, and the target triple; ZRT_PLATFORM is linux on a native Linux build too. Measured: device in an arm64 ubuntu:24.04 container (zinc built there) = device-3c7d9e56fc8b88bd = the Mac's cross build for aarch64-linux; system compiler d60d8b7a3cec0eaf. Building zinc in the container needed four GCC/glibc fixes (5672488a: fixture.c usleep, jsx.cpp cstring, bundle.cpp st_mtim, hal_sdl.cpp extern C); still open on Linux: ZN_HOST_GFX=OFF does not link (main.cpp calls the host unconditionally) and SDL3 needs the X11 dev packages the CI's Linux step does not install. tests/run exports ZINC_ZIG (the downloaded zig, else fetched once) so tests with their own ZINC_HOME do not download zig each. Full T1: 205 + the 7 that needed ZINC_ZIG (camera, macos_dialog/dock/menu/power/shortcut/tray) pass with zig, Objective-C plugins included; macos_window, vibrancy, deeplink fail as before (ZN-394). New tests/t1/plugin_key.sh; plugin_build expects one cache entry fewer (an identical copy shares the engine's). usage: n/a
<!-- SECTION:NOTES:END -->
