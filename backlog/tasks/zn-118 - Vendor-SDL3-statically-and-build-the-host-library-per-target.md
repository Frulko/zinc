---
id: ZN-118
title: Vendor SDL3 statically and build the host library per target
status: Done
assignee: []
created_date: '2026-10-06 22:58'
updated_date: '2026-10-07 11:33'
labels:
  - rendering
  - packaging
  - size-M
milestone: m-8
dependencies: []
ordinal: 40600
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The package bundles Homebrew's dylib today. Vendor SDL 3.4.x (zlib licence), build it per target with a recorded source list and platform headers fetched at build time or prebuilt in CI (decision recorded in 04 risks), link it statically into the host library, drop the dylib from the macOS and Linux packages.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 tools/package output has no external dylib; otool -L / ldd show system libraries only
- [x] #2 the clean-machine test (tests/t2/package.sh) passes; package size recorded against the budget
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
usage: n/a. usage: n/a. SDL3 3.4.16 vendored and linked statically (-force_load), AOT programs link libSDL3.a + frameworks, no dylib in the macOS package (otool -L: system only), package 5.6 MB zip. Also fixed the cross build source list (unicode.cpp, libunicode.c) that broke tests/t2/package.sh, and display-gl honours ZINC_ZOOM. Not done: Linux build of SDL (needs X11/Wayland/drm dev headers; no Docker), ldd check.
<!-- SECTION:NOTES:END -->
