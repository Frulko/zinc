---
id: ZN-137
title: ps2 build gate
status: Backlog
assignee: []
created_date: '2026-10-06 23:01'
labels:
  - targets
  - size-M
milestone: m-11
dependencies:
  - ZN-132
ordinal: 40790
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Decision D4: build-only. Pin the ps2dev toolchain, build the engine with libstdc++; the PCSX2 runner runs only when a BIOS path is supplied through ZINC_PS2_BIOS and is skipped (not failed) otherwise.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 the build gate runs in CI; the runner skips with a clear line without a BIOS
<!-- AC:END -->
