---
id: ZN-969
title: 'Hamlet: move models, seasons, gen, audio and atlas into zinc:pixel'
status: Backlog
assignee: []
created_date: '2026-11-01 13:09'
labels:
  - hamlet
  - demo
  - m2
  - pixel-plays
  - reuse
  - size-M
milestone: m-30
dependencies:
  - ZN-968
  - ZN-967
  - ZN-960
  - ZN-966
  - ZN-964
ordinal: 720100
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Second step of the promotion once their owners exist. See docs/reports/hamlet-roadmap-2026-11-01.md.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 models/, seasons, gen, atlas, audio bank are exported from zinc:pixel; examples import only the module
- [ ] #2 docs/reference/pixel.md lists every export; no duplicate left in examples/pixel-plays
- [ ] #3 All affected T1 tests pass
<!-- AC:END -->
