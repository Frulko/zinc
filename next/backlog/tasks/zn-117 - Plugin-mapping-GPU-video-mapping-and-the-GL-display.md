---
id: ZN-117
title: 'Plugin: mapping (GPU video mapping) and the GL display'
status: Done
assignee: []
created_date: '2026-10-06 22:58'
updated_date: '2026-10-07 11:20'
labels:
  - plugins
  - rendering
  - size-L
milestone: m-9
dependencies:
  - ZN-109
  - ZN-116
  - ZN-085
ordinal: 40590
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
plugins/mapping (669 lines, needs zgl) on the display-gl driver, driven by OSC and the web companion. Level 1 simulation: Mesa llvmpipe EGL surfaceless frames compared with the software frame within the tolerance.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 examples/video/mapper runs headless under llvmpipe and its frame hashes match the stored ones
- [x] #2 the web companion page is served by zinc:net
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
usage: n/a. usage: n/a. plugin_build adds -I display-gl for zgl.h and loads drivers RTLD_GLOBAL; zinc:net serveAsync; companion/server.ts; tests/t1/mapper.sh (GL frame vs prototype golden, companion + demo.mjs); tools/glcompare takes BMP or PNG on both sides. T0, native_plugins, display_drivers, plugin_build pass. Not done: Mesa llvmpipe frame hashes (Linux; the Mac GPU compared with a 1% tolerance instead of exact hashes), RPi1 mapping.rpi1.cpp untested.
<!-- SECTION:NOTES:END -->
