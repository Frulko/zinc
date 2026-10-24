---
id: ZN-334
title: 'Cross builds fetch the pinned Linux sysroot by themselves'
status: Backlog
assignee: []
created_date: '2026-10-08 14:34'
updated_date: '2026-10-25 01:53'
labels:
  - distribution
  - toolchain
  - size-M
milestone: m-19
dependencies:
  - ZN-332
ordinal: 2700
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
**What is left (review 2026-10-25):** Description: tools/linux-sysroot already pins Debian packages by sha256; make `zinc plugin-build`/`zinc export --target rpi|rpi1|linux` run that fetch when $ZINC_HOME/sysroots/<target> is missing and say so in `zinc doctor`. Criteria: (1) on a Mac with an empty ZINC_HOME `zinc export --target rpi` of a display-gl app succeeds with no manual step; (2) a changed archive is refused (test with ZINC_SYSROOT_MIRROR); (3) doctor lists the sysroots. Already there: tools/linux-sysroot, tools/linux-sysroot.lock (Debian bookworm snapshot, sha256 per package, EGL/GLES/GBM/DRM/X11); src/tc/plugin_build.cpp:400-445; docs/targets/linux.md:64.

zig gives the libc, not mesa or libdrm: display-gl for rpi/rpi1/linux cannot be cross built from macOS (pkg-config check fails). The toolchain manager fetches a pinned, checksum-verified sysroot per target (Debian bookworm and trixie: armhf, arm64, x86_64, with the -dev packages plugin.json `pkg` names), the same way as zig, and the plugin build points pkg-config at it.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 on macOS with nothing installed, `zinc plugin-build display-gl` for rpi (aarch64) and rpi1 (armhf) succeeds
- [ ] #2 the sysroots are pinned by sha256 in src/tc, listed in third_party/README.md style with their sources and licences, and a changed archive is refused
- [ ] #3 `zinc export --target rpi` of a display-gl UI app succeeds on macOS
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
2026-10-12 (owner session, Pi 3B+ plugged in): stopgap in place. A cross build now points pkg-config at $ZINC_HOME/sysroots/<target> (src/tc/plugin_build.cpp) and links with --allow-shlib-undefined; the directory is filled by hand from the device (recipe in docs/reports/raspberry-pi.md, last section). hero (zinc:video, FFmpeg) exports for rpi and runs on the Pi with it. Still to do here: the pinned, checksum-verified sysroot fetched by the toolchain manager, and the EGL/GLES/GBM/DRM packages for display-gl (AC 1 to 3 unchanged).
Review 2026-10-25: done-partly. The pinned, checksum-verified sysroot exists as a script and plugin-build already points pkg-config at it. Left: the toolchain manager (zinc plugin-build / export) fetches it by itself when a cross build needs it, the pin lives where `zinc doctor` sees it, and display-gl for rpi/rpi1 exports on a Mac with nothing installed. Evidence: tools/linux-sysroot, tools/linux-sysroot.lock (Debian bookworm snapshot, sha256 per package, EGL/GLES/GBM/DRM/X11); src/tc/plugin_build.cpp:400-445; docs/targets/linux.md:64
<!-- SECTION:NOTES:END -->
