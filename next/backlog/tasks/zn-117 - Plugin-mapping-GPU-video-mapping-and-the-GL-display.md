---
id: ZN-117
title: 'Plugin: mapping (GPU video mapping) and the GL display'
status: Backlog
assignee: []
created_date: '2026-10-06 22:58'
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
- [ ] #1 examples/video/mapper runs headless under llvmpipe and its frame hashes match the stored ones
- [ ] #2 the web companion page is served by zinc:net
<!-- AC:END -->
