---
id: ZN-823
title: Linux packages ship prebuilt plugin libraries for their architecture
status: Review
assignee:
  - '@parallel'
created_date: '2026-10-25 07:59'
updated_date: '2026-10-25 08:31'
labels:
  - packaging
  - perf
  - size-M
milestone: m-19
dependencies: []
ordinal: 532460
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Owner, 2026-10-25: the first zinc dev --device on a Pi after an engine update took minutes. Measured on the Pi 3B+ (cache timestamps, 2026-10-25 08:31-08:34): display-fbdev, svg, system, audio-vendor and audio were compiled there with zig, 20 to 90 s each, because tools/package ships the plugins of a cross-built Linux package as sources ('compiled on the device at first use'); every engine update compiles them again (the key covers the engine). Cross-build them in tools/package --linux-arch with the pinned zig (and the sysroot of tools/linux-sysroot for those that need system headers) into prebuilt/linux/, with the key the device computes, so a device loads them at once.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 dist/linux-aarch64 package holds prebuilt/linux/ libraries for every plugin with native code but those that need a system library absent from the sysroot (listed in sizes-linux.json)
- [ ] #2 on the Pi, the first run of music-tree after installing that package builds no plugin (ZINC_STEPS: cached or prebuilt for each)
- [ ] #3 the time from zinc dev --device to the first frame on the Pi 3B+ after an engine update is measured before and after in docs/reports/zinc-next-perf.md
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
2026-10-25 (worktree agent). Choice: the key a device checks (prebuiltKey: buildDefines + the ABI headers + kind) names no compiler and no CPU, so a cross build can produce it as is, provided the cross build defines what a Linux build defines. It did not: buildDefines and the link took the host's OS (pluginTarget(): ZRT_PLATFORM="macos" from a Mac, .dylib, -undefined dynamic_lookup). Now buildOs() is "linux" in a cross build, and `zinc plugin-build <p> --target <linux target>` links plugin.so too (setCrossTarget(..., shared)); the cache and stamp keys of that mode differ from the archive-only cross build (`zinc build --target`, unchanged), so a placeholder .so is never taken. Rejected: teaching the device to accept a cross key for its own arch (a second key to keep in step, nothing gained).
tools/package --linux-arch: prebuild_plugins with this machine's zinc ($ZINC or build/zinc; tools/build-linux builds it when missing) and --target linux-<arch>, copied to share/zinc/plugins/<name>/prebuilt/linux/. Plugins with a pkg system library stay sources, as the native Linux path (display-gl, ffi, gphoto2, video), plus those that fail (listed in sizes-linux.json with the first compiler error).
Linux plugin libraries are linked with -Wl,-S: zig's libc++ brought debug sections, 1.3 of svg's 1.7 MB; package 49.3 MB unstripped, 32.6 MB stripped (0.8.0: 25.1 MB, budget 40).
Proof (Mac): tools/build-linux --arch aarch64 -> zinc-0.8.0+45.g8367be31-linux-aarch64.tar.gz, 35 plugins prebuilt, 9 left out (ble: no Linux source; camera: stb_image.h redefinition in its Linux source; display-gl, ffi, gphoto2, video: system libraries; imu-qmi8658, script: as on macOS; loro: cargo is not cross-built). tests/t1/linux_cross_prebuilt.sh: the packaged aarch64 zinc in an arm64 Debian container (no network, empty ZINC_HOME, no zig) says "prebuilt" for all 35; a wrong key fails it (checked by hand); tests/data/sqlite/fts.ts runs there loading the prebuilt sqlite.
#2 and #3 need the Pi: install that package (zinc device <pi> update --local, or tools/build-linux --arch aarch64 and copy dist/linux-aarch64/*.tar.gz), then ZINC_STEPS=1 zinc run examples/music-tree on the Pi: each plugin line says prebuilt, no "compiling plugin"; time zinc dev --device <pi> to first frame before/after.
<!-- SECTION:NOTES:END -->
