---
id: ZN-064
title: Interfaces of fields in implements and extends
status: Done
assignee: []
created_date: '2026-10-06 22:49'
updated_date: '2026-10-07 00:18'
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
- [x] #1 fixtures for class implements field-only interface (accepted when fields match, Z0114 naming the missing field otherwise) and interface extends interface of fields
- [x] #2 lib/std/web.ts loses its Z0114 diagnostics
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
usage: n/a. Records (field-only interfaces) can be implemented structurally (Z0116 names the missing field), interface-extends-record copies the fields, a generic interface may extend a record. Limit: a class implementing a record, or a record extending a record, is not assignable to the parent record type (layouts differ).
<!-- SECTION:NOTES:END -->
