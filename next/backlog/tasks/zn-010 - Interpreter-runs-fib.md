---
id: ZN-010
title: Interpreter runs `fib`
status: Backlog
assignee: []
created_date: '2026-10-05 14:21'
updated_date: '2026-10-05 14:54'
labels:
  - size-M
milestone: m-1
dependencies:
  - ZN-009
ordinal: 10000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
As a **Device user**, I want a bytecode file to run on a VM, so that no C++ compiler is needed.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 `zinc run fib.ts` prints the golden output, with no Node.js on the machine; sanitizer build clean.
- [ ] #2 M1 gate thresholds from next/TESTING.md are measured and recorded
<!-- AC:END -->
