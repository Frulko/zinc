---
id: ZN-675
title: Frame hash of a frame that does not cover the surface changes at every run
status: Backlog
assignee: []
created_date: '2026-10-10 19:21'
labels:
  - testing
  - bug
  - size-S
dependencies: []
ordinal: 431410
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
(Follow-up of ZN-432, D73.) grab() renders into uncleared memory, so a program that does not paint the whole surface gets a different frame hash every run (tests/conformance/canvas2d.ts).
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 tests/conformance/canvas2d.ts gives the same hash over 10 runs
- [ ] #2 a regression test
<!-- AC:END -->
