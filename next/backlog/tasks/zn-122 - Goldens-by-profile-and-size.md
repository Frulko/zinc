---
id: ZN-122
title: Goldens by profile and size
status: Backlog
assignee: []
created_date: '2026-10-06 22:59'
labels:
  - profiles
  - tests
  - size-S
milestone: m-11
dependencies:
  - ZN-120
ordinal: 40640
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
A manifest of golden per (program, profile, size): import the 44 fx12, 46 f32 and the size variants (1280x720, 1620x2160) of the prototype; `// zinc-test: requires` support; the listing shows SKIP reasons.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 `zinc test --profile X` picks the right golden for every program that has one
<!-- AC:END -->
