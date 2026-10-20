---
id: ZN-019
title: Exceptions in the IR
status: Done
assignee: []
created_date: '2026-10-05 14:22'
updated_date: '2026-10-06 10:51'
labels:
  - size-M
milestone: m-3
dependencies: []
ordinal: 19000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
- Acceptance: try/catch/finally and Error subclasses pass the `errors` conformance program.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 try/catch/finally and Error subclasses pass the `errors` conformance program.
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
usage: n/a. try/catch/finally, throw, using, Error classes; errors.ts byte-identical to the frozen output; exceptions golden identical to Node; RC pads for unwinding; ZBC v4 handler tables; ASan T1 green. Limits in RESUME.
<!-- SECTION:NOTES:END -->
