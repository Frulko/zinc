---
id: ZN-036
title: 'console.log: cyclic references and function names'
status: Done
assignee: []
created_date: '2026-10-06 10:02'
updated_date: '2026-10-06 10:18'
labels:
  - size-M
milestone: m-2
dependencies: []
ordinal: 16450
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Follow-up of ZN-034, requested by the user: avoid infinite recursion on cyclic data like Node (<ref *1> and [Circular *1]) and print function names ([Function: name], [class X], bound/anonymous variants). Needs an object identity runtime call (any reference to an integer, verifier-safe) for the seen stack of the generated formatters, and the closure class names (lambda/fnref) exposed to them.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 console.log of self-referencing objects, arrays and Maps prints the same as Node; named functions and arrow functions assigned to variables or properties print [Function: name]
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
usage: n/a. Cycles (<ref *n>/[Circular *n]) and function names match Node (inspect_cycles golden); ObjId/ClassName runtime calls with verifier tests; ASan T1 green. Param properties now precede declared fields.
<!-- SECTION:NOTES:END -->
