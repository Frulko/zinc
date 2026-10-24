---
id: ZN-222
title: 'RPI-BM15 Pi core: AOT per-program kernel, PIC blob loader spike'
status: Backlog
assignee: []
created_date: '2026-10-07 10:11'
labels:
  - rpi
  - baremetal
  - parked
milestone: m-11
dependencies: []
ordinal: 92200
updated_date: '2026-10-25 01:53'
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Per-program kernel via the Circle bootloader, then a position-independent blob loader spike. See docs/reports/zinc-next-baremetal-pi.md section 10.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 a linked image runs hello in QEMU; the spike result is written down
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Review 2026-10-25: parked. (drop proposed, corrected by the verifier) It is a speculative perf spike on a parked chain, but no decision supersedes it. If the reviewer wants fewer tasks, merging it into ZN-216/219 keeps the criterion. Deleting it is not justified by the brief's definition of useless.
<!-- SECTION:NOTES:END -->
