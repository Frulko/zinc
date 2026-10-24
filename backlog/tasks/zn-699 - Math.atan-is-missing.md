---
id: ZN-699
title: Math.atan is missing
status: Backlog
assignee: []
created_date: '2026-10-10 21:52'
labels:
  - language
  - bug
  - size-S
dependencies: []
ordinal: 7200
updated_date: '2026-10-25 01:53'
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Found by the pinball editor: `Math.atan` is not known to the checker or the runtime (Math.atan2 is).
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Math.atan and the other missing members of Math found by tools/dts-walk are present, with the oracle's values (golden)
<!-- AC:END -->
