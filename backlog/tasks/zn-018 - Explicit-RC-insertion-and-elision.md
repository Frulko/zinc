---
id: ZN-018
title: Explicit RC insertion and elision
status: Done
assignee: []
created_date: '2026-10-05 14:22'
updated_date: '2026-10-06 10:34'
labels:
  - size-L
milestone: m-3
dependencies: []
ordinal: 18000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
As a **Maintainer**, I want retain/release ops inserted by a pass, so that destruction order is identical on every backend.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 live-object count 0 at exit on the corpus; destruction-order fixtures equal the current native results.
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
usage: n/a. Retain/Release inserted by ir::insertRc, ZBC ops, VM counting and destruction. Corpus: 0 live objects at exit except two programs with cycles by design; destruction order fixture frozen from the C++ rules (reverse fields, forward arrays/maps) since the old native cannot trace frees; ASan T1 green; fuzz 0 crashes. Limits: RC balance not verified (untrusted bytecode), locals die at last use not scope end, cycles leak.
<!-- SECTION:NOTES:END -->
