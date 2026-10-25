---
id: ZN-823
title: Linux packages ship prebuilt plugin libraries for their architecture
status: Backlog
assignee:
  - '@parallel'
created_date: '2026-10-25 07:59'
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
- [ ] #1 dist/linux-aarch64 package holds prebuilt/linux/ libraries for every plugin with native code but those that need a system library absent from the sysroot (listed in sizes-linux.json)
- [ ] #2 on the Pi, the first run of music-tree after installing that package builds no plugin (ZINC_STEPS: cached or prebuilt for each)
- [ ] #3 the time from zinc dev --device to the first frame on the Pi 3B+ after an engine update is measured before and after in docs/reports/zinc-next-perf.md
<!-- AC:END -->
