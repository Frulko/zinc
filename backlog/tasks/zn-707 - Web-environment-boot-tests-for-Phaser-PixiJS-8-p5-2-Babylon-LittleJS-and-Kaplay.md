---
id: ZN-707
title: >-
  Web environment: boot tests for Phaser, PixiJS 8, p5 2, Babylon, LittleJS and
  Kaplay
status: Backlog
assignee:
  - '@parallel'
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
ordinal: 20700
updated_date: '2026-11-07 18:30'
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
**Rewritten by the review of 2026-11-07:** Boot tests for PixiJS 8, Phaser, p5 2.3 only; log goldens; Babylon, LittleJS, Kaplay become later.md lines.

(Left by the web environment, ZN-568, see its decision record and docs/reports/zinc-next-webenv.md.) PixiJS 8 and Phaser run in scratch once the WebGL defects of ZN-565 are worked around; p5 2.3, Babylon 9 and LittleJS ran in probes; Kaplay stops at `new AudioContext` (ZN-573). A T1 boot test each, the library vendored when its licence allows and fetched pinned otherwise (tools/test-lib).
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 each library boots to a first frame headless with a log golden
- [ ] #2 the PixiJS 8 half of webenv_pixi runs
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Review 2026-11-07: rewrite. Six library boot tests is a lot; do PixiJS 8, Phaser and p5 first (one test each), the rest as later lines; Kaplay waits for AudioContext (ZN-573).
<!-- SECTION:NOTES:END -->
