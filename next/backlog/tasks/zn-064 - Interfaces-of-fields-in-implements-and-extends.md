---
id: ZN-064
title: Interfaces of fields in implements and extends
status: Backlog
assignee: []
created_date: '2026-10-06 22:49'
labels:
  - language
  - size-S
milestone: m-13
dependencies: []
ordinal: 40060
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
A data-only interface (fields, no methods) must be usable in `implements` and `extends` (checker, Z0114): the class gets the fields it must declare and the check is structural. Unblocks six lines of lib/std/web.ts.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 fixtures for class implements field-only interface (accepted when fields match, Z0114 naming the missing field otherwise) and interface extends interface of fields
- [ ] #2 lib/std/web.ts loses its Z0114 diagnostics
<!-- AC:END -->
