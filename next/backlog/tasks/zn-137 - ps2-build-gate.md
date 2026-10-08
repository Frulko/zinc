---
id: ZN-137
title: ps2 build gate
status: Backlog
assignee: []
created_date: '2026-10-06 23:01'
updated_date: '2026-10-08 08:28'
labels:
  - parked
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

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
parked 2026-10-08: needs the pinned ps2dev toolchain (a large download with its own libstdc++ build, no macOS arm64 release known here) and a CI line; the gate is build-only by D4. Resume when a ps2dev toolchain can be pinned.
<!-- SECTION:NOTES:END -->
