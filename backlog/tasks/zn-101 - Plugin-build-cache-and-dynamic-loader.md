---
id: ZN-101
title: Plugin build cache and dynamic loader
status: Done
assignee: []
created_date: '2026-10-06 22:55'
updated_date: '2026-10-07 08:10'
labels:
  - abi
  - plugins
  - toolchain
  - size-L
milestone: m-9
dependencies:
  - ZN-099
  - ZN-100
ordinal: 40430
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Decision D2: compile a plugin's native sources with the pinned zig into ~/.zinc/cache/<target>/plugins/<name>-<hash>, vendored C libraries as a separate static archive, pkg-config for system libraries, dlopen of zn_module_open on the desktop interpreter, static link with a generated zn_register_<x>() in AOT builds, hash recorded in the manifest. Hot rebuild when sources change (for `zinc dev`).
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 a plugin edit rebuilds in under 5 s and only that plugin; an AOT build links the plugin statically and runs without dlopen
- [x] #2 a missing system library gives a message naming the package to install
- [x] #3 the clean-machine test (tests/t2/package.sh) still passes
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
usage: n/a. src/tc/plugin_build: plugin native code compiled into ~/.zinc/cache/<target>/plugins/<name>-<hash>/ (plugin.dylib|so + plugin.a), vendored .c libraries in a separate content-keyed vendor.a (sqlite3.c 14 s once; an edit of sqlite.host.cpp rebuilds in 0.3 s and only that plugin), pkg-config/libs/frameworks/linkFlags, missing library -> message naming the package; zinc plugin-build; interpreter dlopens zn_module_<Name> (zinc linked with -rdynamic), zinc build links plugin.a+vendor.a and registers it (no dlopen); ZINC_NATIVE=auto|real|sim (D21). Replaced the ZINC_NATIVE_LIBS bridge. Side effect: the map and svg plugins now build and run natively (maps/explorer and svg-gallery are OK headless; real SVG frame checked). t2/package.sh: fixed by adding src/rt/native.cpp to the cross build and rebuilding the ESP32 core firmware (it had not been rebuilt since ZN-030: sources unicode.cpp, libunicode.c, native.cpp added; image 796 KB). Not done: cross-target plugin builds (zinc build --target) and the cc fallback via zig is untested.
<!-- SECTION:NOTES:END -->
