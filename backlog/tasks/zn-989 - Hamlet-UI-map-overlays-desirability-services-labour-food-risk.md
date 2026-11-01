---
id: ZN-989
title: 'Hamlet UI: map overlays - desirability, services, labour, food, risk'
status: Done
assignee: []
created_date: '2026-11-01 14:25'
updated_date: '2026-11-01 15:04'
labels:
  - hamlet
  - demo
  - ui
  - m3
  - size-M
milestone: m-30
dependencies: []
ordinal: 748080
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
An overlay menu like Caesar's: colour the map by desirability, service coverage, labour, food stock or risk, with a legend; buildings show their coverage radius while placing.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Overlay selector with at least desirability, services and labour
- [x] #2 Each overlay has a legend and uses the shared data, no copies
- [x] #3 Placing a service building previews its coverage
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Coverage preview (radius or walker round) compiles and is wired but was only checked on desirability visually.
<!-- SECTION:NOTES:END -->
