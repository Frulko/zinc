---
id: ZN-588
title: PERF-03.01 Logical-to-physical scale in push instead of a pass over the frame
status: Backlog
assignee: []
created_date: '2026-10-09 08:30'
labels:
  - perf
milestone: m-21
dependencies:
  - ZN-402
priority: low
ordinal: 367270
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Split from ZN-402: to_physical (runtime/gfx.cpp) rescales every command after the frame when the pixel scale is above 1: about 0.3 ms at scale 4 with 200k commands (perf audit). Scale in box()/push() as commands are recorded; plugin commands keep the pass.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 no to_physical pass for zinc:gfx commands at scale > 1; plugin commands still scaled
- [ ] #2 pixel goldens at scale 2 and 4 unchanged
- [ ] #3 end_frame time at 200k commands, scale 4, measured before and after
<!-- AC:END -->
