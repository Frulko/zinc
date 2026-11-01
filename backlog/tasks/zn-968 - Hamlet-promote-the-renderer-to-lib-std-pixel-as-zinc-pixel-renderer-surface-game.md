---
id: ZN-968
title: >-
  Hamlet: promote the renderer to lib/std/pixel as zinc:pixel (renderer,
  surface, game)
status: Backlog
assignee: []
created_date: '2026-11-01 13:09'
labels:
  - hamlet
  - demo
  - m2
  - pixel-plays
  - reuse
  - engine
  - size-M
milestone: m-30
dependencies:
  - ZN-952
  - ZN-955
ordinal: 720090
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Like zinc:stage: module registration (src/frontend/modules.cpp, lib/modules.d.ts), docs/reference/pixel.md, a T0 test. W/H/S stay constants of the module for now. hamlet/src/pixel.ts becomes a one-line re-export or disappears; pixel-plays migrates in the same change. See docs/reports/hamlet-roadmap-2026-11-01.md.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 import ... from 'zinc:pixel' works in pixel-plays and hamlet; no cross-example import left (grep)
- [ ] #2 All pixel-plays T1 tests and hamlet.sh pass; pngdiff goldens unchanged
- [ ] #3 Reference doc and a T0 test for the module
- [ ] #4 CHANGELOG line under the right theme
<!-- AC:END -->
