---
id: ZN-348
title: >-
  A minimal zinc per architecture; WebGL, SDL3 and other optional parts fetched
  as plugins
status: Backlog
assignee: []
created_date: '2026-10-08 14:34'
labels:
  - distribution
  - architecture
  - size-M
milestone: m-19
dependencies:
  - ZN-330
  - ZN-337
  - ZN-338
ordinal: 55390
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Owner, 2026-10-08: the engine as agnostic as possible, composed as needed. The release ships the minimal zinc (no glslang, glad, SDL3 unless asked), and the optional parts of ZN-330 are official plugins: prebuilt per target, fetched on first use, built locally as a fallback.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 the minimal package of each host has no WebGL or SDL3 symbol and is under its size budget
- [ ] #2 a WebGL program on a clean machine fetches the webgl plugin, verifies it and runs (test against a local index)
- [ ] #3 the size and the first-run time of each flavour are recorded in docs/reports
<!-- AC:END -->
