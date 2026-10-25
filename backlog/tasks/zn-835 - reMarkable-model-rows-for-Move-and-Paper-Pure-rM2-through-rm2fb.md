---
id: ZN-835
title: 'reMarkable: model rows for Move and Paper Pure, rM2 through rm2fb'
status: Backlog
assignee:
  - '@parallel'
created_date: '2026-10-25 15:10'
labels:
  - remarkable
  - size-M
milestone: m-11
dependencies: []
ordinal: 544460
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
§10 of docs/reports/remarkable-bridge-design.md and remarkable-apps-design.md: plugins/display-rmpp/models.h rows (codename, geometry, stride, input ranges, vendor hash -> swap symbol and mode mapping, xochitl unit limits) for the Paper Pro, Move and Paper Pure; the rM2 through rm2fb (timower) instead of a bridge of our own.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 models.h holds one row per model; an unknown model or vendor hash falls back to L0 with one message naming it
- [ ] #2 the rM2 runs through the rm2fb client path, selected by its row, with the fake qtfb/rm2fb harness proving the choice on the Mac
- [ ] #3 a new OS or model is one table row: docs/targets say how to add one after a tablet test
<!-- AC:END -->
