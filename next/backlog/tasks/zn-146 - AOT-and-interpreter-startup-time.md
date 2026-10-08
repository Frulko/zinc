---
id: ZN-146
title: AOT and interpreter startup time
status: Done
assignee: []
created_date: '2026-10-06 23:03'
updated_date: '2026-10-08 04:45'
labels:
  - performance
  - size-S
milestone: m-12
dependencies: []
ordinal: 40880
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
A program that prints one line takes 5.3 ms against 2 ms for an empty C program; the runtime's own work is 0.12 ms and the process maps 8 MB it does not touch (ZN-042 investigation). Find the pre-main cost (mimalloc arena reserve, dynamic loading, static data) with a sampling run on many launches and remove it.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 `console.log(1)` AOT under 3 ms on the benchmark machine; `zinc run` of the same under 15 ms; numbers recorded in bench/m4.json
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
usage: n/a. Two causes, found with a sampling run of a program launched 100000 times in one process (3.5 us each in process, so the cost was outside runProgram): (1) Machine::load took the 20 MB register stack from calloc, which zeroes blocks of that size itself (92% of the samples): now mmap (lazily zero pages); (2) replacing the global operator new/delete made dyld bind the replacement across libc++ at every launch (3 ms and 8 MB RSS for a one-line program, reproduced with a 6-line C++ file and plain malloc, not mimalloc's fault): the operators moved to src/rt/alloc_new.cpp in their own archive (libzn_rt_new.a), linked into a compiled program only when it has a heap budget (profile) and into zinc and the cross builds; the runtime's arrays and Maps use ObjAlloc/ObjVec over allocRaw and class-level operator new, so they stay on mimalloc (fannkuchredux 541 ms against 547 ms with the override; without ObjVec it was 627 ms). Measured (tools/bench-m4 now records startup in bench/m4.json): console.log(1) AOT 8.4 -> 2.8-3.0 ms (empty C program 2.2 ms), zinc run 14.4 -> 11.8-12.4 ms; every kernel's AOT time equal or better. T0 56 passed (plugin_manifest, shared_headers fail as before), t1 aot/profile/rc/examples_all pass, t1/aot.sh checks the operator is not defined without a budget.
<!-- SECTION:NOTES:END -->
