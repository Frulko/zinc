---
id: ZN-598
title: >-
  QuickJS hot-function profile: opcode histogram and per-function counts in zinc
  profile
status: Done
assignee: []
created_date: '2026-10-09 09:28'
updated_date: '2026-10-10 10:16'
labels:
  - perf
  - quickjs
  - tools
  - size-M
milestone: m-21
dependencies:
  - ZN-595
priority: medium
ordinal: 5640
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The report's analysis needed a patched build to see where QuickJS time goes (85-97% of samples land in JS_CallInternal, so function-level sampling says nothing). Add a profiling build option of the patched engine: dynamic opcode histogram, per-bytecode-function call counts and backward-jump counts, and a sampled 'current JS function' so `zinc profile --engine quickjs` lists the hottest JS functions with file:line. This selects the functions for accelerators (QJS-04) and for AOT (QJS-06). (From docs/reports/quickjs-aot-jit-and-ffi.md.)
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 zinc profile on a QuickJS program prints the top 30 JS functions by samples with file:line, and the opcode mix
- [x] #2 off by default; zero cost in normal builds (checked by the boundary micro-benchmark)
- [x] #3 documented in docs/ with the four workloads of the report as examples
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Done 2026-10-10. Patch 0001-profile-hooks (third_party/quickjs-ng/patches): opcode counter in SWITCH, call hook at bytecode entry, backward-jump hook on goto, free hook, JS_ZnProfCurrent/JS_ZnProfDescribe (methods and arrows named by their 'name' data property). All under #ifdef ZN_QJS_PROFILE (CMake option, OFF). src/qjs/qjs_prof.cpp: fixed 16k-slot table, SIGPROF/setitimer sampler, report at exit on stderr (top 30 functions with samples, %, calls, back-jumps, name, file:line:col; top 30 opcodes). zinc profile <file> --engine quickjs [--hz N]; a default build exits 2 and names the build option.
AC1: tests/t1/qjs_profile.sh (default build refuses; build-prof/zinc prints the emit row at bench/qjs/objects.mjs:7:14 and get_field in the mix).
AC2: zero cost proven at instruction level, stronger than the boundary benchmark (that benchmark is ZN-601, not written yet): quickjs.c compiled with zn_quickjs flags, otool -tv of the release vs the patched file: same 210,907 instructions, only __LINE__ constants and rip offsets differ, __text 886,260 bytes both. A first unguarded dispatch macro cost 896 bytes in JS_CallInternal: SWITCH now has two forms.
AC3: docs/reports/zinc-next-profiling.md section 'QuickJS', workloads bench/qjs/three.mjs, sprite.mjs, objects.mjs with measured tables; physics (matter-js, not vendored) described with the command. three: multiplyMatrices 22.8% of samples, opcode mix matches the report (get_loc_check 20.8%, swap 12.5%, mul 7.2%).
Also fixed: tests/golden/zbc/rt_arrays.zbc.txt regenerated (ZN-420 i32 sort changed it; commit a18e058e). Full T1 after ZN-427: 252 passed, 7 failed = the 6 known machine failures plus zbc (fixed).
Tests: quickjs_patches, quickjs, test262_regexp, qjs_profile pass. usage: n/a
<!-- SECTION:NOTES:END -->
