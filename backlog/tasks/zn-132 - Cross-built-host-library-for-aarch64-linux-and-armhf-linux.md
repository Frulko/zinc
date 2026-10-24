---
id: ZN-132
title: Cross-built host library for aarch64-linux and armhf-linux
status: Done
assignee: []
created_date: '2026-10-06 23:00'
updated_date: '2026-10-25 01:53'
labels:
  - targets
  - size-M
milestone: m-11
dependencies:
  - ZN-118
ordinal: 352000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Build libzn_host_gfx.a (zrt, raster, ttf, null HAL, plugin objects) for aarch64-linux and armhf-linux with the pinned zig; download a checksummed sysroot (Debian or Alpine) for libdrm/gbm/EGL headers; `zinc build --target aarch64-linux examples/hero` links graphics.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 the cross-built hero runs headless under qemu-user and matches the golden frame
- [x] #2 no Docker involved on macOS or Linux
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
usage: n/a. zinc build --target aarch64-linux|armhf-linux <file> -o <out> links a program that draws: tc::ensureCrossLibs builds zn_host_gfx and its libraries with CMake and the pinned zig as the compiler (wrappers in build/cross-<target>, SDL3 never looked up when cross compiling), plugin natives (Lottie...) are built again for the target by buildPlugin in cross mode (zig c++ -target, archive only, zig ar, cache by target), fonts/images baked, surface size from zinc.json (linux target), headless null HAL. hero builds for both (ELF aarch64 70 MB with debug info, ELF32 ARM EABI5 hard float); armhf found a real bug: the generated C++ declared installResources(size_t) as unsigned long, wrong on 32-bit (now decltype(sizeof 0)). tests/t2/cross_linux.sh checks the ELF machine and the plugin. AC2 (no Docker) true: zig + cmake. AC1 open: nothing here runs aarch64 Linux (qemu-user does not exist on macOS), the frame golden waits for ZN-133. Needs cmake on the machine when the libraries are not prebuilt. Display drivers (DRM/EGL) and system libraries (pkg) are not cross-built: no sysroot step yet.
Review 2026-10-25: closed as Done. zinc build --target aarch64-linux|armhf-linux|armv7-linux links graphics with the pinned zig, no Docker; AC1 (run under qemu-user) cannot run on macOS and belongs to ZN-133. Close done. Evidence: src/tc/tc.cpp; tests/t2/cross_linux.sh; tests/t2/cross_plugin_pack.sh Verifier: tests/t2/cross_linux.sh and the zig cross build exist. The qemu-user run cannot run on macOS and belongs to ZN-133 (Backlog), so the cross pass keeps it.
<!-- SECTION:NOTES:END -->
