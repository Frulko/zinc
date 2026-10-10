---
id: ZN-670
title: More than 64 runtime images at once
status: Backlog
assignee: []
created_date: '2026-10-10 18:52'
labels:
  - gfx
  - size-S
milestone: m-27
dependencies: []
ordinal: 426410
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Found by the museum table (ZN-650.03): ZRT_DYN_IMAGES is 64, so a light table holds about 60 photo cards, and imageFromBytes (ZN-432) has the same ceiling. A limit per profile (small on a device, a few thousand on a desktop), allocated on demand.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 a desktop program holds 1,000 runtime images and draws them (test)
- [ ] #2 the device profiles keep their memory budget (the limit and the memory per profile are in the doc)
- [ ] #3 going over the limit returns -1 and one warning, never a crash
<!-- AC:END -->
