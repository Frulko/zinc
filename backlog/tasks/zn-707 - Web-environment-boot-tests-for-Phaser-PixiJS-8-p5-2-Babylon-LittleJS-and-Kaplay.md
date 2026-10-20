---
id: ZN-707
title: >-
  Web environment: boot tests for Phaser, PixiJS 8, p5 2, Babylon, LittleJS and
  Kaplay
status: Backlog
assignee: []
created_date: '2026-10-10 22:50'
labels:
  - js
  - qjs
  - testing
  - size-M
milestone: m-22
dependencies:
  - ZN-565
  - ZN-569
ordinal: 478410
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
(Left by the web environment, ZN-568, see its decision record and docs/reports/zinc-next-webenv.md.) PixiJS 8 and Phaser run in scratch once the WebGL defects of ZN-565 are worked around; p5 2.3, Babylon 9 and LittleJS ran in probes; Kaplay stops at `new AudioContext` (ZN-573). A T1 boot test each, the library vendored when its licence allows and fetched pinned otherwise (tools/test-lib).
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 each library boots to a first frame headless with a log golden
- [ ] #2 the PixiJS 8 half of webenv_pixi runs
<!-- AC:END -->
