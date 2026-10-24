---
id: ZN-795
title: 'Permission and network hardening of zinc monitor and zinc:fs watch'
status: Backlog
assignee: []
created_date: '2026-10-24 23:54'
labels:
  - size-S
milestone: m-10
dependencies: []
ordinal: 6000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
From backlog/later.md, promoted by the review of 2026-10-25 (docs/reports/backlog-review-2026-10-25.md). The lines it carries:

- ZN-327: zinc:fs watch of a file reports its changes without fs:read under "permissions" (the other unchecked calls were fixed).
- ZN-327: `zinc monitor --udp` binds every interface and prints control characters raw: bind 127.0.0.1 by default and escape them, as the prototype did.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 `zinc monitor --udp` binds 127.0.0.1 by default (an option opens it) and escapes control characters
- [ ] #2 zinc:fs watch of a file needs fs:read under permissions
- [ ] #3 tests in t0 for both
<!-- AC:END -->
