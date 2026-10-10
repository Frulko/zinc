---
id: ZN-636
title: HAR written on SIGTERM or periodically
status: Backlog
assignee:
  - '@parallel'
created_date: '2026-10-10 14:28'
updated_date: '2026-10-10 16:33'
labels:
  - devtools
  - size-S
milestone: m-20
dependencies: []
ordinal: 50230
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
zinc run --har writes the file at normal exit only: a killed program leaves none. (Follow-up of ZN-370, D60.)
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 kill of a zinc run --har leaves a valid HAR
<!-- AC:END -->
