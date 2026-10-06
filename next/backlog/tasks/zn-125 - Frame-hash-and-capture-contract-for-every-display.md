---
id: ZN-125
title: Frame hash and capture contract for every display
status: Backlog
assignee: []
created_date: '2026-10-06 22:59'
labels:
  - simulator
  - size-S
milestone: m-11
dependencies:
  - ZN-104
ordinal: 40670
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
ZINC_FRAMEHASH and ZINC_SHOT work for every display driver and the null HAL; goldens are stored next to examples/boards/*.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 the same hash from the macOS emulator and from device-sim for the s3-matrix demos
<!-- AC:END -->
