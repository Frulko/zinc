---
id: ZN-025
title: '`Dyn` values and inline caches'
status: Backlog
assignee: []
created_date: '2026-10-05 14:22'
updated_date: '2026-10-06 13:37'
labels:
  - size-L
milestone: m-4
dependencies: []
ordinal: 25000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
- Acceptance: the `Dyn` conformance program passes; strict profiles reject `any` with Z1006.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 the `Dyn` conformance program passes; strict profiles reject `any` with Z1006.
- [ ] #2 the dynsum kernel is not slower than QuickJS in tools/bench-m4 (JSON.parse as a runtime call, inline caches for Dyn property reads)
<!-- AC:END -->
