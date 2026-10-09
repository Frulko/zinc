---
id: ZN-530
title: WebGL1 and three.js r162 on lima
status: Backlog
assignee: []
created_date: '2026-10-09 07:41'
labels:
  - chip
milestone: m-24
dependencies:
  - ZN-528
  - ZN-203
ordinal: 320180
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
QuickJS + libzn_webgl on a GLES2 lima context: WebGL1 conformance run on the board (WGC_JOBS=1), three.js r162 (last WebGL1 release) with precision mediump, precompiled QuickJS bytecode for start-up; list what fails and why (FP16, no float textures). (From docs/reports/hardware/ntc-chip.md.)
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 the WebGL1 conformance pass count on lima is recorded with the failure classes
- [ ] #2 a three.js r162 cube and a small Lambert scene render at 30 fps or more at 480x272
- [ ] #3 start-up of the three.js example is measured and under 10 s
<!-- AC:END -->
