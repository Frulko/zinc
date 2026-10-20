---
id: ZN-399
title: >-
  AOT frame loop parity: borrowed loop elements, folded constants, typed field
  stores
status: Done
assignee: []
created_date: '2026-10-09 07:22'
updated_date: '2026-10-10 12:20'
labels:
  - perf
  - aot
dependencies:
  - ZN-404
  - ZN-409
  - ZN-413
priority: high
ordinal: 195000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
ZN-397 follow-up. Script time per frame at 200k balls (headless, min of 5): Next AOT update loop 1.54 ms vs prototype 0.69 ms, draw loop 1.48 vs 1.17. Remaining costs seen in the generated C++: retain/release of each element of 'for (const x of arr)' (Machine::retain/release with the mem stats check), top-level const numbers re-read from m.globals and 1/60 divided each iteration (no constant folding), SetField loads o->cls->fieldRef[c] although the field type is static, two calls per host row (hostFast entry then zrt::gfx), null checks on every field access of the same object.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 The update loop of the bouncing-ball bench is at or under the prototype's time (measured, same machine)
- [x] #2 Interpreter and AOT frames stay identical on bouncing-ball, nuxt-ui, rn-showcase, navigation
- [x] #3 A test per optimisation (refcount elision, constant folding) in tests/
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Done 2026-10-10. With ZN-404 (folded consts), ZN-409 (struct per class) and ZN-413 (lent loads) done, the remaining gap of the update loop was the two host calls per ball (width() and height(): hostFast table entry, then zrt::gfx in another unit), which also kept every field in memory. AOT code now reads zrt::surf_w / surf_h inline (src/aot/aot.cpp, declared in include/zn/host.h).
AC1, Intel Mac, 200k balls, headless, frames 11-70, alternated: update loop Next AOT 2.50-2.71 -> 1.33-1.41 ms (min 2.18-2.43 -> 1.17-1.24), prototype native 2.21-2.30 ms (min 1.58-1.78): under the prototype. Draw loop unchanged, 3.0 ms vs prototype 2.9 (both within noise of each other).
AC2: interpreter and AOT last-frame hashes equal on bouncing-ball, nuxt-ui, rn-showcase, navigation (30 frames, deterministic).
AC3: tests/t0/aot_size_inline.sh (new: width()/height() add no host call; fails on the old engine), host_direct (values = decoded path), and the earlier const_globals (ZN-404) and rc_lend (ZN-413) tests.
Seen, not done: const GRAVITY of ball.ts is still read from m.globals in the inlined loop (one L1 load); the draw loop's rect() still takes two calls (table entry, then zrt::gfx::rect). usage: n/a
<!-- SECTION:NOTES:END -->
