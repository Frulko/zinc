---
id: ZN-642
title: 'Prototype: a closure that calls itself is refused or compiled'
status: Backlog
assignee: []
created_date: '2026-10-10 17:04'
labels:
  - prototype
  - size-S
milestone: m-20
dependencies: []
priority: low
ordinal: 107000
updated_date: '2026-10-25 01:53'
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Found in ZN-637: `const walk = (h: i32): void => { walk(h); }` passes the prototype's Sema and its C++ backend emits code that does not compile (lib/std/ui.ts inspect() used one; it is a module function now). (Follow-up of ZN-637, D64.)
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 a Z diagnostic at the closure, or a conformance program that prints the same in the sim and in a native build
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Review 2026-10-25: dropped. Only serves the removed Node prototype (the new frontend check is separate). Evidence: prototype removed 2026-10-20 Verifier: Prototype-only defect. Checked on Zinc Next: a self-calling arrow closure (const walk = (h: i32): i32 => ... walk(h - 1)) prints 5 on --interp and as an AOT build (build/zinc build), so no live engine bug is left behind.
<!-- SECTION:NOTES:END -->
